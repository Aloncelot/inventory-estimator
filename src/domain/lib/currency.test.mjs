import test from 'node:test';
import assert from 'node:assert/strict';
import { currencyOf, formatMoney, setCurrency, getCurrency, moneyFormatter } from './currency.js';

test('project currency: chosen, else from the tax province', () => {
  assert.equal(currencyOf({}), 'USD');
  assert.equal(currencyOf({ taxState: 'ON' }), 'CAD');
  assert.equal(currencyOf({ address: 'Calgary, AB T2P 1J9' }), 'CAD');
  assert.equal(currencyOf({ taxState: 'ON', currency: 'USD' }), 'USD');
  assert.equal(currencyOf({ taxState: 'TX', currency: 'CAD' }), 'CAD');
});

test('money in the open project currency', () => {
  setCurrency('CAD');
  assert.equal(getCurrency(), 'CAD');
  assert.equal(formatMoney(1234.5), 'CA$1,234.50');
  assert.equal(moneyFormatter.format(2), 'CA$2.00');
  setCurrency('USD');
  assert.equal(formatMoney(1234.5), '$1,234.50');
  assert.equal(formatMoney('x'), '$0.00');
});
