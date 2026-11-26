// src/domain/plans/headerSchedule.js
// The header schedule of a project, typed once from the structural sheets (or
// loaded from a template the user or the company keeps): for each kind of
// wall, how many floors it carries and the opening width, the header, the
// trimmers (jacks) and the king studs. Every window and door type of the plan
// takes its kings, jacks, header plies and header note from the row that fits
// it; a type changed by hand keeps the user's numbers. The material itself
// (family · size · vendor) is still picked on the Header row in Wall panels.
// Pure functions.

import { normWall } from './sync';

const n = (v) => Number(v) || 0;

export const SCHEDULE_WALLS = [
  { value: 'bearing', label: 'Bearing & shear' }, // exterior, interior bearing and shear walls
  { value: 'nonbearing', label: 'Non-bearing' },
  { value: 'any', label: 'All' },
];
export const SCHEDULE_SIZES = ['2x4', '2x6', '2x8', 'any'];
export const SCHEDULE_ABOVE = ['any', 0, 1, 2, 3, 4];

const BEARING = new Set(['exterior', 'bearing', 'shear']);

/** Pieces in a callout: "(2) 2x4" → 2, "2x4" / "4x4" → 1, "3" → 3, "" → null. */
export function countOf(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.max(0, Math.round(Number(s)));
  const m = /^\((\d+)\)/.exec(s);
  return m ? Number(m[1]) : 1;
}

/** Plies of a header callout: "(3) 2x10" → 3, "4x10" / "5-1/4x11-7/8 PSL" → 1. */
export const pliesOf = (text) => countOf(text);

let seq = 0;
export const newScheduleRow = (patch = {}) => ({
  id: `hr${Date.now().toString(36)}${(seq++).toString(36)}`,
  walls: 'bearing', size: 'any', above: 'any', upToIn: 36, header: '', plies: '', sill: '', jacks: '', kings: '', note: '', ...patch,
});

/** Load class of a wall: exterior, bearing and shear walls carry load. */
export const wallLoad = (w) => (BEARING.has(normWall(w).kind) ? 'bearing' : 'nonbearing');

const SIZE_RANK = { '2x4': 1, '2x6': 2, '2x8': 3, '2x10': 4 };

/**
 * The wall that governs an opening type: the most loaded and thickest wall
 * among the walls its openings are in.
 */
export function governingWall(plan, typeId) {
  let best = null;
  for (const w of plan?.walls || []) {
    if (!(w.openings || []).some((o) => o.typeId === typeId)) continue;
    const load = wallLoad(w);
    const size = normWall(w).size;
    const rank = (load === 'bearing' ? 10 : 0) + (SIZE_RANK[size] || 0);
    if (!best || rank > best.rank) best = { load, size, rank };
  }
  return best;
}

/**
 * The schedule row for an opening: the rows of its wall load, stud size and
 * floors above (or "All" / "Any"), the narrowest "up to" width that fits it.
 * A row naming the wall, size or floors wins over an "All" / "Any" row of the same width.
 */
export function rowFor(schedule, { load, size, above, widthIn }) {
  const rows = (schedule?.rows || []).filter((r) => (r.walls === 'any' || r.walls === load)
    && (r.size === 'any' || r.size === size)
    && (r.above === 'any' || r.above === '' || n(r.above) === n(above))
    && n(r.upToIn) > 0 && n(r.upToIn) + 0.01 >= n(widthIn));
  const spec = (r) => (r.walls !== 'any') + (r.size !== 'any') + (r.above !== 'any' && r.above !== '');
  rows.sort((a, b) => n(a.upToIn) - n(b.upToIn) || spec(b) - spec(a));
  return rows[0] || null;
}

/** What a schedule row gives an opening type (the window sill only to windows). */
export function rowValues(row, kind = 'window') {
  const plies = n(row.plies) || pliesOf(row.header);
  return {
    kings: countOf(row.kings) ?? undefined,
    jacks: countOf(row.jacks) ?? undefined,
    plies: plies || undefined,
    notes: [row.header, row.jacks ? `trimmers ${row.jacks}` : '', row.kings ? `kings ${row.kings}` : '', kind === 'window' && row.sill ? `sill ${row.sill}` : '', row.note].filter(Boolean).join(' · '),
  };
}

/**
 * Give every opening type of the plan its schedule row. Types the user set by
 * hand (byHand) are left alone; a type no row fits is marked schedMiss.
 * @param {number} above floors above this level (0 = top floor)
 */
