import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alignSheets, findCrossedBoxes, findDots, findShearTags, findCallouts, parsePostLabel, footprintName,
  readStructural, placeStructural, removeStructural,
} from './structural.js';
import { hardwareCounts, shearLengths } from './hardware.js';
import { mergeRedetect } from './sync.js';

const K = 9; // 1/8" = 1'-0"
const IN = K / 12;
const box = (x, y, wIn, hIn) => {
  const w = wIn * IN, h = hIn * IN;
  return [
    { x1: x - w / 2, y1: y - h / 2, x2: x + w / 2, y2: y + h / 2, style: '0.42|#000000' },
    { x1: x + w / 2, y1: y - h / 2, x2: x - w / 2, y2: y + h / 2, style: '0.42|#000000' },
  ];
};
const dot = (x, y) => Array.from({ length: 20 }, (_, i) => {
  const a = (i / 20) * Math.PI * 2;
  return { x1: x, y1: y, x2: x + 0.5 * Math.cos(a), y2: y + 0.5 * Math.sin(a), style: '0|#000000' };
});
const T = (str, x, y, angle = 0) => ({ str, x, y, angle });

// grid: columns 2.A (x=100) and 2.B (x=400) with bubbles top and bottom, rows 2.1 (y=100) and 2.2 (y=300)
const grid = (dx, dy, topY, botY, leftX, rightX) => [
  T('2.A', 100 + dx, topY), T('2.A', 100 + dx, botY), T('2.B', 400 + dx, topY), T('2.B', 400 + dx, botY),
  T('2.1', leftX, 100 + dy), T('2.1', rightX, 100 + dy), T('2.2', leftX, 300 + dy), T('2.2', rightX, 300 + dy),
  T('1', 10, 10), T('1', 20, 20), T('1', 30, 30), T('1', 40, 40), T('1', 50, 50), // detail numbers: ignored
];

test('sheets line up by grid bubbles, each bubble fixing only its own axis', () => {
  // the bubbles sit at different distances from the plan on each sheet
  const arch = grid(0, 0, 40, 380, 30, 470);
  const st = grid(-24, 215, 10, 600, 60, 420);
  const a = alignSheets(arch, st);
  assert.ok(Math.abs(a.dx - 24) < 0.01 && Math.abs(a.dy + 215) < 0.01, JSON.stringify(a));
  assert.deepEqual(a.labels, ['2.1', '2.2', '2.A', '2.B']);
  assert.equal(alignSheets(arch, [T('X', 0, 0)]), null);
});

test('post labels and footprints', () => {
  assert.deepEqual(parsePostLabel('(2) 2x6'), { name: '(2) 2x6', plies: 2 });
  assert.deepEqual(parsePostLabel('6x6'), { name: '6x6', solid: true });
  assert.equal(parsePostLabel('2x6'), null, 'one 2x is a stud');
  assert.equal(parsePostLabel('B7 HDR'), null);
  assert.equal(footprintName(3.5, 5.5), '4x6');
  assert.equal(footprintName(5.5, 5.5), '6x6');
  assert.equal(footprintName(3, 5.5), '(2) 2x6');
  assert.equal(footprintName(4.5, 5.5), '(3) 2x6');
});

// a 30' wall along y = 100 (2x6) and a 20' wall along x = 100 (2x4), arch coordinates
const archWalls = [
  { id: 'a', x1: 100, y1: 100, x2: 100 + 30 * K, y2: 100, t: 6.75, kind: 'exterior', size: '2x6', auto: true },
  { id: 'b', x1: 100, y1: 100, x2: 100, y2: 100 + 20 * K, t: 4.75, kind: 'partition', size: '2x4', auto: true },
];
// the structural sheet is shifted by (-24, +215) from the architectural one
const SX = -24, SY = 215;
const structPage = () => ({
  segments: [
    ...box(100 + 10 * K + SX, 100 + SY, 5.5, 5.5), // labeled 6x6 on wall a at 10'
    ...box(100 + 20 * K + SX, 100 + SY, 3, 5.5), // unlabeled (2) 2x6 footprint at 20' → 6x6 per the note
    ...box(100 + SX, 100 + 8 * K + SY, 3.5, 3.5), // unlabeled on wall b (2x4) at 8' → 4x4
    ...box(700 + SX, 700 + SY, 3.5, 3.5), // far from any wall
    ...box(300, 300, 40, 40), // a big X (shaft): not a post
    ...dot(100 + 25 * K + SX, 100 + SY),
  ],
  texts: [
    ...grid(SX, SY, 10, 600, 60, 420),
    T('6x6', 100 + 10 * K + SX + 12, 100 + SY + 14),
    T('E', 100 + 5 * K + SX, 100 + SY - 20), T(`12'-0"`, 100 + 5 * K + SX, 100 + SY - 8),
    T('D', 100 + SX - 22, 100 + 12 * K + SY, -Math.PI / 2), T(`8'-6"`, 100 + SX - 10, 100 + 12 * K + SY, -Math.PI / 2),
    T('(2) HDU5 W/', 100 + 28 * K + SX, 100 + SY + 30), T('ROD PER 32/S-412', 100 + 28 * K + SX, 100 + SY + 38),
  ],
});
const archTexts = grid(0, 0, 40, 380, 30, 470);

