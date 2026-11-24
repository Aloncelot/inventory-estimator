// src/components/landing/walls.js
// The five wall panels the landing hero cycles through, framed the way a
// panel shop builds them: plates, studs on layout, king and jack studs, a
// header and cripples at each opening, OSB in 4x8 sheets (a ripped strip
// fills a wall taller than 8').
// Everything is in inches: x along the wall, y up, z through it (sheathing
// on +z). The same members give the material list shown beside the model.

import { frameStair, stairTakeoff } from './stairs';

const T = 1.5;            // lumber thickness
const OSB = 7 / 16;
const DEPTH = { 4: 3.5, 6: 5.5, 8: 7.25, 10: 9.25, 12: 11.25 };
const SHEET_W = 48;       // OSB sheets are 4x8
const SHEET_H = 96;
const ZIP_FOAM = 1;       // ZIP System R-6: 1" of foam behind the 7/16" panel
const TAPE = 3.75;        // ZIP System tape width

/** Feet and inches, the way a cut list writes them: 9'-1 1/8", 104 5/8". */
export function ftIn(inches, { feet = true } = {}) {
  const r = Math.round(inches * 8) / 8;
  const whole = Math.floor(r + 1e-6);
  const frac = Math.round((r - whole) * 8);
  const f = frac ? ` ${frac % 2 ? frac : frac % 4 ? frac / 2 : frac / 4}/${frac % 2 ? 8 : frac % 4 ? 4 : 2}` : '';
  if (!feet) return `${whole}${f}"`;
  const ft = Math.floor(whole / 12);
  const inch = whole % 12;
  return `${ft}'-${inch}${f}"`;
}

/**
 * Frame one wall. Returns { members, length, height, size } where each member
 * is { kind, x, y, z, w, h, d, rot?, poly?, len, nominal } (x/y/z = min corner,
 * w/h/d = size; rot = rotation about z through the member's centre; poly =
 * an outline [[x, y], ...] in inches extruded d from z, in place of a box).
 */
