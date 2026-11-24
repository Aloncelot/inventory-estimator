// src/domain/assistant/estimateTools.js
// What the assistant can do to an estimate's wall panels and loose material,
// as tools a model can call. Each tool makes the same edit the pages make
// (same blank pieces from blank.js, same fields), on a draft; the user sees
// the changes and applies them or not.
//
// Materials come only from the price list: find_material searches it and
// keeps what it found in the request's session under short ids (m1, m2…);
// the other tools accept only those ids, so the model can never invent a
// material or a price.
//
// The tool specs are plain objects (name, description, params) so any model
// adapter can turn them into its own format (src/lib/ai.js).
import { blankSection, blankLevel, blankLooseSection, generateId } from '../estimate/blank.js';
import { computeWallPanels, computeLoose, rowCalcType, WALL_KINDS } from '../estimate/index.js';
import { tryEvaluate } from '../lib/calc.js';
import { formatMoney, currencyOf } from '../lib/currency.js';
import { searchMaterials } from './materialSearch.js';

// The row types of the Loose material page. Mirrors LOOSE_ITEMS in
// src/components/LooseMaterialSection.jsx (the domain cannot import components).
export const LOOSE_TYPES = [
  'Extra', 'Angle', 'Beams', 'Blocking', 'Blocking at openings', 'Bolts', 'Bottom Plate - Loose', 'Bottom Plate - Panel',
  'Bottom Plate PT - Panel', 'Brace', 'Caulk', 'Clips', 'Coiled Strap', 'Collar tie', 'Column Cap', 'Concrete nails',
  'Cornice', 'Diagonal Bracing', 'Eave', 'Epoxy', 'Fascia', 'Flashing Tape', 'Foam sill sealer', 'Framing nails', 'Gable',
  'Glue', 'Hangers - Beams', 'Hangers - Joist', 'Hangers - Stringer', 'Header Infill', 'Headers', 'Holdown',
  'House wrapping', 'Hurricane tie', 'I-Joist', 'Ice & Water Shield', 'In wall Post', 'Insulation', 'Joist', 'Kicker',
  'Lally Column', 'Landing', 'Ledger', 'Ledger bolts', 'Nailer', 'Nails', 'Nuts', 'Outriggers', 'Plates', 'Plates - Loose',
  'Plates - Panel', 'Post', 'Post base', 'Post Cap', 'Rafter', 'Rake', 'Ribbon Rim Board', 'Ridge', 'Rigid Insulation',
  'Rim Joist', 'Rimboard', 'Roofing nails', 'Screws', 'Sheathing', 'Sheathing nails', 'Sill Plate', 'SIP', 'Strapping',
  'Stringer', 'Stud plate', 'Studs', 'Subfascia', 'Subfloor', 'Tape - header/jambs', 'Tape - sill', 'Tape - Zip system',
  'Temporary Bracing', 'Threaded rod', 'Top Plate - Loose', 'Top Plate - Panel', 'Trim', 'Truss bracing', 'Underlayment',
  'Washer', 'Blocking at sheathing joints', 'Blocking Bathroom/Kitchen/Stairs', 'Panel band sheathing', 'PT Plates - Loose',
];

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const num = (description, extra = {}) => ({ type: 'number', description, ...extra });
const opt = { optional: true };
// amounts may be a calculation, worked out by the tool so the model does no arithmetic
const amt = (description, extra = {}) => str(`${description} A number or a calculation like "14*16".`, extra);
const MATERIAL = (what) => str(`Optional: the ${what} material, as an id returned by find_material in this request (like "mk7-2").`, opt);
const LEVEL = str('The level: its name (like "Level 1", "level one", "Basement"), or "#N" for its position in the list.');
const WALL = str('The wall section: its name (like "Poolhouse", "Section 2", "Level 2 Section 1"), or "#N" for its number in the list.');
const LOOSE = str('The Loose material section: its name (like "Roof", "1st Level", "level one"), or "#N" for its position in the list.');

// the fields add_wall_section and update_wall_section share
const WALL_FIELDS = {
  kind: str('Optional: exterior for an exterior wall; for interior walls partition (default), bearing, shear or knee.', { enum: ['exterior', ...WALL_KINDS], ...opt }),
  length_lf: amt('Optional: the wall length in linear feet.', opt),
  rectangle: {
    type: 'object',
    description: 'Optional: a rectangle in feet ({width, length}, or text like "50 x 120"); its perimeter becomes the length. Use it instead of adding the sides yourself.',
    properties: { width: amt('Width in feet.'), length: amt('Length in feet.') },
    ...opt,
  },
  height_ft: amt('Optional: wall height in feet (12 by default).', opt),
  stud_spacing_in: amt('Optional: stud spacing in inches on center (16 by default).', opt),
  studs: str('Optional: single, double or triple studs.', { enum: ['single', 'double', 'triple'], ...opt }),
  sheathing: MATERIAL('sheathing'),
  studs_material: MATERIAL('studs'),
  plates_material: MATERIAL('bottom and top plate'),
  blocking_material: MATERIAL('blocking'),
};

