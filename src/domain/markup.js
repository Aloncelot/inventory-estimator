// src/domain/markup.js
// The markup on materials belongs to the estimate, not to the price list: the
// price list holds what suppliers charge, every estimate page works in cost,
// and Summary and the Quote add the project's material markup.
//   - it applies to the materials priced from the list: wall panel materials
//     (walls, nails, loose plates, bracing) and loose material
//   - not to panel manufacture (already a rate the company charges), trusses
//     (the truss maker's quote) or labor (with its own markup on the Labor page)
// Each project keeps its own %; a new project starts from the company default.

const n = (v) => Number(v) || 0;
const round2 = (v) => Math.round(n(v) * 100) / 100;

/** The project's material markup %, or the company default while it has none. */
export function materialMarkupOf(est = {}, companyDefault = 0) {
  const v = est?.summaryInfo?.materialMarkupPct;
  return v === undefined || v === null || v === '' ? Math.max(0, n(companyDefault)) : Math.max(0, n(v));
}

export const markupFactor = (pct) => 1 + Math.max(0, n(pct)) / 100;

/** What a material cost becomes on the quote. */
export const withMaterialMarkup = (cost, pct) => round2(n(cost) * markupFactor(pct));

/* ── error buffer ──────────────────────────────────────────────────────
   A contingency on the materials for what a takeoff misses (one item less is
   thousands of dollars). Its own % for wall panels and for loose material,
   10% unless the project says otherwise; on the materials at cost (not panel
   manufacture), before the markup. */
export const BUFFER_DEFAULT_PCT = 10;
/** key: 'wallPanels' | 'loose' */
export function bufferPctOf(est = {}, key) {
  const v = est?.buffers?.[key];
  return v === undefined || v === null || v === '' ? BUFFER_DEFAULT_PCT : Math.max(0, n(v));
}
