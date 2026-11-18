// src/domain/plans/marks.js
// Lines on a plan that look like a wall face but belong to annotation. Wall
// detection pairs parallel lines a wall-thickness apart, so a tag frame next to
// a wall, or a dimension line beside an extension line, can pass for a wall.
// These find such lines on the raw page (sheet points, before any scale):
//   - tag frames: the two long sides of a small box or oval around a label
//     (door, window and wall-type tags, keynotes);
//   - dimension lines: a line crossed by 45° tick marks.
// Pure functions over extractPage() output; detectWalls() leaves the lines
// they return out of pairing.

const TAG_MAX_PT = 54; // longest tag side, 0.75" on the sheet
const TAG_MAX_GAP_PT = 30; // widest tag, 0.42" between its long sides
const TICK_MAX_PT = 12; // a tick mark is short
const TICK_MIN_PT = 2;

const lenOf = (s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

/** Uniform grid over segment bounding boxes, for neighbour lookups. */
function grid(segs, cell) {
  const map = new Map();
  const key = (i, j) => `${i},${j}`;
  segs.forEach((s, idx) => {
    const i0 = Math.floor(Math.min(s.x1, s.x2) / cell), i1 = Math.floor(Math.max(s.x1, s.x2) / cell);
    const j0 = Math.floor(Math.min(s.y1, s.y2) / cell), j1 = Math.floor(Math.max(s.y1, s.y2) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(idx);
    }
  });
  return {
    near(x, y, r) {
      const out = new Set();
      for (let i = Math.floor((x - r) / cell); i <= Math.floor((x + r) / cell); i++) {
        for (let j = Math.floor((y - r) / cell); j <= Math.floor((y + r) / cell); j++) {
          for (const idx of map.get(key(i, j)) || []) out.add(idx);
        }
      }
      return out;
    },
  };
}

/** Centre of a text item: origin is the baseline start, y points down. */
export function textCenter(t) {
  const dx = Math.cos(t.angle || 0), dy = Math.sin(t.angle || 0);
  const up = [dy, -dx]; // towards the top of the glyphs
  const half = (t.w || t.size * 0.6 * String(t.str).length) / 2;
  const rise = (t.size || 0) * 0.35;
  return [t.x + dx * half + up[0] * rise, t.y + dy * half + up[1] * rise];
}

/**
 * Tag frames: two parallel straight lines of about one length, ends aligned,
 * short on the sheet, running along a label and fitting it snugly (a room or
 * closet around a label is much roomier than the text). The frame's short
 * straight ends are marked too.
 * @returns {Set<number>} indexes into page.segments
 */
export function tagFrames(page) {
  const segs = page.segments || [];
  const shortIdx = [];
  segs.forEach((s, i) => { const L = lenOf(s); if (!s.arc && !s.fill && L >= 4 && L <= TAG_MAX_PT) shortIdx.push(i); });
  const short = shortIdx.map((i) => segs[i]);
  const g = grid(short, 24);
  const out = new Set();
  for (const t of page.texts || []) {
    if (!String(t.str).trim()) continue;
    const [cx, cy] = textCenter(t);
    const h = (t.size || 6) * 0.7; // cap height
    const tw = t.w || (t.size || 6) * 0.6 * String(t.str).length;
    const td = [Math.cos(t.angle || 0), Math.sin(t.angle || 0)];
    const cand = [...g.near(cx, cy, TAG_MAX_GAP_PT)].map((k) => short[k]);
    // lines that run past the label on either side
    const info = cand.map((s) => {
      const L = lenOf(s);
      const d = [(s.x2 - s.x1) / L, (s.y2 - s.y1) / L];
      const u = (cx - s.x1) * d[0] + (cy - s.y1) * d[1];
      const v = (cx - s.x1) * -d[1] + (cy - s.y1) * d[0];
      return { s, L, d, u, v };
    }).filter((a) => a.u > 1 && a.u < a.L - 1 && Math.abs(a.v) <= TAG_MAX_GAP_PT
      && Math.abs(a.d[0] * td[1] - a.d[1] * td[0]) < 0.05 // runs along the text
      && a.L <= tw + 4 * h);
    for (let i = 0; i < info.length; i++) {
      for (let j = i + 1; j < info.length; j++) {
        const a = info[i], b = info[j];
        if (Math.abs(a.d[0] * b.d[1] - a.d[1] * b.d[0]) > 0.02) continue; // not parallel
        const same = a.d[0] * b.d[0] + a.d[1] * b.d[1] > 0;
        const vb = same ? b.v : -b.v; // b's offset in a's frame
        if (Math.sign(a.v) === Math.sign(vb) || Math.abs(a.v - vb) < h || Math.abs(a.v - vb) > 3.2 * h) continue; // label not snugly between them
        if (Math.abs(a.L - b.L) > 0.15 * Math.max(a.L, b.L)) continue;
        const bu = same ? b.u : b.L - b.u; // label position along b from its matching end
        if (Math.abs(a.u - bu) > Math.max(2, 0.1 * a.L)) continue; // ends not aligned
        out.add(shortIdx[short.indexOf(a.s)]);
        out.add(shortIdx[short.indexOf(b.s)]);
        // the frame's straight ends: short lines inside the box
        const xs = [a.s.x1, a.s.x2, b.s.x1, b.s.x2], ys = [a.s.y1, a.s.y2, b.s.y1, b.s.y2];
        const box = [Math.min(...xs) - 1.5, Math.min(...ys) - 1.5, Math.max(...xs) + 1.5, Math.max(...ys) + 1.5];
        const inBox = (x, y) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];
        for (const c of cand) if (inBox(c.x1, c.y1) && inBox(c.x2, c.y2)) out.add(shortIdx[short.indexOf(c)]);
      }
    }
  }
  return out;
}

