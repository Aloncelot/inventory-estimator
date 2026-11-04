import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyOpenings, newType, typeUse, commitPlan } from './openingTypes.js';

const ext = (id, openings) => ({ id, x1: 0, y1: 0, x2: 400, y2: 0, kind: 'exterior', size: '2x6', openings });
const win = (atFt, widthIn, extra = {}) => ({ type: 'window', atFt, widthFt: widthIn / 12, ...extra });
const door = (atFt, widthIn, extra = {}) => ({ type: 'door', atFt, widthFt: widthIn / 12, ...extra });

test('exterior openings are typed by kind and width, narrowest first', () => {
  const plan = {
    walls: [
      ext('a', [win(2, 36), win(8, 72), door(14, 37.25)]),
      ext('b', [win(2, 36.5), win(8, 71.5), door(14, 36)]),
      { id: 'p', x1: 0, y1: 0, x2: 0, y2: 100, kind: 'partition', size: '2x4', openings: [door(1, 32)] },
    ],
  };
  const out = classifyOpenings(plan);
  assert.deepEqual(out.openingTypes.map((t) => [t.id, t.kind, t.widthIn, t.scope]), [['W1', 'window', 36, 'exterior'], ['W2', 'window', 71.5, 'exterior'], ['D1', 'door', 36, 'exterior'], ['D2', 'door', 32, 'interior']]);
  assert.deepEqual(out.walls[0].openings.map((o) => o.typeId), ['W1', 'W2', 'D1']);
  assert.deepEqual(out.walls[1].openings.map((o) => o.typeId), ['W1', 'W2', 'D1']);
  // interior openings get their own types (an interior 36" door is not the exterior D1)
  assert.equal(out.walls[2].openings[0].typeId, 'D2');
  assert.equal(out.openingTypes.find((t) => t.id === 'D2').scope, 'interior');
  assert.equal(typeUse(out).get('W1').count, 2);
  // stable: classifying again changes nothing
  assert.deepEqual(classifyOpenings(out), out);
});

test('an opening moved to another or a new type keeps it', () => {
  let plan = classifyOpenings({ walls: [ext('a', [win(2, 36), win(8, 36), win(14, 36)])] });
  assert.equal(plan.openingTypes.length, 1);
  // the middle window carries more load: its own type
  const t = newType(plan.openingTypes, plan.walls[0].openings[1]);
  plan = { ...plan, openingTypes: [...plan.openingTypes, t], walls: [{ ...plan.walls[0], openings: plan.walls[0].openings.map((o, i) => (i === 1 ? { ...o, typeId: t.id, typeManual: true } : o)) }] };
  plan = classifyOpenings(plan);
  assert.deepEqual(plan.walls[0].openings.map((o) => o.typeId), ['W1', 'W2', 'W1']);
  // a new 36" window still goes to the automatic W1, not the user's W2
  plan = classifyOpenings({ ...plan, walls: [{ ...plan.walls[0], openings: [...plan.walls[0].openings, win(20, 36)] }] });
  assert.equal(plan.walls[0].openings[3].typeId, 'W1');
});

test('opening types become Header rows in the linked exterior section', () => {
  const plan = {
    ptPerFt: 12, linked: true,
    walls: [ext('a', [win(2, 36), win(8, 36), door(14, 36)])],
  };
  let level = { plan, exteriorSections: [], interiorSections: [] };
  let id = 0;
  const make = (p) => ({ id: `s${++id}`, extras: [], sel: {}, ...p });
  level = commitPlan(level, plan, make);
  const sec = level.exteriorSections[0];
  assert.deepEqual(sec.extras.map((x) => [x.type, x.planType, x.openings[0].qty, x.openings[0].widthIn]), [['Header', 'W1', 2, 36], ['Header', 'D1', 1, 36]]);
  // the material picked on the W1 row in Wall panels stays through later syncs; the user's own rows stay
  const item = { id: 'lvl', sizeLabel: '1-3/4x9-1/2"' };
  const picked = sec.extras.map((x) => (x.planType === 'W1' ? { ...x, item, inputs: { plies: 2 } } : x));
  const withManual = { ...level, exteriorSections: [{ ...sec, extras: [...picked, { id: 'mine', type: 'Post', item: null }] }] };
  const morePlan = { ...level.plan, walls: [ext('a', [win(2, 36), win(8, 36), win(11, 36), door(14, 36)])] };
  const again = commitPlan(withManual, morePlan, make);
  const rows = again.exteriorSections[0].extras;
  assert.equal(rows.find((x) => x.planType === 'W1').item.id, 'lvl');
  assert.equal(rows.find((x) => x.planType === 'W1').inputs.plies, 2);
  assert.equal(rows.find((x) => x.planType === 'W1').openings[0].qty, 3, 'the count follows the plan');
  assert.ok(rows.some((x) => x.id === 'mine'));
});

test('posts on the plan become Post rows in their wall section', async () => {
  const { newPostType } = await import('./sync.js');
  const p1 = newPostType([], 'builtup');
  const p2 = newPostType([p1], 'solid');
  assert.deepEqual([p1.id, p1.plies, p2.id, p2.kind], ['P1', 3, 'P2', 'solid']);
  const plan = {
    ptPerFt: 12, linked: true, postTypes: [p1, p2],
    walls: [ext('a', []), { ...ext('b', []), posts: [{ atFt: 2, typeId: 'P1' }, { atFt: 9, typeId: 'P1' }, { atFt: 15, typeId: 'P2' }] }],
  };
  let id = 0;
  const level = commitPlan({ plan, exteriorSections: [], interiorSections: [] }, plan, (p) => ({ id: `s${++id}`, extras: [], sel: {}, ...p }));
  const rows = level.exteriorSections[0].extras.filter((x) => x.type === 'Post');
  assert.deepEqual(rows.map((r) => [r.planPost, r.inputs.numPosts, r.inputs.piecesPerPost, r.inputs.pieces]), [['P1', 2, 3, 6], ['P2', 1, 1, 1]]);
});

test('copying a plan to another level, with or without posts and hardware', async () => {
  const { copyPlan } = await import('./openingTypes.js');
  const src = { id: 'L2', name: 'Level 2', plan: { ptPerFt: 12, linked: true, fileKey: 'k', postTypes: [{ id: 'P1' }], hardwareTypes: [{ id: 'H1' }], walls: [{ ...ext('a', [win(2, 36)]), posts: [{ atFt: 1, typeId: 'P1' }], hardware: [{ atFt: 2, typeId: 'H1' }] }] } };
  const all = copyPlan(src);
  assert.equal(all.linked, false);
  assert.equal(all.fileKey, 'k', 'shows the same sheet');
  assert.equal(all.walls[0].posts.length, 1);
  assert.equal(all.copiedFrom, 'Level 2');
  const bare = copyPlan(src, { posts: false, hardware: false });
  assert.equal(bare.walls[0].posts, undefined);
  assert.equal(bare.walls[0].hardware, undefined);
  assert.equal(bare.postTypes, undefined);
  assert.equal(bare.walls[0].openings.length, 1);
  all.walls[0].openings.push({});
  assert.equal(src.plan.walls[0].openings.length, 1, 'a real copy');
});
