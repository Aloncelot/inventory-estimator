// src/domain/calculators/roof.js
import { calcPlates } from "./plates";
import { calcBoxes } from "./boxes";
import { applyWaste, unitPriceFrom } from "../lib/parsing";
import { isLumberFamily } from "../lib/families";

/**
 * Rafter / Eave / Trim / Gable:
 * Qty = Length / BoardLength + Waste
 */
export const calcLinearLumber = calcPlates;

/**
 * Ridge:
 * - Regular Lumber: Qty = Length / BoardLength + Waste
 * - Engineered: Qty = Length + Waste
 */
export function calcRidge({ lengthLF, boardLenFt, wastePct = 5, item }) {
  const family = item ? (item.familyLabel || item.familyDisplay || "") : "";

  if (isLumberFamily(family)) {
    return calcPlates({ lengthLF, boardLenFt, wastePct, item, unit: "pcs" });
  }

  // Engineered (Linear Feet)
  const qtyRaw = Number(lengthLF || 0);
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unit = "lf";
  const unitPrice = unitPriceFrom(item);
  const subtotal = Number(unitPrice * qtyFinal) || 0;

  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}

/**
 * Rake:
 * Qty = (Length / BoardLength) * 3 + Waste
 */
export function calcRake({ lengthLF, boardLenFt, wastePct = 5, item }) {
  const res = calcPlates({ lengthLF, boardLenFt, wastePct, item, unit: "pcs" });
  // Override the quantity logic to multiply by 3 pieces per length
  const len = Number(lengthLF || 0);
  const board = Number(boardLenFt || 0);
  const qtyRaw = board > 0 ? (len / board) * 3 : 0;
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const subtotal = Number(res.unitPrice * qtyFinal) || 0;
  
  return { ...res, qtyRaw, qtyFinal, subtotal };
}

/**
 * Hurricane Ties:
 * Qty = Rafters Final Qty + Waste (default 0%)
 */
export function calcHurricaneTies({ rafterQty, wastePct = 0, item }) {
  const qtyRaw = Number(rafterQty || 0);
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unit = "pcs";
  const unitPrice = unitPriceFrom(item);
  const subtotal = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}

/**
 * Roof Sheathing:
 * Qty = Area / 32 + Waste (default 20%)
 */
export function calcRoofSheathing({ areaSqFt, wastePct = 20, item }) {
  const qtyRaw = Number(areaSqFt || 0) / 32;
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unit = "sheets";
  const unitPrice = unitPriceFrom(item);
  const subtotal = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}

/**
 * Clips:
 * Qty = (Sheathing Final Qty * 3) / 250 + Waste
 */
export function calcClips({ sheetCount, wastePct = 0, item }) {
  // Math: (Sheets * 3 clips/sheet) / 250 clips/box
  const qtyRaw = (Number(sheetCount || 0) * 3) / 250;
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unit = "box"; 
  const unitPrice = unitPriceFrom(item);
  const subtotal = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}

/**
 * Trim Screws:
 * Qty = Trim Input / 50 + Waste
 */
export function calcTrimScrews({ trimLF, wastePct = 5, item }) {
  const qtyRaw = Number(trimLF || 0) / 50;
  const qtyFinal = applyWaste(qtyRaw, wastePct);
  const unit = "box"; 
  const unitPrice = unitPriceFrom(item);
  const subtotal = Number(unitPrice * qtyFinal) || 0;
  return { qtyRaw, qtyFinal, unit, unitPrice, subtotal };
}