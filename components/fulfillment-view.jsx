"use client";

import { useState, useEffect } from "react";
import { PackageCheck, Truck, RefreshCcw, ExternalLink, CheckCircle, Clock, AlertCircle, Send, MapPin, Building2, ShieldCheck, Box } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listFulfillmentOrders,
  shipFulfillmentOrder,
  listShippingChannels,
  listWarehouses,
  listAllShipments,
} from "@/lib/api";

export function FulfillmentView() {
  const [orders, setOrders] = useState([]);
  const [shippingChannels, setShippingChannels] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [shipments, setShipments] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState("");
  const [isShipping, setIsShipping] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  const [filterMode, setFilterMode] = useState("all"); // "all", "cod", "prepaid"

  async function loadData() {
    setIsLoading(true);
    setMessage({ type: "", text: "" });
    try {
      const [ordRes, chanRes, whRes, shipRes] = await Promise.all([
        listFulfillmentOrders(),
        listShippingChannels(),
        listWarehouses(),
        listAllShipments(),
      ]);

      const loadedOrders = ordRes.orders || [];
      const loadedChannels = chanRes.channels || [];
      const loadedWarehouses = whRes.warehouses || [];

      setOrders(loadedOrders);
      setShippingChannels(loadedChannels);
      setWarehouses(loadedWarehouses);
      setShipments(shipRes.shipments || []);

      // Auto-select first shipping provider & warehouse
      if (loadedChannels.length > 0) {
        setSelectedProvider(loadedChannels[0].provider);
      }
      if (loadedWarehouses.length > 0) {
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

  async function handleShipOrder(order) {
    if (!selectedProvider) {
      setMessage({ type: "error", text: "Select a shipping provider first" });
      return;
    }

    setIsShipping(true);
    setMessage({ type: "", text: "" });

    try {
      const res = await shipFulfillmentOrder({
        orderId: order.externalId || order.id || order._id,
        provider: selectedProvider,
        warehouseId: selectedWarehouse,
      });

      setMessage({ type: "success", text: res.message || `Shipped order ${order.name} via ${selectedProvider}` });
      setSelectedOrder(null);
      await loadData();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setIsShipping(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      {/* Header */}
      <section className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Badge tone="teal">Production OMS</Badge>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-slate-950 md:text-4xl">
              Automated Fulfillment
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              Real-time Shopify orders synced automatically via webhooks. Fulfill in 1-click across Velocity, Shiprocket, or any connected provider with zero manual entry.
            </p>
          </div>
          <Button variant="outline" onClick={loadData} disabled={isLoading}>
            <RefreshCcw size={16} className={isLoading ? "animate-spin" : ""} />
            Refresh Orders
          </Button>
        </div>
      </section>

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

      {/* Control Panel: Provider & Warehouse Selector */}
      <Card className="mb-6 border-slate-200 bg-slate-50/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Truck size={16} className="text-teal-700" />
                Shipping Channel:
                <select
                  className="h-9 rounded-md border border-[var(--line)] bg-white px-3 text-sm font-medium shadow-sm outline-none focus:border-teal-700"
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
                <Building2 size={16} className="text-teal-700" />
                Pickup Warehouse:
                <select
                  className="h-9 rounded-md border border-[var(--line)] bg-white px-3 text-sm font-medium shadow-sm outline-none focus:border-teal-700"
                  value={selectedWarehouse}
                  onChange={(e) => setSelectedWarehouse(e.target.value)}
                  disabled={!warehouses.length}
                >
                  {warehouses.length === 0 ? (
                    <option value="">No warehouses synced</option>
                  ) : (
                    warehouses.map((w) => (
                      <option key={w._id || w.externalWarehouseId} value={w.externalWarehouseId}>
                        {w.name} ({w.address?.city || w.externalWarehouseId})
                      </option>
                    ))
                  )}
                </select>
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
                    const isSelected = selectedOrder?.externalId === order.externalId;

                    return (
                      <div
                        key={order.externalId || order.id}
                        className={`p-4 transition hover:bg-slate-50/80 ${
                          isSelected ? "bg-teal-50/40 border-l-4 border-l-teal-700" : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
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

                          {/* Quick Ship Action */}
                          <div className="flex flex-col items-end gap-2">
                            <span className="text-base font-bold text-slate-900">₹{order.totalPrice}</span>
                            <Button
                              disabled={isShipping || !connectedProviders.length}
                              onClick={() => handleShipOrder(order)}
                              size="sm"
                              className="bg-teal-700 hover:bg-teal-800 text-white"
                            >
                              <Send size={14} className="mr-1" />
                              Ship via {selectedProvider || "Provider"}
                            </Button>
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
                <Truck size={18} className="text-teal-700" />
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
                          className="mt-3 inline-flex items-center gap-1 font-semibold text-teal-700 hover:underline"
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
    </div>
  );
}
