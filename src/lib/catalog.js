// src/lib/catalog.js
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  documentId,
  orderBy,
  addDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  limit,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';

// Each company keeps its own price list: materials, sizes, suppliers and prices
// under companies/{cid}/families | priceLists | itemVendorLookup. The top-level
// collections of the same names are only the starter list a new company can copy.
let BASE = null;
/** Called by the company context; switching companies empties the caches. */
export function setCatalogBase(base) {
  if (base === BASE) return;
  BASE = base || null;
  cache.clear();
  inflight.clear();
}
export const catalogPath = (name) => (BASE ? `${BASE}/${name}` : `__no_company__/x/${name}`);
const C = catalogPath;

// --- Cache Functions ---
const cache = new Map();
const getFromCache = (key) => cache.get(key);
const setInCache = (key, data) => {
  cache.set(key, data);
  return data;
};

// Helper function
export function slug(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase();
}

// ... (getFamilies, getAllVendors, getSizesForFamily, getVendorsForIds, getFinalItem, getPricesForItem, updateItemPrice, createItemPrice UNCHANGED) ...
// Assume previous code is here

// In-flight request cache: dozens of pickers mount at once and ask for the same
// lists; share one Firestore read per list instead of one per picker.
const inflight = new Map();
const once = (key, loader) => {
  if (inflight.has(key)) return inflight.get(key);
  const p = loader().catch((e) => { inflight.delete(key); throw e; });
  inflight.set(key, p);
  return p;
};
export function clearCatalogCache() { cache.clear(); inflight.clear(); }

export async function getFamilies() {
  const cacheKey = 'families';
  if (getFromCache(cacheKey)) return getFromCache(cacheKey);
  try {
    return await once(cacheKey, async () => {
      const q = query(collection(db, C('families')), orderBy('label'));
      const snapshot = await getDocs(q);
      const families = snapshot.docs.map(doc => ({ value: doc.id, label: doc.data().label }));
      return setInCache(cacheKey, families);
    });
  } catch (e) { console.error(e); return []; }
}

export async function getAllVendors() {
  const cacheKey = 'all_vendors';
  try {
    const q = query(collection(db, C('priceLists')), orderBy('displayName'));
    const snapshot = await getDocs(q);
    const vendors = snapshot.docs.map(doc => ({ value: doc.id, label: doc.data().displayName || doc.id }));
    return setInCache(cacheKey, vendors);
  } catch (e) { console.error(e); return []; }
}

export async function getSizesForFamily(familySlug) {
  if (!familySlug) return [];
  try {
    return await once(`sizes:${familySlug}`, () => loadSizesForFamily(familySlug));
  } catch (e) { console.error(e); return []; }
}

async function loadSizesForFamily(familySlug) {
  {
    const q = query(collection(db, C('itemVendorLookup')), where('familySlug', '==', familySlug));
    const snapshot = await getDocs(q);
    const sizes = snapshot.docs.map(doc => {
      const data = doc.data();
      return { value: doc.id, label: data.sizeDisplay, vendorIds: data.vendorIds || [], fullItemData: data };
    });
    sizes.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    return sizes;
  }
}

export async function getVendorsForIds(vendorIds) {
   if (!vendorIds || vendorIds.length === 0) return [];
   const vendorsToFetch = []; const cachedVendors = [];
   vendorIds.forEach(id => { const c = getFromCache(`vendor:${id}`); if(c) cachedVendors.push(c); else vendorsToFetch.push(id); });
   if (vendorsToFetch.length === 0) return cachedVendors;
   try {
     const q = query(collection(db, C('priceLists')), where(documentId(), 'in', vendorsToFetch));
     const snapshot = await getDocs(q);
     const newVendors = snapshot.docs.map(doc => {
       const v = { value: doc.id, label: doc.data().displayName };
       setInCache(`vendor:${doc.id}`, v); return v;
     });
     return [...cachedVendors, ...newVendors];
   } catch(e) { return []; }
}

