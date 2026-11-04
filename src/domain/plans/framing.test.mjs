import test from 'node:test';
import assert from 'node:assert/strict';
import { frameWall, openingOf, planModel, planCheck } from './framing.js';

test('a plain wall: panels, studs at 16" and blocking', () => {
  const f = frameWall({ lengthIn: 240, heightIn: 120, depthIn: 5.5, spacing: 16, panelIn: 96 });
  assert.deepEqual(f.panels.map((p) => p.length), [96, 96, 48]);
  // 96" panel: studs at 0,16,…,80 + end stud at 94.5 → 7; 48": 0,16,32 + 46.5 → 4
  assert.equal(f.counts.studs, 7 + 7 + 4);
  assert.equal(f.studLen, 120 - 4.5);
  assert.equal(f.blockRows, 2);
  assert.ok(f.cuts.blocking.length > 0);
  assert.equal(f.sheets.length, 0);
});

test('a window: kings, jacks, header, cripples, sill; no stud and no joint inside it', () => {
  const win = openingOf({ type: 'window', atFt: 7, widthFt: 3 });
  assert.deepEqual([win.z0, win.z1], [36, 84]);
  const f = frameWall({ lengthIn: 240, heightIn: 120, depthIn: 5.5, spacing: 16, panelIn: 96, openings: [win], sheathed: true });
  const o = f.openings[0];
  for (const p of f.panels.slice(1)) assert.ok(p.start <= o.k0 + 0.01 || p.start >= o.k1 - 0.01, `joint ${p.start} outside the opening`);
  assert.equal(f.counts.kings, 2);
  assert.equal(f.counts.jacks, 2);
  assert.equal(f.counts.headers, 1);
  assert.equal(f.counts.sills, 1);
  assert.equal(f.cuts.headers[0], 36 + 3, 'header = opening + one jack each side');
  assert.ok(f.counts.cripples >= 4);
  assert.ok(!f.members.some((m) => m.t === 'stud' && m.a1 > o.k0 + 0.01 && m.a0 < o.k1 - 0.01), 'no common stud in the opening');
  // whole sheets with the window cut out: no piece covers the window, the sheets around it have a cut-out
  const pieces = f.sheets.flatMap((sh) => sh.pieces);
  assert.ok(!pieces.some((s) => s.a0 < o.a1 - 0.01 && s.a1 > o.a0 + 0.01 && s.z0 < o.z1 - 0.01 && s.z1 > o.z0 + 0.01));
  assert.ok(f.sheets.some((sh) => sh.cutouts.length));
  // panels 81", 96", 63" (the joint moved before the window): 2 + 2 + 2 columns × 2 rows (8' + 2')
  assert.equal(f.sheets.length, 12);
});

test('a door opens the bottom plate', () => {
  const door = openingOf({ type: 'door', atFt: 2, widthFt: 3 });
  const f = frameWall({ lengthIn: 120, heightIn: 108, depthIn: 3.5, spacing: 16, panelIn: 96, openings: [door] });
  const plates = f.members.filter((m) => m.t === 'plate' && m.z0 === 0);
  assert.ok(!plates.some((m) => m.a0 < 60 && m.a1 > 24), 'no bottom plate across the door');
  assert.equal(f.counts.sills, 0);
});

test('plan model: double walls give two parts, heights from the linked sections', () => {
  const level = {
    plan: {
      ptPerFt: 12,
      walls: [
        { id: 'a', x1: 0, y1: 0, x2: 240, y2: 0, kind: 'exterior', size: '2x6', openings: [{ type: 'window', atFt: 5, widthFt: 3 }] },
        { id: 'b', x1: 0, y1: 0, x2: 0, y2: 120, kind: 'shear', size: '2x4', double: true, kind2: 'bearing', size2: '2x6' },
      ],
    },
    exteriorSections: [{ id: 's1', planKey: 'exterior|exterior|2x6', heightFt: 9, studSpacingIn: 16, sel: {}, extras: [] }],
    interiorSections: [{ id: 's2', planKey: 'interior|shear|2x4', heightFt: 10, sel: {}, extras: [] }],
  };
  const m = planModel(level);
  assert.equal(m.parts.length, 3);
  const ext = m.parts.find((p) => p.wallId === 'a');
  assert.equal(ext.lengthIn, 240);
  assert.equal(ext.heightIn, 108);
  assert.ok(ext.frame.sheets.length > 0);
  const [s1, s2] = m.parts.filter((p) => p.wallId === 'b');
  assert.equal(s1.heightIn, 120);
  assert.equal(s2.heightIn, 144, 'no linked section: 12 ft');
  assert.ok(Math.abs(Math.hypot(s1.origin[0] - s2.origin[0], s1.origin[1] - s2.origin[1]) - (3.5 / 2 + 1 + 5.5 / 2)) < 1e-6);
  const check = planCheck(level, m);
  assert.deepEqual(check.map((g) => g.key).sort(), ['exterior|exterior|2x6', 'interior|bearing|2x6', 'interior|shear|2x4']);
  const extRows = check.find((g) => g.key === 'exterior|exterior|2x6').rows;
  assert.ok(extRows.find((r) => r.key === 'studs').needed > 0);
});

