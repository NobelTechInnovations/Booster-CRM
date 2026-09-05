import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/reveal";

export function FinalCta() {
  return (
    <section className="mx-auto max-w-[1320px] px-6 py-24 lg:px-10">
      <Reveal
        as="div"
        className="relative overflow-hidden rounded-3xl bg-[var(--mkt-dark-bg)] px-8 py-20 text-center md:px-16"
      >
        <div className="pointer-events-none absolute -top-24 left-1/2 h-[280px] w-[560px] -translate-x-1/2 rounded-full bg-[var(--primary)]/20 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.015em] text-[var(--mkt-dark-text)] md:text-[2.9rem]">
            One platform.
            <br />
            Every channel.
            <br />
            Complete control.
          </h2>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup">
              <Button className="h-11 px-5 text-[14px]">
                Get Started
                <ArrowRight size={16} />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="secondary" className="h-11 border-white/15 bg-transparent px-5 text-[14px] text-white hover:bg-white/10">
                Login to Panel
                <ChevronRight size={16} />
              </Button>
            </Link>
          </div>
          <p className="mt-5 text-[13px] text-[var(--mkt-dark-muted)]">No credit card required.</p>
        </div>
      </Reveal>
    </section>
  );
}