export const ESTIMATE_TOOLS = [
  {
    name: 'find_material',
    description: 'Search the company price list for a material from the user\'s words ("green zip R6", "2x6 10\'", "LUS210 hanger"). Returns candidates with ids (m1, m2…) to pass to the other tools. Call it before setting any material; if several fit, ask the user which one.',
    params: { query: str('The material in the user\'s words: family, size, brand.') },
  },
  {
    name: 'perimeter',
    description: 'Add up a perimeter in feet: a rectangle (width and length) or a list of sides (an L-shape has six). Use it instead of doing the math yourself.',
    params: {
      width: amt('Optional: rectangle width in feet.', opt),
      length: amt('Optional: rectangle length in feet.', opt),
      sides: { type: 'array', items: amt('A side in feet.'), description: 'Optional: every side in feet, instead of width and length.', ...opt },
    },
  },
  {
    name: 'add_level',
    description: 'Add a level to the wall panels: a floor above the last level (top) or a basement below the first (below). It comes with one exterior and one interior section.',
    params: { where: str('top or below.', { enum: ['top', 'below'] }) },
  },
  {
    name: 'add_wall_section',
    description: 'Add a wall section to a level, exterior or interior. Materials left out get the page defaults.',
    params: {
      level: LEVEL,
      side: str('exterior or interior.', { enum: ['exterior', 'interior'] }),
      name: str('Optional: its name, like "Poolhouse". "Section N" when left out.', opt),
      ...WALL_FIELDS,
    },
  },
  {
    name: 'update_wall_section',
    description: 'Change a wall section: only the fields given change. An exterior section stays exterior; interior ones can change kind.',
    params: {
      section: WALL,
      level: str('Optional: the level it is on, when the name is on several levels.', opt),
      name: str('Optional: a new name.', opt),
      ...WALL_FIELDS,
    },
  },
  {
    name: 'remove_wall_section',
    description: 'Remove a wall section.',
    params: { section: WALL, level: str('Optional: the level it is on, when the name is on several levels.', opt) },
  },
  {
    name: 'add_loose_section',
    description: 'Add an empty section to the Loose material page, like "Poolhouse" or "Deck".',
    params: { name: str('Its name.') },
  },
  {
    name: 'add_loose_row',
    description: 'Add a row to a Loose material section. Lumber runs (joist, I-joist, beams, plates, blocking, studs, strapping, sheathing, tape, rimboard) take length_lf; subfloor takes area_sqft; glue follows the subfloor; hangers and other counted items take quantity; Extra takes a formula (like "12*16+4") for anything without its own type.',
    params: {
      section: LOOSE,
      type: str('The row type, a Loose material item name like "Joist", "Hangers - Joist", "Subfloor" or "Extra".'),
      quantity: amt('Optional: how many, for counted items.', opt),
      length_lf: amt('Optional: linear feet, for lumber runs.', opt),
      area_sqft: amt('Optional: square feet, for subfloor.', opt),
      formula: str('Optional: for Extra, the calculation of its quantity, like "12*16+4".', opt),
      material: MATERIAL('row\'s'),
      waste_pct: num('Optional: waste in percent.', opt),
      note: str('Optional: a note; for Extra, its description.', opt),
    },
  },
  {
    name: 'remove_loose_row',
    description: 'Remove a row from a Loose material section.',
    params: { section: LOOSE, row: str('The row: "#N" for its position in the section (like "#2"), or its type (like "Hangers - Joist").') },
  },
];

/* ───────────────────── finding a level, section or row ───────────────────── */

const WORD_NUM = {
  one: '1', first: '1', two: '2', second: '2', three: '3', third: '3', four: '4', fourth: '4', five: '5', fifth: '5',
  six: '6', sixth: '6', seven: '7', seventh: '7', eight: '8', eighth: '8', nine: '9', ninth: '9', ten: '10', tenth: '10',
};
const SYNONYM = { floor: 'level', storey: 'level', story: 'level', lvl: 'level', ext: 'exterior', int: 'interior' };
// words a reference may carry that a name need not have ("the poolhouse wall")
const FILLER = new Set(['the', 'a', 'an', 'of', 'on', 'in', 'at', 'wall', 'section', 'row', 'item']);
// …except right before a number: "section 2" is a name, not filler and a 2
const PAIRED = new Set(['section', 'row']);
const isNum = (w) => /^\d+$/.test(w);

