// src/domain/estimate/layout.js
// Layout check for a rectangular (or square) building, exterior walls only.
//
// It builds the wall panels the way a panel shop would, from the building's
// length × width and each level's exterior-wall inputs, cuts every member out
// of the stock pieces chosen in the estimate (plates, studs, blocking, sheets,
// loose plates), and compares what the cuts really use with the estimate.
// Leftover % = (estimate final − pieces really used) / pieces used, which should
// match the Waste % column when the estimate's raw quantity is right.
//
// Framing rules used (panelized walls, IRC R602):
// - Two walls run through at the corners (length L); the other two butt between
//   them (W − 2 × wall thickness). One extra stud per corner backs the butting wall.
// - Each wall is split into panels of the manufacture panel length; the last
//   panel takes the remainder. Every panel has its own single bottom and top
//   plate and studs at the spacing from its start, plus an end stud.
// - Studs are cut to wall height − 4½" (panel bottom + top plate + loose top plate).
// - Blocking rows = ceil(height / 4) − 1, one block per stud bay.
// - Sheathing: 4×8 sheets, vertical (4' wide × 8' tall) or horizontal (8' long ×
//   4' tall, laid like bricks along the whole wall: every other row starts with
//   half a sheet, and the sheets cross the panel joints); vertical sheets stop at panel ends; butting walls' sheathing runs over the
//   through walls' ends. Short pieces are cut from leftover sheet.
// - Loose top plate laps the panel joints: its joints are kept ≥ 24" from any
//   panel joint (R602.3.2); the loose PT plate follows the panels.

import { computeWallSection, computeLoosePanel, pieceLength } from './index';

const n = (v) => Number(v) || 0;
const KERF = 0.125;          // saw cut, in
const PLATE_T = 1.5;         // plate thickness, in
const STUD_W = 1.5;          // stud thickness along the wall, in
const SHEET_W = 48;
const SHEET_H = 96;
const LAP_MIN = 24;          // loose top plate joint ↔ panel joint, in

import { studDepthIn } from './openings';
export { studDepthIn };

/* ───────────── cutting (shared with the estimate) ───────────── */
import { cutLinear, cutSheets } from '../lib/cutting';
export { cutLinear, cutSheets };

/* ───────────── geometry ───────────── */

/**
 * Sheets on one panel face, from `a0` to `a1` along the wall and 0 to `heightIn` up.
 * vertical: 48" columns, 96" tall; horizontal: 48" rows, 96" long.
 */
export function sheetLayout(a0, a1, heightIn, orientation = 'vertical') {
  const out = [];
  const along = orientation === 'horizontal' ? SHEET_H : SHEET_W;
  const up = orientation === 'horizontal' ? SHEET_W : SHEET_H;
  let row = 0;
  for (let z = 0; z < heightIn - 0.01; z += up, row += 1) {
    // horizontal sheets go like bricks: every other row starts with half a sheet
    const offset = orientation === 'horizontal' && row % 2 === 1 ? along / 2 : 0;
    let a = a0;
    let first = offset > 0 && a1 - a0 > offset + 0.01 ? offset : along;
    while (a < a1 - 0.01) {
      const end = Math.min(a1, a + first);
      out.push({ a0: a, a1: end, z0: z, z1: Math.min(heightIn, z + up) });
      a = end;
      first = along;
    }
  }
  return out;
}

/** Panels along one wall: full panels of `panelIn`, then the remainder. */
export function panelize(lengthIn, panelIn) {
  const out = [];
  let at = 0;
  while (lengthIn - at > 0.01) {
    const len = Math.min(panelIn, lengthIn - at);
    out.push({ start: at, length: len });
    at += len;
  }
  return out;
}

/** Stud locations in a panel: every `spacing` from its start, plus the end. */
export function studPositions(lengthIn, spacingIn) {
  const s = Math.max(1, spacingIn);
  const pos = [];
  for (let x = 0; x <= lengthIn - STUD_W + 0.01; x += s) pos.push(x);
  const end = lengthIn - STUD_W;
  if (end - pos[pos.length - 1] > 0.01) pos.push(end);
  return pos;
}

/**
 * Where the loose top plate's joints go along a run: stock-length pieces,
 * shifted so no joint lands within 24" of a panel joint.
 */
export function looseJoints(runIn, stockIn, panelJoints) {
  const clashes = (j) => panelJoints.some((p) => Math.abs(p - j) < LAP_MIN);
  const tryOffset = (first) => {
    const joints = [];
    let at = first;
    while (at < runIn - 0.01) { joints.push(at); at += stockIn; }
    return joints;
  };
  for (const first of [stockIn, stockIn - 48, stockIn - 24, stockIn - 72, stockIn - 96, stockIn - 36]) {
    if (first <= 0) continue;
    const joints = tryOffset(first);
    if (!joints.some(clashes)) return { joints, clashes: 0 };
  }
  const joints = tryOffset(stockIn);
  return { joints, clashes: joints.filter(clashes).length };
}

