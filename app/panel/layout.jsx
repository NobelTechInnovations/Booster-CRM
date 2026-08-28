"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { FollowUpReminderBanner } from "@/components/followup-reminder-banner";
import { CustomerFollowUpModal } from "@/components/customer-followup-modal";
import { CreateOrderModal } from "@/components/create-order-modal";
import {
  Bell,
  Building2,
  ChevronDown,
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

// ─── Navigation structure ─────────────────────────────────────────────────────
// Each group either has a direct href (single) or children (group).
// Children are shown as a horizontal sub-nav at the top of the content area.

const NAV_GROUPS = [
  { label: "Dashboard",  icon: Gauge,           href: "/panel",            single: true },
  { label: "Orders",     icon: ShoppingCart,    href: "/panel/orders",     children: [
    { label: "Orders",      icon: ShoppingCart,  href: "/panel/orders" },
    { label: "Fulfillment", icon: PackageCheck,  href: "/panel/fulfillment" },
    { label: "Customers",   icon: UserRound,     href: "/panel/customers" },
  ]},
  { label: "Products",   icon: Package,         href: "/panel/products",   children: [
    { label: "Products",        icon: Package,   href: "/panel/products" },
    { label: "Product Mapping", icon: Workflow,  href: "/panel/product-mapping" },
    { label: "Inventory",       icon: Boxes,     href: "/panel/inventory" },
    { label: "Assets & Stock",  icon: Package2,  href: "/panel/assets" },
  ]},
  { label: "Finance",    icon: CircleDollarSign, href: "/panel/finance",   children: [
    { label: "Overview",    icon: CircleDollarSign, href: "/panel/finance" },
    { label: "Ads & ROAS",  icon: Activity,         href: "/panel/ads" },
    { label: "Analytics",   icon: BarChart2,         href: "/panel/finance?tab=sales" },
  ]},
  { label: "Channels",   icon: PlugZap,         href: "/panel/channels",   children: [
    { label: "Sales Channels",    icon: PlugZap, href: "/panel/channels" },
    { label: "Shipping Partners", icon: Truck,   href: "/panel/shipping" },
  ]},
  { label: "Admin",      icon: Building2,       href: "/panel/company",    children: [
    { label: "Company",    icon: Building2,    href: "/panel/company" },
    { label: "Users",      icon: Users,        href: "/panel/users" },
    { label: "Automation", icon: Workflow,      href: "/panel/automation" },
    { label: "Reports",    icon: ClipboardList, href: "/panel/reports" },
  ]},
  { label: "Settings",   icon: Settings,        href: "/panel/settings",   single: true },
];

// Returns the active NAV_GROUP based on the current pathname
function getActiveGroup(pathname) {
  for (const group of NAV_GROUPS) {
    if (group.single) {
      if (pathname === group.href || (group.href !== "/panel" && pathname?.startsWith(group.href))) return null;
      continue;
    }
    const isActive = group.children?.some((c) => {
      const base = c.href.split("?")[0];
      return pathname === base || (base !== "/panel" && pathname?.startsWith(base));
    });
    if (isActive) return group;
  }
  return null;
}

// ─── Sub-nav bar ─────────────────────────────────────────────────────────────
// Horizontal tabs shown at top of content when current page is in a group.

function SubNavBar({ pathname }) {
  const group = getActiveGroup(pathname);
  if (!group?.children?.length) return null;

  return (
    <div className="border-b border-[var(--line)] bg-[var(--panel)]">
      <nav className="flex items-center px-6">
        {group.children.map((child) => {
          const base = child.href.split("?")[0];
          const isActive = pathname === base || (base !== "/panel" && pathname?.startsWith(base));
          return (
            <Link
              key={child.href}
              href={child.href}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-4 py-3 text-[13px] font-medium transition-colors",
                isActive
                  ? "border-[var(--primary)] text-[var(--primary)]"
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

// ─── Brand Switcher (in sidebar) ─────────────────────────────────────────────

function BrandSwitcher({ session }) {
  const { company } = useCommerceStore();
  const companyName = session?.company?.name || company || "—";
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState("");
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  async function loadCompanies() {
    setLoading(true);
    try { setCompanies((await listMyCompanies()).companies || []); }
    catch (_) { setCompanies([]); }
    finally { setLoading(false); }
  }

  function toggleOpen() {
    setOpen((v) => {
      const next = !v;
      if (next) loadCompanies();
      else setShowAddBrand(false);
      return next;
    });
  }

  async function handleSwitch(companyId) {
    const currentId = String(session?.company?._id || session?.company?.id || "");
    if (String(companyId) === currentId) { setOpen(false); return; }
    setSwitching(companyId);
    try { await switchCompany(companyId); window.location.href = "/panel"; }
    catch (_) { setSwitching(""); }
  }

  async function handleAddBrand(e) {
    e.preventDefault();
    if (!newBrandName.trim()) return;
    setAddError(""); setAdding(true);
    try { await createBrand(newBrandName.trim()); window.location.href = "/panel"; }
    catch (err) { setAddError(err.message); setAdding(false); }
  }

  const currentCompanyId = String(session?.company?._id || session?.company?.id || "");

  return (
    <div className="relative px-3 py-2">
      <button
        onClick={toggleOpen}
        className="flex w-full items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-2 text-left transition hover:bg-slate-100"
      >
        <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--primary)] text-[10px] font-bold text-white">
          {(companyName[0] || "W").toUpperCase()}
        </div>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800">{companyName}</span>
        <ChevronDown size={13} className={cn("shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-3 right-3 top-[calc(100%-4px)] z-40 rounded-xl border border-[var(--line)] bg-white p-2 shadow-xl">
            <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Your Brands</p>
            {loading ? (
              <div className="px-2 py-3 text-sm text-slate-400">Loading…</div>
            ) : (
              <div className="max-h-48 space-y-0.5 overflow-y-auto">
                {companies.map((c) => {
                  const isCurrent = String(c.companyId) === currentCompanyId;
                  return (
                    <button
                      key={c.companyId}
                      onClick={() => handleSwitch(c.companyId)}
                      disabled={!!switching}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition",
                        isCurrent ? "bg-indigo-50 text-indigo-900" : "text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      <span className="truncate font-medium">{c.companyName}</span>
                      {isCurrent ? <Check size={14} className="shrink-0 text-indigo-600" /> : null}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-1 border-t border-[var(--line)] pt-1">
              {!showAddBrand ? (
                <button
                  onClick={() => setShowAddBrand(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-500 hover:bg-slate-50"
                >
                  <Plus size={14} /> Add New Brand
                </button>
              ) : (
                <form onSubmit={handleAddBrand} className="space-y-2 px-1 py-1">
                  <input
                    autoFocus
                    className="h-8 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    placeholder="Brand name"
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                  />
                  {addError ? <p className="text-xs text-rose-600">{addError}</p> : null}
                  <div className="flex gap-1.5">
                    <button type="submit" disabled={adding} className="flex-1 rounded-lg bg-indigo-600 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                      {adding ? "Creating…" : "Create"}
                    </button>
                    <button type="button" onClick={() => setShowAddBrand(false)} className="rounded-lg px-3 text-xs text-slate-500 hover:bg-slate-100">
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({ open, setOpen, session, onLogout }) {
  const pathname = usePathname();
  const { company } = useCommerceStore();
  const companyName = session?.company?.name || company || "Wokbook";
  const userLabel = session?.user?.name || session?.user?.email || companyName;
  const initials = userLabel.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "W";

  return (
    <>
      {/* Mobile overlay */}
      <button
        aria-label="Close navigation"
        className={cn("fixed inset-0 z-30 bg-slate-950/40 lg:hidden", open ? "block" : "hidden")}
        onClick={() => setOpen(false)}
      />

      {/* Desktop rail spacer — reserves 220px in the grid */}
      <div className="hidden lg:block lg:w-[220px] lg:shrink-0" aria-hidden />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[220px] flex-col border-r border-[var(--line)] bg-[var(--panel)]",
          open ? "flex" : "hidden lg:flex",
        )}
      >
        {/* Logo */}
        <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--line)] px-4">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--primary)] text-white">
            <Layers3 size={16} />
          </div>
          <span className="text-[15px] font-bold tracking-tight text-slate-900">Wokbook</span>
          <button className="ml-auto rounded-md p-1.5 text-slate-400 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </div>

        {/* Brand switcher */}
        <BrandSwitcher session={session} />

        {/* Nav */}
        <nav className="thin-scrollbar flex-1 overflow-y-auto px-3 pb-2 pt-1">
          {NAV_GROUPS.map((group) => {
            // Determine if this group contains the active page
            let isActive = false;
            if (group.single) {
              isActive = pathname === group.href || (group.href !== "/panel" && pathname?.startsWith(group.href));
            } else {
              isActive = group.children?.some((c) => {
                const base = c.href.split("?")[0];
                return pathname === base || (base !== "/panel" && pathname?.startsWith(base));
              }) ?? false;
            }

            const href = group.single ? group.href : (group.href || group.children?.[0]?.href);

            return (
              <Link
                key={group.label}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <group.icon size={16} strokeWidth={isActive ? 2.25 : 1.9} className="shrink-0" />
                <span>{group.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-[var(--line)] p-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-slate-800">{userLabel}</p>
              <p className="truncate text-[11px] text-slate-400">{session?.user?.role || "Admin"}</p>
            </div>
            <button
              onClick={onLogout}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────
// Slim bar: mobile-menu button | period selector + live dot + sync + bell

function Topbar({ setOpen, onSyncAll, canSync, period, setPeriod }) {
  return (
    <header className="sticky top-0 z-20 flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--panel)] px-4 lg:px-6">
      {/* Mobile hamburger */}
      <button
        className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>

      {/* Right controls */}
      <div className="ml-auto flex items-center gap-2">
        {/* Live status */}
        <span className="hidden items-center gap-1.5 text-[12px] font-medium text-slate-500 sm:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Live
        </span>

        {/* Period select */}
        <select
          className="h-8 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-2.5 text-[13px] font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option>Today</option>
          <option>Yesterday</option>
          <option>This Month</option>
          <option>Last 90 Days</option>
          <option>Lifetime</option>
        </select>

        {/* Sync */}
        <button
          onClick={onSyncAll}
          disabled={!canSync}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
          title="Sync channels"
        >
          <RefreshCw size={13} />
          <span className="hidden sm:inline">Sync</span>
        </button>

        {/* Bell */}
        <button
          className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] text-slate-500 transition hover:bg-slate-100"
          aria-label="Notifications"
        >
          <Bell size={15} />
        </button>

        {/* AI button */}
        <button className="flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-[13px] font-semibold text-white transition hover:bg-indigo-700">
          <Sparkles size={13} />
          <span className="hidden sm:inline">AI</span>
        </button>
      </div>
    </header>
  );
}

// ─── Maps period label to backend key ─────────────────────────────────────────

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
    session,
    setSession,
    checkingSession,
    setCheckingSession,
    connectedChannels,
    setConnectedChannels,
    setDashboardData,
    setChannelsError,
    setIsLoadingChannels,
    period,
    setPeriod,
  } = useCommerceStore();

  async function refreshChannels() {
    setChannelsError("");
    setIsLoadingChannels(true);
    try {
      const result = await listChannels();
      setConnectedChannels(result.channels || []);
    } catch (error) {
      setChannelsError(error.message);
    } finally {
      setIsLoadingChannels(false);
    }
  }

  async function refreshDashboardData() {
    try {
      const result = await getChannelDashboard({ period: periodToKey(period) });
      setDashboardData(result.dashboard || null);
    } catch (error) {
      setChannelsError(error.message);
    }
  }

  async function syncAllChannels() {
    const syncable = (Array.isArray(connectedChannels) ? connectedChannels : []).filter((ch) => ch.status === "connected");
    setChannelsError("");
    try {
      for (const ch of syncable) {
        const channelId = ch._id || ch.id;
        const result = await syncChannel(channelId);
        setConnectedChannels((cur) =>
          cur.map((e) => (String(e._id || e.id) === String(channelId) ? { ...e, ...result.channel, _id: e._id || result.channel.id } : e)),
        );
      }
      await Promise.all([refreshChannels(), refreshDashboardData()]);
    } catch (error) {
      setChannelsError(error.message);
    }
  }

  function logout() {
    clearSession();
    router.push("/login");
  }

  useEffect(() => {
    const saved = getSession();
    if (!saved?.token) { router.replace("/login"); return; }
    setSession(saved);
    setCheckingSession(false);
  }, [router, setSession, setCheckingSession]);

  useEffect(() => {
    if (!session?.token) return;
    refreshChannels();
    refreshDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token) return;
    refreshDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const [followUpCustomer, setFollowUpCustomer] = useState(null);
  const [createOrderCustomer, setCreateOrderCustomer] = useState(null);

  if (checkingSession) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--background)] px-4 text-center">
        <div>
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-[var(--primary)] text-white">
            <Layers3 size={24} />
          </div>
          <p className="mt-4 font-semibold text-slate-800">Opening secure panel</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Checking session…</p>
        </div>
      </div>
    );
  }

  const canSync = Array.isArray(connectedChannels) && connectedChannels.some((ch) => ch.status === "connected");

  return (
    <div className="min-h-screen bg-[var(--background)] lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
      <Sidebar open={open} setOpen={setOpen} session={session} onLogout={logout} />

      <main className="flex min-h-screen min-w-0 flex-col">
        <Topbar
          setOpen={setOpen}
          onSyncAll={syncAllChannels}
          canSync={canSync}
          period={period}
          setPeriod={setPeriod}
        />

        {/* Horizontal sub-nav for active group's children */}
        <SubNavBar pathname={pathname} />

        <FollowUpReminderBanner onOpenCustomer={(customer) => setFollowUpCustomer(customer)} />

        <div className="flex-1">
          {children}
        </div>
      </main>

      {followUpCustomer && (
        <CustomerFollowUpModal
          customer={followUpCustomer}
          onClose={() => setFollowUpCustomer(null)}
          onUpdate={() => {}}
          onCreateOrder={() => {
            setCreateOrderCustomer(followUpCustomer);
            setFollowUpCustomer(null);
          }}
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
