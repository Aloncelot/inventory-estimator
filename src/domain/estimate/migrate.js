// src/domain/estimate/migrate.js
// Clean a saved estimate: totals and stats used to be stored by the views,
// now they are calculated (see ./index.js), so stored copies are dropped.
// Prices are slimmed to the fields the estimate uses (see slimEstimate).

import { slimEstimate } from '../lib/selection';

const SECTION_STATS = [
  'zipSheetsFinal', 'panelSheets', 'platePieces', 'bottomPlatePiecesPanel', 'ptLF', 'groupSubtotal',
  'bottomBoardLenFt', 'panelPtBoards', 'wallKind', 'isShear', 'isBearing', 'isPartition', 'isKnee',
];

const omit = (obj, keys) => {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
};

/** "Headers infill" used to be an extra row added by an effect; it is now automatic. */
function migrateSection(s) {
  if (!s) return s;
  const out = omit(s, SECTION_STATS);
  const infill = (out.extras || []).find((r) => r?.type === 'Headers infill');
  if (infill) {
    out.extras = out.extras.filter((r) => r?.type !== 'Headers infill');
    if (out.sel?.headersInfill === undefined && infill.item) out.sel = { ...(out.sel || {}), headersInfill: infill.item };
    if (out.waste?.headersInfill === undefined && infill.wastePct !== undefined) out.waste = { ...(out.waste || {}), headersInfill: infill.wastePct };
  }
  return out;
}

export function migrateEstimate(est = {}) {
  const out = { ...est };
  out.levels = (est.levels || []).filter(Boolean).map((l) => ({
    ...omit(l, ['total']),
    exteriorSections: (l.exteriorSections || []).filter(Boolean).map(migrateSection),
    interiorSections: (l.interiorSections || []).filter(Boolean).map(migrateSection),
    looseMaterials: omit(l.looseMaterials || {}, ['subtotal', 'generalStats']),
    panelNails: omit(l.panelNails || {}, ['total']),
  }));
  if (est.nailsAndBracing) out.nailsAndBracing = omit(est.nailsAndBracing, ['total']);
  if (est.manufactureEstimate) out.manufactureEstimate = omit(est.manufactureEstimate, ['total', 'panels']);
  if (est.looseList) out.looseList = est.looseList.filter(Boolean).map((s) => omit(s, ['subtotal']));
  return slimEstimate(out);
}
