import mongoose from "mongoose";

// A role, owned by the workspace that defined it.
//
// Roles used to be a hardcoded enum on the User model — Owner, Admin,
// Manager, Support, Warehouse, Marketing, Accountant — with a static
// permission map in modules/auth/permissions.js. That list is entirely
// e-commerce shaped, so a workspace that isn't a store had no way to
// describe its own people: a coaching centre needs Centre Head, Counsellor
// and Teacher, and "Warehouse" means nothing to it.
//
// Roles are keyed by NAME rather than id on purpose. `user.role` is a string
// and every JWT already carries that string in its `role` claim, so keying
// on the name means the token shape is untouched and none of the 67
// requirePermission() call sites had to change.
const roleSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, ref: "Company", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },

    // Flat list of permission keys — see allPermissions() in
    // config/app-registry.js for what's grantable. "*" means everything,
    // which is what Owner holds.
    permissions: { type: [String], default: [] },

    // Seeded from the legacy built-in roles when a workspace first
    // customizes anything. Editable, but not deletable: removing the role
    // someone is currently assigned would leave them with no permissions at
    // all and no way to get them back.
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true },
);

roleSchema.index({ companyId: 1, name: 1 }, { unique: true });

export const Role = mongoose.model("Role", roleSchema);
