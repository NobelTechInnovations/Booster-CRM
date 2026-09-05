import Link from "next/link";
import { Layers3 } from "lucide-react";

// Only real links — no placeholder Blog/Careers/API/Docs columns pointing
// at pages that don't exist in this app yet. A premium footer with three
// honest columns beats a five-column one padded with dead links.
export function Footer() {
  return (
    <footer className="border-t border-[var(--mkt-border)] bg-white">
      <div className="mx-auto max-w-[1320px] px-6 py-14 lg:px-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--primary)] text-white">
                <Layers3 size={16} />
              </div>
              <span className="text-[14px] font-semibold text-[var(--mkt-text)]">Wokbook</span>
            </Link>
            <p className="mt-3 max-w-xs text-[13.5px] leading-[1.6] text-[var(--mkt-muted)]">
              The commerce operating system for DTC and multi-brand sellers — orders, shipping, WhatsApp, email, support, finance, and ads in one panel.
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mkt-muted-soft)]">Product</p>
            <ul className="mt-3 space-y-2.5">
              <li><a href="#platform" className="text-[13.5px] text-[var(--mkt-muted)] hover:text-[var(--primary)]">Platform</a></li>
              <li><a href="#features" className="text-[13.5px] text-[var(--mkt-muted)] hover:text-[var(--primary)]">Features</a></li>
              <li><a href="#integrations" className="text-[13.5px] text-[var(--mkt-muted)] hover:text-[var(--primary)]">Integrations</a></li>
              <li><a href="#pricing" className="text-[13.5px] text-[var(--mkt-muted)] hover:text-[var(--primary)]">Pricing</a></li>
              <li><a href="#faq" className="text-[13.5px] text-[var(--mkt-muted)] hover:text-[var(--primary)]">FAQ</a></li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--mkt-muted-soft)]">Account</p>
            <ul className="mt-3 space-y-2.5">
              <li><Link href="/login" className="text-[13.5px] text-[var(--mkt-muted)] hover:text-[var(--primary)]">Login</Link></li>
              <li><Link href="/signup" className="text-[13.5px] text-[var(--mkt-muted)] hover:text-[var(--primary)]">Create company workspace</Link></li>
              <li><Link href="/privacy" className="text-[13.5px] text-[var(--mkt-muted)] hover:text-[var(--primary)]">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-[var(--mkt-border)] pt-6">
          <p className="text-[12px] text-[var(--mkt-muted-soft)]">Wokbook · Commerce Operating System — All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
