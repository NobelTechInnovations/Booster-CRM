import mongoose from "mongoose";

// A company asking for its own data (see backup.repo.js's per-company
// export) doesn't get an unrestricted self-serve download — it goes through
// a platform admin first. This is the request/approval record; the actual
// export mechanics (streamCompanyBackup) live in backup.repo.js and are
// shared with the admin's own ad-hoc per-company backup.
const dataExportRequestSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    requestedByUserId: { type: mongoose.Schema.Types.Mixed },
    requestedAt: { type: Date, default: Date.now },
    decidedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "PlatformAdmin" },
    approvedAt: Date,
    rejectedAt: Date,
    rejectionReason: String,
  },
  { timestamps: true },
);

dataExportRequestSchema.index({ companyId: 1, createdAt: -1 });

export const DataExportRequest = mongoose.model("DataExportRequest", dataExportRequestSchema);
