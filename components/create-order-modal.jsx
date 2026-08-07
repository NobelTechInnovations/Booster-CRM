"use client";

import { useState, useEffect } from "react";
import { X, Search, Plus, Minus, ShoppingCart, Trash2, RefreshCw, CheckCircle2, PackageCheck } from "lucide-react";
import { createCustomerOrder, listSyncedRecords } from "@/lib/api";
import { cn } from "@/lib/utils";

export function CreateOrderModal({ customer, onClose, onOrderCreated }) {
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [isCOD, setIsCOD] = useState(true);
  const [note, setNote] = useState("");
  const [shipping, setShipping] = useState({
    firstName: customer?.firstName || "",
    lastName: customer?.lastName || "",
    address1: customer?.defaultAddress?.address1 || "",
    address2: customer?.defaultAddress?.address2 || "",
    city: customer?.defaultAddress?.city || "",
    province: customer?.defaultAddress?.province || "",
    zip: customer?.defaultAddress?.zip || "",
    country: customer?.defaultAddress?.country || "India",
    phone: customer?.phone || "",
  });
  const [placing, setPlacing] = useState(false);
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
        productTitle: product.title,
        variantTitle: variant.title,
        sku: variant.sku,
        variantId: variant.externalId,
        price: variant.price,
        quantity: 1,
      }];
    });
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

  function updatePrice(key, value) {
    setCart((current) => current.map((item) => item.key === key ? { ...item, price: parseFloat(value) || 0 } : item));
  }

  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  async function placeOrder() {
    if (!cart.length) { setError("Add at least one product"); return; }
    setPlacing(true);
    setError("");
    try {
      const result = await createCustomerOrder(customer.id || customer._id, {
        lineItems: cart.map((item) => ({
          variantId: item.variantId,
          productTitle: item.productTitle,
          title: item.variantTitle && item.variantTitle !== "Default Title" ? `${item.productTitle} (${item.variantTitle})` : item.productTitle,
          quantity: item.quantity,
          price: item.price,
        })),
        shippingAddress: shipping,
        note,
        tags: isCOD ? "COD, CRM_Order" : "Prepaid, CRM_Order",
        isCOD,
      });
      setSuccess(result);
      onOrderCreated?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setPlacing(false);
    }
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-2xl border border-[var(--line)] w-full max-w-md p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-100 mb-4">
            <CheckCircle2 size={28} className="text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Order Created!</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Shopify order <strong>{success.shopifyOrderName}</strong> was created and added to the fulfillment queue.
          </p>
          <div className="mt-4 rounded-lg border border-green-100 bg-green-50 p-3 text-left text-xs text-green-800 space-y-1">
            <p>✓ Order synced to Shopify</p>
            <p>✓ Customer marked as Converted</p>
            <p>✓ Added to Fulfillment Queue</p>
          </div>
          <button onClick={onClose} className="mt-5 w-full rounded-lg bg-teal-700 py-2 text-sm font-semibold text-white hover:bg-teal-800 transition">
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)]">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-teal-700 text-white">
              <ShoppingCart size={16} />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Create Order</p>
              <p className="text-xs text-[var(--muted)]">For {customer?.name}</p>
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
                  className="w-full h-8 pl-8 pr-3 rounded-lg border border-[var(--line)] text-xs outline-none focus:border-teal-600 bg-white"
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
                        <p className="text-xs font-semibold text-slate-800 shrink-0">₹{Number(variant.price || 0).toLocaleString("en-IN")}</p>
                        <button
                          onClick={() => addToCart(product, variant)}
                          className="h-6 w-6 grid place-items-center rounded-md bg-teal-700 text-white hover:bg-teal-800 transition shrink-0"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Cart + Details */}
          <div className="flex flex-col w-[45%] overflow-y-auto thin-scrollbar">
            {/* Cart */}
            <div className="p-3 border-b border-[var(--line)]">
              <p className="text-xs font-semibold text-slate-600 mb-2">Cart ({cart.length} items)</p>
              {cart.length === 0 ? (
                <p className="text-xs text-[var(--muted)] py-4 text-center">Add products from the left</p>
              ) : (
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div key={item.key} className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-slate-800 truncate">{item.productTitle}</p>
                        <p className="text-[10px] text-[var(--muted)]">{item.variantTitle || item.sku}</p>
                        <input
                          type="number"
                          value={item.price}
                          onChange={(e) => updatePrice(item.key, e.target.value)}
                          className="mt-1 w-full h-6 rounded border border-[var(--line)] px-2 text-xs outline-none focus:border-teal-600"
                          placeholder="Price"
                        />
                      </div>
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <button onClick={() => updateQty(item.key, 1)} className="h-5 w-5 grid place-items-center rounded bg-slate-100 hover:bg-slate-200"><Plus size={10} /></button>
                        <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                        <button onClick={() => updateQty(item.key, -1)} className="h-5 w-5 grid place-items-center rounded bg-slate-100 hover:bg-slate-200"><Minus size={10} /></button>
                      </div>
                      <button onClick={() => removeFromCart(item.key)} className="text-rose-400 hover:text-rose-600"><Trash2 size={12} /></button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1 text-xs font-bold text-slate-900">
                    <span>Total</span>
                    <span>₹{total.toLocaleString("en-IN")}</span>
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
                    className={cn("flex-1 py-1.5 rounded-lg border text-xs font-semibold transition", isCOD === val ? "bg-teal-700 text-white border-teal-700" : "border-[var(--line)] text-slate-600 hover:bg-slate-50")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Shipping Address */}
            <div className="p-3 border-b border-[var(--line)]">
              <p className="text-xs font-semibold text-slate-600 mb-2">Shipping Address</p>
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  {[["First Name", "firstName"], ["Last Name", "lastName"]].map(([l, k]) => (
                    <div key={k}>
                      <label className="block text-[10px] text-slate-500 mb-0.5">{l}</label>
                      <input value={shipping[k]} onChange={(e) => setShipping((s) => ({ ...s, [k]: e.target.value }))} className="w-full h-7 rounded border border-[var(--line)] px-2 text-xs outline-none focus:border-teal-600 bg-white" />
                    </div>
                  ))}
                </div>
                {[["Address 1", "address1"], ["Address 2", "address2"]].map(([l, k]) => (
                  <div key={k}>
                    <label className="block text-[10px] text-slate-500 mb-0.5">{l}</label>
                    <input value={shipping[k]} onChange={(e) => setShipping((s) => ({ ...s, [k]: e.target.value }))} className="w-full h-7 rounded border border-[var(--line)] px-2 text-xs outline-none focus:border-teal-600 bg-white" />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-1.5">
                  {[["City", "city"], ["State", "province"], ["PIN", "zip"], ["Phone", "phone"]].map(([l, k]) => (
                    <div key={k}>
                      <label className="block text-[10px] text-slate-500 mb-0.5">{l}</label>
                      <input value={shipping[k]} onChange={(e) => setShipping((s) => ({ ...s, [k]: e.target.value }))} className="w-full h-7 rounded border border-[var(--line)] px-2 text-xs outline-none focus:border-teal-600 bg-white" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Note */}
            <div className="p-3">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Order Note</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Special instructions, customer remarks..." className="w-full rounded-lg border border-[var(--line)] px-3 py-2 text-xs outline-none focus:border-teal-600 resize-none bg-white" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-5 py-3 bg-[var(--panel-soft)]">
          <div className="flex-1">
            {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
          </div>
          <p className="text-sm font-bold text-slate-900">₹{total.toLocaleString("en-IN")}</p>
          <button onClick={onClose} className="h-8 px-3 rounded-lg border border-[var(--line)] text-xs text-slate-600 hover:bg-slate-100">Cancel</button>
          <button
            onClick={placeOrder}
            disabled={placing || !cart.length}
            className="h-8 px-4 rounded-lg bg-teal-700 text-xs font-semibold text-white hover:bg-teal-800 transition disabled:opacity-50 flex items-center gap-1.5"
          >
            {placing ? <RefreshCw size={12} className="animate-spin" /> : <PackageCheck size={13} />}
            Place Order & Sync
          </button>
        </div>
      </div>
    </div>
  );
}
