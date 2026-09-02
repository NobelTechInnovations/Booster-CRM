// Reusable check for "does this company's plan include feature X" — built
// as infrastructure for app/admin's plan-management system, not wired into
// any existing route yet (deliberately: which of today's features should be
// gated behind which plan is a pricing decision for the app owner to make,
// not something to guess at here).
//
// A company with no subscription assigned (subscription === undefined —
// true for every company that existed before this system, and any new one
// an admin hasn't touched yet) gets full access: this must never silently
// lock out an existing customer just because this field showed up.
export function companyHasFeature(company, featureKey) {
  if (!company?.subscription) return true;
  const features = company.subscription.features || [];
  return features.includes(featureKey);
}
