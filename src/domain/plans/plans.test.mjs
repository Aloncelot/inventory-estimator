import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScaleText, detectScale, detectWalls, studSizeFor, suggestStyles } from './detect.js';
import { planGroups, syncPlanSections, wallLengthFt, storeWalls } from './sync.js';

test('scale notes', () => {
  assert.equal(parseScaleText(`3/32" = 1'-0"`).ptPerFt, 6.75);
  assert.equal(parseScaleText(`SCALE: 1/8" = 1'-0"`).ptPerFt, 9);
  assert.equal(parseScaleText(`1/4"=1'-0"`).ptPerFt, 18);
  assert.equal(parseScaleText(`1 1/2" = 1'-0"`).ptPerFt, 108);
  assert.equal(parseScaleText('1:100').ptPerFt, 8.64);
  assert.equal(parseScaleText('2x6 EXTERIOR'), null);
  const s = detectScale([{ str: 'Scale:' }, { str: `3/32" = 1'-0"` }, { str: `3/32" = 1'-0"` }, { str: `1/4" = 1'-0"` }]);
  assert.equal(s.ptPerFt, 6.75);
});

test('stud size from wall thickness', () => {
  assert.equal(studSizeFor(4.75), '2x4');
  assert.equal(studSizeFor(6.75), '2x6');
  assert.equal(studSizeFor(8.25, 2.75), '2x6');
  assert.equal(studSizeFor(10.5), '2x10');
});

// a 20' × 10' room at 1/4" = 1'-0" (18 pt/ft): exterior walls 8¼" thick drawn as
// two lines, one 4¾" partition, a 3' window and a 3' door
const K = 18;
const IN = K / 12;
const S = '1.2|#000000';
const P = '0.6|#808080';
function room() {
  const seg = (x1, y1, x2, y2, style = S, extra = {}) => ({ x1, y1, x2, y2, w: 1, style, ...extra });
  const t = 8.25 * IN;
  const x0 = 100, y0 = 100, W = 20 * K, H = 10 * K;
  const segs = [];
  // top wall with a 3' window from 8' to 11' (glazing line in the gap)
  const wa = x0 + 8 * K, wb = x0 + 11 * K;
  segs.push(seg(x0, y0, wa, y0), seg(wb, y0, x0 + W, y0), seg(x0 + t, y0 + t, wa, y0 + t), seg(wb, y0 + t, x0 + W - t, y0 + t));
  segs.push(seg(wa, y0 + t / 2, wb, y0 + t / 2, '0.24|#000000'));
  // bottom wall with a 3' door from 4' to 7' (leaf swings in)
  const da = x0 + 4 * K, db = x0 + 7 * K;
  segs.push(seg(x0, y0 + H, da, y0 + H), seg(db, y0 + H, x0 + W, y0 + H), seg(x0 + t, y0 + H - t, da, y0 + H - t), seg(db, y0 + H - t, x0 + W - t, y0 + H - t));
  segs.push(seg(da, y0 + H - t, da, y0 + H - t - 3 * K, '0.24|#000000'));
  // left and right walls
  segs.push(seg(x0, y0, x0, y0 + H), seg(x0 + t, y0 + t, x0 + t, y0 + H - t));
  segs.push(seg(x0 + W, y0, x0 + W, y0 + H), seg(x0 + W - t, y0 + t, x0 + W - t, y0 + H - t));
  // a partition at 12' from the left
  const px = x0 + 12 * K, pt = 4.75 * IN;
  segs.push(seg(px, y0 + t, px, y0 + H - t, P), seg(px + pt, y0 + t, px + pt, y0 + H - t, P));
  // furniture: a hairline bed, which must not become a wall
  segs.push(seg(x0 + 14 * K, y0 + 3 * K, x0 + 18 * K, y0 + 3 * K, '0.24|#aaaaaa'), seg(x0 + 14 * K, y0 + 3 * K + 6 * IN, x0 + 18 * K, y0 + 3 * K + 6 * IN, '0.24|#aaaaaa'));
  return { width: 1000, height: 600, segments: segs, texts: [] };
}

