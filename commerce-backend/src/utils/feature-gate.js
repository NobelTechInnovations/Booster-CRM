// Reusable check for "does this company's plan include feature X" — built
// as infrastructure for app/admin's plan-management system, not wired into
// any existing route yet (deliberately: which of today's features should be
// gated behind which plan is a pricing decision for the app owner to make,
// not something to guess at here).
//
// Keyed off subscription.planId specifically, not just subscription's
// presence: Mongoose auto-instantiates the nested `subscription` object
// (with its field-level default status:"trialing") on every newly-created
// company the moment ANY subfield has a schema default, even though no
// admin ever touched it — so `!company.subscription` alone is only true for
// companies that existed before this schema shipped, not for new signups.
// planId is never defaulted by Mongoose, so its absence is the one signal
// that actually means "an admin hasn't assigned a real plan yet" — and
// that should mean full access, same as an old company with no
// subscription object at all.
export function companyHasFeature(company, featureKey) {
  if (!company?.subscription?.planId) return true;
  const features = company.subscription.features || [];
  return features.includes(featureKey);
}
