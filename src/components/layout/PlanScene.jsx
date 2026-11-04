// src/components/layout/PlanScene.jsx
// WebGL (three.js) view of plan boxes: every box is one instance of a unit
// cube, so a whole framed building (tens of thousands of members) stays smooth.
// Drag turns, right-drag or Shift-drag pans, the wheel zooms; hover names a
// member, click picks a wall. Renders only when something changes.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, ArrowDownToLine, Box } from 'lucide-react';
import { loadThree } from '@/lib/three';
import { PICKED_COLOR, HOVER_COLOR } from '@/components/layout/planScene';

const BG = '#e3e3df';

export default function PlanScene({
  boxes, height = 560, fig = 'Fig 1', title, hint, idle = '',
  hoverKey = 'pick', picked = null, onPick, fitKey, homeView = null, children,
}) {
  const hostRef = useRef(null);
  const readoutRef = useRef(null);
  const ctx = useRef(null); // three objects and state
  const [error, setError] = useState('');

  const setReadout = (t) => { if (readoutRef.current) readoutRef.current.textContent = t || idle; };

  /* ── renderer, camera, controls (once) ── */
  useEffect(() => {
    let disposed = false;
    const host = hostRef.current;
    (async () => {
      let THREE;
      try { THREE = await loadThree(); } catch (err) { setError(`3D view could not load: ${err.message || err}`); return; }
      if (disposed) return;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setClearColor(BG);
      host.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x9a958c, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(-0.6, -1, 1.4);
      scene.add(sun);
      const camera = new THREE.PerspectiveCamera(32, 1, 1, 100000);
      camera.up.set(0, 0, 1);
      const c = {
        THREE, renderer, scene, camera, sun,
        orbit: { theta: -Math.PI / 4 - Math.PI / 2, phi: 0.6, radius: 1000, target: new THREE.Vector3() },
        meshes: [], lines: null, items: [], byKey: new Map(), hover: null, picked: null, frame: 0,
        raycaster: new THREE.Raycaster(), ndc: new THREE.Vector2(),
      };
      ctx.current = c;
      const resize = () => {
        const w = host.clientWidth || 600;
        renderer.setSize(w, height, false);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = `${height}px`;
        camera.aspect = w / height;
        camera.updateProjectionMatrix();
        render();
      };
      c.resize = resize;
      const ro = new ResizeObserver(resize);
      ro.observe(host);
      c.ro = ro;
      resize();
      c.ready = true;
      host.dispatchEvent(new Event('scene-ready'));
    })();
    return () => {
      disposed = true;
      const c = ctx.current;
      if (!c) return;
      c.ro?.disconnect();
      clearMeshes(c);
      c.renderer.dispose();
      c.renderer.domElement.remove();
      ctx.current = null;
    };
  }, [height]); // eslint-disable-line react-hooks/exhaustive-deps

  const render = useCallback(() => {
    const c = ctx.current;
    if (!c || c.frame) return;
    c.frame = requestAnimationFrame(() => {
      c.frame = 0;
      const { theta, phi, radius, target } = c.orbit;
      c.camera.position.set(
        target.x + radius * Math.cos(phi) * Math.cos(theta),
        target.y + radius * Math.cos(phi) * Math.sin(theta),
        target.z + radius * Math.sin(phi),
      );
      c.camera.lookAt(target);
      c.renderer.render(c.scene, c.camera);
    });
  }, []);

  const placeCamera = (c) => {
    const { theta, phi, radius, target } = c.orbit;
    c.camera.position.set(
      target.x + radius * Math.cos(phi) * Math.cos(theta),
      target.y + radius * Math.cos(phi) * Math.sin(theta),
      target.z + radius * Math.sin(phi),
    );
    c.camera.lookAt(target);
    c.camera.updateMatrixWorld();
  };

  /** Frame the whole drawing: a few passes that bring its corners to ~90% of the view. */
  const fit = useCallback((view = 'iso') => {
    const c = ctx.current;
    if (!c?.bounds) return;
    const { center, size } = c.bounds;
    c.orbit.target.copy(center);
    if (view === 'top') { c.orbit.phi = 1.53; }
    else if (homeView) { c.orbit.phi = homeView.phi; c.orbit.theta = homeView.theta; }
    else { c.orbit.phi = 0.6; c.orbit.theta = -Math.PI * 0.75; }
    c.orbit.radius = Math.max(size.x, size.y, size.z) * 2 + 100;
    const corners = [];
    for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
      corners.push(new c.THREE.Vector3(center.x + size.x * sx, center.y + size.y * sy, center.z + size.z * sz));
    }
    for (let pass = 0; pass < 4; pass += 1) {
      placeCamera(c);
      let m = 0;
      for (const p of corners) { const q = p.clone().project(c.camera); m = Math.max(m, Math.abs(q.x), Math.abs(q.y)); }
      if (!(m > 0)) break;
      c.orbit.radius *= m / 0.9;
    }
    render();
  }, [render, homeView]);

  /* ── boxes → instanced cubes + one batch of edges ── */
  const build = useCallback(() => {
    const c = ctx.current;
    if (!c?.ready) return;
    const { THREE } = c;
    clearMeshes(c);
    const solid = boxes.filter((b) => !b.glass && !b.edgesOnly);
    const glass = boxes.filter((b) => b.glass);
    const outlines = boxes.filter((b) => b.edgesOnly);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const edges = new Float32Array((solid.length + outlines.length) * 72);
    const EDGE_PAIRS = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cornersOf = (b) => {
      const la = b.a1 - b.a0, lc = b.c1 - b.c0, lz = b.z1 - b.z0;
      const am = (b.a0 + b.a1) / 2, cm = (b.c0 + b.c1) / 2;
      const px = b.o[0] + b.d[0] * am + b.n[0] * cm, py = b.o[1] + b.d[1] * am + b.n[1] * cm, pz = (b.z0 + b.z1) / 2;
      const k = [];
      for (const sa of [-0.5, 0.5]) for (const sc of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) {
        k.push([px + b.d[0] * la * sa + b.n[0] * lc * sc, py + b.d[1] * la * sa + b.n[1] * lc * sc, pz + lz * sz]);
      }
      return k;
    };
    let e = 0;
    c.items = [];
    c.byKey = new Map();
    const makeMesh = (list, material) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, material, list.length);
      list.forEach((b, i) => {
        const la = b.a1 - b.a0, lc = b.c1 - b.c0, lz = b.z1 - b.z0;
        const am = (b.a0 + b.a1) / 2, cm = (b.c0 + b.c1) / 2;
        const px = b.o[0] + b.d[0] * am + b.n[0] * cm, py = b.o[1] + b.d[1] * am + b.n[1] * cm, pz = (b.z0 + b.z1) / 2;
        m4.set(
          b.d[0] * la, b.n[0] * lc, 0, px,
          b.d[1] * la, b.n[1] * lc, 0, py,
          0, 0, lz, pz,
          0, 0, 0, 1,
        );
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, col.set(b.color));
        const ref = { mesh, i, b };
        c.items.push(ref);
        for (const key of new Set([b.pick, b.panel].filter(Boolean))) {
          if (!c.byKey.has(key)) c.byKey.set(key, []);
          c.byKey.get(key).push(ref);
        }
        // the 8 corners: bounds and edges
        const corner = (sa, sc, sz) => [
          px + b.d[0] * la * sa + b.n[0] * lc * sc,
          py + b.d[1] * la * sa + b.n[1] * lc * sc,
          pz + lz * sz,
        ];
        const k = [];
        for (const sa of [-0.5, 0.5]) for (const sc of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) k.push(corner(sa, sc, sz));
        for (const p of k) { min.min(new THREE.Vector3(...p)); max.max(new THREE.Vector3(...p)); }
        if (!b.glass && !b.noEdges) {
          for (const [u, v] of EDGE_PAIRS) { edges.set(k[u], e); edges.set(k[v], e + 3); e += 6; }
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      c.scene.add(mesh);
      c.meshes.push(mesh);
    };
    makeMesh(solid, new THREE.MeshLambertMaterial({ color: 0xffffff }));
    makeMesh(glass, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
    for (const b of outlines) {
      const k = cornersOf(b);
      for (const [u, v] of EDGE_PAIRS) { edges.set(k[u], e); edges.set(k[v], e + 3); e += 6; }
    }
    if (e) {
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(edges.subarray(0, e), 3));
      c.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x5a544c, transparent: true, opacity: solid.length > 4000 ? 0.28 : 0.55 }));
      c.scene.add(c.lines);
    }
    c.geo = geo;
    if (Number.isFinite(min.x)) {
      c.bounds = { center: new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5), size: new THREE.Vector3().subVectors(max, min) };
    }
    c.hover = null;
    applyPicked(c, picked);
    render();
  }, [boxes, render]); // eslint-disable-line react-hooks/exhaustive-deps

  // rebuild when the boxes change; refit when fitKey changes
  const lastFit = useRef(null);
  useEffect(() => {
    const host = hostRef.current;
    const go = () => {
      build();
      if (lastFit.current !== fitKey) { lastFit.current = fitKey; fit(); }
    };
    if (ctx.current?.ready) go();
    else host.addEventListener('scene-ready', go, { once: true });
    return () => host.removeEventListener('scene-ready', go);
  }, [build, fit, fitKey]);

  useEffect(() => {
    const c = ctx.current;
    if (!c?.ready) return;
    applyPicked(c, picked);
    render();
  }, [picked, render]);

  /* ── pointer: orbit, pan, zoom, hover, pick ── */
  const drag = useRef(null);
  const hitAt = (e) => {
    const c = ctx.current;
    if (!c?.meshes.length) return null;
    const r = c.renderer.domElement.getBoundingClientRect();
    c.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    c.raycaster.setFromCamera(c.ndc, c.camera);
    const hit = c.raycaster.intersectObjects(c.meshes, false)[0];
    if (!hit) return null;
    return c.items.find((x) => x.mesh === hit.object && x.i === hit.instanceId) || null;
  };
  const onPointerDown = (e) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false, pan: e.button === 2 || e.shiftKey || e.button === 1, orbit: { ...ctx.current?.orbit, target: ctx.current?.orbit.target.clone() } };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const c = ctx.current;
    if (!c) return;
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      if (d.pan) {
        const k = (c.orbit.radius * Math.tan((c.camera.fov * Math.PI) / 360) * 2) / (hostRef.current.clientHeight || 1);
        const right = new c.THREE.Vector3().setFromMatrixColumn(c.camera.matrix, 0);
        const up = new c.THREE.Vector3().setFromMatrixColumn(c.camera.matrix, 1);
        c.orbit.target.copy(d.orbit.target).addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
      } else {
        c.orbit.theta = d.orbit.theta - dx * 0.006;
        c.orbit.phi = Math.min(1.55, Math.max(0.05, d.orbit.phi + dy * 0.006));
      }
      render();
      return;
    }
    if (c.pending) return;
    c.pending = true;
    requestAnimationFrame(() => {
      c.pending = false;
      const hit = hitAt(e);
      const key = hit ? hit.b[hoverKey] || hit.b.pick : null;
      if (key !== c.hover) {
        paintKey(c, c.hover, null);
        c.hover = key;
        paintKey(c, key, HOVER_COLOR);
        if (c.hover !== c.picked) applyPicked(c, c.picked);
        render();
      }
      setReadout(hit ? hit.b.info : '');
    });
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && !d.pan && onPick) {
      const hit = hitAt(e);
      onPick(hit ? hit.b : null);
    }
  };
  useEffect(() => {
    const host = hostRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const c = ctx.current;
      if (!c) return;
      c.orbit.radius = Math.min(200000, Math.max(24, c.orbit.radius * Math.exp(e.deltaY * 0.0012)));
      render();
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [render]);

  return (
    <figure className="iso iso-figure lc-figure pv-3d" data-theme="light">
      <div className="iso-plate">
        <div className="iso-plate-corners" aria-hidden="true">
          <span className="iso-plate-corner" data-corner="fig">{fig}</span>
          {title ? <span className="iso-plate-corner" data-corner="title">{title}</span> : null}
          {hint ? <span className="iso-plate-corner" data-corner="hint">{hint}</span> : null}
          <span className="iso-plate-corner" data-corner="readout" ref={readoutRef}>{idle}</span>
        </div>
        <div
          ref={hostRef}
          className="pv-3d__host"
          style={{ height }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { drag.current = null; }}
          onPointerLeave={() => { const c = ctx.current; if (c && c.hover) { paintKey(c, c.hover, null); c.hover = null; applyPicked(c, c.picked); render(); } setReadout(''); }}
          onContextMenu={(e) => e.preventDefault()}
          role="img"
          aria-label={title || '3D view'}
        />
        {error ? <div className="lc-note">{error}</div> : null}
        <div className="lc-tools" role="toolbar" aria-label="View">
          <button type="button" className="ew-icon-btn" onClick={() => fit('iso')} title="Fit, 3D view" aria-label="Fit, 3D view"><Box size={14} /></button>
          <button type="button" className="ew-icon-btn" onClick={() => fit('top')} title="View from above" aria-label="View from above"><ArrowDownToLine size={14} /></button>
          <button type="button" className="ew-icon-btn" onClick={() => fit('iso')} title="Reset view" aria-label="Reset view"><Maximize2 size={14} /></button>
          {children}
        </div>
      </div>
    </figure>
  );
}

function clearMeshes(c) {
  for (const m of c.meshes) { c.scene.remove(m); m.material.dispose(); m.dispose?.(); }
  c.meshes = [];
  if (c.lines) { c.scene.remove(c.lines); c.lines.geometry.dispose(); c.lines.material.dispose(); c.lines = null; }
  c.geo?.dispose();
  c.geo = null;
}

/** Colour every instance of a key (null colour = its own colour). */
function paintKey(c, key, color) {
  if (!key) return;
  const list = c.byKey.get(key);
  if (!list) return;
  const col = new c.THREE.Color();
  const touched = new Set();
  for (const { mesh, i, b } of list) {
    mesh.setColorAt(i, col.set(color || b.color));
    touched.add(mesh);
  }
  for (const m of touched) m.instanceColor.needsUpdate = true;
}

function applyPicked(c, key) {
  if (c.picked && c.picked !== key) paintKey(c, c.picked, null);
  c.picked = key;
  if (key) paintKey(c, key, PICKED_COLOR);
}
