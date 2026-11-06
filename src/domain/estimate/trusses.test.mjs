import test from 'node:test';
import assert from 'node:assert/strict';
import { trussEstimate } from './trusses.js';
import { computeTrusses } from './index.js';

const lv = (id, name) => ({ id, name, exteriorSections: [], interiorSections: [] });

test('one level: roof trusses only; more levels: floor trusses under each upper level', () => {
  const one = trussEstimate({ levels: [lv('a', 'Level 1')], trussEstimate: { areas: { roof: 2000 } } });
  assert.deepEqual(one.lines.map((l) => [l.key, l.amount]), [['roof', 7000]]);
  const three = trussEstimate({ levels: [lv('a', 'L1'), lv('b', 'L2'), lv('c', 'L3')], trussEstimate: { roofRate: 4, areas: { roof: 1000, 'floor|b': 1000, 'floor|c': 1000 } } });
  assert.deepEqual(three.lines.map((l) => [l.key, l.amount]), [['roof', 4000], ['floor|b', 3500], ['floor|c', 3500]]);
});

test('the estimate counts until the quote is typed', () => {
  const est = { levels: [lv('a', 'Level 1')], trussEstimate: { areas: { roof: 1000 } } };
  assert.equal(computeTrusses(est).total, 3500);
  assert.equal(computeTrusses({ ...est, trusses: [{ amount: '5000' }] }).total, 5000);
  assert.equal(computeTrusses({ ...est, trusses: [{ amount: '5000' }], trussEstimate: { ...est.trussEstimate, use: 'on' } }).total, 8500);
  assert.equal(computeTrusses({ ...est, trussEstimate: { ...est.trussEstimate, use: 'off' } }).total, 0);
});
