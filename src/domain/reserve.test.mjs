import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate, onOrder, toOrder, cheapestOffer, orderQty, draftOrders, orderStatus, lineReceipt, itemKeyFromSel, poNumber } from './reserve.js';

const stocks = [{ itemKey: 'spf_2x6', qty: { a: 100, b: 20 } }, { itemKey: 'osb', qty: { a: 10 } }];
const res = [
  { projectId: 'p2', createdAt: 200, items: { spf_2x6: { qty: 80 }, osb: { qty: 30 } } },
  { projectId: 'p1', createdAt: 100, items: { spf_2x6: { qty: 90, issued: 30 } } },
];

test('stock goes to the oldest reservation first; issued pieces are no longer needed', () => {
  const a = allocate(stocks, res);
  assert.deepEqual(a.byProject.p1.spf_2x6, { need: 90, issued: 30, remaining: 60, allocated: 60, short: 0 });
  assert.deepEqual(a.byProject.p2.spf_2x6, { need: 80, issued: 0, remaining: 80, allocated: 60, short: 20 });
  assert.deepEqual(a.byProject.p2.osb, { need: 30, issued: 0, remaining: 30, allocated: 10, short: 20 });
  assert.deepEqual(a.byItem.spf_2x6, { onHand: 120, reserved: 120, available: 0, short: 20 });
});

test('shortages less what is on order', () => {
  const a = allocate(stocks, res);
  const ord = onOrder([
    { status: 'partial', lines: [{ itemKey: 'osb', pieces: 15, received: 5 }] },
    { status: 'cancelled', lines: [{ itemKey: 'spf_2x6', pieces: 100 }] },
  ]);
  assert.deepEqual(ord, { osb: 10 });
  assert.deepEqual(toOrder(a.byItem, ord), [
    { itemKey: 'spf_2x6', short: 20, refill: 0, onOrder: 0, toOrder: 20 },
    { itemKey: 'osb', short: 20, refill: 0, onOrder: 10, toOrder: 10 },
  ]);
});

test('order quantities in the supplier unit', () => {
  assert.deepEqual(orderQty(200, { buyUnit: 'bundle', pcsPerBundle: 189 }), { buyQty: 2, pieces: 378 });
  assert.deepEqual(orderQty(945, { buyUnit: 'mbf', size: `2x6"-8'` }), { buyQty: 7.56, pieces: 945 });
  assert.deepEqual(orderQty(3.2), { buyQty: 4, pieces: 4 });
  assert.equal(cheapestOffer([{ vendorId: 'a', basePrice: 5 }, { vendorId: 'b', basePrice: 4 }]).vendorId, 'b');
});

test('drafts: one order per supplier; status; receipts', () => {
  const d = draftOrders([
    { itemKey: 'spf', family: 'SPF#2', size: `2x6"-8'`, pieces: 20, offer: { vendorId: 'gp', vendorName: 'G&P', basePrice: 4.5, buyUnit: 'bundle', pcsPerBundle: 189 } },
    { itemKey: 'osb', family: 'OSB', size: `4x8'-7/16"`, pieces: 10, offer: { vendorId: 'gp', vendorName: 'G&P', basePrice: 9 } },
    { itemKey: 'hu', family: 'HU26', size: 'x', pieces: 4, offer: { vendorId: 'fp', vendorName: 'Fastener Plus', basePrice: 8 } },
  ]);
  assert.deepEqual(d.map((p) => [p.vendorName, p.lines.length, p.total]), [['Fastener Plus', 1, 32], ['G&P', 2, 940.5]]);
  assert.equal(d[1].lines[0].pieces, 189, 'whole bundles');
  assert.equal(orderStatus({ lines: [{ pieces: 10, received: 0 }] }), 'open');
  assert.equal(orderStatus({ lines: [{ pieces: 10, received: 4 }, { pieces: 5, received: 0 }] }), 'partial');
  assert.equal(orderStatus({ lines: [{ pieces: 10, received: 10 }] }), 'received');
  assert.deepEqual(lineReceipt({ buyUnit: 'bundle', pcsPerBundle: 189, size: '' }, 378), { buyUnit: 'bundle', buyQty: 2, pcsPerBundle: 189 });
  assert.equal(poNumber(7), 'PO-0007');
});

test('item keys from picks', () => {
  assert.equal(itemKeyFromSel({ sizeLookupId: 'spf2_2x6' }), 'spf2_2x6');
  assert.equal(itemKeyFromSel({ familyLabel: 'SPF#2', sizeLabel: `2x6"-8'` }), 'spf2_2x6-8');
  assert.equal(itemKeyFromSel(null), null);
});

test('the job that starts first is served first', () => {
  const a = allocate([{ itemKey: 'k', qty: { a: 50 } }], [
    { projectId: 'old', createdAt: 1, startDate: '2026-12-15', items: { k: { qty: 40 } } },
    { projectId: 'soon', createdAt: 9, startDate: '2026-11-20', items: { k: { qty: 40 } } },
    { projectId: 'nodate', createdAt: 0, items: { k: { qty: 10 } } },
  ]);
  assert.equal(a.byProject.soon.k.allocated, 40);
  assert.equal(a.byProject.old.k.allocated, 10);
  assert.equal(a.byProject.nodate.k.short, 10, 'no start date: after the dated ones');
});

test('to order: shortages plus refilling up to the minimum', () => {
  const a = allocate([{ itemKey: 'k', qty: { a: 30 } }, { itemKey: 'm', qty: { a: 5 } }], [{ projectId: 'p', items: { k: { qty: 40 } } }]);
  assert.deepEqual(toOrder(a.byItem, {}, { k: 20, m: 12 }), [
    { itemKey: 'k', short: 10, refill: 20, onOrder: 0, toOrder: 30 },
    { itemKey: 'm', short: 0, refill: 7, onOrder: 0, toOrder: 7 },
  ]);
});
