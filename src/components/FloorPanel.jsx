// src/components/FloorPanel.jsx
// What this level's plan gives Loose material: the floor (area to the outside
// face of the outermost walls, less the floor openings, with an optional FRT
// band along the perimeter), the rimboard, the drawn blocking, and, when the
// walls sit on concrete, foam sill sealer and PT sill plates in Foundation.
'use client';

import { useMemo } from 'react';
import { X } from 'lucide-react';
import { NumInput } from '@/components/ui/mat';
import { floorOf, blockingOf, sillOf, onConcrete, BLOCKING_KINDS } from '@/domain/plans/loose';

const fmt = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');

export default function FloorPanel({ plan, levelIndex, color, onPatch }) {
  const bandFt = plan.frtBand ? Number(plan.frtBandFt) || 4 : 0;
  const floor = useMemo(() => floorOf(plan, { bandFt }), [plan, bandFt]);
  const blocking = useMemo(() => blockingOf(plan), [plan]);
  const sill = useMemo(() => sillOf(plan), [plan]);
  const concrete = onConcrete({ plan }, levelIndex);
  const k = Number(plan.ptPerFt) || 1;
  return (
    <section className="ot-panel">
      <div className="ot-head">
        <strong>Floor &amp; loose material from the plan</strong>
        <span className="ew-subtle">to this level&apos;s section of Loose material{plan.linked ? '' : ' (after Use in Wall panels)'}</span>
      </div>
      <div className="fp-grid">
        <div className="fp-box">
          <strong>Subfloor</strong>
          {floor ? (
            <span>{fmt(floor.areaSqFt)} sq ft ≈ {Math.ceil(floor.areaSqFt / 32)} sheets 4×8{floor.openingsSqFt ? ` · ${fmt(floor.openingsSqFt)} sq ft of openings taken off` : ''}</span>
          ) : <span className="ew-subtle">Needs exterior walls</span>}
          <label className="pv-check">
            <input type="checkbox" checked={Boolean(plan.frtBand)} onChange={(e) => onPatch({ frtBand: e.target.checked })} />
            FRT band along the exterior walls
          </label>
          {plan.frtBand ? (
            <label className="fld"><span>Band width (ft)</span><NumInput w={48} value={plan.frtBandFt ?? 4} onCommit={(v) => onPatch({ frtBandFt: Math.max(1, v) })} /></label>
          ) : null}
          {floor && bandFt ? <span>FRT {fmt(floor.bandSqFt)} sq ft · regular {fmt(floor.fieldSqFt)} sq ft</span> : null}
          <span className="ew-subtle">Rimboard {floor ? `${fmt(floor.perimeterLF)} LF` : '—'} (perimeter)</span>
        </div>
        <div className="fp-box">
          <strong>Floor openings</strong>
          {(plan.floorOpenings || []).length ? (
            <ul className="fp-list">
              {plan.floorOpenings.map((o, i) => (
                <li key={i}>
                  {fmt(Math.abs(o.x2 - o.x1) / k)}&apos; × {fmt(Math.abs(o.y2 - o.y1) / k)}&apos;
                  <button type="button" className="ew-icon-btn" onClick={() => onPatch({ floorOpenings: plan.floorOpenings.filter((_, j) => j !== i) })} aria-label="Remove floor opening"><X size={12} /></button>
                </li>
              ))}
            </ul>
          ) : <span className="ew-subtle">None. Mark stairs, shafts and open-to-below areas with Floor opening.</span>}
        </div>
        <div className="fp-box">
          <strong>Blocking drawn</strong>
          {BLOCKING_KINDS.map((b) => (blocking[b.value] ? <span key={b.value}><i className="pt-dot" style={{ background: color }} />{b.label}: {fmt(blocking[b.value])} LF</span> : null))}
          {Object.keys(blocking).length ? (
            <button type="button" className="ew-btn ew-btn--ghost" onClick={() => onPatch({ blocking: (plan.blocking || []).slice(0, -1) })} title="Remove the last blocking run drawn">Undo last run</button>
          ) : <span className="ew-subtle">Draw bathroom, kitchen, stair railing or other blocking with Blocking.</span>}
        </div>
        <div className="fp-box">
          <strong>On concrete</strong>
          <label className="pv-check">
            <input type="checkbox" checked={concrete} onChange={(e) => onPatch({ onConcrete: e.target.checked })} />
            Walls sit on concrete
          </label>
          {concrete ? (
            <span>Foam sill sealer {fmt(sill.totalLF)} LF · PT sill plates {Object.entries(sill.bySize).map(([s, lf]) => `${s} ${fmt(lf)} LF`).join(', ') || '—'}</span>
          ) : <span className="ew-subtle">No foam sealer or sill plates from this level.</span>}
          <span className="ew-subtle">Exterior, bearing and shear walls; to Loose material → Foundation.</span>
        </div>
      </div>
    </section>
  );
}