export async function getFinalItem({ familyLabel, sizeLabel, vendorId }) {
   if (!familyLabel || !sizeLabel || !vendorId) return null;
   const joinKey = `${familyLabel}|${sizeLabel}`; const docId = slug(joinKey);
   const cacheKey = `item:${vendorId}:${docId}`;
   // share one read between pickers asking for the same price at once
   // (no long-term cache: prices change and "Refresh prices" must see them)
   if (inflight.has(cacheKey)) return inflight.get(cacheKey);
   const p = (async () => {
     try {
       const docSnap = await getDoc(doc(db, C('priceLists'), vendorId, 'items', docId));
       return docSnap.exists() ? docSnap.data() : null;
     } catch (e) { return null; } finally { inflight.delete(cacheKey); }
   })();
   inflight.set(cacheKey, p);
   return p;
}

export async function getPricesForItem(itemData) {
    if (!itemData || !itemData.vendorIds) return [];
    const { vendorIds, familyDisplay, sizeDisplay } = itemData;
    const pricePromises = vendorIds.map(async (vendorId) => {
      try {
        const vendorInfo = getFromCache(`vendor:${vendorId}`) || (await getVendorsForIds([vendorId]))[0];
        const itemPriceDoc = await getFinalItem({ familyLabel: familyDisplay, sizeLabel: sizeDisplay, vendorId });
        return { vendorName: vendorInfo?.label || vendorId, ...itemPriceDoc, vendorId };
      } catch (e) { return null; }
    });
    return (await Promise.all(pricePromises)).filter(Boolean);
}

export async function updateItemPrice(updatedItem) {
  clearCatalogCache(); // lists changed: next picker open reloads them
   if (!updatedItem || !updatedItem.vendorId) throw new Error("Invalid data");
   const { vendorId, joinKey } = updatedItem;
   const docId = slug(joinKey);
   const cacheKey = `item:${vendorId}:${docId}`;
   try {
     const itemRef = doc(db, C('priceLists'), vendorId, 'items', docId);
     const docSnap = await getDoc(itemRef);
     if (docSnap.exists()) {
       const oldData = docSnap.data();
       if (oldData.basePrice !== updatedItem.basePrice) {
         await addDoc(collection(itemRef, 'priceHistory'), {
           basePrice: oldData.basePrice, markupPct: oldData.markupPct, priceWithMarkup: oldData.priceWithMarkup,
           updatedAt: oldData.updatedAt || serverTimestamp(), source: oldData.source || 'manual-update'
         });
       }
     }
     await setDoc(itemRef, { ...updatedItem, updatedAt: serverTimestamp() }, { merge: true });
     cache.delete(cacheKey);
   } catch (e) { throw e; }
}

export async function createItemPrice(newItem) {
  clearCatalogCache(); // lists changed: next picker open reloads them
  if (!newItem || !newItem.familyDisplay || !newItem.sizeDisplay) throw new Error("Missing data");
  let vendorId = newItem.vendorId;
  let supplierName = newItem.supplierName;
  if (newItem.isNewVendor && newItem.newVendorName) {
    supplierName = newItem.newVendorName;
    vendorId = slug(supplierName);
    try {
      await setDoc(doc(db, C('priceLists'), vendorId), {
        displayName: supplierName, updatedAt: serverTimestamp()
      }, { merge: true });
      cache.delete('all_vendors'); 
    } catch (e) { throw new Error("Failed to create new vendor."); }
  }
  if (!vendorId) throw new Error("No vendor ID.");
  const { familyDisplay, sizeDisplay } = newItem;
  const joinKey = `${familyDisplay}|${sizeDisplay}`;
  const docId = slug(joinKey); 
  const familySlug = slug(familyDisplay);
  const sizeSlug = slug(sizeDisplay);
  const itemLookupId = `${familySlug}_${sizeSlug}`; 
  const cacheKey = `item:${vendorId}:${docId}`;
  try {
    const itemRef = doc(db, C('priceLists'), vendorId, 'items', docId);
    const { isNewVendor, newVendorName, ...dataToSave } = newItem;
    Object.assign(dataToSave, {
      vendorId, supplierName, joinKey, familySlug, sizeSlug,
      updatedAt: serverTimestamp(), source: 'manual-create'
    });
    await setDoc(itemRef, dataToSave, { merge: true });
    const lookupRef = doc(db, C('itemVendorLookup'), itemLookupId);
    await updateDoc(lookupRef, { vendorIds: arrayUnion(vendorId) });
    cache.delete(cacheKey); 
    console.log(`Created new price for ${docId}`);
  } catch (e) { console.error(e); throw e; }
}