/**
 * Dimension lines: a straight line with short marks crossing it at 45°.
 * @returns {Set<number>} indexes into page.segments
 */
export function dimensionLines(page) {
  const segs = page.segments || [];
  const ticks = segs.filter((s) => {
    if (s.arc || s.fill) return false;
    const L = lenOf(s);
    return L >= TICK_MIN_PT && L <= TICK_MAX_PT;
  });
  const lines = [];
  const lineIdx = [];
  segs.forEach((s, i) => { if (!s.arc && !s.fill && lenOf(s) > TICK_MAX_PT) { lines.push(s); lineIdx.push(i); } });
  const g = grid(lines, 24);
  const hits = new Map(); // line index → positions of ticks along it
  for (const t of ticks) {
    const tl = lenOf(t);
    const td = [(t.x2 - t.x1) / tl, (t.y2 - t.y1) / tl];
    // a tick is centred on the line, or drawn as two halves from a point on it
    const pts = [[(t.x1 + t.x2) / 2, (t.y1 + t.y2) / 2], [t.x1, t.y1], [t.x2, t.y2]];
    for (const k of g.near(pts[0][0], pts[0][1], tl)) {
      const s = lines[k];
      const L = lenOf(s);
      const d = [(s.x2 - s.x1) / L, (s.y2 - s.y1) / L];
      const cos = Math.abs(d[0] * td[0] + d[1] * td[1]);
      if (Math.abs(cos - Math.SQRT1_2) > 0.12) continue; // not at 45°
      for (const [px, py] of pts) {
        const u = (px - s.x1) * d[0] + (py - s.y1) * d[1];
        const v = (px - s.x1) * -d[1] + (py - s.y1) * d[0];
        // right on the line: a tick ending near a line beside it (a wall face
        // next to a dimension) does not count
        if (Math.abs(v) > 0.3 || u < -2 || u > L + 2) continue;
        const list = hits.get(k) || [];
        // CAD draws ticks with a heavier pen; hatching that ends on a line does not count
        if (!list.some((q) => Math.abs(q.u - u) < 3)) list.push({ u, heavy: (t.w || 0) >= 1.5 * (s.w || 0) && (t.w || 0) > 0 });
        hits.set(k, list);
        break;
      }
    }
  }
  // without heavier ticks, a dimension needs its figure along it
  const centers = (page.texts || []).map((t) => ({ t, c: textCenter(t), d: [Math.cos(t.angle || 0), Math.sin(t.angle || 0)] }));
  const hasFigure = (s) => {
    const L = lenOf(s);
    const d = [(s.x2 - s.x1) / L, (s.y2 - s.y1) / L];
    return centers.some(({ t, c, d: td }) => {
      if (Math.abs(d[0] * td[1] - d[1] * td[0]) > 0.05 || !/\d/.test(t.str)) return false;
      const u = (c[0] - s.x1) * d[0] + (c[1] - s.y1) * d[1];
      const v = (c[0] - s.x1) * -d[1] + (c[1] - s.y1) * d[0];
      return u > 0 && u < L && Math.abs(v) <= (t.size || 6) * 1.5;
    });
  };
  const out = new Set();
  for (const [k, us] of hits) {
    if (us.length < 2) continue; // ticks at two points at least
    // a dimension line stops just past its outer ticks; a wall face that only
    // serves as a witness line has the ticks somewhere along it
    const L = lenOf(lines[k]);
    const lo = Math.min(...us.map((q) => q.u)), hi = Math.max(...us.map((q) => q.u));
    if (lo > TICK_MAX_PT * 1.5 || L - hi > TICK_MAX_PT * 1.5) continue;
    if (us.filter((q) => q.heavy).length >= 2 || hasFigure(lines[k])) out.add(lineIdx[k]);
  }
  return out;
}

/**
 * Curves drawn as polylines (many CAD exports flatten arcs into short
 * segments of one path), and the straight lines that belong to them:
 *  - fixture outlines: a straight line running on from a curve's end
 *    (a tub basin, a sink), which is no wall face;
 *  - door leaves drawn open: the lines from a swing's end to its hinge.
 * @returns {{ marked: Set<number>, chords: Array }} segment indexes to leave
 *   out of pairing, and a chord per curve (start to end) for opening evidence
 */
