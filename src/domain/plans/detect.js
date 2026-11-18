// src/domain/plans/detect.js
// Finds walls in the vector drawing of a floor plan. Pure functions over the
// output of extractPage(): no pdf.js, no DOM, so every rule is unit-tested.
//
// A wall on a plan is two (or more) parallel lines a wall-thickness apart. The
// detector:
//   1. reads the drawing scale from the sheet text (3/32" = 1'-0" …);
//   2. buckets segments by direction and line style, leaving out annotation
//      that can pass for a wall face (tag frames, dimension lines: marks.js)
//      and joining a face cut by a wall meeting it (a T);
//   3. pairs parallel lines whose spacing is a wall thickness (3"–14") and
//      overlap along their length, and merges overlapping pairs into bands;
//   4. joins collinear bands across openings (a door leaf/swing or window
//      glazing in the gap), recording the openings;
//   5. drops door leaves drawn open, guesses stud size from thickness, and
//      exterior vs interior by casting a ray from each wall outward: nothing
//      beyond it means it faces outside.
// Every guess is editable by the user; detection only has to get close.

import { tagFrames, dimensionLines, curveMarks } from './marks.js';

export const DETECT_DEFAULTS = {
  minThickIn: 3, // thinnest wall band (2x3 + no finish)
  maxThickIn: 14, // thickest band (2x10 + finishes, or a double wall)
  minSegFt: 0.6, // ignore line bits shorter than this
  minWallFt: 1.5, // drop walls shorter than this
  maxOpeningFt: 10, // widest gap joined as an opening
  minOpeningFt: 1.5, // narrower gaps are joined silently
  finishIn: 1.25, // drywall both faces, added to the stud depth
  extFinishIn: 2.75, // exterior: drywall + sheathing + siding/air gap
  doubleMinIn: 8.5, // interior bands this thick are read as (2) 2x4 walls
};

export const STUD_SIZES = [
  { size: '2x4', depth: 3.5 },
  { size: '2x6', depth: 5.5 },
  { size: '2x8', depth: 7.25 },
  { size: '2x10', depth: 9.25 },
];

/* ───────────────────────── scale ───────────────────────── */

const frac = (s) => {
  const t = String(s).trim();
  const m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/); if (m) return +m[1] + m[2] / m[3];
  const f = t.match(/^(\d+)\/(\d+)$/); if (f) return f[1] / f[2];
  const n = Number(t); return Number.isFinite(n) ? n : NaN;
};

/**
 * Parse one scale note. Returns points per real foot, or null.
 *   3/32" = 1'-0"  → 3/32 in on paper per foot → 6.75 pt/ft
 *   1 1/2" = 1'-0" → 108 pt/ft
 *   1:100          → metric ratio
 */
export function parseScaleText(str) {
  const s = String(str).replace(/[“”″]/g, '"').replace(/[‘’′]/g, "'");
  const m = s.match(/(\d+(?:\s+\d+\/\d+|\/\d+)?)\s*"\s*=\s*(\d+)\s*'\s*-?\s*(\d+(?:\s*\d+\/\d+)?)?\s*"?/);
  if (m) {
    const paperIn = frac(m[1]);
    const realFt = Number(m[2]) + (m[3] ? frac(m[3]) / 12 : 0);
    if (paperIn > 0 && realFt > 0) return { ptPerFt: (paperIn * 72) / realFt, label: `${m[1]}" = ${m[2]}'-${m[3] ?? 0}"` };
  }
  const r = s.match(/\b1\s*:\s*(\d{2,4})\b/);
  if (r) { const k = Number(r[1]); return { ptPerFt: (12 * 72) / k, label: `1:${k}` }; }
  return null;
}

/** Most frequent scale note on the sheet (views on one sheet usually share it). */
export function detectScale(texts = []) {
  const joined = [];
  for (let i = 0; i < texts.length; i++) {
    joined.push(texts[i].str);
    if (i + 1 < texts.length) joined.push(`${texts[i].str} ${texts[i + 1].str}`);
  }
  const tally = new Map();
  for (const t of joined) {
    const sc = parseScaleText(t);
    if (!sc) continue;
    const key = sc.ptPerFt.toFixed(4);
    const cur = tally.get(key) || { ...sc, count: 0 };
    cur.count += 1; tally.set(key, cur);
  }
  const best = [...tally.values()].sort((a, b) => b.count - a.count)[0];
  return best ? { ptPerFt: best.ptPerFt, label: best.label, source: 'text' } : null;
}

/* ───────────────────────── helpers ───────────────────────── */

const lum = (hex) => {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return 0;
  return (parseInt(h.slice(0, 2), 16) + parseInt(h.slice(2, 4), 16) + parseInt(h.slice(4, 6), 16)) / 765;
};
const styleColor = (style) => String(style).split('|')[1] || '#000000';
const styleWidth = (style) => Number(String(style).split('|')[0]) || 0;

/**
 * Stud size from the drawn thickness. The cut-offs lean to the common sizes
 * (2x4, 2x6): drafters draw finishes loosely, and 2x8/2x10 walls are rare.
 */
export function studSizeFor(thickIn, finishIn = DETECT_DEFAULTS.finishIn) {
  const depth = thickIn - finishIn;
  if (depth < 4.6) return '2x4';
  if (depth < 7.4) return '2x6';
  if (depth < 9) return '2x8';
  return '2x10';
}

/**
 * The part of the sheet that holds drawings: inside the border and left of /
 * above the title block. Border and title block edges are the long straight
 * lines that run (almost) the whole sheet; the innermost one on each side
 * past 60% of the sheet is the limit.
 */
export function drawingArea(page) {
  const W = page.width, H = page.height;
  let left = 0, right = W, top = 0, bottom = H;
  for (const s of page.segments || []) {
    if (s.arc) continue;
    const dx = Math.abs(s.x2 - s.x1), dy = Math.abs(s.y2 - s.y1);
    if (dx < 0.5 && dy >= H * 0.85) {
      const x = s.x1;
      if (x > W * 0.6 && x < right) right = x;
      if (x < W * 0.4 && x > left) left = x;
    } else if (dy < 0.5 && dx >= W * 0.85) {
      const y = s.y1;
      if (y > H * 0.6 && y < bottom) bottom = y;
      if (y < H * 0.4 && y > top) top = y;
    }
  }
  const pad = 2;
  return { x0: left + pad, y0: top + pad, x1: right - pad, y1: bottom - pad, titleBlock: right < W * 0.97 ? 'right' : bottom < H * 0.97 ? 'bottom' : null };
}

