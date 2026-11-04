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
