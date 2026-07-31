"use client";

import { PackagePlus, PlugZap, RefreshCcw, Save, Search, Truck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cancelVelocityOrder,
  checkVelocityServiceability,
  connectVelocity,
  createVelocityForwardOrder,
  createVelocityWarehouse,
  listChannels,
  listVelocityShipments,
  listVelocityWarehouses,
  trackVelocityOrder,
} from "@/lib/api";

const emptyWarehouseForm = {
  name: "",
  phone_number: "",
  email: "",
  gst_no: "",
  contact_person: "",
  address_attributes: { street_address: "", zip: "", city: "", state: "", country: "India" },
};

function emptyOrderForm() {
  return {
    order_id: `ORDER-${Date.now()}`,
    order_date: new Date().toISOString().slice(0, 16).replace("T", " "),
    warehouse_id: "",
    billing_customer_name: "",
    billing_last_name: "",
    billing_address: "",
    billing_city: "",
    billing_state: "",
    billing_pincode: "",
    billing_country: "India",
    billing_email: "",
    billing_phone: "",
    payment_method: "COD",
    sub_total: "",
    cod_collectible: "",
    length: "",
    breadth: "",
    height: "",
    weight: "",
    carrier_id: "",
    items: [{ name: "", sku: "", units: "1", selling_price: "", discount: "0", tax: "0" }],
  };
}

