import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeWallPanelsQuote } from './quote.js';
import { wallPanelsOf } from './index.js';

const pick = (familyLabel, sizeLabel, price = 10) => ({
  family: familyLabel.toLowerCase(), familyLabel, sizeLabel, sizeLookupId: 'x', vendorId: 'v',
  item: { priceWithMarkup: price, unit: 'pcs', familyDisplay: familyLabel, sizeDisplay: sizeLabel },
});
const est = {
  levels: [{
    id: 'l1', name: 'Level 1',
    exteriorSections: [{ id: 's1', lengthLF: 80, heightFt: 9, sel: { bottomPlate: pick('PT', `2x6"-8'`), studs: pick('SPF#2', `2x6"-10'`) } }],
    interiorSections: [{ id: 's2', kind: 'partition', lengthLF: 40, heightFt: 9, sel: { studs: pick('SPF#2', `2x4"-8'`, 5) } }],
    panelNails: {}, looseMaterials: {},
  }],
  manufactureEstimate: {},
  summaryInfo: { address: '1 Main St, Boston, MA 02101', shipping: 150 },
  looseList: [{ id: 'x', kind: 'custom', rows: [{ id: 'r', type: 'Bolts', qty: 100, wastePct: 0, item: pick('Bolt', 'x', 50) }] }],
  trusses: [{ id: 't', amount: '9999' }],
};

test('quote covers wall panels only, per level and category', () => {
  const q = computeWallPanelsQuote(est);
  assert.equal(q.subtotal, wallPanelsOf(est).total);       // no loose material page, no trusses
  assert.equal(q.groups.length, 1);
  assert.deepEqual(q.groups[0].lines.map((l) => l.key), ['exterior', 'partition']);
  assert.equal(q.groups[0].lines[0].detail, '80 LF');
  assert.ok(q.general.some((l) => l.key === 'manufacture'));
  const lineSum = q.groups.reduce((s, g) => s + g.lines.reduce((a, l) => a + l.amount, 0), 0) + q.general.reduce((a, l) => a + l.amount, 0);
  assert.ok(Math.abs(lineSum - q.subtotal) < 0.02);
});

test('tax from the Summary address (MA 6.25%), shipping from Summary unless overridden', () => {
  const q = computeWallPanelsQuote(est);
  assert.equal(q.taxState, 'MA');
  assert.equal(q.tax, Number((q.subtotal * 0.0625).toFixed(2)));
  assert.equal(q.shipping, 150);
  assert.equal(q.total, Number((q.subtotal + q.tax + 150).toFixed(2)));
  assert.equal(computeWallPanelsQuote(est, { shipping: 0 }).shipping, 0);
  const exempt = computeWallPanelsQuote({ ...est, summaryInfo: { ...est.summaryInfo, isTaxExempt: true } });
  assert.equal(exempt.tax, 0);
});

test('the whole quote: wall panels, loose material, trusses, labor; summary lines; tax on materials', async () => {
  const { computeQuote } = await import('./quote.js');
  const { projectTotals } = await import('../aggregate/projectTotals.js');
  const q = computeQuote(est);
  assert.deepEqual(q.blocks.map((b) => b.key), ['wallPanels', 'loose', 'trusses', 'labor']);
  const t = projectTotals(est);
  assert.ok(Math.abs(q.subtotal - t.subtotal) < 0.05, `${q.subtotal} vs ${t.subtotal}`);
  assert.equal(q.tax, Number((q.materials * 0.0625).toFixed(2)));
  for (const b of q.blocks) {
    const sum = b.groups.reduce((a, g) => a + g.lines.reduce((x, l) => x + l.amount, 0), 0);
    assert.ok(Math.abs(sum - b.total) < 0.05, `${b.key}: ${sum} vs ${b.total}`);
  }
  const s = computeQuote(est, { detail: 'summary', include: { labor: false } });
  assert.deepEqual(s.blocks.map((b) => b.groups[0].lines.length), [1, 1, 1]);
  assert.ok(!s.blocks.some((b) => b.key === 'labor'));
  const onLabor = computeQuote({ ...est, summaryInfo: { ...est.summaryInfo, taxLabor: true } });
  assert.equal(onLabor.tax, Number((onLabor.subtotal * 0.0625).toFixed(2)));
});
