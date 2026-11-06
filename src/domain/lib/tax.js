// src/domain/lib/tax.js
// Sales tax by US state and Canadian province (shared by Summary and Quote).
//
// US: the state rate, plus a local (city / county / district) rate the user
// types for the job site; avgLocal is the state's population-weighted average,
// shown as a hint. Rates: Tax Foundation, "State and Local Sales Tax Rates,
// Midyear 2026" (state rates as of July 1, 2026). California, Utah and Virginia
// include their statewide local add-ons; Hawaii (GET), Arizona (TPT) and New
// Mexico (GRT) tax gross receipts, shown at their base rate.
//
// Canada: GST 5% federal plus the provincial tax (PST, QST, RST), or one
// harmonized HST. Rates: TaxTips.ca, "2026 Sales Tax Rates" (no changes in 2026;
// Nova Scotia HST 14% since April 1, 2025).
//
// Rates change: check the state or province before a quote goes out. Building
// materials can have their own rules (contractor use tax, exemptions): the
// local rate and the Exempt box cover those cases.

export const SOURCES = {
  US: 'Tax Foundation · State and Local Sales Tax Rates, Midyear 2026',
  CA: 'TaxTips.ca · 2026 Sales Tax Rates',
};

/** US states and DC: state rate and average local rate, %. */
export const US_STATES = [
  ['AL', 'Alabama', 4, 5.46], ['AK', 'Alaska', 0, 1.82], ['AZ', 'Arizona', 5.6, 2.94], ['AR', 'Arkansas', 6.5, 2.98],
  ['CA', 'California', 7.25, 1.78], ['CO', 'Colorado', 2.9, 4.99], ['CT', 'Connecticut', 6.35, 0], ['DE', 'Delaware', 0, 0],
  ['DC', 'District of Columbia', 6, 0], ['FL', 'Florida', 6, 0.98], ['GA', 'Georgia', 4, 3.56], ['HI', 'Hawaii', 4, 0.5],
  ['ID', 'Idaho', 6, 0.03], ['IL', 'Illinois', 6.25, 2.73], ['IN', 'Indiana', 7, 0], ['IA', 'Iowa', 6, 0.94],
  ['KS', 'Kansas', 6.5, 2.21], ['KY', 'Kentucky', 6, 0], ['LA', 'Louisiana', 5, 5.13], ['ME', 'Maine', 5.5, 0],
  ['MD', 'Maryland', 6, 0], ['MA', 'Massachusetts', 6.25, 0], ['MI', 'Michigan', 6, 0], ['MN', 'Minnesota', 6.875, 1.26],
  ['MS', 'Mississippi', 7, 0.06], ['MO', 'Missouri', 4.225, 4.22], ['MT', 'Montana', 0, 0], ['NE', 'Nebraska', 5.5, 1.48],
  ['NV', 'Nevada', 6.85, 1.39], ['NH', 'New Hampshire', 0, 0], ['NJ', 'New Jersey', 6.625, 0], ['NM', 'New Mexico', 4.875, 2.8],
  ['NY', 'New York', 4, 4.54], ['NC', 'North Carolina', 4.75, 2.35], ['ND', 'North Dakota', 5, 2.09], ['OH', 'Ohio', 5.75, 1.54],
  ['OK', 'Oklahoma', 4.5, 4.56], ['OR', 'Oregon', 0, 0], ['PA', 'Pennsylvania', 6, 0.34], ['RI', 'Rhode Island', 7, 0],
  ['SC', 'South Carolina', 6, 1.49], ['SD', 'South Dakota', 4.2, 1.91], ['TN', 'Tennessee', 7, 2.61], ['TX', 'Texas', 6.25, 1.95],
  ['UT', 'Utah', 6.1, 1.32], ['VT', 'Vermont', 6, 0.43], ['VA', 'Virginia', 5.3, 0.47], ['WA', 'Washington', 6.5, 3.07],
  ['WV', 'West Virginia', 6, 0.6], ['WI', 'Wisconsin', 5, 0.72], ['WY', 'Wyoming', 4, 1.39],
].map(([code, name, rate, avgLocal]) => ({ code, name, country: 'US', rate, avgLocal }));

