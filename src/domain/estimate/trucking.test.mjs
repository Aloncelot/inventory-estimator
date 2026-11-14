import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTrucking } from './trucking.js';

test('trucks, miles there and back, base fee', () => {
  const t = computeTrucking({ panelsPerTruck: 20, perMile: 4, baseFee: 100, miles: 35 }, 47);
  assert.equal(t.trucks, 3);
  assert.equal(t.milesCharged, 70, 'round trip by default');
  assert.equal(t.perTrip, 380);
  assert.equal(t.total, 1140);
  assert.deepEqual(t.missing, []);
});

test('one-way miles, typed panels, missing inputs', () => {
  assert.equal(computeTrucking({ panelsPerTruck: 20, perMile: 4, baseFee: 100, miles: 35, milesBasis: 'one' }, 47).total, 3 * 240);
  assert.equal(computeTrucking({ panelsPerTruck: 20, perMile: 4, miles: 10, panels: 10 }, 99).trucks, 1);
  const none = computeTrucking({}, 30);
  assert.equal(none.total, 0);
  assert.deepEqual(none.missing, ['panels per truck', 'miles', 'rates']);
  assert.equal(computeTrucking({ panelsPerTruck: 20, perMile: 4, miles: 10 }, 0).total, 0);
});
