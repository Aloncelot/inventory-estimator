// src/domain/plans/framing.js
// Framing of the walls on a level's plan (Plan takeoff), wall by wall:
// panels, plates, studs, blocking, sheathing and the framing around every
// window and door (kings, jacks, header, cripples, sill). The same members are
// drawn (Layout check) and cut from the stock picked in the estimate, so the
// drawing and the material check always agree. Pure functions; inches.
//
// Rules (IRC R602, panelized walls, as in domain/estimate/layout.js):
// - studs at the section spacing from each panel start, plus an end stud;
//   studs are wall height − 4½" (bottom plate, top plate, loose top plate);
// - panel joints never fall inside an opening: they move to before its king;
// - each opening: kings (full height) and jacks (to the header) on both sides,
//   a built-up header (opening + jacks) across the wall, cripples above it at
//   the stud layout; windows also get a flat sill and cripples under it;
// - the bottom plate stops at doors;
// - blocking rows = ceil(height / 4) − 1 between full-height members, not in openings;
// - exterior walls and shear walls are sheathed with 4×8 sheets on one face
//   (the outside, or the face between the two walls of a double wall); the
//   sheets are cut around the openings.

import { panelize, studPositions, sheetLayout } from '../estimate/layout';
import { computeWallSection, pieceLength } from '../estimate';
import { cutLinear, cutSheets } from '../lib/cutting';
import { normWall, wallLengthFt, KIND_LABEL, groupRank, postWidthIn } from './sync';

const n = (v) => Number(v) || 0;
export const PLATE = 1.5;
export const STUD = 1.5;
const DOUBLE_GAP = 1; // air gap between the two walls of a double wall, in
const HEADER_H = 9.25; // 2x10 header depth (the default Header material)
const MIN_PANEL = 24;
export const STUD_DEPTH = { '2x4': 3.5, '2x6': 5.5, '2x8': 7.25, '2x10': 9.25 };
export const OPENING_DEFAULTS = { door: { heightIn: 82, sillIn: 0 }, window: { heightIn: 48, sillIn: 36 } };

const keyOf = (kind, size) => `${kind === 'exterior' ? 'exterior' : 'interior'}|${kind}|${size}`;

/** Rough opening of a plan opening, with defaults for what the plan does not give. */
export function openingOf(o, t = null) {
  const type = o.type === 'door' ? 'door' : 'window';
  const d = OPENING_DEFAULTS[type];
  // the opening's own values, else its type's (W1, D2…), else the defaults
  const sillIn = type === 'door' ? 0 : n(o.sillIn ?? t?.sillIn ?? d.sillIn);
  const heightIn = n(o.heightIn) || n(t?.heightIn) || d.heightIn;
  return {
    type, typeId: o.typeId || null,
    a0: n(o.atFt) * 12, a1: (n(o.atFt) + n(o.widthFt)) * 12, z0: sillIn, z1: sillIn + heightIn,
    kings: n(o.kings) || n(t?.kings) || 1, jacks: n(o.jacks) || n(t?.jacks) || 1,
  };
}

/* ───────────────────────── one wall ───────────────────────── */

/**
 * Frame one straight wall.
 * @param {object} w { lengthIn, heightIn, depthIn, spacing, mult, openings[], panelIn, sheathed, orientation }
 */
