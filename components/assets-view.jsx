"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Boxes, Package, Plus, Trash2, Pencil, X, AlertTriangle, Tag, Link2, Minus, PackagePlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  listAssets,
  createAsset,
  updateAsset,
  deleteAsset,
  adjustAssetStock,
  listAssetMappings,
  saveAssetMapping,
  deleteAssetMapping,
  listSyncedRecords,
} from "@/lib/api";
import { cn, formatMoney } from "@/lib/utils";

const CATEGORY_LABEL = { jar: "Jar", sticker: "Sticker", other: "Other" };
const CATEGORY_TONE = { jar: "blue", sticker: "indigo", other: "slate" };

// ─── Add / Edit Asset modal ─────────────────────────────────────────────────

function AssetFormModal({ initial, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    category: initial?.category || "jar",
    variant: initial?.variant || "",
    unit: initial?.unit || "pcs",
    currentStock: initial?.currentStock ?? 0,
    lowStockThreshold: initial?.lowStockThreshold ?? 20,
    unitCost: initial?.unitCost ?? 0,
    notes: initial?.notes || "",
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
      if (initial) {
        const res = await updateAsset(initial._id || initial.id, form);
        onSaved(res.asset);
      } else {
        const res = await createAsset(form);
        onSaved(res.asset);
      }
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
          <h2 className="text-base font-bold text-slate-900">{initial ? "Edit asset" : "Add asset"}</h2>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
          <label className="block text-sm font-semibold text-slate-700">
            Name *
            <input required value={form.name} onChange={(e) => setField("name", e.target.value)}
              placeholder="e.g. 250g Jar, Sticker – Guntur Red Chilli"
              className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)]" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold text-slate-700">
              Category
              <select value={form.category} onChange={(e) => setField("category", e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]">
                <option value="jar">Jar</option>
                <option value="sticker">Sticker</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Size / variant
              <input value={form.variant} onChange={(e) => setField("variant", e.target.value)} placeholder="e.g. 250g"
                className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]" />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm font-semibold text-slate-700">
              {initial ? "Current stock" : "Starting stock"}
              <input type="number" value={form.currentStock} onChange={(e) => setField("currentStock", e.target.value)} disabled={!!initial}
                className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)] disabled:bg-slate-50 disabled:text-slate-400" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Low-stock alert at
              <input type="number" value={form.lowStockThreshold} onChange={(e) => setField("lowStockThreshold", e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Unit
              <input value={form.unit} onChange={(e) => setField("unit", e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]" />
            </label>
          </div>
          <label className="block text-sm font-semibold text-slate-700">
            Cost per unit (₹)
            <input type="number" min="0" step="0.01" value={form.unitCost} onChange={(e) => setField("unitCost", e.target.value)} placeholder="e.g. 3.50"
              className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)]" />
            <span className="mt-1 block text-xs font-normal text-slate-400">Feeds real per-order profit and packaging cost in Inventory & Costing — leave 0 if you haven't priced it yet.</span>
          </label>
          {initial ? (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Use the +/− buttons on the row to change stock (restock or correction) — editing here won't touch the count.
            </p>
          ) : null}
          <label className="block text-sm font-semibold text-slate-700">
            Notes
            <input value={form.notes} onChange={(e) => setField("notes", e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]" />
          </label>
          {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={saving}>{saving ? "Saving…" : initial ? "Save changes" : "Add asset"}</Button>
        </form>
      </div>
    </div>
  );
}

// ─── Restock / adjust modal ─────────────────────────────────────────────────

function AdjustStockModal({ asset, onClose, onSaved }) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    const value = Number(delta);
    if (!value) { setError("Enter a non-zero quantity"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await adjustAssetStock(asset._id || asset.id, { delta: value, reason });
      onSaved(res.asset);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm rounded-lg border border-[var(--line)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
          <h2 className="text-base font-bold text-slate-900">Adjust stock — {asset.name}</h2>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
          <p className="text-sm text-slate-500">Current stock: <span className="font-bold text-slate-800">{asset.currentStock} {asset.unit}</span></p>
          <label className="block text-sm font-semibold text-slate-700">
            Quantity (+ to add, − to remove)
            <input type="number" autoFocus value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. 500 or -10"
              className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-soft)]" />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Reason (optional)
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. New batch of 500 arrived"
              className="mt-1 h-9 w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]" />
          </label>
          {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </form>
      </div>
    </div>
  );
}

// ─── Map SKU -> assets modal ────────────────────────────────────────────────

function MappingFormModal({ product, assets, existing, onClose, onSaved }) {
  const [rows, setRows] = useState(
    existing?.consumes?.length ? existing.consumes.map((c) => ({ assetId: String(c.assetId), quantity: c.quantity })) : [{ assetId: "", quantity: 1 }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateRow(i, patch) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { assetId: "", quantity: 1 }]);
  }
  function removeRow(i) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const consumes = rows.filter((r) => r.assetId).map((r) => ({ assetId: r.assetId, quantity: Number(r.quantity) || 1 }));
      const res = await saveAssetMapping({
        sku: product.mappingKey,
        productTitle: product.productTitle,
        variantTitle: product.variantTitle,
        consumes,
      });
      onSaved(res.mapping);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-lg border border-[var(--line)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
          <div>
            <h2 className="text-base font-bold text-slate-900">What does this consume?</h2>
            <p className="text-xs text-slate-500">
              {product.productTitle} {product.variantTitle ? `— ${product.variantTitle}` : ""} ·{" "}
              {product.hasSku ? `SKU ${product.sku}` : <span className="text-amber-600">No SKU set in Shopify</span>}
            </p>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={row.assetId}
                onChange={(e) => updateRow(i, { assetId: e.target.value })}
                className="h-9 flex-1 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--primary)]"
              >
                <option value="">Select asset…</option>
                {assets.map((a) => (
                  <option key={a._id || a.id} value={a._id || a.id}>{a.name}{a.variant ? ` (${a.variant})` : ""}</option>
                ))}
              </select>
              <input
                type="number" min="0" value={row.quantity} onChange={(e) => updateRow(i, { quantity: e.target.value })}
                className="h-9 w-20 rounded-md border border-[var(--line)] bg-white px-2 text-sm outline-none focus:border-[var(--primary)]"
              />
              <button type="button" onClick={() => removeRow(i)} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100">
                <X size={15} />
              </button>
            </div>
          ))}
          <button type="button" onClick={addRow} className="flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)] hover:underline">
            <Plus size={14} /> Add another asset
          </button>
          {error ? <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={saving}>{saving ? "Saving…" : "Save mapping"}</Button>
        </form>
      </div>
    </div>
  );
}

