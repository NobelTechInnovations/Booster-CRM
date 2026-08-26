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
  Search,
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
  ClipboardList,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Plus, Check } from "lucide-react";

const menu = [
  { label: "Dashboard", icon: Gauge, href: "/panel" },
  { label: "Fulfillment", icon: PackageCheck, href: "/panel/fulfillment" },
  { label: "Company", icon: Building2, href: "/panel/company" },
  { label: "Users", icon: Users, href: "/panel/users" },
  { label: "Orders", icon: ShoppingCart, href: "/panel/orders" },
  { label: "Products", icon: Package, href: "/panel/products" },
  { label: "Product Mapping", icon: Workflow, href: "/panel/product-mapping" },
  { label: "Inventory", icon: Boxes, href: "/panel/inventory" },
  { label: "Assets", icon: Package2, href: "/panel/assets" },
  { label: "Channels", icon: PlugZap, href: "/panel/channels" },
  { label: "Shipping", icon: Truck, href: "/panel/shipping" },
  { label: "Customers", icon: UserRound, href: "/panel/customers" },
  { label: "Finance", icon: CircleDollarSign, href: "/panel/finance" },
  { label: "Ads", icon: Activity, href: "/panel/ads" },
  { label: "Automation", icon: Workflow, href: "/panel/automation" },
  { label: "Reports", icon: ClipboardList, href: "/panel/reports" },
  { label: "Settings", icon: Settings, href: "/panel/settings" },
];

