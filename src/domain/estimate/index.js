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
import { IRC, BLOCK_NAILS, nailsPerSheet, alongRun, nailsPerDoubledStud, perBoxFromSize, rollLengthFromSize } from '../lib/fastening';

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
  // nailing schedule from the plans (edge / field o.c.), IRC 6/12 by default
  const edgeIn = n(section.edgeNailIn) || IRC.sheathEdgeIn;
  const fieldIn = n(section.fieldNailIn) || IRC.sheathFieldIn;
  const perSheet = nailsPerSheet({ edgeIn, fieldIn, studSpacingIn });
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
    tag: { text: `${edgeIn}/${fieldIn}`, title: `Nailing: edges ${edgeIn}" o.c., field ${fieldIn}" o.c. → ${perSheet} nails per sheet` },
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

  // nails to build this panel (IRC R602.3(1); counts use quantities before waste)
  const mult = Math.max(1, n(studMultiplier) || 1);
  const studRaw = n(row.studs?.qtyRaw);
  const studLocations = studRaw / mult;
  const blocksPerRow = n(lengthLF) > 0 ? Math.ceil((n(lengthLF) * 12) / Math.max(1, n(studSpacingIn) || 16)) : 0;
  let plateStud = studRaw * 2 * IRC.plateToStud;
  let doubled = studLocations * (mult - 1) * nailsPerDoubledStud(heightFt);
  let blocks = showBlocking ? blockingRows * blocksPerRow : 0;
  let headerLF = 0;
  for (const r of extraRows) {
    if (r.type === 'Studs') {
      const m = Math.max(1, n(r.inputs?.studMultiplier) || 1);
      plateStud += n(r.qtyRaw) * 2 * IRC.plateToStud;
      doubled += (n(r.qtyRaw) / m) * (m - 1) * nailsPerDoubledStud(heightFt);
    } else if (r.type === 'Extra blocking') {
      blocks += Math.max(1, n(r.inputs?.rows) || 1) * blocksPerRow;
    } else if (r.type === 'Header') {
      headerLF += n(r.inputs?.headerLF) || n(r.inputs?.lvlPieces) * n(r.inputs?.lvlLength);
    }
  }
  const braced = variant === 'exterior' || kind === 'shear';
  const nailing = {
    edgeIn, fieldIn, perSheet, braced,
    sheathNails: (showSheathing ? Math.ceil(n(row.sheathing?.qtyRaw)) : 0) * perSheet,
    plateStudNails: plateStud,
    doubleStudNails: doubled,
    headerNails: Math.ceil(headerLF * (12 / IRC.headerOcIn) * IRC.headerEdges),
    blockingNails: blocks * BLOCK_NAILS,
    bottomPlateNails: alongRun(lengthLF, IRC.bottomPlateOcIn) * (braced ? IRC.bottomPlateBraced : 1),
    // a PT bottom plate built into the panel also sits on the concrete
    ptLF: isPTFamily(getFamily(sel.bottomPlate)) ? n(lengthLF) : 0,
    ptPieces: isPTFamily(getFamily(sel.bottomPlate)) ? Math.ceil(n(row.bottomPlate?.qtyRaw)) : 0,
  };
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

  return { variant, kind, baseRows, extraRows, infill, headerLFPool, subtotal, stats, nailing };
}

/* ───────────────────────── Panel nails (per level) ─────────────────────────
   Every fastener of the level's wall panels in one place:
   - on concrete (toggle): drive pins, epoxy for anchor bolts, foam sill sealer
   - sheathing nails from each section's nailing schedule (edge / field o.c.)
   - framing nails per IRC R602.3(1): plates to studs, headers, blocking, doubled studs
   - plate nails: panel bottom plate to floor, loose top plate (with splices), additional plates
   Quantities are counted before waste; boxes use the count per box from the item's size. */

