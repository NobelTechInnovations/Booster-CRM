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
  ShieldCheck,
  X,
  Gauge,
  PackageCheck,
  Users,
  ShoppingCart,
  Package,
  Workflow,
  Boxes,
  PlugZap,
  Truck,
  UserRound,
  CircleDollarSign,
  Activity,
  ClipboardList,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { roles } from "@/lib/data";
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
  { label: "Channels", icon: PlugZap, href: "/panel/channels" },
  { label: "Shipping", icon: Truck, href: "/panel/shipping" },
  { label: "Customers", icon: UserRound, href: "/panel/customers" },
  { label: "Finance", icon: CircleDollarSign, href: "/panel/finance" },
  { label: "Ads", icon: Activity, href: "/panel/ads" },
  { label: "Automation", icon: Workflow, href: "/panel/automation" },
  { label: "Reports", icon: ClipboardList, href: "/panel/reports" },
  { label: "Settings", icon: Settings, href: "/panel/settings" },
];

function Sidebar({ open, setOpen }) {
  const pathname = usePathname();

  return (
    <>
      <button
        aria-label="Close navigation"
        className={cn("fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-[2px] lg:hidden", open ? "block" : "hidden")}
        onClick={() => setOpen(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-[var(--navy)] transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ boxShadow: "1px 0 0 rgba(255,255,255,0.06), 12px 0 32px -16px rgba(11,21,51,0.55)" }}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-[0_4px_14px_-2px_rgba(79,70,229,0.65)]">
              <Layers3 size={19} />
            </div>
            <div>
              <p className="text-sm font-bold leading-5 tracking-tight text-white">CommerceOS</p>
              <p className="text-[11px] font-medium text-indigo-200/60">Sukirti Commerce Hub</p>
            </div>
          </div>
          <button className="rounded-md p-2 text-indigo-200/70 hover:bg-white/5 lg:hidden" onClick={() => setOpen(false)} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="mx-4 h-px bg-white/[0.07]" />

        <nav className="thin-scrollbar flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-200/40">Operations</div>
          <div className="space-y-0.5">
            {menu.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/panel" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "group relative flex h-[38px] w-full items-center gap-3 rounded-lg px-3 text-left text-[13.5px] font-medium transition-all",
                    isActive
                      ? "bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                      : "text-indigo-100/65 hover:bg-white/[0.05] hover:text-white",
                  )}
                >
                  {isActive ? (
                    <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-indigo-400 shadow-[0_0_8px_1px_rgba(129,140,248,0.7)]" />
                  ) : null}
                  <item.icon size={17} className={isActive ? "text-indigo-300" : "text-indigo-200/40 group-hover:text-indigo-200"} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="p-4">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-3.5 backdrop-blur">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-white">
              <ShieldCheck size={15} className="text-indigo-300" />
              Role Matrix
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {roles.slice(0, 5).map((role) => (
                <span key={role} className="rounded-full bg-white/[0.08] px-2 py-1 text-[10px] font-semibold text-indigo-100/80 ring-1 ring-inset ring-white/[0.06]">
                  {role}
                </span>
              ))}
            </div>
          </div>
        </div>
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
    <header className="sticky top-0 z-20 border-b border-[var(--line)]/70 bg-[var(--panel)]/80 backdrop-blur-md" style={{ boxShadow: "0 1px 0 rgba(15,23,42,0.03)" }}>
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
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
          <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-600 to-[var(--navy)] text-xs font-bold text-white shadow-sm">
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
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-md bg-[var(--navy)] text-white">
            <Layers3 size={24} />
          </div>
          <p className="mt-4 font-semibold text-slate-800">Opening secure panel</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Checking company session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[288px_minmax(0,1fr)] bg-[var(--background)]">
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
