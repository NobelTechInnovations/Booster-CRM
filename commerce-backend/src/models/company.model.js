import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    status: { type: String, enum: ["active", "disabled"], default: "active" },
    legalName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    website: { type: String, trim: true },
    businessType: {
      type: String,
      enum: ["Proprietorship", "Partnership", "LLP", "Private Limited", "Public Limited", "Other", ""],
      default: "",
    },
    gstin: { type: String, trim: true, uppercase: true },
    pan: { type: String, trim: true, uppercase: true },
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: "India" },
    },
    kyc: {
      status: { type: String, enum: ["not_started", "draft", "submitted", "verified", "rejected"], default: "not_started" },
      gstin: String,
      pan: String,
      legalName: String,
      registeredAddress: String,
      bankAccountName: String,
      bankAccountNumber: String,
      ifsc: String,
      submittedAt: Date,
      verifiedAt: Date,
      rejectionReason: String,
    },
  },
  { timestamps: true },
);

export const Company = mongoose.model("Company", companySchema);