/* ───────────────────────── detection ───────────────────────── */

/**
 * @param {{segments:Array, texts?:Array, width:number, height:number}} page
 * @param {{ptPerFt:number, styles?:string[]}} opts  styles: only use these line styles
 * @returns {{walls:Array, styles:Array, ptPerFt:number}}
 */
export function detectWalls(page, opts = {}) {
  const o = { ...DETECT_DEFAULTS, ...opts };
  const k = o.ptPerFt;
  if (!(k > 0)) throw new Error('detectWalls needs a scale (ptPerFt)');
  const inPt = k / 12;
  const tMin = o.minThickIn * inPt;
  const tMax = o.maxThickIn * inPt;
  const minSeg = o.minSegFt * k;
  const allow = o.styles ? new Set(o.styles) : null;
  const area = o.area || drawingArea(page);
  const inside = (s) => Math.min(s.x1, s.x2) >= area.x0 && Math.max(s.x1, s.x2) <= area.x1 && Math.min(s.y1, s.y2) >= area.y0 && Math.max(s.y1, s.y2) <= area.y1;

  const poche = pocheIndex(page.polys); // filled wall shapes, when the sheet has them

  // annotation that can pass for a wall face: tag frames, dimension lines
  // curves flattened to short lines, fixture outlines and open door leaves
  const curves = curveMarks(page, k);
  const dims = dimensionLines(page);
  const marked = new Set([...tagFrames(page), ...dims, ...curves.marked]);

  // 1. directional buckets of usable segments
  const buckets = new Map(); // deg → { d, n, byStyle: Map(style → [{u0,u1,v}]) }
  const all = []; // every segment in its bucket frame, for opening evidence
  for (let si = 0; si < page.segments.length; si++) {
    const s = page.segments[si];
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.5 || !inside(s)) continue;
    let deg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
    deg = ((deg % 180) + 180) % 180;
    let b = buckets.get(deg);
    if (!b) {
      const r = (deg * Math.PI) / 180;
      b = { deg, d: [Math.cos(r), Math.sin(r)], n: [-Math.sin(r), Math.cos(r)], byStyle: new Map(), any: [] };
      buckets.set(deg, b);
    }
    const ua = s.x1 * b.d[0] + s.y1 * b.d[1];
    const ub = s.x2 * b.d[0] + s.y2 * b.d[1];
    const v = ((s.x1 + s.x2) / 2) * b.n[0] + ((s.y1 + s.y2) / 2) * b.n[1];
    const rec = { u0: Math.min(ua, ub), u1: Math.max(ua, ub), v, style: s.style };
    b.any.push(rec);
    // poché: the grey fill a CAD export puts in cut walls, any pen
    if (s.fill && lum(styleColor(s.style)) < 0.9) (b.fills || (b.fills = [])).push(rec);
    all.push({ ...s, deg });
    if (s.arc || marked.has(si)) continue;
    if (s.fill && lum(styleColor(s.style)) > 0.97) continue; // white masks
    if (allow && !allow.has(s.style)) continue;
    if (!b.byStyle.has(s.style)) b.byStyle.set(s.style, []);
    b.byStyle.get(s.style).push(rec);
  }

  // swings drawn as polylines count as arcs, start to end
  for (const c of curves.chords) {
    let deg = Math.round((Math.atan2(c.y2 - c.y1, c.x2 - c.x1) * 180) / Math.PI);
    deg = ((deg % 180) + 180) % 180;
    all.push({ ...c, deg });
  }

  // A wall face is cut where another wall meets it (a T): join collinear
  // pieces across such a gap, so a short wall between two closet doors still
  // pairs. A T gap is at most a wall thick and the other wall's faces end at
  // both of its edges (a dashed line's gaps have nothing ending there).
  const endsAt = new Map(); // rounded point → directions of segments ending there
  for (const sg of page.segments) {
    const L = Math.hypot(sg.x2 - sg.x1, sg.y2 - sg.y1);
    if (!L || sg.arc) continue;
    const dir = [(sg.x2 - sg.x1) / L, (sg.y2 - sg.y1) / L];
    for (const [x, y] of [[sg.x1, sg.y1], [sg.x2, sg.y2]]) {
      const key = `${Math.round(x)},${Math.round(y)}`;
      if (!endsAt.has(key)) endsAt.set(key, []);
      endsAt.get(key).push({ x, y, dir });
    }
  }
  const crossEndsAt = (b, u, v) => {
    const x = b.d[0] * u + b.n[0] * v, y = b.d[1] * u + b.n[1] * v;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const e of endsAt.get(`${Math.round(x) + i},${Math.round(y) + j}`) || []) {
        if (Math.hypot(e.x - x, e.y - y) <= 0.75 && Math.abs(e.dir[0] * b.d[0] + e.dir[1] * b.d[1]) < 0.1) return true;
      }
    }
    return false;
  };
  for (const b of buckets.values()) {
    for (const [style, segs] of b.byStyle) {
      segs.sort((p, q) => p.v - q.v);
      const joined = [];
      for (let i = 0; i < segs.length;) {
        // one line: pieces within 0.3 pt of each other across it
        let j = i + 1;
        while (j < segs.length && segs[j].v - segs[i].v <= 0.3) j++;
        const line = segs.slice(i, j).sort((p, q) => p.u0 - q.u0);
        let cur = null;
        for (const r of line) {
          const gap = cur ? r.u0 - cur.u1 : Infinity;
          if (gap <= 0.3 || (gap <= tMax && crossEndsAt(b, cur.u1, cur.v) && crossEndsAt(b, r.u0, r.v))) {
            cur.u1 = Math.max(cur.u1, r.u1);
            continue;
          }
          if (cur) joined.push(cur);
          cur = { ...r };
        }
        if (cur) joined.push(cur);
        i = j;
      }
      // poché stubs beside a closet's doors can be shorter than any wall line:
      // a filled piece is a wall however short
      const min = style.startsWith('fill|') ? 0.3 * k : minSeg;
      b.byStyle.set(style, joined.filter((r) => r.u1 - r.u0 >= min));
    }
  }

  // 2–3. pair parallel lines into bands
  const bands = [];
  for (const b of buckets.values()) {
    for (const [style, segs] of b.byStyle) {
      segs.sort((p, q) => p.v - q.v);
      const minPair = style.startsWith('fill|') ? 0.3 * k : minSeg;
      const pieces = [];
      for (let i = 0; i < segs.length; i++) {
        const a = segs[i];
        for (let j = i + 1; j < segs.length; j++) {
          const c = segs[j];
          const gap = c.v - a.v;
          if (gap > tMax) break;
          if (gap < tMin) continue;
          const u0 = Math.max(a.u0, c.u0), u1 = Math.min(a.u1, c.u1);
          if (u1 - u0 < minPair) continue;
          pieces.push({ u0, u1, va: a.v, vb: c.v });
        }
      }
      if (!pieces.length) continue;
      // merge pieces overlapping along u and across v into bands
      pieces.sort((p, q) => p.va - q.va || p.u0 - q.u0);
      const parent = pieces.map((_, i) => i);
      const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
      for (let i = 0; i < pieces.length; i++) {
        for (let j = i + 1; j < pieces.length; j++) {
          if (pieces[j].va > pieces[i].vb) break;
          const ov = Math.min(pieces[i].u1, pieces[j].u1) - Math.max(pieces[i].u0, pieces[j].u0);
          if (ov > 0) parent[find(j)] = find(i);
        }
      }
      const groups = new Map();
      pieces.forEach((p, i) => {
        const r = find(i);
        const g = groups.get(r) || { u0: Infinity, u1: -Infinity, va: Infinity, vb: -Infinity, len: 0 };
        g.u0 = Math.min(g.u0, p.u0); g.u1 = Math.max(g.u1, p.u1);
        g.va = Math.min(g.va, p.va); g.vb = Math.max(g.vb, p.vb);
        groups.set(r, g);
      });
      const members = new Map();
      pieces.forEach((p, i) => { const r = find(i); if (!members.has(r)) members.set(r, []); members.get(r).push(p); });
      for (const [r, g] of groups) {
        // chained into something too thick (a layered wall next to cabinets,
        // a wall face touching a counter): split it into the bands that fit
        // (only bands the wall poché backs: cabinets and fixtures have none)
        const parts = g.vb - g.va > tMax * 1.05
          ? splitBand(members.get(r), tMax, minSeg).filter((p) => pocheCover(b.fills, p) >= 0.6)
          : [g];
        for (const p0 of parts) {
          const p = poche.count > 50 ? fitPoche(p0, b, poche, inPt, tMin, tMax) : p0;
          bands.push({ deg: b.deg, d: b.d, n: b.n, style, u0: p.u0, u1: p.u1, v: (p.va + p.vb) / 2, t: p.vb - p.va, fitted: p.fitted });
        }
      }
    }
  }

  // 4. join collinear bands of one style across gaps and openings
  const maxGap = o.maxOpeningFt * k;
  const minOpen = o.minOpeningFt * k;
  const walls = [];
  const byLine = new Map();
  for (const bd of bands) {
    const key = `${bd.deg}|${bd.style}`;
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key).push(bd);
  }
  for (const list of byLine.values()) {
    list.sort((p, q) => p.v - q.v);
    // cluster by centre line (within 1.5")
    const lines = [];
    for (const bd of list) {
      const ln = lines.find((l) => Math.abs(l.v - bd.v) <= 1.5 * inPt && Math.abs(l.t - bd.t) <= 2 * inPt);
      if (ln) { ln.items.push(bd); ln.v = (ln.v * (ln.items.length - 1) + bd.v) / ln.items.length; } else lines.push({ v: bd.v, t: bd.t, items: [bd] });
    }
    for (const ln of lines) {
      ln.items.sort((p, q) => p.u0 - q.u0);
      let cur = null;
      const flush = () => { if (cur) walls.push(cur); cur = null; };
      for (const bd of ln.items) {
        if (!cur) { cur = { ...bd, v: ln.v, openings: [] }; continue; }
        const gap = bd.u0 - cur.u1;
        if (gap <= minOpen) { cur.u1 = Math.max(cur.u1, bd.u1); cur.t = Math.max(cur.t, bd.t); cur.fitted = cur.fitted || bd.fitted; continue; }
        if (gap <= maxGap) {
          const kind = openingEvidence(buckets, all, bands, cur, cur.u1, bd.u0, ln.v, Math.max(cur.t, bd.t), inPt);
          if (kind) {
            cur.openings.push({ u0: cur.u1, u1: bd.u0, type: kind });
            cur.u1 = Math.max(cur.u1, bd.u1); cur.t = Math.max(cur.t, bd.t); cur.fitted = cur.fitted || bd.fitted;
            continue;
          }
        }
        flush(); cur = { ...bd, v: ln.v, openings: [] };
      }
      flush();
    }
  }

  // 4b. a wall that stops at a door whose other jamb is a crossing wall (a
  // door next to a corner): run it across the door to that wall's face
  const maxDoor = 4.5 * k; // one swinging door
  const maxCloset = 8 * k; // a closet's sliding / bifold doors
  // on a sheet whose walls are filled (poché), a cabinet or counter edge has
  // no fill: only a filled wall is run across a door
  const swings = all.filter((sg) => sg.arc);
  for (const w of walls) {
    if (poche.count > 50) {
      const at = [0.25, 0.5, 0.75].map((f) => { const u = w.u0 + (w.u1 - w.u0) * f; return [w.d[0] * u + w.n[0] * w.v, w.d[1] * u + w.n[1] * w.v]; });
      if (at.filter((p) => poche.inside(p[0], p[1])).length < 2) continue;
    }
    for (const side of [1, -1]) {
      const end = side > 0 ? w.u1 : w.u0;
      let best = null;
      for (const o of bands) {
        if (Math.abs(((o.deg - w.deg + 180) % 180) - 90) > 2) continue; // crossing walls only
        // where o's centre line meets w's line, and whether o spans it
        const a = [o.d[0] * o.u0 + o.n[0] * o.v, o.d[1] * o.u0 + o.n[1] * o.v];
        const b = [o.d[0] * o.u1 + o.n[0] * o.v, o.d[1] * o.u1 + o.n[1] * o.v];
        const va = a[0] * w.n[0] + a[1] * w.n[1], vb = b[0] * w.n[0] + b[1] * w.n[1];
        const reach = w.t / 2 + 3 * inPt; // o may stop short of w (a corner piece between them), meet its face (a T) or run through
        if (Math.min(va, vb) > w.v + w.t / 2 + reach || Math.max(va, vb) < w.v - w.t / 2 - reach) continue;
        const uc = a[0] * w.d[0] + a[1] * w.d[1]; // o's centre along w
        const face = uc - side * (o.t / 2);
        const gap = (face - end) * side;
        if (gap < minOpen || gap > maxCloset) continue;
        if (!best || gap < best.gap) best = { gap, face };
      }
      if (!best) continue;
      const [g0, g1] = side > 0 ? [end, best.face] : [best.face, end];
      // the door's swing must be drawn (a tag's slanted sides are no leaf), or
      // the panels of a sliding / bifold closet door fill the opening
      const swing = best.gap <= maxDoor && openingEvidence(buckets, swings, bands, w, g0, g1, w.v, w.t, inPt) === 'door';
      if (!swing && !closetDoors(buckets.get(w.deg), g0, g1, w.v, w.t, inPt)) continue;
      w.openings.push({ u0: g0, u1: g1, type: 'door' });
      if (side > 0) w.u1 = best.face; else w.u0 = best.face;
    }
    w.openings.sort((p, q) => p.u0 - q.u0);
  }

  // 5. to page coordinates, sizes, exterior test
  let out = walls
    .filter((w) => w.u1 - w.u0 >= o.minWallFt * k)
    .map((w) => {
      const p1 = [w.d[0] * w.u0 + w.n[0] * w.v, w.d[1] * w.u0 + w.n[1] * w.v];
      const p2 = [w.d[0] * w.u1 + w.n[0] * w.v, w.d[1] * w.u1 + w.n[1] * w.v];
      const thickIn = w.t / inPt;
      return {
        x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1],
        style: w.style, thickIn: +thickIn.toFixed(2), size: studSizeFor(thickIn, o.finishIn), fitted: w.fitted,
        lengthFt: +((w.u1 - w.u0) / k).toFixed(2),
        openings: w.openings.map((op) => ({ atFt: +((op.u0 - w.u0) / k).toFixed(2), widthFt: +((op.u1 - op.u0) / k).toFixed(2), type: op.type })),
      };
    });
  out = dropDoorLeaves(out, [...page.segments.filter((s) => s.arc), ...curves.chords], k);
  if (poche.count > 50) out = cutAtDimensions(out, [...dims].map((i) => page.segments[i]), poche, k, o.minWallFt);
  out = dropContained(out, k);
  out = mainBuilding(out, k);
  joinCorners(out, k);
  markExterior(out, k);
  if (poche.count > 50) {
    // short unfilled stubs sticking out of the building with a loose end: the
    // witness lines of a dimension, a leader
    const loose = (w, x, y) => !out.some((o) => o !== w && segDist(o, { x1: x, y1: y, x2: x, y2: y }) <= k);
    const unfilled = (w) => ![0.2, 0.4, 0.6, 0.8].some((f) => poche.inside(w.x1 + (w.x2 - w.x1) * f, w.y1 + (w.y2 - w.y1) * f));
    out = out.filter((w) => !(w.exterior && w.lengthFt <= 4 && unfilled(w) && (loose(w, w.x1, w.y1) || loose(w, w.x2, w.y2))));
  }
  // interior walls drawn with the same pen as the exterior are usually the
  // rated / bearing ones (corridor, demising); lighter pens are partitions
  const extStyles = new Set(out.filter((w) => w.exterior).map((w) => w.style));
  for (const w of out) {
    w.size = studSizeFor(w.thickIn, w.exterior ? o.extFinishIn : o.finishIn);
    w.category = w.exterior ? 'exterior' : 'interior';
    w.kind = w.exterior ? 'exterior' : extStyles.has(w.style) && lum(styleColor(w.style)) < 0.35 ? 'bearing' : 'partition';
    // a thick interior band is usually two 2x4 walls side by side (demising /
    // party wall): one is the shear wall with the sheathing between them
    if (!w.exterior && w.thickIn >= o.doubleMinIn) {
      w.double = true;
      w.kind2 = w.kind;
      w.kind = 'shear';
      w.size = '2x4';
      w.size2 = '2x4';
    }
    // interior walls have no windows: a gap with lines in it there is a cased
    // opening (closet, pass-through), framed like a door
    if (!w.exterior) w.openings = w.openings.map((op) => (op.type === 'window' ? { ...op, type: 'door' } : op));
  }

  // style summary: helps the user switch line styles on/off
  const styles = new Map();
  for (const w of out) {
    const s = styles.get(w.style) || { style: w.style, width: styleWidth(w.style), color: styleColor(w.style), walls: 0, lengthFt: 0, exterior: 0 };
    s.walls += 1; s.lengthFt += w.lengthFt; if (w.exterior) s.exterior += 1;
    styles.set(w.style, s);
  }
  const styleList = [...styles.values()].sort((a, b) => b.lengthFt - a.lengthFt).map((s) => ({ ...s, lengthFt: Math.round(s.lengthFt) }));
  out.forEach((w, i) => { w.id = `w${i + 1}`; delete w.fitted; });
  return { walls: out, styles: styleList, ptPerFt: k, suggested: suggestStyles(styleList), area };
}

