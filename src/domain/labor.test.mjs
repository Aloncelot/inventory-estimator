import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLabor, levelFactor, laborSettings, toLaborTemplate, fromLaborTemplate } from './labor.js';

const sec = (id, kind, lengthLF, heightFt, extra = {}) => ({ id, kind, lengthLF, heightFt, studSpacingIn: 16, sel: {}, ...extra });
const est = {
  levels: [
    { id: 'L1', name: 'Level 1', exteriorSections: [sec('e1', 'exterior', 80, 10)], interiorSections: [sec('i1', 'partition', 40, 10)] },
    { id: 'L2', name: 'Level 2', exteriorSections: [sec('e2', 'exterior', 80, 12)], interiorSections: [] },
  ],
  looseList: [
    { id: 'f2', name: 'Level 2', rows: [{ id: 'r1', type: 'Subfloor', inputs: { area: 320 }, wastePct: 0 }] },
    { id: 'rf', name: 'Roof', kind: 'roof', inputs: { roofArea: 640 } },
  ],
  labor: { qty: { 'roofTrusses|rf': 20 } },
};

test('tasks: panels by level with the sheathing, height and level factors', () => {
  const { tasks, totals } = computeLabor(est);
  const p1 = tasks.find((t) => t.key === 'panels|L1|exterior');
  assert.equal(p1.qty, 10); // 80 LF / 8 ft
  assert.equal(p1.min, 10); // 8 min + 25% sheathed
  assert.equal(p1.factor, 1);
  assert.equal(p1.workerHours, (10 * 10 * 5) / 60 / 0.7); // over the 70% efficiency
  const p2 = tasks.find((t) => t.key === 'panels|L2|exterior');
  assert.equal(+p2.min.toFixed(2), 12); // + 2 ft over 10 ft at 10% a foot
  assert.equal(p2.factor, 1.1);
  assert.equal(tasks.find((t) => t.key === 'panels|L1|partition').min, 8);
  // floor of level 2 from its loose section; the roof over the top level
  assert.equal(tasks.find((t) => t.key === 'subfloor|f2').qty, 10);
  assert.equal(tasks.find((t) => t.key === 'subfloor|f2').factor, 1.1);
  const rt = tasks.find((t) => t.key === 'roofTrusses|rf');
  assert.equal(rt.qty, 20);
  assert.equal(rt.factor, 1.2);
  assert.equal(totals.panels, 10 + 5 + 10);
  assert.equal(totals.crewDays, +(totals.crewWorkerHours / 5 / 8).toFixed(2));
  const punch = tasks.find((x) => x.key === 'punchList');
  const crewOther = tasks.filter((x) => x.team === 'crew' && x.key !== 'punchList').reduce((a, x) => a + x.workerHours, 0);
  assert.ok(Math.abs(punch.workerHours - crewOther * 0.1) < 1e-9);
});

test('rates: pay with burden, bill, per panel and per LF', () => {
  const e = { ...est, labor: { ...est.labor, payRate: 30, burdenPct: 20, markupPct: 80, areaSqFt: 1000, sqftRate: 30.5 } };
  const { totals } = computeLabor(e);
  assert.ok(Math.abs(totals.cost - totals.workerHours * 30 * 1.2) < 0.5);
  assert.ok(Math.abs(totals.bill - totals.cost * 1.8) < 0.5);
  assert.equal(totals.crewBillRate, 64.8);
  assert.equal(totals.sqftBill, 30500);
  assert.equal(totals.sqftDiffPct, Math.round(((30500 - totals.bill) / totals.bill) * 100));
  assert.equal(totals.wallLF, 200);
  assert.equal(totals.wallPerLF, +(totals.wallBill / 200).toFixed(2));
});

test('windows by installers or by the crew; level factors past the list; templates', () => {
  const w = { levels: [{ id: 'L1', name: 'L1', exteriorSections: [sec('e', 'exterior', 40, 9, { openings: [{ type: 'window', qty: 4, widthIn: 36, heightIn: 48 }] })], interiorSections: [] }] };
  const a = computeLabor(w).tasks.find((t) => t.key.startsWith('windows'));
  const b = computeLabor({ ...w, labor: { windowsBy: 'crew' } }).tasks.find((t) => t.key.startsWith('windows'));
  if (a) {
    assert.equal(a.team, 'installers');
    assert.equal(a.workerHours, (a.qty * 30 * 2) / 60);
    assert.equal(b.workerHours, (b.qty * 60 * 5) / 60);
  }
  assert.equal(levelFactor(laborSettings({ levelFactors: [1, 1.1] }), 3), 1.3);
  const tpl = toLaborTemplate({ crew: 4, times: { panel: 7 }, qty: { x: 1 } }, 'Crew A');
  assert.equal(tpl.qty, undefined);
  assert.equal(tpl.times.panel, 7);
  const back = fromLaborTemplate(tpl, { qty: { x: 1 } }, 'id1');
  assert.deepEqual([back.crew, back.qty.x, back.templateName], [4, 1, 'Crew A']);
});

test('Summary totals: materials, labor by time or per sq ft, subtotal', async () => {
  const { projectTotals } = await import('./aggregate/projectTotals.js');
  const t = projectTotals(est);
  assert.equal(t.subtotal, Math.round((t.materials + t.labor) * 100) / 100);
  assert.equal(t.laborBy, 'time');
  assert.equal(t.labor, computeLabor(est).totals.bill);
  const e2 = { ...est, labor: { ...est.labor, priceBy: 'sqft', areaSqFt: 1000, sqftRate: 9 } };
  const t2 = projectTotals(e2);
  assert.deepEqual([t2.laborBy, t2.labor], ['sqft', 9000]);
});
