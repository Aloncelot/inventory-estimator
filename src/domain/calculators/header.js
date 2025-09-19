// src/domain/calculators/header.js
import { applyWaste, unitPriceFrom } from "../lib/parsing";

/**
 * Header:
 *  - LVL:    qtyRaw(LF) = lvlPieces * lvlLength, unit 'lf'
 *  - Lumber: qtyRaw(pcs) = headerLF / boardLenFt, unit 'pcs'
 */
export function calcHeader({
  isLVL, headerLF, lvlPieces, lvlLength, boardLenFt, wastePct = 5, item
}) {
  let qtyRaw = 0, unit = "pcs";
  if (isLVL) {
    qtyRaw = Number(lvlPieces || 0) * Number(lvlLength || 0);
    unit = "lf";
  } else {
    qtyRaw = Number(boardLenFt || 0) ? Number(headerLF || 0) / Number(boardLenFt) : 0;
    unit = "pcs";
  }
  const qtyFinal  = applyWaste(qtyRaw, wastePct);
  const unitPrice = unitPriceFrom(item);
  const subtotal  = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}
