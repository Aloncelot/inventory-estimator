// src/domain/estimate/index.js
// Pure estimate calculations. Every number the app shows comes from here:
// components only render these results and never write totals back into the
// project. That keeps levels, sections and Summary consistent by construction,
// and every rule can be unit-tested (see estimate.test.js).

import {
  calcPlates, calcStuds, calcBlocking, calcSheathing, calcHeader, calcPost, calcHeadersInfill,
  looseExtBottomPlates, looseExtTopPlates, loosePanelBandSheathing, looseExtraSheathing,
  looseOpeningsBlocking, looseSecondBottomPlate, looseInt2x6PTPlates, looseInt2x6Plates,
  looseInt2x4PTPlates, looseInt2x4Plates, looseCabinetBlocking,
  calcFoamSeal, calcSillPlate, calcTape, calcConcreteNails, calcLallyColumn, calcRimboard,
  calcJoist, calcIJoist, calcBeam, calcSubfloor, calcGlue, calcStrapping, calcLinearLumber,
  calcRidge, calcRake, calcHurricaneTies, calcRoofSheathing, calcClips, calcTrimScrews,
} from '../calculators';
import { parseBoardLengthFt, unitPriceFrom } from '../lib/parsing';
import { isLVL, isVersaColumn, isInfillFamily } from '../lib/families';
import { getItem, getUnit, getSize, getFamily, isPTFamily, priceDateOf } from '../lib/selection';

const n = (v) => Number(v) || 0;
const round2 = (v) => Number((Number(v) || 0).toFixed(2));
const sum = (rows, key = 'subtotal') => round2((rows || []).reduce((s, r) => s + n(r?.[key]), 0));
/** Piece length from a size label (2x6"-10' → 10), else the fallback. */
export const pieceLength = (sel, fallback = 8) => parseBoardLengthFt(getSize(sel)) || fallback;
const piece = (sel, lf, fallback = 8) => ({ ft: pieceLength(sel, fallback), lf: n(lf), picked: Boolean(parseBoardLengthFt(getSize(sel))) });
/** Attach the price date of the chosen item to a computed row. */
const withPrice = (row, sel) => ({ ...row, priceDate: priceDateOf(sel) });

/* ───────────────────────── Wall sections ───────────────────────── */

export const WALL_KINDS = ['partition', 'bearing', 'shear', 'knee'];
export const wallKindOf = (variant, raw) => (variant === 'exterior' ? 'exterior' : WALL_KINDS.includes(raw) ? raw : 'partition');

