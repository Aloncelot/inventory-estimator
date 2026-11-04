// src/components/layout/wallsFigure.js
// Isometric drawing of one level's exterior wall panels (Anatomy iso kit),
// built from the same layout model that checks the material (domain/estimate/layout.js):
// slab with a foot ruler, loose PT plate, panels (bottom plate, studs, blocking,
// top plate), sheathing and the loose top plate with its joints.
// World units are inches; x along the front wall, y along the side walls, z up.

import * as k from '@/lib/anatomy/iso-kit.mjs';

const PLATE = 1.5;
const STUD = 1.5;
const SHEATH = 0.5;      // 7/16"–1/2" sheet
export const FIG_W = 720;
export const FIG_H = 460;

/** A member of a wall as a floor box, from positions along the wall and across it. */
function boxOf(wall, L, W, t, a0, a1, c0 = 0, c1 = t) {
  switch (wall.id) {
    case 'A': return { x: a0, y: c0, w: a1 - a0, d: c1 - c0 };                            // front, along +x
    case 'B': return { x: L - c1, y: t + a0, w: c1 - c0, d: a1 - a0 };                    // right, along +y
    case 'C': return { x: L - a1, y: W - c1, w: a1 - a0, d: c1 - c0 };                    // back, along −x
    default: return { x: c0, y: W - t - a1, w: c1 - c0, d: a1 - a0 };                     // left, along −y
  }
}

/** A point on a wall: `a` along it, `c` across it (0 = outer face, t = inner face). */
function pointOf(wall, L, W, t, a, c) {
  switch (wall.id) {
    case 'A': return [a, c];
    case 'B': return [L - c, t + a];
    case 'C': return [L - a, W - c];
    default: return [c, W - t - a];
  }
}

import { feet } from '@/domain/lib/units';
export { feet };

/**
 * Returns svg (string) and panels (id, wall, index, length, studs).
 * options.sheathNear: draw the near walls with their sheathing on.
 * options.azimuth: camera angle around the building, degrees (45 = default view).
 */
