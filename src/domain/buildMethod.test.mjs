// Wall panels or stick framing, per wall group (Summary → Built as).
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeWallPanels } from './estimate/index.js';
import { computeLabor } from './labor.js';
import { buildMethodOf, isStick, groupOfKind } from './scope.js';
import { computeQuote } from './estimate/quote.js';

const sec = (id, kind, lengthLF, heightFt, extra = {}) => ({ id, kind, lengthLF, heightFt, studSpacingIn: 16, sel: {}, ...extra });
const base = {
  levels: [
    { id: 'L1', name: 'Level 1', exteriorSections: [sec('e1', 'exterior', 80, 10)], interiorSections: [sec('i1', 'partition', 40, 10), sec('i2', 'bearing', 24, 10)] },
  ],
  trucking: { panelsPerTruck: 10, miles: 20, perMile: 3, baseFee: 100 },
};
const withMethod = (structural, partitions) => ({ ...base, buildMethod: { structural, partitions } });

test('build method: wall panels unless set, grouped like the scope', () => {
  assert.deepEqual(buildMethodOf({}), { structural: 'panels', partitions: 'panels' });
  assert.deepEqual(buildMethodOf({ buildMethod: { structural: 'stick', partitions: 'nonsense' } }), { structural: 'stick', partitions: 'panels' });
  assert.equal(groupOfKind('exterior'), 'structural');
  assert.equal(groupOfKind('bearing'), 'structural');
  assert.equal(groupOfKind('shear'), 'structural');
  assert.equal(groupOfKind('partition'), 'partitions');
  assert.equal(groupOfKind('knee'), 'partitions');
  assert.equal(isStick(withMethod('stick', 'panels'), 'bearing'), true);
  assert.equal(isStick(withMethod('stick', 'panels'), 'partition'), false);
});

test('all wall panels: the same numbers as before the setting existed', () => {
  const before = computeWallPanels(base);
  const panels = computeWallPanels(withMethod('panels', 'panels'));
  assert.equal(panels.total, before.total);
  assert.deepEqual(panels.lf, before.lf);
  assert.equal(panels.manufacture.total, before.manufacture.total);
  assert.equal(panels.trucking.total, before.trucking.total);
  assert.ok(panels.manufacture.total > 0);
  assert.ok(panels.trucking.trucks > 0);
});

test('all stick framed: no manufacture, no delivery, bracing by the foot, same material', () => {
  const panels = computeWallPanels(base);
  const stick = computeWallPanels(withMethod('stick', 'stick'));
  assert.equal(stick.manufacture.total, 0);
  assert.equal(stick.trucking.trucks, 0);
  assert.equal(stick.trucking.total, 0);
  // the walls' own material does not change
  assert.equal(stick.levels[0].total, panels.levels[0].total);
  // 144 LF framed on site: one bracing station every 8'
  assert.equal(stick.stickLF.structural + stick.stickLF.partitions, 144);
  assert.equal(stick.bracing.baseRows.find((r) => r.key === 'panels').qtyRaw, Math.ceil(144 / 8) * 2);
});

test('mixed: structural walls stick framed, partitions as panels', () => {
  const mixed = computeWallPanels(withMethod('stick', 'panels'));
  assert.equal(mixed.lf.exteriorWalls, 0);
  assert.equal(mixed.lf.interiorBlockingOnly, 0);    // bearing is structural
  assert.equal(mixed.lf.interiorNonLoad, 40);
  assert.equal(mixed.stickLF.structural, 104);
  const panels = mixed.manufacture.lines.filter((l) => !l.isQtyBased).reduce((a, l) => a + (l.panels || 0), 0);
  assert.equal(mixed.trucking.panels, panels);
  assert.ok(mixed.manufacture.total > 0);
});

test('labor: stick-framed walls by the foot, panels by the panel', () => {
  const panels = computeLabor(base).tasks;
  assert.ok(panels.some((t) => t.key === 'panels|L1|exterior'));
  const stick = computeLabor(withMethod('stick', 'panels')).tasks;
  assert.equal(stick.some((t) => t.key === 'panels|L1|exterior'), false);
  const ext = stick.find((t) => t.key === 'stick|L1|exterior');
  assert.equal(ext.qty, 8);                 // 80 LF in 10 LF units
  assert.equal(ext.min, 16 * 1.25);         // stick framing + 25% sheathed
  assert.ok(stick.some((t) => t.key === 'panels|L1|partition'));
  const plumb = stick.find((t) => t.key === 'plumb|L1');
  assert.equal(plumb.qty, 5 + Math.ceil(80 / 8) + Math.ceil(24 / 8));   // partition panels + stations
});

test('quote: the wall section is named by how the walls are built; no delivery when every wall is stick framed', () => {
  const q = (est) => computeQuote(est).blocks.find((b) => b.key === 'wallPanels');
  assert.equal(q(base).title, 'Wall panels');
  const mixed = q(withMethod('stick', 'panels'));
  assert.equal(mixed.title, 'Wall panels and framing');
  // the fixture has no material prices: with every wall stick framed nothing is left to charge
  assert.equal(q(withMethod('stick', 'stick')), undefined);
});
