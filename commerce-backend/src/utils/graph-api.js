import { HttpError } from "./http-error.js";

// Shared low-level Meta Graph API caller — the exact fetch/parse/error-throw
// pattern already used privately inside modules/ads/meta.service.js's
// metaFetch(), pulled out here so social.service.js (and anything else that
// talks to the Graph API later) doesn't duplicate it. meta.service.js itself
// is left untouched — extracting this doesn't change its behavior at all,
// it's additive.
export async function graphFetch(url, { method = "GET", headers, body: requestBody } = {}) {
  const response = await fetch(url, { method, headers, body: requestBody });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || body.error) {
    const message = body?.error?.message || `Meta API request failed (${response.status})`;
    throw new HttpError(response.status >= 400 ? response.status : 502, message, body);
  }

  return body;
}

// Same pagination convention as meta.service.js's fetchInsightsPage — every
// Graph API list edge (media, comments, ad insights, ...) returns
// `paging.next` as a fully-formed next-page URL to call as-is.
export async function graphFetchPage(url) {
  const body = await graphFetch(url);
  return { rows: body.data || [], next: body.paging?.next || "" };
}

// Drains every page of a Graph API list edge up to `maxRows`, using the
// pagination helper above. Most callers just want "give me everything" —
// this avoids repeating the `while (url) { ...; url = page.next }` loop.
export async function graphFetchAll(startUrl, { maxRows = 500 } = {}) {
  const rows = [];
  let url = startUrl;

  while (url && rows.length < maxRows) {
    const page = await graphFetchPage(url);
    rows.push(...page.rows);
    url = page.next;
  }

  return rows.slice(0, maxRows);
}
