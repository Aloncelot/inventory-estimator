// src/components/landing/HeroWall.jsx
// The hero's wall panel in three.js. Five walls take turns, 7.5 s each: the
// wall comes apart into grains from left to right, the grains fly to the next
// wall's surface, and it forms again. While a wall stands it turns slowly to
// the right on its centre line, and the pointer brushes grains off it where it
// touches (hover-particle-dissolve). The material list beside it is the
// takeoff of the members on screen.
// The cycle has six models: five walls and a U-shaped stair with its landing.
// Reduced motion: one still wall; the buttons change it at once.
'use client';

import { useEffect, useRef, useState } from 'react';
import { loadThree } from '@/lib/three';
import { WALLS } from './walls';
import { FT, sceneColors, wallGeometry, sampleSurface, erosionUniforms, solidMaterial, grainsMaterial, grainsGeometry, shadowTexture, floorGrid, addLights } from './wallScene';

const PERIOD = 7.5;            // seconds per wall, from one wall forming to the next
const BUILD = 0.8;             // the wall forming out of its grains
const GONE_AT = 5.7;           // the wall starts to come apart
const MORPH_AT = 6.5;          // the grains travel to the next wall
const YAW = 0.3;               // the slow turn: from -YAW to +YAW while it stands
const FACE = Math.PI + 0.42;   // framing side to the viewer, at three-quarters
const faceOf = (i) => WALLS[i].face ?? FACE;
const HALF = 9.5;              // half the widest wall (ft), the sweep's frame

const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

