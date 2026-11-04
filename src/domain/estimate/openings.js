// src/domain/estimate/openings.js
// Window and door openings, listed on the Header row that frames them
// (Wall panels → section → Extras → Header). The panel shop builds every
// opening into its panel, so the header, its kings and jacks belong to the panel.
//
// A Header row's material comes from its Family · Size · Vendor picker. Each
// opening on it gives a plan name (Window A1, Door 1.1…), quantity, width,
// height, sill height (windows only) and kings / jacks per side.
//   header length = opening width + 1-1/2" per jack on each side
//   header material = header length × plies × quantity
// Lumber headers are cut from the picked piece length; LVL is bought by LF.

import { cutLinear } from '../lib/cutting';

const n = (v) => Number(v) || 0;
export const STUD_T = 1.5;

/** Stud depth from a size label: 2x6 → 5.5", 2x4 → 3.5", 2x8 → 7.25". */
export function studDepthIn(sizeLabel = '') {
  const m = String(sizeLabel).match(/2\s*[x×]\s*(\d+)/i);
  const nominal = m ? Number(m[1]) : 6;
  return { 3: 2.5, 4: 3.5, 6: 5.5, 8: 7.25, 10: 9.25, 12: 11.25 }[nominal] ?? 5.5;
}

/** Built-up header plies: triple in 2×6 walls, double in 2×4 walls. */
export const defaultPlies = (depthIn = 5.5) => (n(depthIn) >= 5.5 ? 3 : 2);

export const newOpening = (type = 'window') => ({
  id: `op${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
  type,
  name: '',
  qty: 1,
  widthIn: 36,
  heightIn: type === 'door' ? 82 : 48,
  ...(type === 'door' ? {} : { sillIn: 36 }),
  kings: 1,
  jacks: 1,
});

/**
 * Quantities for the openings of one Header row.
 * opts: plies, lvl (bought by LF), boardLenIn (piece length for lumber headers)
 */
export function headerOpenings(openings = [], { plies = 3, lvl = false, boardLenIn = 0 } = {}) {
  const list = (openings || []).filter((o) => o && n(o.qty) > 0 && n(o.widthIn) > 0);
  const p = Math.max(1, Math.round(n(plies) || 1));
  const cuts = [];
  let headerLenLF = 0;
  let kings = 0;
  let jacks = 0;
  let windows = 0;
  let doors = 0;
  const perOpening = list.map((o) => {
    const q = Math.round(n(o.qty));
    const k = Math.max(0, Math.round(n(o.kings ?? 1)));
    const j = Math.max(0, Math.round(n(o.jacks ?? 1)));
    const headerIn = n(o.widthIn) + 2 * j * STUD_T;
    headerLenLF += (headerIn * q) / 12;
    for (let i = 0; i < q * p; i += 1) cuts.push(headerIn);
    kings += 2 * k * q;
    jacks += 2 * j * q;
    if (o.type === 'door') doors += q; else windows += q;
    return { id: o.id, headerIn, qty: q };
  });
  const lumber = !lvl && boardLenIn > 0 ? cutLinear(cuts, boardLenIn) : { pieces: 0, tooLong: 0 };
  return {
    count: list.length,
    plies: p,
    perOpening,
    headerLenLF,                     // header length (one ply), for nailing
    headerLF: headerLenLF * p,       // material LF (all plies)
    pieces: lumber.pieces,
    tooLong: lumber.tooLong,
    kings,
    jacks,
    kingsJacks: kings + jacks,
    windows,
    doors,
  };
}
