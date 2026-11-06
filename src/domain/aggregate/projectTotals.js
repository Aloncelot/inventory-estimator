// src/domain/aggregate/projectTotals.js
// Category totals for Summary and page headers, calculated from the estimate
// data itself (see src/domain/estimate). Nothing depends on which views were open.
import { wallPanelsOf, looseOf, trussesOf, projectOf } from '../estimate';
import { laborTotal } from '../labor';
import { scoped, scopeOf } from '../scope';

export const wallPanelsTotal = (est = {}) => wallPanelsOf(est).total;
export const trussesTotal = (est = {}) => trussesOf(est).total;
export const looseTotal = (est = {}) => looseOf(est).total;
/**
 * Totals of the project: materials (wall panels, loose material, trusses) and
 * labor (by time or per sq ft, as the Labor page says). Sales tax goes on the
 * materials; on labor too only when Summary says so.
 */
export function projectTotals(full = {}) {
  // only what the scope covers
  const est = scoped(full);
  const p = projectOf(est);
  const lab = scopeOf(full).labor ? laborTotal(est) : { by: 'time', amount: 0, hours: 0 };
  const labor = Math.round(lab.amount * 100) / 100;
  return { ...p, materials: p.subtotal, labor, laborBy: lab.by, laborHours: lab.hours, subtotal: Math.round((p.subtotal + labor) * 100) / 100 };
}
