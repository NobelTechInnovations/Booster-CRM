"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  PackageCheck,
  Truck,
  RefreshCcw,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertCircle,
  Send,
  MapPin,
  Building2,
  ShieldCheck,
  Box,
  X,
  Ban,
  Check,
  DollarSign,
  Info,
  FileDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listFulfillmentOrders,
  listFulfilledOrders,
  shipFulfillmentOrder,
  cancelFulfillmentOrder,
  cancelOrderShipment,
  syncShipmentStatus,
  shipFulfillmentOrdersBulk,
  downloadLabelsBulk,
  listShippingChannels,
  listWarehouses,
  listAllShipments,
  checkServiceability,
  linkWarehouse,
} from "@/lib/api";

// For providers (Velocity) with no "list warehouses" API — lets the user
// register a warehouse they already created on the provider's own dashboard
// by pasting its Warehouse ID, instead of getting stuck with no pickup
// location or an invented one that fails at ship time.
function LinkWarehouseModal({ provider, onClose, onLinked }) {
  const [form, setForm] = useState({
    externalWarehouseId: "", name: "", phone: "", email: "", contactPerson: "",
    address: "", city: "", state: "", zip: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await linkWarehouse(provider, form);
      onLinked(res.warehouse);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-lg border border-[var(--line)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
          <h2 className="text-base font-bold text-slate-900">Link an existing {provider} warehouse</h2>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="max-h-[75vh] space-y-3 overflow-y-auto px-5 py-4">
          <p className="rounded-md bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-800">
            {provider} has no API to list warehouses, so paste the Warehouse ID exactly as shown on your {provider} dashboard
            (e.g. <code className="font-mono">WHCOPY</code>) — we won't create a new one there.
          </p>
          <label className="block text-sm font-semibold text-slate-700">
            Warehouse ID (from {provider} dashboard) *
            <input required value={form.externalWarehouseId} onChange={(e) => setField("externalWarehouseId", e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" placeholder="WHCOPY" />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Warehouse name *
            <input required value={form.name} onChange={(e) => setField("name", e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" placeholder="Main Warehouse" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold text-slate-700">
              Contact person
              <input value={form.contactPerson} onChange={(e) => setField("contactPerson", e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Phone
              <input value={form.phone} onChange={(e) => setField("phone", e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </label>
          </div>
          <label className="block text-sm font-semibold text-slate-700">
            Email
            <input type="email" value={form.email} onChange={(e) => setField("email", e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Street address
            <input value={form.address} onChange={(e) => setField("address", e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm font-semibold text-slate-700">
              City
              <input value={form.city} onChange={(e) => setField("city", e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              State
              <input value={form.state} onChange={(e) => setField("state", e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              PIN
              <input value={form.zip} onChange={(e) => setField("zip", e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </label>
          </div>
          {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={saving}>{saving ? "Linking…" : "Link warehouse"}</Button>
        </form>
      </div>
    </div>
  );
}

// Assigns a batch of orders to a shipment in one action. Courier is left to
// the provider's automatic assignment per order (same as leaving a courier
// unpicked in the single-order flow) — asking for a rate confirmation on
// each of N orders one at a time would defeat the point of doing this in
// bulk. Shows a per-order result once done since a batch can partially fail
// (one order missing a PIN code, say) without blocking the rest.
function BulkShipModal({ orderCount, shippingChannels, warehouses, initialProvider, initialWarehouse, onClose, onSubmit }) {
  const [provider, setProvider] = useState(initialProvider || shippingChannels[0]?.provider || "");
  const providerWarehouses = warehouses.filter((w) => w.provider === provider);
  const [warehouseId, setWarehouseId] = useState(initialWarehouse || providerWarehouses[0]?.externalWarehouseId || "");
  const [isShipping, setIsShipping] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!providerWarehouses.some((w) => w.externalWarehouseId === warehouseId)) {
      setWarehouseId(providerWarehouses[0]?.externalWarehouseId || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  async function handleSubmit(e) {
    e.preventDefault();
    setIsShipping(true);
    setError("");
    try {
      const res = await onSubmit({ provider, warehouseId });
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsShipping(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={(e) => e.target === e.currentTarget && !isShipping && onClose()}>
      <div className="w-full max-w-md rounded-lg border border-[var(--line)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
          <h2 className="text-base font-bold text-slate-900">Bulk ship {orderCount} order{orderCount === 1 ? "" : "s"}</h2>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>

        {result ? (
          <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">{result.message}</p>
            {result.succeeded?.length ? (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">Shipped ({result.succeeded.length})</p>
                <div className="space-y-1">
                  {result.succeeded.map((s) => (
                    <div key={s.orderId} className="flex items-center justify-between rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs">
                      <span className="font-semibold text-emerald-900">{s.orderName}</span>
                      <span className="font-mono text-emerald-700">{s.awbCode}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {result.failed?.length ? (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-rose-700">Failed ({result.failed.length})</p>
                <div className="space-y-1">
                  {result.failed.map((f) => (
                    <div key={f.orderId} className="rounded-md bg-rose-50 px-2.5 py-1.5 text-xs text-rose-800">
                      <span className="font-semibold">{f.orderId}</span>: {f.error}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <Button className="w-full" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
            <p className="rounded-md bg-indigo-50 px-3 py-2 text-xs leading-5 text-indigo-800">
              Courier is auto-assigned per order by {provider || "the provider"}'s own rules — same as leaving courier unpicked when shipping one order.
            </p>
            <label className="block text-sm font-semibold text-slate-700">
              Shipping Channel
              <select value={provider} onChange={(e) => setProvider(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100">
                {shippingChannels.map((c) => <option key={c._id || c.id} value={c.provider}>{c.name || c.provider}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Pickup Warehouse
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" disabled={!providerWarehouses.length}>
                {providerWarehouses.length === 0 ? (
                  <option value="">No {provider} warehouses linked</option>
                ) : (
                  providerWarehouses.map((w) => <option key={w._id || w.externalWarehouseId} value={w.externalWarehouseId}>{w.name} ({w.address?.city || w.externalWarehouseId})</option>)
                )}
              </select>
            </label>
            {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={isShipping || !provider || !warehouseId}>
              {isShipping ? `Shipping ${orderCount} orders…` : `Ship ${orderCount} order${orderCount === 1 ? "" : "s"}`}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function CourierSelectModal({
  order,
  shippingChannels,
  warehouses,
  initialProvider,
  initialWarehouse,
  onClose,
  onShipped,
}) {
  const [provider, setProvider] = useState(initialProvider || shippingChannels[0]?.provider || "shipway");
  // Warehouse IDs are provider-specific (Shipway's don't mean anything to
  // Velocity and vice versa) — scope the picker to whichever channel is
  // selected in this modal, not the full cross-provider warehouse list.
  const providerWarehouses = warehouses.filter((w) => w.provider === provider);
  const [warehouseId, setWarehouseId] = useState(initialWarehouse || providerWarehouses[0]?.externalWarehouseId || "");
  const [destPin, setDestPin] = useState(
    order?.shippingAddress?.zip || order?.shippingAddress?.pincode || "302020",
  );
  const selectedWhObj = providerWarehouses.find((w) => String(w.externalWarehouseId) === String(warehouseId)) || providerWarehouses[0];

  // If the channel changes, the previously-selected warehouse ID almost
  // certainly belongs to a different provider — reset to that provider's
  // first warehouse instead of silently shipping against a mismatched ID.
  useEffect(() => {
    if (!providerWarehouses.some((w) => w.externalWarehouseId === warehouseId)) {
      setWarehouseId(providerWarehouses[0]?.externalWarehouseId || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);
  const [originPin, setOriginPin] = useState(
    selectedWhObj?.address?.zip || selectedWhObj?.raw?.pincode || "302020",
  );

  const [ratesLoading, setRatesLoading] = useState(false);
  const [courierOptions, setCourierOptions] = useState([]);
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [rateError, setRateError] = useState("");

  const [isShipping, setIsShipping] = useState(false);
  const [shipError, setShipError] = useState("");

  useEffect(() => {
    const wh = providerWarehouses.find((w) => String(w.externalWarehouseId) === String(warehouseId)) || providerWarehouses[0];
    if (wh) {
      setOriginPin(wh.address?.zip || wh.raw?.pincode || "302020");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, warehouses, provider]);

  async function fetchRates() {
    setRatesLoading(true);
    setRateError("");
    setCourierOptions([]);
    setSelectedCourier(null);

    const fromZip = String(originPin || "302020").replace(/\D/g, "") || "302020";
    const toZip = String(destPin || "302020").replace(/\D/g, "") || "302020";

    try {
      const res = await checkServiceability(provider, {
        from: fromZip,
        to: toZip,
        weight: 0.5,
        paymentMode: order?.isCOD ? "cod" : "prepaid",
        codAmount: order?.totalPrice || 0,
      });

      // Only ever show what the provider actually returned — no invented
      // rates, courier names, or ETDs when a field is missing. This used to
      // fabricate a plausible-looking price whenever `rate` was absent
      // (base 48-65 + made-up per-courier-name additions), and invented
      // entire fake couriers ("{provider} Express Delivery" etc, later
      // caught as "no company with this name") whenever parsing failed or
      // the request errored outright. A courier entry with no usable rate
      // is dropped rather than guessed; if the provider returns nothing
      // usable at all, that's shown as a real empty/error state below.
      const raw = res.result?.serviceability_results || res.data || res.courier_companies || res || [];
      const rawList = Array.isArray(raw) ? raw : (raw.available_couriers || raw.couriers || (typeof raw === "object" ? Object.values(raw) : []));

      const list = (Array.isArray(rawList) ? rawList : [])
        .map((c, index) => {
          const rate = Number(c.rate ?? c.freight_charge ?? c.total_charge ?? c.price);
          const name = c.carrier_name || c.courier_name || c.name;
          if (!name || !Number.isFinite(rate) || rate <= 0) return null; // incomplete entry — don't guess, don't show it

          return {
            courierId: String(c.carrier_id || c.id || c.courier_company_id || `carrier_${index}`),
            name,
            rate: Math.round(rate),
            ratePreGst: c.rate_pre_gst,
            gstAmount: c.gst_amount,
            etd: c.etd || c.estimated_delivery_days || c.expected_delivery_date || "",
            mode: c.mode || "",
            raw: c,
          };
        })
        .filter(Boolean);

      setCourierOptions(list);
      setSelectedCourier(list[0] || null);
      if (!list.length) {
        // res.reason carries a specific explanation when the provider itself said
        // why (e.g. Delhivery: "no service coverage for pincode X") — prefer that
        // real reason over a generic message when it's available.
        setRateError(res.reason || `${provider} returned no usable courier rate for this route. Try a different provider, or re-check the pickup/delivery PIN codes.`);
      }
    } catch (err) {
      setCourierOptions([]);
      setSelectedCourier(null);
      setRateError(err.message);
    } finally {
      setRatesLoading(false);
    }
  }

  useEffect(() => {
    if (provider && warehouseId) {
      fetchRates();
    }
  }, [provider, warehouseId]);

  async function handleConfirmShip() {
    setIsShipping(true);
    setShipError("");

    try {
      const res = await shipFulfillmentOrder({
        orderId: order.externalId || order.id || order._id,
        provider,
        warehouseId,
        courierId: selectedCourier?.courierId || undefined,
        options: {
          courierName: selectedCourier?.name,
          rate: selectedCourier?.rate,
        },
      });

      onShipped(res);
    } catch (err) {
      setShipError(err.message);
    } finally {
      setIsShipping(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-[var(--line)] w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)] bg-gradient-to-r from-indigo-50 to-white">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-700 text-white shrink-0">
              <Truck size={18} />
            </div>
            <div>
              <p className="font-bold text-slate-900 leading-tight">
                Ship Order {order?.name}
              </p>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Select Courier Partner & Rate for {order?.customerName}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto space-y-4 thin-scrollbar">
          {/* Controls: Shipping Channel & Pickup Warehouse */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Shipping Channel</label>
              <select
                className="w-full h-9 rounded-lg border border-[var(--line)] px-3 text-xs outline-none focus:border-indigo-700 bg-white font-medium"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                {shippingChannels.map((c) => (
                  <option key={c._id || c.id} value={c.provider}>
                    {c.name || c.provider}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Pickup Warehouse</label>
              <select
                className="w-full h-9 rounded-lg border border-[var(--line)] px-3 text-xs outline-none focus:border-indigo-700 bg-white font-medium"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                disabled={!providerWarehouses.length}
              >
                {providerWarehouses.length === 0 ? (
                  <option value="">No {provider} warehouses linked</option>
                ) : (
                  providerWarehouses.map((w) => (
                    <option key={w._id || w.externalWarehouseId} value={w.externalWarehouseId}>
                      {w.name} ({w.address?.city || w.externalWarehouseId})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* PIN Code controls */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Pickup PIN (Origin)</label>
              <input
                value={originPin}
                onChange={(e) => setOriginPin(e.target.value)}
                placeholder="Origin PIN"
                className="w-full h-8 px-2.5 rounded border border-slate-200 text-xs font-medium bg-white outline-none focus:border-indigo-700"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Delivery PIN (Destination)</label>
              <div className="flex items-center gap-1.5">
                <input
                  value={destPin}
                  onChange={(e) => setDestPin(e.target.value)}
                  placeholder="Delivery PIN"
                  className="w-full h-8 px-2.5 rounded border border-slate-200 text-xs font-medium bg-white outline-none focus:border-indigo-700"
                />
                <Badge tone={order?.isCOD ? "amber" : "green"}>
                  {order?.isCOD ? "COD" : "Prepaid"}
                </Badge>
              </div>
            </div>
          </div>

          {rateError && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {rateError}
            </p>
          )}

          {/* Rates list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-800">Available Courier Partners & Prices</span>
              <button onClick={fetchRates} disabled={ratesLoading} className="text-[11px] font-semibold text-indigo-700 hover:underline flex items-center gap-1">
                <RefreshCcw size={10} className={ratesLoading ? "animate-spin" : ""} />
                Re-check Rates
              </button>
            </div>

            {ratesLoading ? (
              <div className="py-8 text-center text-xs text-[var(--muted)]">
                Fetching courier rates across partners...
              </div>
            ) : (
              <div className="space-y-2">
                {courierOptions.map((option, idx) => {
                  const isChecked = selectedCourier?.courierId === option.courierId;
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedCourier(option)}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition ${
                        isChecked
                          ? "border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600"
                          : "border-[var(--line)] bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`grid h-5 w-5 place-items-center rounded-full border ${isChecked ? "border-indigo-700 bg-indigo-700 text-white" : "border-slate-300"}`}>
                          {isChecked && <Check size={12} />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">{option.name}</p>
                          <p className="text-[10px] text-[var(--muted)]">
                            Mode: {option.mode} • Est: {option.etd}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-indigo-800">₹{option.rate}</p>
                        <p className="text-[10px] text-[var(--muted)]">Freight Charge</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {shipError && (
            <p className="text-xs text-rose-600 font-medium bg-rose-50 border border-rose-200 rounded-lg p-2.5">
              {shipError}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--line)] px-5 py-3 bg-[var(--panel-soft)]">
          <button onClick={onClose} className="h-8 px-3 rounded-lg border border-[var(--line)] text-xs text-slate-600 hover:bg-slate-100 transition">
            Cancel
          </button>
          <button
            onClick={handleConfirmShip}
            disabled={isShipping || !selectedCourier}
            className="h-9 px-4 rounded-lg bg-indigo-700 text-xs font-semibold text-white hover:bg-indigo-800 transition disabled:opacity-50 flex items-center gap-1.5"
          >
            {isShipping ? <RefreshCcw size={13} className="animate-spin" /> : <Send size={13} />}
            Confirm & Create Shipment (₹{selectedCourier?.rate || "0"})
          </button>
        </div>
      </div>
    </div>
  );
}

export function FulfillmentView() {
  const [orders, setOrders] = useState([]);
  const [fulfilledOrders, setFulfilledOrders] = useState([]);
  const [shippingChannels, setShippingChannels] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [shipments, setShipments] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });

  const [activeTab, setActiveTab] = useState("toship"); // "toship", "fulfilled"
  const [filterMode, setFilterMode] = useState("all"); // "all", "cod", "prepaid"
  const [shippingOrder, setShippingOrder] = useState(null); // Order active in courier modal
  const [cancellingId, setCancellingId] = useState("");
  const [showLinkWarehouse, setShowLinkWarehouse] = useState(false);
  const [selectedToShipIds, setSelectedToShipIds] = useState(new Set());
  const [selectedFulfilledIds, setSelectedFulfilledIds] = useState(new Set());
  const [showBulkShip, setShowBulkShip] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  function dedup(rawOrders) {
    const seen = new Set();
    return rawOrders.filter((o) => {
      const key = String(o.externalId || o._id || o.id);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function loadData() {
    setIsLoading(true);
    setMessage({ type: "", text: "" });
    try {
      const [ordRes, fulfilledRes, chanRes, whRes, shipRes] = await Promise.all([
        listFulfillmentOrders(),
        listFulfilledOrders().catch(() => ({ orders: [] })),
        listShippingChannels(),
        listWarehouses(),
        listAllShipments(),
      ]);

      const loadedChannels = chanRes.channels || [];
      const loadedWarehouses = whRes.warehouses || [];

      setOrders(dedup(ordRes.orders || []));
      setFulfilledOrders(dedup(fulfilledRes.orders || []));
      setShippingChannels(loadedChannels);
      setWarehouses(loadedWarehouses);
      setShipments(shipRes.shipments || []);

      if (loadedChannels.length > 0 && !selectedProvider) {
        setSelectedProvider(loadedChannels[0].provider);
      }
      if (loadedWarehouses.length > 0 && !selectedWarehouse) {
        setSelectedWarehouse(loadedWarehouses[0].externalWarehouseId);
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const connectedProviders = shippingChannels.filter((c) => c.status === "connected");
  const filteredOrders = orders.filter((o) => {
    if (filterMode === "cod") return o.isCOD;
    if (filterMode === "prepaid") return !o.isCOD;
    return true;
  });

  // Each provider's warehouse IDs are only meaningful to that provider —
  // e.g. Shipway's "103722" means nothing to Velocity, and shipping against
  // the wrong one 404s as "Warehouse not found". Scope the dropdown to
  // whichever channel is currently selected instead of showing every
  // provider's warehouses mixed together.
  const providerWarehouses = warehouses.filter((w) => w.provider === selectedProvider);

  useEffect(() => {
    if (!providerWarehouses.length) {
      if (selectedWarehouse) setSelectedWarehouse("");
      return;
    }
    if (!providerWarehouses.some((w) => w.externalWarehouseId === selectedWarehouse)) {
      setSelectedWarehouse(providerWarehouses[0].externalWarehouseId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider, warehouses]);

  async function handleCancelOrder(order) {
    const orderIdToUse = order.externalId || order._id || order.id;
    if (!confirm(`Are you sure you want to cancel order ${order.name || orderIdToUse}?`)) return;

    setCancellingId(orderIdToUse);
    setMessage({ type: "", text: "" });

    try {
      const res = await cancelFulfillmentOrder(orderIdToUse);
      setMessage({ type: "success", text: res.message || `Order ${order.name} cancelled` });
      await loadData();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setCancellingId("");
    }
  }

  // Undoes just the shipment (courier + Shopify fulfillment) — the order
  // itself stays alive and drops back into "To Ship" so it can be assigned
  // again — e.g. via a different provider/warehouse, or because it was
  // actually shipped through another partner outside this panel. Does NOT
  // cancel anything with the courier or on Shopify — only clears our own
  // record of which shipment is assigned.
  async function handleCancelShipment(order) {
    const orderIdToUse = order.externalId || order._id || order.id;
    if (!confirm(`Unassign the shipment for ${order.name || orderIdToUse}? It moves back to "To Ship" so a shipment can be assigned again. This does NOT cancel anything with the courier or on Shopify.`)) return;

    setCancellingId(orderIdToUse);
    setMessage({ type: "", text: "" });

    try {
      const res = await cancelOrderShipment(orderIdToUse);
      setMessage({ type: "success", text: res.message || `Shipment for ${order.name} cancelled` });
      await loadData();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setCancellingId("");
    }
  }

  // Pulls live status from the courier right now — for when the shipment
  // was cancelled or its courier changed directly on the provider's own
  // dashboard and hasn't shown up here yet (the background job catches this
  // every 15 min, but this lets the user force it immediately).
  async function handleSyncShipmentStatus(order) {
    const orderIdToUse = order.externalId || order._id || order.id;
    setCancellingId(orderIdToUse);
    setMessage({ type: "", text: "" });

    try {
      const res = await syncShipmentStatus(orderIdToUse);
      setMessage({ type: res.cancelled ? "success" : "info", text: res.message });
      if (res.cancelled) await loadData();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setCancellingId("");
    }
  }

  function toggleToShipSelected(id) {
    setSelectedToShipIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleFulfilledSelected(id) {
    setSelectedFulfilledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleBulkDownloadLabels() {
    const shipmentIds = fulfilledOrders
      .filter((o) => selectedFulfilledIds.has(o.externalId || o._id || o.id) && o.shipmentId)
      .map((o) => o.shipmentId);

    if (!shipmentIds.length) {
      setMessage({ type: "error", text: "None of the selected orders have a shipment label to download." });
      return;
    }

    setBulkDownloading(true);
    setMessage({ type: "", text: "" });
    try {
      const { blob, skipped } = await downloadLabelsBulk(shipmentIds);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `labels-${shipmentIds.length - skipped.length}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setMessage({
        type: skipped.length ? "error" : "success",
        text: skipped.length
          ? `Downloaded ${shipmentIds.length - skipped.length} label(s). ${skipped.length} couldn't be fetched (label link may have expired) — try Sync Status on those first.`
          : `Downloaded ${shipmentIds.length} label(s) as one PDF.`,
      });
      setSelectedFulfilledIds(new Set());
      await loadData();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBulkDownloading(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      {/* Header */}
      <section className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Badge tone="indigo">Fulfillment</Badge>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-slate-950 md:text-4xl">
              Automated Fulfillment
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              Orders sync automatically from Shopify. Check courier rates and assign a partner in one click.
            </p>
          </div>
          <Button variant="outline" onClick={loadData} disabled={isLoading}>
            <RefreshCcw size={16} className={isLoading ? "animate-spin" : ""} />
            Refresh Orders
          </Button>
        </div>
      </section>

      {/* Tab bar */}
      <div className="mb-5 flex items-center gap-1 rounded-xl border border-[var(--line)] bg-slate-50 p-1 w-fit">
        <button
          onClick={() => setActiveTab("toship")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === "toship"
              ? "bg-indigo-700 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <PackageCheck size={15} />
          To Ship
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === "toship" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"}`}>
            {orders.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("fulfilled")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            activeTab === "fulfilled"
              ? "bg-emerald-700 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <CheckCircle size={15} />
          Fulfilled
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === "fulfilled" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"}`}>
            {fulfilledOrders.length}
          </span>
        </button>
      </div>

      {message.text ? (
        <div
          className={`mb-6 flex items-center gap-2 rounded-lg border p-4 text-sm font-medium ${
            message.type === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {message.type === "error" ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
          <span>{message.text}</span>
        </div>
      ) : null}

      {/* ── Fulfilled Tab ── */}
      {activeTab === "fulfilled" && (
        <Card>
          <CardHeader className="border-b pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <CheckCircle size={20} className="text-emerald-600" />
                  Fulfilled Orders
                </CardTitle>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Orders fulfilled via Shopify admin or shipped through our system.
                </p>
              </div>
              <Badge tone="green">{fulfilledOrders.length} Fulfilled</Badge>
            </div>
          </CardHeader>
          {fulfilledOrders.some((o) => o.shipmentId) ? (
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={fulfilledOrders.filter((o) => o.shipmentId).length > 0 && fulfilledOrders.filter((o) => o.shipmentId).every((o) => selectedFulfilledIds.has(o.externalId || o._id || o.id))}
                  onChange={(e) => {
                    const eligible = fulfilledOrders.filter((o) => o.shipmentId).map((o) => o.externalId || o._id || o.id);
                    setSelectedFulfilledIds(e.target.checked ? new Set(eligible) : new Set());
                  }}
                />
                Select all with a label ({fulfilledOrders.filter((o) => o.shipmentId).length})
              </label>
              {selectedFulfilledIds.size > 0 ? (
                <Button
                  size="sm"
                  className="h-8 bg-indigo-700 px-3 text-xs hover:bg-indigo-800"
                  disabled={bulkDownloading}
                  onClick={handleBulkDownloadLabels}
                >
                  <FileDown size={13} className="mr-1" />
                  {bulkDownloading ? "Merging…" : `Download Labels (${selectedFulfilledIds.size})`}
                </Button>
              ) : null}
            </div>
          ) : null}
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-[var(--muted)]">Loading...</div>
            ) : fulfilledOrders.length === 0 ? (
              <div className="p-12 text-center">
                <CheckCircle size={40} className="mx-auto mb-3 text-emerald-300" />
                <p className="font-semibold text-slate-700">No fulfilled orders yet</p>
                <p className="mt-1 text-sm text-[var(--muted)]">Orders fulfilled via Shopify or shipped through this panel will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {fulfilledOrders.map((order) => {
                  const addr = order.shippingAddress || {};
                  const orderId = order.externalId || order._id || order.id;
                  const orderKey = `fulfilled::${order.externalId || order._id}`;
                  return (
                    <div key={orderKey} className={cn("flex items-start gap-3 p-4 transition hover:bg-slate-50/80", selectedFulfilledIds.has(orderId) && "bg-indigo-50/50")}>
                      {order.shipmentId ? (
                        <input
                          type="checkbox"
                          className="mt-1.5 shrink-0"
                          checked={selectedFulfilledIds.has(orderId)}
                          onChange={() => toggleFulfilledSelected(orderId)}
                        />
                      ) : <span className="w-[13px] shrink-0" />}
                      <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-slate-900">{order.name}</span>
                            <Badge tone="green">Fulfilled</Badge>
                            <Badge tone={order.isCOD ? "amber" : "green"}>
                              {order.isCOD ? "COD" : "Prepaid"}
                            </Badge>
                            {order.shipmentId ? (
                              order.labelDownloaded ? (
                                <Badge tone="slate">Label downloaded</Badge>
                              ) : (
                                <Badge tone="amber">Label not downloaded</Badge>
                              )
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm font-medium text-slate-700">
                            {order.customerName || "Customer"} • {order.phone || order.email || ""}
                          </p>
                          <p className="mt-1 text-xs text-[var(--muted)] flex items-center gap-1">
                            <MapPin size={12} />
                            {[addr.address1, addr.city, addr.province, addr.zip].filter(Boolean).join(", ")}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {(order.lineItems || []).map((item, idx) => (
                              <span key={idx} className="rounded bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-xs text-emerald-700 font-medium">
                                {item.title} × {item.quantity}
                              </span>
                            ))}
                          </div>
                          {(order.awbCode || order.trackingNumber) && (
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                              Tracking: <span className="font-mono font-semibold">{order.awbCode || order.trackingNumber}</span>
                              {(order.shippingProvider || order.trackingCompany) && ` · ${order.shippingProvider || order.trackingCompany}`}
                              {(order.trackingUrl || order.labelUrl) && (
                                <a
                                  href={order.trackingUrl || order.labelUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline"
                                >
                                  Track <ExternalLink size={11} />
                                </a>
                              )}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-base font-bold text-slate-900">₹{order.totalPrice}</span>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {order.shopifyCreatedAt ? new Date(order.shopifyCreatedAt).toLocaleDateString("en-IN") : ""}
                          </p>
                          {order.awbCode ? (
                            <div className="mt-2 flex justify-end gap-1.5">
                              <Button
                                variant="secondary"
                                className="h-8 px-2.5 text-xs"
                                disabled={cancellingId === (order.externalId || order._id || order.id)}
                                onClick={() => handleSyncShipmentStatus(order)}
                                title="Check the courier's own dashboard right now instead of waiting for the 15-min background sync"
                              >
                                <RefreshCcw size={13} />
                                Sync Status
                              </Button>
                              <Button
                                variant="secondary"
                                className="h-8 px-2.5 text-xs"
                                disabled={cancellingId === (order.externalId || order._id || order.id)}
                                onClick={() => handleCancelShipment(order)}
                                title="Clears this order's assigned shipment in our panel only — doesn't cancel with the courier or on Shopify. Use when it was actually shipped through another partner."
                              >
                                <Ban size={13} />
                                Unassign Shipment
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── To Ship Tab ── */}
      {activeTab === "toship" && <>
      {/* Control Panel: Provider & Warehouse Selector */}
      <Card className="mb-6 border-slate-200 bg-slate-50/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Truck size={16} className="text-indigo-700" />
                Default Channel:
                <select
                  className="h-9 rounded-md border border-[var(--line)] bg-white px-3 text-sm font-medium shadow-sm outline-none focus:border-indigo-700"
                  value={selectedProvider}
                  onChange={(e) => setSelectedProvider(e.target.value)}
                  disabled={!connectedProviders.length}
                >
                  {connectedProviders.length === 0 ? (
                    <option value="">No shipping channels connected</option>
                  ) : (
                    connectedProviders.map((c) => (
                      <option key={c._id || c.id} value={c.provider}>
                        {c.name || c.provider}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Building2 size={16} className="text-indigo-700" />
                Pickup Warehouse:
                <select
                  className="h-9 rounded-md border border-[var(--line)] bg-white px-3 text-sm font-medium shadow-sm outline-none focus:border-indigo-700"
                  value={selectedWarehouse}
                  onChange={(e) => setSelectedWarehouse(e.target.value)}
                  disabled={!providerWarehouses.length}
                >
                  {providerWarehouses.length === 0 ? (
                    <option value="">No {selectedProvider || "warehouses"} synced</option>
                  ) : (
                    providerWarehouses.map((w) => (
                      <option key={w._id || w.externalWarehouseId} value={w.externalWarehouseId}>
                        {w.name} ({w.address?.city || w.externalWarehouseId})
                      </option>
                    ))
                  )}
                </select>
                {selectedProvider ? (
                  <button
                    type="button"
                    onClick={() => setShowLinkWarehouse(true)}
                    className="text-xs font-semibold text-indigo-700 underline decoration-dotted underline-offset-2 hover:text-indigo-900"
                    title="Register a warehouse you already created on the provider's own dashboard"
                  >
                    + Link
                  </button>
                ) : null}
              </label>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
              <button
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                  filterMode === "all" ? "bg-slate-950 text-white" : "text-slate-600 hover:text-slate-900"
                }`}
                onClick={() => setFilterMode("all")}
              >
                All Orders ({orders.length})
              </button>
              <button
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                  filterMode === "cod" ? "bg-amber-600 text-white" : "text-slate-600 hover:text-slate-900"
                }`}
                onClick={() => setFilterMode("cod")}
              >
                COD ({orders.filter((o) => o.isCOD).length})
              </button>
              <button
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                  filterMode === "prepaid" ? "bg-emerald-600 text-white" : "text-slate-600 hover:text-slate-900"
                }`}
                onClick={() => setFilterMode("prepaid")}
              >
                Prepaid ({orders.filter((o) => !o.isCOD).length})
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders Grid & Active Shipments */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Orders Pending Shipment (2 cols) */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
              <div>
                <CardTitle className="text-xl">Orders Ready to Ship</CardTitle>
                <p className="text-sm text-[var(--muted)]">Synced directly from Shopify orders</p>
              </div>
              <Badge tone="blue">{filteredOrders.length} Unfulfilled</Badge>
            </CardHeader>
            {filteredOrders.length > 0 ? (
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={filteredOrders.length > 0 && filteredOrders.every((o) => selectedToShipIds.has(o.externalId || o._id || o.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedToShipIds(new Set(filteredOrders.map((o) => o.externalId || o._id || o.id)));
                      } else {
                        setSelectedToShipIds(new Set());
                      }
                    }}
                  />
                  Select all ({filteredOrders.length})
                </label>
                {selectedToShipIds.size > 0 ? (
                  <Button
                    size="sm"
                    className="h-8 bg-indigo-700 px-3 text-xs hover:bg-indigo-800"
                    disabled={!connectedProviders.length}
                    onClick={() => setShowBulkShip(true)}
                  >
                    <Send size={13} className="mr-1" />
                    Bulk Ship ({selectedToShipIds.size})
                  </Button>
                ) : null}
              </div>
            ) : null}
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-sm text-[var(--muted)]">Loading orders...</div>
              ) : filteredOrders.length === 0 ? (
                <div className="p-12 text-center">
                  <Box size={40} className="mx-auto mb-3 text-slate-300" />
                  <p className="text-base font-semibold text-slate-800">No unfulfilled orders found</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    New orders placed on your Shopify store will automatically appear here via real-time webhooks.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredOrders.map((order) => {
                    const addr = order.shippingAddress || {};
                    const orderId = order.externalId || order._id || order.id;
                    const orderKey = `${order.channelId || order.provider || "order"}::${orderId}`;
                    const isCancelling = cancellingId === orderId;

                    return (
                      <div key={orderKey} className={cn("flex items-start gap-3 p-4 transition hover:bg-slate-50/80", selectedToShipIds.has(orderId) && "bg-indigo-50/50")}>
                        <input
                          type="checkbox"
                          className="mt-1.5 shrink-0"
                          checked={selectedToShipIds.has(orderId)}
                          onChange={() => toggleToShipSelected(orderId)}
                        />
                        <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-base font-bold text-slate-900">{order.name}</span>
                              <Badge tone={order.isCOD ? "amber" : "green"}>
                                {order.isCOD ? `COD (₹${order.codAmount || order.totalPrice})` : "Prepaid"}
                              </Badge>
                              <span className="text-xs text-[var(--muted)]">
                                {order.shopifyCreatedAt ? new Date(order.shopifyCreatedAt).toLocaleDateString("en-IN") : ""}
                              </span>
                            </div>

                            <p className="mt-1 text-sm font-medium text-slate-800">
                              {order.customerName || "Customer"} • {order.phone || order.email || "No contact"}
                            </p>

                            <p className="mt-1 text-xs text-[var(--muted)] flex items-center gap-1">
                              <MapPin size={12} className="text-slate-400" />
                              {[addr.address1, addr.city, addr.province, addr.zip].filter(Boolean).join(", ")}
                            </p>

                            {/* Line items snippet */}
                            <div className="mt-2 flex flex-wrap gap-1">
                              {(order.lineItems || []).map((item, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 font-medium"
                                >
                                  {item.title} × {item.quantity}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Order Actions */}
                          <div className="flex flex-col items-end gap-2">
                            <span className="text-base font-bold text-slate-900">₹{order.totalPrice}</span>
                            <div className="flex items-center gap-1.5">
                              <Button
                                disabled={isCancelling}
                                onClick={() => handleCancelOrder(order)}
                                size="sm"
                                variant="outline"
                                className="border-rose-200 text-rose-700 hover:bg-rose-50 text-xs h-8 px-2.5"
                              >
                                <Ban size={13} className="mr-1" />
                                Cancel
                              </Button>

                              <Button
                                disabled={!connectedProviders.length}
                                onClick={() => setShippingOrder(order)}
                                size="sm"
                                className="bg-indigo-700 hover:bg-indigo-800 text-white text-xs h-8 px-3"
                              >
                                <Send size={13} className="mr-1" />
                                Ship Order...
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Active & Recent Shipments (1 col) */}
        <div>
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-xl flex items-center justify-between">
                <span>Recent Shipments</span>
                <Truck size={18} className="text-indigo-700" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {shipments.length === 0 ? (
                <div className="p-6 text-center text-sm text-[var(--muted)]">No shipments created yet</div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                  {shipments.slice(0, 15).map((shipment) => (
                    <div key={shipment._id || shipment.id} className="p-4 text-xs">
                      <div className="flex items-center justify-between font-semibold text-slate-900">
                        <span>{shipment.shopifyOrderName || shipment.orderId || "Shipment"}</span>
                        <Badge tone={shipment.status === "awb_generated" ? "teal" : "blue"}>
                          {shipment.status}
                        </Badge>
                      </div>

                      <div className="mt-2 space-y-1 text-slate-600">
                        <p><span className="font-semibold text-slate-700">AWB:</span> {shipment.awbCode || "Pending"}</p>
                        <p><span className="font-semibold text-slate-700">Provider:</span> {shipment.provider}</p>
                        <p><span className="font-semibold text-slate-700">Customer:</span> {shipment.customerName}</p>
                        <p><span className="font-semibold text-slate-700">Destination:</span> {shipment.destination}</p>
                      </div>

                      {shipment.labelUrl ? (
                        <a
                          href={shipment.labelUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline"
                        >
                          <ExternalLink size={12} /> Print Label
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      </> /* end activeTab === "toship" */}

      {/* Courier Selection & Rate Check Modal */}
      {shippingOrder && (
        <CourierSelectModal
          order={shippingOrder}
          shippingChannels={connectedProviders}
          warehouses={warehouses}
          initialProvider={selectedProvider}
          initialWarehouse={selectedWarehouse}
          onClose={() => setShippingOrder(null)}
          onShipped={(res) => {
            setMessage({
              type: "success",
              text: res.message || `Shipped order ${shippingOrder.name} successfully`,
            });
            setShippingOrder(null);
            loadData();
          }}
        />
      )}

      {showLinkWarehouse && selectedProvider ? (
        <LinkWarehouseModal
          provider={selectedProvider}
          onClose={() => setShowLinkWarehouse(false)}
          onLinked={(warehouse) => {
            setMessage({ type: "success", text: `Warehouse "${warehouse.name}" linked` });
            setSelectedWarehouse(warehouse.externalWarehouseId);
            loadData();
          }}
        />
      ) : null}

      {showBulkShip ? (
        <BulkShipModal
          orderCount={selectedToShipIds.size}
          shippingChannels={connectedProviders}
          warehouses={warehouses}
          initialProvider={selectedProvider}
          initialWarehouse={selectedWarehouse}
          onClose={() => {
            setShowBulkShip(false);
            setSelectedToShipIds(new Set());
            loadData();
          }}
          onSubmit={async ({ provider, warehouseId }) => {
            const res = await shipFulfillmentOrdersBulk({ orderIds: [...selectedToShipIds], provider, warehouseId });
            return res;
          }}
        />
      ) : null}
    </div>
  );
}
