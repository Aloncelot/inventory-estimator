// src/domain/plans/loose.js
// Loose material that comes from a level's plan:
// - the floor: area inside the outside face of the outermost walls, less the
//   floor openings drawn on the plan (stairs, shafts, open to below), split into
//   an FRT band along the perimeter when the project needs it; its perimeter
//   gives the rimboard;
// - the blocking drawn on the plan (bathroom, kitchen, stair railing, other);
// - the structural hardware (see hardware.js);
// - on concrete: foam sill sealer and PT sill plates under the exterior, bearing
//   and shear walls, sill plates by wall size.
// withPlanLoose() writes these rows into each level's own section of Loose material
// and the plan figures of the Foundation section up to date. Pure functions.

import { normWall, wallParts, wallLengthFt } from './sync';
import { hardwareCounts, describeRule } from './hardware';
import { beamGroups } from './beams';

const n = (v) => Number(v) || 0;
const CELL_FT = 0.25; // floor raster: 3" cells
const GAP_FT = 3; // openings up to ~6' in the outline (doors, missed bits) are closed

export const BLOCKING_KINDS = [
  { value: 'bath', label: 'Bathroom blocking' },
  { value: 'kitchen', label: 'Kitchen blocking' },
  { value: 'stair', label: 'Stair railing blocking' },
  { value: 'other', label: 'Other blocking' },
];
const BLOCKING_LABEL = Object.fromEntries(BLOCKING_KINDS.map((b) => [b.value, b.label]));

/**
 * Floor of a level from its exterior walls (raster, so small gaps and angled
 * walls are fine): area to the outside face of the walls, perimeter, and the
 * part within bandFt of the perimeter. Openings are rectangles in sheet pt.
 */
// the raster takes a few hundred ms on a big plan: keep each result for as long
// as the walls (an immutable array: any wall edit makes a new one), the scale,
// the floor openings and the band stay the same
const floorCache = new WeakMap();
export function floorOf(plan, { bandFt = 0 } = {}) {
  const walls = plan?.walls;
  if (!walls || typeof walls !== 'object') return floorOfNow(plan, { bandFt });
  let list = floorCache.get(walls);
  if (!list) { list = []; floorCache.set(walls, list); }
  const hit = list.find((e) => e.k === plan.ptPerFt && e.openings === plan.floorOpenings && e.bandFt === bandFt);
  if (hit) return hit.result;
  const result = floorOfNow(plan, { bandFt });
  list.push({ k: plan.ptPerFt, openings: plan.floorOpenings, bandFt, result });
  if (list.length > 4) list.shift();
  return result;
}

