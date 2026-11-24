// src/domain/assistant/scheduleTools.js
// What the assistant can do to a schedule, as tools a model can call. Each
// tool runs one of the named edits in src/domain/schedule.js on a draft, so
// the assistant changes the schedule exactly as the page does; the user sees
// the changes and applies them or not.
//
// The tool specs are plain objects (name, description, params) so any model
// adapter can turn them into its own format (src/lib/ai.js).
import {
  computeSchedule, delayTask, setTaskDays, renameTask, setTaskDeps, setNotBefore, addTask,
  removeTask, breakDownTask, indentTask, outdentTask, parseISO, WORK_WEEKS,
} from '../schedule.js';

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const int = (description, extra = {}) => ({ type: 'integer', description, ...extra });
const TASK = str('The task: its row number (like "7") or its name (like "Roof" or "Walls · Level 1").');

export const SCHEDULE_TOOLS = [
  {
    name: 'delay_task',
    description: 'Move a task later (positive) or earlier (negative). Everything that waits for it, and everything inside it if it is a folder, moves too. Use for "X is delayed 2 weeks", "push X back 3 days", "start X a week later".',
    params: {
      task: TASK,
      amount: int('How much to move it. Negative moves it earlier, but never before what it waits for.'),
      unit: str('work_days or weeks (a week is the work days of one week).', { enum: ['work_days', 'weeks'] }),
    },
  },
  {
    name: 'set_duration',
    description: 'Set how many work days a task takes. 0 makes it a milestone. Folders take as long as the tasks inside them, so change those instead.',
    params: { task: TASK, days: int('Work days, 0 or more.') },
  },
  {
    name: 'reset_duration',
    description: 'Give a phase from the estimate back the length Labor gives it.',
    params: { task: TASK },
  },
  {
    name: 'set_not_before',
    description: 'Make a task start no earlier than a date, or clear that date.',
    params: { task: TASK, date: str('YYYY-MM-DD, or an empty string to clear it.') },
  },
  {
    name: 'set_predecessors',
    description: 'Set the tasks a task waits for (it starts the work day after all of them finish). Replaces the ones it had unless add is true.',
    params: {
      task: TASK,
      waits_for: { type: 'array', items: str('A task: row number or name.'), description: 'The tasks it waits for. Empty to wait for none.' },
      add: { type: 'boolean', description: 'true to add to the ones it already waits for.', optional: true },
    },
  },
  {
    name: 'add_task',
    description: 'Add a task of the user\'s own, like a foundation, an inspection or a delivery.',
    params: {
      name: str('Its name.'),
      days: int('Work days it takes; 0 for a milestone.'),
      after: str('Optional: the task it goes right after in the list.', { optional: true }),
      inside: str('Optional: the folder (or task) it goes inside.', { optional: true }),
      waits_for: { type: 'array', items: str('A task: row number or name.'), description: 'Optional: the tasks it waits for.', optional: true },
    },
  },
  { name: 'rename_task', description: 'Rename a task.', params: { task: TASK, name: str('The new name.') } },
  { name: 'remove_task', description: 'Remove a task and everything inside it. What waited for it then waits for what it waited for.', params: { task: TASK } },
  {
    name: 'break_down',
    description: 'Split a task into parts inside it: a phase from the estimate into its Labor tasks, any other task into two parts. Only for a task that has nothing inside it yet.',
    params: { task: TASK },
  },
  { name: 'indent_task', description: 'Put a task inside the task above it at its level.', params: { task: TASK } },
  { name: 'outdent_task', description: 'Take a task out of its folder.', params: { task: TASK } },
  {
    name: 'set_calendar',
    description: 'Change the start of the job, the work week or the days off.',
    params: {
      start: str('Optional: the start date, YYYY-MM-DD.', { optional: true }),
      work_week: str('Optional: mon-fri or mon-sat.', { enum: ['mon-fri', 'mon-sat'], optional: true }),
      add_days_off: { type: 'array', items: str('YYYY-MM-DD'), description: 'Optional: days off to add.', optional: true },
      remove_days_off: { type: 'array', items: str('YYYY-MM-DD'), description: 'Optional: days off to take away.', optional: true },
    },
  },
];

