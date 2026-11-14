// src/domain/estimate/stairs.js
// The geometry of one staircase, from what the stair plan and the section
// give: floor-to-floor height, width, the kind (straight, or with a landing:
// L or U) and the landing's size. Pure functions; Loose material turns it
// into rows (stringers, treads, risers, landing framing, rail blocking) whose
// materials the estimator picks.
//
// IRC R311.7: riser at most 7-3/4", tread at least 10", width at least 36".

const n = (v) => Number(v) || 0;
const r2 = (v) => Math.round(v * 100) / 100;

export const STAIR_TYPES = [['straight', 'Straight'], ['l', 'L with landing'], ['u', 'U with landing']];
export const STAIR_DEFAULTS = { floorToFloorIn: 0, widthIn: 36, type: 'straight', maxRiserIn: 7.75, treadIn: 10, landingLenFt: 0, landingWidthFt: 0, joistSpacingIn: 16, railSides: 1 };
export const IRC_MAX_RISER = 7.75;
export const IRC_MIN_TREAD = 10;
export const IRC_MIN_WIDTH = 36;

/** Stringers under one flight: 16" apart at most, never fewer than 3. */
export const stringersFor = (widthIn) => Math.max(3, Math.floor(n(widthIn) / 16) + 1);

export function computeStairs(raw = {}) {
  const i = { ...STAIR_DEFAULTS, ...Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== '' && v !== null && v !== undefined)) };
  const f2f = n(i.floorToFloorIn);
  const maxRiser = n(i.maxRiserIn) || IRC_MAX_RISER;
  const tread = n(i.treadIn) || IRC_MIN_TREAD;
  const width = n(i.widthIn) || 36;
  const hasLanding = i.type === 'l' || i.type === 'u';
  const warnings = [];
  if (!f2f) return { ready: false, inputs: i, hasLanding, flights: [], risers: 0, treads: 0, stringers: 0, warnings: ['Type the floor-to-floor height.'] };

  const risers = Math.ceil(f2f / maxRiser - 1e-9);
  const riserIn = f2f / risers;
  // with a landing the risers split in two flights; the landing works as one tread
  const counts = hasLanding ? [Math.ceil(risers / 2), Math.floor(risers / 2)] : [risers];
  const flights = counts.map((r) => {
    const run = Math.max(0, r - 1) * tread;          // horizontal run of the flight, in
    const rise = r * riserIn;
    const lengthFt = Math.sqrt(rise ** 2 + run ** 2) / 12 + 1;   // + the cut at top and bottom
    return { risers: r, treads: Math.max(0, r - 1), runFt: r2(run / 12), riseIn: r2(rise), stringerFt: r2(lengthFt) };
  });
  const perFlight = stringersFor(width);
  const stringers = perFlight * flights.length;
  const treads = flights.reduce((a, f) => a + f.treads, 0);
  const runFt = r2(flights.reduce((a, f) => a + f.runFt, 0));

  if (riserIn > IRC_MAX_RISER + 1e-6) warnings.push(`Risers of ${r2(riserIn)}" are over the code's 7-3/4".`);
  if (tread < IRC_MIN_TREAD) warnings.push(`Treads of ${tread}" are under the code's 10".`);
  if (width < IRC_MIN_WIDTH) warnings.push(`A width of ${width}" is under the code's 36".`);
  const longest = Math.max(...flights.map((f) => f.stringerFt));
  if (longest > 12) warnings.push(`Stringers of ${r2(longest)} ft: over 12 ft use LVL or LSL (bought by the LF), not sawn lumber.`);

  // the landing: joists across its width, a rim around the free sides, a ledger on the wall
  let landing = null;
  const L = n(i.landingLenFt); const W = n(i.landingWidthFt);
  if (hasLanding) {
    if (!L || !W) warnings.push('Type the landing size to frame it.');
    else {
      const long = Math.max(L, W); const short = Math.min(L, W);
      const joists = Math.floor((long * 12) / (n(i.joistSpacingIn) || 16)) + 1;
      landing = {
        lenFt: L, widthFt: W, joists, joistFt: r2(short), joistLF: r2(joists * short),
        rimLF: r2(long + 2 * short),          // the free long side and both ends
        ledgerLF: r2(long),                    // on the wall
        hangers: joists * 2,                   // both ends of each joist
        areaSqFt: r2(L * W),
      };
    }
  }
  // one row of blocking in the wall for the handrail, along each railed side
  const railBlockingLF = r2(runFt * Math.max(0, Math.round(n(i.railSides))));
  return {
    ready: true, inputs: i, hasLanding, risers, riserIn: r2(riserIn), tread, flights, stringers, perFlight, treads,
    runFt, landing, railBlockingLF, warnings,
  };
}

/** 7.25 → 7-1/4" (to the nearest 1/8"). */
export function inches(v) {
  const x = Math.round(n(v) * 8) / 8;
  const whole = Math.floor(x); const eighths = Math.round((x - whole) * 8);
  if (!eighths) return `${whole}"`;
  const g = eighths % 4 === 0 ? 4 : eighths % 2 === 0 ? 2 : 1;
  return `${whole ? `${whole}-` : ''}${eighths / g}/${8 / g}"`;
}
