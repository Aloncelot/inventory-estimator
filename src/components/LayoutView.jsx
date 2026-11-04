// src/components/LayoutView.jsx
// Layout check: give a level's building length × width (rectangular buildings,
// exterior walls only) and the app lays out the wall panels, cuts every member
// from the stock in the estimate, draws the panels (Anatomy iso kit) and
// compares the real cuts with the estimate's quantities and Waste %.
'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Ruler, TriangleAlert, RotateCcw, RotateCw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { PageHeader, NumInput } from '@/components/ui/mat';
import { layoutCheck } from '@/domain/estimate/layout';
import { wallsFigure, FIG_W, FIG_H } from '@/components/layout/wallsFigure';
import { ISO_CSS } from '@/lib/anatomy/iso-kit.mjs';
import PlanLayout from '@/components/PlanLayout';
import { commitPlan } from '@/domain/plans/openingTypes';
import { scheduleOpts } from '@/domain/plans/headerSchedule';
import { withPlanLoose } from '@/domain/plans/loose';

const ftIn = (inches) => {
  const total = Math.round(n(inches) * 8) / 8;
  const ft = Math.floor(total / 12);
  const rest = total - ft * 12;
  const whole = Math.floor(rest);
  const frac = rest - whole;
  const fr = frac ? ` ${{ 0.125: '1/8', 0.25: '1/4', 0.375: '3/8', 0.5: '1/2', 0.625: '5/8', 0.75: '3/4', 0.875: '7/8' }[frac]}` : '';
  return `${ft}'-${whole}${fr}"`;
};
function n(v) { return Number(v) || 0; }
const pct = (v) => `${v >= 0 ? '' : '−'}${Math.abs(v).toFixed(1)}%`;

const STATUS = {
  match: { label: 'Matches waste %', tone: 'ok' },
  'more-left': { label: 'More left than waste %', tone: 'warn' },
  'less-left': { label: 'Less left than waste %', tone: 'warn' },
  short: { label: 'Short', tone: 'bad' },
  'stock-too-short': { label: 'Stock too short', tone: 'bad' },
};

/** Keep the zoomed window inside the drawing. */
function clampView(v) {
  const x = Math.min(Math.max(v.x, 0), FIG_W - v.w);
  const y = Math.min(Math.max(v.y, 0), FIG_H - v.h);
  return { ...v, x, y };
}

