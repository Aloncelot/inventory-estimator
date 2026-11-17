import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeCalendar, laborPhases, syncFromEstimate, computeSchedule, delayTask, setTaskDays,
  addTask, removeTask, parsePredecessors, setTaskDeps, setNotBefore,
  indentTask, outdentTask, breakDownTask, toggleCollapsed,
} from './schedule.js';

const sec = (id, kind, lengthLF, heightFt) => ({ id, kind, lengthLF, heightFt, studSpacingIn: 16, sel: {} });
const est = {
  levels: [
    { id: 'L1', name: 'Level 1', exteriorSections: [sec('e1', 'exterior', 160, 10)], interiorSections: [sec('i1', 'partition', 120, 10)] },
    { id: 'L2', name: 'Level 2', exteriorSections: [sec('e2', 'exterior', 160, 9)], interiorSections: [] },
  ],
  looseList: [
    { id: 'f2', name: 'Level 2', rows: [{ id: 'r1', type: 'Subfloor', inputs: { area: 900 }, wastePct: 0 }] },
    { id: 'rf', name: 'Roof', kind: 'roof', inputs: { roofArea: 1400 } },
  ],
  labor: { qty: { 'roofTrusses|rf': 30 } },
};

let k = 0;
const ids = () => `id${(k += 1)}`;

test('calendar: work days skip weekends and days off', () => {
  // 2026-11-13 is a Friday
  const cal = makeCalendar({ start: '2026-11-13', daysOff: ['2026-11-17'] });
  assert.equal(cal.dateOf(0), '2026-11-13');
  assert.equal(cal.dateOf(1), '2026-11-16'); // Monday
  assert.equal(cal.dateOf(2), '2026-11-18'); // Tuesday is off
  assert.equal(cal.indexOf('2026-11-14'), 1); // Saturday → Monday
  const sat = makeCalendar({ start: '2026-11-13', workWeek: 'mon-sat' });
  assert.equal(sat.dateOf(1), '2026-11-14');
});

test('phases: built level by level, roof, windows after the roof, punch list last', () => {
  const ph = laborPhases(est);
  const srcs = ph.map((p) => p.src);
  assert.ok(srcs.includes('roof'));
  assert.equal(srcs[srcs.length - 1], 'punch');
  const walls1 = srcs.indexOf('0|Walls'), walls2 = srcs.indexOf('1|Walls'), roof = srcs.indexOf('roof');
  assert.ok(walls1 >= 0 && walls1 < walls2 && walls2 < roof);
  for (const p of ph) assert.ok(p.days >= 1, `${p.src} has days`);
  // one crew: every crew phase before the roof waits for the one before it
  assert.deepEqual(ph[1].deps, [ph[0].src]);
  assert.deepEqual(ph.find((p) => p.src === 'roof').deps, [srcs[roof - 1]]);
});

test('sync: adds the phases once and keeps the user changes', () => {
  const ph = laborPhases(est);
  const { schedule: s1, added } = syncFromEstimate({ start: '2026-11-16' }, ph, ids);
  assert.equal(added, ph.length);
  assert.equal(s1.tasks.length, ph.length);
  const roof = s1.tasks.find((t) => t.src === 'roof');
  const edited = setTaskDays(delayTask(s1, roof.id, 3), roof.id, 4);
  const withMine = addTask(edited, { name: 'Inspection', days: 1, deps: [roof.id] }, ids);
  const { schedule: s2, added: a2, removed } = syncFromEstimate(withMine, ph, ids);
  assert.equal(a2, 0);
  assert.equal(removed, 0);
  const roof2 = s2.tasks.find((t) => t.src === 'roof');
  assert.equal(roof2.lag, 3);
  assert.equal(roof2.days, 4);
  assert.ok(s2.tasks.some((t) => t.name === 'Inspection'));
  // a level that goes away takes its phases out and the links skip it
  const less = laborPhases({ ...est, levels: [est.levels[0]] });
  const { schedule: s3, removed: r3 } = syncFromEstimate(s2, less, ids);
  assert.ok(r3 > 0);
  const known = new Set(s3.tasks.map((t) => t.id));
  for (const t of s3.tasks) for (const d of t.deps) assert.ok(known.has(d));
});