export function frameWall(w) {
  const L = Math.max(0, n(w.lengthIn));
  const H = Math.max(36, n(w.heightIn) || 144);
  const d = n(w.depthIn) || 5.5;
  const spacing = Math.max(8, n(w.spacing) || 16);
  const mult = Math.max(1, n(w.mult) || 1);
  const panelIn = Math.max(MIN_PANEL, n(w.panelIn) || 96);
  const studLen = H - 3 * PLATE;
  const studTop = PLATE + studLen;
  // blocking as in the estimate: exterior and bearing walls only
  const blockRows = w.blocking === false ? 0 : Math.max(0, Math.ceil(H / 12 / 4) - 1);
  // fireblocking (IRC R302.11): no concealed space taller than 10 ft; blocking rows already do it
  const fireRows = blockRows === 0 && H > 120 ? Math.ceil(H / 120) - 1 : 0;
  const ops = (w.openings || [])
    .map((o) => ({ ...o }))
    .filter((o) => o.a1 > o.a0 && o.a0 >= -0.01 && o.a1 <= L + 0.01)
    .sort((a, b) => a.a0 - b.a0)
    .map((o) => {
      const j0 = o.a0 - o.jacks * STUD, j1 = o.a1 + o.jacks * STUD;
      const z1 = Math.min(o.z1, studTop - HEADER_H);
      return { ...o, z1, j0, j1, k0: Math.max(0, j0 - o.kings * STUD), k1: Math.min(L, j1 + o.kings * STUD) };
    });
  // posts: full-height members at their place; studs and panel joints stay clear of them
  const posts = (w.posts || []).map((p) => ({ ...p, a0: Math.max(0, p.a0), a1: Math.min(L, p.a1) })).filter((p) => p.a1 - p.a0 > 0.5);
  const zones = [...ops.map((o) => ({ k0: o.k0, k1: o.k1 })), ...posts.map((p) => ({ k0: p.a0, k1: p.a1 }))];
  const zoneAt = (x) => zones.find((o) => x > o.k0 + 0.01 && x < o.k1 - 0.01);

  // panels: stock-length panels whose joints stay out of the openings
  const panels = [];
  let at = 0;
  while (L - at > 0.01) {
    let next = Math.min(L, at + panelIn);
    const z = next < L ? zoneAt(next) : null;
    if (z) {
      // move the joint before the opening; past it only if that panel still fits the panel length
      if (z.k0 - at >= 12) next = z.k0;
      else if (z.k1 - at <= panelIn + 0.01) next = z.k1;
      else next = z.k0 > at + 0.01 ? z.k0 : z.k1; // opening wider than a panel
    }
    panels.push({ start: at, length: next - at });
    at = next;
  }

  const members = [];
  const add = (t, a0, a1, z0, z1, c0 = 0, c1 = d) => { if (a1 - a0 > 0.01 && z1 - z0 > 0.01) members.push({ t, a0, a1, z0, z1, c0, c1 }); };
  const counts = { studs: 0, kings: 0, jacks: 0, cripples: 0, headers: 0, sills: 0, posts: 0 };
  const cuts = { bottomPlate: [], topPlate: [], studs: [], openStuds: [], cripples: [], headers: [], blocking: [], fireBlocking: [] };

  for (const p of panels) {
    const p0 = p.start, p1 = p.start + p.length;
    // bottom plate, open at doors
    let from = p0;
    for (const o of ops.filter((x) => x.type === 'door' && x.a0 < p1 && x.a1 > p0)) {
      add('plate', from, o.a0, 0, PLATE); cuts.bottomPlate.push(o.a0 - from); from = o.a1;
    }
    add('plate', from, p1, 0, PLATE); cuts.bottomPlate.push(p1 - from);
    add('plate', p0, p1, studTop, studTop + PLATE); cuts.topPlate.push(p.length);

    // common studs at the layout, except where an opening is framed
    const full = []; // full-height members (studs, kings): blocking goes between them
    for (const x of studPositions(p.length, spacing).map((s) => p0 + s)) {
      if (zones.some((o) => x + STUD * mult > o.k0 + 0.01 && x < o.k1 - 0.01)) continue;
      for (let m = 0; m < mult; m += 1) {
        const s0 = Math.min(x + m * STUD, p1 - STUD);
        add('stud', s0, s0 + STUD, PLATE, studTop); cuts.studs.push(studLen); counts.studs += 1;
      }
      full.push([x, x + STUD * mult]);
    }
    // posts in this panel
    for (const p of posts.filter((x) => x.a0 >= p0 - 0.01 && x.a1 <= p1 + 0.01)) {
      if (p.kind === 'solid') add('post', p.a0, p.a1, PLATE, studTop);
      else for (let i = 0; i < p.plies; i += 1) add('post', p.a0 + i * STUD, p.a0 + (i + 1) * STUD, PLATE, studTop);
      full.push([p.a0, p.a1]);
      counts.posts += 1;
    }
    // openings in this panel
    for (const o of ops.filter((x) => x.a0 >= p0 - 0.01 && x.a1 <= p1 + 0.01)) {
      for (let i = 0; i < o.kings; i += 1) {
        add('king', o.k0 + i * STUD, o.k0 + (i + 1) * STUD, PLATE, studTop);
        add('king', o.k1 - (i + 1) * STUD, o.k1 - i * STUD, PLATE, studTop);
        cuts.openStuds.push(studLen, studLen); counts.kings += 2;
      }
      full.push([o.k0, o.k0 + o.kings * STUD], [o.k1 - o.kings * STUD, o.k1]);
      for (let i = 0; i < o.jacks; i += 1) {
        add('jack', o.j0 + i * STUD, o.j0 + (i + 1) * STUD, PLATE, o.z1);
        add('jack', o.j1 - (i + 1) * STUD, o.j1 - i * STUD, PLATE, o.z1);
        cuts.openStuds.push(o.z1 - PLATE, o.z1 - PLATE); counts.jacks += 2;
      }
      const hTop = o.z1 + HEADER_H;
      add('header', o.j0, o.j1, o.z1, hTop);
      cuts.headers.push(o.j1 - o.j0); counts.headers += 1;
      // cripples at the layout above the header (and under the sill)
      const lay = [];
      for (let x = Math.ceil((o.a0 - p0) / spacing) * spacing + p0; x < o.a1 - STUD + 0.01; x += spacing) lay.push(x);
      if (studTop - hTop > 1) for (const x of lay) { add('cripple', x, x + STUD, hTop, studTop); cuts.cripples.push(studTop - hTop); counts.cripples += 1; }
      if (o.type === 'window' && o.z0 > PLATE * 2 + 1) {
        add('sill', o.a0, o.a1, o.z0 - PLATE, o.z0);
        cuts.cripples.push(o.a1 - o.a0); counts.sills += 1;
        const under = [o.a0, ...lay.filter((x) => x > o.a0 + STUD && x < o.a1 - 2 * STUD), o.a1 - STUD];
        for (const x of under) { add('cripple', x, x + STUD, PLATE, o.z0 - PLATE); cuts.cripples.push(o.z0 - 2 * PLATE); counts.cripples += 1; }
      }
    }
    // blocking between neighbouring full-height members, staggered, not across openings
    full.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i + 1 < full.length; i += 1) {
      const a = full[i][1], b = full[i + 1][0];
      if (b - a < 2 || (!blockRows && !fireRows) || ops.some((o) => a < o.k1 - 0.01 && b > o.k0 + 0.01 && a >= o.k0 - 0.01)) continue;
      for (let r = 1; r <= blockRows; r += 1) {
        const z = PLATE + (studLen * r) / (blockRows + 1) - 0.75 + (i % 2 ? 1.5 : -1.5);
        add('block', a, b, z, z + PLATE); cuts.blocking.push(b - a);
      }
      for (let r = 1; r <= fireRows; r += 1) {
        const z = PLATE + (studLen * r) / (fireRows + 1) - 0.75;
        add('fire', a, b, z, z + PLATE); cuts.fireBlocking.push(b - a);
      }
    }
  }
  // loose top plate along the whole wall
  add('loose', 0, L, studTop + PLATE, studTop + 2 * PLATE);

  // sheathing on one face, cut around the openings
  const sheets = [];
  if (w.sheathed) {
    const raw = w.orientation === 'horizontal'
      ? sheetLayout(0, L, H, 'horizontal')
      : panels.flatMap((p) => sheetLayout(p.start, p.start + p.length, H, 'vertical'));
    // each sheet goes on whole and the openings are cut out of it afterwards:
    // it stays one sheet (one piece of material) with a hole or a notch. Only a
    // sheet completely inside an opening is left out.
    const holes = ops.map((o) => ({ a0: o.a0, a1: o.a1, z0: o.z0, z1: o.z1 }));
    for (const sh of raw) {
      const pieces = subtract(sh, holes);
      if (!pieces.length) continue;
      const cut = {
        a0: Math.min(...pieces.map((r) => r.a0)), a1: Math.max(...pieces.map((r) => r.a1)),
        z0: Math.min(...pieces.map((r) => r.z0)), z1: Math.max(...pieces.map((r) => r.z1)),
      };
      const cutouts = holes
        .map((h) => ({ a0: Math.max(h.a0, cut.a0), a1: Math.min(h.a1, cut.a1), z0: Math.max(h.z0, cut.z0), z1: Math.min(h.z1, cut.z1) }))
        .filter((h) => h.a1 - h.a0 > 0.5 && h.z1 - h.z0 > 0.5);
      sheets.push({ ...cut, pieces, cutouts });
    }
  }
  return { posts, lengthIn: L, heightIn: H, depthIn: d, studLen, studTop, blockRows, fireRows, panels, members, sheets, openings: ops, counts, cuts };
}