/**
 * Pieces of a chained group that is too thick for one wall, regrouped from the
 * longest piece out: a piece joins a band while the band stays a wall thickness.
 */
/**
 * Panels of a sliding or bifold closet door across an opening: each panel is a
 * thin rectangle (two lines a door's thickness apart) along the wall, inside
 * its thickness, part of the width; two or more of them span it. (A tag's
 * leader or the edge of a floor finish is one line.)
 */
function closetDoors(bucket, g0, g1, v, t, inPt) {
  const gap = g1 - g0;
  const lines = (bucket?.any || []).filter((s) => Math.abs(s.v - v) <= t / 2 + 0.5 && s.u0 >= g0 - 1 && s.u1 <= g1 + 1
    && s.u1 - s.u0 >= 0.2 * gap && s.u1 - s.u0 <= 0.8 * gap);
  const panels = [];
  for (const a of lines) {
    const twin = lines.some((b) => b !== a && Math.abs(b.u0 - a.u0) <= 1 && Math.abs(b.u1 - a.u1) <= 1
      && Math.abs(b.v - a.v) >= 0.3 && Math.abs(b.v - a.v) <= 2.5 * inPt);
    if (twin && !panels.some((p) => Math.abs(p[0] - a.u0) <= 1 && Math.abs(p[1] - a.u1) <= 1)) panels.push([a.u0, a.u1]);
  }
  if (panels.length < 2) return false;
  panels.sort((a, b) => a[0] - b[0]);
  let len = 0, end = g0;
  for (const [a, b] of panels) { if (b <= end) continue; len += b - Math.max(a, end); end = b; }
  return len >= 0.85 * gap;
}

