// src/components/landing/house.js
// The house the "how it works" section puts together while you scroll: a
// 28' x 20' deck, four exterior 2x6 panels, two 2x4 partitions, the gable
// ends and a row of trusses. Each piece knows where it lands (feet, y up),
// which way it faces, and the slice of scroll progress in which it arrives.
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

/**
 * The pieces in arrival order. from: where it flies in from (offset in ft);
 * at: [start, end] of scroll progress.
 */
export function housePieces() {
  const ext = (len, openings) => frameWall({ length: len, height: WALL_H, size: 6, oc: 16, sheath: 'full', openings });
  const front = ext(LEN, [{ x: 40, w: 36, h: 48, sill: 36, header: 10 }, { x: 150, w: 38, h: 82.5, sill: 0, header: 10 }, { x: 250, w: 48, h: 48, sill: 36, header: 10 }]);
  const back = ext(LEN, [{ x: 70, w: 36, h: 48, sill: 36, header: 10 }, { x: 220, w: 60, h: 48, sill: 36, header: 12 }]);
  const d = front.depth;
  const sideLen = WID - 2 * d;
  const side = ext(sideLen, [{ x: 96, w: 36, h: 48, sill: 36, header: 10 }]);
  const part1 = frameWall({ length: 200, height: WALL_H, size: 4, oc: 16, openings: [{ x: 120, w: 32, h: 82.5, sill: 0, header: 6 }] });
  const part2 = frameWall({ length: 96, height: WALL_H, size: 4, oc: 16, openings: [{ x: 30, w: 32, h: 82.5, sill: 0, header: 6 }] });
  const gable = frameWall({ length: WID, height: 4.5, size: 4, oc: 16, rake: 6 / 12 });
  const tr = truss(WID, 6 / 12);

  const ft = (i) => i / 12;
  const y0 = 1;                               // top of the deck
  const yTop = y0 + ft(WALL_H);
  const hx = ft(LEN) / 2; const hz = ft(WID) / 2;
  const dz = ft(d) / 2;

  const pieces = [
    { key: 'front', framed: front, pos: [0, y0, hz - dz], ry: 0, from: [0, 6, 14], at: [0.17, 0.27] },
    { key: 'left', framed: side, pos: [-hx + dz, y0, 0], ry: -Math.PI / 2, from: [-14, 6, 0], at: [0.23, 0.33] },
    { key: 'back', framed: back, pos: [0, y0, -hz + dz], ry: Math.PI, from: [0, 6, -14], at: [0.29, 0.39] },
    { key: 'right', framed: side, pos: [hx - dz, y0, 0], ry: Math.PI / 2, from: [14, 6, 0], at: [0.35, 0.45] },
    { key: 'part1', framed: part1, pos: [-ft(LEN) / 2 + ft(d) + ft(200) / 2, y0, -1.5], ry: 0, from: [0, 14, 0], at: [0.44, 0.52] },
    { key: 'part2', framed: part2, pos: [ft(30), y0, -hz + ft(d) + ft(96) / 2], ry: Math.PI / 2, from: [0, 14, 0], at: [0.48, 0.56] },
    { key: 'gableL', framed: gable, pos: [-hx + dz, yTop, 0], ry: -Math.PI / 2, from: [-10, 9, 0], at: [0.53, 0.6] },
    { key: 'gableR', framed: gable, pos: [hx - dz, yTop, 0], ry: Math.PI / 2, from: [10, 9, 0], at: [0.56, 0.63] },
  ];
  // trusses at 24" on centre between the gables, one after another
  const n = 13;
  for (let i = 0; i < n; i++) {
    const x = -12 + i * 2;
    const a = 0.6 + (i / n) * 0.2;
    pieces.push({ key: `truss${i}`, framed: tr, pos: [x, yTop, 0], ry: Math.PI / 2, from: [0, 10, 0], at: [a, a + 0.05] });
  }
  return { pieces, deck: { w: ft(LEN) + 0.6, d: ft(WID) + 0.6, h: y0 }, footprint: { hx, hz } };
}

/** Which of the five steps a scroll progress belongs to. */
export const STEP_AT = [0, 0.16, 0.42, 0.6, 0.82];
export const stepFor = (p) => STEP_AT.reduce((s, at, i) => (p >= at ? i : s), 0);
