// src/domain/estimate/quote.js
// Wall-panels-only quote: one block per level broken down by category
// (exterior walls, interior walls, panel nails, loose materials), then
// temporary bracing and panels manufacture; tax and shipping as in Summary.
import { wallPanelsOf } from './index';
import { taxFor } from '../lib/tax';

const n = (v) => Number(v) || 0;
const round2 = (v) => Number((Number(v) || 0).toFixed(2));
const lf = (v) => `${Math.round(n(v)).toLocaleString('en-US')} LF`;

export function computeWallPanelsQuote(est = {}, { shipping } = {}) {
  const wp = wallPanelsOf(est);
  const levels = (est.levels || []).filter(Boolean);
  const nameOf = Object.fromEntries(levels.map((l) => [l.id, l.name || 'Level']));

  const groups = wp.levels.map((L) => {
    const lines = [
      { key: 'exterior', label: 'Exterior walls', detail: lf(L.derived.extLengthSum), amount: L.exteriorTotal },
      { key: 'interior', label: 'Interior walls', detail: lf(L.derived.int2x6LF + L.derived.int2x4LF), amount: L.interiorTotal },
      { key: 'nails', label: 'Panel nails & fasteners', detail: L.panelNails.onConcrete ? 'Incl. drive pins, epoxy and sill sealer' : '', amount: L.panelNails.total },
      { key: 'loose', label: 'Loose materials', detail: 'Loose plates, panel band, blocking', amount: L.loose.subtotal },
    ].filter((x) => n(x.amount) !== 0);
    return { id: L.id, title: nameOf[L.id] || 'Level', lines, subtotal: round2(L.total) };
  }).filter((g) => g.lines.length > 0);

  const panels = wp.manufacture.lines.filter((x) => !x.isQtyBased && x.key !== 'blocking2x10').reduce((s, x) => s + n(x.panels), 0);
  const panelLF = wp.manufacture.lines.filter((x) => !x.isQtyBased && x.key !== 'blocking2x10').reduce((s, x) => s + n(x.lf), 0);
  const general = [
    { key: 'bracing', label: 'Temporary bracing', detail: `${wp.bracing.panels.toLocaleString('en-US')} panels`, amount: wp.bracing.total },
    { key: 'manufacture', label: 'Panels manufacture', detail: `${panels.toLocaleString('en-US')} panels · ${lf(panelLF)}`, amount: wp.manufacture.total },
  ].filter((x) => n(x.amount) !== 0);

  const info = est.summaryInfo || {};
  const { state, rate, exempt } = taxFor(info);
  const subtotal = round2(wp.total);
  const tax = round2(subtotal * (rate / 100));
  const ship = round2(shipping ?? n(info.shipping));
  return { groups, general, subtotal, taxState: state, taxRate: rate, taxExempt: exempt, tax, shipping: ship, total: round2(subtotal + tax + ship) };
}
