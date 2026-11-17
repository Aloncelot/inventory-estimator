import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTIMATE_TOOLS, LOOSE_TYPES, runEstimateTool, findLevel, findWallSection, findLooseSection,
  estimateContext, estimateChanges,
} from './estimateTools.js';
import { blankEstimateData, blankLevel } from '../estimate/blank.js';

// a selection as ItemPicker stores it, with a price so totals move
const ZIP = {
  family: 'green_zip', familyLabel: 'Green Zip', sizeLookupId: 'gz2', sizeLabel: `4x8'-7/16" R6`,
  vendorId: 'v1', vendorName: 'Vendor One', item: { unit: 'sheet', basePrice: 40, priceWithMarkup: 48, priceDate: 1 },
};
const HANGER = {
  family: 'simpson', familyLabel: 'Simpson', sizeLookupId: 'lus', sizeLabel: 'LUS210',
  vendorId: 'v1', vendorName: 'Vendor One', item: { unit: 'pcs', basePrice: 2, priceDate: 1 },
};

const est0 = () => {
  const e = blankEstimateData();
  e.levels.push(blankLevel({ index: 1, name: 'Level 2' }));
  return e;
};
const run = (est, name, args, session = {}) => runEstimateTool(est, name, args, session);

test('a 50 × 120 rectangle on "level 1" is a 340 LF exterior section', () => {
  const est = est0();
  const { est: next, result } = run(est, 'add_wall_section', {
    level: 'level 1', side: 'exterior', rectangle: { width: 50, length: 120 },
    height_ft: 12, studs: 'single', stud_spacing_in: 16,
  });
  assert.equal(result.ok, true);
  const s = next.levels[0].exteriorSections.at(-1);
  assert.equal(s.lengthLF, 340);
  assert.equal(s.heightFt, 12);
  assert.equal(s.studMultiplier, 1);
  assert.equal(s.studSpacingIn, 16);
  assert.equal(s.kind, 'exterior');
  assert.equal(s.name, 'Section 2');
  assert.equal(s.sel.sheathing, null);
  assert.equal(est.levels[0].exteriorSections.length, 1, 'the estimate passed in is not changed');
  // the rectangle can also come as text
  const t = run(est, 'add_wall_section', { level: '1', side: 'exterior', name: 'Garage', rectangle: '24 x 30' });
  assert.equal(t.est.levels[0].exteriorSections.at(-1).lengthLF, 108);
  assert.equal(run(est, 'add_wall_section', { level: '1', side: 'exterior', rectangle: { width: -5, length: 10 } }).result.ok, false);
});

test('materials only from find_material ids of the same session', () => {
  const est = est0();
  const session = { materials: new Map([['m1', ZIP]]) };
  const ok = run(est, 'add_wall_section', { level: 'Level 1', side: 'exterior', name: 'Poolhouse', length_lf: 150, sheathing: 'm1', studs: 'double' }, session);
  assert.equal(ok.result.ok, true);
  const s = ok.est.levels[0].exteriorSections.at(-1);
  assert.deepEqual(s.sel.sheathing, ZIP);
  assert.equal(s.studMultiplier, 2);
  const bad = run(est, 'add_wall_section', { level: 'Level 1', side: 'exterior', length_lf: 150, sheathing: 'm7' }, session);
  assert.equal(bad.result.ok, false);
  assert.match(bad.result.error, /find_material/);
  assert.equal(bad.est, est);
  assert.equal(run(est, 'add_wall_section', { level: 'Level 1', side: 'exterior', length_lf: 10, sheathing: 'm1' }, {}).result.ok, false);
});

test('interior kinds', () => {
  const est = est0();
  const r = run(est, 'add_wall_section', { level: 'Level 2', side: 'interior', kind: 'shear', name: 'Shear A', length_lf: 40 });
  assert.equal(r.result.ok, true);
  assert.equal(r.est.levels[1].interiorSections.at(-1).kind, 'shear');
  assert.equal(r.est.levels[1].exteriorSections.length, 1);
  assert.equal(run(est, 'add_wall_section', { level: 'Level 2', side: 'interior', kind: 'banana', length_lf: 4 }).result.ok, false);
  assert.equal(run(est, 'add_wall_section', { level: 'Level 2', side: 'exterior', kind: 'shear', length_lf: 4 }).result.ok, false);
  assert.equal(run(est, 'add_wall_section', { level: 'Level 9', side: 'exterior', length_lf: 4 }).result.ok, false);
});

