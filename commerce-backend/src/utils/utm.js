/**
 * Best-effort UTM extraction from a synced Shopify order, used to auto-attribute
 * Meta ad spend to orders. Shopify does not give us Meta's click id directly —
 * this only works if the ad's destination URL carries UTM parameters
 * (Meta Ads Manager -> Account Settings -> "URL Parameters", e.g.
 * utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}).
 */

function parseQueryParams(url) {
  if (!url) return {};

  try {
    const query = url.includes("?") ? url.split("?")[1] : url;
    const params = new URLSearchParams(query);
    const result = {};

    for (const [key, value] of params.entries()) {
      result[key.toLowerCase()] = value;
    }

    return result;
  } catch (_error) {
    return {};
  }
}

function fromNoteAttributes(order) {
  const attributes = order?.raw?.note_attributes || order?.note_attributes || [];
  if (!Array.isArray(attributes)) return {};

  const result = {};
  for (const attribute of attributes) {
    const name = String(attribute?.name || "").toLowerCase();
    if (name.startsWith("utm_")) {
      result[name] = attribute.value;
    }
  }
  return result;
}

export function parseUtmFromOrder(order) {
  const raw = order?.raw || order || {};
  const landingParams = parseQueryParams(raw.landing_site);
  const referringParams = parseQueryParams(raw.referring_site);
  const noteParams = fromNoteAttributes(order);

  const merged = { ...referringParams, ...landingParams, ...noteParams };

  const source = String(merged.utm_source || "").toLowerCase();
  const isMetaTraffic =
    source.includes("facebook") ||
    source.includes("instagram") ||
    source.includes("meta") ||
    source.includes("fb") ||
    Boolean(merged.fbclid);

  return {
    source: merged.utm_source || "",
    medium: merged.utm_medium || "",
    campaign: merged.utm_campaign || "",
    content: merged.utm_content || "",
    term: merged.utm_term || "",
    fbclid: merged.fbclid || "",
    isMetaTraffic,
  };
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Loose match: does this order's UTM data plausibly belong to this ad?
 * Matches by campaign/ad NAME appearing (as a substring, either direction) in
 * utm_campaign/utm_content/utm_term, or by campaign/ad ID appearing verbatim.
 */
export function orderMatchesAd(order, { campaignId, campaignName, adId, adName }) {
  const utm = parseUtmFromOrder(order);
  if (!utm.campaign && !utm.content && !utm.term && !utm.isMetaTraffic) return false;

  const haystacks = [utm.campaign, utm.content, utm.term].map(normalize).filter(Boolean);
  if (!haystacks.length) return false;

  const needles = [campaignId, campaignName, adId, adName].map(normalize).filter(Boolean);

  return needles.some((needle) => haystacks.some((haystack) => haystack.includes(needle) || needle.includes(haystack)));
}
