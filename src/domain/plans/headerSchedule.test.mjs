import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countOf, rowFor, rowValues, applyHeaderSchedule, backToSchedule, floorsAbove, scheduleOpts, fromTemplate, toTemplate, EXAMPLE_TEMPLATE, newScheduleRow,
} from './headerSchedule.js';
import { classifyOpenings, commitPlan } from './openingTypes.js';
import { withPlanHeaders } from './sync.js';

test('callouts to counts', () => {
  assert.equal(countOf('(2) 2x4'), 2);
  assert.equal(countOf('2x4'), 1);
  assert.equal(countOf('4x4'), 1);
  assert.equal(countOf('3'), 3);
  assert.equal(countOf(''), null);
  assert.deepEqual(rowValues({ header: '(3) 2x10', jacks: '(2) 2x6', kings: '2x6', sill: '(2) 2x' }), { kings: 1, jacks: 2, plies: 3, notes: '(3) 2x10 · trimmers (2) 2x6 · kings 2x6 · sill (2) 2x' });
  assert.equal(rowValues({ header: '4x6', sill: '2x' }, 'door').notes, '4x6', 'no sill on doors');
  assert.equal(rowValues({ header: '6x12', plies: 2 }).plies, 2, 'typed plies win');
});

const sched = fromTemplate(EXAMPLE_TEMPLATE);

test('the narrowest row that fits, the most specific first', () => {
  assert.equal(rowFor(sched, { load: 'bearing', size: '2x6', above: 1, widthIn: 36 }).header, '6x6');
  assert.equal(rowFor(sched, { load: 'bearing', size: '2x6', above: 1, widthIn: 37 }).header, '6x8');
  assert.equal(rowFor(sched, { load: 'bearing', size: '2x4', above: 2, widthIn: 80 }).jacks, '4x6');
  assert.equal(rowFor(sched, { load: 'bearing', size: '2x6', above: 0, widthIn: 100 }), null, 'wider than the schedule');
  assert.equal(rowFor(sched, { load: 'nonbearing', size: '2x6', above: 2, widthIn: 32 }).header, '4x6 flat');
  const s2 = { rows: [newScheduleRow({ walls: 'any', size: 'any', above: 'any', upToIn: 48, header: 'any' }), newScheduleRow({ walls: 'bearing', size: '2x6', above: 'any', upToIn: 48, header: 'specific' })] };
  assert.equal(rowFor(s2, { load: 'bearing', size: '2x6', above: 0, widthIn: 40 }).header, 'specific');
  assert.equal(rowFor(s2, { load: 'nonbearing', size: '2x4', above: 0, widthIn: 40 }).header, 'any');
});

const wall = (id, kind, size, openings) => ({ id, x1: 0, y1: 0, x2: 400, y2: 0, kind, size, openings });
const win = (widthIn) => ({ type: 'window', atFt: 2, widthFt: widthIn / 12 });
const door = (widthIn) => ({ type: 'door', atFt: 8, widthFt: widthIn / 12 });

