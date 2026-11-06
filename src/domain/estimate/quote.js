// src/domain/estimate/quote.js
// The client quote: every part of the estimate the quote includes, as blocks.
//   - Wall panels: per level, each wall type (LF), the panel nails and the
//     loose plates and blocking; then temporary bracing and panel manufacture.
//   - Loose material: each Loose material section (foundation, floors, roof…).
//   - Trusses: the truss maker's quote, or the estimate per sq ft.
//   - Labor: by time (by kind of work) or per sq ft, as the Labor page says.
// 'detail' shows those lines; 'summary' one line per block. Tax as in Summary:
// on the materials, on labor too when ticked. Pure functions.
import { wallPanelsOf, looseOf, trussesOf, sectionKind } from './index';
import { computeLabor } from '../labor';
import { taxFor } from '../lib/tax';
import { scoped, scopeOf } from '../scope';
import { materialMarkupOf, markupFactor } from '../markup';

const n = (v) => Number(v) || 0;
const round2 = (v) => Number((Number(v) || 0).toFixed(2));
const lf = (v) => `${Math.round(n(v)).toLocaleString('en-US')} LF`;
const num = (v) => Math.round(n(v)).toLocaleString('en-US');

export const QUOTE_PARTS = [
  { key: 'wallPanels', label: 'Wall panels' },
  { key: 'loose', label: 'Loose material' },
  { key: 'trusses', label: 'Trusses' },
  { key: 'labor', label: 'Labor' },
];
const KIND_LABEL = { exterior: 'Exterior walls', bearing: 'Interior bearing walls', shear: 'Shear walls', partition: 'Partition walls', knee: 'Knee walls' };
const KIND_ORDER = ['exterior', 'bearing', 'shear', 'partition', 'knee'];

// the client sees prices with the material markup in them, never the markup itself
function wallPanelsBlock(est, f = 1) {
  const wp = wallPanelsOf(est);
  const levels = (est.levels || []).filter(Boolean);
  const nameOf = Object.fromEntries(levels.map((l, i) => [l.id, l.name || `Level ${i + 1}`]));
  const groups = wp.levels.map((L) => {
    const byKind = new Map();
    for (const c of [...L.exterior, ...L.interior]) {
      const k = c.kind || 'partition';
      const g = byKind.get(k) || { amount: 0, lf: 0 };
      g.amount += n(c.subtotal) * f; g.lf += n(c.stats?.lengthLF);
      byKind.set(k, g);
    }
    const lines = [
      ...KIND_ORDER.filter((k) => byKind.has(k)).map((k) => ({ key: k, label: KIND_LABEL[k], detail: lf(byKind.get(k).lf), amount: round2(byKind.get(k).amount) })),
      { key: 'nails', label: 'Panel nails & fasteners', detail: L.panelNails.onConcrete ? 'Incl. drive pins and epoxy' : '', amount: round2(L.panelNails.total * f) },
      { key: 'loosePanel', label: 'Loose plates, band & blocking', detail: '', amount: round2(L.loose.subtotal * f) },
    ].filter((x) => n(x.amount) !== 0);
    return { id: L.id, title: nameOf[L.id] || 'Level', lines, subtotal: round2(L.total * f) };
  }).filter((g) => g.lines.length > 0);
  const mfLines = wp.manufacture.lines.filter((x) => !x.isQtyBased && x.key !== 'blocking2x10');
  const panels = mfLines.reduce((s, x) => s + n(x.panels), 0);
  const panelLF = mfLines.reduce((s, x) => s + n(x.lf), 0);
  const general = [
    { key: 'bracing', label: 'Temporary bracing', detail: `${num(wp.bracing.panels)} panels`, amount: round2(wp.bracing.total * f) },
    { key: 'manufacture', label: 'Panels manufacture', detail: `${num(panels)} panels · ${lf(panelLF)}`, amount: round2(wp.manufacture.total) },
  ].filter((x) => n(x.amount) !== 0);
  if (general.length) groups.push({ id: 'wp-all', title: 'All levels', lines: general, subtotal: round2(general.reduce((a, x) => a + x.amount, 0)) });
  const total = round2((wp.total - wp.manufacture.total) * f + wp.manufacture.total);
  return { key: 'wallPanels', title: 'Wall panels', groups, total, material: true };
}

function looseBlock(est, f = 1) {
  const loose = looseOf(est);
  const lines = (est.looseList || []).filter(Boolean).map((sec) => {
    const c = loose.byId[sec.id];
    if (!c || c.hidden || !n(c.subtotal)) return null;
    const kind = sectionKind(sec);
    const rows = [...(c.calcRows || []), ...(c.manualRows || [])].filter((r) => n(r.qtyFinal));
    return { key: sec.id, label: sec.name || (kind === 'roof' ? 'Roof' : 'Loose material'), detail: `${rows.length} item${rows.length === 1 ? '' : 's'}`, amount: round2(c.subtotal * f) };
  }).filter(Boolean);
  const total = round2(loose.total * f);
  return { key: 'loose', title: 'Loose material', groups: lines.length ? [{ id: 'loose', title: '', lines, subtotal: total }] : [], total, material: true };
}

