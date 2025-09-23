// src/domain/calculators/boxes.js
import { applyWaste, unitPriceFrom } from '../lib/parsing';

/** Convert an item COUNT into BOXES, given items-per-box. */
export function calcBoxes({ count, perBox, wastePct = 0, item, unit = 'box' }) {
  const qtyRaw   = Number(count || 0) / Math.max(1, Number(perBox || 1));
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unitPrice = unitPriceFrom(item);
  const subtotal  = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}
