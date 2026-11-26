import test from 'node:test';
import assert from 'node:assert/strict';
import { wallPolygonPoints, wallPolygonsSvg } from './geometry.js';

const near = (a, b, tol = 0.05) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
const hasPt = (pts, target, tol = 0.05) => pts.some((p) => near(p, target, tol));

test('L corner at 90° produces exact 45° miter corners on both walls', () => {
  const k = 12; // 1 pt = 1 inch
  // horizontal wall (0,0)→(100,0) and vertical wall (100,0)→(100,100), both 6" thick (hw = 3)
  const walls = [
    { id: 'h', x1: 0, y1: 0, x2: 100, y2: 0, t: 6 },
    { id: 'v', x1: 100, y1: 0, x2: 100, y2: 100, t: 6 },
  ];
  const map = wallPolygonPoints(walls, k);
  const hPts = map.get('h');
  const vPts = map.get('v');
  assert.equal(hPts.length, 4);
  assert.equal(vPts.length, 4);
  // outer corner (103, -3) and inner corner (97, 3) shared by both polygons (45° miter)
  assert.ok(hasPt(hPts, [103, -3]) && hasPt(vPts, [103, -3]), 'both share outer 45° miter corner');
  assert.ok(hasPt(hPts, [97, 3]) && hasPt(vPts, [97, 3]), 'both share inner 45° miter corner');
});

test('angled corner (135° bay wall) produces exact bisector miter', () => {
  const k = 12;
  const walls = [
    { id: 'a', x1: 0, y1: 0, x2: 100, y2: 0, t: 6 },
    { id: 'b', x1: 100, y1: 0, x2: 150, y2: 50, t: 6 },
  ];
  const map = wallPolygonPoints(walls, k);
  const aPts = map.get('a');
  const bPts = map.get('b');
  // both walls share exactly 2 miter vertices at the joint
  const shared = aPts.filter((p) => hasPt(bPts, p));
  assert.equal(shared.length, 2, 'angled walls share both inner and outer miter vertices');
});

test('3-way T junction (left, right, perpendicular stem) produces V-miter (machimbrado en V)', () => {
  const k = 12;
  // left wall (0,0)→(100,0), right wall (100,0)→(200,0), stem (100,0)→(100,80), all 6" thick (hw = 3)
  const walls = [
    { id: 'L', x1: 0, y1: 0, x2: 100, y2: 0, t: 6 },
    { id: 'R', x1: 100, y1: 0, x2: 200, y2: 0, t: 6 },
    { id: 'S', x1: 100, y1: 0, x2: 100, y2: 80, t: 6 },
  ];
  const map = wallPolygonPoints(walls, k);
  const lPts = map.get('L'), rPts = map.get('R'), sPts = map.get('S');
  // V-tip at junction centre (100, 0) shared by all three walls
  assert.ok(hasPt(lPts, [100, 0]) && hasPt(rPts, [100, 0]) && hasPt(sPts, [100, 0]), 'all 3 walls meet at V-tip (100,0)');
  // bevel corners (97, 3) shared by L and S; (103, 3) shared by R and S
  assert.ok(hasPt(lPts, [97, 3]) && hasPt(sPts, [97, 3]), 'left 45° bevel shared by L and stem');
  assert.ok(hasPt(rPts, [103, 3]) && hasPt(sPts, [103, 3]), 'right 45° bevel shared by R and stem');
  // back edge (100, -3) shared flush by L and R
  assert.ok(hasPt(lPts, [100, -3]) && hasPt(rPts, [100, -3]), 'back face flush between L and R');
});

test('continuous wall + perpendicular stem produces matching V-notch and V-tip', () => {
  const k = 12;
  const walls = [
    { id: 'M', x1: 0, y1: 0, x2: 200, y2: 0, t: 6 },
    { id: 'S', x1: 100, y1: 0, x2: 100, y2: 80, t: 6 },
  ];
  const map = wallPolygonPoints(walls, k);
  const mPts = map.get('M'), sPts = map.get('S');
  // M gets a 3-point V-notch [(97,3), (100,0), (103,3)] on its +y side (total 4 + 3 = 7 vertices)
  assert.equal(mPts.length, 7);
  assert.equal(sPts.length, 5);
  assert.ok(hasPt(mPts, [100, 0]) && hasPt(sPts, [100, 0]), 'V-tip at centreline');
  assert.ok(hasPt(mPts, [97, 3]) && hasPt(sPts, [97, 3]), 'left V shoulder');
  assert.ok(hasPt(mPts, [103, 3]) && hasPt(sPts, [103, 3]), 'right V shoulder');
  const svg = wallPolygonsSvg(walls, k);
  assert.equal(typeof svg.get('M'), 'string');
});

test('single wall meeting a double wall only notches the nearer band', () => {
  const k = 12; // 1 pt = 1 inch
  // horizontal double wall along y=0 (10" thick: band 0 at y≈-3.1, band 1 at y≈+3.1)
  // single partition coming up from y=80 to y=+3.1 (the nearer band 1)
  const walls = [
    { id: 'D', x1: 0, y1: 0, x2: 200, y2: 0, t: 10, double: true, kind: 'shear', kind2: 'partition', size: '2x4', size2: '2x4' },
    { id: 'P', x1: 100, y1: 3.1, x2: 100, y2: 80, t: 4.5, kind: 'partition', size: '2x4' },
  ];
  const map = wallPolygonPoints(walls, k);
  const b0 = map.get('D:0');
  const b1 = map.get('D:1');
  const p = map.get('P');
  // one band is notched (7 vertices), the far band stays untouched (4 vertices)
  assert.deepEqual([b0.length, b1.length].sort(), [4, 7], 'only the nearer band of the double wall is notched');
  assert.equal(p.length, 5, 'single wall ends in a V-tip');
});

test('two double walls meeting at 90° miter inner-to-inner and outer-to-outer independently', () => {
  const k = 12;
  const walls = [
    { id: 'A', x1: 0, y1: 0, x2: 100, y2: 0, t: 10, double: true, kind: 'shear', kind2: 'partition', size: '2x4', size2: '2x4' },
    { id: 'B', x1: 100, y1: 0, x2: 100, y2: 100, t: 10, double: true, kind: 'shear', kind2: 'partition', size: '2x4', size2: '2x4' },
  ];
  const map = wallPolygonPoints(walls, k);
  const a0 = map.get('A:0'), a1 = map.get('A:1');
  const b0 = map.get('B:0'), b1 = map.get('B:1');
  const shared = (p, q) => p.filter((x) => hasPt(q, x)).length;
  // each band of A shares 2 exact miter vertices with its matching band of B, and 0 with the opposite band
  const pairs = [shared(a0, b0), shared(a0, b1), shared(a1, b0), shared(a1, b1)].sort();
  assert.deepEqual(pairs, [0, 0, 2, 2], 'inner miters with inner and outer miters with outer');
});