/**
 * Fit a band as thick as a double wall to the wall fill (poché) it lies on. A
 * band thicker than its fill is a wall plus something drawn against it (a
 * tub's side, a range, a cabinet); a band paired off a stray line can sit
 * across only part of a double wall. Fill is sampled across the band and a few
 * inches past it, at three points along it; the filled run the band overlaps
 * most becomes the band (air gaps of up to 1½" bridged: a double wall is two
 * filled walls side by side). Single walls, and bands on no fill, keep their
 * faces.
 */
function fitPoche(p, b, poche, inPt, tMin, tMax) {
  if (p.vb - p.va < DETECT_DEFAULTS.doubleMinIn * inPt) return p;
  const step = 0.25;
  const lo = p.va - 4 * inPt, hi = p.vb + 4 * inPt;
  const n = Math.max(2, Math.ceil((hi - lo) / step));
  const vAt = (i) => lo + ((hi - lo) * i) / n;
  const covered = [];
  for (let i = 0; i <= n; i++) {
    const v = vAt(i);
    const hits = [0.25, 0.5, 0.75].filter((f) => {
      const u = p.u0 + (p.u1 - p.u0) * f;
      return poche.inside(b.d[0] * u + b.n[0] * v, b.d[1] * u + b.n[1] * v);
    }).length;
    covered.push(hits >= 2);
  }
  const bridge = Math.ceil((1.5 * inPt) / ((hi - lo) / n));
  const runs = [];
  let start = -1, last = -1;
  covered.forEach((c, i) => {
    if (!c) return;
    if (start >= 0 && i - last > bridge + 1) { runs.push([start, last]); start = -1; }
    if (start < 0) start = i;
    last = i;
  });
  if (start >= 0) runs.push([start, last]);
  let best = null, bestOv = 0;
  for (const [a, z] of runs) {
    const ov = Math.min(p.vb, vAt(z)) - Math.max(p.va, vAt(a));
    if (ov > bestOv) { bestOv = ov; best = [a, z]; }
  }
  if (!best) return p;
  const va = vAt(best[0]) - 0.4, vb = vAt(best[1]) + 0.4; // the outline around the fill
  if (vb - va < tMin || vb - va > tMax) return p;
  if (Math.abs(va - p.va) < 1.5 * inPt && Math.abs(vb - p.vb) < 1.5 * inPt) return p; // already the wall
  return { ...p, va, vb, fitted: true };
}

