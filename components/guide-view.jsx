"use client";

import { useState } from "react";
import {
  BookOpen,
  Camera,
  ChevronDown,
  CircleDollarSign,
  Headset,
  Mail,
  MessageCircle,
  Package2,
  Receipt,
  Store,
  Truck,
  Users,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// One place that answers "how does X actually work" for every major area
// of the app — a persistent sidebar footer link (app/panel/layout.jsx),
// not buried inside a settings tab. Content here mirrors how each feature
// actually behaves in this codebase, not a generic description — written
// from the same source of truth as the features themselves.
const SECTIONS = [
  {
    key: "getting-started",
    icon: Store,
    title: "Getting Started — Connect Your Store",
    summary: "Link your Shopify or Amazon store so orders, products, and customers start syncing in.",
    steps: [
      "Go to Channels → Sales Channels.",
      "Click Connect next to Shopify (or Amazon).",
      "Enter your store's .myshopify.com domain and click Connect — you'll be redirected to Shopify to approve access.",
      "Once approved, you're brought back here automatically and your store starts syncing orders, products, and customers — usually within a few minutes.",
      "Using your own custom Shopify app instead of the shared one? Expand \"This store uses its own Shopify app\" before connecting and enter its Client ID/Secret.",
    ],
  },
  {
    key: "migration",
    icon: Workflow,
    title: "Store Migration — Moving to a New Store",
    summary: "Replace an old Shopify store with a new one without losing order/customer history or double-counting revenue.",
    steps: [
      "Go to Settings → Store Migration.",
      "Connect both your OLD and NEW Shopify stores as separate channels (see Getting Started above).",
      "Pick a source (old) and target (new) store, choose Customers and/or Orders, and click Copy — this only updates this panel's own database, nothing is written to Shopify yet, and it's safe to run again later (already-copied records are skipped).",
      "When you're ready to switch over for real, use \"Push Customers to Shopify\" to create the migrated customers for real in the new store. Orders are never pushed — the new store's own order numbering stays untouched, so you can keep monitoring it manually.",
      "Use \"Turn On Marketing Subscription\" afterward — Shopify has no way to carry email/SMS marketing consent over between stores, so this switches it back on for the customers who moved.",
      "From that point on, every new order lands on whichever store it actually came from, and revenue counts once — the old store's copied orders are excluded from totals so nothing doubles.",
    ],
  },
  {
    key: "fulfillment",
    icon: Truck,
    title: "Shipping & Fulfillment",
    summary: "Connect a courier and ship orders with a real AWB and live tracking.",
    steps: [
      "Go to Channels → Shipping Partners and connect a courier (Delhivery, Shiprocket, Shipway, Velocity, etc.) with your own account credentials.",
      "Go to Orders → Fulfillment — every order not yet shipped shows up here as \"To Ship.\"",
      "Click Ship on an order, pick a pickup warehouse and courier/rate, and confirm — a real shipment (AWB) is booked with that courier and the order moves to \"Shipped.\"",
      "Tracking status updates automatically in the background; once a courier reports delivery, the order moves to \"Delivered\" on its own.",
      "Shipped an order outside the panel (e.g. directly with the courier)? Use \"Mark Shipped Manually\" instead and enter the tracking number yourself — it'll still show up correctly everywhere.",
    ],
  },
  {
    key: "whatsapp",
    icon: MessageCircle,
    title: "WhatsApp",
    summary: "Connect your WhatsApp Business number and chat with customers directly from the panel.",
    steps: [
      "Go to Marketing → WhatsApp.",
      "Click Connect — either paste your own Phone Number ID + access token from Meta Business Manager, or use \"Continue with Facebook\" for a guided setup with no manual token hunting.",
      "Once connected, every incoming customer message shows up as a conversation you can reply to directly, in real time.",
      "To message someone who has never messaged you first, Meta requires an approved message template — pick one from \"New Chat,\" fill in whatever values it asks for, and send.",
      "Getting a \"necessary permissions\" error when sending? Click \"Fix permissions\" right where the error shows — it re-subscribes your app to your WhatsApp Business Account automatically, no reconnect needed.",
    ],
  },
  {
    key: "social",
    icon: Camera,
    title: "Social Media (Instagram / Facebook)",
    summary: "Connect your Page and reply to Instagram/Facebook comments without leaving the panel.",
    steps: [
      "Go to Marketing → Social.",
      "Connect your Facebook Page — this also connects its linked Instagram Business account, if it has one.",
      "Your recent posts and their comments sync in automatically.",
      "Reply to any comment right from the panel — it posts as a real, public reply on the actual Instagram/Facebook post, exactly as if you'd replied there directly.",
    ],
  },
  {
    key: "email",
    icon: Mail,
    title: "Email & Automation",
    summary: "Connect your own email, build templates, and send them automatically on real order events.",
    steps: [
      "Go to Company Manage → Automation.",
      "Under Email Setup, connect your own SMTP. For Gmail: turn on 2-Step Verification, create an App Password at myaccount.google.com/apppasswords, and use that (not your regular password) with host smtp.gmail.com, port 587.",
      "Go to the Email Templates tab — start from a modern preset (Order Confirmed, Shipped, Delivered, Refund Processed, COD Reminder) or write your own using {{customerName}}, {{orderNumber}}, {{trackingUrl}}, and the other listed variables.",
      "Go to the Rules tab, click New Rule, pick a trigger (order placed/shipped/delivered/cancelled/refunded, a COD payment reminder, or your own custom event) and the template it should send.",
      "From then on, that email sends automatically the moment the real event happens — no manual work, and every send is logged in the Send Log tab so you can always see what actually went out.",
    ],
  },
  {
    key: "support",
    icon: Headset,
    title: "Support Tickets",
    summary: "A public help page for your customers, with replies you send from the panel.",
    steps: [
      "Share your public support link with customers: yourapp-domain/support/your-store-slug.",
      "A customer enters a phone or email (or leaves both blank for a general inquiry), picks a category, and submits their issue.",
      "Go to Support in the sidebar to see every ticket — click one to see the full message and reply history.",
      "Type a reply and send — it's saved to the ticket and, if the customer gave an email, emailed to them automatically through the same SMTP you connected for Automation.",
      "Move a ticket through its stages as you work it — Open → In Progress (happens automatically on your first reply) → Resolved → Closed.",
    ],
  },
  {
    key: "reports",
    icon: Receipt,
    title: "Reports & GST",
    summary: "Sales, tax, and expense reports — export any of them as CSV.",
    steps: [
      "Go to Company Manage → Reports.",
      "Pick a report type (Sales, GST/Tax, Expenses, Channel-wise Sales, and more) and a date range.",
      "\"Avg Order Value\" on the Sales report is just revenue ÷ orders for that day.",
      "For the GST report specifically, set your Place of Supply under Settings → Tax first — that's what the report uses (alongside each order's own delivery state) to work out whether an order is CGST+SGST (same state) or IGST (different state).",
      "Export any report as CSV to open in Excel or Google Sheets.",
    ],
  },
  {
    key: "team",
    icon: Users,
    title: "Team & Roles",
    summary: "Invite teammates with exactly the access their job needs.",
    steps: [
      "Go to Company Manage → Users.",
      "Click Add User, enter their name/email/password, and pick a role — Owner, Admin, Manager, Support, Warehouse, Marketing, or Accountant.",
      "Each role only sees and can do what actually fits that job — e.g. Warehouse can pack and manage shipping but can't touch billing; Support can manage tickets and view orders/customers but not finance.",
    ],
  },
  {
    key: "billing",
    icon: CircleDollarSign,
    title: "Billing & Plans",
    summary: "See your current plan, its limits, and your wallet balance.",
    steps: [
      "Go to Settings → Plan & Billing to see your current plan, what features it includes, and any per-order fulfillment fee.",
      "Your wallet balance (used for usage-based charges like per-order fees) is shown there too.",
      "Reach out if you need more users, sales/shipping channels, or a feature unlocked — plan limits and features are configured on your account.",
    ],
  },
];

function GuideSection({ section, isOpen, onToggle }) {
  const Icon = section.icon;
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-xs">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50/60"
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{section.title}</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">{section.summary}</p>
        </div>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen ? (
        <div className="border-t border-slate-100 px-5 py-4">
          <ol className="space-y-2.5">
            {section.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm leading-6 text-slate-700">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

export function GuideView() {
  const [openKey, setOpenKey] = useState(SECTIONS[0].key);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
      <section className="mb-6">
        <Badge tone="indigo">Guide</Badge>
        <h1 className="mt-3 flex items-center gap-2.5 text-2xl tracking-tight text-slate-950 md:text-[24px]">
          <BookOpen size={22} className="text-indigo-600" />
          Help &amp; Guides
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Step-by-step for every part of the panel — click a section to expand it.
        </p>
      </section>

      <div className="space-y-3">
        {SECTIONS.map((section) => (
          <GuideSection
            key={section.key}
            section={section}
            isOpen={openKey === section.key}
            onToggle={() => setOpenKey((k) => (k === section.key ? "" : section.key))}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--panel-soft)] px-4 py-3 text-xs text-slate-500">
        <Package2 size={14} className="shrink-0" />
        Still stuck on something not covered here? Reach out to your account contact — this guide keeps growing as new features ship.
      </div>
    </div>
  );
}