test('dates: finish to start, delays move what waits, critical path', () => {
  const s = {
    start: '2026-11-16', // Monday
    tasks: [
      { id: 'a', name: 'Foundation', days: 5, deps: [] },
      { id: 'b', name: 'Walls', days: 3, deps: ['a'] },
      { id: 'c', name: 'Permit', days: 2, deps: [] },
      { id: 'd', name: 'Roof', days: 2, deps: ['b', 'c'] },
    ],
  };
  const r = computeSchedule(s);
  assert.equal(r.byId.get('a').finish, '2026-11-20');
  assert.equal(r.byId.get('b').start, '2026-11-23');
  assert.equal(r.byId.get('d').start, '2026-11-26');
  assert.equal(r.finish, '2026-11-27');
  assert.equal(r.workDays, 10);
  assert.ok(r.byId.get('a').critical && r.byId.get('b').critical && r.byId.get('d').critical);
  assert.equal(r.byId.get('c').critical, false);
  assert.equal(r.byId.get('c').slack, 6);
  // "walls delayed 2 weeks"
  const late = computeSchedule(delayTask(s, 'b', 10));
  assert.equal(late.byId.get('b').start, '2026-12-07');
  assert.equal(late.byId.get('d').start, '2026-12-10');
  // not before a date
  const nb = computeSchedule(setNotBefore(s, 'c', '2026-12-01'));
  assert.equal(nb.byId.get('c').start, '2026-12-01');
});

test('links: loops are left out, removing a task keeps the chain', () => {
  const s = { start: '2026-11-16', tasks: [{ id: 'a', days: 1, deps: ['b'] }, { id: 'b', days: 1, deps: ['a'] }] };
  const r = computeSchedule(s);
  assert.equal(r.loops.length, 2);
  const chain = { tasks: [{ id: 'a', days: 1, deps: [] }, { id: 'b', days: 1, deps: ['a'] }, { id: 'c', days: 1, deps: ['b'] }] };
  assert.deepEqual(removeTask(chain, 'b').tasks.find((t) => t.id === 'c').deps, ['a']);
  assert.deepEqual(setTaskDeps(chain, 'a', ['a', 'c', 'c']).tasks[0].deps, ['c']);
});

test('predecessors typed as row numbers', () => {
  const tasks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(parsePredecessors('1, 3', tasks), ['a', 'c']);
  assert.deepEqual(parsePredecessors('', tasks), []);
  assert.equal(parsePredecessors('4', tasks), null);
});

test('a 0-day task is a milestone', () => {
  const r = computeSchedule({ start: '2026-11-16', tasks: [{ id: 'a', days: 2, deps: [] }, { id: 'm', days: 0, deps: ['a'] }, { id: 'b', days: 1, deps: ['m'] }] });
  assert.equal(r.byId.get('m').start, '2026-11-18');
  assert.equal(r.byId.get('b').start, '2026-11-18');
});

