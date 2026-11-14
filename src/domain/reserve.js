// src/domain/reserve.js
// Reservations and purchase orders. Pure functions.
//
// A reservation holds what one project needs from the warehouse (from its
// takeoff). Stock goes to the reservations in the order they were made: the
// first project reserved is served first. What a project still needs is what
// it reserved minus what was already issued to it; what stock cannot cover is
// its shortage. Shortages, less what is already on order, become purchase
// orders, one per supplier.

import { boardFeetOf, piecesPerBuyUnit } from './purchase';

const n = (v) => Number(v) || 0;
const r2 = (v) => Math.round(v * 100) / 100;

/** Same id as the price list's itemVendorLookup: familySlug_sizeSlug. */
export function slugOf(s) {
  return String(s || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').toLowerCase();
}
/** The price-list item of a picked selection, or null. */
export function itemKeyFromSel(sel) {
  if (!sel) return null;
  if (sel.sizeLookupId) return sel.sizeLookupId;
  const it = sel.item || sel;
  const family = sel.familyLabel || it.familyDisplay || it.raw?.familyDisplay;
  const size = sel.sizeLabel || it.sizeDisplay || it.raw?.sizeDisplay;
  return family && size ? `${slugOf(family)}_${slugOf(size)}` : null;
}

const onHandOf = (s) => Object.values(s?.qty || {}).reduce((a, b) => a + n(b), 0);
const atMillis = (t) => (t?.toMillis ? t.toMillis() : t instanceof Date ? t.getTime() : n(t));

/**
 * Share the stock among the reservations: the job that starts first (its
 * project's Job starts date) first, then the oldest reservation.
 * @param stocks    [{ itemKey, qty: { wh: n } }]
 * @param reservations [{ projectId, createdAt, items: { itemKey: { qty, issued } } }]
 * @returns {{ byProject: { [projectId]: { [itemKey]: { need, issued, remaining, allocated, short } } },
 *             byItem: { [itemKey]: { onHand, reserved, available, short } } }}
 */
export function allocate(stocks = [], reservations = []) {
  const left = new Map(stocks.map((s) => [s.itemKey, onHandOf(s)]));
  const byItem = {};
  for (const s of stocks) byItem[s.itemKey] = { onHand: onHandOf(s), reserved: 0, available: onHandOf(s), short: 0 };
  const byProject = {};
  // the job that starts first is served first; without a start date, after those, in the order reserved
  const startOf = (r) => (r.startDate ? new Date(`${r.startDate}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER);
  const ordered = [...reservations].sort((a, b) => startOf(a) - startOf(b) || atMillis(a.createdAt) - atMillis(b.createdAt));
  for (const r of ordered) {
    const out = {};
    for (const [key, it] of Object.entries(r.items || {})) {
      const need = Math.max(0, Math.round(n(it.qty)));
      const issued = Math.max(0, Math.round(n(it.issued)));
      const remaining = Math.max(0, need - issued);
      const have = left.get(key) || 0;
      const allocated = Math.min(remaining, have);
      left.set(key, have - allocated);
      const short = remaining - allocated;
      out[key] = { need, issued, remaining, allocated, short };
      const t = byItem[key] || (byItem[key] = { onHand: 0, reserved: 0, available: 0, short: 0 });
      t.reserved += allocated;
      t.short += short;
    }
    byProject[r.projectId] = out;
  }
  for (const t of Object.values(byItem)) t.available = Math.max(0, t.onHand - t.reserved);
  return { byProject, byItem };
}

/** Pieces still to arrive on open purchase orders, by item. */
export function onOrder(orders = []) {
  const out = {};
  for (const po of orders) {
    if (po.status === 'cancelled' || po.status === 'received') continue;
    for (const l of po.lines || []) out[l.itemKey] = n(out[l.itemKey]) + Math.max(0, n(l.pieces) - n(l.received));
  }
  return out;
}

/**
 * What to order: the shortage of every item (what the reservations need and
 * the stock cannot cover) plus what brings the free stock back up to its
 * minimum, less what is already on order.
 * @param mins { itemKey: minQty } (optional)
 * @returns [{ itemKey, short, refill, onOrder, toOrder }]
 */
export function toOrder(byItem = {}, ordered = {}, mins = {}) {
  const keys = new Set([...Object.keys(byItem), ...Object.keys(mins)]);
  return [...keys].map((itemKey) => {
    const t = byItem[itemKey] || { short: 0, available: 0 };
    const refill = Math.max(0, n(mins[itemKey]) - n(t.available));
    const need = n(t.short) + refill;
    return { itemKey, short: n(t.short), refill, onOrder: n(ordered[itemKey]), toOrder: Math.max(0, need - n(ordered[itemKey])) };
  }).filter((x) => x.toOrder > 0);
}

/** The supplier with the lowest price per piece. */
export function cheapestOffer(offers = []) {
  return offers.filter((o) => n(o.basePrice) > 0).sort((a, b) => n(a.basePrice) - n(b.basePrice))[0] || offers[0] || null;
}

/**
 * A quantity in pieces, as the supplier sells it: whole bundles, MBF to three
 * decimals, or each. Returns { buyQty, pieces } (pieces rounded up to what the
 * supplier's unit gives).
 */
export function orderQty(pieces, { buyUnit = 'each', pcsPerBundle, size } = {}) {
  const p = Math.max(0, Math.ceil(n(pieces)));
  if (buyUnit === 'bundle' && n(pcsPerBundle) > 0) {
    const buyQty = Math.ceil(p / n(pcsPerBundle));
    return { buyQty, pieces: buyQty * n(pcsPerBundle) };
  }
  const bf = boardFeetOf(size);
  if (buyUnit === 'mbf' && bf) {
    const buyQty = Math.ceil((p * bf) / 1000 * 1000 - 1e-9) / 1000;
    return { buyQty, pieces: p };
  }
  return { buyQty: p, pieces: p };
}

/**
 * Purchase order drafts: the chosen lines grouped by supplier.
 * @param lines [{ itemKey, family, size, unit, pieces, offer: { vendorId, vendorName, basePrice, buyUnit, pcsPerBundle, buyPrice } }]
 */
export function draftOrders(lines = []) {
  const by = new Map();
  for (const l of lines) {
    const o = l.offer || {};
    if (!o.vendorId || !(n(l.pieces) > 0)) continue;
    const q = orderQty(l.pieces, { buyUnit: o.buyUnit, pcsPerBundle: o.pcsPerBundle, size: l.size });
    const po = by.get(o.vendorId) || { vendorId: o.vendorId, vendorName: o.vendorName || o.vendorId, lines: [], total: 0 };
    const unitPrice = n(o.basePrice);
    po.lines.push({
      itemKey: l.itemKey, family: l.family || '', size: l.size || '', unit: l.unit || 'pcs',
      buyUnit: o.buyUnit || 'each', pcsPerBundle: o.buyUnit === 'bundle' ? n(o.pcsPerBundle) : null,
      buyQty: q.buyQty, pieces: q.pieces, unitPrice, received: 0, amount: r2(q.pieces * unitPrice),
    });
    po.total = r2(po.total + q.pieces * unitPrice);
    by.set(o.vendorId, po);
  }
  return [...by.values()].sort((a, b) => a.vendorName.localeCompare(b.vendorName));
}

/** open (nothing in yet), partial, received or cancelled. */
export function orderStatus(po) {
  if (po.status === 'cancelled') return 'cancelled';
  const lines = po.lines || [];
  const got = lines.reduce((a, l) => a + n(l.received), 0);
  if (lines.length && lines.every((l) => n(l.received) >= n(l.pieces))) return 'received';
  return got > 0 ? 'partial' : 'open';
}

/** A receipt against one line of an order, in the supplier's unit for the movement log. */
export function lineReceipt(line, pieces) {
  const per = piecesPerBuyUnit(line.buyUnit, { pcsPerBundle: line.pcsPerBundle, boardFeet: boardFeetOf(line.size) }) || 1;
  return { buyUnit: line.buyUnit || 'each', buyQty: Math.round((n(pieces) / per) * 1000) / 1000, pcsPerBundle: line.pcsPerBundle || null };
}

export const PO_STATUS_LABEL = { open: 'Open', partial: 'Partly received', received: 'Received', cancelled: 'Cancelled' };
export const poNumber = (seq) => `PO-${String(seq).padStart(4, '0')}`;
