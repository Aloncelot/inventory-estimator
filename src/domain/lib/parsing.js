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

/** Try to compute a unit price regardless of shape (compact or raw) */
export function unitPriceFrom(item) {
  if (!item) return 0;
  const supplier = item.supplierPrice ?? item.raw?.basePrice ?? item.raw?.supplierPrice ?? null;
  const markup   = item.markupPct     ?? item.raw?.markupPct     ?? null;
  if (supplier != null && markup != null) return Number(supplier) * (1 + Number(markup)/100);
  const peg = item.priceWithMarkup ?? item.raw?.priceWithMarkup ?? null;
  return Number(peg || 0);
}

/** Simple currency formatter (USD) */
export const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
