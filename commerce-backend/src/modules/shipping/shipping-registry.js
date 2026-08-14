import { VelocityProvider } from "./providers/velocity.provider.js";
import { ShiprocketProvider } from "./providers/shiprocket.provider.js";
import { ShipwayProvider } from "./providers/shipway.provider.js";
import { ShipMozoProvider } from "./providers/shipmozo.provider.js";
import { DelhiveryProvider } from "./providers/delhivery.provider.js";
import { HttpError } from "../../utils/http-error.js";

/**
 * Registry of all supported shipping providers.
 */
const PROVIDER_MAP = {
  velocity:   VelocityProvider,
  shiprocket: ShiprocketProvider,
  shipway:    ShipwayProvider,
  shipmozo:   ShipMozoProvider,
  delhivery:  DelhiveryProvider,
};

/**
 * Returns an instantiated shipping provider for the given name.
 * @param {string} providerName - e.g. "velocity", "shiprocket", "shipway", "shipmozo"
 * @param {object} context - { companyId }
 * @returns {BaseShippingProvider}
 */
export function getShippingProvider(providerName, { companyId }) {
  const ProviderClass = PROVIDER_MAP[String(providerName).toLowerCase()];

  if (!ProviderClass) {
    throw new HttpError(400, `Shipping provider "${providerName}" is not supported. Supported: ${Object.keys(PROVIDER_MAP).join(", ")}`);
  }

  return new ProviderClass({ companyId });
}

export function listSupportedShippingProviders() {
  return [
    { provider: "velocity",    name: "Velocity Shipping", status: "available" },
    { provider: "shiprocket",  name: "Shiprocket",        status: "available" },
    { provider: "shipway",     name: "Shipway",           status: "available" },
    { provider: "shipmozo",    name: "ShipMozo",          status: "available" },
    { provider: "delhivery",   name: "Delhivery",         status: "available" },
    { provider: "ithink",      name: "iThink Logistics",  status: "coming_soon" },
    { provider: "nimbuspost",  name: "NimbusPost",        status: "coming_soon" },
    { provider: "pickrr",      name: "Pickrr",            status: "coming_soon" },
  ];
}