/** The four exterior walls of a rectangle, in inches, on the floor (x, y). */
export function wallsOf(lengthFt, widthFt, depthIn) {
  const L = n(lengthFt) * 12;
  const W = n(widthFt) * 12;
  const t = depthIn;
  return [
    { id: 'A', label: 'Wall A', length: L, origin: [0, 0], dir: [1, 0], through: true },
    { id: 'B', label: 'Wall B', length: Math.max(0, W - 2 * t), origin: [L - t, t], dir: [0, 1], through: false },
    { id: 'C', label: 'Wall C', length: L, origin: [L, W - t], dir: [-1, 0], through: true },
    { id: 'D', label: 'Wall D', length: Math.max(0, W - 2 * t), origin: [t, W - t], dir: [0, -1], through: false },
  ];
}

/* ───────────── the check ───────────── */

/**
 * level: the estimate level (exteriorSections, looseMaterials…)
 * dims: lengthFt, widthFt of the building
 * opts.panelLenFt: manufacture panel length
 */
export function layoutCheck(level = {}, { lengthFt, widthFt } = {}, { panelLenFt = 8, sheathing = 'vertical' } = {}) {
  const sections = (level.exteriorSections || []).filter(Boolean);
  if (!sections.length || !(n(lengthFt) > 0) || !(n(widthFt) > 0)) return null;

  // the section with most wall length sets height, spacing and stock (rectangle = one wall type)
  const main = [...sections].sort((a, b) => n(b.lengthLF) - n(a.lengthLF))[0];
  const sel = main.sel || {};
  const heightFt = n(main.heightFt) || 12;
  const heightIn = heightFt * 12;
  const spacing = n(main.studSpacingIn) || 16;
  const mult = Math.max(1, n(main.studMultiplier) || 1);
  const depth = studDepthIn(sel.studs?.sizeLabel || sel.bottomPlate?.sizeLabel || '');
  const panelIn = Math.max(24, n(panelLenFt) * 12 || 96);
  const looseSel = level.looseMaterials?.sel || {};
  const stock = {
    bottomPlate: pieceLength(sel.bottomPlate) * 12,
    topPlate: pieceLength(sel.topPlate) * 12,
    studs: pieceLength(sel.studs, 0) * 12 || heightIn,          // no size picked: assume a stud that fits
    blocking: pieceLength(sel.blocking) * 12,
    looseTop: pieceLength(looseSel.extTopPlate) * 12,
    loosePT: pieceLength(looseSel.extBottomPT) * 12,
  };

  const walls = wallsOf(lengthFt, widthFt, depth).map((w) => ({ ...w, panels: panelize(w.length, panelIn) }));
  const studLen = heightIn - 3 * PLATE_T;
  const blockRows = Math.max(0, Math.ceil(heightFt / 4) - 1);

  const cuts = { bottomPlate: [], topPlate: [], studs: [], blocking: [], looseTop: [], loosePT: [] };
  const sheetPieces = [];
  let panelCount = 0;
  let clashes = 0;
  for (const w of walls) {
    for (const p of w.panels) {
      panelCount += 1;
      cuts.bottomPlate.push(p.length);
      cuts.topPlate.push(p.length);
      const pos = studPositions(p.length, spacing);
      p.studs = pos;
      for (let i = 0; i < pos.length * mult; i += 1) cuts.studs.push(studLen);
      for (let r = 0; r < blockRows; r += 1) {
        for (let i = 0; i + 1 < pos.length; i += 1) cuts.blocking.push(pos[i + 1] - pos[i] - STUD_W * mult);
      }
      // vertical sheets stop at the panel ends; at the corners the butting
      // wall's sheathing runs on over the through wall's end
      if (sheathing !== 'horizontal') {
        const first = p.start === 0;
        const last = p.start + p.length >= w.length - 0.01;
        const a0 = p.start - (!w.through && first ? depth : 0);
        const a1 = p.start + p.length + (!w.through && last ? depth : 0);
        p.sheets = sheetLayout(a0, a1, heightIn, sheathing);
        for (const sh of p.sheets) sheetPieces.push([sh.a1 - sh.a0, sh.z1 - sh.z0]);
      }
    }
    // horizontal sheets run as one brick bond along the whole wall, across the panel joints
    if (sheathing === 'horizontal' && w.length > 0) {
      const a0 = w.through ? 0 : -depth;
      const a1 = w.through ? w.length : w.length + depth;
      w.sheets = sheetLayout(a0, a1, heightIn, 'horizontal');
      for (const sh of w.sheets) sheetPieces.push([sh.a1 - sh.a0, sh.z1 - sh.z0]);
    }
    // loose plates: the top plate laps over the butting walls, so it runs the full side
    const panelJoints = w.panels.slice(1).map((p) => p.start);
    const run = w.through ? w.length - 2 * depth : w.length + 2 * depth;
    const lj = looseJoints(run, stock.looseTop, panelJoints.map((j) => j + (w.through ? -depth : depth)));
    clashes += lj.clashes;
    w.looseJoints = lj.joints;
    let at = 0;
    for (const j of [...lj.joints, run]) { cuts.looseTop.push(j - at); at = j; }
    cuts.loosePT.push(...panelize(w.length, stock.loosePT).map((x) => x.length));
  }
  for (let i = 0; i < 4; i += 1) cuts.studs.push(studLen); // corner backer studs

  // what the cuts really use
  const used = {
    bottomPlate: cutLinear(cuts.bottomPlate, stock.bottomPlate),
    topPlate: cutLinear(cuts.topPlate, stock.topPlate),
    studs: cutLinear(cuts.studs, stock.studs),
    blocking: blockRows > 0 ? cutLinear(cuts.blocking, stock.blocking) : { pieces: 0, tooLong: 0 },
    sheathing: { pieces: cutSheets(sheetPieces).sheets, tooLong: 0 },
    looseTop: cutLinear(cuts.looseTop, stock.looseTop),
    loosePT: cutLinear(cuts.loosePT, stock.loosePT),
  };

  // what the estimate has for this level
  const calc = sections.map((s) => computeWallSection(s, 'exterior'));
  const estRow = (key) => calc.reduce((acc, c) => {
    const r = c.baseRows.find((x) => x.key === key);
    if (r) { acc.raw += n(r.qtyRaw); acc.final += n(r.qtyFinal); acc.waste = r.wastePct; acc.unit = r.unit; }
    return acc;
  }, { raw: 0, final: 0, waste: 0, unit: '' });
  const estLF = sections.reduce((s, x) => s + n(x.lengthLF), 0);
  const loose = computeLoosePanel(level.looseMaterials, { extLengthLF: estLF, panelLenFt });
  const looseRow = (key) => {
    const r = loose.exteriorRows.find((x) => x.key === key);
    return { raw: n(r?.qtyRaw), final: n(r?.qtyFinal), waste: n(r?.wastePct), unit: r?.unit || 'pcs' };
  };

  const rows = [
    { key: 'bottomPlate', label: 'Bottom plate', est: estRow('bottomPlate'), used: used.bottomPlate, stockFt: stock.bottomPlate / 12 },
    { key: 'topPlate', label: 'Top plate', est: estRow('topPlate'), used: used.topPlate, stockFt: stock.topPlate / 12 },
    { key: 'studs', label: 'Studs', est: estRow('studs'), used: used.studs, stockFt: stock.studs / 12 },
    ...(blockRows > 0 ? [{ key: 'blocking', label: 'Blocking', est: estRow('blocking'), used: used.blocking, stockFt: stock.blocking / 12 }] : []),
    { key: 'sheathing', label: `Sheathing (4×8, ${sheathing})`, est: estRow('sheathing'), used: used.sheathing },
    { key: 'looseTop', label: 'Loose top plate', est: looseRow('extTopPlate'), used: used.looseTop, stockFt: stock.looseTop / 12 },
    { key: 'loosePT', label: 'Loose PT plate', est: looseRow('extBottomPT'), used: used.loosePT, stockFt: stock.loosePT / 12 },
  ].map((r) => {
    const needed = r.used.pieces;
    const leftover = Math.ceil(r.est.final) - needed;
    const leftoverPct = needed > 0 ? (leftover / needed) * 100 : 0;
    // the waste the real cuts needed over the estimate's raw quantity
    const realWastePct = r.est.raw > 0 ? ((needed - r.est.raw) / r.est.raw) * 100 : 0;
    let status = 'match';                                    // leftover within 5 points of Waste %
    if (r.used.tooLong > 0) status = 'stock-too-short';      // a cut is longer than the stock piece
    else if (leftover < 0) status = 'short';                 // the estimate does not cover the layout
    else if (leftoverPct > n(r.est.waste) + 5) status = 'more-left';
    else if (leftoverPct < n(r.est.waste) - 5) status = 'less-left';
    return { ...r, needed, leftover, leftoverPct, realWastePct, status };
  });

  return {
    lengthFt: n(lengthFt), widthFt: n(widthFt), heightFt, spacing, mult, depth, panelIn,
    perimeterLF: 2 * (n(lengthFt) + n(widthFt)), estimateLF: estLF,
    sectionsUsed: sections.length, mainSection: main.name || 'Section',
    mixedSections: sections.some((s) => n(s.heightFt) !== heightFt || (n(s.studSpacingIn) || 16) !== spacing),
    walls, panelCount, blockRows, studLenIn: studLen, looseClashes: clashes, rows, sheathing,
    sheetCount: sheetPieces.length, fullSheets: sheetPieces.filter(([a, b]) => Math.max(a, b) >= SHEET_H - 0.01 && Math.min(a, b) >= SHEET_W - 0.01).length,
  };
}