test('posts, rods, shear tags and callouts are read off the structural sheet', () => {
  const sp = structPage();
  assert.equal(findCrossedBoxes(sp, K).length, 4);
  assert.equal(findDots(sp).length, 1);
  assert.deepEqual(findShearTags(sp.texts, K).map((s) => [s.type, s.lengthFt, s.vertical]), [['E', 12, false], ['D', 8.5, true]]);
  assert.deepEqual(findCallouts(sp.texts).map((c) => [c.qty, c.model]), [[2, 'HDU5']]);
  const align = alignSheets(archTexts, sp.texts);
  const found = readStructural(sp, { ptPerFt: K, align });
  assert.deepEqual(found.posts.map((p) => [p.name, p.labeled]).sort(), [['(2) 2x6', false], ['4x4', false], ['4x4', false], ['6x6', true]]);
  const p6 = found.posts.find((p) => p.labeled);
  assert.ok(Math.abs(p6.x - (100 + 10 * K)) < 0.01 && Math.abs(p6.y - 100) < 0.01, 'in arch points');
});

test('placed on the walls; placing again replaces, your own items stay', () => {
  const sp = structPage();
  const found = readStructural(sp, { ptPerFt: K, align: alignSheets(archTexts, sp.texts) });
  const mine = { id: 'P1', kind: 'builtup', plies: 3 };
  const plan = { ptPerFt: K, walls: archWalls.map((w) => (w.id === 'a' ? { ...w, posts: [{ atFt: 2, typeId: 'P1' }] } : w)), postTypes: [mine] };
  const r = placeStructural(plan, found);
  assert.deepEqual(r.placed, { posts: 3, rods: 1, callouts: 2, shear: 2 });
  assert.deepEqual(r.missed.map((m) => m.kind), ['post']);
  const a = r.plan.walls.find((w) => w.id === 'a');
  const b = r.plan.walls.find((w) => w.id === 'b');
  const typeOf = (p) => r.plan.postTypes.find((t) => t.id === p.typeId);
  assert.deepEqual(a.posts.map((p) => [p.atFt, typeOf(p).notes || 'mine']), [[2, 'mine'], [10, '6x6'], [20, '6x6']]);
  assert.equal(typeOf(a.posts[1]).kind, 'solid');
  assert.equal(typeOf(a.posts[1]).widthIn, 5.5);
  assert.deepEqual(b.posts.map((p) => [p.atFt, typeOf(p).notes]), [[8, '4x4']]);
  assert.deepEqual(a.shear, [{ type: 'E', lengthFt: 12 }]);
  assert.deepEqual(b.shear, [{ type: 'D', lengthFt: 8.5 }]);
  const hw = new Map(r.plan.hardwareTypes.map((t) => [t.name, t.id]));
  const c = hardwareCounts(r.plan);
  assert.equal(c.get(hw.get('Tie-down rod (ATS)')), 1);
  assert.equal(c.get(hw.get('HDU5 hold-down')), 2);
  assert.deepEqual([...shearLengths(r.plan)], [['E', 12], ['D', 8.5]]);

  // as drawn instead of the note: the (2) 2x6 footprint stays built-up
  const drawn = placeStructural(plan, found, { unlabeled: {} });
  const a2 = drawn.plan.walls.find((w) => w.id === 'a');
  assert.equal(drawn.plan.postTypes.find((t) => t.id === a2.posts[2].typeId).plies, 2);

  // again: same result, no duplicate types
  const again = placeStructural(r.plan, found);
  assert.equal(again.plan.postTypes.length, r.plan.postTypes.length);
  assert.equal(again.plan.walls.find((w) => w.id === 'a').posts.length, 3);
  // shear types you set by hand stay
  const edited = { ...again.plan, walls: again.plan.walls.map((w) => (w.id === 'a' ? { ...w, shear: [{ type: 'G', lengthFt: 30 }], shearManual: true } : w)) };
  assert.deepEqual(placeStructural(edited, found).plan.walls.find((w) => w.id === 'a').shear, [{ type: 'G', lengthFt: 30 }]);

  // removed: only yours stays
  const gone = removeStructural(r.plan);
  assert.deepEqual(gone.walls.find((w) => w.id === 'a').posts, [{ atFt: 2, typeId: 'P1' }]);
  assert.equal(gone.walls.find((w) => w.id === 'b').posts, undefined);
  assert.deepEqual(gone.postTypes, [mine]);
  assert.equal(gone.hardwareTypes.length, 0, 'import-made hardware types with nothing placed go');
});

test('hardware along shear walls at each type\'s spacing', () => {
  const plan = {
    ptPerFt: K,
    walls: [{ ...archWalls[0], shear: [{ type: 'E', lengthFt: 12 }, { type: 'D', lengthFt: 6 }] }, { ...archWalls[1], shear: [{ type: 'A', lengthFt: 8 }] }],
    hardwareTypes: [{ id: 'H1', name: 'Anchor bolt', rule: 'shear', byType: { D: 32, E: 24, A: 0 } }],
  };
  assert.equal(hardwareCounts(plan).get('H1'), (Math.ceil(144 / 24) + 1) + (Math.ceil(72 / 32) + 1));
});

test('detecting the walls again keeps what was placed on auto walls', () => {
  const old = [{ ...archWalls[0], posts: [{ atFt: 10, typeId: 'P2', src: 'sd' }], shear: [{ type: 'E', lengthFt: 12 }] }];
  const fresh = [{ ...archWalls[0], id: 'n1' }];
  const out = mergeRedetect(old, [], fresh, K);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].posts, [{ atFt: 10, typeId: 'P2', src: 'sd' }]);
  assert.deepEqual(out[0].shear, [{ type: 'E', lengthFt: 12 }]);
  assert.equal(out[0].auto, true, 'still a detected wall');
});
