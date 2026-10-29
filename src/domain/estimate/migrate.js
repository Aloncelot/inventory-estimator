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

// Panel nails used to have rows sheath / frame8d / frame12d; the matching new rows keep
// their material, waste, notes and position.
const PANEL_ROW_RENAMES = { frame12d: 'framing', frame8d: 'bottomPlate' };
const renameKeys = (obj, map) => {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const nk = map[k] || k;
    if (out[nk] === undefined || nk === k) out[nk] = v;
  }
  return out;
};

function migratePanelNails(pn = {}) {
  const out = omit(pn, ['total']);
  if (out.waste) out.waste = renameKeys(out.waste, PANEL_ROW_RENAMES);
  if (out.notes) out.notes = renameKeys(out.notes, PANEL_ROW_RENAMES);
  if (Array.isArray(out.rowOrder)) out.rowOrder = out.rowOrder.map((k) => PANEL_ROW_RENAMES[k] || k);
  return out;
}

/**
 * "Nails & bracing (all levels)" was split: its nails moved into each level's
 * Panel nails, and temporary bracing moved to the new Bracing section.
 * Chosen materials, waste and notes are carried over.
 */
function splitNailsAndBracing(levels, nb) {
  if (!nb) return { levels, bracing: undefined };
  const sel = nb.sel || {};
  const waste = nb.waste || {};
  const notes = nb.notes || {};
  // old row key → new panel-nails row key (and its material slot)
  const moves = [
    ['nailsConcrete', 'drivePins', 'drivePins'],
    ['nailsSheathing', 'sheathLoose', 'nailsSheathLoose'],
    ['nailsFraming', 'topPlate', 'nailsTopPlate'],
  ];
  const next = levels.map((l, i) => {
    const pn = { ...(l.panelNails || {}) };
    pn.sel = { ...(pn.sel || {}) };
    pn.waste = { ...(pn.waste || {}) };
    pn.notes = { ...(pn.notes || {}) };
    for (const [oldKey, rowKey, selKey] of moves) {
      if (sel[oldKey] && !pn.sel[selKey]) pn.sel[selKey] = sel[oldKey];
      if (waste[oldKey] !== undefined && pn.waste[rowKey] === undefined) pn.waste[rowKey] = waste[oldKey];
      if (i === 0 && notes[oldKey] && !pn.notes[rowKey]) pn.notes[rowKey] = notes[oldKey];
    }
    // extra nail rows go to the first level
    if (i === 0 && (nb.extras || []).length) pn.extras = [...(pn.extras || []), ...nb.extras];
    return { ...l, panelNails: pn };
  });
  const bracing = {
    collapsed: nb.collapsed,
    sel: sel.tempBracing ? { panels: sel.tempBracing } : {},
    waste: waste.tempBracing !== undefined ? { panels: waste.tempBracing } : {},
    notes: notes.tempBracing ? { panels: notes.tempBracing } : {},
  };
  return { levels: next, bracing };
}

export function migrateEstimate(est = {}) {
  const out = { ...est };
  out.levels = (est.levels || []).filter(Boolean).map((l) => ({
    ...omit(l, ['total']),
    exteriorSections: (l.exteriorSections || []).filter(Boolean).map(migrateSection),
    interiorSections: (l.interiorSections || []).filter(Boolean).map(migrateSection),
    looseMaterials: omit(l.looseMaterials || {}, ['subtotal', 'generalStats']),
    panelNails: migratePanelNails(l.panelNails || {}),
  }));
  if (est.nailsAndBracing) {
    const split = splitNailsAndBracing(out.levels, est.nailsAndBracing);
    out.levels = split.levels;
    if (!est.bracing) out.bracing = split.bracing;
    delete out.nailsAndBracing;
  }
  if (est.manufactureEstimate) out.manufactureEstimate = omit(est.manufactureEstimate, ['total', 'panels']);
  if (est.looseList) out.looseList = est.looseList.filter(Boolean).map((s) => omit(s, ['subtotal']));
  return slimEstimate(out);
}
