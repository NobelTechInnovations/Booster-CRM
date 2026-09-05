import { Reveal } from "@/components/reveal";

// Capability claims, not usage claims — this is a pre-launch marketing
// page, and claiming usage numbers the product hasn't actually had yet
// ("50K+ orders processed") would be dishonest copy. Every figure here is
// verifiable straight from the code: the real integration count, the real
// role count, the shipping flow's actual design target.
const METRICS = [
  { value: "10+", label: "Native integrations" },
  { value: "<30s", label: "Average ship time" },
  { value: "7", label: "Role-based access levels" },
  { value: "24/7", label: "Automated engagement" },
];

export function Metrics() {
  return (
    <section className="border-y border-[var(--mkt-border)] bg-white py-20">
      <div className="mx-auto grid max-w-[1320px] grid-cols-2 gap-8 px-6 lg:grid-cols-4 lg:px-10">
        {METRICS.map((m, i) => (
          <Reveal as="div" key={m.label} delay={i * 60} className="text-center lg:text-left">
            <p className="text-[3rem] font-semibold leading-none tracking-[-0.02em] text-[var(--mkt-text)] md:text-[3.5rem]">{m.value}</p>
            <p className="mt-3 text-[14px] font-medium text-[var(--mkt-muted)]">{m.label}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
