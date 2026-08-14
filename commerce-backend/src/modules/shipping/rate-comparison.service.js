import { listShippingChannels } from "../../repositories/channel.repo.js";
import { getShippingProvider } from "./shipping-registry.js";

// Courier freight in India is a B2B service subject to 18% GST — same rate
// applied to Meta ad spend elsewhere in this app (see AD_GST_RATE in
// ad-insight.repo.js). Delhivery's own rate-calculator API already returns a
// GST-inclusive total (see delhivery.provider.js), so that one is trusted
// as-is rather than double-taxed; every other provider's raw rate is treated
// as pre-tax (the industry-standard way courier rate cards are quoted) and
// grossed up by this rate for a fair, consistent comparison.
const GST_RATE = 0.18;

function normalizeProviderRates(provider, raw) {
  const entries = raw?.courier_companies || raw?.data || raw?.result || (Array.isArray(raw) ? raw : null);
  if (!Array.isArray(entries) || !entries.length) return [];

  return entries.map((entry) => {
    const hasExplicitSplit = entry.rate_pre_gst !== undefined && entry.gst_amount !== undefined;
    const rawRate = Number(entry.rate ?? entry.price ?? entry.total_amount ?? entry.freight_charge ?? 0);

    const ratePreGst = hasExplicitSplit ? Number(entry.rate_pre_gst) : rawRate;
    const gstAmount = hasExplicitSplit ? Number(entry.gst_amount) : Math.round(rawRate * GST_RATE * 100) / 100;
    const rateWithGst = hasExplicitSplit ? Number(entry.rate ?? ratePreGst + gstAmount) : Math.round((ratePreGst + gstAmount) * 100) / 100;

    return {
      provider,
      courierId: entry.id || entry.courier_company_id || entry.courier_id || "",
      courierName: entry.courier_name || entry.courierName || entry.name || provider,
      ratePreGst,
      gstAmount,
      rateWithGst,
      etd: entry.etd || entry.estimated_delivery_days || entry.delivery_days || "",
      codAvailable: entry.cod_available,
      prepaidAvailable: entry.prepaid_available,
    };
  });
}

// Calls every shipping provider this brand has connected, in parallel, and
// returns one flat, GST-inclusive, cheapest-first list — Delhivery freight,
// every courier Velocity/Shipway/ShipMozo can offer, all in one place. A
// provider that errors or has nothing serviceable for this route is reported
// in `errors`, not silently dropped — so "why isn't X showing up" is answerable.
export async function compareShippingRates({ companyId, from, to, weight, paymentMode, codAmount }) {
  const channels = await listShippingChannels(companyId);
  const connected = channels.filter((c) => c.status === "connected");

  const rates = [];
  const errors = [];

  await Promise.all(
    connected.map(async (channel) => {
      try {
        const provider = getShippingProvider(channel.provider, { companyId });
        const raw = await provider.checkServiceability({ from, to, weight, paymentMode, codAmount });
        const normalized = normalizeProviderRates(channel.provider, raw);
        if (normalized.length) {
          rates.push(...normalized);
        } else {
          errors.push({ provider: channel.provider, message: "Not serviceable, or this provider doesn't return a rate for this route" });
        }
      } catch (err) {
        errors.push({ provider: channel.provider, message: err.message });
      }
    }),
  );

  rates.sort((a, b) => a.rateWithGst - b.rateWithGst);

  return {
    rates,
    errors,
    connectedProviders: connected.map((c) => c.provider),
    cheapest: rates[0] || null,
  };
}
