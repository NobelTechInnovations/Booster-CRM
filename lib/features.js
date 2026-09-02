// Client-side mirror of commerce-backend's utils/feature-gate.js — same
// rule: a company with no plan assigned (subscription.planId absent) gets
// full access, since Mongoose auto-defaults the nested subscription object
// on new companies (see that file's own comment for why planId, not just
// subscription's presence, is the real signal). This is a UX convenience
// (show the right thing without a network round-trip) — the actual
// security boundary is the backend's requireFeature() middleware, not this.
export function hasFeature(session, featureKey) {
  const sub = session?.company?.subscription;
  if (!sub?.planId) return true;
  return (sub.features || []).includes(featureKey);
}
