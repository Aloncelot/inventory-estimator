// src/domain/purchase.js
// How each supplier sells a material, and turning a receipt into pieces.
// The inventory and the estimates always work in the material's own unit
// (pieces, sheets, lf…); a supplier may sell it:
//   each    one unit at a time
//   bundle  a bundle (unit, lift) with a number of pieces that depends on the mill
//   mbf     by the thousand board feet (sawn lumber only)
// Warehouse records what the invoice says (5 bundles, $2,000) and the app
// works out the pieces and the cost per piece. Pure functions.

export const BUY_UNITS = [
  { key: 'each', label: 'Each', hint: 'One unit at a time' },
  { key: 'bundle', label: 'Bundle', hint: 'A bundle (unit, lift) of pieces' },
  { key: 'mbf', label: 'MBF', hint: 'Per thousand board feet (sawn lumber)' },
];
export const buyUnitLabel = (k) => BUY_UNITS.find((u) => u.key === k)?.label || 'Each';

/** A price that moved this much from the price list is flagged for the estimator. */
export const VARIANCE_FLAG_PCT = 5;
/** Prices older than this show as old in the price list. */
export const STALE_PRICE_DAYS = 30;

const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

// "2", "1-1/4", "1.5", "5/8"
function mixed(s) {
  const m = String(s).trim().match(/^(\d+(?:\.\d+)?)?(?:[-\s]?(\d+)\/(\d+))?$/);
  if (!m || (!m[1] && !m[2])) return NaN;
  return (Number(m[1]) || 0) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
}

/**
 * Board feet in one piece of sawn lumber, from a size such as 2x6"-8',
 * 2x6"-92-5/8" or 2x10-16'. Null when the size is not lumber with a length
 * (sheets, hangers, lineal-foot items).
 */
export function boardFeetOf(size) {
  const m = String(size || '').match(/^\s*(\d+(?:[-\s]\d+\/\d+|\.\d+)?)\s*x\s*(\d+(?:[-\s]\d+\/\d+|\.\d+)?)\s*"?\s*-\s*(\d+(?:[-\s]\d+\/\d+|\.\d+)?)\s*('|")/i);
  if (!m) return null;
  const t = mixed(m[1]); const w = mixed(m[2]); const len = mixed(m[3]);
  if (!(t > 0 && w > 0 && len > 0)) return null;
  const feet = m[4] === "'" ? len : len / 12;
  return round((t * w * feet) / 12, 4);
}

/** Pieces in one buying unit (null when it cannot be worked out). */
export function piecesPerBuyUnit(buyUnit, { pcsPerBundle, boardFeet } = {}) {
  if (buyUnit === 'bundle') return Number(pcsPerBundle) > 0 ? Number(pcsPerBundle) : null;
  if (buyUnit === 'mbf') return boardFeet > 0 ? 1000 / boardFeet : null;
  return 1;
}

/** Whole pieces received for a quantity in the supplier's unit. */
export function receiptPieces({ buyUnit = 'each', buyQty, pcsPerBundle, boardFeet }) {
  const q = Number(buyQty);
  const per = piecesPerBuyUnit(buyUnit, { pcsPerBundle, boardFeet });
  if (!(q > 0) || !per) return null;
  return Math.round(q * per);
}

/** Cost of one piece from the invoice total. */
export function costPerPiece(totalPaid, pieces) {
  const t = Number(totalPaid); const p = Number(pieces);
  if (!(p > 0) || !(t >= 0) || totalPaid === '' || totalPaid == null) return null;
  return round(t / p, 4);
}

/** Price per piece from a supplier's quote in its own unit (per bundle, per MBF). */
export function piecePriceFromQuote(buyUnit, buyPrice, opts) {
  const per = piecesPerBuyUnit(buyUnit, opts);
  const p = Number(buyPrice);
  if (!per || !(p >= 0) || buyPrice === '' || buyPrice == null) return null;
  return round(p / per, 4);
}

/** Percent the paid price is above (+) or below (−) the list price; null without both. */
export function priceVariance(paid, listed) {
  const a = Number(paid); const b = Number(listed);
  if (!(a >= 0) || !(b > 0) || paid == null || paid === '') return null;
  return round(((a - b) / b) * 100, 1);
}

export const isFlagged = (pct) => pct != null && Math.abs(pct) >= VARIANCE_FLAG_PCT;

/** Whole days since a timestamp (Firestore Timestamp, Date or millis). */
export function ageDays(ts, now = Date.now()) {
  const ms = ts?.toMillis ? ts.toMillis() : ts instanceof Date ? ts.getTime() : Number(ts);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.max(0, Math.floor((now - ms) / 86400000));
}
