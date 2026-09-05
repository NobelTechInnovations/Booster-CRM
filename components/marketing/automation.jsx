import { CheckCircle2, Mail, MessageCircle, ShoppingCart, Truck } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "./eyebrow";

// The real chain — these are the actual triggers the automation dispatcher
// fires on (order_placed → order_fulfilled → order_delivered), not a
// generic ERP-workflow diagram.
const STEPS = [
  { icon: ShoppingCart, title: "Order placed", desc: "Shopify or Amazon webhook lands the order in your panel instantly." },
  { icon: Mail, title: "Confirmation sent", desc: "An email fires automatically from your own connected SMTP — no manual send." },
  { icon: Truck, title: "Fulfilled & shipped", desc: "Courier booked, tracking number attached, synced back to the order." },
  { icon: MessageCircle, title: "Customer updated", desc: "A WhatsApp template lets them know it's on the way — automatically." },
  { icon: CheckCircle2, title: "Delivered", desc: "Marked delivered the moment the courier confirms it — every send logged." },
];

export function Automation() {
  return (
    <section className="bg-[var(--mkt-dark-bg)] py-24">
      <div className="mx-auto max-w-[1320px] px-6 lg:px-10">
        <Reveal as="div" className="mx-auto max-w-[560px] text-center">
          <Eyebrow tone="dark">
            <span className="mx-auto">Automation</span>
          </Eyebrow>
          <h2 className="mt-4 text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.015em] text-[var(--mkt-dark-text)] md:text-[2.75rem]">
            Let your operation run itself.
          </h2>
          <p className="mt-4 text-[16px] leading-[1.65] text-[var(--mkt-dark-muted)]">
            Build the rule once. From then on, every order moves through the same chain automatically — with a record of every send.
          </p>
        </Reveal>

        <div className="mx-auto mt-16 max-w-[620px]">
          {STEPS.map((step, i) => (
            <Reveal as="div" key={step.title} delay={i * 70}>
              <div className="flex gap-5">
                <div className="flex flex-col items-center">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--mkt-dark-border)] bg-[var(--mkt-dark-surface)] text-[var(--primary)]">
                    <step.icon size={19} />
                  </div>
                  {i < STEPS.length - 1 ? <div className="my-1 w-px flex-1 bg-[var(--mkt-dark-border)]" /> : null}
                </div>
                <div className="pb-9">
                  <h3 className="pt-2 text-[15px] font-semibold text-[var(--mkt-dark-text)]">{step.title}</h3>
                  <p className="mt-1 text-[13.5px] leading-[1.6] text-[var(--mkt-dark-muted)]">{step.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
