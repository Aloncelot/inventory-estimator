// scripts/import-prices.js
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
    .trim();
}

function escapeRe(s = '') {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitFamilySizeFallback(description, familyFromSheet) {
  const desc = normalizeKey(description || '');
  
  const firstSpaceIndex = desc.indexOf(' ');

  if (firstSpaceIndex > 0 && firstSpaceIndex < desc.length - 1) {
    const size = desc.substring(0, firstSpaceIndex).trim();
    const family = desc.substring(firstSpaceIndex + 1).trim();
    return { family, size };
  }

  if (familyFromSheet) {
    return { family: familyFromSheet, size: desc };
  }

  return { family: desc, size: desc };
}

function canonicalVendorName(s = '') {
  const name = String(s).trim();
  if (/builders?\s*first/i.test(name) || /\bbfs\b/i.test(name)) {
    return { vendorId: 'bfs', displayName: 'Builders FirstSource (BFS)' };
  }
  if (/gillies?.*prittie/i.test(name)) {
    return { vendorId: 'gillies_prittie_warehouse', displayName: 'Gillies & Prittie Warehouse' };
  }
  if (/home\s*depot/i.test(name)) {
    return { vendorId: 'home_depot', displayName: 'The Home Depot' };
  }
  if (/hardfine/i.test(name)) {
    return { vendorId: 'hardfine', displayName: 'HardFine' };
  }
  if (/lowes/i.test(name)) {
    return { vendorId: 'lowes', displayName: "Lowe's" };
  }
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

  const map = new Map();
  let count = 0;
  for (const row of rows) {
    const family = String(pick(row, 'MATERIAL', 'FAMILY')).trim();
    const size   = String(pick(row, 'SIZE')).trim();
    if (!family || !size) continue;
    const desc = normalizeKey(`${size} ${family}`); 
    map.set(desc, { family, size });
    count++;
  }
  console.log(`[import] Data map loaded: ${count} keys`);
  return map;
}

// --- Global maps/sets for lookup data ---
const uniqueFamilies = new Map(); // Map<familySlug, familyDisplay>
const itemVendorMap = new Map(); // Map<itemLookupId, { vendorSet, familyDisplay, sizeDisplay, ... }>

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
    const familySheet   = pick(row, 'SHEATHING', 'ADV', 'FAMILY', 'MATERIAL', 'GROUP', 'TYPE');

    const rawBasePrice = pick(row, 'Supplier Price Sep 2025', 'Base Price') || null;
    const rawMarkup = pick(row, 'Markup %') || null;
    const rawPriceWithMarkup = pick(row, 'CX PRICE with markup', 'Price w/Markup') || null;
    const basePrice = money(rawBasePrice);
    const markupPct = pct(rawMarkup);
    const priceWithMarkup = money(rawPriceWithMarkup);    
    
    const link          = pick(row, 'URL'); // Uses your fix from before

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
    
    if (basePrice === null || isNaN(basePrice) || basePrice <= 0) {
        if (family && size) {
          console.warn(`SKIPPING: Invalid or missing basePrice for "${family} | ${size}". Raw value: "${rawBasePrice}"`);
        }
        skipped++;
        continue;
    }
    const joinKey = `${family}|${size}`;

    const { vendorId, displayName } = canonicalVendorName(supplierRaw);

    const familySlug = slug(family);
    const sizeSlug = slug(size);
    const docId = slug(joinKey); // ID within vendor's items subcollection
    const itemLookupId = `${familySlug}_${sizeSlug}`; // Unique ID for the item across vendors

    // This is the NEW data from the CSV
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
      basePrice: basePrice,
      markupPct:  (markupPct != null) ? Number(markupPct) : null,
      priceWithMarkup: (priceWithMarkup != null) ? Number(priceWithMarkup) : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(), // This is the NEW timestamp
      source: `sheet:${path.basename(pricesCsvPath)}`,
    };

    // (This logic for lookup maps is fine)
    if (familySlug && !uniqueFamilies.has(familySlug)) {
             uniqueFamilies.set(familySlug, family); 
         }
         if (familySlug && sizeSlug) {
             if (!itemVendorMap.has(itemLookupId)) {
                 itemVendorMap.set(itemLookupId, {
                    vendorSet: new Set(),
                    familyDisplay: family,
                    sizeDisplay: size,
                    familySlug: familySlug,
                    sizeSlug: sizeSlug
                 });
             }            
             itemVendorMap.get(itemLookupId).vendorSet.add(vendorId); 
         }
         
    // --- *** NEW PRICE HISTORY LOGIC *** ---
    try {
      // 1. Set vendor info (no change)
      const vendorDoc = {
        displayName,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (materialType) {
        vendorDoc.materialTypes = admin.firestore.FieldValue.arrayUnion(materialType);
      }
      await db.collection('priceLists').doc(vendorId).set(vendorDoc, { merge: true });

      // 2. Get reference to the item
      const itemRef = db.collection('priceLists').doc(vendorId).collection('items').doc(docId);
      const docSnap = await itemRef.get();

      // 3. Check for price change and create history
      if (docSnap.exists()) {
        const oldData = docSnap.data();
        // Check if price is different
        if (oldData.basePrice !== data.basePrice) {
          console.log(`Price change for ${docId} (${vendorId}): ${oldData.basePrice} -> ${data.basePrice}`);
          
          // Create history entry from OLD data
          const historyEntry = {
            basePrice: oldData.basePrice,
            markupPct: oldData.markupPct,
            priceWithMarkup: oldData.priceWithMarkup,
            updatedAt: oldData.updatedAt || admin.firestore.FieldValue.serverTimestamp(), // Use old timestamp
            source: oldData.source || 'unknown'
          };
          
          // Save old data to history sub-collection (let Firestore auto-gen ID)
          await itemRef.collection('priceHistory').add(historyEntry);
        }
      }

      // 4. Set/overwrite the main item doc with NEW data
      await itemRef.set(data, { merge: true });

      written++;
      if (written % 250 === 0) console.log(`...processed ${written}`);
    } catch (e) {
      console.error(`Failed row "${description}" for vendor "${vendorId}":`, e.message);
      skipped++;
    }
    // --- *** END OF NEW LOGIC *** ---
  }

  console.log(`[import] Done ${path.basename(file)}. Written to priceLists: ${written}, Skipped: ${skipped}`);
     return { written, skipped };
}

// --- Function to write lookup collections (no change) ---
async function writeLookupCollections() {
    console.log('\n[import] Writing lookup collections...');
    const batchSize = 400; 
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
    batch = db.batch(); 
    count = 0;
    batchNum = 1;
    for (const [itemLookupId, data] of itemVendorMap.entries()) {
        if (data.vendorSet.size > 0) {
            const docRef = db.collection('itemVendorLookup').doc(itemLookupId);
            batch.set(docRef, { 
                vendorIds: Array.from(data.vendorSet),
                familyDisplay: data.familyDisplay,
                sizeDisplay: data.sizeDisplay,
                familySlug: data.familySlug,
                sizeSlug: data.sizeSlug
            }, { merge: true });
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

// ---------- main (no change) ----------
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