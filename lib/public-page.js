"use client";

import { useEffect, useRef } from "react";

// Shared by every public, no-login page that looks a customer up by phone
// or email (order tracking, support tickets) — one input field, type auto
// detected, rather than two separate fields the customer has to choose
// between. Anything with an "@" is an email; everything else is treated
// as a phone number (digits, spaces, dashes and all — the backend's own
// phoneCandidates() normalizes the shape from there).
export function parseContact(raw) {
  const value = String(raw || "").trim();
  if (!value) return { phone: "", email: "" };
  return value.includes("@") ? { phone: "", email: value.toLowerCase() } : { phone: value, email: "" };
}

export function contactDisplayValue({ phone, email } = {}) {
  return phone || email || "";
}

export function hasContact({ phone, email } = {}) {
  return !!(phone || email);
}

// ─── Session-scoped contact persistence ─────────────────────────────────────
// sessionStorage, not localStorage — survives a page refresh in the same
// tab (the actual complaint: refreshing shouldn't dump the visitor back to
// the phone/email entry screen), but never lingers past the tab closing
// and never touches the URL, since a phone/email is still personal data
// even though it's the customer's own.

const STORAGE_PREFIX = "wokbook:contact:";

export function loadStoredContact(pageKey, companySlug) {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${pageKey}:${companySlug}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // private browsing / storage disabled — page still works, just won't survive a refresh
  }
}

export function saveStoredContact(pageKey, companySlug, contact) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${pageKey}:${companySlug}`, JSON.stringify(contact));
  } catch {
    // ignore — not fatal
  }
}

export function clearStoredContact(pageKey, companySlug) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(`${STORAGE_PREFIX}${pageKey}:${companySlug}`);
  } catch {
    // ignore
  }
}

// ─── Silent background refresh ──────────────────────────────────────────────
// No loading UI at all — same pattern already established for WhatsApp
// (components/whatsapp-view.jsx's MessageThread): something changed
// elsewhere (staff closed a ticket, a courier updated tracking) should
// show up on its own, not require the visitor to hit refresh.
//
// Deliberately does NOT pause on document.hidden — tried that, and found
// (live, in this project's own preview harness) that plenty of real
// embedding contexts report the page hidden even while genuinely
// foregrounded and in use, which would silently defeat this feature for
// exactly the visitors it's for. The rate-limit budget on every polled
// endpoint already assumes continuous polling (see the lookup/tracking
// limiters' own comments), so there's no real cost to just always polling.
export function useSilentPoll(callback, { intervalMs, enabled = true }) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled || !intervalMs) return undefined;
    const id = setInterval(() => {
      callbackRef.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
}
