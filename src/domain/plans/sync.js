// src/domain/plans/sync.js
// Plan walls → wall sections. A level's plan (level.plan) holds the walls found
// on its PDF sheet; walls are grouped by category, kind and stud size, and each
// group feeds one wall section marked with planKey. Those sections take their
// length from the plan; every other section stays manual (the fallback method).

export const WALL_SIZES = ['2x4', '2x6', '2x8', '2x10'];
export const SIZE_LABEL = { '(2)2x4': '(2) 2x4', '(2)2x6': '(2) 2x6' };
/** '(2)2x4' → { double: true, base: '2x4' } */
export const parseSize = (size) => {
  const m = String(size || '').match(/^\(2\)(2x\d+)$/);
  return m ? { double: true, base: m[1] } : { double: false, base: size || '2x4' };
};
export const PLAN_KINDS = [
  { value: 'exterior', label: 'Exterior' },
  { value: 'partition', label: 'Partition' },
  { value: 'bearing', label: 'Bearing' },
  { value: 'shear', label: 'Shear wall' },
  { value: 'knee', label: 'Knee wall' },
];
export const KIND_LABEL = Object.fromEntries(PLAN_KINDS.map((k) => [k.value, k.label]));

const round1 = (v) => Math.round((Number(v) || 0) * 10) / 10;

/** Measured length of a plan wall in feet (or the length the user typed). */
export function wallLengthFt(w, ptPerFt) {
  if (Number(w?.lenFt) > 0) return Number(w.lenFt);
  if (!(ptPerFt > 0)) return 0;
  return Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / ptPerFt;
}

const keyOf = (kind, size) => `${kind === 'exterior' ? 'exterior' : 'interior'}|${kind || 'partition'}|${size}`;

/**
 * The framed walls one plan wall stands for: one, or two for a double wall
 * ((2) 2x4: two 2x4 walls side by side, each with its own type, e.g. a shear
 * wall plus a bearing wall). Each part counts the full length.
 */
export function wallParts(w) {
  const n = normWall(w);
  const first = { kind: n.kind, size: n.size };
  return n.double ? [first, { kind: n.kind2, size: n.size2 }] : [first];
}

/**
 * A wall's framing in one shape: single, or double with each wall's own type
 * and stud size. Older saves wrote a double wall as size '(2)2x4'.
 */
export function normWall(w = {}) {
  const legacy = parseSize(w.size);
  const double = Boolean(w.double) || legacy.double;
  const size = legacy.base;
  return {
    double,
    kind: w.kind || 'partition',
    size,
    kind2: double ? w.kind2 || 'partition' : undefined,
    size2: double ? (w.size2 && !parseSize(w.size2).double ? w.size2 : size) : undefined,
  };
}
export const isDoubleWall = (w) => normWall(w).double;

/** Group keys a wall feeds (two for a double wall). */
/** Order of wall groups: by type (exterior, bearing, shear, partition, knee), thickest first. */
const KIND_ORDER = ['exterior', 'bearing', 'shear', 'partition', 'knee'];
export function groupRank(key) {
  const [, kind, size] = String(key).split('|');
  const k = KIND_ORDER.indexOf(kind);
  const depth = Number(String(size).split('x')[1]) || 0;
  return (k < 0 ? 9 : k) * 100 + (20 - depth);
}
export const sortGroups = (list) => list.slice().sort((a, b) => groupRank(a.key) - groupRank(b.key) || b.lengthFt - a.lengthFt);

export const groupKeysOf = (w) => wallParts(w).map((p) => keyOf(p.kind, p.size));
export const groupKeyOf = (w) => groupKeysOf(w)[0];

export function groupLabel(key) {
  const [, kind, size] = key.split('|');
  return `${KIND_LABEL[kind] || kind} ${size}`;
}

/** Walls of a plan grouped for the estimate, longest first. */
export function planGroups(plan) {
  const k = Number(plan?.ptPerFt) || 0;
  const map = new Map();
  for (const w of plan?.walls || []) {
    const len = wallLengthFt(w, k);
    for (const part of wallParts(w)) {
      const key = keyOf(part.kind, part.size);
      const g = map.get(key) || { key, category: key.split('|')[0], kind: part.kind, size: part.size, walls: 0, lengthFt: 0, openings: 0 };
      g.walls += 1;
      g.lengthFt += len;
      g.openings += (w.openings || []).length;
      map.set(key, g);
    }
  }
  return sortGroups([...map.values()].map((g) => ({ ...g, lengthFt: round1(g.lengthFt), label: groupLabel(g.key) })));
}

