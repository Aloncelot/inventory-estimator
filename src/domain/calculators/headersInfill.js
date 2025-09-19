// src/domain/calculators/headersInfill.js
import { applyWaste, unitPriceFrom } from "../lib/parsing";

/**
 * Headers infill panels from a pool of header LF (qualifying families):
 * qtyRaw(sheet) = (headerLFPool / 3 / 32) * 2
 */
export function calcHeadersInfill({ headerLFPool, wastePct = 5, item, unit = "sheet" }) {
  const qtyRaw   = (Number(headerLFPool || 0) / 3 / 32) * 2;
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unitPrice = unitPriceFrom(item);
  const subtotal  = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}
