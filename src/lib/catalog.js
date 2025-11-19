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
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';

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

export async function getFamilies() {
  const cacheKey = 'families';
  if (getFromCache(cacheKey)) return getFromCache(cacheKey);
  try {
    const q = query(collection(db, 'families'), orderBy('label'));
    const snapshot = await getDocs(q);
    const families = snapshot.docs.map(doc => ({ value: doc.id, label: doc.data().label }));
    return setInCache(cacheKey, families);
  } catch (e) { console.error(e); return []; }
}

export async function getAllVendors() {
  const cacheKey = 'all_vendors';
  try {
    const q = query(collection(db, 'priceLists'), orderBy('displayName'));
    const snapshot = await getDocs(q);
    const vendors = snapshot.docs.map(doc => ({ value: doc.id, label: doc.data().displayName || doc.id }));
    return setInCache(cacheKey, vendors);
  } catch (e) { console.error(e); return []; }
}

export async function getSizesForFamily(familySlug) {
  if (!familySlug) return [];
  try {
    const q = query(collection(db, 'itemVendorLookup'), where('familySlug', '==', familySlug));
    const snapshot = await getDocs(q);
    const sizes = snapshot.docs.map(doc => {
      const data = doc.data();
      return { value: doc.id, label: data.sizeDisplay, vendorIds: data.vendorIds || [], fullItemData: data };
    });
    sizes.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    return sizes; 
  } catch (e) { console.error(e); return []; }
}

export async function getVendorsForIds(vendorIds) {
   if (!vendorIds || vendorIds.length === 0) return [];
   const vendorsToFetch = []; const cachedVendors = [];
   vendorIds.forEach(id => { const c = getFromCache(`vendor:${id}`); if(c) cachedVendors.push(c); else vendorsToFetch.push(id); });
   if (vendorsToFetch.length === 0) return cachedVendors;
   try {
     const q = query(collection(db, 'priceLists'), where(documentId(), 'in', vendorsToFetch));
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
   try {
     const docRef = doc(db, 'priceLists', vendorId, 'items', docId);
     const docSnap = await getDoc(docRef);
     if (docSnap.exists()) return setInCache(cacheKey, docSnap.data());
     return null;
   } catch(e) { return null; }
}

export async function getPricesForItem(itemData) {
    if (!itemData || !itemData.vendorIds) return [];
    const { vendorIds, familyDisplay, sizeDisplay } = itemData;
    const pricePromises = vendorIds.map(async (vendorId) => {
      try {
        const vendorInfo = getFromCache(`vendor:${vendorId}`) || (await getVendorsForIds([vendorId]))[0];
        const itemPriceDoc = await getFinalItem({ familyLabel: familyDisplay, sizeLabel: sizeDisplay, vendorId });
        return { vendorName: vendorInfo?.label || vendorId, ...itemPriceDoc };
      } catch (e) { return null; }
    });
    return (await Promise.all(pricePromises)).filter(Boolean);
}

export async function updateItemPrice(updatedItem) {
   if (!updatedItem || !updatedItem.vendorId) throw new Error("Invalid data");
   const { vendorId, joinKey } = updatedItem;
   const docId = slug(joinKey);
   const cacheKey = `item:${vendorId}:${docId}`;
   try {
     const itemRef = doc(db, 'priceLists', vendorId, 'items', docId);
     const docSnap = await itemRef.get();
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
  if (!newItem || !newItem.familyDisplay || !newItem.sizeDisplay) throw new Error("Missing data");
  let vendorId = newItem.vendorId;
  let supplierName = newItem.supplierName;
  if (newItem.isNewVendor && newItem.newVendorName) {
    supplierName = newItem.newVendorName;
    vendorId = slug(supplierName);
    try {
      await setDoc(doc(db, 'priceLists', vendorId), {
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
    const itemRef = doc(db, 'priceLists', vendorId, 'items', docId);
    const { isNewVendor, newVendorName, ...dataToSave } = newItem;
    Object.assign(dataToSave, {
      vendorId, supplierName, joinKey, familySlug, sizeSlug,
      updatedAt: serverTimestamp(), source: 'manual-create'
    });
    await setDoc(itemRef, dataToSave, { merge: true });
    const lookupRef = doc(db, 'itemVendorLookup', itemLookupId);
    await updateDoc(lookupRef, { vendorIds: arrayUnion(vendorId) });
    cache.delete(cacheKey); 
    console.log(`Created new price for ${docId}`);
  } catch (e) { console.error(e); throw e; }
}

/**
 * Updated: Create a COMPLETELY NEW Material (Family + Item + First Price)
 */
export async function createNewMaterial(newItemData) {
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
    await setDoc(doc(db, 'families', familySlug), {
      label: familyName,
      slug: familySlug,
    }, { merge: true });
    
    // Clear cache so the new family appears in the list immediately
    cache.delete('families');
  }

  // 3. Create the Lookup Document
  // We pass the correct familyDisplay (whether new or existing)
  await setDoc(doc(db, 'itemVendorLookup', itemLookupId), {
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