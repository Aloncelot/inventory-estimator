import test from 'node:test';
import assert from 'node:assert/strict';
import { standardThick, thickSize, followThick } from './sync.js';

test('standard thickness: studs plus finishes', () => {
  assert.equal(standardThick({ kind: 'partition', size: '2x4' }), 4.75);
  assert.equal(standardThick({ kind: 'bearing', size: '2x6' }), 6.75);
  assert.equal(standardThick({ kind: 'exterior', size: '2x6' }), 8.25);
  assert.equal(standardThick({ kind: 'shear', size: '2x4', double: true, kind2: 'bearing', size2: '2x6' }), 3.5 + 5.5 + 1.25 + 1);
  assert.equal(standardThick({ size: '(2)2x4' }), 3.5 + 3.5 + 1.25 + 1); // legacy double
});

test('thickSize reads the size a wall is drawn at', () => {
  assert.equal(thickSize({ kind: 'partition', size: '2x4', t: 4.75 }), '2x4');
  assert.equal(thickSize({ kind: 'partition', size: '2x4', t: 6.9 }), '2x6'); // drawn thicker than its studs
  assert.equal(thickSize({ kind: 'exterior', size: '2x6', t: 8.25 }), '2x6');
  assert.equal(thickSize({ kind: 'partition', size: '2x4', t: 12 }), '');
  assert.equal(thickSize({ kind: 'shear', size: '2x4', double: true, t: 9.25 }), '');
});

test('followThick: a standard wall follows its studs, a custom one keeps its thickness', () => {
  const w = { kind: 'partition', size: '2x4', t: 4.75 };
  assert.equal(followThick(w, { ...w, size: '2x6' }).t, 6.75);
  assert.equal(followThick(w, { ...w, kind: 'exterior' }).t, 6.25);
  assert.equal(followThick({ ...w, t: 4.9 }, { ...w, t: 4.9, size: '2x8' }).t, 8.5); // detected, about standard
  assert.equal(followThick({ ...w, t: 12 }, { ...w, t: 12, size: '2x6' }).t, 12);
  assert.equal(followThick(w, { ...w, size: '2x6', t: 10 }).t, 10); // explicit thickness wins
});

import { firstWallSide, doubleWallBands } from './sync.js';

test('double walls: the 1st wall goes outside on exterior walls, left inside, and swaps', () => {
  // a 20' × 10' box drawn clockwise on the sheet (y down), 12 pt per ft
  const box = [
    { id: 'n', x1: 0, y1: 0, x2: 240, y2: 0, kind: 'exterior', size: '2x6', double: true, kind2: 'bearing', size2: '2x4' },
    { id: 'e', x1: 240, y1: 0, x2: 240, y2: 120, kind: 'exterior', size: '2x6' },
    { id: 's', x1: 240, y1: 120, x2: 0, y2: 120, kind: 'exterior', size: '2x6', double: true, kind2: 'shear', size2: '2x4' },
    { id: 'w', x1: 0, y1: 120, x2: 0, y2: 0, kind: 'exterior', size: '2x6' },
    { id: 'i', x1: 120, y1: 0, x2: 120, y2: 120, kind: 'shear', size: '2x4', double: true, kind2: 'bearing', size2: '2x6' },
  ];
  // north wall drawn east: left normal points up the sheet (y < 0), which is outside
  assert.equal(firstWallSide(box[0], box, 12), 1);
  // south wall drawn west: left normal points down the sheet (y > 0), outside again
  assert.equal(firstWallSide(box[2], box, 12), 1);
  // the same wall drawn the other way round still puts the 1st wall outside
  const rev = { ...box[0], x1: 240, x2: 0 };
  assert.equal(firstWallSide(rev, [rev, ...box.slice(1)], 12), -1);
  // interior: left of the drawing direction; sidesFlip swaps
  assert.equal(firstWallSide(box[4], box, 12), 1);
  assert.equal(firstWallSide({ ...box[4], sidesFlip: true }, box, 12), -1);
  assert.equal(firstWallSide({ ...box[0], sidesFlip: true }, box, 12), -1);
});

test('double walls are drawn as two bands as wide as their studs, gap between', () => {
  const w = { kind: 'shear', size: '2x4', double: true, kind2: 'bearing', size2: '2x6' };
  const t = 10; // 3.5 + 1 + 5.5
  const [a, b] = doubleWallBands(w, 1, t);
  assert.equal(a.kind, 'shear'); assert.equal(b.kind, 'bearing');
  assert.equal(a.width, 3.5); assert.equal(b.width, 5.5);
  assert.equal(a.off, 5 - 1.75); assert.equal(b.off, -(5 - 2.75));
  assert.equal(a.off - a.width / 2 - (b.off + b.width / 2), 1, '1" gap');
  const [a2] = doubleWallBands(w, -1, t);
  assert.equal(a2.off, -a.off);
});
