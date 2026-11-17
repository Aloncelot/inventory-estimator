import test from 'node:test';
import assert from 'node:assert/strict';
import { findTask, runScheduleTool, scheduleContext, scheduleChanges, SCHEDULE_TOOLS } from './scheduleTools.js';

const s0 = {
  start: '2026-11-16',
  tasks: [
    { id: 'a', name: 'Foundation', days: 5, deps: [] },
    { id: 'b', name: 'Walls · Level 1', days: 3, deps: ['a'] },
    { id: 'c', name: 'Walls · Level 2', days: 3, deps: ['b'] },
    { id: 'd', name: 'Roof', days: 2, deps: ['c'] },
  ],
};

test('find a task by row or name', () => {
  assert.equal(findTask(s0.tasks, '4').task.id, 'd');
  assert.equal(findTask(s0.tasks, '#2').task.id, 'b');
  assert.equal(findTask(s0.tasks, 'roof').task.id, 'd');
  assert.equal(findTask(s0.tasks, 'walls level 2').task.id, 'c');
  assert.match(findTask(s0.tasks, 'walls').error, /row 2.*row 3/);
  assert.match(findTask(s0.tasks, 'garage').error, /No task/);
  assert.match(findTask(s0.tasks, '9').error, /no row 9/);
});

test('"roof is delayed 2 weeks"', () => {
  const { schedule, result } = runScheduleTool(s0, [], 'delay_task', { task: 'Roof', amount: 2, unit: 'weeks' });
  assert.equal(result.ok, true);
  assert.equal(result.task.start, '2026-12-15');
  assert.equal(result.moved_work_days, 10);
  assert.equal(schedule.tasks[3].lag, 10);
  // earlier than its predecessors allow: says how far it went
  const back = runScheduleTool(schedule, [], 'delay_task', { task: 'Roof', amount: -3, unit: 'weeks' });
  assert.match(back.result.note, /moved -10/);
});

test('add, link, rename, remove, length, calendar', () => {
  let s = runScheduleTool(s0, [], 'add_task', { name: 'Inspection', days: 1, after: 'Walls · Level 1', waits_for: ['2'] }).schedule;
  assert.equal(s.tasks[2].name, 'Inspection');
  s = runScheduleTool(s, [], 'set_predecessors', { task: 'walls level 2', waits_for: ['Inspection'], add: true }).schedule;
  assert.equal(s.tasks[3].deps.length, 2);
  s = runScheduleTool(s, [], 'set_duration', { task: 'Roof', days: 4 }).schedule;
  assert.equal(s.tasks[4].days, 4);
  s = runScheduleTool(s, [], 'rename_task', { task: 'Inspection', name: 'Framing inspection' }).schedule;
  const r = runScheduleTool(s, [], 'remove_task', { task: 'Framing inspection' });
  assert.equal(r.result.removed, 'Framing inspection');
  const cal = runScheduleTool(s0, [], 'set_calendar', { work_week: 'mon-sat', add_days_off: ['2026-11-26'] });
  assert.equal(cal.schedule.workWeek, 'mon-sat');
  assert.deepEqual(cal.schedule.daysOff, ['2026-11-26']);
  assert.equal(runScheduleTool(s0, [], 'set_duration', { task: 'nope', days: 2 }).result.ok, false);
  assert.equal(runScheduleTool(s0, [], 'mystery', {}).result.ok, false);
});

test('folders: break down, indent, no length on a folder', () => {
  const b = runScheduleTool(s0, [], 'break_down', { task: 'Foundation' });
  assert.equal(b.result.parts.length, 2);
  assert.equal(runScheduleTool(b.schedule, [], 'set_duration', { task: 'Foundation', days: 9 }).result.ok, false);
  assert.equal(runScheduleTool(b.schedule, [], 'break_down', { task: 'Foundation' }).result.ok, false);
  const i = runScheduleTool(s0, [], 'indent_task', { task: 'Walls · Level 2' });
  assert.equal(i.schedule.tasks[2].parent, 'b');
  assert.equal(runScheduleTool(s0, [], 'indent_task', { task: 'Foundation' }).result.ok, false);
});

test('context and the changes to review', () => {
  const ctx = scheduleContext(s0, [], '2026-11-15');
  assert.match(ctx, /4\. Roof \| 2 work days \| 2026-12-01 → 2026-12-02 \| waits for 3/);
  const next = runScheduleTool(s0, [], 'delay_task', { task: 'Roof', amount: 2, unit: 'weeks' }).schedule;
  const ch = scheduleChanges(s0, next, []);
  assert.equal(ch.items.length, 1);
  assert.match(ch.items[0].text, /^Roof: Dec 1 – Dec 2 → Dec 15 – Dec 16/);
  assert.deepEqual(ch.ends, { from: 'Dec 2', to: 'Dec 16' });
  for (const t of SCHEDULE_TOOLS) assert.ok(t.name && t.description && t.params);
});
