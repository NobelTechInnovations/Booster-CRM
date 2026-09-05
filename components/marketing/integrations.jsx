import { Layers3 } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { Eyebrow } from "./eyebrow";

// Only real, shipped integrations — grouped where listing every individual
// courier separately would clutter an otherwise elegant diagram.
const NODES = [
  "Shopify",
  "Amazon",
  "Meta Ads",
  "WhatsApp",
  "Instagram & Facebook",
  "Email (SMTP)",
  "5 Courier Partners",
  "GST & Finance",
];

function radialPosition(index, total, radius) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return {
    left: `${50 + radius * Math.cos(angle)}%`,
    top: `${50 + radius * Math.sin(angle)}%`,
  };
}

export function Integrations() {
  const radius = 42;
  return (
    <section id="integrations" className="mx-auto max-w-[1320px] px-6 py-24 lg:px-10">
      <Reveal as="div" className="mx-auto max-w-[560px] text-center">
        <Eyebrow>
          <span className="mx-auto">Integration Ecosystem</span>
        </Eyebrow>
        <h2 className="mt-4 text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.015em] text-[var(--mkt-text)] md:text-[2.75rem]">
          Connect your entire commerce stack.
        </h2>
      </Reveal>

      <Reveal as="div" delay={100} className="relative mx-auto mt-16 aspect-square max-w-[560px]">
        <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
          {NODES.map((_, i) => {
            const pos = radialPosition(i, NODES.length, radius);
            return (
              <line
                key={i}
                x1="50%"
                y1="50%"
                x2={pos.left}
                y2={pos.top}
                stroke="var(--mkt-border-strong)"
                strokeWidth="1"
              />
            );
          })}
        </svg>

        <div className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-[var(--primary)] text-white shadow-[0_16px_40px_-12px_rgba(67,97,238,0.5)]">
          <Layers3 size={28} />
        </div>

        {NODES.map((name, i) => {
          const pos = radialPosition(i, NODES.length, radius);
          return (
            <div
              key={name}
              className="absolute max-w-[110px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--mkt-border)] bg-white px-3 py-2 text-center text-[12px] font-semibold text-[var(--mkt-text)] shadow-[0_6px_18px_-8px_rgba(20,21,26,0.14)]"
              style={pos}
            >
              {name}
            </div>
          );
        })}
      </Reveal>
    </section>
  );
}
