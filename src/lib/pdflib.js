// src/lib/pdflib.js
// pdf-lib (MIT, see /public/pdflib/LICENSE.md) is served as a static file and
// loaded on demand, like pdf.js: nothing to install. Used to cut one sheet out
// of a drawing set so only that sheet is kept.
'use client';

let loading = null;

/** The pdf-lib module (PDFDocument…), loaded once. */
export function loadPdfLib() {
  if (!loading) {
    const url = '/pdflib/pdf-lib.min.mjs';
    loading = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url).catch((err) => { loading = null; throw err; });
  }
  return loading;
}

/**
 * One page of a PDF as a PDF of its own (vectors and text kept, so walls and
 * notes are read from it as from the whole set).
 * @param {ArrayBuffer|Uint8Array} bytes the whole set
 * @param {number} pageNo 1-based
 * @returns {Promise<Uint8Array>}
 */
export async function extractSheet(bytes, pageNo) {
  const { PDFDocument } = await loadPdfLib();
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const out = await PDFDocument.create();
  const [page] = await out.copyPages(src, [pageNo - 1]);
  out.addPage(page);
  return out.save({ useObjectStreams: true });
}
