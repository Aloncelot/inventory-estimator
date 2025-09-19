// src/domain/calculators/studs.js
import { applyWaste, unitPriceFrom } from "../lib/parsing";

/**
 * Studs: count = floor((LF*12)/spacing) + 1  (end stud)  then * multiplier
 */
export function calcStuds({ lengthLF, spacingIn = 16, multiplier = 1, wastePct = 0, item, unit = "pcs" }) {
  const studsAlong = Math.floor((Number(lengthLF || 0) * 12) / Math.max(1, Number(spacingIn || 16))) + 1;
  const qtyRaw   = studsAlong * Math.max(1, Number(multiplier || 1));
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unitPrice = unitPriceFrom(item);
  const subtotal  = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}
