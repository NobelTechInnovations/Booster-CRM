import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Full value with 2 decimals, no k/L abbreviation — per explicit request,
// used everywhere a rupee amount is shown across the app instead of each
// component rolling its own ad-hoc `${value}`/`.toLocaleString()` formatting
// (which is how some pages ended up showing whole numbers with no decimals
// while others abbreviated to "6k"/"1.2L").
export function formatMoney(value, currency = "INR") {
  const num = Number(value || 0);
  const formatted = num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "INR" ? `₹${formatted}` : `${currency} ${formatted}`;
}
