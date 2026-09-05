// Small uppercase label used to open nearly every section on the marketing
// homepage — kept deliberately quiet (13px, subtle tracking, brand-tinted)
// rather than the loud pill badges the panel's own Badge component uses,
// per the "eyebrows: use sparingly, subtle" brief for this redesign.
export function Eyebrow({ children, tone = "brand" }) {
  const color = tone === "dark" ? "text-white/50" : tone === "muted" ? "text-[var(--mkt-muted-soft)]" : "text-[var(--primary)]";
  return (
    <p className={`flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] ${color}`}>
      <span className={`h-1 w-1 rounded-full ${tone === "dark" ? "bg-white/50" : "bg-[var(--primary)]"}`} />
      {children}
    </p>
  );
}
