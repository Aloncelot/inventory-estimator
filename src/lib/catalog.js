// src/lib/catalog.js
import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';

// --- Vendors -------------------------------------------------------------
export async function listVendors() {
  const snap = await getDocs(query(collection(db, 'priceLists'), orderBy('displayName')));
  return snap.docs.map(d => ({
    id: d.id,
    displayName: d.data()?.displayName || d.id,
  }));
}

// --- Families (distinct per vendor) -------------------------------------
export async function listFamilies(vendorId) {
  const itemsCol = collection(db, 'priceLists', vendorId, 'items');
  const snap = await getDocs(query(itemsCol, orderBy('familySlug'), limit(5000)));

  const seen = new Map(); // slug -> label
  snap.forEach(doc => {
    const x = doc.data() || {};
    if (x.familySlug) seen.set(x.familySlug, x.familyDisplay || x.familySlug);
  });

  const out = Array.from(seen.entries()).map(([slug, label]) => ({ slug, label }));
  out.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return out;
}

// --- Sizes for a vendor + familySlug ------------------------------------
export async function listSizes(vendorId, familySlug) {
  const q = query(
    collection(db, 'priceLists', vendorId, 'items'),
    where('familySlug', '==', familySlug)
  );
  const snap = await getDocs(q);

  const sizes = snap.docs.map(d => {
    const x = d.data() || {};
    return {
      id: d.id,
      sizeSlug: x.sizeSlug || d.id,
      sizeLabel: x.sizeDisplay || x.sizeSlug || d.id,
      unit: x.unit || '',
      supplierPrice: x.basePrice ?? null,
      markupPct: x.markupPct ?? null,
      priceWithMarkup: x.priceWithMarkup ?? null,
      raw: x,
    };
  });

  // de-dup by sizeSlug
  const by = new Map();
  for (const s of sizes) if (!by.has(s.sizeSlug)) by.set(s.sizeSlug, s);

  return Array.from(by.values()).sort(
    (a, b) => a.sizeLabel.localeCompare(b.sizeLabel, undefined, { numeric: true })
  );
}

// --- Aliases to match ItemPicker imports --------------------------------
export const loadVendorFamilies = listFamilies;
export const loadVendorSizes = listSizes;
