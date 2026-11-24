// src/components/landing/house.js
// The house the "how it works" section puts together on its own, the way a
// crew stands a panelized house: a 28' x 20' deck, the exterior walls as 8'
// panels set one at a time (bearing walls blocked every 4'), two 2x4
// partitions, the gable ends, a row of trusses, then 4x8 OSB sheet by sheet,
// laid horizontally (8' along the wall, 4' up) on the walls, the gables and
// the roof. Each piece knows where it lands (feet, y up), which way it faces,
// and the slice of the build (0 to 1) in which it arrives. A piece is a framed
// panel (framed), a box (box: [w, h, d], a sheet) or an outline extruded to
// sheathing thickness (poly: [[x, y], ...] in feet, a sheet cut to a gable).
import { frameWall } from './walls';

const T = 1.5;
const LEN = 336;      // 28'
const WID = 240;      // 20'
const WALL_H = 109.125;

/** A common truss: bottom chord, two top chords at the pitch, a king post and two webs. */
function truss(span, pitch) {
  const rise = (span / 2) * pitch;
  const ang = Math.atan(pitch);
  const top = Math.hypot(span / 2, rise);
  const members = [];
  const add = (x, y, w, rot) => members.push({ kind: 'plate', x, y, w, h: 3.5, z: 0, d: T, rot, len: w });
  add(0, 0, span, 0);
  add(span / 4 - top / 2, rise / 2 - 1.75 + 1.75, top, ang);
  add((3 * span) / 4 - top / 2, rise / 2 - 1.75 + 1.75, top, -ang);
  members.push({ kind: 'plate', x: span / 2 - 1.75, y: 3.5, w: 3.5, h: rise - 4, z: 0, d: T, len: rise });
  const web = Math.hypot(span / 4, rise / 2);
  const wa = Math.atan2(rise / 2, span / 4);
  add((3 * span) / 8 - web / 2, rise / 4, web, -wa + Math.PI);
  add((5 * span) / 8 - web / 2, rise / 4, web, wa - Math.PI);
  return { members, length: span, depth: T, height: rise };
}

/** Rectangles left of a rectangle once the openings are cut out of it. */
function cutOut(rect, holes) {
  let parts = [rect];
  for (const [hx0, hy0, hx1, hy1] of holes) {
    const next = [];
    for (const [x0, y0, x1, y1] of parts) {
      if (hx1 <= x0 || hx0 >= x1 || hy1 <= y0 || hy0 >= y1) { next.push([x0, y0, x1, y1]); continue; }
      if (hx0 > x0) next.push([x0, y0, hx0, y1]);
      if (hx1 < x1) next.push([hx1, y0, x1, y1]);
      const mx0 = Math.max(x0, hx0); const mx1 = Math.min(x1, hx1);
      if (hy0 > y0) next.push([mx0, y0, mx1, hy0]);
      if (hy1 < y1) next.push([mx0, hy1, mx1, y1]);
    }
    parts = next;
  }
  return parts.filter(([x0, y0, x1, y1]) => x1 - x0 > 1 && y1 - y0 > 1);
}

/** Clip a convex polygon to a rectangle (Sutherland-Hodgman). */
function clipToRect(poly, [x0, y0, x1, y1]) {
  const edges = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  let out = poly;
  for (const [inside, cross] of edges) {
    const src = out; out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i]; const b = src[(i + 1) % src.length];
      if (inside(b)) { if (!inside(a)) out.push(cross(a, b)); out.push(b); } else if (inside(a)) out.push(cross(a, b));
    }
    if (!out.length) break;
  }
  return out;
}

const SHEET_L = 96;   // a 4x8 sheet laid horizontally: 8' along the wall
const SHEET_H = 48;   // and 4' up
const OSB = 7 / 16;
const D6 = 5.5; const D4 = 3.5;
// the roof: 6/12, its sheathing sits on the truss top chords, 64" over the wall
// plates at the ridge. The gables are framed to stay under that plane, 3/4" clear.
const PITCH = 6 / 12;
const ROOF_SEAT = 64;
const GABLE_EAVE = ROOF_SEAT - (WID / 2) * PITCH - 0.75;

/**
 * The pieces in arrival order. from: where it flies in from (offset in ft);
 * at: [start, end] of the build.
 */
