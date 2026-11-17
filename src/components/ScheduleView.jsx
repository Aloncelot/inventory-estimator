// src/components/ScheduleView.jsx
// The job's schedule as a task table and a Gantt chart, like Microsoft
// Project. The framing phases come from Labor and follow the estimate; their
// length can be typed over. Any task can be broken down into tasks inside it
// (folders, like Microsoft Project's summary tasks): a phase into rooms or wall
// types, for the site. Drag a bar to move a task (what waits for it moves too)
// or its right edge to change its length.
'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { CalendarRange, Plus, RefreshCw, RotateCcw, Trash2, ChevronRight, ChevronDown, ListIndentIncrease, ListIndentDecrease, ListTree } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { PageHeader, NumInput, TextInput } from '@/components/ui/mat';
import { useConfirm } from '@/components/ui/confirm';
import { useAssistantPage } from '@/context/AssistantContext';
import { SCHEDULE_TOOLS, SCHEDULE_INSTRUCTIONS, runScheduleTool, scheduleContext, scheduleChanges } from '@/domain/assistant/scheduleTools';
import {
  WORK_WEEKS, laborPhases, syncFromEstimate, computeSchedule, delayTask, setTaskDays, renameTask,
  setTaskDeps, setNotBefore, addTask, removeTask, parsePredecessors, addDays, daysBetween, parseISO, todayISO,
  indentTask, outdentTask, breakDownTask, toggleCollapsed,
} from '@/domain/schedule';

const ROW_H = 34;
const HEAD_H = 44;
const ZOOMS = { day: { label: 'Days', px: 30 }, week: { label: 'Weeks', px: 14 }, month: { label: 'Months', px: 5 } };

