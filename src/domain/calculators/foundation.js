// src/domain/calculators/foundation.js
import { calcTape } from "./tape";
import { calcPlates } from "./plates";

export function calcFoamSeal({ lengthLF, wastePct = 5, item }) {
  // Math: length / 50
  return calcTape({ seamLF: lengthLF, rollLenFt: 50, wastePct, item, unit: "roll" });
}

export function calcSillPlate({ lengthLF, boardLenFt = 16, wastePct = 5, item }) {
  // Math: length / boardLen
  return calcPlates({ lengthLF, boardLenFt, wastePct, item, unit: "pcs" });
}