// ─── Assets tab ──────────────────────────────────────────────────────────────

function AssetsTab({ assets, isLoading, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [adjustingAsset, setAdjustingAsset] = useState(null);
  const [deletingId, setDeletingId] = useState("");

  async function handleDelete(assetId) {
    setDeletingId(assetId);
    try {
      await deleteAsset(assetId);
      await onRefresh();
    } finally {
      setDeletingId("");
    }
  }

  const lowStockCount = assets.filter((a) => Number(a.currentStock) <= Number(a.lowStockThreshold)).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm font-medium text-[var(--muted)]">Total Assets</p>
          <p className="mt-2 text-2xl font-bold">{assets.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-medium text-[var(--muted)]">Total Units in Stock</p>
          <p className="mt-2 text-2xl font-bold">{assets.reduce((s, a) => s + Number(a.currentStock || 0), 0).toLocaleString("en-IN")}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[var(--muted)]">Low Stock</p>
            <AlertTriangle size={16} className={lowStockCount ? "text-amber-600" : "text-slate-300"} />
          </div>
          <p className="mt-2 text-2xl font-bold">{lowStockCount}</p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Assets</CardTitle>
            <p className="mt-1 text-sm text-[var(--muted)]">Jars, stickers, and anything else you physically hold stock of.</p>
          </div>
          <Button onClick={() => { setEditingAsset(null); setShowForm(true); }}>
            <Plus size={16} /> Add Asset
          </Button>
        </CardHeader>
        <CardContent className={isLoading ? "p-4" : "overflow-x-auto p-0"}>
          {isLoading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : !assets.length ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <Boxes size={22} className="text-slate-400" />
              <p className="font-semibold text-slate-700">No assets yet</p>
              <p className="text-sm text-slate-500">Add your jars and stickers to start tracking stock.</p>
            </div>
          ) : (
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Asset</th>
                  <th className="px-4 py-2.5 font-semibold">Category</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Stock</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Alert at</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Cost/unit</th>
                  <th className="px-4 py-2.5 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => {
                  const low = Number(a.currentStock) <= Number(a.lowStockThreshold);
                  return (
                    <tr key={a._id || a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-slate-800">{a.name}</p>
                        {a.variant ? <p className="text-xs text-slate-400">{a.variant}</p> : null}
                      </td>
                      <td className="px-4 py-2.5"><Badge tone={CATEGORY_TONE[a.category] || "slate"}>{CATEGORY_LABEL[a.category] || a.category}</Badge></td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={cn("font-bold", low ? "text-rose-600" : "text-slate-900")}>{Number(a.currentStock).toLocaleString("en-IN")}</span>
                        <span className="ml-1 text-xs text-slate-400">{a.unit}</span>
                        {low ? <Badge tone="rose" className="ml-2">Low</Badge> : null}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{a.lowStockThreshold}</td>
                      <td className="px-4 py-2.5 text-right">
                        {Number(a.unitCost) > 0 ? (
                          <span className="font-semibold text-slate-700">{formatMoney(a.unitCost)}</span>
                        ) : (
                          <span className="text-xs text-amber-600">Not set</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setAdjustingAsset(a)} className="rounded-md p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-[var(--primary)]" title="Restock / adjust">
                            <PackagePlus size={15} />
                          </button>
                          <button onClick={() => { setEditingAsset(a); setShowForm(true); }} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Edit">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => handleDelete(a._id || a.id)} disabled={deletingId === (a._id || a.id)} className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="Delete">
                            <Trash2 size={14} />
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

      {showForm ? (
        <AssetFormModal initial={editingAsset} onClose={() => setShowForm(false)} onSaved={onRefresh} />
      ) : null}
      {adjustingAsset ? (
        <AdjustStockModal asset={adjustingAsset} onClose={() => setAdjustingAsset(null)} onSaved={onRefresh} />
      ) : null}
    </div>
  );
}

// ─── Product Mapping tab ─────────────────────────────────────────────────────

function MappingTab({ assets, mappings, isLoading, onRefresh }) {
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [search, setSearch] = useState("");
  const [mappingTarget, setMappingTarget] = useState(null);

  useEffect(() => {
    setLoadingProducts(true);
    listSyncedRecords("products")
      .then((res) => setProducts(res.records || []))
      .finally(() => setLoadingProducts(false));
  }, []);

  const mappingBySku = useMemo(() => {
    const m = new Map();
    for (const map of mappings) m.set(map.sku, map);
    return m;
  }, [mappings]);

  const assetById = useMemo(() => new Map(assets.map((a) => [String(a._id || a.id), a])), [assets]);

  // Same "every variant gets a row, even with no real Shopify SKU" rule the
  // Inventory & Costing page uses — skipping unSKU'd variants here (the
  // previous behavior) silently dropped products from this list that the
  // Products/Inventory pages both still show, which read as "not fetching
  // all products". The synthetic identifier is just a stable mapping key,
  // not a real SKU — same convention SkuCost already relies on.
  const rows = useMemo(() => {
    const out = [];
    for (const product of products) {
      const variants = product.variants?.length
        ? product.variants
        : [{ externalId: product.externalId, title: "Default Title", sku: "" }];
      for (const v of variants) {
        // mappingKey is what's actually saved/looked-up against — real SKU
        // when Shopify has one set, else a stable synthetic id (same
        // convention as SkuCost/Inventory & Costing). sku/hasSku are purely
        // for display, so "no SKU set" reads honestly instead of showing
        // that synthetic id as if it were a real one.
        const mappingKey = v.sku || `novar-${v.externalId || product.externalId}`;
        out.push({
          mappingKey,
          sku: v.sku || "",
          hasSku: Boolean(v.sku),
          productTitle: product.title,
          variantTitle: v.title === "Default Title" ? "" : v.title,
        });
      }
    }
    const q = search.trim().toLowerCase();
    return q
      ? out.filter((r) => (r.sku || r.mappingKey).toLowerCase().includes(q) || r.productTitle.toLowerCase().includes(q))
      : out;
  }, [products, search]);

  async function removeMapping(sku) {
    await deleteAssetMapping(sku);
    await onRefresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Product → Asset Mapping</CardTitle>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Tell it what each SKU consumes — a jar size, a sticker, or both. When you ship an order through this panel, those get deducted automatically.
            </p>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU or product…"
            className="h-9 w-64 rounded-md border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
          />
        </CardHeader>
        <CardContent className={isLoading || loadingProducts ? "p-4" : "overflow-x-auto p-0"}>
          {isLoading || loadingProducts ? (
            <TableSkeleton rows={6} cols={4} />
          ) : !rows.length ? (
            <p className="p-8 text-center text-sm text-[var(--muted)]">No synced products found yet — sync a channel first.</p>
          ) : !assets.length ? (
            <p className="p-8 text-center text-sm text-[var(--muted)]">Add at least one asset (jar/sticker) first, then come back to map products to it.</p>
          ) : (
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">Product</th>
                  <th className="px-4 py-2.5 font-semibold">SKU</th>
                  <th className="px-4 py-2.5 font-semibold">Consumes</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Packaging cost</th>
                  <th className="px-4 py-2.5 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const mapping = mappingBySku.get(row.mappingKey);
                  return (
                    <tr key={row.mappingKey} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        <p className="max-w-xs truncate font-semibold text-slate-800">{row.productTitle}</p>
                        {row.variantTitle ? <p className="text-xs text-slate-400">{row.variantTitle}</p> : null}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                        {row.hasSku ? row.sku : <span className="font-sans italic text-amber-600">No SKU set</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {mapping?.consumes?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {mapping.consumes.map((c, i) => {
                              const asset = assetById.get(String(c.assetId));
                              return (
                                <Badge key={i} tone="slate">{c.quantity}× {asset?.name || "Unknown asset"}</Badge>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">Not mapped</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {mapping?.consumes?.length ? (
                          (() => {
                            const total = mapping.consumes.reduce((sum, c) => sum + (Number(assetById.get(String(c.assetId))?.unitCost) || 0) * Number(c.quantity || 0), 0);
                            const allCosted = mapping.consumes.every((c) => Number(assetById.get(String(c.assetId))?.unitCost) > 0);
                            return total > 0 ? (
                              <span className="font-semibold text-slate-700">{formatMoney(total)}{!allCosted ? <span className="ml-1 text-[10px] font-normal text-amber-600">(partial)</span> : null}</span>
                            ) : (
                              <span className="text-xs text-amber-600">Set asset cost</span>
                            );
                          })()
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setMappingTarget(row)} className="rounded-md p-1.5 text-slate-500 hover:bg-indigo-50 hover:text-[var(--primary)]" title="Edit mapping">
                            <Link2 size={14} />
                          </button>
                          {mapping ? (
                            <button onClick={() => removeMapping(row.mappingKey)} className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="Remove mapping">
                              <Trash2 size={14} />
                            </button>
                          ) : null}
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

      {mappingTarget ? (
        <MappingFormModal
          product={mappingTarget}
          assets={assets}
          existing={mappingBySku.get(mappingTarget.mappingKey)}
          onClose={() => setMappingTarget(null)}
          onSaved={onRefresh}
        />
      ) : null}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function AssetsView() {
  const [tab, setTab] = useState("assets");
  const [assets, setAssets] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  async function refresh() {
    setIsLoading(true);
    try {
      const [assetsRes, mappingsRes] = await Promise.all([listAssets(), listAssetMappings()]);
      setAssets(assetsRes.assets || []);
      setMappings(mappingsRes.mappings || []);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const lowStockCount = assets.filter((a) => Number(a.currentStock) <= Number(a.lowStockThreshold)).length;

  return (
    <div className="mx-auto max-w-[1920px] px-4 py-6 lg:px-8">
      <section className="mb-5">
        <Badge tone="indigo">Packaging</Badge>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 md:text-[28px]">Assets & Packaging</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Track jars, stickers, and other packaging you physically hold stock of. Stock deducts automatically when you ship an order through this panel —
          only for orders shipped from today onward, not your existing backlog.
        </p>
      </section>

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-[var(--line)] bg-white p-1.5">
        <button
          onClick={() => setTab("assets")}
          className={cn("flex h-9 items-center gap-2 rounded-md px-3.5 text-sm font-semibold transition-colors", tab === "assets" ? "bg-[var(--primary)] text-white" : "text-slate-600 hover:bg-slate-100")}
        >
          <Package size={15} /> Assets
          {lowStockCount ? <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] text-white">{lowStockCount}</span> : null}
        </button>
        <button
          onClick={() => setTab("mapping")}
          className={cn("flex h-9 items-center gap-2 rounded-md px-3.5 text-sm font-semibold transition-colors", tab === "mapping" ? "bg-[var(--primary)] text-white" : "text-slate-600 hover:bg-slate-100")}
        >
          <Tag size={15} /> Product Mapping
        </button>
      </div>

      {tab === "assets" ? (
        <AssetsTab assets={assets} isLoading={isLoading} onRefresh={refresh} />
      ) : (
        <MappingTab assets={assets} mappings={mappings} isLoading={isLoading} onRefresh={refresh} />
      )}
    </div>
  );
}
