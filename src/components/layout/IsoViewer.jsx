// src/components/layout/IsoViewer.jsx
// A framed isometric drawing with zoom (wheel, + −), pan (drag), turn
// (Shift-drag, arrows, slider) and hover / click on its parts. The drawing is
// an SVG string; parts carry data attributes that `describe` turns into the
// readout text and `onPick` receives on click.
'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RotateCcw, RotateCw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

export default function IsoViewer({
  svg, width, height, fig = 'Fig 1', title, hint, idle = '',
  azimuth, onAzimuth, pickSelector = '[data-pick]', describe, onPick, highlight, children,
}) {
  const hostRef = useRef(null);
  const readoutRef = useRef(null);
  const viewRef = useRef({ x: 0, y: 0, w: width, h: height });
  const [zoom, setZoom] = useState(1);
  const turn = useCallback((deg) => onAzimuth((((azimuth + deg) % 360) + 360) % 360), [azimuth, onAzimuth]);

  const clamp = useCallback((v) => ({ ...v, x: Math.min(Math.max(v.x, -v.w * 0.5), width - v.w * 0.5), y: Math.min(Math.max(v.y, -v.h * 0.5), height - v.h * 0.5) }), [width, height]);
  const applyView = useCallback(() => {
    const el = hostRef.current?.querySelector('svg');
    const v = viewRef.current;
    if (el) el.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    setZoom(width / v.w);
  }, [width]);
  useLayoutEffect(() => { applyView(); }, [svg, applyView]);
  useEffect(() => { viewRef.current = { x: 0, y: 0, w: width, h: height }; applyView(); }, [width, height, applyView]);

  const zoomAt = useCallback((factor, fx = 0.5, fy = 0.5) => {
    const v = viewRef.current;
    const w = Math.min(width, Math.max(width / 40, v.w / factor));
    const h = (w / width) * height;
    viewRef.current = clamp({ x: v.x + v.w * fx - w * fx, y: v.y + v.h * fy - h * fy, w, h });
    applyView();
  }, [applyView, clamp, width, height]);
  const resetView = useCallback(() => { viewRef.current = { x: 0, y: 0, w: width, h: height }; applyView(); }, [applyView, width, height]);

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

  // keep the highlight on the selected part after every redraw
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.querySelectorAll('.is-picked').forEach((el) => el.classList.remove('is-picked'));
    if (highlight) host.querySelectorAll(highlight).forEach((el) => el.classList.add('is-picked'));
  }, [svg, highlight]);

  const dragRef = useRef(null);
  const onPointerDown = (e) => {
    if (e.button !== 0 && e.button !== 2) return;
    dragRef.current = { x: e.clientX, y: e.clientY, view: { ...viewRef.current }, rotate: e.shiftKey || e.button === 2, turned: 0, moved: false, target: e.target };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const setReadout = (text) => { if (readoutRef.current) readoutRef.current.textContent = text || idle; };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (d) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      if (d.rotate) {
        const steps = Math.trunc(dx / 40) - d.turned;
        if (steps) { d.turned += steps; turn(steps * -15); }
        return;
      }
      const r = hostRef.current.getBoundingClientRect();
      const k = d.view.w / r.width;
      viewRef.current = clamp({ ...d.view, x: d.view.x - dx * k, y: d.view.y - dy * k });
      applyView();
      return;
    }
    const el = e.target.closest?.(pickSelector);
    const host = hostRef.current;
    host.querySelectorAll('.is-hover').forEach((x) => x.classList.remove('is-hover'));
    if (el && describe) {
      const key = el.getAttribute('data-pick');
      if (key) host.querySelectorAll(`[data-pick="${CSS.escape(key)}"]`).forEach((x) => x.classList.add('is-hover'));
      setReadout(describe(el));
    } else setReadout('');
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && !d.moved && !d.rotate && onPick) {
      const el = d.target.closest?.(pickSelector);
      onPick(el || null);
    }
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); turn(15); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); turn(-15); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(1.25); }
    else if (e.key === '-') { e.preventDefault(); zoomAt(0.8); }
    else if (e.key === '0') { e.preventDefault(); resetView(); }
  };

  return (
    <figure className="iso iso-figure lc-figure" data-theme="light">
      <div className="iso-plate">
        <div className="iso-plate-corners" aria-hidden="true">
          <span className="iso-plate-corner" data-corner="fig">{fig}</span>
          {title ? <span className="iso-plate-corner" data-corner="title">{title}</span> : null}
          {hint ? <span className="iso-plate-corner" data-corner="hint">{hint}</span> : null}
          <span className="iso-plate-corner" data-corner="readout" ref={readoutRef}>{idle}</span>
        </div>
        <div
          ref={hostRef}
          className={`lc-host${zoom > 1.01 ? ' is-zoomed' : ''}`}
          tabIndex={0}
          aria-label="Drawing. Arrow keys turn, plus and minus zoom, 0 resets."
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { dragRef.current = null; }}
          onPointerLeave={() => { hostRef.current?.querySelectorAll('.is-hover').forEach((x) => x.classList.remove('is-hover')); setReadout(''); }}
          onContextMenu={(e) => e.preventDefault()}
          onDoubleClick={() => zoomAt(1.6)}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="lc-tools" role="toolbar" aria-label="View">
          <button type="button" className="ew-icon-btn" onClick={() => turn(15)} title="Turn left (←)" aria-label="Turn left"><RotateCcw size={14} /></button>
          <input type="range" min={0} max={345} step={15} value={azimuth} onChange={(e) => onAzimuth(Number(e.target.value))} aria-label="Viewing angle" title={`Viewing angle ${azimuth}°`} />
          <button type="button" className="ew-icon-btn" onClick={() => turn(-15)} title="Turn right (→)" aria-label="Turn right"><RotateCw size={14} /></button>
          <span className="lc-tools__sep" />
          <button type="button" className="ew-icon-btn" onClick={() => zoomAt(0.8)} title="Zoom out (−)" aria-label="Zoom out"><ZoomOut size={14} /></button>
          <span className="lc-tools__val">{Math.round(zoom * 100)}%</span>
          <button type="button" className="ew-icon-btn" onClick={() => zoomAt(1.25)} title="Zoom in (+)" aria-label="Zoom in"><ZoomIn size={14} /></button>
          <button type="button" className="ew-icon-btn" onClick={resetView} title="Reset view (0)" aria-label="Reset view"><Maximize2 size={14} /></button>
          {children}
        </div>
      </div>
    </figure>
  );
}
