// src/components/landing/stairs.js
// A U-shaped stair with a landing, framed the way a framer builds it, for the
// hero's cycle of models: two flights of 2x12 stringers (a PT 2x4 nailer at
// the foot, hangers at the top), a landing of 2x10 joists in hangers between a
// two-ply 2x10 beam and a 2x10 ledger, 4x4 posts on post bases with post caps,
// and a two-ply beam at the upper floor. Inches: x along the run, y up, z
// across the stair. Same member shape as frameWall (src/components/landing/walls.js).

const T = 1.5;
const D10 = 9.25;
const D12 = 11.25;
const POST = 3.5;

/** Frame the stair. Returns { members, length, depth, height } like frameWall. */
export function frameStair({ rise = 108, flightW = 36, gap = 4, treads = 6, tread = 10, landingD = 40 } = {}) {
  const members = [];
  const add = (m) => members.push({ z: 0, d: T, len: 0, ...m });
  const half = rise / 2;                       // the landing is halfway up
  const run = treads * tread;                  // run of one flight
  const W = 2 * flightW + gap;                 // both flights side by side
  const top = half - 0.75;                     // top of the landing joists (subfloor above)
  const bot = top - D10;
  const x0 = run; const x1 = run + landingD;   // the landing, front (beam) to back (ledger)
  const z2 = flightW + gap;                    // where the second flight starts

  // landing: two-ply beam at the front, ledger at the back, joists in hangers between
  add({ kind: 'header', label: '2x10 beam, 2 ply', x: x0, y: bot, w: 2 * T, h: D10, z: 0, d: W });
  add({ kind: 'plate', label: '2x10 ledger', x: x1 - T, y: bot, w: T, h: D10, z: 0, d: W });
  const joistAt = [];
  for (let z = 0; z < W - T; z += 16) joistAt.push(z);
  joistAt.push(W - T);
  for (const z of joistAt) {
    add({ kind: 'plate', label: '2x10 landing joist', x: x0 + 2 * T, y: bot, w: x1 - T - (x0 + 2 * T), h: D10, z, d: T });
    for (const hx of [x0 + 2 * T, x1 - T - 2]) {
      add({ kind: 'steel', label: 'Joist hanger, 2x10', x: hx, y: bot, w: 2, h: D10 - 2, z: z - 0.2, d: T + 0.4 });
    }
  }

  // posts on post bases, with post caps
  const post = (px, pz, height) => {
    add({ kind: 'steel', label: 'Post base', x: px - 0.25, y: 0, w: POST + 0.5, h: T, z: pz - 0.25, d: POST + 0.5 });
    add({ kind: 'post', label: '4x4 post', x: px, y: T, w: POST, h: height - 2 * T, z: pz, d: POST });
    add({ kind: 'steel', label: 'Post cap', x: px - 0.25, y: height - T, w: POST + 0.5, h: T, z: pz - 0.25, d: POST + 0.5 });
  };
  for (const pz of [0, W - POST]) {
    post(x0 + T - POST / 2, pz, bot);          // under the landing beam
    post(x1 - POST, pz, bot);                  // under the ledger
  }

  // the upper floor's beam, where the second flight lands, on its own posts
  const upTop = rise - 0.75; const upBot = upTop - D10;
  add({ kind: 'header', label: '2x10 beam, 2 ply', x: -2 * T, y: upBot, w: 2 * T, h: D10, z: z2, d: flightW });
  for (const pz of [z2, W - POST]) post(-T - POST / 2, pz, upBot);

  // stringers: three per flight, sloped boards under the treads
  const slope = Math.atan2(half, run);
  const len = Math.hypot(run, half) - 6;
  const drop = 3.2;                            // centre line below the nosing line
  const stringers = (zs, up) => {
    for (const z of zs) {
      const cx = run / 2 + Math.sin(slope) * drop * (up ? 1 : -1);
      const cy = (up ? half / 2 : half + half / 2) - Math.cos(slope) * drop;
      add({ kind: 'plate', label: '2x12 stringer', x: cx - len / 2, y: cy - D12 / 2, w: len, h: D12, z, d: T, rot: up ? slope : -slope });
    }
  };
  const zs1 = [0, flightW / 2 - T / 2, flightW - T];
  const zs2 = zs1.map((z) => z + z2);
  stringers(zs1, true);
  stringers(zs2, false);

  // hangers at the top of each flight: on the landing beam, on the upper beam
  for (const z of zs1) add({ kind: 'steel', label: 'Stringer hanger', x: x0 - 1.6, y: bot - 1, w: 1.6, h: 8, z: z - 0.25, d: T + 0.5 });
  for (const z of zs2) add({ kind: 'steel', label: 'Stringer hanger', x: 0, y: upBot - 1, w: 1.6, h: 8, z: z - 0.25, d: T + 0.5 });

  // the foot of the first flight bears on a pressure-treated nailer
  add({ kind: 'plate', note: 'PT', label: '2x4 nailer, pressure treated', x: 0.5, y: 0, w: 3.5, h: T, z: 0, d: flightW });

  // shift so x starts at 0 (the upper beam sits at x < 0)
  const shift = 2 * T + POST;
  for (const m of members) m.x += shift;
  return { members, length: x1 + shift, depth: W, height: rise };
}

const ORDER = ['2x12 stringer', '2x10 landing joist', 'Joist hanger, 2x10', '2x10 ledger', '2x10 beam, 2 ply', '4x4 post', 'Post base', 'Post cap', 'Stringer hanger', '2x4 nailer, pressure treated'];

/** The material list in the order a framer reads it: [qty, description]. */
export function stairTakeoff(stair) {
  const rows = new Map();
  for (const m of stair.members) if (m.label) rows.set(m.label, (rows.get(m.label) || 0) + 1);
  return ORDER.filter((k) => rows.has(k)).map((k) => [rows.get(k), k]);
}