test('detects walls, openings, exterior and sizes in a simple room', () => {
  const first = detectWalls(room(), { ptPerFt: K });
  const styles = suggestStyles(first.styles.map((s) => ({ ...s, lengthFt: s.lengthFt + 40 })));
  assert.ok(!styles.includes('0.24|#aaaaaa'), 'hairlines are not suggested');
  const r = detectWalls(room(), { ptPerFt: K, styles: [S, P] });
  const ext = r.walls.filter((w) => w.exterior);
  const int = r.walls.filter((w) => !w.exterior);
  assert.equal(ext.length, 4);
  assert.equal(int.length, 1);
  assert.equal(int[0].size, '2x4');
  assert.equal(int[0].kind, 'partition');
  for (const w of ext) { assert.equal(w.size, '2x6'); assert.equal(w.kind, 'exterior'); }
  const top = ext.find((w) => Math.abs(w.y1 - w.y2) < 1 && w.y1 < 120);
  const bottom = ext.find((w) => Math.abs(w.y1 - w.y2) < 1 && w.y1 > 200);
  assert.ok(top.lengthFt > 19 && top.lengthFt <= 20, `top wall runs the room (${top.lengthFt})`);
  assert.deepEqual(top.openings.map((o) => [o.type, o.widthFt]), [['window', 3]]);
  assert.deepEqual(bottom.openings.map((o) => o.type), ['door']);
});

test('plan groups and synced sections', () => {
  const plan = {
    ptPerFt: 10,
    linked: true,
    walls: [
      { id: 'a', x1: 0, y1: 0, x2: 300, y2: 0, kind: 'exterior', size: '2x6' },
      { id: 'b', x1: 0, y1: 0, x2: 0, y2: 200, kind: 'exterior', size: '2x6' },
      { id: 'c', x1: 0, y1: 0, x2: 0, y2: 100, kind: 'partition', size: '2x4', lenFt: 12.5 },
    ],
  };
  assert.equal(wallLengthFt(plan.walls[0], 10), 30);
  const g = planGroups(plan);
  assert.deepEqual(g.map((x) => [x.key, x.lengthFt]), [['exterior|exterior|2x6', 50], ['interior|partition|2x4', 12.5]]);
  let id = 0;
  const make = (p) => ({ id: `s${++id}`, extras: [], sel: {}, ...p });
  const level = { exteriorSections: [{ id: 'blank', lengthLF: 0, extras: [], sel: {} }], interiorSections: [{ id: 'manual', lengthLF: 40, extras: [], sel: {} }], plan };
  const out = syncPlanSections(level, make);
  assert.deepEqual(out.exteriorSections.map((s) => [s.name, s.lengthLF, s.kind]), [['Plan · Exterior 2x6', 50, 'exterior']]);
  assert.deepEqual(out.interiorSections.map((s) => s.lengthLF), [40, 13], 'manual sections stay');
  // editing the plan updates the linked section in place
  const edited = { ...out, plan: { ...plan, walls: plan.walls.slice(1) } };
  const again = syncPlanSections(edited, make);
  assert.equal(again.exteriorSections[0].id, out.exteriorSections[0].id);
  assert.equal(again.exteriorSections[0].lengthLF, 20);
  assert.equal(storeWalls([{ x1: 1.234, y1: 0, x2: 2, y2: 0, thickIn: 4.75, style: S, kind: 'partition', size: '2x4', openings: [] }], () => 'w')[0].x1, 1.23);
});

test('double walls count once in each of their two types', async () => {
  const { planGroups: groups, wallParts } = await import('./sync.js');
  const w = { id: 'd', x1: 0, y1: 0, x2: 100, y2: 0, kind: 'shear', kind2: 'bearing', size: '(2)2x4' };
  assert.deepEqual(wallParts(w), [{ kind: 'shear', size: '2x4' }, { kind: 'bearing', size: '2x4' }]);
  const g = groups({ ptPerFt: 10, walls: [w, { ...w, id: 'e', kind2: undefined }] });
  assert.deepEqual(g.map((x) => [x.key, x.lengthFt]).sort(), [['interior|bearing|2x4', 10], ['interior|partition|2x4', 10], ['interior|shear|2x4', 20]]);
});

test('detecting again keeps added, edited and deleted walls', async () => {
  const { mergeRedetect } = await import('./sync.js');
  const fresh = [
    { id: 'n1', x1: 0, y1: 0, x2: 200, y2: 0, t: 5, kind: 'partition', size: '2x4', auto: true },
    { id: 'n2', x1: 0, y1: 50, x2: 200, y2: 50, t: 5, kind: 'partition', size: '2x4', auto: true },
    { id: 'n3', x1: 0, y1: 100, x2: 200, y2: 100, t: 5, kind: 'partition', size: '2x4', auto: true },
  ];
  const old = [
    { id: 'o1', x1: 1, y1: 0.5, x2: 199, y2: 0.5, t: 5, kind: 'shear', size: '2x6', auto: false },
    { id: 'o9', x1: 300, y1: 0, x2: 300, y2: 80, t: 5, kind: 'knee', size: '2x4', auto: false, added: true },
  ];
  const removed = [{ x1: 0, y1: 100, x2: 200, y2: 100, t: 5 }];
  const out = mergeRedetect(old, removed, fresh, 10);
  assert.deepEqual(out.map((w) => [w.id, w.kind, w.size]), [['n1', 'shear', '2x6'], ['n2', 'partition', '2x4'], ['o9', 'knee', '2x4']]);
});

