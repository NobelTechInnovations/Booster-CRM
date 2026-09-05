import { Clock3, MessageSquareWarning, ScanLine, TrendingDown } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "./eyebrow";

const PROBLEMS = [
  {
    icon: ScanLine,
    title: "Fragmented operations",
    desc: "Orders, inventory, and customer messages live in five different tabs, and nothing reconciles automatically.",
  },
  {
    icon: Clock3,
    title: "Manual busywork",
    desc: "Someone copies tracking numbers into WhatsApp by hand, and courier rates get compared one browser tab at a time.",
  },
  {
    icon: TrendingDown,
    title: "Profit you can't see",
    desc: "Revenue looks fine in Shopify, but nobody knows today's real margin after ad spend, COGS, and returns.",
  },
  {
    icon: MessageSquareWarning,
    title: "Support that falls through",
    desc: "A customer messages on WhatsApp, emails support, and opens a ticket — three people reply three different things.",
  },
];

export function ProblemSection() {
  return (
    <section className="mx-auto max-w-[1320px] px-6 py-24 lg:px-10">
      <Reveal as="div" className="max-w-[640px]">
        <Eyebrow>The Problem</Eyebrow>
        <h2 className="mt-4 text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.015em] text-[var(--mkt-text)] md:text-[2.75rem]">
          More channels shouldn&rsquo;t mean more chaos.
        </h2>
        <p className="mt-4 text-[17px] leading-[1.65] text-[var(--mkt-muted)]">
          Most growing brands end up stitching together a support inbox, a shipping panel, a spreadsheet for finance, the WhatsApp Business app, and an email tool — and none of them talk to each other.
        </p>
      </Reveal>

      <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-[var(--mkt-border)] bg-[var(--mkt-border)] sm:grid-cols-2 lg:grid-cols-4">
        {PROBLEMS.map((p, i) => (
          <Reveal as="div" key={p.title} delay={i * 60} className="bg-white p-7">
            <p.icon size={20} className="text-[var(--mkt-muted)]" strokeWidth={1.75} />
            <h3 className="mt-4 text-[15px] font-semibold text-[var(--mkt-text)]">{p.title}</h3>
            <p className="mt-2 text-[14px] leading-[1.6] text-[var(--mkt-muted)]">{p.desc}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
