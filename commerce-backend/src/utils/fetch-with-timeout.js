import { HttpError } from "./http-error.js";

// Plain `fetch()` has no built-in overall timeout — if the remote server
// accepts the TCP connection but then never sends a response (a slow/hung
// backend, not a connection refusal, which fails fast on its own), the
// await just sits there forever. Confirmed live against Shipway's carrier-
// rate API: an authenticated request that should return in ~1-2s instead
// hung well past 20s with no error, no timeout, nothing — freezing the
// whole "Ship Order" modal on "Fetching courier rates..." indefinitely,
// since the per-provider serviceability route never got a response to send
// back to the frontend.
//
// This wraps any fetch() call with an AbortController-based deadline so a
// hung remote server surfaces as a clear, catchable HttpError(504) within a
// bounded time instead of hanging the request (and the UI) forever.
const DEFAULT_TIMEOUT_MS = 20_000;

export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new HttpError(504, `Request to ${new URL(url).hostname} timed out after ${timeoutMs / 1000}s — their server accepted the connection but never responded.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
