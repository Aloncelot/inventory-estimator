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
