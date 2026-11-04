// src/components/PlanLayout.jsx
// Layout check from the plan: the level's walls as checked in Plan takeoff,
// shown in 3D (WebGL) as a building (walls or every member; click a wall) and
// wall by wall with its framing, openings and sheathing. Every member is cut
// from the estimate's stock and compared with the estimate, one block per
// plan section. Print / PDF lays the same drawings out as SVG sheets.
'use client';

import { useCallback, useMemo, useState } from 'react';
import { TriangleAlert, Printer, FlipHorizontal2 } from 'lucide-react';
import PlanLegend from '@/components/PlanLegend';
import { displayOf } from '@/domain/plans/display';
import PlanScene from '@/components/layout/PlanScene';
import { sceneBoxes } from '@/components/layout/planScene';
import { printPlanSheets } from '@/components/layout/printSheets';
import { planModel, planCheck, OPENING_DEFAULTS } from '@/domain/plans/framing';
import { feet } from '@/domain/lib/units';
import { NumInput } from '@/components/ui/mat';

const STATUS = {
  match: { label: 'Matches waste %', tone: 'ok' },
  'more-left': { label: 'More left than waste %', tone: 'warn' },
  'less-left': { label: 'Less left than waste %', tone: 'warn' },
  short: { label: 'Short', tone: 'bad' },
  'stock-too-short': { label: 'Stock too short', tone: 'bad' },
  'no-section': { label: 'Not in Wall panels', tone: 'warn' },
};
const pct = (v) => `${v >= 0 ? '' : '−'}${Math.abs(v).toFixed(1)}%`;
const fmt = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');