test('title block and border are left out', async () => {
  const { drawingArea } = await import('./detect.js');
  const seg = (x1, y1, x2, y2) => ({ x1, y1, x2, y2, style: '1|#000000' });
  const a = drawingArea({ width: 1000, height: 600, segments: [seg(10, 5, 10, 595), seg(990, 5, 990, 595), seg(880, 5, 880, 595), seg(5, 10, 995, 10), seg(5, 590, 995, 590)] });
  assert.ok(a.x1 < 880 && a.x0 > 10 && a.y0 > 10 && a.y1 < 590);
  assert.equal(a.titleBlock, 'right');
});

test('each wall of a double wall keeps its own stud size', async () => {
  const { planGroups: groups, normWall } = await import('./sync.js');
  const w = { id: 'd', x1: 0, y1: 0, x2: 120, y2: 0, kind: 'shear', size: '2x6', double: true, kind2: 'partition', size2: '2x4' };
  assert.deepEqual(groups({ ptPerFt: 10, walls: [w] }).map((g) => [g.key, g.lengthFt]), [['interior|shear|2x6', 12], ['interior|partition|2x4', 12]]);
  assert.deepEqual(normWall({ kind: 'shear', size: '(2)2x4', kind2: 'bearing' }), { double: true, kind: 'shear', size: '2x4', kind2: 'bearing', size2: '2x4' });
  assert.equal(normWall({ kind: 'partition', size: '2x6' }).double, false);
});

test('a wall chained to a counter line is split off when its poché backs it', () => {
  const seg = (x1, y1, x2, y2, style = P, extra = {}) => ({ x1, y1, x2, y2, w: 1, style, ...extra });
  const page = room();
  const t = 8.25 * IN, y0 = 100 + t, y1 = 100 + 10 * K - t;
  const px = 100 + 6 * K, pt = 4.75 * IN;
  // the partition faces, and a counter edge 10" off its face (same pen)
  page.segments.push(seg(px, y0, px, y1), seg(px + pt, y0, px + pt, y1), seg(px + pt + 10 * IN, y0 + K, px + pt + 10 * IN, y1 - K));
  const at6 = (r) => r.walls.filter((w) => !w.exterior && Math.abs(w.x1 - (px + pt / 2)) < 2);
  assert.equal(at6(detectWalls(page, { ptPerFt: K, styles: [S, P] })).length, 0, 'no poché: too thick, left out');
  page.segments.push(seg(px, y0, px, y1, 'fill|#c0c0c0', { fill: true }), seg(px + pt, y0, px + pt, y1, 'fill|#c0c0c0', { fill: true }));
  const r = detectWalls(page, { ptPerFt: K, styles: [S, P] });
  const w = at6(r);
  assert.equal(w.length, 1);
  assert.equal(w[0].size, '2x4');
  assert.equal(r.walls.filter((x) => !x.exterior).length, 2, 'the counter is not a wall');
  assert.ok(suggestStyles([{ style: 'fill|#c0c0c0', width: 0, color: '#c0c0c0', lengthFt: 100 }]).includes('fill|#c0c0c0'), 'grey poché is suggested');
});

