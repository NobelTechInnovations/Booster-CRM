// IP -> approximate location, for guessing which language to follow up a
// webhook lead in. City/region-level, not a scientific ground truth — ISPs
// often geolocate to their nearest regional hub, not the shopper's literal
// address — so this is presented as a "likely" hint, not a fact.

const PRIVATE_IP_PATTERNS = [
  /^10\./,
  /^127\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^::1$/,
  /^0\.0\.0\.0$/,
];

export function isPrivateIp(ip) {
  if (!ip) return true;
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));
}

// ip-api.com's free tier: no API key, HTTP only (their HTTPS endpoint is a
// paid feature), 45 requests/minute per source IP — plenty for resolving one
// lead at a time or a small on-screen batch, not for bulk-resolving the
// entire leads table at once.
const IP_API_BASE = "http://ip-api.com/json";

export async function lookupIpGeo(ip) {
  if (isPrivateIp(ip)) return null;

  try {
    const res = await fetch(`${IP_API_BASE}/${encodeURIComponent(ip)}?fields=status,message,country,regionName,region,city,lat,lon`);
    if (!res.ok) return null;
    const body = await res.json();
    if (body.status !== "success") return null;
    return {
      city: body.city || "",
      region: body.regionName || "",
      regionCode: body.region || "",
      country: body.country || "",
      lat: body.lat,
      lon: body.lon,
    };
  } catch (_err) {
    return null;
  }
}

// Predominant language by Indian state, keyed by the ISO-3166-2:IN region
// CODE (e.g. "DL", "TN") rather than the free-text region name — ip-api
// returns "National Capital Territory of Delhi" for Delhi, "Odisha" is
// sometimes "Orissa" elsewhere, etc., so the code is the stable key. A
// general-knowledge mapping, not a claim about any specific person. Only
// India is mapped since that's this business's actual customer base;
// anything outside India (or unmapped) returns null so the UI just shows the
// location without guessing.
const LANGUAGE_BY_INDIAN_REGION_CODE = {
  AP: "Telugu",
  TS: "Telugu",
  TG: "Telugu",
  TN: "Tamil",
  KA: "Kannada",
  KL: "Malayalam",
  LD: "Malayalam",
  MH: "Marathi",
  GJ: "Gujarati",
  DN: "Gujarati/Hindi",
  DD: "Gujarati",
  PB: "Punjabi",
  CH: "Punjabi/Hindi",
  WB: "Bengali",
  TR: "Bengali/Kokborok",
  OR: "Odia",
  OD: "Odia",
  AS: "Assamese",
  RJ: "Hindi (Rajasthani dialect)",
  HR: "Hindi",
  UP: "Hindi",
  UT: "Hindi",
  UK: "Hindi",
  MP: "Hindi",
  BR: "Hindi (Bhojpuri/Maithili common)",
  JH: "Hindi",
  CT: "Hindi (Chhattisgarhi dialect)",
  HP: "Hindi (Pahari dialect)",
  DL: "Hindi",
  GA: "Konkani",
  PY: "Tamil",
  JK: "Kashmiri/Urdu",
  SK: "Nepali",
  MN: "Meitei/Manipuri",
  ML: "Khasi/Garo",
  MZ: "Mizo",
};

export function guessLanguage({ country, regionCode }) {
  if (country !== "India") return null;
  return LANGUAGE_BY_INDIAN_REGION_CODE[regionCode] || null;
}