export function wallsFigure(check, { sheathNear = false, azimuth = 45 } = {}) {
  const L = check.lengthFt * 12;
  const W = check.widthFt * 12;
  const t = check.depth;
  const H = check.heightFt * 12;
  const studTop = PLATE + check.studLenIn;
  const topZ = studTop + PLATE;                 // top of the panel top plate
  // fit a circle around the building, so the size stays the same while it turns
  const R = Math.hypot(L + 60, W + 60) / 2;
  const ring = [];
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    const x = L / 2 + R * Math.cos(a);
    const y = W / 2 + R * Math.sin(a);
    ring.push([x, y, -10], [x, y, H + 6]);
  }
  const P = k.fitProjection(ring, FIG_W, FIG_H, { pad: 20, azimuth });
  const at = (p) => k.iso(p, P);
  const S = (paths, style) => k.solidSvg(paths, style);
  const Ln = (d, style) => k.lineSvg(d, style);
  const slab = (b, z, h, style) => S(k.slabOf({ ...b, r: 0 }, z, h, P, 1), style);
  const depthOfBox = (b, z) => k.depthOf([b.x + b.w / 2, b.y + b.d / 2, z], P);
  // text laid flat on a wall face, reading left to right on screen whichever way the wall runs
  const faceMatrix = (wall, a, c, z) => {
    const [x, y] = pointOf(wall, L, W, t, a, c);
    const [x2, y2] = pointOf(wall, L, W, t, a + 1, c);
    const o = k.iso([x, y, z], P);
    const u = k.iso([x2, y2, z], P);
    let du = [u[0] - o[0], u[1] - o[1]];
    if (du[0] < 0) du = [-du[0], -du[1]];
    const up = k.iso([x, y, z + 1], P);
    const dv = [o[0] - up[0], o[1] - up[1]];
    const f = (v) => v.toFixed(3);
    return `matrix(${f(du[0])} ${f(du[1])} ${f(dv[0])} ${f(dv[1])} ${o[0].toFixed(1)} ${o[1].toFixed(1)})`;
  };

  const view = k.towardViewer(P);
  // a wall is "near" when its outer face points toward the viewer
  const outward = { A: [0, -1], B: [1, 0], C: [0, 1], D: [-1, 0] };
  const isNear = (id) => outward[id][0] * view[0] + outward[id][1] * view[1] > 0;

  const out = [];
  /* ── base: concrete slab with a foot ruler along the front edge ── */
  const pad = { x: -24, y: -24, w: L + 48, d: W + 48 };
  out.push(`<path class="iso-halo" d="${k.haloOf({ ...pad, r: 0 }, -10, 10, P)}"/>`);
  out.push(slab(pad, -10, 10, { tone: 'lo' }));
  out.push(Ln(k.planOutline({ ...k.insetPlan({ ...pad, r: 0 }, 8) }, 0, P, 1), { tone: 'faint' }));
  const ruler = { x: 0, y: -18, w: L, d: 10, r: 0 };
  out.push(S(k.slabOf(ruler, 0, 0.6, P, 1), { tone: 'lo', crease: 'none' }));
  const ticks = k.topTicks(0, L, 12, 4, ruler.y + 0.8, 0.6, [3, 6], P);
  out.push(Ln(ticks.minor, { tone: 'lo' }), Ln(ticks.major, { tone: 'mid' }));
  out.push(k.dotsSvg(k.corners({ ...pad }, 10).map(([x, y]) => at([x, y, 0])), { size: 0.9, tone: 'lo' }));
  // saw-cut control joints in the slab, about every 10 ft, edge to edge inside the walls
  const joints = [];
  for (let x = 120; x < L - 12; x += 120) joints.push(k.lineOnTop([x, t], [x, W - t], 0, P));
  for (let y = 120; y < W - 12; y += 120) joints.push(k.lineOnTop([t, y], [L - t, y], 0, P));
  out.push(Ln(joints.join(''), { tone: 'faint' }));

  /* ── walls, far first ── */
  const order = [...check.walls].sort((a, b) => {
    const ca = boxOf(a, L, W, t, 0, a.length);
    const cb = boxOf(b, L, W, t, 0, b.length);
    return depthOfBox(ca, 0) - depthOfBox(cb, 0);
  });
  const panels = [];
  const mult = check.mult;

  for (const wall of order) {
    if (!(wall.length > 0)) continue;
    const near = isNear(wall.id);
    const sheathParts = [];
    // 4×8 sheets on the outer face, one slab each so every sheet and seam shows,
    // labelled with its size on the near walls (the far ones are seen from inside)
    if (!near || sheathNear) {
      const sheets = (wall.sheets || wall.panels.flatMap((p) => p.sheets || []))
        .map((sh) => ({ sh, b: boxOf(wall, L, W, t, sh.a0, sh.a1, -SHEATH, 0) }))
        .sort((x, y) => depthOfBox(x.b, 0) - depthOfBox(y.b, 0) || x.sh.z0 - y.sh.z0);
      for (const { sh, b } of sheets) {
        sheathParts.push(S(k.slabOf({ ...b, r: 0 }, sh.z0, sh.z1 - sh.z0, P, 1), { tone: 'mid', crease: 'lo' }));
        if (near && sh.a1 - sh.a0 >= 18 && sh.z1 - sh.z0 >= 10) {
          const size = Math.min(7, (sh.z1 - sh.z0) / 3.2, (sh.a1 - sh.a0) / 5);
          const label = `${feet(sh.a1 - sh.a0)}×${feet(sh.z1 - sh.z0)}`;
          sheathParts.push(k.faceTextSvg(faceMatrix(wall, (sh.a0 + sh.a1) / 2, -SHEATH - 0.05, (sh.z0 + sh.z1) / 2 - size / 3), label, { size: size.toFixed(1), tone: 'mid', anchor: 'middle' }));
        }
      }
    }
    if (!near) out.push(...sheathParts);

    // the panels, back to front
    const panelOrder = wall.panels
      .map((p, index) => ({ p, index, d: depthOfBox(boxOf(wall, L, W, t, p.start, p.start + p.length), 0) }))
      .sort((a, b) => a.d - b.d);
    for (const { p, index } of panelOrder) {
      const id = `${wall.id}${index + 1}`;
      panels.push({ id, wall: wall.label, index: index + 1, length: p.length, studs: p.studs.length * mult });
      const g = [];
      const a = (x) => p.start + x;
      g.push(slab(boxOf(wall, L, W, t, a(0), a(p.length)), 0, PLATE, { tone: 'mid' }));
      // studs and blocking, back to front
      const members = [];
      p.studs.forEach((x, i) => {
        for (let m = 0; m < mult; m += 1) {
          const s0x = Math.min(x + m * STUD, p.length - STUD);
          members.push({ b: boxOf(wall, L, W, t, a(s0x), a(s0x + STUD)), z: PLATE, h: check.studLenIn, tone: 'mid' });
        }
        const next = p.studs[i + 1];
        if (next !== undefined) {
          for (let r = 1; r <= check.blockRows; r += 1) {
            const z = PLATE + (check.studLenIn * r) / (check.blockRows + 1) - 0.75 + (i % 2 ? 1.5 : -1.5);
            members.push({ b: boxOf(wall, L, W, t, a(x + STUD * mult), a(next)), z, h: PLATE, tone: 'lo' });
          }
        }
      });
      members.sort((m1, m2) => depthOfBox(m1.b, m1.z) - depthOfBox(m2.b, m2.z));
      for (const m of members) g.push(slab(m.b, m.z, m.h, { tone: m.tone }));
      g.push(slab(boxOf(wall, L, W, t, a(0), a(p.length)), studTop, PLATE, { tone: 'mid' }));
      out.push(`<g class="lc-panel" data-panel="${id}" tabindex="-1">${g.join('')}</g>`);
    }
    // loose top plate: laps the panel joints and runs on over the butting walls
    const r0 = wall.through ? t : -t;
    const run = wall.through ? wall.length - 2 * t : wall.length + 2 * t;
    const joints = wall.looseJoints || [];
    let from = 0;
    for (const j of [...joints, run]) {
      const b = boxOf(wall, L, W, t, r0 + from, r0 + j);
      out.push(slab(b, topZ, PLATE, { tone: 'hi', lit: false, crease: 'lo' }));
      from = j;
    }
    if (near) out.push(...sheathParts);
  }

  const svg = k.figureSvg({
    width: FIG_W,
    height: FIG_H,
    label: `Exterior wall panels of a ${check.lengthFt} by ${check.widthFt} ft rectangle, ${check.panelCount} panels`,
    body: out.join(''),
  });
  return { svg, panels };
}
