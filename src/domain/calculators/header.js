// src/domain/calculators/header.js
import { applyWaste, unitPriceFrom } from "../lib/parsing";

/**
 * Header:
 *  - LVL:    qtyRaw(LF) = headerLF, unit 'lf'
 *  - Lumber: qtyRaw(pcs) = headerLF / boardLenFt, unit 'pcs'
 */
export function calcHeader({
  isLVL, headerLF, lvlPieces, lvlLength, boardLenFt, wastePct = 5, item
}) {
  let qtyRaw = 0, unit = "pcs";
  if (isLVL) {
    // LVL (incl. PT / FRT variants) is bought by the linear foot: Qty = header LF.
    // Older estimates stored pieces × length; use that only when no header LF exists.
    const lf = Number(headerLF || 0);
    qtyRaw = lf > 0 ? lf : Number(lvlPieces || 0) * Number(lvlLength || 0);
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
