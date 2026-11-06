// src/components/LaborView.jsx
// Labor of the project by time: the crew and its rates, the minutes each task
// takes (the company's own, kept in templates), the factor of each level, and
// every task with its quantity from the estimate. The bill by time is the
// main figure; per panel and per LF are shown to compare.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { HardHat, Save, FolderOpen, Trash2, RotateCcw } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { PageHeader, NumInput, fmtMoney } from '@/components/ui/mat';
import { useConfirm } from '@/components/ui/confirm';
import { computeLabor, LABOR_DEFAULTS, levelFactor, toLaborTemplate, fromLaborTemplate } from '@/domain/labor';
import { listLaborTemplates, saveLaborTemplate, deleteLaborTemplate } from '@/lib/laborTemplates';
import { scoped, scopeOf } from '@/domain/scope';

const hrs = (v) => `${(Math.round(v * 10) / 10).toLocaleString('en-US')} h`;
const num = (v) => (Math.round(v * 10) / 10).toLocaleString('en-US');

const TIMES = [
  ['Walls', [
    ['panel', 'Panel, plain', 'crew min / panel', 'Up to the height below, no sheathing'],
    ['sheathedPct', 'Sheathed panel', '+ %', 'Exterior and shear walls'],
    ['tallFromFt', 'Taller than', 'ft', 'Panels above this height take longer'],
    ['tallPctPerFt', 'Each foot above it', '+ %', ''],
    ['hardware', 'Hold-down / strap', 'crew min / pc', 'Hardware placed on the plan'],
    ['plumbBrace', 'Plumb, line, brace', 'crew min / panel', ''],
    ['topPlate', 'Loose top plate', 'crew min / 10 LF', 'Lap and tie the panels'],
    ['sillPlate', 'Sill plate on concrete', 'crew min / 10 LF', 'Sealer, anchors, plate'],
    ['blocking', 'Loose blocking', 'crew min / 10 LF', ''],
    ['post', 'Post / column', 'crew min / pc', 'Posts placed on the plan'],
  ]],
  ['Windows & doors', [
    ['windowInstallers', 'Window, dedicated installers', 'team min / window', ''],
    ['windowCrew', 'Window, framing crew', 'crew min / window', ''],
    ['door', 'Exterior door', 'crew min / door', ''],
  ]],
  ['Floor', [
    ['floorJoist', 'Joists / I-joists', 'crew min / 10 LF', ''],
    ['floorTruss', 'Floor truss', 'crew min / pc', ''],
    ['subfloorSheet', 'Subfloor sheet', 'crew min / sheet', 'Glue and nail'],
    ['beam', 'Beam', 'crew min / 10 LF', 'LVL, built-up'],
    ['stair', 'Stair flight', 'crew min / flight', ''],
  ]],
  ['Roof', [
    ['roofTruss', 'Roof truss', 'crew min / pc', 'Set, brace, tie down'],
    ['rafter', 'Rafter', 'crew min / pc', 'Stick roof'],
    ['roofSheet', 'Roof sheet', 'crew min / sheet', ''],
    ['setupDays', 'Set-up, crane, cleanup', 'crew days / level', 'Not divided by the efficiency'],
    ['punchListPct', 'Punch list', '+ % of crew hours', 'Added at the end, over all the crew tasks'],
  ]],
];

