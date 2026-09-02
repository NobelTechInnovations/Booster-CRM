"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";

function daysLeft(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

const DISMISS_KEY = "upgrade_banner_dismissed_on";

// Reads straight off session.company (already loaded — no extra fetch),
// same staleness caveat every other session.company-derived UI has this
// session (only as fresh as the last login/company switch). Dismissible
// once per calendar day, like FollowUpReminderBanner's own pattern.
export function UpgradeBanner({ session }) {
  const [dismissedToday, setDismissedToday] = useState(true);

  useEffect(() => {
    const today = new Date().toDateString();
    setDismissedToday(typeof window !== "undefined" && window.localStorage.getItem(DISMISS_KEY) === today);
  }, []);

  const sub = session?.company?.subscription;
  const wallet = session?.company?.wallet;
  const hasPlan = Boolean(sub?.planId);
  const trialLeft = hasPlan && sub?.status === "trialing" ? daysLeft(sub.trialEndsAt) : null;
  const walletNegative = wallet && Number(wallet.balance) < 0;

  const trialEndingSoon = trialLeft !== null && trialLeft <= 3;
  const pastDue = hasPlan && sub?.status === "past_due";
  const show = !dismissedToday && (trialEndingSoon || pastDue || walletNegative);
  if (!show) return null;

  let message = "Upgrade to keep everything running smoothly.";
  if (pastDue) message = "Your plan has expired — upgrade to avoid interruptions.";
  else if (trialLeft !== null && trialLeft < 0) message = "Your trial has ended — upgrade to keep full access.";
  else if (trialEndingSoon) message = `Your trial ends in ${trialLeft} day${trialLeft === 1 ? "" : "s"} — upgrade to keep full access.`;
  else if (walletNegative) message = "Your wallet balance is negative — recharge to stay in good standing.";

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, new Date().toDateString());
    setDismissedToday(true);
  }

  return (
    <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2">
      <Sparkles size={14} className="shrink-0 text-amber-600" />
      <span className="flex-1 text-xs font-semibold text-amber-800">{message}</span>
      <Link href="/panel/settings?tab=billing" className="shrink-0 rounded-md bg-amber-500 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-amber-600">
        Upgrade now
      </Link>
      <button onClick={dismiss} className="shrink-0 rounded p-1 text-amber-600 hover:bg-amber-100">
        <X size={13} />
      </button>
    </div>
  );
}
