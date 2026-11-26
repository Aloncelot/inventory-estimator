import { isDoubleWall, normWall, firstWallSide, doubleWallBands, standardThick } from './sync.js';

/**
 * Moving walls on the plan drawing.
 * Walls are in sheet points; k is points per foot. Openings are measured in feet from the wall start.
 */

/** Move one end of a wall to pt: openings past the new end go, moving the start shifts them. */
export function setEnd(w, end, pt, k) {
  const kk = k || 1;
  const next = end === '1' ? { ...w, x1: pt[0], y1: pt[1] } : { ...w, x2: pt[0], y2: pt[1] };
  const L = Math.hypot(next.x2 - next.x1, next.y2 - next.y1) / kk;
  const shift = end === '1' ? Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / kk - L : 0;
  const openings = (w.openings || [])
    .map((o) => ({ ...o, atFt: Math.round((o.atFt - shift) * 100) / 100 }))
    .filter((o) => o.atFt >= 0 && o.atFt + o.widthFt <= L + 0.01);
  const { lenFt, ...rest } = next; // the drawing is the length now
  return { ...rest, openings, auto: false, ...(openings.length !== (w.openings || []).length ? { openingsEdited: true } : {}) };
}

/**
 * The ends of other walls that meet a wall: at its ends or along its side (a T),
 * within half the thicker wall plus an inch.
 */
export function attachedEnds(walls, id, k) {
  const w = walls.find((x) => x.id === id);
  if (!w || !k) return [];
  const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  if (!L) return [];
  const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L;
  const out = [];
  for (const o of walls) {
    if (o.id === id) continue;
    const tol = (Math.max(Number(w.t) || 5, Number(o.t) || 5) / 24) * k + k / 12;
    for (const end of ['1', '2']) {
      const ex = end === '1' ? o.x1 : o.x2, ey = end === '1' ? o.y1 : o.y2;
      const u = (ex - w.x1) * ux + (ey - w.y1) * uy;
      const off = Math.abs((ex - w.x1) * -uy + (ey - w.y1) * ux);
      if (u >= -tol && u <= L + tol && off <= tol) out.push({ id: o.id, end });
    }
  }
  return out;
}

/**
 * Move a wall by d = [dx, dy]. With grip, the walls that meet it stretch or shrink
 * along their own line to keep meeting it (the gap to its centre line stays as it was).
 * Returns the new list of walls.
 */
export function moveWall(walls, id, d, { grip = true, k } = {}) {
  const w = walls.find((x) => x.id === id);
  if (!w || (!d[0] && !d[1])) return walls;
  const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
  const nx = -(w.y2 - w.y1) / L, ny = (w.x2 - w.x1) / L;
  const dn = d[0] * nx + d[1] * ny; // how far the wall's line moves sideways
  const ends = grip ? attachedEnds(walls, id, k) : [];
  const byId = new Map();
  for (const a of ends) byId.set(a.id, [...(byId.get(a.id) || []), a.end]);
  return walls.map((o) => {
    if (o.id === id) return { ...o, x1: o.x1 + d[0], y1: o.y1 + d[1], x2: o.x2 + d[0], y2: o.y2 + d[1], auto: false };
    const list = byId.get(o.id);
    if (!list) return o;
    let cur = o;
    for (const end of list) {
      const ex = end === '1' ? cur.x1 : cur.x2, ey = end === '1' ? cur.y1 : cur.y2;
      const fx = end === '1' ? cur.x2 : cur.x1, fy = end === '1' ? cur.y2 : cur.y1;
      const lo = Math.hypot(ex - fx, ey - fy);
      if (!lo) continue;
      const vx = (ex - fx) / lo, vy = (ey - fy) / lo; // out of the far end, towards the moved wall
      const dot = vx * nx + vy * ny;
      // across the moved wall: the end slides along its own line until it meets the moved line;
      // along it (a wall carrying on in line): it follows the move along its line
      const s = Math.abs(dot) > Math.sin((10 * Math.PI) / 180) ? dn / dot : d[0] * vx + d[1] * vy;
      if (lo + s < (k || 1) * 0.25) continue; // would fold over: leave it
      cur = setEnd(cur, end, [ex + vx * s, ey + vy * s], k);
    }
    return cur;
  });
}

