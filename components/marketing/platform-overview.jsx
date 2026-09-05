import { MessageCircle, PlugZap, TrendingUp, Truck } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "./eyebrow";

const ITEMS = [
  { n: "01", icon: PlugZap, title: "Connect every channel", desc: "Shopify and Amazon sync in real time via webhooks — no CSV uploads, no duplicate entries." },
  { n: "02", icon: Truck, title: "Automate fulfillment", desc: "Compare live courier rates across every connected partner and book a shipment in under 30 seconds." },
  { n: "03", icon: MessageCircle, title: "Engage on autopilot", desc: "WhatsApp, email, and support tickets that follow up — and close themselves — without you." },
  { n: "04", icon: TrendingUp, title: "Know your real numbers", desc: "Meta Ads ROAS, GST-ready reports, and true profit after costs, in one view." },
];

export function PlatformOverview() {
  return (
    <section id="platform" className="border-y border-[var(--mkt-border)] bg-white py-24">
      <div className="mx-auto grid max-w-[1320px] gap-16 px-6 lg:grid-cols-2 lg:items-center lg:px-10">
        <Reveal as="div">
          <div className="rounded-2xl border border-[var(--mkt-border)] bg-[var(--mkt-bg)] p-6">
            <div className="rounded-xl border border-[var(--mkt-border)] bg-white p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mkt-muted-soft)]">This week</p>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-2xl font-semibold text-[var(--mkt-text)]">312</p>
                  <p className="mt-1 text-[11px] text-[var(--mkt-muted)]">Orders synced</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-[var(--mkt-text)]">28s</p>
                  <p className="mt-1 text-[11px] text-[var(--mkt-muted)]">Avg. ship time</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-[var(--mkt-text)]">96</p>
                  <p className="mt-1 text-[11px] text-[var(--mkt-muted)]">WhatsApp replies</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {["Order #4521 shipped via Delhivery", "WhatsApp template sent to 12 customers", "GST report exported for August"].map((line) => (
                  <div key={line} className="flex items-center gap-2.5 rounded-lg bg-[var(--mkt-bg)] px-3 py-2 text-[12px] text-[var(--mkt-muted)]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>

        <div>
          <Reveal as="div">
            <Eyebrow>The Platform</Eyebrow>
            <h2 className="mt-4 max-w-md text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.015em] text-[var(--mkt-text)] md:text-[2.75rem]">
              Everything you need to run commerce at scale.
            </h2>
          </Reveal>

          <div className="mt-10 space-y-8">
            {ITEMS.map((item, i) => (
              <Reveal as="div" key={item.n} delay={i * 60} className="flex gap-5">
                <div className="shrink-0">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]">
                    <item.icon size={20} />
                  </div>
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-[var(--mkt-muted-soft)]">{item.n}</p>
                  <h3 className="mt-0.5 text-[16px] font-semibold text-[var(--mkt-text)]">{item.title}</h3>
                  <p className="mt-1.5 max-w-[440px] text-[14px] leading-[1.6] text-[var(--mkt-muted)]">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
