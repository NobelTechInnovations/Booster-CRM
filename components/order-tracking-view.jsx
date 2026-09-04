"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, MapPin, Package, Phone, Search, ShoppingBag, Truck } from "lucide-react";
import { getPublicCompanyBranding, listPublicOrdersByPhone, getPublicOrderDetail } from "@/lib/api";
import { formatMoney } from "@/lib/utils";

// Customer-friendly labels — deliberately different wording from the panel's
// own internal STAGE_META in orders-view.jsx (e.g. "fulfillment_assigned"
// reads as "Preparing your order" here, not ops jargon), and "declined"
// reads as a neutral "Under Review" rather than something that sounds
// alarming to a customer who has no context for why.
const PUBLIC_STAGE = {
  created: { label: "Order Placed", tone: "slate" },
  confirmed: { label: "Confirmed", tone: "blue" },
  declined: { label: "Under Review", tone: "amber" },
  fulfillment_assigned: { label: "Preparing Your Order", tone: "indigo" },
  shipped: { label: "Shipped", tone: "green" },
  delivered: { label: "Delivered", tone: "green" },
  returned: { label: "Returned", tone: "amber" },
  refunded: { label: "Refunded", tone: "amber" },
  cancelled: { label: "Cancelled", tone: "rose" },
};

const TONE_CLASS = {
  slate: "bg-slate-100 text-slate-700",
  blue: "bg-blue-100 text-blue-700",
  amber: "bg-amber-100 text-amber-800",
  indigo: "bg-indigo-100 text-indigo-700",
  green: "bg-emerald-100 text-emerald-700",
  rose: "bg-rose-100 text-rose-700",
};