export function curveMarks(page, ptPerFt = 9) {
  const leafGap = (2.6 / 12) * ptPerFt; // a leaf is drawn about 1¾" thick
  const segs = page.segments || [];
  const marked = new Set();
  const chains = [];
  // runs of short, connected segments of one path that turn gently one way
  let run = [];
  const flush = () => {
    if (run.length >= 3) {
      let turn = 0;
      let ok = true;
      for (let i = 1; i < run.length; i++) {
        const a = segs[run[i - 1]], b = segs[run[i]];
        const t = Math.atan2(
          (a.x2 - a.x1) * (b.y2 - b.y1) - (a.y2 - a.y1) * (b.x2 - b.x1),
          (a.x2 - a.x1) * (b.x2 - b.x1) + (a.y2 - a.y1) * (b.y2 - b.y1),
        );
        if (Math.abs(t) > 0.6 || (turn && Math.sign(t) !== Math.sign(turn) && Math.abs(t) > 0.01)) { ok = false; break; }
        turn += t;
      }
      if (ok && Math.abs(turn) >= 0.3) {
        const first = segs[run[0]], last = segs[run[run.length - 1]];
        run.forEach((i) => marked.add(i));
        chains.push({
          p: [first.x1, first.y1], q: [last.x2, last.y2], turn: Math.abs(turn),
          dp: [first.x2 - first.x1, first.y2 - first.y1], dq: [last.x2 - last.x1, last.y2 - last.y1],
        });
      }
    }
    run = [];
  };
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const L = lenOf(s);
    const prev = run.length ? segs[run[run.length - 1]] : null;
    const joins = prev && s.pid !== undefined && s.pid === prev.pid && Math.hypot(s.x1 - prev.x2, s.y1 - prev.y2) < 0.05;
    if (!joins) flush();
    if (!s.arc && !s.fill && L > 0 && L <= 8 && s.pid !== undefined) run.push(i);
    else flush();
  }
  flush();
  if (!chains.length) return { marked, chords: [] };

  // endpoints of curves, for lookups
  const ends = [];
  chains.forEach((c) => {
    ends.push({ pt: c.p, dir: c.dp, c });
    ends.push({ pt: c.q, dir: c.dq, c });
  });
  const g = grid(ends.map((e) => ({ x1: e.pt[0], y1: e.pt[1], x2: e.pt[0], y2: e.pt[1] })), 24);
  const leafCand = []; // lines from a swing's end to its hinge; a leaf is two, close together
  const unit = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  segs.forEach((s, i) => {
    if (marked.has(i) || s.arc || s.fill) return;
    const L = lenOf(s);
    if (L <= 8) return;
    const d = [(s.x2 - s.x1) / L, (s.y2 - s.y1) / L];
    for (const [px, py, ox, oy] of [[s.x1, s.y1, s.x2, s.y2], [s.x2, s.y2, s.x1, s.y1]]) {
      for (const k of g.near(px, py, 3)) {
        const e = ends[k];
        const dist = Math.hypot(e.pt[0] - px, e.pt[1] - py);
        if (dist > 3) continue;
        const ed = unit(e.dir);
        // runs on from the curve's end, tangent to it: part of a fixture outline
        if (dist <= 0.5 && Math.abs(ed[0] * d[1] - ed[1] * d[0]) < 0.25) { marked.add(i); return; }
        // a door leaf: from one end of a quarter swing to its hinge, which is
        // one leaf length from both ends of the swing
        const c = e.c;
        if (c.turn < 1.2 || c.turn > 1.95) continue;
        const r = Math.hypot(c.q[0] - c.p[0], c.q[1] - c.p[1]) / Math.SQRT2;
        const other = e.pt === c.p ? c.q : c.p;
        if (Math.abs(L - r) <= 0.2 * r && Math.abs(Math.hypot(other[0] - ox, other[1] - oy) - r) <= 0.2 * r) leafCand.push({ i, d, L });
      }
    }
  });
  // the two long sides of a leaf: parallel, about one length, a leaf thick apart
  // (a wall face beside an open leaf is a wall thickness from the next face)
  for (const a of leafCand) {
    const sa = segs[a.i];
    const partner = leafCand.some((b) => {
      if (b === a || Math.abs(a.d[0] * b.d[1] - a.d[1] * b.d[0]) > 0.05) return false;
      const sb = segs[b.i];
      const gap = Math.abs((sb.x1 - sa.x1) * -a.d[1] + (sb.y1 - sa.y1) * a.d[0]);
      return gap >= 0.3 && gap <= leafGap && Math.abs(a.L - b.L) <= 0.15 * a.L;
    });
    if (partner) marked.add(a.i);
  }
  return { marked, chords: chains.map((c) => ({ x1: c.p[0], y1: c.p[1], x2: c.q[0], y2: c.q[1], arc: true })) };
}
