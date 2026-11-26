import test from 'node:test';
import assert from 'node:assert/strict';
import { moveWall, setEnd, attachedEnds, splitWall, separateDoubleWall } from './move.js';

const k = 10;
// a U: a horizontal wall at y=0 from x=0..100, legs down from both ends to y=100
const base = () => [
  { id: 'top', x1: 0, y1: 0, x2: 100, y2: 0, t: 5 },
  { id: 'left', x1: 0, y1: 0, x2: 0, y2: 100, t: 5 },
  { id: 'right', x1: 100, y1: 100, x2: 100, y2: 0, t: 5 },
  { id: 'next', x1: 100, y1: 0, x2: 200, y2: 0, t: 5 },
  { id: 'far', x1: 300, y1: 300, x2: 400, y2: 300, t: 5 },
];

test('walls meeting a wall are found at its ends and sides', () => {
  const ends = attachedEnds(base(), 'top', k).map((a) => `${a.id}:${a.end}`).sort();
  assert.deepEqual(ends, ['left:1', 'next:1', 'right:2']);
});

test('moving a wall with grip stretches the legs and leaves a wall in line alone', () => {
  const out = moveWall(base(), 'top', [0, -20], { grip: true, k });
  const by = Object.fromEntries(out.map((w) => [w.id, w]));
  assert.deepEqual([by.top.y1, by.top.y2], [-20, -20]);
  assert.deepEqual([by.left.x1, by.left.y1, by.left.y2], [0, -20, 100]);
  assert.deepEqual([by.right.y2, by.right.y1], [-20, 100]);
  assert.deepEqual([by.next.y1, by.next.y2], [0, 0]);
  assert.equal(by.far.x1, 300);
});

test('without grip only the wall moves', () => {
  const out = moveWall(base(), 'top', [0, 30], { grip: false, k });
  assert.equal(out[1].y1, 0);
  assert.equal(out[0].y1, 30);
});

test('a wall moved along its line takes the wall in line with it', () => {
  const out = moveWall(base(), 'top', [10, 0], { grip: true, k });
  const next = out.find((w) => w.id === 'next');
  assert.deepEqual([next.x1, next.x2], [110, 200]);
});

test('a leg is not folded over', () => {
  const out = moveWall(base(), 'top', [0, 120], { grip: true, k });
  assert.equal(out.find((w) => w.id === 'left').y1, 0);
});

test('moving the start of a wall shifts its openings', () => {
  const w = { id: 'a', x1: 0, y1: 0, x2: 100, y2: 0, openings: [{ type: 'door', atFt: 4, widthFt: 3 }] };
  const n = setEnd(w, '1', [-20, 0], k);
  assert.equal(n.openings[0].atFt, 6);
});

test('splitting a wall creates two walls and distributes openings, posts and hardware', () => {
  const w = {
    id: 'w1', x1: 0, y1: 0, x2: 200, y2: 0, t: 6.5, kind: 'exterior', size: '2x6',
    openings: [{ type: 'door', atFt: 3, widthFt: 3 }, { type: 'window', atFt: 14, widthFt: 3 }],
    posts: [{ atFt: 2, typeId: 'P1' }, { atFt: 15, typeId: 'P2' }],
    hardware: [{ atFt: 12, typeId: 'H1' }],
  };
  const res = splitWall(w, [100, 4], k, () => 'w2');
  assert.ok(res);
  const [a, b] = res;
  assert.deepEqual([a.id, a.x1, a.x2, b.id, b.x1, b.x2], ['w1', 0, 100, 'w2', 100, 200]);
  assert.deepEqual(a.openings, [{ type: 'door', atFt: 3, widthFt: 3 }]);
  assert.deepEqual(b.openings, [{ type: 'window', atFt: 4, widthFt: 3 }]);
  assert.deepEqual(a.posts, [{ atFt: 2, typeId: 'P1' }]);
  assert.deepEqual(b.posts, [{ atFt: 5, typeId: 'P2' }]);
  assert.deepEqual(a.hardware, []);
  assert.deepEqual(b.hardware, [{ atFt: 2, typeId: 'H1' }]);
  assert.equal(splitWall(w, [1, 0], k, () => 'w3'), null, 'too close to start is ignored');
});

test('separating a double wall creates two independent single walls on their band centrelines', () => {
  const w = { id: 'd1', x1: 0, y1: 0, x2: 120, y2: 0, t: 10, double: true, kind: 'shear', size: '2x4', kind2: 'partition', size2: '2x4', openings: [] };
  const parts = separateDoubleWall(w, [w], 12, () => 'd2');
  assert.ok(parts);
  const [a, b] = parts;
  assert.equal(a.id, 'd1');
  assert.equal(b.id, 'd2');
  assert.ok(!a.double && !b.double, 'both are single walls');
  assert.equal(a.kind, 'shear');
  assert.equal(b.kind, 'partition');
  assert.ok(Math.abs(a.y1 - b.y1) > 4, `separated onto distinct centrelines (${a.y1} vs ${b.y1})`);
});
