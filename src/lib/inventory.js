// src/lib/inventory.js
// Inventory in Firestore:
//   companies/{cid}/stock/{itemKey}      counts per warehouse, min, average cost
//   companies/{cid}/movements/{id}       every change, never edited: who, when, what
// A movement and its stock change are written in one transaction, so the
// counts always match the movement log.
import {
  collection, doc, getDoc, getDocs, query, orderBy, limit, where, runTransaction, writeBatch, updateDoc, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { slug, catalogPath, getFinalItem, updateItemPrice } from './catalog';
import { actorOf } from '@/domain/team';
import { applyMovement, validateMovement, sampleStock, itemKeyOf } from '@/domain/inventory';

const base = (cid) => `companies/${cid}`;

let catalogPromise = null;
/**
 * Every material in the price lists, once per item (any vendor): name, unit,
 * type and the lowest supplier price, which the sample stock uses as its cost.
 */
let catalogFor = null;
export function loadCatalogItems({ fresh = false } = {}) {
  if (catalogPromise && !fresh && catalogFor === catalogPath('priceLists')) return catalogPromise;
  catalogFor = catalogPath('priceLists');
  catalogPromise = (async () => {
    const vendors = await getDocs(collection(db, catalogPath('priceLists')));
    const items = new Map();
    for (const v of vendors.docs) {
      const snap = await getDocs(collection(db, `${catalogPath('priceLists')}/${v.id}/items`));
      for (const d of snap.docs) {
        const x = d.data();
        const family = x.familyDisplay || '';
        const size = x.sizeDisplay || '';
        if (!family || !size) continue;
        const key = itemKeyOf(x.familySlug || slug(family), x.sizeSlug || slug(size));
        const cost = Number(x.basePrice) || null;
        const prev = items.get(key);
        if (!prev) items.set(key, { itemKey: key, family, size, unit: x.unit || 'pcs', materialType: x.materialType || '', cost });
        else if (cost && (!prev.cost || cost < prev.cost)) prev.cost = cost;
      }
    }
    return [...items.values()].sort((a, b) => a.family.localeCompare(b.family) || a.size.localeCompare(b.size, undefined, { numeric: true }));
  })().catch((e) => { catalogPromise = null; throw e; });
  return catalogPromise;
}

export async function listStock(cid) {
  const snap = await getDocs(collection(db, `${base(cid)}/stock`));
  return snap.docs.map((d) => ({ itemKey: d.id, ...d.data() }));
}

export async function listMovements(cid, { itemKey, max = 200 } = {}) {
  const col = collection(db, `${base(cid)}/movements`);
  const q = itemKey
    ? query(col, where('itemKey', '==', itemKey), orderBy('at', 'desc'), limit(max))
    : query(col, orderBy('at', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

const describe = (item) => ({
  family: item.family || '', size: item.size || '', unit: item.unit || 'pcs', materialType: item.materialType || '',
});

/**
 * Record one movement. `item` names the material ({ itemKey, family, size,
 * unit, materialType }); the stock document is created on its first receipt.
 */
export async function recordMovement(cid, warehouses, item, mv, user) {
  const by = actorOf(user);
  const stockRef = doc(db, `${base(cid)}/stock/${item.itemKey}`);
  const moveRef = doc(collection(db, `${base(cid)}/movements`));
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(stockRef);
    const stock = snap.exists() ? snap.data() : { qty: {}, minQty: 0, avgCost: null };
    const move = { ...mv, itemKey: item.itemKey, qty: Number(mv.qty) };
    const err = validateMovement(move, stock, warehouses);
    if (err) throw new Error(err);
    const { stock: next, delta } = applyMovement(stock, move);
    const at = Timestamp.now();
    tx.set(stockRef, { ...next, ...describe(item), itemKey: item.itemKey, updatedAt: at, updatedBy: by });
    tx.set(moveRef, {
      type: move.type,
      itemKey: item.itemKey,
      ...describe(item),
      warehouseId: move.warehouseId,
      toWarehouseId: move.type === 'transfer' ? move.toWarehouseId : null,
      qty: move.qty,
      delta,
      unitCost: move.type === 'in' && move.unitCost !== '' && move.unitCost != null ? Number(move.unitCost) : null,
      ref: move.ref || '',
      projectId: move.projectId || null,
      projectName: move.projectName || '',
      note: move.note || '',
      // receipts: what the invoice said (supplier, unit, total) and how it compares with the price list
      ...(move.type === 'in' && move.purchase ? { purchase: move.purchase } : {}),
      ...(move.type === 'in' && move.priceReview ? { priceReview: move.priceReview } : {}),
      after: next.qty,
      by,
      at,
    });
  });
  return moveRef.id;
}

export async function setMinQty(cid, itemKey, minQty, user) {
  await updateDoc(doc(db, `${base(cid)}/stock/${itemKey}`), {
    minQty: Math.max(0, Math.round(Number(minQty) || 0)), updatedAt: Timestamp.now(), updatedBy: actorOf(user),
  });
}

/**
 * Fill the inventory with fictitious stock from the catalog, so the module can
 * be tried. Every sample receipt is a normal movement marked sample: true.
 */
export async function seedSampleStock(cid, warehouses, user, onProgress) {
  const items = await loadCatalogItems();
  const plan = sampleStock(items, warehouses);
  const by = actorOf(user);
  const at = Timestamp.now();
  let batch = writeBatch(db);
  let ops = 0; let done = 0;
  const flush = async () => { if (ops) { await batch.commit(); batch = writeBatch(db); ops = 0; onProgress?.(done, plan.length); } };
  for (const { item, receipts, minQty } of plan) {
    const qty = {};
    for (const r of receipts) {
      qty[r.warehouseId] = r.qty;
      batch.set(doc(collection(db, `${base(cid)}/movements`)), {
        type: 'in', itemKey: item.itemKey, ...describe(item), warehouseId: r.warehouseId, toWarehouseId: null,
        qty: r.qty, delta: { [r.warehouseId]: r.qty }, unitCost: item.cost, ref: 'Opening stock', projectId: null, projectName: '',
        note: 'Sample stock (fictitious)', after: { [r.warehouseId]: r.qty }, sample: true, by, at,
      });
      ops += 1;
    }
    const total = receipts.reduce((a, r) => a + r.qty, 0);
    batch.set(doc(db, `${base(cid)}/stock/${item.itemKey}`), {
      itemKey: item.itemKey, ...describe(item), qty, onHand: total, minQty,
      avgCost: item.cost, lastCost: item.cost, sample: true, updatedAt: at, updatedBy: by,
    });
    ops += 1; done += 1;
    if (ops >= 400) await flush();
  }
  await flush();
  return plan.length;
}

/** Remove the sample stock and its movements (an Admin, before going live). */
export async function clearSampleStock(cid, onProgress) {
  let removed = 0;
  for (const coll of ['movements', 'stock']) {
    const snap = await getDocs(query(collection(db, `${base(cid)}/${coll}`), where('sample', '==', true)));
    let batch = writeBatch(db); let ops = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref); ops += 1; removed += 1;
      if (ops >= 400) { await batch.commit(); batch = writeBatch(db); ops = 0; onProgress?.(removed); }
    }
    if (ops) await batch.commit();
  }
  return removed;
}

