// src/domain/plans/beams.js
// Beams of a level (read from the structural sheet, or added by hand), grouped
// by their mark for the estimate: the material of each mark is picked by hand.

const n = (v) => Number(v) || 0;
const r2 = (v) => Math.round(v * 100) / 100;

/** Beams grouped by mark (and what they are): count, total LF, longest piece. */
export function beamGroups(beams = []) {
  const map = new Map();
  for (const b of beams) {
    const key = `${b.mark}${b.note ? ` ${b.note}` : ''}`;
    const g = map.get(key) || { key, mark: b.mark, note: b.note || '', count: 0, lengthFt: 0, longestFt: 0, unmeasured: 0 };
    g.count += 1;
    g.lengthFt += n(b.lengthFt);
    g.longestFt = Math.max(g.longestFt, n(b.lengthFt));
    if (!n(b.lengthFt)) g.unmeasured += 1;
    map.set(key, g);
  }
  const num = (k) => Number(/\d+/.exec(k)?.[0]) || 0;
  return [...map.values()].map((g) => ({ ...g, lengthFt: r2(g.lengthFt) })).sort((a, b) => num(a.mark) - num(b.mark) || a.key.localeCompare(b.key));
}

