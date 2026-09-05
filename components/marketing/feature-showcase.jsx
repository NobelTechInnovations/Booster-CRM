import { AlertTriangle, ArrowDown, Boxes, Package, TrendingUp } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "./eyebrow";

// One alternating text/visual row — reused for all four feature sections
// below, each swapping which side the visual sits on.
function FeatureRow({ eyebrow, title, desc, visual, reverse }) {
  return (
    <div className={`grid items-center gap-14 py-20 lg:grid-cols-2 ${reverse ? "" : ""}`}>
      <Reveal as="div" className={reverse ? "lg:order-2" : ""}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="mt-4 max-w-md text-[1.85rem] font-semibold leading-[1.2] tracking-[-0.01em] text-[var(--mkt-text)] md:text-[2.1rem]">
          {title}
        </h3>
        <p className="mt-4 max-w-[440px] text-[16px] leading-[1.65] text-[var(--mkt-muted)]">{desc}</p>
      </Reveal>
      <Reveal as="div" delay={80} className={reverse ? "lg:order-1" : ""}>
        {visual}
      </Reveal>
    </div>
  );
}

function VisualCard({ children }) {
  return (
    <div className="rounded-2xl border border-[var(--mkt-border)] bg-white p-6 shadow-[0_16px_50px_-24px_rgba(20,21,26,0.16)]">
      {children}
    </div>
  );
}

// Only integrations that actually exist in the product — no invented
// marketplace logos.
const CHANNEL_BADGES = ["Shopify", "Amazon", "Delhivery", "Shiprocket", "Shipway", "Velocity", "Shipmozo"];

function ChannelsVisual() {
  return (
    <VisualCard>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mkt-muted-soft)]">Connected today</p>
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {CHANNEL_BADGES.map((name) => (
          <div key={name} className="flex items-center justify-center rounded-xl border border-black/[0.05] bg-[var(--mkt-bg)] px-3 py-3 text-[13px] font-semibold text-[var(--mkt-text)]">
            {name}
          </div>
        ))}
      </div>
    </VisualCard>
  );
}

function InventoryVisual() {
  const stats = [
    { icon: Boxes, label: "Total SKUs", value: "1,284" },
    { icon: Package, label: "Units in Stock", value: "18,940" },
    { icon: TrendingUp, label: "Avg. Margin", value: "34.2%", tone: "text-emerald-700" },
    { icon: AlertTriangle, label: "Low Stock (≤5 units)", value: "12", tone: "text-amber-700" },
  ];
  return (
    <VisualCard>
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-black/[0.05] p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-[var(--mkt-muted-soft)]">{s.label}</p>
              <s.icon size={14} className="text-[var(--mkt-muted-soft)]" />
            </div>
            <p className={`mt-1.5 text-lg font-semibold ${s.tone || "text-[var(--mkt-text)]"}`}>{s.value}</p>
          </div>
        ))}
      </div>
    </VisualCard>
  );
}

function AutomationVisual() {
  const steps = [
    { label: "WHEN", value: "Order placed" },
    { label: "THEN", value: "Send confirmation email" },
    { label: "THEN", value: "Ship & sync tracking" },
    { label: "THEN", value: "Delivered → thank-you WhatsApp" },
  ];
  return (
    <VisualCard>
      <div className="space-y-0">
        {steps.map((s, i) => (
          <div key={s.value}>
            <div className="flex items-center gap-3 rounded-xl border border-black/[0.05] px-4 py-3">
              <span className="w-11 shrink-0 text-[10px] font-bold uppercase tracking-wide text-[var(--primary)]">{s.label}</span>
              <span className="text-[13.5px] font-medium text-[var(--mkt-text)]">{s.value}</span>
            </div>
            {i < steps.length - 1 ? (
              <div className="flex justify-center py-1">
                <ArrowDown size={13} className="text-[var(--mkt-muted-soft)]" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </VisualCard>
  );
}

function GrowthVisual() {
  const bars = [30, 48, 40, 62, 55, 74, 68, 82];
  return (
    <VisualCard>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-black/[0.05] p-3.5">
          <p className="text-[11px] font-medium text-[var(--mkt-muted-soft)]">ROAS (Meta)</p>
          <p className="mt-1 text-lg font-semibold text-[var(--mkt-text)]">3.4×</p>
        </div>
        <div className="rounded-xl border border-black/[0.05] p-3.5">
          <p className="text-[11px] font-medium text-[var(--mkt-muted-soft)]">Net Margin</p>
          <p className="mt-1 text-lg font-semibold text-emerald-700">36%</p>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-black/[0.05] p-3.5">
        <p className="text-[11px] font-medium text-[var(--mkt-muted-soft)]">Revenue trend</p>
        <div className="mt-3 flex h-20 items-end gap-1.5">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 rounded-t-sm bg-[var(--primary)]" style={{ height: `${h}%`, opacity: 0.5 + i * 0.06 }} />
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-black/[0.05] px-3.5 py-2.5 text-[12.5px]">
        <span className="text-[var(--mkt-muted)]">GST split (this order)</span>
        <span className="font-semibold text-[var(--mkt-text)]">CGST + SGST</span>
      </div>
    </VisualCard>
  );
}

export function FeatureShowcase() {
  return (
    <section id="features" className="mx-auto max-w-[1320px] divide-y divide-[var(--mkt-border)] px-6 lg:px-10">
      <FeatureRow
        eyebrow="Sell Everywhere"
        title="Connect every channel."
        desc="Shopify and Amazon orders sync in real time via webhooks. Compare live rates across five courier partners and book a shipment without leaving the order."
        visual={<ChannelsVisual />}
      />
      <FeatureRow
        eyebrow="Fulfill Fast"
        title="Keep inventory synchronized."
        desc="Stock levels stay in sync across every connected channel automatically — with a clear low-stock alert before you oversell."
        visual={<InventoryVisual />}
        reverse
      />
      <FeatureRow
        eyebrow="Engage Customers"
        title="Automate your operations."
        desc="Build a rule once — order placed, shipped, delivered, refunded, or a fully custom trigger — and it fires automatically, every time, logged for you to review."
        visual={<AutomationVisual />}
      />
      <FeatureRow
        eyebrow="Grow With Data"
        title="Know exactly what's driving growth."
        desc="Real-time ad spend and attributed ROAS from Meta Ads, GST-ready CGST/SGST/IGST splits, and true profit after costs — no spreadsheet reconciliation."
        visual={<GrowthVisual />}
        reverse
      />
    </section>
  );
}
