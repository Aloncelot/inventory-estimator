import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStairs, stringersFor, inches } from './stairs.js';

test('a straight stair, 9\'-1" floor to floor', () => {
  const s = computeStairs({ floorToFloorIn: 109, widthIn: 36 });
  assert.equal(s.risers, 15);
  assert.equal(s.riserIn, 7.27);
  assert.equal(s.treads, 14);
  assert.equal(s.flights.length, 1);
  assert.equal(s.stringers, 3);
  assert.equal(s.flights[0].runFt, 11.67);
  assert.ok(s.flights[0].stringerFt > 15 && s.flights[0].stringerFt < 16, 'about 14.8 ft + 1 ft for the cuts');
  assert.equal(s.railBlockingLF, 11.67);
  assert.equal(s.warnings.length, 1, 'only: stringers over 12 ft');
});

test('L with a landing: two flights, the landing framed', () => {
  const s = computeStairs({ floorToFloorIn: 109, widthIn: 42, type: 'l', landingLenFt: 4, landingWidthFt: 3.5 });
  assert.deepEqual(s.flights.map((f) => f.risers), [8, 7]);
  assert.equal(s.treads, 13, 'the landing is the 14th step');
  assert.equal(s.stringers, 6);
  assert.equal(s.landing.joists, 4);
  assert.equal(s.landing.joistLF, 14);
  assert.equal(s.landing.hangers, 8);
  assert.equal(s.landing.areaSqFt, 14);
});

test('code warnings and helpers', () => {
  const s = computeStairs({ floorToFloorIn: 100, widthIn: 30, treadIn: 9, type: 'u' });
  assert.equal(s.warnings.length, 3);
  assert.equal(computeStairs({}).ready, false);
  assert.equal(stringersFor(48), 4);
  assert.equal(inches(7.27), '7-1/4"');
  assert.equal(inches(10), '10"');
});

test('a Stairs section in Loose material: rows from the geometry, boards of the picked length', async () => {
  const { computeLooseSection } = await import('./index.js');
  const sel = (fam, size, price) => ({ familyLabel: fam, sizeLabel: size, item: { basePrice: price, unit: 'pcs', familyDisplay: fam, sizeDisplay: size } });
  const c = computeLooseSection({
    kind: 'stairs', name: 'Main stair', inputs: { floorToFloorIn: 109, widthIn: 36, type: 'l', landingLenFt: 4, landingWidthFt: 3, railSides: 1 },
    sel: { stringers: sel('SPF#2', `2x12"-16'`, 30), treads: sel('SPF#2', `2x12"-12'`, 22), railBlocking: sel('SPF#2', `2x6"-16'`, 12) },
  });
  assert.equal(c.kind, 'stairs');
  const row = (k) => c.calcRows.find((r) => r.key === k);
  assert.equal(row('stringers').qtyFinal, 6, '2 flights x 3, each fits in a 16 ft board');
  assert.equal(row('treads').qtyRaw, 4, '13 treads of 36", 4 per 12 ft board');
  assert.equal(row('risers').qtyRaw, 15);
  assert.ok(row('landingJoists'));
  assert.equal(row('landingHangers').qtyRaw, 8);
  assert.ok(row('railBlocking').qtyRaw > 0);
  assert.ok(c.subtotal > 0);
  assert.equal(c.stairs.risers, 15);
});

test('long stringers: LVL suggested, and LVL / LSL are bought by the LF', async () => {
  const { computeLooseSection } = await import('./index.js');
  const lvl = { familyLabel: 'LVL', sizeLabel: '1-3/4x11-7/8"', item: { basePrice: 9, unit: 'lf', familyDisplay: 'LVL', sizeDisplay: '1-3/4x11-7/8"' } };
  const straight = { floorToFloorIn: 109, widthIn: 36 };   // one flight, stringers about 15.8 ft
  const plain = computeLooseSection({ kind: 'stairs', inputs: straight, sel: {} });
  const s0 = plain.calcRows.find((r) => r.key === 'stringers');
  assert.equal(s0.defaults.family, 'LVL', 'over 12 ft the suggestion is LVL');
  assert.ok(plain.stairs.warnings.some((w) => /LVL/.test(w)));
  const c = computeLooseSection({ kind: 'stairs', inputs: straight, sel: { stringers: lvl, landingRim: lvl } });
  const s1 = c.calcRows.find((r) => r.key === 'stringers');
  assert.equal(s1.unit, 'lf');
  assert.equal(s1.qtyRaw, Math.round(3 * plain.stairs.flights[0].stringerFt * 100) / 100);
  assert.equal(s1.subtotal, s1.qtyFinal * 9);
  const short = computeLooseSection({ kind: 'stairs', inputs: { floorToFloorIn: 60, widthIn: 36 }, sel: {} });
  assert.equal(short.calcRows.find((r) => r.key === 'stringers').defaults, undefined, 'short ones keep sawn lumber');
});