function floorOfNow(plan, { bandFt = 0 } = {}) {
  const k = n(plan?.ptPerFt);
  // every wall is a barrier: the outside stops at the outermost walls whatever their type
  const ext = (plan?.walls || []).filter((w) => normWall(w).kind === 'exterior');
  if (!k || ext.length < 3) return null;
  const barrier = plan.walls;
  const cell = CELL_FT * k;
  const xs = barrier.flatMap((w) => [w.x1, w.x2]), ys = barrier.flatMap((w) => [w.y1, w.y2]);
  const pad = (GAP_FT + 2) * k;
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  const W = Math.ceil((Math.max(...xs) + pad - x0) / cell), H = Math.ceil((Math.max(...ys) + pad - y0) / cell);
  if (W * H > 6e6) return null;
  const wall = new Uint8Array(W * H);
  const gapPt = GAP_FT * k;
  // each wall stamps a capsule (its centre line widened by half its thickness
  // plus the gap): every cell of its box within reach of the segment
  for (const w of barrier) {
    const r = ((n(w.t) || 6) / 12) * k / 2 + gapPt;
    const r2c = r * r;
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
    const L2 = dx * dx + dy * dy;
    const X0 = Math.max(0, Math.floor((Math.min(w.x1, w.x2) - r - x0) / cell));
    const X1 = Math.min(W - 1, Math.floor((Math.max(w.x1, w.x2) + r - x0) / cell));
    const Y0 = Math.max(0, Math.floor((Math.min(w.y1, w.y2) - r - y0) / cell));
    const Y1 = Math.min(H - 1, Math.floor((Math.max(w.y1, w.y2) + r - y0) / cell));
    for (let Y = Y0; Y <= Y1; Y += 1) {
      const py = y0 + Y * cell;
      for (let X = X0; X <= X1; X += 1) {
        const px = x0 + X * cell;
        let t = L2 ? ((px - w.x1) * dx + (py - w.y1) * dy) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - (w.x1 + dx * t), ey = py - (w.y1 + dy * t);
        if (ex * ex + ey * ey <= r2c) wall[Y * W + X] = 1;
      }
    }
  }
  // distance (in cells) from the outside: flood the outside first, then step
  // inward (typed-array queues, neighbours inline: this runs over every cell)
  const N = W * H;
  const dist = new Int32Array(N).fill(-1);
  const queue = new Int32Array(N);
  let qEnd = 0;
  const seed = (i) => { if (!wall[i] && dist[i] < 0) { dist[i] = 0; queue[qEnd++] = i; } };
  for (let X = 0; X < W; X += 1) { seed(X); seed((H - 1) * W + X); }
  for (let Y = 0; Y < H; Y += 1) { seed(Y * W); seed(Y * W + W - 1); }
  for (let q = 0; q < qEnd; q += 1) {
    const i = queue[q], X = i % W;
    if (X > 0) seed(i - 1);
    if (X < W - 1) seed(i + 1);
    if (i >= W) seed(i - W);
    if (i < N - W) seed(i + W);
  }
  // everything else is building (walls + inside); give it its distance to the outside
  let head = 0;
  let tail = qEnd;
  const step = (j, d) => { if (dist[j] < 0) { dist[j] = d; queue[tail++] = j; } };
  while (head < tail) {
    const i = queue[head++], X = i % W, d = dist[i] + 1;
    if (X > 0) step(i - 1, d);
    if (X < W - 1) step(i + 1, d);
    if (i >= W) step(i - W, d);
    if (i < N - W) step(i + W, d);
  }
  // the outer GAP_FT of the building is the gap-closing pad, not floor
  const padCells = Math.round(GAP_FT / CELL_FT);
  const bandCells = padCells + Math.round(n(bandFt) / CELL_FT);
  const holes = (plan.floorOpenings || []).map((o) => ({
    a: Math.floor((Math.min(o.x1, o.x2) - x0) / cell), b: Math.ceil((Math.max(o.x1, o.x2) - x0) / cell),
    c: Math.floor((Math.min(o.y1, o.y2) - y0) / cell), e: Math.ceil((Math.max(o.y1, o.y2) - y0) / cell),
  }));
  const inHole = (X, Y) => holes.some((h) => X >= h.a && X < h.b && Y >= h.c && Y < h.e);
  let floor = 0, band = 0, edges = 0, openings = 0;
  const isFloor = (i) => dist[i] > padCells;
  for (let i = 0; i < N; i += 1) {
    if (!isFloor(i)) continue;
    const X = i % W, Y = (i / W) | 0;
    if (X > 0 && !isFloor(i - 1)) edges += 1;
    if (X < W - 1 && !isFloor(i + 1)) edges += 1;
    if (i >= W && !isFloor(i - W)) edges += 1;
    if (i < N - W && !isFloor(i + W)) edges += 1;
    if (inHole(X, Y)) { openings += 1; continue; }
    floor += 1;
    if (bandFt > 0 && dist[i] <= bandCells) band += 1;
  }
  const a = CELL_FT * CELL_FT;
  const perimeter = edges * CELL_FT;
  // the raster puts the outer edge about half a cell out: take that strip off
  const strip = (perimeter * CELL_FT) / 2;
  return {
    areaSqFt: Math.round(floor * a - strip),
    bandSqFt: Math.round(band * a - (bandFt > 0 ? strip : 0)),
    fieldSqFt: Math.round((floor - band) * a),
    openingsSqFt: Math.round(openings * a),
    perimeterLF: Math.round(perimeter - 4 * CELL_FT),
  };
}

