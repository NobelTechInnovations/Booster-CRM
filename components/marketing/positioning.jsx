import { Reveal } from "@/components/reveal";

// Deliberately not a customer testimonial — this is a pre-launch product
// with no real customers to quote yet, and fabricating a named "customer"
// quote would be exactly the kind of fake social proof worth refusing to
// write. This is the product's own stated position instead, presented as
// such rather than disguised as something it isn't.
export function Positioning() {
  return (
    <section className="border-y border-[var(--mkt-border)] bg-white py-24">
      <div className="mx-auto max-w-[760px] px-6 text-center lg:px-10">
        <Reveal as="blockquote">
          <p className="text-[1.75rem] font-semibold leading-[1.35] tracking-[-0.01em] text-[var(--mkt-text)] md:text-[2.15rem]">
            We built Wokbook because running a growing brand shouldn&rsquo;t mean logging into six different tools before your first coffee.
          </p>
          <p className="mt-6 text-[15px] font-medium text-[var(--mkt-muted)]">— The Wokbook team</p>
        </Reveal>
      </div>
    </section>
  );
}
