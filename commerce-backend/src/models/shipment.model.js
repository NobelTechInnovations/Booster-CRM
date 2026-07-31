import mongoose from "mongoose";

const shipmentSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    channelId: { type: mongoose.Schema.Types.ObjectId, ref: "Channel", required: true, index: true },
    provider: { type: String, enum: ["velocity"], required: true, index: true },
    isReturn: { type: Boolean, default: false },
    orderId: { type: String, index: true },
    shipmentId: { type: String, index: true },
    returnId: { type: String },
    awbCode: { type: String, index: true },
    courierId: { type: String },
    courierName: { type: String },
    status: { type: String, default: "created" },
    paymentMethod: { type: String },
    codAmount: { type: Number, default: 0 },
    customerName: { type: String },
    destination: { type: String },
    warehouseId: { type: String },
    labelUrl: { type: String },
    trackingUrl: { type: String },
    trackingStatus: { type: String },
    lastTrackedAt: { type: Date },
    request: { type: mongoose.Schema.Types.Mixed },
    response: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

export const Shipment = mongoose.model("Shipment", shipmentSchema);
