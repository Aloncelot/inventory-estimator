// src/components/landing/HouseAssembly.jsx
// "From the plans to the jobsite": a tall section that stays pinned while you
// scroll through it. The scroll puts a house together panel by panel (deck,
// exterior walls, partitions, gables, trusses) as the five steps of a job go
// by. The steps are an ordinary list: without script, or with reduced
// motion, the finished house and every step are simply there.
'use client';

import { useEffect, useRef, useState } from 'react';
import { loadThree } from '@/lib/three';
import { sceneColors, wallGeometry, floorGrid, addLights } from './wallScene';
import { housePieces, stepFor } from './house';

const easeOut = (t) => 1 - (1 - t) ** 3;
const clamp01 = (t) => Math.min(1, Math.max(0, t));

export default function HouseAssembly({ steps }) {
  const trackRef = useRef(null);
  const canvasRef = useRef(null);
  const [step, setStep] = useState(-1);      // -1: not running, every step shown as is
  const [live, setLive] = useState(false);

  useEffect(() => {
    const track = trackRef.current; const canvas = canvasRef.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false;
    let cleanup = () => {};
    // pin from the start (no layout jump when three.js arrives); undo if WebGL fails
    setLive(!reduce.matches);

    // start loading only when the section is near
    const near = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      near.disconnect();
      loadThree().then((THREE) => { if (!disposed) build(THREE); }).catch(() => setLive(false));
    }, { rootMargin: '600px 0px' });
    near.observe(track);

    function build(THREE) {
      const colors = sceneColors(canvas);
      let renderer;
      try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { setLive(false); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 400);
      addLights(THREE, scene);
      const grid = floorGrid(THREE, colors);
      grid.scale.setScalar(1.6);
      scene.add(grid);

      const { pieces, deck } = housePieces();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02 });
      const cache = new Map();
      const objects = pieces.map((p) => {
        if (!cache.has(p.framed)) cache.set(p.framed, wallGeometry(THREE, p.framed, colors));
        const m = new THREE.Mesh(cache.get(p.framed), mat);
        m.rotation.y = p.ry;
        m.visible = false;
        scene.add(m);
        return { p, m };
      });
      const deckMesh = new THREE.Mesh(
        new THREE.BoxGeometry(deck.w, deck.h, deck.d),
        new THREE.MeshStandardMaterial({ color: colors.osb, roughness: 0.9 }),
      );
      scene.add(deckMesh);
      // the plan drawn on the deck: the outline the walls land on
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(deck.w - 0.6, deck.d - 0.6)),
        new THREE.LineBasicMaterial({ color: colors.grain, transparent: true }),
      );
      outline.rotation.x = -Math.PI / 2;
      outline.position.y = deck.h + 0.02;
      scene.add(outline);

      let W = 1; let H = 1; let wide = true;
      const resize = () => {
        const r = canvas.getBoundingClientRect();
        W = Math.max(1, r.width); H = Math.max(1, r.height);
        wide = W >= 900;
        renderer.setSize(W, H, false);
        camera.aspect = W / H;
        // on wide screens the house sits right of the steps
        const dx = wide ? W * 0.2 : 0; const dy = wide ? 0 : H * 0.18;
        camera.setViewOffset(W + 2 * dx, H + 2 * dy, 0, 2 * dy, W, H);
        camera.updateProjectionMatrix();
      };

      const progress = () => {
        const r = track.getBoundingClientRect();
        const run = r.height - (track.closest('.lp')?.clientHeight || window.innerHeight);
        return run > 0 ? clamp01(-r.top / run) : 1;
      };

      let lastP = -1; let lastStep = -2;
      const draw = (p) => {
        // deck rises in the first step, the outline is drawn on it
        const d = easeOut(clamp01(p / 0.12));
        deckMesh.position.y = deck.h / 2 - (1 - d) * 3;
        outline.material.opacity = clamp01((p - 0.06) / 0.08) * (1 - clamp01((p - 0.4) / 0.1)) * 0.9;
        outline.visible = outline.material.opacity > 0.01;
        for (const { p: piece, m } of objects) {
          const [a, b] = piece.at;
          const t = clamp01((p - a) / (b - a));
          m.visible = t > 0;
          if (!m.visible) continue;
          const e = easeOut(t);
          m.position.set(
            piece.pos[0] + piece.from[0] * (1 - e),
            piece.pos[1] + piece.from[1] * (1 - e),
            piece.pos[2] + piece.from[2] * (1 - e),
          );
          m.rotation.y = piece.ry + (1 - e) * 0.5;
        }
        // the camera starts over the plan and comes round to a three-quarter view
        const k = easeOut(p);
        const ang = 0.95 - 1.45 * k;
        const narrow = wide ? 1 : Math.max(1, 0.95 / camera.aspect);
        const radius = narrow * ((wide ? 80 : 74) - 14 * clamp01(p * 1.4) + 8 * clamp01((p - 0.82) / 0.18));
        const height = (44 - 24 * k) * narrow;
        camera.position.set(Math.sin(ang) * radius, height, Math.cos(ang) * radius);
        camera.lookAt(0, 4.5, 0);
        renderer.render(scene, camera);
        const s = stepFor(p);
        if (s !== lastStep) { lastStep = s; setStep(s); }
      };

      let raf = 0; let onScreen = false;
      const tick = () => {
        raf = 0;
        const p = reduce.matches ? 1 : progress();
        if (Math.abs(p - lastP) > 0.0005 || lastP < 0) { lastP = p; draw(p); }
      };
      const kick = () => { if (onScreen && !raf) raf = requestAnimationFrame(tick); };
      const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (onScreen) { lastP = -1; kick(); } }, { threshold: 0 });
      io.observe(track);
      // the landing page scrolls inside .lp, not the window
      const scroller = track.closest('.lp') || window;
      const onScroll = () => kick();
      scroller.addEventListener('scroll', onScroll, { passive: true });
      const ro = new ResizeObserver(() => { resize(); lastP = -1; kick(); });
      ro.observe(canvas);
      const onReduce = () => { setLive(!reduce.matches); lastP = -1; kick(); };
      reduce.addEventListener('change', onReduce);
      resize();
      setLive(!reduce.matches);

      cleanup = () => {
        cancelAnimationFrame(raf);
        io.disconnect(); ro.disconnect();
        scroller.removeEventListener('scroll', onScroll);
        reduce.removeEventListener('change', onReduce);
        cache.forEach((g) => g.dispose());
        mat.dispose();
        scene.traverse((o) => { if ((o.isMesh || o.isLineSegments) && !cache.has(o.geometry)) { o.geometry.dispose(); o.material.dispose(); } });
        renderer.dispose();
      };
    }

    return () => { disposed = true; near.disconnect(); cleanup(); };
  }, []);

  return (
    <section className={`lp-raise${live ? ' is-live' : ''}`} id="how" aria-labelledby="how-h" ref={trackRef}>
      <div className="lp-raise__pin">
        <canvas ref={canvasRef} className="lp-raise__canvas" aria-hidden="true" />
        <div className="lp-wrap lp-raise__copy">
          <h2 id="how-h">From the plans to the jobsite</h2>
          <p>Every job follows the same five steps, in one place, with the same numbers all the way through.</p>
          <ol className="lp-raise__steps">
            {steps.map(([t, d], i) => (
              <li key={t} className={live ? (i === step ? 'is-on' : i < step ? 'is-done' : '') : ''} aria-current={live && i === step ? 'step' : undefined}>
                <span className="lp-raise__n" aria-hidden="true">{i + 1}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