test('any lumber row: an LVL or LSL picked is bought by the LF', async () => {
  const { calcPlates } = await import('../calculators/plates.js');
  const { computeLooseSection } = await import('./index.js');
  const lsl = { unit: 'lf', basePrice: 6, familyDisplay: 'LSL' };
  assert.deepEqual([calcPlates({ lengthLF: 40, boardLenFt: 16, item: lsl }).qtyRaw, calcPlates({ lengthLF: 40, boardLenFt: 16, item: lsl }).unit], [40, 'lf']);
  assert.equal(calcPlates({ lengthLF: 40, boardLenFt: 16, item: { unit: 'pcs', familyDisplay: 'SPF#2' } }).qtyRaw, 2.5);
  // a loose joist row with LVL
  const lvl = { familyLabel: 'LVL', sizeLabel: '1-3/4x9-1/2"', item: { basePrice: 7, unit: 'pcs', familyDisplay: 'LVL', sizeDisplay: '1-3/4x9-1/2"' } };
  const c = computeLooseSection({ kind: 'custom', rows: [{ id: 'r', type: 'Joist', item: lvl, wastePct: 0, inputs: { lengthLF: 120 } }] });
  assert.equal(c.manualRows[0].qtyFinal, 120);
  assert.equal(c.manualRows[0].unit, 'lf');
});

test('labor: a U stair with its landing is about 3 crew hours', async () => {
  const { computeLabor } = await import('../labor.js');
  const est = { levels: [{ id: 'l1', name: 'Level 1', exteriorSections: [], interiorSections: [] }], looseList: [{ id: 'st', kind: 'stairs', name: 'Stairs', inputs: { floorToFloorIn: 109, type: 'u', landingLenFt: 7, landingWidthFt: 3.5 } }] };
  const { tasks, totals } = computeLabor(est);
  const stairs = tasks.filter((t) => t.group === 'Stairs');
  assert.deepEqual(stairs.map((t) => [t.label, t.qty ?? t.auto]), [['Stair flights', 2], ['Landing', 1]]);
  const crewHours = stairs.reduce((a, t) => a + t.workerHours, 0) / 5;
  assert.ok(crewHours > 2.7 && crewHours < 3.3, String(crewHours));
});

test('identical staircase multiplier, custom 1st flight risers, kicker/ledger and skirt boards', async () => {
  const { computeLooseSection } = await import('./index.js');
  const s = computeStairs({ floorToFloorIn: 109, widthIn: 36, type: 'l', count: 3, flight1Risers: 10, landingLenFt: 4, landingWidthFt: 3, skirtSides: 2 });
  assert.deepEqual(s.flights.map((f) => f.risers), [10, 5]);
  assert.equal(s.count, 3);
  assert.ok(s.kickerLedgerLF > 0);
  assert.ok(s.skirtLF > 0);
  const c = computeLooseSection({
    kind: 'stairs',
    inputs: { floorToFloorIn: 109, widthIn: 36, type: 'l', count: 3, flight1Risers: 10, landingLenFt: 4, landingWidthFt: 3, skirtSides: 2 },
    sel: {},
  });
  const row = (k) => c.calcRows.find((r) => r.key === k);
  assert.equal(row('stringers').qtyRaw, 18, '6 stringers × 3 identical stairs');
  assert.equal(row('stringerTies').qtyRaw, 18);
  assert.ok(row('kickerLedger').qtyRaw > 0);
  assert.ok(row('skirtBoards').qtyRaw > 0);
});
