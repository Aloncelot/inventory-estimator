// src/domain/inventory.js
// The company's stock: whole pieces only (no offcuts), one count per
// warehouse. Stock changes only through movements, and every movement is kept
// with who made it and when:
//   in        received into a warehouse (purchase), with its unit cost
//   out       issued from a warehouse (to a project or the shop)
//   transfer  moved between two warehouses
//   adjust    a physical count that corrects the number on record
// Pure functions; Firestore is in src/lib/inventory.js.

export const MOVE_TYPES = [
  { key: 'in', label: 'Receive', hint: 'Material arrives (purchase order, return from a job)' },
  { key: 'out', label: 'Issue', hint: 'Material leaves for a project or the shop' },
  { key: 'transfer', label: 'Transfer', hint: 'Move between warehouses' },
  { key: 'adjust', label: 'Count', hint: 'Physical count: sets the number on record' },
];
export const moveLabel = (k) => MOVE_TYPES.find((t) => t.key === k)?.label || k;

const n = (v) => Number(v) || 0;
const round2 = (v) => Math.round(v * 100) / 100;

export const itemKeyOf = (familySlug, sizeSlug) => `${familySlug}_${sizeSlug}`;

/** Total on hand, or in one warehouse. */
export function onHand(stock, warehouseId) {
  const q = stock?.qty || {};
  if (warehouseId) return n(q[warehouseId]);
  return Object.values(q).reduce((a, b) => a + n(b), 0);
}

/** Stock status for the list: out, low (at or under the minimum) or ok. */
export function stockStatus(stock, warehouseId) {
  const have = onHand(stock, warehouseId);
  if (have <= 0) return 'out';
  if (!warehouseId && n(stock?.minQty) > 0 && have <= n(stock.minQty)) return 'low';
  return 'ok';
}

export const stockValue = (stock, warehouseId) => round2(onHand(stock, warehouseId) * n(stock?.avgCost));

/** Check a movement before saving it; returns an error message or ''. */
export function validateMovement(mv, stock, warehouses = []) {
  const ids = new Set(warehouses.map((w) => w.id));
  if (!mv?.itemKey) return 'Pick a material.';
  if (!MOVE_TYPES.some((t) => t.key === mv.type)) return 'Pick what kind of movement it is.';
  if (!ids.has(mv.warehouseId)) return 'Pick a warehouse.';
  const q = Number(mv.qty);
  if (!Number.isInteger(q)) return 'Whole pieces only: the quantity must be a whole number.';
  if (mv.type === 'adjust') {
    if (q < 0) return 'A count cannot be negative.';
    return '';
  }
  if (q <= 0) return 'The quantity must be more than zero.';
  if (mv.type === 'transfer') {
    if (!ids.has(mv.toWarehouseId)) return 'Pick the warehouse it goes to.';
    if (mv.toWarehouseId === mv.warehouseId) return 'Pick two different warehouses.';
  }
  if (mv.type === 'out' || mv.type === 'transfer') {
    const have = onHand(stock, mv.warehouseId);
    if (q > have) return `Only ${have} on hand in that warehouse.`;
  }
  if (mv.type === 'in' && mv.unitCost !== undefined && mv.unitCost !== '' && n(mv.unitCost) < 0) return 'The unit cost cannot be negative.';
  return '';
}

/**
 * The stock after a movement. Receiving with a cost updates the average cost
 * (weighted by pieces); issuing and transfers keep it.
 * Returns { stock, delta } where delta is the change per warehouse.
 */
