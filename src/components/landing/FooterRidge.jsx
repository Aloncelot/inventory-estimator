// src/components/landing/FooterRidge.jsx
// The band of mountains and clouds along the top of the footer, in flat 2D.
// Four layers drift from right to left, slower the farther back they are:
// far clouds, far ridge, middle ridge, near ridge. Each layer is
// three copies of one 1800px tile whose outline repeats exactly, and slides
// one tile then starts over, so the loop has no seam. The near ridge is the
// footer's own green, so the mountains grow out of it. Colours come from
// the --lp-ridge-* tokens in landing.css. With reduced motion it stays still.
// Farthest of all, the Milky Way: a still band of glow, a dark dust lane and
// stars, thicker along the band. It does not move.

const T = 1800;   // one tile, px
const H = 150;    // the band's height, px
const COPIES = 3; // enough to cover a 2560px screen while sliding one tile

/** A ridge line that repeats every tile: k peaks per tile for each wave, sharpened. */
function ridgePath({ base, waves, sharp = 1.6, step = 6 }) {
  const pts = [];
  for (let x = 0; x <= T * COPIES; x += step) {
    let y = base;
    for (const [amp, k, phase] of waves) {
      // 1 - |sin|: rounded valleys and pointed peaks, k peaks per tile
      const s = 1 - Math.abs(Math.sin((Math.PI * k * x) / T + phase));
      y -= amp * s ** sharp;
    }
    pts.push(`${x},${y.toFixed(1)}`);
  }
  return `M0,${H} L${pts.join(' L')} L${T * COPIES},${H} Z`;
}

/** Puffs of a flat cloud: [dx, dy, rx, ry] around its centre. */
const PUFFS = [[0, 0, 46, 13], [-38, 5, 30, 9], [34, 4, 36, 10], [8, -8, 26, 10], [70, 7, 22, 6]];
function clouds(list) {
  const out = [];
  for (let c = 0; c < COPIES; c += 1) {
    list.forEach(([x, y, s], i) => {
      PUFFS.forEach(([dx, dy, rx, ry], j) => out.push(
        <ellipse key={`${c}-${i}-${j}`} cx={c * T + x + dx * s} cy={y + dy * s} rx={rx * s} ry={ry * s} />,
      ));
    });
  }
  return out;
}

const LAYERS = [
  { key: 'clouds-far', dur: 190, el: <g className="lp-ridge__cloud is-far">{clouds([[140, 26, 0.9], [620, 16, 1.2], [1090, 30, 0.8], [1480, 20, 1]])}</g> },
  { key: 'far', dur: 150, el: <path className="lp-ridge__far" d={ridgePath({ base: 128, waves: [[44, 3, 0.4], [30, 7, 1.9], [12, 13, 0.7], [4, 31, 2.4]], sharp: 1.6 })} /> },
  { key: 'mid', dur: 95, el: <path className="lp-ridge__mid" d={ridgePath({ base: 146, waves: [[30, 4, 2.6], [20, 9, 0.2], [7, 19, 1.3]], sharp: 1.5 })} /> },
  { key: 'near', dur: 48, el: <path className="lp-ridge__near" d={ridgePath({ base: H + 4, waves: [[16, 3, 1.1], [10, 7, 2.9], [4, 17, 0.5]], sharp: 1.1 })} /> },
];

/** Same stars on every render: a small seeded random. */
function seeded(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// the Milky Way runs across the sky from low left to high right
const SKY_W = 1800;
const SKY_H = 190;
const bandY = (x) => 150 - (x / SKY_W) * 130; // the band's centre line
const STARS = (() => {
  const rnd = seeded(7);
  const out = [];
  for (let i = 0; i < 420; i += 1) {
    const x = rnd() * SKY_W;
    // half the stars crowd the band, the rest are scattered
    const y = i % 2 ? bandY(x) + (rnd() + rnd() + rnd() - 1.5) * 46 : rnd() * SKY_H;
    const big = rnd() > 0.96;
    out.push({ x, y, r: big ? 1.1 + rnd() * 0.6 : 0.35 + rnd() * 0.6, o: 0.25 + rnd() * (big ? 0.7 : 0.55) });
  }
  return out;
})();

function MilkyWay() {
  const tilt = (-Math.atan2(130, SKY_W) * 180) / Math.PI;
  return (
    <svg className="lp-ridge__sky" viewBox={`0 0 ${SKY_W} ${SKY_H}`} preserveAspectRatio="xMidYMax slice" focusable="false">
      <defs>
        <filter id="lp-mw-soft" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="18" /></filter>
        <filter id="lp-mw-lane" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="7" /></filter>
      </defs>
      <g transform={`rotate(${tilt} ${SKY_W / 2} ${bandY(SKY_W / 2)})`}>
        <ellipse className="lp-ridge__glow" cx={SKY_W / 2} cy={bandY(SKY_W / 2)} rx={SKY_W * 0.62} ry={38} filter="url(#lp-mw-soft)" />
        <ellipse className="lp-ridge__core" cx={SKY_W * 0.58} cy={bandY(SKY_W / 2) - 2} rx={SKY_W * 0.26} ry={16} filter="url(#lp-mw-soft)" />
        <ellipse className="lp-ridge__lane" cx={SKY_W * 0.52} cy={bandY(SKY_W / 2) + 4} rx={SKY_W * 0.34} ry={5} filter="url(#lp-mw-lane)" />
      </g>
      <g className="lp-ridge__stars">
        {STARS.map((st, i) => <circle key={i} cx={st.x.toFixed(1)} cy={st.y.toFixed(1)} r={st.r.toFixed(2)} opacity={st.o.toFixed(2)} />)}
      </g>
    </svg>
  );
}

export default function FooterRidge() {
  return (
    <div className="lp-ridge" aria-hidden="true">
      <MilkyWay />
      {LAYERS.map((l) => (
        <svg
          key={l.key}
          className="lp-ridge__layer"
          style={{ '--lp-ridge-dur': `${l.dur}s` }}
          width={T * COPIES}
          height={H}
          viewBox={`0 0 ${T * COPIES} ${H}`}
          focusable="false"
        >
          {l.el}
        </svg>
      ))}
    </div>
  );
}
