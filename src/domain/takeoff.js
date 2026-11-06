// src/domain/takeoff.js
// The takeoff list: every material of the estimate with its quantity, by level.
// Wall panels are split by wall type (exterior, bearing, shear, partition,
// knee); the loose material of each level (Loose material sections and the
// loose plates, blocking and nails of Wall panels) by what it is: hardware,
// beams and posts, stairs, floor framing and subfloor, blocking, plates,
// sheathing, roof, details. The same material used twice in a group is one line.
// Wall panels are what the shop builds and ships: studs, plates, blocking,
// headers, kings and jacks, posts in the wall, and the sheathing when it can go
// on in the shop (vertical sheets as tall as the panel). Horizontal sheathing,
// or panels taller than the sheets, are sheathed on site: their sheets ship
// loose. Sealer, hold-downs, tape and nails for the site are loose too.
// Prices come along (unit and total) for when the list shows them; the totals
// add up to the materials of Summary. Pure functions.

import { wallPanelsOf, looseOf, trussesOf, sectionKind, PANEL_NAIL_SEL_KEY } from './estimate';
import { scoped } from './scope';

const n = (v) => Number(v) || 0;
const r2 = (v) => Math.round(v * 100) / 100;

export const WALL_TYPES = [
  { key: 'exterior', label: 'Exterior walls' },
  { key: 'bearing', label: 'Interior bearing walls' },
  { key: 'shear', label: 'Shear walls' },
  { key: 'partition', label: 'Partition walls' },
  { key: 'knee', label: 'Knee walls' },
];

export const LOOSE_CATS = [
  { key: 'hardware', label: 'Hardware & fasteners' },
  { key: 'beams', label: 'Beams, headers & posts' },
  { key: 'stairs', label: 'Stairs' },
  { key: 'floor', label: 'Floor framing & subfloor' },
  { key: 'blocking', label: 'Blocking (bath, kitchen, railing, openings)' },
  { key: 'plates', label: 'Plates & sill' },
  { key: 'sheathing', label: 'Sheathing & wrap' },
  { key: 'roof', label: 'Roof' },
  { key: 'details', label: 'Details & other' },
];

// what a loose row is, from its type or label (first match wins)
const RULES = [
  ['hardware', /hanger|holdown|hold-down|hurricane|strap|\btie\b|clip|bolt|\bnut|washer|screw|nail|anchor|threaded rod|epoxy|post base|post cap|column cap|\bangle\b|glue|adhesive|caulk|tape|flashing|drive pin|sealer|\bhdu|\bats\b|simpson/i],
  ['blocking', /blocking/i],
  ['stairs', /stair|stringer|landing|tread|riser/i],
  ['beams', /beam|header|ledger|lally|column|\bpost\b|in wall post|lvl|psl/i],
  ['floor', /subfloor|joist|rim|ribbon/i],
  ['roof', /rafter|ridge|fascia|subfascia|eave|rake|outrigger|collar|truss bracing|roof|underlayment|ice ?& ?water|gable|cornice|trim/i],
  ['plates', /plate|stud|sill/i],
  ['sheathing', /sheathing|wrap|insulation|\bsip\b|zip/i],
];
export function looseCategory(text, { roof = false } = {}) {
  const t = String(text || '');
  if (RULES[0][1].test(t)) return 'hardware';
  for (const [key, re] of RULES.slice(1)) {
    if (roof && key !== 'blocking') return 'roof';
    if (re.test(t)) return key;
  }
  return roof ? 'roof' : 'details';
}

/** A material from a picked selection: "2x6\"-16' SPF#2". */
export function describe(sel, fallback = '') {
  const it = sel && sel.item ? sel.item : sel;
  const family = sel?.familyLabel || it?.familyDisplay || it?.raw?.familyDisplay || sel?.family || '';
  const size = sel?.sizeLabel || it?.sizeDisplay || it?.raw?.sizeDisplay || '';
  const name = [size, family].filter(Boolean).join(' ').trim();
  return { name: name || fallback, picked: Boolean(name) };
}