/**
 * Bring a level's plan-linked sections up to date with its plan. New groups get
 * a new section (made by makeSection); groups with no walls left keep their
 * section at 0 LF so materials picked there are not lost.
 */
export function syncPlanSections(level, makeSection) {
  const plan = level?.plan;
  if (!plan?.linked) return level;
  const groups = planGroups(plan);
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const seen = new Set();
  const update = (list) => (list || []).map((s) => {
    if (!s?.planKey) return s;
    seen.add(s.planKey);
    const g = byKey.get(s.planKey);
    const planLF = g ? Math.round(g.lengthFt) : 0;
    const planSize = s.planKey.split('|')[2];
    // planManual: the user types the length in Wall panels; the plan length stays as a reference
    const lengthLF = s.planManual ? s.lengthLF : planLF;
    return s.lengthLF === lengthLF && s.planLF === planLF && s.planSize === planSize ? s : { ...s, lengthLF, planLF, planSize };
  });
  let ext = update(level.exteriorSections);
  let int = update(level.interiorSections);
  let added = false;
  for (const g of groups) {
    if (seen.has(g.key)) continue;
    const sec = makeSection({
      kind: g.category === 'exterior' ? 'exterior' : g.kind,
      name: `Plan · ${g.label}`,
      lengthLF: Math.round(g.lengthFt),
      planLF: Math.round(g.lengthFt),
      planKey: g.key,
      planSize: g.size,
    });
    if (g.category === 'exterior') ext = [...ext, sec]; else int = [...int, sec];
    added = true;
  }
  // new sections take their place in the usual order (the user's later drags are kept)
  if (added) { ext = sortSections(ext, 'exterior'); int = sortSections(int, 'interior'); }
  // headers of the exterior plan sections, one Header row per opening type
  ext = ext.map((sec) => (sec?.planKey ? withPlanHeaders(sec, plan) : sec));
  int = int.map((sec) => (sec?.planKey ? withPlanHeaders(sec, plan) : sec));
  // posts placed on the plan: one Post row per post type, in every plan section
  ext = ext.map((sec) => (sec?.planKey ? withPlanPosts(sec, plan) : sec));
  int = int.map((sec) => (sec?.planKey ? withPlanPosts(sec, plan) : sec));
  // drop the blank "Section 1" a new level starts with, once the plan fills the level
  const isBlank = (s) => s && !s.planKey && !Number(s.lengthLF) && !(s.extras || []).length && !Object.values(s.sel || {}).some(Boolean);
  if (ext.some((s) => s?.planKey)) ext = ext.filter((s) => !isBlank(s));
  if (int.some((s) => s?.planKey)) int = int.filter((s) => !isBlank(s));
  return { ...level, exteriorSections: ext, interiorSections: int };
}

/** Compact a detector result into what the project stores. */
export function storeWalls(detected, idOf) {
  const r2 = (v) => Math.round(v * 100) / 100;
  return detected.map((w) => ({
    id: idOf(),
    x1: r2(w.x1), y1: r2(w.y1), x2: r2(w.x2), y2: r2(w.y2),
    t: w.thickIn, style: w.style, kind: w.kind, size: w.size, auto: true,
    ...(w.double ? { double: true, kind2: w.kind2, size2: w.size2 } : {}),
    openings: (w.openings || []).map((o) => ({ atFt: o.atFt, widthFt: o.widthFt, type: o.type })),
  }));
}

/* ───────────────────── detecting again keeps the user's work ───────────────────── */

/** Same wall drawn twice? Parallel, on the same line, overlapping most of the shorter one. */
export function sameWall(a, b, ptPerFt) {
  const La = Math.hypot(a.x2 - a.x1, a.y2 - a.y1), Lb = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
  if (!La || !Lb) return false;
  const d = [(a.x2 - a.x1) / La, (a.y2 - a.y1) / La];
  const cross = Math.abs(d[0] * (b.y2 - b.y1) - d[1] * (b.x2 - b.x1)) / Lb;
  if (cross > 0.06) return false; // more than ~3.5° apart
  const n = [-d[1], d[0]];
  const off = Math.abs((b.x1 + b.x2) / 2 * n[0] + (b.y1 + b.y2) / 2 * n[1] - (a.x1 * n[0] + a.y1 * n[1]));
  const tol = ((Math.max(Number(a.t) || 5, Number(b.t) || 5) / 12) * ptPerFt) * 0.75 + 1;
  if (off > tol) return false;
  const ua = [0, La];
  const ub = [(b.x1 - a.x1) * d[0] + (b.y1 - a.y1) * d[1], (b.x2 - a.x1) * d[0] + (b.y2 - a.y1) * d[1]].sort((x, y) => x - y);
  const ov = Math.min(ua[1], ub[1]) - Math.max(ua[0], ub[0]);
  return ov >= 0.7 * Math.min(La, Lb);
}