export default function PlanLayout({ level, levelName, projectName, panelLenFt, sheathing, onPatchOpening, onPatchWall, planDisplay, onDisplay }) {
  const model = useMemo(() => planModel(level, { panelLenFt, sheathing }), [level, panelLenFt, sheathing]);
  const check = useMemo(() => planCheck(level, model), [level, model]);
  const [picked, setPicked] = useState(null);
  const [view, setView] = useState('walls'); // building: solid walls or every member
  const [bSheets, setBSheets] = useState(false);
  const [wSheets, setWSheets] = useState(true);

  const wallParts = useMemo(() => (model && picked ? model.parts.filter((p) => p.wallId === picked) : []), [model, picked]);
  const planWall = useMemo(() => (level.plan?.walls || []).find((w) => w.id === picked) || null, [level.plan, picked]);
  const display = useMemo(() => displayOf(planDisplay), [planDisplay]);
  const buildingBoxes = useMemo(() => sceneBoxes(model, { mode: view, sheets: bSheets, display }), [model, view, bSheets, display]);
  // look at the wall from its sheathed face, a little from the side and above
  const wallView = useMemo(() => {
    const p = wallParts[0];
    if (!p) return null;
    const side = p.sheathFace > 0 ? 1 : -1;
    return { theta: Math.atan2(p.nrm[1] * side, p.nrm[0] * side) - 0.45, phi: 0.32 };
  }, [wallParts]);
  const wallBoxes = useMemo(() => (wallParts.length ? sceneBoxes(model, { mode: 'framing', sheets: wSheets, only: wallParts.map((p) => p.id) }) : []), [model, wallParts, wSheets]);

  const totals = useMemo(() => {
    if (!model) return null;
    const t = { lf: 0, panels: 0, studs: 0, kings: 0, jacks: 0, headers: 0, cripples: 0, sheets: 0, posts: 0 };
    for (const p of model.parts) {
      t.lf += p.lengthIn / 12; t.panels += p.frame.panels.length; t.sheets += p.frame.sheets.length;
      for (const key of ['studs', 'kings', 'jacks', 'headers', 'cripples', 'posts']) t[key] += p.frame.counts[key] || 0;
    }
    return t;
  }, [model]);

  const print = useCallback(() => {
    printPlanSheets({ model, check, wallParts, levelName, projectName, panelLenFt });
  }, [model, check, wallParts, levelName, projectName, panelLenFt]);

  if (!model) {
    return <div className="empty-state">This level&apos;s plan has no walls yet. Check them in Plan takeoff.</div>;
  }
  const unlinked = check.filter((g) => !g.linked);

  return (
    <>
      <div className="lc-facts">
        <span>Walls <strong>{model.parts.length}</strong>{model.parts.length !== (level.plan?.walls || []).length ? ` (${(level.plan?.walls || []).length} on the plan)` : ''}</span>
        <span>Length <strong>{fmt(totals.lf)} LF</strong></span>
        <span>Panels <strong>{fmt(totals.panels)}</strong> × up to {panelLenFt}&apos;</span>
        <span>Studs <strong>{fmt(totals.studs)}</strong></span>
        <span>Kings / jacks <strong>{fmt(totals.kings)} / {fmt(totals.jacks)}</strong></span>
        <span>Headers <strong>{fmt(totals.headers)}</strong></span>
        <span>Cripples <strong>{fmt(totals.cripples)}</strong></span>
        {totals.posts ? <span>Posts <strong>{fmt(totals.posts)}</strong></span> : null}
        <span>Sheet pieces <strong>{fmt(totals.sheets)}</strong></span>
        <button type="button" className="ew-btn pv-print" onClick={print} title="Drawing sheets and the material check, to print or save as PDF"><Printer size={14} /> Print / PDF</button>
      </div>
      {unlinked.length ? (
        <div className="lc-note"><TriangleAlert size={12} /> {unlinked.map((g) => g.label).join(', ')}: no &quot;Plan · …&quot; section in Wall panels yet (Use in Wall panels in Plan takeoff), so heights are 12&apos; and there is no estimate to compare.</div>
      ) : null}

      <PlanScene
        boxes={buildingBoxes} height={560} fitKey={`${level.id}|${model.parts.length}`}
        fig="Fig 1" title={`${levelName} · ${view === 'walls' ? 'walls' : 'framing'} from the plan`}
        hint="Click a wall to see its framing · drag turns · right-drag pans · wheel zooms"
        idle={`${model.parts.length} walls · ${fmt(totals.lf)} LF${view === 'framing' ? ` · ${fmt(buildingBoxes.length)} pieces` : ''}`}
        picked={picked}
        onPick={(b) => setPicked(b ? b.pick : null)}
      >
        <span className="lc-tools__sep" />
        <div className="lc-tabs pv-mode" role="tablist" aria-label="Show">
          <button type="button" role="tab" aria-selected={view === 'walls'} className={`lc-tab${view === 'walls' ? ' is-on' : ''}`} onClick={() => setView('walls')}>Walls</button>
          <button type="button" role="tab" aria-selected={view === 'framing'} className={`lc-tab${view === 'framing' ? ' is-on' : ''}`} onClick={() => setView('framing')}>Framing</button>
        </div>
        {view === 'framing' ? (
          <label className="pv-check"><input type="checkbox" checked={bSheets} onChange={(e) => setBSheets(e.target.checked)} /> Sheathing</label>
        ) : null}
      </PlanScene>
      <PlanLegend display={display} onChange={onDisplay} />
      <div className="pv-legend">
        <span className="ew-subtle">Openings use {OPENING_DEFAULTS.door.heightIn}&quot; doors and {OPENING_DEFAULTS.window.heightIn}&quot; windows at a {OPENING_DEFAULTS.window.sillIn}&quot; sill until you change them on a wall.</span>
      </div>

      {wallParts.length ? (
        <div className="pv-wall">
          <PlanScene
            boxes={wallBoxes} height={460} fitKey={picked} homeView={wallView}
            fig="Fig 2" title={wallParts.map((p) => p.label).join(' + ')}
            hint="Hover a member · drag turns · right-drag pans · wheel zooms"
            idle={`${feet(wallParts[0].lengthIn)} · ${wallParts[0].frame.panels.length} panels · studs ${feet(wallParts[0].frame.studLen)}`}
            hoverKey="panel"
          >
            <span className="lc-tools__sep" />
            <label className="pv-check"><input type="checkbox" checked={wSheets} onChange={(e) => setWSheets(e.target.checked)} /> Sheathing</label>
            {wallParts.some((p) => p.frame.sheets.length) ? (
              <button type="button" className="ew-btn pv-flip" onClick={() => onPatchWall(picked, { sheathFlip: !planWall?.sheathFlip })} title="Put the sheathing on the other face of this wall">
                <FlipHorizontal2 size={13} /> Flip sheathing side
              </button>
            ) : null}
          </PlanScene>
          <aside className="pv-side">
            <div className="pv-panels">
              <strong>Panels</strong>
              <span>{wallParts[0].frame.panels.map((p, i) => `P${i + 1} ${feet(p.length)}`).join(' · ')}</span>
            </div>
            {planWall?.openings?.length ? (
              <table className="tbl pv-openings">
                <thead><tr><th>Class</th><th>Opening</th><th className="num">Width</th><th className="num" title="Rough opening height, in">Height</th><th className="num" title="Sill height from the floor, in (windows)">Sill</th><th className="num">Kings</th><th className="num">Jacks</th></tr></thead>
                <tbody>
                  {planWall.openings.map((o, i) => {
                    const d = OPENING_DEFAULTS[o.type === 'door' ? 'door' : 'window'];
                    const set = (patch) => onPatchOpening(planWall.id, i, patch);
                    return (
                      <tr key={i}>
                        <td><strong>{o.typeId || '—'}</strong></td>
                        <td>
                          <select className="ew-select" value={o.type === 'door' ? 'door' : 'window'} onChange={(e) => set({ type: e.target.value })}>
                            <option value="window">Window</option>
                            <option value="door">Door</option>
                          </select>
                        </td>
                        <td className="num"><NumInput w={56} value={Math.round(o.widthFt * 12 * 4) / 4} onCommit={(v) => set({ widthFt: (Number(v) || 0) / 12 })} title="Width, in" /></td>
                        <td className="num"><NumInput w={48} value={o.heightIn ?? d.heightIn} onCommit={(v) => set({ heightIn: v })} /></td>
                        <td className="num">{o.type === 'door' ? <span className="ew-subtle">—</span> : <NumInput w={44} value={o.sillIn ?? d.sillIn} onCommit={(v) => set({ sillIn: v })} />}</td>
                        <td className="num"><NumInput w={36} value={o.kings ?? 1} onCommit={(v) => set({ kings: Math.max(1, v) })} /></td>
                        <td className="num"><NumInput w={36} value={o.jacks ?? 1} onCommit={(v) => set({ jacks: Math.max(1, v) })} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <p className="ew-subtle">No openings on this wall.</p>}
            <p className="ew-subtle pv-help">
              Width in inches (rough opening). Header = width + one jack each side, cripples follow the stud layout, windows get a flat sill
              with cripples under it, and panel joints stay out of the openings.
            </p>
            <button type="button" className="ew-btn ew-btn--ghost" onClick={() => setPicked(null)}>Close wall</button>
          </aside>
        </div>
      ) : (
        <p className="ew-subtle">Click a wall in the drawing to see its panels, studs, blocking, openings and sheathing.</p>
      )}

      {check.map((g) => (
        <div key={g.key} className="pv-group">
          <div className="pv-group__head">
            <i className="pt-dot" style={{ background: display.colors[g.key.split('|')[1]] }} />
            <strong>{g.label}</strong>
            <span className="ew-subtle">{g.sectionName || 'no section in Wall panels'} · {g.walls} walls · {fmt(g.lengthFt)} LF</span>
            <span className="ew-subtle pv-open">
              Openings: {g.counts.kings || 0} kings, {g.counts.jacks || 0} jacks, {g.counts.headers || 0} headers ({g.openings.headerLF.toFixed(1)} LF), {g.counts.cripples || 0} cripples, {g.counts.sills || 0} sills{g.counts.posts ? `, ${g.counts.posts} posts` : ''}
            </span>
          </div>
          <table className="tbl lc-table">
            <thead>
              <tr>
                <th>Material</th>
                <th className="num" title="Estimate quantity before waste">Estimate</th>
                <th className="num">Waste %</th>
                <th className="num" title="Estimate with waste">Final</th>
                <th className="num" title="Stock pieces the real cuts use">Layout uses</th>
                <th className="num">Leftover</th>
                <th className="num">Leftover %</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => {
                const st = STATUS[r.status];
                return (
                  <tr key={r.key}>
                    <td style={{ fontWeight: 600 }}>{r.label}</td>
                    <td className="num">{r.est.raw.toLocaleString('en-US', { maximumFractionDigits: 1 })}</td>
                    <td className="num">{r.est.waste}%</td>
                    <td className="num">{Math.ceil(r.est.final).toLocaleString('en-US')}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{r.needed.toLocaleString('en-US')}</td>
                    <td className="num">{g.linked ? r.leftover.toLocaleString('en-US') : '—'}</td>
                    <td className="num">{g.linked ? pct(r.leftoverPct) : '—'}</td>
                    <td>
                      <span className={`lc-chip is-${st.tone}`} title={r.tooLong ? `${r.tooLong} cut${r.tooLong > 1 ? 's' : ''} up to ${feet(r.longestIn)} ${r.tooLong > 1 ? 'are' : 'is'} longer than the ${feet(r.stockIn)} piece picked in Wall panels` : undefined}>{st.label}</span>
                      {r.tooLong ? <span className="ew-subtle pv-why"> {r.tooLong} cut{r.tooLong > 1 ? 's' : ''} up to {feet(r.longestIn)} &gt; {feet(r.stockIn)} stock</span> : null}
                      {r.spliced ? <span className="ew-subtle pv-why" title="Panels around openings wider than a panel: their plates are made of two pieces"> {r.spliced} spliced</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      <p className="lc-foot">
        Every wall is framed from the plan: panels up to the manufacture length, studs at each section&apos;s spacing and height,
        blocking between full-height studs, opening framing, and 4×8 sheets on exterior and shear walls cut around the openings.
        Layout uses = whole stock pieces after cutting every member (first-fit, ⅛&quot; kerf, offcuts reused). Stock too short means some cuts are longer than the piece picked in Wall panels (for example 12&apos; walls with 10&apos; studs): the count is fine, but pick a longer piece; each of those cuts is counted as one more piece. Opening members
        (kings, jacks, cripples, sills, headers) are listed apart: the estimate counts them in its Header rows.
      </p>
    </>
  );
}
