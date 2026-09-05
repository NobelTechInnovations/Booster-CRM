import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "./eyebrow";

// Mirrors the real, admin-configured plans (Plan model / app/admin/plans) —
// update this list if pricing or included features change there; there's
// no public plans endpoint yet, so this is intentionally static copy, not
// a live fetch.
const PLANS = [
  {
    name: "Trial",
    price: "Free",
    period: "for 7 days",
    blurb: "Every feature unlocked — see if Wokbook fits before you commit.",
    limits: "Up to 2 users · 3 sales channels · 1 shipping partner",
    features: ["WhatsApp (Cloud API)", "Smart WhatsApp", "Social Media", "Automation", "Advanced Reports"],
    cta: "Start free trial",
    highlight: false,
  },
  {
    name: "Growth",
    price: "₹999",
    period: "/ month",
    blurb: "For brands past their first few hundred orders.",
    limits: "Up to 5 users · 5 sales channels · 2 shipping partners",
    features: ["WhatsApp (Cloud API)", "Automation", "Social Media"],
    cta: "Get Growth",
    highlight: true,
  },
  {
    name: "Premium",
    price: "₹1,999",
    period: "/ month",
    blurb: "For multi-brand sellers running serious volume.",
    limits: "Unlimited users, sales channels & shipping partners",
    features: ["WhatsApp (Cloud API)", "Smart WhatsApp", "Social Media", "Automation", "Advanced Reports", "Multi-Channel Selling", "Store Migration"],
    footnote: "+ ₹2 per order fulfillment fee, billed from your wallet as orders ship.",
    cta: "Get Premium",
    highlight: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="border-y border-[var(--mkt-border)] bg-white py-24">
      <div className="mx-auto max-w-[1320px] px-6 lg:px-10">
        <Reveal as="div" className="mx-auto max-w-[560px] text-center">
          <Eyebrow>
            <span className="mx-auto">Simple, transparent pricing</span>
          </Eyebrow>
          <h2 className="mt-4 text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.015em] text-[var(--mkt-text)] md:text-[2.75rem]">
            A plan for every stage of growth.
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-[var(--mkt-muted)]">Start free, upgrade when you&rsquo;re ready. No setup fees, cancel anytime.</p>
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan, i) => (
            <Reveal
              as="div"
              key={plan.name}
              delay={i * 70}
              className={`relative flex flex-col rounded-2xl border bg-white p-8 ${
                plan.highlight ? "border-[var(--primary)] shadow-[0_24px_60px_-24px_rgba(67,97,238,0.28)] lg:-translate-y-2" : "border-[var(--mkt-border)]"
              }`}
            >
              {plan.highlight ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--primary)] px-3 py-1 text-[11px] font-semibold text-white">
                  Most Popular
                </span>
              ) : null}

              <h3 className="text-[16px] font-semibold text-[var(--mkt-text)]">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-[2.5rem] font-semibold tracking-[-0.02em] text-[var(--mkt-text)]">{plan.price}</span>
                <span className="text-[13px] font-medium text-[var(--mkt-muted-soft)]">{plan.period}</span>
              </div>
              <p className="mt-3 text-[14px] leading-[1.6] text-[var(--mkt-muted)]">{plan.blurb}</p>
              <p className="mt-4 rounded-lg bg-[var(--mkt-bg)] px-3 py-2 text-[12px] font-medium text-[var(--mkt-muted)]">{plan.limits}</p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13.5px] text-[var(--mkt-text)]">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[var(--primary)]" />
                    {f}
                  </li>
                ))}
              </ul>

              {plan.footnote ? <p className="mt-4 text-[11px] leading-[1.5] text-[var(--mkt-muted-soft)]">{plan.footnote}</p> : null}

              <Link href="/signup" className="mt-6 block">
                <Button variant={plan.highlight ? "primary" : "secondary"} className="h-11 w-full text-[13.5px]">
                  {plan.cta}
                  <ArrowRight size={15} />
                </Button>
              </Link>
            </Reveal>
          ))}
        </div>

        <p className="mt-8 text-center text-[12px] text-[var(--mkt-muted-soft)]">
          All prices in INR, excluding applicable taxes. Only Premium carries a per-order fulfillment fee — Growth and Trial have none.
        </p>
      </div>
    </section>
  );
}
