// src/domain/lib/selection.js
// A "selection" is what an ItemPicker stores for a row:
//   { family, familyLabel, sizeLookupId, sizeLabel, vendorId, vendorName, item }
// where `item` is a slim copy of the vendor price (see slimItem).

/** The price record behind a selection (or the selection itself for partial picks). */
export const deref = (x) => (x && x.item ? x.item : x);
export const getItem = (s) => deref(s);
export const getUnit = (s, fallback = 'pcs') => deref(s)?.unit || deref(s)?.raw?.unit || fallback;
export const getSize = (s) =>
  deref(s)?.sizeLabel || deref(s)?.sizeDisplay || deref(s)?.raw?.sizeDisplay || s?.sizeLabel || '';
export const getFamily = (s) =>
  String(s?.familyLabel ?? s?.familyDisplay ?? s?.raw?.familyDisplay ?? s?.raw?.familyLabel ?? deref(s)?.familyLabel ?? deref(s)?.familyDisplay ?? s?.family ?? '').toLowerCase();
export const isPTFamily = (fam) => /(^|\b)pt(\b|$)|pressure|treated/i.test(String(fam || ''));

/** Milliseconds from a Firestore Timestamp / Date / number, or null. */
export function toMillis(t) {
  if (!t) return null;
  if (typeof t === 'number') return t;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000 + Math.round((t.nanoseconds || 0) / 1e6);
  if (t instanceof Date) return t.getTime();
  const n = Date.parse(t);
  return Number.isFinite(n) ? n : null;
}

/** When this price was last updated in the material list. */
export const priceDateOf = (s) => {
  const it = s && s.item ? s.item : null;
  return it ? (it.priceDate ?? toMillis(it.updatedAt) ?? null) : null;
};

const ITEM_KEYS = ['basePrice', 'markupPct', 'priceWithMarkup', 'supplierPrice', 'unit', 'familyDisplay', 'sizeDisplay', 'supplierName', 'vendorId', 'url'];

/**
 * Keep only what the estimate needs from a vendor price document.
 * Full catalog documents (history, sources, lookup slugs…) made projects
 * grow toward Firestore's 1 MB document limit.
 */
export function slimItem(item, fetchedAt = Date.now()) {
  if (!item || typeof item !== 'object') return item ?? null;
  const out = {};
  for (const k of ITEM_KEYS) if (item[k] !== undefined && item[k] !== null) out[k] = item[k];
  // compact shape used by older rows
  if (item.raw) {
    for (const k of ['basePrice', 'markupPct', 'priceWithMarkup', 'unit', 'familyDisplay', 'sizeDisplay']) {
      if (out[k] === undefined && item.raw[k] !== undefined && item.raw[k] !== null) out[k] = item.raw[k];
    }
  }
  out.priceDate = item.priceDate ?? toMillis(item.updatedAt) ?? fetchedAt;
  return out;
}

const SEL_KEYS = ['family', 'familyLabel', 'sizeLookupId', 'sizeLabel', 'vendorId', 'vendorName'];

export function slimSelection(sel) {
  if (!sel || typeof sel !== 'object') return sel ?? null;
  const out = {};
  for (const k of SEL_KEYS) if (sel[k] !== undefined && sel[k] !== null && sel[k] !== '') out[k] = sel[k];
  out.item = sel.item ? slimItem(sel.item) : null;
  if (!out.sizeLabel && out.item?.sizeDisplay) out.sizeLabel = out.item.sizeDisplay;
  if (!out.familyLabel && out.item?.familyDisplay) out.familyLabel = out.item.familyDisplay;
  return out;
}

const looksLikeSelection = (v) =>
  v && typeof v === 'object' && !Array.isArray(v) && ('vendorId' in v || 'sizeLookupId' in v || ('family' in v && 'familyLabel' in v));

/**
 * Walk a whole estimate and slim every selection in place of a copy.
 * Used when a project loads (migrates old, heavy projects) and before saving.
 */
export function slimEstimate(value) {
  if (Array.isArray(value)) return value.map(slimEstimate);
  if (!value || typeof value !== 'object') return value;
  if (typeof value.toMillis === 'function') return value; // Firestore Timestamp
  if (looksLikeSelection(value)) return slimSelection(value);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    out[k] = slimEstimate(v);
  }
  return out;
}