const norm = (s) => String(s || '').toLowerCase().replace(/[·.,:;()\-–—_/#&'"]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Words of a name, spelled one way: "First floor" and "1st Level" both give level, 1. */
function words(s) {
  return norm(String(s || '').replace(/\b(\d+)(st|nd|rd|th)\b/gi, '$1'))
    .split(' ')
    .filter(Boolean)
    .map((w) => {
      if (WORD_NUM[w]) return WORD_NUM[w];
      // plurals: "hangers" is "hanger", "joists" is "joist"
      const one = w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
      return SYNONYM[one] || one;
    });
}

const sameSet = (a, b) => a.length && new Set(a).size === new Set(b).size && a.every((w) => b.includes(w));
/**
 * Every word of the reference is in the name. Words other than numbers may
 * instead be in `extra` (the side, kind and level of a wall section), so a
 * number always has to be in the name itself: "section 2" never matches
 * "Section 1" on Level 2. Filler may be missing; a word may be the start of a
 * longer one, numbers match whole.
 */
const covers = (ref, name, extra = []) => {
  let real = 0;
  const ok = ref.every((w, i) => {
    if (FILLER.has(w) && !(PAIRED.has(w) && isNum(ref[i + 1] || ''))) return true;
    real++;
    if (name.includes(w)) return true;
    if (isNum(w)) return false;
    const pool = [...name, ...extra];
    return pool.includes(w) || (w.length >= 3 && pool.some((x) => x.startsWith(w)));
  });
  return ok && real > 0;
};

/**
 * The item a reference points to. "#N" (or "row N") is a position in the
 * list; anything else, a bare number too, is a name: the exact name, then the
 * name in looser words, then with the extra words of its label. A bare "1" is
 * "Level 1", never the first in the list (a basement may come first). Several
 * matches at a step fail with the candidates, so a loose name never picks the
 * wrong one.
 * items: [{ value, num, name, extra?, show }]; q: the reference's words, when
 * the caller already took some out.
 */
function resolve(items, ref, what, q = null) {
  const raw = String(ref ?? '').trim();
  if (!raw) return { error: `No ${what} was given.` };
  const list = items.length ? ` The ${what}s are: ${items.slice(0, 12).map((x) => x.show).join(', ')}${items.length > 12 ? '…' : ''}.` : '';
  const pos = /^(?:#|row\s+)\s*(\d+)$/i.exec(raw);
  if (pos) {
    const hit = items.find((x) => x.num === Number(pos[1]));
    return hit ? { hit } : { error: `There is no ${what} #${pos[1]}.${list}` };
  }
  const qw = q || words(raw);
  const steps = [
    (x) => norm(x.name) === norm(raw),
    (x) => sameSet(qw, words(x.name)),
    (x) => covers(qw, words(x.name)),
    (x) => x.extra && covers(qw, words(x.name), x.extra),
  ];
  for (const ok of steps) {
    const hits = items.filter(ok);
    if (hits.length === 1) return { hit: hits[0] };
    if (hits.length > 1) return { error: `"${ref}" could be ${hits.slice(0, 8).map((x) => x.show).join(', ')}. Say which one.` };
  }
  return { error: `No ${what} is called "${ref}".${list}` };
}

const levelItems = (est) => (est.levels || []).map((l, i) => ({ value: l, num: i + 1, name: l.name || `Level ${i + 1}`, show: `#${i + 1} ${l.name || `Level ${i + 1}`}` }));

/** Every wall section, numbered across the estimate: each level's exterior, then its interior. */
function wallItems(est) {
  const out = [];
  (est.levels || []).forEach((level, li) => {
    for (const side of ['exterior', 'interior']) {
      (level[`${side}Sections`] || []).forEach((s, si) => {
        const kind = side === 'exterior' ? 'exterior' : s.kind || 'partition';
        const n = out.length + 1;
        out.push({
          value: s, num: n, name: s.name || '', level, levelIndex: li, side, index: si,
          // the level's words without its number: a number must be in the section name
          extra: [side, kind, ...words(level.name).filter((w) => !isNum(w))],
          show: `#${n} (${level.name} · ${side === 'exterior' ? 'exterior' : `interior ${kind}`} · ${s.name || 'unnamed'})`,
        });
      });
    }
  });
  return out;
}

const looseItems = (est) => (est.looseList || []).map((s, i) => ({ value: s, num: i + 1, name: s.name || '', show: `#${i + 1} ${s.name || 'unnamed'}` }));

/** The level a reference points to. @returns {{value?:object, index?:number, error?:string}} */
export function findLevel(est, ref) {
  const r = resolve(levelItems(est), ref, 'level');
  return r.error ? { error: r.error } : { value: r.hit.value, index: r.hit.num - 1 };
}

/**
 * The wall section a reference points to, on one level when given (as an
 * argument, or as "level N" inside the reference: "level 2 section 1").
 * @returns {{value?:object, level?:object, levelIndex?:number, side?:string, index?:number, error?:string}}
 */
export function findWallSection(est, ref, level) {
  let items = wallItems(est);
  let q = words(ref);
  const at = q.findIndex((w, i) => w === 'level' && isNum(q[i + 1] || ''));
  if (!level && at >= 0 && !/^#/.test(String(ref).trim())) {
    level = `level ${q[at + 1]}`;
    q = [...q.slice(0, at), ...q.slice(at + 2)];
    if (!q.length) return { error: `Say which section on ${level}.` };
  }
  if (level) {
    const l = findLevel(est, level);
    if (l.error) return { error: l.error };
    items = items.filter((x) => x.level === l.value);
  }
  const r = resolve(items, ref, 'wall section', q);
  if (r.error) return { error: r.error };
  const { value, level: lv, levelIndex, side, index } = r.hit;
  return { value, level: lv, levelIndex, side, index };
}

/** The Loose material section a reference points to. @returns {{value?:object, index?:number, error?:string}} */
export function findLooseSection(est, ref) {
  const r = resolve(looseItems(est), ref, 'loose section');
  return r.error ? { error: r.error } : { value: r.hit.value, index: r.hit.num - 1 };
}

/** The Loose material type a name points to, or an error listing the close ones. */
function findLooseType(ref) {
  const raw = String(ref || '').trim();
  if (!raw) return { error: 'No row type was given.' };
  const exact = LOOSE_TYPES.find((t) => t.toLowerCase() === raw.toLowerCase());
  if (exact) return { type: exact };
  const q = words(raw);
  for (const ok of [(t) => sameSet(q, words(t)), (t) => covers(q, words(t))]) {
    const hits = LOOSE_TYPES.filter(ok);
    if (hits.length === 1) return { type: hits[0] };
    if (hits.length > 1) return { error: `"${raw}" could be ${hits.slice(0, 8).join(', ')}. Say which one.` };
  }
  // close: a type with a word that starts like one of the reference's words
  const stems = q.filter((w) => w.length >= 3).map((w) => w.slice(0, 4));
  const close = LOOSE_TYPES.filter((t) => words(t).some((x) => stems.some((s) => x.startsWith(s))));
  return { error: `There is no Loose material item "${raw}".${close.length ? ` Close ones: ${close.slice(0, 8).join(', ')}.` : ''} Use Extra with a formula for anything else.` };
}

/* ───────────────────── reading the estimate ───────────────────── */

const n = (v) => Number(v) || 0;
const money = (est, v) => formatMoney(v, currencyOf(est.summaryInfo || {}));
const matLabel = (sel) => (sel ? [sel.familyLabel || sel.family, sel.sizeLabel].filter(Boolean).join(' ') || 'picked' : null);
const STUDS = { single: 1, double: 2, triple: 3 };
const studsWord = (m) => ({ 1: 'single', 2: 'double', 3: 'triple' }[n(m) || 1] || `×${m}`);

function wallView(est, sectionId) {
  const w = wallItems(est).find((x) => x.value.id === sectionId);
  if (!w) return null;
  const s = w.value;
  const mats = Object.fromEntries(Object.entries(s.sel || {}).filter(([, v]) => v).map(([k, v]) => [k, matLabel(v)]));
  return {
    number: w.num, level: w.level.name, side: w.side, kind: w.side === 'exterior' ? 'exterior' : s.kind || 'partition', name: s.name,
    length_lf: n(s.lengthLF), height_ft: n(s.heightFt), stud_spacing_in: n(s.studSpacingIn), studs: studsWord(s.studMultiplier),
    ...(Object.keys(mats).length ? { materials: mats } : {}),
  };
}

/** A wall section and the estimate totals as the model reads them in a tool result (for callers that adjust a draft after a tool). */
export function describeWallSection(est, sectionId) {
  const t = totalsOf(est);
  return { section: wallView(est, sectionId), totals: { wall_panels: money(est, t.wall_panels), loose: money(est, t.loose) } };
}

const rowAmount = (r) => {
  const ct = rowCalcType(r.type);
  if (ct === 'extra') return r.inputs?.formula ? `= ${r.inputs.formula}` : `${n(r.qty)}`;
  if (ct === 'subfloor') return `${n(r.inputs?.area)} sq ft`;
  if (ct === 'glue') return 'from the subfloor';
  if (ct === 'manual') return `${n(r.qty)}`;
  if (ct === 'rimboard' && r.inputs?.lengthLF == null) return 'foundation LF';
  return `${n(r.inputs?.lengthLF)} LF`;
};
const rowMaterial = (r) => matLabel(r.item) || (r.defaultFamily ? `${r.defaultFamily} ${r.defaultSize || ''}`.trim() + ' (default)' : 'no material');
const rowName = (r) => (rowCalcType(r.type) === 'extra' && r.desc ? `Extra: ${r.desc}` : r.type || 'Custom item');

const totalsOf = (est) => ({ wall_panels: computeWallPanels(est).total, loose: computeLoose(est).total });

/** The estimate as the model reads it: levels with their sections, loose sections with their rows, totals. */
export function estimateContext(est = {}) {
  const lines = ['Wall panels — levels (#position name — LF), then their wall sections (#number name | side | length | height | spacing | studs | sheathing):'];
  const walls = wallItems(est);
  (est.levels || []).forEach((level, i) => {
    const mine = walls.filter((w) => w.level === level);
    const lf = (side) => round2(mine.filter((w) => w.side === side).reduce((a, w) => a + n(w.value.lengthLF), 0));
    lines.push(`#${i + 1} ${level.name} — exterior ${lf('exterior')} LF, interior ${lf('interior')} LF`);
    if (!mine.length) lines.push('  (no wall sections)');
    for (const w of mine) {
      const s = w.value;
      const kind = w.side === 'exterior' ? 'exterior' : `interior ${s.kind || 'partition'}`;
      const sheath = w.side === 'exterior' || s.kind === 'shear' ? ` | sheathing ${matLabel(s.sel?.sheathing) || 'default'}` : '';
      lines.push(`  #${w.num} ${s.name || 'unnamed'} | ${kind} | ${n(s.lengthLF)} LF | ${n(s.heightFt)}' high | ${n(s.studSpacingIn)}" o.c. | studs ×${n(s.studMultiplier) || 1}${sheath}${s.planKey && !s.planManual ? ' | from plan' : ''}`);
    }
  });
  lines.push('Loose material — sections (#position name), then their rows (#position type | amount | material):');
  (est.looseList || []).forEach((sec, i) => {
    const rows = sec.rows || [];
    lines.push(`#${i + 1} ${sec.name || 'unnamed'}${rows.length ? '' : ' (no rows)'}`);
    rows.forEach((r, k) => lines.push(`  #${k + 1} ${rowName(r)} | ${rowAmount(r)} | ${rowMaterial(r)}`));
  });
  const t = totalsOf(est);
  lines.push(`Totals: Wall panels ${money(est, t.wall_panels)} · Loose ${money(est, t.loose)}`);
  return lines.join('\n');
}

/* ───────────────────── running a call ───────────────────── */

const given = (v) => v != null && v !== '';

/**
 * An amount: a number, or a calculation like "14*16" worked out here so the
 * model never does arithmetic. Each calculation is added to `calc`
 * ("14*16 = 224") for the result to echo.
 * @returns {{value?:number, error?:string}}
 */
function amount(v, field, calc, { min = 'positive' } = {}) {
  let x;
  const src = String(v ?? '').trim();
  if (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(src)) x = Number(v);
  else {
    const r = tryEvaluate(src);
    x = Number(r.value);
    if (r.error || r.value == null || !Number.isFinite(x)) return { error: `Could not calculate ${field} "${src}".` };
    calc?.push(`${src} = ${round2(x)}`);
  }
  if (!Number.isFinite(x)) return { error: `${field} is not a number.` };
  if (min === 'positive' ? x <= 0 : x < 0) return { error: `${field} must be ${min === 'positive' ? 'more than 0' : '0 or more'}${src !== String(x) ? ` ("${src}" is ${round2(x)})` : ''}.` };
  return { value: x };
}

/** A rectangle's perimeter from {width, length} or text like "50 x 120". */
function rectanglePerimeter(r, calc) {
  let w, l;
  if (r && typeof r === 'object') { w = r.width; l = r.length; } else {
    const m = /(-?[\d.]+)\s*(?:'|ft)?\s*(?:x|×|by|\*)\s*(-?[\d.]+)/i.exec(String(r || ''));
    if (m) { w = m[1]; l = m[2]; }
  }
  if (!given(w) || !given(l)) return { error: 'A rectangle needs a width and a length in feet, both more than 0.' };
  const a = amount(w, 'width', calc), b = amount(l, 'length', calc);
  if (a.error || b.error) return { error: a.error || b.error };
  return { lf: 2 * (a.value + b.value) };
}

// a copy of a session selection, so no two fields share (or mutate) one object
const copySel = (sel) => ({ ...sel, item: sel.item && typeof sel.item === 'object' ? { ...sel.item } : sel.item ?? null });

/**
 * Runs one tool call on a draft estimate. find_material reads the price list
 * and returns a Promise; every other tool runs at once.
 * session: { catalog, materials: Map<id, selection> }, one per request.
 * @returns {{est:object, result:object}} the draft after the call and what to tell the model.
 */
export function runEstimateTool(est, name, args = {}, session = {}) {
  const fail = (error) => ({ est, result: { ok: false, error } });
  const money2 = (v) => money(est, v);
  const calc = []; // calculations worked out in this call, echoed in the result
  const calculated = () => (calc.length ? { calculated: calc } : {});
  const done = (next, extra = {}) => {
    const t = totalsOf(next);
    return { est: next, result: { ok: true, ...extra, ...calculated(), totals: { wall_panels: money2(t.wall_panels), loose: money2(t.loose) } } };
  };
  // a material id from find_material in this request
  const material = (id) => {
    if (id == null || id === '') return { sel: undefined };
    const sel = session?.materials?.get(String(id).trim());
    return sel ? { sel } : { error: `Material "${id}" did not come from find_material in this request (ids last only for the request that found them). Call find_material and use one of its ids.` };
  };

  switch (name) {
    case 'find_material':
      return findMaterial(est, args, session);

    case 'perimeter': {
      const hasSides = Array.isArray(args.sides) && args.sides.length;
      if (hasSides && (given(args.width) || given(args.length))) return fail('Give width and length, or the list of sides, not both.');
      if (hasSides) {
        let total = 0;
        for (const v of args.sides) {
          const a = amount(v, 'every side', calc);
          if (a.error) return fail(a.error);
          total += a.value;
        }
        return { est, result: { ok: true, perimeter_lf: round2(total), ...calculated() } };
      }
      if (!given(args.width) && !given(args.length)) return fail('Give width and length, or the list of sides.');
      const r = rectanglePerimeter({ width: args.width, length: args.length }, calc);
      return r.error ? fail(r.error) : { est, result: { ok: true, perimeter_lf: round2(r.lf), ...calculated() } };
    }

    case 'add_level': {
      const list = est.levels || [];
      let levels;
      if (args.where === 'below') {
        const k = list.filter((l) => /basement|cellar/i.test(l.name || '')).length;
        levels = [blankLevel({ index: 0, name: k ? `Basement ${k + 1}` : 'Basement' }), ...list];
      } else if (args.where === 'top' || args.where == null) {
        const floors = list.filter((l) => !/basement|cellar/i.test(l.name || '')).length;
        levels = [...list, blankLevel({ index: floors, name: `Level ${floors + 1}` })];
      } else return fail('where is top (a floor above) or below (a basement).');
      const added = levels.find((l) => !list.includes(l));
      return done({ ...est, levels }, { level: added.name });
    }

    case 'add_wall_section': {
      const lv = findLevel(est, args.level);
      if (lv.error) return fail(lv.error);
      const side = args.side || (WALL_KINDS.includes(args.kind) ? 'interior' : args.kind === 'exterior' ? 'exterior' : null);
      if (side !== 'exterior' && side !== 'interior') return fail('side is exterior or interior.');
      let kind = side === 'exterior' ? 'exterior' : 'partition';
      if (args.kind != null && args.kind !== '') {
        if (side === 'exterior' && args.kind !== 'exterior') return fail(`An exterior section is always exterior; ${args.kind} walls are interior.`);
        if (side === 'interior' && !WALL_KINDS.includes(args.kind)) return fail(`An interior section is ${WALL_KINDS.join(', ')}; not "${args.kind}".`);
        kind = args.kind;
      }
      const key = `${side}Sections`;
      const list = lv.value[key] || [];
      let nm = String(args.name || '').trim();
      if (nm && list.some((s) => norm(s.name) === norm(nm))) return fail(`${lv.value.name} already has an ${side} section called "${nm}". Give another name.`);
      if (!nm) {
        let k = list.length + 1;
        while (list.some((s) => norm(s.name) === `section ${k}`)) k++;
        nm = `Section ${k}`;
      }
      const f = wallFields(args, material, calc);
      if (f.error) return fail(f.error);
      const sec = blankSection({ kind, name: nm });
      Object.assign(sec, f.fields);
      sec.sel = { ...sec.sel, ...f.sel };
      const next = patchLevel(est, lv.index, (l) => ({ ...l, [key]: [...(l[key] || []), sec] }));
      return done(next, { section: wallView(next, sec.id), ...noteFor(sec, side) });
    }

    case 'update_wall_section': {
      const w = findWallSection(est, args.section, args.level);
      if (w.error) return fail(w.error);
      const patch = {};
      if (args.name != null && String(args.name).trim()) {
        patch.name = String(args.name).trim();
        const key = `${w.side}Sections`;
        if (w.level[key].some((s) => s !== w.value && norm(s.name) === norm(patch.name))) return fail(`${w.level.name} already has an ${w.side} section called "${patch.name}".`);
      }
      if (args.kind != null && args.kind !== '') {
        if (w.side === 'exterior' && args.kind !== 'exterior') return fail(`"${w.value.name}" is exterior and stays exterior. To make an interior wall, add an interior section and remove this one.`);
        if (w.side === 'interior' && !WALL_KINDS.includes(args.kind)) return fail(`An interior section is ${WALL_KINDS.join(', ')}; not "${args.kind}".`);
        patch.kind = args.kind;
      }
      const f = wallFields(args, material, calc);
      if (f.error) return fail(f.error);
      Object.assign(patch, f.fields);
      // a typed length on a plan-linked section must survive the next plan sync, as with the page's "From plan" checkbox
      const fromPlan = w.value.planKey && !w.value.planManual;
      const retyped = fromPlan && patch.lengthLF != null;
      if (retyped) patch.planManual = true;
      if (!Object.keys(patch).length && !Object.keys(f.sel).length) return fail('Nothing to change: give name, kind, length_lf, rectangle, height_ft, stud_spacing_in, studs or a material.');
      const sec = { ...w.value, ...patch, ...(Object.keys(f.sel).length ? { sel: { ...w.value.sel, ...f.sel } } : {}) };
      const key = `${w.side}Sections`;
      const next = patchLevel(est, w.levelIndex, (l) => ({ ...l, [key]: l[key].map((s, i) => (i === w.index ? sec : s)) }));
      const changed = wallDiff(w.value, sec);
      return done(next, { section: wallView(next, sec.id), changed: changed.length ? changed : ['nothing: it already had those values'], ...(retyped ? { note: `The length is now typed by hand; the plan measures ${n(w.value.planLF)} LF.` } : {}), ...noteFor(sec, w.side) });
    }

    case 'remove_wall_section': {
      const w = findWallSection(est, args.section, args.level);
      if (w.error) return fail(w.error);
      // the plan sync would add a plan-linked section back
      if (w.value.planKey && !w.value.planManual) return fail(`"${w.value.name || 'unnamed'}" comes from the plan; remove it in Plan takeoff, or set its length to 0 here.`);
      const key = `${w.side}Sections`;
      const next = patchLevel(est, w.levelIndex, (l) => ({ ...l, [key]: l[key].filter((_, i) => i !== w.index) }));
      return done(next, { removed: `${w.level.name} · ${w.side} · ${w.value.name || 'unnamed'}` });
    }

    case 'add_loose_section': {
      const nm = String(args.name || '').trim();
      if (!nm) return fail('The section needs a name.');
      if ((est.looseList || []).some((s) => norm(s.name) === norm(nm))) return fail(`There is already a Loose material section called "${nm}".`);
      // the same as the page's "Add section"
      const sec = { ...blankLooseSection(nm), kind: 'custom' };
      return done({ ...est, looseList: [...(est.looseList || []), sec] }, { section: nm });
    }

    case 'add_loose_row': {
      const ls = findLooseSection(est, args.section);
      if (ls.error) return fail(ls.error);
      const t = findLooseType(args.type);
      if (t.error) return fail(t.error);
      const m = material(args.material);
      if (m.error) return fail(m.error);
      const r = looseRow(t.type, args, calc);
      if (r.error) return fail(r.error);
      const row = r.row;
      if (m.sel) row.item = copySel(m.sel);
      if (args.waste_pct != null && args.waste_pct !== '') {
        const wp = Number(args.waste_pct);
        if (!Number.isFinite(wp) || wp < 0) return fail('waste_pct must be 0 or more.');
        row.wastePct = wp;
      }
      const next = { ...est, looseList: est.looseList.map((s, i) => (i === ls.index ? { ...s, rows: [...(s.rows || []), row] } : s)) };
      const sec = next.looseList[ls.index];
      return done(next, { section: sec.name, row: { number: sec.rows.length, type: rowName(row), amount: rowAmount(row), material: rowMaterial(row) }, ...(row.item ? {} : { warning: 'No material: this row costs $0 until one is picked.' }) });
    }

    case 'remove_loose_row': {
      const ls = findLooseSection(est, args.section);
      if (ls.error) return fail(ls.error);
      const rows = ls.value.rows || [];
      const items = rows.map((r, i) => ({ value: r, num: i + 1, name: rowName(r), extra: words(`${r.type} ${r.desc || ''} ${r.notes || ''}`).filter((w) => !isNum(w)), show: `#${i + 1} ${rowName(r)}` }));
      const r = resolve(items, args.row, `row of ${ls.value.name}`);
      if (r.error) return fail(r.error);
      const next = { ...est, looseList: est.looseList.map((s, i) => (i === ls.index ? { ...s, rows: rows.filter((x) => x !== r.hit.value) } : s)) };
      return done(next, { removed: `${ls.value.name} · ${rowName(r.hit.value)}` });
    }

    default:
      return fail(`Unknown tool ${name}.`);
  }
}

const round2 = (v) => Math.round(v * 100) / 100;

const patchLevel = (est, index, fn) => ({ ...est, levels: est.levels.map((l, i) => (i === index ? fn(l) : l)) });

// sheathing is only counted on exterior and shear walls; say so rather than drop it
const noteFor = (sec, side) => (side === 'interior' && sec.kind !== 'shear' && sec.sel?.sheathing
  ? { note: `Sheathing only counts on exterior and shear walls; this ${sec.kind} wall keeps it but adds no sheets.` } : {});

/** The section fields a call sets, checked: only those given. */
function wallFields(args, material, calc) {
  const fields = {};
  const sel = {};
  if (given(args.rectangle)) {
    const r = rectanglePerimeter(args.rectangle, calc);
    if (r.error) return { error: r.error };
    if (given(args.length_lf)) {
      const l = amount(args.length_lf, 'length_lf', calc);
      if (l.error || Math.abs(l.value - r.lf) > 0.01) return { error: `Give the length or the rectangle, not both: the rectangle is ${r.lf} LF, length_lf says ${args.length_lf}.` };
    }
    fields.lengthLF = round2(r.lf);
  } else if (given(args.length_lf)) {
    const v = amount(args.length_lf, 'length_lf', calc);
    if (v.error) return { error: v.error };
    fields.lengthLF = round2(v.value);
  }
  if (given(args.height_ft)) {
    const v = amount(args.height_ft, 'height_ft', calc);
    if (v.error) return { error: v.error };
    fields.heightFt = v.value;
  }
  if (given(args.stud_spacing_in)) {
    const v = amount(args.stud_spacing_in, 'stud_spacing_in', calc);
    if (v.error) return { error: v.error };
    fields.studSpacingIn = v.value;
  }
  if (args.studs != null && args.studs !== '') {
    const v = STUDS[String(args.studs).toLowerCase()] || ([1, 2, 3].includes(Number(args.studs)) ? Number(args.studs) : null);
    if (!v) return { error: 'studs is single, double or triple.' };
    fields.studMultiplier = v;
  }
  for (const [arg, keys] of [['sheathing', ['sheathing']], ['studs_material', ['studs']], ['plates_material', ['bottomPlate', 'topPlate']], ['blocking_material', ['blocking']]]) {
    const m = material(args[arg]);
    if (m.error) return { error: m.error };
    if (m.sel) for (const k of keys) sel[k] = copySel(m.sel);
  }
  return { fields, sel };
}

/** A Loose material row as the page's "Add item" makes it, with its amount. */
function looseRow(type, args, calc) {
  const ct = rowCalcType(type);
  const row = { id: generateId('loose-row-'), type, item: null, qty: 0, wastePct: 5, notes: '', plan: '', inputs: {} };
  if (ct === 'studs') Object.assign(row, { inputs: { lengthLF: 0, spacing: 16, multiplier: 1 }, wastePct: 10 });
  else if (ct === 'plates') Object.assign(row, { inputs: { lengthLF: 0 }, wastePct: 10 });
  else if (ct === 'sheathing') Object.assign(row, { inputs: { lengthLF: 0, height: 4 }, wastePct: 15 });
  else if (['tape', 'joist', 'ijoist', 'beam', 'strapping'].includes(ct)) row.inputs = { lengthLF: 0 };
  // rimboard without a length takes the foundation's LF (computeLooseSection), so none is preset
  else if (ct === 'subfloor') row.inputs = { area: 0 };
  else if (ct === 'extra') Object.assign(row, { desc: '', inputs: { formula: '' }, wastePct: 0 });

  const has = (k) => given(args[k]);
  const HOW = {
    quantity: 'quantity is the number of pieces; for a length use a type measured in LF (Joist, Beams, Plates…) or Extra with a formula like "120/16"',
    length_lf: 'give its linear feet in length_lf',
    area_sqft: 'give its square feet in area_sqft',
  };
  const wrong = (k, want) => ({ error: `${type} is measured by ${want}, not ${k}: ${HOW[want]}.` });
  if (ct === 'extra') {
    const f = has('formula') ? String(args.formula).trim() : has('quantity') ? String(args.quantity).trim() : '';
    if (f) {
      const r = tryEvaluate(f);
      if (r.error || r.value == null || !Number.isFinite(Number(r.value))) return { error: `Could not calculate the formula "${f}"${r.error ? `: ${r.error}` : ''}.` };
    }
    row.inputs = { formula: f };
    if (has('note')) row.desc = String(args.note).trim();
    return { row };
  }
  if (has('note')) row.notes = String(args.note).trim();
  if (ct === 'manual') {
    if (has('length_lf') || has('area_sqft')) return wrong(has('length_lf') ? 'length_lf' : 'area_sqft', 'quantity');
    if (has('quantity')) {
      const q = amount(args.quantity, 'quantity', calc, { min: 'zero' });
      if (q.error) return { error: q.error };
      row.qty = q.value;
    }
    return { row };
  }
  if (ct === 'glue') return { row }; // follows the section's subfloor
  if (ct === 'subfloor') {
    if (has('quantity') || has('length_lf')) return wrong(has('quantity') ? 'quantity' : 'length_lf', 'area_sqft');
    if (has('area_sqft')) {
      const a = amount(args.area_sqft, 'area_sqft', calc);
      if (a.error) return { error: a.error };
      row.inputs.area = a.value;
    }
    return { row };
  }
  // a lumber run
  if (has('quantity') || has('area_sqft')) return wrong(has('quantity') ? 'quantity' : 'area_sqft', 'length_lf');
  if (has('length_lf')) {
    const lf = amount(args.length_lf, 'length_lf', calc);
    if (lf.error) return { error: lf.error };
    row.inputs.lengthLF = lf.value;
  }
  return { row };
}

/** find_material: searches the price list and keeps the hits in the session under ids unique to the request. */
async function findMaterial(est, args, session) {
  const fail = (error) => ({ est, result: { ok: false, error } });
  const query = String(args.query || '').trim();
  if (!query) return fail('Say what material to look for.');
  if (!session?.catalog) return fail('The price list is not available here.');
  let found;
  try {
    found = await searchMaterials(query, session.catalog);
  } catch (e) {
    return fail(`The price list could not be read: ${e?.message || e}.`);
  }
  if (!found.length) return fail(`"${query}" is not in the price list. Do not set a material; ask the user for another name or leave the page default.`);
  // searchMaterials numbers each search from m1. Here ids carry a short tag
  // made once per session (one per request) and a counter that runs across the
  // request ("mk7-1", "mk7-2"…): a later search never replaces a material an
  // earlier one offered, and an id from an earlier request, still in the chat,
  // matches nothing in a new one.
  session.materials ||= new Map();
  session.tag ||= Math.random().toString(36).slice(2, 4);
  session.materialCount ||= 0;
  const materials = found.map((m) => {
    const id = `m${session.tag}-${++session.materialCount}`;
    session.materials.set(id, m.selection);
    return { id, family: m.family, size: m.size, vendor: m.vendor, unit: m.unit, price: m.price };
  });
  return { est, result: { ok: true, materials } };
}

/* ───────────────────── changes ───────────────────── */

const wallTitle = (level, side, s) => `${level.name} · ${side === 'exterior' ? 'exterior' : `interior ${s.kind || 'partition'}`} · ${s.name || 'unnamed'}`;
const SEL_NAMES = { bottomPlate: 'bottom plate', topPlate: 'top plate', studs: 'studs', blocking: 'blocking', sheathing: 'sheathing' };

function wallDiff(o, s) {
  const bits = [];
  if (o.name !== s.name) bits.push(`renamed from "${o.name}"`);
  if ((o.kind || '') !== (s.kind || '')) bits.push(`${o.kind} → ${s.kind}`);
  if (n(o.lengthLF) !== n(s.lengthLF)) bits.push(`${n(o.lengthLF)} → ${n(s.lengthLF)} LF`);
  if (n(o.heightFt) !== n(s.heightFt)) bits.push(`${n(o.heightFt)}' → ${n(s.heightFt)}' high`);
  if (n(o.studSpacingIn) !== n(s.studSpacingIn)) bits.push(`${n(o.studSpacingIn)}" → ${n(s.studSpacingIn)}" o.c.`);
  if ((n(o.studMultiplier) || 1) !== (n(s.studMultiplier) || 1)) bits.push(`${studsWord(o.studMultiplier)} → ${studsWord(s.studMultiplier)} studs`);
  for (const k of Object.keys(SEL_NAMES)) {
    const a = matLabel(o.sel?.[k]), b = matLabel(s.sel?.[k]);
    if (a !== b) bits.push(`${SEL_NAMES[k]} ${a || 'default'} → ${b || 'default'}`);
  }
  return bits;
}

function rowDiff(o, r) {
  const bits = [];
  if (o.type !== r.type) bits.push(`type ${o.type} → ${r.type}`);
  if (rowAmount(o) !== rowAmount(r)) bits.push(`${rowAmount(o)} → ${rowAmount(r)}`);
  if (rowMaterial(o) !== rowMaterial(r)) bits.push(`${rowMaterial(o)} → ${rowMaterial(r)}`);
  if (n(o.wastePct) !== n(r.wastePct)) bits.push(`waste ${n(o.wastePct)}% → ${n(r.wastePct)}%`);
  if ((o.notes || '') !== (r.notes || '') || (o.desc || '') !== (r.desc || '')) bits.push('note changed');
  return bits;
}

/**
 * What a draft changes, for the user to review before applying. Sections and
 * rows are matched by id, so unchanged ones are left out and removed ones show.
 * @returns {{items:Array<{kind, text}>, totals:{from,to}|null}} totals: wall panels + loose.
 */
export function estimateChanges(before = {}, after = {}) {
  const items = [];
  const add = (text) => items.push({ kind: 'add', text });
  const change = (text) => items.push({ kind: 'change', text });
  const remove = (text) => items.push({ kind: 'remove', text });

  const oldLevels = new Map((before.levels || []).map((l) => [l.id, l]));
  const newLevels = new Map((after.levels || []).map((l) => [l.id, l]));
  for (const level of after.levels || []) {
    const old = oldLevels.get(level.id);
    if (!old) { add(`${level.name}: added`); continue; }
    if (old === level) continue;
    if (old.name !== level.name) change(`${level.name}: renamed from "${old.name}"`);
    for (const side of ['exterior', 'interior']) {
      const key = `${side}Sections`;
      const was = new Map((old[key] || []).map((s) => [s.id, s]));
      const now = new Set((level[key] || []).map((s) => s.id));
      for (const s of level[key] || []) {
        const o = was.get(s.id);
        if (!o) { add(`${wallTitle(level, side, s)}: added, ${n(s.lengthLF)} LF, ${n(s.heightFt)}' high`); continue; }
        if (o === s) continue;
        const bits = wallDiff(o, s);
        if (bits.length) change(`${wallTitle(level, side, s)}: ${bits.join('; ')}`);
      }
      for (const o of old[key] || []) if (!now.has(o.id)) remove(`${wallTitle(old, side, o)}: removed`);
    }
  }
  for (const l of before.levels || []) if (!newLevels.has(l.id)) remove(`${l.name}: removed, with its wall sections`);

  const oldLoose = new Map((before.looseList || []).map((s) => [s.id, s]));
  const newLoose = new Set((after.looseList || []).map((s) => s.id));
  for (const sec of after.looseList || []) {
    const old = oldLoose.get(sec.id);
    if (old === sec) continue;
    if (!old) add(`${sec.name} (Loose material): added`);
    const was = new Map((old?.rows || []).map((r) => [r.id, r]));
    const now = new Set((sec.rows || []).map((r) => r.id));
    for (const r of sec.rows || []) {
      const o = was.get(r.id);
      if (!o) { add(`${sec.name} · ${rowName(r)}: added, ${rowAmount(r)}, ${rowMaterial(r)}`); continue; }
      if (o === r) continue;
      const bits = rowDiff(o, r);
      if (bits.length) change(`${sec.name} · ${rowName(r)}: ${bits.join('; ')}`);
    }
    for (const o of old?.rows || []) if (!now.has(o.id)) remove(`${sec.name} · ${rowName(o)}: removed`);
  }
  for (const s of before.looseList || []) if (!newLoose.has(s.id)) remove(`${s.name} (Loose material): removed`);

  const total = (e) => { const t = totalsOf(e); return round2(t.wall_panels + t.loose); };
  const from = total(before), to = total(after);
  return { items, totals: from !== to ? { from: money(after, from), to: money(after, to) } : null };
}

export const ESTIMATE_INSTRUCTIONS = `You are the estimating assistant inside Nebula Estimator, an app framing estimators use. You work on the open job's estimate: its wall panels (levels with exterior and interior wall sections) and its loose material (sections with rows of material).
- Make every change with the tools; never just describe a change. Several tools can be called for one request.
- Materials come only from the price list. Before naming or setting any material, call find_material and use the id it returns. If several candidates fit, ask the user which one; if none fits, say it is not in the price list and set no material. Never invent a material or a price.
- A wall section left without a material gets the page defaults when the page shows it. A Loose material row has no default: left without a material it costs $0 until one is picked, so call find_material for it or tell the user the row has no price.
- Material ids last only for the request that found them: after the user picks one, call find_material again and use the new id.
- A rectangle ("50 × 120") goes in the rectangle field of add_wall_section or update_wall_section; for an L-shape or a list of sides call perimeter. Never add up lengths yourself.
- Pass arithmetic as an expression instead of computing it: 14 joists of 16' is length_lf "14*16", a 30 × 40 floor is area_sqft "30*40". The tool works it out and tells you the result.
- Levels, sections and rows are named by their names ("Level 1", "Section 2", "Roof"); "#N" is a position from the lists. Use "#N" when a name could match more than one. If a tool says a name is ambiguous, ask the user which one.
- A tool result tells you what changed and the new totals. If a tool fails, fix the call or ask the user.
- Your changes are a draft: the user reviews them and presses Apply. Don't say they are saved.
- Answer in the user's language, in one to three short sentences: what changed and the new total. Plain text; use **bold** only for section names and a short "- " list only when naming several. Ask one short question when the request is unclear.
- Questions about the estimate (how many LF on Level 1, what sheathing a section uses) are answered from the lists without tools.`;