export const PANEL_NAIL_ROWS = [
  { key: 'drivePins', selKey: 'drivePins', group: 'concrete', label: 'Drive pins (PT plates to concrete)', unit: 'box', perBox: 100, waste: 40 },
  { key: 'epoxy', selKey: 'epoxy', group: 'concrete', label: 'Epoxy (anchor bolts)', unit: 'tube', waste: 10 },
  { key: 'foamSill', selKey: 'foamSill', group: 'concrete', label: 'Foam sill sealer', unit: 'roll', waste: 5 },
  { key: 'sheath', selKey: 'nailsSheath', group: 'sheathing', label: 'Sheathing nails — panels', unit: 'box', perBox: 2700, waste: 40 },
  { key: 'sheathLoose', selKey: 'nailsSheathLoose', group: 'sheathing', label: 'Sheathing nails — loose sheets', unit: 'box', perBox: 2700, waste: 40 },
  { key: 'framing', selKey: 'nailsFrame12d', group: 'framing', label: 'Framing nails — plates, headers, blocking', unit: 'box', perBox: 2500, waste: 40 },
  { key: 'doubleStuds', selKey: 'nailsDoubleStud', group: 'framing', label: 'Framing nails — doubled studs', unit: 'box', perBox: 2500, waste: 40 },
  { key: 'bottomPlate', selKey: 'nailsFrame8d', group: 'plates', label: 'Plate nails — bottom plate to floor', unit: 'box', perBox: 2700, waste: 40 },
  { key: 'topPlate', selKey: 'nailsTopPlate', group: 'plates', label: 'Plate nails — loose top plate', unit: 'box', perBox: 2500, waste: 40 },
  { key: 'extraPlates', selKey: 'nailsExtraPlate', group: 'plates', label: 'Plate nails — additional plates', unit: 'box', perBox: 2500, waste: 40 },
];
export const PANEL_NAIL_GROUPS = { concrete: 'On concrete', sheathing: 'Sheathing', framing: 'Framing', plates: 'Plates' };
export const PANEL_NAIL_INPUTS = {
  pinSpacingIn: 16,
  anchorSpacingIn: 48,
  // epoxy: adhesive fills the ring between the hole and the anchor rod
  anchorDiaIn: 0.5,      // 1/2" anchor bolt / threaded rod
  holeDiaIn: 0.625,      // 5/8" drill bit
  embedIn: 7,            // embedment into the concrete
  cartridgeOz: 10,       // cartridge volume, fl oz
};
const IN3_PER_FL_OZ = 1.8046875;

/** Adhesive volume (in³) for one anchor: annulus × embedment. */
export const epoxyPerAnchorIn3 = ({ anchorDiaIn, holeDiaIn, embedIn }) =>
  Math.max(0, (Math.PI / 4) * (n(holeDiaIn) ** 2 - n(anchorDiaIn) ** 2) * n(embedIn));
export const PANEL_NAIL_SEL_KEY = Object.fromEntries(PANEL_NAIL_ROWS.map((r) => [r.key, r.selKey]));

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

const fmtN = (v) => Math.round(n(v)).toLocaleString('en-US');

/**
 * data: level.panelNails (sel, waste, inputs, onConcrete, extras…)
 * ctx:  sections (each section's nailing), plates (loose.plates), isGround
 */
