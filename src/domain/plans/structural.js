// src/domain/plans/structural.js
// Reads the structural framing plan of a level and puts what it shows on the
// walls found on the architectural plan:
//   - posts: drawn as a rectangle with an X (its footprint), sized by the label
//     next to it (6x6, 4x6, (2) 2x6…) or, unlabeled, by the footprint itself;
//   - tie-down rods (ATS and similar): a filled dot between two posts;
//   - hold-down callouts written as text: "(2) HDU5 W/ ROD …";
//   - shear walls: the type letter (A, B, C…) and length in each shear tag.
// The two sheets are lined up by the grid bubbles they share (2.A, 2.B, 2.1…):
// same labels, same distances, so a scale and an offset map one onto the other.
// Pure functions over extractPage() output; unit-tested.

import { newPostType } from './sync';
import { newHardwareType } from './hardware';

export { SHEAR_TYPES, shearLengths, shearCount } from './hardware';

const n = (v) => Number(v) || 0;
const r2 = (v) => Math.round(v * 100) / 100;

/* ───────────────────── lining up the two sheets ───────────────────── */

const GRID_RE = /^(?:\d{1,2}\.)?(?:[A-Z]{1,2}|\d{1,2})(?:\.\d{1,2})?$/;

/**
 * Offset that maps the structural sheet onto the architectural one, from the
 * grid labels both show: arch = s × struct + (dx, dy), s = archK / structK.
 * A grid bubble marks a line, not a point: a column bubble (its copies share x)
 * only fixes x, a row bubble only y. Labels of one pattern (2.A, 2.B… or 2.1,
 * 2.2…) run the same way, so a label shown once takes its pattern's direction.
 * Every pair of equal labels votes; the most voted offset wins on each axis.
 * @returns {{dx:number, dy:number, s:number, labels:string[]}|null}
 */
export function alignSheets(archTexts, structTexts, s = 1) {
  const pick = (texts) => {
    const m = new Map();
    for (const t of texts || []) {
      const str = String(t.str || '').trim();
      if (!GRID_RE.test(str)) continue;
      if (!m.has(str)) m.set(str, []);
      m.get(str).push(t);
    }
    // labels used everywhere (detail numbers "1", "4"…) say nothing about the grid
    for (const [k, v] of m) if (v.length > 4) m.delete(k);
    return m;
  };
  const A = pick(archTexts), B = pick(structTexts);
  const pattern = (label) => label.replace(/[A-Z]/g, 'L').replace(/\d/g, '9');
  // direction of each label, then of each pattern by majority
  const dirOf = new Map();
  const votes = new Map();
  for (const m of [A, B]) {
    for (const [label, list] of m) {
      if (list.length < 2) continue;
      const xs = list.map((t) => t.x), ys = list.map((t) => t.y);
      const sx = Math.max(...xs) - Math.min(...xs), sy = Math.max(...ys) - Math.min(...ys);
      const d = sx < 3 && sy > 20 ? 'v' : sy < 3 && sx > 20 ? 'h' : null;
      if (!d) continue;
      dirOf.set(label, d);
      const v = votes.get(pattern(label)) || { v: 0, h: 0 };
      v[d] += 1;
      votes.set(pattern(label), v);
    }
  }
  const direction = (label) => {
    if (dirOf.has(label)) return dirOf.get(label);
    const v = votes.get(pattern(label));
    return v ? (v.v > v.h ? 'v' : v.h > v.v ? 'h' : null) : null;
  };
  const vote = (axis) => {
    const bins = new Map();
    for (const [label, as] of A) {
      const bs = B.get(label);
      const d = direction(label);
      if (!bs || (d && d !== (axis === 'x' ? 'v' : 'h'))) continue;
      for (const a of as) for (const b of bs) {
        const off = axis === 'x' ? a.x - s * b.x : a.y - s * b.y;
        const key = Math.round(off / 3);
        const bin = bins.get(key) || { list: [], labels: new Set() };
        bin.list.push(off); bin.labels.add(label);
        bins.set(key, bin);
      }
    }
    let best = null;
    for (const bin of bins.values()) if (!best || bin.labels.size > best.labels.size || (bin.labels.size === best.labels.size && bin.list.length > best.list.length)) best = bin;
    if (!best || best.labels.size < 2) return null;
    const v = best.list.slice().sort((p, q) => p - q);
    return { off: v[Math.floor(v.length / 2)], labels: [...best.labels] };
  };
  const x = vote('x'), y = vote('y');
  if (!x || !y) return null;
  return { dx: x.off, dy: y.off, s, labels: [...new Set([...x.labels, ...y.labels])].sort() };
}