function WallsFigure({ check, levelName, sheathNear }) {
  const hostRef = useRef(null);
  const readoutRef = useRef(null);
  // turn: camera azimuth in 15° steps (the drawing is rebuilt for each angle)
  const [azimuth, setAzimuth] = useState(45);
  const turn = useCallback((deg) => setAzimuth((a) => (((a + deg) % 360) + 360) % 360), []);
  const { svg, panels } = useMemo(() => wallsFigure(check, { sheathNear, azimuth }), [check, sheathNear, azimuth]);

  // zoom & pan: move the SVG viewBox (lines keep their width, so details stay crisp)
  const viewRef = useRef({ x: 0, y: 0, w: FIG_W, h: FIG_H });
  const [zoom, setZoom] = useState(1);
  const applyView = useCallback(() => {
    const el = hostRef.current?.querySelector('svg');
    const v = viewRef.current;
    if (el) el.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    setZoom(FIG_W / v.w);
  }, []);
  useLayoutEffect(() => { applyView(); }, [svg, applyView]);
  const zoomAt = useCallback((factor, fx = 0.5, fy = 0.5) => {
    const v = viewRef.current;
    const w = Math.min(FIG_W, Math.max(FIG_W / 12, v.w / factor));
    const h = (w / FIG_W) * FIG_H;
    const cx = v.x + v.w * fx;
    const cy = v.y + v.h * fy;
    viewRef.current = clampView({ x: cx - w * fx, y: cy - h * fy, w, h });
    applyView();
  }, [applyView]);
  const resetView = useCallback(() => { viewRef.current = { x: 0, y: 0, w: FIG_W, h: FIG_H }; applyView(); setAzimuth(45); }, [applyView]);

  // wheel zooms toward the pointer (needs a non-passive listener)
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = host.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // drag pans; Shift + drag (or right-button drag) turns the building
  const dragRef = useRef(null);
  const onPointerDown = (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    dragRef.current = { x: e.clientX, y: e.clientY, view: { ...viewRef.current }, rotate: e.shiftKey || e.button === 2, turned: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerDrag = (e) => {
    const d = dragRef.current;
    if (!d) return false;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.rotate) {
      const steps = Math.trunc(dx / 40) - d.turned;   // 15° per 40 px
      if (steps) { d.turned += steps; turn(steps * -15); }
      return true;
    }
    const r = hostRef.current.getBoundingClientRect();
    const k = d.view.w / r.width;
    viewRef.current = clampView({ ...d.view, x: d.view.x - dx * k, y: d.view.y - dy * k });
    applyView();
    return Math.abs(dx) + Math.abs(dy) > 3;
  };
  const onPointerUp = () => { dragRef.current = null; };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); turn(15); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); turn(-15); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(1.25); }
    else if (e.key === '-') { e.preventDefault(); zoomAt(0.8); }
    else if (e.key === '0') { e.preventDefault(); resetView(); }
  };
  const byId = useMemo(() => Object.fromEntries(panels.map((p) => [p.id, p])), [panels]);
  const idle = `${check.panelCount} panels · ${Math.round(check.perimeterLF)} LF · ${check.heightFt}' walls`;

  // highlight a panel and say what it is; no re-render (attributes on the DOM)
  const show = useCallback((id) => {
    const host = hostRef.current;
    if (!host) return;
    host.querySelectorAll('.lc-panel.is-on').forEach((el) => el.classList.remove('is-on'));
    const p = id && byId[id];
    if (p) host.querySelector(`[data-panel="${id}"]`)?.classList.add('is-on');
    if (readoutRef.current) readoutRef.current.textContent = p ? `${p.wall} · panel ${p.index} · ${ftIn(p.length)} · ${p.studs} studs` : idle;
  }, [byId, idle]);

  // calm idle tour through the panels; stops on hover, offscreen and with reduced motion
  const hoverRef = useRef(false);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { show(null); return undefined; }
    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(host);
    let i = 0;
    const timer = setInterval(() => {
      if (!visible || hoverRef.current || document.hidden) return;
      show(panels[i % panels.length]?.id);
      i += 1;
    }, 1600);
    show(null);
    return () => { clearInterval(timer); io.disconnect(); };
  }, [panels, show]);

  const onMove = (e) => {
    if (onPointerDrag(e)) return;
    const g = e.target.closest?.('[data-panel]');
    hoverRef.current = Boolean(g);
    show(g ? g.getAttribute('data-panel') : null);
  };

  return (
    <figure className="iso iso-figure lc-figure" data-theme="light">
      <div className="iso-plate">
        <div className="iso-plate-corners" aria-hidden="true">
          <span className="iso-plate-corner" data-corner="fig">Fig 1</span>
          <span className="iso-plate-corner" data-corner="title">{levelName} · exterior wall panels</span>
          <span className="iso-plate-corner" data-corner="hint">Hover a panel · drag to pan · Shift-drag to turn</span>
          <span className="iso-plate-corner" data-corner="readout" ref={readoutRef}>{idle}</span>
        </div>
        <div
          ref={hostRef}
          className={`lc-host${zoom > 1.01 ? ' is-zoomed' : ''}`}
          tabIndex={0}
          aria-label="Wall panels drawing. Arrow keys turn, plus and minus zoom, 0 resets."
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
          onDoubleClick={() => zoomAt(1.6)}
          onPointerLeave={() => { hoverRef.current = false; show(null); }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="lc-tools" role="toolbar" aria-label="View">
          <button type="button" className="ew-icon-btn" onClick={() => turn(15)} title="Turn left (←)" aria-label="Turn left"><RotateCcw size={14} /></button>
          <input
            type="range" min={0} max={345} step={15} value={azimuth}
            onChange={(e) => setAzimuth(Number(e.target.value))}
            aria-label="Viewing angle" title={`Viewing angle ${azimuth}°`}
          />
          <button type="button" className="ew-icon-btn" onClick={() => turn(-15)} title="Turn right (→)" aria-label="Turn right"><RotateCw size={14} /></button>
          <span className="lc-tools__sep" />
          <button type="button" className="ew-icon-btn" onClick={() => zoomAt(0.8)} title="Zoom out (−)" aria-label="Zoom out"><ZoomOut size={14} /></button>
          <span className="lc-tools__val">{Math.round(zoom * 100)}%</span>
          <button type="button" className="ew-icon-btn" onClick={() => zoomAt(1.25)} title="Zoom in (+)" aria-label="Zoom in"><ZoomIn size={14} /></button>
          <button type="button" className="ew-icon-btn" onClick={resetView} title="Reset view (0)" aria-label="Reset view"><Maximize2 size={14} /></button>
        </div>
      </div>
      <figcaption className="iso-legend">
        <span className="iso-caption">
          Two walls run through the corners and two butt between them. Each panel has its own bottom and top plate,
          studs every {check.spacing}&quot; plus an end stud{check.mult > 1 ? ` (×${check.mult} per location)` : ''},
          {check.blockRows ? ` ${check.blockRows} row${check.blockRows > 1 ? 's' : ''} of staggered blocking,` : ''} and the loose top plate (bright) laps every panel joint by 24&quot; or more.
        </span>
      </figcaption>
    </figure>
  );
}

