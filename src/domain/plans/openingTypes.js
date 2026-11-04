// src/domain/plans/openingTypes.js
// Opening types of a plan: the windows (W1, W2…) and doors (D1, D2…) of the
// walls, grouped by width, exterior and interior walls apart (an interior
// door and an exterior door of the same width usually get other headers). Each type carries its header (material and
// plies) and, optionally, its height, sill, kings and jacks. Openings are
// classified automatically; an opening the user moves to another type (or to a
// new one) keeps that choice. Pure functions.

import { normWall, syncPlanSections } from './sync';
import { applyHeaderSchedule } from './headerSchedule';

const n = (v) => Number(v) || 0;
const TOL_IN = 1.5; // openings within 1½" of a type's width are the same type
const PREFIX = { window: 'W', door: 'D' };

export const kindOf = (o) => (o?.type === 'door' ? 'door' : 'window');
export const isExteriorWall = (w) => normWall(w).kind === 'exterior';
const numOf = (id) => Number(String(id).replace(/^\D+/, '')) || 0;
const nextId = (types, kind) => `${PREFIX[kind]}${Math.max(0, ...types.filter((t) => t.kind === kind).map((t) => numOf(t.id))) + 1}`;

export const scopeOf = (t) => (t?.scope === 'interior' ? 'interior' : 'exterior');
export function sortTypes(types) {
  const rank = (t) => (scopeOf(t) === 'exterior' ? 0 : 2) + (t.kind === 'window' ? 0 : 1);
  return types.slice().sort((a, b) => rank(a) - rank(b) || numOf(a.id) - numOf(b.id));
}

/** A type for a new classification of this opening (id W#/D#). */
export function newType(types, opening, scope = 'exterior') {
  const kind = kindOf(opening);
  return { id: nextId(types, kind), kind, scope, widthIn: Math.round(n(opening.widthFt) * 12 * 4) / 4, manual: true };
}

/**
 * Give every exterior-wall opening a type. Keeps the user's choices, matches
 * the rest by kind and width to the automatic types, makes new types for
 * widths not seen yet (numbered from the narrowest), and drops automatic types
 * left without openings unless their header was set.
 */
export function classifyOpenings(plan) {
  if (!plan?.walls?.length) return plan;
  let types = (plan.openingTypes || []).map((t) => ({ ...t }));
  const byId = () => new Map(types.map((t) => [t.id, t]));
  // the openings to place, narrowest first so W1 is the narrowest window
  const todo = [];
  plan.walls.forEach((w, wi) => {
    const ext = isExteriorWall(w);
    // interior bearing and shear walls carry load: their openings get types of their own
    const bear = !ext && ['bearing', 'shear'].includes(normWall(w).kind);
    (w.openings || []).forEach((o, oi) => todo.push({ wi, oi, o, ext, bear, width: n(o.widthFt) * 12, kind: kindOf(o) }));
  });
  // exterior first (they get the low numbers), then narrowest first
  todo.sort((a, b) => (b.ext - a.ext) || a.width - b.width);
  const assign = new Map(); // "wi|oi" → typeId | null
  for (const t of todo) {
    const key = `${t.wi}|${t.oi}`;
    const ids = byId();
    const cur = t.o.typeId ? ids.get(t.o.typeId) : null;
    const scope = t.ext ? 'exterior' : 'interior';
    if (cur && t.o.typeManual && cur.kind === t.kind) { assign.set(key, cur.id); continue; }
    const fits = (x) => !x.manual && x.kind === t.kind && scopeOf(x) === scope && (x.load === 'bearing') === t.bear && Math.abs(n(x.widthIn) - t.width) <= TOL_IN;
    if (cur && fits(cur)) { assign.set(key, cur.id); continue; }
    let match = types.find(fits);
    if (!match) {
      match = { id: nextId(types, t.kind), kind: t.kind, scope, widthIn: Math.round(t.width * 4) / 4, ...(t.bear ? { load: 'bearing' } : {}) };
      types.push(match);
    }
    assign.set(key, match.id);
  }
  const used = new Set([...assign.values()].filter(Boolean));
  types = types.filter((t) => used.has(t.id) || t.manual || t.header?.item);
  const walls = plan.walls.map((w, wi) => {
    if (!(w.openings || []).length) return w;
    let changed = false;
    const openings = w.openings.map((o, oi) => {
      const id = assign.get(`${wi}|${oi}`) || undefined;
      if (id === o.typeId) return o;
      changed = true;
      const next = { ...o, typeId: id };
      if (!id) { delete next.typeId; delete next.typeManual; }
      return next;
    });
    return changed ? { ...w, openings } : w;
  });
  return { ...plan, walls, openingTypes: sortTypes(types) };
}

/** How many openings of each type, and on which walls. */
export function typeUse(plan) {
  const use = new Map();
  for (const w of plan?.walls || []) {
    for (const o of w.openings || []) {
      if (!o.typeId) continue;
      const u = use.get(o.typeId) || { count: 0, walls: new Set() };
      u.count += 1; u.walls.add(w.id);
      use.set(o.typeId, u);
    }
  }
  return use;
}

/** The type of an opening, for its height, sill, kings and jacks. */
export const typeOf = (plan, o) => (o?.typeId ? (plan?.openingTypes || []).find((t) => t.id === o.typeId) || null : null);

/**
 * Store a changed plan on its level: classify its openings, give their types
 * the header schedule's rows (opts from scheduleOpts()), then update the linked sections.
 */
export function commitPlan(level, plan, makeSection, { schedule, above = 0 } = {}) {
  return syncPlanSections({ ...level, plan: applyHeaderSchedule(classifyOpenings(plan), schedule, above) }, makeSection);
}

/**
 * A level's plan copied for another level with the same floor plan: walls,
 * openings and their types. Posts and hardware (they often change or go away on
 * upper levels) only when asked. The copy is not linked to Wall panels yet.
 */
export function copyPlan(src, { posts = true, hardware = true } = {}) {
  const p = JSON.parse(JSON.stringify(src.plan || {}));
  p.walls = (p.walls || []).map((w) => {
    const next = { ...w };
    if (!posts) delete next.posts;
    if (!hardware) delete next.hardware;
    return next;
  });
  if (!posts) delete p.postTypes;
  if (!hardware) delete p.hardwareTypes;
  p.linked = false;
  p.copiedFrom = src.name || src.id;
  return p;
}
