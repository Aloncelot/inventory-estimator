// src/domain/plans/geometry.js
// Pure 2D polygon geometry for plan walls (both single and double walls) with
// clean CAD-style joints:
//   - Double walls are expanded into their 2 individual stud bands so:
//       * a single wall meeting a double wall only notches/miters the NEARER
//         band (leaving the far band untouched);
//       * two double walls meeting at a corner pair inner-with-inner (shorter
//         distance) and outer-with-outer (longer distance) with separate 45°
//         miters, keeping the gap between bands continuous;
//       * a single wall continuing from one band of a double wall aligns flush
//         with that band while the other band stops cleanly.
//   - L corners (90° or any angle): exact miter cut (45° at 90°, bisector at
//     any angle), closing the outer corner with zero overlap inside;
//   - T junctions (3 walls meeting at a point, OR 1 stem wall meeting the side
//     of a continuous wall): V-miter ("machimbrado en V") where the stem ends
//     in a V-point at the junction centreline and the continuous wall(s) carry
//     the complementary bevel/V-notch.
// Pure functions over plan walls: no DOM, fully unit-tested.

import { isDoubleWall, firstWallSide, doubleWallBands } from './sync.js';

const EPS = 1e-6;

/** Line intersection of P + t*dP and Q + s*dQ; null if nearly parallel. */
function intersect(px, py, dpx, dpy, qx, qy, dqx, dqy) {
  const den = dpx * dqy - dpy * dqx;
  if (Math.abs(den) < 1e-4) return null;
  const t = ((qx - px) * dqy - (qy - py) * dqx) / den;
  return [px + dpx * t, py + dpy * t];
}

/** Clamp a miter point so extreme acute angles never shoot far from the joint. */
function clampMiter(pt, jx, jy, fallback, maxDist) {
  if (!pt) return fallback;
  return Math.hypot(pt[0] - jx, pt[1] - jy) <= maxDist ? pt : fallback;
}

/**
 * Expand plan walls into individual framing bands (1 per single wall, 2 per
 * double wall). Used by both polygon rendering and the nearest-band snap magnet.
 */
export function expandWallBands(walls = [], k = 9) {
  const out = [];
  for (const w of walls || []) {
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (L < EPS) continue;
    const t = Math.max(1, ((Number(w.t) || 5) / 12) * k);
    if (isDoubleWall(w)) {
      const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L;
      const bands = doubleWallBands(w, firstWallSide(w, walls, k), t);
      bands.forEach((b, i) => {
        // sync.js defines left normal on sheet (y down) as (uy, -ux)
        const ox = uy * b.off, oy = -ux * b.off;
        out.push({
          id: `${w.id}:${i}`, parentId: w.id, bandIdx: i, isDouble: true,
          x1: w.x1 + ox, y1: w.y1 + oy, x2: w.x2 + ox, y2: w.y2 + oy,
          width: b.width, totalWidth: t, off: b.off, kind: b.kind,
        });
      });
    } else {
      out.push({
        id: w.id, parentId: w.id, bandIdx: -1, isDouble: false,
        x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2,
        width: t, totalWidth: t, off: 0, kind: w.kind,
      });
    }
  }
  return out;
}

/**
 * Compute an SVG polygon (array of [x, y] vertices) for every wall band in `walls`.
 * Single walls are keyed by `w.id`; double wall bands by `${w.id}:0` and `${w.id}:1`.
 * @param {Array} walls plan walls ({ id, x1, y1, x2, y2, t, double, ... })
 * @param {number} k sheet points per foot
 * @returns {Map<string, Array<[number, number]>>} band id → polygon vertices
 */