/**
 * Merge a fresh detection with the walls on the sheet: walls the user drew stay,
 * changes the user made to a detected wall (type, studs, length) carry over to
 * the same wall found again, and walls the user deleted stay deleted.
 */
export function mergeRedetect(oldWalls = [], removed = [], fresh = [], ptPerFt) {
  const added = oldWalls.filter((w) => w.added);
  const edited = oldWalls.filter((w) => !w.added && (w.auto === false || w.posts?.length || w.hardware?.length || w.shear?.length));
  const usedEdits = new Set();
  const out = [];
  for (const w of fresh) {
    if (removed.some((r) => sameWall(r, w, ptPerFt))) continue;
    const e = edited.find((x) => !usedEdits.has(x.id) && sameWall(x, w, ptPerFt));
    if (e) {
      usedEdits.add(e.id);
      out.push({
        ...w, kind: e.kind, size: e.size, double: e.double, kind2: e.kind2, size2: e.size2, lenFt: e.lenFt, sheathFlip: e.sheathFlip, auto: false,
        ...(e.openingsEdited ? { openings: e.openings, openingsEdited: true } : {}),
        ...(e.posts?.length ? { posts: e.posts } : {}),
        ...(e.hardware?.length ? { hardware: e.hardware } : {}),
        ...(e.shear?.length ? { shear: e.shear, shearManual: e.shearManual } : {}),
        ...(e.auto === false ? {} : { auto: w.auto }),
      });
    } else out.push(w);
  }
  // edits the new detection no longer finds are kept as the user left them
  for (const e of edited) if (!usedEdits.has(e.id)) out.push(e);
  return [...out, ...added].map((w) => Object.fromEntries(Object.entries(w).filter(([, v]) => v !== undefined)));
}

/* ───────────────────── opening types → Header rows ───────────────────── */

const OPENING_DEFAULT_H = { door: 82, window: 48 };

/**
 * The Header rows a plan section gets from its walls' openings: one row per
 * opening type (W1, D2…) with that type's header material and plies, and the
 * openings (quantity, size, kings, jacks) under it. Rows the user added by hand
 * stay; plan rows whose type is gone are removed.
 */
export function withPlanHeaders(sec, plan) {
  const types = new Map((plan.openingTypes || []).map((t) => [t.id, t]));
  const groups = new Map();
  for (const w of plan.walls || []) {
    if (groupKeysOf(w)[0] !== sec.planKey) continue;
    for (const o of w.openings || []) {
      if (!o.typeId || !types.has(o.typeId)) continue;
      const g = groups.get(o.typeId) || [];
      g.push(o);
      groups.set(o.typeId, g);
    }
  }
  const extras = sec.extras || [];
  const mine = new Map(extras.filter((x) => x.planType).map((x) => [x.planType, x]));
  const rows = [];
  for (const [id, list] of groups) {
    const t = types.get(id);
    const kind = t.kind === 'door' ? 'door' : 'window';
    const r2 = (v) => Math.round(v * 4) / 4;
    const opening = {
      id: `plan-${id}`, type: kind, name: id, qty: list.length,
      widthIn: r2(Number(t.widthIn) || (list.reduce((a, o) => a + (Number(o.widthFt) || 0) * 12, 0) / list.length)),
      heightIn: Number(t.heightIn) || OPENING_DEFAULT_H[kind],
      ...(kind === 'window' ? { sillIn: Number(t.sillIn ?? 36) } : {}),
      kings: Number(t.kings) || 1, jacks: Number(t.jacks) || 1,
    };
    const { planPlies: _was, planNote: _note, ...prev0 } = mine.get(id) || {};
    const prev = mine.get(id) ? prev0 : null;
    rows.push({
      ...(prev || { id: `plan-hdr-${id}`, type: 'Header', wastePct: 5 }),
      planType: id,
      // material (family · size · vendor) and plies are picked on the row in Wall panels;
      // plies default to the wall: 3 in 2x6 walls, 2 in 2x4 walls
      item: prev?.item ?? t.header?.item ?? null,
      // plies from the opening type (header schedule) win; without, the row's own
      inputs: { ...(prev?.inputs || {}), ...(Number(t.plies) > 0 ? { plies: Number(t.plies) } : {}) },
      openings: [opening],
      ...(Number(t.plies) > 0 ? { planPlies: Number(t.plies) } : {}),
      ...(t.notes ? { planNote: t.notes } : {}),
    });
  }
  const order = (plan.openingTypes || []).map((t) => t.id);
  rows.sort((a, b) => order.indexOf(a.planType) - order.indexOf(b.planType));
  const manual = extras.filter((x) => !x.planType);
  const next = [...rows, ...manual];
  const same = next.length === extras.length && next.every((x, i) => JSON.stringify(x) === JSON.stringify(extras[i]));
  return same ? sec : { ...sec, extras: next };
}

