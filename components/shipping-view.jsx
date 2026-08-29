"use client";

import { PackagePlus, PlugZap, RefreshCcw, Save, Search, Truck, CheckCircle2, Building2, MapPin, ExternalLink, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listShippingProviders,
  listShippingChannels,
  connectShippingProvider,
  syncWarehouses,
  listWarehouses,
  createWarehouse,
  checkServiceability,
  listAllShipments,
} from "@/lib/api";

const emptyWarehouseForm = {
  name: "",
  phone_number: "",
  email: "",
  gst_no: "",
  contact_person: "",
  address_attributes: { street_address: "", zip: "", city: "", state: "", country: "India" },
};

function Field({ label, value, onChange, type = "text", required = false, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
        type={type}
        value={value ?? ""}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ConnectProviderModal({ provider, onConnected, onClose }) {
  const [form, setForm] = useState({ username: "", password: "", email: "", apiKey: "", secretKey: "" });
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState("");

  async function handleConnect(e) {
    e.preventDefault();
    setIsConnecting(true);
    setError("");

    try {
      let payload = {};
      if (provider.provider === "shiprocket") {
        payload = { email: form.email || form.username, password: form.password };
      } else if (provider.provider === "shipway") {
        payload = { apiKey: form.apiKey, secretKey: form.secretKey };
      } else if (provider.provider === "shipmozo") {
        // The backend's ShipMozoProvider.connect() reads publicKey/privateKey
        // specifically (matching ShipMozo's own API field names) — sending
        // apiKey/apiSecret here left both undefined server-side, which always
        // fell through to "ShipMozo requires Public-Key & Private-Key or
        // Username & Password" regardless of what was typed into this form.
        payload = { publicKey: form.apiKey, privateKey: form.secretKey };
      } else {
        // velocity
        payload = { username: form.username, password: form.password };
      }

      await connectShippingProvider(provider.provider, payload);
      onConnected();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md bg-white shadow-xl">
        <CardHeader className="border-b">
          <CardTitle className="text-lg flex items-center gap-2">
            <Truck className="text-indigo-700" size={20} />
            Connect {provider.name}
          </CardTitle>
          <p className="text-xs text-[var(--muted)]">
            Authenticates with {provider.name} and automatically fetches all your existing pickup warehouses.
          </p>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleConnect} className="space-y-3">
            {provider.provider === "shiprocket" ? (
              <>
                <Field
                  label="Shiprocket API User Email"
                  value={form.email || form.username}
                  onChange={(val) => setForm({ ...form, email: val, username: val })}
                  required
                />
                <Field
                  label="API Password"
                  type="password"
                  value={form.password}
                  onChange={(password) => setForm({ ...form, password })}
                  required
                />
                <p className="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded border border-amber-200 leading-snug">
                  <strong>💡 OTP-Free Connection:</strong> Create an <strong>API User</strong> in Shiprocket Panel (<strong>Settings &rarr; API &rarr; Configure &rarr; Add New User</strong>) and enter its email &amp; password above.
                </p>
              </>
            ) : provider.provider === "shipway" ? (
              <>
                <Field
                  label="Shipway Account Email"
                  value={form.email || form.apiKey}
                  onChange={(val) => setForm({ ...form, email: val, apiKey: val })}
                  required
                />
                <Field
                  label="Shipway License Key"
                  type="password"
                  value={form.password || form.secretKey}
                  onChange={(val) => setForm({ ...form, password: val, secretKey: val })}
                  required
                />
                <p className="text-[11px] text-indigo-800 bg-indigo-50 p-2.5 rounded border border-indigo-200 leading-snug">
                  <strong>🔑 Finding License Key:</strong> In your Shipway Portal, go to <strong>Profile &rarr; Manage Profile</strong> to copy your License Key.
                </p>
              </>
            ) : provider.provider === "shipmozo" ? (
              <>
                <Field
                  label="ShipMozo API Key"
                  value={form.apiKey}
                  onChange={(apiKey) => setForm({ ...form, apiKey })}
                  required
                />
                <Field
                  label="ShipMozo Private Key"
                  value={form.secretKey}
                  onChange={(secretKey) => setForm({ ...form, secretKey })}
                  required
                />
              </>
            ) : (
              <>
                <Field
                  label={`${provider.name} Mobile Number / Username`}
                  value={form.username}
                  onChange={(username) => setForm({ ...form, username })}
                  required
                />
                <Field
                  label="Password"
                  type="password"
                  value={form.password}
                  onChange={(password) => setForm({ ...form, password })}
                  required
                />
              </>
            )}

            {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={isConnecting} className="bg-indigo-700 hover:bg-indigo-800 text-white">
                <PlugZap size={16} className="mr-1" />
                {isConnecting ? "Connecting & Syncing..." : "Connect & Auto-Sync"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function ShippingView() {
  const [providers, setProviders] = useState([]);
  const [channels, setChannels] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [shipments, setShipments] = useState([]);

  const [activeProviderModal, setActiveProviderModal] = useState(null);
  const [selectedProviderFilter, setSelectedProviderFilter] = useState("");
  const [targetCarrier, setTargetCarrier] = useState("");
  const [isSyncingWh, setIsSyncingWh] = useState(false);

  const [warehouseForm, setWarehouseForm] = useState(emptyWarehouseForm);
  const [isCreatingWh, setIsCreatingWh] = useState(false);
  const [whMessage, setWhMessage] = useState("");

  const [serviceCheck, setServiceCheck] = useState({ from: "", to: "", paymentMode: "cod" });
  const [serviceResults, setServiceResults] = useState(null);
  const [isCheckingService, setIsCheckingService] = useState(false);
  const [serviceError, setServiceError] = useState("");

  async function loadData() {
    try {
      const [provRes, chanRes, whRes, shipRes] = await Promise.all([
        listShippingProviders(),
        listShippingChannels(),
        listWarehouses(),
        listAllShipments(),
      ]);

      setProviders(provRes.providers || []);
      setChannels(chanRes.channels || []);
      setWarehouses(whRes.warehouses || []);
      setShipments(shipRes.shipments || []);
    } catch (err) {
      console.error("Failed loading shipping data:", err.message);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSyncWarehouses(providerName) {
    setIsSyncingWh(true);
    try {
      await syncWarehouses(providerName);
      await loadData();
    } catch (err) {
      alert(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncingWh(false);
    }
  }

  async function handleCreateWarehouse(e) {
    e.preventDefault();
    const providerToUse = targetCarrier || selectedProviderFilter || channels[0]?.provider || "velocity";
    setIsCreatingWh(true);
    setWhMessage("");

    try {
      await createWarehouse(providerToUse, warehouseForm);
      setWarehouseForm(emptyWarehouseForm);
      setWhMessage(`Warehouse registered successfully on ${providerToUse}`);
      await loadData();
    } catch (err) {
      setWhMessage(`Error: ${err.message}`);
    } finally {
      setIsCreatingWh(false);
    }
  }

  async function handleCheckServiceability(e) {
    e.preventDefault();
    setIsCheckingService(true);
    setServiceError("");
    setServiceResults(null);

    const connectedProviders = channels.filter((c) => c.status === "connected").map((c) => c.provider);
    const providersToTest = selectedProviderFilter
      ? [selectedProviderFilter]
      : connectedProviders.length
      ? connectedProviders
      : ["velocity"];

    try {
      const resultsMap = {};
      let anySuccess = false;
      const errors = [];

      await Promise.all(
        providersToTest.map(async (prov) => {
          try {
            const res = await checkServiceability(prov, serviceCheck);
            resultsMap[prov] = { success: true, data: res.result?.serviceability_results || res.data || res };
            anySuccess = true;
          } catch (err) {
            resultsMap[prov] = { success: false, error: err.message };
            errors.push(`${prov}: ${err.message}`);
          }
        }),
      );

      setServiceResults(resultsMap);
      if (!anySuccess && errors.length) {
        setServiceError(errors.join(" | "));
      }
    } catch (err) {
      setServiceError(err.message);
    } finally {
      setIsCheckingService(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1920px] px-4 py-6 lg:px-8">
      {/* Header */}
      <section className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Badge tone="indigo">Multi-Carrier Shipping Engine</Badge>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 md:text-[28px]">
            Shipping Channels & Logistics
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            Connect multiple shipping providers (Velocity, Shiprocket, Shipway, ShipMozo). Pickup warehouses are synced automatically — no duplicate data entry required.
          </p>
        </div>
      </section>

      {/* Connected Shipping Providers Banner */}
      <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {providers.map((p) => {
          const connected = channels.find((c) => c.provider === p.provider && c.status === "connected");

          return (
            <Card key={p.provider} className={`transition ${connected ? "border-indigo-500 bg-indigo-50/20" : "border-slate-200"}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900">{p.name}</h3>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {connected ? "Connected & Synced" : p.status === "available" ? "Ready to connect" : "Coming Soon"}
                    </p>
                  </div>
                  {connected ? (
                    <CheckCircle2 size={20} className="text-indigo-600" />
                  ) : (
                    <Truck size={20} className="text-slate-400" />
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between gap-2">
                  {connected ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSyncingWh}
                      onClick={() => handleSyncWarehouses(p.provider)}
                    >
                      <RefreshCcw size={14} className={isSyncingWh ? "animate-spin mr-1" : "mr-1"} />
                      Sync Warehouses
                    </Button>
                  ) : p.status === "available" ? (
                    <Button
                      size="sm"
                      onClick={() => setActiveProviderModal(p)}
                      className="bg-indigo-700 hover:bg-indigo-800 text-white"
                    >
                      <PlugZap size={14} className="mr-1" />
                      Connect {p.name}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled>
                      Coming Soon
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Active Modal */}
      {activeProviderModal ? (
        <ConnectProviderModal
          provider={activeProviderModal}
          onClose={() => setActiveProviderModal(null)}
          onConnected={() => {
            setActiveProviderModal(null);
            loadData();
          }}
        />
      ) : null}

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Warehouses Panel (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b pb-4 gap-3">
              <div>
                <CardTitle className="text-xl">Synced Pickup Warehouses</CardTitle>
                <p className="text-sm text-[var(--muted)]">Fetched directly from your connected shipping channels</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setSelectedProviderFilter("")}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${!selectedProviderFilter ? "bg-indigo-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  All ({warehouses.length})
                </button>
                {providers.map((p) => {
                  const count = warehouses.filter((w) => w.provider === p.provider).length;
                  return (
                    <button
                      key={p.provider}
                      onClick={() => setSelectedProviderFilter(p.provider)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${selectedProviderFilter === p.provider ? "bg-indigo-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    >
                      {p.name} ({count})
                    </button>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {warehouses.filter((w) => !selectedProviderFilter || w.provider === selectedProviderFilter).length === 0 ? (
                <div className="p-8 text-center text-sm text-[var(--muted)]">
                  No pickup warehouses found for {selectedProviderFilter ? selectedProviderFilter : "any connected channel"}. Click "Sync Warehouses" on a connected carrier above or register a location below.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border border-[var(--line)]">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Warehouse Name</th>
                        <th className="px-4 py-3">Carrier / Provider</th>
                        <th className="px-4 py-3">Location ID</th>
                        <th className="px-4 py-3">City / PIN</th>
                        <th className="px-4 py-3">Contact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {warehouses
                        .filter((w) => !selectedProviderFilter || w.provider === selectedProviderFilter)
                        .map((w) => (
                          <tr key={w._id || w.externalWarehouseId} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-slate-900 font-bold">{w.name}</td>
                            <td className="px-4 py-3">
                              <Badge tone={w.provider === "velocity" ? "teal" : w.provider === "shiprocket" ? "blue" : "purple"}>
                                {providers.find((p) => p.provider === w.provider)?.name || w.provider}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600 font-mono">{w.externalWarehouseId}</td>
                            <td className="px-4 py-3 text-slate-700">
                              {w.address?.city || "N/A"} ({w.address?.zip || "N/A"})
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-600">
                              {w.contactPerson || w.phone || "N/A"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add New Warehouse Form */}
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-lg">Register New Pickup Location</CardTitle>
              <p className="text-xs text-[var(--muted)]">Creates a new warehouse on your chosen shipping provider</p>
            </CardHeader>
            <CardContent className="p-4">
              <form onSubmit={handleCreateWarehouse} className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700">Shipping Carrier / Channel</label>
                  <select
                    value={targetCarrier || (channels[0]?.provider || "velocity")}
                    onChange={(e) => setTargetCarrier(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
                  >
                    {channels.map((c) => (
                      <option key={c.provider} value={c.provider}>
                        {providers.find((p) => p.provider === c.provider)?.name || c.name || c.provider} ({c.status === "connected" ? "Connected" : "Disconnected"})
                      </option>
                    ))}
                    {channels.length === 0 && (
                      <>
                        <option value="velocity">Velocity Shipping</option>
                        <option value="shipway">Shipway</option>
                        <option value="shipmozo">ShipMozo</option>
                        <option value="shiprocket">Shiprocket</option>
                      </>
                    )}
                  </select>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Select which shipping carrier (Velocity, Shipway, ShipMozo, Shiprocket) this pickup warehouse belongs to.
                  </p>
                </div>
                <Field
                  label="Warehouse Name"
                  value={warehouseForm.name}
                  onChange={(name) => setWarehouseForm({ ...warehouseForm, name })}
                  required
                />
                <Field
                  label="Contact Phone"
                  value={warehouseForm.phone_number}
                  onChange={(phone_number) => setWarehouseForm({ ...warehouseForm, phone_number })}
                  required
                />
                <Field
                  label="Contact Email"
                  value={warehouseForm.email}
                  onChange={(email) => setWarehouseForm({ ...warehouseForm, email })}
                  required
                />
                <Field
                  label="Contact Person"
                  value={warehouseForm.contact_person}
                  onChange={(contact_person) => setWarehouseForm({ ...warehouseForm, contact_person })}
                  required
                />
                <Field
                  label="Street Address"
                  className="sm:col-span-2"
                  value={warehouseForm.address_attributes.street_address}
                  onChange={(street_address) =>
                    setWarehouseForm({
                      ...warehouseForm,
                      address_attributes: { ...warehouseForm.address_attributes, street_address },
                    })
                  }
                  required
                />
                <Field
                  label="City"
                  value={warehouseForm.address_attributes.city}
                  onChange={(city) =>
                    setWarehouseForm({
                      ...warehouseForm,
                      address_attributes: { ...warehouseForm.address_attributes, city },
                    })
                  }
                  required
                />
                <Field
                  label="State"
                  value={warehouseForm.address_attributes.state}
                  onChange={(state) =>
                    setWarehouseForm({
                      ...warehouseForm,
                      address_attributes: { ...warehouseForm.address_attributes, state },
                    })
                  }
                  required
                />
                <Field
                  label="PIN Code"
                  value={warehouseForm.address_attributes.zip}
                  onChange={(zip) =>
                    setWarehouseForm({
                      ...warehouseForm,
                      address_attributes: { ...warehouseForm.address_attributes, zip },
                    })
                  }
                  required
                />
                <div className="sm:col-span-2 pt-2">
                  <Button disabled={isCreatingWh} className="bg-indigo-700 hover:bg-indigo-800 text-white">
                    <Save size={16} className="mr-1" />
                    {isCreatingWh ? "Creating..." : "Create Warehouse on Provider"}
                  </Button>
                </div>
                {whMessage ? <p className="text-xs font-semibold text-indigo-800 sm:col-span-2">{whMessage}</p> : null}
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Serviceability Checker */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Check Serviceability</span>
                <Search size={18} className="text-indigo-700" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <form onSubmit={handleCheckServiceability} className="space-y-3">
                <Field
                  label="Pickup PIN Code"
                  value={serviceCheck.from}
                  onChange={(from) => setServiceCheck({ ...serviceCheck, from })}
                  required
                />
                <Field
                  label="Destination PIN Code"
                  value={serviceCheck.to}
                  onChange={(to) => setServiceCheck({ ...serviceCheck, to })}
                  required
                />

                <div className="flex gap-2 pt-1">
                  <Button disabled={isCheckingService} className="w-full bg-slate-900 text-white">
                    {isCheckingService ? "Checking..." : "Check Couriers"}
                  </Button>
                </div>
              </form>

              {serviceError ? <p className="mt-3 text-xs text-rose-600 font-medium">{serviceError}</p> : null}

              {serviceResults ? (
                <div className="mt-4 max-h-72 overflow-y-auto rounded-md border p-3 text-xs space-y-3 bg-slate-50">
                  <p className="font-bold text-slate-900 border-b pb-1">Serviceability Results ({Object.keys(serviceResults).length} Carrier{Object.keys(serviceResults).length > 1 ? "s" : ""}):</p>
                  {Object.entries(serviceResults).map(([provKey, resItem]) => (
                    <div key={provKey} className="rounded border bg-white p-2.5 shadow-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold uppercase text-[11px] text-indigo-800">{provKey}</span>
                        {resItem.success ? (
                          <Badge tone="indigo" className="text-[10px]">Serviceable</Badge>
                        ) : (
                          <Badge tone="amber" className="text-[10px]">Error</Badge>
                        )}
                      </div>
                      {resItem.success ? (
                        <pre className="mt-1 text-[10px] text-slate-700 font-mono whitespace-pre-wrap max-h-36 overflow-y-auto bg-slate-100 p-1.5 rounded">
                          {JSON.stringify(resItem.data, null, 2)}
                        </pre>
                      ) : (
                        <p className="text-[11px] text-rose-600 font-medium">{resItem.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
