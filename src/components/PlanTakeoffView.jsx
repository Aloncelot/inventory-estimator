// src/components/PlanTakeoffView.jsx
// Plan takeoff: upload a level's floor plan PDF, find its walls from the vector
// drawing, let the user check and fix them, and feed the wall lengths to the
// level's wall sections. Typing lengths in Wall panels stays as the fallback.
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScanLine, Upload, MousePointer2, PenLine, Ruler, Trash2, ZoomIn, ZoomOut, Maximize2,
  Link2, Unlink, RefreshCw, TriangleAlert, CopyCheck, DoorOpen, X, Plus, Columns2, Copy, Anchor, Minus, SquareDashed,
} from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import PlanLegend from '@/components/PlanLegend';
import { displayOf } from '@/domain/plans/display';
import OpeningTypesPanel from '@/components/OpeningTypesPanel';
import HeaderSchedulePanel from '@/components/HeaderSchedulePanel';
import { scheduleOpts, floorsAbove, backToSchedule } from '@/domain/plans/headerSchedule';
import { commitPlan, newType, typeUse, copyPlan } from '@/domain/plans/openingTypes';
import { PageHeader, NumInput } from '@/components/ui/mat';
import { useConfirm } from '@/components/ui/confirm';
import { loadPdfjs } from '@/lib/pdfjs';
import { savePlanFile, loadPlanFile } from '@/lib/planFiles';
import { extractPage } from '@/domain/plans/extract';
import { detectScale, detectWalls, parseScaleText } from '@/domain/plans/detect';
import { newPostType, postWidthIn } from '@/domain/plans/sync';
import PostTypesPanel from '@/components/PostTypesPanel';
import HardwareTypesPanel from '@/components/HardwareTypesPanel';
import { hardwareCounts, newHardwareType } from '@/domain/plans/hardware';
import { withPlanLoose, BLOCKING_KINDS } from '@/domain/plans/loose';
import FloorPanel from '@/components/FloorPanel';
import StructuralPanel from '@/components/StructuralPanel';
import SheetPicker from '@/components/SheetPicker';
import { extractSheet } from '@/lib/pdflib';
import { alignSheets, readStructural, placeStructural, removeStructural, addStructWalls, UNLABELED_POSTS, SHEAR_DEFAULTS } from '@/domain/plans/structural';
import { SHEAR_TYPES } from '@/domain/plans/hardware';
import { onConcrete as isOnConcrete } from '@/domain/plans/loose';
import { PLAN_KINDS, WALL_SIZES, KIND_LABEL, normWall, isDoubleWall, planGroups, groupKeysOf, wallLengthFt, storeWalls, mergeRedetect, planJunctions } from '@/domain/plans/sync';
import { JUNCTION_DEFAULTS } from '@/domain/plans/junctions';

const COMMON_SCALES = [`1/16" = 1'-0"`, `3/32" = 1'-0"`, `1/8" = 1'-0"`, `3/16" = 1'-0"`, `1/4" = 1'-0"`, `3/8" = 1'-0"`, `1/2" = 1'-0"`, `3/4" = 1'-0"`, `1" = 1'-0"`];
const DEFAULT_THICK = { '2x4': 4.75, '2x6': 6.75, '2x8': 8.5, '2x10': 10.5 };
const STUD_DEPTH = { '2x4': 3.5, '2x6': 5.5, '2x8': 7.25, '2x10': 9.25 };
/** Drawn thickness of a new wall: studs + drywall (+ 1" gap for a double wall). */
const thickOf = (n) => (n.double ? STUD_DEPTH[n.size] + STUD_DEPTH[n.size2] + 2.25 : DEFAULT_THICK[n.size] || 4.75);
const wallTitle = (w) => {
  const n = normWall(w);
  return n.double
    ? `${KIND_LABEL[n.kind] || n.kind} ${n.size} + ${KIND_LABEL[n.kind2] || n.kind2} ${n.size2}`
    : `${KIND_LABEL[n.kind] || n.kind} ${n.size}`;
};
const newId = () => `pw-${Math.random().toString(36).slice(2, 9)}`;
const RENDER_SCALE = 1.5;

const ftIn = (ft) => {
  const totalIn = Math.round((Number(ft) || 0) * 12 * 4) / 4;
  const f = Math.floor(totalIn / 12);
  const i = totalIn - f * 12;
  const whole = Math.floor(i);
  const q = { 0.25: ' 1/4', 0.5: ' 1/2', 0.75: ' 3/4' }[i - whole] || '';
  return `${f}'-${whole}${q}"`;
};
const fmtLF = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');

/* ───────────────────────── drawing ───────────────────────── */

