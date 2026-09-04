// Named-variable template rendering for email — "{{customerName}}" style,
// distinct from whatsapp.service.js's renderTemplateText (which is
// positional, "{{1}}"/"{{2}}", matching Meta's approved-template format).
// A missing variable renders as an empty string rather than leaving the
// literal "{{key}}" in place — unlike a WhatsApp template (where a visibly
// broken placeholder is at least noticeable to whoever's about to send it),
// an email template's variables are filled in automatically at send time
// with no human in the loop to notice a leftover "{{trackingUrl}}", so a
// blank is the safer failure mode than exposing the template's own syntax.
export function renderNamedTemplate(text, vars = {}) {
  return String(text || "").replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = vars[key];
    return value === undefined || value === null ? "" : String(value);
  });
}
