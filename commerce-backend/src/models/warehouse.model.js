import mongoose from "mongoose";

const warehouseSchema = new mongoose.Schema(
  {
    companyId:  { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    channelId:  { type: mongoose.Schema.Types.Mixed, required: true, index: true },

    // Generic — no enum lock-in. e.g. "velocity", "shiprocket", "shipmozo"
    provider:   { type: String, required: true, index: true },

    // The ID the shipping provider uses for this warehouse
    externalWarehouseId: { type: String, required: true },

    name:          { type: String, required: true },
    phone:         { type: String },
    email:         { type: String },
    gstNo:         { type: String },
    contactPerson: { type: String },

    address: {
      street:  String,
      zip:     String,
      city:    String,
      state:   String,
      country: String,
    },

    isActive:     { type: Boolean, default: true, index: true },
    lastSyncedAt: { type: Date },

    // Full response from the shipping provider — useful for debugging
    raw: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

warehouseSchema.index({ companyId: 1, provider: 1, externalWarehouseId: 1 }, { unique: true });
warehouseSchema.index({ companyId: 1, channelId: 1 });

export const Warehouse = mongoose.model("Warehouse", warehouseSchema);
