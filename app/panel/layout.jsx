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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { roles } from "@/lib/data";
import { clearSession, getSession, listChannels, getChannelDashboard, syncChannel } from "@/lib/api";
import { useCommerceStore } from "@/lib/store";
import { cn } from "@/lib/utils";

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
        className={cn("fixed inset-0 z-30 bg-slate-950/35 lg:hidden", open ? "block" : "hidden")}
        onClick={() => setOpen(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-[var(--line)] bg-[var(--panel)] transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-[var(--line)] px-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-teal-700 text-white">
              <Layers3 size={21} />
            </div>
            <div>
              <p className="text-sm font-bold leading-5 text-slate-900">CommerceOS</p>
              <p className="text-xs text-[var(--muted)]">Sukirti Commerce Hub</p>
            </div>
          </div>
          <button className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(false)} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <nav className="thin-scrollbar flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-4 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Operations</div>
          <div className="space-y-1">
            {menu.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/panel" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition",
                    isActive
                      ? "bg-teal-50 text-teal-800"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  <item.icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-[var(--line)] p-4">
          <div className="rounded-lg border border-teal-100 bg-teal-50 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-teal-900">
              <ShieldCheck size={16} />
              Role Matrix
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {roles.slice(0, 5).map((role) => (
                <Badge key={role} tone="teal" className="text-[10px]">
                  {role}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function Topbar({ setOpen, session, onSyncAll, canSync }) {
  const { company, period, setPeriod } = useCommerceStore();
  const router = useRouter();
  const companyName = session?.company?.name || company;

  function logout() {
    clearSession();
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--panel)]/90 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
        <button className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <div className="hidden min-w-0 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-1.5 md:flex">
          <Building2 size={16} className="text-teal-700" />
          <span className="truncate text-sm font-semibold text-slate-800">{companyName}</span>
          <ChevronDown size={14} className="text-slate-500" />
        </div>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            className="h-9 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 shadow-sm"
            placeholder="Search orders, SKU, customer..."
          />
        </div>
        <select
          className="hidden h-9 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 text-sm font-semibold outline-none focus:border-teal-600 md:block shadow-sm"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
        >
          <option>Today</option>
          <option>Yesterday</option>
          <option>This Month</option>
          <option>Last 90 Days</option>
        </select>
        <Button variant="secondary" className="hidden h-9 sm:inline-flex shadow-sm" onClick={onSyncAll} disabled={!canSync}>
          <RefreshCw size={14} className="mr-1" />
          Sync
        </Button>
        <button className="grid h-9 w-9 place-items-center rounded-md border border-[var(--line)] bg-[var(--panel)] text-slate-600 hover:bg-slate-50 shadow-sm" aria-label="Notifications">
          <Bell size={16} />
        </button>
        <button
          className="grid h-9 w-9 place-items-center rounded-md border border-[var(--line)] bg-[var(--panel)] text-slate-600 hover:bg-slate-50 shadow-sm"
          aria-label="Logout"
          onClick={logout}
        >
          <LogOut size={16} />
        </button>
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
      const result = await getChannelDashboard();
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

  const [followUpCustomer, setFollowUpCustomer] = useState(null);
  const [createOrderCustomer, setCreateOrderCustomer] = useState(null);

  if (checkingSession) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--background)] px-4 text-center">
        <div>
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-md bg-teal-700 text-white">
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
