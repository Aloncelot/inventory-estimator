// src/domain/calculators/tape.js
// Seam tape: rolls to cover the seam length, rounded up, plus waste.
import { applyWaste, unitPriceFrom } from '../lib/parsing';

export function calcTape({ seamLF, rollLenFt, wastePct = 5, item, unit = 'roll' }) {
  const qtyRaw   = Number(seamLF || 0) / Math.max(1, Number(rollLenFt || 1));
  const rollsBase = Math.ceil(qtyRaw);
  const qtyFinal = applyWaste(rollsBase, wastePct);
  const unitPrice = unitPriceFrom(item);
  const subtotal  = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}