export default function LaborView() {
  const { projectData, updateProject, isLoaded, appId } = useProject();
  const confirm = useConfirm();
  const est = useMemo(() => projectData?.estimateData || {}, [projectData]);
  const labor = useMemo(() => est.labor || {}, [est.labor]);
  // the walls, floors and roof the scope covers (Summary)
  const r = useMemo(() => computeLabor(scoped(est)), [est]);
  const laborOn = scopeOf(est).labor;
  const s = r.settings;
  const T = r.totals;

  const setLabor = useCallback((patch) => updateProject((prev) => ({ ...prev, labor: { ...(prev.labor || {}), ...(typeof patch === 'function' ? patch(prev.labor || {}) : patch) } })), [updateProject]);
  const setTime = (key, v) => setLabor((l) => ({ times: { ...(l.times || {}), [key]: v } }));
  const setQty = (key, v) => setLabor((l) => {
    const qty = { ...(l.qty || {}) };
    if (v === '' || v === null) delete qty[key]; else qty[key] = v;
    return { qty };
  });

  // templates
  const [templates, setTemplates] = useState([]);
  const [pick, setPick] = useState('');
  const [naming, setNaming] = useState(null);
  const [msg, setMsg] = useState('');
  const refresh = useCallback(async () => {
    try { setTemplates(await listLaborTemplates(appId)); } catch (e) { setMsg(`Templates could not be read: ${e.message || e}`); }
  }, [appId]);
  useEffect(() => { if (appId) refresh(); }, [appId, refresh]);
  const mine = templates.find((t) => t.id === labor.templateId);
  const useTpl = async () => {
    const tpl = pick === '__defaults' ? { name: 'Defaults', ...LABOR_DEFAULTS } : templates.find((t) => t.id === pick);
    if (!tpl) return;
    const ok = await confirm({ title: `Use "${tpl.name}"?`, message: 'Crew, rates, times and level factors of this project are replaced. Quantities you typed stay.', confirmLabel: 'Use template' });
    if (!ok) return;
    updateProject((prev) => ({ ...prev, labor: fromLaborTemplate(tpl, prev.labor || {}, pick === '__defaults' ? undefined : pick) }));
    setPick('');
  };
  const saveAs = async () => {
    const name = (naming || '').trim();
    if (!name) return;
    try {
      const id = await saveLaborTemplate(appId, toLaborTemplate(labor, name));
      setLabor({ templateId: id, templateName: name });
      setNaming(null); setMsg(`Saved as "${name}".`); refresh();
    } catch (e) { setMsg(e.message || String(e)); }
  };
  const update = async () => {
    try { await saveLaborTemplate(appId, toLaborTemplate(labor, mine.name), mine.id); setMsg(`"${mine.name}" updated.`); refresh(); } catch (e) { setMsg(e.message || String(e)); }
  };
  const remove = async () => {
    const tpl = templates.find((t) => t.id === pick);
    if (!tpl) return;
    if (!(await confirm({ title: `Delete the template "${tpl.name}"?`, message: 'Projects that used it keep their own copy.', confirmLabel: 'Delete', tone: 'danger' }))) return;
    await deleteLaborTemplate(appId, tpl.id); setPick(''); refresh();
  };

  if (!isLoaded || !projectData) {
    return (
      <div className="app-content">
        <PageHeader icon={HardHat} title="Labor" />
        <div className="empty-state">Open or create a project in Projects to estimate its labor.</div>
      </div>
    );
  }

  const groups = [];
  for (const t of r.tasks) {
    const key = `${t.levelIndex}|${t.level}`;
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, level: t.level, levelIndex: t.levelIndex, tasks: [] }; groups.push(g); }
    g.tasks.push(t);
  }
  groups.sort((a, b) => a.levelIndex - b.levelIndex);
  // one factor per level of the project (the roof and the punch list are not levels)
  const nLevels = Math.max(s.levelFactors.length, (est.levels || []).filter(Boolean).length, 1);
  const rateOf = (t) => (t.team === 'installers' ? T.installerBillRate : T.crewBillRate);

  return (
    <div className="app-content">
      <PageHeader icon={HardHat} title="Labor" meta={`${hrs(T.workerHours)} · ${num(T.crewDays)} crew days`} totalLabel="Labor (by time)" total={T.bill} />

      {!laborOn ? <p className="lc-note">Labor is not in the scope of this project (Summary): it is worked out here but left out of Summary and the Quote.</p> : null}
      <div className="lb-top">
        <section className="ew-card lb-card">
          <h3>Crew &amp; rates</h3>
          <div className="lb-grid">
            <label className="fld"><span>Framing crew</span><NumInput w={56} value={s.crew} onCommit={(v) => setLabor({ crew: Math.max(1, Math.round(v)) })} /><span className="ew-subtle">people</span></label>
            <label className="fld"><span>Hours a day</span><NumInput w={56} value={s.hoursPerDay} onCommit={(v) => setLabor({ hoursPerDay: Math.max(1, v) })} /></label>
            <label className="fld" title="What the company pays each person of the crew per hour"><span>Pay / worker-hour</span><NumInput w={72} step="0.01" value={s.payRate} onCommit={(v) => setLabor({ payRate: Math.max(0, v) })} /></label>
            <label className="fld" title="Payroll taxes, workers' comp, benefits on top of pay: 25–40% for employees, 0 for a crew paid as a subcontractor"><span>Burden on pay</span><NumInput w={56} value={s.burdenPct} onCommit={(v) => setLabor({ burdenPct: Math.max(0, v) })} /><span className="ew-subtle">%</span></label>
          </div>
          <div className="lb-grid">
            <label className="fld"><span>Windows put in by</span>
              <select className="ew-select" value={s.windowsBy} onChange={(e) => setLabor({ windowsBy: e.target.value })}>
                <option value="installers">Dedicated installers</option>
                <option value="crew">The framing crew</option>
              </select>
            </label>
            {s.windowsBy !== 'crew' ? (
              <>
                <label className="fld"><span>Installers</span><NumInput w={56} value={s.installers} onCommit={(v) => setLabor({ installers: Math.max(1, Math.round(v)) })} /><span className="ew-subtle">people</span></label>
                <label className="fld"><span>Pay / hour</span><NumInput w={72} step="0.01" value={s.installerPayRate} onCommit={(v) => setLabor({ installerPayRate: Math.max(0, v) })} /></label>
              </>
            ) : null}
          </div>
          <div className="lb-tpl">
            <select className="ew-select" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Template">
              <option value="">Templates…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              <option value="__defaults">Defaults</option>
            </select>
            <button type="button" className="ew-btn ew-btn--ghost" onClick={useTpl} disabled={!pick}><FolderOpen size={13} /> Use</button>
            {templates.some((t) => t.id === pick) ? <button type="button" className="ew-icon-btn" onClick={remove} aria-label="Delete template" title="Delete this template"><Trash2 size={13} /></button> : null}
            {mine ? <button type="button" className="ew-btn ew-btn--ghost" onClick={update} title={`Save crew, rates and times into "${mine.name}"`}><Save size={13} /> Update template</button> : null}
            {naming === null
              ? <button type="button" className="ew-btn ew-btn--ghost" onClick={() => setNaming('')} disabled={!appId}><Save size={13} /> Save as template</button>
              : (
                <span className="hs-name">
                  <input className="ew-input" autoFocus value={naming} placeholder="e.g. Crew A · 2026 rates" onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveAs(); if (e.key === 'Escape') setNaming(null); }} />
                  <button type="button" className="ew-btn ew-btn--primary" onClick={saveAs} disabled={!naming.trim()}>Save</button>
                  <button type="button" className="ew-btn ew-btn--ghost" onClick={() => setNaming(null)}>Cancel</button>
                </span>
              )}
            <span className="ew-subtle">{labor.templateName ? `From "${labor.templateName}"` : 'Defaults: set your own and save them as a template'}</span>
          </div>
          {msg ? <p className="ew-subtle">{msg}</p> : null}
        </section>

        <section className="ew-card lb-card lb-sum">
          <h3>Labor</h3>
          <table className="tbl lb-sumtbl">
            <tbody>
              <tr className="lb-main"><td>By time</td><td className="num">{hrs(T.workerHours)}</td><td className="num money-section">{fmtMoney(T.bill)}</td></tr>
              <tr><td>Crew days</td><td className="num" colSpan={2}>{num(T.crewDays)} days · {s.crew} people × {s.hoursPerDay} h{T.installerWorkerHours ? ` · installers ${num(T.installerDays)} days` : ''}</td></tr>
              <tr><td>Labor cost{s.burdenPct ? ` (pay +${s.burdenPct}% burden)` : ' (pay)'}</td><td className="num ew-subtle">{fmtMoney(T.crewRate)}/h</td><td className="num">{fmtMoney(T.cost)}</td></tr>
              <tr>
                <td title="The company's markup over the labor cost: about 80% on new construction, 100% on renovations">Markup</td>
                <td className="num"><span className="lb-pct"><NumInput w={56} value={s.markupPct} onCommit={(v) => setLabor({ markupPct: Math.max(0, v) })} aria-label="Markup percent" /> %</span></td>
                <td className="num">{fmtMoney(T.margin)}</td>
              </tr>
              <tr className="lb-cmp"><td colSpan={3}>Billed at {fmtMoney(T.crewBillRate)} per worker-hour{T.installerWorkerHours ? ` · installers ${fmtMoney(T.installerBillRate)}` : ''} · {T.bill ? Math.round((T.margin / T.bill) * 100) : 0}% of the bill is margin</td></tr>
              <tr className="lb-main lb-sqft">
                <td>By sq ft</td>
                <td className="num">
                  <span className="lb-pct" title={T.levelAreas.filter((x) => x.areaSqFt).map((x) => `${x.level}: ${Math.round(x.areaSqFt).toLocaleString('en-US')} sq ft`).join(' · ') || 'Floor area of the levels drawn in Plan takeoff; type it if there is no plan'}>
                    <NumInput w={72} allowEmpty value={T.areaTyped ? T.areaSqFt : ''} placeholder={String(T.autoAreaSqFt || 0)} onCommit={(v) => setLabor({ areaSqFt: v === '' ? undefined : Math.max(0, v) })} aria-label="Floor area, sq ft" /> sf ×
                    <NumInput w={60} step="0.01" value={s.sqftRate} onCommit={(v) => setLabor({ sqftRate: Math.max(0, v) })} aria-label="Price per sq ft" />
                  </span>
                </td>
                <td className="num money-section">{fmtMoney(T.sqftBill)}</td>
              </tr>
              <tr className="lb-cmp"><td colSpan={3}>{T.sqftBill && T.bill ? `${T.sqftDiffPct > 0 ? '+' : ''}${T.sqftDiffPct}% against by time · by time is ${fmtMoney(T.timePerSqft)}/sf` : 'Floor area of every level, from Plan takeoff (openings in), or typed'}</td></tr>
              <tr className="lb-cmp"><td title="Walls, windows and doors billed by time, over the panels">Per panel</td><td className="num ew-subtle">{T.panels} panels</td><td className="num">{fmtMoney(T.wallPerPanel)}</td></tr>
              <tr className="lb-cmp"><td title="Walls, windows and doors billed by time, over the wall LF">Per LF of wall</td><td className="num ew-subtle">{num(T.wallLF)} LF</td><td className="num">{fmtMoney(T.wallPerLF)}</td></tr>
            </tbody>
          </table>
          <div className="lb-use">
            <span>Summary takes</span>
            <label className="pv-check"><input type="radio" name="lb-by" checked={s.priceBy !== 'sqft'} onChange={() => setLabor({ priceBy: 'time' })} /> By time</label>
            <label className="pv-check"><input type="radio" name="lb-by" checked={s.priceBy === 'sqft'} onChange={() => setLabor({ priceBy: 'sqft' })} /> By sq ft</label>
          </div>
          <p className="ew-subtle">Per panel and per LF are the walls by time spread over the panels or the LF, to compare with a per-panel or per-foot price; floor and roof are not in them.</p>
        </section>
      </div>

      <section className="ew-card lb-card">
        <h3>Times</h3>
        <p className="ew-subtle">
          Minutes the whole crew of {s.refCrew} takes per unit, at the first level.
          With a different crew the worker-hours stay; the days change.
        </p>
        <div className="lb-times">
          {TIMES.map(([title, rows]) => (
            <div key={title} className="lb-tgroup">
              <strong>{title}</strong>
              {rows.map(([key, label, unit, hint]) => (
                <label key={key} className="lb-trow" title={hint}>
                  <span>{label}</span>
                  <NumInput w={56} value={s.times[key]} onCommit={(v) => setTime(key, Math.max(0, v))} />
                  <span className="ew-subtle">{unit}</span>
                </label>
              ))}
            </div>
          ))}
          <div className="lb-tgroup">
            <strong>Level factors</strong>
            {Array.from({ length: nLevels }, (_, i) => (
              <label key={i} className="lb-trow">
                <span>Level {i + 1}</span>
                <NumInput w={56} step="0.05" value={levelFactor(s, i)} onCommit={(v) => setLabor((l) => {
                  const f = Array.from({ length: Math.max(nLevels, (l.levelFactors || []).length) }, (_, j) => levelFactor(s, j));
                  f[i] = Math.max(0.5, v);
                  return { levelFactors: f };
                })} />
                <span className="ew-subtle">×</span>
              </label>
            ))}
            <label className="lb-trow"><span>Roof</span><NumInput w={56} step="0.05" value={s.roofExtra} onCommit={(v) => setLabor({ roofExtra: Math.max(0, v) })} /><span className="ew-subtle">+ over the top level</span></label>
            <label className="lb-trow" title="Share of the day on the tasks: the rest is start-up, moving material, crane waits, weather. Task hours are divided by it."><span>Efficiency</span><NumInput w={56} value={s.efficiencyPct} onCommit={(v) => setLabor({ efficiencyPct: Math.min(100, Math.max(20, v)) })} /><span className="ew-subtle">% of the day on tasks</span></label>
            <label className="lb-trow" title="The crew the times above are measured with"><span>Times are for a crew of</span><NumInput w={56} value={s.refCrew} onCommit={(v) => setLabor({ refCrew: Math.max(1, Math.round(v)) })} /><span className="ew-subtle">people</span></label>
          </div>
        </div>
      </section>

      <section className="ew-card lb-card">
        <h3>Tasks</h3>
        <table className="tbl lb-tasks">
          <thead>
            <tr>
              <th>Task</th><th className="num">Qty</th><th>Unit</th><th className="num" title="Team minutes per unit, after the sheathing and height adjustments">Min each</th>
              <th className="num" title="Level factor">×</th><th className="num">Worker-hours</th><th className="num">Amount</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.key}>
              <tr className="lb-level"><td colSpan={7}>{g.level}</td></tr>
              {g.tasks.map((t) => (
                <tr key={t.key} className={t.qty ? '' : 'lb-zero'}>
                  <td>{t.label}{t.hint ? <span className="ew-subtle"> · {t.hint}</span> : null}{t.team === 'installers' ? <span className="ew-subtle"> · installers</span> : null}</td>
                  <td className="num">
                    <span className="lb-qty">
                      <NumInput w={64} allowEmpty value={t.typed ? t.qty : ''} placeholder={String(t.auto)} onCommit={(v) => setQty(t.key, v)} aria-label={`${t.label} quantity`} />
                      {t.typed && !t.typedOnly ? <button type="button" className="ew-icon-btn" onClick={() => setQty(t.key, '')} title={`Back to ${t.auto} from the estimate`} aria-label="Back to the estimate"><RotateCcw size={12} /></button> : null}
                    </span>
                  </td>
                  <td className="ew-subtle">{t.unit}</td>
                  <td className="num">{t.key === 'punchList' ? '' : num(t.min)}</td>
                  <td className="num">{t.key === 'punchList' ? '' : t.factor}</td>
                  <td className="num">{num(t.workerHours)}</td>
                  <td className="num">{fmtMoney(t.workerHours * rateOf(t))}</td>
                </tr>
              ))}
            </tbody>
          ))}
          <tfoot>
            <tr><td colSpan={5}>Total</td><td className="num">{num(T.workerHours)}</td><td className="num money-section">{fmtMoney(T.bill)}</td></tr>
          </tfoot>
        </table>
        <p className="ew-subtle">
          Quantities come from Wall panels, Plan takeoff and Loose material; type one to use yours, ↺ goes back.
          Trusses are typed here (the Trusses page has amounts only). Floors take the factor of their level; the roof, the top level&apos;s plus the roof add.
        </p>
      </section>
    </div>
  );
}
