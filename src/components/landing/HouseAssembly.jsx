// src/components/landing/HouseAssembly.jsx
// "From the plans to the jobsite": a house goes up on its own, panel by
// panel (deck, 8' exterior wall panels one at a time, partitions, gables,
// trusses, then OSB sheet by sheet on the walls, gables and roof) while the
// five steps of a job light up. Finished, it stands for
// 10 seconds, comes apart into grains and starts again. It runs only while
// the section is on screen. The steps are an ordinary list: without script,
// or with reduced motion, the finished house and every step are simply there.
'use client';

import { useEffect, useRef, useState } from 'react';
import { loadThree } from '@/lib/three';
import { sceneColors, wallGeometry, floorGrid, addLights, colorize, mergeAt, sampleSurface, erosionUniforms, solidMaterial, grainsMaterial, grainsGeometry } from './wallScene';
import { housePieces, stepFor } from './house';

const BUILD_S = 18;         // the house going up
const HOLD_S = 10;          // standing, finished
const GONE_S = 1.6;          // coming apart into grains
const FADE_S = 1.4;          // the grains rising and fading
const CYCLE = BUILD_S + HOLD_S + GONE_S + FADE_S;

const easeOut = (t) => 1 - (1 - t) ** 3;
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

export default function HouseAssembly({ steps }) {
  const sectionRef = useRef(null);
  const canvasRef = useRef(null);
  const [step, setStep] = useState(-1);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const section = sectionRef.current; const canvas = canvasRef.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false;
    let cleanup = () => {};

    const near = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      near.disconnect();
      loadThree().then((THREE) => { if (!disposed) build(THREE); }).catch(() => {});
    }, { rootMargin: '600px 0px' });
    near.observe(section);

    function build(THREE) {
      let renderer;
      try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { return; }
      const colors = sceneColors(canvas);
      const small = window.innerWidth < 760;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      renderer.setPixelRatio(dpr);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 400);
      addLights(THREE, scene);
      const grid = floorGrid(THREE, colors);
      grid.scale.setScalar(1.6);
      scene.add(grid);

      // ---- the pieces ------------------------------------------------------
      const { pieces, deck } = housePieces();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02 });
      const cache = new Map();
      const geometryOf = (p) => {
        const key = p.framed || (p.box ? `box:${p.box.join(',')}` : `poly:${JSON.stringify(p.poly)}`);
        if (cache.has(key)) return cache.get(key);
        let g;
        if (p.framed) g = wallGeometry(THREE, p.framed, colors);
        else if (p.box) g = colorize(THREE, new THREE.BoxGeometry(...p.box), colors.osb);
        else {
          // a sheet cut to the gable's rake, extruded to 7/16"
          const shape = new THREE.Shape(p.poly.map(([x, y]) => new THREE.Vector2(x, y)));
          g = colorize(THREE, new THREE.ExtrudeGeometry(shape, { depth: 7 / 16 / 12, bevelEnabled: false }), colors.osb);
        }
        cache.set(key, g);
        return g;
      };
      const objects = pieces.map((p) => {
        const m = new THREE.Mesh(geometryOf(p), mat);
        m.visible = false;
        scene.add(m);
        return { p, m };
      });
      const deckGeo = colorize(THREE, new THREE.BoxGeometry(deck.w, deck.h, deck.d), colors.osb);
      const deckMesh = new THREE.Mesh(deckGeo, mat);
      scene.add(deckMesh);
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(deck.w - 0.6, deck.d - 0.6)),
        new THREE.LineBasicMaterial({ color: colors.grain, transparent: true }),
      );
      outline.rotation.x = -Math.PI / 2;
      outline.position.y = deck.h + 0.02;
      scene.add(outline);

      // ---- the finished house as one surface, for coming apart ---------------
      const place = new THREE.Object3D();
      const finalMatrix = (p) => {
        place.position.set(...p.pos);
        place.rotation.set(p.rx || 0, p.ry || 0, 0, 'YXZ');
        place.updateMatrix();
        return place.matrix.clone();
      };
      const deckMatrix = new THREE.Matrix4().makeTranslation(0, deck.h / 2, 0);
      const whole = mergeAt(THREE, [{ geometry: deckGeo, matrix: deckMatrix }, ...pieces.map((p) => ({ geometry: geometryOf(p), matrix: finalMatrix(p) }))]);
      const shared = erosionUniforms(THREE, 15);
      shared.uRadius.value = 0.001;
      const G = shared.uGone;
      const solid = new THREE.Mesh(whole, solidMaterial(THREE, { ...shared, uBuilt: { value: 2 } }));
      solid.visible = false;
      scene.add(solid);
      const COUNT = small ? 14000 : 30000;
      const smp = sampleSurface(whole, COUNT, 7);
      const grainsGeo = grainsGeometry(THREE, COUNT);
      for (const [slot, arr] of [['aHomeA', smp.pos], ['aNormA', smp.nor], ['aHomeB', smp.pos], ['aNormB', smp.nor]]) grainsGeo.attributes[slot].array.set(arr);
      const grainsMat = grainsMaterial(THREE, { ...shared, uBuilt: { value: 2 } }, colors, dpr);
      grainsMat.uniforms.uReach.value = 3;
      grainsMat.uniforms.uSize.value *= 1.2;
      const grains = new THREE.Points(grainsGeo, grainsMat);
      grains.frustumCulled = false;
      grains.visible = false;
      scene.add(grains);

      // ---- sizing --------------------------------------------------------------
      let wide = true;
      const resize = () => {
        const r = canvas.getBoundingClientRect();
        const W = Math.max(1, r.width); const H = Math.max(1, r.height);
        wide = W >= 900;
        renderer.setSize(W, H, false);
        camera.aspect = W / H;
        const dx = wide ? W * 0.17 : 0; const dy = wide ? 0 : H * 0.06;
        camera.setViewOffset(W + 2 * dx, H + 2 * dy, 0, 2 * dy, W, H);
        camera.updateProjectionMatrix();
        grainsMat.uniforms.uScale.value = H / (2 * Math.tan((camera.fov * Math.PI) / 360)) / 2.2;
      };

      // ---- one frame at time t of the cycle --------------------------------------
      let lastStep = -2;
      const draw = (t, clock) => {
        const p = clamp01(t / BUILD_S);
        const goneT = t - BUILD_S - HOLD_S;               // > 0 once it comes apart
        const apart = goneT > 0;

        // the build: deck, outline, pieces flying in
        const d = easeOut(clamp01(p / 0.08));
        deckMesh.position.y = deck.h / 2 - (1 - d) * 3;
        outline.material.opacity = clamp01((p - 0.04) / 0.06) * (1 - clamp01((p - 0.3) / 0.1)) * 0.9;
        outline.visible = !apart && outline.material.opacity > 0.01;
        deckMesh.visible = !apart;
        for (const { p: piece, m } of objects) {
          const [a, b] = piece.at;
          const k = clamp01((p - a) / (b - a));
          m.visible = !apart && k > 0;
          if (!m.visible) continue;
          const e = easeOut(k);
          m.position.set(piece.pos[0] + piece.from[0] * (1 - e), piece.pos[1] + piece.from[1] * (1 - e), piece.pos[2] + piece.from[2] * (1 - e));
          m.rotation.set(piece.rx || 0, (piece.ry || 0) + (1 - e) * 0.5, 0, 'YXZ');
        }

        // coming apart: the whole house turns to grains, which rise and fade
        solid.visible = apart && goneT < GONE_S;
        grains.visible = apart;
        G.value = apart ? clamp01(goneT / GONE_S) * 1.15 : 0;
        grainsMat.uniforms.uFade.value = 1 - clamp01((goneT - GONE_S * 0.6) / FADE_S);
        grainsMat.uniforms.uLift.value = apart ? goneT * 1.6 : 0;
        grainsMat.uniforms.uTime.value = clock;

        // the camera: over the plan, round to three-quarters, a slow orbit while
        // it stands, and back to the start while the grains fade
        let q = ease(p); let orbit = 0;
        if (t > BUILD_S) orbit = (Math.min(t, BUILD_S + HOLD_S) - BUILD_S) * 0.025;
        if (apart) { const back = ease(clamp01(goneT / (GONE_S + FADE_S))); q = 1 - back; orbit *= 1 - back; }
        const narrow = Math.max(1, (wide ? 1.75 : 1.45) / camera.aspect); // pull back when the frame is narrow
        const ang = 0.95 - 1.45 * q - orbit;
        const radius = narrow * ((wide ? 80 : 74) - 14 * clamp01(q * 1.4) + 8 * clamp01((q - 0.82) / 0.18));
        const height = (44 - 24 * q) * narrow;
        camera.position.set(Math.sin(ang) * radius, height, Math.cos(ang) * radius);
        camera.lookAt(0, 5, 0);
        renderer.render(scene, camera);

        const s = apart ? 4 : stepFor(p);
        if (s !== lastStep) { lastStep = s; setStep(s); }
      };

      // ---- the clock: advances only while the section is on screen --------------
      let t = 0; let raf = 0; let last = 0; let onScreen = false;
      const frame = (now) => {
        raf = 0;
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
        last = now;
        if (reduce.matches) { draw(BUILD_S, now / 1000); last = 0; return; }
        t += dt;
        if (t >= CYCLE) t = 0;
        draw(t, now / 1000);
        if (onScreen && !document.hidden) raf = requestAnimationFrame(frame); else last = 0;
      };
      const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
      const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (onScreen) kick(); }, { threshold: 0.05 });
      io.observe(section);
      const onVis = () => { if (!document.hidden) kick(); };
      document.addEventListener('visibilitychange', onVis);
      const ro = new ResizeObserver(() => { resize(); kick(); });
      ro.observe(canvas);
      const onReduce = () => { setLive(!reduce.matches); kick(); };
      reduce.addEventListener('change', onReduce);
      resize();
      setLive(!reduce.matches);
      kick();

      cleanup = () => {
        cancelAnimationFrame(raf);
        io.disconnect(); ro.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        reduce.removeEventListener('change', onReduce);
        cache.forEach((g) => g.dispose());
        deckGeo.dispose(); whole.dispose(); grainsGeo.dispose();
        mat.dispose(); grainsMat.dispose(); solid.material.dispose();
        outline.geometry.dispose(); outline.material.dispose();
        grid.geometry.dispose(); grid.material.dispose();
        renderer.dispose();
      };
    }

    return () => { disposed = true; near.disconnect(); cleanup(); };
  }, []);

  return (
    <section className={`lp-raise${live ? ' is-live' : ''}`} id="how" aria-labelledby="how-h" ref={sectionRef}>
      <canvas ref={canvasRef} className="lp-raise__canvas" aria-hidden="true" />
      <div className="lp-raise__haze" aria-hidden="true" />
      <div className="lp-wrap lp-raise__copy">
        <div className="lp-glass">
          <h2 id="how-h">From the plans to the jobsite</h2>
          <p>Every job follows the same five steps, in one place, with the same numbers all the way through.</p>
          <ol className="lp-raise__steps">
            {steps.map(([title, desc], i) => (
              <li key={title} className={live ? (i === step ? 'is-on' : i < step ? 'is-done' : '') : ''} aria-current={live && i === step ? 'step' : undefined}>
                <span className="lp-raise__n" aria-hidden="true">{i + 1}</span>
                <h3>{title}</h3>
                <p>{desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