/** One material's stock (null when the company has none of it). */
export async function getStockItem(cid, itemKey) {
  const snap = await getDoc(doc(db, `${base(cid)}/stock/${itemKey}`));
  return snap.exists() ? { itemKey: snap.id, ...snap.data() } : null;
}

/* ── price changes seen on receipts ─────────────────────────────────── */

/** Receipts whose price moved from the price list and wait for an estimator. */
export async function listPriceReviews(cid) {
  const snap = await getDocs(query(collection(db, `${base(cid)}/movements`), where('priceReview', '==', 'open')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0));
}

/**
 * Accept the price paid as the supplier's new list price, or ignore it (a
 * one-off). Either way the receipt leaves the queue, marked with who decided.
 */
export async function resolvePriceReview(cid, move, accept, user) {
  const p = move.purchase || {};
  if (accept) {
    if (!p.vendorId) throw new Error('This receipt has no supplier from the price list.');
    const current = await getFinalItem({ familyLabel: move.family, sizeLabel: move.size, vendorId: p.vendorId });
    if (!current) throw new Error('That supplier no longer has this material in the price list.');
    const basePrice = Number(move.unitCost);
    const sameUnit = (current.buyUnit || 'each') === (p.buyUnit || 'each');
    await updateItemPrice({
      ...current,
      vendorId: p.vendorId,
      joinKey: current.joinKey || `${move.family}|${move.size}`,
      basePrice,
      ...(sameUnit && p.buyUnit !== 'each' && Number(p.buyQty) > 0 ? { buyPrice: Math.round((p.totalPaid / p.buyQty) * 100) / 100 } : {}),
      source: 'receipt',
    });
  }
  await updateDoc(doc(db, `${base(cid)}/movements/${move.id}`), {
    priceReview: accept ? 'accepted' : 'ignored', reviewedBy: actorOf(user), reviewedAt: Timestamp.now(),
  });
}
