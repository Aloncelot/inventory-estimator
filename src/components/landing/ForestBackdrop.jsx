// src/components/landing/ForestBackdrop.jsx
// The landing's backdrop: a cold conifer forest seen from a little above the
// canopy, ridges of mountains behind it, fog between. It is one fixed canvas
// behind the page. Scrolling turns the camera on its own vertical axis, a
// few degrees over the whole page, as if looking around the valley; nothing
// else moves, and it renders only when the scroll changes. Colours come from
// the --lp-forest-* tokens in landing.css.
'use client';

import { useEffect, useRef } from 'react';
import { loadThree } from '@/lib/three';

const TURN = 0.5;            // radians the view turns from the top of the page to the bottom
const START = -0.35;         // where it looks at the top of the page

function read(el, name, fallback) {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

// small deterministic noise for ridges and tree placement
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function ridge(a, seed, octaves = 5) {
  let v = 0; let amp = 1; let f = 1;
  for (let o = 0; o < octaves; o++) {
    v += amp * Math.sin(a * f * 3 + seed * 1.7 + o * 2.1) * Math.cos(a * f * 1.3 + seed * 0.9);
    amp *= 0.5; f *= 2.1;
  }
  return v;
}

export default function ForestBackdrop() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    let disposed = false;
    let cleanup = () => {};

    loadThree().then((THREE) => {
      if (disposed) return;
      let renderer;
      try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' }); } catch { return; }
      const el = canvas;
      const C = {
        skyTop: read(el, '--lp-forest-sky-top', '#0b100f'),
        skyLow: read(el, '--lp-forest-sky-low', '#2c3735'),
        fog: read(el, '--lp-forest-fog', '#202a28'),
        far: read(el, '--lp-forest-far', '#2b3634'),
        mid: read(el, '--lp-forest-mid', '#1f2927'),
        near: read(el, '--lp-forest-near', '#161f1c'),
        trees: [read(el, '--lp-forest-tree-1', '#1a2722'), read(el, '--lp-forest-tree-2', '#21302a'), read(el, '--lp-forest-tree-3', '#172420')],
        mist: read(el, '--lp-forest-mist', '#9fb1aa'),
        light: read(el, '--lp-forest-light', '#b9c8c4'),
      };
      const small = window.innerWidth < 760;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(C.skyTop);
      scene.fog = new THREE.Fog(C.fog, 90, 760);
      const camera = new THREE.PerspectiveCamera(48, 1, 1, 3000);
      camera.position.set(0, 46, 0);
      camera.rotation.order = 'YXZ';
      camera.rotation.x = -0.13;

      scene.add(new THREE.HemisphereLight(C.light, C.near, 1.1));
      const sun = new THREE.DirectionalLight(C.light, 0.7);
      sun.position.set(-300, 220, -400);
      scene.add(sun);

      // sky: a dome, darker overhead, a pale cold band at the horizon
      const skyGeo = new THREE.SphereGeometry(2500, 32, 16);
      const top = new THREE.Color(C.skyTop); const low = new THREE.Color(C.skyLow);
      const sc = []; const sp = skyGeo.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        const h = Math.max(0, sp.getY(i) / 2500);
        const c = low.clone().lerp(top, Math.min(1, Math.pow(h * 3.2, 0.7)));
        sc.push(c.r, c.g, c.b);
      }
      skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
      const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
      scene.add(sky);

      // mountains: three rings of ridges, paler with distance (no fog: their colour is the haze)
      const ringMeshes = [];
      const ring = (radius, base, height, color, seed) => {
        const N = 360; const pos = []; const idx = [];
        for (let i = 0; i <= N; i++) {
          const a = (i / N) * Math.PI * 2;
          const h = base + height * (0.55 + 0.45 * ridge(a, seed)) + height * 0.25 * Math.abs(ridge(a * 3.1, seed + 5, 3));
          pos.push(Math.cos(a) * radius, -60, Math.sin(a) * radius, Math.cos(a) * radius, h, Math.sin(a) * radius);
          if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide }));
        scene.add(m); ringMeshes.push(m);
      };
      ring(1400, 40, 260, C.far, 3);
      ring(1000, 10, 170, C.mid, 11);
      ring(700, -10, 90, C.near, 23);

      // the canopy: firs as stacked cones, instanced, on a gently rolling floor
      const fir = (() => {
        const parts = [[1, 0.95, 0], [0.78, 0.8, 0.45], [0.55, 0.65, 0.85]].map(([r, h, y]) => {
          const g = new THREE.ConeGeometry(r, h, 7, 1, false);
          g.translate(0, y + h / 2, 0);
          return g.toNonIndexed();
        });
        const trunk = new THREE.CylinderGeometry(0.08, 0.1, 0.25, 5).translate(0, 0.12, 0).toNonIndexed();
        parts.push(trunk);
        const pos = []; const nor = [];
        for (const g of parts) { pos.push(...g.attributes.position.array); g.computeVertexNormals(); nor.push(...g.attributes.normal.array); g.dispose(); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        return g;
      })();
      const COUNT = small ? 4000 : 9000;
      const trees = new THREE.InstancedMesh(fir, new THREE.MeshLambertMaterial({ flatShading: true }), COUNT);
      const r = rng(7); const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const v = new THREE.Vector3(); const s = new THREE.Vector3();
      const ground = (x, z) => -14 + 6 * Math.sin(x * 0.012) * Math.cos(z * 0.01) + 4 * Math.sin((x + z) * 0.027);
      const tint = new THREE.Color();
      for (let i = 0; i < COUNT; i++) {
        const a = r() * Math.PI * 2;
        const d = 70 + Math.sqrt(r()) * 640;
        const x = Math.cos(a) * d; const z = Math.sin(a) * d;
        const h = 16 + r() * 14;
        q.setFromAxisAngle(v.set(0, 1, 0), r() * Math.PI);
        s.set(h * (0.24 + r() * 0.08), h, h * (0.24 + r() * 0.08));
        m4.compose(v.set(x, ground(x, z), z), q, s);
        trees.setMatrixAt(i, m4);
        tint.set(C.trees[i % 3]).offsetHSL(0, -0.02, (r() - 0.5) * 0.04);
        trees.setColorAt(i, tint);
      }
      scene.add(trees);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(1200, 48), new THREE.MeshLambertMaterial({ color: C.near }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -16;
      scene.add(floor);

      // fog banks lying in the canopy
      const mistTex = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const x = c.getContext('2d');
        const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
        g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(0, 0, 128, 128);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
      })();
      const mistMat = new THREE.MeshBasicMaterial({ map: mistTex, color: C.mist, transparent: true, opacity: 0.11, depthWrite: false, fog: false });
      const mistGeo = new THREE.PlaneGeometry(1, 1);
      for (let i = 0; i < 46; i++) {
        const a = r() * Math.PI * 2; const d = 120 + r() * 560;
        const m = new THREE.Mesh(mistGeo, mistMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(Math.cos(a) * d, 4 + r() * 12, Math.sin(a) * d);
        m.scale.set(220 + r() * 300, 90 + r() * 120, 1);
        m.rotation.z = r() * Math.PI;
        scene.add(m);
      }

      // ---- turning with the scroll ------------------------------------------
      const scroller = canvas.closest('.lp') || document.scrollingElement;
      let target = START; let yaw = START; let raf = 0;
      const readScroll = () => {
        const max = scroller.scrollHeight - scroller.clientHeight;
        target = START + (max > 0 ? scroller.scrollTop / max : 0) * TURN;
      };
      const frame = () => {
        raf = 0;
        yaw += (target - yaw) * 0.12;
        if (Math.abs(target - yaw) < 0.0004) yaw = target;
        camera.rotation.y = yaw;
        renderer.render(scene, camera);
        if (yaw !== target) raf = requestAnimationFrame(frame);
      };
      const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
      const onScroll = () => { readScroll(); kick(); };
      scroller.addEventListener('scroll', onScroll, { passive: true });
      const resize = () => {
        const w = window.innerWidth; const h = window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.fov = w / h < 0.8 ? 62 : 48;
        camera.updateProjectionMatrix();
        kick();
      };
      window.addEventListener('resize', resize);
      resize(); readScroll(); yaw = target; kick();
      canvas.classList.add('is-ready');

      cleanup = () => {
        cancelAnimationFrame(raf);
        scroller.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', resize);
        scene.traverse((o) => { if (o.geometry && o.geometry !== mistGeo) o.geometry.dispose(); if (o.material && o.material !== mistMat) o.material.dispose(); });
        mistGeo.dispose(); mistMat.dispose(); mistTex.dispose();
        renderer.dispose();
      };
    }).catch(() => {});

    return () => { disposed = true; cleanup(); };
  }, []);

  return <canvas ref={canvasRef} className="lp-forest" aria-hidden="true" />;
}
