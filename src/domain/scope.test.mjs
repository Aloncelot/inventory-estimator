import test from 'node:test';
import assert from 'node:assert/strict';
import { scoped, scopeOf } from './scope.js';
import { projectTotals } from './aggregate/projectTotals.js';
import { computeQuote } from './estimate/quote.js';
import { windowFlashing } from './plans/loose.js';
import { computeLoosePanel, tapeRollFt } from './estimate/index.js';

const pick = (price) => ({ familyLabel: 'SPF#2', sizeLabel: `2x6"-16'`, item: { priceWithMarkup: price, unit: 'pcs' } });
const sec = (id, kind, lf) => ({ id, kind, lengthLF: lf, heightFt: 9, studSpacingIn: 16, sel: { studs: pick(5) } });
const est = {
  levels: [{ id: 'L1', name: 'L1', exteriorSections: [sec('e', 'exterior', 40)], interiorSections: [sec('b', 'bearing', 20), sec('p', 'partition', 30), sec('k', 'knee', 10)] }],
  looseList: [{ id: 'x', kind: 'custom', rows: [{ id: 'r', type: 'Bolts', qty: 10, wastePct: 0, item: { item: { priceWithMarkup: 3, unit: 'pcs' } } }] }],
  trusses: [{ id: 't', amount: '1000' }],
};

test('scope: partitions out leaves the structural walls; loose, trusses and labor out leave them at 0', () => {
  assert.deepEqual(scopeOf(est), { structural: true, partitions: true, loose: true, trusses: true, labor: true });
  const noPart = scoped({ ...est, scope: { partitions: false } });
  assert.deepEqual(noPart.levels[0].interiorSections.map((s) => s.id), ['b']);
  assert.equal(noPart.levels[0].exteriorSections.length, 1);
  const noStruct = scoped({ ...est, scope: { structural: false } });
  assert.deepEqual([noStruct.levels[0].exteriorSections.length, noStruct.levels[0].interiorSections.map((s) => s.id).join()], [0, 'p,k']);
  const all = projectTotals(est);
  const only = projectTotals({ ...est, scope: { loose: false, trusses: false, labor: false } });
  assert.deepEqual([only.loose, only.trusses, only.labor], [0, 0, 0]);
  assert.equal(only.wallPanels, all.wallPanels);
  assert.ok(projectTotals({ ...est, scope: { partitions: false } }).wallPanels < all.wallPanels);
  const q = computeQuote({ ...est, scope: { trusses: false, labor: false } });
  assert.deepEqual(q.blocks.map((b) => b.key), ['wallPanels', 'loose']);
  assert.equal(computeQuote({ ...est, scope: { partitions: false } }).blocks[0].title, 'Wall panels · structural');
});

test('windows: blocking all around, tape 6" past each corner', () => {
  const plan = { walls: [{ openings: [{ type: 'window', widthFt: 3, typeId: 'W1' }, { type: 'door', widthFt: 3 }] }], openingTypes: [{ id: 'W1', heightIn: 60 }] };
  const w = windowFlashing(plan);
  assert.deepEqual(w, { count: 1, blockingLF: 16, tapeLF: 20 }); // 2(36+60)" = 16'; 2(48+72)" = 20'
  assert.equal(tapeRollFt('6in x 75ft'), 75);
  assert.equal(tapeRollFt(`4" x 90'`), 90);
  const c = computeLoosePanel({}, { windows: w });
  assert.equal(c.openLF, 16);
  assert.equal(c.exteriorRows.find((r) => r.key === 'windowTape').qtyFinal, 1);
  const typed = computeLoosePanel({ extInputs: { openingsBlockingLF: 50, openingsBlockingEdited: true } }, { windows: w });
  assert.equal(typed.openLF, 50);
});