test('a wall stopping at a door beside a crossing wall runs across the door', () => {
  const k = 9;
  const st = '0.5|#000000';
  const seg = (x1, y1, x2, y2, pid) => ({ x1, y1, x2, y2, w: 0.5, style: st, pid });
  const segments = [
    // crossing wall, 6" thick, 30' long
    seg(100, 0, 100, 270, 1), seg(104.5, 0, 104.5, 270, 2),
    // stub to the right of a 3' door, 6" thick, 2' long, then a long wall on
    seg(131.5, 100, 300, 100, 3), seg(131.5, 104.5, 300, 104.5, 4),
    // the door: leaf open downward from the hinge at the stub, swing drawn as short lines
  ];
  const r = 27; // 3' leaf
  const hinge = [131.5, 104.5];
  segments.push(seg(hinge[0], hinge[1], hinge[0], hinge[1] + r, 5), seg(hinge[0] - 1.3, hinge[1], hinge[0] - 1.3, hinge[1] + r, 6));
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI / 2 + (Math.PI / 2) * (i / n), a1 = Math.PI / 2 + (Math.PI / 2) * ((i + 1) / n);
    segments.push(seg(hinge[0] + r * Math.cos(a0), hinge[1] + r * Math.sin(a0), hinge[0] + r * Math.cos(a1), hinge[1] + r * Math.sin(a1), 7));
  }
  const res = detectWalls({ width: 400, height: 300, segments, texts: [] }, { ptPerFt: k, styles: [st], area: { x0: 0, y0: 0, x1: 400, y1: 300 } });
  const h = res.walls.find((w) => Math.abs(w.y1 - w.y2) < 1);
  assert.ok(h, 'the horizontal wall');
  assert.ok(Math.min(h.x1, h.x2) <= 105, `it reaches the crossing wall (${Math.min(h.x1, h.x2)})`);
  assert.deepEqual(h.openings.map((o) => o.type), ['door']);
});

test('witness lines past the building are cut where a dimension crosses them', async () => {
  const { cutAtDimensions } = await import('./detect.js');
  const k = 9;
  // building fill: y from 0 to 100
  const poche = { count: 100, inside: (x, y) => y >= 0 && y <= 100 && x >= 0 && x <= 300 };
  const w = (x1, y1, x2, y2) => ({ x1, y1, x2, y2, lengthFt: Math.hypot(x2 - x1, y2 - y1) / k, openings: [] });
  const dim = { x1: -50, y1: 140, x2: 400, y2: 140 }; // a dimension string below the building
  const runsOut = w(50, 20, 50, 160); // a wall running on along its witness lines
  const outside = w(150, 110, 150, 170); // witness lines only
  const inside = w(250, 10, 250, 90);
  const out = cutAtDimensions([runsOut, outside, inside], [dim], poche, k);
  assert.equal(out.length, 2);
  assert.ok(Math.abs(Math.max(out[0].y1, out[0].y2) - 140) < 0.01, 'cut at the dimension');
  assert.equal(out[1], inside);
});

test('L-shaped building: alcove exterior walls stay exterior (flood-fill)', async () => {
  const { markExterior } = await import('./detect.js');
  const k = 10;
  const w = (x1, y1, x2, y2, thickIn = 6.5) => ({ x1: x1 * k, y1: y1 * k, x2: x2 * k, y2: y2 * k, thickIn });
  // L-shape: 30x30 with a 15x15 cutout in the top-right, plus one interior partition
  const walls = [
    w(0, 0, 15, 0), w(15, 0, 15, 15), w(15, 15, 30, 15),
    w(30, 15, 30, 30), w(30, 30, 0, 30), w(0, 30, 0, 0),
    w(0, 15, 15, 15, 4.75), // interior partition
  ];
  markExterior(walls, k);
  assert.equal(walls[1].exterior, true, 'inner-corner vertical wall facing alcove is exterior');
  assert.equal(walls[2].exterior, true, 'inner-corner horizontal wall facing alcove is exterior');
  assert.equal(walls[6].exterior, false, 'interior partition stays interior');
});

test('exterior wall with thin finish layer is one wall, not double', async () => {
  const { absorbThinFinish } = await import('./detect.js');
  const k = 18;
  const inPt = k / 12;
  // Case A: separate 3.2" cladding band right outside a 6.25" wall
  const cladding = { x1: 0, y1: 0, x2: 20 * k, y2: 0, thickIn: 3.2, lengthFt: 20 };
  const frame = { x1: 0, y1: (3.2 / 2 + 6.25 / 2) * inPt, x2: 20 * k, y2: (3.2 / 2 + 6.25 / 2) * inPt, thickIn: 6.25, lengthFt: 20 };
  const kept = absorbThinFinish([cladding, frame], k);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].thickIn, 6.25);

  // Case B: 3-line layered exterior wall (6.25" core + 2.5" finish = 8.75" total)
  const seg = (x1, y1, x2, y2, style = S) => ({ x1, y1, x2, y2, w: 1, style });
  const page = room();
  // add a 2.5" finish line outside the left exterior wall (x0 = 100)
  page.segments.push(seg(100 - 2.5 * inPt, 100, 100 - 2.5 * inPt, 100 + 10 * k));
  const r = detectWalls(page, { ptPerFt: k, styles: [S, P] });
  const left = r.walls.find((x) => Math.abs(x.x1 - x.x2) < 1 && x.x1 < 120);
  assert.ok(left, 'left exterior wall found');
  assert.equal(left.exterior, true);
  assert.ok(!left.double, 'not marked as double wall');
  assert.ok(left.thickIn < 8.5, `finish stripped (${left.thickIn}")`);
});