/* ───────────────────── posts, rods, callouts, shear tags ───────────────────── */

const NOMINAL = [[1.5, '2'], [3.5, '4'], [5.5, '6'], [7.25, '8'], [9.25, '10'], [11.25, '12']];
const nominal = (inch) => NOMINAL.reduce((b, c) => (Math.abs(c[0] - inch) < Math.abs(b[0] - inch) ? c : b))[1];
/** Name of a post from its footprint (in): 3.5×5.5 → 4x6, 3×5.5 → (2) 2x6, 4.5×5.5 → (3) 2x6. */
export function footprintName(a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const plies = Math.round(lo / 1.5);
  if (Math.abs(lo - plies * 1.5) < 0.2 && plies >= 2 && Math.abs(lo - 3.5) > 0.2) return `(${plies}) 2x${nominal(hi)}`;
  return `${nominal(lo)}x${nominal(hi)}`;
}

const POST_LABEL = /^(?:\((\d)\)\s*)?(\d{1,2})\s*[xX]\s*(\d{1,2})$/;
/** "(2) 2x6" → { name, plies: 2, size: '2x6' }; "6x6" → { name, solid: true }. */
export function parsePostLabel(str) {
  const m = POST_LABEL.exec(String(str || '').trim());
  if (!m) return null;
  const a = Number(m[2]), b = Number(m[3]);
  if (a > 12 || b > 14) return null;
  if (m[1]) return { name: `(${m[1]}) ${a}x${b}`, plies: Number(m[1]) };
  if (a === 2) return null; // a single 2x is a stud, not a post
  return { name: `${a}x${b}`, solid: true };
}

/** Rectangles with both diagonals drawn: posts (and other members) in plan. */
export function findCrossedBoxes(page, ptPerFt, { minIn = 2.5, maxIn = 14 } = {}) {
  const inPt = ptPerFt / 12;
  const mid = new Map();
  for (const s of page.segments || []) {
    const w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1);
    if (w < 0.3 || h < 0.3 || w > maxIn * inPt * 1.2 || h > maxIn * inPt * 1.2) continue;
    const key = `${Math.round((s.x1 + s.x2))}|${Math.round((s.y1 + s.y2))}`; // ½ pt grid
    if (!mid.has(key)) mid.set(key, []);
    mid.get(key).push(s);
  }
  const out = [];
  for (const list of mid.values()) {
    const pos = list.filter((s) => (s.x2 - s.x1) * (s.y2 - s.y1) > 0);
    const neg = list.filter((s) => (s.x2 - s.x1) * (s.y2 - s.y1) < 0);
    for (const a of pos) {
      const w = Math.abs(a.x2 - a.x1), h = Math.abs(a.y2 - a.y1);
      if (!neg.some((b) => Math.abs(Math.abs(b.x2 - b.x1) - w) < 0.2 && Math.abs(Math.abs(b.y2 - b.y1) - h) < 0.2)) continue;
      const wIn = w / inPt, hIn = h / inPt;
      if (Math.min(wIn, hIn) < minIn || Math.max(wIn, hIn) > maxIn) break;
      out.push({ x: (a.x1 + a.x2) / 2, y: (a.y1 + a.y2) / 2, wIn: r2(wIn), hIn: r2(hIn) });
      break;
    }
  }
  return out;
}

/** Filled dots (tie-down rods): many tiny pieces of fill meeting at one centre. */
export function findDots(page, { minPieces = 16, maxPiecePt = 1.5 } = {}) {
  const hub = new Map();
  for (const s of page.segments || []) {
    if (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > maxPiecePt) continue;
    if (!/^0\|#0{6}$|^fill\|#0{6}$/.test(s.style || '')) continue;
    for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) {
      const key = `${x.toFixed(1)}|${y.toFixed(1)}`;
      hub.set(key, (hub.get(key) || 0) + 1);
    }
  }
  const out = [];
  for (const [key, c] of hub) {
    if (c < minPieces) continue;
    const [x, y] = key.split('|').map(Number);
    if (!out.some((p) => Math.hypot(p.x - x, p.y - y) < 1)) out.push({ x, y });
  }
  return out;
}

const LEN_RE = /^(\d{1,3})'\s*-?\s*(\d{1,2})(?:\s+(\d)\/(\d))?"$/;
const parseLen = (str) => {
  const m = LEN_RE.exec(String(str || '').trim());
  return m ? Number(m[1]) + (Number(m[2]) + (m[3] ? Number(m[3]) / Number(m[4]) : 0)) / 12 : null;
};

/** Shear tags: a type letter with its length next to it, both turned with the wall. */
export function findShearTags(texts, ptPerFt) {
  const letters = (texts || []).filter((t) => /^[A-H]$/.test(String(t.str).trim()));
  const lens = (texts || []).map((t) => ({ t, ft: parseLen(t.str) })).filter((x) => x.ft);
  const near = 2.2 * ptPerFt;
  const used = new Set();
  const out = [];
  for (const t of letters) {
    let best = null;
    for (const l of lens) {
      if (used.has(l)) continue;
      if (Math.abs(n(l.t.angle) - n(t.angle)) > 0.1) continue;
      const d = Math.hypot(l.t.x - t.x, l.t.y - t.y);
      if (d <= near && (!best || d < best.d)) best = { l, d };
    }
    if (!best) continue;
    used.add(best.l);
    out.push({ type: t.str.trim(), lengthFt: r2(best.l.ft), x: t.x, y: t.y, vertical: Math.abs(Math.sin(n(t.angle))) > 0.7 });
  }
  return out;
}

const CALLOUT_RE = /^\((\d+)\)\s*([A-Z]{2,5}\d{1,3}[A-Z]?(?:-\d+)?)\b/;
/** Hold-down callouts written on the plan: "(2) HDU5 W/ …" → { qty: 2, model: 'HDU5' }. */
export function findCallouts(texts) {
  const out = [];
  for (const t of texts || []) {
    const m = CALLOUT_RE.exec(String(t.str || '').trim());
    if (!m || !/^(HDU|HD|HTT|STHD|LTT|DTT|PHD|MSTC|CMST|MSTA|ATS)/.test(m[2])) continue;
    out.push({ qty: Number(m[1]), model: m[2], x: t.x, y: t.y });
  }
  return out;
}

/** Each label to the nearest post (one label, one post), within reach. */
function labelPosts(posts, texts, ptPerFt) {
  const labels = (texts || []).map((t) => ({ t, p: parsePostLabel(t.str) })).filter((x) => x.p);
  const pairs = [];
  const reach = 6 * ptPerFt;
  labels.forEach((l, li) => posts.forEach((p, pi) => {
    const d = Math.hypot(l.t.x - p.x, l.t.y - p.y);
    if (d <= reach) pairs.push({ li, pi, d });
  }));
  pairs.sort((a, b) => a.d - b.d);
  const doneL = new Set(), doneP = new Set();
  for (const { li, pi } of pairs) {
    if (doneL.has(li) || doneP.has(pi)) continue;
    doneL.add(li); doneP.add(pi);
    posts[pi].label = labels[li].p.name;
  }
  return labels.length;
}

/**
 * Everything the structural sheet shows, in the architectural sheet's points.
 * @param {object} structPage extractPage() of the structural sheet
 * @param {{ptPerFt:number}} opts structPtPerFt = its scale; align = alignSheets() result
 */
export function readStructural(structPage, { ptPerFt, align }) {
  const k = ptPerFt;
  const posts = findCrossedBoxes(structPage, k);
  const labels = labelPosts(posts, structPage.texts, k);
  const rods = findDots(structPage);
  const shear = findShearTags(structPage.texts, k);
  const callouts = findCallouts(structPage.texts);
  const s = align?.s || 1, dx = align?.dx || 0, dy = align?.dy || 0;
  const map = (o) => ({ ...o, x: r2(s * o.x + dx), y: r2(s * o.y + dy) });
  return {
    posts: posts.map((p) => map({ ...p, name: p.label || footprintName(p.wIn, p.hIn), labeled: Boolean(p.label) })).map(({ label, ...p }) => p),
    rods: rods.map(map),
    shear: shear.map(map),
    callouts: callouts.map(map),
    labels,
  };
}

/* ───────────────────── putting it on the walls ───────────────────── */

