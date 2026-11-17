// src/domain/schedule.js
// The job's schedule: tasks with a length in work days, the tasks each one
// waits for (finish to start) and an optional delay. The framing phases come
// from Labor (its hours over the crew and the hours a day), so the schedule
// follows the estimate; the user can type over a length, add their own tasks
// (foundation, inspection, delivery) and move any of them.
//
// Days are counted as work days from the start of the job: day 0 is the first
// work day on or after the start date. Dates are 'YYYY-MM-DD' strings.
import { computeLabor } from './labor.js';
import { scoped } from './scope.js';

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ───────────────────── calendar ───────────────────── */

export const WORK_WEEKS = {
  'mon-fri': { label: 'Mon–Fri', days: [1, 2, 3, 4, 5] },
  'mon-sat': { label: 'Mon–Sat', days: [1, 2, 3, 4, 5, 6] },
};

const pad = (x) => String(x).padStart(2, '0');
export const toISO = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
export const addDays = (iso, k) => {
  const d = parseISO(iso);
  if (!d) return iso;
  d.setUTCDate(d.getUTCDate() + k);
  return toISO(d);
};
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Work days of a schedule: the week and the days off. */
export function makeCalendar(schedule = {}) {
  const week = new Set((WORK_WEEKS[schedule.workWeek] || WORK_WEEKS['mon-fri']).days);
  const off = new Set((schedule.daysOff || []).filter(Boolean));
  const start = parseISO(schedule.start) ? schedule.start : todayISO();
  const isWork = (iso) => week.has(parseISO(iso).getUTCDay()) && !off.has(iso);
  const dates = []; // work day index → date
  let cursor = start;
  const dateOf = (i) => {
    const k = Math.max(0, Math.floor(i));
    let guard = 0;
    while (dates.length <= k && guard < 100000) {
      if (isWork(cursor)) dates.push(cursor);
      cursor = addDays(cursor, 1);
      guard += 1;
    }
    return dates[k] || dates[dates.length - 1] || start;
  };
  /** The index of the first work day on or after a date. */
  const indexOf = (iso) => {
    if (!parseISO(iso) || iso <= start) return 0;
    let i = 0;
    while (dateOf(i) < iso && i < 100000) i += 1;
    return i;
  };
  return { start, isWork, dateOf, indexOf };
}

/* ───────────────────── phases from the estimate ───────────────────── */

const PHASE_NAME = {
  Site: 'Set-up and crane',
  Floor: 'Floor deck',
  Walls: 'Walls',
  Stairs: 'Stairs',
  Roof: 'Roof',
  'Windows & doors': 'Windows and doors',
};
const LEVEL_ORDER = ['Site', 'Floor', 'Walls', 'Stairs'];

/**
 * The framing phases of the estimate, in the order a crew builds them:
 * each level (set-up, floor, walls, stairs), the roof, the windows and
 * doors once it is dried in, and the punch list.
 * @returns {Array<{src, name, group, team, days, hours, deps:Array<src>}>}
 */
