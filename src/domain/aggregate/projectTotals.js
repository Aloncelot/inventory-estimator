// src/domain/aggregate/projectTotals.js
// Category totals for Summary and page headers, calculated from the estimate
// data itself (see src/domain/estimate). Nothing depends on which views were open.
import { wallPanelsOf, looseOf, trussesOf, projectOf } from '../estimate';
import { laborTotal } from '../labor';
import { scoped, scopeOf } from '../scope';
import { materialMarkupOf, bufferPctOf } from '../markup';

export const wallPanelsTotal = (est = {}) => wallPanelsOf(est).total;
export const trussesTotal = (est = {}) => trussesOf(est).total;
export const looseTotal = (est = {}) => looseOf(est).total;
/**
 * Totals of the project. Wall panels and loose material include their error
 * buffer (src/domain/markup.js: a % of the materials at cost, for what the
 * takeoff misses); trusses at cost. The material markup is its own line, on
 * the wall panel materials and loose material with their buffer. Labor as the
 * Labor page says. Sales tax goes on the materials (with buffer and markup);
 * on labor too only when Summary says so.
 * @param {object} opts markupDefault: the company's default % for a project without its own
 */
export function projectTotals(full = {}, { markupDefault = 0 } = {}) {
  // only what the scope covers
  const est = scoped(full);
  const p = projectOf(est);
  const wp = wallPanelsOf(est);
  // the materials: not panel manufacture or trucking (charges, no buffer or markup)
  const wpMaterials = round2(p.wallPanels - wp.manufacture.total - wp.trucking.total);
  const wallPanelsBufferPct = bufferPctOf(full, 'wallPanels');
  const looseBufferPct = bufferPctOf(full, 'loose');
  const wallPanelsBuffer = round2(wpMaterials * wallPanelsBufferPct / 100);
  const looseBuffer = round2(p.loose * looseBufferPct / 100);
  const wallPanels = round2(p.wallPanels + wallPanelsBuffer);
  const loose = round2(p.loose + looseBuffer);
  const markupPct = materialMarkupOf(full, markupDefault);
  const markupBase = round2(wpMaterials + wallPanelsBuffer + loose);
  const markup = round2(markupBase * markupPct / 100);
  const lab = scopeOf(full).labor ? laborTotal(est) : { by: 'time', amount: 0, hours: 0 };
  const labor = round2(lab.amount);
  const materials = round2(wallPanels + loose + p.trusses + markup);
  return {
    ...p, wallPanels, loose,
    wallPanelsCost: p.wallPanels, looseCost: p.loose,
    wallPanelsBufferPct, wallPanelsBuffer, looseBufferPct, looseBuffer, buffer: round2(wallPanelsBuffer + looseBuffer),
    markupPct, markupBase, markup, materials,
    labor, laborBy: lab.by, laborHours: lab.hours, subtotal: round2(materials + labor),
  };
}

function round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }
