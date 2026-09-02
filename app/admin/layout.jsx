"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { LayoutGrid, LogOut, ShieldAlert, Tag, CircleDollarSign } from "lucide-react";
import { getAdminSession, clearAdminSession } from "@/lib/admin-api";

// Own gate, own session key (admin_session), own visual theme — completely
// separate from app/panel/layout.jsx's company gate. /admin/login is
// deliberately exempt from the redirect check below (there's no session to
// check yet on the login page itself).
export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === "/admin/login";
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (isLoginPage) { setChecking(false); return; }
    const saved = getAdminSession();
    if (!saved?.token) { router.replace("/admin/login"); return; }
    setSession(saved);
    setChecking(false);
  }, [isLoginPage, router]);

  if (isLoginPage) return children;

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950">
        <div className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-amber-500 text-slate-950">
            <ShieldAlert size={22} />
          </div>
          <p className="mt-4 font-semibold text-slate-300">Opening admin…</p>
        </div>
      </div>
    );
  }

  function logout() {
    clearAdminSession();
    router.push("/admin/login");
  }

  const navLinks = [
    { label: "Companies", href: "/admin", icon: LayoutGrid },
    { label: "Plans", href: "/admin/plans", icon: Tag },
    { label: "Payments", href: "/admin/payments", icon: CircleDollarSign },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-3.5">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500 text-slate-950">
              <ShieldAlert size={16} />
            </div>
            <span className="text-sm font-bold tracking-tight text-white">Platform Admin</span>
          </div>
          <nav className="flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  pathname === link.href ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                <link.icon size={14} />
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{session?.admin?.email}</span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
          >
            <LogOut size={13} />
            Log out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