export function applyHeaderSchedule(plan, schedule, above = 0) {
  if (!plan?.openingTypes?.length) return plan;
  const FIELDS = ['kings', 'jacks', 'plies', 'notes'];
  const hasRows = (schedule?.rows || []).length > 0;
  let changed = false;
  const types = plan.openingTypes.map((t) => {
    // set by hand: flagged, or typed before any schedule filled it
    if (t.byHand) return t;
    if (!t.schedRow && FIELDS.some((k) => t[k] !== undefined && t[k] !== '')) {
      if (!hasRows) return t;
      changed = true;
      return { ...t, byHand: true };
    }
    const next = { ...t };
    for (const k of [...FIELDS, 'schedRow', 'schedMiss']) delete next[k];
    if (hasRows) {
      const g = governingWall(plan, t.id);
      const row = g ? rowFor(schedule, { load: t.scope === 'exterior' ? 'bearing' : g.load, size: g.size, above, widthIn: t.widthIn }) : null;
      if (row) {
        for (const [k, v] of Object.entries({ ...rowValues(row, t.kind), schedRow: row.id })) if (v !== undefined && v !== '') next[k] = v;
      } else if (g) next.schedMiss = true;
    }
    if (JSON.stringify(next) !== JSON.stringify(t)) changed = true;
    return next;
  });
  return changed ? { ...plan, openingTypes: types } : plan;
}

/** An opening type back on the schedule: your numbers go, the row's come back. */
export function backToSchedule(t) {
  const next = { ...t };
  for (const k of ['kings', 'jacks', 'plies', 'notes', 'byHand', 'schedRow', 'schedMiss']) delete next[k];
  return next;
}

/** Floors above a level: the plan's own setting, else the levels listed after it. */
export function floorsAbove(est, levelId, plan) {
  const levels = (est?.levels || []).filter(Boolean);
  const i = levels.findIndex((l) => l.id === levelId);
  const own = (plan || levels[i]?.plan)?.floorsAbove;
  if (own !== undefined && own !== null && own !== '') return n(own);
  return i < 0 ? 0 : Math.max(0, levels.length - 1 - i);
}

/** Options commitPlan() needs for one level of this estimate. */
export const scheduleOpts = (est, levelId, plan) => ({ schedule: est?.headerSchedule, above: floorsAbove(est, levelId, plan) });

/* ───────────────────── templates ───────────────────── */

/** A template saved from the project's schedule (no ids tied to the project). */
export const toTemplate = (schedule, name) => ({ name: name || schedule?.name || 'Header schedule', rows: (schedule?.rows || []).map(({ id, ...r }) => r) });
/** The project's schedule made from a template. */
export const fromTemplate = (tpl, templateId) => ({ name: tpl.name, templateId, rows: (tpl.rows || []).map((r) => newScheduleRow(r)) });

const VALID_WALLS = new Set(SCHEDULE_WALLS.map((w) => w.value));
const VALID_SIZES = new Set(SCHEDULE_SIZES);

/**
 * Turn raw JSON from an AI image read of a header schedule into a clean
 * schedule object ready for HeaderSchedulePanel.
 */
