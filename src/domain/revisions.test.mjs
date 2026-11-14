import test from 'node:test';
import assert from 'node:assert/strict';
import { compareEstimates, revisionAlerts, contractOf, dueIn, grandTotals } from './revisions.js';

const pick = (familyLabel, sizeLabel, price) => ({ family: 'f', familyLabel, sizeLabel, sizeLookupId: `${familyLabel}_${sizeLabel}`, vendorId: 'v', item: { basePrice: price, unit: 'pcs', familyDisplay: familyLabel, sizeDisplay: sizeLabel } });
const est = (qty, price, extra = {}) => ({
  buffers: { wallPanels: 0, loose: 0 },
  levels: [], manufactureEstimate: {}, summaryInfo: { address: '1 Main, Austin, TX 78701', ...extra },
  looseList: [{ id: 'x', kind: 'custom', rows: [{ id: 'r', type: 'Bolts', qty, wastePct: 0, item: pick('Bolt', '1/2', price) }] }],
});

test('the change splits into quantity and price', () => {
  const c = compareEstimates(est(100, 2), est(120, 2.5));
  const l = c.lines.find((x) => x.name.includes('Bolt'));
  assert.equal(l.change, 'changed');
  assert.equal(l.qtyEffect, 40, '20 more at the old price');
  assert.equal(l.priceEffect, 60, '120 at 50¢ more');
  assert.equal(l.diff, 100);
  assert.deepEqual(c.effects, { quantity: 40, price: 60 });
  assert.equal(c.categories.find((x) => x.key === 'looseTotal').diff, 100);
  assert.equal(c.amount, Math.round((c.current.grandTotal - c.base.grandTotal) * 100) / 100);
  assert.ok(c.amount > 100, 'tax on top');
});

test('added and removed materials', () => {
  const none = { levels: [], looseList: [], summaryInfo: {}, buffers: { loose: 0 } };
  assert.equal(compareEstimates(none, est(10, 3)).lines[0].change, 'added');
  assert.equal(compareEstimates(est(10, 3), none).lines[0].change, 'removed');
  assert.equal(compareEstimates(est(10, 3), est(10, 3)).lines.length, 0);
});

test('alerts: new drawings, old prices, project on hold', () => {
  const now = Date.UTC(2026, 10, 13);
  const last = { number: 1, drawingsDate: '2026-09-01', at: Date.UTC(2026, 8, 20) };
  const keys = (a) => a.map((x) => x.key);
  assert.deepEqual(keys(revisionAlerts({ summaryInfo: { drawingsDate: '2026-10-15' } }, last, { now })), ['drawings', 'prices']);
  assert.deepEqual(keys(revisionAlerts({ summaryInfo: { drawingsDate: '2026-09-01', pricesAt: '2026-11-01' } }, last, { now })), []);
  assert.deepEqual(keys(revisionAlerts({}, null, { now, status: 'on_hold' })), ['status', 'norev']);
  assert.equal(revisionAlerts({ summaryInfo: { pricesAt: '2026-11-01' } }, last, { now, currentGrand: 1100, lastGrand: 1000 })[0].amount, 100);
});

test('contract: bid plus approved change orders', () => {
  const c = contractOf(10000, [{ status: 'approved', amount: 1200 }, { status: 'rejected', amount: 900 }, { status: 'pending', amount: -300 }]);
  assert.deepEqual(c, { total: 11200, approved: 1, pending: 1, pendingAmount: -300 });
});

test('due dates and totals', () => {
  const now = Date.UTC(2026, 10, 13, 18);
  assert.equal(dueIn('2026-11-20', now), 7);
  assert.ok(dueIn('2026-11-10', now) < 0);
  assert.equal(dueIn('', now), null);
  const t = grandTotals(est(100, 2));
  assert.equal(t.looseTotal, 200);
  assert.equal(t.grandTotal, Math.round(200 * 1.0625 * 100) / 100);
});

test('quality checks: missing materials and prices are errors', async () => {
  const { qaChecks } = await import('./quality.js');
  const noPick = { ...est(10, 0), scope: { structural: false, partitions: false, trusses: false, labor: false } };
  const c = qaChecks(noPick);
  assert.equal(c[0].level, 'error');
  assert.ok(c.some((x) => x.key === 'noprice' && x.level === 'error'));
  const good = qaChecks({ ...est(10, 3, { drawingsDate: '2026-11-01', materialMarkupPct: 20 }), scope: { structural: false, partitions: false, trusses: false, labor: false }, labor: { areaSqFt: 1000 } });
  assert.ok(good.every((x) => x.level !== 'error'), JSON.stringify(good));
});
