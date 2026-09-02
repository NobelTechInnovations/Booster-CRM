import { getCompany } from "../repositories/company.repo.js";
import { companyHasFeature } from "../utils/feature-gate.js";
import { HttpError } from "../utils/http-error.js";

// Wires up utils/feature-gate.js's companyHasFeature() (written earlier
// this session as infrastructure, deliberately never enforced until real
// billing existed) as actual route middleware. requireAuth must run first
// — this reads req.auth.companyId.
//
// A company with no plan assigned (subscription.planId absent) is never
// blocked here — companyHasFeature() already treats that as full access,
// same "nothing changes for an existing company until an admin explicitly
// assigns something" guarantee from when the plan system was first built.
export function requireFeature(featureKey) {
  return async (req, _res, next) => {
    try {
      const company = await getCompany(req.auth.companyId);
      if (!companyHasFeature(company, featureKey)) {
        return next(new HttpError(403, "This feature isn't included in your current plan — upgrade to unlock it."));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
