// src/domain/aggregate/totals.js

/** Sum an array of numbers safely */
export const sum = (arr = []) => arr.reduce((s, n) => s + (Number(n) || 0), 0);

/** Sum a list of line items: each has { subtotal } */
export function sumLines(lines = []) {
  return sum(lines.map(l => l?.subtotal));
}

/** Group total = sum(base rows + extras) */
export function sumGroup({ base = [], extras = [] } = {}) {
  return sumLines(base) + sumLines(extras);
}

/** Category total = sum of all group totals */
export function sumCategory(groups = []) {
  return sum(groups.map(g => sumGroup(g)));
}

/** Grand total across categories */
export function grandTotal({ exterior = [], interior = [], loose = [], trusses = [] } = {}) {
  return sumCategory(exterior) + sumCategory(interior) + sumCategory(loose) + sumCategory(trusses);
}
