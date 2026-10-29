// src/domain/lib/fastening.js
// Nail counts for wall panels, from IRC Table R602.3(1) (fastening schedule)
// and the nailing schedule printed on the plans (edge / field spacing).
// Every rule is a plain function so it can be checked against the table.

const n = (v) => Number(v) || 0;

/* IRC R602.3(1) — wall framing */
export const IRC = {
  plateToStud: 2,            // 2-16d end nails, each plate, each stud
  doubleStudOcIn: 24,        // 10d face nail @ 24" o.c.
  headerOcIn: 16,            // built-up header: 16d @ 16" o.c. along each edge
  headerEdges: 2,
  topPlateOcIn: 24,          // top plate to top plate: 10d @ 24" o.c.
  topPlateSplice: 16,        // double top plate splice: 8-16d each side of end joint
  bottomPlateOcIn: 16,       // bottom plate to floor: 16d @ 16" o.c.
  bottomPlateBraced: 3,      //   at braced wall panels: 3-16d @ 16" o.c.
  sheathEdgeIn: 6,           // wood structural panel sheathing: edges 6" o.c.
  sheathFieldIn: 12,         //   intermediate supports 12" o.c.
};

/* Not in the IRC table (shop practice): 2 nails each end of a block */
export const BLOCK_NAILS = 4;

const SHEET_W = 48;
const SHEET_H = 96;

/**
 * Nails for one 4×8 sheet installed vertically over studs.
 * Edges get edge spacing; studs under the middle of the sheet get field spacing.
 */
export function nailsPerSheet({ edgeIn = IRC.sheathEdgeIn, fieldIn = IRC.sheathFieldIn, studSpacingIn = 16 } = {}) {
  const e = Math.max(1, n(edgeIn) || IRC.sheathEdgeIn);
  const f = Math.max(1, n(fieldIn) || IRC.sheathFieldIn);
  const s = Math.max(1, n(studSpacingIn) || 16);
  const edge = 2 * (Math.floor(SHEET_H / e) + 1) + 2 * (Math.floor(SHEET_W / e) + 1);
  const middleStuds = Math.max(0, Math.round(SHEET_W / s) - 1);
  const field = middleStuds * (Math.floor(SHEET_H / f) + 1);
  return edge + field;
}

/** Nails along a run: one every `ocIn` inches, both ends included. */
export const alongRun = (lengthLF, ocIn) => (n(lengthLF) > 0 ? Math.floor((n(lengthLF) * 12) / Math.max(1, n(ocIn))) + 1 : 0);

/** Face nails between doubled studs over the wall height. */
export const nailsPerDoubledStud = (heightFt) => alongRun(heightFt, IRC.doubleStudOcIn);

/**
 * Nails / pins / anchors per box, read from the size label:
 *   "8D-2-3/8x.113-2.7M" → 2700, "3"-100s" → 100, "5/8"-250s" → 250.
 */
export function perBoxFromSize(sizeLabel, fallback) {
  const s = String(sizeLabel || '');
  const m = s.match(/(\d+(?:\.\d+)?)\s*M\b/i);
  if (m) return Math.round(Number(m[1]) * 1000);
  const c = s.match(/(\d+)\s*(?:s|ct|pcs|count)\b/i);
  if (c) return Number(c[1]);
  return fallback;
}

/** Roll length in feet from a size label like 5-1/2"x50'. */
export function rollLengthFromSize(sizeLabel, fallback = 50) {
  const m = String(sizeLabel || '').match(/x\s*(\d+(?:\.\d+)?)\s*'/i);
  return m ? Number(m[1]) : fallback;
}
