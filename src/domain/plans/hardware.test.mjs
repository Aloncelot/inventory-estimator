import test from 'node:test';
import assert from 'node:assert/strict';
import { HW_RULES, hardwareCounts, newHardwareType, describeRule, hardwarePreset } from './hardware.js';
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

test('derived hardware rules: posts, beams, describeRule, and hardwarePreset', () => {
  assert.ok(HW_RULES.some((r) => r.value === 'posts'));
  assert.ok(HW_RULES.some((r) => r.value === 'beams'));

  const p = {
    ptPerFt: 12,
    walls: [
      { id: 'w1', x1: 0, y1: 0, x2: 120, y2: 0, kind: 'exterior', size: '2x6', posts: [{ atFt: 2 }, { atFt: 8 }], hardware: [{ atFt: 5, typeId: 'H1' }] },
      { id: 'w2', x1: 0, y1: 0, x2: 0, y2: 96, kind: 'bearing', size: '2x6', posts: [{ atFt: 4 }] },
    ],
    beams: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }],
    hardwareTypes: [
      { id: 'H1', name: 'Post base', rule: 'posts', perPost: 1 },
      { id: 'H2', name: 'Post strap', rule: 'posts', perPost: 2 },
      { id: 'H3', name: 'Beam hanger', rule: 'beams', perBeam: 2 },
      { id: 'H4', name: 'Beam clip', rule: 'beams', perBeam: 4 },
    ],
  };
  const c = hardwareCounts(p);
  assert.equal(c.get('H1'), 3 + 1, '3 posts × 1 + 1 manually placed');
  assert.equal(c.get('H2'), 3 * 2, '3 posts × 2');
  assert.equal(c.get('H3'), 3 * 2, '3 beams × 2 ends');
  assert.equal(c.get('H4'), 3 * 4, '3 beams × 4');

  assert.equal(describeRule({ rule: 'posts', perPost: 1 }), '1 per structural post');
  assert.equal(describeRule({ rule: 'posts', perPost: 2 }), '2 per structural post');
  assert.equal(describeRule({ rule: 'beams', perBeam: 2 }), '2 per beam (both ends)');

  const existing = [{ id: 'H2' }];
  const pb = hardwarePreset('postBase', existing);
  assert.equal(pb.id, 'H3');
  assert.equal(pb.rule, 'posts');
  assert.equal(pb.perPost, 1);

  const pc = hardwarePreset('postCap', existing);
  assert.equal(pc.rule, 'posts');
  assert.equal(pc.perPost, 1);

  const bh = hardwarePreset('beamHanger', existing);
  assert.equal(bh.rule, 'beams');
  assert.equal(bh.perBeam, 2);

  const sc = hardwarePreset('shearClips', existing, { shearGroups: ['interior|shear|2x4'] });
  assert.equal(sc.rule, 'ends');
  assert.equal(sc.perEnd, 1);
  assert.deepEqual(sc.groups, ['interior|shear|2x4']);
});
