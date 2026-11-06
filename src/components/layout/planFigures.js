// src/components/layout/planFigures.js
// Isometric drawings of a level's plan walls (Anatomy iso kit), from the model
// in domain/plans/framing.js:
// - buildingFigure: every wall as a solid at its height, openings cut out,
//   coloured by type; each piece carries data-pick="<wall id>".
// - wallFrameFigure: one wall (both walls of a double wall) with its panels,
//   plates, studs, blocking, opening framing and sheathing.
// World units are inches.

import * as k from '@/lib/anatomy/iso-kit.mjs';
import { partPoint } from '@/domain/plans/framing';
import { feet } from '@/domain/lib/units';

export const BV_W = 900;
export const BV_H = 560;
const CHUNK = 72; // building view: walls are drawn in pieces ≤ 6 ft so they overlap correctly

/** Projection that keeps the drawing the same size while it turns. */
function turningProjection(cx, cy, w, d, h, width, height, azimuth, pad = 20) {
  const R = Math.hypot(w + 60, d + 60) / 2;
  const ring = [];
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    ring.push([cx + R * Math.cos(a), cy + R * Math.sin(a), -10], [cx + R * Math.cos(a), cy + R * Math.sin(a), h + 6]);
  }
  return k.fitProjection(ring, width, height, { pad, azimuth });
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/* ───────────────────────── building ───────────────────────── */

export function buildingFigure(model, { azimuth = 45 } = {}) {
  const P = turningProjection(model.width / 2, model.depth / 2, model.width, model.depth, model.maxHeight, BV_W, BV_H, azimuth);
  const out = [];
  // floor
  const pad = { x: -36, y: -36, w: model.width + 72, d: model.depth + 72, r: 0 };
  out.push(`<path class="iso-halo" d="${k.haloOf(pad, -8, 8, P)}"/>`);
  out.push(k.solidSvg(k.slabOf(pad, -8, 8, P, 1), { tone: 'lo' }));
  out.push(k.lineSvg(k.planOutline(k.insetPlan(pad, 10), 0, P, 1), { tone: 'faint' }));

  const items = [];
  for (const part of model.parts) {
    const { frame } = part;
    const L = part.lengthIn, H = part.heightIn, h2 = part.depth / 2;
    // break points: openings and ≤ 6 ft chunks
    const cuts = new Set([0, L]);
    for (const o of frame.openings) { cuts.add(Math.max(0, o.a0)); cuts.add(Math.min(L, o.a1)); }
    const sorted = [...cuts].sort((a, b) => a - b);
    const xs = [];
    for (let i = 0; i + 1 < sorted.length; i += 1) {
      const a = sorted[i], b = sorted[i + 1];
      const nChunks = Math.max(1, Math.ceil((b - a) / CHUNK));
      for (let j = 0; j < nChunks; j += 1) xs.push([a + ((b - a) * j) / nChunks, a + ((b - a) * (j + 1)) / nChunks]);
    }
    for (const [a0, a1] of xs) {
      if (a1 - a0 < 0.05) continue;
      const o = frame.openings.find((op) => a0 >= op.a0 - 0.01 && a1 <= op.a1 + 0.01);
      const spans = o ? [[0, o.z0], [o.z1, H]] : [[0, H]];
      const ring = [partPoint(part, a0, -h2), partPoint(part, a1, -h2), partPoint(part, a1, h2), partPoint(part, a0, h2)].map(([x, y]) => [x, y]);
      for (const [z0, z1] of spans) {
        if (z1 - z0 < 0.5) continue;
        const c = partPoint(part, (a0 + a1) / 2, 0, (z0 + z1) / 2);
        items.push({ depth: k.depthOf(c, P), svg: `<g class="bv-p bv-k-${part.kind}" data-pick="${esc(part.wallId)}" data-part="${esc(part.id)}">${k.solidSvg(k.extrude(ring, z0, z1 - z0, P, { convex: true }), { tone: 'mid', crease: 'faint' })}</g>` });
      }
      // glass / door leaf outline in the opening, on the wall centre plane
      if (o) {
        const q = [partPoint(part, a0, 0, o.z0), partPoint(part, a1, 0, o.z0), partPoint(part, a1, 0, o.z1), partPoint(part, a0, 0, o.z1)].map((p) => k.iso(p, P));
        const c = partPoint(part, (a0 + a1) / 2, 0, (o.z0 + o.z1) / 2);
        items.push({ depth: k.depthOf(c, P) - 0.01, svg: `<path class="bv-glass bv-${o.type}" d="${k.pathOf(q, true)}"/>` });
      }
    }
  }
  items.sort((a, b) => a.depth - b.depth);
  out.push(...items.map((i) => i.svg));
  const svg = k.figureSvg({ width: BV_W, height: BV_H, label: `Walls of the level, ${model.parts.length} framed walls`, body: out.join(''), className: 'bv-svg' });
  return { svg };
}

/* ───────────────────────── one wall, framed ───────────────────────── */

const MEMBER_LABEL = { plate: 'Plate', stud: 'Stud', king: 'King stud', jack: 'Jack stud', header: 'Header', cripple: 'Cripple', sill: 'Sill', block: 'Blocking', fire: 'Fireblocking', post: 'Post', loose: 'Loose top plate', backer: 'Corner / T stud' };
const MEMBER_TONE = { plate: 'mid', stud: 'mid', king: 'mid', jack: 'mid', header: 'mid', cripple: 'mid', sill: 'mid', block: 'lo', fire: 'mid', post: 'hi', loose: 'hi', backer: 'mid' };

/**
 * parts: the model parts of one plan wall (2 for a double wall).
 * options.sheets: 'auto' (only when the sheathed face is turned away), 'on', 'off'.
 */
