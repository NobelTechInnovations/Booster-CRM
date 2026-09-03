// A deliberately tiny in-memory sliding-window rate limiter — no new
// dependency, matches this codebase's house style of hand-rolling small
// utilities rather than pulling in a package for something this simple.
// Only ever meant for cheap abuse-slowdown on public (no-auth) routes —
// it resets on every server restart and doesn't share state across
// multiple server instances, which is fine for what it's protecting here.
const buckets = new Map();

// Sweep old buckets occasionally so this Map can't grow forever under
// sustained traffic — not on every request (that would defeat the point
// of an O(1) check), just often enough that memory stays bounded.
let lastSweep = Date.now();
function sweep(windowMs) {
  const now = Date.now();
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [key, entry] of buckets.entries()) {
    if (now - entry.windowStart > windowMs) buckets.delete(key);
  }
}

/**
 * Express middleware: allows `max` requests per `windowMs` per key (by
 * default the client IP). Responds 429 once the caller exceeds it.
 */
export function simpleRateLimit({ windowMs = 10 * 60 * 1000, max = 20, keyFn } = {}) {
  return (req, res, next) => {
    sweep(windowMs);
    const key = keyFn ? keyFn(req) : (req.ip || req.headers["x-forwarded-for"] || "unknown");
    const now = Date.now();
    const entry = buckets.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
      buckets.set(key, { windowStart: now, count: 1 });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({ message: "Too many requests — please wait a bit and try again." });
    }
    next();
  };
}