function PlanCanvas({ plan, imgUrl, selected, tool, display, onSelect, onMoveEnd, onAddGap, onAddWall, onAddOpening, onAddPost, onAddHardware, onAddFloorHole, onAddBlocking, onCalibrate, onDeleteSelected }) {
  const W = plan.w || 2592;
  const H = plan.h || 1728;
  const k = plan.ptPerFt || 0;
  const svgRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, w: W, h: H });
  const [draft, setDraft] = useState(null); // { a:[x,y], b:[x,y] }
  const [hover, setHover] = useState(null);
  const drag = useRef(null);
  const endDrag = useRef(null);
  const [endPt, setEndPt] = useState(null);
  const junctions = useMemo(() => (k ? planJunctions(plan) : []), [plan, k]);

  useEffect(() => { setView({ x: 0, y: 0, w: W, h: H }); }, [W, H]);
  useEffect(() => { setDraft(null); }, [tool]);

  const toPt = useCallback((e) => {
    const svg = svgRef.current;
    const p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM().inverse());
    return [q.x, q.y];
  }, []);
  const pxToPt = useCallback(() => {
    const r = svgRef.current?.getBoundingClientRect();
    return r ? Math.max(view.w / r.width, view.h / r.height) : 1;
  }, [view]);

  // snap: wall end points within 10 px, then square to the axes within 6°
  const snap = useCallback((pt, from, exclude) => {
    const tol = 10 * pxToPt();
    let best = null;
    for (const w of plan.walls || []) {
      if (exclude && w.id === exclude) continue;
      for (const q of [[w.x1, w.y1], [w.x2, w.y2]]) {
        const d = Math.hypot(q[0] - pt[0], q[1] - pt[1]);
        if (d < tol && (!best || d < best.d)) best = { d, q };
      }
    }
    if (best) return best.q;
    // onto another wall's centre line: a T
    let line = null;
    for (const w of plan.walls || []) {
      if (exclude && w.id === exclude) continue;
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      if (!L) continue;
      const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L;
      const u = (pt[0] - w.x1) * ux + (pt[1] - w.y1) * uy;
      const off = Math.abs((pt[0] - w.x1) * -uy + (pt[1] - w.y1) * ux);
      const lim = tol + ((Number(w.t) || 5) / 24) * k;
      if (u > 0 && u < L && off < lim && (!line || off < line.off)) line = { off, q: [w.x1 + ux * u, w.y1 + uy * u], ux, uy };
    }
    if (line) {
      // square to the wall it meets when drawing from a point
      if (from) {
        const t = (line.q[0] - from[0]) * -line.uy + (line.q[1] - from[1]) * line.ux;
        const sq = [from[0] + -line.uy * t, from[1] + line.ux * t];
        if (Math.hypot(sq[0] - line.q[0], sq[1] - line.q[1]) < tol) return sq;
      }
      return line.q;
    }
    if (from) {
      const dx = pt[0] - from[0], dy = pt[1] - from[1];
      const ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI) % 90;
      if (ang < 6 || ang > 84) return Math.abs(dx) > Math.abs(dy) ? [pt[0], from[1]] : [from[0], pt[1]];
    }
    return pt;
  }, [plan.walls, pxToPt, k]);

  const zoomAt = useCallback((factor, cx, cy) => {
    setView((v) => {
      const w = Math.min(W * 1.2, Math.max(W / 60, v.w / factor));
      const h = (w / v.w) * v.h;
      const fx = cx === undefined ? 0.5 : (cx - v.x) / v.w;
      const fy = cy === undefined ? 0.5 : (cy - v.y) / v.h;
      const px = cx === undefined ? v.x + v.w / 2 : cx;
      const py = cy === undefined ? v.y + v.h / 2 : cy;
      return { x: px - w * fx, y: py - h * fy, w, h };
    });
  }, [W]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e) => { e.preventDefault(); const [x, y] = toPt(e); zoomAt(Math.exp(-e.deltaY * 0.0015), x, y); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [toPt, zoomAt]);

  const colors = display.colors;
  const hidden = display.hidden;
  const shown = useCallback((w) => !hidden[w.kind] || (isDoubleWall(w) && !hidden[w.kind2 || 'partition']), [hidden]);

  /** Where a point falls on a wall: distance along it from its start, and off it (sheet pt). */
  const onWall = (w, pt) => {
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
    const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L;
    const u = (pt[0] - w.x1) * ux + (pt[1] - w.y1) * uy;
    const off = Math.abs((pt[0] - w.x1) * -uy + (pt[1] - w.y1) * ux);
    return { u: Math.max(0, Math.min(L, u)), off, L, ux, uy };
  };
  const wallNear = (pt) => {
    const tol = 14 * pxToPt();
    let best = null;
    for (const w of plan.walls || []) {
      if (!shown(w)) continue;
      const r = onWall(w, pt);
      const lim = tol + ((Number(w.t) || 5) / 12) * k / 2;
      const u = (pt[0] - w.x1) * r.ux + (pt[1] - w.y1) * r.uy;
      if (r.off <= lim && u >= -tol && u <= r.L + tol && (!best || r.off < best.off)) best = { w, ...r };
    }
    return best;
  };

  const onPointerDown = (e) => {
    // dragging an end of the selected wall (the magnet snaps it to other walls)
    const handle = e.target.closest?.('[data-end]');
    if (handle && tool === 'select' && e.button === 0) {
      const [id, end] = handle.getAttribute('data-end').split(':');
      const w = (plan.walls || []).find((x) => x.id === id);
      if (w) {
        endDrag.current = { id, end, other: end === '1' ? [w.x2, w.y2] : [w.x1, w.y1] };
        setEndPt(end === '1' ? [w.x1, w.y1] : [w.x2, w.y2]);
        e.currentTarget.setPointerCapture?.(e.pointerId);
        e.stopPropagation();
        return;
      }
    }
    if ((tool === 'post' || tool === 'hardware') && e.button === 0) {
      const hit = wallNear(toPt(e));
      if (hit) (tool === 'post' ? onAddPost : onAddHardware)(hit.w.id, hit.u / k);
      return;
    }
    if (tool === 'opening' && e.button === 0) {
      const pt = toPt(e);
      if (!draft) {
        const hit = wallNear(pt);
        if (hit) setDraft({ wallId: hit.w.id, u0: hit.u, u1: hit.u });
        return;
      }
      const w = (plan.walls || []).find((x) => x.id === draft.wallId);
      const u1 = w ? onWall(w, pt).u : draft.u0;
      if (w && Math.abs(u1 - draft.u0) > 0.5 * k) onAddOpening(w.id, Math.min(draft.u0, u1) / k, Math.abs(u1 - draft.u0) / k);
      setDraft(null);
      return;
    }
    if (e.button === 1 || e.button === 2 || (tool === 'select' && !e.target.closest('[data-wall]'))) {
      drag.current = { sx: e.clientX, sy: e.clientY, view, moved: false, additive: e.shiftKey };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }
    if (tool === 'select') {
      const id = e.target.closest('[data-wall]').getAttribute('data-wall');
      onSelect([id], e.shiftKey || e.ctrlKey || e.metaKey);
      return;
    }
    const pt = tool === 'floorhole' ? toPt(e) : snap(toPt(e), draft?.a);
    if (!draft) { setDraft({ a: pt, b: pt }); return; }
    if (Math.hypot(pt[0] - draft.a[0], pt[1] - draft.a[1]) > 2) {
      if (tool === 'add') onAddWall(draft.a, pt);
      if (tool === 'calibrate') onCalibrate(draft.a, pt);
      if (tool === 'floorhole') onAddFloorHole(draft.a, pt);
      if (tool === 'blocking') onAddBlocking(draft.a, pt);
    }
    setDraft(null);
  };
  const onPointerMove = (e) => {
    if (endDrag.current) { setEndPt(snap(toPt(e), endDrag.current.other, endDrag.current.id)); return; }
    const d = drag.current;
    if (d) {
      const r = svgRef.current.getBoundingClientRect();
      const dx = ((e.clientX - d.sx) / r.width) * d.view.w;
      const dy = ((e.clientY - d.sy) / r.height) * d.view.h;
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true;
      setView({ ...d.view, x: d.view.x - dx, y: d.view.y - dy });
      return;
    }
    if (draft && tool === 'opening') {
      const w = (plan.walls || []).find((x) => x.id === draft.wallId);
      if (w) setDraft((dr) => ({ ...dr, u1: onWall(w, toPt(e)).u }));
      return;
    }
    if (draft) setDraft((dr) => ({ ...dr, b: tool === 'floorhole' ? toPt(e) : snap(toPt(e), dr.a) }));
  };
  const onPointerUp = () => {
    if (endDrag.current) {
      const ed = endDrag.current;
      endDrag.current = null;
      if (endPt) onMoveEnd(ed.id, ed.end, endPt);
      setEndPt(null);
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && tool === 'select' && !d.additive) onSelect([], false);
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setDraft(null); onSelect([], false); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) { e.preventDefault(); onDeleteSelected(); }
    if (e.key === '+' || e.key === '=') zoomAt(1.25);
    if (e.key === '-') zoomAt(0.8);
    if (e.key === '0') setView({ x: 0, y: 0, w: W, h: H });
  };

  const walls = plan.walls || [];
  const hoverWall = hover ? walls.find((w) => w.id === hover) : null;
  const draftFt = draft && k ? (tool === 'opening' ? Math.abs(draft.u1 - draft.u0) : Math.hypot(draft.b[0] - draft.a[0], draft.b[1] - draft.a[1])) / k : 0;
  const draftWall = draft && tool === 'opening' ? walls.find((w) => w.id === draft.wallId) : null;
  const readout = endPt && endDrag.current
    ? `${ftIn(Math.hypot(endPt[0] - endDrag.current.other[0], endPt[1] - endDrag.current.other[1]) / (k || 1))}`
    : draft
    ? (tool === 'opening' ? `Opening ${ftIn(draftFt)} wide` : tool === 'calibrate' ? `Distance on sheet: ${Math.hypot(draft.b[0] - draft.a[0], draft.b[1] - draft.a[1]).toFixed(1)} pt` : `${ftIn(draftFt)}`)
    : hoverWall ? `${wallTitle(hoverWall)} · ${ftIn(wallLengthFt(hoverWall, k))}${hoverWall.openings?.length ? ` · ${hoverWall.openings.length} opening${hoverWall.openings.length > 1 ? 's' : ''}` : ''}` : '';
  const hint = tool === 'add' ? 'Click the start and the end of the wall · Esc cancels'
    : tool === 'opening' ? 'Click one side of the opening on a wall, then the other side · Esc cancels'
    : tool === 'post' ? 'Click on a wall where the structural plans show a post'
    : tool === 'hardware' ? 'Click on a wall where the structural plans show this hardware'
    : tool === 'floorhole' ? 'Click two opposite corners of the floor opening (stair, shaft, open to below)'
    : tool === 'blocking' ? 'Click the start and the end of the blocking run'
    : tool === 'calibrate' ? 'Click both ends of a dimension you know'
      : 'Click a wall · Shift-click adds · drag to pan · wheel zooms · Delete removes';

  return (
    <div className="pt-canvas">
      <div className="pt-canvas__bar">
        <span className="ew-subtle">{hint}</span>
        <span className="pt-readout">{readout}</span>
        <span className="pt-zoom">
          <button type="button" className="ew-icon-btn" onClick={() => zoomAt(0.8)} title="Zoom out (−)" aria-label="Zoom out"><ZoomOut size={14} /></button>
          <span className="lc-tools__val">{Math.round((W / view.w) * 100)}%</span>
          <button type="button" className="ew-icon-btn" onClick={() => zoomAt(1.25)} title="Zoom in (+)" aria-label="Zoom in"><ZoomIn size={14} /></button>
          <button type="button" className="ew-icon-btn" onClick={() => setView({ x: 0, y: 0, w: W, h: H })} title="Whole sheet (0)" aria-label="Whole sheet"><Maximize2 size={14} /></button>
        </span>
      </div>
      <svg
        ref={svgRef}
        className={`pt-svg is-${tool}`}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        tabIndex={0}
        role="application"
        aria-label="Plan sheet with detected walls"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
      >
        <rect x={0} y={0} width={W} height={H} fill="#fff" />
        {imgUrl ? <image href={imgUrl} x={0} y={0} width={W} height={H} style={{ opacity: 0.55 }} /> : null}
        {plan.area ? (
          <path
            d={`M0 0H${W}V${H}H0Z M${plan.area.x0} ${plan.area.y0}V${plan.area.y1}H${plan.area.x1}V${plan.area.y0}Z`}
            fill="#6b6157" fillOpacity={0.14} fillRule="evenodd" pointerEvents="none"
          >
            <title>Border and title block: not searched for walls</title>
          </path>
        ) : null}
        {(plan.floorOpenings || []).map((o, i) => (
          <rect key={`fo${i}`} x={Math.min(o.x1, o.x2)} y={Math.min(o.y1, o.y2)} width={Math.abs(o.x2 - o.x1)} height={Math.abs(o.y2 - o.y1)} fill="url(#pt-hatch)" stroke="#7a746c" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}
        <defs>
          <pattern id="pt-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#7a746c" strokeWidth="1.2" />
          </pattern>
        </defs>
        <g>
          {walls.filter(shown).map((w) => {
            const t = Math.max(1, ((Number(w.t) || 5) / 12) * k);
            const on = selected.has(w.id);
            const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
            const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L;
            return (
              <g key={w.id} data-wall={w.id} onPointerEnter={() => setHover(w.id)} onPointerLeave={() => setHover((h) => (h === w.id ? null : h))}>
                <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke={on ? '#ff7a00' : colors[w.kind] || '#555'} strokeOpacity={on ? 0.95 : 0.6} strokeWidth={t} />
                {isDoubleWall(w) ? <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke={colors[w.kind2 || 'partition']} strokeOpacity={0.9} strokeWidth={t * 0.4} /> : null}
                {(w.openings || []).map((o, i) => {
                  if (hidden[o.type === 'door' ? 'door' : 'window']) return null;
                  const a = (o.atFt || 0) * k, b = a + (o.widthFt || 0) * k;
                  const mx = w.x1 + ux * (a + b) / 2, my = w.y1 + uy * (a + b) / 2;
                  return (
                    <g key={i}>
                      <line x1={w.x1 + ux * a} y1={w.y1 + uy * a} x2={w.x1 + ux * b} y2={w.y1 + uy * b} stroke={colors[o.type === 'door' ? 'door' : 'window']} strokeWidth={t * 0.55} />
                      {o.typeId ? <text x={mx} y={my - t} className="pt-otag" fontSize={Math.max(3, t * 0.9)} textAnchor="middle">{o.typeId}</text> : null}
                    </g>
                  );
                })}
                {hidden.post ? null : (w.posts || []).map((p, i) => {
                  const pt = (plan.postTypes || []).find((x) => x.id === p.typeId);
                  const half = (postWidthIn(pt) / 12) * k / 2;
                  const a = (Number(p.atFt) || 0) * k;
                  const cx = w.x1 + ux * a, cy = w.y1 + uy * a;
                  const nx = -uy, ny = ux, tt = t / 2 + 0.6;
                  const pts = [[-half, -tt], [half, -tt], [half, tt], [-half, tt]].map(([da, dc]) => `${cx + ux * da + nx * dc},${cy + uy * da + ny * dc}`).join(' ');
                  return (
                    <g key={`p${i}`}>
                      <polygon points={pts} fill={colors.post} />
                      <text x={cx} y={cy + t * 1.6 + 2} className="pt-otag" fontSize={Math.max(3, t * 0.9)} textAnchor="middle">{p.typeId}</text>
                    </g>
                  );
                })}
                {hidden.hardware ? null : (w.hardware || []).map((h, i) => {
                  const a = (Number(h.atFt) || 0) * k;
                  const cx = w.x1 + ux * a, cy = w.y1 + uy * a, r = Math.max(2, t * 0.8);
                  return (
                    <g key={`h${i}`}>
                      <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} fill={colors.hardware} />
                      <text x={cx} y={cy - r - 1.5} className="pt-otag" fontSize={Math.max(3, t * 0.9)} textAnchor="middle">{h.typeId}</text>
                    </g>
                  );
                })}
                {hidden.sheartag || !(w.shear || []).length ? null : (() => {
                  const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
                  const fs = Math.max(4, t * 1.1);
                  const label = w.shear.map((x) => `${x.type} ${Math.round(x.lengthFt * 10) / 10}'`).join(' · ');
                  return <text x={mx - uy * (t + fs)} y={my + ux * (t + fs) + fs / 3} className="pt-shtag" fill={colors.sheartag} fontSize={fs} textAnchor="middle">{label}</text>;
                })()}
                <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke" className="pt-hit" />
              </g>
            );
          })}
        </g>
        {hidden.junction ? null : junctions.map((j, i) => {
          const r = Math.max(1.5, k * 0.35);
          return j.type === 'corner'
            ? <rect key={`jn${i}`} x={j.x - r} y={j.y - r} width={r * 2} height={r * 2} fill="none" stroke={colors.junction} strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none"><title>Corner: extra studs on this wall</title></rect>
            : <circle key={`jn${i}`} cx={j.x} cy={j.y} r={r} fill="none" stroke={colors.junction} strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none"><title>T: backing studs in the wall it meets</title></circle>;
        })}
        {tool === 'select' && selected.size === 1 ? (() => {
          const w = walls.find((x) => selected.has(x.id));
          if (!w) return null;
          const r = Math.max(2.5, 7 * pxToPt());
          const drg = endDrag.current;
          const p1 = drg && drg.id === w.id && drg.end === '1' && endPt ? endPt : [w.x1, w.y1];
          const p2 = drg && drg.id === w.id && drg.end === '2' && endPt ? endPt : [w.x2, w.y2];
          return (
            <g>
              {endPt ? <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke="#ff7a00" strokeWidth={Math.max(1, ((Number(w.t) || 5) / 12) * k)} strokeOpacity={0.5} pointerEvents="none" /> : null}
              {[['1', p1], ['2', p2]].map(([end, p]) => (
                <circle key={end} data-end={`${w.id}:${end}`} cx={p[0]} cy={p[1]} r={r} className="pt-end" fill="#fff" stroke="#ff7a00" strokeWidth={2} vectorEffect="non-scaling-stroke">
                  <title>Drag to move this end: it snaps to wall ends and to the side of other walls</title>
                </circle>
              ))}
            </g>
          );
        })() : null}
        {hidden.blocking ? null : (plan.blocking || []).map((b, i) => (
          <line key={`bk${i}`} x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} stroke={colors.blocking} strokeWidth={4} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />
        ))}
        {hidden.beam ? null : (plan.beams || []).filter((b) => b.x1 !== undefined).map((b) => (
          <g key={`bm${b.id}`} pointerEvents="none">
            <line x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} stroke={colors.beam} strokeWidth={3} strokeDasharray="10 4" vectorEffect="non-scaling-stroke" />
            <text x={(b.x1 + b.x2) / 2} y={(b.y1 + b.y2) / 2 - Math.max(2, k * 0.3)} className="pt-shtag" fill={colors.beam} fontSize={Math.max(4, k * 0.8)} textAnchor="middle">{b.mark}{b.note ? ` ${b.note}` : ''}</text>
          </g>
        ))}
        {hidden.structwall ? null : (plan.structural?.gaps || []).map((g, i) => (
          <line
            key={`sg${i}`} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} className="pt-gap"
            stroke={colors.structwall} strokeWidth={5} strokeDasharray="8 5" strokeOpacity={0.85} vectorEffect="non-scaling-stroke"
            onPointerDown={(e) => { if (tool !== 'select') return; e.stopPropagation(); onAddGap(i); }}
          >
            <title>{`Only on the structural plan: ${Math.round(g.lengthFt * 10) / 10}' wall. Click to add it as a bearing wall.`}</title>
          </line>
        ))}
        {hidden.missed ? null : (plan.structural?.missed || []).map((m, i) => {
          const r = Math.max(3, k * 0.6);
          return (
            <g key={`ms${i}`} stroke={colors.missed} strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none">
              <line x1={m.x - r} y1={m.y - r} x2={m.x + r} y2={m.y + r} vectorEffect="non-scaling-stroke" />
              <line x1={m.x - r} y1={m.y + r} x2={m.x + r} y2={m.y - r} vectorEffect="non-scaling-stroke" />
              <title>{`Not on a wall: ${m.kind}${m.name ? ` ${m.name}` : ''}`}</title>
            </g>
          );
        })}
        {draftWall ? (() => {
          const r = onWall(draftWall, [draftWall.x1, draftWall.y1]);
          const a = Math.min(draft.u0, draft.u1), b = Math.max(draft.u0, draft.u1);
          return <line x1={draftWall.x1 + r.ux * a} y1={draftWall.y1 + r.uy * a} x2={draftWall.x1 + r.ux * b} y2={draftWall.y1 + r.uy * b} stroke="#ff7a00" strokeWidth={6} vectorEffect="non-scaling-stroke" strokeOpacity={0.8} />;
        })() : null}
        {draft && draft.a && tool === 'floorhole' ? (
          <rect x={Math.min(draft.a[0], draft.b[0])} y={Math.min(draft.a[1], draft.b[1])} width={Math.abs(draft.b[0] - draft.a[0])} height={Math.abs(draft.b[1] - draft.a[1])} fill="#ff7a00" fillOpacity={0.15} stroke="#ff7a00" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ) : null}
        {draft && draft.a && tool !== 'floorhole' ? (
          <line x1={draft.a[0]} y1={draft.a[1]} x2={draft.b[0]} y2={draft.b[1]} stroke={tool === 'calibrate' ? '#e5007a' : '#ff7a00'} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray={tool === 'calibrate' ? '6 4' : undefined} />
        ) : null}
      </svg>
    </div>
  );
}

