import test from 'node:test';
import assert from 'node:assert/strict';
import { findJunctions, junctionStudsByWall } from './junctions.js';
import { planGroups, syncPlanSections } from './sync.js';
import { calcStuds } from '../calculators/studs.js';

const K = 9;
// a 20' x 10' room of exterior walls, and a partition from the middle of the top wall down to the bottom
const W = (id, x1, y1, x2, y2, kind = 'exterior', size = '2x6', t = 6.75) => ({ id, x1, y1, x2, y2, t, kind, size });
const room = [
  W('top', 0, 0, 20 * K, 0), W('right', 20 * K, 0, 20 * K, 10 * K), W('bot', 20 * K, 10 * K, 0, 10 * K), W('left', 0, 10 * K, 0, 0),
  W('mid', 10 * K, 0, 10 * K, 10 * K, 'partition', '2x4', 4.75),
];
const run = W('run', 20 * K, 10 * K, 30 * K, 10 * K); // the bottom wall goes on past the corner

test('corners, T junctions and the wall that gets the studs', () => {
  const j = findJunctions(room, K, (w) => (w.kind === 'exterior' ? 0 : 3));
  const corners = j.filter((x) => x.type === 'corner');
  const tees = j.filter((x) => x.type === 'tee');
  assert.equal(corners.length, 4, JSON.stringify(corners));
  assert.deepEqual(tees.map((t) => [t.wallId, t.otherId]).sort(), [['bot', 'mid'], ['top', 'mid']]);
  const by = junctionStudsByWall(j, { corner: 2, tee: 3 });
  assert.equal(by.get('top'), 3 + 2 * corners.filter((c) => c.wallId === 'top').length);
  assert.equal(by.get('mid'), undefined, 'the butting wall gets none');
  // the right wall ends where the bottom wall goes on: one T there, not two corners
  const j2 = findJunctions([...room, run], K);
  assert.equal(j2.filter((x) => x.type === 'corner').length, 3);
  assert.equal(j2.filter((x) => x.type === 'tee').length, 3);
});

test('plan groups and sections carry the junction studs; the stud count adds them after the waste', () => {
  const plan = { ptPerFt: K, linked: true, walls: room, junctions: { corner: 2, tee: 2 } };
  const g = planGroups(plan);
  const ext = g.find((x) => x.kind === 'exterior');
  assert.equal(ext.junctionStuds, 4 * 2 + 2 * 2);
  assert.equal(g.find((x) => x.kind === 'partition').junctionStuds, 0);
  assert.equal(planGroups({ ...plan, junctions: { off: true } })[0].junctionStuds, 0);
  let i = 0;
  const lvl = syncPlanSections({ plan, exteriorSections: [], interiorSections: [] }, (p) => ({ id: `s${i++}`, ...p }));
  assert.equal(lvl.exteriorSections[0].planJunctionStuds, 12);
  const s = calcStuds({ lengthLF: 10, spacingIn: 16, wastePct: 10, extra: 12 });
  assert.equal(s.qtyFinal, Math.ceil(8 * 1.1) + 12);
});

test('Layout check frames the corner and T studs, as many as the estimate counts', async () => {
  const { frameWall, planModel } = await import('./framing.js');
  const f = frameWall({ lengthIn: 240, heightIn: 108, depthIn: 5.5, junctions: [{ type: 'corner', at: 0, count: 2 }, { type: 'tee', at: 120, count: 2, depthIn: 3.5 }] });
  const b = f.members.filter((m) => m.t === 'backer').map((m) => m.a0).sort((x, y) => x - y);
  assert.deepEqual(b, [1.5, 3, 116.75, 121.75]);
  assert.equal(f.counts.backers, 4);
  const plan = { ptPerFt: K, walls: room, junctions: { corner: 2, tee: 2 } };
  const model = planModel({ plan, exteriorSections: [], interiorSections: [] });
  const framed = model.parts.reduce((s, p) => s + p.frame.counts.backers, 0);
  const counted = planGroups(plan).reduce((s, g) => s + g.junctionStuds, 0);
  assert.equal(framed, counted);
});