export function computePanelNails(data = {}, { sections = [], plates = {}, isGround = false } = {}) {
  const sel = data.sel || {};
  const waste = data.waste || {};
  const inputs = { ...PANEL_NAIL_INPUTS, ...(data.inputs || {}) };
  const onConcrete = data.onConcrete ?? isGround;
  // PT plates on the concrete: loose PT plates + PT bottom plates built into the panels
  const loosePT = plates.pt || { lf: 0, pieces: 0 };
  const pt = {
    lf: n(loosePT.lf) + sections.reduce((acc, x) => acc + n(x?.ptLF), 0),
    pieces: n(loosePT.pieces) + sections.reduce((acc, x) => acc + n(x?.ptPieces), 0),
  };
  const top = plates.topPlates || { lf: 0, pieces: 0 };
  const extra = plates.extraPlates || { lf: 0, pieces: 0 };
  const tot = (k) => sections.reduce((acc, x) => acc + n(x?.[k]), 0);

  const pinSpacing = Math.max(1, n(inputs.pinSpacingIn) || PANEL_NAIL_INPUTS.pinSpacingIn);
  const anchorSpacing = Math.max(1, n(inputs.anchorSpacingIn) || PANEL_NAIL_INPUTS.anchorSpacingIn);
  const perAnchorIn3 = epoxyPerAnchorIn3(inputs);
  const cartridgeIn3 = Math.max(0.01, n(inputs.cartridgeOz) || PANEL_NAIL_INPUTS.cartridgeOz) * IN3_PER_FL_OZ;
  const anchorsPerTube = perAnchorIn3 > 0 ? cartridgeIn3 / perAnchorIn3 : 0;
  const pins = pt.lf > 0 ? Math.ceil((pt.lf * 12) / pinSpacing) + pt.pieces : 0;   // one more per piece so both ends are pinned
  const anchors = pt.lf > 0 ? Math.ceil((pt.lf * 12) / anchorSpacing) : 0;
  const looseSheetNails = n(plates.looseSheets) * nailsPerSheet({});
  const sheets = sections.reduce((acc, x) => acc + (x?.perSheet ? n(x.sheathNails) / x.perSheet : 0), 0);
  const topNails = alongRun(top.lf, IRC.topPlateOcIn) + top.pieces * IRC.topPlateSplice;
  const extraNails = alongRun(extra.lf, IRC.bottomPlateOcIn);

  // count = nails / pins / anchors / LF;  per = how many of them one unit holds
  const counts = {
    drivePins: { count: pins, hint: `${fmtN(pt.lf)} LF of PT plate, 1 pin every ${pinSpacing}" + 1 per piece = ${fmtN(pins)} pins` },
    epoxy: {
      count: anchors * perAnchorIn3,
      per: cartridgeIn3,
      hint: `${fmtN(anchors)} anchors (1 every ${anchorSpacing}") × ${perAnchorIn3.toFixed(2)} in³ (Ø${inputs.holeDiaIn}" hole, Ø${inputs.anchorDiaIn}" rod, ${inputs.embedIn}" deep) ÷ ${n(inputs.cartridgeOz)} fl oz cartridge ≈ ${anchorsPerTube.toFixed(0)} anchors per cartridge`,
    },
    foamSill: { count: pt.lf, per: rollLengthFromSize(getSize(sel.foamSill), 50), hint: `${fmtN(pt.lf)} LF of PT plate ÷ ${rollLengthFromSize(getSize(sel.foamSill), 50)}' per roll` },
    sheath: { count: tot('sheathNails'), hint: `${fmtN(sheets)} sheets × nails per sheet from each section's schedule = ${fmtN(tot('sheathNails'))} nails` },
    sheathLoose: { count: looseSheetNails, hint: `${fmtN(plates.looseSheets)} loose sheets (panel band + extra) × ${nailsPerSheet({})} nails (6/12) = ${fmtN(looseSheetNails)} nails` },
    framing: {
      count: tot('plateStudNails') + tot('headerNails') + tot('blockingNails'),
      hint: `Plates to studs ${fmtN(tot('plateStudNails'))} (2 per stud end) + headers ${fmtN(tot('headerNails'))} (16" o.c. each edge) + blocking ${fmtN(tot('blockingNails'))} (2 each end)`,
    },
    doubleStuds: { count: tot('doubleStudNails'), hint: `Doubled studs face-nailed @ ${IRC.doubleStudOcIn}" o.c. = ${fmtN(tot('doubleStudNails'))} nails` },
    bottomPlate: { count: tot('bottomPlateNails'), hint: `Bottom plates @ ${IRC.bottomPlateOcIn}" o.c. (3 per 16" at exterior / shear walls) = ${fmtN(tot('bottomPlateNails'))} nails` },
    topPlate: { count: topNails, hint: `${fmtN(top.lf)} LF @ ${IRC.topPlateOcIn}" o.c. + ${IRC.topPlateSplice} per splice × ${fmtN(top.pieces)} pieces = ${fmtN(topNails)} nails` },
    extraPlates: { count: extraNails, hint: extra.lf > 0 ? `${fmtN(extra.lf)} LF of additional plate @ ${IRC.bottomPlateOcIn}" o.c. = ${fmtN(extraNails)} nails` : 'No additional plates (include "Second bottom plate" in loose materials)' },
  };

  const baseRows = PANEL_NAIL_ROWS
    .filter((d) => d.group !== 'concrete' || onConcrete)
    .map((d) => {
      const s = sel[d.selKey];
      const c = counts[d.key];
      const per = c.per ?? perBoxFromSize(getSize(s), d.perBox);
      const qtyRaw = n(c.count) / Math.max(1, n(per) || 1);
      const wastePct = n(waste[d.key] ?? d.waste);
      const qtyFinal = Math.ceil(qtyRaw * (1 + wastePct / 100));
      const unitPrice = unitPriceFrom(getItem(s));
      return {
        key: d.key, selKey: d.selKey, group: d.group, label: d.label, hint: c.hint, count: c.count, per,
        qtyRaw, wastePct, qtyFinal, unit: getUnit(s, d.unit), unitPrice, subtotal: qtyFinal * (unitPrice || 0), priceDate: priceDateOf(s),
      };
    });
  const extraRows = computeNailExtras(data.extras);
  return { onConcrete, inputs, anchors, anchorsPerTube, ptLF: pt.lf, baseRows, extraRows, total: round2(sum(baseRows) + sum(extraRows)) };
}

