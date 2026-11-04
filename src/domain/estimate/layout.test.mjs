import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutCheck, cutLinear, cutSheets, panelize, studPositions, looseJoints, wallsOf, studDepthIn, sheetLayout } from './layout.js';
import { feet } from '../../components/layout/wallsFigure.js';

const pick = (f, s) => ({ family: f.toLowerCase(), familyLabel: f, sizeLabel: s, vendorId: 'v', item: { priceWithMarkup: 10, sizeDisplay: s, familyDisplay: f } });

test('cutting: first-fit decreasing on stock lengths, guillotine on sheets', () => {
  assert.equal(cutLinear([96, 96, 48, 48], 96).pieces, 3);
  assert.equal(cutLinear([40, 40, 40], 96).pieces, 2);          // 2 per piece with kerf
  assert.equal(cutLinear([120], 96).tooLong, 1);
  assert.equal(cutSheets([[48, 96], [48, 12], [48, 12]]).sheets, 2);
  assert.equal(cutSheets([[24, 96], [24, 96]]).sheets, 1);
});

test('walls of a rectangle: two through walls, two butting walls', () => {
  const w = wallsOf(40, 30, 5.5);
  assert.deepEqual(w.map((x) => x.length), [480, 360 - 11, 480, 360 - 11]);
  assert.equal(studDepthIn(`2x4"-8'`), 3.5);
  assert.deepEqual(panelize(200, 96).map((p) => p.length), [96, 96, 8]);
  assert.deepEqual(studPositions(96, 16), [0, 16, 32, 48, 64, 80, 94.5]);
});

test('loose top plate joints stay 24" away from panel joints', () => {
  const { joints, clashes } = looseJoints(480, 192, [96, 192, 288, 384]);
  assert.equal(clashes, 0);
  assert.ok(joints.every((j) => [96, 192, 288, 384].every((p) => Math.abs(p - j) >= 24)));
});

test('layout check compares the cuts with the estimate per material', () => {
  const level = {
    exteriorSections: [{ id: 's', lengthLF: 140, heightFt: 9, studSpacingIn: 16, studMultiplier: 1,
      sel: { bottomPlate: pick('PT', `2x6"-8'`), topPlate: pick('SPF#2', `2x6"-8'`), studs: pick('SPF#2', `2x6"-10'`), blocking: pick('SPF#2', `2x6"-8'`), sheathing: pick('Green Zip', `4x8'-7/16"`) } }],
    looseMaterials: { sel: { extTopPlate: pick('SPF#2', `2x6"-16'`), extBottomPT: pick('PT', `2x6"-16'`) } },
  };
  const r = layoutCheck(level, { lengthFt: 40, widthFt: 30 }, { panelLenFt: 8 });
  assert.equal(r.perimeterLF, 140);
  assert.equal(r.panelCount, 18);
  assert.equal(r.looseClashes, 0);
  const row = Object.fromEntries(r.rows.map((x) => [x.key, x]));
  assert.equal(row.bottomPlate.needed, 18);                     // one 8' plate per panel
  assert.equal(row.bottomPlate.status, 'match');                // 2 left = 11% vs 10% waste
  assert.ok(row.studs.needed > row.studs.est.raw);              // panel end studs + corner backers
  assert.ok(row.studs.leftover >= 0);
  assert.equal(layoutCheck(level, { lengthFt: 0, widthFt: 30 }), null);
});

test('a stud stock shorter than the wall flags the row', () => {
  const level = { exteriorSections: [{ id: 's', lengthLF: 40, heightFt: 10, sel: { studs: pick('SPF#2', `2x6"-8'`) } }], looseMaterials: {} };
  const r = layoutCheck(level, { lengthFt: 12, widthFt: 8 });
  assert.equal(r.rows.find((x) => x.key === 'studs').status, 'stock-too-short');
});

test('horizontal sheets go like bricks; vertical sheets stand side by side', () => {
  const h = sheetLayout(0, 192, 108, 'horizontal').map((x) => [x.a0, x.a1 - x.a0, x.z0]);
  assert.deepEqual(h, [[0, 96, 0], [96, 96, 0], [0, 48, 48], [48, 96, 48], [144, 48, 48], [0, 96, 96], [96, 96, 96]]);
  const v = sheetLayout(0, 96, 108, 'vertical').map((x) => [x.a1 - x.a0, x.z1 - x.z0]);
  assert.deepEqual(v, [[48, 96], [48, 96], [48, 12], [48, 12]]);
});

test('sizes are written with fractions', () => {
  assert.deepEqual([48, 30, 18.5, 6.5, 13.125].map(feet), ["4'", `2'-6"`, `1'-6"1/2`, `6"1/2`, `1'-1"1/8`]);
});