export function laborPhases(est = {}) {
  const { tasks, settings: s } = computeLabor(scoped(est));
  const hpd = Math.max(1, n(s.hoursPerDay) || 8);
  const crew = Math.max(1, n(s.crew) || 1);
  const installers = Math.max(1, n(s.installers) || 1);
  const by = new Map();
  for (const t of tasks) {
    if (!(t.workerHours > 0)) continue;
    const isPunch = t.levelIndex >= 1e6;
    const group = isPunch ? 'Punch' : t.group;
    const src = isPunch ? 'punch' : group === 'Roof' ? 'roof' : `${t.levelIndex}|${group}`;
    let p = by.get(src);
    if (!p) {
      p = { src, group, levelIndex: t.levelIndex, level: t.level, team: t.team || 'crew', hours: 0, items: [] };
      by.set(src, p);
    }
    p.hours += t.workerHours;
    p.items.push({ label: t.label, hours: t.workerHours, team: t.team || 'crew' });
    if (t.team === 'installers') p.team = 'installers';
  }
  const list = [...by.values()];
  for (const p of list) {
    const people = p.team === 'installers' ? installers : crew;
    p.days = Math.max(1, Math.ceil(p.hours / people / hpd - 0.05));
    p.parts = breakdownParts(p.items, people * hpd, p.days);
    p.hours = Math.round(p.hours * 10) / 10;
    p.name = p.group === 'Punch' ? 'Punch list' : p.group === 'Roof' ? 'Roof' : `${PHASE_NAME[p.group] || p.group} · ${p.level}`;
  }
  const levelIdx = [...new Set(list.filter((p) => LEVEL_ORDER.includes(p.group)).map((p) => p.levelIndex))].sort((a, b) => a - b);
  const ordered = [];
  for (const i of levelIdx) {
    for (const g of LEVEL_ORDER) {
      const p = by.get(`${i}|${g}`);
      if (p) ordered.push(p);
    }
  }
  // one framing crew: its phases follow each other
  let prev = null;
  for (const p of ordered) { p.deps = prev ? [prev.src] : []; prev = p; }
  const roof = by.get('roof');
  if (roof) { roof.deps = prev ? [prev.src] : []; ordered.push(roof); prev = roof; }
  const dryIn = prev;
  // windows and doors once the building is dried in; installers work in parallel
  let crewPrev = prev;
  for (const i of [...new Set(list.filter((p) => p.group === 'Windows & doors').map((p) => p.levelIndex))].sort((a, b) => a - b)) {
    const p = by.get(`${i}|Windows & doors`);
    if (p.team === 'installers') p.deps = dryIn ? [dryIn.src] : [];
    else { p.deps = crewPrev ? [crewPrev.src] : []; crewPrev = p; }
    ordered.push(p);
  }
  const punch = by.get('punch');
  if (punch) {
    const ends = ordered.filter((p) => !ordered.some((q) => q.deps.includes(p.src)));
    punch.deps = ends.map((p) => p.src);
    ordered.push(punch);
  }
  return ordered.map(({ src, name, group, team, days, hours, deps, parts }) => ({ src, name, group, team, days, hours, deps, parts }));
}

/**
 * The Labor tasks of a phase as parts of about a day or more: small tasks are
 * joined with the next ones so the parts add up close to the phase's days.
 */
function breakdownParts(items = [], hoursPerDay = 8, phaseDays = 1) {
  const parts = [];
  let cur = null;
  for (const it of items) {
    if (!(it.hours > 0)) continue;
    if (!cur) cur = { labels: [], hours: 0 };
    cur.labels.push(it.label);
    cur.hours += it.hours;
    if (cur.hours >= hoursPerDay * 0.5) { parts.push(cur); cur = null; }
  }
  if (cur) {
    if (parts.length) { const last = parts[parts.length - 1]; last.labels.push(...cur.labels); last.hours += cur.hours; } else parts.push(cur);
  }
  const out = parts.map((x) => ({ name: x.labels.join(', '), hours: Math.round(x.hours * 10) / 10, days: Math.max(1, Math.round(x.hours / hoursPerDay)) }));
  // rounding: keep the sum at the phase's days where it can be
  let diff = out.reduce((a, x) => a + x.days, 0) - phaseDays;
  for (const x of [...out].sort((a, b) => b.days - a.days)) {
    while (diff > 0 && x.days > 1) { x.days -= 1; diff -= 1; }
    while (diff < 0) { x.days += 1; diff += 1; }
  }
  return out;
}

/* ───────────────────── tasks ───────────────────── */

let seq = 0;
export const newTaskId = () => `t${Date.now().toString(36)}${(seq += 1).toString(36)}`;

/* ───────────────────── outline (folders) ───────────────────── */
// A task can sit inside another (task.parent): the parent becomes a summary,
// like a folder in Microsoft Project. The list keeps each folder followed by
// everything inside it.