/* ───────────────────────── Bracing (all levels) ─────────────────────────
   Temporary bracing is estimated apart for wall panels and trusses, even if
   the same pieces get reused on site. */

export const BRACING_ROWS = [
  { key: 'panels', label: 'Temporary bracing — wall panels', unit: 'pcs', waste: 0 },
  { key: 'trusses', label: 'Temporary bracing — trusses', unit: 'pcs', waste: 0 },
];
// Trusses: about 2 bundles of 2×4-16' (≈ 600 pcs) brace ~5,000 sq ft. On large
// buildings bracing is bought for one section at a time and reused.
export const BRACING_INPUTS = {
  bracesPerPanel: 2,
  buildingAreaSqFt: 0,      // 0 → Roof sq ft from Loose material
  reuseAreaSqFt: 5000,      // area braced at once; 0 → no reuse (whole building)
  bundlesPerArea: 2,
  areaPerBundlesSqFt: 5000,
  piecesPerBundle: 294,     // standard 2×4 unit
};

export function computeBracing(data = {}, { panels = 0, roofAreaSqFt = 0 } = {}) {
  const sel = data.sel || {};
  const waste = data.waste || {};
  const inputs = { ...BRACING_INPUTS, ...(data.inputs || {}) };
  const per = Math.max(0, n(inputs.bracesPerPanel));
  const counts = {
    panels: { qty: n(panels) * per, hint: `${fmtN(panels)} panels (from Panels manufacture) × ${per} braces` },
    trusses: trussBracing(inputs, roofAreaSqFt),
  };
  const baseRows = BRACING_ROWS.map((d) => {
    const s = sel[d.key];
    const qtyRaw = counts[d.key].qty;
    const wastePct = n(waste[d.key] ?? d.waste);
    const qtyFinal = Math.ceil(qtyRaw * (1 + wastePct / 100));
    const unitPrice = unitPriceFrom(getItem(s));
    return { key: d.key, label: d.label, hint: counts[d.key].hint, qtyRaw, wastePct, qtyFinal, unit: getUnit(s, d.unit), unitPrice, subtotal: qtyFinal * (unitPrice || 0), priceDate: priceDateOf(s) };
  });
  return { inputs, baseRows, panels: n(panels), roofAreaSqFt: n(roofAreaSqFt), total: sum(baseRows) };
}

function trussBracing(inputs, roofAreaSqFt) {
  const area = n(inputs.buildingAreaSqFt) || n(roofAreaSqFt);
  if (!area) return { qty: 0, hint: 'Type the building area (or the Roof sq ft in Loose material)' };
  const reuse = n(inputs.reuseAreaSqFt);
  const bracedAtOnce = reuse > 0 ? Math.min(area, reuse) : area;
  const bundles = Math.ceil((bracedAtOnce / Math.max(1, n(inputs.areaPerBundlesSqFt))) * n(inputs.bundlesPerArea));
  const qty = bundles * n(inputs.piecesPerBundle);
  const src = n(inputs.buildingAreaSqFt) ? '' : ' (Roof sq ft)';
  return {
    qty,
    hint: `${fmtN(area)} sq ft${src}, braced ${fmtN(bracedAtOnce)} sq ft at a time → ${bundles} bundles × ${n(inputs.piecesPerBundle)} pcs`
      + ` (${n(inputs.bundlesPerArea)} bundles per ${fmtN(inputs.areaPerBundlesSqFt)} sq ft)`,
  };
}

/* ───────────────────────── Loose materials (per level) ───────────────────────── */

export const LOOSE_PANEL_WASTE = {
  extBottomPT: 10, extTopPlate: 10, panelBandSheathing: 20, extraSheathing: 10, zipTape: 0,
  openingsBlocking: 10, secondBottom: 10, int2x6PT: 5, int2x6Plate: 5, int2x4PT: 5, int2x4Plate: 5, intCabinetBlocking: 10,
};

