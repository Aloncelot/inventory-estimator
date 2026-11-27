// src/components/FloorPanel.jsx
// What this level's plan gives Loose material: the floor (area to the outside
// face of the outermost walls, less the floor openings, with an optional FRT
// band along the perimeter), the rimboard, the drawn blocking, and, when the
// walls sit on concrete, foam sill sealer and PT sill plates in Foundation.
'use client';

import { useMemo } from 'react';
import { X } from 'lucide-react';
import { NumInput } from '@/components/ui/mat';
import { CollapsiblePanel } from '@/components/ui/Collapsible';
import { floorOf, floorFramingOf, blockingOf, sillOf, onConcrete, BLOCKING_KINDS, FLOOR_SYSTEMS, JOIST_SPACINGS } from '@/domain/plans/loose';

const fmt = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');

export default function FloorPanel({ plan, levelIndex, color, onPatch }) {
  const bandFt = plan.frtBand ? Number(plan.frtBandFt) || 4 : 0;
  const floor = useMemo(() => floorOf(plan, { bandFt }), [plan, bandFt]);
  const framing = useMemo(() => floorFramingOf(plan, { floor }), [plan, floor]);
  const blocking = useMemo(() => blockingOf(plan), [plan]);
  const sill = useMemo(() => sillOf(plan), [plan]);
  const concrete = onConcrete({ plan }, levelIndex);
  const k = Number(plan.ptPerFt) || 1;
  const detected = plan.structural?.found?.floorSystem;
  const sys = plan.floorSystem || 'trusses';
  return (
    <CollapsiblePanel
      title="Floor & loose material from the plan"
      storageKey="pt-sec-floor"
      subtitle={`to this level's section of Loose material${plan.linked ? '' : ' (after Use in Wall panels)'}`}
    >
      <div className="fp-grid">
        <div className="fp-box">
          <strong>Floor framing</strong>
          <label className="fld">
            <span>System</span>
            <select
              className="ew-select"
              value={sys}
              onChange={(e) => onPatch({ floorSystem: e.target.value })}
            >
              {FLOOR_SYSTEMS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          {detected?.callouts?.length ? (
            <span className="ew-subtle">
              Structural plan: {detected.callouts.slice(0, 3).join(' · ')}
              {detected.suggested && detected.suggested !== sys ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className="ew-link"
                    onClick={() => onPatch({ floorSystem: detected.suggested, ...(detected.spacingIn ? { joistSpacingIn: detected.spacingIn } : {}) })}
                  >
                    Use {detected.suggested === 'ijoist' ? 'I-Joists' : detected.suggested === 'joist' ? 'Joists' : 'Trusses'}
                  </button>
                </>
              ) : null}
            </span>
          ) : null}
          {sys === 'trusses' ? (
            <span className="ew-subtle">Trusses are not designed or calculated here: enter the truss supplier&apos;s quote on the Trusses page. Subfloor, glue and rimboard still go to Loose material.</span>
          ) : sys === 'none' ? (
            <span className="ew-subtle">No framed floor, subfloor or rimboard sent to Loose material for this level.</span>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <label className="fld">
                  <span>Spacing</span>
                  <select className="ew-select" value={framing.spacingIn} onChange={(e) => onPatch({ joistSpacingIn: Number(e.target.value) })}>
                    {JOIST_SPACINGS.map((sp) => <option key={sp} value={sp}>{sp}&quot; o.c.</option>)}
                  </select>
                </label>
                <label className="fld" title="Average clear span used to estimate joist hangers (2 per joist) and web stiffeners">
                  <span>Avg span (ft)</span>
                  <NumInput w={48} value={framing.spanFt} onCommit={(v) => onPatch({ joistSpanFt: Math.max(4, v || 14) })} />
                </label>
              </div>
              {framing.joistLF ? (
                <span>
                  {fmt(framing.joistLF)} LF {sys === 'ijoist' ? 'I-Joist' : 'Joist'} · {fmt(framing.hangers)} hangers
                  {framing.webStiffeners ? ` · ${fmt(framing.webStiffeners)} web stiffeners` : ''}
                  {framing.blockingLF ? ` · ${fmt(framing.blockingLF)} LF transfer blocking` : ''}
                </span>
              ) : <span className="ew-subtle">Needs exterior walls to compute floor area.</span>}
            </>
          )}
        </div>
        <div className="fp-box">
          <strong>Subfloor</strong>
          {sys === 'none' ? (
            <span className="ew-subtle">Skipped (concrete slab). Switch Floor framing above if this level has a raised floor or basement.</span>
          ) : floor ? (
            <span>{fmt(floor.areaSqFt)} sq ft ≈ {Math.ceil(floor.areaSqFt / 32)} sheets 4×8{floor.openingsSqFt ? ` · ${fmt(floor.openingsSqFt)} sq ft of openings taken off` : ''}</span>
          ) : <span className="ew-subtle">Needs exterior walls</span>}
          {sys !== 'none' ? (
            <>
              <label className="pv-check">
                <input type="checkbox" checked={Boolean(plan.frtBand)} onChange={(e) => onPatch({ frtBand: e.target.checked })} />
                FRT band along the exterior walls
              </label>
              {plan.frtBand ? (
                <label className="fld"><span>Band width (ft)</span><NumInput w={48} value={plan.frtBandFt ?? 4} onCommit={(v) => onPatch({ frtBandFt: Math.max(1, v) })} /></label>
              ) : null}
              {floor && bandFt ? <span>FRT {fmt(floor.bandSqFt)} sq ft · regular {fmt(floor.fieldSqFt)} sq ft</span> : null}
              <span className="ew-subtle">Rimboard {floor ? `${fmt(floor.perimeterLF)} LF` : '—'} (perimeter)</span>
            </>
          ) : null}
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
    </CollapsiblePanel>
  );
}
