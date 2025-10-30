// scripts/import-prices.js
// Usage:
//   node scripts/import-prices.js data/data.csv data/prices.csv [data/another_vendor.csv ...]
//
// - data.csv      : export of your "Data" sheet (A = FAMILY/MATERIAL, B = SIZE)
// - prices*.csv   : export(s) of PRICES-like sheets (have DESCRIPTION, SUPPLIER, UNIT, Supplier Price, MARKUP%, CK PRICE with markup, MATERIAL TYPE, LINK, ...)

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const admin = require('firebase-admin');

const serviceAccount = require('../serviceAccount.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ---------- helpers ----------
function slug(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase();
}

function money(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function pct(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function pick(row, ...names) {
  for (const n of names) {
    const k = Object.keys(row).find(h => h.toLowerCase().trim() === n.toLowerCase().trim());
    if (k) return row[k];
  }
  return undefined;
}

function normalizeKey(s = '') {
  return String(s)
    .replace(/\s+/g, ' ')
    .replace(/″/g, '"')
    .replace(/’/g, "'")
    // keep hyphens!
    .trim();
}

function escapeRe(s = '') {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// very safe fallback if a DESCRIPTION isn't found in the Data map
function splitFamilySizeFallback(description, familyFromSheet) {
  const desc = normalizeKey(description);
  let family = String(familyFromSheet || '').trim();
  if (family) {
    const rx = new RegExp(`\\s*[-–—]?\\s*${escapeRe(family)}\\s*$`, 'i');
    const size = desc.replace(rx, '').trim();
    return { family, size };
  }
  // allow digits in family like SPF#2
  const m = desc.match(/([A-Za-z0-9#]+(?:\s+[A-Za-z0-9#]+)*)$/);
  if (m) {
    family = m[1].trim();
    const size = desc.slice(0, -m[0].length).replace(/\s*[-–—]\s*$/, '').trim();
    return { family, size };
  }
  return { family: desc, size: desc };
}

// Canonicalize vendor names so you don't get many IDs for the same supplier
function canonicalVendorName(s = '') {
  const name = String(s).trim();

  // Builders FirstSource (BFS)
  if (/builders?\s*first/i.test(name) || /\bbfs\b/i.test(name)) {
    return { vendorId: 'bfs', displayName: 'Builders FirstSource (BFS)' };
  }

  // Gillies & Prittie Warehouse
  if (/gillies?.*prittie/i.test(name)) {
    return { vendorId: 'gillies_prittie_warehouse', displayName: 'Gillies & Prittie Warehouse' };
  }

  // Home Depot
  if (/home\s*depot/i.test(name)) {
    return { vendorId: 'home_depot', displayName: 'The Home Depot' };
  }

  // Fallback: slug of whatever is there
  const id = slug(name || 'unknown_supplier');
  return { vendorId: id, displayName: name || 'Unknown Supplier' };
}

// ---------- load Data.csv into a map:  "SIZE FAMILY" -> { family, size } ----------
function loadDataMap(dataCsvPath) {
  const file = path.resolve(process.cwd(), dataCsvPath);
  if (!fs.existsSync(file)) {
    throw new Error(`Data CSV not found at ${file}`);
  }
  const rows = parse(fs.readFileSync(file), { columns: true, skip_empty_lines: true });

  // headers can be 'MATERIAL' or 'FAMILY' for column A, and 'SIZE' for column B
  const map = new Map();
  let count = 0;

  for (const row of rows) {
    const family = String(pick(row, 'MATERIAL', 'FAMILY')).trim();
    const size   = String(pick(row, 'SIZE')).trim();
    if (!family || !size) continue;

    const desc = normalizeKey(`${size} ${family}`); // equals PRICES.DESCRIPTION (normalized)
    map.set(desc, { family, size });
    count++;
  }
  console.log(`[import] Data map loaded: ${count} keys`);
  return map;
}

// --- Global maps/sets for lookup data ---
const uniqueFamilies = new Map(); // Map<familySlug, familyDisplay>
const itemVendorMap = new Map(); // Map<itemLookupId, Set<vendorId>>

// ---------- import a single prices CSV ----------
async function importPricesCsv(pricesCsvPath, dataMap) {
  const file = path.resolve(process.cwd(), pricesCsvPath);
  if (!fs.existsSync(file)) {
    console.warn(`[import] Prices CSV not found: ${file} (skipping)`);
    return { written: 0, skipped: 0 };
  }

  const rows = parse(fs.readFileSync(file), { columns: true, skip_empty_lines: true });
  console.log(`[import] Processing ${rows.length} rows from ${path.basename(file)}`);

  let written = 0, skipped = 0;

  for (const row of rows) {
    const description   = pick(row, 'DESCRIPTION');
    if (!description) { skipped++; continue; }

    const unit          = pick(row, 'UNIT');
    const supplierRaw   = pick(row, 'SUPPLIER') || 'Unknown Supplier';
    const materialType  = pick(row, 'MATERIAL TYPE') || '';
    const familySheet   = pick(row, 'ADV', 'FAMILY', 'MATERIAL', 'GROUP', 'TYPE');

    const supplierPrice = money(pick(row, 'Supplier Price'));
    const markupPct     = pct(pick(row, 'MARKUP%', 'MARKUP %'));
    const priceWithSheet= money(pick(row, 'CK PRICE with markup', 'PRICE WITH MARKUP'));
    const link          = pick(row, 'LINK', 'URL');

    // 1) Find family/size via Data map
    const key = normalizeKey(description);
    let family, size;
    const hit = dataMap.get(key);
    if (hit) {
      family = hit.family;
      size   = hit.size;
    } else {
      // 2) Fallback parsing if it wasn't in the Data sheet
      const sp = splitFamilySizeFallback(description, familySheet);
      family = sp.family;
      size   = sp.size;
    }

    const joinKey = `${family}|${size}`;

    // Compute final price with markup (if needed)
    const priceWithMarkup = (priceWithSheet != null && Number.isFinite(priceWithSheet))
      ? priceWithSheet
      : (supplierPrice != null && markupPct != null)
        ? supplierPrice * (1 + markupPct / 100)
        : null;

    const { vendorId, displayName } = canonicalVendorName(supplierRaw);

    // --- Prepare slugs and IDs ---
    const familySlug = slug(family);
    const sizeSlug = slug(size);
    const docId = slug(joinKey); // ID within vendor's items subcollection
    const itemLookupId = `${familySlug}_${sizeSlug}`; // Unique ID for the item across vendors


    const data = {
      familyDisplay: family,
      sizeDisplay:   size,
      joinKey,
      familySlug: familySlug,
      sizeSlug:   sizeSlug,
      unit: unit || '',
      supplierName: displayName,
      vendorId,
      materialType,
      url: link || '',
      basePrice: supplierPrice,
      markupPct:  (markupPct != null) ? Number(markupPct) : null,
      priceWithMarkup: (priceWithMarkup != null) ? Number(priceWithMarkup) : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'sheet:PRICES',
    };

    if (familySlug && !uniqueFamilies.has(familySlug)) {
             uniqueFamilies.set(familySlug, family); // Store slug -> display name
         }
         if (familySlug && sizeSlug) {
             if (!itemVendorMap.has(itemLookupId)) {
                 itemVendorMap.set(itemLookupId, new Set());
             }
             itemVendorMap.get(itemLookupId).add(vendorId); 
         }

    try {
      // ensure vendor doc
      const vendorDoc = {
        displayName,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (materialType) {
        vendorDoc.materialTypes = admin.firestore.FieldValue.arrayUnion(materialType);
      }
      await db.collection('priceLists').doc(vendorId).set(vendorDoc, { merge: true });

      // upsert item
      await db.collection('priceLists').doc(vendorId).collection('items').doc(docId).set(data, { merge: true });

      written++;
      if (written % 250 === 0) console.log(`...processed ${written}`);
    } catch (e) {
      console.error(`Failed row "${description}" for vendor "${vendorId}":`, e.message);
      skipped++;
    }
  }

  console.log(`[import] Done ${path.basename(file)}. Written to priceLists: ${written}, Skipped: ${skipped}`);
     return { written, skipped };
}

// --- Function to write lookup collections ---
async function writeLookupCollections() {
    console.log('\n[import] Writing lookup collections...');
    const batchSize = 400; // Firestore batch limit is 500
    let batch = db.batch();
    let count = 0;
    let batchNum = 1;

    // Write Families
    console.log(`[import] Writing ${uniqueFamilies.size} unique families to /families...`);
    count = 0;
    batchNum = 1;
    for (const [slug, label] of uniqueFamilies.entries()) {
        const docRef = db.collection('families').doc(slug);
        batch.set(docRef, { label: label, slug: slug }, { merge: true });
        count++;
        if (count >= batchSize) {
            await batch.commit();
            console.log(`...committed family batch ${batchNum} (${count} docs)`);
            batch = db.batch();
            count = 0;
            batchNum++;
        }
    }
    if (count > 0) {
        await batch.commit();
        console.log(`...committed final family batch ${batchNum} (${count} docs)`);
    }

    // Write Item-Vendor Lookups
    console.log(`[import] Writing ${itemVendorMap.size} item-vendor lookups to /itemVendorLookup...`);
    batch = db.batch(); // Reset batch
    count = 0;
    batchNum = 1;
    for (const [itemLookupId, vendorSet] of itemVendorMap.entries()) {
        if (vendorSet.size > 0) {
            const docRef = db.collection('itemVendorLookup').doc(itemLookupId);
            batch.set(docRef, { vendorIds: Array.from(vendorSet) }, { merge: true }); // Store as an array
            count++;
            if (count >= batchSize) {
                await batch.commit();
                console.log(`...committed item-vendor batch ${batchNum} (${count} docs)`);
                batch = db.batch();
                count = 0;
                batchNum++;
            }
        }
    }
    if (count > 0) {
        await batch.commit();
        console.log(`...committed final item-vendor batch ${batchNum} (${count} docs)`);
    }
    console.log('[import] Finished writing lookup collections.');
}

// ---------- main ----------
async function run() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node scripts/import-prices.js <data.csv> <prices1.csv> [prices2.csv ...]');
    process.exit(1);
  }

  const dataCsv   = args[0];
  const priceCsvs = args.slice(1);

  const dataMap = loadDataMap(dataCsv);

  let totalW = 0, totalS = 0;
  for (const p of priceCsvs) {
    const { written, skipped } = await importPricesCsv(p, dataMap);
    totalW += written;
    totalS += skipped;
  }

  await writeLookupCollections();

  console.log(`\n[import] ALL DONE. Total items processed: ${totalW}, total skipped: ${totalS}`);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