/**
 * Windows of a plan for their flashing: blocking all around each rough opening,
 * and the flashing tape over it, lapping 6" past each corner on every side.
 * Height: the window's own, else its type's (W1…), else 48".
 */
export function windowFlashing(plan) {
  const types = new Map((plan?.openingTypes || []).map((t) => [t.id, t]));
  let count = 0, blockingIn = 0, tapeIn = 0;
  for (const w of plan?.walls || []) {
    for (const o of w.openings || []) {
      if (o.type === 'door') continue;
      const t = types.get(o.typeId);
      const wIn = n(o.widthFt) * 12;
      const hIn = n(o.heightIn) || n(t?.heightIn) || 48;
      if (!wIn) continue;
      count += 1;
      blockingIn += 2 * (wIn + hIn);
      tapeIn += 2 * (wIn + 12) + 2 * (hIn + 12);
    }
  }
  return { count, blockingLF: Math.round((blockingIn / 12) * 10) / 10, tapeLF: Math.round((tapeIn / 12) * 10) / 10 };
}

/** Blocking drawn on the plan, LF by kind. */
export function blockingOf(plan) {
  const k = n(plan?.ptPerFt);
  const out = {};
  if (!k) return out;
  for (const b of plan.blocking || []) out[b.kind || 'other'] = (out[b.kind || 'other'] || 0) + Math.hypot(b.x2 - b.x1, b.y2 - b.y1) / k;
  return out;
}

/** LF of walls on concrete that get foam sealer and PT sill plates (exterior, bearing, shear), by stud size. */
export function sillOf(plan) {
  const k = n(plan?.ptPerFt);
  const bySize = {};
  let total = 0;
  for (const w of plan?.walls || []) {
    const L = wallLengthFt(w, k);
    for (const p of wallParts(w)) {
      if (!['exterior', 'bearing', 'shear'].includes(p.kind)) continue;
      bySize[p.size] = (bySize[p.size] || 0) + L;
      total += L;
    }
  }
  for (const s of Object.keys(bySize)) bySize[s] = Math.round(bySize[s]);
  return { totalLF: Math.round(total), bySize };
}

/** Does this level sit on concrete? Set in Plan takeoff; by default the first level does. */
export const onConcrete = (level, index) => (level?.plan?.onConcrete ?? index === 0);

const row = (prev, base) => ({ ...(prev || { item: null, notes: '', inputs: {} }), ...base, inputs: { ...(prev?.inputs || {}), ...(base.inputs || {}) } });

// level-template rows a plan row can take over (keeping the item picked), when
// the user has not typed a quantity in them
const TAKEOVER = { subfloor: 'Subfloor', glue: 'Glue', rim: 'Rimboard' };
const hasQty = (r) => n(r.inputs?.area) > 0 || n(r.inputs?.lengthLF) > 0 || n(r.qty) > 0;
const isLevel = (s) => s && (s.kind === 'level' || (!s.kind && /level/i.test(String(s.name || ''))));

/** Keep Loose material in step with the plans: each plan level writes its
 *  rows (floor, rimboard, blocking, hardware) into its own level section of
 *  Loose material, so loose material stays apart from Wall panels. */
