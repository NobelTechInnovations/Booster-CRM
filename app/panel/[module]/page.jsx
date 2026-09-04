"use client";

import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCommerceStore } from "@/lib/store";
import { ChannelsView, ModuleView } from "@/components/dashboard";
import { CompanyView } from "@/components/company-view";
import { UsersView } from "@/components/users-view";
import { FulfillmentView } from "@/components/fulfillment-view";
import { ShippingView } from "@/components/shipping-view";
import { FinanceView } from "@/components/finance-view";
import { OrdersView } from "@/components/orders-view";
import { CustomersView } from "@/components/customers-view";
import { LeadsView } from "@/components/leads-view";
import { InventoryView } from "@/components/inventory-view";
import { AssetsView } from "@/components/assets-view";
import { ReportsView } from "@/components/reports-view";
import { AutomationView } from "@/components/automation-view";
import { SettingsView } from "@/components/settings-view";
import { SocialView } from "@/components/social-view";
import { WhatsAppView } from "@/components/whatsapp-view";
import { SmartWhatsAppView } from "@/components/smart-whatsapp-view";
import { FeatureGate } from "@/components/feature-gate";
import { listChannels, getChannelDashboard, syncChannel } from "@/lib/api";

export default function ModulePage({ params }) {
  // Use React.use() to unwrap the params promise (Next.js 15 app router behavior)
  const resolvedParams = use(params);
  const moduleName = resolvedParams.module; // "channels", "company", etc.
  const searchParams = useSearchParams();
  const tabParam = searchParams?.get("tab") || null;
  
  const {
    session,
    setSession,
    connectedChannels,
    channelsError,
    isLoadingChannels,
    setConnectedChannels,
    setChannelsError,
    setDashboardData,
    setIsLoadingChannels
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
      const result = await getChannelDashboard();
      setDashboardData(result.dashboard || null);
    } catch (error) {
      setChannelsError(error.message);
    }
  }

  async function syncAllChannels() {
    const syncableChannels = (Array.isArray(connectedChannels) ? connectedChannels : []).filter((channel) => channel.status === "connected");
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

  // Map route names to view names
  const viewMap = {
    "channels": "Channels",
    "company": "Company",
    "users": "Users",
    "fulfillment": "Fulfillment",
    "shipping": "Shipping",
    "orders": "Orders",
    "products": "Products",
    "product-mapping": "Product Mapping",
    "inventory": "Inventory",
    "assets": "Assets",
    "customers": "Customers",
    "leads": "Leads",
    "finance": "Finance",
    "ads": "Ads",
    "social": "Social",
    "whatsapp": "WhatsApp",
    "smart-whatsapp": "SmartWhatsApp",
    "automation": "Automation",
    "reports": "Reports",
    "settings": "Settings"
  };

  const activeViewName = viewMap[moduleName] || "Dashboard";

  if (activeViewName === "Channels") {
    return (
      <ChannelsView
        connectedChannels={connectedChannels}
        channelsError={channelsError}
        isLoadingChannels={isLoadingChannels}
        setConnectedChannels={setConnectedChannels}
        setChannelsError={setChannelsError}
        onRefreshData={() => Promise.all([refreshChannels(), refreshDashboardData()])}
        onSyncAll={syncAllChannels}
      />
    );
  }

  if (activeViewName === "Company") {
    return (
      <CompanyView
        onCompanyUpdate={(company) => {
          setSession((current) => (current ? { ...current, company } : current));
        }}
      />
    );
  }

  if (activeViewName === "Users") {
    return <UsersView />;
  }

  if (activeViewName === "Fulfillment") {
    return <FulfillmentView />;
  }

  if (activeViewName === "Shipping") {
    return <ShippingView />;
  }

  if (activeViewName === "Orders") {
    return <OrdersView />;
  }

  if (activeViewName === "Inventory") {
    return <InventoryView />;
  }

  if (activeViewName === "Assets") {
    return <AssetsView />;
  }

  if (activeViewName === "Customers") {
    return <CustomersView />;
  }

  if (activeViewName === "Leads") {
    return <LeadsView />;
  }

  if (activeViewName === "Reports") {
    return <ReportsView />;
  }

  if (activeViewName === "Automation") {
    return <FeatureGate session={session} feature="automation" label="Automation"><AutomationView /></FeatureGate>;
  }

  if (activeViewName === "Settings") {
    return <SettingsView />;
  }

  if (activeViewName === "Finance") {
    // Support ?tab=sales (or any valid tab) from sidebar Analytics link
    return <FinanceView defaultTab={tabParam || "overview"} />;
  }

  if (activeViewName === "Ads") {
    return <FinanceView defaultTab="ads" />;
  }

  if (activeViewName === "Social") {
    return <FeatureGate session={session} feature="social" label="Social"><SocialView /></FeatureGate>;
  }

  if (activeViewName === "WhatsApp") {
    return <WhatsAppView />;
  }

  if (activeViewName === "SmartWhatsApp") {
    return <FeatureGate session={session} feature="smart_whatsapp" label="Smart WhatsApp"><SmartWhatsAppView /></FeatureGate>;
  }

  // Fallback to ModuleView for unimplemented modules
  return <ModuleView name={activeViewName} setActiveView={() => {}} />;
}
