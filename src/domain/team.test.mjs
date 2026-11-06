import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoles, permissionsOf, changeSummary, mergeSummary, adminsAfter, continuesEntry, addWarehouse, isEmail } from './team.js';

test('roles normalize and combine', () => {
  assert.deepEqual(normalizeRoles(['warehouse', 'x', 'admin', 'admin']), ['admin', 'warehouse']);
  const p = permissionsOf(['estimator', 'warehouse'], { inventoryEnabled: false });
  assert.equal(p.canEditEstimate, true);
  assert.equal(p.canEditInventory, false, 'inventory off for the company');
  assert.equal(permissionsOf(['warehouse'], { inventoryEnabled: true }).canEditInventory, true);
  assert.equal(permissionsOf([], {}).isMember, false);
  assert.equal(permissionsOf(['admin']).canEditEstimate, false, 'admin alone does not edit estimates');
});

test('change summary names the parts that changed', () => {
  const l1 = { id: 'a', name: '1st Level', plan: { w: 1 }, exteriorSections: [] };
  const prev = { levels: [l1], labor: { x: 1 }, summaryInfo: {}, snapshotTotals: 1 };
  const next = { ...prev, levels: [{ ...l1, plan: { w: 2 } }, { id: 'b', name: '2nd Level' }], labor: { x: 2 }, snapshotTotals: 2 };
  assert.deepEqual(changeSummary(prev, next), ['1st Level · Plan takeoff', '2nd Level · Added', 'Labor']);
  assert.deepEqual(changeSummary(prev, prev), []);
  assert.deepEqual(changeSummary(next, { ...next, levels: [next.levels[0]] }), ['2nd Level · Removed']);
  assert.deepEqual(mergeSummary(['A', 'B'], ['B', 'C']), ['A', 'B', 'C']);
});

test('the company keeps an admin', () => {
  const members = [{ uid: '1', roles: ['admin', 'estimator'] }, { uid: '2', roles: ['estimator'] }];
  assert.equal(adminsAfter(members, '1', ['estimator']), 0);
  assert.equal(adminsAfter(members, '2', ['admin']), 2);
});

test('history entry continues for the same person within the session', () => {
  const last = { by: { uid: 'u' }, atMs: 1000 };
  assert.equal(continuesEntry(last, 'u', 1000 + 60e3), true);
  assert.equal(continuesEntry(last, 'v', 1000 + 60e3), false);
  assert.equal(continuesEntry(last, 'u', 1000 + 16 * 60e3), false);
});

test('warehouses and emails', () => {
  const w = addWarehouse([], '  Main yard ');
  assert.equal(w[0].name, 'Main yard');
  assert.equal(addWarehouse(w, '  ').length, 1);
  assert.equal(isEmail('A@b.co'), true);
  assert.equal(isEmail('nope'), false);
});

import { inviteMailto, approxDocBytes } from './team.js';
test('invitation mailto and document size', () => {
  const m = inviteMailto({ email: 'Bob@Acme.com', roles: ['warehouse', 'estimator'], companyName: 'Acme', inviterName: 'Alonso', appUrl: 'https://x.web.app' });
  assert.ok(m.startsWith('mailto:bob%40acme.com?subject='));
  const body = decodeURIComponent(m.split('&body=')[1]);
  assert.match(body, /as: Estimator, Warehouse/);
  assert.match(body, /https:\/\/x\.web\.app/);
  assert.equal(approxDocBytes({ a: 'ñ' }), 10);
});
