// src/components/layout/planScene.js
// Boxes to draw in 3D (WebGL) from the plan framing model: every box knows its
// wall (pick key), what it is (info) and its colour group. Pure; the renderer
// lives in PlanScene.jsx.

import { feet } from '@/domain/lib/units';
import { displayOf, lighten } from '@/domain/plans/display';

export const KIND_COLOR = { exterior: '#d9a29b', bearing: '#e2c08c', shear: '#c0a8cc', knee: '#9bcdc1', partition: '#a7c2db' };
export const MEMBER_COLOR = {
  plate: '#d8c3a0', stud: '#e6d3b0', block: '#cdb58c', fire: '#c9573f', post: '#8d6e4c', loose: '#c4a46f',
  king: '#b9cc93', jack: '#9fbb72', header: '#d89a4e', cripple: '#9cb8cf', sill: '#7fa3c0',
  sheet: '#d2bf98',
};
export const PICKED_COLOR = '#f2c94c';
export const HOVER_COLOR = '#ffe8a3';

const MEMBER_LABEL = { plate: 'Plate', stud: 'Stud', king: 'King stud', jack: 'Jack stud', header: 'Header', cripple: 'Cripple', sill: 'Sill', block: 'Blocking', fire: 'Fireblocking', post: 'Post', loose: 'Loose top plate' };

const box = (part, a0, a1, c0, c1, z0, z1, extra) => ({
  o: part.origin, d: part.dir, n: part.nrm, a0, a1, c0, c1, z0, z1, ...extra,
});

/**
 * mode 'walls': each wall as solid pieces around its openings.
 * mode 'framing': every member (and the sheets when sheets = true).
 * only: limit to these part ids (a single wall's view).
 */
export function sceneBoxes(model, { mode = 'walls', sheets = false, only = null, display } = {}) {
  const out = [];
  if (!model) return out;
  const { colors, hidden } = displayOf(display);
  for (const part of model.parts) {
    if (only && !only.includes(part.id)) continue;
    if (!only && hidden[part.kind]) continue; // hidden types: not drawn, still counted
    const h2 = part.depth / 2;
    const L = part.lengthIn, H = part.heightIn;
    const f = part.frame;
    const desc = `${part.label} · ${feet(L)} · ${feet(H)} high · ${f.panels.length} panel${f.panels.length > 1 ? 's' : ''}${f.openings.length ? ` · ${f.openings.length} opening${f.openings.length > 1 ? 's' : ''}` : ''}`;
    if (mode === 'walls') {
      const cuts = [0, L, ...f.openings.flatMap((o) => [o.a0, o.a1])].map((x) => Math.min(L, Math.max(0, x)));
      const xs = [...new Set(cuts)].sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 1) {
        const a0 = xs[i], a1 = xs[i + 1];
        if (a1 - a0 < 0.05) continue;
        const o = f.openings.find((op) => a0 >= op.a0 - 0.01 && a1 <= op.a1 + 0.01);
        const spans = o ? [[0, o.z0], [o.z1, H]] : [[0, H]];
        for (const [z0, z1] of spans) {
          if (z1 - z0 < 0.5) continue;
          out.push(box(part, a0, a1, -h2, h2, z0, z1, { color: lighten(colors[part.kind] || KIND_COLOR[part.kind] || '#999999', 0.5), pick: part.wallId, info: desc }));
        }
        if (o && !hidden[o.type === 'door' ? 'door' : 'window']) out.push(box(part, a0, a1, -0.25, 0.25, o.z0, o.z1, { color: o.type === 'door' ? colors.door : lighten(colors.window, 0.55), glass: o.type !== 'door', pick: part.wallId, info: `${o.type === 'door' ? 'Door' : 'Window'} ${feet(o.a1 - o.a0)} × ${feet(o.z1 - o.z0)} · ${desc}` }));
      }
      continue;
    }
    const panelOf = (a) => f.panels.findIndex((p) => a >= p.start - 0.01 && a < p.start + p.length - 0.01) + 1;
    for (const m of f.members) {
      const len = ['stud', 'king', 'jack', 'post'].includes(m.t) || (m.t === 'cripple' && m.z1 - m.z0 > m.a1 - m.a0) ? m.z1 - m.z0 : m.a1 - m.a0;
      out.push(box(part, m.a0, m.a1, -h2 + m.c0, -h2 + m.c1, m.z0, m.z1, {
        color: MEMBER_COLOR[m.t], pick: `${part.wallId}`, panel: `${part.id}|${panelOf((m.a0 + m.a1) / 2)}`,
        info: `${part.label} · panel ${panelOf((m.a0 + m.a1) / 2) || '–'} · ${MEMBER_LABEL[m.t]} ${feet(len)}`,
      }));
    }
    if (sheets && f.sheets.length) {
      const face = part.sheathFace > 0 ? 1 : -1;
      const [c0, c1] = face > 0 ? [h2, h2 + 0.5] : [-h2 - 0.5, -h2];
      for (const sh of f.sheets) {
        // one sheet: its solid parts without seams, the sheet outline and the cut-outs as lines
        const info = `${part.label} · sheet ${feet(sh.a1 - sh.a0)}×${feet(sh.z1 - sh.z0)}${sh.cutouts.length ? ` · ${sh.cutouts.length} cut-out${sh.cutouts.length > 1 ? 's' : ''}` : ''}`;
        for (const pc of sh.pieces) out.push(box(part, pc.a0, pc.a1, c0, c1, pc.z0, pc.z1, { color: MEMBER_COLOR.sheet, sheet: true, noEdges: true, pick: part.wallId, info }));
        out.push(box(part, sh.a0, sh.a1, c0, c1, sh.z0, sh.z1, { edgesOnly: true }));
        for (const h of sh.cutouts) out.push(box(part, h.a0, h.a1, c0, c1, h.z0, h.z1, { edgesOnly: true }));
      }
    }
  }
  return out;
}
