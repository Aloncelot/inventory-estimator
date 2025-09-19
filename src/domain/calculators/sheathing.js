// src/domain/calculators/sheathing.js
import { applyWaste, unitPriceFrom } from "../lib/parsing";

/**
 * Sheathing 4x8: sheets = (lengthLF * heightFt) / 32
 */
export function calcSheathing({ lengthLF, heightFt, wastePct = 0, item, unit = "sheet" }) {
  const qtyRaw   = (Number(lengthLF || 0) * Number(heightFt || 0)) / 32;
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unitPrice = unitPriceFrom(item);
  const subtotal  = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}
