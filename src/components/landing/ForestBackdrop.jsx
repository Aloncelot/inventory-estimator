// src/components/landing/ForestBackdrop.jsx
// The landing's backdrop: a cold conifer forest seen from a little above the
// canopy, forested ridges going back into the fog, mountains behind. One
// fixed canvas behind the page.
//
// The firs are painted in code (trunk, drooping tiers of branches, needles,
// light from the left) into a texture atlas and stood up as billboards, so
// each tree has a real silhouette. Parallax: scrolling slides the camera
// sideways and turns it a little, so near trees pass faster than far ridges
// and the mountains barely move; the pointer nudges it too. Fog banks drift
// slowly. With reduced motion the view stays still. Colours come from the
// --lp-forest-* tokens in landing.css.
'use client';

import { useEffect, useRef } from 'react';
import { loadThree } from '@/lib/three';

const SLIDE = 220;           // units the camera slides sideways from the top of the page to the bottom
const TURN = 0.16;           // and the radians it turns while it does
const FPS = 30;              // the drifting fog does not need more

function read(el, name, fallback) {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function ridge(a, seed, octaves = 6) {
  let v = 0; let amp = 1; let f = 1;
  for (let o = 0; o < octaves; o++) {
    v += amp * Math.sin(a * f * 3 + seed * 1.7 + o * 2.1) * Math.cos(a * f * 1.3 + seed * 0.9);
    amp *= 0.5; f *= 2.13;
  }
  return v;
}
/** Rolling hills that climb toward the back (the camera looks along -z). */
function hills(x, z) {
  const back = Math.max(0, -z - 180);
  return 14 * Math.sin(x * 0.011 + 0.6) * Math.cos(z * 0.013)
    + 26 * Math.sin(x * 0.0042 + 1.3) * Math.sin(z * 0.0061 + 0.7)
    + 10 * Math.sin(x * 0.023 + z * 0.017)
    + back * 0.085;
}

/** Paint a fir into a canvas cell: trunk, tiers of drooping branches, needles. */
function paintFir(ctx, ox, oy, W, H, r, C) {
  const cx = ox + W / 2;
  const top = oy + H * 0.03; const bottom = oy + H * 0.97;
  ctx.strokeStyle = C.trunk; ctx.lineWidth = W * 0.035;
  ctx.beginPath(); ctx.moveTo(cx, top + H * 0.05); ctx.lineTo(cx, bottom); ctx.stroke();
  const tiers = 26 + Math.floor(r() * 10);
  const spread = 0.82 + r() * 0.18;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y = top + (bottom - top - H * 0.06) * Math.pow(t, 1.05);
    const hw = (W / 2) * spread * (0.06 + 0.9 * Math.pow(t, 0.9)) * (0.82 + r() * 0.3);
    const droop = H * (0.012 + 0.05 * t) * (0.7 + r() * 0.6);
    const thick = H * (0.018 + 0.03 * t);
    for (const side of [-1, 1]) {
      const w = hw * (0.85 + r() * 0.3);
      const tipX = cx + side * w; const tipY = y + droop;
      // the branch: a drooping wedge, darker underneath
      const g = ctx.createLinearGradient(cx, y - thick, cx, y + droop + thick);
      g.addColorStop(0, side < 0 ? C.lit : C.mid);
      g.addColorStop(0.55, C.mid);
      g.addColorStop(1, C.dark);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, y - thick * 0.6);
      ctx.quadraticCurveTo(cx + side * w * 0.55, y - thick * 0.35, tipX, tipY);
      ctx.quadraticCurveTo(cx + side * w * 0.5, y + thick * 0.9, cx, y + thick * 0.8);
      ctx.closePath();
      ctx.fill();
      // needles: short strokes along the branch, tips catching the light on the left
      const n = Math.max(6, Math.floor(w / 2.2));
      for (let k = 0; k < n; k++) {
        const u = k / n;
        const px = cx + side * w * u; const py = y + droop * u * u - thick * 0.2 + (r() - 0.5) * thick * 0.8;
        const len = thick * (0.5 + r() * 0.9) * (1 - u * 0.4);
        ctx.strokeStyle = r() < (side < 0 ? 0.42 : 0.18) ? C.lit : r() < 0.5 ? C.mid : C.dark;
        ctx.lineWidth = 0.9 + r() * 0.8;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + side * len * 0.6, py + len * (0.6 + r() * 0.5)); ctx.stroke();
      }
    }
  }
  // the leader at the top
  ctx.strokeStyle = C.mid; ctx.lineWidth = W * 0.02;
  ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, top + H * 0.08); ctx.stroke();
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
        skyTop: read(el, '--lp-forest-sky-top', '#0a0f0f'),
        skyLow: read(el, '--lp-forest-sky-low', '#2e3a39'),
        fog: read(el, '--lp-forest-fog', '#212c2a'),
        far: read(el, '--lp-forest-far', '#2d3938'),
        mid: read(el, '--lp-forest-mid', '#212b2a'),
        near: read(el, '--lp-forest-near', '#151e1c'),
        mist: read(el, '--lp-forest-mist', '#a3b5b0'),
        needle: { lit: read(el, '--lp-forest-needle-lit', '#5d6f66'), mid: read(el, '--lp-forest-needle', '#2f3f37'), dark: read(el, '--lp-forest-needle-dark', '#141d19'), trunk: read(el, '--lp-forest-trunk', '#2a2621') },
      };
      const small = window.innerWidth < 760;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(C.skyTop);
      scene.fog = new THREE.Fog(C.fog, 60, 1050);
      const camera = new THREE.PerspectiveCamera(46, 1, 1, 4000);
      camera.rotation.order = 'YXZ';

      // sky: darker overhead, a pale cold band at the horizon
      const skyGeo = new THREE.SphereGeometry(3000, 32, 16);
      const top = new THREE.Color(C.skyTop); const low = new THREE.Color(C.skyLow);
      const sc = []; const sp = skyGeo.attributes.position;
      for (let i = 0; i < sp.count; i++) {
        const h = Math.max(0, sp.getY(i) / 3000);
        const c = low.clone().lerp(top, Math.min(1, Math.pow(h * 3.4, 0.7)));
        sc.push(c.r, c.g, c.b);
      }
      skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
      scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));

      // mountains: three rings of ridges, paler with distance (their colour is the haze)
      const ring = (radius, base, height, color, seed) => {
        const N = 720; const pos = []; const idx = [];
        for (let i = 0; i <= N; i++) {
          const a = (i / N) * Math.PI * 2;
          const h = base + height * (0.55 + 0.45 * ridge(a, seed)) + height * 0.3 * Math.abs(ridge(a * 3.1, seed + 5, 4));
          pos.push(Math.cos(a) * radius, -80, Math.sin(a) * radius, Math.cos(a) * radius, h, Math.sin(a) * radius);
          if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide })));
      };
      ring(2400, 120, 380, C.far, 3);
      ring(1800, 90, 260, C.mid, 11);

      // the ground: hills climbing into the fog
      const groundGeo = new THREE.PlaneGeometry(3600, 2600, 180, 130);
      groundGeo.rotateX(-Math.PI / 2);
      groundGeo.translate(0, 0, -1100);
      const gp = groundGeo.attributes.position;
      for (let i = 0; i < gp.count; i++) gp.setY(i, hills(gp.getX(i), gp.getZ(i)) - 6);
      groundGeo.computeVertexNormals();
      scene.add(new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ color: C.near })));
      scene.add(new THREE.HemisphereLight('#b6c6c3', C.near, 1.2));

      // the firs: an atlas of painted trees, stood up as billboards
      const VARIANTS = 6; const CW = 256; const CH = 512;
      const atlas = document.createElement('canvas');
      atlas.width = CW * VARIANTS; atlas.height = CH;
      const actx = atlas.getContext('2d');
      const pr = rng(19);
      for (let v = 0; v < VARIANTS; v++) paintFir(actx, v * CW, 0, CW, CH, pr, C.needle);
      const tex = new THREE.CanvasTexture(atlas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const treeGeo = new THREE.PlaneGeometry(1, 1);
      treeGeo.translate(0, 0.5, 0);
      const treeMat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide });
      // each instance picks its atlas cell through a uv offset
      treeMat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aCell;')
          .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vec2((uv.x + aCell) / ${VARIANTS}.0, uv.y);\n#endif`);
      };
      const COUNT = small ? 5000 : 11000;
      const trees = new THREE.InstancedMesh(treeGeo, treeMat, COUNT);
      const cells = new Float32Array(COUNT);
      const r = rng(7); const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const p = new THREE.Vector3(); const s = new THREE.Vector3(); const up = new THREE.Vector3(0, 1, 0);
      const tint = new THREE.Color();
      const placed = [];
      for (let i = 0; i < COUNT; i++) {
        // denser near the camera, thinning toward the back
        const depth = 30 + Math.pow(r(), 1.7) * 1500;
        const x = (r() - 0.5) * (300 + depth * 2.2);
        const z = -depth;
        const h = (26 + r() * 22) * (0.9 + Math.min(depth, 900) / 2400);
        placed.push([x, z, h, r()]);
      }
      // far first so the near ones draw over them
      placed.sort((a, b) => a[1] - b[1]);
      placed.forEach(([x, z, h, k], i) => {
        q.setFromAxisAngle(up, Math.atan2(-x, -z) + (k - 0.5) * 0.2);
        s.set(h * (0.42 + k * 0.12), h, 1);
        m4.compose(p.set(x, hills(x, z) - 4, z), q, s);
        trees.setMatrixAt(i, m4);
        tint.setScalar(0.86 + k * 0.22);
        trees.setColorAt(i, tint);
        cells[i] = Math.floor(k * VARIANTS * 0.999);
      });
      treeGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 1));
      scene.add(trees);

      // fog banks lying in the valleys, drifting
      const mistTex = (() => {
        const c = document.createElement('canvas'); c.width = 256; c.height = 128;
        const x = c.getContext('2d');
        for (let k = 0; k < 14; k++) {
          const gx = 30 + Math.random() * 196; const gy = 40 + Math.random() * 48; const rad = 30 + Math.random() * 40;
          const g = x.createRadialGradient(gx, gy, 2, gx, gy, rad);
          g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
          x.fillStyle = g; x.fillRect(0, 0, 256, 128);
        }
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
      })();
      const mistMat = new THREE.MeshBasicMaterial({ map: mistTex, color: C.mist, transparent: true, opacity: 0.32, depthWrite: false, fog: false });
      const mistGeo = new THREE.PlaneGeometry(1, 1);
      const banks = [];
      for (let i = 0; i < 40; i++) {
        const depth = 80 + r() * 1100;
        const x = (r() - 0.5) * (400 + depth * 2);
        const m = new THREE.Mesh(mistGeo, mistMat);
        m.rotation.x = -Math.PI / 2 + 0.25;
        m.position.set(x, hills(x, -depth) + 10 + r() * 22, -depth);
        m.scale.set(260 + r() * 420, 90 + r() * 120, 1);
        m.userData.speed = 1.5 + r() * 3;
        m.userData.x0 = x;
        scene.add(m); banks.push(m);
      }

      // ---- parallax: scroll slides and turns the camera, the pointer nudges it ----
      const scroller = canvas.closest('.lp') || document.scrollingElement;
      let target = 0; let prog = 0;
      let px = 0; let py = 0; let ptx = 0; let pty = 0;
      const readScroll = () => {
        const max = scroller.scrollHeight - scroller.clientHeight;
        target = max > 0 ? scroller.scrollTop / max : 0;
      };
      const place = () => {
        const x = -SLIDE / 2 + prog * SLIDE + px * 6;
        camera.position.set(x, 78 + py * 3, 40);
        camera.rotation.y = -TURN / 2 + prog * TURN + px * 0.01;
        camera.rotation.x = -0.12 - py * 0.006;
      };

      let raf = 0; let last = 0; let clock = 0;
      const frame = (now) => {
        raf = 0;
        const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
        if (last && now - last < 1000 / FPS - 2) { raf = requestAnimationFrame(frame); return; }
        last = now;
        const still = reduce.matches;
        prog += (target - prog) * (still ? 1 : 0.12);
        px += (ptx - px) * 0.06; py += (pty - py) * 0.06;
        if (!still) {
          clock += dt;
          for (const b of banks) b.position.x = b.userData.x0 + ((clock * b.userData.speed) % 400) - 200;
        }
        place();
        renderer.render(scene, camera);
        const moving = !still && !document.hidden;
        if (moving || Math.abs(target - prog) > 0.0005) raf = requestAnimationFrame(frame); else last = 0;
      };
      const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
      const onScroll = () => { readScroll(); kick(); };
      const onPointer = (e) => { ptx = (e.clientX / window.innerWidth) * 2 - 1; pty = (e.clientY / window.innerHeight) * 2 - 1; kick(); };
      const onVis = () => { if (!document.hidden) kick(); };
      scroller.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('pointermove', onPointer, { passive: true });
      document.addEventListener('visibilitychange', onVis);
      reduce.addEventListener('change', kick);
      const resize = () => {
        const w = window.innerWidth; const h = window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.fov = w / h < 0.8 ? 60 : 46;
        camera.updateProjectionMatrix();
        kick();
      };
      window.addEventListener('resize', resize);
      resize(); readScroll(); prog = target; kick();
      canvas.classList.add('is-ready');

      cleanup = () => {
        cancelAnimationFrame(raf);
        scroller.removeEventListener('scroll', onScroll);
        window.removeEventListener('pointermove', onPointer);
        document.removeEventListener('visibilitychange', onVis);
        reduce.removeEventListener('change', kick);
        window.removeEventListener('resize', resize);
        scene.traverse((o) => { if (o.geometry && o.geometry !== mistGeo) o.geometry.dispose(); if (o.material && o.material !== mistMat) o.material.dispose(); });
        mistGeo.dispose(); mistMat.dispose(); mistTex.dispose(); tex.dispose();
        renderer.dispose();
      };
    }).catch(() => {});

    return () => { disposed = true; cleanup(); };
  }, []);

  return <canvas ref={canvasRef} className="lp-forest" aria-hidden="true" />;
}
