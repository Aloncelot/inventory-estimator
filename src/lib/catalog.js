// lib/catalog.js
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  documentId,
  orderBy,
  addDoc,   // <-- NEW import
  setDoc,   // <-- NEW import
  serverTimestamp // <-- NEW import
} from 'firebase/firestore';
import { db } from './firebase';

// --- Cache Functions ---
const cache = new Map();

const getFromCache = (key) => cache.get(key);
const setInCache = (key, data) => {
  cache.set(key, data);
  return data;
};
// --- End Cache Functions ---

// Helper function
function slug(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase();
}

/**
 * Step 1: Get all families (with cache)
 */
export async function getFamilies() {
  const cacheKey = 'families';
  if (getFromCache(cacheKey)) return getFromCache(cacheKey);

  try {
    const q = query(collection(db, 'families'), orderBy('label'));
    const snapshot = await getDocs(q);
    const families = snapshot.docs.map(doc => ({
      value: doc.id,
      label: doc.data().label,
    }));
    return setInCache(cacheKey, families);
  } catch (e) {
    console.error("Error fetching families:", e);
    return [];
  }
}

/**
 * Step 2: Get all sizes for a given family (with cache)
 */
export async function getSizesForFamily(familySlug) {
  if (!familySlug) return [];
  
  const cacheKey = `sizes:${familySlug}`;
  if (getFromCache(cacheKey)) return getFromCache(cacheKey);

  try {
    const q = query(collection(db, 'itemVendorLookup'), where('familySlug', '==', familySlug));
    const snapshot = await getDocs(q);
    
    const sizes = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        value: doc.id,
        label: data.sizeDisplay,
        vendorIds: data.vendorIds || [],
        fullItemData: data, 
      };
    });

    sizes.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    
    return setInCache(cacheKey, sizes);
  } catch (e) {
    console.error("Error fetching sizes for family:", familySlug, e);
    return [];
  }
}

/**
 * Step 3: Get vendor details from a list of IDs (with cache)
 */
export async function getVendorsForIds(vendorIds) {
  if (!vendorIds || vendorIds.length === 0) return [];

  const vendorsToFetch = [];
  const cachedVendors = [];
  
  vendorIds.forEach(id => {
    const cached = getFromCache(`vendor:${id}`);
    if (cached) {
      cachedVendors.push(cached);
    } else {
      vendorsToFetch.push(id);
    }
  });

  if (vendorsToFetch.length === 0) return cachedVendors;
  
  try {
    const q = query(collection(db, 'priceLists'), where(documentId(), 'in', vendorsToFetch));
    const snapshot = await getDocs(q);
    
    const newVendors = snapshot.docs.map(doc => {
      const vendor = {
        value: doc.id,
        label: doc.data().displayName,
      };
      setInCache(`vendor:${doc.id}`, vendor); 
      return vendor;
    });
    
    return [...cachedVendors, ...newVendors];
  } catch (e) {
    if (e.code === 'invalid-argument') {
      return [];
    }
    console.error("Error fetching vendors for IDs:", vendorIds, e);
    return [];
  }
}

/**
 * Step 4: Get the final, priced item (with cache)
 */
export async function getFinalItem({ familyLabel, sizeLabel, vendorId }) {
  if (!familyLabel || !sizeLabel || !vendorId) return null;

  const joinKey = `${familyLabel}|${sizeLabel}`;
  const docId = slug(joinKey);
  
  const cacheKey = `item:${vendorId}:${docId}`;
  if (getFromCache(cacheKey)) return getFromCache(cacheKey);

  try {
    const docRef = doc(db, 'priceLists', vendorId, 'items', docId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return setInCache(cacheKey, docSnap.data());
    } else {
      return null;
    }
  } catch (e) {
    console.error("Error fetching final item:", { vendorId, docId }, e);
    return null;
  }
}

/**
 * Step 5: Get prices from ALL vendors for ONE item
 */
export async function getPricesForItem(itemData) {
  if (!itemData || !itemData.vendorIds || !itemData.familyDisplay || !itemData.sizeDisplay) {
    return [];
  }
  
  const { vendorIds, familyDisplay, sizeDisplay } = itemData;
  
  const pricePromises = vendorIds.map(async (vendorId) => {
    try {
      const vendorInfo = getFromCache(`vendor:${vendorId}`) || (await getVendorsForIds([vendorId]))[0];
      
      const itemPriceDoc = await getFinalItem({
        familyLabel: familyDisplay,
        sizeLabel: sizeDisplay,
        vendorId: vendorId
      });

      // Return the full document, which includes the URL
      return {
        vendorName: vendorInfo?.label || vendorId,
        ...(itemPriceDoc || { basePrice: 'N/A', unit: 'N/A' })
      };
    } catch (e) {
      console.error(`Error getting price for ${vendorId}:`, e);
      return null;
    }
  });

  const prices = (await Promise.all(pricePromises)).filter(Boolean);
  return prices;
}


/**
 * --- NEW: Step 6: Update an item's price ---
 * This function is called from the UI
 * @param {object} updatedItem - The full item object with new values from the modal
 */
export async function updateItemPrice(updatedItem) {
  if (!updatedItem || !updatedItem.vendorId || !updatedItem.joinKey) {
    throw new Error("Invalid item data provided for update.");
  }

  const { vendorId, joinKey, familySlug, sizeSlug } = updatedItem;
  const docId = slug(joinKey);
  const cacheKey = `item:${vendorId}:${docId}`;

  try {
    const itemRef = doc(db, 'priceLists', vendorId, 'items', docId);
    const docSnap = await itemRef.get();

    if (docSnap.exists()) {
      const oldData = docSnap.data();

      // Check if price changed to create a history entry
      if (oldData.basePrice !== updatedItem.basePrice) {
        console.log(`Archiving old price for ${docId}: ${oldData.basePrice}`);
        const historyEntry = {
          basePrice: oldData.basePrice,
          markupPct: oldData.markupPct,
          priceWithMarkup: oldData.priceWithMarkup,
          updatedAt: oldData.updatedAt || serverTimestamp(), // Use old timestamp
          source: oldData.source || 'manual-update'
        };
        // Save old data to history sub-collection
        await addDoc(collection(itemRef, 'priceHistory'), historyEntry);
      }
    }

    // Set/overwrite the main item doc with NEW data + server timestamp
    await setDoc(itemRef, {
      ...updatedItem,
      updatedAt: serverTimestamp()
    }, { merge: true });

    // Clear the cache for this item so it re-fetches
    cache.delete(cacheKey);
    console.log(`Price updated for ${docId} and cache cleared.`);
    
  } catch (e) {
    console.error("Error in updateItemPrice:", e);
    throw e; // Re-throw error so the modal can catch it
  }
}