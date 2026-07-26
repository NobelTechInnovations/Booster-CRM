const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
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

export async function createDevSession() {
  return request("/api/auth/dev-login", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function saveSession(session) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("commerceos_session", JSON.stringify(session));
}

export function getSession() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("commerceos_session");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (_error) {
    window.localStorage.removeItem("commerceos_session");
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("commerceos_session");
}

export async function signupCompany(payload) {
  const session = await request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  saveSession(session);
  return session;
}

export async function loginCompany(payload) {
  const session = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  saveSession(session);
  return session;
}

export async function createShopifyConnection(shop) {
  const session = getSession() || (await createDevSession());

  return request("/api/channels/shopify/connect", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({ shop }),
  });
}