export function withPlanLoose(est) {
  const levels = (est.levels || []).filter(Boolean);
  let list = (est.looseList || []).slice();
  let changed = false;

  levels.forEach((level, li) => {
    const plan = level.plan;
    // rows of the former separate "Plan · level" section move into the level section
    const oldIdx = list.findIndex((s) => s.id === `loose-hw-${level.id}`);
    const old = oldIdx >= 0 ? list[oldIdx] : null;
    if (old) { list.splice(oldIdx, 1); changed = true; }

    // the level section: the one bound to this level, else the li-th free level section
    let idx = list.findIndex((s) => s.planLevel === level.id);
    if (idx < 0) {
      const taken = new Set(levels.map((l) => l.id));
      idx = list.findIndex((s) => isLevel(s) && !(s.planLevel && taken.has(s.planLevel)));
    }
    const prev = idx >= 0 ? list[idx] : null;
    const prevAll = [...(prev?.rows || []), ...(old?.rows || []).filter((r) => r.planLoose || r.planHw)];
    const prevRows = new Map(prevAll.filter((r) => r.planLoose || r.planHw).map((r) => [r.planLoose || `hw:${r.planHw}`, r]));
    let manual = (prev?.rows || []).filter((r) => !r.planLoose && !r.planHw);
    const took = (key) => {
      if (prevRows.has(key) || !TAKEOVER[key]) return prevRows.get(key);
      const i = manual.findIndex((r) => r.type === TAKEOVER[key] && !hasQty(r));
      if (i < 0) return undefined;
      const r = manual[i];
      manual = manual.filter((_, j) => j !== i);
      return r;
    };

    const rows = [];
    if (plan?.walls?.length && plan.linked) {
      const bandFt = plan.frtBand ? n(plan.frtBandFt) || 4 : 0;
      const fl = floorOf(plan, { bandFt });
      if (fl) {
        const sub = (key, type, area, fam) => {
          const p0 = took(key);
          rows.push(row(p0, {
            id: p0?.id || `pl-${level.id}-${key}`, type, planLoose: key, wastePct: p0?.wastePct ?? 5,
            inputs: { area }, defaultFamily: fam[0], defaultSize: fam[1], defaultVendor: fam[2],
            plan: key === 'subfloor' ? `${fl.areaSqFt} sq ft floor${fl.openingsSqFt ? ` less ${fl.openingsSqFt} sq ft openings` : ''}${bandFt ? `, ${bandFt}' FRT band apart` : ''}` : `${bandFt}' band along the exterior walls`,
          }));
        };
        sub('subfloor', 'Subfloor', bandFt ? fl.fieldSqFt : fl.areaSqFt, ['OSB T&G', `4x8'-3/4"`, 'Gillies & Prittie Warehouse']);
        if (bandFt) sub('subfloorFRT', 'Subfloor · FRT perimeter', fl.bandSqFt, ['OSB T&G', `4x8'-3/4"`, 'Gillies & Prittie Warehouse']);
        const g = took('glue');
        rows.push(row(g, { id: g?.id || `pl-${level.id}-glue`, type: 'Glue', planLoose: 'glue', wastePct: g?.wastePct ?? 5, defaultFamily: 'Construction Adhesive', defaultSize: '28oz-ea', defaultVendor: 'Gillies & Prittie Warehouse', plan: 'from the subfloor sheets' }));
        const rb = took('rim');
        rows.push(row(rb, { id: rb?.id || `pl-${level.id}-rim`, type: 'Rimboard', planLoose: 'rim', wastePct: rb?.wastePct ?? 5, inputs: { lengthLF: fl.perimeterLF }, defaultFamily: 'SPF#2', defaultSize: `2x4"-16'`, defaultVendor: 'Gillies & Prittie Warehouse', plan: `${fl.perimeterLF} LF perimeter` }));
      }
      const bl = blockingOf(plan);
      for (const b of BLOCKING_KINDS) {
        const lf = Math.round((bl[b.value] || 0) * 10) / 10;
        if (!lf) continue;
        const key = `blk:${b.value}`;
        const p0 = prevRows.get(key);
        rows.push(row(p0, { id: p0?.id || `pl-${level.id}-${key}`, type: `${b.label}`, planLoose: key, wastePct: p0?.wastePct ?? 10, inputs: { lengthLF: lf }, defaultFamily: 'SPF#2', defaultSize: `2x6"-8'`, defaultVendor: 'Gillies & Prittie Warehouse', plan: `${lf} LF drawn on the plan` }));
      }
    }
    // hardware (counted whether or not the plan is linked to Wall panels)
    if (plan?.hardwareTypes?.length) {
      const counts = hardwareCounts(plan);
      for (const t of plan.hardwareTypes) {
        const key = `hw:${t.id}`;
        const p0 = prevRows.get(key);
        rows.push(row(p0, { id: p0?.id || `hw-${level.id}-${t.id}`, type: `${t.id}${t.name ? ` · ${t.name}` : ''}`, planHw: t.id, qty: counts.get(t.id) || 0, wastePct: p0?.wastePct ?? 0, plan: describeRule(t) }));
      }
    }
    // beams of the structural sheet, one row per mark: the LF here, the material picked by hand
    for (const g of beamGroups(plan?.beams || [])) {
      const key = `beam:${g.key}`;
      const p0 = prevRows.get(key);
      rows.push(row(p0, {
        id: p0?.id || `bm-${level.id}-${g.key.replace(/\W+/g, '-')}`, type: `Beams · ${g.key}`, planLoose: key, wastePct: p0?.wastePct ?? 5,
        inputs: { lengthLF: Math.round(g.lengthFt * 100) / 100 }, defaultFamily: 'LVL',
        plan: `${g.count} beam${g.count === 1 ? '' : 's'} · ${Math.round(g.lengthFt * 10) / 10} LF · longest ${Math.round(g.longestFt * 10) / 10}'${g.unmeasured ? ` · ${g.unmeasured} not measured` : ''}`,
      }));
    }
    // a template row the plan took over and no longer fills goes back to manual
    const made = new Set(rows.map((r) => r.id));
    const released = (prev?.rows || []).filter((r) => r.planLoose && TAKEOVER[r.planLoose] && !made.has(r.id) && !String(r.id).startsWith('pl-'))
      .map(({ planLoose, defaultFamily, defaultSize, defaultVendor, plan: _p, ...r }) => ({ ...r, inputs: {} }));
    manual = [...released, ...manual, ...(old?.rows || []).filter((r) => !r.planLoose && !r.planHw)];

    if (!prev && !rows.length && !manual.length) return;
    const base = prev || { id: `loose-lvl-${level.id}`, name: level.name || `Level ${li + 1}`, collapsed: false, inputs: {}, sel: {}, waste: {}, kind: 'level' };
    const section = { ...base, planLevel: level.id, rows: [...rows, ...manual] };
    if (!prev && old) Object.assign(section, { sel: old.sel || {}, waste: old.waste || {}, ...(old.notes ? { notes: old.notes } : {}) });
    if (JSON.stringify(section) !== JSON.stringify(prev)) {
      changed = true;
      if (idx >= 0) list[idx] = section;
      else {
        const roof = list.findIndex((s) => s.kind === 'roof' || s.name === 'Roof');
        list.splice(roof >= 0 ? roof : list.length, 0, section);
      }
    }
  });

  // foundation: foam sealer and sill plates under the walls of the levels on concrete
  const fIdx = list.findIndex((s) => s.kind === 'foundation' || s.name === 'Foundation');
  if (fIdx >= 0) {
    let total = 0;
    const bySize = {};
    const from = [];
    levels.forEach((l, i) => {
      if (!l.plan?.walls?.length || !l.plan.linked || !onConcrete(l, i)) return;
      const s = sillOf(l.plan);
      total += s.totalLF;
      for (const [k2, v] of Object.entries(s.bySize)) bySize[k2] = (bySize[k2] || 0) + v;
      from.push(l.name || 'Level');
    });
    const f = list[fIdx];
    const inputs = { ...(f.inputs || {}) };
    if (from.length) Object.assign(inputs, { planFoamLF: total, planSillBySize: bySize, planFrom: from.join(', ') });
    else { delete inputs.planFoamLF; delete inputs.planSillBySize; delete inputs.planFrom; }
    if (JSON.stringify(inputs) !== JSON.stringify(f.inputs || {})) { list[fIdx] = { ...f, inputs }; changed = true; }
  }

  return changed ? { ...est, looseList: list } : est;
}

export { BLOCKING_LABEL };
