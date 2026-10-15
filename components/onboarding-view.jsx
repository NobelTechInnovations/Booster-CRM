"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Check, Loader2, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { navIcon } from "@/lib/nav-icons";
import { useCommerceStore } from "@/lib/store";
import { completeOnboarding, getNavigation, getOnboarding } from "@/lib/api";

// The first thing a brand-new workspace sees. Two steps: what kind of
// business this is, then which apps to start with — the preset pre-ticks a
// sensible bundle and every box stays editable.
//
// Nothing here is permanent. Apps can be added or removed afterwards from
// Company Manage → Apps, and removing one never deletes its data.
export function OnboardingView() {
  const router = useRouter();
  const { setNavigation, setNavPermissions, session } = useCommerceStore();

  const [step, setStep] = useState("type");
  const [businessTypes, setBusinessTypes] = useState([]);
  const [apps, setApps] = useState([]);
  const [chosenType, setChosenType] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getOnboarding()
      .then((result) => {
        // Already set up — nothing to do here, don't trap them on a wizard
        // they've completed.
        if (result.completed) {
          router.replace("/panel");
          return;
        }
        setBusinessTypes(result.businessTypes || []);
        setApps(result.apps || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickType(type) {
    setChosenType(type);
    setSelected(new Set(type.apps));
    setStep("apps");
  }

  function toggleApp(app) {
    if (app.required || app.locked) return;
    const next = new Set(selected);
    if (next.has(app.slug)) next.delete(app.slug);
    else next.add(app.slug);
    setSelected(next);
  }

  async function finish() {
    setSaving(true);
    setError("");
    try {
      await completeOnboarding({ businessType: chosenType?.slug || "custom", apps: [...selected] });
      // Pull the new sidebar before leaving, so the panel lands already
      // showing the apps they just picked rather than the previous menu.
      try {
        const nav = await getNavigation();
        setNavigation(nav.nav || []);
        setNavPermissions(nav.permissions || []);
      } catch (_error) {
        // non-fatal — the menu refreshes on next load
      }
      router.replace("/panel");
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  const workspaceName = session?.company?.name || "your workspace";
  const optionalApps = apps.filter((app) => !app.required);

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-16">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-5 w-96" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:py-16">
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700">
          <Sparkles size={12} />
          {step === "type" ? "Step 1 of 2" : "Step 2 of 2"}
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-950 md:text-[28px]">
          {step === "type" ? `What does ${workspaceName} do?` : "Pick your starting apps"}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
          {step === "type"
            ? "This just decides which apps you start with. You can add or remove any of them later."
            : `Based on "${chosenType?.name}". Untick anything you don't need — nothing here is permanent.`}
        </p>
      </div>

      {error ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      ) : null}

      {step === "type" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {businessTypes.map((type) => {
            const Icon = navIcon(type.icon);
            return (
              <button key={type.slug} onClick={() => pickType(type)} className="text-left">
                <Card className="flex h-full items-start gap-3 p-4 transition hover:border-indigo-300 hover:shadow-sm">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{type.name}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{type.description}</p>
                    {type.comingSoon?.length ? (
                      <p className="mt-1.5 text-[11px] font-medium text-amber-700">
                        {type.comingSoon.join(" and ")} {type.comingSoon.length === 1 ? "is" : "are"} still being built
                      </p>
                    ) : null}
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {optionalApps.map((app) => {
              const Icon = navIcon(app.icon);
              const active = selected.has(app.slug);
              return (
                <button
                  key={app.slug}
                  onClick={() => toggleApp(app)}
                  disabled={app.locked}
                  className="text-left disabled:cursor-not-allowed"
                >
                  <Card
                    className={`flex h-full items-start gap-3 p-4 transition ${
                      app.locked
                        ? "opacity-60"
                        : active
                          ? "border-indigo-400 bg-indigo-50/40"
                          : "hover:border-slate-300"
                    }`}
                  >
                    <div
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                        active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {active ? <Check size={16} /> : <Icon size={16} />}
                    </div>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                        {app.name}
                        {app.locked ? <Lock size={11} className="text-amber-600" /> : null}
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{app.description}</p>
                      {app.locked ? (
                        <p className="mt-1 text-[11px] font-semibold text-amber-700">Needs a plan upgrade</p>
                      ) : null}
                    </div>
                  </Card>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5">
            <button
              onClick={() => setStep("type")}
              className="text-sm font-semibold text-slate-500 hover:text-slate-800"
            >
              ← Back
            </button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--muted)]">
                {selected.size} app{selected.size === 1 ? "" : "s"} selected
              </span>
              <Button onClick={finish} disabled={saving}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
                Open my workspace
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
