// src/domain/lib/currency.js
// Currency of the open project: US dollars or Canadian dollars. Prices are
// shown as entered in the price lists (no exchange conversion); the currency
// only says which dollars they are. A project without a choice takes CAD when
// its tax province is Canadian, USD otherwise.

import { regionOf, parseStateFromAddress } from './tax';

export const CURRENCIES = [
  { code: 'USD', label: 'USD · US dollar', symbol: '$' },
  { code: 'CAD', label: 'CAD · Canadian dollar', symbol: 'CA$' },
];

/** Currency of a project from its Summary info: the one chosen, else by the tax province. */
export function currencyOf(info = {}) {
  if (info.currency === 'USD' || info.currency === 'CAD') return info.currency;
  const st = info.taxState || parseStateFromAddress(info.address);
  return regionOf(st)?.country === 'CA' ? 'CAD' : 'USD';
}

const formatters = new Map();
const formatter = (code) => {
  if (!formatters.has(code)) {
    formatters.set(code, new Intl.NumberFormat('en-US', { style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }
  return formatters.get(code);
};

let current = 'USD';
/** Set by the project provider when a project opens or its currency changes. */
export function setCurrency(code) { current = code === 'CAD' ? 'CAD' : 'USD'; }
export const getCurrency = () => current;

/** Money in the open project's currency: $1,234.50 or CA$1,234.50. */
export function formatMoney(n, code = current) {
  const v = Number(n);
  return formatter(code).format(Number.isFinite(v) ? v : 0);
}

/** Intl-like formatter that follows the open project's currency. */
export const moneyFormatter = { format: (n) => formatMoney(n) };
