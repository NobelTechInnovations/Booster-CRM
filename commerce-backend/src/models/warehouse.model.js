import mongoose from "mongoose";

const warehouseSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    channelId: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true, index: true },
    provider: { type: String, enum: ["velocity"], required: true, index: true },
    warehouseId: { type: String, required: true },
    name: { type: String, required: true },
    phone: { type: String },
    email: { type: String },
    gstNo: { type: String },
    contactPerson: { type: String },
    address: {
      street: String,
      zip: String,
      city: String,
      state: String,
      country: String,
    },
  },
  { timestamps: true },
);

warehouseSchema.index({ companyId: 1, provider: 1, warehouseId: 1 }, { unique: true });

export const Warehouse = mongoose.model("Warehouse", warehouseSchema);
