import mongoose from "mongoose";

// Platform operators — the people who run Booster itself, not a company's
// own users. Deliberately its own collection, not a User row: no companyId,
// no per-company role, and authenticated with its own JWT secret (see
// middleware/platform-admin-auth.js) so a company session can never be
// replayed as admin access and vice versa.
const platformAdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

export const PlatformAdmin = mongoose.model("PlatformAdmin", platformAdminSchema);
