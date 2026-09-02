// Deliberately separate from lib/api.js — its own localStorage key, its own
// request helper, no shared state with the company session at all. This is
// the client for /api/platform-admin (app/admin), a completely different
// login from the company panel's /api/auth.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const STORAGE_KEY = "admin_session";

async function adminRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.message || "API request failed");
  }

  return body;
}

function adminAuthHeaders() {
  const session = getAdminSession();
  if (!session?.token) {
    throw new Error("Login required");
  }
  return { Authorization: `Bearer ${session.token}` };
}

export function saveAdminSession(session) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function getAdminSession() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_error) {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearAdminSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export async function adminLogin(email, password) {
  const session = await adminRequest("/api/platform-admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  saveAdminSession(session);
  return session;
}

export async function getAdminMe() {
  return adminRequest("/api/platform-admin/auth/me", { headers: adminAuthHeaders() });
}

export async function listAdmins() {
  return adminRequest("/api/platform-admin/admins", { headers: adminAuthHeaders() });
}

export async function createAdmin(payload) {
  return adminRequest("/api/platform-admin/admins", {
    method: "POST",
    headers: adminAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

// ─── Companies ───────────────────────────────────────────────────────────────

export async function listAdminCompanies() {
  return adminRequest("/api/platform-admin/companies", { headers: adminAuthHeaders() });
}

export async function getAdminCompany(companyId) {
  return adminRequest(`/api/platform-admin/companies/${companyId}`, { headers: adminAuthHeaders() });
}

export async function updateCompanyStatus(companyId, status) {
  return adminRequest(`/api/platform-admin/companies/${companyId}/status`, {
    method: "PATCH",
    headers: adminAuthHeaders(),
    body: JSON.stringify({ status }),
  });
}

export async function updateCompanySubscription(companyId, payload) {
  return adminRequest(`/api/platform-admin/companies/${companyId}/subscription`, {
    method: "PATCH",
    headers: adminAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function updateCompanyWallet(companyId, payload) {
  return adminRequest(`/api/platform-admin/companies/${companyId}/wallet`, {
    method: "PATCH",
    headers: adminAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

// ─── Plans ───────────────────────────────────────────────────────────────────

export async function listPlans() {
  return adminRequest("/api/platform-admin/plans", { headers: adminAuthHeaders() });
}

export async function createPlan(payload) {
  return adminRequest("/api/platform-admin/plans", {
    method: "POST",
    headers: adminAuthHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function updatePlan(planId, payload) {
  return adminRequest(`/api/platform-admin/plans/${planId}`, {
    method: "PATCH",
    headers: adminAuthHeaders(),
    body: JSON.stringify(payload),
  });
}
