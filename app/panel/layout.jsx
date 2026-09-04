"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { FollowUpReminderBanner } from "@/components/followup-reminder-banner";
import { UpgradeBanner } from "@/components/upgrade-banner";
import { CustomerFollowUpModal } from "@/components/customer-followup-modal";
import { CreateOrderModal } from "@/components/create-order-modal";
import {
  Bell,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  Layers3,
  LogOut,
  Menu,
  RefreshCw,
  X,
  Gauge,
  PackageCheck,
  Users,
  ShoppingCart,
  Package,
  Workflow,
  Boxes,
  Package2,
  PlugZap,
  Truck,
  UserRound,
  CircleDollarSign,
  Activity,
  BarChart2,
  ClipboardList,
  Settings,
  Sparkles,
  Check,
  Plus,
  Camera,
  MessageCircle,
} from "lucide-react";
import {
  clearSession,
  getSession,
  listChannels,
  getChannelDashboard,
  syncChannel,
  listMyCompanies,
  createBrand,
  switchCompany,
} from "@/lib/api";
import { useCommerceStore } from "@/lib/store";
import { cn } from "@/lib/utils";

// ─── Navigation ───────────────────────────────────────────────────────────────

const NAV_GROUPS = [
  { label: "Dashboard", icon: Gauge, href: "/panel", single: true },
  {
    label: "Orders", icon: ShoppingCart, href: "/panel/orders", children: [
      { label: "Orders", icon: ShoppingCart, href: "/panel/orders" },
      { label: "Fulfillment", icon: PackageCheck, href: "/panel/fulfillment" },
      { label: "Customers", icon: UserRound, href: "/panel/customers" },
    ]
  },
  {
    label: "Products", icon: Package, href: "/panel/products", children: [
      { label: "Products", icon: Package, href: "/panel/products" },
      { label: "Product Mapping", icon: Workflow, href: "/panel/product-mapping" },
      { label: "Inventory", icon: Boxes, href: "/panel/inventory" },
      { label: "Assets & Stock", icon: Package2, href: "/panel/assets" },
    ]
  },
  {
    label: "Finance", icon: CircleDollarSign, href: "/panel/finance", children: [
      { label: "Overview", icon: CircleDollarSign, href: "/panel/finance" },
      { label: "Ads & ROAS", icon: Activity, href: "/panel/ads" },
      { label: "Analytics", icon: BarChart2, href: "/panel/finance?tab=sales" },
    ]
  },
  {
    label: "Channels", icon: PlugZap, href: "/panel/channels", children: [
      { label: "Sales Channels", icon: PlugZap, href: "/panel/channels" },
      { label: "Shipping Partners", icon: Truck, href: "/panel/shipping" },
    ]
  },
  {
    label: "Marketing", icon: Camera, href: "/panel/social", children: [
      { label: "Social", icon: Camera, href: "/panel/social" },
      { label: "WhatsApp", icon: MessageCircle, href: "/panel/whatsapp" },
      { label: "Smart WhatsApp", icon: MessageCircle, href: "/panel/smart-whatsapp" },
    ]
  },
  {
    label: "Admin", icon: Building2, href: "/panel/company", children: [
      { label: "Company", icon: Building2, href: "/panel/company" },
      { label: "Users", icon: Users, href: "/panel/users" },
      { label: "Automation", icon: Workflow, href: "/panel/automation" },
      { label: "Reports", icon: ClipboardList, href: "/panel/reports" },
    ]
  },
  { label: "Settings", icon: Settings, href: "/panel/settings", single: true },
];

function isGroupActive(group, pathname) {
  if (group.single) return pathname === group.href || (group.href !== "/panel" && pathname?.startsWith(group.href));
  return (group.children || []).some((c) => {
    const base = c.href.split("?")[0];
    return pathname === base || (base !== "/panel" && pathname?.startsWith(base));
  });
}

// ─── Sub-nav bar (horizontal tabs for active group's children) ────────────────

