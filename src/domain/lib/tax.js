// src/domain/lib/tax.js
// Sales tax by state (shared by Summary and Quote).
export const TAX_RATES = { MA: 6.25, RI: 7.0, CT: 6.35, ME: 5.5, NH: 0.0, 'NO TAX': 0.0 };

/** Last two-letter state code in the address that we have a rate for. */
export const parseStateFromAddress = (address) => {
  if (!address) return null;
  const match = String(address).match(/\b([A-Z]{2})\b/g);
  if (!match) return null;
  const st = match[match.length - 1];
  return TAX_RATES[st] !== undefined ? st : null;
};

/** State + rate used for a project, from Summary's info (tax state, address, exemption). */
export function taxFor(info = {}) {
  const state = info.taxState || parseStateFromAddress(info.address) || 'NO TAX';
  const rate = info.isTaxExempt ? 0 : (TAX_RATES[state] || 0);
  return { state, rate, exempt: Boolean(info.isTaxExempt) };
}
