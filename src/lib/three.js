// src/lib/three.js
// three.js (MIT, see public/three/LICENSE) is served as a static module and
// loaded on demand: only the 3D views of Layout check use it.
'use client';

let loading = null;

/** The three.js module, loaded once. */
export function loadThree() {
  if (!loading) {
    const url = '/three/three.module.min.js';
    loading = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url).catch((err) => { loading = null; throw err; });
  }
  return loading;
}