export function computeWallSection(section = {}, variant = 'exterior') {
  const {
    lengthLF = 0, heightFt = 12, studSpacingIn = 16, studMultiplier = 1,
    waste = {}, sel = {}, extras = [],
  } = section;
  const kind = wallKindOf(variant, section.kind);
  const showBlocking = variant === 'exterior' || kind === 'bearing';
  const showSheathing = variant === 'exterior' || kind === 'shear';
  const blockingRows = Math.max(0, Math.ceil(n(heightFt) / 4) - 1);

  const bottomFt = pieceLength(sel.bottomPlate);
  const topFt = pieceLength(sel.topPlate);
  const blockFt = pieceLength(sel.blocking);

  const base = [
    { key: 'bottomPlate', label: 'Bottom plate', wastePct: waste.bottomPlate ?? 10, piece: piece(sel.bottomPlate, lengthLF),
      ...calcPlates({ lengthLF, boardLenFt: bottomFt, wastePct: waste.bottomPlate ?? 10, item: getItem(sel.bottomPlate), unit: getUnit(sel.bottomPlate) }) },
    { key: 'topPlate', label: 'Top plate', wastePct: waste.topPlate ?? 10, piece: piece(sel.topPlate, lengthLF),
      ...calcPlates({ lengthLF, boardLenFt: topFt, wastePct: waste.topPlate ?? 10, item: getItem(sel.topPlate), unit: getUnit(sel.topPlate) }) },
    { key: 'studs', label: 'Studs', wastePct: waste.studs ?? 60,
      ...calcStuds({ lengthLF, spacingIn: studSpacingIn, multiplier: studMultiplier, wastePct: waste.studs ?? 60, item: getItem(sel.studs), unit: getUnit(sel.studs) }) },
  ];
  if (showBlocking) base.push({ key: 'blocking', label: 'Blocking', wastePct: waste.blocking ?? 10, piece: piece(sel.blocking, n(lengthLF) * blockingRows),
    ...calcBlocking({ lengthLF, heightFt, boardLenFt: blockFt, wastePct: waste.blocking ?? 10, item: getItem(sel.blocking), unit: getUnit(sel.blocking) }) });
  if (showSheathing) base.push({ key: 'sheathing', label: variant === 'exterior' ? 'Sheathing' : 'Sheathing (4×8)', wastePct: waste.sheathing ?? 20,
    ...calcSheathing({ lengthLF, heightFt, wastePct: waste.sheathing ?? 20, item: getItem(sel.sheathing), unit: getUnit(sel.sheathing, 'sheet') }) });
  const baseRows = base.map((r) => withPrice(r, sel[r.key]));

  // headers infill is automatic: it appears while any infill-family header has LF
  const stored = (extras || []).filter((r) => r.type !== 'Headers infill');
  const legacyInfill = (extras || []).find((r) => r.type === 'Headers infill');
  const headerLFPool = stored
    .filter((r) => r.type === 'Header' && isInfillFamily(getFamily(r.item)))
    .reduce((s, r) => s + n(r?.inputs?.headerLF), 0);

  const computeExtra = (r) => {
    const fam = getFamily(r.item);
    const boardLenFt = parseBoardLengthFt(getSize(r.item)) || 0;
    const w = r.wastePct ?? 5;
    const it = getItem(r.item);
    let res = { qtyRaw: 0, qtyFinal: 0, unit: getUnit(r.item), unitPrice: unitPriceFrom(it), subtotal: 0 };
    let pc;
    if (r.type === 'Header') {
      // LVL (incl. PT / FRT) is bought by header LF; lumber headers are LF ÷ piece length
      res = calcHeader({ isLVL: isLVL(fam), headerLF: n(r.inputs?.headerLF), lvlPieces: n(r.inputs?.lvlPieces), lvlLength: n(r.inputs?.lvlLength), boardLenFt, wastePct: w, item: it });
    } else if (r.type === 'Post') {
      res = calcPost({ isLinearLF: isLVL(fam) || isVersaColumn(fam), pieces: n(r.inputs?.pieces), heightFt: n(r.inputs?.heightFt ?? heightFt), piecesPerPost: n(r.inputs?.piecesPerPost), numPosts: n(r.inputs?.numPosts), wastePct: w, item: it });
    } else if (r.type === 'Studs') {
      res = calcStuds({ lengthLF: n(r.inputs?.lengthLF), spacingIn: n(r.inputs?.studSpacingIn) || 16, multiplier: n(r.inputs?.studMultiplier) || 1, wastePct: w, item: it, unit: getUnit(r.item) });
    } else if (r.type === 'Extra blocking') {
      const lf = n(lengthLF) * Math.max(1, n(r.inputs?.rows) || 1);
      res = calcPlates({ lengthLF: lf, boardLenFt: boardLenFt || 8, wastePct: w, item: it, unit: getUnit(r.item) });
      pc = piece(r.item, lf);
    } else if (r.type === 'Extra sheathing') {
      res = calcSheathing({ lengthLF, heightFt, wastePct: w, item: it, unit: getUnit(r.item, 'sheet') });
    }
    return { ...r, ...res, wastePct: w, piece: pc, priceDate: priceDateOf(r.item) };
  };

  const extraRows = stored.map(computeExtra);
  let infill = null;
  if (headerLFPool > 0) {
    const item = sel.headersInfill ?? legacyInfill?.item ?? null;
    const w = waste.headersInfill ?? legacyInfill?.wastePct ?? 5;
    infill = {
      id: 'headersInfill', key: 'headersInfill', type: 'Headers infill', auto: true, item, wastePct: w, priceDate: priceDateOf(item),
      ...calcHeadersInfill({ headerLFPool, wastePct: w, item: getItem(item) }),
    };
  }

  const subtotal = round2(sum(baseRows) + sum(extraRows) + n(infill?.subtotal));

  // numbers the level, nails & manufacture need
  const row = Object.fromEntries(baseRows.map((r) => [r.key, r]));
  const panelSheets = showSheathing ? Math.ceil(n(row.sheathing?.qtyFinal)) : 0;
  const bottomQty = Math.ceil(n(row.bottomPlate?.qtyFinal));
  const sizeLabel = getSize(sel.studs) || getSize(sel.bottomPlate) || '';
  const stats = {
    lengthLF: n(lengthLF),
    heightFt: n(heightFt),
    studMultiplier: n(studMultiplier) || 1,
    kind,
    wallKind: /(^|\D)2\s*[x×]\s*6(\D|$)/i.test(sizeLabel) ? 'int-2x6' : 'int-2x4',
    panelSheets,
    zipSheetsFinal: variant === 'exterior' && /zip/.test(getFamily(sel.sheathing)) ? panelSheets : 0,
    platePieces: Math.ceil(n(row.bottomPlate?.qtyFinal) + n(row.topPlate?.qtyFinal)),
    bottomPlatePiecesPanel: bottomQty,
    panelPtBoards: isPTFamily(getFamily(sel.bottomPlate)) ? bottomQty : 0,
    ptLF: n(lengthLF),
  };

  return { variant, kind, baseRows, extraRows, infill, headerLFPool, subtotal, stats };
}