// Minimal icon rail (no visible labels — matches the compact enterprise
// dashboard reference), with a floating label on hover so every item stays
// identifiable without adding visual weight. Mobile keeps a slide-in drawer
// with labels shown, since a pure icon rail doesn't work well touch-first.
function Sidebar({ open, setOpen }) {
  const pathname = usePathname();

  return (
    <>
      <button
        aria-label="Close navigation"
        className={cn("fixed inset-0 z-30 bg-slate-950/40 lg:hidden", open ? "block" : "hidden")}
        onClick={() => setOpen(false)}
      />
      {/* Reserves the collapsed rail's width in the layout grid — the real
          <aside> below is `fixed` so it can widen on hover without disturbing
          this reserved column or the page content next to it. */}
      <div className="hidden lg:block lg:w-[72px] lg:shrink-0" aria-hidden />
      <aside
        className={cn(
          "group/rail fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-[var(--line)] bg-[var(--panel)] lg:top-0 lg:flex lg:h-screen lg:w-[72px] lg:overflow-hidden lg:shadow-none lg:transition-[width] lg:duration-150 lg:hover:w-64 lg:hover:shadow-xl lg:hover:overflow-visible",
          open ? "flex" : "hidden",
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-3 px-5 lg:px-[18px]">
          <Link href="/panel" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--primary)] text-white">
            <Layers3 size={18} />
          </Link>
          <p className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight text-slate-900 lg:hidden lg:group-hover/rail:block">Wokbook</p>
          <button className="ml-auto rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(false)} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <nav className="thin-scrollbar flex-1 overflow-y-auto px-3 py-3 lg:px-2">
          {menu.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/panel" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "mb-0.5 flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[13px] font-medium transition-colors lg:w-auto",
                  isActive
                    ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <item.icon size={18} strokeWidth={isActive ? 2.25 : 1.9} className="shrink-0" />
                <span className="whitespace-nowrap lg:hidden lg:group-hover/rail:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

function BrandSwitcher({ session, companyName }) {
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
    try {
      const res = await listMyCompanies();
      setCompanies(res.companies || []);
    } catch (_error) {
      setCompanies([]);
    } finally {
      setLoading(false);
    }
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
    if (String(companyId) === String(session?.company?._id || session?.company?.id)) {
      setOpen(false);
      return;
    }
    setSwitching(companyId);
    try {
      await switchCompany(companyId);
      window.location.href = "/panel";
    } catch (_error) {
      setSwitching("");
    }
  }

  async function handleAddBrand(event) {
    event.preventDefault();
    if (!newBrandName.trim()) return;
    setAddError("");
    setAdding(true);
    try {
      await createBrand(newBrandName.trim());
      window.location.href = "/panel";
    } catch (error) {
      setAddError(error.message);
      setAdding(false);
    }
  }

  const currentCompanyId = String(session?.company?._id || session?.company?.id || "");

  return (
    <div className="relative hidden md:block">
      <button
        onClick={toggleOpen}
        className="flex min-w-0 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel-soft)] px-3.5 py-1.5 transition hover:border-[var(--primary)]/40"
      >
        <Building2 size={15} className="text-[var(--primary)]" />
        <span className="max-w-[160px] truncate text-sm font-semibold text-slate-800">{companyName}</span>
        <ChevronDown size={14} className={cn("text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-72 rounded-xl border border-[var(--line)] bg-white p-2 shadow-xl">
            <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Your Brands</p>
            {loading ? (
              <div className="px-2 py-3 text-sm text-slate-400">Loading brands…</div>
            ) : (
              <div className="max-h-64 space-y-0.5 overflow-y-auto">
                {companies.map((c) => {
                  const isCurrent = String(c.companyId) === currentCompanyId;
                  const isSwitching = switching === c.companyId;
                  return (
                    <button
                      key={c.companyId}
                      onClick={() => handleSwitch(c.companyId)}
                      disabled={isSwitching}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition",
                        isCurrent ? "bg-indigo-50 text-indigo-900" : "hover:bg-slate-50 text-slate-700",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{c.companyName}</span>
                        <span className="block text-[11px] text-slate-400">{c.role}</span>
                      </span>
                      {isCurrent ? <Check size={15} className="shrink-0 text-indigo-600" /> : null}
                      {isSwitching ? <span className="shrink-0 text-[11px] text-slate-400">Switching…</span> : null}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-1.5 border-t border-[var(--line)] pt-1.5">
              {!showAddBrand ? (
                <button
                  onClick={() => setShowAddBrand(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                >
                  <Plus size={15} />
                  Add New Brand
                </button>
              ) : (
                <form onSubmit={handleAddBrand} className="space-y-2 px-1 py-1">
                  <input
                    autoFocus
                    className="h-9 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-3 text-sm outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
                    placeholder="Brand / company name"
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                  />
                  {addError ? <p className="text-xs font-medium text-rose-700">{addError}</p> : null}
                  <div className="flex gap-1.5">
                    <Button type="submit" className="h-8 flex-1 text-xs" disabled={adding}>
                      {adding ? "Creating…" : "Create Brand"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setShowAddBrand(false)}
                      className="h-8 rounded-lg px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  </div>
                  <p className="px-0.5 text-[11px] leading-4 text-slate-400">
                    Creates a new workspace with its own channels, orders, and data — same login, separate brand.
                  </p>
                </form>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

// Maps the topbar <select> label to the backend's period key.
function periodToKey(period) {
  switch (period) {
    case "Yesterday": return "yesterday";
    case "This Month": return "month";
    case "Last 90 Days": return "last90";
    case "Lifetime": return "lifetime";
    default: return "today";
  }
}

function Topbar({ setOpen, session, onSyncAll, canSync }) {
  const { company, period, setPeriod } = useCommerceStore();
  const router = useRouter();
  const companyName = session?.company?.name || company;
  const userLabel = session?.user?.name || session?.user?.email || "";
  const initials = (userLabel || companyName || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  function logout() {
    clearSession();
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--panel)]">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
        <button className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <BrandSwitcher session={session} companyName={companyName} />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            className="h-[38px] w-full rounded-full border border-[var(--line)] bg-[var(--panel-soft)] pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--primary)] focus:bg-white focus:ring-4 focus:ring-[var(--primary-soft)]"
            placeholder="Search orders, SKU, customer..."
          />
        </div>
        <select
          className="hidden h-9 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 text-sm font-semibold outline-none focus:border-[var(--primary)] md:block shadow-sm"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
        >
          <option>Today</option>
          <option>Yesterday</option>
          <option>This Month</option>
          <option>Last 90 Days</option>
          <option>Lifetime</option>
        </select>
        <Button variant="secondary" className="hidden h-9 sm:inline-flex" onClick={onSyncAll} disabled={!canSync}>
          <RefreshCw size={14} className="mr-1" />
          Sync
        </Button>
        <button className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] bg-[var(--panel)] text-slate-500 transition hover:border-[var(--primary)]/30 hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]" aria-label="Notifications">
          <Bell size={16} />
        </button>
        <div className="mx-1 hidden h-8 w-px bg-[var(--line)] sm:block" />
        <div className="hidden items-center gap-2 sm:flex">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-[var(--primary)] text-xs font-bold text-white shadow-sm">
            {initials}
          </div>
          <button
            className="grid h-9 w-9 place-items-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            aria-label="Logout"
            onClick={logout}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

export default function PanelLayout({ children }) {
  const router = useRouter();
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
  } = useCommerceStore();

  // Ensure functions persist properly. Note: we are defining them here so they use the current state/setters
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
    const syncableChannels = connectedChannels.filter((channel) => channel.status === "connected");
    setChannelsError("");

    try {
      for (const channel of syncableChannels) {
        const channelId = channel._id || channel.id;
        const result = await syncChannel(channelId);
        setConnectedChannels((current) =>
          current.map((entry) => (String(entry._id || entry.id) === String(channelId) ? { ...entry, ...result.channel, _id: entry._id || result.channel.id } : entry)),
        );
      }

      await Promise.all([refreshChannels(), refreshDashboardData()]);
    } catch (error) {
      setChannelsError(error.message);
    }
  }

  useEffect(() => {
    const savedSession = getSession();

    if (!savedSession?.token) {
      router.replace("/login");
      return;
    }

    setSession(savedSession);
    setCheckingSession(false);
  }, [router, setSession, setCheckingSession]);

  useEffect(() => {
    if (!session?.token) return;

    refreshChannels();
    refreshDashboardData();
  }, [session?.token]); // Intentionally limiting dependency array to token to avoid loop if object ref changes

  // Re-fetch dashboard data (trend/channel mix/recent orders) when the topbar
  // period selector changes — the KPI cards depend on this refetch too.
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
          <p className="mt-1 text-sm text-[var(--muted)]">Checking company session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[72px_minmax(0,1fr)] bg-[var(--background)]">
      <Sidebar open={open} setOpen={setOpen} />
      <main className="min-w-0 flex flex-col min-h-screen">
        <Topbar setOpen={setOpen} session={session} onSyncAll={syncAllChannels} canSync={Array.isArray(connectedChannels) && connectedChannels.some((channel) => channel.status === "connected")} />
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