test('perimeter of sides or a rectangle; nonsense fails', () => {
  const e = est0();
  assert.equal(run(e, 'perimeter', { sides: [20, 10, 20, 10] }).result.perimeter_lf, 60);
  assert.equal(run(e, 'perimeter', { width: 50, length: 120 }).result.perimeter_lf, 340);
  // an L-shape: six sides
  assert.equal(run(e, 'perimeter', { sides: [40, 20, 15, 10, 25, 30] }).result.perimeter_lf, 140);
  assert.equal(run(e, 'perimeter', { width: 0, length: 5 }).result.ok, false);
  assert.equal(run(e, 'perimeter', { sides: [10, -2] }).result.ok, false);
  assert.equal(run(e, 'perimeter', {}).result.ok, false);
  assert.equal(run(e, 'perimeter', { sides: [10, 10] }).est, e);
});

test('update changes only the given fields; remove takes it out', () => {
  let est = run(est0(), 'add_wall_section', { level: '1', side: 'exterior', name: 'Poolhouse', length_lf: 150 }).est;
  const before = est.levels[0].exteriorSections.at(-1);
  const u = run(est, 'update_wall_section', { section: 'poolhouse wall', height_ft: 9, studs: 'triple' });
  assert.equal(u.result.ok, true);
  const after = u.est.levels[0].exteriorSections.at(-1);
  assert.deepEqual(after, { ...before, heightFt: 9, studMultiplier: 3 });
  assert.equal(u.est.levels[0].exteriorSections[0], est.levels[0].exteriorSections[0]);
  // interior kinds change among themselves; an exterior section stays exterior
  assert.equal(run(est, 'update_wall_section', { section: 'Poolhouse', kind: 'shear' }).result.ok, false);
  const k = run(est, 'update_wall_section', { section: 'section 1', level: 'level 2', kind: 'interior' });
  assert.equal(k.result.ok, false, 'Section 1 on Level 2 is both exterior and interior');
  const r = run(u.est, 'remove_wall_section', { section: 'Poolhouse' });
  assert.equal(r.result.ok, true);
  assert.equal(r.est.levels[0].exteriorSections.length, 1);
  assert.equal(run(u.est, 'remove_wall_section', { section: 'nothing like it' }).result.ok, false);
});

