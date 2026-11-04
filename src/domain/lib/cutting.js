// src/domain/lib/cutting.js
// How many stock pieces a list of cuts really uses (plates, studs, headers,
// sheets). First-fit decreasing with a saw kerf between cuts.

const n = (v) => Number(v) || 0;
const KERF = 0.125;          // saw cut, in
const SHEET_W = 48;
const SHEET_H = 96;


/** First-fit decreasing: how many stock pieces of `stockIn` the cuts need. */
export function cutLinear(cutsIn, stockIn, { kerf = KERF } = {}) {
  const stock = n(stockIn);
  const cuts = cutsIn.filter((c) => c > 0).sort((a, b) => b - a);
  const bins = []; // remaining length per stock piece
  let tooLong = 0;
  for (const c of cuts) {
    if (c > stock + 1e-6) { tooLong += 1; continue; }
    // the last cut of a piece needs no saw kerf after it
    let i = bins.findIndex((left) => left + kerf + 1e-6 >= c);
    if (i < 0) { bins.push(stock); i = bins.length - 1; }
    bins[i] -= c + kerf;
  }
  const used = cuts.reduce((s, c) => s + (c <= stock + 1e-6 ? c : 0), 0);
  return { pieces: bins.length, tooLong, usedIn: used, stockIn: bins.length * stock };
}

/** Guillotine first-fit decreasing for rectangles (w × h, in) out of sheets. */
export function cutSheets(pieces, { sheetW = SHEET_W, sheetH = SHEET_H, kerf = KERF } = {}) {
  const list = pieces
    .map(([w, h]) => (w > sheetW && w <= sheetH && h <= sheetW ? [h, w] : [w, h]))
    .filter(([w, h]) => w > 0 && h > 0)
    .sort((a, b) => b[0] * b[1] - a[0] * a[1]);
  const sheets = []; // each: list of free rects {w, h}
  for (const [w, h] of list) {
    let placed = false;
    for (const free of sheets) {
      for (let i = 0; i < free.length && !placed; i += 1) {
        const r = free[i];
        for (const [pw, ph] of [[w, h], [h, w]]) {
          if (pw <= r.w + kerf + 1e-6 && ph <= r.h + kerf + 1e-6) {
            free.splice(i, 1,
              { w: r.w - pw - kerf, h: ph },          // right of the piece
              { w: r.w, h: r.h - ph - kerf });        // above the piece
            placed = true;
            break;
          }
        }
      }
      if (placed) break;
    }
    if (!placed) {
      const free = [{ w: sheetW, h: sheetH }];
      const [pw, ph] = w <= sheetW && h <= sheetH ? [w, h] : [h, w];
      free.splice(0, 1, { w: sheetW - pw - kerf, h: ph }, { w: sheetW, h: sheetH - ph - kerf });
      sheets.push(free);
    }
  }
  return { sheets: sheets.length, usedSqIn: list.reduce((s, [w, h]) => s + w * h, 0) };
}

