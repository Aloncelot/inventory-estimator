// src/components/landing/WallElevation.jsx
// The hero: one wall panel drawn as a framer reads it (plates, studs at 16"
// o.c., a window with its header, the dimension string), and the material
// list that comes out of it. The studs go up one after another once, on load;
// with reduced motion everything is simply there.

const W = 560;            // drawing width (px) for 16'-0"
const H = 330;            // 9'-1-1/8" wall
const PX_PER_IN = W / 192;
const x = (inches) => 20 + inches * PX_PER_IN;
const PLATE = 1.5 * PX_PER_IN;
const STUD = 1.5 * PX_PER_IN;

// window: 36" rough opening, 48" tall, sill at 36"
const RO_L = 64; const RO_R = 100;
const studsAt = Array.from({ length: 13 }, (_, i) => i * 16).concat([190.5]);
const inOpening = (s) => s + 1.5 > RO_L - 3 && s < RO_R + 3;

const LIST = [
  ['14', '2x6 stud 104-5/8"', '$95.20'],
  ['3', '2x6 16\' plate (1 PT)', '$71.40'],
  ['2', '2x10 header 6\'', '$38.60'],
  ['5', '7/16" OSB 4x9', '$92.75'],
  ['1', 'Nails & adhesive', '$18.30'],
];

export default function WallElevation() {
  const top = 30; const bottom = top + H;
  const sill = bottom - PLATE - 36 * PX_PER_IN;
  const head = sill - 48 * PX_PER_IN;
  let n = 0;
  return (
    <figure className="lp-wall" aria-label="An example wall panel, 16 feet long, and the materials it takes">
      <svg viewBox={`0 0 ${W + 40} ${H + 92}`} role="img" aria-hidden="true">
        {/* plates */}
        <rect className="lp-wall__plate" x={x(0)} y={bottom - PLATE} width={192 * PX_PER_IN} height={PLATE} />
        <rect className="lp-wall__plate" x={x(0)} y={top} width={192 * PX_PER_IN} height={PLATE} />
        <rect className="lp-wall__plate" x={x(0)} y={top + PLATE} width={192 * PX_PER_IN} height={PLATE} />
        {/* studs, with the ones inside the opening cut by it */}
        {studsAt.map((s) => {
          const i = n++;
          const style = { '--i': i };
          if (!inOpening(s)) {
            return <rect key={s} className="lp-wall__stud" style={style} x={x(s)} y={top + 2 * PLATE} width={STUD} height={H - 3 * PLATE} />;
          }
          return (
            <g key={s} className="lp-wall__stud" style={style}>
              <rect x={x(s)} y={top + 2 * PLATE} width={STUD} height={head - 9.25 * PX_PER_IN - (top + 2 * PLATE)} />
              <rect x={x(s)} y={sill + PLATE} width={STUD} height={bottom - PLATE - sill - PLATE} />
            </g>
          );
        })}
        {/* king and jack studs, header, sill */}
        <rect className="lp-wall__stud lp-wall__stud--k" style={{ '--i': 14 }} x={x(RO_L - 3)} y={top + 2 * PLATE} width={STUD} height={H - 3 * PLATE} />
        <rect className="lp-wall__stud lp-wall__stud--k" style={{ '--i': 15 }} x={x(RO_R + 1.5)} y={top + 2 * PLATE} width={STUD} height={H - 3 * PLATE} />
        <rect className="lp-wall__stud lp-wall__stud--k" style={{ '--i': 16 }} x={x(RO_L - 1.5)} y={head} width={STUD} height={bottom - PLATE - head} />
        <rect className="lp-wall__stud lp-wall__stud--k" style={{ '--i': 16 }} x={x(RO_R)} y={head} width={STUD} height={bottom - PLATE - head} />
        <rect className="lp-wall__header" x={x(RO_L - 1.5)} y={head - 9.25 * PX_PER_IN} width={(RO_R - RO_L + 3) * PX_PER_IN} height={9.25 * PX_PER_IN} />
        <rect className="lp-wall__plate" x={x(RO_L)} y={sill} width={(RO_R - RO_L) * PX_PER_IN} height={PLATE} />
        <rect className="lp-wall__opening" x={x(RO_L)} y={head} width={(RO_R - RO_L) * PX_PER_IN} height={sill - head} />
        <text className="lp-wall__tag" x={x((RO_L + RO_R) / 2)} y={(head + sill) / 2 + 4} textAnchor="middle">3060</text>

        {/* dimension strings */}
        <g className="lp-wall__dim">
          <line x1={x(0)} y1={bottom + 26} x2={x(192)} y2={bottom + 26} />
          <line x1={x(0)} y1={bottom + 18} x2={x(0)} y2={bottom + 34} />
          <line x1={x(192)} y1={bottom + 18} x2={x(192)} y2={bottom + 34} />
          <text x={x(96)} y={bottom + 50} textAnchor="middle">16&apos;-0&quot;</text>
          <line x1={x(16) + STUD / 2} y1={bottom + 8} x2={x(32) + STUD / 2} y2={bottom + 8} />
          <text x={x(24) + STUD / 2} y={bottom + 4} textAnchor="middle" className="lp-wall__dim-s">16&quot; o.c.</text>
          <line x1={W + 30} y1={top} x2={W + 30} y2={bottom} />
          <text x={W + 24} y={(top + bottom) / 2} textAnchor="middle" transform={`rotate(-90 ${W + 24} ${(top + bottom) / 2})`}>9&apos;-1 1/8&quot;</text>
        </g>
      </svg>
      <figcaption className="lp-wall__list">
        <table>
          <caption>Exterior wall W-4, level 1</caption>
          <tbody>
            {LIST.map(([q, m, a], i) => (
              <tr key={m} style={{ '--i': i }}>
                <td className="q">{q}</td><td>{m}</td><td className="a">{a}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td /><td>Materials at cost</td><td className="a">$316.25</td></tr>
          </tfoot>
        </table>
      </figcaption>
    </figure>
  );
}