function StageChip({ stage }) {
  const meta = PUBLIC_STAGE[stage] || PUBLIC_STAGE.created;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASS[meta.tone]}`}>{meta.label}</span>;
}

function fmtDate(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(date));
}

export function OrderTrackingView({ companySlug }) {
  const [phone, setPhone] = useState("");
  const [searchedPhone, setSearchedPhone] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeLogo, setStoreLogo] = useState("");
  const [orders, setOrders] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Loads the brand's own name/logo immediately on page load — before this,
  // the header showed a generic placeholder until a phone search returned
  // company info, so the page carried no real brand identity on first
  // paint. handleSearch's own setStoreName/setStoreLogo calls still run on
  // search too, but are redundant with this in practice (same values) —
  // harmless, and keeps that codepath working even if this fetch fails.
  useEffect(() => {
    getPublicCompanyBranding(companySlug)
      .then((res) => {
        setStoreName(res.company?.name || "");
        setStoreLogo(res.company?.logoUrl || "");
      })
      .catch(() => {}); // Not fatal — the header just falls back to the generic placeholder
  }, [companySlug]);

  async function handleSearch(e) {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setError("");
    setOrders(null);
    setSelectedOrder(null);
    try {
      const res = await listPublicOrdersByPhone(companySlug, phone.trim());
      setStoreName(res.company?.name || "");
      setStoreLogo(res.company?.logoUrl || "");
      setOrders(res.orders || []);
      setSearchedPhone(phone.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function openOrder(orderId) {
    setDetailLoading(true);
    setError("");
    try {
      const res = await getPublicOrderDetail(companySlug, orderId, searchedPhone);
      setSelectedOrder(res.order);
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="mb-6 text-center">
          {storeLogo ? (
            <img src={storeLogo} alt={storeName} className="mx-auto h-12 w-12 rounded-xl object-contain" />
          ) : (
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-indigo-700 text-white">
              <ShoppingBag size={22} />
            </div>
          )}
          <h1 className="mt-3 text-xl font-bold text-slate-900">{storeName || "Track Your Order"}</h1>
          <p className="mt-0.5 text-xs font-medium text-slate-400">Powered by Wokbook</p>
          <p className="mt-2 text-sm text-slate-500">Enter your phone number to see your orders</p>
        </div>

        {!selectedOrder && (
          <form onSubmit={handleSearch} className="mb-6 flex gap-2">
            <div className="relative flex-1">
              <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Your phone number"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !phone.trim()}
              className="flex h-11 items-center gap-1.5 rounded-xl bg-indigo-700 px-4 text-sm font-semibold text-white transition hover:bg-indigo-800 disabled:opacity-50"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              Track
            </button>
          </form>
        )}

        {error && (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        {/* Order list */}
        {!selectedOrder && orders && (
          orders.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <Package size={28} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">No orders found for this phone number</p>
              <p className="mt-1 text-xs text-slate-400">Check the number and try again</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => openOrder(order.id)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{order.name}</span>
                      <StageChip stage={order.stage} />
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {order.itemsPreview.join(", ")}{order.itemCount > order.itemsPreview.length ? "…" : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">{fmtDate(order.date)}</p>
                  </div>
                  <div className="ml-3 shrink-0 text-right">
                    <p className="text-sm font-bold text-slate-900">{formatMoney(order.totalPrice, order.currency)}</p>
                  </div>
                </button>
              ))}
            </div>
          )
        )}

        {/* Order detail */}
        {detailLoading && (
          <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-indigo-600" /></div>
        )}

        {selectedOrder && !detailLoading && (
          <div>
            <button
              onClick={() => setSelectedOrder(null)}
              className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:text-indigo-900"
            >
              <ArrowLeft size={15} /> Back to orders
            </button>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">{selectedOrder.name}</h2>
                <StageChip stage={selectedOrder.stage} />
              </div>
              <p className="mt-1 text-xs text-slate-400">Placed {fmtDate(selectedOrder.date)}</p>

              {(selectedOrder.trackingNumber) && (
                <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                  <div className="flex items-center gap-2 text-emerald-800">
                    <Truck size={15} />
                    <span className="text-xs font-semibold uppercase">{selectedOrder.trackingCompany || "Courier"}</span>
                  </div>
                  <p className="mt-1 font-mono text-sm text-slate-900">{selectedOrder.trackingNumber}</p>
                  {selectedOrder.trackingUrl && (
                    <a
                      href={selectedOrder.trackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900"
                    >
                      Track shipment <ExternalLink size={12} />
                    </a>
                  )}
                  {selectedOrder.stage === "delivered" && selectedOrder.deliveredAt && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                      <CheckCircle2 size={13} /> Delivered {fmtDate(selectedOrder.deliveredAt)}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 border-t border-slate-100 pt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Items</h3>
                <div className="space-y-2">
                  {selectedOrder.lineItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-800">{item.title}</p>
                        {item.variantTitle && item.variantTitle !== "Default Title" && (
                          <p className="text-xs text-slate-400">{item.variantTitle}</p>
                        )}
                      </div>
                      <p className="shrink-0 text-slate-600">{formatMoney(item.price)} × {item.quantity}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm font-bold text-slate-900">
                  <span>Total</span>
                  <span>{formatMoney(selectedOrder.totalPrice, selectedOrder.currency)}</span>
                </div>
                {selectedOrder.isCOD && (
                  <p className="mt-1 text-xs text-amber-700">Cash on Delivery — pay {formatMoney(selectedOrder.codAmount)} on arrival</p>
                )}
              </div>

              {selectedOrder.shippingAddress && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
                    <MapPin size={12} /> Delivery Address
                  </h3>
                  <p className="text-sm text-slate-700">
                    {selectedOrder.shippingAddress.name}<br />
                    {selectedOrder.shippingAddress.address1}
                    {selectedOrder.shippingAddress.address2 ? `, ${selectedOrder.shippingAddress.address2}` : ""}<br />
                    {[selectedOrder.shippingAddress.city, selectedOrder.shippingAddress.province, selectedOrder.shippingAddress.zip].filter(Boolean).join(", ")}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