/** The wall a point lies on (sheet pt), with the distance along it (ft). */
export function wallAt(walls, x, y, ptPerFt, { reachIn = 8, vertical } = {}) {
  let best = null;
  // a post drawn longer one way stands across its wall: its short side runs along it
  for (const w of walls || []) {
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (!L) continue;
    const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L;
    if (vertical !== undefined && vertical !== null && (Math.abs(uy) > 0.7) !== vertical) continue;
    const u = (x - w.x1) * ux + (y - w.y1) * uy;
    const off = Math.abs((x - w.x1) * -uy + (y - w.y1) * ux);
    const lim = ((n(w.t) || 5) / 24 + reachIn / 12) * ptPerFt;
    const end = (reachIn / 12) * ptPerFt;
    if (off > lim || u < -end || u > L + end) continue;
    if (!best || off < best.off) best = { w, off, atFt: Math.max(0, Math.min(L, u)) / ptPerFt, L: L / ptPerFt };
  }
  return best;
}

const ACTUAL = [1.5, 3, 3.5, 4.5, 5.25, 5.5, 7, 7.25, 9.25, 11.25];
const snapIn = (v) => ACTUAL.reduce((b, c) => (Math.abs(c - v) < Math.abs(b - v) ? c : b));

/** Posts the plans do not label, by the wall they stand in (typical framing-plan note). */
export const UNLABELED_POSTS = { '2x4': '4x4', '2x6': '6x6', '2x8': '6x8' };

/** Width of a solid post along the wall: the side of its size closest to the drawn one. */
function solidAlong(name, drawn) {
  const m = /(\d+)x(\d+)/.exec(name);
  if (!m) return drawn;
  const act = (nom) => { const v = Number(nom); return v <= 2 ? 1.5 : v <= 6 ? v - 0.5 : v - 0.75; };
  const sides = [act(m[1]), act(m[2])];
  return sides.reduce((b, c) => (Math.abs(c - drawn) < Math.abs(b - drawn) ? c : b));
}

const sameType = (t, want) => t.notes === want.notes && t.kind === want.kind && (t.kind === 'solid' ? n(t.widthIn) === n(want.widthIn) : n(t.plies) === n(want.plies));

/**
 * Place what readStructural() found on the plan's walls. Items placed before
 * from the structural sheet are replaced; posts, hardware and shear types you
 * placed by hand stay. Shear tags take the wall the tag points at (same
 * direction as its text). Returns the new plan and what could not be placed.
 */