/* ───────────────────────── Panel nails (per level) ───────────────────────── */

export const PANEL_NAIL_SEL_KEY = { sheath: 'nailsSheath', frame8d: 'nailsFrame8d', frame12d: 'nailsFrame12d' };

export function computeNailExtras(extras = []) {
  return (extras || []).map((ex) => {
    const { qty = 0, density = 0, perBox = 1 } = ex.inputs || {};
    const qtyRaw = (n(qty) * n(density)) / (n(perBox) || 1);
    const w = n(ex.wastePct ?? 40);
    const qtyFinal = Math.ceil(qtyRaw * (1 + w / 100));
    const up = unitPriceFrom(getItem(ex.sel));
    return { ...ex, wastePct: w, qtyRaw, qtyFinal, unit: getUnit(ex.sel, 'box'), unitPrice: up, subtotal: qtyFinal * (up || 0), priceDate: priceDateOf(ex.sel) };
  });
}

export function computePanelNails(data = {}, { panelSheets = 0, bottomPlatePieces = 0, ptBoards = 0 } = {}) {
  const sel = data.sel || {};
  const waste = { sheath: 40, frame8d: 40, frame12d: 40, ...(data.waste || {}) };
  const raw = {
    sheath: n(panelSheets) * 80 / 2700,
    frame8d: n(ptBoards) * 25 / 2700,
    frame12d: n(bottomPlatePieces) * 80 / 2500,
  };
  const labels = { sheath: 'Sheathing nails', frame8d: 'Framing nails 8D', frame12d: 'Framing nails 12D' };
  const baseRows = Object.keys(raw).map((key) => {
    const s = sel[PANEL_NAIL_SEL_KEY[key]];
    const qtyFinal = Math.ceil(raw[key] * (1 + n(waste[key]) / 100));
    const unitPrice = unitPriceFrom(getItem(s));
    return { key, label: labels[key], qtyRaw: raw[key], wastePct: waste[key], qtyFinal, unit: getUnit(s, 'box'), unitPrice, subtotal: qtyFinal * (unitPrice || 0), priceDate: priceDateOf(s) };
  });
  const extraRows = computeNailExtras(data.extras);
  return { baseRows, extraRows, total: round2(sum(baseRows) + sum(extraRows)) };
}

/* ───────────────────────── Loose materials (per level) ───────────────────────── */

export const LOOSE_PANEL_WASTE = {
  extBottomPT: 10, extTopPlate: 10, panelBandSheathing: 20, extraSheathing: 10, zipTape: 0,
  openingsBlocking: 10, secondBottom: 10, int2x6PT: 5, int2x6Plate: 5, int2x4PT: 5, int2x4Plate: 5, intCabinetBlocking: 10,
};

