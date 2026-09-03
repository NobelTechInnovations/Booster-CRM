// A single, plain-English "where is this order right now" badge — purely a
// panel-side read, computed on the fly from fields we already track
// (confirmationStatus, omsStatus, cancelledAt, financialStatus, isRTO).
// Nothing here is written back to Shopify; it only reorganizes signals that
// already exist into one value so the UI never has to show three different
// status badges (Shopify's fulfillmentStatus, our omsStatus, and
// confirmationStatus) side by side and make the seller reconcile them.
//
// Order of checks matters: exception states (cancelled/returned/refunded)
// are checked first because they can happen at any point in the timeline and
// should always win over whatever progress stage the order was in before —
// e.g. a shipped order that gets RTO'd should read "Returned", not "Shipped".
export const ORDER_STAGES = [
  { key: "draft", label: "Draft" },
  { key: "created", label: "Order Created" },
  { key: "confirmed", label: "Confirmed" },
  { key: "declined", label: "Declined" },
  { key: "fulfillment_assigned", label: "Fulfillment Assigned" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "returned", label: "Returned" },
  { key: "refunded", label: "Refunded" },
  { key: "cancelled", label: "Cancelled" },
];

const STAGE_LABEL = Object.fromEntries(ORDER_STAGES.map((s) => [s.key, s.label]));

export function computeOrderStage(order) {
  if (!order) return "created";

  // A draft outranks everything else — it isn't a real, committed order
  // yet (never synced to Shopify), so none of the progress/exception
  // states below are meaningful until it's finalized.
  if (order.isDraft) {
    return "draft";
  }
  if (order.cancelledAt || order.omsStatus === "cancelled" || order.financialStatus === "voided") {
    return "cancelled";
  }
  if (order.omsStatus === "returned" || order.isRTO) {
    return "returned";
  }
  if (order.financialStatus === "refunded" || order.financialStatus === "partially_refunded") {
    return "refunded";
  }
  if (order.omsStatus === "delivered") {
    return "delivered";
  }
  if (order.omsStatus === "shipped") {
    return "shipped";
  }
  if (order.omsStatus === "processing" || order.omsStatus === "awaiting_shipment") {
    return "fulfillment_assigned";
  }
  if (order.confirmationStatus === "declined") {
    return "declined";
  }
  if (order.confirmationStatus === "confirmed") {
    return "confirmed";
  }
  return "created";
}

export function orderStageLabel(stage) {
  return STAGE_LABEL[stage] || "Order Created";
}
