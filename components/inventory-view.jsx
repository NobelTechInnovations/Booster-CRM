"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AlertTriangle,
  Boxes,
  Check,
  IndianRupee,
  Package,
  Pencil,
  Search,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { KpiRowSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { listSyncedRecords, listSkuCosts, saveSkuCost, listAssetMappings, listAssets } from "@/lib/api";

function money(n) {
  const v = Number(n || 0);
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// One editable field: buying price / MRP / weight, with inline save-on-blur.
function CostCell({ value, onSave, prefix = "₹" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const isWeight = prefix === "g";

  useEffect(() => { setDraft(value ?? ""); }, [value]);

  async function commit() {
    const num = Number(draft) || 0;
    if (num === Number(value || 0)) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(num);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center justify-end gap-1">
        {!isWeight && <span className="text-xs text-slate-400">{prefix}</span>}
        <input
          autoFocus
          type="number"
          className="h-7 w-20 rounded border border-indigo-300 bg-white px-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-100"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
          }}
          disabled={saving}
        />
        {isWeight && <span className="text-xs text-slate-400">g</span>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center justify-end gap-1.5 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
    >
      {value ? (isWeight ? `${value}g` : money(value)) : <span className="text-slate-400 font-normal">Set</span>}
      <Pencil size={10} className="opacity-0 transition-opacity group-hover:opacity-60" />
    </button>
  );
}

export function InventoryView() {
  const [products, setProducts] = useState([]);
  const [costs, setCosts] = useState({}); // sku -> costRecord
  const [assetMappings, setAssetMappings] = useState([]);
  const [assets, setAssets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | low-stock | no-cost

  async function loadData() {
    setIsLoading(true);
    setError("");
    try {
      const [prodRes, costRes, mappingRes, assetRes] = await Promise.all([
        listSyncedRecords("products"),
        listSkuCosts().catch(() => ({ costs: [] })),
        listAssetMappings().catch(() => ({ mappings: [] })),
        listAssets().catch(() => ({ assets: [] })),
      ]);
      setProducts(prodRes.records || []);
      const costMap = {};
      for (const c of costRes.costs || []) costMap[c.sku] = c;
      setCosts(costMap);
      setAssetMappings(mappingRes.mappings || []);
      setAssets(assetRes.assets || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  // Same "unitCost per asset, summed across whatever a SKU consumes"
  // calculation the Assets page itself shows — kept in sync by reading the
  // same two collections, not a separately-maintained number.
  const packagingCostByIdentifier = useMemo(() => {
    const assetCostById = new Map(assets.map((a) => [String(a._id || a.id), Number(a.unitCost || 0)]));
    const map = new Map();
    for (const mapping of assetMappings) {
      const total = (mapping.consumes || []).reduce((sum, c) => sum + (assetCostById.get(String(c.assetId)) || 0) * Number(c.quantity || 0), 0);
      map.set(mapping.sku, total);
    }
    return map;
  }, [assetMappings, assets]);

  // Flatten products -> one row per variant. Every variant gets its own costable
  // row, even ones with no SKU set in Shopify — a synthetic identifier keeps
  // those saveable instead of silently dropping them.
  const rows = useMemo(() => {
    const out = [];
    for (const product of products) {
      const variants = product.variants?.length
        ? product.variants
        : [{ externalId: product.externalId, title: "Default", price: 0, inventoryQuantity: product.totalInventory || 0 }];
      for (const v of variants) {
        const identifier = v.sku || `novar-${v.externalId || product.externalId}`;
        const cost = costs[identifier] || {};
        const sellingPrice = Number(v.price || 0);
        const buyingPrice = Number(cost.buyingPrice || 0);
        const packagingCost = packagingCostByIdentifier.get(identifier) || 0;
        const totalCost = buyingPrice + packagingCost;
        const mrp = Number(cost.mrp || 0);
        const weightGrams = Number(cost.weightGrams || 0);
        const margin = sellingPrice - totalCost;
        const marginPercent = sellingPrice > 0 ? (margin / sellingPrice) * 100 : 0;
        out.push({
          key: `${product.externalId}::${v.externalId || identifier}`,
          identifier,
          sku: v.sku || "",
          hasSku: Boolean(v.sku),
          productTitle: product.title,
          variantTitle: v.title !== "Default Title" ? v.title : "",
          sellingPrice,
          inventoryQuantity: Number(v.inventoryQuantity || 0),
          buyingPrice,
          packagingCost,
          totalCost,
          mrp,
          weightGrams,
          margin,
          marginPercent,
          hasCost: Boolean(cost.buyingPrice || cost.mrp),
          hasPackagingMapping: assetMappings.some((m) => m.sku === identifier && m.consumes?.length),
        });
      }
    }
    return out;
  }, [products, costs, packagingCostByIdentifier, assetMappings]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.sku.toLowerCase().includes(q) || r.productTitle?.toLowerCase().includes(q) || r.variantTitle?.toLowerCase().includes(q));
    }
    if (filter === "low-stock") list = list.filter((r) => r.inventoryQuantity <= 5);
    if (filter === "no-cost") list = list.filter((r) => !r.hasCost);
    return list;
  }, [rows, search, filter]);

  async function updateCost(row, field, value) {
    const current = costs[row.identifier] || {};
    const payload = {
      productTitle: row.productTitle,
      variantTitle: row.variantTitle,
      buyingPrice: current.buyingPrice || 0,
      mrp: current.mrp || 0,
      weightGrams: current.weightGrams || 0,
      [field]: value,
    };
    const res = await saveSkuCost(row.identifier, payload);
    setCosts((prev) => ({ ...prev, [row.identifier]: res.skuCost }));
  }

  const totalStock = rows.reduce((sum, r) => sum + r.inventoryQuantity, 0);
  const lowStockCount = rows.filter((r) => r.inventoryQuantity <= 5).length;
  const costedRows = rows.filter((r) => r.hasCost);
  const avgMarginPercent = costedRows.length
    ? costedRows.reduce((sum, r) => sum + r.marginPercent, 0) / costedRows.length
    : 0;
  const missingCostCount = rows.filter((r) => !r.hasCost).length;

  return (
    <div className="mx-auto max-w-[1920px] px-4 py-6 lg:px-8">
      <section className="mb-6">
        <Badge tone="indigo">Stock Control</Badge>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 md:text-[28px]">Inventory & Costing</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Live stock synced from Shopify, plus per-variant buying price and MRP to track real margin. Packaging cost (jars, stickers) is set
          per-asset in Assets and pulled in here automatically via the product mapping — margin below is selling price minus buying price
          and packaging cost combined. Shipping cost isn&rsquo;t fixed here since it varies by destination and weight — check live
          courier rates from Fulfillment instead.
        </p>
      </section>

      {error ? (
        <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>
      ) : null}

      {/* Summary cards */}
      {isLoading ? (
        <section className="mb-6">
          <KpiRowSkeleton count={4} />
        </section>
      ) : (
      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[var(--muted)]">Total SKUs</p>
            <Boxes size={16} className="text-indigo-600" />
          </div>
          <p className="mt-2 text-2xl font-bold">{rows.length.toLocaleString("en-IN")}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[var(--muted)]">Units in Stock</p>
            <Package size={16} className="text-blue-600" />
          </div>
          <p className="mt-2 text-2xl font-bold">{totalStock.toLocaleString("en-IN")}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[var(--muted)]">Avg. Margin</p>
            {avgMarginPercent >= 0 ? <TrendingUp size={16} className="text-emerald-600" /> : <TrendingDown size={16} className="text-rose-600" />}
          </div>
          <p className={`mt-2 text-2xl font-bold ${avgMarginPercent >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {costedRows.length ? `${avgMarginPercent.toFixed(1)}%` : "—"}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">{costedRows.length} SKUs costed</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[var(--muted)]">Low Stock</p>
            <AlertTriangle size={16} className={lowStockCount ? "text-amber-600" : "text-slate-300"} />
          </div>
          <p className="mt-2 text-2xl font-bold">{lowStockCount}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">≤ 5 units remaining</p>
        </Card>
      </section>
      )}

      {missingCostCount > 0 ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <IndianRupee size={14} />
          {missingCostCount} SKU{missingCostCount !== 1 ? "s" : ""} missing cost data — margin can&rsquo;t be calculated until buying price is set.
        </div>
      ) : null}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            className="h-9 w-full rounded-lg border border-[var(--line)] bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            placeholder="Search SKU or product..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1 text-xs font-semibold">
          {[
            ["all", "All"],
            ["low-stock", "Low Stock"],
            ["no-cost", "Missing Cost"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-md px-3 py-1.5 transition ${filter === key ? "bg-slate-950 text-white" : "text-slate-600 hover:text-slate-900"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className={isLoading ? "p-4" : "overflow-x-auto p-0"}>
          {isLoading ? (
            <TableSkeleton rows={8} cols={7} />
          ) : filteredRows.length === 0 ? (
            <div className="p-10 text-center">
              <Boxes size={36} className="mx-auto mb-3 text-slate-300" />
              <p className="font-semibold text-slate-700">No SKUs found</p>
              <p className="mt-1 text-sm text-[var(--muted)]">Sync Shopify products from the Channels page to populate inventory.</p>
            </div>
          ) : (
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <th className="py-3 pl-4 pr-3 font-semibold">Product / Variant</th>
                  <th className="py-3 px-3 font-semibold text-right">Stock</th>
                  <th className="py-3 px-3 font-semibold text-right">Selling Price</th>
                  <th className="py-3 px-3 font-semibold text-right">MRP</th>
                  <th className="py-3 px-3 font-semibold text-right">Buying Price</th>
                  <th className="py-3 px-3 font-semibold text-right">Packaging Cost</th>
                  <th className="py-3 px-3 font-semibold text-right">Weight (g)</th>
                  <th className="py-3 pl-3 pr-4 font-semibold text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="py-3 pl-4 pr-3">
                      <p className="font-semibold text-slate-900">{row.productTitle}</p>
                      <p className="text-xs text-slate-400">
                        {row.variantTitle ? `${row.variantTitle} · ` : ""}
                        {row.hasSku ? `SKU: ${row.sku}` : <span className="text-amber-600">No SKU set in Shopify</span>}
                      </p>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className={row.inventoryQuantity <= 5 ? "font-bold text-amber-700" : "font-medium text-slate-700"}>
                        {row.inventoryQuantity}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-slate-900">{money(row.sellingPrice)}</td>
                    <td className="py-3 px-3 text-right">
                      <CostCell value={row.mrp} onSave={(v) => updateCost(row, "mrp", v)} />
                    </td>
                    <td className="py-3 px-3 text-right">
                      <CostCell value={row.buyingPrice} onSave={(v) => updateCost(row, "buyingPrice", v)} />
                    </td>
                    <td className="py-3 px-3 text-right">
                      {row.hasPackagingMapping ? (
                        <span className={row.packagingCost > 0 ? "font-semibold text-slate-700" : "text-xs text-amber-600"}>
                          {row.packagingCost > 0 ? money(row.packagingCost) : "Set asset cost"}
                        </span>
                      ) : (
                        <a href="/panel/assets" className="text-xs text-slate-400 hover:text-[var(--primary)] hover:underline">Map in Assets →</a>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <CostCell value={row.weightGrams} onSave={(v) => updateCost(row, "weightGrams", v)} prefix="g" />
                    </td>
                    <td className="py-3 pl-3 pr-4 text-right">
                      {row.hasCost ? (
                        <div>
                          <p className={`font-bold ${row.margin >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{money(row.margin)}</p>
                          <p className={`text-xs ${row.margin >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                            {row.marginPercent.toFixed(1)}%
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