const fmt = (iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => {
  const d = parseISO(iso);
  return d ? d.toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' }) : '';
};
const GROUP_OF_SRC = (src) => (src === 'roof' ? 'Roof' : src === 'punch' ? 'Punch' : src.split('|')[1] || '');
// a task inside a phase takes the phase's color
const groupClass = (row, byId) => {
  let t = row;
  while (t && !t.src) t = t.parent && byId ? byId.get(t.parent) : null;
  return t?.src ? `sc-g-${GROUP_OF_SRC(t.src).replace(/[^A-Za-z]/g, '')}` : 'sc-g-own';
};

const BUILD_TOOL = {
  name: 'build_from_estimate',
  description: 'Build the schedule from the estimate\'s framing phases (Labor). Only when the schedule has no tasks yet.',
  params: {},
};

export default function ScheduleView() {
  const { projectData, updateProject, isLoaded, readOnly } = useProject();
  const confirm = useConfirm();
  const est = useMemo(() => projectData?.estimateData || {}, [projectData]);
  const schedule = useMemo(() => est.schedule || {}, [est.schedule]);
  const phases = useMemo(() => laborPhases(est), [est]);
  const plan = useMemo(() => computeSchedule(schedule, phases), [schedule, phases]);
  const [zoom, setZoom] = useState('day');
  const [selected, setSelected] = useState(null);
  const [msg, setMsg] = useState('');
  const [critical, setCritical] = useState(true);

  const setSchedule = useCallback((fn) => updateProject((prev) => ({ ...prev, schedule: fn(prev.schedule || {}) })), [updateProject]);

  // the assistant panel works on this schedule (src/context/AssistantContext.jsx)
  useAssistantPage({
    key: projectData && !readOnly ? 'schedule' : undefined,
    title: 'Schedule',
    subtitle: projectData?.name || '',
    examples: (schedule.tasks || []).length
      ? ['Roof is delayed 2 weeks', 'Break down Walls · Level 1', 'Add a 1-day framing inspection after the roof', 'What is on the critical path?']
      : ['Build the schedule and start it next Monday'],
    system: SCHEDULE_INSTRUCTIONS,
    tools: (schedule.tasks || []).length ? SCHEDULE_TOOLS : [...SCHEDULE_TOOLS, BUILD_TOOL],
    context: (s) => scheduleContext(s, phases, todayISO()),
    getState: () => schedule,
    run: (s, name, args) => {
      if (name === BUILD_TOOL.name) {
        const { schedule: next } = syncFromEstimate({ start: s.start || todayISO(), workWeek: s.workWeek || 'mon-fri', ...s }, phases);
        return { state: next, result: { ok: true, tasks: next.tasks.length, schedule: scheduleContext(next, phases, todayISO()) } };
      }
      const r = runScheduleTool(s, phases, name, args);
      return { state: r.schedule, result: r.result };
    },
    changes: (before, after) => scheduleChanges(before, after, phases),
    apply: (next) => setSchedule(() => next),
  });

  const tasks = schedule.tasks || [];
  const missing = phases.filter((p) => !tasks.some((t) => t.src === p.src));
  const stale = tasks.filter((t) => t.src && !phases.some((p) => p.src === t.src));

  const build = () => {
    setSchedule((s) => {
      const { schedule: next } = syncFromEstimate({ start: s.start || todayISO(), workWeek: s.workWeek || 'mon-fri', ...s }, phases);
      return next;
    });
    setMsg('');
  };
  const update = async () => {
    if (stale.length && !(await confirm({
      title: 'Update the schedule from the estimate?',
      message: `${missing.length ? `${missing.length} new phase${missing.length === 1 ? '' : 's'} added. ` : ''}${stale.length} phase${stale.length === 1 ? ' is' : 's are'} no longer in the estimate and will be taken out: ${stale.map((t) => t.name).join(', ')}.`,
      confirmLabel: 'Update',
    }))) return;
    let added = 0, removed = 0;
    setSchedule((s) => { const r = syncFromEstimate(s, phases); added = r.added; removed = r.removed; return r.schedule; });
    setMsg(`Schedule updated: ${added} added, ${removed} taken out.`);
  };
  const sel = selected ? plan.byId.get(selected) : null;
  const add = () => {
    setSchedule((s) => addTask(s, { name: 'New task', days: 1, deps: sel ? [sel.id] : [], after: sel?.id }));
  };
  const addInside = () => { if (sel) setSchedule((s) => addTask(s, { name: 'New task', days: 1, parent: sel.id })); };
  const breakDown = () => { if (sel) setSchedule((s) => breakDownTask(s, sel.id, phases)); };
  const remove = async (row) => {
    const inside = tasks.filter((t) => plan.byId.get(t.id)?.depth > row.depth && isInside(plan, t.id, row.id)).length;
    if ((row.src || inside) && !(await confirm({
      title: `Remove "${row.name}"?`,
      message: [inside ? `The ${inside} task${inside === 1 ? '' : 's'} inside it go too.` : '', row.src ? '"Update from estimate" adds the phase back.' : ''].filter(Boolean).join(' '),
      confirmLabel: 'Remove', tone: 'danger',
    }))) return;
    setSchedule((s) => removeTask(s, row.id));
    if (selected === row.id) setSelected(null);
  };
  const commitPreds = (row, text) => {
    const ids = parsePredecessors(text, tasks);
    if (!ids) { setMsg(`Row ${row.num}: predecessors are row numbers from 1 to ${tasks.length}, like "2, 4".`); return; }
    setMsg('');
    setSchedule((s) => setTaskDeps(s, row.id, ids));
  };

  if (!isLoaded || !projectData) {
    return (
      <div className="app-content">
        <PageHeader icon={CalendarRange} title="Schedule" />
        <div className="empty-state">Open or create a project in Projects to plan its schedule.</div>
      </div>
    );
  }

  const meta = tasks.length ? `${tasks.length} tasks · ${plan.workDays} work days · ends ${fmt(plan.finish)}` : undefined;

  return (
    <div className="app-content">
      <PageHeader icon={CalendarRange} title="Schedule" meta={meta} />

      <div className="toolbar sc-toolbar">
        <label className="fld"><span>Start</span>
          <input type="date" className="ew-input" style={{ width: 150 }} value={schedule.start || ''} onChange={(e) => setSchedule((s) => ({ ...s, start: e.target.value || undefined }))} />
        </label>
        <label className="fld"><span>Work week</span>
          <select className="ew-select" style={{ width: 100 }} value={schedule.workWeek || 'mon-fri'} onChange={(e) => setSchedule((s) => ({ ...s, workWeek: e.target.value }))}>
            {Object.entries(WORK_WEEKS).map(([k, w]) => <option key={k} value={k}>{w.label}</option>)}
          </select>
        </label>
        <label className="fld" title="Holidays and days the crew does not work, as dates: 2026-12-25, 2027-01-01"><span>Days off</span>
          <TextInput style={{ width: 210 }} placeholder="2026-12-25, 2027-01-01" value={(schedule.daysOff || []).join(', ')} onCommit={(v) => setSchedule((s) => ({ ...s, daysOff: v.split(/[\s,;]+/).filter((x) => parseISO(x)).sort() }))} />
        </label>
        <span className="sc-spacer" />
        <div className="sc-seg" role="group" aria-label="Zoom">
          {Object.entries(ZOOMS).map(([k, z]) => <button key={k} type="button" className={`ew-btn ew-btn--ghost${zoom === k ? ' is-on' : ''}`} aria-pressed={zoom === k} onClick={() => setZoom(k)}>{z.label}</button>)}
        </div>
        <label className="sc-check"><input type="checkbox" className="ro-ok" checked={critical} onChange={(e) => setCritical(e.target.checked)} /> Critical path</label>
      </div>
      {tasks.length ? (
        <div className="toolbar sc-toolbar sc-actions ro-hide">
          <>
            <button type="button" className="ew-btn ew-btn--primary" onClick={add} title={selected ? 'Added after the selected task, waiting for it' : 'Added at the end'}><Plus size={14} /> Add task</button>
            <button type="button" className="ew-btn" onClick={addInside} disabled={!sel} title="Add a task inside the selected one"><Plus size={14} /> Subtask</button>
            <button type="button" className="ew-btn" onClick={breakDown} disabled={!sel || sel.summary} title={sel?.phase ? 'Split this phase into its Labor tasks, to rename by room or wall type' : 'Split the selected task into parts inside it'}><ListTree size={14} /> Break down</button>
            <span className="sc-seg" role="group" aria-label="Outline">
              <button type="button" className="ew-btn ew-btn--ghost" onClick={() => sel && setSchedule((s) => outdentTask(s, sel.id))} disabled={!sel || !sel.depth} title="Take the selected task out of its folder" aria-label="Outdent"><ListIndentDecrease size={14} /></button>
              <button type="button" className="ew-btn ew-btn--ghost" onClick={() => sel && setSchedule((s) => indentTask(s, sel.id))} disabled={!sel} title="Put the selected task inside the task above it" aria-label="Indent"><ListIndentIncrease size={14} /></button>
            </span>
            {sel ? <span className="sc-selname">Selected: {sel.num}. {sel.name}</span> : <span className="sc-selname">Select a row to add inside it or break it down</span>}
            <span className="sc-spacer" />
            <button type="button" className="ew-btn" onClick={update} disabled={!missing.length && !stale.length} title="Add the phases the estimate has and the schedule does not; your changes stay"><RefreshCw size={14} /> Update from estimate</button>
          </>
        </div>
      ) : null}

      {tasks.length && (missing.length || stale.length) ? (
        <p className="sc-note">The estimate changed: {missing.length ? `${missing.length} phase${missing.length === 1 ? '' : 's'} to add` : ''}{missing.length && stale.length ? ', ' : ''}{stale.length ? `${stale.length} no longer in it` : ''}. Use “Update from estimate”.</p>
      ) : null}
      {plan.loops.length ? <p className="sc-note sc-note--warn">Some tasks wait for each other in a loop; those links are left out. Check their predecessors.</p> : null}
      {msg ? <p className="sc-note">{msg}</p> : null}

      {!tasks.length ? (
        <section className="ew-card sc-empty">
          <h3>Build the schedule from the estimate</h3>
          {phases.length ? (
            <>
              <p>{phases.length} framing phases from Labor, in the order a crew builds them: each level, the roof, then windows and doors and the punch list. Their length is the labor hours over the crew and the hours a day, and it follows the estimate.</p>
              <ul className="sc-empty__list">
                {phases.map((p) => <li key={p.src}><span>{p.name}</span><span className="ew-subtle">{p.days} day{p.days === 1 ? '' : 's'} · {p.hours} h</span></li>)}
              </ul>
            </>
          ) : <p>The estimate has no labor yet. Add walls, floors or a roof, or start with your own tasks.</p>}
          <div className="sc-empty__actions ro-hide">
            {phases.length ? <button type="button" className="ew-btn ew-btn--primary" onClick={build}><CalendarRange size={14} /> Build schedule</button> : null}
            <button type="button" className="ew-btn" onClick={() => setSchedule((s) => addTask({ start: s.start || todayISO(), ...s }, { name: 'New task' }))}><Plus size={14} /> Start with an empty task</button>
          </div>
        </section>
      ) : (
        <Gantt
          plan={plan} tasks={tasks} zoom={zoom} critical={critical} readOnly={readOnly}
          selected={selected} onSelect={setSelected}
          onRename={(id, v) => setSchedule((s) => renameTask(s, id, v))}
          onDays={(id, v) => setSchedule((s) => setTaskDays(s, id, v))}
          onLag={(id, v) => setSchedule((s) => delayTask(s, id, v - (tasks.find((t) => t.id === id)?.lag || 0)))}
          onNotBefore={(id, v) => setSchedule((s) => setNotBefore(s, id, v))}
          onPreds={commitPreds}
          onMove={(id, workDays) => setSchedule((s) => delayTask(s, id, workDays))}
          onRemove={remove}
          onToggle={(id) => setSchedule((s) => toggleCollapsed(s, id))}
        />
      )}
    </div>
  );
}

function Gantt({ plan, tasks, zoom, critical, readOnly, selected, onSelect, onRename, onDays, onLag, onNotBefore, onPreds, onMove, onRemove, onToggle }) {
  const px = ZOOMS[zoom].px;
  const rows = plan.rows.filter((r) => !r.hidden);
  const numOf = new Map(plan.rows.map((r) => [r.id, r.num]));
  const cal = plan.calendar;
  const today = todayISO();
  // the chart runs from a few days before the start to a couple of weeks after the end
  const from = addDays(plan.start, -3);
  const span = Math.max(42, daysBetween(from, plan.finish) + 15);
  const width = span * px;
  const x = (iso) => daysBetween(from, iso) * px;
  const days = useMemo(() => Array.from({ length: span }, (_, i) => addDays(from, i)), [from, span]);

  // drag a bar (move) or its end (length)
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const startDrag = (e, row, mode) => {
    if (readOnly || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const d = { id: row.id, mode, x0: e.clientX, dd: 0, row };
    dragRef.current = d;
    setDrag(d);
    const onMoveEv = (ev) => {
      const dd = Math.round((ev.clientX - d.x0) / px);
      if (dd !== dragRef.current?.dd) { dragRef.current = { ...d, dd }; setDrag(dragRef.current); }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMoveEv);
      window.removeEventListener('pointerup', onUp);
      const cur = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!cur || !cur.dd) return;
      if (cur.mode === 'move') {
        const target = cal.indexOf(addDays(row.start, cur.dd));
        const delta = target - row.es;
        if (delta) onMove(row.id, delta);
      } else {
        const end = addDays(row.dur > 0 ? row.finish : row.start, cur.dd);
        let ei = cal.indexOf(end);
        if (cal.dateOf(ei) > end) ei -= 1; // a weekend end counts back to the Friday
        onDays(row.id, Math.max(1, ei - row.es + 1));
      }
    };
    window.addEventListener('pointermove', onMoveEv);
    window.addEventListener('pointerup', onUp);
  };

  const geo = (row) => {
    let left = x(row.start);
    let w = row.dur > 0 ? (daysBetween(row.start, row.finish) + 1) * px : 0;
    if (drag?.id === row.id) {
      if (drag.mode === 'move') left += drag.dd * px;
      else w = Math.max(px, w + drag.dd * px);
    }
    return { left, w };
  };
  const yMid = (i) => i * ROW_H + ROW_H / 2;
  const fits = (r, w) => w > String(r.name || '').length * 6.4 + 18; // the name fits inside the bar
  const indexOfId = new Map(rows.map((r, i) => [r.id, i])); // rows on screen

  // months (and weeks) for the header
  const months = [];
  for (const d of days) {
    const key = d.slice(0, 7);
    const last = months[months.length - 1];
    if (!last || last.key !== key) months.push({ key, from: d, n: 1 }); else last.n += 1;
  }

  return (
    <div className="sc-wrap">
      <div className="sc-table" role="table" aria-label="Tasks">
        <div className="sc-tr sc-th" role="row" style={{ height: HEAD_H }}>
          <span className="sc-c-num">#</span>
          <span className="sc-c-name">Task</span>
          <span className="sc-c-days" title="Work days">Days</span>
          <span className="sc-c-date">Start</span>
          <span className="sc-c-date">Finish</span>
          <span className="sc-c-pred" title="Rows this task waits for">Predecessors</span>
          <span className="sc-c-lag" title="Work days it starts after what it waits for">Delay</span>
          <span className="sc-c-x" />
        </div>
        {rows.map((r) => (
          <div key={r.id} role="row" className={`sc-tr${selected === r.id ? ' is-sel' : ''}${r.loop ? ' is-loop' : ''}${r.summary ? ' is-sum' : ''}`} style={{ height: ROW_H }} onClick={() => onSelect(r.id)}>
            <span className="sc-c-num" onClick={(e) => { e.stopPropagation(); onSelect(selected === r.id ? null : r.id); }}>{r.num}</span>
            <span className="sc-c-name" style={{ paddingLeft: 3 + r.depth * 16 }}>
              {r.summary ? (
                <button type="button" className="sc-caret" onClick={(e) => { e.stopPropagation(); onToggle(r.id); }} aria-expanded={!r.collapsed} aria-label={`${r.collapsed ? 'Show' : 'Hide'} the tasks inside ${r.name}`}>{r.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button>
              ) : <i className={`sc-dot ${groupClass(r, plan.byId)}`} aria-hidden="true" />}
              <TextInput className="ew-input-ghost" value={r.name || ''} onCommit={(v) => onRename(r.id, v)} aria-label={`Name of task ${r.num}`} />
            </span>
            <span className="sc-c-days">
              {r.summary ? (
                <span className={`sc-sumdays${r.laborDays !== null && r.dur > r.laborDays ? ' is-over' : ''}`} title={r.laborDays !== null ? `Labor gives this phase ${r.laborDays} day${r.laborDays === 1 ? '' : 's'}; the tasks inside it take ${r.dur}` : 'From its first task to its last'}>
                  {r.dur}{r.laborDays !== null ? <small> / {r.laborDays}</small> : null}
                </span>
              ) : (<>
              <NumInput w={48} value={r.dur} onCommit={(v) => onDays(r.id, v)} className={r.auto ? 'is-auto' : ''} title={r.phase ? `From Labor: ${r.phase.hours} h → ${r.phase.days} day${r.phase.days === 1 ? '' : 's'}` : 'Work days; 0 is a milestone'} aria-label={`Days of task ${r.num}`} />
              {r.phase && !r.auto ? <button type="button" className="sc-reset ro-hide" onClick={(e) => { e.stopPropagation(); onDays(r.id, ''); }} title={`Back to the estimate: ${r.phase.days} day${r.phase.days === 1 ? '' : 's'}`} aria-label="Back to the estimate's days"><RotateCcw size={12} /></button> : null}
              </>)}
            </span>
            <span className="sc-c-date">
              <input type="date" className="ew-input-ghost sc-date" value={r.start} title={r.notBefore ? `Not before ${fmt(r.notBefore)}. Clear the date to remove it.` : 'Pick a date to start no earlier than it'} onChange={(e) => onNotBefore(r.id, e.target.value)} aria-label={`Start of task ${r.num}`} />
            </span>
            <span className="sc-c-date sc-ro">{fmt(r.finish, { month: 'short', day: 'numeric' })}</span>
            <span className="sc-c-pred">
              <TextInput className="ew-input-ghost" value={r.deps.map((d) => numOf.get(d)).filter(Boolean).join(', ')} onCommit={(v) => onPreds(r, v)} aria-label={`Predecessors of task ${r.num}`} />
            </span>
            <span className="sc-c-lag"><NumInput w={44} value={r.lag || 0} onCommit={(v) => onLag(r.id, v)} aria-label={`Delay of task ${r.num}`} /></span>
            <span className="sc-c-x">
              <button type="button" className="sc-del" onClick={(e) => { e.stopPropagation(); onRemove(r); }} aria-label={`Remove task ${r.num}`} title="Remove"><Trash2 size={13} /></button>
            </span>
          </div>
        ))}
      </div>

      <div className="sc-chart" role="img" aria-label={`Gantt chart, ${rows.length} tasks from ${fmt(plan.start)} to ${fmt(plan.finish)}`}>
        <div style={{ width, position: 'relative' }}>
          <div className="sc-head" style={{ height: HEAD_H }}>
            <div className="sc-head__months">
              {months.map((m) => <span key={m.key} style={{ width: m.n * px }}>{m.n * px > 60 ? fmt(m.from, { month: 'long', year: 'numeric' }) : ''}</span>)}
            </div>
            <div className="sc-head__days">
              {days.map((d) => {
                const dow = parseISO(d).getUTCDay();
                const label = zoom === 'day' ? String(+d.slice(8)) : zoom === 'week' && dow === 1 ? String(+d.slice(8)) : '';
                return <span key={d} style={{ width: px }} className={cal.isWork(d) ? '' : 'is-off'}>{label}</span>;
              })}
            </div>
          </div>
          <div className="sc-body" style={{ height: rows.length * ROW_H }}>
            {/* days off and weeks */}
            {days.map((d, i) => (!cal.isWork(d) ? <i key={d} className="sc-off" style={{ left: i * px, width: px }} /> : zoom !== 'day' && parseISO(d).getUTCDay() === 1 ? <i key={d} className="sc-week" style={{ left: i * px }} /> : null))}
            {today >= from && daysBetween(from, today) < span ? <i className="sc-today" style={{ left: x(today) + px / 2 }} title={`Today, ${fmt(today)}`} /> : null}
            {rows.map((r, i) => (selected === r.id ? <i key={`s${r.id}`} className="sc-rowsel" style={{ top: i * ROW_H, height: ROW_H }} /> : null))}
            <svg className="sc-links" width={width} height={rows.length * ROW_H} aria-hidden="true">
              <defs><marker id="sc-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L6,3 L0,6 z" /></marker></defs>
              {rows.flatMap((r, i) => r.deps.map((d) => {
                const j = indexOfId.get(d);
                if (j === undefined) return null;
                const a = geo(rows[j]), b = geo(r);
                const x1 = a.left + a.w, y1 = yMid(j), x2 = b.left, y2 = yMid(i);
                const hot = critical && rows[j].critical && r.critical;
                const path = x2 >= x1 + 8
                  ? `M${x1},${y1} H${x1 + 5} V${y2} H${x2 - 1}`
                  : `M${x1},${y1} H${x1 + 5} V${y2 + (y2 > y1 ? -ROW_H / 2 : ROW_H / 2)} H${x2 - 7} V${y2} H${x2 - 1}`;
                return <path key={`${d}-${r.id}`} d={path} className={hot ? 'is-critical' : ''} markerEnd="url(#sc-arrow)" />;
              }))}
            </svg>
            {rows.map((r, i) => {
              const g = geo(r);
              const cls = `sc-bar ${groupClass(r, plan.byId)}${critical && r.critical ? ' is-critical' : ''}${drag?.id === r.id ? ' is-drag' : ''}${selected === r.id ? ' is-sel' : ''}`;
              const tip = `${r.name}: ${fmt(r.start)} – ${fmt(r.finish)}, ${r.dur} work day${r.dur === 1 ? '' : 's'}${r.slack ? `, ${r.slack} day${r.slack === 1 ? '' : 's'} of slack` : ''}`;
              if (r.summary) {
                return (
                  <span key={r.id} className={`sc-sum${critical && r.critical ? ' is-critical' : ''}${drag?.id === r.id ? ' is-drag' : ''}`} style={{ left: g.left, width: Math.max(px, g.w), top: i * ROW_H + 9 }} title={tip} onPointerDown={(e) => startDrag(e, r, 'move')} onClick={() => onSelect(r.id)} />
                );
              }
              if (r.dur === 0) {
                return <span key={r.id} className={`sc-ms${critical && r.critical ? ' is-critical' : ''}`} style={{ left: g.left + px / 2 - 7, top: i * ROW_H + ROW_H / 2 - 7 }} title={tip} onPointerDown={(e) => startDrag(e, r, 'move')} />;
              }
              return (
                <span key={r.id} className={cls} style={{ left: g.left + 1, width: Math.max(4, g.w - 2), top: i * ROW_H + 7, height: ROW_H - 14 }} title={tip} onPointerDown={(e) => startDrag(e, r, 'move')} onClick={() => onSelect(r.id)}>
                  {fits(r, g.w) ? <span className="sc-bar__lbl">{r.name}</span> : null}
                  {!readOnly ? <span className="sc-bar__end" onPointerDown={(e) => startDrag(e, r, 'end')} title="Drag to change the length" /> : null}
                </span>
              );
            })}
            {rows.map((r, i) => {
              const g = geo(r);
              return r.summary || r.dur === 0 || !fits(r, g.w) ? <span key={`l${r.id}`} className="sc-outlbl" style={{ left: g.left + Math.max(g.w, px) + 6, top: i * ROW_H }}>{r.name}</span> : null;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const isInside = (plan, id, folder) => {
  let p = plan.byId.get(id)?.parent;
  while (p) { if (p === folder) return true; p = plan.byId.get(p)?.parent; }
  return false;
};
