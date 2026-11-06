import test from 'node:test';
import assert from 'node:assert/strict';
import { US_STATES, CA_PROVINCES, TAX_RATES, taxFor, parseStateFromAddress } from './tax.js';

test('every state, DC and province has a rate', () => {
  assert.equal(US_STATES.length, 51);
  assert.equal(CA_PROVINCES.length, 13);
  assert.equal(TAX_RATES.MA, 6.25);
  assert.equal(TAX_RATES.QC, 14.975);
  assert.equal(TAX_RATES['NO TAX'], 0);
});

test('state plus local rate; provinces by GST + PST or HST', () => {
  assert.equal(taxFor({ taxState: 'TX', taxLocal: 2 }).rate, 8.25);
  assert.equal(taxFor({ taxState: 'TX', taxLocal: 2 }).label, 'TX 8.25% (state 6.25% + local 2%)');
  assert.equal(taxFor({ taxState: 'BC' }).rate, 12);
  assert.equal(taxFor({ taxState: 'BC' }).label, 'BC GST 5% + PST 7%');
  assert.equal(taxFor({ taxState: 'ON', taxLocal: 3 }).rate, 13, 'no local rate in Canada');
  assert.equal(taxFor({ taxState: 'ON' }).label, 'ON HST 13%');
  assert.equal(taxFor({ taxState: 'QC', isTaxExempt: true }).rate, 0);
  assert.equal(taxFor({}).state, 'NO TAX');
});

test('state or province from the address', () => {
  assert.equal(parseStateFromAddress('12 Main St, Boston, MA 02110'), 'MA');
  assert.equal(parseStateFromAddress('100 King St W, Toronto, ON M5X 1A9'), 'ON');
  assert.equal(parseStateFromAddress('Calle 5, CDMX'), null);
  assert.equal(taxFor({ address: 'Austin, TX 78701' }).rate, 6.25);
});