test('opening types take their row; interior bearing walls get types of their own', () => {
  const plan = classifyOpenings({
    walls: [
      wall('e', 'exterior', '2x6', [win(36), win(72)]),
      wall('b', 'bearing', '2x6', [door(36)]),
      wall('p', 'partition', '2x4', [door(36)]),
    ],
  });
  const ids = Object.fromEntries(plan.openingTypes.map((t) => [`${t.scope}|${t.load || ''}|${t.kind}|${t.widthIn}`, t.id]));
  assert.ok(ids['interior|bearing|door|36'] && ids['interior||door|36'] && ids['interior|bearing|door|36'] !== ids['interior||door|36'], 'bearing and partition doors apart');
  const out = applyHeaderSchedule(plan, sched, 1);
  const t = (id) => out.openingTypes.find((x) => x.id === id);
  assert.deepEqual([t(ids['exterior||window|36']).notes.split(' · ')[0], t(ids['exterior||window|36']).jacks, t(ids['exterior||window|36']).plies], ['6x6', 1, 1]);
  assert.equal(t(ids['exterior||window|72']).notes.split(' · ')[0], '6x12');
  assert.equal(t(ids['exterior||window|72']).jacks, 2);
  assert.equal(t(ids['interior|bearing|door|36']).notes.split(' · ')[0], '6x6');
  assert.equal(t(ids['interior||door|36']).notes, '4x4', 'partition door: no sill');
  assert.equal(applyHeaderSchedule(out, sched, 1), out, 'stable');
  // the top floor takes the other rows
  assert.equal(applyHeaderSchedule(out, sched, 0).openingTypes.find((x) => x.id === ids['exterior||window|36']).notes.split(' · ')[0], '6x4');
  // by hand: kept, until sent back to the schedule
  const hand = { ...out, openingTypes: out.openingTypes.map((x) => (x.id === ids['exterior||window|72'] ? { ...x, jacks: 3, byHand: true } : x)) };
  assert.equal(applyHeaderSchedule(hand, sched, 0).openingTypes.find((x) => x.id === ids['exterior||window|72']).jacks, 3);
  const back = { ...hand, openingTypes: hand.openingTypes.map((x) => (x.id === ids['exterior||window|72'] ? backToSchedule(x) : x)) };
  assert.equal(applyHeaderSchedule(back, sched, 0).openingTypes.find((x) => x.id === ids['exterior||window|72']).jacks, 1);
  // too wide: flagged
  const wide = applyHeaderSchedule(classifyOpenings({ walls: [wall('e', 'exterior', '2x6', [win(120)])] }), sched, 0);
  assert.equal(wide.openingTypes[0].schedMiss, true);
  // no schedule: the schedule's numbers go, typed ones stay
  const none = applyHeaderSchedule(out, { rows: [] }, 1);
  assert.equal(none.openingTypes.find((x) => x.id === ids['exterior||window|36']).jacks, undefined);
});

test('numbers typed before the schedule are kept and marked by hand', () => {
  const plan = classifyOpenings({ walls: [wall('e', 'exterior', '2x6', [win(36)])] });
  const typed = { ...plan, openingTypes: plan.openingTypes.map((x) => ({ ...x, kings: 2 })) };
  const out = applyHeaderSchedule(typed, sched, 1);
  assert.deepEqual([out.openingTypes[0].kings, out.openingTypes[0].byHand, out.openingTypes[0].notes], [2, true, undefined]);
});

test('header rows show the plies and the note of their type', () => {
  const level = { id: 'L1', plan: { linked: true, ptPerFt: 12, walls: [wall('e', 'exterior', '2x6', [win(72)])] }, exteriorSections: [], interiorSections: [] };
  let k = 0;
  const make = (p) => ({ id: `s${k++}`, extras: [], ...p });
  const est = { levels: [level, { id: 'L2' }], headerSchedule: sched };
  const out = commitPlan(level, level.plan, make, scheduleOpts(est, 'L1'));
  const sec = out.exteriorSections.find((s) => s.planKey);
  const row = sec.extras.find((x) => x.planType);
  assert.equal(row.planPlies, 1);
  assert.equal(row.inputs.plies, 1);
  assert.match(row.planNote, /^6x12/);
  assert.equal(row.openings[0].jacks, 2);
  assert.equal(withPlanHeaders(sec, out.plan), sec, 'stable');
});

test('floors above a level, and templates', () => {
  const est = { levels: [{ id: 'a' }, { id: 'b' }, { id: 'c', plan: {} }] };
  assert.deepEqual(['a', 'b', 'c'].map((id) => floorsAbove(est, id)), [2, 1, 0]);
  assert.equal(floorsAbove({ levels: [{ id: 'a', plan: { floorsAbove: 0 } }, { id: 'b' }] }, 'a'), 0);
  const tpl = toTemplate(sched, 'Mine');
  assert.equal(tpl.name, 'Mine');
  assert.ok(tpl.rows.every((r) => !('id' in r)));
  const again = fromTemplate(tpl, 't1');
  assert.equal(again.templateId, 't1');
  assert.equal(new Set(again.rows.map((r) => r.id)).size, again.rows.length);
});