function trussesBlock(est) {
  const tr = trussesOf(est);
  const lines = [
    ...(est.trusses || []).filter((r) => n(r.amount ?? r.subtotal)).map((r, i) => ({ key: `t${i}`, label: r.label || 'Trusses', detail: 'Per the truss quote', amount: round2(n(r.amount ?? r.subtotal)) })),
    ...(tr.estimate.used ? tr.estimate.lines.filter((l) => l.amount).map((l) => ({ key: l.key, label: l.label, detail: `${num(l.areaSqFt)} sq ft · allowance`, amount: l.amount })) : []),
  ];
  return { key: 'trusses', title: 'Trusses', groups: lines.length ? [{ id: 'trusses', title: '', lines, subtotal: round2(tr.total) }] : [], total: round2(tr.total), material: true };
}

function laborBlock(est) {
  const { tasks, totals: T, settings: s } = computeLabor(est);
  const bySqft = s.priceBy === 'sqft';
  let lines;
  if (bySqft) {
    lines = T.sqftBill ? [{ key: 'sqft', label: 'Framing labor', detail: `${num(T.areaSqFt)} sq ft`, amount: T.sqftBill }] : [];
  } else {
    // by kind of work, each billed at its team's rate
    const rate = (t) => (t.team === 'installers' ? T.installerBillRate : T.crewBillRate);
    const byGroup = new Map();
    for (const t of tasks) {
      const g = byGroup.get(t.group) || { hours: 0, amount: 0 };
      g.hours += t.workerHours; g.amount += t.workerHours * rate(t);
      byGroup.set(t.group, g);
    }
    const ORDER = ['Walls', 'Windows & doors', 'Floor', 'Stairs', 'Roof', 'Site'];
    const rank = (k) => { const i = ORDER.indexOf(k); return i < 0 ? 99 : i; };
    lines = [...byGroup].filter(([, g]) => g.amount > 0).sort((a, b) => rank(a[0]) - rank(b[0])).map(([group, g]) => ({ key: group, label: group === 'Site' ? 'Set-up, cleanup & punch list' : group, detail: `${num(g.hours)} worker-hours`, amount: round2(g.amount) }));
    // the rounding of each line lands on the total
    const diff = round2(T.bill - lines.reduce((a, l) => a + l.amount, 0));
    if (lines.length && diff) lines[lines.length - 1].amount = round2(lines[lines.length - 1].amount + diff);
  }
  const total = round2(bySqft ? T.sqftBill : T.bill);
  const note = bySqft ? '' : `${num(T.workerHours)} worker-hours · about ${Math.ceil(T.crewDays)} days for a crew of ${s.crew}`;
  return { key: 'labor', title: 'Labor', groups: lines.length ? [{ id: 'labor', title: '', lines, subtotal: total }] : [], total, material: false, note };
}

/**
 * The quote of a project.
 * @param {object} opts shipping: typed on the quote; include: { wallPanels, loose, trusses, labor }; detail: 'detail' | 'summary';
 *   markupDefault: the company's material markup % for a project without its own
 */
export function computeQuote(full = {}, { shipping, include, detail = 'detail', markupDefault = 0 } = {}) {
  const f = markupFactor(materialMarkupOf(full, markupDefault));
  // the project's scope (Summary), unless a quote passes its own parts
  const sc = scopeOf(full);
  const inc = include || { wallPanels: sc.structural || sc.partitions, loose: sc.loose, trusses: sc.trusses, labor: sc.labor };
  const est = scoped(full);
  const on = (k) => inc[k] !== false;
  const blocks = [
    on('wallPanels') && wallPanelsBlock(est, f),
    on('loose') && looseBlock(est, f),
    on('trusses') && trussesBlock(est),
    on('labor') && laborBlock(est),
  ].filter((b) => b && n(b.total) !== 0);
  if (detail === 'summary') {
    for (const b of blocks) b.groups = [{ id: b.key, title: '', lines: [{ key: b.key, label: b.title, detail: b.note || '', amount: b.total }], subtotal: b.total }];
  }
  const wpBlock = blocks.find((b) => b.key === 'wallPanels');
  if (wpBlock && !include && sc.structural !== sc.partitions) wpBlock.title = sc.structural ? 'Wall panels · structural' : 'Wall panels · partitions';
  const info = est.summaryInfo || {};
  const { state, rate, exempt, country, label } = taxFor(info);
  const materials = round2(blocks.filter((b) => b.material).reduce((a, b) => a + b.total, 0));
  const labor = round2(blocks.filter((b) => !b.material).reduce((a, b) => a + b.total, 0));
  const subtotal = round2(materials + labor);
  const taxBase = info.taxLabor ? subtotal : materials;
  const tax = round2(taxBase * (rate / 100));
  const ship = round2(shipping ?? n(info.shipping));
  return {
    blocks, materials, labor, subtotal, taxBase, taxOnLabor: Boolean(info.taxLabor),
    taxState: state, taxRate: rate, taxExempt: exempt, taxCountry: country, taxLabel: label, tax, shipping: ship, total: round2(subtotal + tax + ship),
  };
}

/** The wall-panels-only quote (the quote with wall panels alone). */
export function computeWallPanelsQuote(est = {}, opts = {}) {
  const q = computeQuote(est, { ...opts, include: { wallPanels: true, loose: false, trusses: false, labor: false } });
  const b = q.blocks[0];
  const groups = (b?.groups || []).filter((g) => g.id !== 'wp-all');
  const general = (b?.groups || []).find((g) => g.id === 'wp-all')?.lines || [];
  return { ...q, groups, general };
}