function crosses(ax, ay, bx, by, w) {
  const den = (bx - ax) * (w.y2 - w.y1) - (by - ay) * (w.x2 - w.x1);
  if (Math.abs(den) < 1e-9) return false;
  const t = ((w.x1 - ax) * (w.y2 - w.y1) - (w.y1 - ay) * (w.x2 - w.x1)) / den;
  const u = ((w.x1 - ax) * (by - ay) - (w.y1 - ay) * (bx - ax)) / den;
  return t > 0 && t <= 1 && u >= 0 && u <= 1;
}

/** A sheet minus the openings over it, as up to four rectangles per opening. */
function subtract(rect, holes) {
  let pieces = [rect];
  for (const h of holes) {
    const next = [];
    for (const r of pieces) {
      if (h.a1 <= r.a0 || h.a0 >= r.a1 || h.z1 <= r.z0 || h.z0 >= r.z1) { next.push(r); continue; }
      if (h.a0 > r.a0) next.push({ ...r, a1: h.a0 });
      if (h.a1 < r.a1) next.push({ ...r, a0: h.a1 });
      const a0 = Math.max(r.a0, h.a0), a1 = Math.min(r.a1, h.a1);
      if (h.z0 > r.z0) next.push({ a0, a1, z0: r.z0, z1: h.z0 });
      if (h.z1 < r.z1) next.push({ a0, a1, z0: h.z1, z1: r.z1 });
    }
    pieces = next.filter((r) => r.a1 - r.a0 > 0.5 && r.z1 - r.z0 > 0.5);
  }
  return pieces;
}