export default function LayoutView() {
  const { projectData, updateProject, isLoaded, blankSection } = useProject();
  const est = useMemo(() => projectData?.estimateData || {}, [projectData]);
  const levels = useMemo(() => (est.levels || []).filter(Boolean), [est.levels]);
  const layout = est.layout || {};
  const [activeId, setActiveId] = useState(null);
  const level = levels.find((l) => l.id === activeId) || levels[0];
  const idx = level ? levels.indexOf(level) : -1;

  // a level without its own size uses the one below it
  const dimsOf = useCallback((i) => {
    for (let j = i; j >= 0; j -= 1) {
      const d = layout.byLevel?.[levels[j]?.id];
      if (d && n(d.lengthFt) > 0 && n(d.widthFt) > 0) return { ...d, from: j === i ? null : levels[j].name || `Level ${j + 1}` };
    }
    return { lengthFt: 0, widthFt: 0, from: null };
  }, [layout.byLevel, levels]);
  const own = (level && layout.byLevel?.[level.id]) || {};
  const dims = idx >= 0 ? dimsOf(idx) : { lengthFt: 0, widthFt: 0 };

  const setDim = (key, v) => updateProject((prev) => {
    const cur = prev.layout?.byLevel?.[level.id] || {};
    const base = dims.from ? { lengthFt: dims.lengthFt, widthFt: dims.widthFt } : {};
    return { ...prev, layout: { ...(prev.layout || {}), byLevel: { ...(prev.layout?.byLevel || {}), [level.id]: { ...base, ...cur, [key]: v } } } };
  });
  const sheathNear = Boolean(layout.sheathNear);
  const sheathing = layout.sheathing === 'horizontal' ? 'horizontal' : 'vertical';
  const setLayout = (patch) => updateProject((prev) => ({ ...prev, layout: { ...(prev.layout || {}), ...patch } }));
  const panelLenFt = n(est.manufactureEstimate?.panelLenByKey?.exteriorWalls) || 8;

  const check = useMemo(
    () => (level ? layoutCheck(level, dims, { panelLenFt, sheathing }) : null),
    [level, dims.lengthFt, dims.widthFt, panelLenFt, sheathing], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!isLoaded || !projectData) {
    return (
      <div className="app-content">
        <PageHeader icon={Ruler} title="Layout check" />
        <div className="empty-state">Open or create a project in Projects to check its wall layout.</div>
      </div>
    );
  }

  const lfDiff = check ? check.estimateLF - check.perimeterLF : 0;
  const hasExterior = level && (level.exteriorSections || []).some(Boolean);
  const hasPlan = Boolean(level?.plan?.walls?.length);
  const usePlan = hasPlan && (layout.modeByLevel?.[level.id] || 'plan') === 'plan';
  const setMode = (mode) => setLayout({ modeByLevel: { ...(layout.modeByLevel || {}), [level.id]: mode } });
  // plan edits from here go through the same step as Plan takeoff: types, then the linked sections
  const commit = (fn) => updateProject((prev) => withPlanLoose({
    ...prev,
    levels: (prev.levels || []).map((l) => {
      if (l.id !== level.id || !l.plan) return l;
      const next = fn(l.plan);
      return commitPlan(l, next, blankSection, scheduleOpts(prev, l.id, next));
    }),
  }));
  const patchOpening = (wallId, index, patch) => commit((plan) => ({
    ...plan,
    walls: (plan.walls || []).map((w) => (w.id !== wallId ? w : {
      ...w, auto: false, openingsEdited: true,
      openings: (w.openings || []).map((o, i) => (i === index ? { ...o, ...patch } : o)),
    })),
  }));
  const patchWall = (wallId, patch) => commit((plan) => ({
    ...plan, walls: (plan.walls || []).map((w) => (w.id !== wallId ? w : { ...w, ...patch, auto: false })),
  }));
  const setDisplay = (next) => updateProject((prev) => ({ ...prev, planDisplay: next }));
  const sheathingSelect = (
    <label className="fld" title="4×8 sheets standing up (vertical) or lying along the wall (horizontal)">
      <span>Sheathing</span>
      <select className="ew-select" style={{ width: 104 }} value={sheathing} onChange={(e) => setLayout({ sheathing: e.target.value })}>
        <option value="vertical">Vertical 4×8</option>
        <option value="horizontal">Horizontal 8×4</option>
      </select>
    </label>
  );

  return (
    <div className="app-content">
      <style>{ISO_CSS}</style>
      <PageHeader icon={Ruler} title="Layout check" meta={usePlan ? 'All walls from the plan (Plan takeoff)' : 'Exterior walls · rectangular or square buildings'} />

      <div className="lc-bar">
        <div className="lc-tabs" role="tablist" aria-label="Levels">
          {levels.map((l, i) => (
            <button key={l.id} type="button" role="tab" aria-selected={l.id === level?.id} className={`lc-tab${l.id === level?.id ? ' is-on' : ''}`} onClick={() => setActiveId(l.id)}>
              {l.name || `Level ${i + 1}`}
            </button>
          ))}
        </div>
        {hasPlan ? (
          <div className="lc-tabs" role="tablist" aria-label="Source">
            <button type="button" role="tab" aria-selected={usePlan} className={`lc-tab${usePlan ? ' is-on' : ''}`} onClick={() => setMode('plan')} title="Every wall checked in Plan takeoff">From plan</button>
            <button type="button" role="tab" aria-selected={!usePlan} className={`lc-tab${!usePlan ? ' is-on' : ''}`} onClick={() => setMode('rect')} title="Length × width, exterior walls only">Rectangle</button>
          </div>
        ) : null}
        {usePlan ? <div className="lc-dims">{sheathingSelect}</div> : null}
        {level && !usePlan ? (
          <div className="lc-dims">
            <label className="fld"><span>Length (ft)</span>
              <NumInput w={64} value={own.lengthFt ?? ''} placeholder={dims.from ? String(dims.lengthFt) : ''} onCommit={(v) => setDim('lengthFt', v)} />
            </label>
            <label className="fld"><span>Width (ft)</span>
              <NumInput w={64} value={own.widthFt ?? ''} placeholder={dims.from ? String(dims.widthFt) : ''} onCommit={(v) => setDim('widthFt', v)} />
            </label>
            {dims.from && !own.lengthFt ? <span className="ew-subtle">Using {dims.from}&apos;s size</span> : null}
            <label className="fld" title="4×8 sheets standing up (vertical) or lying along the wall (horizontal)">
              <span>Sheathing</span>
              <select className="ew-select" style={{ width: 104 }} value={sheathing} onChange={(e) => setLayout({ sheathing: e.target.value })}>
                <option value="vertical">Vertical 4×8</option>
                <option value="horizontal">Horizontal 8×4</option>
              </select>
            </label>
            <label className="fld" title="Near walls show their framing; turn this on to see their sheets with sizes instead">
              <input type="checkbox" checked={sheathNear} onChange={(e) => setLayout({ sheathNear: e.target.checked })} />
              <span>Show sheets on near walls</span>
            </label>
          </div>
        ) : null}
      </div>

      {usePlan ? (
        <PlanLayout level={level} levelName={level.name || `Level ${idx + 1}`} projectName={projectData.name} panelLenFt={panelLenFt} sheathing={sheathing} onPatchOpening={patchOpening} onPatchWall={patchWall} planDisplay={est.planDisplay} onDisplay={setDisplay} />
      ) : !hasExterior ? (
        <div className="empty-state">This level has no exterior wall sections yet. Add them in Wall panels first.</div>
      ) : !check ? (
        <div className="empty-state">Type the building&apos;s length and width (outside of framing, in feet) to lay out the exterior wall panels.</div>
      ) : (
        <>
          <div className="lc-facts">
            <span>Perimeter <strong>{check.perimeterLF.toLocaleString('en-US')} LF</strong></span>
            <span className={Math.abs(lfDiff) > check.perimeterLF * 0.02 ? 'lc-warn' : ''}>
              Exterior walls in the estimate <strong>{check.estimateLF.toLocaleString('en-US')} LF</strong>
              {Math.abs(lfDiff) > check.perimeterLF * 0.02 ? <> <TriangleAlert size={12} /> {lfDiff > 0 ? '+' : '−'}{Math.abs(lfDiff).toFixed(1)} LF</> : null}
            </span>
            <span>Height <strong>{check.heightFt}&apos;</strong> (from {check.mainSection})</span>
            <span>Studs <strong>{ftIn(check.studLenIn)}</strong> @ {check.spacing}&quot;{check.mult > 1 ? ` ×${check.mult}` : ''}</span>
            <span>Wall <strong>{check.depth}&quot;</strong> thick</span>
            <span>Panels <strong>{check.panelCount}</strong> × up to {check.panelIn / 12}&apos;</span>
            <span>Sheet pieces <strong>{check.sheetCount}</strong> ({check.fullSheets} full 4×8)</span>
            {check.looseClashes ? <span className="lc-warn"><TriangleAlert size={12} /> {check.looseClashes} loose top plate joints within 24&quot; of a panel joint</span> : null}
          </div>
          {check.mixedSections ? (
            <div className="lc-note"><TriangleAlert size={12} /> The exterior sections have different heights or spacing; the layout uses {check.mainSection}, the longest one.</div>
          ) : null}

          <WallsFigure check={check} levelName={level.name || `Level ${idx + 1}`} sheathNear={sheathNear} />

          <table className="tbl lc-table">
            <colgroup><col style={{ width: '17%' }} /><col /><col /><col /><col /><col /><col /><col /><col /><col style={{ width: '17%' }} /></colgroup>
            <thead>
              <tr>
                <th>Material</th>
                <th className="num">Stock</th>
                <th className="num" title="Estimate quantity before waste">Estimate</th>
                <th className="num">Waste %</th>
                <th className="num" title="Estimate with waste (what gets ordered)">Final</th>
                <th className="num" title="Stock pieces the real cuts use">Layout uses</th>
                <th className="num">Leftover</th>
                <th className="num" title="(Final − layout uses) ÷ layout uses — should be close to Waste %">Leftover %</th>
                <th className="num" title="(Layout uses − estimate) ÷ estimate: the waste the real cuts needed">Real waste</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {check.rows.map((r) => {
                const st = STATUS[r.status];
                return (
                  <tr key={r.key}>
                    <td style={{ fontWeight: 600 }}>{r.label}</td>
                    <td className="num ew-subtle">{r.stockFt ? `${r.stockFt}'` : "4×8'"}</td>
                    <td className="num">{r.est.raw.toLocaleString('en-US', { maximumFractionDigits: 1 })}</td>
                    <td className="num">{n(r.est.waste)}%</td>
                    <td className="num">{Math.ceil(r.est.final).toLocaleString('en-US')}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{r.needed.toLocaleString('en-US')}</td>
                    <td className="num">{r.leftover.toLocaleString('en-US')}</td>
                    <td className="num">{pct(r.leftoverPct)}</td>
                    <td className="num ew-subtle">{pct(r.realWastePct)}</td>
                    <td><span className={`lc-chip is-${st.tone}`}>{st.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="lc-foot">
            Layout uses = whole stock pieces after cutting every member (first-fit, ⅛&quot; saw kerf, offcuts reused).
            Leftover % should sit within 5 points of Waste %; &quot;Real waste&quot; is the waste the layout actually needed
            over the estimate before waste. Openings, headers, interior walls and non-rectangular plans are not in this check yet.
          </p>
        </>
      )}
    </div>
  );
}