function SubNavBar({ pathname }) {
  const group = NAV_GROUPS.find((g) => !g.single && isGroupActive(g, pathname));
  if (!group) return null;
  return (
    <div className="border-b border-[var(--line)] bg-[var(--panel)]">
      <nav className="flex items-center gap-0 px-4 overflow-x-auto">
        {group.children.map((child) => {
          const base = child.href.split("?")[0];
          const active = pathname === base || (base !== "/panel" && pathname?.startsWith(base));
          return (
            <Link
              key={child.href}
              href={child.href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors",
                active
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              <child.icon size={13} />
              {child.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

// ─── Brand Switcher ───────────────────────────────────────────────────────────
// Shared between the sidebar (full-width row) and the topbar (compact pill) —
// same data/switch/create logic, `variant` only changes the trigger's shell.

function BrandSwitcher({ session, variant = "sidebar" }) {
  const { company } = useCommerceStore();
  const name = session?.company?.name || company || "Workspace";
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [addErr, setAddErr] = useState("");
  const [adding, setAdding] = useState(false);
  const currentId = String(session?.company?._id || session?.company?.id || "");

  async function load() {
    setLoading(true);
    try { setCompanies((await listMyCompanies()).companies || []); } catch (_) { setCompanies([]); }
    finally { setLoading(false); }
  }

  async function switchTo(id) {
    if (String(id) === currentId) { setOpen(false); return; }
    setSwitching(id);
    try { await switchCompany(id); window.location.href = "/panel"; } catch (_) { setSwitching(""); }
  }

  async function addBrand(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAddErr(""); setAdding(true);
    try { await createBrand(newName.trim()); window.location.href = "/panel"; }
    catch (err) { setAddErr(err.message); setAdding(false); }
  }

  const isCompact = variant === "topbar";

  return (
    <div className={cn("relative", isCompact ? "" : "px-3 pb-2 pt-1")}>
      <button
        onClick={() => { setOpen((v) => { const n = !v; if (n) load(); else setShowAdd(false); return n; }); }}
        className={cn(
          "flex items-center gap-2 text-left transition",
          isCompact
            ? "h-8 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 hover:bg-slate-100"
            : "w-full rounded-lg px-2.5 py-2 hover:bg-slate-100",
        )}
      >
        {session?.company?.logoUrl ? (
          <img src={session.company.logoUrl} alt={name} className="h-6 w-6 shrink-0 rounded-md object-contain" />
        ) : (
          <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-indigo-600 text-[11px]  text-white">
            {name[0]?.toUpperCase() || "W"}
          </div>
        )}
        {/* Below `sm` the topbar is tight (hamburger + this + right-side
            icons) — show just the avatar+chevron there, full name from
            `sm` up. Never fully hidden, so it's still reachable on phones. */}
        <span className={cn(
          "min-w-0 truncate text-[13px] font-semibold text-slate-800",
          isCompact ? "hidden max-w-[140px] sm:block" : "flex-1",
        )}>{name}</span>
        <ChevronDown size={13} className={cn("shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className={cn(
            "absolute top-full z-40 mt-1.5 rounded-xl border border-[var(--line)] bg-white p-2 shadow-xl",
            isCompact ? "left-0 w-64" : "left-3 right-3",
          )}>
            <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Your Brands</p>
            {loading ? (
              <p className="px-2 py-2 text-sm text-slate-400">Loading…</p>
            ) : (
              <div className="max-h-40 space-y-0.5 overflow-y-auto">
                {companies.map((c) => (
                  <button
                    key={c.companyId}
                    onClick={() => switchTo(c.companyId)}
                    disabled={!!switching}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition",
                      String(c.companyId) === currentId ? "bg-indigo-50 text-indigo-900" : "text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    <span className="truncate font-medium">{c.companyName}</span>
                    {String(c.companyId) === currentId ? <Check size={13} className="text-indigo-600" /> : null}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-1 border-t border-[var(--line)] pt-1">
              {!showAdd ? (
                <button onClick={() => setShowAdd(true)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-slate-500 hover:bg-slate-50">
                  <Plus size={13} /> Add Brand
                </button>
              ) : (
                <form onSubmit={addBrand} className="space-y-1.5 px-0.5 py-1">
                  <input autoFocus className="h-8 w-full rounded-lg border border-[var(--line)] px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" placeholder="Brand name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  {addErr && <p className="text-xs text-rose-600">{addErr}</p>}
                  <div className="flex gap-1">
                    <button type="submit" disabled={adding} className="flex-1 rounded-lg bg-indigo-600 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{adding ? "Creating…" : "Create"}</button>
                    <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg px-3 text-xs text-slate-500 hover:bg-slate-100">Cancel</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ open, setOpen, session, onLogout }) {
  const pathname = usePathname();
  const { company } = useCommerceStore();
  const userLabel = session?.user?.name || session?.user?.email || session?.company?.name || company || "User";
  const initials = userLabel.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "U";

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          /* base — always flex-col, 220px wide */
          "fixed inset-y-0 left-0 z-40 w-[220px] flex-col border-r border-[var(--line)] bg-[var(--panel)]",
          /* mobile: slide in/out; desktop: always visible */
          open ? "flex translate-x-0" : "-translate-x-full lg:flex lg:translate-x-0",
          "transition-transform duration-200",
        )}
      >
        {/* Logo — the company's own brand logo once uploaded (Company
            settings), with "Powered by Wokbook" underneath as a small
            attribution; falls back to plain Wokbook branding when no
            logo is set, unchanged from before. */}
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--line)] px-4">
          {session?.company?.logoUrl ? (
            <div className="flex min-w-0 items-center gap-2.5">
              <img src={session.company.logoUrl} alt={session.company.name} className="h-8 w-8 shrink-0 rounded-lg object-contain" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[13px] font-semibold text-slate-900">{session.company.name}</p>
                <p className="text-[10px] text-slate-400">Powered by Wokbook</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white">
                <Layers3 size={15} />
              </div>
              <span className="text-[15px]  tracking-tight text-slate-900">Wokbook</span>
            </div>
          )}
          <button className="rounded-md p-1 text-slate-400 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </div>

        {/* Brand switcher lives in the topbar only (see Topbar below) — a
            second copy here would show on desktop at the same time as the
            topbar's, so it's deliberately not rendered in the sidebar. */}

        {/* Nav items */}
        <nav className="thin-scrollbar flex-1 overflow-y-auto px-3 pb-3">
          {NAV_GROUPS.map((group) => {
            const active = isGroupActive(group, pathname);
            const href = group.single ? group.href : (group.href || group.children?.[0]?.href);
            return (
              <Link
                key={group.label}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <group.icon size={16} strokeWidth={active ? 2.25 : 1.75} className="shrink-0" />
                <span className="flex-1">{group.label}</span>
                {!group.single && <ChevronRight size={12} className="shrink-0 text-slate-300" />}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-[var(--line)] p-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-600 text-[11px]  text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-slate-800">{userLabel}</p>
              <p className="truncate text-[11px] text-slate-400">{session?.user?.role || "Admin"}</p>
            </div>
            <button onClick={onLogout} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Logout">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

function Topbar({ setOpen, onSyncAll, canSync, period, setPeriod, session }) {
  return (
    <header className="sticky top-0 z-20 flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-4 lg:px-4">
      <button className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
        <Menu size={20} />
      </button>

      {/* Brand switcher — the sidebar's own switcher is commented out (dead
          weight, not two competing switchers), so this is the ONLY brand
          switcher in the app and needs to work at every width, including
          mobile. The compact variant hides its text label below `sm` so it
          doesn't crowd the hamburger button, but the avatar+chevron stay
          tappable at every size. */}
      <BrandSwitcher session={session} variant="topbar" />

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-1.5 text-[12px] font-medium text-slate-500 sm:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Live
        </span>

        <div className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-2.5">
          <Calendar size={13} className="text-slate-400" />
          <select
            className="bg-transparent text-[13px] font-medium text-slate-700 outline-none"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option>Today</option>
            <option>Yesterday</option>
            <option>This Month</option>
            <option>Last 90 Days</option>
            <option>Lifetime</option>
          </select>
        </div>

        <button
          onClick={onSyncAll}
          disabled={!canSync}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
        >
          <RefreshCw size={13} />
          <span className="hidden sm:inline">Sync</span>
        </button>

        <button className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-slate-500 hover:bg-slate-100">
          <Bell size={14} />
        </button>

        <button className="flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-[13px] font-semibold text-white hover:bg-indigo-700">
          <Sparkles size={13} />
          <span className="hidden sm:inline">AI</span>
        </button>
      </div>
    </header>
  );
}

// ─── Period helper ────────────────────────────────────────────────────────────

function periodToKey(period) {
  switch (period) {
    case "Yesterday": return "yesterday";
    case "This Month": return "month";
    case "Last 90 Days": return "last90";
    case "Lifetime": return "lifetime";
    default: return "today";
  }
}

// ─── Panel layout ─────────────────────────────────────────────────────────────

export default function PanelLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const {
    session, setSession, checkingSession, setCheckingSession,
    connectedChannels, setConnectedChannels,
    setDashboardData, setChannelsError, setIsLoadingChannels,
    period, setPeriod,
  } = useCommerceStore();

  async function refreshChannels() {
    setChannelsError(""); setIsLoadingChannels(true);
    try { setConnectedChannels((await listChannels()).channels || []); }
    catch (err) { setChannelsError(err.message); }
    finally { setIsLoadingChannels(false); }
  }

  async function refreshDashboardData() {
    try { setDashboardData((await getChannelDashboard({ period: periodToKey(period) })).dashboard || null); }
    catch (err) { setChannelsError(err.message); }
  }

  async function syncAllChannels() {
    const syncable = (Array.isArray(connectedChannels) ? connectedChannels : []).filter((ch) => ch.status === "connected");
    setChannelsError("");
    try {
      for (const ch of syncable) {
        const id = ch._id || ch.id;
        const res = await syncChannel(id);
        setConnectedChannels((cur) => cur.map((e) => String(e._id || e.id) === String(id) ? { ...e, ...res.channel, _id: e._id || res.channel.id } : e));
      }
      await Promise.all([refreshChannels(), refreshDashboardData()]);
    } catch (err) { setChannelsError(err.message); }
  }

  function logout() { clearSession(); router.push("/login"); }

  useEffect(() => {
    const saved = getSession();
    if (!saved?.token) { router.replace("/login"); return; }
    setSession(saved); setCheckingSession(false);
  }, [router, setSession, setCheckingSession]);

  useEffect(() => { if (session?.token) { refreshChannels(); refreshDashboardData(); } }, [session?.token]); // eslint-disable-line
  useEffect(() => { if (session?.token) refreshDashboardData(); }, [period]); // eslint-disable-line

  const [followUpCustomer, setFollowUpCustomer] = useState(null);
  const [createOrderCustomer, setCreateOrderCustomer] = useState(null);

  if (checkingSession) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--background)]">
        <div className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-indigo-600 text-white">
            <Layers3 size={22} />
          </div>
          <p className="mt-4 font-semibold text-slate-800">Opening panel…</p>
        </div>
      </div>
    );
  }

  const canSync = Array.isArray(connectedChannels) && connectedChannels.some((ch) => ch.status === "connected");

  return (
    /* Desktop: sidebar (220px) + main. Mobile: stacked (sidebar is overlay). */
    <div className="min-h-screen bg-[var(--background)] lg:flex">
      {/* Sidebar spacer — keeps content from sliding under the fixed sidebar */}
      <div className="hidden w-[220px] shrink-0 lg:block" aria-hidden />

      <Sidebar open={open} setOpen={setOpen} session={session} onLogout={logout} />

      <main className="flex min-h-screen min-w-0 flex-1 flex-col bg-white">
        <Topbar setOpen={setOpen} onSyncAll={syncAllChannels} canSync={canSync} period={period} setPeriod={setPeriod} session={session} />
        <SubNavBar pathname={pathname} />
        <UpgradeBanner session={session} />
        <FollowUpReminderBanner onOpenCustomer={(c) => setFollowUpCustomer(c)} />
        <div className="flex-1">{children}</div>
      </main>

      {followUpCustomer && (
        <CustomerFollowUpModal
          customer={followUpCustomer}
          onClose={() => setFollowUpCustomer(null)}
          onUpdate={() => { }}
          onCreateOrder={() => { setCreateOrderCustomer(followUpCustomer); setFollowUpCustomer(null); }}
        />
      )}
      {createOrderCustomer && (
        <CreateOrderModal
          customer={createOrderCustomer}
          onClose={() => setCreateOrderCustomer(null)}
          onOrderCreated={() => setCreateOrderCustomer(null)}
        />
      )}
    </div>
  );
}
