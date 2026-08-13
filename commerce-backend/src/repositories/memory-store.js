/**
 * In-memory store for development mode (when MongoDB is not connected).
 * All repository modules import from here.
 */
import crypto from "node:crypto";

export const memory = {
  companies:      new Map(),
  users:          new Map(),
  channels:       new Map(),
  orders:         new Map(),
  products:       new Map(),
  customers:      new Map(),
  productMappings: new Map(),
  warehouses:     new Map(),
  shipments:      new Map(),
  vendors:        new Map(),
  purchases:      new Map(),
  expenses:       new Map(),
  adInsights:     new Map(),
  skuCosts:       new Map(),
  automationRules: new Map(),
  webhookEndpoints: new Map(),
  webhookEvents:  new Map(),
};

export function id() {
  return crypto.randomUUID();
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function now() {
  return new Date().toISOString();
}

export function toDate(value) {
  return value ? new Date(value) : undefined;
}

export function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

export function fullName(...parts) {
  return parts.filter(Boolean).join(" ").trim();
}

export function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
