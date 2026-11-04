import test from 'node:test';
import assert from 'node:assert/strict';
import { floorOf, sillOf, blockingOf, withPlanLoose } from './loose.js';

// a 20' × 10' box (centre lines) of 6" exterior walls at 12 pt/ft
const box = (extra = {}) => ({
  ptPerFt: 12,
  linked: true,
  walls: [
    { id: 'n', x1: 0, y1: 0, x2: 240, y2: 0, t: 6, kind: 'exterior', size: '2x6' },
    { id: 's', x1: 0, y1: 120, x2: 240, y2: 120, t: 6, kind: 'exterior', size: '2x6' },
    { id: 'w', x1: 0, y1: 0, x2: 0, y2: 120, t: 6, kind: 'exterior', size: '2x6' },
    { id: 'e', x1: 240, y1: 0, x2: 240, y2: 120, t: 6, kind: 'exterior', size: '2x6' },
    { id: 'p', x1: 120, y1: 0, x2: 120, y2: 120, t: 4.5, kind: 'partition', size: '2x4' },
    { id: 'b', x1: 0, y1: 60, x2: 120, y2: 60, t: 4.5, kind: 'bearing', size: '2x4' },
  ],
  ...extra,
});
const near = (a, b, tol) => Math.abs(a - b) <= tol;

test('floor area to the outside face of the exterior walls, FRT band and openings', () => {
  const f = floorOf(box(), { bandFt: 4 });
  assert.ok(near(f.areaSqFt, 20.5 * 10.5, 6), `area ${f.areaSqFt}`);
  assert.ok(near(f.fieldSqFt, (20.5 - 8) * (10.5 - 8), 6), `field ${f.fieldSqFt}`);
  assert.ok(near(f.perimeterLF, 2 * (20.5 + 10.5), 4), `perimeter ${f.perimeterLF}`);
  // a 4' × 4' stair opening
  const o = floorOf(box({ floorOpenings: [{ x1: 24, y1: 24, x2: 72, y2: 72 }] }));
  assert.ok(near(f.areaSqFt - o.areaSqFt, 16, 2), `opening ${f.areaSqFt - o.areaSqFt}`);
  // a 6" gap in a wall still closes
  const gap = box();
  gap.walls[0] = { ...gap.walls[0], x2: 117 };
  gap.walls.push({ id: 'n2', x1: 123, y1: 0, x2: 240, y2: 0, t: 6, kind: 'exterior', size: '2x6' });
  assert.ok(near(floorOf(gap).areaSqFt, f.areaSqFt, 6));
});

test('walls on concrete: foam sealer and sill plates by size', () => {
  const s = sillOf(box());
  assert.deepEqual(s.bySize, { '2x6': 60, '2x4': 10 });
  assert.equal(s.totalLF, 70, 'partitions left out');
});

test('drawn blocking and the Plan · level section, foundation figures', () => {
  const plan = box({ blocking: [{ x1: 0, y1: 0, x2: 96, y2: 0, kind: 'bath' }, { x1: 0, y1: 0, x2: 0, y2: 48, kind: 'kitchen' }], frtBand: true, frtBandFt: 4 });
  assert.deepEqual(blockingOf(plan), { bath: 8, kitchen: 4 });
  const est = { levels: [{ id: 'L1', name: 'Level 1', plan }], looseList: [{ id: 'f', name: 'Foundation', kind: 'foundation', rows: [], inputs: { foundationLF: 5 } }, { id: 'r', name: 'Roof', rows: [] }] };
  const out = withPlanLoose(est);
  const sec = out.looseList.find((s) => s.planLevel === 'L1');
  assert.deepEqual(sec.rows.map((r) => r.type), ['Subfloor', 'Subfloor · FRT perimeter', 'Glue', 'Rimboard', 'Bathroom blocking', 'Kitchen blocking']);
  const fnd = out.looseList.find((s) => s.kind === 'foundation');
  assert.equal(fnd.inputs.planFoamLF, 70);
  assert.deepEqual(fnd.inputs.planSillBySize, { '2x6': 60, '2x4': 10 });
  assert.equal(withPlanLoose(out), out, 'stable');
});

test('plan rows go into the level section, take over its empty template rows, and old Plan sections move in', async () => {
  const { withPlanLoose: wpl } = await import('./loose.js');
  const { computeLooseSection } = await import('../estimate/index.js');
  const k = 10;
  const W = (x1, y1, x2, y2) => ({ id: `w${x1}${y1}${x2}${y2}`, x1: x1 * k, y1: y1 * k, x2: x2 * k, y2: y2 * k, kind: 'exterior', size: '2x6' });
  const plan = { ptPerFt: k, linked: true, walls: [W(0, 0, 20, 0), W(20, 0, 20, 10), W(20, 10, 0, 10), W(0, 10, 0, 0)] };
  const tpl = { id: 'lv1', name: '1st Level', rows: [
    { id: 't-rim', type: 'Rimboard', item: { id: 'myRim' }, inputs: {}, wastePct: 7 },
    { id: 't-sub', type: 'Subfloor', item: null, inputs: { area: 500 }, wastePct: 5 },
    { id: 't-joist', type: 'Joist', inputs: {} },
  ] };
  const old = { id: 'loose-hw-L1', name: 'Plan · Level 1', kind: 'custom', rows: [{ id: 'm1', type: 'Screws', qty: 3 }] };
  const est = { levels: [{ id: 'L1', name: 'Level 1', plan }], looseList: [tpl, old, { id: 'r', name: 'Roof', rows: [] }] };
  const out = wpl(est);
  assert.equal(out.looseList.length, 2, 'old Plan section merged away');
  const sec = out.looseList[0];
  assert.equal(sec.planLevel, 'L1');
  const rim = sec.rows.find((r) => r.planLoose === 'rim');
  assert.equal(rim.id, 't-rim', 'rimboard template row taken over');
  assert.equal(rim.item.id, 'myRim');
  assert.equal(rim.wastePct, 7);
  assert.ok(sec.rows.find((r) => r.id === 't-sub' && !r.planLoose), 'a subfloor row with a typed area stays manual');
  assert.ok(sec.rows.find((r) => r.id === 'm1'), 'manual row of the old section kept');
  assert.equal(wpl(out), out, 'stable');
  // unlink: the taken-over row goes back to manual, without plan figures
  const off = wpl({ ...out, levels: [{ id: 'L1', name: 'Level 1', plan: { ...plan, linked: false } }] });
  const back = off.looseList[0].rows.find((r) => r.id === 't-rim');
  assert.ok(back && !back.planLoose && back.item.id === 'myRim');
  // an extra row: quantity from its calculation
  const c = computeLooseSection({ rows: [{ id: 'x', type: 'Extra', inputs: { formula: '12*16+4' }, wastePct: 0 }] });
  assert.equal(c.manualRows[0].qtyRaw, 196);
});