export function housePieces() {
  const ft = (i) => i / 12;
  const y0 = 1;                               // top of the deck
  const yTop = y0 + ft(WALL_H);
  const hx = ft(LEN) / 2; const hz = ft(WID) / 2;
  // corners, as a framer laps them: the front and back walls are framed
  // 7/16" short of the house's length so the side walls' sheathing fits
  // outside them; the front and back sheathing runs the full length over the
  // side sheathing's edge, and the side sheathing stops against it.
  const longLen = LEN - 2 * OSB;
  const sideLen = WID - 2 * (D6 + OSB);

  // exterior walls: where the outer face is, which way it faces, its openings (inches from its start)
  const walls = [
    { key: 'front', len: longLen, ry: 0, face: hz, bearing: true, sheath: [-OSB, longLen + OSB],
      openings: [{ x: 40, w: 36, h: 48, sill: 36, header: 10 }, { x: 140, w: 38, h: 82.5, sill: 0, header: 10 }, { x: 214, w: 48, h: 48, sill: 36, header: 10 }] },
    { key: 'right', len: sideLen, ry: Math.PI / 2, face: hx, bearing: false, sheath: [-D6, sideLen + D6],
      openings: [{ x: 110, w: 36, h: 48, sill: 36, header: 10 }] },
    { key: 'back', len: longLen, ry: Math.PI, face: hz, bearing: true, sheath: [-OSB, longLen + OSB],
      openings: [{ x: 30, w: 36, h: 48, sill: 36, header: 10 }, { x: 214, w: 60, h: 48, sill: 36, header: 12 }] },
    { key: 'left', len: sideLen, ry: -Math.PI / 2, face: hx, bearing: false, sheath: [-D6, sideLen + D6],
      openings: [{ x: 110, w: 36, h: 48, sill: 36, header: 10 }] },
  ];
  // the wall's own x axis and its outward normal, in the house's xz plane
  const along = (w, lxInches) => [Math.cos(w.ry) * ft(lxInches), -Math.sin(w.ry) * ft(lxInches)];
  const out = (w) => [Math.sin(w.ry), Math.cos(w.ry)];

  const panels = []; const sheets = [];
  for (const w of walls) {
    const [nx, nz] = out(w);
    const frameC = w.face - ft(OSB + D6 / 2);   // framing centre line, from the house centre
    // 8' panels, set one at a time (a bearing wall is blocked every 4')
    for (let a = 0; a < w.len - 1; a += SHEET_L) {
      const b = Math.min(w.len, a + SHEET_L);
      const openings = w.openings.filter((o) => o.x >= a && o.x + o.w <= b).map((o) => ({ ...o, x: o.x - a }));
      const framed = frameWall({ length: b - a, height: WALL_H, size: 6, oc: 16, openings, bearing: w.bearing });
      const [ax, az] = along(w, (a + b) / 2 - w.len / 2);
      panels.push({ key: `${w.key}${a}`, framed, pos: [nx * frameC + ax, y0, nz * frameC + az], ry: w.ry, from: [nx * 14, 6, nz * 14] });
    }
    // OSB laid horizontally, cut around the openings, bottom row first
    const holes = w.openings.map((o) => [o.x, o.sill, o.x + o.w, o.sill + o.h]);
    const faceC = w.face - ft(OSB) / 2;
    const g = 3 / 16;   // a visible joint between sheets
    for (let r0 = 0; r0 < WALL_H - 0.5; r0 += SHEET_H) {
      const r1 = Math.min(WALL_H, r0 + SHEET_H);
      for (let c0 = w.sheath[0]; c0 < w.sheath[1] - 0.5; c0 += SHEET_L) {
        const c1 = Math.min(w.sheath[1], c0 + SHEET_L);
        for (const [x0, yy0, x1, yy1] of cutOut([c0, r0, c1, r1], holes)) {
          const [ax, az] = along(w, (x0 + x1) / 2 - w.len / 2);
          sheets.push({
            key: `osb-${w.key}-${r0}-${x0}-${yy0}`,
            box: [ft(x1 - x0 - 2 * g), ft(yy1 - yy0 - 2 * g), ft(OSB)],
            pos: [nx * faceC + ax, y0 + ft((yy0 + yy1) / 2), nz * faceC + az],
            ry: w.ry, from: [nx * 6, 2, nz * 6],
          });
        }
      }
    }
  }

  const part1 = frameWall({ length: 200, height: WALL_H, size: 4, oc: 16, openings: [{ x: 120, w: 32, h: 82.5, sill: 0, header: 6 }] });
  const part2 = frameWall({ length: 96, height: WALL_H, size: 4, oc: 16, openings: [{ x: 30, w: 32, h: 82.5, sill: 0, header: 6 }] });
  const gable = frameWall({ length: WID, height: GABLE_EAVE, size: 4, oc: 16, rake: PITCH });
  const tr = truss(WID, 6 / 12);
  const dIn = ft(D6 + OSB);
  const gableX = hx - ft(OSB) - ft(D4) / 2;

  const pieces = [];
  panels.forEach((p, i) => { const a = 0.06 + i * 0.02; pieces.push({ ...p, at: [a, a + 0.035] }); });
  pieces.push(
    { key: 'part1', framed: part1, pos: [-hx + dIn + ft(200) / 2, y0, -1.5], ry: 0, from: [0, 14, 0], at: [0.34, 0.39] },
    { key: 'part2', framed: part2, pos: [ft(30), y0, -hz + dIn + ft(96) / 2], ry: Math.PI / 2, from: [0, 14, 0], at: [0.36, 0.41] },
    { key: 'gableL', framed: gable, pos: [-gableX, yTop, 0], ry: -Math.PI / 2, from: [-10, 9, 0], at: [0.41, 0.46] },
    { key: 'gableR', framed: gable, pos: [gableX, yTop, 0], ry: Math.PI / 2, from: [10, 9, 0], at: [0.43, 0.48] },
  );
  // trusses at 24" on centre between the gables, one after another
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = 0.47 + (i / n) * 0.14;
    pieces.push({ key: `truss${i}`, framed: tr, pos: [-12 + i * 2, yTop, 0], ry: Math.PI / 2, from: [0, 10, 0], at: [a, a + 0.03] });
  }
  // the walls' OSB, sheet by sheet
  sheets.forEach((sh, i) => { const a = 0.61 + (i / sheets.length) * 0.16; pieces.push({ ...sh, at: [a, a + 0.025] }); });

  // the gables' OSB: horizontal sheets cut to the rake
  const half = WID / 2 - OSB;
  const outline = [[-half, 0], [half, 0], [half, GABLE_EAVE], [0, GABLE_EAVE + (WID / 2) * PITCH], [-half, GABLE_EAVE]];
  const gSheets = [];
  for (const side of [-1, 1]) {
    for (let r0 = 0; r0 < GABLE_EAVE + (WID / 2) * PITCH; r0 += SHEET_H) {
      for (let c0 = -half; c0 < half - 0.5; c0 += SHEET_L) {
        const poly = clipToRect(outline, [c0 + 1 / 16, r0 + 1 / 16, Math.min(half, c0 + SHEET_L) - 1 / 16, r0 + SHEET_H - 1 / 16]);
        if (poly.length >= 3) gSheets.push({ key: `gosb${side}${r0}${c0}`, poly: poly.map(([x, y]) => [ft(x), ft(y)]), pos: [side * (hx - ft(OSB)), yTop, 0], ry: (side * Math.PI) / 2, from: [side * 6, 3, 0] });
      }
    }
  }
  gSheets.forEach((sh, i) => { const a = 0.77 + (i / gSheets.length) * 0.05; pieces.push({ ...sh, at: [a, a + 0.025] }); });

  // 4x8 OSB on the roof, with a 1' overhang: 4 sheets along the ridge, 3 rows down each side
  const pitch = Math.atan(0.5);
  const ridge = yTop + ft(ROOF_SEAT);        // top of the truss top chords at the ridge
  const slopeLen = (hz + 1) / Math.cos(pitch);
  const cols = [[-15, -7], [-7, 1], [1, 9], [9, 15]];
  const rows = [[0, 4], [4, 8], [8, slopeLen]];
  const t = ft(OSB);
  const roof = [];
  for (const side of [1, -1]) {
    rows.forEach(([d0, d1], r) => cols.forEach(([x0, x1]) => {
      const dc = (d0 + d1) / 2;
      roof.push({
        r, side,
        box: [x1 - x0 - 0.04, t, d1 - d0 - 0.04],
        pos: [(x0 + x1) / 2, ridge - dc * Math.sin(pitch) + t / 2 / Math.cos(pitch), side * dc * Math.cos(pitch)],
        rx: side * pitch,
      });
    }));
  }
  // eave rows first, ridge last, both sides together
  roof.sort((a, b) => b.r - a.r);
  roof.forEach((sh, i) => {
    const a = 0.82 + (i / roof.length) * 0.15;
    pieces.push({ key: `roof${i}`, box: sh.box, pos: sh.pos, ry: 0, rx: sh.rx, from: [0, 8, sh.side * 4], at: [a, a + 0.03] });
  });
  return { pieces, deck: { w: ft(LEN) + 0.6, d: ft(WID) + 0.6, h: y0 }, footprint: { hx, hz } };
}

/** Which of the five steps a point of the build belongs to. */
export const STEP_AT = [0, 0.06, 0.41, 0.6, 0.8];
export const stepFor = (p) => STEP_AT.reduce((s, at, i) => (p >= at ? i : s), 0);