test('the sheathing goes on the outside, and flips on request', () => {
  // a 20' × 10' box of exterior walls plus one interior partition
  const wall = (id, x1, y1, x2, y2, extra = {}) => ({ id, x1, y1, x2, y2, kind: 'exterior', size: '2x6', ...extra });
  const level = {
    plan: {
      ptPerFt: 12,
      walls: [wall('s', 0, 120, 240, 120), wall('n', 0, 0, 240, 0), wall('w', 0, 0, 0, 120), wall('e', 240, 0, 240, 120, { sheathFlip: true }),
        { id: 'p', x1: 120, y1: 0, x2: 120, y2: 120, kind: 'partition', size: '2x4' }],
    },
  };
  const m = planModel(level);
  const outerFace = (id) => {
    const p = m.parts.find((x) => x.wallId === id);
    const mid = [p.origin[0] + p.dir[0] * p.lengthIn / 2 + p.nrm[0] * p.sheathFace * 10, p.origin[1] + p.dir[1] * p.lengthIn / 2 + p.nrm[1] * p.sheathFace * 10];
    return mid;
  };
  const [sx, sy] = outerFace('s');
  assert.ok(sy < 0.5, `south sheets face south (${sy})`);
  const [nx, ny] = outerFace('n');
  assert.ok(ny > 120 - 0.5, `north sheets face north (${ny})`);
  const [wx] = outerFace('w');
  assert.ok(wx < 0.5, 'west sheets face west');
  const [ex] = outerFace('e');
  assert.ok(ex < 240, 'east wall flipped: sheets inside');
  void sx; void nx;
});

test('wall groups are ordered by type, thickest first', async () => {
  const { sortGroups } = await import('./sync.js');
  const keys = ['interior|partition|2x4', 'interior|knee|2x6', 'exterior|exterior|2x4', 'interior|shear|2x4', 'exterior|exterior|2x6', 'interior|bearing|2x6', 'interior|partition|2x6'];
  assert.deepEqual(sortGroups(keys.map((key) => ({ key, lengthFt: 1 }))).map((g) => g.key), [
    'exterior|exterior|2x6', 'exterior|exterior|2x4', 'interior|bearing|2x6', 'interior|shear|2x4', 'interior|partition|2x6', 'interior|partition|2x4', 'interior|knee|2x6',
  ]);
});

test('plan or manual length in a linked section', async () => {
  const { syncPlanSections } = await import('./sync.js');
  const plan = { ptPerFt: 10, linked: true, walls: [{ id: 'a', x1: 0, y1: 0, x2: 300, y2: 0, kind: 'exterior', size: '2x6' }] };
  const sec = { id: 's', planKey: 'exterior|exterior|2x6', lengthLF: 12, extras: [], sel: {} };
  const auto = syncPlanSections({ plan, exteriorSections: [sec], interiorSections: [] }, (x) => x);
  assert.deepEqual([auto.exteriorSections[0].lengthLF, auto.exteriorSections[0].planLF], [30, 30]);
  const manual = syncPlanSections({ plan, exteriorSections: [{ ...sec, planManual: true }], interiorSections: [] }, (x) => x);
  assert.deepEqual([manual.exteriorSections[0].lengthLF, manual.exteriorSections[0].planLF], [12, 30]);
});

test('fireblocking: walls without blocking over 10 ft get a row', () => {
  const tall = frameWall({ lengthIn: 96, heightIn: 144, depthIn: 3.5, spacing: 16, panelIn: 96, blocking: false });
  assert.equal(tall.fireRows, 1);
  assert.ok(tall.cuts.fireBlocking.length > 0);
  const ten = frameWall({ lengthIn: 96, heightIn: 120, depthIn: 3.5, spacing: 16, panelIn: 96, blocking: false });
  assert.equal(ten.fireRows, 0);
  const ext = frameWall({ lengthIn: 96, heightIn: 144, depthIn: 5.5, spacing: 16, panelIn: 96 });
  assert.equal(ext.fireRows, 0, 'blocking rows every 4 ft already fireblock');
});

test('posts: full-height members, no common stud or panel joint through them', () => {
  const post = { a0: 94, a1: 98.5, kind: 'builtup', plies: 3 }; // (3) 2x6 right where the 8' joint would be
  const f = frameWall({ lengthIn: 240, heightIn: 120, depthIn: 5.5, spacing: 16, panelIn: 96, posts: [post] });
  assert.equal(f.members.filter((m) => m.t === 'post').length, 3);
  assert.equal(f.counts.posts, 1);
  for (const p of f.panels.slice(1)) assert.ok(p.start <= 94 + 0.01 || p.start >= 98.5 - 0.01, `joint ${p.start} not in the post`);
  assert.ok(!f.members.some((m) => m.t === 'stud' && m.a1 > 94.01 && m.a0 < 98.49));
});
