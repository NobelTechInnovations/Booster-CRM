import { Database, FileDown, History, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "./eyebrow";

// Every line here is a real, shipped behavior — not generic "enterprise-
// grade security" filler. If it's not something the codebase actually
// does today, it doesn't belong on this list.
const ITEMS = [
  { icon: ShieldCheck, title: "Role-based access control", desc: "Seven built-in roles — Owner, Admin, Manager, Support, Warehouse, Marketing, Accountant — each scoped to exactly what their job needs." },
  { icon: Database, title: "Real-time sync, not polling", desc: "Shopify and Amazon orders, cancellations, and fulfillments land via webhooks the moment they happen." },
  { icon: RefreshCw, title: "Resilient by design", desc: "Automatic reconnect on a transient database hiccup, so a brief connection issue never turns into visible downtime." },
  { icon: History, title: "Every send is logged", desc: "Order emails, WhatsApp templates, and support notifications are recorded in an audit trail — never just fired and forgotten." },
  { icon: LockKeyhole, title: "Rate-limited public endpoints", desc: "Every no-login page — order tracking, support tickets — is rate-limited per visitor against abuse." },
  { icon: FileDown, title: "Data export on request", desc: "Company data export requests are reviewed and approved by our team before anything leaves the platform." },
];

export function EnterpriseTrust() {
  return (
    <section className="mx-auto max-w-[1320px] px-6 py-24 lg:px-10">
      <Reveal as="div" className="max-w-[560px]">
        <Eyebrow>Built to be trusted</Eyebrow>
        <h2 className="mt-4 text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.015em] text-[var(--mkt-text)] md:text-[2.75rem]">
          Reliable enough to run your operation on.
        </h2>
      </Reveal>

      <div className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {ITEMS.map((item, i) => (
          <Reveal as="div" key={item.title} delay={i * 50}>
            <item.icon size={20} className="text-[var(--primary)]" strokeWidth={1.75} />
            <h3 className="mt-3.5 text-[15px] font-semibold text-[var(--mkt-text)]">{item.title}</h3>
            <p className="mt-2 text-[14px] leading-[1.6] text-[var(--mkt-muted)]">{item.desc}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
