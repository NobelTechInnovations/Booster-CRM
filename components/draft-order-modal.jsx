"use client";

import { useState, useEffect } from "react";
import { X, Search, Plus, Minus, ShoppingCart, Trash2, RefreshCw, CheckCircle2, FileEdit } from "lucide-react";
import { createLocalFulfillmentOrder, listSyncedRecords } from "@/lib/api";
import { cn, formatMoney } from "@/lib/utils";

// A draft is created entirely in-panel and never touches Shopify (see
// synced-order.model.js's isDraft) — this is deliberately a standalone
// modal, not customer-bound like CreateOrderModal, since a draft is often
// started before ops even has a confirmed customer record: type whatever is
// known now, save it, finish it later. Finalizing (pushing it for real onto
// Shopify) happens separately, from the order's own row/detail view once
// it's ready.
export function DraftOrderModal({ onClose, onDraftCreated }) {
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [isCOD, setIsCOD] = useState(true);
  const [note, setNote] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [shipping, setShipping] = useState({
    address1: "", address2: "", city: "", province: "", zip: "", country: "India",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    async function loadProducts() {
      try {
        const result = await listSyncedRecords("products");
        setProducts(result.records || []);
      } catch (err) {
        setError("Could not load products: " + err.message);
      } finally {
        setProductsLoading(false);
      }
    }
    loadProducts();
  }, []);

  const filteredProducts = products.filter((p) => {
    const q = search.toLowerCase();
    return p.title?.toLowerCase().includes(q) || p.variants?.some((v) => v.sku?.toLowerCase().includes(q));
  });

  function addToCart(product, variant) {
    const key = `${product.id || product._id}::${variant.externalId}`;
    setCart((current) => {
      const existing = current.find((item) => item.key === key);
      if (existing) {
        return current.map((item) => item.key === key ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...current, {
        key,
        title: variant.title && variant.title !== "Default Title" ? `${product.title} (${variant.title})` : product.title,
        sku: variant.sku,
        price: variant.price,
        quantity: 1,
      }];
    });
  }

  function addBlankItem() {
    setCart((current) => [...current, { key: `manual-${Date.now()}`, title: "", sku: "", price: 0, quantity: 1 }]);
  }

  function updateItem(key, field, value) {
    setCart((current) => current.map((item) => item.key === key ? { ...item, [field]: field === "title" || field === "sku" ? value : (parseFloat(value) || 0) } : item));
  }

  function updateQty(key, delta) {
    setCart((current) =>
      current
        .map((item) => item.key === key ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item)
        .filter((item) => item.quantity > 0),
    );
  }

  function removeFromCart(key) {
    setCart((current) => current.filter((item) => item.key !== key));
  }

  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  async function saveDraft() {
    if (!cart.some((item) => item.title.trim())) { setError("Add at least one item"); return; }
    setSaving(true);
    setError("");
    try {
      const result = await createLocalFulfillmentOrder({
        customer: { name: customerName, phone: customerPhone, email: customerEmail },
        shippingAddress: { ...shipping, name: customerName, phone: customerPhone },
        lineItems: cart.filter((item) => item.title.trim()),
        isCOD,
        note,
        isDraft: true,
      });
      setSuccess(result.order);
      onDraftCreated?.(result.order);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-2xl border border-[var(--line)] w-full max-w-md p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-indigo-100 mb-4">
            <CheckCircle2 size={28} className="text-indigo-600" />
          </div>
          <h2 className="text-lg  text-slate-900">Draft Saved</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            <strong>{success.name}</strong> is saved as a draft — it will not sync to Shopify until you finalize it from the Orders list.
          </p>
          <button onClick={onClose} className="mt-5 w-full rounded-lg bg-indigo-700 py-2 text-sm font-semibold text-white hover:bg-indigo-800 transition">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl border border-[var(--line)] w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--line)]">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-700 text-white">
              <FileEdit size={16} />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Create Draft Order</p>
              <p className="text-xs text-[var(--muted)]">Saved in-panel only — won&apos;t sync to Shopify until finalized</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Product picker */}
          <div className="flex flex-col w-[55%] border-r border-[var(--line)]">
            <div className="p-3 border-b border-[var(--line)]">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products or SKU..."
                  className="w-full h-8 pl-8 pr-3 rounded-lg border border-[var(--line)] text-xs outline-none focus:border-indigo-600 bg-white"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto thin-scrollbar">
              {productsLoading ? (
                <div className="flex items-center justify-center h-32 text-[var(--muted)] text-xs">Loading products...</div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-[var(--muted)] text-xs">No products found</div>
              ) : (
                filteredProducts.map((product) => (
                  <div key={product.id || product._id} className="border-b border-[var(--line)] last:border-0">
                    <div className="px-3 py-2 bg-[var(--panel-soft)]">
                      <p className="text-xs font-semibold text-slate-800 truncate">{product.title}</p>
                    </div>
                    {(product.variants || []).map((variant) => (
                      <div key={variant.externalId} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-700 truncate">{variant.title || "Default"}</p>
                          {variant.sku && <p className="text-[10px] text-[var(--muted)]">SKU: {variant.sku}</p>}
                        </div>
                        <p className="text-xs font-semibold text-slate-800 shrink-0">{formatMoney(variant.price)}</p>
                        <button
                          onClick={() => addToCart(product, variant)}
                          className="h-6 w-6 grid place-items-center rounded-md bg-indigo-700 text-white hover:bg-indigo-800 transition shrink-0"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-[var(--line)] p-2">
              <button
                onClick={addBlankItem}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--line)] py-1.5 text-xs font-semibold text-slate-500 hover:border-indigo-400 hover:text-indigo-700"
              >
                <Plus size={12} /> Add a custom item (not yet in catalog)
              </button>
            </div>
          </div>

          {/* Cart + Details */}
          <div className="flex flex-col w-[45%] overflow-y-auto thin-scrollbar">
            {/* Customer */}
            <div className="p-3 border-b border-[var(--line)]">
              <p className="text-xs font-semibold text-slate-600 mb-2">Customer (fill in whatever you know now)</p>
              <div className="grid grid-cols-2 gap-1.5">
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Name" className="w-full h-7 rounded border border-[var(--line)] px-2 text-xs outline-none focus:border-indigo-600 bg-white" />
                <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone" className="w-full h-7 rounded border border-[var(--line)] px-2 text-xs outline-none focus:border-indigo-600 bg-white" />
              </div>
              <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Email (optional)" className="mt-1.5 w-full h-7 rounded border border-[var(--line)] px-2 text-xs outline-none focus:border-indigo-600 bg-white" />
            </div>

            {/* Cart */}
            <div className="p-3 border-b border-[var(--line)]">
              <p className="text-xs font-semibold text-slate-600 mb-2">Items ({cart.length})</p>
              {cart.length === 0 ? (
                <p className="text-xs text-[var(--muted)] py-4 text-center">Add products from the left, or a custom item</p>
              ) : (
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div key={item.key} className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-2">
                      <div className="flex-1 min-w-0 space-y-1">
                        <input
                          value={item.title}
                          onChange={(e) => updateItem(item.key, "title", e.target.value)}
                          placeholder="Item title"
                          className="w-full h-6 rounded border border-[var(--line)] px-2 text-[11px] outline-none focus:border-indigo-600 bg-white"
                        />
                        <input
                          type="number"
                          value={item.price}
                          onChange={(e) => updateItem(item.key, "price", e.target.value)}
                          className="w-full h-6 rounded border border-[var(--line)] px-2 text-xs outline-none focus:border-indigo-600"
                          placeholder="Price"
                        />
                      </div>
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <button onClick={() => updateQty(item.key, 1)} className="h-5 w-5 grid place-items-center rounded bg-slate-100 hover:bg-slate-200"><Plus size={10} /></button>
                        <span className="text-xs  w-4 text-center">{item.quantity}</span>
                        <button onClick={() => updateQty(item.key, -1)} className="h-5 w-5 grid place-items-center rounded bg-slate-100 hover:bg-slate-200"><Minus size={10} /></button>
                      </div>
                      <button onClick={() => removeFromCart(item.key)} className="text-rose-400 hover:text-rose-600"><Trash2 size={12} /></button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1 text-xs  text-slate-900">
                    <span>Total</span>
                    <span>{formatMoney(total)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Payment */}
            <div className="p-3 border-b border-[var(--line)]">
              <p className="text-xs font-semibold text-slate-600 mb-2">Payment</p>
              <div className="flex gap-2">
                {[["COD", true], ["Prepaid", false]].map(([label, val]) => (
                  <button
                    key={label}
                    onClick={() => setIsCOD(val)}
                    className={cn("flex-1 py-1.5 rounded-lg border text-xs font-semibold transition", isCOD === val ? "bg-indigo-700 text-white border-indigo-700" : "border-[var(--line)] text-slate-600 hover:bg-slate-50")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Shipping Address */}
            <div className="p-3 border-b border-[var(--line)]">
              <p className="text-xs font-semibold text-slate-600 mb-2">Shipping Address (optional for now)</p>
              <div className="space-y-1.5">
                {[["Address 1", "address1"], ["Address 2", "address2"]].map(([l, k]) => (
                  <div key={k}>
                    <label className="block text-[10px] text-slate-500 mb-0.5">{l}</label>
                    <input value={shipping[k]} onChange={(e) => setShipping((s) => ({ ...s, [k]: e.target.value }))} className="w-full h-7 rounded border border-[var(--line)] px-2 text-xs outline-none focus:border-indigo-600 bg-white" />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-1.5">
                  {[["City", "city"], ["State", "province"], ["PIN", "zip"]].map(([l, k]) => (
                    <div key={k}>
                      <label className="block text-[10px] text-slate-500 mb-0.5">{l}</label>
                      <input value={shipping[k]} onChange={(e) => setShipping((s) => ({ ...s, [k]: e.target.value }))} className="w-full h-7 rounded border border-[var(--line)] px-2 text-xs outline-none focus:border-indigo-600 bg-white" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Note */}
            <div className="p-3">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Note</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anything to remember about this order..." className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-xs outline-none focus:border-indigo-600 resize-none bg-white" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3 bg-[var(--panel-soft)]">
          <div className="flex-1">
            {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
          </div>
          <p className="text-sm  text-slate-900">{formatMoney(total)}</p>
          <button onClick={onClose} className="h-8 px-3 rounded-lg border border-[var(--line)] text-xs text-slate-600 hover:bg-slate-100">Cancel</button>
          <button
            onClick={saveDraft}
            disabled={saving || !cart.some((item) => item.title.trim())}
            className="h-8 px-4 rounded-lg bg-indigo-700 text-xs font-semibold text-white hover:bg-indigo-800 transition disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? <RefreshCw size={12} className="animate-spin" /> : <FileEdit size={13} />}
            Save as Draft
          </button>
        </div>
      </div>
    </div>
  );
}