test('short closet return wall survives via joinCorners, and bifold closet doors bridge', () => {
  const k = 18;
  const inPt = k / 12;
  const t = 4.75 * inPt;
  const seg = (x1, y1, x2, y2, style = S) => ({ x1, y1, x2, y2, w: 1, style });
  const page = room();
  // Inside room (x: 100..460, y: 100..280): add a 2'-0" closet return wall at x=160,
  // face-to-face length ~1.2' (< 1.5'), meeting top wall and a closet front wall with bifold door
  const cx = 100 + 4 * k;
  const cy = 100 + 8.25 * inPt;
  const cy2 = cy + 1.2 * k;
  // vertical return (1.2' face-to-face)
  page.segments.push(seg(cx, cy, cx, cy2), seg(cx + t, cy, cx + t, cy2));
  // horizontal closet front wall from x=100+8.25" to cx (with a 3' bifold door gap? make solid 3' stub + bifold)
  page.segments.push(seg(100 + 8.25 * inPt, cy2, cx + t, cy2), seg(100 + 8.25 * inPt, cy2 + t, cx + t, cy2 + t));
  const r = detectWalls(page, { ptPerFt: k, styles: [S, P] });
  const ret = r.walls.find((w) => !w.exterior && Math.abs(w.x1 - w.x2) < 2 && Math.abs(w.x1 - (cx + t / 2)) < 4);
  assert.ok(ret, 'short closet return wall is preserved after joinCorners');
});

test('two windows with sill + glazing lines on a poché wall do not invert openings', () => {
  const k = 18;
  const inPt = k / 12;
  const t = 6.25 * inPt;
  const seg = (x1, y1, x2, y2, style = S) => ({ x1, y1, x2, y2, w: 1, style });
  const boxPoly = (x0, y0, x1, y1) => ({ pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], color: '#999999' });
  const x0 = 100, y0 = 100, W = 20 * k, H = 10 * k;
  const segs = [];
  const polys = [];
  // Top wall: solid 0..5', window1 5..8', pier 8..10', window2 10..13', solid 13..20'
  const addSolidTop = (a, b) => {
    segs.push(seg(x0 + a * k, y0, x0 + b * k, y0), seg(x0 + a * k, y0 + t, x0 + b * k, y0 + t));
    polys.push(boxPoly(x0 + a * k, y0, x0 + b * k, y0 + t));
  };
  const addWindowTop = (a, b) => {
    // sill lines in wall style + glazing line inside (no poché!)
    segs.push(seg(x0 + a * k, y0, x0 + b * k, y0), seg(x0 + a * k, y0 + t, x0 + b * k, y0 + t));
    segs.push(seg(x0 + a * k, y0 + t * 0.5, x0 + b * k, y0 + t * 0.5, '0.24|#000000'));
  };
  addSolidTop(0, 5); addWindowTop(5, 8); addSolidTop(8, 10); addWindowTop(10, 13); addSolidTop(13, 20);
  // other 3 walls with poché
  segs.push(seg(x0, y0 + H, x0 + W, y0 + H), seg(x0, y0 + H - t, x0 + W, y0 + H - t));
  polys.push(boxPoly(x0, y0 + H - t, x0 + W, y0 + H));
  segs.push(seg(x0, y0, x0, y0 + H), seg(x0 + t, y0, x0 + t, y0 + H));
  polys.push(boxPoly(x0, y0, x0 + t, y0 + H));
  segs.push(seg(x0 + W, y0, x0 + W, y0 + H), seg(x0 + W - t, y0, x0 + W - t, y0 + H));
  polys.push(boxPoly(x0 + W - t, y0, x0 + W, y0 + H));
  // pad polys count > 50 so poché mode activates
  for (let i = 0; i < 55; i++) polys.push(boxPoly(10 + i * 2, 10, 11 + i * 2, 11));
  const r = detectWalls({ width: 800, height: 500, segments: segs, texts: [], polys }, { ptPerFt: k, styles: [S] });
  const top = r.walls.find((w) => Math.abs(w.y1 - w.y2) < 1 && w.y1 < 120);
  assert.ok(top, 'top wall detected as one continuous wall');
  assert.equal(top.openings.length, 2, `two windows detected (got ${top.openings.length})`);
  assert.deepEqual(top.openings.map((o) => [o.type, Math.round(o.widthFt)]), [['window', 3], ['window', 3]]);
});

