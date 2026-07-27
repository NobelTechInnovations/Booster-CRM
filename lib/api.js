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

function authHeaders() {
  const session = getSession();
  if (!session?.token) {
    throw new Error("Login required");
  }

  return {
    Authorization: `Bearer ${session.token}`,
  };
}

async function ensureSession() {
  let session = getSession();

  if (!session?.token) {
    session = await createDevSession();
    saveSession(session);
  }

  return session;
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
  if (session.token) {
    saveSession(session);
  }
  return session;
}

export async function createShopifyConnection(shop) {
  const session = await ensureSession();

  return request("/api/channels/shopify/connect", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({ shop }),
  });
}

export async function saveAmazonSetup(payload) {
  const session = await ensureSession();

  return request("/api/channels/amazon/setup", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function createAmazonConnection() {
  const session = await ensureSession();

  return request("/api/channels/amazon/connect", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({}),
  });
}

export async function listChannels() {
  return request("/api/channels", {
    headers: authHeaders(),
  });
}

export async function syncChannel(channelId) {
  return request(`/api/channels/${channelId}/sync`, {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function getChannelDashboard() {
  return request("/api/channels/dashboard", {
    headers: authHeaders(),
  });
}

export async function listSyncedRecords(resource) {
  return request(`/api/channels/records/${resource}`, {
    headers: authHeaders(),
  });
}

export async function updateSyncedRecord(resource, recordId, payload) {
  return request(`/api/channels/records/${resource}/${recordId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function getProductMappingOptions() {
  return request("/api/channels/product-mappings/options", {
    headers: authHeaders(),
  });
}

export async function listProductMappings() {
  return request("/api/channels/product-mappings", {
    headers: authHeaders(),
  });
}

export async function saveProductMapping(payload) {
  return request("/api/channels/product-mappings", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function getCompanyProfile() {
  return request("/api/company", {
    headers: authHeaders(),
  });
}

export async function updateCompanyProfile(payload) {
  const result = await request("/api/company", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  const session = getSession();
  if (session) {
    saveSession({ ...session, company: result.company });
  }

  return result;
}

export async function updateCompanyKyc(payload) {
  const result = await request("/api/company/kyc", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  const session = getSession();
  if (session) {
    saveSession({ ...session, company: result.company });
  }

  return result;
}

export async function listUsers() {
  return request("/api/users", {
    headers: authHeaders(),
  });
}

export async function createUser(payload) {
  return request("/api/users", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function updateUser(userId, payload) {
  return request(`/api/users/${userId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}
