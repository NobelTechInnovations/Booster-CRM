"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  CreditCard,
  ExternalLink,
  FileEdit,
  FileText,
  Info,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Pencil,
  Phone,
  Plus,
  Printer,
  RefreshCcw,
  Repeat2,
  Search,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
  UploadCloud,
  User,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableSkeleton } from "@/components/ui/skeleton";
import { DraftOrderModal } from "@/components/draft-order-modal";
import { listAllOrders, getCompanyProfile, updateOrderAdjustments, updateOrderConfirmation, updateOrderFulfillmentAssignment, sendOrderInvoiceWhatsApp, finalizeDraftOrder, discardDraftOrder, markOrderShippedManually, updateOrderDeliveryStatus } from "@/lib/api";
import { formatMoney } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function fmtDate(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(date));
}

const PROVIDER_LABELS = { local: "Local Shop", website: "Website (Historical)", flipkart: "Flipkart", shopdeck: "Shopdeck", amazon: "Amazon", shopify: "Shopify" };

function paymentTone(status) {
  const s = (status || "").toLowerCase();
  if (s === "paid") return "green";
  if (s === "refunded" || s === "voided") return "rose";
  if (s === "pending" || s === "partially_paid") return "amber";
  return "slate";
}

// Panel-only "where is this order right now" stage — mirrors
// commerce-backend/src/utils/order-stage.js's computeOrderStage(), which
// is what actually sets order.stage on every order the API returns. This
// is display metadata only (label/tone/icon); the stage value itself
// always comes from the server, never recomputed here, so the two can
// never drift.
const STAGE_META = {
  draft:                  { label: "Draft",                tone: "teal",   icon: FileEdit },
  created:               { label: "Order Created",        tone: "slate",  icon: ClipboardList },
  confirmed:              { label: "Confirmed",            tone: "blue",   icon: CheckCircle2 },
  declined:               { label: "Declined",             tone: "rose",   icon: XCircle },
  fulfillment_assigned:   { label: "Fulfillment Assigned", tone: "indigo", icon: Package },
  shipped:                { label: "Shipped",              tone: "green",  icon: Truck },
  delivered:              { label: "Delivered",            tone: "green",  icon: CheckCircle2 },
  returned:               { label: "Returned",             tone: "gold",   icon: Repeat2 },
  refunded:               { label: "Refunded",             tone: "amber",  icon: RefreshCcw },
  cancelled:              { label: "Cancelled",            tone: "rose",   icon: XCircle },
};

// Stages that still count as "not shipped yet" — used to group the To Ship
// filter tab and to decide when the Assign-to-fulfillment toggle applies.
const OPEN_STAGES = ["created", "confirmed", "fulfillment_assigned"];
// "Shipped" as a filter/count groups delivered in too — it's still true
// the order shipped, delivered is just further along the same leg. The
// per-row Stage badge still shows the more specific "Delivered" though.
const SHIPPED_STAGES = ["shipped", "delivered"];

function StageBadge({ order, compact = false }) {
  const meta = STAGE_META[order.stage] || STAGE_META.created;
  const Icon = meta.icon;
  return (
    <div>
      <Badge tone={meta.tone}>
        <Icon size={11} />
        {meta.label}
      </Badge>
      {order.stage === "shipped" && (order.trackingNumber || order.awbCode) && !compact && (
        <p className="mt-1 truncate text-[10px] font-medium text-slate-500">
          {order.trackingCompany || order.shippingProvider || "Courier"} · {order.trackingNumber || order.awbCode}
        </p>
      )}
    </div>
  );
}

// ─── Tax Invoice (printable / save-as-PDF) ────────────────────────────────────