export function computeLoosePanel(data = {}, { extLengthLF = 0, int2x6LF = 0, int2x4LF = 0, extZipSheets = 0 } = {}) {
  const sel = data.sel || {};
  const include = data.include || {};
  const extInputs = data.extInputs || {};
  const intInputs = data.intInputs || {};
  const waste = { ...LOOSE_PANEL_WASTE, ...(data.waste || {}) };
  const extLF = n(extLengthLF);
  const i6 = n(int2x6LF);
  const i4 = n(int2x4LF);
  const bandLF = data.panelBandEdited ? n(extInputs.panelBandLF) : extLF;
  const openLF = n(extInputs.openingsBlockingLF);
  const cabLF = n(intInputs.blockingLF);
  const L = (key) => ({ boardLenFt: pieceLength(sel[key]), item: getItem(sel[key]), unit: getUnit(sel[key]), wastePct: waste[key] });

  const ext = [
    { key: 'extBottomPT', label: 'PT bottom plates', piece: piece(sel.extBottomPT, extLF), ...looseExtBottomPlates({ lengthLF: extLF, ...L('extBottomPT') }) },
    { key: 'extTopPlate', label: 'Top plates', piece: piece(sel.extTopPlate, extLF), ...looseExtTopPlates({ lengthLF: extLF, ...L('extTopPlate') }) },
    { key: 'panelBandSheathing', label: 'Panel band sheathing', ...loosePanelBandSheathing({ panelBandLF: bandLF, bandHeightFt: 4, item: getItem(sel.panelBandSheathing), unit: getUnit(sel.panelBandSheathing, 'sheet'), wastePct: waste.panelBandSheathing }) },
    { key: 'extraSheathing', label: 'Extra sheathing', optional: true, ...looseExtraSheathing({ extLengthLF: extLF, bandHeightFt: 4, item: getItem(sel.extraSheathing), unit: getUnit(sel.extraSheathing, 'sheet'), wastePct: waste.extraSheathing }) },
  ];
  const bandSheets = n(ext.find((r) => r.key === 'panelBandSheathing')?.qtyFinal);
  const extraSheets = include.extraSheathing ? n(ext.find((r) => r.key === 'extraSheathing')?.qtyFinal) : 0;
  if (n(extZipSheets) > 0) {
    const totalSheets = n(extZipSheets) + bandSheets + extraSheets;
    const qtyFinal = Math.ceil(totalSheets / 6);
    const up = unitPriceFrom(getItem(sel.zipTape));
    ext.push({ key: 'zipTape', label: 'ZIP system tape', noWaste: true, unit: 'roll', qtyRaw: totalSheets / 6, qtyFinal, unitPrice: up, subtotal: qtyFinal * (up || 0) });
  }
  ext.push({ key: 'openingsBlocking', label: 'Blocking at openings', piece: piece(sel.openingsBlocking, openLF), ...looseOpeningsBlocking({ openingsLF: openLF, ...L('openingsBlocking') }) });
  ext.push({ key: 'secondBottom', label: 'Second bottom plate', optional: true, piece: piece(sel.secondBottom, extLF), ...looseSecondBottomPlate({ lengthLF: extLF, ...L('secondBottom') }) });

  const int = [
    { key: 'int2x6PT', label: 'Int. 2×6 PT plates', piece: piece(sel.int2x6PT, i6), ...looseInt2x6PTPlates({ lengthLF: i6, ...L('int2x6PT') }) },
    { key: 'int2x6Plate', label: 'Int. 2×6 plates', piece: piece(sel.int2x6Plate, i6), ...looseInt2x6Plates({ lengthLF: i6, ...L('int2x6Plate') }) },
    { key: 'int2x4PT', label: 'Int. 2×4 PT plates', piece: piece(sel.int2x4PT, i4), ...looseInt2x4PTPlates({ lengthLF: i4, ...L('int2x4PT') }) },
    { key: 'int2x4Plate', label: 'Int. 2×4 plates', piece: piece(sel.int2x4Plate, i4), ...looseInt2x4Plates({ lengthLF: i4, ...L('int2x4Plate') }) },
    { key: 'intCabinetBlocking', label: 'Bath / kitchen blocking', piece: piece(sel.intCabinetBlocking, cabLF), ...looseCabinetBlocking({ blockingLF: cabLF, ...L('intCabinetBlocking') }) },
  ];

  // optional rows count only when included
  const finish = (r0) => {
    const r = { ...r0, wastePct: r0.noWaste ? null : waste[r0.key] };
    return withPrice(r.optional && !include[r.key] ? { ...r, excluded: true, qtyFinal: 0, subtotal: 0 } : r, sel[r.key]);
  };
  const exteriorRows = ext.map(finish);
  const interiorRows = int.map(finish);
  const q = (rows, key) => Math.ceil(n(rows.find((r) => r.key === key && !r.excluded)?.qtyFinal));

  const stats = {
    sheetsExt: n(extZipSheets),
    sheetsBand: q(exteriorRows, 'panelBandSheathing'),
    sheetsExtra: q(exteriorRows, 'extraSheathing'),
    platePiecesTotal: q(exteriorRows, 'extTopPlate') + q(exteriorRows, 'secondBottom') + q(interiorRows, 'int2x6Plate') + q(interiorRows, 'int2x4Plate'),
    ptPieces: [[extLF, pieceLength(sel.extBottomPT)], [i6, pieceLength(sel.int2x6PT)], [i4, pieceLength(sel.int2x4PT)]]
      .reduce((s, [lf, len]) => s + Math.ceil((n(lf) * 1.05) / Math.max(1, len)), 0),
    blockingLF: cabLF,
  };

  return { exteriorRows, interiorRows, bandLF, extLF, int2x6LF: i6, int2x4LF: i4, subtotal: round2(sum(exteriorRows) + sum(interiorRows)), stats };
}

/* ───────────────────────── Level ───────────────────────── */