export function placeStructural(plan, found, { unlabeled = UNLABELED_POSTS, posts = true, rods = true, callouts = true, shear = true, rodName = 'Tie-down rod (ATS)' } = {}) {
  const k = n(plan.ptPerFt);
  if (!k) return { plan, placed: {}, missed: [] };
  const walls = (plan.walls || []).map((w) => ({
    ...w,
    posts: (w.posts || []).filter((p) => !p.src),
    hardware: (w.hardware || []).filter((h) => !h.src),
    ...(w.shearManual ? {} : { shear: [] }),
  }));
  const byId = new Map(walls.map((w) => [w.id, w]));
  let postTypes = (plan.postTypes || []).slice();
  let hardwareTypes = (plan.hardwareTypes || []).slice();
  const placed = { posts: 0, rods: 0, callouts: 0, shear: 0 };
  const missed = [];

  if (posts) {
    for (const p of found.posts || []) {
      const long = Math.max(p.wIn, p.hIn) / Math.max(0.1, Math.min(p.wIn, p.hIn)) >= 1.25;
      // elongated: the wall runs along its short side (vertical wall when it is wider than tall)
      const hit = (long && wallAt(walls, p.x, p.y, k, { vertical: p.wIn > p.hIn })) || wallAt(walls, p.x, p.y, k);
      if (!hit) { missed.push({ kind: 'post', x: p.x, y: p.y, name: p.name }); continue; }
      const w = byId.get(hit.w.id);
      const horiz = Math.abs(w.x2 - w.x1) >= Math.abs(w.y2 - w.y1);
      const drawn = snapIn(horiz ? p.wIn : p.hIn);
      // unlabeled: the size the plan notes give for the wall it stands in, if any
      const name = (!p.labeled && unlabeled?.[w.size]) || p.name;
      const lab = parsePostLabel(name);
      const want = lab?.plies
        ? { kind: 'builtup', plies: lab.plies, notes: name }
        : { kind: 'solid', widthIn: solidAlong(name, drawn), notes: name };
      let t = postTypes.find((x) => sameType(x, want));
      if (!t) {
        t = { ...newPostType(postTypes, want.kind), ...want, src: 'sd' };
        postTypes = [...postTypes, t];
      }
      const half = (t.kind === 'solid' ? n(t.widthIn) : n(t.plies) * 1.5) / 24;
      const atFt = Math.max(half, Math.min(hit.L - half, hit.atFt));
      w.posts.push({ atFt: r2(atFt), typeId: t.id, src: 'sd' });
      placed.posts += 1;
    }
  }

  const hwType = (name, key) => {
    let t = hardwareTypes.find((x) => x.auto === key) || hardwareTypes.find((x) => (x.name || '').trim().toLowerCase() === name.toLowerCase());
    if (!t) {
      t = { ...newHardwareType(hardwareTypes), name, rule: 'each', auto: key };
      hardwareTypes = [...hardwareTypes, t];
    }
    return t;
  };
  if (rods && (found.rods || []).length) {
    const t = hwType(rodName, 'rod');
    for (const r of found.rods) {
      const hit = wallAt(walls, r.x, r.y, k);
      if (!hit) { missed.push({ kind: 'rod', x: r.x, y: r.y }); continue; }
      byId.get(hit.w.id).hardware.push({ atFt: r2(hit.atFt), typeId: t.id, src: 'sd' });
      placed.rods += 1;
    }
  }
  if (callouts) {
    for (const c of found.callouts || []) {
      const t = hwType(`${c.model} hold-down`, c.model);
      // the callout text sits beside its post, at the end of a leader
      const hit = wallAt(walls, c.x, c.y, k, { reachIn: 60 });
      if (!hit) { missed.push({ kind: 'callout', x: c.x, y: c.y, name: `(${c.qty}) ${c.model}` }); continue; }
      for (let i = 0; i < c.qty; i += 1) byId.get(hit.w.id).hardware.push({ atFt: r2(hit.atFt), typeId: t.id, src: 'sd' });
      placed.callouts += c.qty;
    }
  }
  if (shear) {
    for (const s of found.shear || []) {
      const hit = wallAt(walls, s.x, s.y, k, { reachIn: 48, vertical: s.vertical });
      if (!hit) { missed.push({ kind: 'shear', x: s.x, y: s.y, name: `${s.type} ${s.lengthFt}'` }); continue; }
      const w = byId.get(hit.w.id);
      if (w.shearManual) continue;
      w.shear.push({ type: s.type, lengthFt: s.lengthFt });
      placed.shear += 1;
    }
  }
  for (const w of walls) {
    w.posts.sort((a, b) => a.atFt - b.atFt);
    w.hardware.sort((a, b) => a.atFt - b.atFt);
    if (!w.posts.length) delete w.posts;
    if (!w.hardware.length) delete w.hardware;
    if (Array.isArray(w.shear) && !w.shear.length) delete w.shear;
  }
  // post types made by an earlier import and no longer used go away
  const used = new Set(walls.flatMap((w) => (w.posts || []).map((p) => p.typeId)));
  postTypes = postTypes.filter((t) => !t.src || used.has(t.id));
  const usedHw = new Set(walls.flatMap((w) => (w.hardware || []).map((h) => h.typeId)));
  hardwareTypes = hardwareTypes.filter((t) => !t.auto || (t.rule || 'each') !== 'each' || usedHw.has(t.id));
  return { plan: { ...plan, walls, postTypes, hardwareTypes }, placed, missed };
}

/** Take off everything placed from the structural sheet; your own posts, hardware and shear types stay. */
export const removeStructural = (plan) => placeStructural(plan, {}, { posts: false, rods: false, callouts: false, shear: false }).plan;

/** Spacings (in) of the S-402 style shear wall schedule: anchor bolts on concrete, lag screws at upper sills. */
export const SHEAR_DEFAULTS = {
  anchor: { name: '5/8" anchor bolt (shear walls)', byType: { A: 48, B: 48, C: 32, D: 32, E: 24, F: 16, G: 16, H: 8 } },
  lag: { name: '5/8" lag screw (shear wall sill)', byType: { A: 0, B: 16, C: 16, D: 16, E: 8, F: 8, G: 8, H: 6 } },
};