function PageShell({ title, subtitle, children }) {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
      <section className="mb-6">
        <Badge tone="teal">Phase 10</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-normal text-slate-950 md:text-4xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)] md:text-base">{subtitle}</p>
      </section>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required = false, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-semibold">{label}</span>
      <input
        className="mt-2 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
        type={type}
        value={value ?? ""}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ConnectVelocityForm({ onConnected }) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState("");

  async function handleConnect(event) {
    event.preventDefault();
    setIsConnecting(true);
    setError("");

    try {
      await connectVelocity(form);
      onConnected();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Connect Velocity Shipping</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Sign in once with your Velocity Shipping account. The panel stores the session and refreshes it automatically, so
            you never need to log in to Velocity again.
          </p>
        </div>
        <Truck className="text-teal-700" size={22} />
      </CardHeader>
      <CardContent>
        <form className="grid max-w-md gap-4" onSubmit={handleConnect}>
          <Field
            label="Velocity mobile number"
            value={form.username}
            onChange={(username) => setForm({ ...form, username })}
            required
          />
          <Field
            label="Velocity password"
            type="password"
            value={form.password}
            onChange={(password) => setForm({ ...form, password })}
            required
          />
          <Button disabled={isConnecting}>
            <PlugZap size={16} />
            {isConnecting ? "Connecting" : "Connect Velocity"}
          </Button>
          {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}

function WarehousePanel({ warehouses, onCreated }) {
  const [form, setForm] = useState(emptyWarehouseForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleCreate(event) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      await createVelocityWarehouse(form);
      setForm(emptyWarehouseForm);
      setMessage("Warehouse created");
      onCreated();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Pickup Warehouses</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">Register pickup locations with Velocity Shipping.</p>
        </div>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleCreate}>
          <Field label="Warehouse name" value={form.name} onChange={(name) => setForm({ ...form, name })} required />
          <Field
            label="Contact phone"
            value={form.phone_number}
            onChange={(phone_number) => setForm({ ...form, phone_number })}
            required
          />
          <Field label="Contact email" value={form.email} onChange={(email) => setForm({ ...form, email })} required />
          <Field
            label="Contact person"
            value={form.contact_person}
            onChange={(contact_person) => setForm({ ...form, contact_person })}
            required
          />
          <Field label="GST number (optional)" value={form.gst_no} onChange={(gst_no) => setForm({ ...form, gst_no })} />
          <Field
            label="Street address"
            className="sm:col-span-2"
            value={form.address_attributes.street_address}
            onChange={(street_address) =>
              setForm({ ...form, address_attributes: { ...form.address_attributes, street_address } })
            }
            required
          />
          <Field
            label="City"
            value={form.address_attributes.city}
            onChange={(city) => setForm({ ...form, address_attributes: { ...form.address_attributes, city } })}
            required
          />
          <Field
            label="State"
            value={form.address_attributes.state}
            onChange={(state) => setForm({ ...form, address_attributes: { ...form.address_attributes, state } })}
            required
          />
          <Field
            label="PIN code"
            value={form.address_attributes.zip}
            onChange={(zip) => setForm({ ...form, address_attributes: { ...form.address_attributes, zip } })}
            required
          />
          <Field
            label="Country"
            value={form.address_attributes.country}
            onChange={(country) => setForm({ ...form, address_attributes: { ...form.address_attributes, country } })}
            required
          />
          <div className="sm:col-span-2">
            <Button disabled={isSaving}>
              <Save size={16} />
              {isSaving ? "Creating" : "Create Warehouse"}
            </Button>
          </div>
          {message ? <p className="text-sm font-medium text-emerald-700 sm:col-span-2">{message}</p> : null}
          {error ? <p className="text-sm font-medium text-rose-700 sm:col-span-2">{error}</p> : null}
        </form>

        {warehouses.length ? (
          <div className="mt-6 overflow-x-auto rounded-md border border-[var(--line)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--panel-soft)] text-xs font-semibold uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Warehouse ID</th>
                  <th className="px-3 py-2">City</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {warehouses.map((warehouse) => (
                  <tr key={warehouse.warehouseId}>
                    <td className="px-3 py-2 font-medium">{warehouse.name}</td>
                    <td className="px-3 py-2">{warehouse.warehouseId}</td>
                    <td className="px-3 py-2">{warehouse.address?.city}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--muted)]">No warehouses yet. Create one to start shipping.</p>
        )}
      </CardContent>
    </Card>
  );
}

function CreateShipmentPanel({ warehouses, onCreated }) {
  const [form, setForm] = useState(emptyOrderForm);
  const [isChecking, setIsChecking] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [couriers, setCouriers] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function updateItem(index, field, value) {
    const items = form.items.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item));
    setForm({ ...form, items });
  }

  function addItem() {
    setForm({ ...form, items: [...form.items, { name: "", sku: "", units: "1", selling_price: "", discount: "0", tax: "0" }] });
  }

  function removeItem(index) {
    setForm({ ...form, items: form.items.filter((_, itemIndex) => itemIndex !== index) });
  }

  const selectedWarehouse = warehouses.find((warehouse) => warehouse.warehouseId === form.warehouse_id);

  async function handleServiceability() {
    setIsChecking(true);
    setError("");
    setCouriers(null);

    try {
      if (!selectedWarehouse?.address?.zip) {
        throw new Error("Select a warehouse with a PIN code first");
      }
      if (!form.billing_pincode) {
        throw new Error("Enter the destination PIN code first");
      }

      const result = await checkVelocityServiceability({
        from: selectedWarehouse.address.zip,
        to: form.billing_pincode,
        payment_mode: form.payment_method === "COD" ? "cod" : "prepaid",
        shipment_type: "forward",
      });

      setCouriers(result.result?.serviceability_results || []);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setIsChecking(false);
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    setIsCreating(true);
    setError("");
    setMessage("");

    try {
      const subTotal = form.items.reduce(
        (total, item) => total + (Number(item.units || 0) * Number(item.selling_price || 0) - Number(item.discount || 0)),
        0,
      );

      const payload = {
        order_id: form.order_id,
        order_date: form.order_date,
        carrier_id: form.carrier_id || undefined,
        billing_customer_name: form.billing_customer_name,
        billing_last_name: form.billing_last_name,
        billing_address: form.billing_address,
        billing_city: form.billing_city,
        billing_state: form.billing_state,
        billing_pincode: form.billing_pincode,
        billing_country: form.billing_country,
        billing_email: form.billing_email,
        billing_phone: form.billing_phone,
        shipping_is_billing: true,
        print_label: true,
        order_items: form.items.map((item) => ({
          name: item.name,
          sku: item.sku,
          units: Number(item.units || 0),
          selling_price: Number(item.selling_price || 0),
          discount: Number(item.discount || 0),
          tax: Number(item.tax || 0),
        })),
        payment_method: form.payment_method,
        sub_total: form.sub_total ? Number(form.sub_total) : subTotal,
        cod_collectible: form.payment_method === "COD" ? Number(form.cod_collectible || form.sub_total || subTotal) : 0,
        length: Number(form.length || 0),
        breadth: Number(form.breadth || 0),
        height: Number(form.height || 0),
        weight: Number(form.weight || 0),
        pickup_location: selectedWarehouse?.name || "",
        warehouse_id: form.warehouse_id,
      };

      await createVelocityForwardOrder(payload);
      setMessage(`Shipment created for ${form.order_id}`);
      setForm(emptyOrderForm());
      setCouriers(null);
      onCreated();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Create Shipment</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Check serviceability, then create and manifest the order. Courier is auto-assigned unless you pick one below.
          </p>
        </div>
        <PackagePlus className="text-teal-700" size={22} />
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleCreate}>
          <Field label="Order ID" value={form.order_id} onChange={(order_id) => setForm({ ...form, order_id })} required />
          <label className="block">
            <span className="text-sm font-semibold">Pickup warehouse</span>
            <select
              className="mt-2 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
              value={form.warehouse_id}
              onChange={(event) => setForm({ ...form, warehouse_id: event.target.value })}
              required
            >
              <option value="">Select warehouse</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.warehouseId} value={warehouse.warehouseId}>
                  {warehouse.name} ({warehouse.warehouseId})
                </option>
              ))}
            </select>
          </label>

          <Field
            label="Customer first name"
            value={form.billing_customer_name}
            onChange={(billing_customer_name) => setForm({ ...form, billing_customer_name })}
            required
          />
          <Field
            label="Customer last name"
            value={form.billing_last_name}
            onChange={(billing_last_name) => setForm({ ...form, billing_last_name })}
          />
          <Field
            label="Address"
            className="sm:col-span-2"
            value={form.billing_address}
            onChange={(billing_address) => setForm({ ...form, billing_address })}
            required
          />
          <Field label="City" value={form.billing_city} onChange={(billing_city) => setForm({ ...form, billing_city })} required />
          <Field
            label="State"
            value={form.billing_state}
            onChange={(billing_state) => setForm({ ...form, billing_state })}
            required
          />
          <Field
            label="PIN code"
            value={form.billing_pincode}
            onChange={(billing_pincode) => setForm({ ...form, billing_pincode })}
            required
          />
          <Field
            label="Country"
            value={form.billing_country}
            onChange={(billing_country) => setForm({ ...form, billing_country })}
          />
          <Field label="Phone" value={form.billing_phone} onChange={(billing_phone) => setForm({ ...form, billing_phone })} required />
          <Field label="Email (optional)" value={form.billing_email} onChange={(billing_email) => setForm({ ...form, billing_email })} />

          <label className="block">
            <span className="text-sm font-semibold">Payment method</span>
            <select
              className="mt-2 h-10 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
              value={form.payment_method}
              onChange={(event) => setForm({ ...form, payment_method: event.target.value })}
            >
              <option value="COD">Cash on Delivery</option>
              <option value="PREPAID">Prepaid</option>
            </select>
          </label>
          {form.payment_method === "COD" ? (
            <Field
              label="COD amount to collect"
              value={form.cod_collectible}
              onChange={(cod_collectible) => setForm({ ...form, cod_collectible })}
            />
          ) : (
            <div />
          )}

          <Field label="Length (cm)" value={form.length} onChange={(length) => setForm({ ...form, length })} required />
          <Field label="Breadth (cm)" value={form.breadth} onChange={(breadth) => setForm({ ...form, breadth })} required />
          <Field label="Height (cm)" value={form.height} onChange={(height) => setForm({ ...form, height })} required />
          <Field label="Weight (kg)" value={form.weight} onChange={(weight) => setForm({ ...form, weight })} required />

          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-semibold">Items</p>
            <div className="space-y-2">
              {form.items.map((item, index) => (
                <div key={index} className="grid grid-cols-2 gap-2 rounded-md border border-[var(--line)] p-3 sm:grid-cols-6">
                  <input
                    className="h-9 rounded-md border border-[var(--line)] px-2 text-sm sm:col-span-2"
                    placeholder="Item name"
                    value={item.name}
                    onChange={(event) => updateItem(index, "name", event.target.value)}
                  />
                  <input
                    className="h-9 rounded-md border border-[var(--line)] px-2 text-sm"
                    placeholder="SKU"
                    value={item.sku}
                    onChange={(event) => updateItem(index, "sku", event.target.value)}
                  />
                  <input
                    className="h-9 rounded-md border border-[var(--line)] px-2 text-sm"
                    placeholder="Units"
                    value={item.units}
                    onChange={(event) => updateItem(index, "units", event.target.value)}
                  />
                  <input
                    className="h-9 rounded-md border border-[var(--line)] px-2 text-sm"
                    placeholder="Price"
                    value={item.selling_price}
                    onChange={(event) => updateItem(index, "selling_price", event.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <input
                      className="h-9 w-full rounded-md border border-[var(--line)] px-2 text-sm"
                      placeholder="Discount"
                      value={item.discount}
                      onChange={(event) => updateItem(index, "discount", event.target.value)}
                    />
                    {form.items.length > 1 ? (
                      <button type="button" onClick={() => removeItem(index)} className="text-rose-600">
                        <XCircle size={18} />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="secondary" className="mt-2" onClick={addItem}>
              Add item
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Button type="button" variant="secondary" onClick={handleServiceability} disabled={isChecking}>
              <Search size={16} />
              {isChecking ? "Checking" : "Check Serviceability"}
            </Button>
            {couriers ? (
              <label className="block">
                <select
                  className="h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm"
                  value={form.carrier_id}
                  onChange={(event) => setForm({ ...form, carrier_id: event.target.value })}
                >
                  <option value="">Auto-assign courier</option>
                  {couriers.map((courier) => (
                    <option key={courier.carrier_id} value={courier.carrier_id}>
                      {courier.carrier_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="sm:col-span-2">
            <Button disabled={isCreating}>
              <Truck size={16} />
              {isCreating ? "Creating shipment" : "Create Shipment"}
            </Button>
          </div>

          {message ? <p className="text-sm font-medium text-emerald-700 sm:col-span-2">{message}</p> : null}
          {error ? <p className="text-sm font-medium text-rose-700 sm:col-span-2">{error}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}

function ShipmentsTable({ shipments, onRefresh }) {
  const [busyAwb, setBusyAwb] = useState("");
  const [error, setError] = useState("");

  async function handleTrack(awbCode) {
    setBusyAwb(awbCode);
    setError("");
    try {
      await trackVelocityOrder([awbCode]);
      onRefresh();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusyAwb("");
    }
  }

  async function handleCancel(awbCode) {
    setBusyAwb(awbCode);
    setError("");
    try {
      await cancelVelocityOrder([awbCode]);
      onRefresh();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusyAwb("");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Shipments</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">All Velocity Shipping orders created from this panel.</p>
        </div>
        <Button variant="secondary" onClick={onRefresh}>
          <RefreshCcw size={16} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {error ? <p className="mb-3 text-sm font-medium text-rose-700">{error}</p> : null}
        {shipments.length ? (
          <div className="overflow-x-auto rounded-md border border-[var(--line)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--panel-soft)] text-xs font-semibold uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2">Order ID</th>
                  <th className="px-3 py-2">AWB</th>
                  <th className="px-3 py-2">Courier</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Payment</th>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {shipments.map((shipment) => (
                  <tr key={shipment._id || shipment.awbCode}>
                    <td className="px-3 py-2 font-medium">{shipment.orderId}</td>
                    <td className="px-3 py-2">{shipment.awbCode || "-"}</td>
                    <td className="px-3 py-2">{shipment.courierName || "-"}</td>
                    <td className="px-3 py-2">
                      <Badge tone={shipment.trackingStatus === "delivered" ? "green" : shipment.status === "cancel_requested" ? "rose" : "blue"}>
                        {shipment.trackingStatus || shipment.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {shipment.paymentMethod} {shipment.codAmount ? `- ₹${shipment.codAmount}` : ""}
                    </td>
                    <td className="px-3 py-2">
                      {shipment.labelUrl ? (
                        <a href={shipment.labelUrl} target="_blank" rel="noreferrer" className="text-teal-700 underline">
                          Label
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          className="h-8 px-2 text-xs"
                          disabled={!shipment.awbCode || busyAwb === shipment.awbCode}
                          onClick={() => handleTrack(shipment.awbCode)}
                        >
                          Track
                        </Button>
                        <Button
                          variant="secondary"
                          className="h-8 px-2 text-xs text-rose-700"
                          disabled={!shipment.awbCode || busyAwb === shipment.awbCode}
                          onClick={() => handleCancel(shipment.awbCode)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">No shipments created yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function ShippingView() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [error, setError] = useState("");

  async function refreshWarehouses() {
    const result = await listVelocityWarehouses();
    setWarehouses(result.warehouses || []);
  }

  async function refreshShipments() {
    const result = await listVelocityShipments();
    setShipments(result.shipments || []);
  }

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const channelsResult = await listChannels();
      const velocityChannel = (channelsResult.channels || []).find((channel) => channel.provider === "velocity");
      const isConnected = Boolean(velocityChannel && velocityChannel.status === "connected");
      setConnected(isConnected);

      if (isConnected) {
        await Promise.all([refreshWarehouses(), refreshShipments()]);
      }
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  if (loading) {
    return <PageShell title="Shipping" subtitle="Loading Velocity Shipping workspace...">{null}</PageShell>;
  }

  return (
    <PageShell
      title="Shipping"
      subtitle="Velocity Shipping aggregator: warehouses, serviceability, forward shipments, tracking, and cancellation — all from this panel."
    >
      {error ? <p className="mb-4 rounded-md bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}

      {!connected ? (
        <ConnectVelocityForm onConnected={loadAll} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge tone="green">Velocity Shipping connected</Badge>
          </div>
          <WarehousePanel warehouses={warehouses} onCreated={refreshWarehouses} />
          <CreateShipmentPanel warehouses={warehouses} onCreated={refreshShipments} />
          <ShipmentsTable shipments={shipments} onRefresh={refreshShipments} />
        </div>
      )}
    </PageShell>
  );
}
