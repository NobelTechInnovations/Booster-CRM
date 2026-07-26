"use client";

import Link from "next/link";
import { Layers3 } from "lucide-react";

export function AuthLayout({ eyebrow, title, text, children }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_520px]">
      <section className="flex flex-col justify-between bg-white px-4 py-6 lg:px-10">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-teal-700 text-white">
            <Layers3 size={21} />
          </div>
          <div>
            <p className="text-sm font-bold leading-5">CommerceOS</p>
            <p className="text-xs text-[var(--muted)]">Sukirti Commerce Hub</p>
          </div>
        </Link>

        <div className="mx-auto w-full max-w-2xl py-12">
          <p className="text-sm font-semibold uppercase text-teal-700">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-bold tracking-normal text-slate-950 md:text-5xl">{title}</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">{text}</p>
        </div>

        <p className="text-sm text-[var(--muted)]">Secure company workspace, role-based access, and channel-ready architecture.</p>
      </section>
      <section className="flex items-center justify-center border-l border-[var(--line)] bg-[var(--panel-soft)] px-4 py-8">
        {children}
      </section>
    </main>
  );
}
