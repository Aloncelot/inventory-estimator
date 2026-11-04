// src/domain/plans/detect.js
// Finds walls in the vector drawing of a floor plan. Pure functions over the
// output of extractPage(): no pdf.js, no DOM, so every rule is unit-tested.
//
// A wall on a plan is two (or more) parallel lines a wall-thickness apart. The
// detector:
//   1. reads the drawing scale from the sheet text (3/32" = 1'-0" …);
//   2. buckets segments by direction and line style;
//   3. pairs parallel lines whose spacing is a wall thickness (3"–14") and
//      overlap along their length, and merges overlapping pairs into bands;
//   4. joins collinear bands across openings (a door leaf/swing or window
//      glazing in the gap), recording the openings;
//   5. guesses stud size from thickness, and exterior vs interior by casting a
//      ray from each wall outward: nothing beyond it means it faces outside.
// Every guess is editable by the user; detection only has to get close.

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

  // 1. directional buckets of usable segments
  const buckets = new Map(); // deg → { d, n, byStyle: Map(style → [{u0,u1,v}]) }
  const all = []; // every segment in its bucket frame, for opening evidence
  for (const s of page.segments) {
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
    all.push({ ...s, deg });
    if (s.arc || len < minSeg) continue;
    if (s.fill && lum(styleColor(s.style)) > 0.97) continue; // white masks
    if (allow && !allow.has(s.style)) continue;
    if (!b.byStyle.has(s.style)) b.byStyle.set(s.style, []);
    b.byStyle.get(s.style).push(rec);
  }

  // 2–3. pair parallel lines into bands
  const bands = [];
  for (const b of buckets.values()) {
    for (const [style, segs] of b.byStyle) {
      segs.sort((p, q) => p.v - q.v);
      const pieces = [];
      for (let i = 0; i < segs.length; i++) {
        const a = segs[i];
        for (let j = i + 1; j < segs.length; j++) {
          const c = segs[j];
          const gap = c.v - a.v;
          if (gap > tMax) break;
          if (gap < tMin) continue;
          const u0 = Math.max(a.u0, c.u0), u1 = Math.min(a.u1, c.u1);
          if (u1 - u0 < minSeg) continue;
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
      for (const g of groups.values()) {
        if (g.vb - g.va > tMax * 1.05) continue; // chained into something too thick: not a wall
        bands.push({ deg: b.deg, d: b.d, n: b.n, style, u0: g.u0, u1: g.u1, v: (g.va + g.vb) / 2, t: g.vb - g.va });
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
        if (gap <= minOpen) { cur.u1 = Math.max(cur.u1, bd.u1); cur.t = Math.max(cur.t, bd.t); continue; }
        if (gap <= maxGap) {
          const kind = openingEvidence(buckets, all, bands, cur, cur.u1, bd.u0, ln.v, Math.max(cur.t, bd.t), inPt);
          if (kind) {
            cur.openings.push({ u0: cur.u1, u1: bd.u0, type: kind });
            cur.u1 = Math.max(cur.u1, bd.u1); cur.t = Math.max(cur.t, bd.t);
            continue;
          }
        }
        flush(); cur = { ...bd, v: ln.v, openings: [] };
      }
      flush();
    }
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
        style: w.style, thickIn: +thickIn.toFixed(2), size: studSizeFor(thickIn, o.finishIn),
        lengthFt: +((w.u1 - w.u0) / k).toFixed(2),
        openings: w.openings.map((op) => ({ atFt: +((op.u0 - w.u0) / k).toFixed(2), widthFt: +((op.u1 - op.u0) / k).toFixed(2), type: op.type })),
      };
    });
  out = dropContained(out, k);
  out = mainBuilding(out, k);
  joinCorners(out, k);
  markExterior(out, k);
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
  out.forEach((w, i) => { w.id = `w${i + 1}`; });
  return { walls: out, styles: styleList, ptPerFt: k, suggested: suggestStyles(styleList), area };
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
    .filter((s) => (s.width > 0 ? s.width >= maxW * 0.4 : lum(s.color) < 0.5))
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

/** Remove walls lying inside a thicker/longer parallel wall (double-drawn bands). */
function dropContained(walls, k) {
  const keep = [];
  const sorted = walls.slice().sort((a, b) => b.lengthFt - a.lengthFt);
  for (const w of sorted) {
    const inside = keep.some((o) => {
      if (Math.abs(angleOf(o) - angleOf(w)) > 0.02) return false;
      const d = [Math.cos(angleOf(o)), Math.sin(angleOf(o))];
      const n = [-d[1], d[0]];
      const v = (p) => p[0] * n[0] + p[1] * n[1];
      const u = (p) => p[0] * d[0] + p[1] * d[1];
      const half = ((o.thickIn / 12) * k) / 2 + 0.5;
      if (Math.abs(v([w.x1, w.y1]) - v([o.x1, o.y1])) > half) return false;
      const a0 = Math.min(u([o.x1, o.y1]), u([o.x2, o.y2])), a1 = Math.max(u([o.x1, o.y1]), u([o.x2, o.y2]));
      const b0 = Math.min(u([w.x1, w.y1]), u([w.x2, w.y2])), b1 = Math.max(u([w.x1, w.y1]), u([w.x2, w.y2]));
      return b0 >= a0 - 0.5 && b1 <= a1 + 0.5;
    });
    if (!inside) keep.push(w);
  }
  walls.length = 0; walls.push(...keep);
  return walls;
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
  return walls.filter((_, i) => sizes.get(find(i)) >= walls.length * 0.1);
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
