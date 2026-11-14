// src/domain/revisions.js
// Revisions and change orders. Pure functions.
//
// A revision is a frozen copy of the estimate (Rev 0 is the bid). Comparing
// the estimate against a revision gives the change by category and by
// material; a material's change splits into what the quantity did (the
// drawings changed: the client pays for it) and what the price did (the
// supplier's price moved). A change order asks to move the contract from one
// revision to the next; an Admin approves it or rejects it.

import { projectTotals } from './aggregate/projectTotals';
import { taxFor } from './lib/tax';
import { computeLabor } from './labor';
import { buildTakeoff } from './takeoff';

const n = (v) => Number(v) || 0;
const r2 = (v) => Math.round(n(v) * 100) / 100;

/** Everything Summary shows: categories, markup, tax, shipping, grand total, per sq ft. */
export function grandTotals(est = {}, { markupDefault = 0 } = {}) {
  const info = est.summaryInfo || {};
  const t = projectTotals(est, { markupDefault });
  const taxRate = taxFor(info).rate;
  const tax = r2((info.taxLabor ? t.subtotal : t.materials) * (taxRate / 100));
  const shipping = r2(info.shipping);
  const grand = r2(t.subtotal + tax + shipping);
  const areaSqFt = computeLabor(est).totals.areaSqFt;
  return {
    wallPanelsTotal: r2(t.wallPanels), looseTotal: r2(t.loose), trussTotal: r2(t.trusses), laborTotal: r2(t.labor),
    markupTotal: r2(t.markup), markupPct: t.markupPct, subtotal: r2(t.subtotal), taxRate, taxAmount: tax,
    shippingAmount: shipping, grandTotal: grand, areaSqFt, perSqFt: areaSqFt ? r2(grand / areaSqFt) : 0,
  };
}

export const CATEGORIES = [
  ['wallPanelsTotal', 'Wall panels'], ['looseTotal', 'Loose material'], ['trussTotal', 'Trusses'], ['laborTotal', 'Labor'],
  ['markupTotal', 'Material markup'], ['taxAmount', 'Tax'], ['shippingAmount', 'Shipping'],
];

/** Every material of the takeoff, added up across levels: { key: { name, unit, qty, cost } }. */
export function takeoffLines(est = {}) {
  const t = buildTakeoff(est);
  const out = {};
  const add = (l) => {
    const x = out[l.key] || (out[l.key] = { key: l.key, name: l.name, unit: l.unit, qty: 0, cost: 0 });
    x.qty += n(l.qty); x.cost += n(l.total);
  };
  for (const lv of t.levels) for (const g of [...lv.wallPanels, ...lv.loose]) g.lines.forEach(add);
  for (const g of t.project) if (g.key !== 'trusses') g.lines.forEach(add);
  return out;
}

/**
 * The change from `base` to `current` (two estimates).
 * @returns {{ categories, lines, effects: { quantity, price }, base, current, amount }}
 *   lines: added, removed or changed materials at cost, with the part of the
 *   change due to quantity and the part due to price.
 */
export function compareEstimates(baseEst, currentEst, opts = {}) {
  const base = opts.baseTotals || grandTotals(baseEst, opts);
  const current = opts.currentTotals || grandTotals(currentEst, opts);
  const categories = CATEGORIES.map(([key, label]) => ({ key, label, base: n(base[key]), current: n(current[key]), diff: r2(n(current[key]) - n(base[key])) }))
    .filter((c) => c.base || c.current);
  const a = takeoffLines(baseEst); const b = takeoffLines(currentEst);
  const lines = [];
  let qtyEffect = 0; let priceEffect = 0;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const o = a[key] || { qty: 0, cost: 0 }; const c = b[key] || { qty: 0, cost: 0 };
    const pO = o.qty ? o.cost / o.qty : (c.qty ? c.cost / c.qty : 0);
    const pC = c.qty ? c.cost / c.qty : pO;
    const dq = r2(c.qty - o.qty);
    const q = r2(dq * pO);
    const p = r2((pC - pO) * c.qty);
    if (!dq && !p) continue;
    qtyEffect += q; priceEffect += p;
    lines.push({
      key, name: (b[key] || a[key]).name, unit: (b[key] || a[key]).unit,
      change: !a[key] ? 'added' : !b[key] ? 'removed' : 'changed',
      qtyBase: r2(o.qty), qty: r2(c.qty), priceBase: r2(pO), price: r2(pC),
      costBase: r2(o.cost), cost: r2(c.cost), qtyEffect: q, priceEffect: p, diff: r2(c.cost - o.cost),
    });
  }
  lines.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  return { categories, lines, effects: { quantity: r2(qtyEffect), price: r2(priceEffect) }, base, current, amount: r2(n(current.grandTotal) - n(base.grandTotal)) };
}

