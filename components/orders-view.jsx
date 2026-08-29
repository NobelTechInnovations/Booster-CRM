"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Box,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  Info,
  MapPin,
  Package,
  Phone,
  Printer,
  RefreshCcw,
  Repeat2,
  Search,
  ShoppingBag,
  Tag,
  Truck,
  User,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableSkeleton } from "@/components/ui/skeleton";
import { listAllOrders, getCompanyProfile } from "@/lib/api";
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

function statusTone(status) {
  const s = (status || "").toLowerCase();
  if (s === "fulfilled" || s === "shipped") return "green";
  if (s === "cancelled" || s === "canceled") return "rose";
  if (s === "unfulfilled" || s === "pending") return "amber";
  if (s === "partial") return "blue";
  return "slate";
}

function paymentTone(status) {
  const s = (status || "").toLowerCase();
  if (s === "paid") return "green";
  if (s === "refunded" || s === "voided") return "rose";
  if (s === "pending" || s === "partially_paid") return "amber";
  return "slate";
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
  const discount = Number(order.totalDiscounts || 0);

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
            <div>
              <span className="inline-block rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{brandWord}</span>
              <h1 className="mt-1.5 text-base font-bold leading-tight tracking-tight text-slate-950">{legalName}</h1>
              {gstin ? <p className="mt-0.5 text-[11px] font-medium text-slate-500">GSTIN {gstin}</p> : null}
              {registeredAddress ? <p className="mt-0.5 max-w-xs text-[11px] leading-4 text-slate-500">{registeredAddress}</p> : null}
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

            {/* Tax summary + total */}
            <div className="mt-3 flex justify-end">
              <div className="w-64 overflow-hidden rounded-md border border-slate-200">
                <div className="space-y-1 bg-slate-50 px-3 py-2 text-[11px]">
                  <div className="flex justify-between text-slate-500">
                    <span>Items Total</span><span className="font-medium text-slate-700">₹{itemsTotal.toFixed(2)}</span>
                  </div>
                  {discount > 0 ? (
                    <div className="flex justify-between text-slate-500">
                      <span>Discount</span><span className="font-medium text-rose-600">−₹{discount.toFixed(2)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-slate-500">
                    <span>Taxable Value</span><span className="font-medium text-slate-700">₹{taxableValue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>GST @ {gstRate}% (inclusive)</span><span className="font-medium text-slate-700">₹{taxAmount.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex items-baseline justify-between border-t border-slate-200 bg-slate-900 px-3 py-2">
                  <span className="text-[11px]  uppercase tracking-wide text-white">Grand Total</span>
                  <span className="text-base font-bold text-white">₹{total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <p className="mt-2.5 text-[9.5px] leading-4 text-slate-400">
              GST is calculated as inclusive within the item price, per standard Indian D2C pricing — the taxable value and GST
              amount above are the components within the total, not added on top of it.
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

function OrderDetailModal({ order, siblingOrders, onClose, onOpenOrder, onGenerateInvoice }) {
  if (!order) return null;

  const addr = order.shippingAddress || {};
  const lineItems = order.lineItems || order.line_items || [];
  const hasSiblings = siblingOrders && siblingOrders.length > 0;

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
                <Badge tone={statusTone(order.fulfillmentStatus)}>{order.fulfillmentStatus || "unfulfilled"}</Badge>
                <Badge tone={paymentTone(order.financialStatus)}>{order.financialStatus || "—"}</Badge>
                {order.isCOD && <Badge tone="amber">COD</Badge>}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Placed {fmt(order.shopifyCreatedAt)} · {order.provider || "Shopify"}
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
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase text-slate-500">Payment</p>
                  <p className="mt-0.5 font-semibold text-slate-700">{order.financialStatus || "—"}</p>
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
            </section>

            {/* Tracking */}
            {(order.trackingNumber || order.awbCode) && (
              <section className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Truck size={15} className="text-emerald-700" />
                  <h3 className="text-sm  text-slate-800">Tracking</h3>
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
              </section>
            )}
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
                {order.cancelledAt && (
                  <TimelineStep label="Cancelled" date={order.cancelledAt} done tone="rose" />
                )}
                {!order.cancelledAt && order.omsStatus && (
                  <TimelineStep
                    label={`Current status: ${order.omsStatus}`}
                    done={false}
                    tone="slate"
                  />
                )}
              </ol>
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-3 bg-slate-50">
          <p className="text-xs text-slate-400">
            Shopify ID: {order.externalId || "—"}
          </p>
          <button onClick={onClose} className="h-8 rounded-lg border border-[var(--line)] bg-white px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
            Close
          </button>
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

  useEffect(() => {
    getCompanyProfile().then((res) => setCompany(res.company)).catch(() => { });
  }, []);

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
        const fs = (o.fulfillmentStatus || "unfulfilled").toLowerCase();
        if (filterStatus === "fulfilled" && fs !== "fulfilled") return false;
        if (filterStatus === "unfulfilled" && fs !== "unfulfilled") return false;
        if (filterStatus === "cancelled" && !o.cancelledAt) return false;
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

  const counts = useMemo(() => ({
    total: orders.length,
    unfulfilled: orders.filter((o) => !["fulfilled", "partial"].includes((o.fulfillmentStatus || "").toLowerCase()) && !o.cancelledAt).length,
    fulfilled: orders.filter((o) => ["fulfilled", "partial"].includes((o.fulfillmentStatus || "").toLowerCase())).length,
    cancelled: orders.filter((o) => !!o.cancelledAt).length,
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
            {counts.total} total · {counts.unfulfilled} to ship · {counts.fulfilled} fulfilled
          </p>
        </div>
        <Button variant="secondary" onClick={loadOrders} disabled={isLoading}>
          <RefreshCcw size={15} className={isLoading ? "animate-spin" : ""} />
          Refresh
        </Button>
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
                { key: "unfulfilled", label: `Pending (${counts.unfulfilled})` },
                { key: "fulfilled", label: `Fulfilled (${counts.fulfilled})` },
                { key: "cancelled", label: `Cancelled (${counts.cancelled})` },
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

      {/* Error */}
      {error && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">
          <AlertCircle size={17} />
          {error}
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
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-slate-50 text-left text-[11px]  uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Fulfilment</th>
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
                        <Badge tone={statusTone(order.fulfillmentStatus)}>
                          {order.fulfillmentStatus || "unfulfilled"}
                        </Badge>
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
        />
      )}

      {/* Tax invoice */}
      {invoiceOrder && (
        <InvoiceModal order={invoiceOrder} company={company} onClose={() => setInvoiceOrder(null)} />
      )}
    </div>
  );
}