test('find levels and sections loosely, or fail with the candidates', () => {
  const est = est0();
  for (const ref of ['level one', 'Level 1', '1', 'first floor', '1st level']) {
    assert.equal(findLevel(est, ref).value, est.levels[0], ref);
  }
  assert.equal(findLevel(est, 'second level').value, est.levels[1]);
  assert.match(findLevel(est, 'level').error, /Level 1.*Level 2/);
  assert.match(findLevel(est, 'attic').error, /Level 1.*Level 2/);
  // "Section 1" is on both levels and both sides
  const amb = findWallSection(est, 'Section 1');
  assert.ok(amb.error);
  assert.match(amb.error, /#1.*#2.*#3.*#4/);
  assert.equal(findWallSection(est, 'section 1 exterior', 'level 2').value, est.levels[1].exteriorSections[0]);
  assert.equal(findWallSection(est, '#3').value, est.levels[1].exteriorSections[0]);
  assert.equal(findWallSection(est, 'level 2 exterior section 1').value, est.levels[1].exteriorSections[0]);
  // a bare number is a name: no section is called "3"
  assert.ok(findWallSection(est, '3').error);
  // loose sections: "level one" is the "1st Level" section
  assert.equal(findLooseSection(est, 'level one').value.name, '1st Level');
  assert.equal(findLooseSection(est, 'first floor').value.name, '1st Level');
  assert.equal(findLooseSection(est, 'roof').value.name, 'Roof');
  assert.ok(findLooseSection(est, 'garage').error);
});

test('add a level on top or a basement below', () => {
  let est = run(est0(), 'add_level', { where: 'top' }).est;
  assert.equal(est.levels.at(-1).name, 'Level 3');
  est = run(est, 'add_level', { where: 'below' }).est;
  assert.equal(est.levels[0].name, 'Basement');
  est = run(est, 'add_level', { where: 'below' }).est;
  assert.equal(est.levels[0].name, 'Basement 2');
  assert.equal(run(est, 'add_level', { where: 'sideways' }).result.ok, false);
});

test('loose rows by type: quantity, LF, formula; unknown types list close ones', () => {
  const est = est0();
  const session = { materials: new Map([['m3', HANGER]]) };
  const h = run(est, 'add_loose_row', { section: 'Roof', type: 'Hangers - Joist', quantity: 20, material: 'm3' }, session);
  assert.equal(h.result.ok, true);
  const roof = h.est.looseList.find((s) => s.name === 'Roof');
  const row = roof.rows.at(-1);
  assert.equal(row.type, 'Hangers - Joist');
  assert.equal(row.qty, 20);
  assert.deepEqual(row.item, HANGER);
  // "joist hangers" finds the same type
  assert.equal(run(est, 'add_loose_row', { section: 'Roof', type: 'joist hangers', quantity: 4 }).est.looseList.find((s) => s.name === 'Roof').rows[0].type, 'Hangers - Joist');

  const j = run(est, 'add_loose_row', { section: 'level one', type: 'Joist', length_lf: 120 });
  assert.equal(j.result.ok, true);
  assert.equal(j.est.looseList.find((s) => s.name === '1st Level').rows.at(-1).inputs.lengthLF, 120);
  assert.equal(run(est, 'add_loose_row', { section: 'Roof', type: 'Joist', quantity: 5 }).result.ok, false, 'joists are measured in LF');

  const x = run(est, 'add_loose_row', { section: 'Roof', type: 'Extra', formula: '12*16+4', note: 'Ladder blocking' });
  const xr = x.est.looseList.find((s) => s.name === 'Roof').rows.at(-1);
  assert.equal(xr.inputs.formula, '12*16+4');
  assert.equal(xr.desc, 'Ladder blocking');
  assert.equal(run(est, 'add_loose_row', { section: 'Roof', type: 'Extra', formula: '12*(' }).result.ok, false);

  const s = run(est, 'add_loose_row', { section: 'Basement', type: 'Subfloor', area_sqft: 900 });
  assert.equal(s.est.looseList.find((x) => x.name === 'Basement').rows.at(-1).inputs.area, 900);

  const bad = run(est, 'add_loose_row', { section: 'Roof', type: 'Hangerz' });
  assert.equal(bad.result.ok, false);
  assert.match(bad.result.error, /Hangers - Joist/);
  assert.ok(LOOSE_TYPES.includes('Hangers - Joist'));
});

test('add a loose section and remove a row', () => {
  let est = run(est0(), 'add_loose_section', { name: 'Poolhouse' }).est;
  assert.equal(est.looseList.at(-1).name, 'Poolhouse');
  assert.equal(run(est, 'add_loose_section', { name: 'poolhouse' }).result.ok, false);
  est = run(est, 'add_loose_row', { section: 'Poolhouse', type: 'Joist', length_lf: 120 }).est;
  est = run(est, 'add_loose_row', { section: 'Poolhouse', type: 'Hangers - Joist', quantity: 12 }).est;
  const r = run(est, 'remove_loose_row', { section: 'Poolhouse', row: 'hangers' });
  assert.equal(r.result.ok, true);
  assert.deepEqual(r.est.looseList.at(-1).rows.map((x) => x.type), ['Joist']);
  assert.equal(run(est, 'remove_loose_row', { section: 'Poolhouse', row: '#1' }).est.looseList.at(-1).rows[0].type, 'Hangers - Joist');
  assert.equal(run(est, 'remove_loose_row', { section: 'Poolhouse', row: 'row 1' }).est.looseList.at(-1).rows[0].type, 'Hangers - Joist');
  assert.equal(run(est, 'remove_loose_row', { section: 'Poolhouse', row: '#5' }).result.ok, false);
  assert.equal(run(est, 'remove_loose_row', { section: 'Poolhouse', row: '1' }).result.ok, false, 'a bare number is not a position');
});

test('find_material numbers results across calls and keeps their selections', async () => {
  const catalog = {
    getFamilies: async () => [{ value: 'green_zip', label: 'Green Zip' }, { value: 'spf2', label: 'SPF#2' }],
    getSizesForFamily: async (f) => (f === 'green_zip'
      ? [{ value: 'gz2', label: `4x8'-7/16" R6`, vendorIds: ['v1'] }]
      : [{ value: 's1', label: `2x6"-10'`, vendorIds: ['v1'] }]),
    getVendorsForIds: async (ids) => ids.map((id) => ({ value: id, label: 'Vendor One' })),
    getFinalItem: async () => ({ unit: 'pcs', basePrice: 10, priceWithMarkup: 12, priceDate: 1 }),
  };
  const session = { catalog };
  const est = est0();
  const a = await run(est, 'find_material', { query: 'green zip R6' }, session);
  assert.equal(a.result.ok, true);
  assert.equal(a.est, est);
  const id1 = a.result.materials[0].id;
  assert.match(id1, /^m[a-z0-9]+-1$/);
  const b = await run(est, 'find_material', { query: '2x6 10' }, session);
  const id2 = b.result.materials[0].id;
  assert.equal(id2, id1.replace(/1$/, '2'));
  assert.equal(session.materials.get(id1).familyLabel, 'Green Zip');
  assert.equal(session.materials.get(id2).sizeLabel, `2x6"-10'`);
  // the id works in this request, and a stale "m1" from an earlier one matches nothing
  const used = run(est, 'add_wall_section', { level: 'Level 1', side: 'exterior', length_lf: 10, sheathing: id1 }, session);
  assert.equal(used.est.levels[0].exteriorSections.at(-1).sel.sheathing.familyLabel, 'Green Zip');
  assert.notEqual(used.est.levels[0].exteriorSections.at(-1).sel.sheathing, session.materials.get(id1), 'stored as a copy');
  assert.equal(run(est, 'add_wall_section', { level: 'Level 1', side: 'exterior', length_lf: 10, sheathing: 'm1' }, session).result.ok, false);
  const next = { catalog };
  await run(est, 'find_material', { query: 'green zip' }, next);
  assert.ok(!next.materials.has(id1) || next.tag === session.tag);
  const none = await run(est, 'find_material', { query: 'titanium' }, session);
  assert.equal(none.result.ok, false);
  assert.match(none.result.error, /price list/);
  const broken = await run(est, 'find_material', { query: 'zip' }, { catalog: { ...catalog, getFamilies: async () => { throw new Error('offline'); } } });
  assert.equal(broken.result.ok, false);
});

test('context lists levels, sections, rows and totals', () => {
  const est = run(est0(), 'add_wall_section', { level: '1', side: 'exterior', name: 'Poolhouse', length_lf: 150, sheathing: 'm1', studs: 'double' }, { materials: new Map([['m1', ZIP]]) }).est;
  const ctx = estimateContext(est);
  assert.match(ctx, /Level 1/);
  assert.match(ctx, /#2 Poolhouse \| exterior \| 150 LF \| 12' high \| 16" o\.c\. \| studs ×2 \| sheathing Green Zip 4x8'-7\/16" R6/);
  assert.match(ctx, /1st Level/);
  assert.match(ctx, /Joist/);
  assert.match(ctx, /Wall panels \$[\d,.]+ · Loose \$[\d,.]+/);
});

test('changes: one add, a totals delta, removed sections shown, unchanged ignored', () => {
  const est = est0();
  const session = { materials: new Map([['m1', ZIP]]) };
  const next = run(est, 'add_wall_section', { level: '1', side: 'exterior', name: 'Poolhouse', length_lf: 150, sheathing: 'm1' }, session).est;
  const ch = estimateChanges(est, next);
  assert.equal(ch.items.length, 1);
  assert.equal(ch.items[0].kind, 'add');
  assert.match(ch.items[0].text, /Poolhouse/);
  assert.ok(ch.totals);
  assert.notEqual(ch.totals.from, ch.totals.to);
  // the sheathing price is in the delta: more than the same wall without it
  const plain = run(est, 'add_wall_section', { level: '1', side: 'exterior', name: 'Poolhouse', length_lf: 150 }).est;
  const num = (m) => Number(String(m).replace(/[^\d.]/g, ''));
  assert.ok(num(ch.totals.to) > num(estimateChanges(est, plain).totals.to));

  assert.deepEqual(estimateChanges(est, est), { items: [], totals: null });

  const upd = run(next, 'update_wall_section', { section: 'Poolhouse', height_ft: 9 }).est;
  const cu = estimateChanges(next, upd);
  assert.equal(cu.items.length, 1);
  assert.equal(cu.items[0].kind, 'change');
  assert.match(cu.items[0].text, /12' → 9'/);

  const gone = run(next, 'remove_wall_section', { section: 'Poolhouse' }).est;
  const cr = estimateChanges(next, gone);
  assert.deepEqual(cr.items.map((i) => i.kind), ['remove']);

  const rows = run(est, 'add_loose_row', { section: 'Roof', type: 'Hangers - Joist', quantity: 20 }).est;
  const cl = estimateChanges(est, rows);
  assert.equal(cl.items.length, 1);
  assert.match(cl.items[0].text, /Roof.*Hangers - Joist.*20/);
  assert.equal(cl.totals, null, 'no price, no delta');
});

test('every tool has a spec', () => {
  const names = ESTIMATE_TOOLS.map((t) => t.name);
  for (const n of ['find_material', 'perimeter', 'add_level', 'add_wall_section', 'update_wall_section', 'remove_wall_section', 'add_loose_section', 'add_loose_row', 'remove_loose_row']) {
    assert.ok(names.includes(n), n);
  }
  for (const t of ESTIMATE_TOOLS) assert.ok(t.name && t.description && t.params);
  assert.equal(run(est0(), 'mystery', {}).result.ok, false);
});

test('a bare number is a name first: "1" is Level 1 even with a basement in front', () => {
  const est = run(est0(), 'add_level', { where: 'below' }).est;
  assert.equal(est.levels[0].name, 'Basement');
  assert.equal(findLevel(est, '1').value.name, 'Level 1');
  assert.equal(findLevel(est, 'level one').value.name, 'Level 1');
  assert.equal(findLevel(est, '#1').value.name, 'Basement');
  assert.match(findLevel(est, '7').error, /Basement.*Level 1.*Level 2/);
  assert.equal(findLooseSection(est, '1').value.name, '1st Level', '"1" is not Foundation');
  assert.equal(findLooseSection(est, '#1').value.name, 'Foundation');
  const r = run(est, 'add_wall_section', { level: '1', side: 'exterior', length_lf: 20, name: 'Porch' });
  assert.equal(r.est.levels[1].exteriorSections.at(-1).name, 'Porch');
});

test('"section 2" never matches Section 1 of Level 2', () => {
  const est = est0();
  est.levels[1] = { ...est.levels[1], interiorSections: [] };
  const r = run(est, 'remove_wall_section', { section: 'section 2' });
  assert.equal(r.result.ok, false);
  assert.equal(r.est, est);
  assert.equal(r.est.levels[1].exteriorSections.length, 1);
  const two = run(est, 'add_wall_section', { level: 'Level 1', side: 'exterior', length_lf: 10 }).est;
  assert.equal(findWallSection(two, 'section 2').value.name, 'Section 2');
});

test('amounts can be calculations; bad ones fail', () => {
  const est = est0();
  const j = run(est, 'add_loose_row', { section: 'Roof', type: 'Joist', length_lf: '14*16' });
  assert.equal(j.result.ok, true);
  assert.equal(j.est.looseList.find((s) => s.name === 'Roof').rows.at(-1).inputs.lengthLF, 224);
  assert.deepEqual(j.result.calculated, ['14*16 = 224']);
  const a = run(est, 'add_loose_row', { section: 'Roof', type: 'Subfloor', area_sqft: '30*40' });
  assert.equal(a.est.looseList.find((s) => s.name === 'Roof').rows.at(-1).inputs.area, 1200);
  const h = run(est, 'add_loose_row', { section: 'Roof', type: 'Hangers - Joist', quantity: '14*2' });
  assert.equal(h.est.looseList.find((s) => s.name === 'Roof').rows.at(-1).qty, 28);
  const w = run(est, 'add_wall_section', { level: '1', side: 'exterior', length_lf: '3*24' });
  assert.equal(w.est.levels[0].exteriorSections.at(-1).lengthLF, 72);
  assert.equal(run(est, 'perimeter', { sides: ['2*20', 10, '40', 10] }).result.perimeter_lf, 100);
  const bad = run(est, 'add_loose_row', { section: 'Roof', type: 'Joist', length_lf: '14*x' });
  assert.equal(bad.result.ok, false);
  assert.match(bad.result.error, /Could not calculate length_lf "14\*x"/);
  assert.equal(run(est, 'add_loose_row', { section: 'Roof', type: 'Joist', length_lf: '10-20' }).result.ok, false);
});

test('small guards: nothing to change, duplicate names, sides with width', () => {
  const est = est0();
  assert.equal(run(est, 'update_wall_section', { section: '#1' }).result.ok, false);
  const u = run(est, 'update_wall_section', { section: '#1', height_ft: 9 });
  assert.deepEqual(u.result.changed, ["12' → 9' high"]);
  assert.equal(run(est, 'add_wall_section', { level: '1', side: 'exterior', name: 'section 1', length_lf: 5 }).result.ok, false);
  const p = run(est, 'add_wall_section', { level: '1', side: 'exterior', name: 'Porch', length_lf: 5 }).est;
  assert.equal(run(p, 'update_wall_section', { section: 'Porch', name: 'Section 1' }).result.ok, false);
  assert.equal(run(est, 'perimeter', { sides: [10, 10], width: 5 }).result.ok, false);
  assert.match(run(est, 'add_loose_row', { section: 'Roof', type: 'Ledger', length_lf: 40 }).result.error, /Extra with a formula/);
});

test('a loose row without a material warns that it costs nothing', () => {
  const none = run(est0(), 'add_loose_row', { section: 'Roof', type: 'Hangers - Joist', quantity: 4 });
  assert.equal(none.result.ok, true);
  assert.match(none.result.warning, /No material/);
  const withM = run(est0(), 'add_loose_row', { section: 'Roof', type: 'Hangers - Joist', quantity: 4, material: 'm3' }, { materials: new Map([['m3', HANGER]]) });
  assert.equal(withM.result.warning, undefined);
});

test('plan-linked sections: a typed length keeps, removal is refused, context says from plan', () => {
  let est = run(est0(), 'add_wall_section', { level: '1', side: 'exterior', name: 'Plan wall', length_lf: 100 }).est;
  const lv = est.levels[0];
  est = { ...est, levels: [{ ...lv, exteriorSections: lv.exteriorSections.map((s) => (s.name === 'Plan wall' ? { ...s, planKey: 'a|b|2x6', planLF: 100, planManual: false } : s)) }, ...est.levels.slice(1)] };
  assert.match(estimateContext(est), /Plan wall .*\| from plan/);
  const rm = run(est, 'remove_wall_section', { section: 'Plan wall' });
  assert.equal(rm.result.ok, false);
  assert.match(rm.result.error, /Plan takeoff/);
  const u = run(est, 'update_wall_section', { section: 'Plan wall', length_lf: 120 });
  assert.equal(u.result.ok, true);
  const s = u.est.levels[0].exteriorSections.find((x) => x.name === 'Plan wall');
  assert.equal(s.lengthLF, 120);
  assert.equal(s.planManual, true);
  assert.match(u.result.note, /plan measures 100 LF/);
  assert.doesNotMatch(estimateContext(u.est), /from plan/);
  // other edits leave the plan link alone
  const h = run(est, 'update_wall_section', { section: 'Plan wall', height_ft: 9 });
  assert.notEqual(h.est.levels[0].exteriorSections.find((x) => x.name === 'Plan wall').planManual, true);
  // once typed by hand it can be removed
  assert.equal(run(u.est, 'remove_wall_section', { section: 'Plan wall' }).result.ok, true);
});
