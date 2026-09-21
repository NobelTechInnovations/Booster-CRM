import mongoose from "mongoose";

// A person, once — independent of how many workspaces they belong to.
//
// Before this, "one login, several workspaces" was emulated by duplicating
// the entire User row per workspace and copying the bcrypt hash across
// (see createAdditionalCompany in repositories/store.js). That worked for
// switching, but it meant there was no such thing as "your password":
// changing it in one workspace left every other copy on the old one, and
// inviting someone who already had an account into a second workspace
// meant cloning their credentials again.
//
// The split is deliberately minimal: Account owns identity and credentials,
// User stays exactly what it already was — the membership record binding a
// person to one workspace with one role. Nothing downstream changes, because
// the JWT still carries the User's own _id as `sub` and its companyId and
// role alongside, exactly as before.
const accountSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

export const Account = mongoose.model("Account", accountSchema);