/** Longest side of a sheet from its size ("4x9'-7/16\"" → 9), 8 when unknown. */
export function sheetLengthFt(sel) {
  const it = sel && sel.item ? sel.item : sel;
  const size = String(sel?.sizeLabel || it?.sizeDisplay || '');
  const m = /(\d+(?:\.\d+)?)\s*['’]?\s*[x×]\s*(\d+(?:\.\d+)?)/i.exec(size);
  return m ? Math.max(Number(m[1]), Number(m[2])) : 8;
}

/**
 * Where a wall's sheathing goes: on the panels in the shop, or loose to the site.
 * mode 'auto': loose when the sheets go on horizontally, or the panel is taller than a sheet.
 */
export function sheathingShips({ mode = 'auto', horizontal = false, heightFt = 0, sheetFt = 8 }) {
  if (mode === 'panels' || mode === 'loose') return { where: mode, why: mode === 'loose' ? 'sheathed on site' : '' };
  if (horizontal) return { where: 'loose', why: 'horizontal sheets: sheathed on site' };
  if (n(heightFt) > n(sheetFt) + 0.01) return { where: 'loose', why: `${heightFt}' walls taller than the ${sheetFt}' sheets: sheathed on site` };
  return { where: 'panels', why: '' };
}

/** Lines of one group: rows merged by material and unit. */
function collect(entries) {
  const map = new Map();
  for (const e of entries) {
    const qty = n(e.row.qtyFinal);
    const total = n(e.row.subtotal);
    if (!qty && !total) continue;
    const d = describe(e.sel, e.row.desc || e.row.label || e.row.type || 'Item');
    const unit = e.row.unit || 'pcs';
    const key = `${d.picked ? d.name : `?${e.row.label || e.row.type}`}|${unit}`;
    const line = map.get(key) || { key, name: d.name, picked: d.picked, unit, qty: 0, total: 0, uses: new Set() };
    line.qty += qty;
    line.total += total;
    const use = e.row.desc || e.row.label || e.row.type;
    if (use && use !== d.name) line.uses.add(use);
    map.set(key, line);
  }
  return [...map.values()].map((l) => ({
    ...l, qty: r2(l.qty), total: r2(l.total), unitPrice: l.qty ? r2(l.total / l.qty) : 0, uses: [...l.uses],
  })).sort((a, b) => a.name.localeCompare(b.name));
}
const groupOf = (key, label, entries) => {
  const lines = collect(entries);
  return { key, label, lines, total: r2(lines.reduce((a, l) => a + l.total, 0)) };
};

/**
 * The takeoff list of a project.
 * @returns {{levels:Array<{id,name,wallPanels:Array,loose:Array,total}>, project:Array, total:number}}
 */
export function buildTakeoff(full = {}) {
  const est = scoped(full);
  const wp = wallPanelsOf(est);
  const loose = looseOf(est);
  const levels = (est.levels || []).filter(Boolean);
  const sheathMode = est.takeoff?.sheathing || 'auto';
  const horizontal = est.layout?.sheathing === 'horizontal';
  const out = levels.map((lvl, i) => ({ id: lvl.id || String(i), name: lvl.name || `Level ${i + 1}`, wall: new Map(), loose: new Map() }));
  const extra = { id: '__roof', name: 'Roof', wall: new Map(), loose: new Map() };
  const push = (map, key, entry) => { if (!map.has(key)) map.set(key, []); map.get(key).push(entry); };

  // wall panels: every section's rows under its wall type
  wp.levels.forEach((L, i) => {
    const lvl = levels[i] || {};
    const o = out[i];
    const secs = [...(lvl.exteriorSections || []), ...(lvl.interiorSections || [])].filter(Boolean);
    const byId = new Map(secs.map((s) => [s.id, s]));
    for (const c of [...L.exterior, ...L.interior]) {
      const sec = byId.get(c.id) || {};
      const sel = sec.sel || {};
      const type = c.kind || 'partition';
      // sheathing: on the panels, or loose to the site
      const ship = (sheetSel, row) => {
        const s0 = sheathingShips({ mode: sheathMode, horizontal, heightFt: n(sec.heightFt), sheetFt: sheetLengthFt(sheetSel) });
        if (s0.where === 'loose') push(o.loose, 'sheathing', { row: { ...row, label: `${row.label || row.type} · ${s0.why}` }, sel: sheetSel });
        else push(o.wall, type, { row, sel: sheetSel });
      };
      for (const r of c.baseRows || []) {
        if (r.key === 'sheathing') ship(sel[r.key], r);
        else push(o.wall, type, { row: r, sel: sel[r.key] });
      }
      for (const r of c.extraRows || []) {
        if (r.type === 'Extra sheathing') ship(r.item, { ...r, label: r.type });
        else push(o.wall, type, { row: { ...r, label: r.label || r.type }, sel: r.item });
      }
      if (c.infill) push(o.wall, type, { row: { ...c.infill, label: 'Headers infill' }, sel: c.infill.item });
      for (const r of c.openingRows || []) push(o.wall, type, { row: r, sel: sel.openStuds });
    }
    // loose plates, blocking and sheathing of the level's panels
    const lm = lvl.looseMaterials || {};
    for (const r of [...(L.loose.exteriorRows || []), ...(L.loose.interiorRows || [])]) {
      if (r.excluded) continue;
      push(o.loose, looseCategory(`${r.label} ${r.key}`), { row: r, sel: lm.sel?.[r.key] });
    }
    // panel nails, pins, epoxy, sealer
    const pn = lvl.panelNails || {};
    for (const r of L.panelNails.baseRows || []) push(o.loose, 'hardware', { row: r, sel: pn.sel?.[r.selKey || PANEL_NAIL_SEL_KEY?.[r.key]] });
    for (const r of L.panelNails.extraRows || []) push(o.loose, 'hardware', { row: { ...r, label: r.label || r.desc || 'Nails' }, sel: r.sel });
  });

  // Loose material sections: by the level they belong to
  const levelIndexOf = (sec, k) => {
    if (sec.planLevel) { const j = levels.findIndex((l) => l.id === sec.planLevel); if (j >= 0) return j; }
    const nm = String(sec.name || '').toLowerCase();
    const j = levels.findIndex((l) => l.name && nm.includes(String(l.name).toLowerCase()));
    if (j >= 0) return j;
    const m = /(\d+)/.exec(nm);
    return m ? Math.min(levels.length - 1, Math.max(0, Number(m[1]) - 1)) : k;
  };
  let lvlNo = 0;
  for (const sec of (est.looseList || []).filter(Boolean)) {
    const c = loose.byId[sec.id];
    if (!c || c.hidden) continue;
    const kind = sectionKind(sec);
    const roof = kind === 'roof';
    let target;
    if (roof) target = extra;
    else if (kind === 'foundation') target = out[0] || extra;
    else if (kind === 'level') { target = out[levelIndexOf(sec, lvlNo)] || out[out.length - 1] || extra; lvlNo += 1; } else target = out[levelIndexOf(sec, 0)] || extra;
    const sel = sec.sel || {};
    for (const r of c.calcRows || []) push(target.loose, looseCategory(`${r.label} ${r.key}`, { roof }), { row: r, sel: sel[r.key] });
    for (const r of c.manualRows || []) {
      const label = r.calcType === 'extra' ? (r.desc || 'Extra') : r.type;
      const cat = r.planHw ? 'hardware' : looseCategory(`${label} ${r.notes || ''}`, { roof });
      push(target.loose, cat, { row: { ...r, label }, sel: r.item });
    }
  }

  const finish = (o) => {
    const wallPanels = WALL_TYPES.filter((t) => o.wall.has(t.key)).map((t) => groupOf(t.key, t.label, o.wall.get(t.key))).filter((g) => g.lines.length);
    const lg = LOOSE_CATS.filter((t) => o.loose.has(t.key)).map((t) => groupOf(t.key, t.label, o.loose.get(t.key))).filter((g) => g.lines.length);
    const total = r2([...wallPanels, ...lg].reduce((a, g) => a + g.total, 0));
    return { id: o.id, name: o.name, wallPanels, loose: lg, total };
  };
  const levelsOut = [...out, extra].map(finish).filter((l) => l.wallPanels.length || l.loose.length);

  // the whole project: temporary bracing, trusses, panel manufacture
  const project = [];
  const br = wp.bracing;
  const brSel = est.bracing?.sel || {};
  const bracing = groupOf('bracing', 'Temporary bracing', (br.baseRows || []).map((r) => ({ row: r, sel: brSel[r.key] })));
  if (bracing.lines.length) project.push(bracing);
  const tr = trussesOf(est);
  const trussLines = [
    ...(est.trusses || []).filter((r) => n(r.amount ?? r.subtotal)).map((r, j) => ({ key: `t${j}`, name: r.label || 'Trusses', picked: true, unit: 'lot', qty: 1, total: r2(n(r.amount ?? r.subtotal)), unitPrice: r2(n(r.amount ?? r.subtotal)), uses: [] })),
    ...(tr.estimate.used ? tr.estimate.lines.filter((l) => l.amount).map((l) => ({ key: l.key, name: `${l.label} (estimate)`, picked: true, unit: 'sq ft', qty: l.areaSqFt, total: l.amount, unitPrice: l.rate, uses: [] })) : []),
  ];
  if (trussLines.length) project.push({ key: 'trusses', label: 'Trusses', lines: trussLines, total: r2(tr.total) });
  const mf = wp.manufacture;
  const mfLines = (mf.lines || []).filter((l) => n(l.total)).map((l) => ({
    key: l.key, name: l.label, picked: true, unit: l.isQtyBased ? 'pcs' : 'LF', qty: l.isQtyBased ? n(l.qty) : n(l.lf), total: r2(l.total), unitPrice: r2(l.ratePerLF), uses: [],
  }));
  if (mfLines.length) project.push({ key: 'manufacture', label: 'Panels manufacture', lines: mfLines, total: r2(mf.total) });

  const total = r2(levelsOut.reduce((a, l) => a + l.total, 0) + project.reduce((a, g) => a + g.total, 0));
  return { levels: levelsOut, project, total };
}

/** The list as CSV rows (for a spreadsheet). */
export function takeoffCsv(t, { prices = false } = {}) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Level', 'Group', 'For', 'Material', 'Qty', 'Unit', ...(prices ? ['Unit price', 'Total'] : [])];
  const rows = [head.map(q).join(',')];
  const add = (level, g) => {
    for (const l of g.lines) rows.push([level, g.label, l.picked ? l.uses.join('; ') : l.name, l.picked ? l.name : 'not picked', l.qty, l.unit, ...(prices ? [l.unitPrice, l.total] : [])].map(q).join(','));
  };
  for (const lv of t.levels) {
    for (const g of lv.wallPanels) add(lv.name, { ...g, label: `Wall panels · ${g.label}` });
    for (const g of lv.loose) add(lv.name, { ...g, label: `Loose · ${g.label}` });
  }
  for (const g of t.project) add('Project', g);
  return rows.join('\n');
}
