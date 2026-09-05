import { Navbar } from "@/components/marketing/navbar";
import { Hero } from "@/components/marketing/hero";
import { ProblemSection } from "@/components/marketing/problem-section";
import { PlatformOverview } from "@/components/marketing/platform-overview";
import { ProductShowcase } from "@/components/marketing/product-showcase";
import { FeatureShowcase } from "@/components/marketing/feature-showcase";
import { Metrics } from "@/components/marketing/metrics";
import { Integrations } from "@/components/marketing/integrations";
import { Automation } from "@/components/marketing/automation";
import { Positioning } from "@/components/marketing/positioning";
import { EnterpriseTrust } from "@/components/marketing/enterprise-trust";
import { Pricing } from "@/components/marketing/pricing";
import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { Footer } from "@/components/marketing/footer";

// Public marketing homepage. Deliberately does NOT include a "Trusted by"
// logo strip, customer testimonials, or case studies — this is a
// pre-launch product with no real customers yet, and fabricating named
// customer quotes or logos would be fake social proof. See Positioning
// for what replaces that section instead: the product's own stated
// position, presented as such.
export default function Home() {
  return (
    <main className="marketing min-h-screen bg-[var(--mkt-bg)]">
      <Navbar />
      <Hero />
      <ProblemSection />
      <PlatformOverview />
      <ProductShowcase />
      <FeatureShowcase />
      <Metrics />
      <Integrations />
      <Automation />
      <Positioning />
      <EnterpriseTrust />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
    </main>
  );
}
