import mongoose from "mongoose";

const vendorSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },

    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["raw-material", "packaging", "services", "other"],
      default: "raw-material",
    },

    contactPerson: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    gstin: { type: String, trim: true, uppercase: true },
    address: { type: String, trim: true },
    notes: { type: String, trim: true },

    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true },
);

vendorSchema.index({ companyId: 1, status: 1 });
vendorSchema.index({ companyId: 1, name: 1 });

export const Vendor = mongoose.model("Vendor", vendorSchema);
