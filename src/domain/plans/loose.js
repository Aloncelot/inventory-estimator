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
export function floorOf(plan, { bandFt = 0 } = {}) {
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
  for (const w of barrier) {
    const r = ((n(w.t) || 6) / 12) * k / 2 + gapPt;
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    const steps = Math.max(1, Math.ceil(L / (cell / 2)));
    const rc = Math.ceil(r / cell);
    for (let i = 0; i <= steps; i += 1) {
      const px = w.x1 + ((w.x2 - w.x1) * i) / steps, py = w.y1 + ((w.y2 - w.y1) * i) / steps;
      const cx = Math.floor((px - x0) / cell), cy = Math.floor((py - y0) / cell);
      for (let dy = -rc; dy <= rc; dy += 1) for (let dx = -rc; dx <= rc; dx += 1) {
        if ((dx * dx + dy * dy) * cell * cell > r * r) continue;
        const X = cx + dx, Y = cy + dy;
        if (X >= 0 && Y >= 0 && X < W && Y < H) wall[Y * W + X] = 1;
      }
    }
  }
  // distance (in cells) from the outside: flood the outside first, then step inward
  const dist = new Int32Array(W * H).fill(-1);
  let queue = [];
  for (let X = 0; X < W; X += 1) for (const Y of [0, H - 1]) if (!wall[Y * W + X] && dist[Y * W + X] < 0) { dist[Y * W + X] = 0; queue.push(Y * W + X); }
  for (let Y = 0; Y < H; Y += 1) for (const X of [0, W - 1]) if (!wall[Y * W + X] && dist[Y * W + X] < 0) { dist[Y * W + X] = 0; queue.push(Y * W + X); }
  const nb = (i) => { const X = i % W, Y = (i / W) | 0; const out = []; if (X > 0) out.push(i - 1); if (X < W - 1) out.push(i + 1); if (Y > 0) out.push(i - W); if (Y < H - 1) out.push(i + W); return out; };
  for (let q = 0; q < queue.length; q += 1) for (const j of nb(queue[q])) if (!wall[j] && dist[j] < 0) { dist[j] = 0; queue.push(j); }
  // everything else is building (walls + inside); give it its distance to the outside
  let front = queue;
  let d = 0;
  while (front.length) {
    d += 1;
    const next = [];
    for (const i of front) for (const j of nb(i)) if (dist[j] < 0) { dist[j] = d; next.push(j); }
    front = next;
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
  for (let i = 0; i < W * H; i += 1) {
    if (!isFloor(i)) continue;
    const X = i % W, Y = (i / W) | 0;
    for (const j of nb(i)) if (!isFloor(j)) edges += 1;
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
