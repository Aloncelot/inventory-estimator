// src/domain/lib/parsing.js

/** Normalize to a simple, lowercase token string */
export const norm = (s = "") =>
  String(s).toLowerCase().replace(/[^a-z0-9# ]+/g, " ").trim();

/** Parse trailing feet at end of labels like `2x6"-16'` → 16 */
export function parseBoardLengthFt(sizeLabel) {
  const s = String(sizeLabel || "").trim();
  let num = "";
  for (let i = s.length - 1; i >= 0; i--) {
    const ch = s[i];
    if (ch >= "0" && ch <= "9") { num = ch + num; continue; }
    if (num) break;
  }
  return num ? Number(num) : null;
}

/** Apply waste percentage and round up to the next whole purchasing unit */
export function applyWaste(qtyRaw = 0, wastePct = 0) {
  const q = Number(qtyRaw || 0);
  const w = Number(wastePct || 0) / 100;
  return Math.ceil(q * (1 + w));
}

/**
 * The supplier's price of an item (cost, no markup), whatever its shape
 * (compact or raw). The markup is the estimate's, applied in Summary and the
 * Quote: see src/domain/markup.js.
 */
export function unitPriceFrom(item) {
  if (!item) return 0;
  const cost = item.supplierPrice ?? item.raw?.basePrice ?? item.raw?.supplierPrice ?? item.basePrice ?? null;
  if (cost != null) return Number(cost) || 0;
  // very old rows kept only the price with markup
  return Number(item.priceWithMarkup ?? item.raw?.priceWithMarkup ?? 0) || 0;
}

/** Currency formatter: follows the open project's currency (USD / CAD) */
export { moneyFormatter as moneyFmt } from "./currency";
