// src/domain/calculators/plates.js
import { applyWaste, unitPriceFrom } from "../lib/parsing";
import { isSoldByLF } from "../lib/families";

/**
 * Bottom/Top plates: qtyRaw (pcs) = lengthLF / boardLenFt
 */
export function calcPlates({ lengthLF, boardLenFt, wastePct = 0, item, unit = "pcs" }) {
  const len = Number(lengthLF || 0);
  // engineered lumber (LVL, LSL…) and anything sold per foot: the LF itself, not boards
  if (isSoldByLF(item)) {
    const qtyFinal = applyWaste(len, wastePct);
    const unitPrice = unitPriceFrom(item);
    return { qtyRaw: len, qtyFinal, unit: "lf", unitPrice, subtotal: Number(unitPrice * qtyFinal) || 0, boardLenFt: 0, byLF: true };
  }
  const board = Number(boardLenFt || 0);
  const qtyRaw   =board > 0 ? (len / board) : 0;
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unitPrice = unitPriceFrom(item);
  const subtotal  = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal, boardLenFt: board };
}
