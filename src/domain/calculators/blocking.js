// src/domain/calculators/blocking.js
import { applyWaste, unitPriceFrom } from "../lib/parsing";

/**
 * Blocking: rows = floor(heightFt / 4); perRow pcs = lengthLF / boardLenFt
 */
export function calcBlocking({ lengthLF, heightFt, boardLenFt, wastePct = 0, item, unit = "pcs" }) {
  const len = Number(lengthLF || 0);
  const h = Number(heightFt || 0);
  const board = Number(boardLenFt || 0);
  const rows   = Math.max(0, Math.ceil(h/4)-1);
  const perRow = board > 0 ? (len / board) : 0;
  const qtyRaw   = perRow * rows;
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unitPrice = unitPriceFrom(item);
  const subtotal  = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}
