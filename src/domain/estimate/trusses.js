// src/domain/estimate/trusses.js
// Trusses until the truss maker quotes them: a price per sq ft of the area
// they cover. Roof trusses cover the top level; floor trusses carry every level
// above the first (one level: roof trusses only). Areas come from the floor
// drawn on each level's plan (openings in), or are typed. Once the truss quote
// is typed on the Trusses page, the quote counts and this stays as a check.

import { floorOf } from '../plans/loose';

const n = (v) => Number(v) || 0;
const r2 = (v) => Math.round(v * 100) / 100;

export const TRUSS_DEFAULTS = { roofRate: 3.5, floorRate: 3.5 };

/** Floor area of each level, from its plan (openings in); 0 without a plan. */
export function levelAreas(est = {}) {
  return (est.levels || []).filter(Boolean).map((l, i) => {
    const level = l.name || `Level ${i + 1}`;
    if (!l.plan?.walls?.length || !n(l.plan.ptPerFt)) return { id: l.id || String(i), level, areaSqFt: 0 };
    try {
      const f = floorOf(l.plan);
      return { id: l.id || String(i), level, areaSqFt: Math.round(n(f.areaSqFt) + n(f.openingsSqFt)) };
    } catch { return { id: l.id || String(i), level, areaSqFt: 0 }; }
  });
}

/**
 * The trusses estimate of a project.
 * @returns {{lines:Array<{key,label,auto,areaSqFt,typed,rate,amount}>, total:number, used:boolean, mode:string}}
 */
export function trussEstimate(est = {}, quoteTotal = 0) {
  const te = est.trussEstimate || {};
  const areas = levelAreas(est);
  const typed = te.areas || {};
  const lines = [];
  const line = (key, label, auto, rate) => {
    const isTyped = typed[key] !== undefined && typed[key] !== null && typed[key] !== '';
    const area = isTyped ? n(typed[key]) : auto;
    lines.push({ key, label, auto, areaSqFt: area, typed: isTyped, rate, amount: r2(area * rate) });
  };
  const roofRate = te.roofRate ?? TRUSS_DEFAULTS.roofRate;
  const floorRate = te.floorRate ?? TRUSS_DEFAULTS.floorRate;
  if (areas.length) line('roof', `Roof trusses · over ${areas[areas.length - 1].level}`, areas[areas.length - 1].areaSqFt, n(roofRate));
  else line('roof', 'Roof trusses', 0, n(roofRate));
  areas.slice(1).forEach((a) => line(`floor|${a.id}`, `Floor trusses · ${a.level}`, a.areaSqFt, n(floorRate)));
  const total = r2(lines.reduce((s, x) => s + x.amount, 0));
  const mode = te.use || 'auto'; // auto: until the quote has amounts
  const used = mode === 'on' || (mode === 'auto' && !(quoteTotal > 0));
  return { lines, total, used, mode, roofRate: n(roofRate), floorRate: n(floorRate) };
}
