// src/domain/assistant/materialSearch.js
// Finds materials in the company's price list from loose words ("green zip
// R6", "2x6 10 studs"), so the assistant can pick a real material instead of
// inventing one. Each result carries a ready-made selection, the same shape
// ItemPicker stores, so applying it is just assigning it to a row.
//
// The catalog is injected ({ getFamilies, getSizesForFamily, getVendorsForIds,
// getFinalItem }, as in src/lib/catalog.js) to keep this module free of
// Firebase.
import { slimItem } from '../lib/selection.js';

// Words and numbers; "2x6" is two numbers, and quotes, dashes and slashes
// only separate. Letters stay together so "CDX" and "R6" are single words.
const tokens = (s) =>
  new Set(
    String(s || '')
      .toLowerCase()
      .replace(/(\d)x(?=\d)/g, '$1 ')
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  );

const hits = (words, text) => {
  const have = tokens(text);
  let n = 0;
  for (const w of words) if (have.has(w)) n++;
  return n;
};

export async function searchMaterials(query, catalog, { limit = 6 } = {}) {
  const words = [...tokens(query)];
  if (!words.length) return [];
  const { getFamilies, getSizesForFamily, getVendorsForIds, getFinalItem } = catalog;

  const families = await getFamilies();
  // Family names are matched on words only: a number in the query ("2" in
  // "2x6") would otherwise single out a family like "SPF#2" and hide the same
  // size in every other lumber family. When no family name is mentioned, look
  // through all of them. Sizes are read in parallel, one read per family.
  const nameWords = words.filter((w) => !/^\d+$/.test(w));
  const named = families.filter((f) => hits(nameWords, f.label) > 0);
  const pool = named.length ? named : families;
  const lists = await Promise.all(pool.map((f) => getSizesForFamily(f.value)));

  const candidates = [];
  pool.forEach((fam, i) => {
    for (const size of lists[i]) {
      const score = hits(words, `${fam.label} ${size.label}`);
      if (score > 0) candidates.push({ fam, size, score });
    }
  });
  candidates.sort((a, b) => b.score - a.score || a.size.label.length - b.size.label.length);

  // Vendor and price are fetched only for what is returned. A size with no
  // vendor or price record cannot be used, so it is skipped.
  const out = [];
  for (const { fam, size } of candidates) {
    if (out.length >= limit) break;
    const vendors = await getVendorsForIds(size.vendorIds);
    // the size's own first vendor, not whichever the catalog returned first
    const vendor = vendors.find((v) => v.value === size.vendorIds?.[0]) ?? vendors[0];
    if (!vendor) continue;
    const item = await getFinalItem({ familyLabel: fam.label, sizeLabel: size.label, vendorId: vendor.value });
    if (!item) continue;
    const slim = slimItem(item);
    out.push({
      id: `m${out.length + 1}`,
      family: fam.label,
      size: size.label,
      vendor: vendor.label,
      unit: slim.unit ?? null,
      price: slim.priceWithMarkup ?? slim.basePrice ?? null,
      selection: {
        family: fam.value,
        familyLabel: fam.label,
        sizeLookupId: size.value,
        sizeLabel: size.label,
        vendorId: vendor.value,
        vendorName: vendor.label,
        item: slim,
      },
    });
  }
  return out;
}