/** Parent of each task, leaving out parents that are missing or loop. */
export function outline(tasks = []) {
  const ids = new Set(tasks.map((t) => t.id));
  const parent = new Map();
  for (const t of tasks) if (t.parent && ids.has(t.parent) && t.parent !== t.id) parent.set(t.id, t.parent);
  for (const id of [...parent.keys()]) {
    const seen = new Set([id]);
    let p = parent.get(id);
    while (p) {
      if (seen.has(p)) { parent.delete(id); break; }
      seen.add(p);
      p = parent.get(p);
    }
  }
  const children = new Map(tasks.map((t) => [t.id, []]));
  for (const t of tasks) if (parent.has(t.id)) children.get(parent.get(t.id)).push(t.id);
  const ancestors = (id) => { const out = []; let p = parent.get(id); while (p) { out.push(p); p = parent.get(p); } return out; };
  const isUnder = (id, anc) => ancestors(id).includes(anc);
  const leavesOf = (id) => (children.get(id)?.length ? children.get(id).flatMap(leavesOf) : [id]);
  return { parent, children, ancestors, isUnder, leavesOf };
}

/** Index just past a task and everything inside it. */
function subtreeEnd(tasks, idx, isUnder) {
  let j = idx + 1;
  while (j < tasks.length && isUnder(tasks[j].id, tasks[idx].id)) j += 1;
  return j;
}

/**
 * Brings the estimate's phases into the schedule. Phases already there keep
 * what the user changed (name, length, delay, links, breakdown); new ones are
 * added with their links; phases the estimate no longer has are taken out with
 * what is inside them. Tasks the user added are kept.
 * @returns {{schedule:object, added:number, removed:number}}
 */
export function syncFromEstimate(schedule = {}, phases = [], makeId = newTaskId) {
  const tasks = (schedule.tasks || []).slice();
  const ol = outline(tasks);
  const idOfSrc = new Map(tasks.filter((t) => t.src).map((t) => [t.src, t.id]));
  const wanted = new Set(phases.map((p) => p.src));
  for (const p of phases) if (!idOfSrc.has(p.src)) idOfSrc.set(p.src, makeId());
  const roots = tasks.filter((t) => t.src && !wanted.has(t.src)).map((t) => t.id);
  const removed = new Set(tasks.filter((t) => roots.includes(t.id) || roots.some((r) => ol.isUnder(t.id, r))).map((t) => t.id));
  const out = tasks.filter((t) => !removed.has(t.id)).map((t) => ((t.deps || []).some((d) => removed.has(d)) ? { ...t, deps: t.deps.filter((d) => !removed.has(d)) } : t));
  const have = new Set(out.map((t) => t.src).filter(Boolean));
  const added = phases.filter((p) => !have.has(p.src)).map((p) => ({
    id: idOfSrc.get(p.src), src: p.src, name: p.name, deps: p.deps.map((x) => idOfSrc.get(x)).filter(Boolean), lag: 0,
  }));
  // new phases go where the estimate puts them, after the one before them
  for (const t of added) {
    const ol2 = outline(out);
    const at = phases.findIndex((p) => p.src === t.src);
    const before = phases.slice(0, at).reverse().find((p) => out.some((x) => x.src === p.src));
    let pos;
    if (before) pos = subtreeEnd(out, out.findIndex((x) => x.src === before.src), ol2.isUnder);
    else { const first = out.findIndex((x) => x.src); pos = first === -1 ? out.length : first; }
    out.splice(pos, 0, t);
  }
  return { schedule: { ...schedule, tasks: out }, added: added.length, removed: removed.size };
}

/** The length of a task in work days: what was typed, else the estimate's. */
export function taskDays(t, phaseBySrc) {
  if (t.days !== undefined && t.days !== null && t.days !== '') return Math.max(0, Math.round(n(t.days)));
  const p = t.src ? phaseBySrc.get(t.src) : null;
  return p ? p.days : 1;
}

/**
 * Dates of every task (forward pass) and the critical path (backward pass).
 * A task starts the work day after the last task it waits for ends, plus its
 * delay; never before its "not before" date. A folder's links, delay and date
 * hold for everything inside it, and a link to a folder waits for all of it.
 * A folder runs from its first task to its last. Links that would loop are
 * left out.
 * @returns {{rows:Array, byId:Map, start, finish, workDays, loops:Array, calendar}}
 */