/** Rank of a wall section: type order, then thickest studs first (plan size or the studs picked). */
export function sectionRank(sec, variant = 'interior') {
  const kind = variant === 'exterior' ? 'exterior' : sec?.kind || 'partition';
  const label = sec?.planSize || sec?.sel?.studs?.sizeLabel || sec?.sel?.bottomPlate?.sizeLabel || '';
  const m = String(label).match(/2\s*[x×]\s*(\d+)/i);
  const size = m ? `2x${m[1]}` : '2x6';
  return groupRank(`${variant}|${kind}|${size}`);
}
export const sortSections = (list, variant) => (list || []).map((s, i) => ({ s, i }))
  .sort((a, b) => sectionRank(a.s, variant) - sectionRank(b.s, variant) || a.i - b.i)
  .map((x) => x.s);

/* ───────────────────── posts → Post rows ───────────────────── */

export const POST_KINDS = [{ value: 'builtup', label: 'Built-up' }, { value: 'solid', label: 'Solid' }];

/** Next post type (P1, P2…): built-up = plies of the wall's studs, solid = one piece. */
export function newPostType(types = [], kind = 'builtup') {
  const num = Math.max(0, ...types.map((t) => Number(String(t.id).replace(/^\D+/, '')) || 0)) + 1;
  return kind === 'solid' ? { id: `P${num}`, kind: 'solid', widthIn: 5.5 } : { id: `P${num}`, kind: 'builtup', plies: 3 };
}

/** Width of a post along the wall, in. */
export const postWidthIn = (t) => (t?.kind === 'solid' ? Number(t.widthIn) || 5.5 : Math.max(1, Number(t?.plies) || 3) * 1.5);

/**
 * The Post rows a plan section gets from the posts on its walls: one row per
 * post type with the number of posts and pieces per post (built-up) or pieces
 * (solid, bought by LF for LVL / PSL / Versa). The material is picked on the row.
 */
export function withPlanPosts(sec, plan) {
  const types = new Map((plan.postTypes || []).map((t) => [t.id, t]));
  const count = new Map();
  for (const w of plan.walls || []) {
    if (groupKeysOf(w)[0] !== sec.planKey) continue;
    for (const p of w.posts || []) if (types.has(p.typeId)) count.set(p.typeId, (count.get(p.typeId) || 0) + 1);
  }
  const extras = sec.extras || [];
  const mine = new Map(extras.filter((x) => x.planPost).map((x) => [x.planPost, x]));
  const rows = [];
  for (const t of plan.postTypes || []) {
    const c = count.get(t.id);
    if (!c) continue;
    const per = t.kind === 'solid' ? 1 : Math.max(1, Number(t.plies) || 3);
    const prev = mine.get(t.id);
    rows.push({
      ...(prev || { id: `plan-post-${t.id}`, type: 'Post', wastePct: 5, item: null }),
      planPost: t.id,
      inputs: { ...(prev?.inputs || {}), piecesPerPost: per, numPosts: c, pieces: c * per },
    });
  }
  const others = extras.filter((x) => !x.planPost);
  const headers = others.filter((x) => x.planType);
  const manual = others.filter((x) => !x.planType);
  const next = [...headers, ...rows, ...manual];
  const same = next.length === extras.length && next.every((x, i) => JSON.stringify(x) === JSON.stringify(extras[i]));
  return same ? sec : { ...sec, extras: next };
}
