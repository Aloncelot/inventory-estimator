// src/domain/calculators/basement.js
// Basement rows of Loose material.
import { applyWaste, unitPriceFrom } from "../lib/parsing";
import { calcBoxes } from "./boxes";

/** Concrete nails for the sill plates: 25 per plate, sold in boxes of 100. */
export function calcConcreteNails({ sillPlateQty, wastePct = 5, item, unit = "box" }) {
  const count = (Number(sillPlateQty || 0) * 25) / 100;
  const qtyRaw = count; 
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unitPrice = unitPriceFrom(item);
  const subtotal = qtyFinal * unitPrice;
  
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}

export function calcLallyColumn({ qty, wastePct = 5, item, unit = "pcs" }) {
  const qtyRaw = Number(qty || 0);
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unitPrice = unitPriceFrom(item);
  const subtotal = qtyFinal * unitPrice;
  
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}