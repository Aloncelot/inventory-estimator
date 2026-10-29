// src/domain/calculators/level1.js
import { calcPlates } from "./plates";
import { applyWaste, unitPriceFrom } from "../lib/parsing";
import { isLumberFamily } from "../lib/families";

/**
 * Rimboard & Beams:
 * - Lumber (SPF, PT): Qty = Length / BoardLen (Pieces)
 * - Engineered (LSL, LVL): Qty = Length (Linear Feet)
 */
export function calcRimboard({ lengthLF, boardLenFt, wastePct = 5, item }) {
  const family = item ? (item.familyLabel || item.familyDisplay || "") : "";

  if (isLumberFamily(family)) {
    return calcPlates({ lengthLF, boardLenFt, wastePct, item, unit: "pcs" });
  }

  const qtyRaw = Number(lengthLF || 0);
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unit = "lf";
  const unitPrice = unitPriceFrom(item);
  const subtotal = Number(unitPrice * qtyFinal) || 0;

  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}

// Beams use same logic as Rimboard
export const calcBeam = calcRimboard; 

export function calcIJoist({ lengthLF, wastePct = 5, item }) {
  const qtyRaw = Number(lengthLF || 0);
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unit = "lf";
  const unitPrice = unitPriceFrom(item);
  const subtotal = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}

export function calcSubfloor({ areaSqFt, wastePct = 5, item }) {
  // 4x8 sheet = 32 sqft
  const qtyRaw = Number(areaSqFt || 0) / 32;
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unit = "sheets";
  const unitPrice = unitPriceFrom(item);
  const subtotal = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}

export function calcGlue({ subfloorSheets, wastePct = 5, item }) {
  // 1 tube per 6 sheets
  const qtyRaw = Number(subfloorSheets || 0) / 6;
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unit = "tubs"; 
  const unitPrice = unitPriceFrom(item);
  const subtotal = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}

export function calcStrapping({ lengthLF, boardLenFt, wastePct = 5, item }) {
   return calcPlates({ lengthLF, boardLenFt, wastePct, item, unit: "pcs" });
}

// Joist (Lumber)
export function calcJoist({ lengthLF, boardLenFt, wastePct = 5, item }) {
  return calcPlates({ lengthLF, boardLenFt, wastePct, item, unit: "pcs" });
}