export default function HeroWall() {
  const canvasRef = useRef(null);
  const api = useRef(null);
  const [shown, setShown] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [still, setStill] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    const canvas = canvasRef.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false;
    let cleanup = () => {};

    loadThree().then((THREE) => {
      if (disposed) return;
      const colors = sceneColors(canvas);
      const small = window.innerWidth < 760;
      const COUNT = small ? 7000 : 15000;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(dpr);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
      addLights(THREE, scene);
      scene.add(floorGrid(THREE, colors));

      // every wall's geometry and grains, prepared once
      const geos = WALLS.map((w) => wallGeometry(THREE, w.framed, colors));
      const samples = geos.map((g, i) => sampleSurface(g, COUNT, i + 1));

      // shared uniforms: the brush and the two sweeps
      const shared = erosionUniforms(THREE, HALF);
      const G = shared.uGone; const B = shared.uBuilt;
      const brushU = { uBrush: shared.uBrush, uRadius: shared.uRadius, uHover: shared.uHover, uHalf: shared.uHalf };
      const meshA = new THREE.Mesh(geos[0], solidMaterial(THREE, { ...brushU, uGone: G, uBuilt: { value: 2 } }));
      const meshB = new THREE.Mesh(geos[0], solidMaterial(THREE, { ...brushU, uHover: { value: 0 }, uGone: { value: 0 }, uBuilt: B }));
      const grainsGeo = grainsGeometry(THREE, COUNT);
      const grainsMat = grainsMaterial(THREE, { ...brushU, uGone: G, uBuilt: B }, colors, dpr);
      const grains = new THREE.Points(grainsGeo, grainsMat);
      grains.frustumCulled = false;
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(THREE), transparent: true, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.01;

      const turn = new THREE.Group();      // the slow turn and the pointer yaw
      turn.add(meshA, meshB, grains, shadow);
      scene.add(turn);

      const setHomes = (slot, i) => {
        grainsGeo.attributes[`aHome${slot}`].array.set(samples[i].pos);
        grainsGeo.attributes[`aNorm${slot}`].array.set(samples[i].nor);
        grainsGeo.attributes[`aHome${slot}`].needsUpdate = true;
        grainsGeo.attributes[`aNorm${slot}`].needsUpdate = true;
      };
      const fitShadow = (i) => shadow.scale.set(WALLS[i].framed.length * FT * 1.35, 2.6, 1);

      // ---- state ----------------------------------------------------------
      let cur = 0; let next = 0;
      let c = MORPH_AT;                 // start mid-flight: the first wall forms out of grains
      let yawPointer = 0; let yawTarget = 0;
      let hoverTarget = 0;
      const brushTarget = new THREE.Vector3(999, 999, 999);
      let staticMode = reduce.matches;

      setHomes('A', 0); setHomes('B', 0);
      meshA.visible = false; meshB.geometry = geos[0]; B.value = 0; fitShadow(0);

      const showStill = (i) => {
        cur = next = i; c = BUILD + 0.01;
        meshA.geometry = geos[i]; meshA.visible = true; meshB.visible = false;
        G.value = 0; B.value = 2; grainsMat.uniforms.uMorph.value = 0;
        setHomes('A', i); fitShadow(i); setShown(i);
        turn.rotation.y = faceOf(i) - 0.18;
      };
      if (staticMode) showStill(0);
      setStill(staticMode);

      // ---- sizing ----------------------------------------------------------
      let W = 1; let H = 1;
      const resize = () => {
        const r = canvas.getBoundingClientRect();
        W = Math.max(1, r.width); H = Math.max(1, r.height);
        renderer.setSize(W, H, false);
        camera.aspect = W / H;
        const wide = W >= 900;
        // the model sits right of the copy on wide screens, above it on narrow ones
        const dx = wide ? W * 0.1 : 0; const dy = wide ? H * 0.13 : H * 0.12;
        camera.setViewOffset(W + 2 * dx, H + 2 * dy, 0, 2 * dy, W, H);
        const fov = (camera.fov * Math.PI) / 180;
        const vis = (d) => 2 * d * Math.tan(fov / 2);
        const share = wide ? 0.36 : 0.8;
        const dW = 20 / (share * vis(1) * (W / H));
        const dH = 13.5 / ((wide ? 0.56 : 0.62) * vis(1));
        const dist = Math.max(dW, dH);
        camera.position.set(0, 6.4, dist);
        camera.lookAt(0, 5.3, 0);
        camera.updateProjectionMatrix();
        grainsMat.uniforms.uScale.value = H / vis(1) / 2.2;
        dirty = true;
      };

      // ---- pointer: brush and a little yaw ----------------------------------
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      let pointerIn = false;
      const onMove = (e) => {
        const r = canvas.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        yawTarget = ndc.x * 0.12;
        pointerIn = true; dirty = true;
      };
      const onLeave = () => { pointerIn = false; hoverTarget = 0; yawTarget = 0; dirty = true; };
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerleave', onLeave);
      canvas.addEventListener('pointercancel', onLeave);
      window.addEventListener('blur', onLeave);

      const pick = () => {
        if (!pointerIn || !meshA.visible || c >= GONE_AT || c < BUILD) { hoverTarget = 0; return; }
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObject(meshA, false)[0];
        if (hit) { brushTarget.copy(meshA.worldToLocal(hit.point.clone())); hoverTarget = 1; } else hoverTarget = 0;
      };

      // ---- the timeline -------------------------------------------------------
      let jumpTo = null;
      const step = (dt) => {
        const holding = pausedRef.current && c >= BUILD && c < GONE_AT;
        if (jumpTo !== null && c >= BUILD && c < GONE_AT) { next = jumpTo; jumpTo = null; c = GONE_AT; }
        else if (!holding) c += dt;

        if (c >= GONE_AT && c < MORPH_AT) {
          if (next === cur) next = (cur + 1) % WALLS.length;
          if (meshB.geometry !== geos[next] || !meshB.userData.armed) {
            meshB.geometry = geos[next]; meshB.userData.armed = true; B.value = 0;
            setHomes('B', next);
          }
          G.value = (c - GONE_AT) / (MORPH_AT - GONE_AT);
          grainsMat.uniforms.uMorph.value = 0;
        } else if (c >= MORPH_AT && c < PERIOD) {
          if (meshA.visible && G.value < 1.2) G.value = 1.2;
          meshA.visible = false;
          grainsMat.uniforms.uMorph.value = Math.max(0.001, (c - MORPH_AT) / (PERIOD - MORPH_AT));
          if (shownRef !== next) { shownRef = next; setShown(next); }
        } else if (c >= PERIOD) {
          c -= PERIOD; cur = next;
          meshB.visible = true; meshB.userData.armed = false;
          grainsMat.uniforms.uMorph.value = 1;
          fitShadow(cur);
        }
        if (c < BUILD) {
          B.value = c / BUILD;
          meshB.visible = true;
        } else if (!meshA.visible && c >= BUILD && c < GONE_AT) {
          // the new wall is whole: it becomes wall A
          meshA.geometry = geos[cur]; meshA.visible = true; G.value = 0;
          meshB.visible = false; B.value = 2;
          setHomes('A', cur); grainsMat.uniforms.uMorph.value = 0;
        }

        // the slow turn to the right, and back while the grains travel
        let yaw; let face = faceOf(cur);
        if (c < MORPH_AT) yaw = -YAW + (2 * YAW * c) / MORPH_AT;
        else {
          const k = ease((c - MORPH_AT) / (PERIOD - MORPH_AT));
          yaw = YAW - 2 * YAW * k;
          face += (faceOf(next) - face) * k;           // each model has its own best angle
        }
        yawPointer += (yawTarget - yawPointer) * (1 - Math.exp(-6 * dt));
        turn.rotation.y = face + yaw + yawPointer;
      };
      let shownRef = 0;

      const brush = shared.uBrush.value;
      const settleBrush = (dt) => {
        pick();
        if (hoverTarget) {
          if (brush.x > 500) brush.copy(brushTarget);
          brush.lerp(brushTarget, 1 - Math.exp(-16 * dt));
        }
        const h = shared.uHover;
        const rate = hoverTarget > h.value ? 7.5 : 3.5;
        h.value += (hoverTarget - h.value) * (1 - Math.exp(-rate * dt));
        if (h.value < 0.002 && !hoverTarget) brush.set(999, 999, 999);
      };

      // ---- the loop: only while on screen and the tab is visible ----------
      let raf = 0; let last = 0; let visible = true; let dirty = true;
      const frame = (t) => {
        raf = 0;
        const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
        last = t;
        if (staticMode) {
          settleBrush(dt);
          renderer.render(scene, camera);
          if (shared.uHover.value > 0.002 || pointerIn) raf = requestAnimationFrame(frame); else last = 0;
          return;
        }
        step(dt);
        settleBrush(dt);
        grainsMat.uniforms.uTime.value = t / 1000;
        renderer.render(scene, camera);
        dirty = false;
        if (visible && !document.hidden) raf = requestAnimationFrame(frame); else last = 0;
      };
      const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

      const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }, { threshold: 0.01 });
      io.observe(canvas);
      const onVis = () => { if (!document.hidden) kick(); };
      document.addEventListener('visibilitychange', onVis);
      const ro = new ResizeObserver(() => { resize(); kick(); });
      ro.observe(canvas);
      resize();
      canvas.addEventListener('pointermove', kick);
      const onReduce = () => { staticMode = reduce.matches; setStill(staticMode); if (staticMode) showStill(cur); kick(); };
      reduce.addEventListener('change', onReduce);

      api.current = {
        go(dir) {
          const target = (cur + dir + WALLS.length) % WALLS.length;
          if (staticMode) { showStill(target); kick(); return; }
          jumpTo = target;
          kick();
        },
        kick,
      };
      setReady(true);
      kick();

      cleanup = () => {
        cancelAnimationFrame(raf);
        io.disconnect(); ro.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        reduce.removeEventListener('change', onReduce);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointermove', kick);
        canvas.removeEventListener('pointerleave', onLeave);
        canvas.removeEventListener('pointercancel', onLeave);
        window.removeEventListener('blur', onLeave);
        geos.forEach((g) => g.dispose());
        grainsGeo.dispose(); grainsMat.dispose();
        meshA.material.dispose(); meshB.material.dispose();
        shadow.geometry.dispose(); shadow.material.map.dispose(); shadow.material.dispose();
        scene.traverse((o) => { if (o.isMesh && o !== meshA && o !== meshB && o !== shadow) { o.geometry.dispose(); o.material.dispose(); } });
        renderer.dispose();
        api.current = null;
      };
    }).catch(() => { /* no WebGL or the module failed: the list and copy still stand */ });

    return () => { disposed = true; cleanup(); };
  }, []);

  useEffect(() => { api.current?.kick(); }, [paused]);

  const wall = WALLS[shown];
  return (
    <div className={`lp-stage${ready ? ' is-ready' : ''}`}>
      <div className="lp-stage__haze" aria-hidden="true" />
      <canvas ref={canvasRef} className="lp-stage__canvas" aria-hidden="true" />
      <figure className="lp-takeoff" aria-labelledby="takeoff-name">
        <figcaption>
          <span className="lp-takeoff__count">{shown + 1} of {WALLS.length}</span>
          <span id="takeoff-name" className="lp-takeoff__name" aria-live="polite">{wall.name}</span>
          <span className="lp-takeoff__size">{wall.size}</span>
        </figcaption>
        <table className="lp-takeoff__list">
          <caption className="lp-sr">Materials for this wall</caption>
          <tbody>
            {wall.list.map(([q, d], i) => (
              <tr key={d} className={i >= 7 ? 'is-extra' : undefined}><td>{q}</td><td>{d}</td></tr>
            ))}
            {wall.list.length > 7 ? (
              <tr className="lp-takeoff__more"><td /><td>and {wall.list.length - 7} more items</td></tr>
            ) : null}
          </tbody>
        </table>
        <div className="lp-takeoff__ctl">
          <button type="button" className="lp-round" onClick={() => api.current?.go(-1)} aria-label="Previous wall">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" /></svg>
          </button>
          {!still ? (
            <button type="button" className="lp-round" onClick={() => setPaused((p) => !p)} aria-pressed={paused} aria-label={paused ? 'Play the walls' : 'Pause on this wall'}>
              {paused
                ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4.5v11l9-5.5z" /></svg>
                : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4.5v11M13 4.5v11" /></svg>}
            </button>
          ) : null}
          <button type="button" className="lp-round" onClick={() => api.current?.go(1)} aria-label="Next wall">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5 13 10l-5.5 5.5" /></svg>
          </button>
        </div>
      </figure>
    </div>
  );
}
