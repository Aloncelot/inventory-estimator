// src/domain/calculators/studs.js
import { applyWaste, unitPriceFrom } from "../lib/parsing";

/**
 * Studs: count = floor((LF*12)/spacing) + 1  (end stud)  then * multiplier; 0 when LF is 0
 */
export function calcStuds({ lengthLF, spacingIn = 16, multiplier = 1, wastePct = 0, item, unit = "pcs", extra = 0 }) {
  const len = Number(lengthLF || 0);
  // no wall length → no studs (the +1 end stud only exists once there is a wall)
  const studsAlong = len > 0 ? Math.floor((len * 12) / Math.max(1, Number(spacingIn || 16))) + 1 : 0;
  const qtyRaw   = studsAlong * Math.max(1, Number(multiplier || 1));
  // extra: corner and T studs counted on the plan, added as they are (no waste)
  const add = Math.max(0, Math.round(Number(extra) || 0));
  const qtyFinal = applyWaste(qtyRaw, wastePct) + add;
  const unitPrice = unitPriceFrom(item);
  const subtotal  = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}
