import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeWallPanelsQuote } from './quote.js';
import { wallPanelsOf } from './index.js';

const pick = (familyLabel, sizeLabel, price = 10) => ({
  family: familyLabel.toLowerCase(), familyLabel, sizeLabel, sizeLookupId: 'x', vendorId: 'v',
  item: { priceWithMarkup: price, unit: 'pcs', familyDisplay: familyLabel, sizeDisplay: sizeLabel },
});
const est = {
  buffers: { wallPanels: 0, loose: 0 },   // the error buffer is tested on its own
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

test('material markup: the estimate adds it, the price list does not', async () => {
  const { computeQuote } = await import('./quote.js');
  const { projectTotals } = await import('../aggregate/projectTotals.js');
  const { unitPriceFrom } = await import('../lib/parsing.js');
  assert.equal(unitPriceFrom({ basePrice: 4, markupPct: 25, priceWithMarkup: 5 }), 4, 'list prices are cost');
  const cost = projectTotals(est);
  assert.equal(cost.markup, 0);
  const marked = { ...est, summaryInfo: { ...est.summaryInfo, materialMarkupPct: 20 } };
  const t = projectTotals(marked);
  const wp = wallPanelsOf(marked);
  assert.equal(t.markupBase, Math.round((wp.total - wp.manufacture.total + t.loose) * 100) / 100, 'not on manufacture or trusses');
  assert.equal(t.markup, Math.round(t.markupBase * 20) / 100);
  assert.equal(t.materials, Math.round((cost.materials + t.markup) * 100) / 100);
  const q = computeQuote(marked);
  assert.ok(Math.abs(q.materials - t.materials) < 0.02, 'the quote spreads the markup over its lines');
  assert.equal(q.blocks.find((b) => b.key === 'loose').total, Math.round(t.loose * 120) / 100);
  assert.equal(q.blocks.find((b) => b.key === 'trusses').total, 9999);
  // a project without its own % takes the company default
  assert.equal(projectTotals(est, { markupDefault: 20 }).markup, t.markup);
});

test('material needs: the takeoff by price-list item, whole units, no trusses or manufacture', async () => {
  const { materialNeeds } = await import('../takeoff.js');
  const { items } = materialNeeds(est);
  // every pick in the fixture is the same price-list item ('x'): one line, added up
  assert.equal(items.length, 1);
  assert.equal(items[0].itemKey, 'x');
  assert.ok(Number.isInteger(items[0].qty) && items[0].qty > 100);
});

test('error buffer: 10% by default on wall panel materials and loose material, before markup', async () => {
  const { projectTotals } = await import('../aggregate/projectTotals.js');
  const { computeQuote } = await import('./quote.js');
  const { buffers, ...noBuf } = est;
  const plain = projectTotals(est);
  const t = projectTotals({ ...noBuf, summaryInfo: { ...est.summaryInfo, materialMarkupPct: 20 } });
  const wp = wallPanelsOf(est);
  const wpMat = Math.round((wp.total - wp.manufacture.total) * 100) / 100;
  assert.equal(t.wallPanelsBufferPct, 10);
  assert.equal(t.wallPanelsBuffer, Math.round(wpMat * 10) / 100, 'not on manufacture');
  assert.equal(t.looseBuffer, Math.round(plain.loose * 10) / 100);
  assert.equal(t.wallPanels, Math.round((plain.wallPanels + t.wallPanelsBuffer) * 100) / 100);
  assert.equal(t.markupBase, Math.round((wpMat + t.wallPanelsBuffer + t.loose) * 100) / 100, 'markup on top of the buffer');
  const own = projectTotals({ ...est, buffers: { wallPanels: 5, loose: 0 } });
  assert.equal(own.wallPanelsBuffer, Math.round(wpMat * 5) / 100);
  assert.equal(own.looseBuffer, 0);
  const q = computeQuote({ ...noBuf, summaryInfo: { ...est.summaryInfo, materialMarkupPct: 20 } });
  assert.ok(Math.abs(q.materials - t.materials) < 0.05, 'the quote spreads buffer and markup over its lines');
});

test('panel trucking: in wall panels, no buffer or markup on it, its own quote line', async () => {
  const { projectTotals } = await import('../aggregate/projectTotals.js');
  const { computeQuote } = await import('./quote.js');
  const trucked = { ...est, trucking: { panelsPerTruck: 10, perMile: 4, baseFee: 100, miles: 25 } };
  const wp = wallPanelsOf(trucked);
  assert.ok(wp.trucking.trucks >= 1);
  assert.equal(wp.trucking.perTrip, 300);
  assert.equal(wp.total, Math.round((wallPanelsOf(est).total + wp.trucking.total) * 100) / 100);
  const a = projectTotals({ ...trucked, summaryInfo: { ...est.summaryInfo, materialMarkupPct: 20 } });
  const b = projectTotals({ ...est, summaryInfo: { ...est.summaryInfo, materialMarkupPct: 20 } });
  assert.equal(a.markup, b.markup, 'no markup on trucking');
  const q = computeQuote(trucked);
  const line = q.blocks.find((x) => x.key === 'wallPanels').groups.flatMap((g) => g.lines).find((l) => l.key === 'trucking');
  assert.equal(line.amount, wp.trucking.total);
});
