import test from 'node:test';
import assert from 'node:assert/strict';
import { hardwareCounts, newHardwareType } from './hardware.js';
import { withPlanLoose as withHardware } from './loose.js';

const plan = {
  ptPerFt: 12,
  walls: [
    { id: 'a', x1: 0, y1: 0, x2: 192, y2: 0, kind: 'shear', size: '2x4', hardware: [{ atFt: 3, typeId: 'H3' }] }, // 16'
    { id: 'b', x1: 0, y1: 0, x2: 0, y2: 96, kind: 'shear', size: '2x4' }, // 8'
    { id: 'c', x1: 0, y1: 0, x2: 0, y2: 96, kind: 'partition', size: '2x4' },
  ],
  hardwareTypes: [
    { id: 'H1', name: 'HDU5', rule: 'ends', perEnd: 1, groups: ['interior|shear|2x4'] },
    { id: 'H2', name: 'Anchor bolt', rule: 'spacing', spacingIn: 32, groups: ['interior|shear|2x4'] },
    { id: 'H3', name: 'MSTA strap', rule: 'each' },
  ],
};

test('hardware counts by rule', () => {
  const c = hardwareCounts(plan);
  assert.equal(c.get('H1'), 4, 'two shear walls × two ends');
  assert.equal(c.get('H2'), (Math.ceil(192 / 32) + 1) + (Math.ceil(96 / 32) + 1));
  assert.equal(c.get('H3'), 1);
  assert.equal(newHardwareType(plan.hardwareTypes).id, 'H4');
});

test('hardware goes to a Loose material section of the level, keeping the picked items', () => {
  const est = { levels: [{ id: 'L2', name: 'Level 2', plan }], looseList: [{ id: 'lv', name: '2nd Level', rows: [] }, { id: 'rf', name: 'Roof', rows: [] }] };
  const a = withHardware(est);
  const sec = a.looseList[0];
  assert.equal(sec.name, '2nd Level', 'into the level section of Loose material');
  assert.equal(sec.planLevel, 'L2');
  assert.equal(a.looseList.length, 2, 'no extra section');
  assert.deepEqual(sec.rows.map((r) => [r.type, r.qty]), [['H1 · HDU5', 4], ['H2 · Anchor bolt', 11], ['H3 · MSTA strap', 1]]);
  const picked = { ...a, looseList: a.looseList.map((s) => (s.id !== sec.id ? s : { ...s, rows: s.rows.map((r, i) => (i === 0 ? { ...r, item: { id: 'hdu5' } } : r)) })) };
  const b = withHardware(picked);
  assert.equal(b.looseList[0].rows[0].item.id, 'hdu5');
  assert.equal(withHardware(b), b, 'no change, same object');
});
