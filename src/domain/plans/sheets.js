// src/domain/plans/sheets.js
// The sheet number and title of each page of a drawing set, read from its
// title block: the sheet number is the biggest text shaped like one (A2-101,
// S2.201, S-401, S102A) in the right or bottom strip of the sheet; the title is
// the title-block text nearest to it that names a drawing (… FLOOR PLAN,
// FRAMING PLAN, … DETAILS), with the lines around it. Pure functions over the
// texts of extractPage() / sheetTexts().

const NUMBER_RE = /^[A-Z]{1,3}\d{0,2}[-.]?\d{1,3}(?:\.\d{1,2})?[A-Z]?$/;
const TITLE_RE = /\b(PLANS?|DETAILS?|SCHEDULES?|ELEVATIONS?|SECTIONS?|NOTES|FRAMING|FOUNDATION|ROOF|SITE|COVER|INDEX|LEGEND|SPECIFICATIONS?|TYPICAL|ENLARGED|DIAGRAM|CALCULATIONS?)\b/i;

const inTitleBlock = (t, w, h) => t.x > w * 0.78 || t.y > h * 0.84;

/** The sheet number of a page, or null. */
export function sheetNumber(texts, w, h) {
  let best = null;
  for (const t of texts || []) {
    const s = String(t.str || '').trim();
    if (!NUMBER_RE.test(s) || !/\d/.test(s) || !inTitleBlock(t, w, h)) continue;
    if (!best || t.size > best.size) best = { ...t, str: s };
  }
  // a sheet number is written big; a 9 pt tag in the margin is not one
  return best && best.size >= 14 ? best : null;
}

/** The title of a page (the drawing named in its title block), or ''. */
export function sheetTitle(texts, w, h, num) {
  const words = (texts || []).filter((t) => String(t.str || '').trim().length > 2 && t !== num);
  const hits = words.filter((t) => TITLE_RE.test(t.str) && /[A-Z]{3}/.test(t.str) && inTitleBlock(t, w, h));
  if (!hits.length) return '';
  const big = Math.max(...hits.map((t) => t.size));
  const near = (t) => (num ? Math.hypot(t.x - num.x, t.y - num.y) : 0);
  const hit = hits.filter((t) => t.size >= big * 0.6).sort((a, b) => near(a) - near(b))[0];
  // the lines of that title: same size and direction, stacked next to it
  const across = Math.abs(Math.sin(hit.angle)) > 0.7 ? (t) => t.x : (t) => t.y; // rotated title: lines stack in x
  const along = Math.abs(Math.sin(hit.angle)) > 0.7 ? (t) => -t.y : (t) => t.x;
  const lines = words.filter((t) => Math.abs(t.size - hit.size) <= hit.size * 0.06 && Math.abs(t.angle - hit.angle) < 0.1
    && Math.abs(across(t) - across(hit)) <= hit.size * 1.8 && Math.abs(along(t) - along(hit)) <= hit.size * 12);
  lines.sort((a, b) => across(a) - across(b) || along(a) - along(b));
  return lines.map((t) => t.str.trim()).join(' ').replace(/\s+-\s*$/, '').replace(/\s+/g, ' ').trim();
}

/** Number and title of one page. */
export function sheetLabel(texts, w, h) {
  const num = sheetNumber(texts, w, h);
  return { number: num?.str || '', title: sheetTitle(texts, w, h, num) };
}

/** Sheets that match a search: by number (S2.201 ≈ S2-201 ≈ s2201) or by title words. */
export function filterSheets(sheets, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return sheets;
  const bare = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const qb = bare(q);
  return sheets.filter((s) => (qb && bare(s.number).includes(qb))
    || q.split(/\s+/).every((wd) => `${s.title} ${s.number} ${s.page}`.toLowerCase().includes(wd)));
}