export function computeLevel(level = {}) {
  const exterior = (level.exteriorSections || []).filter(Boolean).map((s) => ({ id: s.id, ...computeWallSection(s, 'exterior') }));
  const interior = (level.interiorSections || []).filter(Boolean).map((s) => ({ id: s.id, ...computeWallSection(s, 'interior') }));

  const d = {
    extLengthSum: 0, extZipSheetsFinal: 0, int2x6LF: 0, int2x4LF: 0, panelSheetsAll: 0,
    platePiecesTotalAll: 0, totalBottomPlatePiecesPanelAll: 0, panelPtBoardsAll: 0, ptLFTotalAll: 0,
  };
  for (const s of exterior) {
    d.extLengthSum += s.stats.lengthLF;
    d.extZipSheetsFinal += s.stats.zipSheetsFinal;
  }
  for (const s of interior) {
    if (s.stats.wallKind === 'int-2x6') d.int2x6LF += s.stats.lengthLF; else d.int2x4LF += s.stats.lengthLF;
  }
  for (const s of [...exterior, ...interior]) {
    d.panelSheetsAll += s.stats.panelSheets;
    d.platePiecesTotalAll += s.stats.platePieces;
    d.totalBottomPlatePiecesPanelAll += s.stats.bottomPlatePiecesPanel;
    d.panelPtBoardsAll += s.stats.panelPtBoards;
    d.ptLFTotalAll += s.stats.ptLF;
  }

  const panelNails = computePanelNails(level.panelNails, {
    panelSheets: d.panelSheetsAll, bottomPlatePieces: d.totalBottomPlatePiecesPanelAll, ptBoards: d.panelPtBoardsAll,
  });
  const loose = computeLoosePanel(level.looseMaterials, {
    extLengthLF: d.extLengthSum, int2x6LF: d.int2x6LF, int2x4LF: d.int2x4LF, extZipSheets: d.extZipSheetsFinal,
  });

  const exteriorTotal = sum(exterior);
  const interiorTotal = sum(interior);
  const total = round2(exteriorTotal + interiorTotal + panelNails.total + loose.subtotal);
  return { id: level.id, exterior, interior, exteriorTotal, interiorTotal, derived: d, panelNails, loose, total };
}

/* ───────────────────────── Nails & bracing (all levels) ───────────────────────── */

export function computeNailsAndBracing(data = {}, t = {}) {
  const sel = data.sel || {};
  const waste = { nailsConcrete: 40, nailsSheathing: 40, nailsFraming: 40, tempBracing: 0, ...(data.waste || {}) };
  const looseSheets = n(t.sheetsBandAll) + n(t.sheetsExtraAll);
  const defs = [
    { key: 'nailsConcrete', label: 'Concrete nails', raw: n(t.ptPiecesAll) * 25 / 100, hint: `${n(t.ptPiecesAll)} PT pieces` },
    { key: 'nailsSheathing', label: 'Sheathing nails', raw: looseSheets * 80 / 2700, hint: `${looseSheets} loose sheets` },
    { key: 'nailsFraming', label: 'Framing nails', raw: n(t.platePiecesAll) * 25 / 2500, hint: `${n(t.platePiecesAll)} plate pieces` },
    { key: 'tempBracing', label: 'Temporary bracing', raw: Math.max(0, n(t.panelsAll)) * 3, hint: `${n(t.panelsAll)} panels × 3`, unit: 'pcs' },
  ];
  const baseRows = defs.map((x) => {
    const qtyFinal = Math.ceil(x.raw * (1 + n(waste[x.key]) / 100));
    const unitPrice = unitPriceFrom(getItem(sel[x.key]));
    return { ...x, qtyRaw: x.raw, wastePct: waste[x.key], qtyFinal, unit: getUnit(sel[x.key], x.unit || 'box'), unitPrice, subtotal: qtyFinal * (unitPrice || 0), priceDate: priceDateOf(sel[x.key]) };
  });
  const extraRows = computeNailExtras(data.extras);
  return { baseRows, extraRows, total: round2(sum(baseRows) + sum(extraRows)) };
}

/* ───────────────────────── Panels manufacture ───────────────────────── */

export const MANUFACTURE_RATES = {
  exteriorWalls: { ratePerLF: 10.5 },
  interiorShear: { ratePerLF: 10.25 },
  interiorBlocking: { ratePerLF: 6.5 },
  interiorNonLoad: { ratePerLF: 6.0 },
  kneeWall: { ratePerLF: 4.5 },
  windows: { each: 20.05 },
  exteriorDoors: { each: 15.19 },
  blocking2x10: { each: 0.6 },
};
// Rate add-ons per LF: double studs +$1, triple +$2, quad +$3; walls over 10 ft +$2
export const STUD_MULTIPLIER_ADDON_PER_LF = 1;
export const TALL_WALL_ADDON_PER_LF = 2;
export const TALL_WALL_LIMIT_FT = 10;
export function sectionAddonPerLF(stats = {}) {
  const extraStuds = Math.max(0, (n(stats.studMultiplier) || 1) - 1);
  const tall = n(stats.heightFt) > TALL_WALL_LIMIT_FT ? TALL_WALL_ADDON_PER_LF : 0;
  return extraStuds * STUD_MULTIPLIER_ADDON_PER_LF + tall;
}

