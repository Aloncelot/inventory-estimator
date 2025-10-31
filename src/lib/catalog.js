// src/lib/catalog.js
import { collection, getDocs, query, where, doc, getDoc, documentId } from 'firebase/firestore';
import { db } from './firebase'; // Make sure this path is correct

// Helper function (copied from your import-prices.js)
function slug(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase();
}

/**
 * Step 1: Get all families
 * @returns {Array<{ value: string, label: string }>}
 */
export async function getFamilies() {
  try {
    const snapshot = await getDocs(query(collection(db, 'families')));
    return snapshot.docs.map(doc => ({
      value: doc.id,
      label: doc.data().label,
    }));
  } catch (e) {
    console.error("Error fetching families:", e);
    return [];
  }
}

/**
 * Step 2: Get all sizes for a given family
 * @param {string} familySlug
 * @returns {Array<{ value: string, label: string, vendorIds: string[] }>}
 */
export async function getSizesForFamily(familySlug) {
  if (!familySlug) return [];
  try {
    const q = query(collection(db, 'itemVendorLookup'), where('familySlug', '==', familySlug));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        value: doc.id, // This is the itemLookupId (e.g., 'spf-2_2x6-8')
        label: data.sizeDisplay, // The pretty name (e.g., '2x6"-8'')
        vendorIds: data.vendorIds || [],
      };
    });
  } catch (e) {
    console.error("Error fetching sizes for family:", familySlug, e);
    return [];
  }
}

/**
 * Step 3: Get vendor details from a list of IDs
 * @param {string[]} vendorIds
 * @returns {Array<{ value: string, label: string }>}
 */
export async function getVendorsForIds(vendorIds) {
  if (!vendorIds || vendorIds.length === 0) return [];
  try {
    const q = query(collection(db, 'priceLists'), where(documentId(), 'in', vendorIds));
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      value: doc.id,
      label: doc.data().displayName,
    }));
  } catch (e) {
    // This can fail if vendorIds is empty, handle gracefully
    if (e.code === 'invalid-argument') {
      console.warn("getVendorsForIds: No vendor IDs provided or empty array.");
      return [];
    }
    console.error("Error fetching vendors for IDs:", vendorIds, e);
    return [];
  }
}

/**
 * Step 4: Get the final, priced item from the vendor's list
 * @param {{ familyLabel: string, sizeLabel: string, vendorId: string }}
 * @returns {object | null} The full item document
 */
export async function getFinalItem({ familyLabel, sizeLabel, vendorId }) {
  if (!familyLabel || !sizeLabel || !vendorId) return null;

  const joinKey = `${familyLabel}|${sizeLabel}`;
  const docId = slug(joinKey);

  try {
    const docRef = doc(db, 'priceLists', vendorId, 'items', docId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
  } catch (e) {
    console.error("Error fetching final item:", { vendorId, docId }, e);
    return null;
  }
}