export function frameWall(spec) {
  const { length: L, height: H, size = 6, oc = 16, openings = [], sheath = 'none', rake = 0, hardware = false, blocking = 0, bearing = false, zip = false } = spec;
  const D = DEPTH[size];
  const members = [];
  const add = (m) => members.push({ z: 0, d: D, ...m });
  const lumber = (kind, x, y, w, h, extra = {}) => add({ kind, x, y, w, h, nominal: `2x${size}`, len: Math.max(w, h), ...extra });

  const eave = H;                              // top of the top plates at the ends
  const top = (x) => eave + (rake ? rake * Math.min(x, L - x) : 0); // top of plates at x
  const half = L / 2;

  // plates: one bottom plate (pressure treated), a double top plate (sloped on a rake wall)
  lumber('plate', 0, 0, L, T, { note: 'PT' });
  if (!rake) {
    lumber('plate', 0, H - 2 * T, L, T);
    lumber('plate', 0, H - T, L, T);
  } else {
    const run = Math.hypot(half, half * rake);
    const ang = Math.atan2(half * rake, half);
    for (const side of [0, 1]) {
      const cx = side ? half + half / 2 : half / 2;
      const cy = eave + (half * rake) / 2 - T / (2 * Math.cos(ang));
      add({ kind: 'plate', x: cx - run / 2, y: cy - T / 2, w: run, h: T, rot: side ? -ang : ang, nominal: `2x${size}`, len: run });
    }
  }
  const studTop = (x) => (rake ? top(x + T / 2) - T / Math.cos(Math.atan(rake)) : H - 2 * T);

  // the layout: studs on centre from the left end, plus the end stud
  const layout = [];
  for (let x = 0; x <= L - T; x += oc) layout.push(x === 0 ? 0 : x - T / 2);
  if (layout[layout.length - 1] < L - T - 0.01) layout.push(L - T);

  const inOpening = (x) => openings.find((o) => x + T > o.x - 2 * T && x < o.x + o.w + 2 * T);
  for (const x of layout) {
    const o = inOpening(x);
    if (!o) { lumber('stud', x, T, T, studTop(x) - T, { len: studTop(x) - T }); continue; }
    // a layout stud inside an opening becomes cripples above the header and under the sill
    if (x >= o.x && x + T <= o.x + o.w) {
      const hTop = o.sill + o.h + DEPTH[o.header];
      const above = studTop(x) - hTop;
      if (above > 1) lumber('cripple', x, hTop, T, above, { len: above });
      if (o.sill > 0) {
        const below = o.sill - 2 * T;
        if (below > 1) lumber('cripple', x, T, T, below, { len: below });
      }
    }
  }

  for (const o of openings) {
    const hd = DEPTH[o.header];
    const headY = o.sill + o.h;
    // king studs full height, jack studs to the header
    lumber('stud', o.x - 2 * T, T, T, studTop(o.x - 2 * T) - T, { len: studTop(o.x - 2 * T) - T, role: 'king' });
    lumber('stud', o.x + o.w + T, T, T, studTop(o.x + o.w + T) - T, { len: studTop(o.x + o.w + T) - T, role: 'king' });
    lumber('stud', o.x - T, T, T, headY - T, { len: headY - T, role: 'jack' });
    lumber('stud', o.x + o.w, T, T, headY - T, { len: headY - T, role: 'jack' });
    // header: two plies on edge, full wall depth
    add({ kind: 'header', x: o.x - T, y: headY, w: o.w + 2 * T, h: hd, nominal: `2x${o.header}`, len: o.w + 2 * T, plies: size === 6 ? 3 : 2 });
    // sill: a flat 2x under a window
    if (o.sill > 0) lumber('plate', o.x, o.sill - T, o.w, T, { role: 'sill' });
  }

  // horizontal blocking: a row every 4' of height on a bearing wall (always)
  // and on any wall over 10' (gables included, measured to the peak), plus
  // any row the spec asks for (a shear wall's mid-height row)
  const tallest = rake ? eave + rake * half : H;
  const rows = new Set(typeof blocking === 'number' && blocking ? [blocking] : Array.isArray(blocking) ? blocking : []);
  if (bearing || tallest > 120) for (let y = 48; y < tallest - 2 * T - 4; y += 48) rows.add(y);
  const verticals = members.filter((m) => m.kind === 'stud' || m.kind === 'cripple');
  for (const row of [...rows].sort((a, b) => a - b)) {
    const y = row - T / 2;
    const at = verticals.filter((m) => m.y < y && m.y + m.h > y + T).map((m) => m.x).sort((a, b) => a - b);
    for (let i = 0; i < at.length - 1; i++) {
      const x = at[i] + T; const w = at[i + 1] - x;
      if (w <= 2) continue;
      // never across an opening
      const blocked = openings.some((o) => x < o.x + o.w + T && x + w > o.x - T && y + T > o.sill - 2 * T && y < o.sill + o.h + DEPTH[o.header]);
      if (!blocked) lumber('block', x, y, w, T, { len: w });
    }
  }

  // hold-downs at both ends
  if (hardware) {
    for (const x of [T + 0.1, L - T - 3.1]) add({ kind: 'steel', x, y: T, w: 3, h: 18, z: -0.25, d: D + 0.5, nominal: 'HDU', len: 18 });
  }

  // sheathing: 4x8 sheets standing up, a strip ripped from more sheets above
  // them on a wall taller than 8', all cut around the openings. OSB, or ZIP
  // System R-6: a 7/16" green structural panel over 1" of foam, its seams
  // covered with 3-3/4" ZIP tape.
  // a gable is sheathed the same way, every sheet and strip cut to the rake
  const outline = rake ? [[0, 0], [L, 0], [L, eave], [half, eave + rake * half], [0, eave]] : null;
  const fit = (piece) => {
    if (!outline) return piece;
    const poly = clipToRect(outline, [piece.x, piece.y, piece.x + piece.w, piece.y + piece.h]);
    return poly.length >= 3 ? { ...piece, poly, area: polyArea(poly) } : null;
  };
  const sheet = (raw) => {
    const piece = fit(raw);
    if (!piece) return;
    if (!zip) { add({ ...piece, kind: 'osb', z: D, d: OSB, nominal: 'OSB' }); return; }
    add({ ...piece, kind: 'zipfoam', z: D, d: ZIP_FOAM, nominal: 'ZIP R-6' });
    add({ ...piece, kind: 'zip', z: D + ZIP_FOAM, d: OSB, nominal: 'ZIP R-6' });
  };
  const sheathTop = rake ? eave + rake * half : H; // highest point the sheathing reaches
  if (sheath !== 'none') {
    const upTo = sheath === 'partial' ? Math.min(L, spec.sheathTo || 96) : L;
    const gap = 1 / 8;
    const bands = sheathTop > SHEET_H ? [[0, SHEET_H - gap], [SHEET_H, sheathTop]] : [[0, sheathTop]];
    for (let sx = 0; sx < upTo; sx += SHEET_W) {
      const x0 = sx; const x1 = Math.min(sx + SHEET_W, upTo);
      // split the sheet at opening edges, then cut the opening out of each strip
      const cuts = [x0, x1];
      for (const o of openings) for (const e of [o.x, o.x + o.w]) if (e > x0 && e < x1) cuts.push(e);
      cuts.sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i]; const b = cuts[i + 1];
        const o = openings.find((op) => a >= op.x - 0.01 && b <= op.x + op.w + 0.01);
        const spans = o ? [[0, o.sill], [o.sill + o.h, sheathTop]] : [[0, sheathTop]];
        bands.forEach(([b0, b1], band) => {
          for (const [s0, s1] of spans) {
            const y0 = Math.max(s0, b0); const y1 = Math.min(s1, b1);
            if (y1 - y0 < 1) continue;
            sheet({ x: a + (a === x0 ? gap : 0), y: y0, w: b - a - (a === x0 ? gap : 0) - (b === x1 ? gap : 0), h: y1 - y0, len: 0, sheet: x0, strip: band === 1 });
          }
        });
      }
    }
    // ZIP tape over every seam: the joints between sheets and the strip's
    // joint, never across an opening
    if (zip) {
      const face = D + ZIP_FOAM + OSB;
      const minus = (lo, hi, holes) => holes.sort((p, q) => p[0] - q[0]).reduce((segs, [h0, h1]) => segs.flatMap(([s0, s1]) => (h1 <= s0 || h0 >= s1 ? [[s0, s1]] : [[s0, h0], [h1, s1]])), [[lo, hi]]).filter(([s0, s1]) => s1 - s0 > 1);
      const tape = (piece) => { const p = fit(piece); if (p) add({ ...p, kind: 'tape', d: 0.05, nominal: 'ZIP tape' }); };
      const topAt = (x) => (rake ? eave + rake * Math.min(x, L - x) : H);
      for (let sx = SHEET_W; sx < upTo - 1; sx += SHEET_W) {
        const holes = openings.filter((o) => sx >= o.x && sx <= o.x + o.w).map((o) => [o.sill, o.sill + o.h]);
        for (const [y0, y1] of minus(0, topAt(sx), holes)) tape({ x: sx - TAPE / 2, y: y0, w: TAPE, h: y1 - y0, z: face, len: y1 - y0 });
      }
      if (sheathTop > SHEET_H) {
        const holes = openings.filter((o) => SHEET_H >= o.sill && SHEET_H <= o.sill + o.h).map((o) => [o.x, o.x + o.w]);
        for (const [x0, x1] of minus(0, upTo, holes)) tape({ x: x0, y: SHEET_H - TAPE / 2, w: x1 - x0, h: TAPE, z: face + 0.05, len: x1 - x0 });
      }
    }
  }

  const skin = sheath === 'none' ? 0 : zip ? ZIP_FOAM + OSB + 0.1 : OSB;
  return { members, length: L, height: rake ? eave + rake * half : H, eave, size, depth: D + skin };
}

