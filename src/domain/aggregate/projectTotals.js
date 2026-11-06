// src/domain/aggregate/projectTotals.js
// Category totals for Summary and page headers, calculated from the estimate
// data itself (see src/domain/estimate). Nothing depends on which views were open.
import { wallPanelsOf, looseOf, trussesOf, projectOf } from '../estimate';
import { laborTotal } from '../labor';
import { scoped, scopeOf } from '../scope';
import { materialMarkupOf } from '../markup';

export const wallPanelsTotal = (est = {}) => wallPanelsOf(est).total;
export const trussesTotal = (est = {}) => trussesOf(est).total;
export const looseTotal = (est = {}) => looseOf(est).total;
/**
 * Totals of the project. Wall panels, loose material and trusses are at cost;
 * the material markup (src/domain/markup.js) is its own line, on the wall
 * panel materials and loose material. Labor as the Labor page says. Sales tax
 * goes on the materials (with their markup); on labor too only when Summary says so.
 * @param {object} opts markupDefault: the company's default % for a project without its own
 */
export function projectTotals(full = {}, { markupDefault = 0 } = {}) {
  // only what the scope covers
  const est = scoped(full);
  const p = projectOf(est);
  const wp = wallPanelsOf(est);
  const markupPct = materialMarkupOf(full, markupDefault);
  const markupBase = round2(p.wallPanels - wp.manufacture.total + p.loose);
  const markup = round2(markupBase * markupPct / 100);
  const lab = scopeOf(full).labor ? laborTotal(est) : { by: 'time', amount: 0, hours: 0 };
  const labor = round2(lab.amount);
  const materials = round2(p.subtotal + markup);
  return {
    ...p, markupPct, markupBase, markup, materials,
    labor, laborBy: lab.by, laborHours: lab.hours, subtotal: round2(materials + labor),
  };
}

function round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }
