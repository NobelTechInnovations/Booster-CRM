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

export async function createShopifyConnection(shop) {
  const session = await createDevSession();

  return request("/api/channels/shopify/connect", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`,
    },
    body: JSON.stringify({ shop }),
  });
}
