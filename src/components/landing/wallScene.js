// src/components/landing/wallScene.js
// three.js pieces shared by the hero wall and the house section: a framed
// wall as one BufferGeometry, the erosion shader (solid and grains evaluate
// the same function at the rest position, so a grain appears exactly where
// the solid clips), and area-weighted surface sampling for the grains.
// THREE is passed in: it is loaded on demand (src/lib/three.js).

export const FT = 1 / 12;           // scene units are feet; walls are framed in inches

// colours: pale lumber, a greyer OSB, dark steel. Read from the page's CSS
// tokens when available so the 3D sits in the same palette as the type.
export function sceneColors(el) {
  const cs = typeof window !== 'undefined' ? getComputedStyle(el || document.documentElement) : null;
  const read = (name, fallback) => (cs && cs.getPropertyValue(name).trim()) || fallback;
  return {
    lumber: read('--lp-3d-lumber', '#d6cfb9'),
    osb: read('--lp-3d-osb', '#8f8c76'),
    steel: read('--lp-3d-steel', '#4c5450'),
    pt: read('--lp-3d-pt', '#7d8f6a'),
    grain: read('--lp-3d-grain', '#e4ead9'),
    spark: read('--lp-3d-spark', '#f3e6c4'),
    ground: read('--lp-ground', '#0c100e'),
    grid: read('--lp-3d-grid', '#2a3530'),
  };
}