/* ───────────────────── finding a task ───────────────────── */

const norm = (s) => String(s || '').toLowerCase().replace(/[·.,:;()\-–—_/]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * The task a reference points to: a row number, or a name.
 * @returns {{task?:object, error?:string}}
 */
export function findTask(tasks, ref) {
  const raw = String(ref ?? '').trim().replace(/^#/, '');
  if (!raw) return { error: 'No task was given.' };
  if (/^\d+$/.test(raw)) {
    const k = Number(raw);
    return tasks[k - 1] ? { task: tasks[k - 1] } : { error: `There is no row ${k}; rows go from 1 to ${tasks.length}.` };
  }
  const q = norm(raw);
  const named = tasks.map((t, i) => ({ t, i, name: norm(t.name) }));
  let hits = named.filter((x) => x.name === q);
  if (!hits.length) hits = named.filter((x) => x.name.includes(q));
  if (!hits.length) {
    const words = q.split(' ').filter((w) => w.length > 1);
    hits = named.filter((x) => words.length && words.every((w) => x.name.includes(w)));
  }
  if (hits.length === 1) return { task: hits[0].t };
  if (!hits.length) return { error: `No task is called "${ref}".` };
  return { error: `"${ref}" could be ${hits.slice(0, 6).map((x) => `row ${x.i + 1} (${x.t.name})`).join(', ')}. Say which one.` };
}

/* ───────────────────── running a call ───────────────────── */

const view = (plan, id) => {
  const r = plan.byId.get(id);
  return r ? { row: r.num, name: r.name, start: r.start, finish: r.finish, work_days: r.dur } : null;
};

/**
 * Runs one tool call on a draft schedule.
 * @returns {{schedule:object, result:object}} the draft after the call and what to tell the model.
 */
export function runScheduleTool(schedule, phases, name, args = {}) {
  const tasks = schedule.tasks || [];
  const find = (ref) => findTask(tasks, ref);
  const fail = (error) => ({ schedule, result: { ok: false, error } });
  const done = (next, id, extra = {}) => {
    const plan = computeSchedule(next, phases);
    return { schedule: next, result: { ok: true, ...(id ? { task: view(plan, id) } : {}), job_ends: plan.finish, ...extra } };
  };
  const needTask = () => {
    const f = find(args.task);
    return f.error ? { error: f.error } : { t: f.task };
  };

  switch (name) {
    case 'delay_task': {
      const { t, error } = needTask();
      if (error) return fail(error);
      const perWeek = (WORK_WEEKS[schedule.workWeek] || WORK_WEEKS['mon-fri']).days.length;
      const wd = Math.round(Number(args.amount) || 0) * (args.unit === 'weeks' ? perWeek : 1);
      if (!wd) return fail('The amount is 0.');
      const before = computeSchedule(schedule, phases).byId.get(t.id);
      const next = delayTask(schedule, t.id, wd);
      const after = computeSchedule(next, phases).byId.get(t.id);
      const moved = after.es - before.es;
      return done(next, t.id, moved !== wd ? { note: `It moved ${moved} work days: it can't start before what it waits for finishes.` } : { moved_work_days: moved });
    }
    case 'set_duration': {
      const { t, error } = needTask();
      if (error) return fail(error);
      if (tasks.some((x) => x.parent === t.id)) return fail(`"${t.name}" is a folder: it takes as long as the tasks inside it.`);
      return done(setTaskDays(schedule, t.id, Math.max(0, Math.round(Number(args.days) || 0))), t.id);
    }
    case 'reset_duration': {
      const { t, error } = needTask();
      if (error) return fail(error);
      if (!t.src) return fail(`"${t.name}" is not a phase from the estimate.`);
      return done(setTaskDays(schedule, t.id, ''), t.id);
    }
    case 'set_not_before': {
      const { t, error } = needTask();
      if (error) return fail(error);
      if (args.date && !parseISO(args.date)) return fail('The date must be YYYY-MM-DD.');
      return done(setNotBefore(schedule, t.id, args.date || ''), t.id);
    }
    case 'set_predecessors': {
      const { t, error } = needTask();
      if (error) return fail(error);
      const ids = [];
      for (const ref of args.waits_for || []) {
        const f = find(ref);
        if (f.error) return fail(f.error);
        ids.push(f.task.id);
      }
      return done(setTaskDeps(schedule, t.id, args.add ? [...(t.deps || []), ...ids] : ids), t.id);
    }
    case 'add_task': {
      const nm = String(args.name || '').trim();
      if (!nm) return fail('The task needs a name.');
      let after, parent;
      if (args.inside) { const f = find(args.inside); if (f.error) return fail(f.error); parent = f.task.id; }
      if (args.after) { const f = find(args.after); if (f.error) return fail(f.error); after = f.task.id; }
      const deps = [];
      for (const ref of args.waits_for || []) { const f = find(ref); if (f.error) return fail(f.error); deps.push(f.task.id); }
      const next = addTask(schedule, { name: nm, days: Math.max(0, Math.round(Number(args.days) || 0)), deps, after: parent ? undefined : after, parent });
      const added = next.tasks.find((x) => !tasks.some((y) => y.id === x.id));
      return done(next, added.id);
    }
    case 'rename_task': {
      const { t, error } = needTask();
      if (error) return fail(error);
      return done(renameTask(schedule, t.id, args.name), t.id);
    }
    case 'remove_task': {
      const { t, error } = needTask();
      if (error) return fail(error);
      return done(removeTask(schedule, t.id), null, { removed: t.name });
    }
    case 'break_down': {
      const { t, error } = needTask();
      if (error) return fail(error);
      if (tasks.some((x) => x.parent === t.id)) return fail(`"${t.name}" is already broken down.`);
      const next = breakDownTask(schedule, t.id, phases);
      const plan = computeSchedule(next, phases);
      const parts = next.tasks.filter((x) => x.parent === t.id).map((x) => view(plan, x.id));
      return done(next, t.id, { parts });
    }
    case 'indent_task':
    case 'outdent_task': {
      const { t, error } = needTask();
      if (error) return fail(error);
      const next = name === 'indent_task' ? indentTask(schedule, t.id) : outdentTask(schedule, t.id);
      if (next === schedule) return fail(name === 'indent_task' ? `"${t.name}" has no task above it at its level.` : `"${t.name}" is not inside a folder.`);
      return done(next, t.id);
    }
    case 'set_calendar': {
      const next = { ...schedule };
      if (args.start) { if (!parseISO(args.start)) return fail('The start must be YYYY-MM-DD.'); next.start = args.start; }
      if (args.work_week) { if (!WORK_WEEKS[args.work_week]) return fail('The work week is mon-fri or mon-sat.'); next.workWeek = args.work_week; }
      if (args.add_days_off?.length || args.remove_days_off?.length) {
        const off = new Set(next.daysOff || []);
        for (const d of args.add_days_off || []) if (parseISO(d)) off.add(d);
        for (const d of args.remove_days_off || []) off.delete(d);
        next.daysOff = [...off].sort();
      }
      return done(next, null);
    }
    default:
      return fail(`Unknown tool ${name}.`);
  }
}

/* ───────────────────── context and changes ───────────────────── */

/** The schedule as the model reads it: one line per task. */
export function scheduleContext(schedule, phases, today) {
  const plan = computeSchedule(schedule, phases);
  const ww = (WORK_WEEKS[schedule.workWeek] || WORK_WEEKS['mon-fri']).label;
  const lines = plan.rows.map((r) => {
    const parts = [
      `${r.num}. ${'  '.repeat(r.depth)}${r.name}`,
      r.summary ? `folder, ${r.dur} work days` : `${r.dur} work day${r.dur === 1 ? '' : 's'}`,
      `${r.start} → ${r.finish}`,
    ];
    if (r.deps.length) parts.push(`waits for ${r.deps.map((d) => plan.byId.get(d)?.num).filter(Boolean).join(', ')}`);
    if (r.lag) parts.push(`delay ${r.lag} work days`);
    if (r.notBefore) parts.push(`not before ${r.notBefore}`);
    if (r.phase) parts.push(r.summary ? `phase from the estimate, Labor gives ${r.phase.days} days` : `phase from the estimate (${r.phase.hours} labor hours)${r.auto ? '' : ', length typed over'}`);
    if (r.critical) parts.push('critical');
    return parts.join(' | ');
  });
  return [
    `Today is ${today}.`,
    `Job starts ${plan.start}, ends ${plan.finish}, ${plan.workDays} work days. Work week ${ww}.${(schedule.daysOff || []).length ? ` Days off: ${schedule.daysOff.join(', ')}.` : ''}`,
    'Tasks (row. name | length | start → finish | links):',
    ...(lines.length ? lines : ['(no tasks yet)']),
  ].join('\n');
}

/**
 * What a draft changes, for the user to review before applying.
 * @returns {{items:Array<{kind, text}>, ends:{from,to}|null}}
 */
export function scheduleChanges(before, after, phases) {
  const a = computeSchedule(before, phases);
  const b = computeSchedule(after, phases);
  const items = [];
  const fmt = (iso) => {
    const d = parseISO(iso);
    return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : iso;
  };
  for (const r of b.rows) {
    const o = a.byId.get(r.id);
    if (!o) { items.push({ kind: 'add', text: `${r.name}: added, ${fmt(r.start)} – ${fmt(r.finish)}` }); continue; }
    const bits = [];
    if (o.name !== r.name) bits.push(`renamed from "${o.name}"`);
    if (o.start !== r.start || o.finish !== r.finish) bits.push(`${fmt(o.start)} – ${fmt(o.finish)} → ${fmt(r.start)} – ${fmt(r.finish)}`);
    if (o.dur !== r.dur && !r.summary) bits.push(`${o.dur} → ${r.dur} days`);
    const od = o.deps.map((d) => a.byId.get(d)?.name).sort().join(', ');
    const nd = r.deps.map((d) => b.byId.get(d)?.name).sort().join(', ');
    if (od !== nd) bits.push(nd ? `waits for ${nd}` : 'waits for nothing');
    if ((o.parent || '') !== (r.parent || '')) bits.push(r.parent ? `inside ${b.byId.get(r.parent)?.name}` : 'out of its folder');
    if (bits.length) items.push({ kind: 'change', text: `${r.name}: ${bits.join('; ')}` });
  }
  for (const r of a.rows) if (!b.byId.has(r.id)) items.push({ kind: 'remove', text: `${r.name}: removed` });
  if (before.start !== after.start || before.workWeek !== after.workWeek || (before.daysOff || []).join() !== (after.daysOff || []).join()) {
    items.unshift({ kind: 'change', text: 'Calendar: start, work week or days off changed' });
  }
  return { items, ends: a.finish !== b.finish ? { from: fmt(a.finish), to: fmt(b.finish) } : null };
}

export const SCHEDULE_INSTRUCTIONS = `You are the scheduling assistant inside Nebula Estimator, an app framing estimators and site supervisors use. You work on the schedule of the open job: a task list with a Gantt chart, like Microsoft Project.
- Make every change with the tools; never just describe a change. Several tools can be called for one request.
- Refer to tasks by row number when the name could match more than one.
- "X is delayed 2 weeks" or "push X back 2 weeks" means delay_task with amount 2 and unit weeks. Days mean work days unless the user says calendar days.
- A tool result tells you the new dates. If a tool fails, fix the call or ask the user.
- Your changes are a draft: the user reviews them and presses Apply. Don't say they are saved.
- Answer in the user's language, in one to three short sentences: what changed and the new end date. Plain text; use **bold** only for task names and a short "- " list only when naming several tasks. Ask one short question when the request is unclear.
- Questions about the schedule (when does X start, what is critical) are answered from the task list without tools.`;
