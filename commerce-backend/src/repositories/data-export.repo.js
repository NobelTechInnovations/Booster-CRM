import { isMongoConnected } from "../config/database.js";
import { DataExportRequest } from "../models/data-export-request.model.js";
import { Company } from "../models/company.model.js";

// Pure request/approval bookkeeping — the actual export mechanics
// (streamCompanyBackup/getCompanyBackupSummary) live in backup.repo.js and
// are shared with the platform admin's own ad-hoc per-company backup.
// Mongo-only: a company data-export request is a real compliance record,
// not something the in-memory dev fallback needs to simulate.

export async function createDataExportRequest({ companyId, userId }) {
  if (!isMongoConnected()) throw new Error("Database is not connected");
  const request = await DataExportRequest.create({ companyId, requestedByUserId: userId });
  return request.toObject();
}

// Most recent request for this company, regardless of status — what the
// company's own "Data & Backup" tab shows and what the download route
// checks before streaming anything.
export async function getLatestDataExportRequest(companyId) {
  if (!isMongoConnected()) return null;
  return DataExportRequest.findOne({ companyId }).sort({ createdAt: -1 }).lean();
}

export async function listPendingDataExportRequests() {
  if (!isMongoConnected()) return [];
  const requests = await DataExportRequest.find({ status: "pending" }).sort({ requestedAt: 1 }).lean();
  if (!requests.length) return requests;

  const companies = await Company.find({ _id: { $in: requests.map((r) => r.companyId) } }).select("name").lean();
  const nameById = new Map(companies.map((c) => [String(c._id), c.name]));
  return requests.map((r) => ({ ...r, companyName: nameById.get(String(r.companyId)) || "Unknown company" }));
}

export async function decideDataExportRequest({ requestId, approve, rejectionReason, adminId }) {
  if (!isMongoConnected()) return { error: "Database is not connected" };
  const patch = approve
    ? { status: "approved", approvedAt: new Date(), decidedByAdminId: adminId }
    : { status: "rejected", rejectedAt: new Date(), decidedByAdminId: adminId, rejectionReason: String(rejectionReason || "").slice(0, 500) };

  const request = await DataExportRequest.findByIdAndUpdate(requestId, { $set: patch }, { new: true }).lean();
  if (!request) return { error: "Request not found" };
  return { request };
}
