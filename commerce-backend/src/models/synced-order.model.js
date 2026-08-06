import mongoose from "mongoose";

const syncedOrderSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    channelId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    provider:  { type: String, enum: ["shopify", "amazon"], required: true, index: true },
    shop:      { type: String, required: true, index: true },

    // Shopify identifiers
    externalId:  { type: String, required: true },
    name:        String,    // e.g. "#1234"
    orderNumber: Number,

    // Customer
    email:              String,
    phone:              String,
    customerExternalId: String,
    customerName:       String,

    // Status
    financialStatus:   String,
    fulfillmentStatus: String,

    // Notes & meta
    note: String,
    tags: [String],

    // Financials
    currency:            String,
    totalPrice:          { type: Number, default: 0 },
    subtotalPrice:       { type: Number, default: 0 },
    totalTax:            { type: Number, default: 0 },
    totalDiscounts:      { type: Number, default: 0 },
    paymentGatewayNames: [String],

    // COD detection
    isCOD:     { type: Boolean, default: false },
    codAmount:  { type: Number, default: 0 },

    // Full shipping address (all fields needed for shipment creation)
    shippingAddress: {
      name:         String,
      address1:     String,
      address2:     String,
      city:         String,
      province:     String,
      provinceCode: String,
      country:      String,
      countryCode:  String,
      zip:          String,
      phone:        String,
    },

    // Line items with full data needed for shipment
    lineItems: [
      {
        externalId:        String,
        productExternalId: String,
        variantExternalId: String,
        title:             String,
        variantTitle:      String,
        sku:               String,
        quantity:          Number,
        price:             Number,
        grams:             Number,   // weight in grams from Shopify
        vendor:            String,
        requiresShipping:  Boolean,
      },
    ],

    // Fulfillment tracking (OMS side)
    omsStatus: {
      type: String,
      enum: ["pending", "awaiting_shipment", "processing", "shipped", "delivered", "cancelled", "returned"],
      default: "pending",
      index: true,
    },
    shippingProvider: String,    // which provider handled this
    shipmentId:       { type: mongoose.Schema.Types.ObjectId, ref: "Shipment" },
    awbCode:          String,
    labelUrl:         String,
    markedFulfilledAt: Date,

    // Timestamps from source
    shopifyCreatedAt: Date,
    processedAt:      Date,
    cancelledAt:      Date,

    // Full raw payload from Shopify (kept for debugging/re-mapping)
    raw: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

syncedOrderSchema.index({ companyId: 1, channelId: 1, externalId: 1 }, { unique: true });
syncedOrderSchema.index({ companyId: 1, shopifyCreatedAt: -1 });
syncedOrderSchema.index({ companyId: 1, omsStatus: 1 });
syncedOrderSchema.index({ companyId: 1, fulfillmentStatus: 1 });
syncedOrderSchema.index({ companyId: 1, financialStatus: 1 });

export const SyncedOrder = mongoose.model("SyncedOrder", syncedOrderSchema);
