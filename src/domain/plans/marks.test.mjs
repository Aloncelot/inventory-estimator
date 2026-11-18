import test from 'node:test';
import assert from 'node:assert/strict';
import { tagFrames, dimensionLines, textCenter } from './marks.js';
import { dropDoorLeaves } from './detect.js';

const seg = (x1, y1, x2, y2, w = 0.24) => ({ x1, y1, x2, y2, w, style: `${w}|#000000` });
const box = (x, y, w, h) => [seg(x, y, x + w, y), seg(x + w, y, x + w, y + h), seg(x + w, y + h, x, y + h), seg(x, y + h, x, y)];

test('text centre follows its rotation', () => {
  const [cx, cy] = textCenter({ str: 'D6', x: 100, y: 200, size: 10, angle: 0, w: 12 });
  assert.ok(Math.abs(cx - 106) < 0.01 && cy < 200);
  const [vx, vy] = textCenter({ str: '2-105C', x: 100, y: 200, size: 10, angle: -Math.PI / 2, w: 30 });
  assert.ok(Math.abs(vy - 185) < 0.01 && vx < 100, 'vertical text runs up the sheet');
});

test('tag frames: a box snug around a label, not a closet around one', () => {
  // wall-type tag: 18 pt box with "D6" in it
  const tag = box(100, 100, 18, 18);
  // closet: 30 pt wide, 22 pt deep, its label running across it
  const closet = [seg(200, 100, 222, 100), seg(200, 130, 222, 130)];
  const page = {
    segments: [...tag, ...closet],
    texts: [
      { str: 'D6', x: 103, y: 112.5, size: 9.5, angle: 0, w: 12 },
      { str: '2-108C', x: 214, y: 131, size: 9.5, angle: -Math.PI / 2, w: 31 },
    ],
  };
  const marked = tagFrames(page);
  assert.deepEqual([...marked].sort(), [0, 1, 2, 3], 'all four sides of the tag');
});

test('dimension lines: ticks at both ends; a wall face used as a witness line is not one', () => {
  const tick = (x, y) => [seg(x, y, x + 4.5, y + 4.5, 1.3), seg(x, y, x - 4.5, y - 4.5, 1.3)];
  const dim = seg(100, 50, 140, 50);
  const face = seg(0, 80, 300, 80);
  const page = {
    segments: [dim, ...tick(102, 50), ...tick(138, 50), face, ...tick(150, 80), ...tick(190, 80)],
    texts: [],
  };
  const marked = dimensionLines(page);
  assert.ok(marked.has(0), 'the dimension line');
  assert.ok(!marked.has(5), 'the wall face');
});

test('door leaves: an askew short wall hanging from one end goes, a bay wall stays', () => {
  const k = 9;
  const w = (x1, y1, x2, y2) => ({ x1, y1, x2, y2, thickIn: 5, lengthFt: Math.hypot(x2 - x1, y2 - y1) / k });
  const grid = [w(0, 0, 400, 0), w(0, 0, 0, 300), w(400, 0, 400, 300)];
  const leaf = w(100, 0, 120, 20); // 3' leaf open at 45°, loose at its tip
  const bay = [w(200, 0, 215, 15), w(215, 15, 245, 15), w(245, 15, 260, 0)];
  const out = dropDoorLeaves([...grid, leaf, ...bay], [], k);
  assert.ok(!out.includes(leaf));
  for (const b of bay) assert.ok(out.includes(b));
});

test('curves drawn as short lines: tub basin and open door leaf are no wall faces', async () => {
  const { curveMarks } = await import('./marks.js');
  const k = 9; // 1/8" = 1'-0"
  const segs = [];
  const poly = (pts, pid) => { for (let i = 1; i < pts.length; i++) segs.push({ ...seg(...pts[i - 1], ...pts[i]), pid }); };
  // tub basin: a straight side running on from a rounded end
  const arcPts = (cx, cy, r, a0, a1, n = 8) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  poly(arcPts(100, 20, 10, Math.PI / 2, Math.PI * 1.5), 1); // left end, from bottom to top
  segs.push({ ...seg(100, 10, 140, 10), pid: 2 }); // basin side, on from the curve's top end
  segs.push({ ...seg(95, 6, 145, 6), pid: 3 }); // tub rim, a corner of its own
  // door: hinge at (300, 100), 3' leaf open along +y, swing to the closed position along +x
  const r = 3 * k;
  poly(arcPts(300, 100, r, Math.PI / 2, 0), 4);
  segs.push({ ...seg(300, 100, 300, 100 + r), pid: 5 }, { ...seg(301.3, 100, 301.3, 100 + r), pid: 6 });
  // wall face beside the hinge, one leaf length too, but a wall thickness from the next face
  segs.push({ ...seg(296, 100, 296, 100 + r), pid: 7 }, { ...seg(292, 100, 292, 100 + r), pid: 8 });
  const { marked, chords } = curveMarks({ segments: segs, texts: [] }, k);
  const idx = (pid) => segs.findIndex((s) => s.pid === pid);
  assert.ok(marked.has(idx(2)), 'basin side');
  assert.ok(!marked.has(idx(3)), 'tub rim');
  assert.ok(marked.has(idx(5)) && marked.has(idx(6)), 'both sides of the leaf');
  assert.ok(!marked.has(idx(7)) && !marked.has(idx(8)), 'the wall');
  assert.equal(chords.length, 2);
});