test('dashed lines are ignored, cross-style dark faces pair, and double doors bridge', () => {
  const k = 18;
  const inPt = k / 12;
  const page = room();
  // add dashed overhead beam lines (6" apart) — must NOT become a wall
  page.segments.push(
    { x1: 120, y1: 160, x2: 300, y2: 160, w: 0.6, style: '0.6|#000000|d' },
    { x1: 120, y1: 160 + 6 * inPt, x2: 300, y2: 160 + 6 * inPt, w: 0.6, style: '0.6|#000000|d' },
  );
  // add a double door (6' wide, two 3' leaves) on a horizontal partition
  const y = 100 + 6 * k, pt = 4.75 * inPt;
  const xA = 100 + 8.25 * inPt, xD1 = xA + 2 * k, xD2 = xD1 + 6 * k, xB = 100 + 12 * k;
  page.segments.push(
    { x1: xA, y1: y, x2: xD1, y2: y, w: 0.6, style: P },
    { x1: xA, y1: y + pt, x2: xD1, y2: y + pt, w: 0.6, style: P },
    { x1: xD2, y1: y, x2: xB, y2: y, w: 0.6, style: P },
    { x1: xD2, y1: y + pt, x2: xB, y2: y + pt, w: 0.6, style: P },
    // two 3' door leaves hinged at xD1 and xD2
    { x1: xD1, y1: y, x2: xD1, y2: y - 3 * k, w: 0.24, style: '0.24|#000000' },
    { x1: xD2, y1: y, x2: xD2, y2: y - 3 * k, w: 0.24, style: '0.24|#000000' },
  );
  const r = detectWalls(page, { ptPerFt: k, styles: [S, P] });
  assert.ok(!r.walls.some((w) => String(w.style).endsWith('|d')), 'dashed lines never become walls');
  const dbl = r.walls.find((w) => !w.exterior && Math.abs(w.y1 - w.y2) < 1 && Math.abs(w.y1 - (y + pt / 2)) < 4);
  assert.ok(dbl, 'partition with double door bridged');
  assert.deepEqual(dbl.openings.map((o) => [o.type, Math.round(o.widthFt)]), [['door', 6]]);
});

test('cross-style dark faces pair and short closet wing wall survives', () => {
  const seg = (x1, y1, x2, y2, style = S) => ({ x1, y1, x2, y2, w: 1, style });
  const t = 6.25 * IN, pt = 4.75 * IN;
  const x0 = 100, y0 = 100, W = 20 * K, H = 12 * K;
  const segs = [
    // top wall: cross-style (heavy outer pen, lighter dark inner pen)
    seg(x0, y0, x0 + W, y0, '1.2|#000000'),
    seg(x0 + t, y0 + t, x0 + W - t, y0 + t, '0.6|#222222'),
    // bottom, left, right walls
    seg(x0, y0 + H, x0 + W, y0 + H), seg(x0 + t, y0 + H - t, x0 + W - t, y0 + H - t),
    seg(x0, y0, x0, y0 + H), seg(x0 + t, y0 + t, x0 + t, y0 + H - t),
    seg(x0 + W, y0, x0 + W, y0 + H), seg(x0 + W - t, y0 + t, x0 + W - t, y0 + H - t),
    // closet wing wall: 1.4' face-to-face stub rising from bottom wall
    seg(x0 + 6 * K, y0 + H - 2 * K, x0 + 6 * K, y0 + H - t, P),
    seg(x0 + 6 * K + pt, y0 + H - 2 * K, x0 + 6 * K + pt, y0 + H - t, P),
  ];
  const r = detectWalls({ width: 1000, height: 600, segments: segs, texts: [] }, { ptPerFt: K, styles: [S, '0.6|#222222', P] });
  const top = r.walls.find((w) => Math.abs(w.y1 - w.y2) < 1 && w.y1 < 150);
  assert.ok(top, 'cross-style top wall detected');
  const closetReturn = r.walls.find((w) => !w.exterior && Math.abs(w.x1 - (x0 + 6 * K + pt / 2)) < 5);
  assert.ok(closetReturn, 'short closet wing wall survived');
});