export function normalizeImportedSchedule(raw) {
  const list = Array.isArray(raw?.rows) ? raw.rows : [];
  const rows = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const upToIn = Math.round(Number(r.upToIn) || 0);
    const header = String(r.header ?? '').trim();
    if (!(upToIn > 0) && !header) continue;
    const walls = VALID_WALLS.has(r.walls) ? r.walls : 'bearing';
    const rawSize = String(r.size ?? 'any').trim().toLowerCase();
    const size = VALID_SIZES.has(rawSize) ? rawSize
      : /^4\b|4["']|4\s*in/.test(rawSize) ? '2x4'
        : /^6\b|6["']|6\s*in/.test(rawSize) ? '2x6'
          : /^8\b|8["']|8\s*in/.test(rawSize) ? '2x8' : 'any';
    const rawAbove = String(r.above ?? 'any').trim().toLowerCase();
    const aboveNum = Number(rawAbove);
    const above = rawAbove === 'any' || rawAbove === '' || !Number.isFinite(aboveNum)
      ? 'any'
      : Math.max(0, Math.min(4, Math.round(aboveNum)));
    const pliesNum = Number(r.plies);
    const plies = Number.isFinite(pliesNum) && pliesNum > 0 ? Math.round(pliesNum) : '';
    rows.push(newScheduleRow({
      walls,
      size,
      above,
      upToIn: Math.max(0, upToIn),
      header,
      plies,
      sill: String(r.sill ?? '').trim(),
      jacks: String(r.jacks ?? '').trim(),
      kings: String(r.kings ?? '').trim(),
      note: String(r.note ?? '').trim(),
    }));
  }
  return {
    name: String(raw?.name ?? '').trim() || 'Imported header schedule',
    rows,
  };
}

/** Basic non-bearing partition headers when the plans do not include a partition header table. */
export const BASIC_PARTITION_ROWS = [
  { walls: 'nonbearing', size: '2x4', above: 'any', upToIn: 120, header: '4x4', plies: '', sill: '2x', jacks: '', kings: '', note: 'Basic partition default' },
  { walls: 'nonbearing', size: '2x6', above: 'any', upToIn: 120, header: '6x6', plies: '', sill: '2x', jacks: '', kings: '', note: 'Basic partition default' },
];

/**
 * Merge newly imported schedule rows into an existing schedule:
 * - 'replace' replaces all rows.
 * - 'merge' keeps existing rows of other wall kinds (e.g. keeping bearing/shear
 *   rows when importing a separate non-bearing/partition table) and replaces
 *   only the wall kinds present in the imported table.
 */
export function mergeImportedSchedule(current, imported, { mode = 'merge', forceWalls = '' } = {}) {
  const impRows = (imported?.rows || []).map((r) => (forceWalls && VALID_WALLS.has(forceWalls) ? { ...r, walls: forceWalls } : r));
  const curRows = current?.rows || [];
  if (mode === 'replace' || !curRows.length) {
    return {
      name: imported?.name || current?.name || 'Header schedule',
      rows: impRows,
    };
  }
  const impKinds = new Set(impRows.map((r) => r.walls));
  const kept = curRows.filter((r) => !impKinds.has(r.walls));
  return {
    name: current?.name || imported?.name || 'Header schedule',
    templateId: current?.templateId,
    rows: [...kept, ...impRows],
  };
}

/**
 * Example: the bearing/shear wall header schedule of a structural set (S-401,
 * 32) and its non-bearing partition headers (43/S-401). Floors above: 0 = top
 * floor (1-story column), 1 = one floor above, 2 = two floors above.
 */
const ex = (size, above, rows) => rows.map(([upTo, header, sill, jacks, kings]) => ({ walls: 'bearing', size, above, upToIn: upTo, header, plies: '', sill, jacks, kings, note: '' }));
export const EXAMPLE_TEMPLATE = {
  name: 'Example · bearing/shear + partitions (S-401)',
  rows: [
    ...ex('2x4', 0, [[36, '4x4', '2x', '2x4', '2x4'], [60, '4x6', '2x', '2x4', '2x4'], [87, '4x10', '(2) 2x', '(2) 2x4', '(2) 2x4']]),
    ...ex('2x4', 1, [[36, '4x8', '2x', '2x4', '2x4'], [60, '4x10', '2x', '(2) 2x4', '2x4'], [87, '4x12', '(2) 2x', '4x4', '(2) 2x4']]),
    ...ex('2x4', 2, [[36, '4x8', '2x', '(2) 2x4', '2x4'], [60, '4x10', '2x', '4x4', '2x4'], [87, '4x12', '(2) 2x', '4x6', '(2) 2x4']]),
    ...ex('2x6', 0, [[36, '6x4', '2x', '2x6', '2x6'], [60, '6x6', '2x', '2x6', '2x6'], [87, '6x8', '(2) 2x', '2x6', '(2) 2x6']]),
    ...ex('2x6', 1, [[36, '6x6', '2x', '2x6', '2x6'], [60, '6x8', '2x', '2x6', '2x6'], [87, '6x12', '(2) 2x', '(2) 2x6', '(2) 2x6']]),
    ...ex('2x6', 2, [[36, '6x6', '2x', '2x6', '2x6'], [60, '6x8', '2x', '2x6', '2x6'], [87, '6x12', '(2) 2x', '(2) 2x6', '(2) 2x6']]),
    ...[[48, '4x4', '4x6 flat'], [72, '4x4', '4x6 flat'], [96, '4x6', '4x6 flat'], [120, '4x6', '6x6']].flatMap(([upTo, h4, h6]) => [
      { walls: 'nonbearing', size: '2x4', above: 'any', upToIn: upTo, header: h4, plies: '', sill: '2x', jacks: '', kings: '', note: '' },
      { walls: 'nonbearing', size: '2x6', above: 'any', upToIn: upTo, header: h6, plies: '', sill: '2x', jacks: '', kings: '', note: '' },
    ]),
  ],
};
