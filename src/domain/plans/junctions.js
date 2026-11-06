// src/domain/plans/junctions.js
// Where the walls of a plan meet, and the studs that adds. A corner (L: two
// walls end at one point) and a T (a wall ends against the side of another)
// each need studs beyond the stud layout: the corner posts and the backing the
// drywall and the butting wall are nailed to. The through wall gets them:
// at a T the continuous wall, at a corner the more loaded wall (exterior over
// interior), else the longer one. Pure geometry over the plan's centre lines.

/** Extra studs per junction (California corner / ladder-less T: 2 each). */
export const JUNCTION_DEFAULTS = { corner: 2, tee: 2 };

const len = (w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1);

/**
 * Corners and T junctions of a plan.
 * @param {Array} walls plan walls (x1,y1,x2,y2 in sheet pt; t = drawn thickness, in)
 * @param {number} k sheet pt per ft
 * @param {(w:object)=>number} rank lower = gets the corner studs (more loaded wall)
 * @returns {Array<{type:'corner'|'tee', x:number, y:number, wallId:string, otherId:string}>}
 */
export function findJunctions(walls, k, rank = () => 0) {
  const list = (walls || []).filter((w) => len(w) > 0);
  const out = [];
  const seen = new Set();
  for (const a of list) {
    for (const [ex, ey] of [[a.x1, a.y1], [a.x2, a.y2]]) {
      for (const b of list) {
        if (b === a) continue;
        const L = len(b), la = len(a);
        const ux = (b.x2 - b.x1) / L, uy = (b.y2 - b.y1) / L;
        // nearly parallel walls meeting end to end are one run, not a junction
        if (Math.abs(((a.x2 - a.x1) / la) * -uy + ((a.y2 - a.y1) / la) * ux) < 0.5) continue;
        const tol = ((Number(a.t) || 5) / 2 + (Number(b.t) || 5) / 2 + 3) / 12 * k;
        const u = (ex - b.x1) * ux + (ey - b.y1) * uy;
        const off = Math.abs((ex - b.x1) * -uy + (ey - b.y1) * ux);
        if (off > tol || u < -tol || u > L + tol) continue;
        if (u <= tol || u >= L - tol) {
          // both end here: a corner, once per pair
          const key = [a.id, b.id].sort().join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          const ra = rank(a), rb = rank(b);
          const thru = ra < rb || (ra === rb && la >= L) ? a : b;
          out.push({ type: 'corner', x: ex, y: ey, wallId: thru.id, otherId: thru === a ? b.id : a.id });
        } else {
          out.push({ type: 'tee', x: b.x1 + ux * u, y: b.y1 + uy * u, wallId: b.id, otherId: a.id });
        }
      }
    }
  }
  // three or more walls at one point (a wall ending where a run goes on): one T
  const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) <= (6 / 12) * k;
  const merged = [];
  for (const j of out) {
    const same = merged.find((m) => near(m, j) && (m.type === 'corner' || j.type === 'corner'));
    if (!same) { merged.push({ ...j }); continue; }
    same.type = 'tee';
  }
  return merged;
}

/** Extra studs of each wall from its junctions. */
export function junctionStudsByWall(junctions, studs = JUNCTION_DEFAULTS) {
  const m = new Map();
  for (const j of junctions || []) {
    const c = Number(studs?.[j.type] ?? JUNCTION_DEFAULTS[j.type]) || 0;
    if (c) m.set(j.wallId, (m.get(j.wallId) || 0) + c);
  }
  return m;
}
