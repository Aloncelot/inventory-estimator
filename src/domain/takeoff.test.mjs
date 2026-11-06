import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTakeoff, looseCategory, describe as describeSel, takeoffCsv } from './takeoff.js';
import { projectOf } from './estimate/index.js';

const pick = (family, size, price) => ({ familyLabel: family, sizeLabel: size, vendorName: 'Yard', item: { priceWithMarkup: price, unit: 'pcs', familyDisplay: family, sizeDisplay: size } });
const stud = pick('SPF#2', `2x6"-104 5/8"`, 5);
const sec = (id, kind, lf) => ({ id, kind, lengthLF: lf, heightFt: 9, studSpacingIn: 16, sel: { studs: stud, bottomPlate: pick('SPF#2', `2x6"-16'`, 12), topPlate: pick('SPF#2', `2x6"-16'`, 12) } });
const est = {
  levels: [
    { id: 'L1', name: 'Level 1', exteriorSections: [sec('e1', 'exterior', 40)], interiorSections: [sec('p1', 'partition', 30), sec('p2', 'partition', 10)] },
    { id: 'L2', name: 'Level 2', exteriorSections: [sec('e2', 'exterior', 40)], interiorSections: [] },
  ],
  looseList: [
    { id: 'lv2', name: 'Level 2', kind: 'level', rows: [
      { id: 'a', type: 'Hangers - Joist', item: pick('Simpson', 'LUS28', 2), qty: 20, wastePct: 0 },
      { id: 'b', type: 'Beams', item: pick('LVL', `1-3/4x11-7/8"`, 8), inputs: { lengthLF: 32 }, wastePct: 0 },
      { id: 'c', type: 'Stringer', item: pick('SPF#2', `2x12"-16'`, 30), qty: 6, wastePct: 0 },
      { id: 'd', type: 'Blocking Bathroom/Kitchen/Stairs', item: pick('SPF#2', `2x6"-8'`, 6), inputs: { lengthLF: 40 }, wastePct: 0 },
      { id: 'e', type: 'Subfloor', item: pick('OSB T&G', `4x8'-3/4"`, 40), inputs: { area: 320 }, wastePct: 0 },
    ] },
    { id: 'rf', name: 'Roof', kind: 'roof', inputs: { roofArea: 640 }, sel: { sheathing: pick('OSB', `4x8'-1/2"`, 20) } },
  ],
};

test('rows sort into hardware, beams, stairs, blocking, floor and roof', () => {
  assert.equal(looseCategory('Hangers - Stringer'), 'hardware');
  assert.equal(looseCategory('Blocking Bathroom/Kitchen/Stairs'), 'blocking');
  assert.equal(looseCategory('Stringer'), 'stairs');
  assert.equal(looseCategory('Beams'), 'beams');
  assert.equal(looseCategory('I-Joist'), 'floor');
  assert.equal(looseCategory('Sheathing', { roof: true }), 'roof');
  assert.equal(looseCategory('Hurricane tie', { roof: true }), 'hardware');
  assert.equal(describeSel(stud).name, `2x6"-104 5/8" SPF#2`);
});

test('by level: wall panels by wall type, loose by kind; the same material once a group; totals match Summary', () => {
  const t = buildTakeoff(est);
  const l1 = t.levels.find((l) => l.name === 'Level 1');
  assert.deepEqual(l1.wallPanels.map((g) => g.key), ['exterior', 'partition']);
  const part = l1.wallPanels.find((g) => g.key === 'partition');
  assert.equal(part.lines.filter((l) => l.name === `2x6"-104 5/8" SPF#2`).length, 1, 'two partition sections, one studs line');
  const l2 = t.levels.find((l) => l.name === 'Level 2');
  assert.ok(['hardware', 'beams', 'stairs', 'floor', 'blocking'].every((k) => l2.loose.some((g) => g.key === k)));
  assert.ok(t.levels.find((l) => l.name === 'Roof').loose.some((g) => g.key === 'roof'));
  assert.ok(Math.abs(t.total - projectOf(est).subtotal) < 0.05, `${t.total} vs ${projectOf(est).subtotal}`);
  const csv = takeoffCsv(t);
  assert.ok(csv.split('\n')[0].includes('Material') && !csv.includes('Unit price'));
  assert.ok(takeoffCsv(t, { prices: true }).includes('Unit price'));
});

test('sheathing ships on the panels or loose', async () => {
  const { sheathingShips, sheetLengthFt } = await import('./takeoff.js');
  assert.equal(sheetLengthFt({ sizeLabel: `4x9'-7/16"` }), 9);
  assert.equal(sheetLengthFt({}), 8);
  assert.equal(sheathingShips({ heightFt: 8, sheetFt: 8 }).where, 'panels');
  assert.equal(sheathingShips({ heightFt: 10, sheetFt: 8 }).where, 'loose');
  assert.equal(sheathingShips({ heightFt: 8, sheetFt: 8, horizontal: true }).where, 'loose');
  assert.equal(sheathingShips({ mode: 'panels', heightFt: 12 }).where, 'panels');
  const s = (h) => ({ id: 'e', kind: 'exterior', lengthLF: 40, heightFt: h, studSpacingIn: 16, sel: { sheathing: { familyLabel: 'ZIP', sizeLabel: `4x8'-7/16"`, item: { priceWithMarkup: 30, unit: 'sheet' } } } });
  const t8 = buildTakeoff({ levels: [{ id: 'L', name: 'L1', exteriorSections: [s(8)], interiorSections: [] }] });
  assert.ok(t8.levels[0].wallPanels[0].lines.some((l) => l.name.includes('ZIP')));
  const t10 = buildTakeoff({ levels: [{ id: 'L', name: 'L1', exteriorSections: [s(10)], interiorSections: [] }] });
  assert.ok(!t10.levels[0].wallPanels.some((g) => g.lines.some((l) => l.name.includes('ZIP'))));
  assert.ok(t10.levels[0].loose.find((g) => g.key === 'sheathing').lines.some((l) => l.name.includes('ZIP')));
});
