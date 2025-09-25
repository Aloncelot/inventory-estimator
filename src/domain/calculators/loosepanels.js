// src/domain/calculators/loosepanels.js
// Centralized math for "Loose materials — Wall Panels" rows.
// Each helper returns the same shape as the base calculators:
// { unit, qtyRaw, qtyFinal, unitPrice, subtotal } PLUS we
// also add { wastePct } for convenience.

import { calcPlates }   from './plates';
import { calcSheathing } from './sheathing';
import { calcTape }     from './tape';
import { calcBoxes }    from './boxes';

// ───────────────────────── Exterior ─────────────────────────

export function looseExtBottomPlates({ lengthLF, boardLenFt, item, unit, wastePct = 10 }) {
  const res = calcPlates({ lengthLF, boardLenFt, item, unit, wastePct });
  return { ...res, wastePct };
}

export function looseExtTopPlates({ lengthLF, boardLenFt, item, unit, wastePct = 10 }) {
  const res = calcPlates({ lengthLF, boardLenFt, item, unit, wastePct });
  return { ...res, wastePct };
}

export function loosePanelBandSheathing({ panelBandLF, bandHeightFt, item, unit = 'sheet', wastePct = 10 }) {
  const res = calcSheathing({ lengthLF: panelBandLF, heightFt: bandHeightFt, item, unit, wastePct });
  return { ...res, wastePct };
}

export function looseExtraSheathing({ extLengthLF, bandHeightFt, item, unit = 'sheet', wastePct = 10 }) {
  const res = calcSheathing({ lengthLF: extLengthLF, heightFt: bandHeightFt, item, unit, wastePct });
  return { ...res, wastePct };
}

export function looseZipTapeFromSheets({ totalSheets, lfPerSheet, rollLenFt = 75, item, unit = 'roll', wastePct = 5 }) {
  const seamLF = Number(totalSheets || 0) * Number(lfPerSheet || 0);
  const res = calcTape({ seamLF, rollLenFt, item, unit, wastePct });
  return { ...res, wastePct };
}

export function looseOpeningsBlocking({ openingsLF, boardLenFt, item, unit, wastePct = 10 }) {
  const res = calcPlates({ lengthLF: openingsLF, boardLenFt, item, unit, wastePct });
  return { ...res, wastePct };
}

export function looseSecondBottomPlate({ lengthLF, boardLenFt, item, unit, wastePct = 10 }) {
  const res = calcPlates({ lengthLF, boardLenFt, item, unit, wastePct });
  return { ...res, wastePct };
}

// ───────────────────────── Interior ─────────────────────────

export function looseInt2x6PTPlates({ lengthLF, boardLenFt, item, unit, wastePct = 10 }) {
  const res = calcPlates({ lengthLF, boardLenFt, item, unit, wastePct });
  return { ...res, wastePct };
}

export function looseInt2x6Plates({ lengthLF, boardLenFt, item, unit, wastePct = 10 }) {
  const res = calcPlates({ lengthLF, boardLenFt, item, unit, wastePct });
  return { ...res, wastePct };
}

export function looseInt2x4PTPlates({ lengthLF, boardLenFt, item, unit, wastePct = 10 }) {
  const res = calcPlates({ lengthLF, boardLenFt, item, unit, wastePct });
  return { ...res, wastePct };
}

export function looseInt2x4Plates({ lengthLF, boardLenFt, item, unit, wastePct = 10 }) {
  const res = calcPlates({ lengthLF, boardLenFt, item, unit, wastePct });
  return { ...res, wastePct };
}

export function looseCabinetBlocking({ blockingLF, boardLenFt, item, unit, wastePct = 10 }) {
  const res = calcPlates({ lengthLF: blockingLF, boardLenFt, item, unit, wastePct });
  return { ...res, wastePct };
}

// ───────────────────── General (nails/bracing) ─────────────────────

export function looseConcreteNails({
  ptLF, // total LF of PT lumber
  nailsPerLF = 25,
  perBox = 100,
  item, unit = 'box', wastePct = 50,
}) {
  const count = Number(ptLF || 0) * Number(nailsPerLF || 0);
  const res = calcBoxes({ count, perBox, item, unit, wastePct });
  return { ...res, wastePct };
}

export function looseSheathingNails({
  sheetsCount, // total sheets that need ring-shank nails
  nailsPerSheet = 80,
  perBox = 2700,
  item, unit = 'box', wastePct = 50,
}) {
  const count = Number(sheetsCount || 0) * Number(nailsPerSheet || 0);
  const res = calcBoxes({ count, perBox, item, unit, wastePct });
  return { ...res, wastePct };
}

export function looseFramingNails({
  wallLF, // total wall LF (ext + int)
  nailsPerLF = 20,
  perBox = 2500,
  item, unit = 'box', wastePct = 50,
}) {
  const count = Number(wallLF || 0) * Number(nailsPerLF || 0);
  const res = calcBoxes({ count, perBox, item, unit, wastePct });
  return { ...res, wastePct };
}

export function looseTempBracing({
  platePiecesTotal, // total plate boards across groups
  piecesPerBoard = 3, // “×3” boards used per plate
  bracingBoardLenFt = 16,
  item, unit, wastePct = 10,
}) {
  const pieces = Number(platePiecesTotal || 0) * Number(piecesPerBoard || 0);
  const lengthLF = pieces * Number(bracingBoardLenFt || 16);
  const res = calcPlates({ lengthLF, boardLenFt: bracingBoardLenFt, item, unit, wastePct });
  return { ...res, wastePct };
}
