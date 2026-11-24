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

/* ── How the walls are built ───────────────────────────────────────────────
   Each wall group (structural: exterior, bearing, shear; partitions:
   partition and knee) is built as wall panels in the shop or stick framed on
   site. The material is the same; what changes is what the project pays for
   around it: panels have manufacture, panel delivery and labor per panel set;
   stick framing has none of that and labor per foot of wall framed in place. */

export const BUILD_METHODS = [
  { key: 'panels', label: 'Wall panels', hint: 'Built in the shop, delivered and set' },
  { key: 'stick', label: 'Stick framing', hint: 'Framed on site, piece by piece' },
];
export const BUILD_GROUPS = [
  { key: 'structural', label: 'Structural walls', hint: 'Exterior, bearing and shear walls' },
  { key: 'partitions', label: 'Partitions', hint: 'Partition and knee walls' },
];

/** The project's build method per wall group: wall panels unless set to stick framing. */
export function buildMethodOf(est = {}) {
  const b = est?.buildMethod || {};
  return { structural: b.structural === 'stick' ? 'stick' : 'panels', partitions: b.partitions === 'stick' ? 'stick' : 'panels' };
}
/** The wall group a wall kind belongs to ('exterior' and the interior kinds). */
export const groupOfKind = (kind) => (STRUCTURAL.has(kind) ? 'structural' : 'partitions');
/** Whether walls of this kind are stick framed in the project. */
export const isStick = (est, kind) => buildMethodOf(est)[groupOfKind(kind)] === 'stick';
/** Whether any wall of the project is built as panels. */
export const anyPanels = (est) => Object.values(buildMethodOf(est)).includes('panels');
/** Panel length that means "no panel joints": a stick-framed wall is one run. */
export const STICK_RUN_FT = 1000;

