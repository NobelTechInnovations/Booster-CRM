"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Layers3, LockKeyhole, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "#platform", label: "Platform" },
  { href: "#features", label: "Features" },
  { href: "#integrations", label: "Integrations" },
  { href: "#pricing", label: "Pricing" },
];

// Sticky nav that picks up a border/shadow only once the page has actually
// scrolled — a plain always-on border reads flat against the hero; this one
// small scroll listener (passive, cheap) is the only bit of "chrome" JS on
// an otherwise mostly-static marketing page.
export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 bg-[var(--mkt-bg)]/85 backdrop-blur-md transition-shadow duration-200 ${
        scrolled ? "border-b border-[var(--mkt-border)] shadow-[0_1px_0_rgba(20,21,26,0.02)]" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-[1320px] items-center justify-between px-6 lg:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--primary)] text-white">
            <Layers3 size={16} />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-[var(--mkt-text)]">Wokbook</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-[14px] font-medium text-[var(--mkt-muted)] transition-colors hover:text-[var(--mkt-text)]">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2.5 md:flex">
          <Link href="/login">
            <Button variant="secondary" className="h-9 text-[13px]">
              <LockKeyhole size={14} />
              Sign in
            </Button>
          </Link>
          <Link href="/signup">
            <Button className="h-9 text-[13px]">
              Get Started
              <ArrowRight size={14} />
            </Button>
          </Link>
        </div>

        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="grid h-9 w-9 place-items-center rounded-lg text-[var(--mkt-text)] md:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-[var(--mkt-border)] bg-[var(--mkt-bg)] px-6 py-5 md:hidden">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-[var(--mkt-text)] hover:bg-black/[0.03]"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2.5 border-t border-[var(--mkt-border)] pt-4">
            <Link href="/login" onClick={() => setMobileOpen(false)}>
              <Button variant="secondary" className="h-10 w-full text-sm">
                <LockKeyhole size={15} />
                Sign in
              </Button>
            </Link>
            <Link href="/signup" onClick={() => setMobileOpen(false)}>
              <Button className="h-10 w-full text-sm">
                Get Started
                <ArrowRight size={15} />
              </Button>
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