export function wallPolygonPoints(walls = [], k = 9) {
  const bands = expandWallBands(walls, k);
  const list = [];
  const byParent = new Map();
  for (const b of bands) {
    const L = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
    if (L < EPS) continue;
    const ux = (b.x2 - b.x1) / L, uy = (b.y2 - b.y1) / L;
    const nx = -uy, ny = ux; // math left normal
    const hw = b.width / 2;
    const item = {
      b, id: b.id, parentId: b.parentId, isDouble: b.isDouble,
      L, ux, uy, nx, ny, hw, totalHw: b.totalWidth / 2,
      cap1: [[b.x1 - nx * hw, b.y1 - ny * hw], [b.x1 + nx * hw, b.y1 + ny * hw]],
      cap2: [[b.x2 + nx * hw, b.y2 + ny * hw], [b.x2 - nx * hw, b.y2 - ny * hw]],
      leftNotches: [],
      rightNotches: [],
      joined1: false,
      joined2: false,
    };
    list.push(item);
    if (!byParent.has(b.parentId)) byParent.set(b.parentId, []);
    byParent.get(b.parentId).push(item);
  }

  /** Set a band's end cap given its left (+n_out) and right (-n_out) corners (plus optional middle tip). */
  const setCap = (ep, leftPt, rightPt, midPt = null) => {
    const { m, end } = ep;
    if (end === 1) {
      m.cap1 = midPt ? [rightPt, midPt, leftPt] : [rightPt, leftPt];
      m.joined1 = true;
    } else {
      m.cap2 = midPt ? [rightPt, midPt, leftPt] : [rightPt, leftPt];
      m.joined2 = true;
    }
  };

  /** Side edge line of an outgoing endpoint: side = +1 (left of d_out) or -1 (right of d_out). */
  const edgeOf = (ep, side, jx, jy) => {
    const lx = -ep.dy * side, ly = ep.dx * side;
    return [jx + lx * ep.m.hw, jy + ly * ep.m.hw, ep.dx, ep.dy];
  };

  /** Apply an L-corner miter between two outgoing endpoints `a` and `b` at intersection `(jx, jy)`. */
  const applyMiter = (a, b, jx, jy) => {
    const cross = a.dx * b.dy - a.dy * b.dx;
    if (Math.abs(cross) < 0.15) return;
    const maxD = 3.2 * Math.max(a.m.hw, b.m.hw);
    const aInSide = cross > 0 ? 1 : -1;
    const bInSide = -aInSide;
    const eAIn = edgeOf(a, aInSide, jx, jy);
    const eBIn = edgeOf(b, bInSide, jx, jy);
    const eAOut = edgeOf(a, -aInSide, jx, jy);
    const eBOut = edgeOf(b, -bInSide, jx, jy);
    const pIn = clampMiter(intersect(...eAIn, ...eBIn), jx, jy, [eAIn[0], eAIn[1]], maxD);
    const pOut = clampMiter(intersect(...eAOut, ...eBOut), jx, jy, [eAOut[0], eAOut[1]], maxD);
    setCap(a, aInSide === 1 ? pIn : pOut, aInSide === 1 ? pOut : pIn);
    setCap(b, bInSide === 1 ? pIn : pOut, bInSide === 1 ? pOut : pIn);
  };

  const makeEp = (m, end) => (end === 1
    ? { m, end: 1, x: m.b.x1, y: m.b.y1, dx: m.ux, dy: m.uy }
    : { m, end: 2, x: m.b.x2, y: m.b.y2, dx: -m.ux, dy: -m.uy });

  // 0. Double-wall × double-wall L-corners: pair inner band with inner band
  //    (shorter distance) and outer band with outer band (longer distance),
  //    mitering each pair independently at its own centreline intersection.
  const doubleWalls = (walls || []).filter((w) => isDoubleWall(w) && byParent.get(w.id)?.length === 2);
  for (let i = 0; i < doubleWalls.length; i++) {
    const wa = doubleWalls[i];
    const LA = Math.hypot(wa.x2 - wa.x1, wa.y2 - wa.y1);
    if (LA < EPS) continue;
    const uax = (wa.x2 - wa.x1) / LA, uay = (wa.y2 - wa.y1) / LA;
    const bandsA = byParent.get(wa.id);
    for (let j = i + 1; j < doubleWalls.length; j++) {
      const wb = doubleWalls[j];
      const LB = Math.hypot(wb.x2 - wb.x1, wb.y2 - wb.y1);
      if (LB < EPS) continue;
      const ubx = (wb.x2 - wb.x1) / LB, uby = (wb.y2 - wb.y1) / LB;
      const bandsB = byParent.get(wb.id);
      const tol = Math.max(bandsA[0].totalHw, bandsB[0].totalHw) * 1.25 + 2;
      // find which endpoints of parent wa and wb meet
      let pairEnd = null;
      for (const ea of [1, 2]) {
        const ax = ea === 1 ? wa.x1 : wa.x2, ay = ea === 1 ? wa.y1 : wa.y2;
        for (const eb of [1, 2]) {
          const bx = eb === 1 ? wb.x1 : wb.x2, by = eb === 1 ? wb.y1 : wb.y2;
          const d = Math.hypot(ax - bx, ay - by);
          if (d <= tol && (!pairEnd || d < pairEnd.d)) pairEnd = { ea, eb, d, ax, ay, bx, by };
        }
      }
      if (!pairEnd) continue;
      const dax = pairEnd.ea === 1 ? uax : -uax, day = pairEnd.ea === 1 ? uay : -uay;
      const dbx = pairEnd.eb === 1 ? ubx : -ubx, dby = pairEnd.eb === 1 ? uby : -uby;
      const cross = dax * dby - day * dbx;
      if (Math.abs(cross) < 0.15) continue;
      // inner band of A is the one shifted toward B's outgoing direction (d_b);
      // outer band of A is the one shifted away from d_b. Same for B toward d_a.
      const pickInner = (bands, end, toX, toY, px, py) => {
        const s0 = ((end === 1 ? bands[0].b.x1 : bands[0].b.x2) - px) * toX + ((end === 1 ? bands[0].b.y1 : bands[0].b.y2) - py) * toY;
        const s1 = ((end === 1 ? bands[1].b.x1 : bands[1].b.x2) - px) * toX + ((end === 1 ? bands[1].b.y1 : bands[1].b.y2) - py) * toY;
        return s0 >= s1 ? [bands[0], bands[1]] : [bands[1], bands[0]];
      };
      const [aIn, aOut] = pickInner(bandsA, pairEnd.ea, dbx, dby, pairEnd.ax, pairEnd.ay);
      const [bIn, bOut] = pickInner(bandsB, pairEnd.eb, dax, day, pairEnd.bx, pairEnd.by);
      for (const [mA, mB] of [[aIn, bIn], [aOut, bOut]]) {
        const epA = makeEp(mA, pairEnd.ea);
        const epB = makeEp(mB, pairEnd.eb);
        const J = intersect(epA.x, epA.y, epA.dx, epA.dy, epB.x, epB.y, epB.dx, epB.dy);
        if (J) applyMiter(epA, epB, J[0], J[1]);
      }
    }
  }

  // 1. Cluster remaining free endpoints that meet at the same junction (L corners & 3-way T)
  const endpoints = [];
  for (const m of list) {
    if (!m.joined1) endpoints.push(makeEp(m, 1));
    if (!m.joined2) endpoints.push(makeEp(m, 2));
  }
  const used = new Uint8Array(endpoints.length);
  const clusters = [];
  for (let i = 0; i < endpoints.length; i++) {
    if (used[i]) continue;
    const group = [endpoints[i]];
    used[i] = 1;
    for (let j = i + 1; j < endpoints.length; j++) {
      if (used[j] || endpoints[j].m.parentId === endpoints[i].m.parentId) continue;
      const tol = Math.max(endpoints[i].m.hw, endpoints[j].m.hw) * 0.9 + 1.5;
      if (Math.hypot(endpoints[j].x - endpoints[i].x, endpoints[j].y - endpoints[i].y) <= tol) {
        group.push(endpoints[j]);
        used[j] = 1;
      }
    }
    if (group.length >= 2) clusters.push(group);
  }

  // Process endpoint clusters (2-way L corners and 3-way T junctions)
  for (const group of clusters) {
    const jx = group.reduce((s, e) => s + e.x, 0) / group.length;
    const jy = group.reduce((s, e) => s + e.y, 0) / group.length;

    if (group.length === 2) {
      applyMiter(group[0], group[1], jx, jy);
    } else if (group.length === 3) {
      let pair = null, stem = null;
      let bestDot = 1;
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          const dot = group[i].dx * group[j].dx + group[i].dy * group[j].dy;
          if (dot < bestDot) { bestDot = dot; pair = [group[i], group[j]]; stem = group[3 - i - j]; }
        }
      }
      if (!pair || bestDot > -0.92) continue;
      const [a, b] = pair;
      const crossAC = a.dx * stem.dy - a.dy * stem.dx;
      if (Math.abs(crossAC) < 0.25) continue;
      const aFace = crossAC > 0 ? 1 : -1;
      const bFace = -aFace;
      const maxD = 3.2 * Math.max(a.m.hw, b.m.hw, stem.m.hw);
      const eA = edgeOf(a, aFace, jx, jy);
      const eB = edgeOf(b, bFace, jx, jy);
      const eCA = edgeOf(stem, -aFace, jx, jy);
      const eCB = edgeOf(stem, aFace, jx, jy);
      const pAC = clampMiter(intersect(...eA, ...eCA), jx, jy, [eA[0], eA[1]], maxD);
      const pBC = clampMiter(intersect(...eB, ...eCB), jx, jy, [eB[0], eB[1]], maxD);
      const pABack = edgeOf(a, -aFace, jx, jy).slice(0, 2);
      const pBBack = edgeOf(b, -bFace, jx, jy).slice(0, 2);
      const tip = [jx, jy];
      // Machimbrado en V: stem C gets V-tip [pAC, tip, pBC]; A and B get 45° bevels meeting at tip
      setCap(stem, aFace === 1 ? pBC : pAC, aFace === 1 ? pAC : pBC, tip);
      setCap(a, aFace === 1 ? pAC : pABack, aFace === 1 ? pABack : pAC, tip);
      setCap(b, bFace === 1 ? pBC : pBBack, bFace === 1 ? pBBack : pBC, tip);
    }
  }

  // 2. T junctions where a free endpoint meets the side of a continuous wall band:
  //    because double walls are expanded into 2 bands, `best` automatically picks
  //    ONLY the nearer band, leaving the far band untouched!
  for (const ep of endpoints) {
    if ((ep.end === 1 && ep.m.joined1) || (ep.end === 2 && ep.m.joined2)) continue;
    let best = null;
    for (const host of list) {
      if (host.parentId === ep.m.parentId) continue;
      const cross = host.ux * ep.dy - host.uy * ep.dx;
      if (Math.abs(cross) < 0.25) continue; // parallel
      const u = (ep.x - host.b.x1) * host.ux + (ep.y - host.b.y1) * host.uy;
      const margin = host.hw + ep.m.hw * 0.5;
      if (u <= margin || u >= host.L - margin) continue;
      const off = Math.abs((ep.x - host.b.x1) * host.nx + (ep.y - host.b.y1) * host.ny);
      const tol = host.hw + ep.m.hw + 2;
      if (off > tol) continue;
      if (!best || off < best.off) best = { host, u, off, cross };
    }
    if (!best) continue;
    const { host, u, cross } = best;
    const jx = host.b.x1 + host.ux * u;
    const jy = host.b.y1 + host.uy * u;
    const hostSide = cross > 0 ? 1 : -1;
    const hx = jx + host.nx * host.hw * hostSide;
    const hy = jy + host.ny * host.hw * hostSide;
    const maxD = 3.2 * Math.max(host.hw, ep.m.hw);
    const eCL = edgeOf(ep, 1, jx, jy);
    const eCR = edgeOf(ep, -1, jx, jy);
    const pL = clampMiter(intersect(hx, hy, host.ux, host.uy, ...eCL), jx, jy, [eCL[0], eCL[1]], maxD);
    const pR = clampMiter(intersect(hx, hy, host.ux, host.uy, ...eCR), jx, jy, [eCR[0], eCR[1]], maxD);
    const tip = [jx, jy];
    setCap(ep, pL, pR, tip);

    const uL = (pL[0] - host.b.x1) * host.ux + (pL[1] - host.b.y1) * host.uy;
    const uR = (pR[0] - host.b.x1) * host.ux + (pR[1] - host.b.y1) * host.uy;
    const [pFirst, pSecond] = uL <= uR ? [pL, pR] : [pR, pL];
    if (hostSide === 1) host.leftNotches.push({ u, pts: [pFirst, tip, pSecond] });
    else host.rightNotches.push({ u, pts: [pSecond, tip, pFirst] });
  }

  // 3. Assemble final closed polygon for each wall band
  const out = new Map();
  for (const m of list) {
    m.leftNotches.sort((a, b) => a.u - b.u);
    m.rightNotches.sort((a, b) => b.u - a.u);
    const pts = [...m.cap1];
    for (const nt of m.leftNotches) pts.push(...nt.pts);
    pts.push(...m.cap2);
    for (const nt of m.rightNotches) pts.push(...nt.pts);
    out.set(m.id, pts);
  }
  return out;
}

/** Format polygon vertices as an SVG `points` attribute string. */
export function wallPolygonsSvg(walls = [], k = 9) {
  const pts = wallPolygonPoints(walls, k);
  const out = new Map();
  for (const [id, arr] of pts) {
    out.set(id, arr.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '));
  }
  return out;
}
