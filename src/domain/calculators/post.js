// src/domain/calculators/post.js
import { applyWaste, unitPriceFrom } from "../lib/parsing";

/**
 * Post:
 *  - LVL/Versa: qtyRaw(LF) = pieces * heightFt, unit 'lf'
 *  - Lumber:    qtyRaw(pcs) = piecesPerPost * numPosts, unit 'pcs'
 */
export function calcPost({
  isLinearLF, pieces, heightFt, piecesPerPost, numPosts, wastePct = 5, item
}) {
  let qtyRaw = 0, unit = "pcs";
  if (isLinearLF) {
    qtyRaw = Number(pieces || 0) * Number(heightFt || 0);
    unit = "lf";
  } else {
    qtyRaw = Number(piecesPerPost || 0) * Number(numPosts || 0);
    unit = "pcs";
  }
  const qtyFinal  = applyWaste(qtyRaw, wastePct);
  const unitPrice = unitPriceFrom(item);
  const subtotal  = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}