export function applyMovement(stock, mv) {
  const s = { ...(stock || {}), qty: { ...(stock?.qty || {}) } };
  const q = Number(mv.qty);
  const delta = {};
  const add = (wh, d) => {
    s.qty[wh] = n(s.qty[wh]) + d;
    delta[wh] = n(delta[wh]) + d;
  };
  if (mv.type === 'in') {
    const before = onHand(stock);
    const cost = mv.unitCost === '' || mv.unitCost == null ? null : n(mv.unitCost);
    if (cost != null) {
      s.avgCost = before > 0 && n(stock?.avgCost) > 0
        ? round2((before * n(stock.avgCost) + q * cost) / (before + q))
        : cost;
      s.lastCost = cost;
    }
    add(mv.warehouseId, q);
  } else if (mv.type === 'out') {
    add(mv.warehouseId, -q);
  } else if (mv.type === 'transfer') {
    add(mv.warehouseId, -q);
    add(mv.toWarehouseId, q);
  } else if (mv.type === 'adjust') {
    add(mv.warehouseId, q - n(stock?.qty?.[mv.warehouseId]));
  }
  s.onHand = onHand(s);
  return { stock: s, delta };
}

/* ── list helpers ───────────────────────────────────────────────────── */

/** Filter and sort stock rows for the list. */
/** Every word of the search appears somewhere in the material's name, size or type. */
export function matchesSearch(item, search) {
  const words = String(search || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = `${item.family || ''} ${item.size || ''} ${item.materialType || ''}`.toLowerCase();
  return words.every((w) => text.includes(w));
}

export function stockRows(stocks, { search = '', warehouseId = '', lowOnly = false, hideEmpty = false } = {}) {
  return stocks
    .filter((s) => matchesSearch(s, search))
    .filter((s) => !lowOnly || stockStatus(s, '') !== 'ok')
    .filter((s) => !hideEmpty || onHand(s, warehouseId) > 0)
    .sort((a, b) => (a.materialType || '').localeCompare(b.materialType || '')
      || (a.family || '').localeCompare(b.family || '')
      || (a.size || '').localeCompare(b.size || '', undefined, { numeric: true }));
}

export function inventoryTotals(stocks, warehouseId = '') {
  let value = 0; let low = 0; let out = 0;
  for (const s of stocks) {
    value += stockValue(s, warehouseId);
    const st = stockStatus(s, warehouseId);
    if (st === 'low') low += 1;
    if (st === 'out') out += 1;
  }
  return { items: stocks.length, value: round2(value), low, out };
}

/* ── sample stock (to try the module) ───────────────────────────────── */

// rough piece counts a framing company keeps, by material type
const SAMPLE_RANGES = [
  [/sheathing|osb|plywood|subfloor/i, [20, 300], 40],
  [/lumber|stud|joist|rimboard|strapping|lally/i, [24, 600], 50],
  [/hanger|tie|strap/i, [10, 250], 25],
  [/fastener|nail|screw|pin|bolt|anchor/i, [2, 60], 6],
];
function sampleRange(type) {
  for (const [re, range, min] of SAMPLE_RANGES) if (re.test(type || '')) return { range, min };
  return { range: [1, 40], min: 5 };
}

/** A small seeded random generator, so the sample is the same every time for the same seed. */
export function seededRandom(seed = 1) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fictitious stock for every catalog item: about 3 in 4 items stocked, most of
 * it in the first warehouse. Returns [{ item, receipts: [{ warehouseId, qty }], minQty }].
 */
export function sampleStock(items, warehouses, { seed = 7, stockedShare = 0.75 } = {}) {
  const rnd = seededRandom(seed);
  const whs = warehouses.length ? warehouses : [{ id: 'wh-main' }];
  return items.map((item) => {
    const { range: [lo, hi], min } = sampleRange(`${item.materialType || ''} ${item.family || ''}`);
    const receipts = [];
    if (rnd() < stockedShare) {
      const total = Math.round(lo + rnd() * (hi - lo));
      const main = whs.length > 1 ? Math.round(total * (0.6 + rnd() * 0.3)) : total;
      receipts.push({ warehouseId: whs[0].id, qty: main });
      let rest = total - main;
      for (let i = 1; i < whs.length && rest > 0; i += 1) {
        const q = i === whs.length - 1 ? rest : Math.round(rest * rnd());
        if (q > 0) receipts.push({ warehouseId: whs[i].id, qty: q });
        rest -= q;
      }
    }
    return { item, receipts, minQty: min };
  });
}