/* ───────────────────────── the level ───────────────────────── */

/**
 * Every wall of a level's plan as framed walls in world inches (x east, y north,
 * z up). A double wall gives two parts side by side.
 */
export function planModel(level, { panelLenFt = 8, sheathing = 'vertical' } = {}) {
  const plan = level?.plan;
  const k = n(plan?.ptPerFt);
  const walls = (plan?.walls || []).filter((w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 0);
  if (!k || !walls.length) return null;
  const s = 12 / k; // sheet points → inches
  const sections = {};
  for (const sec of [...(level.exteriorSections || []), ...(level.interiorSections || [])]) if (sec?.planKey) sections[sec.planKey] = sec;

  // world: x right, y up the sheet (north), so the drawing is not mirrored
  const pts = walls.flatMap((w) => [[w.x1 * s, -w.y1 * s], [w.x2 * s, -w.y2 * s]]);
  const minX = Math.min(...pts.map((p) => p[0])), minY = Math.min(...pts.map((p) => p[1]));
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length - minX, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length - minY;
  let maxX = 0, maxY = 0;

  // centre lines in world inches, for the "which side is outside" rays
  const segs = walls.map((w) => ({ id: w.id, x1: w.x1 * s - minX, y1: -w.y1 * s - minY, x2: w.x2 * s - minX, y2: -w.y2 * s - minY }));
  const far = Math.hypot(...pts.reduce((m, p) => [Math.max(m[0], p[0] - minX), Math.max(m[1], p[1] - minY)], [0, 0])) * 2 + 120;
  const escapes = (id, x, y, dx, dy) => !segs.some((o) => o.id !== id && crosses(x, y, x + dx * far, y + dy * far, o));

  const parts = [];
  for (const w of walls) {
    const nw = normWall(w);
    const x1 = w.x1 * s - minX, y1 = -w.y1 * s - minY, x2 = w.x2 * s - minX, y2 = -w.y2 * s - minY;
    const geomL = Math.hypot(x2 - x1, y2 - y1);
    const L = wallLengthFt(w, k) * 12 || geomL;
    const dir = [(x2 - x1) / geomL, (y2 - y1) / geomL];
    const nrm = [-dir[1], dir[0]];
    const mid = [x1 + dir[0] * L / 2, y1 + dir[1] * L / 2];
    // outside: the side where rays from the wall meet no other wall; if both or
    // neither do, the side away from the middle of the building
    const sideFree = [1, -1].map((sg) => [0.25, 0.5, 0.75].every((f) => escapes(w.id, x1 + dir[0] * L * f + nrm[0] * sg * 12, y1 + dir[1] * L * f + nrm[1] * sg * 12, nrm[0] * sg, nrm[1] * sg)));
    let outside = nrm[0] * (cx - mid[0]) + nrm[1] * (cy - mid[1]) > 0 ? -1 : 1;
    if (sideFree[0] !== sideFree[1]) outside = sideFree[0] ? 1 : -1;
    if (w.sheathFlip) outside = -outside; // the user turned the sheathing to the other face
    const list = nw.double ? [{ kind: nw.kind, size: nw.size }, { kind: nw.kind2, size: nw.size2 }] : [{ kind: nw.kind, size: nw.size }];
    const depths = list.map((p) => STUD_DEPTH[p.size] || 3.5);
    const total = depths.reduce((a, b) => a + b, 0) + (list.length - 1) * DOUBLE_GAP;
    const types = new Map((plan.openingTypes || []).map((t) => [t.id, t]));
    const pTypes = new Map((plan.postTypes || []).map((t) => [t.id, t]));
    const wallPosts = (w.posts || []).map((p) => {
      const t = pTypes.get(p.typeId);
      const wIn = postWidthIn(t);
      const at = n(p.atFt) * 12;
      return { a0: at - wIn / 2, a1: at + wIn / 2, kind: t?.kind || 'builtup', plies: t?.kind === 'solid' ? 1 : Math.max(1, n(t?.plies) || 3), typeId: p.typeId };
    });
    const openings = (w.openings || []).map((o) => openingOf(o, types.get(o.typeId)));
    list.forEach((p, i) => {
      const key = keyOf(p.kind, p.size);
      const sec = sections[key];
      const depth = depths[i];
      const off = list.length === 1 ? 0 : i === 0 ? -total / 2 + depth / 2 : total / 2 - depth / 2;
      // double wall: the shear wall's sheets go between the two walls (flip: on its outer face)
      const between = i === 0 ? 1 : -1;
      const otherSide = list.length === 1 ? outside : w.sheathFlip ? -between : between;
      const sheathed = p.kind === 'exterior' || p.kind === 'shear';
      const heightIn = (n(sec?.heightFt) || 12) * 12;
      const frame = frameWall({
        lengthIn: L, heightIn, depthIn: depth,
        spacing: n(sec?.studSpacingIn) || 16, mult: n(sec?.studMultiplier) || 1,
        openings, posts: i === 0 ? wallPosts : [], panelIn: n(panelLenFt) * 12 || 96, sheathed, orientation: sheathing,
        blocking: p.kind === 'exterior' || p.kind === 'bearing',
      });
      // local frame: a along the wall from its start, c across (from face −d/2 to +d/2)
      const origin = [x1 + nrm[0] * off, y1 + nrm[1] * off];
      parts.push({
        id: `${w.id}${list.length > 1 ? `:${i + 1}` : ''}`, wallId: w.id, part: i, parts: list.length,
        kind: p.kind, size: p.size, key, sectionId: sec?.id || null, sectionName: sec?.name || null,
        label: `${KIND_LABEL[p.kind] || p.kind} ${p.size}`,
        origin, dir, nrm, depth, heightIn, lengthIn: L,
        sheathFace: p.kind === 'exterior' ? outside : otherSide,
        frame,
      });
      for (const a of [0, L]) for (const c of [-depth / 2, depth / 2]) {
        maxX = Math.max(maxX, origin[0] + dir[0] * a + nrm[0] * c);
        maxY = Math.max(maxY, origin[1] + dir[1] * a + nrm[1] * c);
      }
    });
  }
  return { parts, width: maxX, depth: maxY, maxHeight: Math.max(...parts.map((p) => p.heightIn)) };
}

/** A point of a wall part in world inches: a along, c across (c = 0 at the centre), z up. */
export function partPoint(part, a, c, z = 0) {
  return [part.origin[0] + part.dir[0] * a + part.nrm[0] * c, part.origin[1] + part.dir[1] * a + part.nrm[1] * c, z];
}

/* ───────────────────────── material check ───────────────────────── */

const STATUS_OF = (r) => {
  if (r.tooLong > 0) return 'stock-too-short';
  if (r.leftover < 0) return 'short';
  if (r.leftoverPct > n(r.est.waste) + 5) return 'more-left';
  if (r.leftoverPct < n(r.est.waste) - 5) return 'less-left';
  return 'match';
};

/**
 * Cut every member of the plan walls from the stock picked in their linked
 * sections and compare with the estimate, one block per section.
 */
export function planCheck(level, model) {
  if (!model) return [];
  const sections = {};
  for (const sec of [...(level.exteriorSections || []).map((s) => [s, 'exterior']), ...(level.interiorSections || []).map((s) => [s, 'interior'])]) {
    if (sec[0]?.planKey) sections[sec[0].planKey] = sec;
  }
  const byKey = new Map();
  for (const p of model.parts) {
    const g = byKey.get(p.key) || { key: p.key, label: p.label, parts: [], lengthIn: 0 };
    g.parts.push(p); g.lengthIn += p.lengthIn;
    byKey.set(p.key, g);
  }
  const out = [];
  for (const g of byKey.values()) {
    const [sec, variant] = sections[g.key] || [];
    const sel = sec?.sel || {};
    const all = (key) => g.parts.flatMap((p) => p.frame.cuts[key]);
    const studStock = pieceLength(sel.studs, 0) * 12 || Math.max(...g.parts.map((p) => p.heightIn));
    const stockIn = { bottomPlate: pieceLength(sel.bottomPlate) * 12, topPlate: pieceLength(sel.topPlate) * 12, studs: studStock, blocking: pieceLength(sel.blocking) * 12 };
    const longest = (key) => Math.max(0, ...all(key));
    // a plate longer than the stock (a panel around a very wide opening) is spliced from two pieces
    const spliced = (cuts, stock) => (stock > 0 ? cuts.flatMap((c) => {
      const out = [];
      let left = c;
      while (left > stock + 0.01) { out.push(stock); left -= stock; }
      out.push(left);
      return out;
    }) : cuts);
    const used = {
      bottomPlate: cutLinear(spliced(all('bottomPlate'), stockIn.bottomPlate), stockIn.bottomPlate),
      topPlate: cutLinear(spliced(all('topPlate'), stockIn.topPlate), stockIn.topPlate),
      studs: cutLinear(all('studs'), studStock),
      blocking: cutLinear(all('blocking'), stockIn.blocking),
      fireBlocking: cutLinear(all('fireBlocking'), pieceLength(sel.fireBlocking) * 12),
      // whole sheets, and the short fillers (end of a panel, top row) cut from offcuts
      sheathing: { pieces: cutSheets(g.parts.flatMap((p) => p.frame.sheets.map((x) => [x.a1 - x.a0, x.z1 - x.z0]))).sheets, tooLong: 0 },
      openStuds: cutLinear(all('openStuds'), studStock),
      cripples: cutLinear(all('cripples'), studStock),
    };
    const calc = sec ? computeWallSection(sec, variant) : null;
    const est = (key) => {
      const r = calc?.baseRows.find((x) => x.key === key) || calc?.openingRows?.find?.((x) => x.key === key);
      return { raw: n(r?.qtyRaw), final: n(r?.qtyFinal), waste: n(r?.wastePct) };
    };
    const rows = [
      { key: 'bottomPlate', label: 'Bottom plate' }, { key: 'topPlate', label: 'Top plate' }, { key: 'studs', label: 'Studs' },
      { key: 'blocking', label: 'Blocking' }, { key: 'fireBlocking', label: 'Fireblocking' }, { key: 'sheathing', label: 'Sheathing (4×8)' },
    ].filter((r) => r.key !== 'sheathing' || g.parts.some((p) => p.frame.sheets.length))
      .filter((r) => r.key !== 'blocking' || all('blocking').length)
      .filter((r) => r.key !== 'fireBlocking' || all('fireBlocking').length)
      .map((r) => {
        const e = est(r.key);
        // a cut longer than the stock needs a longer piece of its own: count it too
        const needed = used[r.key].pieces + used[r.key].tooLong;
        const leftover = Math.ceil(e.final) - needed;
        const row = {
          ...r, est: e, needed, tooLong: used[r.key].tooLong, leftover, leftoverPct: needed ? (leftover / needed) * 100 : 0,
          stockIn: stockIn[r.key] || 0, longestIn: stockIn[r.key] ? longest(r.key) : 0,
          spliced: /Plate$/.test(r.key) ? all(r.key).filter((c) => c > stockIn[r.key] + 0.01).length : 0,
        };
        return { ...row, status: sec ? STATUS_OF(row) : 'no-section' };
      });
    const counts = g.parts.reduce((acc, p) => {
      for (const [k2, v] of Object.entries(p.frame.counts)) acc[k2] = (acc[k2] || 0) + v;
      return acc;
    }, {});
    out.push({
      key: g.key, label: g.label, sectionName: sec?.name || null, linked: Boolean(sec),
      lengthFt: g.lengthIn / 12, walls: g.parts.length, rows, counts,
      openings: { studs: used.openStuds.pieces, cripples: used.cripples.pieces, headerLF: all('headers').reduce((a, b) => a + b, 0) / 12 },
    });
  }
  return out.sort((a, b) => groupRank(a.key) - groupRank(b.key) || b.lengthFt - a.lengthFt);
}