function InvoiceModal({ order, company, onClose }) {
  if (!order) return null;

  const addr = order.shippingAddress || {};
  const lineItems = order.lineItems || order.line_items || [];
  const gstRate = Number(company?.taxSettings?.gstRate ?? 5);
  const prefix = company?.taxSettings?.invoicePrefix || "INV";
  const invoiceNumber = `${prefix}-${order.orderNumber || order.name?.replace(/[^0-9]/g, "") || order.externalId}`;
  const invoiceDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  // The brand shown across the dashboard (company.name, e.g. "Sukirti Spices")
  // isn't necessarily the GST-registered entity — that's company.legalName
  // (e.g. "Kaleva Foods & Spices"), set once during KYC. A tax invoice must
  // carry the legal name; the brand name is shown small, as a wordmark only.
  const brandWord = (company?.name || "").split(" ")[0] || "Store";
  const legalName = company?.legalName || company?.kyc?.legalName || company?.name || "Your Company";
  const gstin = company?.gstin || company?.kyc?.gstin;
  const registeredAddress = company?.address?.line1
    ? [company.address.line1, company.address.line2, company.address.city, company.address.state, company.address.pincode].filter(Boolean).join(", ")
    : company?.kyc?.registeredAddress;

  // Shopify line-item prices in India are tax-inclusive — GST is already baked
  // into every item's rate, not added on top. The invoice total is the actual
  // amount paid; taxable value + GST are the portions *within* that total.
  const total = Number(order.totalPrice || 0);
  const taxableValue = Math.round((total / (1 + gstRate / 100)) * 100) / 100;
  const taxAmount = Math.round((total - taxableValue) * 100) / 100;
  const itemsTotal = lineItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  // totalDiscounts is the channel-native (Shopify) discount, already baked
  // into totalPrice by the sync. manualDiscount/manualExtraCharge are our
  // own CRM-side adjustments (see applyManualAdjustments in order.repo.js)
  // — layered on top at read time, so they show up in totalPrice but were
  // never surfaced as their own invoice line. Show both kinds here.
  const discount = Number(order.totalDiscounts || 0) + Number(order.manualDiscount || 0);
  // totalShipping is what Shopify charged the customer at checkout (derived
  // from the order's raw payload — see publicSyncedRecord in order.repo.js);
  // manualExtraCharge is a separate CRM-side adjustment added after the
  // fact. Both are already inside `total` — shown as their own lines so
  // they're not silently invisible, same reasoning as the discount above.
  const shipping = Number(order.totalShipping || 0);
  const extraCharge = Number(order.manualExtraCharge || 0);

  // Printing via the page's own CSS ("hide everything except the invoice")
  // turned out unreliable — a display:none/revert combo that should work per
  // spec rendered a fully blank page in practice. This sidesteps that whole
  // class of bug: open a bare new window, copy over the app's actual compiled
  // stylesheets (so Tailwind classes still apply), write ONLY the invoice's
  // markup into it, and print that in total isolation from the rest of the app.
  function handlePrint() {
    const invoiceEl = document.getElementById("invoice-printable");
    if (!invoiceEl) return;

    const printWindow = window.open("", "_blank", "width=800,height=1100");
    if (!printWindow) {
      // Popup blocked — fall back to printing the current page as-is.
      window.print();
      return;
    }

    const styleTags = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((el) => el.outerHTML).join("\n");

    printWindow.document.write(`<!DOCTYPE html>
<html>
  <head>
    <title>${invoiceNumber}</title>
    ${styleTags}
    <style>
      @page { size: A4; margin: 10mm; }
      html, body { margin: 0; padding: 0; background: #fff; }
      #invoice-printable { border: none !important; border-radius: 0 !important; box-shadow: none !important; }
    </style>
  </head>
  <body>${invoiceEl.outerHTML}</body>
</html>`);
    printWindow.document.close();

    // Give the copied stylesheets a moment to actually apply before printing —
    // printing immediately on write can catch the page unstyled.
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    };
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-xl">
        {/* Screen-only toolbar */}
        <div className="no-print mb-3 flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-lg">
          <p className="text-sm font-semibold text-slate-700">Tax Invoice Preview</p>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-700 px-3.5 text-sm font-semibold text-white hover:bg-indigo-800">
              <Printer size={14} />
              Print / Save as PDF
            </button>
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
          </div>
        </div>

        {/* Printable invoice — pure white, compact */}
        <div id="invoice-printable" className="overflow-hidden rounded-xl border border-slate-200 bg-white text-[13px] shadow-2xl">
          {/* Letterhead */}
          <div className="flex items-start justify-between border-b border-slate-200 px-4 py-3.5">
            <div className="flex items-start gap-3">
              {company?.logoUrl ? (
                <img src={company.logoUrl} alt={legalName} className="h-10 w-10 shrink-0 rounded object-contain" />
              ) : null}
              <div>
                {!company?.logoUrl && (
                  <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{brandWord}</span>
                )}
                <h1 className={`text-base font-bold leading-tight tracking-tight text-slate-950 ${company?.logoUrl ? "" : "mt-1.5"}`}>{legalName}</h1>
                {gstin ? <p className="mt-0.5 text-[11px] font-medium text-slate-500">GSTIN {gstin}</p> : null}
                {registeredAddress ? <p className="mt-0.5 max-w-xs text-[11px] leading-4 text-slate-500">{registeredAddress}</p> : null}
              </div>
            </div>
            <div className="text-right">
              <p className="inline-block rounded border border-slate-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-700">Tax Invoice</p>
              <p className="mt-2 text-[10px] text-slate-400">Invoice #</p>
              <p className="font-mono text-xs  text-slate-900">{invoiceNumber}</p>
            </div>
          </div>

          {/* Meta strip */}
          <div className="grid grid-cols-3 gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px]">
            <div>
              <p className="font-semibold uppercase tracking-wide text-slate-400">Invoice Date</p>
              <p className=" text-slate-800">{invoiceDate}</p>
            </div>
            <div>
              <p className="font-semibold uppercase tracking-wide text-slate-400">Order Reference</p>
              <p className=" text-slate-800">{order.name}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold uppercase tracking-wide text-slate-400">Payment</p>
              <p className=" text-slate-800">{order.isCOD ? "Cash on Delivery" : order.financialStatus || "Prepaid"}</p>
            </div>
          </div>

          <div className="px-4 py-3.5">
            <div className="grid grid-cols-2 gap-4 pb-3.5">
              <div>
                <p className="text-[10px]  uppercase tracking-wide text-slate-500">Bill To</p>
                <p className="mt-0.5  text-slate-900">{order.customerName || "Customer"}</p>
                {order.email ? <p className="text-[11px] text-slate-500">{order.email}</p> : null}
                {order.phone ? <p className="text-[11px] text-slate-500">{order.phone}</p> : null}
              </div>
              <div>
                <p className="text-[10px]  uppercase tracking-wide text-slate-500">Ship To</p>
                <p className="mt-0.5 text-[11px] leading-5 text-slate-700">
                  {addr.name && <span className="block  text-slate-900">{addr.name}</span>}
                  {[addr.address1, addr.address2].filter(Boolean).join(", ")}
                  <br />
                  {[addr.city, addr.province, addr.zip].filter(Boolean).join(", ")}
                </p>
              </div>
            </div>

            {/* Line items */}
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-600">
                    <th className="py-1.5 pl-3 pr-2 font-semibold">Item</th>
                    <th className="py-1.5 px-2 text-right font-semibold">Qty</th>
                    <th className="py-1.5 px-2 text-right font-semibold">Rate (₹)</th>
                    <th className="py-1.5 pl-2 pr-3 text-right font-semibold">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pl-3 pr-2 text-slate-800">{item.title || item.name}</td>
                      <td className="py-1.5 px-2 text-right text-slate-600">{item.quantity}</td>
                      <td className="py-1.5 px-2 text-right text-slate-600">{Number(item.price || 0).toFixed(2)}</td>
                      <td className="py-1.5 pl-2 pr-3 text-right font-semibold text-slate-900">
                        {(Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {lineItems.length === 0 && (
                    <tr><td colSpan={4} className="py-3 text-center text-slate-400">No item details available</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Tax summary + total — deliberately split into two blocks so
                it can't read as one long addition chain: block 1 is what was
                charged (adds up to the Total line); block 2 is that SAME
                Total decomposed into its taxable-value + GST components,
                clearly labelled as a breakup rather than more line items. */}
            <div className="mt-3 flex justify-end">
              <div className="w-72 overflow-hidden rounded-md border border-slate-200">
                <div className="space-y-1 px-3 py-2 text-[11px]">
                  <div className="flex justify-between text-slate-500">
                    <span>Items Total</span><span className="font-medium text-slate-700">₹{itemsTotal.toFixed(2)}</span>
                  </div>
                  {discount > 0 ? (
                    <div className="flex justify-between text-slate-500">
                      <span>Discount</span><span className="font-medium text-rose-600">−₹{discount.toFixed(2)}</span>
                    </div>
                  ) : null}
                  {shipping > 0 ? (
                    <div className="flex justify-between text-slate-500">
                      <span>Shipping</span><span className="font-medium text-slate-700">+₹{shipping.toFixed(2)}</span>
                    </div>
                  ) : null}
                  {extraCharge > 0 ? (
                    <div className="flex justify-between text-slate-500">
                      <span>{order.manualAdjustmentNote || "Extra Charge"}</span><span className="font-medium text-slate-700">+₹{extraCharge.toFixed(2)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between border-t border-dashed border-slate-200 pt-1 font-semibold text-slate-800">
                    <span>Total Amount</span><span>₹{total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px]">
                  <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">
                    GST breakup — already included in Total Amount above
                  </p>
                  <div className="flex justify-between text-slate-500">
                    <span>Taxable Value</span><span className="font-medium text-slate-700">₹{taxableValue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>+ GST @ {gstRate}%</span><span className="font-medium text-slate-700">₹{taxAmount.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-slate-500">
                    <span>= Total Amount</span><span className="font-medium text-slate-700">₹{total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex items-baseline justify-between border-t border-slate-200 bg-slate-900 px-3 py-2">
                  <span className="text-[11px]  uppercase tracking-wide text-white">Grand Total</span>
                  <span className="text-base font-bold text-white">₹{total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <p className="mt-2.5 text-[9.5px] leading-4 text-slate-400">
              Prices are GST-inclusive, per standard Indian D2C pricing — GST is not charged on top of the Total Amount.
              The GST breakup above only shows how much of that same Total Amount is taxable value vs. tax, for your records.
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
            <p className="text-[10px] text-slate-400">Computer-generated invoice — no signature required.</p>
            <p className="text-[10px] font-semibold text-slate-500">Thank you for your business</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineStep({ label, sublabel, date, done, tone = "slate" }) {
  const dotClass = {
    slate: "bg-slate-300",
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    indigo: "bg-indigo-500",
    gold: "bg-amber-600",
    amber: "bg-amber-500",
  }[tone];

  return (
    <li className="flex items-start gap-3">
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${done ? dotClass : "border-2 border-slate-300 bg-white"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold text-slate-700">{label}</span>
          {date && <span className="shrink-0 text-[11px] text-slate-400">{fmtDate(date)}</span>}
        </div>
        {sublabel && <p className="mt-0.5 text-[11px] text-slate-500 font-mono">{sublabel}</p>}
      </div>
    </li>
  );
}

// ─── Order Detail Modal ───────────────────────────────────────────────────────

function OrderDetailModal({ order, siblingOrders, onClose, onOpenOrder, onGenerateInvoice, onOrderUpdated, onFinalizeDraft, onDiscardDraft, draftActionId }) {
  const [editingAdjustments, setEditingAdjustments] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [extraChargeInput, setExtraChargeInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [isCODInput, setIsCODInput] = useState(true);
  const [savingAdjustments, setSavingAdjustments] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState("");
  const [addingTracking, setAddingTracking] = useState(false);
  const [trackingNumberInput, setTrackingNumberInput] = useState("");
  const [trackingCompanyInput, setTrackingCompanyInput] = useState("");
  const [trackingUrlInput, setTrackingUrlInput] = useState("");
  const [savingTracking, setSavingTracking] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const [markingDelivered, setMarkingDelivered] = useState(false);

  if (!order) return null;

  const addr = order.shippingAddress || {};
  const lineItems = order.lineItems || order.line_items || [];
  const hasSiblings = siblingOrders && siblingOrders.length > 0;
  const hasAdjustment = Number(order.manualDiscount || 0) > 0 || Number(order.manualExtraCharge || 0) > 0;

  function startEditAdjustments() {
    setDiscountInput(String(order.manualDiscount || ""));
    setExtraChargeInput(String(order.manualExtraCharge || ""));
    setNoteInput(order.manualAdjustmentNote || "");
    setIsCODInput(Boolean(order.isCOD));
    setAdjustmentError("");
    setEditingAdjustments(true);
  }

  // Payment mode + discount/extra-charge are edited together — a wrongly
  // COD-tagged order and its COD handling charge usually get fixed in the
  // same motion, so one form covers both instead of two separate edits.
  async function saveAdjustments() {
    setSavingAdjustments(true);
    setAdjustmentError("");
    try {
      const res = await updateOrderAdjustments(order.externalId || order._id || order.id, {
        discount: Number(discountInput) || 0,
        extraCharge: Number(extraChargeInput) || 0,
        note: noteInput,
        isCOD: isCODInput,
      });
      onOrderUpdated?.(res.order);
      setEditingAdjustments(false);
    } catch (err) {
      setAdjustmentError(err.message);
    } finally {
      setSavingAdjustments(false);
    }
  }

  async function onSaveManualTracking() {
    if (!trackingNumberInput.trim()) { setTrackingError("Tracking number is required"); return; }
    setSavingTracking(true);
    setTrackingError("");
    try {
      const res = await markOrderShippedManually(order.externalId || order._id || order.id, {
        trackingNumber: trackingNumberInput.trim(),
        trackingCompany: trackingCompanyInput.trim(),
        trackingUrl: trackingUrlInput.trim(),
      });
      onOrderUpdated?.(res.order);
      setAddingTracking(false);
    } catch (err) {
      setTrackingError(err.message);
    } finally {
      setSavingTracking(false);
    }
  }

  async function setDeliveryStatus(delivered) {
    setMarkingDelivered(true);
    try {
      const res = await updateOrderDeliveryStatus(order.externalId || order._id || order.id, delivered);
      onOrderUpdated?.(res.order);
    } catch (err) {
      // Surfaced inline rather than a full error banner — this is a small,
      // low-stakes toggle deep in the modal.
      window.alert(err.message);
    } finally {
      setMarkingDelivered(false);
    }
  }
  const onMarkDelivered = () => setDeliveryStatus(true);
  const onUndoDelivered = () => setDeliveryStatus(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-3xl rounded-2xl border border-[var(--line)] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--primary-soft)] px-4 py-4">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100">
              <ArrowLeft size={17} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{order.name}</h2>
                <StageBadge order={order} compact />
                {order.isCOD && <Badge tone="amber">COD</Badge>}
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                Placed {fmt(order.shopifyCreatedAt)} · {order.provider || "Shopify"}
                <span className="text-slate-300">·</span>
                <span title="Raw status as reported by Shopify — our own Stage badge above is the one to trust">
                  Shopify: {order.fulfillmentStatus || "unfulfilled"} / {order.financialStatus || "—"}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onGenerateInvoice(order)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
            >
              <FileText size={13} />
              Tax Invoice
            </button>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="grid gap-5 p-6 md:grid-cols-2">
          {/* Left column */}
          <div className="space-y-5">
            {/* Customer */}
            <section className="rounded-xl border border-[var(--line)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <User size={15} className="text-indigo-600" />
                <h3 className="text-sm  text-slate-800">Customer</h3>
                {hasSiblings && (
                  <span className="ml-auto flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px]  text-indigo-700">
                    <Repeat2 size={10} />
                    Repeat • {siblingOrders.length + 1} orders
                  </span>
                )}
              </div>
              <p className="font-semibold text-slate-900">{order.customerName || "—"}</p>
              {order.email && (
                <p className="mt-0.5 text-sm text-slate-600 flex items-center gap-1.5">
                  <span className="text-slate-400">✉</span>
                  {order.email}
                </p>
              )}
              {order.phone && (
                <p className="mt-0.5 text-sm text-slate-600 flex items-center gap-1.5">
                  <Phone size={13} className="text-slate-400" />
                  {order.phone}
                </p>
              )}

              {/* Other orders from same customer */}
              {hasSiblings && (
                <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                  <p className="mb-2 text-[11px]  text-indigo-800 uppercase tracking-wide">Previous orders</p>
                  <div className="flex flex-wrap gap-1.5">
                    {siblingOrders.map((sib) => (
                      <button
                        key={sib._id || sib.externalId}
                        onClick={() => onOpenOrder(sib)}
                        className="rounded-md border border-indigo-200 bg-white px-2 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-700 hover:text-white"
                      >
                        {sib.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Shipping Address */}
            <section className="rounded-xl border border-[var(--line)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <MapPin size={15} className="text-indigo-600" />
                <h3 className="text-sm  text-slate-800">Shipping Address</h3>
              </div>
              {addr.name || addr.address1 ? (
                <div className="text-sm leading-6 text-slate-700">
                  {addr.name && <p className="font-semibold">{addr.name}</p>}
                  {addr.address1 && <p>{addr.address1}</p>}
                  {addr.address2 && <p>{addr.address2}</p>}
                  <p>{[addr.city, addr.province, addr.zip].filter(Boolean).join(", ")}</p>
                  <p>{addr.country || "India"}</p>
                  {addr.phone && <p className="mt-1 text-slate-500">{addr.phone}</p>}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No shipping address</p>
              )}
            </section>

            {/* Payment & Delivery */}
            <section className="rounded-xl border border-[var(--line)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <CreditCard size={15} className="text-indigo-600" />
                <h3 className="text-sm  text-slate-800">Payment & Delivery</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] font-semibold uppercase text-slate-500">Total</p>
                  <p className="mt-0.5 text-base  text-slate-900">{formatMoney(order.totalPrice)}</p>
                  {hasAdjustment && (
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Adjusted from {formatMoney(order.originalTotalPrice)}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase text-slate-500">Payment</p>
                  <p className="mt-0.5 font-semibold text-slate-700">{order.financialStatus || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase text-slate-500">Payment Mode</p>
                  <Badge tone={order.isCOD ? "amber" : "green"}>{order.isCOD ? "COD" : "Prepaid"}</Badge>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase text-slate-500">Payment Method</p>
                  <p className="mt-0.5 font-medium text-slate-700 capitalize">{order.paymentGateway || order.payment_gateway || "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase text-slate-500">COD Amount</p>
                  <p className="mt-0.5 font-medium text-slate-700">{order.isCOD ? formatMoney(order.codAmount || order.totalPrice) : "—"}</p>
                </div>
                {order.shippingCost > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase text-slate-500">Shipping Cost</p>
                    <p className="mt-0.5 font-medium text-slate-700">{formatMoney(order.shippingCost)}</p>
                  </div>
                )}
                {order.shippingProvider && (
                  <div className="col-span-2">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">Shipping Provider</p>
                    <p className="mt-0.5 font-medium text-slate-700">{order.shippingProvider} {order.awbCode ? `· AWB: ${order.awbCode}` : ""}</p>
                  </div>
                )}
              </div>

              {/* Payment mode + manual discount/extra charge — edited
                  together since a corrected payment mode (e.g. wrongly
                  tagged COD) usually comes with a matching cost change
                  (removing/adding a COD handling fee). The cost side is
                  layered on top of the synced total, never overwrites it
                  (see applyManualAdjustments in order.repo.js), so it
                  survives future re-syncs. isCOD is our own OMS annotation
                  — this never rewrites Shopify's own financialStatus. */}
              <div className="mt-3 border-t border-[var(--line)] pt-3">
                {!editingAdjustments ? (
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-slate-500">
                      {hasAdjustment ? (
                        <span>
                          {Number(order.manualDiscount || 0) > 0 && <>↘ {formatMoney(order.manualDiscount)} discount </>}
                          {Number(order.manualExtraCharge || 0) > 0 && <>↗ {formatMoney(order.manualExtraCharge)} extra charge</>}
                        </span>
                      ) : (
                        <span>No manual discount or extra charge applied.</span>
                      )}
                    </div>
                    <button
                      onClick={startEditAdjustments}
                      className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                    >
                      <Pencil size={12} />
                      Edit payment & pricing
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <span className="text-[11px] font-semibold uppercase text-slate-500">Payment Mode</span>
                      <div className="mt-1 flex gap-2">
                        {[["COD", true], ["Prepaid", false]].map(([label, val]) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setIsCODInput(val)}
                            className={`flex-1 rounded-md border py-1.5 text-xs font-semibold transition ${isCODInput === val ? "border-indigo-700 bg-indigo-700 text-white" : "border-[var(--line)] text-slate-600 hover:bg-slate-50"}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[11px] font-semibold uppercase text-slate-500">Discount (₹)</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={discountInput}
                          onChange={(e) => setDiscountInput(e.target.value)}
                          className="mt-1 h-9 w-full rounded-md border border-[var(--line)] px-2.5 text-sm outline-none focus:border-indigo-500"
                          placeholder="0"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold uppercase text-slate-500">Extra Charge (₹)</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={extraChargeInput}
                          onChange={(e) => setExtraChargeInput(e.target.value)}
                          className="mt-1 h-9 w-full rounded-md border border-[var(--line)] px-2.5 text-sm outline-none focus:border-indigo-500"
                          placeholder="0"
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="text-[11px] font-semibold uppercase text-slate-500">Note (optional)</span>
                      <input
                        type="text"
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        className="mt-1 h-9 w-full rounded-md border border-[var(--line)] px-2.5 text-sm outline-none focus:border-indigo-500"
                        placeholder="e.g. loyalty discount, packaging charge"
                      />
                    </label>
                    {adjustmentError && <p className="text-xs font-medium text-rose-600">{adjustmentError}</p>}
                    <div className="flex gap-2">
                      <Button onClick={saveAdjustments} disabled={savingAdjustments} className="h-8 px-3 text-xs">
                        {savingAdjustments ? "Saving…" : "Save"}
                      </Button>
                      <button
                        onClick={() => setEditingAdjustments(false)}
                        className="rounded-md px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Tracking */}
            {(order.trackingNumber || order.awbCode) ? (
              <section className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Truck size={15} className="text-emerald-700" />
                  <h3 className="text-sm  text-slate-800">Tracking</h3>
                  {order.shippingProvider === "manual" && <Badge tone="slate">Manually added</Badge>}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase text-slate-500">
                      {order.trackingCompany || order.shippingProvider || "Courier"}
                    </p>
                    <p className="mt-0.5 font-mono text-sm  text-slate-900">
                      {order.trackingNumber || order.awbCode}
                    </p>
                  </div>
                  {(order.trackingUrl || order.labelUrl) && (
                    <a
                      href={order.trackingUrl || order.labelUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800"
                    >
                      Track Shipment
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
                {/* Manual delivery-status toggle — no courier integration
                    reports this back to us for a manually-tracked shipment
                    (and not consistently for every real provider either),
                    so it's a plain manual record either way. */}
                {order.stage === "shipped" && (
                  <button
                    onClick={onMarkDelivered}
                    disabled={markingDelivered}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-white py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                  >
                    {markingDelivered ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                    Mark as Delivered
                  </button>
                )}
                {order.stage === "delivered" && (
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-100 px-3 py-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                      <CheckCircle2 size={13} /> Delivered {order.deliveredAt ? `· ${fmtDate(order.deliveredAt)}` : ""}
                    </span>
                    <button onClick={onUndoDelivered} disabled={markingDelivered} className="text-[11px] font-semibold text-emerald-700 underline hover:text-emerald-900 disabled:opacity-50">
                      Undo
                    </button>
                  </div>
                )}
              </section>
            ) : ["created", "confirmed", "fulfillment_assigned"].includes(order.stage) ? (
              <section className="rounded-xl border border-[var(--line)] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Truck size={15} className="text-indigo-600" />
                  <h3 className="text-sm  text-slate-800">Tracking</h3>
                </div>
                {!addingTracking ? (
                  <button
                    onClick={() => setAddingTracking(true)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--line)] py-2 text-xs font-semibold text-slate-500 hover:border-indigo-400 hover:text-indigo-700"
                  >
                    <Plus size={12} />
                    Fulfilled outside the panel? Add tracking
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">
                      For an order shipped directly with a courier (not through this panel's Ship flow) — marks it Shipped with the details you enter.
                    </p>
                    <label className="block">
                      <span className="text-[11px] font-semibold uppercase text-slate-500">Tracking / AWB Number</span>
                      <input
                        type="text"
                        value={trackingNumberInput}
                        onChange={(e) => setTrackingNumberInput(e.target.value)}
                        className="mt-1 h-9 w-full rounded-md border border-[var(--line)] px-2.5 text-sm outline-none focus:border-indigo-500"
                        placeholder="e.g. 1234567890"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[11px] font-semibold uppercase text-slate-500">Courier</span>
                        <input
                          type="text"
                          value={trackingCompanyInput}
                          onChange={(e) => setTrackingCompanyInput(e.target.value)}
                          className="mt-1 h-9 w-full rounded-md border border-[var(--line)] px-2.5 text-sm outline-none focus:border-indigo-500"
                          placeholder="e.g. Delhivery"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold uppercase text-slate-500">Tracking Link (optional)</span>
                        <input
                          type="text"
                          value={trackingUrlInput}
                          onChange={(e) => setTrackingUrlInput(e.target.value)}
                          className="mt-1 h-9 w-full rounded-md border border-[var(--line)] px-2.5 text-sm outline-none focus:border-indigo-500"
                          placeholder="https://..."
                        />
                      </label>
                    </div>
                    {trackingError && <p className="text-xs font-medium text-rose-600">{trackingError}</p>}
                    <div className="flex gap-2">
                      <Button onClick={onSaveManualTracking} disabled={savingTracking} className="h-8 px-3 text-xs">
                        {savingTracking ? "Saving…" : "Mark as Shipped"}
                      </Button>
                      <button
                        onClick={() => setAddingTracking(false)}
                        className="rounded-md px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>
            ) : null}
          </div>

          {/* Right column */}
          <div className="space-y-5">
            {/* Line items */}
            <section className="rounded-xl border border-[var(--line)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <Package size={15} className="text-indigo-600" />
                <h3 className="text-sm  text-slate-800">Order Items</h3>
                <span className="ml-auto text-xs text-slate-400">{lineItems.length} item{lineItems.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="space-y-3">
                {lineItems.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-100 bg-slate-50">
                      <Box size={16} className="text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 leading-tight">{item.title || item.name}</p>
                      {item.variant_title && item.variant_title !== "Default Title" && (
                        <p className="text-xs text-slate-500">{item.variant_title}</p>
                      )}
                      {item.sku && <p className="text-xs text-slate-400">SKU: {item.sku}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm  text-slate-900">{formatMoney(item.price || item.price_set?.shop_money?.amount || 0)}</p>
                      <p className="text-xs text-slate-500">× {item.quantity}</p>
                    </div>
                  </div>
                ))}
                {lineItems.length === 0 && (
                  <p className="text-sm text-slate-400">No item details available</p>
                )}
              </div>

              {/* Totals */}
              <div className="mt-4 border-t border-slate-100 pt-3 space-y-1.5 text-sm">
                {order.subtotalPrice && (
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span>{formatMoney(order.subtotalPrice)}</span>
                  </div>
                )}
                {Number(order.totalDiscounts || 0) > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>Discount</span>
                    <span>−{formatMoney(order.totalDiscounts)}</span>
                  </div>
                )}
                {Number(order.totalShipping || 0) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Shipping</span>
                    <span>+{formatMoney(order.totalShipping)}</span>
                  </div>
                )}
                {order.totalTax > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Tax</span>
                    <span>{formatMoney(order.totalTax)}</span>
                  </div>
                )}
                <div className="flex justify-between  text-slate-900">
                  <span>Total</span>
                  <span>{formatMoney(order.totalPrice)}</span>
                </div>
              </div>
            </section>

            {/* Tags & Notes */}
            {(order.tags?.length > 0 || order.note) && (
              <section className="rounded-xl border border-[var(--line)] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Tag size={15} className="text-indigo-600" />
                  <h3 className="text-sm  text-slate-800">Notes & Tags</h3>
                </div>
                {order.note && (
                  <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 border border-amber-100">{order.note}</p>
                )}
                {order.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(Array.isArray(order.tags) ? order.tags : String(order.tags).split(",")).filter(Boolean).map((tag, i) => (
                      <span key={i} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* UTM / Attribution */}
            {(order.utmSource || order.utmCampaign || order.landingSite) && (
              <section className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Info size={15} className="text-indigo-600" />
                  <h3 className="text-sm  text-slate-800">Traffic Attribution</h3>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {order.utmSource && <div><p className="font-semibold text-slate-500 uppercase">Source</p><p className="text-slate-700">{order.utmSource}</p></div>}
                  {order.utmMedium && <div><p className="font-semibold text-slate-500 uppercase">Medium</p><p className="text-slate-700">{order.utmMedium}</p></div>}
                  {order.utmCampaign && <div className="col-span-2"><p className="font-semibold text-slate-500 uppercase">Campaign</p><p className="text-slate-700 truncate">{order.utmCampaign}</p></div>}
                </div>
              </section>
            )}

            {/* Status & Timeline */}
            <section className="rounded-xl border border-[var(--line)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <Clock size={15} className="text-indigo-600" />
                <h3 className="text-sm  text-slate-800">Timeline</h3>
              </div>
              <ol className="space-y-3">
                <TimelineStep label="Order placed" date={order.shopifyCreatedAt} done tone="slate" />
                {order.processedAt && (
                  <TimelineStep label="Payment processed" date={order.processedAt} done tone="blue" />
                )}
                {order.confirmationStatus === "confirmed" && (
                  <TimelineStep label="Customer confirmed" date={order.confirmedAt} done tone="blue" />
                )}
                {order.confirmationStatus === "declined" && (
                  <TimelineStep label="Customer declined" date={order.confirmedAt} done tone="rose" />
                )}
                {order.stage === "fulfillment_assigned" && (
                  <TimelineStep label="Assigned for fulfillment" sublabel="Picked up for packing / label prep" done tone="indigo" />
                )}
                {(order.fulfillments || []).map((f, idx) => (
                  <TimelineStep
                    key={idx}
                    label={f.trackingNumber ? `Shipped${f.trackingCompany ? ` via ${f.trackingCompany}` : ""}` : "Fulfillment update"}
                    sublabel={f.trackingNumber ? `Tracking: ${f.trackingNumber}` : f.status}
                    date={f.createdAt}
                    done
                    tone="emerald"
                  />
                ))}
                {!order.fulfillments?.length && order.awbCode && (
                  <TimelineStep
                    label={`Shipped via ${order.shippingProvider || "courier"}`}
                    sublabel={`AWB: ${order.awbCode}`}
                    date={order.markedFulfilledAt}
                    done
                    tone="emerald"
                  />
                )}
                {order.stage === "delivered" && (
                  <TimelineStep label="Delivered" date={order.deliveredAt} done tone="emerald" />
                )}
                {order.cancelledAt && (
                  <TimelineStep label="Cancelled" date={order.cancelledAt} done tone="rose" />
                )}
                {order.stage === "returned" && (
                  <TimelineStep label="Returned (RTO)" done tone="gold" />
                )}
                {order.stage === "refunded" && (
                  <TimelineStep label="Refunded" done tone="amber" />
                )}
              </ol>
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3 bg-slate-50">
          <p className="text-xs text-slate-400">
            {order.stage === "draft" ? "Draft — not yet on Shopify" : `Shopify ID: ${order.externalId || "—"}`}
          </p>
          <div className="flex items-center gap-2">
            {order.stage === "draft" && (
              <>
                <button
                  onClick={() => onDiscardDraft?.(order)}
                  disabled={draftActionId === (order.externalId || order._id || order.id)}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 size={13} />
                  Discard
                </button>
                <button
                  onClick={() => onFinalizeDraft?.(order)}
                  disabled={draftActionId === (order.externalId || order._id || order.id)}
                  className="flex h-8 items-center gap-1.5 rounded-lg bg-indigo-700 px-3 text-xs font-semibold text-white transition hover:bg-indigo-800 disabled:opacity-50"
                >
                  {draftActionId === (order.externalId || order._id || order.id) ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
                  Finalize & Sync to Shopify
                </button>
              </>
            )}
            <button onClick={onClose} className="h-8 rounded-lg border border-[var(--line)] bg-white px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Orders View ─────────────────────────────────────────────────────────

export function OrdersView() {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterChannel, setFilterChannel] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [invoiceOrder, setInvoiceOrder] = useState(null);
  const [company, setCompany] = useState(null);
  const [confirmingId, setConfirmingId] = useState("");
  const [assigningId, setAssigningId] = useState("");
  const [sendingInvoiceId, setSendingInvoiceId] = useState("");
  const [invoiceSendError, setInvoiceSendError] = useState("");
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftActionId, setDraftActionId] = useState("");
  const [deliveringId, setDeliveringId] = useState("");
  const [draftNotice, setDraftNotice] = useState("");

  useEffect(() => {
    getCompanyProfile().then((res) => setCompany(res.company)).catch(() => { });
  }, []);

  function orderKey(order) {
    return String(order.externalId || order._id || order.id);
  }

  // Optimistic — updates the row immediately rather than re-fetching the
  // whole order list for a one-field change.
  async function handleConfirmation(order, status) {
    const key = orderKey(order);
    setConfirmingId(key);
    try {
      const res = await updateOrderConfirmation(order._id || order.id || order.externalId, status);
      setOrders((prev) => prev.map((o) => (orderKey(o) === key ? { ...o, ...res.order } : o)));
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirmingId("");
    }
  }

  // Same optimistic-update pattern as handleConfirmation — "Assign to
  // fulfillment" / "Undo" toggle for the panel-only middle stage between
  // confirmed and shipped.
  async function handleFulfillmentAssignment(order, assigned) {
    const key = orderKey(order);
    setAssigningId(key);
    try {
      const res = await updateOrderFulfillmentAssignment(order._id || order.id || order.externalId, assigned);
      setOrders((prev) => prev.map((o) => (orderKey(o) === key ? { ...o, ...res.order } : o)));
    } catch (err) {
      setError(err.message);
    } finally {
      setAssigningId("");
    }
  }

  // Pushes a draft for real onto Shopify — unlike every other row action,
  // this doesn't just patch the row in place: the draft row is deleted
  // server-side and a brand new Shopify-synced order takes its place, so a
  // full reload is the simplest correct way to reflect that (an optimistic
  // merge would either keep the dead draft or fabricate the new order's id).
  async function handleFinalizeDraft(order) {
    const key = orderKey(order);
    setDraftActionId(key);
    setError("");
    setDraftNotice("");
    try {
      const res = await finalizeDraftOrder(order._id || order.id || order.externalId);
      if (selectedOrder && orderKey(selectedOrder) === key) setSelectedOrder(null);
      await loadOrders();
      setDraftNotice(res.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setDraftActionId("");
    }
  }

  async function handleDiscardDraft(order) {
    if (!window.confirm(`Discard draft ${order.name}? This can't be undone.`)) return;
    const key = orderKey(order);
    setDraftActionId(key);
    setError("");
    try {
      await discardDraftOrder(order._id || order.id || order.externalId);
      setOrders((prev) => prev.filter((o) => orderKey(o) !== key));
      if (selectedOrder && orderKey(selectedOrder) === key) setSelectedOrder(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setDraftActionId("");
    }
  }

  async function handleMarkDelivered(order) {
    const key = orderKey(order);
    setDeliveringId(key);
    setError("");
    try {
      const res = await updateOrderDeliveryStatus(order._id || order.id || order.externalId, true);
      setOrders((prev) => prev.map((o) => (orderKey(o) === key ? { ...o, ...res.order } : o)));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeliveringId("");
    }
  }

  async function handleSendInvoiceWhatsApp(order) {
    const key = orderKey(order);
    setSendingInvoiceId(key);
    setInvoiceSendError("");
    try {
      await sendOrderInvoiceWhatsApp(order._id || order.id || order.externalId);
    } catch (err) {
      setInvoiceSendError(`${order.name}: ${err.message}`);
    } finally {
      setSendingInvoiceId("");
    }
  }

  async function loadOrders() {
    setIsLoading(true);
    setError("");
    try {
      const res = await listAllOrders();
      const raw = res.records || [];
      // Dedup by externalId
      const seen = new Set();
      const deduped = raw.filter((o) => {
        const key = String(o.externalId || o._id || o.id);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setOrders(deduped);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadOrders(); }, []);

  // Build repeat-customer map: email → [orderIds]
  const repeatMap = useMemo(() => {
    const map = new Map();
    for (const order of orders) {
      const key = (order.email || order.customerEmail || "").toLowerCase();
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(order);
    }
    return map;
  }, [orders]);

  // Filtered orders
  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (filterStatus !== "all") {
        if (filterStatus === "draft" && o.stage !== "draft") return false;
        if (filterStatus === "to_ship" && !OPEN_STAGES.includes(o.stage)) return false;
        if (filterStatus === "shipped" && !SHIPPED_STAGES.includes(o.stage)) return false;
        if (filterStatus === "not_proceeding" && !["declined", "cancelled", "returned", "refunded"].includes(o.stage)) return false;
      }
      if (filterPayment === "cod" && !o.isCOD) return false;
      if (filterPayment === "prepaid" && o.isCOD) return false;

      if (filterChannel !== "all" && (o.provider || "shopify") !== filterChannel) return false;

      if (search) {
        const q = search.toLowerCase();
        return (
          (o.name || "").toLowerCase().includes(q) ||
          (o.customerName || "").toLowerCase().includes(q) ||
          (o.email || "").toLowerCase().includes(q) ||
          (o.phone || "").toLowerCase().includes(q) ||
          String(o.totalPrice || "").includes(q)
        );
      }
      return true;
    });
  }, [orders, filterStatus, filterPayment, filterChannel, search]);

  function getSiblingOrders(order) {
    const key = (order.email || order.customerEmail || "").toLowerCase();
    if (!key) return [];
    const all = repeatMap.get(key) || [];
    return all.filter((o) => (o.externalId || o._id) !== (order.externalId || order._id));
  }

  // Panel-only stage counts (see order-stage.js) — this is what drives the
  // Status filter tabs below, deliberately not Shopify's raw
  // fulfillmentStatus, so "which orders still need action" always reads the
  // same regardless of what Shopify itself shows.
  const counts = useMemo(() => ({
    total: orders.length,
    drafts: orders.filter((o) => o.stage === "draft").length,
    toShip: orders.filter((o) => OPEN_STAGES.includes(o.stage)).length,
    shipped: orders.filter((o) => SHIPPED_STAGES.includes(o.stage)).length,
    notProceeding: orders.filter((o) => ["declined", "cancelled", "returned", "refunded"].includes(o.stage)).length,
  }), [orders]);

  // Every distinct provider actually present in the data — Shopify (live sync),
  // Amazon (SQL/CSV imported), "local" (manual orders), etc. Built from the
  // data itself rather than a fixed list, so a newly imported channel shows up
  // automatically without a code change.
  const channelTabs = useMemo(() => {
    const byProvider = new Map();
    for (const o of orders) {
      const key = o.provider || "shopify";
      byProvider.set(key, (byProvider.get(key) || 0) + 1);
    }
    return [
      { key: "all", label: `All (${orders.length})` },
      ...[...byProvider.entries()].map(([key, count]) => ({
        key,
        label: `${PROVIDER_LABELS[key] || key} (${count})`,
      })),
    ];
  }, [orders]);

  return (
    <div className="mx-auto max-w-[1920px] px-4 py-4 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Badge tone="indigo">{filterChannel === "all" ? "All Channels" : PROVIDER_LABELS[filterChannel] || filterChannel}</Badge>
          <h1 className="mt-2 text-2xl  tracking-tight text-slate-950 md:text-[24px]">Orders</h1>
          <p className="mt-1 text-sm text-slate-500">
            {counts.total} total · {counts.toShip} to ship · {counts.shipped} shipped
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowDraftModal(true)}>
            <FileEdit size={15} />
            Create Draft Order
          </Button>
          <Button variant="secondary" onClick={loadOrders} disabled={isLoading}>
            <RefreshCcw size={15} className={isLoading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-5">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by order #, customer, email..."
                className="h-9 w-full rounded-lg border border-[var(--line)] bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {/* Channel filter — every provider actually present in the data (Shopify live sync, Amazon SQL/CSV import, local manual orders, etc) */}
            <select
              value={filterChannel}
              onChange={(e) => setFilterChannel(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            >
              {channelTabs.map((tab) => (
                <option key={tab.key} value={tab.key}>{tab.label}</option>
              ))}
            </select>

            {/* Status filter */}
            <div className="flex rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
              {[
                { key: "all", label: `All (${counts.total})` },
                ...(counts.drafts > 0 ? [{ key: "draft", label: `Drafts (${counts.drafts})` }] : []),
                { key: "to_ship", label: `To Ship (${counts.toShip})` },
                { key: "shipped", label: `Shipped (${counts.shipped})` },
                { key: "not_proceeding", label: `Cancelled/Returns (${counts.notProceeding})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilterStatus(tab.key)}
                  className={`px-3 py-1.5 text-xs font-semibold transition ${filterStatus === tab.key
                    ? "bg-indigo-700 text-white"
                    : "text-slate-600 hover:text-slate-900"
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Payment filter */}
            <div className="flex rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
              {[
                { key: "all", label: "All" },
                { key: "cod", label: "COD" },
                { key: "prepaid", label: "Prepaid" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilterPayment(tab.key)}
                  className={`px-3 py-1.5 text-xs font-semibold transition ${filterPayment === tab.key
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Draft finalized notice */}
      {draftNotice && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
          <CheckCircle2 size={17} />
          {draftNotice}
          <button onClick={() => setDraftNotice("")} className="ml-auto text-emerald-500 hover:text-emerald-700"><X size={14} /></button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">
          <AlertCircle size={17} />
          {error}
        </div>
      )}
      {invoiceSendError && (
        <div className="mb-5 flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">
          <span className="flex items-center gap-2"><AlertCircle size={17} /> Couldn't send invoice — {invoiceSendError}</span>
          <button onClick={() => setInvoiceSendError("")} className="text-rose-400 hover:text-rose-600"><X size={15} /></button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className={isLoading ? "p-4" : "p-0 overflow-x-auto"}>
          {isLoading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center">
              <ShoppingBag size={36} className="mx-auto mb-3 text-slate-300" />
              <p className="font-semibold text-slate-700">No orders found</p>
              <p className="mt-1 text-sm text-slate-400">Try a different filter or sync your channel data.</p>
            </div>
          ) : (
            <table className="w-full min-w-[940px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-slate-50 text-left text-[11px]  uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Confirmation</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => {
                  const siblings = getSiblingOrders(order);
                  const isRepeat = siblings.length > 0;
                  const lineItems = order.lineItems || order.line_items || [];

                  return (
                    <tr
                      key={order.externalId || order._id || order.id}
                      className="group border-b border-slate-100 transition hover:bg-indigo-50/30 last:border-0"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className=" text-slate-900">{order.name}</span>
                          {isRepeat && (
                            <span className="flex items-center gap-0.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px]  text-indigo-700">
                              <Repeat2 size={9} />
                              {siblings.length + 1}×
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{order.customerName || "—"}</p>
                        <p className="text-xs text-slate-400">{order.phone || order.email || ""}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {order.shopifyCreatedAt ? new Date(order.shopifyCreatedAt).toLocaleDateString("en-IN") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {lineItems.slice(0, 2).map((item, i) => (
                            <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
                              {item.title?.split(" ").slice(0, 3).join(" ")} ×{item.quantity}
                            </span>
                          ))}
                          {lineItems.length > 2 && (
                            <span className="text-[10px] text-slate-400">+{lineItems.length - 2} more</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const key = orderKey(order);
                          const status = order.confirmationStatus || "pending";
                          const busy = confirmingId === key;
                          if (status === "confirmed") {
                            return (
                              <button
                                onClick={() => handleConfirmation(order, "pending")}
                                title="Confirmed — click to reset"
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-600/15 hover:bg-emerald-100"
                              >
                                <CheckCircle2 size={11} /> Confirmed
                              </button>
                            );
                          }
                          if (status === "declined") {
                            return (
                              <button
                                onClick={() => handleConfirmation(order, "pending")}
                                title="Declined — click to reset"
                                className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 ring-1 ring-rose-600/15 hover:bg-rose-100"
                              >
                                <XCircle size={11} /> Declined
                              </button>
                            );
                          }
                          return (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleConfirmation(order, "confirmed")}
                                disabled={busy}
                                title="Customer confirmed this order"
                                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-emerald-200 bg-white text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50"
                              >
                                {busy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={12} />}
                              </button>
                              <button
                                onClick={() => handleConfirmation(order, "declined")}
                                disabled={busy}
                                title="Customer did not confirm"
                                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                              >
                                {busy ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={12} />}
                              </button>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-1.5">
                          <StageBadge order={order} />
                          {(order.stage === "created" || order.stage === "confirmed") && (
                            <button
                              onClick={() => handleFulfillmentAssignment(order, true)}
                              disabled={assigningId === orderKey(order)}
                              title="Mark as picked up for packing/fulfillment"
                              className="mt-0.5 inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-indigo-200 bg-white px-1.5 text-[9px] font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50"
                            >
                              {assigningId === orderKey(order) ? <Loader2 size={9} className="animate-spin" /> : <Package size={9} />}
                              Assign
                            </button>
                          )}
                          {order.stage === "fulfillment_assigned" && (
                            <button
                              onClick={() => handleFulfillmentAssignment(order, false)}
                              disabled={assigningId === orderKey(order)}
                              title="Undo — move back to pending"
                              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 disabled:opacity-50"
                            >
                              {assigningId === orderKey(order) ? <Loader2 size={9} className="animate-spin" /> : <X size={9} />}
                            </button>
                          )}
                          {order.stage === "shipped" && (
                            <button
                              onClick={() => handleMarkDelivered(order)}
                              disabled={deliveringId === orderKey(order)}
                              title="Mark as delivered"
                              className="mt-0.5 inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-white px-1.5 text-[9px] font-semibold text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50"
                            >
                              {deliveringId === orderKey(order) ? <Loader2 size={9} className="animate-spin" /> : <CheckCircle2 size={9} />}
                              Delivered
                            </button>
                          )}
                          {order.stage === "draft" && (
                            <>
                              <button
                                onClick={() => handleFinalizeDraft(order)}
                                disabled={draftActionId === orderKey(order)}
                                title="Push this draft to Shopify for real"
                                className="mt-0.5 inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-indigo-200 bg-white px-1.5 text-[9px] font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50"
                              >
                                {draftActionId === orderKey(order) ? <Loader2 size={9} className="animate-spin" /> : <UploadCloud size={9} />}
                                Finalize
                              </button>
                              <button
                                onClick={() => handleDiscardDraft(order)}
                                disabled={draftActionId === orderKey(order)}
                                title="Discard this draft"
                                className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-500 transition hover:bg-rose-50 disabled:opacity-50"
                              >
                                <Trash2 size={9} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Badge tone={paymentTone(order.financialStatus)}>
                            {order.financialStatus || "—"}
                          </Badge>
                          {order.isCOD && <Badge tone="amber">COD</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right  text-slate-900">
                        {formatMoney(order.totalPrice)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setInvoiceOrder(order)}
                            title="Generate tax invoice"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-slate-500 shadow-xs transition hover:border-indigo-400 hover:text-indigo-700"
                          >
                            <FileText size={12} />
                          </button>
                          {order.phone ? (
                            <button
                              onClick={() => handleSendInvoiceWhatsApp(order)}
                              disabled={sendingInvoiceId === orderKey(order)}
                              title="Send tax invoice to customer on WhatsApp"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-slate-500 shadow-xs transition hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50"
                            >
                              {sendingInvoiceId === orderKey(order) ? <Loader2 size={12} className="animate-spin" /> : <MessageCircle size={12} />}
                            </button>
                          ) : null}
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-[var(--line)] bg-white px-2.5 text-[11px] font-semibold text-slate-600 shadow-xs transition hover:border-indigo-400 hover:text-indigo-700 group-hover:border-indigo-300"
                          >
                            View
                            <ChevronRight size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-slate-400 text-right">
        Showing {filtered.length} of {orders.length} orders
      </p>

      {/* Detail modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          siblingOrders={getSiblingOrders(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
          onOpenOrder={(o) => setSelectedOrder(o)}
          onGenerateInvoice={(o) => setInvoiceOrder(o)}
          onOrderUpdated={(updated) => {
            setSelectedOrder(updated);
            setOrders((prev) => prev.map((o) => ((o._id || o.id) === (updated._id || updated.id) ? { ...o, ...updated } : o)));
          }}
          onFinalizeDraft={handleFinalizeDraft}
          onDiscardDraft={handleDiscardDraft}
          draftActionId={draftActionId}
        />
      )}

      {/* Tax invoice */}
      {invoiceOrder && (
        <InvoiceModal order={invoiceOrder} company={company} onClose={() => setInvoiceOrder(null)} />
      )}

      {/* Create draft order */}
      {showDraftModal && (
        <DraftOrderModal
          onClose={() => setShowDraftModal(false)}
          onDraftCreated={() => { setShowDraftModal(false); loadOrders(); }}
        />
      )}
    </div>
  );
}
