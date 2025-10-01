// src/domain/calculators/plates.js
import { applyWaste, unitPriceFrom } from "../lib/parsing";

/**
 * Bottom/Top plates: qtyRaw (pcs) = lengthLF / boardLenFt
 */
export function calcPlates({ lengthLF, boardLenFt, wastePct = 0, item, unit = "pcs" }) {
  const len = Number(lengthLF || 0);
  const board = Number(boardLenFt || 0);
  const qtyRaw   =board > 0 ? (len / board) : 0;
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unitPrice = unitPriceFrom(item);
  const subtotal  = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal, boardLenFt: board };
}
