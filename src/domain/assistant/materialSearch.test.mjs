import test from 'node:test';
import assert from 'node:assert/strict';
import { searchMaterials } from './materialSearch.js';

const FAMILIES = [
  { value: 'green_zip', label: 'Green Zip' },
  { value: 'cdx_se', label: 'CDX SE' },
  { value: 'spf2', label: 'SPF#2' },
  { value: 'syp2', label: 'SYP#2' },
];
const SIZES = {
  green_zip: [
    { value: 'gz1', label: `4x8'-7/16"`, vendorIds: ['v1', 'v2'] },
    { value: 'gz2', label: `4x8'-7/16" R6`, vendorIds: ['v1'] },
  ],
  cdx_se: [{ value: 'cdx1', label: `4x8'-1/2"`, vendorIds: ['v2'] }],
  syp2: [{ value: 'syp1', label: `2x6"-10'`, vendorIds: ['v2'] }],
  spf2: [{ value: 'spf1', label: `2x6"-10'`, vendorIds: ['v1'] }],
};
const VENDORS = { v1: 'Vendor One', v2: 'Vendor Two' };

const fake = {
  getFamilies: async () => FAMILIES,
  getSizesForFamily: async (slug) => SIZES[slug] || [],
  getVendorsForIds: async (ids) => ids.map((id) => ({ value: id, label: VENDORS[id] })),
  getFinalItem: async ({ familyLabel, sizeLabel, vendorId }) => ({
    familyDisplay: familyLabel, sizeDisplay: sizeLabel, vendorId, unit: 'pcs',
    basePrice: 10, priceWithMarkup: 12, priceDate: 1700000000000,
  }),
};

test('finds a family and size by words', async () => {
  const r = await searchMaterials('green zip R6', fake);
  assert.equal(r[0].family, 'Green Zip');
  assert.match(r[0].size, /R6/);
});

test('numbers match as tokens across x, quote and dash', async () => {
  const r = await searchMaterials('2x6 10 studs', fake);
  assert.equal(r[0].family, 'SPF#2');
  assert.equal(r[0].size, `2x6"-10'`);
});

test('no match gives an empty list', async () => {
  assert.deepEqual(await searchMaterials('titanium beam', fake), []);
});

test('results carry id, price and a full selection', async () => {
  const r = await searchMaterials('green zip', fake);
  assert.ok(r.length >= 2);
  r.forEach((m, i) => {
    assert.equal(m.id, `m${i + 1}`);
    assert.equal(m.price, 12);
    assert.equal(m.vendor, 'Vendor One');
    assert.equal(m.selection.item.priceDate, 1700000000000);
    assert.equal(m.selection.vendorId, 'v1');
    assert.equal(m.selection.family, 'green_zip');
  });
});

test('limit caps the results', async () => {
  assert.equal((await searchMaterials('green zip', fake, { limit: 1 })).length, 1);
});

test('a number in the query does not hide the same size in other families', async () => {
  const r = await searchMaterials('2x6 10 studs', fake);
  assert.deepEqual(r.slice(0, 2).map((m) => m.family).sort(), ['SPF#2', 'SYP#2']);
});

test('a size without a price is skipped and ids stay contiguous', async () => {
  const noGz1 = { ...fake, getFinalItem: async (a) => (a.sizeLabel === `4x8'-7/16"` ? null : fake.getFinalItem(a)) };
  const r = await searchMaterials('green zip', noGz1);
  assert.deepEqual(r.map((m) => m.id), ['m1']);
});

test('a blank query gives an empty list', async () => {
  assert.deepEqual(await searchMaterials('  ', fake), []);
});