const BOX_FACES = [
  // normal, the four corners as (sx, sy, sz) signs
  [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
  [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
  [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
  [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
  [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
  [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
];

/** Small deterministic hash so each member keeps its own shade build to build. */
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/**
 * One wall's members as a non-indexed geometry in feet, centred on x and z,
 * standing on y = 0. Adds a per-vertex colour.
 */
export function wallGeometry(THREE, framed, colors) {
  const pos = []; const nor = []; const col = [];
  const cLumber = new THREE.Color(colors.lumber);
  const cOsb = new THREE.Color(colors.osb);
  const cSteel = new THREE.Color(colors.steel);
  const cPt = new THREE.Color(colors.pt);
  const ox = framed.length / 2; const oz = framed.depth / 2;
  const tmp = new THREE.Color();
  // an outline [[x, y], ...] (inches) extruded d along z: a cut stringer, a gable sheet
  const pushPrism = (m, color) => {
    const pts = m.poly.map(([x, y]) => new THREE.Vector2((x - ox) * FT, y * FT));
    if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
    const z0 = (m.z - oz) * FT; const z1 = (m.z + m.d - oz) * FT;
    const tri = (a, b, c, n) => { for (const v of [a, b, c]) { pos.push(...v); nor.push(...n); col.push(color.r, color.g, color.b); } };
    for (const [i0, i1, i2] of THREE.ShapeUtils.triangulateShape(pts, [])) {
      const [a, b, c] = [pts[i0], pts[i1], pts[i2]];
      tri([a.x, a.y, z1], [b.x, b.y, z1], [c.x, c.y, z1], [0, 0, 1]);
      tri([a.x, a.y, z0], [c.x, c.y, z0], [b.x, b.y, z0], [0, 0, -1]);
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]; const b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const n = [(b.y - a.y) / len, -(b.x - a.x) / len, 0];
      tri([a.x, a.y, z0], [b.x, b.y, z0], [b.x, b.y, z1], n);
      tri([a.x, a.y, z0], [b.x, b.y, z1], [a.x, a.y, z1], n);
    }
  };
  framed.members.forEach((m, i) => {
    const base = m.kind === 'osb' ? cOsb : m.kind === 'steel' ? cSteel : cLumber;
    // a little variation between boards, none on steel
    const v = m.kind === 'steel' ? 0 : (hash(i) - 0.5) * (m.kind === 'osb' ? 0.06 : 0.1);
    tmp.copy(base).offsetHSL(0, 0, v);
    if (m.kind === 'header') tmp.offsetHSL(0, -0.03, -0.05);
    if (m.note === 'PT') tmp.lerp(cPt, 0.45);           // pressure treated: a greener cast
    if (m.poly) { pushPrism(m, tmp); return; }
    const cx = (m.x + m.w / 2 - ox) * FT; const cy = (m.y + m.h / 2) * FT; const cz = (m.z + m.d / 2 - oz) * FT;
    const hx = (m.w / 2) * FT; const hy = (m.h / 2) * FT; const hz = (m.d / 2) * FT;
    const c = Math.cos(m.rot || 0); const s = Math.sin(m.rot || 0);
    for (const [n, corners] of BOX_FACES) {
      const nx = n[0] * c - n[1] * s; const ny = n[0] * s + n[1] * c;
      const p = corners.map(([sx, sy, sz]) => {
        const lx = sx * hx; const ly = sy * hy;
        return [cx + lx * c - ly * s, cy + lx * s + ly * c, cz + sz * hz];
      });
      for (const k of [0, 1, 2, 0, 2, 3]) {
        pos.push(...p[k]); nor.push(nx, ny, n[2]); col.push(tmp.r, tmp.g, tmp.b);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * Area-weighted samples on a geometry's surface: { pos, nor } Float32Arrays
 * of `count` points, sorted left to right so two walls pair up along x.
 */
export function sampleSurface(geometry, count, seed = 1) {
  const P = geometry.attributes.position.array; const N = geometry.attributes.normal.array;
  const tris = P.length / 9;
  const cum = new Float64Array(tris);
  let total = 0;
  for (let t = 0; t < tris; t++) {
    const i = t * 9;
    const ax = P[i + 3] - P[i]; const ay = P[i + 4] - P[i + 1]; const az = P[i + 5] - P[i + 2];
    const bx = P[i + 6] - P[i]; const by = P[i + 7] - P[i + 1]; const bz = P[i + 8] - P[i + 2];
    const cx = ay * bz - az * by; const cy = az * bx - ax * bz; const cz = ax * by - ay * bx;
    total += Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
    cum[t] = total;
  }
  let r = seed * 9301 + 49297;
  const rand = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const out = [];
  for (let k = 0; k < count; k++) {
    const target = rand() * total;
    let lo = 0; let hi = tris - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid + 1; else hi = mid; }
    const i = lo * 9;
    const u = Math.sqrt(rand()); const v = rand();
    const w0 = 1 - u; const w1 = u * (1 - v); const w2 = u * v;
    out.push([
      P[i] * w0 + P[i + 3] * w1 + P[i + 6] * w2,
      P[i + 1] * w0 + P[i + 4] * w1 + P[i + 7] * w2,
      P[i + 2] * w0 + P[i + 5] * w1 + P[i + 8] * w2,
      N[i], N[i + 1], N[i + 2],
    ]);
  }
  out.sort((a, b) => a[0] - b[0]);
  const pos = new Float32Array(count * 3); const nor = new Float32Array(count * 3);
  out.forEach((s, k) => { pos.set(s.slice(0, 3), k * 3); nor.set(s.slice(3), k * 3); });
  return { pos, nor };
}

// ---- the erosion function, shared by both passes -------------------------
// exposure 0 = intact surface, 1 = fully turned to grains.
//   hover:  a brush around the pointer hit, with a little spatial noise
//   gone:   a sweep from left to right that takes the wall apart
//   built:  a sweep from left to right that puts the next wall together
const EROSION_GLSL = /* glsl */ `
uniform vec3 uBrush;
uniform float uRadius;
uniform float uHover;
uniform float uGone;
uniform float uBuilt;
uniform float uHalf;
float lpHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float lpNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lpHash(i), lpHash(i + vec3(1,0,0)), f.x), mix(lpHash(i + vec3(0,1,0)), lpHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(lpHash(i + vec3(0,0,1)), lpHash(i + vec3(1,0,1)), f.x), mix(lpHash(i + vec3(0,1,1)), lpHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float lpExposure(vec3 rest) {
  float n = lpNoise(rest * 2.2);
  float hov = uHover * (1.0 - smoothstep(0.55, 1.0, distance(rest, uBrush) / uRadius + (n - 0.5) * 0.45));
  float s = clamp(rest.x / (2.0 * uHalf) + 0.5, 0.0, 1.0) * 0.86 + n * 0.14;
  float gone = smoothstep(s, s + 0.08, uGone * 1.1);
  float notBuilt = 1.0 - smoothstep(s, s + 0.08, uBuilt * 1.1);
  return max(hov, max(gone, notBuilt));
}
`;

export function erosionUniforms(THREE, halfWidth) {
  return {
    uBrush: { value: new THREE.Vector3(999, 999, 999) },
    uRadius: { value: 1.6 },
    uHover: { value: 0 },
    uGone: { value: 0 },
    uBuilt: { value: 2 },
    uHalf: { value: halfWidth },
  };
}

/** The solid: a standard material that clips where the erosion passes 0.5. */
export function solidMaterial(THREE, uniforms) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRest;\n${EROSION_GLSL}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (lpExposure(vRest) > 0.5) discard;');
  };
  mat.customProgramCacheKey = () => 'lp-erosion';
  return mat;
}

/**
 * The grains: one Points cloud that can rest on wall A, travel to wall B
 * (uMorph 0 to 1) and rest on B. Attributes aHomeA/aNormA/aHomeB/aNormB/aSeed.
 */
export function grainsMaterial(THREE, uniforms, colors, pixelRatio) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      ...uniforms,
      uMorph: { value: 0 },
      uTime: { value: 0 },
      uFade: { value: 1 },
      uLift: { value: 0 },
      uReach: { value: 1 },
      uSize: { value: 0.075 * pixelRatio },
      uScale: { value: 600 },
      uInk: { value: new THREE.Color(colors.grain) },
      uSpark: { value: new THREE.Color(colors.spark) },
    },
    vertexShader: /* glsl */ `
      ${EROSION_GLSL}
      uniform float uMorph; uniform float uTime; uniform float uSize; uniform float uScale; uniform float uLift; uniform float uReach; uniform float uFade;
      attribute vec3 aHomeA; attribute vec3 aNormA; attribute vec3 aHomeB; attribute vec3 aNormB; attribute vec4 aSeed;
      varying float vAlpha; varying float vSpark;
      void main() {
        float seed = aSeed.x; float far = aSeed.y; float order = aSeed.w;
        // travel: left-most grains leave first; an arc lifts them off the line
        float m = clamp(uMorph * 1.6 - order * 0.6, 0.0, 1.0);
        m = m * m * (3.0 - 2.0 * m);
        vec3 home = mix(aHomeA, aHomeB, m);
        vec3 nrm = normalize(mix(aNormA, aNormB, m) + 1e-4);
        float e;
        if (uMorph <= 0.0) e = lpExposure(aHomeA);
        else if (uMorph < 1.0) e = 1.0;
        else e = lpExposure(aHomeB);
        // 65% stay close, 26% drift a little, 9% travel farther
        float reach = (far < 0.65 ? 0.18 : far < 0.91 ? 0.55 : 1.5) * uReach;
        vec3 flow = vec3(sin(home.y * 1.7 + uTime * 0.6 + seed * 6.28), sin(home.x * 1.3 - uTime * 0.5), cos(home.x * 0.9 + home.y + uTime * 0.4)) ;
        vec3 p = home + (nrm * 0.12 + flow * 0.22) * reach * e;
        p += vec3(0.0, 0.9 + far * 1.6, (seed - 0.5) * 3.2) * sin(3.14159 * m) * step(0.0001, uMorph) * step(uMorph, 0.9999);
        p.y += uLift * (0.4 + far) * e;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uScale / -mv.z * (0.6 + seed * 0.8);
        vAlpha = smoothstep(0.32, 0.62, e) * uFade;
        vSpark = step(0.94, aSeed.z);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uInk; uniform vec3 uSpark;
      varying float vAlpha; varying float vSpark;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5 || vAlpha < 0.01) discard;
        float soft = smoothstep(0.5, 0.1, d);
        gl_FragColor = vec4(mix(uInk, uSpark, vSpark), soft * vAlpha * 0.95);
      }
    `,
  });
}

/** A Points geometry that can hold two walls' samples. */
export function grainsGeometry(THREE, count) {
  const g = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seeds[i * 4] = hash(i + 0.5);
    seeds[i * 4 + 1] = hash(i * 1.7 + 3.1);
    seeds[i * 4 + 2] = hash(i * 2.3 + 7.7);
    seeds[i * 4 + 3] = i / count;     // order along x (samples are sorted)
  }
  for (const name of ['aHomeA', 'aNormA', 'aHomeB', 'aNormB']) g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  // three needs a position attribute to size the draw call
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, 0), 30);
  return g;
}

