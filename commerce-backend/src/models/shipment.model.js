import mongoose from "mongoose";

const shipmentSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    channelId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },

    // Generic — no enum lock-in. e.g. "velocity", "shiprocket", "shipmozo"
    provider: { type: String, required: true, index: true },

    // Link back to the Shopify order this shipment was created for
    shopifyOrderId:   { type: String, index: true },
    shopifyOrderName: { type: String },              // e.g. "#1234"
    syncedOrderId:    { type: mongoose.Schema.Types.ObjectId, ref: "SyncedOrder", index: true },

    // After creating the Shopify fulfillment, store its ID here
    shopifyFulfillmentId: { type: String },

    isReturn: { type: Boolean, default: false },

    // Provider order/shipment references
    orderId:    { type: String, index: true },
    shipmentId: { type: String, index: true },
    returnId:   { type: String },
    awbCode:    { type: String, index: true },

    // Courier details
    courierId:   { type: String },
    courierName: { type: String },

    // Status lifecycle: created → awb_generated → picked_up → in_transit → delivered / cancelled
    status:         { type: String, default: "created", index: true },
    trackingStatus: { type: String },
    trackingUrl:    { type: String },
    lastTrackedAt:  { type: Date },

    // Financial
    paymentMethod: { type: String },
    codAmount:     { type: Number, default: 0 },

    // Shipment details
    customerName: { type: String },
    destination:  { type: String },
    warehouseId:  { type: String },    // externalWarehouseId of the pickup warehouse

    // Label
    labelUrl: { type: String },

    // Full request/response stored for debugging and audit
    request:  { type: mongoose.Schema.Types.Mixed },
    response: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
);

shipmentSchema.index({ companyId: 1, awbCode: 1 });
shipmentSchema.index({ companyId: 1, provider: 1, createdAt: -1 });
shipmentSchema.index({ companyId: 1, shopifyOrderId: 1 });
shipmentSchema.index({ companyId: 1, status: 1 });

export const Shipment = mongoose.model("Shipment", shipmentSchema);
