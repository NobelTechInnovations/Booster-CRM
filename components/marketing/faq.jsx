import { ChevronRight } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "./eyebrow";

const FAQS = [
  {
    q: "Do I need to migrate my whole store to get started?",
    a: "No — connect your existing Shopify or Amazon store with one-click OAuth and orders start syncing in minutes. If you're specifically moving to a new Shopify store, Store Migration copies customers and orders across without losing history or double-counting revenue.",
  },
  {
    q: "Can I use my own WhatsApp number?",
    a: "Yes, either way: connect via the official WhatsApp Cloud API for the full automation/template experience, or scan a QR code with Smart WhatsApp to pair an existing number directly — no separate Meta migration required.",
  },
  {
    q: "What happens when my trial ends?",
    a: "You keep your data. Upgrade to Growth or Premium anytime from Settings → Plan & Billing to keep your integrations, automations, and WhatsApp/email sending running without interruption.",
  },
  {
    q: "Is the GST report accurate for inter-state orders?",
    a: "Yes — it compares your store's configured Place of Supply against each order's actual delivery state to automatically classify it as CGST+SGST (same state) or IGST (different state), with the correct rate split either way.",
  },
  {
    q: "Can my team have different access levels?",
    a: "Yes — invite teammates as Owner, Admin, Manager, Support, Warehouse, Marketing, or Accountant. Each role only sees and can do what actually fits that job, from day one.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-[700px] px-6 py-24 lg:px-10">
      <Reveal as="div" className="text-center">
        <Eyebrow>
          <span className="mx-auto">Questions</span>
        </Eyebrow>
        <h2 className="mt-4 text-[2rem] font-semibold tracking-[-0.015em] text-[var(--mkt-text)]">Frequently asked questions</h2>
      </Reveal>

      <div className="mt-10 space-y-3">
        {FAQS.map((item, i) => (
          <Reveal as="div" key={item.q} delay={i * 40}>
            <details className="group rounded-xl border border-[var(--mkt-border)] bg-white px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14.5px] font-semibold text-[var(--mkt-text)] marker:content-none">
                {item.q}
                <ChevronRight size={16} className="shrink-0 text-[var(--mkt-muted-soft)] transition-transform duration-200 group-open:rotate-90" />
              </summary>
              <p className="mt-3 text-[14px] leading-[1.65] text-[var(--mkt-muted)]">{item.a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
