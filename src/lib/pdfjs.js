// src/lib/pdfjs.js
// pdf.js is served as static files from /public/pdfjs (Apache-2.0, see LICENSE
// there) and loaded on demand, so the bundle stays small and nothing has to be
// installed. Only the Plan takeoff page uses it.
'use client';

let loading = null;

/** The pdf.js module (getDocument, OPS, …), loaded once. */
export function loadPdfjs() {
  if (!loading) {
    const url = '/pdfjs/pdf.min.mjs';
    loading = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url).then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      return mod;
    }).catch((err) => { loading = null; throw err; });
  }
  return loading;
}
