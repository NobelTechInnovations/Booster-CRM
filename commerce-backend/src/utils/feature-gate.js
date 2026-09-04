import { HttpError } from "./http-error.js";

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

// Same "no plan assigned = unmetered" convention as companyHasFeature() above
// — a company's subscription.limits is only ever populated once an admin
// actually assigns a plan (see updateCompanySubscription in
// platform-admin.repo.js, which copies Plan.limits onto it), so an absent
// planId or an unset individual limit both mean "no cap".
export function getEffectiveLimits(company) {
  if (!company?.subscription?.planId) return {};
  return company.subscription.limits || {};
}

// Throws when adding one more of something would exceed the company's plan
// limit. `currentCount` is the count *before* the new one is added, so a
// limit of 3 allows the 4th create to be blocked once currentCount already
// reached 3 (i.e. the company keeps exactly 3). Undefined/null limit means
// unlimited; 0 is a real "not allowed at all" limit, not "unset".
export function assertLimitNotExceeded({ company, limitKey, currentCount, label }) {
  const limits = getEffectiveLimits(company);
  const limit = limits[limitKey];
  if (limit === undefined || limit === null) return;
  if (currentCount >= limit) {
    throw new HttpError(403, `You've reached your plan's limit of ${limit} ${label} — upgrade to add more.`);
  }
}