export function computeManufacture(data = {}, lf = {}, addons = {}, rates = MANUFACTURE_RATES) {
  const rateByKey = data.rateByKey || {};
  const panelLenByKey = data.panelLenByKey || {};
  const manual = data.manualInputByKey || {};
  const lines = [];
  const pushLF = (label, key, cfg) => {
    const len = n(panelLenByKey[key]) || 8;
    const qty = n(lf[key]);
    const baseRate = n(rateByKey[key] ?? cfg?.ratePerLF ?? cfg?.each ?? 0);
    const a = addons[key];
    const addonPerLF = a && a.lf > 0 ? a.addon / a.lf : 0;
    const ratePerLF = baseRate + addonPerLF;
    lines.push({ label, key, lf: qty, panelLenFt: len, panels: Math.ceil((qty / Math.max(1, len)) * 1.1), baseRate, addonPerLF, ratePerLF, ratePerPanel: len * ratePerLF, total: qty * ratePerLF, isQtyBased: false });
  };
  const pushQty = (label, key, cfg) => {
    const qty = n(manual[key]);
    const rate = n(rateByKey[key] ?? cfg?.each ?? 0);
    lines.push({ label, key, qty, lf: 0, panelLenFt: null, panels: null, baseRate: rate, addonPerLF: 0, ratePerLF: rate, ratePerPanel: null, total: qty * rate, isQtyBased: true });
  };
  pushLF('Exterior walls', 'exteriorWalls', rates.exteriorWalls);
  pushLF('Interior shear walls', 'interiorShear', rates.interiorShear);
  pushLF('Interior walls (blocking only)', 'interiorBlockingOnly', rates.interiorBlocking);
  pushLF('Interior non-load bearing', 'interiorNonLoad', rates.interiorNonLoad);
  pushLF('Knee walls', 'kneeWall', rates.kneeWall);
  pushQty('Windows', 'windows', rates.windows);
  pushQty('Exterior doors', 'exteriorDoors', rates.exteriorDoors);
  pushLF('2x10 blocking rows', 'blocking2x10', rates.blocking2x10);
  const panels = lines.filter((x) => !x.isQtyBased).reduce((s, x) => s + n(x.panels), 0);
  return { lines, panels, total: sum(lines, 'total') };
}

/* ───────────────────────── Wall panels page ───────────────────────── */

export function computeWallPanels(est = {}) {
  const levels = (est.levels || []).filter(Boolean).map(computeLevel);
  const t = {
    panelsAll: 0, platePiecesAll: 0, ptPiecesAll: 0, sheetsExtAll: 0, sheetsBandAll: 0, sheetsExtraAll: 0, levelsCount: levels.length,
  };
  const lf = { exteriorWalls: 0, interiorShear: 0, interiorBlockingOnly: 0, interiorNonLoad: 0, kneeWall: 0, blocking2x10: 0 };
  const addons = {};
  const addAddon = (key, s) => {
    const a = addons[key] || (addons[key] = { lf: 0, addon: 0 });
    a.lf += s.stats.lengthLF;
    a.addon += s.stats.lengthLF * sectionAddonPerLF(s.stats);
  };
  for (const L of levels) {
    for (const s of L.exterior) {
      lf.exteriorWalls += s.stats.lengthLF;
      addAddon('exteriorWalls', s);
      t.sheetsExtAll += s.stats.zipSheetsFinal;
    }
    for (const s of L.interior) {
      const key = s.kind === 'shear' ? 'interiorShear' : s.kind === 'bearing' ? 'interiorBlockingOnly' : s.kind === 'knee' ? 'kneeWall' : 'interiorNonLoad';
      lf[key] += s.stats.lengthLF;
      addAddon(key, s);
    }
    for (const s of [...L.exterior, ...L.interior]) {
      t.panelsAll += s.stats.panelSheets;
      t.platePiecesAll += s.stats.platePieces;
      t.ptPiecesAll += s.stats.panelPtBoards;
    }
    lf.blocking2x10 += L.loose.stats.blockingLF;
    t.platePiecesAll += L.loose.stats.platePiecesTotal;
    t.ptPiecesAll += L.loose.stats.ptPieces;
    t.sheetsBandAll += L.loose.stats.sheetsBand;
    t.sheetsExtraAll += L.loose.stats.sheetsExtra;
  }
  const nails = computeNailsAndBracing(est.nailsAndBracing, t);
  const manufacture = computeManufacture(est.manufactureEstimate, lf, addons);
  const total = round2(sum(levels, 'total') + nails.total + manufacture.total);
  return { levels, totals: t, lf, addons, nails, manufacture, total };
}

/* ───────────────────────── Loose material page ───────────────────────── */

export function sectionKind(section) {
  if (section?.kind) return section.kind;
  const name = String(section?.name || '');
  if (name === 'Foundation') return 'foundation';
  if (name === 'Basement') return 'basement';
  if (name === 'Roof') return 'roof';
  if (/level/i.test(name)) return 'level';
  return 'custom';
}

