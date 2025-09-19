// src/domain/calculators/blocking.js
import { applyWaste, unitPriceFrom } from "../lib/parsing";

/**
 * Blocking: rows = floor(heightFt / 4); perRow pcs = lengthLF / boardLenFt
 */
export function calcBlocking({ lengthLF, heightFt, boardLenFt, wastePct = 0, item, unit = "pcs" }) {
  const rows   = Math.ceil(Number(((heightFt || 0) / 4)-1));
  const perRow = Number(lengthLF || 0) / Math.max(1, Number(boardLenFt || 0));
  const qtyRaw   = perRow * rows;
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unitPrice = unitPriceFrom(item);
  const subtotal  = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}
