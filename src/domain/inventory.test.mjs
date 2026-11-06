import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMovement, validateMovement, onHand, stockStatus, sampleStock, inventoryTotals, stockRows } from './inventory.js';

const WH = [{ id: 'a', name: 'Main' }, { id: 'b', name: 'North' }];

test('receive, issue, transfer and count', () => {
  let s = { qty: {}, minQty: 10 };
  s = applyMovement(s, { type: 'in', warehouseId: 'a', qty: 100, unitCost: 5 }).stock;
  assert.equal(onHand(s), 100);
  assert.equal(s.avgCost, 5);
  s = applyMovement(s, { type: 'in', warehouseId: 'a', qty: 100, unitCost: 7 }).stock;
  assert.equal(s.avgCost, 6, 'weighted average');
  const r = applyMovement(s, { type: 'transfer', warehouseId: 'a', toWarehouseId: 'b', qty: 30 });
  assert.deepEqual(r.delta, { a: -30, b: 30 });
  s = r.stock;
  s = applyMovement(s, { type: 'out', warehouseId: 'b', qty: 25 }).stock;
  assert.equal(onHand(s, 'b'), 5);
  const c = applyMovement(s, { type: 'adjust', warehouseId: 'a', qty: 168 });
  assert.deepEqual(c.delta, { a: -2 });
  assert.equal(c.stock.onHand, 173);
  assert.equal(c.stock.avgCost, 6, 'issues and counts keep the cost');
});

test('movements are validated: whole pieces, enough stock, two warehouses', () => {
  const s = { qty: { a: 4 } };
  assert.match(validateMovement({ itemKey: 'x', type: 'out', warehouseId: 'a', qty: 2.5 }, s, WH), /Whole pieces/);
  assert.match(validateMovement({ itemKey: 'x', type: 'out', warehouseId: 'a', qty: 5 }, s, WH), /Only 4/);
  assert.match(validateMovement({ itemKey: 'x', type: 'transfer', warehouseId: 'a', toWarehouseId: 'a', qty: 1 }, s, WH), /two different/);
  assert.equal(validateMovement({ itemKey: 'x', type: 'adjust', warehouseId: 'a', qty: 0 }, s, WH), '');
  assert.equal(validateMovement({ itemKey: 'x', type: 'in', warehouseId: 'b', qty: 3, unitCost: 2 }, s, WH), '');
  assert.match(validateMovement({ itemKey: 'x', type: 'in', warehouseId: 'z', qty: 3 }, s, WH), /warehouse/);
});

test('status, totals and the sample stock', () => {
  assert.equal(stockStatus({ qty: { a: 0 } }), 'out');
  assert.equal(stockStatus({ qty: { a: 5 }, minQty: 10 }), 'low');
  const items = Array.from({ length: 200 }, (_, i) => ({ itemKey: `k${i}`, family: 'SPF#2', size: `2x4-${i}`, materialType: i % 2 ? 'SPF Lumber' : 'Nails' }));
  const s1 = sampleStock(items, WH, { seed: 3 });
  const s2 = sampleStock(items, WH, { seed: 3 });
  assert.deepEqual(s1, s2, 'same seed, same sample');
  const stocked = s1.filter((x) => x.receipts.length).length;
  assert.ok(stocked > 120 && stocked < 180, `about 3 in 4 stocked (${stocked})`);
  assert.ok(s1.every((x) => x.receipts.every((r) => Number.isInteger(r.qty) && r.qty > 0)));
  const stocks = [{ family: 'B', size: '1', qty: { a: 2 }, avgCost: 3, minQty: 5 }, { family: 'A', size: '1', qty: { a: 10 }, avgCost: 1 }];
  assert.deepEqual(inventoryTotals(stocks), { items: 2, value: 16, low: 1, out: 0 });
  assert.equal(stockRows(stocks)[0].family, 'A');
  assert.equal(stockRows(stocks, { lowOnly: true }).length, 1);
});