export function rowCalcType(type = '') {
  const t = String(type).toLowerCase();
  if (t.startsWith('hanger')) return 'manual';
  if (t.includes('rimboard')) return 'rimboard';
  if (t === 'joist' || t === 'joists') return 'joist';
  if (t.includes('i-joist')) return 'ijoist';
  if (t.includes('beam')) return 'beam';
  if (t.includes('subfloor')) return 'subfloor';
  if (t.includes('glue')) return 'glue';
  if (t.includes('strapping')) return 'strapping';
  if (t.includes('studs')) return 'studs';
  if (t.includes('blocking') || t.includes('plate')) return 'plates';
  if (t.includes('sheathing') && !t.includes('nails')) return 'sheathing';
  if (t.includes('tape')) return 'tape';
  return 'manual';
}

export function computeLooseSection(section = {}, foundation = null) {
  const kind = sectionKind(section);
  const inputs = section.inputs || {};
  const sel = section.sel || {};
  const waste = section.waste || {};
  const w = (key, d = 5) => n(waste[key] ?? d);
  const mk = (key, label, res, d = 5, extra = {}) => withPrice({ key, label, ...res, wastePct: w(key, d), ...extra }, sel[key]);

  let calcRows = [];
  if (kind === 'foundation') {
    const fLF = n(inputs.foundationLF);
    const sLF = n(inputs.sillPlateEdited ? inputs.sillPlateLF : (inputs.sillPlateLF ?? fLF));
    calcRows = [
      mk('foamSeal', 'Foam sill sealer', calcFoamSeal({ lengthLF: fLF, wastePct: w('foamSeal'), item: getItem(sel.foamSeal) })),
      mk('sillPlate', 'Sill plate', calcSillPlate({ lengthLF: sLF, boardLenFt: pieceLength(sel.sillPlate), wastePct: w('sillPlate'), item: getItem(sel.sillPlate) }), 5, { piece: piece(sel.sillPlate, sLF) }),
    ];
  } else if (kind === 'basement') {
    let sillQty = 0;
    if (foundation?.inputs) {
      const fi = foundation.inputs;
      const sLF = n(fi.sillPlateLF ?? fi.foundationLF);
      sillQty = calcSillPlate({ lengthLF: sLF, boardLenFt: pieceLength(foundation.sel?.sillPlate), wastePct: n(foundation.waste?.sillPlate ?? 5), item: getItem(foundation.sel?.sillPlate) }).qtyFinal;
    }
    const bLF = n(inputs.blockingLF);
    calcRows = [
      mk('blocking', 'Blocking at openings', calcPlates({ lengthLF: bLF, boardLenFt: pieceLength(sel.blocking), wastePct: w('blocking', 10), item: getItem(sel.blocking), unit: 'pcs' }), 10, { piece: piece(sel.blocking, bLF) }),
      mk('concreteNails', 'Concrete nails', calcConcreteNails({ sillPlateQty: sillQty, wastePct: w('concreteNails'), item: getItem(sel.concreteNails) }), 5, { hint: `${sillQty} sill plates` }),
      mk('lallyColumn', 'Lally column', calcLallyColumn({ qty: n(inputs.colQty), wastePct: w('lallyColumn'), item: getItem(sel.lallyColumn) })),
    ];
  } else if (kind === 'roof') {
    const lf = (k) => n(inputs[k]);
    const lumber = (key, label, length, d = 5, fn = calcLinearLumber) =>
      mk(key, label, fn({ lengthLF: length, boardLenFt: pieceLength(sel[key], 16), wastePct: w(key, d), item: getItem(sel[key]) }), d);
    const rafter = lumber('rafter', 'Rafter', lf('rafterLF'));
    const sheathing = mk('sheathing', 'Sheathing', calcRoofSheathing({ areaSqFt: lf('roofArea'), wastePct: w('sheathing', 20), item: getItem(sel.sheathing) }), 20);
    calcRows = [
      rafter,
      lumber('ridge', 'Ridge', lf('ridgeLF'), 4, calcRidge),
      mk('hurricaneTies', 'Hurricane tie', calcHurricaneTies({ rafterQty: rafter.qtyFinal, wastePct: w('hurricaneTies'), item: getItem(sel.hurricaneTies) })),
      lumber('gable', 'Gable bottom plates', lf('gableLF')),
      mk('gableStuds', 'Gable studs', calcStuds({ lengthLF: lf('gableLF'), spacingIn: n(inputs.gableStudSpacing) || 16, multiplier: n(inputs.gableStudMultiplier) || 1, wastePct: w('gableStuds', 10), item: getItem(sel.gableStuds) }), 10, { gable: true }),
      sheathing,
      mk('clips', 'Clips', calcClips({ sheetCount: sheathing.qtyFinal, wastePct: w('clips'), item: getItem(sel.clips) })),
      lumber('eave', 'Eave', lf('eaveLF')),
      lumber('rake', 'Rake', lf('rakeLF'), 5, calcRake),
      lumber('trim', 'Trim', lf('trimLF')),
      mk('trimScrews', 'Trim screws', calcTrimScrews({ trimLF: lf('trimLF'), wastePct: w('trimScrews'), item: getItem(sel.trimScrews) })),
    ];
  }

  const rows = section.rows || [];
  const sub = rows.find((r) => rowCalcType(r.type) === 'subfloor');
  const subfloorSheets = sub ? Math.ceil((n(sub.inputs?.area) / 32) * (1 + n(sub.wastePct) / 100)) : 0;
  const manualRows = rows.map((row) => {
    const item = getItem(row.item);
    const wp = n(row.wastePct);
    const lf = n(row.inputs?.lengthLF);
    const ct = rowCalcType(row.type);
    let res;
    let pc;
    switch (ct) {
      case 'rimboard': res = calcRimboard({ lengthLF: n(row.inputs?.lengthLF ?? foundation?.inputs?.foundationLF ?? 0), boardLenFt: pieceLength(row.item, 16), wastePct: wp, item }); break;
      case 'joist': res = calcJoist({ lengthLF: lf, boardLenFt: pieceLength(row.item, 16), wastePct: wp, item }); break;
      case 'ijoist': res = calcIJoist({ lengthLF: lf, wastePct: wp, item }); break;
      case 'beam': res = calcBeam({ lengthLF: lf, boardLenFt: pieceLength(row.item, 16), wastePct: wp, item }); break;
      case 'subfloor': res = calcSubfloor({ areaSqFt: n(row.inputs?.area), wastePct: wp, item }); break;
      case 'glue': res = calcGlue({ subfloorSheets, wastePct: wp, item }); break;
      case 'strapping': res = calcStrapping({ lengthLF: lf, boardLenFt: pieceLength(row.item, 16), wastePct: wp, item }); break;
      case 'studs': res = calcStuds({ lengthLF: lf, spacingIn: n(row.inputs?.spacing) || 16, multiplier: n(row.inputs?.multiplier) || 1, wastePct: wp, item }); break;
      case 'plates': res = calcPlates({ lengthLF: lf, boardLenFt: pieceLength(row.item), wastePct: wp, item }); pc = piece(row.item, lf); break;
      case 'sheathing': res = calcSheathing({ lengthLF: lf, heightFt: n(row.inputs?.height) || 4, wastePct: wp, item }); break;
      case 'tape': res = calcTape({ seamLF: lf, rollLenFt: 75, wastePct: wp, item }); break;
      default: {
        const qtyRaw = n(row.qty);
        const qtyFinal = Math.ceil(qtyRaw * (1 + wp / 100));
        const unitPrice = unitPriceFrom(item);
        res = { qtyRaw, qtyFinal, unit: getUnit(row.item), unitPrice, subtotal: qtyFinal * unitPrice };
      }
    }
    return { ...row, ...res, calcType: ct, wastePct: wp, piece: pc, priceDate: priceDateOf(row.item) };
  });

  return { kind, calcRows, manualRows, subtotal: round2(sum(calcRows) + sum(manualRows)) };
}