/** A soft round contact shadow as a canvas texture. */
export function shadowTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 32, 4, 128, 32, 124);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A shop-floor grid that fades into the fog. */
export function floorGrid(THREE, colors) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(colors.grid) } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 uColor; varying vec3 vW;
      void main(){
        vec2 g = abs(fract(vW.xz / 2.0 - 0.5) - 0.5) / fwidth(vW.xz / 2.0);
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        float fade = 1.0 - smoothstep(6.0, 26.0, length(vW.xz));
        gl_FragColor = vec4(uColor, line * fade * 0.55);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** Key, cool rim and low fill: one recipe for both scenes. */
export function addLights(THREE, scene) {
  scene.add(new THREE.HemisphereLight('#c9d4cc', '#3a443e', 0.6));   // lit undersides, so a sheet in flight never goes black
  const key = new THREE.DirectionalLight('#fff4e2', 2.1);
  key.position.set(6, 10, 9);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#9fb8ab', 1.3);
  rim.position.set(-9, 6, -8);
  scene.add(rim);
  const fill = new THREE.DirectionalLight('#7f9188', 0.35);
  fill.position.set(-4, 1, 10);
  scene.add(fill);
}

/** Give a geometry a flat vertex colour and make it non-indexed, ready to merge. */
export function colorize(THREE, geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g;
}

/** Merge non-indexed geometries (position, normal, colour), each moved by its matrix. */
export function mergeAt(THREE, parts) {
  const out = { position: [], normal: [], color: [] };
  for (const { geometry, matrix } of parts) {
    const g = geometry.clone();
    g.applyMatrix4(matrix);
    for (const k of Object.keys(out)) out[k].push(g.attributes[k].array);
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  for (const [k, arrays] of Object.entries(out)) {
    const len = arrays.reduce((t, a) => t + a.length, 0);
    const buf = new Float32Array(len);
    let at = 0;
    for (const a of arrays) { buf.set(a, at); at += a.length; }
    merged.setAttribute(k, new THREE.BufferAttribute(buf, 3));
  }
  merged.computeBoundingSphere();
  return merged;
}
