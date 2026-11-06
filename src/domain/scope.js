// src/domain/scope.js
// What the project's price covers (set in Summary): wall panels (structural:
// exterior, bearing and shear walls; partitions: partition and knee walls),
// loose material, trusses, labor. The estimate seen through the scope leaves
// out the rest, so Summary, Labor, the Takeoff list and the Quote all agree.

export const SCOPE_PARTS = [
  { key: 'structural', label: 'Structural walls', hint: 'Exterior, bearing and shear walls', group: 'wallPanels' },
  { key: 'partitions', label: 'Partitions', hint: 'Partition and knee walls', group: 'wallPanels' },
  { key: 'loose', label: 'Loose material' },
  { key: 'trusses', label: 'Trusses' },
  { key: 'labor', label: 'Labor' },
];
const STRUCTURAL = new Set(['exterior', 'bearing', 'shear']);

/** The project's scope: every part in unless unticked. */
export function scopeOf(est = {}) {
  const s = est.scope || {};
  return Object.fromEntries(SCOPE_PARTS.map((p) => [p.key, s[p.key] !== false]));
}
export const inScope = (est, key) => scopeOf(est)[key];
const wallKind = (sec, variant) => (variant === 'exterior' ? 'exterior' : sec?.kind || 'partition');
/** Whether a wall section is in the scope. */
export const sectionInScope = (sc, sec, variant) => (STRUCTURAL.has(wallKind(sec, variant)) ? sc.structural : sc.partitions);

const cache = new WeakMap();
/** The estimate with what is out of scope taken out (the same object when all is in). */
export function scoped(est = {}) {
  if (!est || typeof est !== 'object') return est;
  if (cache.has(est)) return cache.get(est);
  const sc = scopeOf(est);
  let out = est;
  if (!Object.values(sc).every(Boolean)) {
    out = {
      ...est,
      levels: (est.levels || []).map((l) => (!l ? l : {
        ...l,
        exteriorSections: (l.exteriorSections || []).filter((s) => sectionInScope(sc, s, 'exterior')),
        interiorSections: (l.interiorSections || []).filter((s) => sectionInScope(sc, s, 'interior')),
      })),
      looseList: sc.loose ? est.looseList : (est.looseList || []).map((s) => (s ? { ...s, isHidden: true } : s)),
      trusses: sc.trusses ? est.trusses : [],
      trussEstimate: sc.trusses ? est.trussEstimate : { ...(est.trussEstimate || {}), use: 'off' },
    };
  }
  cache.set(est, out);
  return out;
}