/** Clip a convex polygon to a rectangle (Sutherland-Hodgman). */
export function clipToRect(poly, [x0, y0, x1, y1]) {
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

/** Area of a polygon [[x, y], ...]. */
const polyArea = (pts) => Math.abs(pts.reduce((t, [x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; return t + x * y2 - x2 * y; }, 0)) / 2;

const studLabel = (n, len) => `2x${n} stud ${ftIn(len, { feet: false })}`;

/** The material list for a framed wall: [qty, description] rows. */
export function takeoff(wall) {
  const rows = new Map();
  const bump = (key, qty = 1) => rows.set(key, (rows.get(key) || 0) + qty);
  const n = wall.size;
  for (const m of wall.members) {
    if (m.kind === 'stud' && !wall.rakeWall) bump(studLabel(n, Math.round(m.len * 8) / 8));
    else if (m.kind === 'stud' || m.kind === 'cripple') bump(m.kind === 'stud' ? `2x${n} stud, cut to the rake` : `2x${n} cripple`);
    else if (m.kind === 'plate') bump(m.note === 'PT' ? `2x${n} plate, pressure treated` : m.role === 'sill' ? `2x${n} sill` : `2x${n} plate`);
    else if (m.kind === 'header') bump(`${m.nominal} header, ${m.plies} ply, ${ftIn(m.len)}`);
    else if (m.kind === 'block') bump(`2x${n} block`);
    else if (m.kind === 'steel') bump('Hold-down with anchor');
  }
  // whole sheets standing up, plus the sheets the strips above them are ripped from
  const zipWall = wall.members.some((m) => m.kind === 'zip');
  const osb = wall.members.filter((m) => m.kind === (zipWall ? 'zip' : 'osb'));
  const whole = new Set(osb.filter((m) => !m.strip).map((m) => m.sheet)).size;
  const stripArea = osb.filter((m) => m.strip).reduce((t, m) => t + (m.area ?? m.w * m.h), 0);
  const sheets = whole + Math.ceil(stripArea / (SHEET_W * SHEET_H) - 1e-6);
  if (sheets) bump(zipWall ? 'ZIP System R-6 sheathing 4x8' : '7/16" OSB 4x8', sheets);
  const tapeIn = wall.members.filter((m) => m.kind === 'tape').reduce((t, m) => t + m.len, 0);
  if (tapeIn) bump('LF ZIP System tape, 3-3/4"', Math.ceil(tapeIn / 12));
  const rank = (d) => (/stud/.test(d) ? 0 : /header|OSB|ZIP|Hold-down/.test(d) ? 1 : /block|plate/.test(d) ? 2 : 3);
  return [...rows.entries()].map(([desc, qty]) => [qty, desc]).sort((a, b) => rank(a[1]) - rank(b[1]) || b[0] - a[0]).slice(0, 9);
}

export const WALLS = [
  {
    key: 'ext',
    name: 'Exterior wall, 2x6',
    // usually bearing too: blocked every 4'; ZIP R-6 on the first 12', framing left bare past it
    spec: { length: 192, height: 109.125, size: 6, oc: 16, bearing: true, zip: true, sheath: 'partial', sheathTo: 144, openings: [{ x: 64, w: 36, h: 48, sill: 36, header: 10 }] },
    face: 0.5,
  },
  {
    key: 'partition',
    name: 'Interior partition, 2x4',
    spec: { length: 120, height: 97.125, size: 4, oc: 16, openings: [{ x: 40, w: 38, h: 82.5, sill: 0, header: 6 }] },
  },
  {
    key: 'shear',
    name: 'Shear wall, 2x6',
    spec: { length: 96, height: 109.125, size: 6, oc: 16, sheath: 'full', hardware: true, blocking: 48 },
  },
  {
    key: 'gable',
    name: 'Gable end, 2x4',
    // the same ZIP R-6 and tape as the exterior wall, framing left bare past 10'
    spec: { length: 168, height: 97.125, size: 4, oc: 16, rake: 6 / 12, zip: true, sheath: 'partial', sheathTo: 120 },
    face: 0.5,
  },
  {
    key: 'bearing',
    name: 'Bearing wall, 2x6 at 24" o.c.',
    spec: { length: 216, height: 121.125, size: 6, oc: 24, bearing: true, sheath: 'partial', sheathTo: 144, openings: [{ x: 30, w: 48, h: 60, sill: 30, header: 12 }, { x: 138, w: 48, h: 60, sill: 30, header: 12 }] },
  },
].map((w) => {
  const framed = frameWall(w.spec);
  framed.rakeWall = !!w.spec.rake;
  return { ...w, framed, size: `${ftIn(w.spec.length)} by ${ftIn(framed.height)}`, list: takeoff(framed) };
});

// the sixth model: a U-shaped stair with its landing
const stair = frameStair();
WALLS.push({ key: 'stair', name: 'U-shaped stair with landing', framed: stair, face: 0.85, size: `${ftIn(stair.height)} rise, two 3'-0" flights`, list: stairTakeoff(stair) });
