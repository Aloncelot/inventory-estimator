// src/domain/lib/units.js
// Feet and inches as written on plans.

const FRACTIONS = { 1: '1/8', 2: '1/4', 3: '3/8', 4: '1/2', 5: '5/8', 6: '3/4', 7: '7/8' };
/** Feet and inches with fractions to 1/8": 48 → 4', 30 → 2'-6", 18.5 → 1'-6"1/2, 6.5 → 6"1/2 */
export function feet(inches) {
  const eighths = Math.round(inches * 8);
  const ft = Math.floor(eighths / 96);
  const restEighths = eighths - ft * 96;
  const whole = Math.floor(restEighths / 8);
  const frac = FRACTIONS[restEighths % 8] || '';
  if (!restEighths) return `${ft}'`;
  const inch = `${whole ? `${whole}"` : (frac ? '0"' : '')}${frac}`;
  return ft ? `${ft}'-${inch}` : inch;
}