/** Canadian provinces and territories: GST, provincial tax (PST / QST / RST) or HST, %. */
export const CA_PROVINCES = [
  ['AB', 'Alberta', 5, 0, 0], ['BC', 'British Columbia', 5, 7, 0, 'PST'], ['MB', 'Manitoba', 5, 7, 0, 'RST'],
  ['NB', 'New Brunswick', 0, 0, 15], ['NL', 'Newfoundland and Labrador', 0, 0, 15], ['NT', 'Northwest Territories', 5, 0, 0],
  ['NS', 'Nova Scotia', 0, 0, 14], ['NU', 'Nunavut', 5, 0, 0], ['ON', 'Ontario', 0, 0, 13], ['PE', 'Prince Edward Island', 0, 0, 15],
  ['QC', 'Quebec', 5, 9.975, 0, 'QST'], ['SK', 'Saskatchewan', 5, 6, 0, 'PST'], ['YT', 'Yukon', 5, 0, 0],
].map(([code, name, gst, pst, hst, pstName = 'PST']) => ({
  code, name, country: 'CA', gst, pst, hst, pstName, rate: +(gst + pst + hst).toFixed(3),
}));

export const NO_TAX = 'NO TAX';
const BY_CODE = new Map([...US_STATES, ...CA_PROVINCES].map((r) => [r.code, r]));
export const regionOf = (code) => BY_CODE.get(code) || null;

/** Base rate of each code (state rate / provincial total), for older callers. */
export const TAX_RATES = Object.fromEntries([...[...BY_CODE.values()].map((r) => [r.code, r.rate]), [NO_TAX, 0]]);

/**
 * State or province from the job address: a two-letter code we know, the last
 * one in the address ("Boston, MA 02110", "Toronto, ON M5V 3L9").
 */
export const parseStateFromAddress = (address) => {
  if (!address) return null;
  const match = String(address).match(/\b([A-Z]{2})\b/g);
  if (!match) return null;
  for (let i = match.length - 1; i >= 0; i -= 1) if (BY_CODE.has(match[i])) return match[i];
  return null;
};

const fmtPct = (v) => `${+Number(v).toFixed(3)}%`;

/**
 * Tax of a project, from Summary's info (tax state or province, address,
 * local rate, exemption).
 * @returns {{state:string, country:'US'|'CA'|null, rate:number, exempt:boolean, local:number, parts:Array<{label:string, rate:number}>, label:string}}
 */
export function taxFor(info = {}) {
  const state = info.taxState || parseStateFromAddress(info.address) || NO_TAX;
  const r = regionOf(state);
  const exempt = Boolean(info.isTaxExempt);
  const local = r?.country === 'US' ? Math.max(0, Number(info.taxLocal) || 0) : 0;
  let parts = [];
  if (r?.country === 'US') {
    parts = [{ label: `${r.code} state`, rate: r.rate }];
    if (local) parts.push({ label: 'local', rate: local });
  } else if (r?.country === 'CA') {
    if (r.hst) parts = [{ label: 'HST', rate: r.hst }];
    else {
      parts = [{ label: 'GST', rate: r.gst }];
      if (r.pst) parts.push({ label: r.pstName, rate: r.pst });
    }
  }
  const rate = exempt ? 0 : +parts.reduce((s, p) => s + p.rate, 0).toFixed(4);
  const label = !r ? 'No tax'
    : r.country === 'CA' ? `${r.code} ${parts.map((p) => `${p.label} ${fmtPct(p.rate)}`).join(' + ')}`
      : `${r.code} ${fmtPct(rate)}${local ? ` (state ${fmtPct(r.rate)} + local ${fmtPct(local)})` : ''}`;
  return { state, country: r?.country || null, rate, exempt, local, parts, label };
}