/**
 * Split one wall into two at the point `pt` (projected onto its centre line).
 * Openings, posts and hardware are distributed to the half they belong to, with
 * distances on the second half shifted to start at 0. Returns [first, second]
 * or null if `pt` is too close to either end.
 */
export function splitWall(w, pt, k, nextId) {
  if (!w || !pt) return null;
  const kk = k || 1;
  const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  const margin = Math.max(2, 0.25 * kk);
  if (L < margin * 2) return null;
  const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L;
  const u = (pt[0] - w.x1) * ux + (pt[1] - w.y1) * uy;
  if (u <= margin || u >= L - margin) return null;
  const sx = Math.round((w.x1 + ux * u) * 100) / 100;
  const sy = Math.round((w.y1 + uy * u) * 100) / 100;
  const splitFt = u / kk;
  const r2 = (v) => Math.round(v * 100) / 100;
  const { lenFt: _lenFt, ...base } = w;

  const partOpenings = (list = []) => {
    const a = [], b = [];
    for (const o of list) {
      const mid = (Number(o.atFt) || 0) + (Number(o.widthFt) || 0) / 2;
      if (mid <= splitFt) a.push(o);
      else b.push({ ...o, atFt: r2(Math.max(0, (Number(o.atFt) || 0) - splitFt)) });
    }
    return [a, b];
  };
  const partAt = (list = []) => {
    const a = [], b = [];
    for (const item of list) {
      const at = Number(item.atFt) || 0;
      if (at <= splitFt) a.push(item);
      else b.push({ ...item, atFt: r2(Math.max(0, at - splitFt)) });
    }
    return [a, b];
  };

  const [op1, op2] = partOpenings(w.openings);
  const [p1, p2] = partAt(w.posts);
  const [h1, h2] = partAt(w.hardware);

  const first = {
    ...base, x2: sx, y2: sy, auto: false, openings: op1,
    ...(w.posts ? { posts: p1 } : {}),
    ...(w.hardware ? { hardware: h1 } : {}),
  };
  const second = {
    ...base, id: nextId(), x1: sx, y1: sy, auto: false, added: true, openings: op2,
    ...(w.posts ? { posts: p2 } : {}),
    ...(w.hardware ? { hardware: h2 } : {}),
  };
  return [first, second];
}

/**
 * Separate a double wall into two independent single walls positioned on the
 * exact centrelines of its two stud bands. Returns [wall1, wall2] or null if
 * `w` is not a double wall.
 */
export function separateDoubleWall(w, walls, k, nextId) {
  if (!w || !isDoubleWall(w)) return null;
  const kk = k || 12;
  const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  if (!L) return null;
  const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L;
  const t = Math.max(1, ((Number(w.t) || 10) / 12) * kk);
  const n = normWall(w);
  const bands = doubleWallBands(w, firstWallSide(w, walls, kk), t);
  const r2 = (v) => Math.round(v * 100) / 100;
  const { double: _d, kind2: _k2, size2: _s2, sidesFlip: _sf, ...base } = w;
  const make = (b, id, kind, size, extra = {}) => {
    const ox = uy * b.off, oy = -ux * b.off;
    return {
      ...base,
      id,
      x1: r2(w.x1 + ox), y1: r2(w.y1 + oy),
      x2: r2(w.x2 + ox), y2: r2(w.y2 + oy),
      t: standardThick({ double: false, kind, size }),
      kind,
      size,
      auto: false,
      openings: (w.openings || []).map((o) => ({ ...o })),
      ...extra,
    };
  };
  return [
    make(bands[0], w.id, n.kind, n.size),
    make(bands[1], nextId(), n.kind2 || 'partition', n.size2 || n.size, { added: true }),
  ];
}