/**
 * Updated: Create a COMPLETELY NEW Material (Family + Item + First Price)
 */
export async function createNewMaterial(newItemData) {
  clearCatalogCache(); // lists changed: next picker open reloads them
  // 1. Validate
  // If creating a new family, 'newFamilyName' will be present, otherwise 'familyDisplay'
  const familyName = newItemData.isNewFamily 
    ? newItemData.newFamilyName 
    : newItemData.familyDisplay;

  if (!newItemData.sizeDisplay || !familyName) {
    throw new Error("Family and Size are required.");
  }
  
  const familySlug = slug(familyName);
  const sizeSlug = slug(newItemData.sizeDisplay);
  const itemLookupId = `${familySlug}_${sizeSlug}`;

  // 2. Create/Ensure Family Exists
  if (newItemData.isNewFamily) {
    await setDoc(doc(db, C('families'), familySlug), {
      label: familyName,
      slug: familySlug,
    }, { merge: true });
    
    // Clear cache so the new family appears in the list immediately
    cache.delete('families');
  }

  // 3. Create the Lookup Document
  // We pass the correct familyDisplay (whether new or existing)
  await setDoc(doc(db, C('itemVendorLookup'), itemLookupId), {
    familyDisplay: familyName,
    sizeDisplay: newItemData.sizeDisplay,
    familySlug: familySlug,
    sizeSlug: sizeSlug,
  }, { merge: true });

  // 4. Create the Price Entry
  // We ensure the 'familyDisplay' property is set correctly for createItemPrice
  const dataForPrice = {
    ...newItemData,
    familyDisplay: familyName, 
  };
  
  await createItemPrice(dataForPrice);
}

/* ── starter list ───────────────────────────────────────────────────── */

/** True when the company has no supplier in its price list yet. */
export async function catalogIsEmpty() {
  const snap = await getDocs(query(collection(db, C('priceLists')), limit(1)));
  return snap.empty;
}

/**
 * Copy the starter price list (top-level collections) into the company, to
 * edit from there. Existing company documents with the same id are
 * overwritten by merge, so running it twice does no harm.
 */
export async function copyStarterCatalog({ base = BASE, onProgress } = {}) {
  if (!base) throw new Error('No company is open.');
  const C = (name) => `${base}/${name}`;
  const counts = { families: 0, suppliers: 0, prices: 0, items: 0 };
  let batch = writeBatch(db); let ops = 0;
  const put = async (ref, data) => {
    batch.set(ref, data, { merge: true }); ops += 1;
    if (ops >= 400) { await batch.commit(); batch = writeBatch(db); ops = 0; onProgress?.({ ...counts }); }
  };
  for (const d of (await getDocs(collection(db, 'families'))).docs) { await put(doc(db, C('families'), d.id), d.data()); counts.families += 1; }
  for (const d of (await getDocs(collection(db, 'itemVendorLookup'))).docs) { await put(doc(db, C('itemVendorLookup'), d.id), d.data()); counts.items += 1; }
  for (const v of (await getDocs(collection(db, 'priceLists'))).docs) {
    await put(doc(db, C('priceLists'), v.id), v.data()); counts.suppliers += 1;
    for (const it of (await getDocs(collection(db, `priceLists/${v.id}/items`))).docs) {
      await put(doc(db, C('priceLists'), v.id, 'items', it.id), it.data()); counts.prices += 1;
    }
  }
  if (ops) await batch.commit();
  clearCatalogCache();
  onProgress?.({ ...counts });
  return counts;
}

/** Supplier prices of one material, by its key (familySlug_sizeSlug). */
export async function getItemPrices(itemKey) {
  const snap = await getDoc(doc(db, C('itemVendorLookup'), itemKey));
  if (!snap.exists()) return [];
  return getPricesForItem(snap.data());
}