export function computeLoose(est = {}) {
  const list = (est.looseList || []).filter(Boolean);
  const foundation = list.find((s) => sectionKind(s) === 'foundation') || null;
  const sections = list.map((s) => ({ id: s.id, hidden: !!s.isHidden, ...computeLooseSection(s, foundation) }));
  const byId = Object.fromEntries(sections.map((s) => [s.id, s]));
  return { sections, byId, total: round2(sections.filter((s) => !s.hidden).reduce((a, s) => a + s.subtotal, 0)) };
}

/* ───────────────────────── Trusses & project ───────────────────────── */

export const computeTrusses = (est = {}) => ({ total: round2((est.trusses || []).reduce((s, r) => s + n(r.amount ?? r.subtotal), 0)) });

export function computeProject(est = {}) {
  const wallPanels = computeWallPanels(est).total;
  const loose = computeLoose(est).total;
  const trusses = computeTrusses(est).total;
  return { wallPanels, loose, trusses, subtotal: round2(wallPanels + loose + trusses) };
}

/* ───────────────────────── Memoized by estimate object ───────────────────────── */
// The estimate is immutable (every edit makes a new object), so results can be
// cached per object: the views and Summary share one calculation per change.
const memo = (fn) => {
  const cache = new WeakMap();
  return (est) => {
    if (!est || typeof est !== 'object') return fn(est || {});
    if (!cache.has(est)) cache.set(est, fn(est));
    return cache.get(est);
  };
};
export const wallPanelsOf = memo(computeWallPanels);
export const looseOf = memo(computeLoose);
export const projectOf = memo((est) => {
  const wallPanels = wallPanelsOf(est).total;
  const loose = looseOf(est).total;
  const trusses = computeTrusses(est).total;
  return { wallPanels, loose, trusses, subtotal: round2(wallPanels + loose + trusses) };
});
