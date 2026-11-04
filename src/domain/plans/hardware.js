// src/domain/plans/hardware.js
// Structural hardware from the plans (hold-downs, straps, anchors, clips…) as
// types H1, H2… Each type is counted one of three ways:
// - each:    placed on the walls by hand, where the structural plans show it;
// - ends:    a number at each end of every wall of the chosen wall types
//            (e.g. a hold-down at both ends of each shear wall);
// - spacing: along every wall of the chosen wall types at a spacing
//            (e.g. anchor bolts @ 32" o.c.), plus one at the end.
// The counts go to the "Plan · <level>" section of Loose material (loose.js),
// one row per type, where the item is picked. Pure functions.

import { groupKeysOf, wallLengthFt, groupLabel } from './sync';

const n = (v) => Number(v) || 0;

export const HW_RULES = [
  { value: 'each', label: 'Placed on walls' },
  { value: 'ends', label: 'At wall ends' },
  { value: 'spacing', label: 'Along walls @ spacing' },
  { value: 'shear', label: 'Along shear walls' },
];

export const SHEAR_TYPES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** Length of shear wall of each type (ft), from the shear tags on the walls. */
export function shearLengths(plan) {
  const out = new Map();
  for (const w of plan?.walls || []) {
    for (const s of w.shear || []) {
      const L = n(s.lengthFt) || wallLengthFt(w, n(plan.ptPerFt));
      out.set(s.type, (out.get(s.type) || 0) + L);
    }
  }
  return out;
}

/** Pieces along the shear walls at each type's spacing: ceil(L / spacing) + 1 per tag. */
export function shearCount(plan, spacingByType = {}) {
  let c = 0;
  for (const w of plan?.walls || []) {
    for (const s of w.shear || []) {
      const sp = n(spacingByType[s.type]);
      if (sp <= 0) continue;
      const L = (n(s.lengthFt) || wallLengthFt(w, n(plan.ptPerFt))) * 12;
      if (L > 0) c += Math.ceil(L / sp) + 1;
    }
  }
  return c;
}

export function newHardwareType(types = []) {
  const num = Math.max(0, ...types.map((t) => Number(String(t.id).replace(/^\D+/, '')) || 0)) + 1;
  return { id: `H${num}`, name: '', rule: 'each', perEnd: 1, spacingIn: 32, groups: [] };
}

/** How many of each hardware type a plan needs. */
export function hardwareCounts(plan) {
  const k = n(plan?.ptPerFt);
  const out = new Map();
  for (const t of plan?.hardwareTypes || []) {
    let c = 0;
    const groups = new Set(t.groups || []);
    if (t.rule === 'shear') c += shearCount(plan, t.byType || {});
    for (const w of plan.walls || []) {
      c += (w.hardware || []).filter((h) => h.typeId === t.id).length;
      if (t.rule === 'each' || t.rule === 'shear' || !groupKeysOf(w).some((g) => groups.has(g))) continue;
      if (t.rule === 'ends') c += 2 * Math.max(0, n(t.perEnd) || 1);
      if (t.rule === 'spacing') {
        const L = wallLengthFt(w, k) * 12;
        const sp = Math.max(4, n(t.spacingIn) || 32);
        if (L > 0) c += Math.ceil(L / sp) + 1;
      }
    }
    out.set(t.id, c);
  }
  return out;
}

export const describeRule = (t) => (t.rule === 'shear'
  ? `along shear walls: ${Object.entries(t.byType || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k} @ ${v}"`).join(', ') || '—'}`
  : t.rule === 'ends'
  ? `${n(t.perEnd) || 1} at each end of ${(t.groups || []).map(groupLabel).join(', ') || '—'}`
  : t.rule === 'spacing'
    ? `@ ${n(t.spacingIn) || 32}" along ${(t.groups || []).map(groupLabel).join(', ') || '—'}`
    : 'placed on the walls');