/** Grey filled shapes of the sheet (wall poché) and a point-in-shape test. */
function pocheIndex(polys = []) {
  const grey = polys.filter((p) => lum(p.color || '#000000') < 0.9); // white is a mask
  const cell = 48;
  const map = new Map();
  grey.forEach((p, i) => {
    const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]);
    p.box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    for (let a = Math.floor(p.box[0] / cell); a <= Math.floor(p.box[2] / cell); a++) {
      for (let b = Math.floor(p.box[1] / cell); b <= Math.floor(p.box[3] / cell); b++) {
        const key = `${a},${b}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(i);
      }
    }
  });
  const inPoly = (x, y, pts) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return {
    count: grey.length,
    inside(x, y) {
      for (const i of map.get(`${Math.floor(x / cell)},${Math.floor(y / cell)}`) || []) {
        const p = grey[i];
        if (x >= p.box[0] && x <= p.box[2] && y >= p.box[1] && y <= p.box[3] && inPoly(x, y, p.pts)) return true;
      }
      return false;
    },
  };
}

/** Share of a band's length with wall poché (filled areas) inside it. */
function pocheCover(fills, g) {
  if (!fills?.length) return 0;
  const inBand = fills.filter((f) => f.v >= g.va - 0.3 && f.v <= g.vb + 0.3 && f.u1 > g.u0 && f.u0 < g.u1);
  // the fill has to span the band across, not sit along one face of it
  const vs = inBand.map((f) => f.v);
  if (!vs.length || Math.max(...vs) - Math.min(...vs) < (g.vb - g.va) * 0.7) return 0;
  const iv = inBand
    .map((f) => [Math.max(g.u0, f.u0), Math.min(g.u1, f.u1)]).sort((a, b) => a[0] - b[0]);
  let len = 0, end = -Infinity;
  for (const [a, b] of iv) { if (b <= end) continue; len += b - Math.max(a, end); end = b; }
  return len / ((g.u1 - g.u0) || 1);
}

function splitBand(pieces, tMax, minSeg) {
  const left = pieces.slice().sort((p, q) => (q.u1 - q.u0) - (p.u1 - p.u0));
  const used = new Set();
  const out = [];
  for (const seed of left) {
    if (used.has(seed)) continue;
    used.add(seed);
    const g = { u0: seed.u0, u1: seed.u1, va: seed.va, vb: seed.vb };
    let grew = true;
    while (grew) {
      grew = false;
      for (const p of left) {
        if (used.has(p)) continue;
        if (Math.min(g.u1, p.u1) - Math.max(g.u0, p.u0) <= 0) continue;
        if (p.vb < g.va - 0.01 || p.va > g.vb + 0.01) continue;
        if (Math.max(g.vb, p.vb) - Math.min(g.va, p.va) > tMax) continue;
        used.add(p); grew = true;
        g.u0 = Math.min(g.u0, p.u0); g.u1 = Math.max(g.u1, p.u1);
        g.va = Math.min(g.va, p.va); g.vb = Math.max(g.vb, p.vb);
      }
    }
    if (g.u1 - g.u0 >= minSeg) out.push(g);
  }
  return out;
}

/**
 * Line styles that most likely draw walls: the heavier pens. Hairlines are
 * furniture, hatching, dimensions and overhead lines; pale fills are shading.
 */
export function suggestStyles(styleList) {
  const real = styleList.filter((s) => s.lengthFt >= 40);
  const strokes = real.filter((s) => s.width > 0);
  const maxW = Math.max(0, ...strokes.map((s) => s.width));
  return real
    // fills: dark ones, and the grey poché a CAD export puts in cut walls
    .filter((s) => (s.width > 0 ? s.width >= maxW * 0.4 : lum(s.color) < 0.85))
    .map((s) => s.style);
}

/** Evidence that a gap in a wall is an opening: door leaf / swing, or window glazing. */
function openingEvidence(buckets, all, bands, band, g0, g1, v, t, inPt) {
  const tol = 2 * inPt;
  const gapLen = g1 - g0;
  const toUV = (x, y) => [x * band.d[0] + y * band.d[1], x * band.n[0] + y * band.n[1]];
  const inStrip = (u, vv) => Math.abs(vv - v) <= t / 2 + tol && u >= g0 - tol && u <= g1 + tol;
  // a wall crossing the gap (a corridor between two wall ends) is not an opening
  for (const o of bands) {
    if (o.deg === band.deg || o.t < t * 0.5) continue;
    const a = toUV(o.d[0] * o.u0 + o.n[0] * o.v, o.d[1] * o.u0 + o.n[1] * o.v);
    const b = toUV(o.d[0] * o.u1 + o.n[0] * o.v, o.d[1] * o.u1 + o.n[1] * o.v);
    if ((a[1] - v) * (b[1] - v) > 0) continue; // does not reach the wall line
    const f = (v - a[1]) / ((b[1] - a[1]) || 1e-9);
    const u = a[0] + (b[0] - a[0]) * f;
    if (u > g0 + tol && u < g1 - tol) return null;
  }
  // door: a leaf or swing arc hinged in the gap and reaching well outside the wall
  for (const s of all) {
    if (s.deg === band.deg && !s.arc) continue;
    const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const want = s.arc ? [gapLen * 0.5, gapLen * 1.6] : [gapLen * 0.6, gapLen * 1.15];
    if (L < want[0] || L > want[1]) continue;
    const p = toUV(s.x1, s.y1), q = toUV(s.x2, s.y2);
    for (const [a, b] of [[p, q], [q, p]]) {
      if (inStrip(a[0], a[1]) && Math.abs(b[1] - v) >= t / 2 + gapLen * 0.4) return 'door';
    }
  }
  // window: parallel lines (glazing, sill) running inside the gap strip
  const bk = buckets.get(band.deg);
  for (const s of bk?.any || []) {
    if (Math.abs(s.v - v) > t / 2 + tol) continue;
    const mid = (s.u0 + s.u1) / 2;
    if (mid > g0 + tol && mid < g1 - tol && s.u1 - s.u0 > gapLen * 0.5) return 'window';
  }
  return null;
}

/**
 * Dimension witness lines run out from a wall to the dimension strings past
 * the building, and pair like a wall's faces. Where a dimension line crosses a
 * wall outside the wall fill (poché), the part of the wall on the side with no
 * fill at all is cut off; a wall with no fill on either side goes.
 */
export function cutAtDimensions(walls, dimSegs, poche, k, minWallFt = 1.5) {
  const cross = (w, s) => {
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1, ex = s.x2 - s.x1, ey = s.y2 - s.y1;
    const den = dx * ey - dy * ex;
    const L = Math.hypot(dx, dy), M = Math.hypot(ex, ey);
    if (!L || !M || Math.abs(den) / (L * M) < 0.5) return null; // nearly parallel
    const t = ((s.x1 - w.x1) * ey - (s.y1 - w.y1) * ex) / den;
    const u = ((s.x1 - w.x1) * dy - (s.y1 - w.y1) * dx) / den;
    return t > 0 && t < 1 && u >= 0 && u <= 1 ? t : null;
  };
  const at = (w, t) => [w.x1 + (w.x2 - w.x1) * t, w.y1 + (w.y2 - w.y1) * t];
  const filled = (w, t0, t1) => {
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / k;
    const n = Math.max(2, Math.ceil(((t1 - t0) * L) / 0.5)); // every 6"
    for (let i = 0; i <= n; i++) { const p = at(w, t0 + ((t1 - t0) * i) / n); if (poche.inside(p[0], p[1])) return true; }
    return false;
  };
  const out = [];
  for (let w of walls) {
    let ts = dimSegs.map((s) => cross(w, s)).filter((t) => t !== null && !poche.inside(...at(w, t))).sort((a, b) => a - b);
    let gone = false;
    while (ts.length) {
      const t = ts.shift();
      const before = filled(w, 0, t), after = filled(w, t, 1);
      if (!before && !after) { gone = true; break; }
      if (before && after) continue;
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / k;
      const [a, b] = before ? [0, t] : [t, 1];
      const startFt = a * L, endFt = b * L;
      const p1 = at(w, a), p2 = at(w, b);
      w = {
        ...w, x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], lengthFt: +(endFt - startFt).toFixed(2),
        openings: (w.openings || []).filter((op) => op.atFt >= startFt && op.atFt + op.widthFt <= endFt).map((op) => ({ ...op, atFt: +(op.atFt - startFt).toFixed(2) })),
      };
      ts = ts.map((x) => (x - a) / (b - a)).filter((x) => x > 0 && x < 1);
    }
    if (!gone && w.lengthFt >= minWallFt) out.push(w);
  }
  return out;
}

/**
 * Drop door leaves drawn open. Two signs, either is enough:
 *  - a short "wall" askew to the building's grid with a loose end: a leaf
 *    hangs from its hinge, while an angled wall (a bay) meets walls at both ends;
 *  - a short "wall" whose far end is the hinge of a swing arc that starts at its
 *    near end (every point of the arc lies one leaf length from the hinge). A
 *    wall beside a door only meets the arc at its end, the strike side: the
 *    hinge is across the opening, not at its other end.
 */
export function dropDoorLeaves(walls, arcs, k) {
  const ends = arcs.flatMap((a) => [[a.x1, a.y1], [a.x2, a.y2]]);
  // the building's grid: the direction (mod 90°) most wall length runs in
  const byDeg = new Map();
  for (const w of walls) {
    const deg = Math.round(((angleOf(w) * 180) / Math.PI) % 90);
    byDeg.set(deg, (byDeg.get(deg) || 0) + w.lengthFt);
  }
  const grid = [...byDeg].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const askew = (w) => {
    const deg = ((angleOf(w) * 180) / Math.PI) % 90;
    const off = Math.abs(deg - grid);
    return Math.min(off, 90 - off) > 5;
  };
  const loose = (w, p) => !walls.some((o) => o !== w && segDist(o, { x1: p[0], y1: p[1], x2: p[0], y2: p[1] }) <= k);
  const isLeaf = (w) => {
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (L > 4.5 * k) return false;
    if (askew(w) && (loose(w, [w.x1, w.y1]) || loose(w, [w.x2, w.y2]))) return true;
    if (!ends.length) return false;
    const tol = Math.max(0.1 * L, 0.35 * k);
    for (const [A, B] of [[[w.x1, w.y1], [w.x2, w.y2]], [[w.x2, w.y2], [w.x1, w.y1]]]) {
      const near = (p, q, r) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= r;
      if (!ends.some((e) => near(e, A, tol))) continue;
      // another point of the arc, away from A, at leaf length from the hinge B
      const onSwing = ends.filter((e) => !near(e, A, 0.5 * L) && Math.abs(Math.hypot(e[0] - B[0], e[1] - B[1]) - L) <= tol);
      if (onSwing.length) return true;
    }
    return false;
  };
  return walls.filter((w) => !isLeaf(w));
}

/**
 * Remove walls lying inside a longer parallel wall (double-drawn bands, one
 * layer of a wall's poché). Of two bands of about one length the thicker one
 * stays: it is the whole wall.
 */
function dropContained(walls, k) {
  const keep = [];
  const sorted = walls.slice().sort((a, b) => b.lengthFt - a.lengthFt);
  const frame = (o) => {
    const d = [Math.cos(angleOf(o)), Math.sin(angleOf(o))];
    const n = [-d[1], d[0]];
    return { v: (p) => p[0] * n[0] + p[1] * n[1], u: (p) => p[0] * d[0] + p[1] * d[1] };
  };
  const span = (w, u) => { const a = u([w.x1, w.y1]), b = u([w.x2, w.y2]); return [Math.min(a, b), Math.max(a, b)]; };
  for (let w of sorted) {
    let drop = false;
    for (let i = 0; i < keep.length && !drop; i++) {
      const o = keep[i];
      if (Math.abs(angleOf(o) - angleOf(w)) > 0.02) continue;
      const { v, u } = frame(o);
      const half = ((Math.max(o.thickIn, w.thickIn) / 12) * k) / 2 + 0.5;
      if (Math.abs(v([w.x1, w.y1]) - v([o.x1, o.y1])) > half) continue;
      const [a0, a1] = span(o, u), [b0, b1] = span(w, u);
      if (b0 >= a0 - 0.5 && b1 <= a1 + 0.5) {
        // the thicker one is the whole wall, unless it was cut down to the fill
        if (w.thickIn > o.thickIn + 0.5 && w.lengthFt >= o.lengthFt - 0.5 && !w.fitted) keep[i] = w;
        // a wall found by its own faces beats one cut down to the fill
        else if (o.fitted && !w.fitted && w.lengthFt >= o.lengthFt - 0.5) keep[i] = w;
        drop = true;
      } else if (Math.min(a1, b1) - Math.max(a0, b0) > 0.5) {
        // overlapping along part of its length (one wall drawn by two pens):
        // keep only the part beyond the longer one
        w = trimWall(w, u, b0 < a0 ? [b0, a0] : [a1, b1], k);
        if (!w || w.lengthFt < 1.5) drop = true;
      }
    }
    if (!drop) keep.push(w);
  }
  walls.length = 0; walls.push(...keep);
  return walls;
}

/** A wall cut to the part whose position along u lies in [lo, hi]. */
function trimWall(w, u, [lo, hi], k) {
  const ua = u([w.x1, w.y1]), ub = u([w.x2, w.y2]);
  const L = ub - ua;
  if (Math.abs(L) < 1e-9) return null;
  const ta = Math.max(0, Math.min(1, ((L > 0 ? lo : hi) - ua) / L));
  const tb = Math.max(0, Math.min(1, ((L > 0 ? hi : lo) - ua) / L));
  const lenFt = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / k;
  const startFt = ta * lenFt, endFt = tb * lenFt;
  return {
    ...w,
    x1: w.x1 + (w.x2 - w.x1) * ta, y1: w.y1 + (w.y2 - w.y1) * ta,
    x2: w.x1 + (w.x2 - w.x1) * tb, y2: w.y1 + (w.y2 - w.y1) * tb,
    lengthFt: +(endFt - startFt).toFixed(2),
    openings: (w.openings || []).filter((o) => o.atFt >= startFt && o.atFt + o.widthFt <= endFt).map((o) => ({ ...o, atFt: +(o.atFt - startFt).toFixed(2) })),
  };
}

const angleOf = (w) => { let a = Math.atan2(w.y2 - w.y1, w.x2 - w.x1); if (a < 0) a += Math.PI; if (a >= Math.PI - 1e-6) a -= Math.PI; return a; };

/**
 * Keep the walls that touch each other into the building(s); drop loose groups
 * such as the sheet border and title block frames, legends and details. A group
 * stays when it holds at least 10% of the walls found (counted, not by length:
 * a sheet frame is a few very long "walls").
 */
export function mainBuilding(walls, k) {
  if (walls.length < 4) return walls;
  const parent = walls.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const reachOf = (w) => ((w.thickIn / 12) * k) + k * 0.5;
  const box = walls.map((w) => ({ x0: Math.min(w.x1, w.x2), x1: Math.max(w.x1, w.x2), y0: Math.min(w.y1, w.y2), y1: Math.max(w.y1, w.y2) }));
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const r = Math.max(reachOf(walls[i]), reachOf(walls[j]));
      const a = box[i], b = box[j];
      if (a.x0 - r > b.x1 || b.x0 - r > a.x1 || a.y0 - r > b.y1 || b.y0 - r > a.y1) continue;
      if (segDist(walls[i], walls[j]) <= r) parent[find(j)] = find(i);
    }
  }
  const sizes = new Map();
  walls.forEach((w, i) => { const r = find(i); sizes.set(r, (sizes.get(r) || 0) + 1); });
  const big = (i) => sizes.get(find(i)) >= walls.length * 0.1;
  // a smaller group inside or right next to the building stays too (a unit
  // whose corridor wall was not found): within 15 ft of the main groups' box
  const m = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  walls.forEach((_, i) => { if (big(i)) { m.x0 = Math.min(m.x0, box[i].x0); m.y0 = Math.min(m.y0, box[i].y0); m.x1 = Math.max(m.x1, box[i].x1); m.y1 = Math.max(m.y1, box[i].y1); } });
  const pad = 15 * k;
  const gbox = new Map();
  walls.forEach((_, i) => {
    const r = find(i); const g = gbox.get(r) || { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    g.x0 = Math.min(g.x0, box[i].x0); g.y0 = Math.min(g.y0, box[i].y0); g.x1 = Math.max(g.x1, box[i].x1); g.y1 = Math.max(g.y1, box[i].y1);
    gbox.set(r, g);
  });
  const near = (g) => g.x0 >= m.x0 - pad && g.x1 <= m.x1 + pad && g.y0 >= m.y0 - pad && g.y1 <= m.y1 + pad;
  // a group no bigger than a closet is a symbol (a roof drain or downspout box)
  const tiny = (g) => g.x1 - g.x0 <= 3 * k && g.y1 - g.y0 <= 3 * k;
  return walls.filter((_, i) => !tiny(gbox.get(find(i))) && (big(i) || (sizes.get(find(i)) >= 3 && near(gbox.get(find(i))))));
}

function segDist(a, b) {
  const pd = (px, py, s) => {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / L2));
    return Math.hypot(px - (s.x1 + dx * t), py - (s.y1 + dy * t));
  };
  return Math.min(pd(a.x1, a.y1, b), pd(a.x2, a.y2, b), pd(b.x1, b.y1, a), pd(b.x2, b.y2, a));
}

/**
 * Pairing measures a wall between the faces of the walls it meets, so at an L
 * corner both walls stop short of each other. Extend both to the point where
 * their centre lines cross; the lengths then add up like framing does (one wall
 * runs through, the other butts). T junctions keep the face-to-face length.
 */
export function joinCorners(walls, k) {
  const moves = [];
  for (const a of walls) {
    for (const b of walls) {
      if (a === b) continue;
      const X = lineCross(a, b);
      if (!X) continue;
      const reach = (((a.thickIn + b.thickIn) / 2) / 12) * k + 1;
      const ea = nearestEnd(a, X), eb = nearestEnd(b, X);
      if (ea.d <= reach && eb.d <= reach) moves.push({ w: a, i: ea.i, X });
    }
  }
  for (const m of moves) {
    const w = m.w;
    if (m.i === 1) {
      // openings are measured from the start: shift them by how far it moved
      const shift = Math.hypot(w.x1 - m.X[0], w.y1 - m.X[1]) / k;
      const outward = (w.x2 - w.x1) * (w.x1 - m.X[0]) + (w.y2 - w.y1) * (w.y1 - m.X[1]) > 0;
      w.openings = w.openings.map((o) => ({ ...o, atFt: +(o.atFt + (outward ? shift : -shift)).toFixed(2) }));
    }
    w[`x${m.i}`] = m.X[0]; w[`y${m.i}`] = m.X[1];
  }
  for (const w of walls) w.lengthFt = +(Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / k).toFixed(2);
  return walls;
}

function nearestEnd(w, X) {
  const d1 = Math.hypot(w.x1 - X[0], w.y1 - X[1]);
  const d2 = Math.hypot(w.x2 - X[0], w.y2 - X[1]);
  return d1 <= d2 ? { i: 1, d: d1 } : { i: 2, d: d2 };
}

function lineCross(a, b) {
  const dax = a.x2 - a.x1, day = a.y2 - a.y1, dbx = b.x2 - b.x1, dby = b.y2 - b.y1;
  const den = dax * dby - day * dbx;
  const la = Math.hypot(dax, day), lb = Math.hypot(dbx, dby);
  if (!la || !lb || Math.abs(den) / (la * lb) < 0.5) return null; // nearly parallel
  const t = ((b.x1 - a.x1) * dby - (b.y1 - a.y1) * dbx) / den;
  return [a.x1 + dax * t, a.y1 + day * t];
}

/** A wall is exterior when, on one side, a ray from its middle meets no other wall. */
export function markExterior(walls, k) {
  const reach = 400 * k; // look up to 400 ft away
  for (const w of walls) {
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
    const nx = -(w.y2 - w.y1) / L, ny = (w.x2 - w.x1) / L;
    const off = ((w.thickIn / 12) * k) / 2 + 1;
    let open = false;
    for (const sgn of [1, -1]) {
      // three rays (middle and quarter points) must all escape
      const escapes = [0.25, 0.5, 0.75].every((f) => {
        const px = w.x1 + (w.x2 - w.x1) * f + sgn * nx * off;
        const py = w.y1 + (w.y2 - w.y1) * f + sgn * ny * off;
        return !walls.some((o) => o !== w && hits(px, py, px + sgn * nx * reach, py + sgn * ny * reach, o));
      });
      if (escapes) { open = true; w.outside = sgn; break; }
    }
    w.exterior = open;
  }
  return walls;
}

function hits(ax, ay, bx, by, w) {
  const cx = w.x1, cy = w.y1, dx = w.x2, dy = w.y2;
  const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(den) < 1e-9) return false;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
  const s = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
  return t > 0 && t <= 1 && s >= 0 && s <= 1;
}