/* ───────────────────────── page ───────────────────────── */

/** Options of the structural import, as placeStructural() takes them. */
const structOpts = (o = {}) => ({
  posts: o.posts !== false, rods: o.rods !== false, callouts: o.callouts !== false, shear: o.shear !== false, bearing: o.bearing !== false, beams: o.beams !== false,
  unlabeled: o.unlabeled || UNLABELED_POSTS,
});
const placeFrom = (p, st) => {
  const r = placeStructural(p, st.found || {}, structOpts(st.opts));
  return { ...r.plan, structural: { ...st, placed: r.placed, missed: r.missed, gaps: r.gaps, confirmed: r.confirmed } };
};
/** Walls the structural sheet draws, in its own points (the same detection as the plan). */
const structWalls = (sp, k) => {
  const first = detectWalls(sp, { ptPerFt: k });
  return (first.suggested.length ? detectWalls(sp, { ptPerFt: k, styles: first.suggested }) : first).walls;
};


export default function PlanTakeoffView() {
  const { projectData, updateProject, isLoaded, blankSection, projectId, appId } = useProject();
  const confirm = useConfirm();
  const est = useMemo(() => projectData?.estimateData || {}, [projectData]);
  const levels = useMemo(() => (est.levels || []).filter(Boolean), [est.levels]);
  const [activeId, setActiveId] = useState(null);
  const level = levels.find((l) => l.id === activeId) || levels[0];
  const plan = useMemo(() => level?.plan || null, [level]);

  const [selected, setSelected] = useState(() => new Set());
  const [tool, setTool] = useState('select');
  const [openingType, setOpeningType] = useState('window');
  const [postChoice, setPostChoice] = useState(''); // a type id, or '' = the first type (made if none)
  const [copyFrom, setCopyFrom] = useState('');
  const [copyPosts, setCopyPosts] = useState(true);
  const [copyHardware, setCopyHardware] = useState(true);
  const display = useMemo(() => displayOf(est.planDisplay), [est.planDisplay]);
  const setDisplay = useCallback((next) => updateProject((prev) => ({ ...prev, planDisplay: next })), [updateProject]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [imgUrl, setImgUrl] = useState(null);
  const [fileMissing, setFileMissing] = useState(false);
  const [calib, setCalib] = useState(null); // { distPt, ft, inch }
  const pageCache = useRef(new Map()); // fileKey|page → extracted page
  const fileInput = useRef(null);

  useEffect(() => { setSelected(new Set()); setTool('select'); setCalib(null); }, [level?.id]);

  /** Change this level's plan; linked sections follow in the same step (one undo). */
  const setPlan = useCallback((fn) => {
    if (!level) return;
    const id = level.id;
    updateProject((prev) => withPlanLoose({
      ...prev,
      levels: (prev.levels || []).map((l) => {
        if (l.id !== id) return l;
        const next = fn(l.plan || {});
        return commitPlan(l, next, blankSection, scheduleOpts(prev, id, next));
      }),
    }));
  }, [level, updateProject, blankSection]);

  /** The project's header schedule changed: every level's window and door types follow. */
  const setSchedule = useCallback((schedule) => {
    updateProject((prev) => {
      const est2 = { ...prev, headerSchedule: schedule };
      return { ...est2, levels: (est2.levels || []).map((l) => (l?.plan ? commitPlan(l, l.plan, blankSection, scheduleOpts(est2, l.id)) : l)) };
    });
  }, [updateProject, blankSection]);

  const openPdf = useCallback(async (key) => {
    const blob = await loadPlanFile(key);
    if (!blob) return null;
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    return { pdfjs, doc };
  }, []);

  const renderPage = useCallback(async (doc, pageNo) => {
    const page = await doc.getPage(pageNo);
    const vp = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, canvas }).promise;
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    return { page, url: URL.createObjectURL(blob) };
  }, []);

  // show the stored sheet of this level
  useEffect(() => {
    let cancelled = false;
    let made = null;
    setImgUrl(null); setFileMissing(false);
    if (!plan?.fileKey) return undefined;
    (async () => {
      try {
        const opened = await openPdf(plan.fileKey);
        if (cancelled) return;
        if (!opened) { setFileMissing(true); return; }
        const { url } = await renderPage(opened.doc, plan.page || 1);
        made = url;
        if (cancelled) { URL.revokeObjectURL(url); return; }
        setImgUrl(url);
      } catch (err) {
        if (!cancelled) setError(`Could not show the PDF: ${err.message || err}`);
      }
    })();
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made); };
  }, [plan?.fileKey, plan?.page, openPdf, renderPage]);

  const extracted = useCallback(async (key, pageNo) => {
    const ck = `${key}|${pageNo}`;
    if (pageCache.current.has(ck)) return pageCache.current.get(ck);
    const opened = await openPdf(key);
    if (!opened) throw new Error('The PDF of this level is not in this browser. Attach it again.');
    const page = await opened.doc.getPage(pageNo);
    const data = await extractPage(page, opened.pdfjs.OPS);
    pageCache.current.set(ck, data);
    return data;
  }, [openPdf]);

  /** Find walls on the sheet; styles = line styles to use (undefined → suggested). */
  const runDetect = useCallback(async ({ key, pageNo, ptPerFt, styles, base = {}, merge = false }) => {
    setBusy('Reading the drawing…');
    await new Promise((r) => setTimeout(r, 30));
    const data = await extracted(key, pageNo);
    const scale = ptPerFt ? null : detectScale(data.texts);
    const k = ptPerFt || scale?.ptPerFt;
    const meta = { ...base, w: data.width, h: data.height, segments: data.segments.length };
    if (!k) {
      setPlan((p) => ({ ...p, ...meta, walls: p.walls || [] }));
      setError('No scale note was found on this sheet. Pick the scale or calibrate it with a dimension you know, then detect the walls.');
      setBusy('');
      return;
    }
    setBusy('Finding walls…');
    await new Promise((r) => setTimeout(r, 30));
    const first = detectWalls(data, { ptPerFt: k });
    const use = styles || first.suggested;
    const r = styles || use.length ? detectWalls(data, { ptPerFt: k, styles: use }) : first;
    setPlan((p) => ({
      ...p, ...meta,
      ptPerFt: k,
      scaleLabel: scale ? scale.label : p.scaleLabel,
      scaleSource: scale ? 'sheet' : p.scaleSource,
      styles: use,
      styleList: first.styles.slice(0, 12),
      area: r.area,
      walls: merge ? mergeRedetect(p.walls, p.removed, storeWalls(r.walls, newId), k) : storeWalls(r.walls, newId),
      removed: merge ? p.removed : [],
      detectedAt: new Date().toISOString(),
    }));
    // what the structural sheet put on the walls goes onto the walls found now
    if (merge) setPlan((p) => (p.structural?.found && p.structural.placed ? placeFrom(p, p.structural) : p));
    setSelected(new Set());
    setBusy('');
  }, [extracted, setPlan]);

  /* ── one sheet out of a drawing set ── */
  const [sheetReq, setSheetReq] = useState(null);
  /** The file itself when it has one page; else the sheet picked from it, cut out as a PDF of its own (null: cancelled). */
  const chooseSheet = useCallback(async (file, purpose) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdfjs = await loadPdfjs();
    const task = pdfjs.getDocument({ data: bytes.slice() });
    const doc = await task.promise;
    const done = () => { try { task.destroy(); } catch { /* already gone */ } };
    if (doc.numPages <= 1) { done(); return file; }
    setBusy('');
    const pick = await new Promise((resolve) => setSheetReq({ doc, fileName: file.name, purpose, bytes, resolve }));
    setSheetReq(null);
    done();
    if (!pick) return null;
    setBusy('Cutting the sheet out…');
    const out = await extractSheet(bytes, pick.pageNo);
    const base = file.name.replace(/\.pdf$/i, '');
    return new File([out], `${base} - ${pick.number || `page ${pick.pageNo}`}.pdf`, { type: 'application/pdf' });
  }, []);
  const downloadSheet = useCallback(async (bytes, fileName, pageNo, number) => {
    const out = await extractSheet(bytes, pageNo);
    const url = URL.createObjectURL(new Blob([out], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${fileName.replace(/\.pdf$/i, '')} - ${number || `page ${pageNo}`}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, []);

  const onFile = useCallback(async (picked) => {
    if (!picked || !level) return;
    setError('');
    try {
      setBusy('Opening the PDF…');
      const file = await chooseSheet(picked, 'floor plan');
      if (!file) { setBusy(''); return; }
      const key = `${projectId || 'project'}:${level.id}`;
      await savePlanFile(key, file);
      pageCache.current.clear();
      const pdfjs = await loadPdfjs();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      setPlan(() => ({ fileName: file.name, fileKey: key, page: 1, pageCount: doc.numPages, linked: Boolean(plan?.linked), walls: [] }));
      await runDetect({ key, pageNo: 1, base: { fileName: file.name, fileKey: key, page: 1, pageCount: doc.numPages } });
    } catch (err) {
      setBusy('');
      setError(`Could not read the PDF: ${err.message || err}`);
    }
  }, [level, projectId, setPlan, runDetect, plan?.linked, chooseSheet]);

  const reattach = useCallback(async (file) => {
    if (!file || !plan?.fileKey) return;
    await savePlanFile(plan.fileKey, file);
    pageCache.current.clear();
    setFileMissing(false);
    setPlan((p) => ({ ...p, fileName: file.name }));
  }, [plan?.fileKey, setPlan]);

  /* ── structural sheet: posts, tie-downs, hold-downs and shear tags ── */
  const readStruct = useCallback(async ({ key, pageNo, fileName, pageCount }) => {
    setError('');
    try {
      setBusy('Reading the structural plan…');
      await new Promise((r) => setTimeout(r, 30));
      const sp = await extracted(key, pageNo);
      const ap = await extracted(plan.fileKey, plan.page || 1);
      const sk = detectScale(sp.texts)?.ptPerFt || plan.ptPerFt;
      const align = alignSheets(ap.texts, sp.texts, plan.ptPerFt / sk);
      const found = align ? readStructural(sp, { ptPerFt: sk, align, walls: structWalls(sp, sk) }) : null;
      setPlan((p) => {
        const st = { fileName, fileKey: key, page: pageNo, pageCount, ptPerFt: sk, align, found, opts: p.structural?.opts || {} };
        return found ? placeFrom(removeStructural(p), st) : { ...removeStructural(p), structural: st };
      });
      setBusy('');
    } catch (err) { setBusy(''); setError(`Could not read the structural plan: ${err.message || err}`); }
  }, [extracted, plan?.fileKey, plan?.page, plan?.ptPerFt, setPlan]);
  const onStructFile = useCallback(async (picked) => {
    if (!picked || !level || !plan?.fileKey) return;
    try {
      setBusy('Opening the PDF…');
      const file = await chooseSheet(picked, 'structural framing plan');
      if (!file) { setBusy(''); return; }
      const key = `${projectId || 'project'}:${level.id}:struct`;
      await savePlanFile(key, file);
      for (const ck of [...pageCache.current.keys()]) if (ck.startsWith(`${key}|`)) pageCache.current.delete(ck);
      const pdfjs = await loadPdfjs();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      await readStruct({ key, pageNo: 1, fileName: file.name, pageCount: doc.numPages });
    } catch (err) { setBusy(''); setError(`Could not read the PDF: ${err.message || err}`); }
  }, [level, plan?.fileKey, projectId, readStruct, chooseSheet]);

  const detectAgain = useCallback(async (opts = {}) => {
    if (!plan?.fileKey) return;
    setError('');
    try {
      // walls you drew, changed or deleted are kept as you left them
      await runDetect({ key: plan.fileKey, pageNo: plan.page || 1, ptPerFt: plan.ptPerFt, styles: opts.styles ?? plan.styles, merge: true });
    } catch (err) { setBusy(''); setError(err.message || String(err)); }
  }, [plan, runDetect]);

  /* ── wall edits ── */
  const patchWalls = useCallback((ids, patch) => {
    const set = new Set(ids);
    setPlan((p) => ({
      ...p,
      walls: (p.walls || []).map((w) => {
        if (!set.has(w.id)) return w;
        const cur = { ...w, ...normWall(w) }; // older '(2)2x4' sizes become double + two sizes
        const next = { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch), auto: false };
        if (!next.double) { delete next.kind2; delete next.size2; }
        return next;
      }),
    }));
  }, [setPlan]);
  /** Move one end of a wall (dragged on the drawing, or a typed length): openings past the new end go. */
  const moveEnd = useCallback((id, end, pt) => {
    setPlan((p) => ({
      ...p,
      walls: (p.walls || []).map((w) => {
        if (w.id !== id) return w;
        const next = end === '1' ? { ...w, x1: pt[0], y1: pt[1] } : { ...w, x2: pt[0], y2: pt[1] };
        const L = Math.hypot(next.x2 - next.x1, next.y2 - next.y1) / (p.ptPerFt || 1);
        // openings are measured from the start: moving the start shifts them
        const shift = end === '1' ? (Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / (p.ptPerFt || 1)) - L : 0;
        const openings = (w.openings || []).map((o) => ({ ...o, atFt: Math.round((o.atFt - shift) * 100) / 100 })).filter((o) => o.atFt >= 0 && o.atFt + o.widthFt <= L + 0.01);
        const { lenFt, ...rest } = next; // the drawing is the length now
        return { ...rest, openings, auto: false, ...(openings.length !== (w.openings || []).length ? { openingsEdited: true } : {}) };
      }),
    }));
  }, [setPlan]);
  const deleteWalls = useCallback((ids) => {
    const set = new Set(ids);
    setPlan((p) => {
      // detected walls you delete stay deleted when the sheet is detected again
      const gone = (p.walls || []).filter((w) => set.has(w.id) && !w.added).map(({ x1, y1, x2, y2, t }) => ({ x1, y1, x2, y2, t }));
      return { ...p, walls: (p.walls || []).filter((w) => !set.has(w.id)), removed: [...(p.removed || []), ...gone].slice(-500) };
    });
    setSelected(new Set());
  }, [setPlan]);
  const lastProps = useRef({ kind: 'partition', size: '2x4', double: false });
  const addWall = useCallback((a, b) => {
    const n = normWall(lastProps.current);
    const w = { id: newId(), x1: a[0], y1: a[1], x2: b[0], y2: b[1], t: thickOf(n), kind: n.kind, size: n.size, auto: false, added: true, openings: [] };
    if (n.double) Object.assign(w, { double: true, kind2: n.kind2, size2: n.size2 });
    setPlan((p) => ({ ...p, walls: [...(p.walls || []), w] }));
    setSelected(new Set([w.id]));
  }, [setPlan]);

  const addOpening = useCallback((wallId, atFt, widthFt) => {
    const r2 = (v) => Math.round(v * 100) / 100;
    setPlan((p) => ({
      ...p,
      walls: (p.walls || []).map((w) => (w.id !== wallId ? w : {
        ...w, auto: false, openingsEdited: true,
        openings: [...(w.openings || []), { type: openingType, atFt: r2(atFt), widthFt: r2(widthFt) }].sort((a, b) => a.atFt - b.atFt),
      })),
    }));
    setSelected(new Set([wallId]));
  }, [setPlan, openingType]);
  const addPost = useCallback((wallId, atFt) => {
    setPlan((p) => {
      let types = p.postTypes || [];
      let typeId = postChoice && types.some((t) => t.id === postChoice) ? postChoice : types[0]?.id;
      if (postChoice === '__solid' || postChoice === '__builtup' || !typeId) {
        const t = newPostType(types, postChoice === '__solid' ? 'solid' : 'builtup');
        types = [...types, t];
        typeId = t.id;
      }
      return {
        ...p,
        postTypes: types,
        walls: (p.walls || []).map((w) => (w.id !== wallId ? w : { ...w, auto: false, posts: [...(w.posts || []), { atFt: Math.round(atFt * 100) / 100, typeId }].sort((a, b) => a.atFt - b.atFt) })),
      };
    });
    if (postChoice === '__solid' || postChoice === '__builtup') setPostChoice('');
    setSelected(new Set([wallId]));
  }, [setPlan, postChoice]);
  const [hwChoice, setHwChoice] = useState('');
  const [blkKind, setBlkKind] = useState('bath');
  const addFloorHole = useCallback((a, b) => setPlan((p) => ({ ...p, floorOpenings: [...(p.floorOpenings || []), { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }] })), [setPlan]);
  const addBlocking = useCallback((a, b) => setPlan((p) => ({ ...p, blocking: [...(p.blocking || []), { x1: a[0], y1: a[1], x2: b[0], y2: b[1], kind: blkKind }] })), [setPlan, blkKind]);
  const addHardware = useCallback((wallId, atFt) => {
    setPlan((p) => {
      let types = p.hardwareTypes || [];
      let typeId = hwChoice && types.some((t) => t.id === hwChoice) ? hwChoice : types.find((t) => (t.rule || 'each') === 'each')?.id;
      if (hwChoice === '__new' || !typeId) {
        const t = newHardwareType(types);
        types = [...types, t];
        typeId = t.id;
      }
      return {
        ...p,
        hardwareTypes: types,
        walls: (p.walls || []).map((w) => (w.id !== wallId ? w : { ...w, auto: false, hardware: [...(w.hardware || []), { atFt: Math.round(atFt * 100) / 100, typeId }].sort((a, b) => a.atFt - b.atFt) })),
      };
    });
    if (hwChoice === '__new') setHwChoice('');
    setSelected(new Set([wallId]));
  }, [setPlan, hwChoice]);
  const patchHardware = useCallback((wallId, fn) => {
    setPlan((p) => ({ ...p, walls: (p.walls || []).map((w) => (w.id !== wallId ? w : { ...w, auto: false, hardware: fn(w.hardware || []).sort((a, b) => a.atFt - b.atFt) })) }));
  }, [setPlan]);
  const patchPosts = useCallback((wallId, fn) => {
    setPlan((p) => ({ ...p, walls: (p.walls || []).map((w) => (w.id !== wallId ? w : { ...w, auto: false, posts: fn(w.posts || []).sort((a, b) => a.atFt - b.atFt) })) }));
  }, [setPlan]);
  const patchOpenings = useCallback((wallId, fn) => {
    setPlan((p) => ({
      ...p,
      walls: (p.walls || []).map((w) => (w.id !== wallId ? w : { ...w, auto: false, openingsEdited: true, openings: fn(w.openings || []).sort((a, b) => a.atFt - b.atFt) })),
    }));
  }, [setPlan]);

  const onSelect = useCallback((ids, additive) => {
    setSelected((prev) => {
      if (!additive) return new Set(ids);
      const next = new Set(prev);
      ids.forEach((id) => (next.has(id) ? next.delete(id) : next.add(id)));
      return next;
    });
  }, []);

  const setScale = useCallback((ptPerFt, label, source) => {
    setPlan((p) => ({ ...p, ptPerFt, scaleLabel: label, scaleSource: source }));
  }, [setPlan]);

  const groups = useMemo(() => planGroups(plan), [plan]);
  const totals = useMemo(() => {
    const walls = plan?.walls || [];
    let doors = 0, windows = 0;
    walls.forEach((w) => (w.openings || []).forEach((o) => { if (o.type === 'door') doors += 1; else windows += 1; }));
    return { walls: walls.length, doubles: walls.filter(isDoubleWall).length, lf: groups.reduce((s, g) => s + g.lengthFt, 0), doors, windows };
  }, [plan, groups]);
  const sel = useMemo(() => (plan?.walls || []).filter((w) => selected.has(w.id)), [plan, selected]);
  const use = useMemo(() => typeUse(plan), [plan]);
  const hwCounts = useMemo(() => hardwareCounts(plan), [plan]);
  const postUse = useMemo(() => {
    const m = new Map();
    for (const w of plan?.walls || []) for (const p of w.posts || []) m.set(p.typeId, (m.get(p.typeId) || 0) + 1);
    return m;
  }, [plan]);
  const [pickedType, setPickedType] = useState(null);

  const toggleLink = useCallback(async () => {
    if (!plan) return;
    if (plan.linked) {
      const ok = await confirm({
        title: 'Stop feeding Wall panels from the plan?',
        message: 'The plan sections stay with their current lengths and become normal sections you type in.',
        confirmLabel: 'Unlink',
      });
      if (!ok) return;
      const id = level.id;
      updateProject((prev) => ({
        ...prev,
        levels: (prev.levels || []).map((l) => {
          if (l.id !== id) return l;
          const strip = (list) => (list || []).map((s) => (s?.planKey ? { ...s, planKey: undefined, planSize: undefined } : s));
          return { ...l, plan: { ...l.plan, linked: false }, exteriorSections: strip(l.exteriorSections), interiorSections: strip(l.interiorSections) };
        }),
      }));
    } else {
      setPlan((p) => ({ ...p, linked: true }));
    }
  }, [plan, confirm, level, updateProject, setPlan]);

  if (!isLoaded || !projectData) {
    return (
      <div className="app-content">
        <PageHeader icon={ScanLine} title="Plan takeoff" />
        <div className="empty-state">Open or create a project in Projects to measure walls from its plans.</div>
      </div>
    );
  }

  const fileButton = (label, onPick, primary = false) => (
    <button type="button" className={`ew-btn${primary ? ' ew-btn--primary' : ''}`} onClick={() => { fileInput.current.onpick = onPick; fileInput.current.click(); }} disabled={Boolean(busy)}>
      <Upload size={14} /> {label}
    </button>
  );
  const scaleValue = plan?.ptPerFt ? (COMMON_SCALES.find((s) => Math.abs(parseScaleText(s).ptPerFt - plan.ptPerFt) < 1e-6) || 'custom') : '';

  return (
    <div className="app-content">
      <PageHeader
        icon={ScanLine}
        title="Plan takeoff"
        meta={plan?.fileName ? `${plan.fileName}${plan.pageCount > 1 ? ` · sheet ${plan.page} of ${plan.pageCount}` : ''}` : 'Walls measured from the floor plan PDF'}
      />
      {sheetReq ? (
        <SheetPicker
          doc={sheetReq.doc} fileName={sheetReq.fileName} purpose={sheetReq.purpose}
          onPick={(pageNo, sh) => sheetReq.resolve({ pageNo, number: sh?.number })}
          onDownload={(pageNo, sh) => downloadSheet(sheetReq.bytes, sheetReq.fileName, pageNo, sh?.number)}
          onCancel={() => sheetReq.resolve(null)}
        />
      ) : null}
      <input
        ref={fileInput} type="file" accept="application/pdf,.pdf" hidden
        onChange={(e) => { const f = e.target.files?.[0]; const cb = fileInput.current.onpick; e.target.value = ''; if (f && cb) cb(f); }}
      />

      <div className="lc-bar">
        <div className="lc-tabs" role="tablist" aria-label="Levels">
          {levels.map((l, i) => (
            <button key={l.id} type="button" role="tab" aria-selected={l.id === level?.id} className={`lc-tab${l.id === level?.id ? ' is-on' : ''}`} onClick={() => setActiveId(l.id)}>
              {l.name || `Level ${i + 1}`}{l.plan?.walls?.length ? ' •' : ''}
            </button>
          ))}
        </div>
        {plan?.fileKey ? (
          <div className="lc-dims">
            {plan.pageCount > 1 ? (
              <label className="fld"><span>Sheet</span>
                <select className="ew-select" style={{ width: 64 }} value={plan.page || 1} onChange={async (e) => {
                  const pageNo = Number(e.target.value);
                  setPlan((p) => ({ ...p, page: pageNo }));
                  try { await runDetect({ key: plan.fileKey, pageNo, base: { page: pageNo } }); } catch (err) { setBusy(''); setError(err.message || String(err)); }
                }}>
                  {Array.from({ length: plan.pageCount }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                </select>
              </label>
            ) : null}
            <label className="fld" title={plan.scaleSource === 'sheet' ? 'Read from the scale note on the sheet' : plan.scaleSource === 'calibrated' ? 'Set from a dimension you measured' : 'Picked by hand'}>
              <span>Scale</span>
              <select className="ew-select" style={{ width: 128 }} value={scaleValue} onChange={(e) => {
                const s = parseScaleText(e.target.value);
                if (s) setScale(s.ptPerFt, s.label, 'manual');
              }}>
                {!plan.ptPerFt ? <option value="">Pick a scale</option> : null}
                {scaleValue === 'custom' ? <option value="custom">{plan.scaleLabel || 'Calibrated'}</option> : null}
                {COMMON_SCALES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            {plan.scaleSource === 'sheet' ? <span className="ew-subtle">from the sheet</span> : plan.scaleSource === 'calibrated' ? <span className="ew-subtle">calibrated</span> : null}
            <div className="pt-tools" role="toolbar" aria-label="Tools">
              <button type="button" className={`ew-btn${tool === 'select' ? ' is-on' : ''}`} onClick={() => setTool('select')} title="Select walls"><MousePointer2 size={14} /> Select</button>
              <button type="button" className={`ew-btn${tool === 'add' ? ' is-on' : ''}`} onClick={() => setTool('add')} title="Draw a wall the detection missed" disabled={!plan.ptPerFt}><PenLine size={14} /> Add wall</button>
              <button type="button" className={`ew-btn${tool === 'opening' ? ' is-on' : ''}`} onClick={() => setTool('opening')} title="Mark a window or door the detection missed: click both sides of it on a wall" disabled={!plan.ptPerFt}><DoorOpen size={14} /> Add opening</button>
              {tool === 'opening' ? (
                <select className="ew-select" style={{ width: 84 }} value={openingType} onChange={(e) => setOpeningType(e.target.value)} aria-label="Opening type">
                  <option value="window">Window</option>
                  <option value="door">Door</option>
                </select>
              ) : null}
              <button type="button" className={`ew-btn${tool === 'post' ? ' is-on' : ''}`} onClick={() => setTool('post')} title="Place a post the structural plans show: click on the wall" disabled={!plan.ptPerFt}><Columns2 size={14} /> Add post</button>
              {tool === 'post' ? (
                <select className="ew-select" style={{ width: 128 }} value={postChoice || (plan.postTypes || [])[0]?.id || ''} onChange={(e) => setPostChoice(e.target.value)} aria-label="Post type">
                  {(plan.postTypes || []).length ? null : <option value="">P1 built-up (new)</option>}
                  {(plan.postTypes || []).map((t) => <option key={t.id} value={t.id}>{t.id} · {t.kind === 'solid' ? `solid ${t.widthIn}"` : `(${t.plies}) studs`}</option>)}
                  <option value="__builtup">New built-up type</option>
                  <option value="__solid">New solid type</option>
                </select>
              ) : null}
              <button type="button" className={`ew-btn${tool === 'hardware' ? ' is-on' : ''}`} onClick={() => setTool('hardware')} title="Place structural hardware (hold-down, strap…) the plans show: click on the wall" disabled={!plan.ptPerFt}><Anchor size={14} /> Add hardware</button>
              {tool === 'hardware' ? (
                <select className="ew-select" style={{ width: 140 }} value={hwChoice || (plan.hardwareTypes || []).find((t) => (t.rule || 'each') === 'each')?.id || '__new'} onChange={(e) => setHwChoice(e.target.value)} aria-label="Hardware type">
                  {(plan.hardwareTypes || []).filter((t) => (t.rule || 'each') === 'each').map((t) => <option key={t.id} value={t.id}>{t.id}{t.name ? ` · ${t.name}` : ''}</option>)}
                  <option value="__new">New hardware type</option>
                </select>
              ) : null}
              <button type="button" className={`ew-btn${tool === 'blocking' ? ' is-on' : ''}`} onClick={() => setTool('blocking')} title="Draw blocking runs: bathroom, kitchen, stair railing or other" disabled={!plan.ptPerFt}><Minus size={14} /> Blocking</button>
              {tool === 'blocking' ? (
                <select className="ew-select" style={{ width: 150 }} value={blkKind} onChange={(e) => setBlkKind(e.target.value)} aria-label="Blocking kind">
                  {BLOCKING_KINDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              ) : null}
              <button type="button" className={`ew-btn${tool === 'floorhole' ? ' is-on' : ''}`} onClick={() => setTool('floorhole')} title="Mark a floor opening (stair, shaft, open to below): it is taken off the subfloor" disabled={!plan.ptPerFt}><SquareDashed size={14} /> Floor opening</button>
              <button type="button" className={`ew-btn${tool === 'calibrate' ? ' is-on' : ''}`} onClick={() => { setTool('calibrate'); setCalib(null); }} title="Set the scale from a dimension you know"><Ruler size={14} /> Calibrate</button>
            </div>
            <button type="button" className="ew-btn" onClick={() => detectAgain()} disabled={Boolean(busy) || !plan.ptPerFt || fileMissing} title="Find the walls again (after changing the scale or the line styles)"><RefreshCw size={14} /> Detect walls</button>
            {fileButton('Replace PDF', onFile)}
          </div>
        ) : null}
      </div>

      {busy ? <div className="lc-note pt-busy">{busy}</div> : null}
      {error ? <div className="lc-note"><TriangleAlert size={12} /> {error}</div> : null}
      {fileMissing ? (
        <div className="lc-note">
          <TriangleAlert size={12} /> The PDF of this level was attached on another computer or browser. The walls are saved; attach the same PDF to see the sheet.
          {fileButton('Attach PDF', reattach)}
        </div>
      ) : null}

      {calib ? (
        <div className="pt-calib">
          <span>That line is <strong>{calib.distPt.toFixed(1)} pt</strong> on the sheet. How long is it really?</span>
          <label className="fld"><span>Feet</span><NumInput w={56} value={calib.ft} onCommit={(v) => setCalib((c) => ({ ...c, ft: v }))} /></label>
          <label className="fld"><span>Inches</span><NumInput w={48} value={calib.inch} onCommit={(v) => setCalib((c) => ({ ...c, inch: v }))} /></label>
          <button type="button" className="ew-btn ew-btn--primary" disabled={!(Number(calib.ft) * 12 + Number(calib.inch) > 0)} onClick={() => {
            const realFt = Number(calib.ft) + Number(calib.inch) / 12;
            const k = calib.distPt / realFt;
            setScale(k, `Calibrated: ${ftIn(realFt)} = ${calib.distPt.toFixed(1)} pt`, 'calibrated');
            setCalib(null); setTool('select');
          }}>Use this scale</button>
          <button type="button" className="ew-btn ew-btn--ghost" onClick={() => { setCalib(null); setTool('select'); }}>Cancel</button>
        </div>
      ) : null}

      {!level ? null : !plan?.fileKey ? (
        <div className="pt-empty">
          <ScanLine size={28} />
          <p>
            Upload the floor plan of <strong>{level.name || 'this level'}</strong> as a PDF exported from CAD (not scanned).
            The app reads the scale from the sheet, finds the walls and measures them. You check them, fix what is wrong,
            and the lengths go to Wall panels. Without a PDF, type the lengths in Wall panels as before.
          </p>
          {fileButton('Upload plan PDF', onFile, true)}
          {levels.some((l) => l.id !== level.id && l.plan?.walls?.length) ? (
            <div className="pt-copy">
              <strong>Same plan as another level?</strong>
              <span className="ew-subtle">Copy its checked walls, openings and types. Upper levels often have smaller posts or none: copy them and change their types here, or leave them out.</span>
              <div className="pt-copy__row">
                <select className="ew-select" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} aria-label="Level to copy from">
                  {levels.filter((l) => l.id !== level.id && l.plan?.walls?.length).map((l) => <option key={l.id} value={l.id}>{l.name} · {l.plan.walls.length} walls</option>)}
                </select>
                <label className="pv-check"><input type="checkbox" checked={copyPosts} onChange={(e) => setCopyPosts(e.target.checked)} /> Posts</label>
                <label className="pv-check"><input type="checkbox" checked={copyHardware} onChange={(e) => setCopyHardware(e.target.checked)} /> Hardware</label>
                <button type="button" className="ew-btn" onClick={() => {
                  const src = levels.find((l) => l.id === (copyFrom || levels.find((x) => x.id !== level.id && x.plan?.walls?.length)?.id));
                  if (src) setPlan(() => copyPlan(src, { posts: copyPosts, hardware: copyHardware }));
                }}><Copy size={14} /> Copy walls</button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {plan.styleList?.length ? (
            <div className="pt-styles" aria-label="Line styles used as walls">
              <span className="ew-subtle" title="Each pen (line weight and color) on the sheet. Walls are searched only in the checked ones.">Line styles</span>
              {plan.styleList.map((s) => {
                const on = (plan.styles || []).includes(s.style);
                return (
                  <label key={s.style} className={`pt-style${on ? ' is-on' : ''}`} title={`${s.walls} walls · ${fmtLF(s.lengthFt)} LF in this style`}>
                    <input type="checkbox" checked={on} onChange={() => setPlan((p) => ({ ...p, styles: on ? (p.styles || []).filter((x) => x !== s.style) : [...(p.styles || []), s.style] }))} />
                    <i style={{ background: s.color, height: Math.max(2, Math.min(6, s.width * 2.5 || 4)) }} />
                    {s.width ? `${s.width} pt` : 'fill'} · {fmtLF(s.lengthFt)} LF
                  </label>
                );
              })}
              <button type="button" className="ew-btn ew-btn--ghost" onClick={() => detectAgain()} disabled={Boolean(busy) || fileMissing}>Apply</button>
            </div>
          ) : null}

          <PlanLegend display={display} onChange={setDisplay} />
          <div className="pt-main">
            <PlanCanvas
              plan={plan}
              imgUrl={imgUrl}
              selected={selected}
              tool={tool}
              onSelect={onSelect}
              onMoveEnd={moveEnd}
              onAddGap={(i) => setPlan((p) => placeFrom(addStructWalls(p, [p.structural?.gaps?.[i]].filter(Boolean), newId), p.structural))}
              onAddWall={addWall}
              onAddOpening={addOpening}
              onAddPost={addPost}
              onAddHardware={addHardware}
              onAddFloorHole={addFloorHole}
              onAddBlocking={addBlocking}
              display={display}
              onCalibrate={(a, b) => setCalib({ distPt: Math.hypot(b[0] - a[0], b[1] - a[1]), ft: '', inch: '' })}
              onDeleteSelected={() => deleteWalls([...selected])}
            />

            <aside className="pt-side">
              {sel.length ? (
                <SelectionPanel
                  walls={sel}
                  ptPerFt={plan.ptPerFt}
                  onSetLength={(w, ft) => {
                    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
                    const d = ft * (plan.ptPerFt || 1);
                    moveEnd(w.id, '2', [w.x1 + ((w.x2 - w.x1) / L) * d, w.y1 + ((w.y2 - w.y1) / L) * d]);
                  }}
                  onPatch={(patch) => {
                    lastProps.current = { ...lastProps.current, ...patch };
                    // turning a wall double: the 2nd wall starts as a partition with the same studs
                    patchWalls(sel.map((w) => w.id), (w) => (patch.double && !w.double ? { ...patch, kind2: w.kind2 || 'partition', size2: w.size } : patch));
                  }}
                  onDelete={() => deleteWalls(sel.map((w) => w.id))}
                  onOpenings={(fn) => sel.length === 1 && patchOpenings(sel[0].id, fn)}
                  openingTypes={plan.openingTypes || []}
                  postTypes={plan.postTypes || []}
                  hardwareTypes={plan.hardwareTypes || []}
                  onHardware={(fn) => sel.length === 1 && patchHardware(sel[0].id, fn)}
                  onPosts={(fn) => sel.length === 1 && patchPosts(sel[0].id, fn)}
                  onShear={(fn) => sel.length === 1 && setPlan((p) => ({ ...p, walls: (p.walls || []).map((w) => (w.id !== sel[0].id ? w : { ...w, shear: fn(w.shear || []), shearManual: true })) }))}
                  onNewType={(i) => sel.length === 1 && setPlan((p) => {
                    const w = (p.walls || []).find((x) => x.id === sel[0].id);
                    const t = newType(p.openingTypes || [], w.openings[i], normWall(w).kind === 'exterior' ? 'exterior' : 'interior');
                    return {
                      ...p,
                      openingTypes: [...(p.openingTypes || []), t],
                      walls: p.walls.map((x) => (x.id !== w.id ? x : { ...x, auto: false, openings: x.openings.map((o, j) => (j === i ? { ...o, typeId: t.id, typeManual: true } : o)) })),
                    };
                  })}
                  colors={display.colors}
                  onSimilar={() => {
                    const w0 = sel[0];
                    const k0 = JSON.stringify(normWall(w0));
                    setSelected(new Set((plan.walls || []).filter((w) => JSON.stringify(normWall(w)) === k0 && (w0.style ? w.style === w0.style : true)).map((w) => w.id)));
                  }}
                  onClear={() => setSelected(new Set())}
                />
              ) : (
                <div className="pt-panel">
                  <div className="pt-facts">
                    <span><strong>{totals.walls}</strong> walls{totals.doubles ? ` (${totals.doubles} double)` : ''}</span>
                    <span><strong>{fmtLF(totals.lf)}</strong> LF</span>
                    <span><strong>{totals.windows}</strong> windows</span>
                    <span><strong>{totals.doors}</strong> doors</span>
                  </div>
                  <table className="tbl pt-groups">
                    <thead><tr><th>Walls</th><th className="num">Count</th><th className="num">LF</th><th className="num" title="Extra studs where walls meet (corners and T's), added to the studs of the section">+Studs</th></tr></thead>
                    <tbody>
                      {groups.map((g) => (
                        <tr key={g.key} className="pt-group" onClick={() => setSelected(new Set((plan.walls || []).filter((w) => groupKeysOf(w).includes(g.key)).map((w) => w.id)))} title="Select these walls">
                          <td><i className="pt-dot" style={{ background: display.colors[g.kind] }} />{g.label}</td>
                          <td className="num">{g.walls}</td>
                          <td className="num" style={{ fontWeight: 600 }}>{fmtLF(g.lengthFt)}</td>
                          <td className="num">{g.junctionStuds || ''}</td>
                        </tr>
                      ))}
                      {!groups.length ? <tr><td colSpan={4} className="ew-subtle">No walls yet.</td></tr> : null}
                    </tbody>
                  </table>
                  {groups.length ? (() => {
                    const jn = planJunctions(plan);
                    const jc = { ...JUNCTION_DEFAULTS, ...(plan.junctions || {}) };
                    const setJ = (patch) => setPlan((p) => ({ ...p, junctions: { ...(p.junctions || {}), ...patch } }));
                    const corners = jn.filter((j) => j.type === 'corner').length, tees = jn.length - corners;
                    return (
                      <div className="pt-jn-box">
                        <label className="pv-check">
                          <input type="checkbox" checked={!plan.junctions?.off} onChange={(e) => setJ({ off: !e.target.checked })} />
                          Studs where walls meet
                        </label>
                        {!plan.junctions?.off ? (
                          <div className="pt-jn">
                            <span>{corners} corners ▢</span>
                            <label className="fld"><NumInput w={40} value={jc.corner} onCommit={(v) => setJ({ corner: Math.max(0, Math.round(v)) })} aria-label="Studs per corner" /> <span className="ew-subtle">studs each</span></label>
                            <span>{tees} T&apos;s ○</span>
                            <label className="fld"><NumInput w={40} value={jc.tee} onCommit={(v) => setJ({ tee: Math.max(0, Math.round(v)) })} aria-label="Studs per T" /> <span className="ew-subtle">studs each</span></label>
                          </div>
                        ) : null}
                        <span className="ew-subtle">Added to the studs of the wall that runs through (after the waste). The studs waste % in Wall panels may already cover some of them: lower it if so.</span>
                      </div>
                    );
                  })() : null}
                  <button type="button" className={`ew-btn${plan.linked ? '' : ' ew-btn--primary'}`} onClick={toggleLink} disabled={!groups.length && !plan.linked}>
                    {plan.linked ? <><Unlink size={14} /> Unlink from Wall panels</> : <><Link2 size={14} /> Use in Wall panels</>}
                  </button>
                  <p className="ew-subtle pt-help">
                    {plan.linked
                      ? `Each row above is a "Plan · …" section in ${level.name || 'this level'}; its length follows the plan as you edit walls. Pick the materials, height and spacing there.`
                      : 'Check the walls first: click one to change its type, stud size or length, Shift-click to select several, Delete to remove, Add wall for missed ones. Then send them to Wall panels.'}
                  </p>
                  <p className="ew-subtle pt-help">
                    Lengths run along the wall centre line; at corners one wall runs through and the other butts, like the framing.
                    Openings are counted inside the wall length. A double wall counts its length once for each of its two walls, each with its own type and studs.
                    Detect walls again keeps the walls you drew, changed or deleted.
                  </p>
                </div>
              )}
            </aside>
          </div>
          <OpeningTypesPanel
            types={plan.openingTypes || []}
            use={use}
            colors={display.colors}
            selectedType={pickedType}
            onSelectType={(id) => {
              setPickedType(id);
              setSelected(new Set((plan.walls || []).filter((w) => (w.openings || []).some((o) => o.typeId === id)).map((w) => w.id)));
            }}
            onPatchType={(id, patch) => setPlan((p) => ({ ...p, openingTypes: (p.openingTypes || []).map((t) => (t.id === id ? { ...t, ...patch } : t)) }))}
            onAddType={(kind, scope) => setPlan((p) => ({ ...p, openingTypes: [...(p.openingTypes || []), newType(p.openingTypes || [], { type: kind, widthFt: 3 }, scope)] }))}
            onDeleteType={(id) => setPlan((p) => ({ ...p, openingTypes: (p.openingTypes || []).filter((t) => t.id !== id) }))}
            hasSchedule={Boolean(est.headerSchedule?.rows?.length)}
            onBackToSchedule={(id) => setPlan((p) => ({ ...p, openingTypes: (p.openingTypes || []).map((t) => (t.id === id ? backToSchedule(t) : t)) }))}
            onMerge={(from, to) => setPlan((p) => ({
              ...p,
              openingTypes: (p.openingTypes || []).filter((t) => t.id !== from),
              walls: (p.walls || []).map((w) => (!(w.openings || []).some((o) => o.typeId === from) ? w : {
                ...w, auto: false, openingsEdited: true,
                openings: w.openings.map((o) => (o.typeId === from ? { ...o, typeId: to, typeManual: true } : o)),
              })),
            }))}
          />
          <HeaderSchedulePanel
            schedule={est.headerSchedule}
            uid={appId}
            levelName={level.name || 'this level'}
            above={floorsAbove(est, level.id, {})}
            aboveOwn={plan.floorsAbove}
            onAbove={(v) => setPlan((p) => { const next = { ...p }; if (v === undefined) delete next.floorsAbove; else next.floorsAbove = v; return next; })}
            onChange={setSchedule}
            used={(plan.openingTypes || []).reduce((m, t) => (t.schedRow && !t.byHand ? m.set(t.schedRow, (m.get(t.schedRow) || 0) + 1) : m), new Map())}
          />
          <PostTypesPanel
            types={plan.postTypes || []}
            use={postUse}
            color={display.colors.post}
            selectedType={pickedType}
            onSelectType={(id) => {
              setPickedType(id);
              setSelected(new Set((plan.walls || []).filter((w) => (w.posts || []).some((p) => p.typeId === id)).map((w) => w.id)));
            }}
            onPatchType={(id, patch) => setPlan((p) => ({ ...p, postTypes: (p.postTypes || []).map((t) => (t.id === id ? { ...t, ...patch } : t)) }))}
            onAddType={(kind) => setPlan((p) => ({ ...p, postTypes: [...(p.postTypes || []), newPostType(p.postTypes || [], kind)] }))}
            onDeleteType={(id) => setPlan((p) => ({ ...p, postTypes: (p.postTypes || []).filter((t) => t.id !== id) }))}
          />
          <StructuralPanel
            plan={plan}
            busy={busy}
            onConcrete={isOnConcrete(level, levels.findIndex((l) => l.id === level.id))}
            onUpload={() => { fileInput.current.onpick = onStructFile; fileInput.current.click(); }}
            onPage={(pageNo) => readStruct({ key: plan.structural.fileKey, pageNo, fileName: plan.structural.fileName, pageCount: plan.structural.pageCount })}
            onPlace={() => (plan.structural?.found && !plan.structural.found.walls
              // read before the structural walls were: read the sheet again
              ? readStruct({ key: plan.structural.fileKey, pageNo: plan.structural.page || 1, fileName: plan.structural.fileName, pageCount: plan.structural.pageCount })
              : setPlan((p) => (p.structural?.found ? placeFrom(p, p.structural) : p)))}
            onRemove={() => setPlan((p) => ({ ...removeStructural(p), structural: { ...p.structural, placed: undefined, missed: [], gaps: [], confirmed: undefined } }))}
            onAddGaps={() => setPlan((p) => placeFrom(addStructWalls(p, p.structural?.gaps, newId), p.structural))}
            onBeams={(fn) => setPlan((p) => ({ ...p, beams: fn(p.beams || []) }))}
            onPatch={(patch) => setPlan((p) => ({ ...p, structural: { ...p.structural, ...patch } }))}
            onShearHardware={() => setPlan((p) => {
              const d = isOnConcrete(level, levels.findIndex((l) => l.id === level.id)) ? SHEAR_DEFAULTS.anchor : SHEAR_DEFAULTS.lag;
              const list = p.hardwareTypes || [];
              if (list.some((t) => t.rule === 'shear' && t.name === d.name)) return p;
              return { ...p, hardwareTypes: [...list, { ...newHardwareType(list), name: d.name, rule: 'shear', byType: { ...d.byType }, notes: 'Spacings per the shear wall schedule (S-402); check yours' }] };
            })}
          />
          <FloorPanel
            plan={plan}
            levelIndex={levels.findIndex((l) => l.id === level.id)}
            color={display.colors.blocking}
            onPatch={(patch) => setPlan((p) => ({ ...p, ...patch }))}
          />
          <HardwareTypesPanel
            types={plan.hardwareTypes || []}
            counts={hwCounts}
            groups={groups}
            shearTypes={SHEAR_TYPES.filter((t) => (plan.walls || []).some((w) => (w.shear || []).some((x) => x.type === t)))}
            color={display.colors.hardware}
            selectedType={pickedType}
            onSelectType={(id) => {
              setPickedType(id);
              const t = (plan.hardwareTypes || []).find((x) => x.id === id);
              const gs = new Set(t?.rule && t.rule !== 'each' ? t.groups || [] : []);
              setSelected(new Set((plan.walls || []).filter((w) => (w.hardware || []).some((h) => h.typeId === id) || groupKeysOf(w).some((g) => gs.has(g))).map((w) => w.id)));
            }}
            onPatchType={(id, patch) => setPlan((p) => ({ ...p, hardwareTypes: (p.hardwareTypes || []).map((t) => (t.id === id ? { ...t, ...patch } : t)) }))}
            onAddType={() => setPlan((p) => ({ ...p, hardwareTypes: [...(p.hardwareTypes || []), newHardwareType(p.hardwareTypes || [])] }))}
            onDeleteType={(id) => setPlan((p) => ({
              ...p,
              hardwareTypes: (p.hardwareTypes || []).filter((t) => t.id !== id),
              walls: (p.walls || []).map((w) => (!(w.hardware || []).some((h) => h.typeId === id) ? w : { ...w, hardware: w.hardware.filter((h) => h.typeId !== id) })),
            }))}
          />
        </>
      )}
    </div>
  );
}

function SelectionPanel({ walls, ptPerFt, onPatch, onSetLength, onDelete, onSimilar, onClear, onOpenings, onNewType, openingTypes = [], postTypes = [], onPosts, hardwareTypes = [], onHardware, onShear, colors }) {
  const one = walls.length === 1 ? walls[0] : null;
  const isExterior = one ? normWall(one).kind === 'exterior' : false;
  const norm = walls.map(normWall);
  const same = (key) => (norm.every((w) => w[key] === norm[0][key]) ? norm[0][key] ?? '' : '');
  const lf = walls.reduce((s, w) => s + wallLengthFt(w, ptPerFt), 0);
  const kind = same('kind');
  const size = same('size');
  const kind2 = same('kind2');
  const size2 = same('size2');
  const allDouble = norm.every((w) => w.double);
  const noneDouble = norm.every((w) => !w.double);
  const isDouble = allDouble;
  const typeSelect = (value, key, exterior = true) => (
    <select className="ew-select" value={value} onChange={(e) => onPatch({ [key]: e.target.value })}>
      {!value ? <option value="">Mixed</option> : null}
      {PLAN_KINDS.filter((k) => exterior || k.value !== 'exterior').map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
    </select>
  );
  const studSelect = (value, key) => (
    <select className="ew-select" value={value} onChange={(e) => onPatch({ [key]: e.target.value })}>
      {!value ? <option value="">Mixed</option> : null}
      {WALL_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
  return (
    <div className="pt-panel">
      <div className="pt-facts">
        <span><strong>{walls.length}</strong> wall{walls.length > 1 ? 's' : ''} selected</span>
        <span><strong>{one ? ftIn(lf) : `${fmtLF(lf)} LF`}</strong></span>
      </div>
      <label className="fld" title="A double wall is two walls side by side (e.g. a shear wall and a bearing wall). Each counts the full length with its own type and studs; the shear wall carries the sheathing between them.">
        <span>Wall</span>
        <select className="ew-select" value={allDouble ? 'double' : noneDouble ? 'single' : ''} onChange={(e) => onPatch({ double: e.target.value === 'double' })}>
          {!allDouble && !noneDouble ? <option value="">Mixed</option> : null}
          <option value="single">Single</option>
          <option value="double">Double (two walls)</option>
        </select>
      </label>
      {isDouble ? (
        <div className="pt-double">
          <span className="pt-double__head">1st wall</span>
          <label className="fld"><span>Type</span>{typeSelect(kind, 'kind')}</label>
          <label className="fld"><span>Studs</span>{studSelect(size, 'size')}</label>
          <span className="pt-double__head">2nd wall</span>
          <label className="fld"><span>Type</span>{typeSelect(kind2, 'kind2', false)}</label>
          <label className="fld"><span>Studs</span>{studSelect(size2, 'size2')}</label>
        </div>
      ) : (
        <>
          <label className="fld"><span>Type</span>{typeSelect(kind, 'kind')}</label>
          <label className="fld"><span>Studs</span>{studSelect(size, 'size')}</label>
        </>
      )}
      {one ? (
        <>
          <div className="pt-dims">
            <label className="fld" title="Moves the end of the wall (the start stays); or drag the ends on the drawing">
              <span>Length (ft)</span>
              <NumInput w={72} step="0.01" value={Math.round(wallLengthFt(one, ptPerFt) * 100) / 100} onCommit={(v) => v > 0 && onSetLength(one, v)} />
            </label>
            <label className="fld" title="Thickness as drawn, studs and finishes; the studs picked above are what is counted">
              <span>Thick (in)</span>
              <NumInput w={56} step="0.25" value={Math.round((Number(one.t) || 0) * 100) / 100} onCommit={(v) => v > 0 && onPatch({ t: v })} />
            </label>
          </div>
          <div className="ew-subtle">
            {ftIn(wallLengthFt(one, ptPerFt))} along the centre line
            {one.lenFt ? ` · typed length (drawn ${ftIn(Math.hypot(one.x2 - one.x1, one.y2 - one.y1) / (ptPerFt || 1))}): typing it again moves the end` : ' · drag its ends on the drawing to stretch it'}
          </div>
          <div className="pt-ops">
            <div className="pt-ops__head">
              <strong>Openings</strong>
              <button type="button" className="ew-btn ew-btn--ghost" onClick={() => {
                const L = wallLengthFt(one, ptPerFt);
                onOpenings((list) => [...list, { type: 'window', atFt: Math.max(0, Math.round((L / 2 - 1.5) * 4) / 4), widthFt: 3 }]);
              }} title="Add a 3' window in the middle of the wall; or use Add opening on the drawing"><Plus size={13} /> Add</button>
            </div>
            {(one.openings || []).length ? (
              <table className="pt-ops__tbl">
                <thead><tr><th>Type</th><th title="Window / door type (W1, D1…): sets its header">Class</th><th className="num" title="From the wall start, ft">At (ft)</th><th className="num" title="Rough opening width, in">Width (in)</th><th /></tr></thead>
                <tbody>
                  {one.openings.map((o, i) => (
                    <tr key={`${i}-${o.atFt}`}>
                      <td>
                        <select className="ew-select" value={o.type === 'door' ? 'door' : 'window'} onChange={(e) => onOpenings((list) => list.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))} style={{ borderLeft: `4px solid ${colors[o.type === 'door' ? 'door' : 'window']}` }}>
                          <option value="window">Window</option>
                          <option value="door">Door</option>
                        </select>
                      </td>
                      <td>
                        {one ? (
                          <select className="ew-select ot-class" value={o.typeManual ? o.typeId || '' : ''} onChange={(e) => {
                            const v = e.target.value;
                            if (v === '__new') onNewType(i);
                            else onOpenings((list) => list.map((x, j) => (j !== i ? x : v ? { ...x, typeId: v, typeManual: true } : { ...x, typeManual: false })));
                          }} title={o.typeManual ? 'Chosen by hand' : 'Automatic (by width)'}>
                            <option value="">{o.typeId ? `${o.typeId} (auto)` : 'Auto'}</option>
                            {openingTypes.filter((t) => t.kind === (o.type === 'door' ? 'door' : 'window') && (t.scope === 'interior') === !isExterior).map((t) => <option key={t.id} value={t.id}>{t.id} · {t.widthIn}&quot;</option>)}
                            <option value="__new">New type…</option>
                          </select>
                        ) : <span className="ew-subtle" title="Only openings in exterior walls get a type">—</span>}
                      </td>
                      <td className="num"><NumInput w={56} value={o.atFt} onCommit={(v) => onOpenings((list) => list.map((x, j) => (j === i ? { ...x, atFt: Math.max(0, Number(v) || 0) } : x)))} /></td>
                      <td className="num"><NumInput w={56} value={Math.round((o.widthFt || 0) * 12 * 4) / 4} onCommit={(v) => onOpenings((list) => list.map((x, j) => (j === i ? { ...x, widthFt: Math.max(0.5, (Number(v) || 0) / 12) } : x)))} /></td>
                      <td><button type="button" className="ew-icon-btn" onClick={() => onOpenings((list) => list.filter((_, j) => j !== i))} title="Remove this opening" aria-label="Remove opening"><X size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <span className="ew-subtle">No openings. Add one here or with Add opening on the drawing.</span>}
          </div>
          <div className="pt-ops">
            <div className="pt-ops__head">
              <strong>Posts</strong>
              <button type="button" className="ew-btn ew-btn--ghost" disabled={!postTypes.length} onClick={() => onPosts((list) => [...list, { atFt: Math.round(wallLengthFt(one, ptPerFt) * 50) / 100, typeId: postTypes[0].id }])} title={postTypes.length ? 'Add a post in the middle of the wall' : 'Make a post type first (Add post on the drawing, or Post types below)'}><Plus size={13} /> Add</button>
            </div>
            {(one.posts || []).length ? (
              <table className="pt-ops__tbl">
                <thead><tr><th>Type</th><th className="num" title="Centre of the post, from the wall start, ft">At (ft)</th><th /></tr></thead>
                <tbody>
                  {one.posts.map((p, i) => (
                    <tr key={`${i}-${p.atFt}`}>
                      <td>
                        <select className="ew-select" value={p.typeId} onChange={(e) => onPosts((list) => list.map((x, j) => (j === i ? { ...x, typeId: e.target.value } : x)))} style={{ borderLeft: `4px solid ${colors.post}` }}>
                          {postTypes.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.kind === 'solid' ? `solid ${t.widthIn}"` : `(${t.plies}) studs`}</option>)}
                        </select>
                      </td>
                      <td className="num"><NumInput w={56} value={p.atFt} onCommit={(v) => onPosts((list) => list.map((x, j) => (j === i ? { ...x, atFt: Math.max(0, Number(v) || 0) } : x)))} /></td>
                      <td><button type="button" className="ew-icon-btn" onClick={() => onPosts((list) => list.filter((_, j) => j !== i))} title="Remove this post" aria-label="Remove post"><X size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <span className="ew-subtle">No posts on this wall.</span>}
          </div>
          <div className="pt-ops">
            <div className="pt-ops__head">
              <strong>Shear wall</strong>
              <button type="button" className="ew-btn ew-btn--ghost" onClick={() => onShear((list) => [...list, { type: 'A', lengthFt: Math.round(wallLengthFt(one, ptPerFt) * 100) / 100 }])} title="Mark this wall (or a stretch of it) as a shear wall of the schedule"><Plus size={13} /> Add</button>
            </div>
            {(one.shear || []).length ? (
              <table className="pt-ops__tbl">
                <thead><tr><th>Type</th><th className="num" title="Length of the shear wall per its tag, ft">Length (ft)</th><th /></tr></thead>
                <tbody>
                  {one.shear.map((x, i) => (
                    <tr key={`${i}-${x.type}`}>
                      <td>
                        <select className="ew-select" value={x.type} onChange={(e) => onShear((list) => list.map((y, j) => (j === i ? { ...y, type: e.target.value } : y)))} style={{ borderLeft: `4px solid ${colors.sheartag}` }}>
                          {SHEAR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="num"><NumInput w={56} value={x.lengthFt} onCommit={(v) => onShear((list) => list.map((y, j) => (j === i ? { ...y, lengthFt: Math.max(0, Number(v) || 0) } : y)))} /></td>
                      <td><button type="button" className="ew-icon-btn" onClick={() => onShear((list) => list.filter((_, j) => j !== i))} title="Not a shear wall" aria-label="Remove shear type"><X size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <span className="ew-subtle">Not a shear wall.</span>}
          </div>
          {(one.hardware || []).length ? (
            <div className="pt-ops">
              <div className="pt-ops__head"><strong>Hardware placed</strong></div>
              <table className="pt-ops__tbl">
                <thead><tr><th>Type</th><th className="num">At (ft)</th><th /></tr></thead>
                <tbody>
                  {one.hardware.map((h, i) => (
                    <tr key={`${i}-${h.atFt}`}>
                      <td>
                        <select className="ew-select" value={h.typeId} onChange={(e) => onHardware((list) => list.map((x, j) => (j === i ? { ...x, typeId: e.target.value } : x)))} style={{ borderLeft: `4px solid ${colors.hardware}` }}>
                          {hardwareTypes.map((t) => <option key={t.id} value={t.id}>{t.id}{t.name ? ` · ${t.name}` : ''}</option>)}
                        </select>
                      </td>
                      <td className="num"><NumInput w={56} value={h.atFt} onCommit={(v) => onHardware((list) => list.map((x, j) => (j === i ? { ...x, atFt: Math.max(0, Number(v) || 0) } : x)))} /></td>
                      <td><button type="button" className="ew-icon-btn" onClick={() => onHardware((list) => list.filter((_, j) => j !== i))} title="Remove" aria-label="Remove hardware"><X size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
      <div className="pt-actions">
        <button type="button" className="ew-btn" onClick={onSimilar} title="Select every wall with this type, stud size and line style"><CopyCheck size={14} /> Select similar</button>
        <button type="button" className="ew-btn" onClick={onDelete} title="Not a wall (Delete)"><Trash2 size={14} /> Delete</button>
        <button type="button" className="ew-btn ew-btn--ghost" onClick={onClear}>Done</button>
      </div>
    </div>
  );
}