export function wallFrameFigure(parts, { azimuth = 75, sheets = 'auto', width = BV_W, height = 460 } = {}) {
  if (!parts?.length) return { svg: '' };
  const base = parts[0];
  // local frame of the wall: x along it, y across (offset of each part), z up
  const offs = parts.map((p) => (p.origin[0] - base.origin[0]) * base.nrm[0] + (p.origin[1] - base.origin[1]) * base.nrm[1]);
  const yMin = Math.min(...parts.map((p, i) => offs[i] - p.depth / 2)) - 1;
  const yMax = Math.max(...parts.map((p, i) => offs[i] + p.depth / 2)) + 1;
  const L = Math.max(...parts.map((p) => p.lengthIn));
  const H = Math.max(...parts.map((p) => p.heightIn)) + 6;
  const P = turningProjection(L / 2, (yMin + yMax) / 2, L, Math.max(48, yMax - yMin), H, width, height, azimuth, 16);
  const view = k.towardViewer(P);
  const out = [];
  const box = (a0, a1, y0, y1) => ({ x: a0, y: y0, w: a1 - a0, d: y1 - y0, r: 0 });

  // floor strip with a foot ruler
  const pad = box(-18, L + 18, yMin - 30, yMax + 18);
  out.push(k.solidSvg(k.slabOf(pad, -4, 4, P, 1), { tone: 'lo' }));
  const ruler = { x: 0, y: yMin - 22, w: L, d: 10, r: 0 };
  out.push(k.solidSvg(k.slabOf(ruler, 0, 0.6, P, 1), { tone: 'lo', crease: 'none' }));
  const ticks = k.topTicks(0, L, 12, 4, ruler.y + 0.8, 0.6, [3, 6], P);
  out.push(k.lineSvg(ticks.minor, { tone: 'lo' }), k.lineSvg(ticks.major, { tone: 'mid' }));

  const items = [];
  parts.forEach((part, i) => {
    const y0 = offs[i] - part.depth / 2, y1 = offs[i] + part.depth / 2;
    const f = part.frame;
    const panelOf = (a) => f.panels.findIndex((p) => a >= p.start - 0.01 && a < p.start + p.length - 0.01) + 1;
    for (const m of f.members) {
      const b = box(m.a0, m.a1, y0 + m.c0, y0 + m.c1);
      const c = [(m.a0 + m.a1) / 2, (b.y + b.y + b.d) / 2, (m.z0 + m.z1) / 2];
      const len = m.t === 'stud' || m.t === 'king' || m.t === 'jack' || m.t === 'post' || m.t === 'backer' || (m.t === 'cripple' && m.z1 - m.z0 > m.a1 - m.a0) ? m.z1 - m.z0 : m.a1 - m.a0;
      const info = `${part.label}${parts.length > 1 ? ` (wall ${i + 1})` : ''} · panel ${panelOf((m.a0 + m.a1) / 2) || '–'} · ${MEMBER_LABEL[m.t]} ${feet(len)}`;
      const open = ['king', 'jack', 'header', 'cripple', 'sill'].includes(m.t);
      items.push({
        depth: k.depthOf(c, P),
        svg: `<g class="wf-m wf-${m.t}${open ? ' wf-open' : ''}" data-pick="${esc(`${part.id}|${panelOf((m.a0 + m.a1) / 2)}`)}" data-info="${esc(info)}">${k.solidSvg(k.slabOf(b, m.z0, m.z1 - m.z0, P, 1), { tone: MEMBER_TONE[m.t], crease: 'lo', lit: m.t === 'loose' })}</g>`,
      });
    }
    // sheathing on its face
    if (f.sheets.length && sheets !== 'off') {
      const face = part.sheathFace > 0 ? 1 : -1;
      // the sheathed face turned away from the viewer: sheets show behind the framing
      const awayFromViewer = face * view[1] < 0;
      if (sheets === 'on' || awayFromViewer) {
        const ys = face > 0 ? [y1, y1 + 0.5] : [y0 - 0.5, y0];
        for (const sh of f.sheets) {
          const label = `${feet(sh.a1 - sh.a0)}×${feet(sh.z1 - sh.z0)}`;
          for (const pc of sh.pieces || [sh]) {
            const b = box(pc.a0, pc.a1, ys[0], ys[1]);
            const c = [(pc.a0 + pc.a1) / 2, ys[0], (pc.z0 + pc.z1) / 2];
            items.push({
              depth: k.depthOf(c, P) + (awayFromViewer ? -0.001 : 0.001),
              svg: `<g class="wf-m wf-sheet" data-pick="${esc(`${part.id}|sheet`)}" data-info="${esc(`${part.label} · sheet ${label}`)}">${k.solidSvg(k.slabOf(b, pc.z0, pc.z1 - pc.z0, P, 1), { tone: 'mid', crease: 'lo' })}</g>`,
            });
          }
        }
      }
    }
  });
  items.sort((a, b) => a.depth - b.depth);
  out.push(...items.map((x) => x.svg));
  // panel numbers on the floor, in front of the wall
  for (const [i, p] of base.frame.panels.entries()) {
    const at = k.iso([p.start + p.length / 2, yMin - 10, 0.7], P);
    out.push(`<text class="iso-face-text wf-panel-no" x="${at[0].toFixed(1)}" y="${at[1].toFixed(1)}" font-size="8" text-anchor="middle">P${i + 1}</text>`);
  }
  const svg = k.figureSvg({ width, height, label: `Framing of ${base.label}, ${feet(L)} long`, body: out.join(''), className: 'wf-svg' });
  return { svg };
}
