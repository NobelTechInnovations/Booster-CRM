import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, Layers3, LockKeyhole, ShieldCheck, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-[var(--line)] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-teal-700 text-white">
              <Layers3 size={21} />
            </div>
            <div>
              <p className="text-sm font-bold leading-5">CommerceOS</p>
              <p className="text-xs text-[var(--muted)]">Sukirti Commerce Hub</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="secondary">Login</Button>
            </Link>
            <Link href="/signup">
              <Button>
                Start
                <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 lg:grid-cols-[1fr_460px] lg:items-center lg:py-16">
        <div>
          <Badge tone="teal">Phase 1 authentication ready</Badge>
          <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-normal text-slate-950 md:text-6xl">
            Company login and commerce control panel for growing brands.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--muted)] md:text-lg">
            Create a company workspace, sign in securely, and enter a role-based operations panel for dashboard, orders, inventory, channels, finance, and reports.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/signup">
              <Button className="h-11 px-4">
                Create Company
                <Building2 size={17} />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="secondary" className="h-11 px-4">
                Login to Panel
                <LockKeyhole size={17} />
              </Button>
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-[var(--shadow)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
            <div>
              <p className="font-bold">Workspace setup</p>
              <p className="text-sm text-[var(--muted)]">Phase 1 flow</p>
            </div>
            <Badge tone="green">Live</Badge>
          </div>
          <div className="mt-5 space-y-4">
            {[
              ["Create company", "Company name, owner name, email, password"],
              ["Secure login", "JWT session saved in browser storage"],
              ["Role mapping", "Owner role gets full permissions"],
              ["Panel access", "Authenticated users enter the operations panel"],
            ].map(([title, text]) => (
              <div key={title} className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                <CheckCircle2 className="mt-0.5 text-teal-700" size={18} />
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-[var(--muted)]">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--line)] bg-white">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-8 md:grid-cols-3">
          <Feature icon={ShieldCheck} title="JWT Authentication" text="Backend signs company-aware user sessions." />
          <Feature icon={UsersRound} title="Roles & Permissions" text="Owner, Admin, Manager, Support, Warehouse, Marketing, Accountant." />
          <Feature icon={Building2} title="Company Workspace" text="Every user, channel, and operation is mapped to a company." />
        </div>
      </section>
    </main>
  );
}

function Feature({ icon: Icon, title, text }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-4">
      <Icon className="text-teal-700" size={22} />
      <h2 className="mt-3 font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{text}</p>
    </div>
  );
}