// loose top plates lap over panel joints, so they must be longer than a panel
export const LOOSE_TOP_PLATE_KEYS = ['extTopPlate', 'int2x6Plate', 'int2x4Plate'];
const LOOSE_PT_KEYS = ['extBottomPT', 'int2x6PT', 'int2x4PT'];

export function computeLoosePanel(data = {}, { extLengthLF = 0, int2x6LF = 0, int2x4LF = 0, extZipSheets = 0, panelLenFt = 8 } = {}) {
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
    if (LOOSE_TOP_PLATE_KEYS.includes(r.key) && n(r.piece?.lf) > 0 && pieceLength(sel[r.key]) <= n(panelLenFt)) {
      r.warn = `Loose top plates lap over the panel joints: use pieces longer than the ${n(panelLenFt)}' panels (10', 12' or 16').`;
    }
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

  // what the panel-nails section needs from the loose plates (before waste)
  const rowsByKey = Object.fromEntries([...exteriorRows, ...interiorRows].map((r) => [r.key, r]));
  const runOf = (keys) => keys.reduce((acc, k) => {
    const r = rowsByKey[k];
    if (!r || r.excluded) return acc;
    acc.lf += n(r.piece?.lf);
    acc.pieces += Math.ceil(n(r.qtyRaw));
    return acc;
  }, { lf: 0, pieces: 0 });
  const plates = {
    pt: runOf(LOOSE_PT_KEYS),             // PT plates on the slab / foundation
    topPlates: runOf(LOOSE_TOP_PLATE_KEYS), // second top plate, laid loose over the panels
    extraPlates: runOf(['secondBottom']),  // additional plates (second bottom plate, when included)
    looseSheets: Math.ceil(n(rowsByKey.panelBandSheathing?.qtyRaw)) + (include.extraSheathing ? Math.ceil(n(rowsByKey.extraSheathing?.qtyRaw)) : 0),
  };

  return { exteriorRows, interiorRows, bandLF, extLF, int2x6LF: i6, int2x4LF: i4, subtotal: round2(sum(exteriorRows) + sum(interiorRows)), stats, plates };
}

/* ───────────────────────── Level ───────────────────────── */

/** ctx: isGround (lowest level), panelLenFt (manufacture panel length) */
export function computeLevel(level = {}, { isGround = false, panelLenFt = 8 } = {}) {
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

  const loose = computeLoosePanel(level.looseMaterials, {
    extLengthLF: d.extLengthSum, int2x6LF: d.int2x6LF, int2x4LF: d.int2x4LF, extZipSheets: d.extZipSheetsFinal, panelLenFt,
  });
  const panelNails = computePanelNails(level.panelNails, {
    sections: [...exterior, ...interior].map((x) => x.nailing),
    plates: loose.plates,
    isGround,
  });

  const exteriorTotal = sum(exterior);
  const interiorTotal = sum(interior);
  const total = round2(exteriorTotal + interiorTotal + panelNails.total + loose.subtotal);
  return { id: level.id, exterior, interior, exteriorTotal, interiorTotal, derived: d, panelNails, loose, total };
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

/** Wall types whose LF becomes panels (2×10 blocking rows are not panels). */
const PANEL_KEYS = ['exteriorWalls', 'interiorShear', 'interiorBlockingOnly', 'interiorNonLoad', 'kneeWall'];

export function computeWallPanels(est = {}) {
  const panelLenFt = n(est.manufactureEstimate?.panelLenByKey?.exteriorWalls) || 8;
  const levels = (est.levels || []).filter(Boolean).map((l, i) => computeLevel(l, { isGround: i === 0, panelLenFt }));
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
  const manufacture = computeManufacture(est.manufactureEstimate, lf, addons);
  const panelCount = manufacture.lines.filter((x) => PANEL_KEYS.includes(x.key)).reduce((acc, x) => acc + n(x.panels), 0);
  const roof = (est.looseList || []).find((x) => x && sectionKind(x) === 'roof');
  const bracing = computeBracing(est.bracing, { panels: panelCount, roofAreaSqFt: n(roof?.inputs?.roofArea) });
  const total = round2(sum(levels, 'total') + bracing.total + manufacture.total);
  return { levels, totals: t, lf, addons, bracing, manufacture, total };
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