test('folders: a folder runs from its first task to its last, its links hold for what is inside', () => {
  const s = {
    start: '2026-11-16',
    tasks: [
      { id: 'a', name: 'Foundation', days: 3, deps: [] },
      { id: 'w', name: 'Walls', days: 9, deps: ['a'] },
      { id: 'w1', name: 'Rooms 102-105', days: 1, deps: [], parent: 'w' },
      { id: 'w2', name: 'Rooms 106-110', days: 2, deps: ['w1'], parent: 'w' },
      { id: 'r', name: 'Roof', days: 2, deps: ['w'] },
    ],
  };
  const r = computeSchedule(s);
  const w = r.byId.get('w');
  assert.equal(w.summary, true);
  assert.equal(r.byId.get('w1').start, '2026-11-19'); // after the foundation, through the folder
  assert.equal(w.start, '2026-11-19');
  assert.equal(w.finish, '2026-11-23');
  assert.equal(w.dur, 3); // its own 9 days no longer count
  assert.equal(r.byId.get('r').start, '2026-11-24'); // waits for all of the folder
  assert.equal(r.byId.get('w2').depth, 1);
  // moving the folder moves what is inside
  const late = computeSchedule(delayTask(s, 'w', 5));
  assert.equal(late.byId.get('w1').start, '2026-11-26');
  assert.equal(late.byId.get('r').start, '2026-12-01');
  // a link to the folder it is in is left out
  const self = computeSchedule(setTaskDeps(s, 'w1', ['w']));
  assert.deepEqual(self.byId.get('w1').deps, []);
  // collapsed folders hide what is inside
  const c = computeSchedule(toggleCollapsed(s, 'w'));
  assert.equal(c.byId.get('w1').hidden, true);
  assert.equal(c.byId.get('r').hidden, false);
});

test('folders: indent, outdent, add inside, remove with what is inside', () => {
  const base = { tasks: [{ id: 'a', deps: [] }, { id: 'b', deps: ['a'] }, { id: 'c', deps: [] }] };
  const i1 = indentTask(base, 'b');
  assert.equal(i1.tasks[1].parent, 'a');
  assert.deepEqual(i1.tasks[1].deps, []); // can't wait for its own folder
  const i2 = indentTask(i1, 'c'); // c goes into a too, after b
  assert.equal(i2.tasks[2].parent, 'a');
  assert.equal(indentTask(i2, 'a'), i2); // nothing above it
  const o = outdentTask(i2, 'b');
  assert.deepEqual(o.tasks.map((t) => t.id), ['a', 'c', 'b']);
  assert.equal(o.tasks[2].parent, undefined);
  const add = addTask(i2, { name: 'x', parent: 'a' }, () => 'x');
  assert.deepEqual(add.tasks.map((t) => t.id), ['a', 'b', 'c', 'x']);
  const after = addTask(i2, { name: 'y', after: 'a' }, () => 'y');
  assert.deepEqual(after.tasks.map((t) => t.id), ['a', 'b', 'c', 'y']);
  assert.equal(after.tasks[3].parent, undefined);
  const gone = removeTask({ tasks: [...i2.tasks, { id: 'd', deps: ['a'] }] }, 'a');
  assert.deepEqual(gone.tasks.map((t) => t.id), ['d']);
  assert.deepEqual(gone.tasks[0].deps, []);
});

test('break down: a phase into its Labor tasks, close to its days', () => {
  const ph = laborPhases(est);
  const walls = ph.find((p) => p.src === '0|Walls');
  assert.ok(walls.parts.length >= 1);
  assert.equal(walls.parts.reduce((a, x) => a + x.days, 0), walls.days);
  const { schedule } = syncFromEstimate({ start: '2026-11-16' }, ph, ids);
  const wid = schedule.tasks.find((t) => t.src === '0|Walls').id;
  const b = breakDownTask(schedule, wid, ph, ids);
  const kids = b.tasks.filter((t) => t.parent === wid);
  assert.equal(kids.length, walls.parts.length);
  const r = computeSchedule(b, ph);
  assert.equal(r.byId.get(wid).laborDays, walls.days);
  assert.equal(r.byId.get(wid).dur, walls.days);
  assert.equal(breakDownTask(b, wid, ph, ids), b); // once
  // a plain task gets two parts to rename
  const own = breakDownTask({ tasks: [{ id: 'z', name: 'Foundation', deps: [] }] }, 'z', [], ids);
  assert.equal(own.tasks.filter((t) => t.parent === 'z').length, 2);
  // the estimate taking the phase away takes its breakdown with it
  const less = laborPhases({ ...est, levels: [est.levels[1]] });
  const { schedule: s2 } = syncFromEstimate(b, less.filter((p) => p.src !== '0|Walls'), ids);
  assert.equal(s2.tasks.some((t) => t.parent === wid), false);
});
