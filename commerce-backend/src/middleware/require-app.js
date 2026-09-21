import { isAppInstalled } from "../repositories/app.repo.js";
import { getApp } from "../config/app-registry.js";
import { HttpError } from "../utils/http-error.js";

// Blocks a route when the workspace doesn't have that app installed.
//
// The direct descendant of requireFeature() (middleware/feature-gate.js),
// which does the same job against plan features and is still in use — the
// two coexist deliberately: requireFeature answers "is this in their plan",
// requireApp answers "have they turned it on". A paid app needs both.
//
// requireAuth must run first; this reads req.auth.companyId.
export function requireApp(slug) {
  return async (req, _res, next) => {
    try {
      const installed = await isAppInstalled({ companyId: req.auth.companyId, slug });
      if (installed) return next();

      const app = getApp(slug);
      return next(new HttpError(403, `${app?.name || slug} isn't installed in this workspace — install it from Apps to use this.`));
    } catch (error) {
      return next(error);
    }
  };
}