export function computeSchedule(schedule = {}, phases = []) {
  const cal = makeCalendar(schedule);
  const phaseBySrc = new Map(phases.map((p) => [p.src, p]));
  const tasks = (schedule.tasks || []).filter(Boolean);
  const raw = new Map(tasks.map((t) => [t.id, t]));
  const ol = outline(tasks);
  const isSummary = (id) => ol.children.get(id).length > 0;
  const validDeps = (t) => [...new Set((t.deps || []).filter((d) => raw.has(d) && d !== t.id && !ol.isUnder(t.id, d) && !ol.isUnder(d, t.id)))];
  const lagOf = (t) => Math.max(0, Math.round(n(t.lag)));
  const leaves = tasks.filter((t) => !isSummary(t.id)).map((t) => t.id);
  const node = new Map(leaves.map((id) => [id, { id, dur: taskDays(raw.get(id), phaseBySrc), owners: [], out: [] }]));
  // each leaf is held by its own links and by those of every folder it is in
  for (const id of leaves) {
    const L = node.get(id);
    for (const oid of [id, ...ol.ancestors(id)]) {
      const o = raw.get(oid);
      const from = validDeps(o).flatMap((d) => ol.leavesOf(d)).filter((d) => d !== id);
      L.owners.push({ from, lag: lagOf(o), notBefore: o.notBefore ? cal.indexOf(o.notBefore) : 0 });
      for (const d of from) node.get(d).out.push({ to: id, lag: lagOf(o) });
    }
  }
  // order by links (Kahn); what is left is in a loop
  const indeg = new Map(leaves.map((id) => [id, 0]));
  for (const L of node.values()) for (const e of L.out) indeg.set(e.to, indeg.get(e.to) + 1);
  const queue = leaves.filter((id) => indeg.get(id) === 0);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const e of node.get(id).out) { indeg.set(e.to, indeg.get(e.to) - 1); if (indeg.get(e.to) === 0) queue.push(e.to); }
  }
  const inOrder = new Set(order);
  const loopLeaves = leaves.filter((id) => !inOrder.has(id));
  for (const id of loopLeaves) {
    const L = node.get(id);
    L.loop = true;
    for (const o of L.owners) o.from = o.from.filter((d) => inOrder.has(d));
    order.push(id);
    inOrder.add(id);
  }
  if (loopLeaves.length) {
    for (const L of node.values()) L.out = [];
    for (const L of node.values()) for (const o of L.owners) for (const d of o.from) node.get(d).out.push({ to: L.id, lag: o.lag });
  }
  // forward
  for (const id of order) {
    const L = node.get(id);
    let es = 0;
    for (const o of L.owners) {
      let base = o.notBefore;
      for (const d of o.from) { const p = node.get(d); if (p.ef !== undefined) base = Math.max(base, p.ef + 1); }
      es = Math.max(es, base + o.lag);
    }
    L.es = es;
    L.ef = es + L.dur - 1; // a 0-day task (milestone) ends where it starts
  }
  const end = order.reduce((a, id) => Math.max(a, node.get(id).ef), -1);
  // backward: how late each task could finish without moving the end
  for (const id of [...order].reverse()) {
    const L = node.get(id);
    let lf = end;
    for (const e of L.out) { const q = node.get(e.to); if (q.ls !== undefined) lf = Math.min(lf, q.ls - e.lag - 1); }
    L.lf = lf;
    L.ls = lf - L.dur + 1;
    L.slack = Math.max(0, L.ls - L.es);
    L.critical = L.slack === 0 && end >= 0;
  }
  // folders: from their first task to their last
  const roll = new Map();
  const rollOf = (id) => {
    if (node.has(id)) return node.get(id);
    if (roll.has(id)) return roll.get(id);
    const kids = ol.leavesOf(id).map((x) => node.get(x)).filter(Boolean);
    const es = Math.min(...kids.map((k) => k.es));
    const ef = Math.max(...kids.map((k) => k.ef));
    const r = { es, ef, dur: Math.max(0, ef - es + 1), slack: Math.min(...kids.map((k) => k.slack)), critical: kids.some((k) => k.critical), loop: kids.some((k) => k.loop) };
    roll.set(id, r);
    return r;
  };
  const collapsedAbove = (id) => ol.ancestors(id).some((a) => raw.get(a).collapsed);
  const rows = tasks.map((task, i) => {
    const r = rollOf(task.id);
    const summary = isSummary(task.id);
    const phase = task.src ? phaseBySrc.get(task.src) || null : null;
    const start = cal.dateOf(r.es);
    const finish = r.dur > 0 ? cal.dateOf(r.ef) : start;
    return {
      ...task, num: i + 1, deps: validDeps(task), es: r.es, ef: r.ef, dur: r.dur, slack: r.slack, critical: r.critical, loop: r.loop,
      start, finish, phase, summary, depth: ol.ancestors(task.id).length, hidden: collapsedAbove(task.id),
      auto: !summary && !!phase && (task.days === undefined || task.days === null || task.days === ''),
      // a phase broken down: its parts against what Labor gives it
      laborDays: summary && phase ? phase.days : null,
    };
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return {
    rows, byId, loops: loopLeaves,
    start: cal.dateOf(0),
    finish: end >= 0 ? cal.dateOf(end) : cal.dateOf(0),
    workDays: end + 1,
    calendar: cal,
  };
}

/* ───────────────────── edits ───────────────────── */
// Small, named changes so the page (and, later, the assistant) change the
// schedule the same way.

const mapTask = (schedule, id, fn) => ({ ...schedule, tasks: (schedule.tasks || []).map((t) => (t.id === id ? fn(t) : t)) });

/** Moves a task later (or earlier) by work days; what waits for it, and what is inside it, moves too. */
export const delayTask = (schedule, id, workDays) => mapTask(schedule, id, (t) => ({ ...t, lag: Math.max(0, Math.round(n(t.lag) + n(workDays))) }));
export const setTaskDays = (schedule, id, days) => mapTask(schedule, id, (t) => {
  const next = { ...t };
  if (days === '' || days === null || days === undefined) delete next.days; else next.days = Math.max(0, Math.round(n(days)));
  return next;
});
export const renameTask = (schedule, id, name) => mapTask(schedule, id, (t) => ({ ...t, name: String(name || '').trim() || t.name }));
export const setTaskDeps = (schedule, id, deps) => mapTask(schedule, id, (t) => ({ ...t, deps: [...new Set(deps.filter((d) => d && d !== id))] }));
export const setNotBefore = (schedule, id, iso) => mapTask(schedule, id, (t) => {
  const next = { ...t };
  if (parseISO(iso)) next.notBefore = iso; else delete next.notBefore;
  return next;
});
export const toggleCollapsed = (schedule, id) => mapTask(schedule, id, (t) => {
  const next = { ...t };
  if (next.collapsed) delete next.collapsed; else next.collapsed = true;
  return next;
});

/**
 * Adds a task after another (and after what is inside it), or as the last
 * task inside a folder.
 */
export function addTask(schedule, { name = 'New task', days = 1, deps = [], after, parent } = {}, makeId = newTaskId) {
  const tasks = (schedule.tasks || []).slice();
  const ol = outline(tasks);
  const t = { id: makeId(), name, days, deps, lag: 0 };
  let pos = tasks.length;
  if (parent && tasks.some((x) => x.id === parent)) {
    t.parent = parent;
    pos = subtreeEnd(tasks, tasks.findIndex((x) => x.id === parent), ol.isUnder);
  } else if (after) {
    const at = tasks.findIndex((x) => x.id === after);
    if (at >= 0) {
      pos = subtreeEnd(tasks, at, ol.isUnder);
      if (ol.parent.has(after)) t.parent = ol.parent.get(after);
    }
  }
  tasks.splice(pos, 0, t);
  return { ...schedule, tasks };
}

/** Puts a task inside the task above it at its level (Microsoft Project's indent). */
export function indentTask(schedule, id) {
  const tasks = schedule.tasks || [];
  const ol = outline(tasks);
  const at = tasks.findIndex((t) => t.id === id);
  if (at <= 0) return schedule;
  const myParent = ol.parent.get(id);
  let prev = null;
  for (let j = at - 1; j >= 0; j -= 1) {
    if (ol.parent.get(tasks[j].id) === myParent) { prev = tasks[j]; break; }
    if (tasks[j].id === myParent) break;
  }
  if (!prev) return schedule;
  return {
    ...schedule,
    tasks: tasks.map((t) => {
      if (t.id === id) return { ...t, parent: prev.id, deps: (t.deps || []).filter((d) => d !== prev.id) };
      if (t.id === prev.id) { const next = { ...t, deps: (t.deps || []).filter((d) => d !== id) }; delete next.collapsed; return next; }
      return t;
    }),
  };
}

/** Takes a task out of its folder, to just after the folder. */
export function outdentTask(schedule, id) {
  const tasks = (schedule.tasks || []).slice();
  const ol = outline(tasks);
  const p = ol.parent.get(id);
  if (!p) return schedule;
  const at = tasks.findIndex((t) => t.id === id);
  const block = tasks.slice(at, subtreeEnd(tasks, at, ol.isUnder));
  const rest = tasks.filter((t) => !block.includes(t));
  const ol2 = outline(rest);
  const pAt = rest.findIndex((t) => t.id === p);
  const pos = subtreeEnd(rest, pAt, ol2.isUnder);
  const gp = ol.parent.get(p);
  const moved = block.map((t, i) => {
    if (i) return t;
    const next = { ...t };
    if (gp) next.parent = gp; else delete next.parent;
    return next;
  });
  rest.splice(pos, 0, ...moved);
  return { ...schedule, tasks: rest };
}

/** Removes a task and what is inside it; what waited for it waits for what it waited for. */
export function removeTask(schedule, id) {
  const tasks = schedule.tasks || [];
  const ol = outline(tasks);
  const gone = tasks.find((t) => t.id === id);
  const drop = new Set(tasks.filter((t) => t.id === id || ol.isUnder(t.id, id)).map((t) => t.id));
  const inherit = (gone?.deps || []).filter((d) => !drop.has(d));
  return {
    ...schedule,
    tasks: tasks.filter((t) => !drop.has(t.id)).map((t) => ((t.deps || []).some((d) => drop.has(d)) ? { ...t, deps: [...new Set([...t.deps.filter((d) => !drop.has(d)), ...((t.deps || []).includes(id) ? inherit : [])])] } : t)),
  };
}

/**
 * Breaks a task down into parts inside it, one after the other. A phase from
 * the estimate is broken down into its Labor tasks; any other task into two
 * parts to rename.
 */
export function breakDownTask(schedule, id, phases = [], makeId = newTaskId) {
  const tasks = schedule.tasks || [];
  const t = tasks.find((x) => x.id === id);
  if (!t || tasks.some((x) => x.parent === id)) return schedule;
  const phase = t.src ? phases.find((p) => p.src === t.src) : null;
  const parts = phase?.parts?.length ? phase.parts : [{ name: 'Part 1', days: 1 }, { name: 'Part 2', days: 1 }];
  let next = { ...schedule, tasks: tasks.map((x) => (x.id === id ? (() => { const y = { ...x }; delete y.collapsed; return y; })() : x)) };
  let prev = null;
  for (const p of parts) {
    const nid = makeId();
    next = addTask(next, { name: p.name, days: p.days, deps: prev ? [prev] : [], parent: id }, () => nid);
    prev = nid;
  }
  return next;
}

/**
 * Predecessors typed as row numbers, like Microsoft Project: "2, 4".
 * @returns {Array<string>|null} the task ids, or null if a number is not a row.
 */
export function parsePredecessors(text, tasks = []) {
  const parts = String(text || '').split(/[\s,;]+/).filter(Boolean);
  const ids = [];
  for (const p of parts) {
    const k = Number(p);
    if (!Number.isInteger(k) || k < 1 || k > tasks.length) return null;
    ids.push(tasks[k - 1].id);
  }
  return ids;
}