/* ── alerts ─────────────────────────────────────────────────────────── */

export const PRICE_AGE_DAYS = 30;
const days = (from, now) => Math.floor((now - new Date(from).getTime()) / 86400000);

/**
 * What the estimator should look at on a project.
 * @param last the latest revision ({ number, drawingsDate, at }) or null
 */
export function revisionAlerts(est = {}, last, { now = Date.now(), currentGrand, lastGrand, status } = {}) {
  const info = est.summaryInfo || {};
  const out = [];
  if (status === 'cancelled' || status === 'on_hold') out.push({ key: 'status', tone: 'warn', text: `The project is ${status === 'cancelled' ? 'cancelled' : 'on hold'}: check with an Admin before revising it.` });
  if (!last) {
    out.push({ key: 'norev', tone: 'info', text: 'No revision yet. Save Rev 0 when the bid goes out, so later changes can be compared against it.' });
  } else {
    if (info.drawingsDate && (!last.drawingsDate || info.drawingsDate > last.drawingsDate)) {
      out.push({ key: 'drawings', tone: 'warn', text: `New drawings (${info.drawingsDate}) after Rev ${last.number}${last.drawingsDate ? ` (${last.drawingsDate})` : ''}: update the takeoff, save a revision and compare.` });
    }
    if (currentGrand != null && lastGrand != null && Math.abs(currentGrand - lastGrand) >= 0.01) {
      out.push({ key: 'changed', tone: 'info', text: `The estimate changed since Rev ${last.number}.`, amount: r2(currentGrand - lastGrand) });
    }
  }
  const pricesAt = info.pricesAt || (last?.at ? new Date(last.at).toISOString() : null);
  if (pricesAt) {
    const d = days(pricesAt, now);
    if (d > PRICE_AGE_DAYS) out.push({ key: 'prices', tone: 'warn', text: `Prices are ${d} days old: refresh them in Summary and compare what the change is.` });
  }
  return out;
}

/* ── change orders ─────────────────────────────────────────────────── */

export const CO_STATUS_LABEL = { pending: 'Waiting for approval', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn' };

/** The contract: Rev 0 plus the approved change orders. */
export function contractOf(bid, changeOrders = []) {
  const approved = changeOrders.filter((c) => c.status === 'approved');
  const total = r2(n(bid) + approved.reduce((a, c) => a + n(c.amount), 0));
  const pending = changeOrders.filter((c) => c.status === 'pending');
  return { total, approved: approved.length, pending: pending.length, pendingAmount: r2(pending.reduce((a, c) => a + n(c.amount), 0)) };
}

export const coNumber = (k) => `CO-${k}`;

/* ── project info ───────────────────────────────────────────────────── */

export const PROJECT_STATUSES = [
  ['not_started', 'Not started'], ['in_progress', 'Estimating'], ['sent', 'Sent'], ['on_hold', 'On hold'],
  ['won', 'Won'], ['lost', 'Lost'], ['cancelled', 'Cancelled'], ['done', 'Done'],
];
export const statusLabel = (k) => (PROJECT_STATUSES.find(([key]) => key === k) || [null, 'Not started'])[1];

/** Days until the due date (negative: late); null without one. */
export function dueIn(dueDate, now = Date.now()) {
  if (!dueDate) return null;
  const d = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export const PRIORITIES = [['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']];
export const priorityLabel = (k) => (PRIORITIES.find(([key]) => key === k) || [null, ''])[1];
export const LOST_REASONS = [
  ['price', 'Price too high'], ['time', 'Lead time'], ['competitor', 'Went with another framer'], ['scope', 'Scope changed'],
  ['cancelled', 'Client cancelled the job'], ['no_answer', 'No answer'], ['other', 'Other'],
];
export const lostLabel = (k) => (LOST_REASONS.find(([key]) => key === k) || [null, k || ''])[1];
