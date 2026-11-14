// src/lib/inventory.js
// Inventory in Firestore:
//   companies/{cid}/stock/{itemKey}      counts per warehouse, min, average cost
//   companies/{cid}/movements/{id}       every change, never edited: who, when, what
// A movement and its stock change are written in one transaction, so the
// counts always match the movement log.
import {
  collection, doc, getDoc, getDocs, query, orderBy, limit, where, runTransaction, writeBatch, updateDoc, deleteDoc, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { slug, catalogPath, getFinalItem, updateItemPrice } from './catalog';
import { actorOf } from '@/domain/team';
import { applyMovement, validateMovement, sampleStock, itemKeyOf, needsReorder } from '@/domain/inventory';
import { orderStatus, poNumber } from '@/domain/reserve';

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
        // every supplier's offer, for purchase orders
        const offer = {
          vendorId: x.vendorId || v.id, vendorName: x.supplierName || v.data().displayName || v.id,
          basePrice: cost, buyUnit: x.buyUnit || 'each', pcsPerBundle: x.pcsPerBundle || null, buyPrice: x.buyPrice ?? null,
        };
        const prev = items.get(key);
        if (!prev) items.set(key, { itemKey: key, family, size, unit: x.unit || 'pcs', materialType: x.materialType || '', cost, offers: [offer] });
        else {
          prev.offers.push(offer);
          if (cost && (!prev.cost || cost < prev.cost)) prev.cost = cost;
        }
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
  // issuing to a project counts against its reservation; a receipt against an order fills its line
  const resRef = mv.type === 'out' && mv.projectId ? doc(db, `${base(cid)}/reservations/${mv.projectId}`) : null;
  const poRef = mv.type === 'in' && mv.poId ? doc(db, `${base(cid)}/purchaseOrders/${mv.poId}`) : null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(stockRef);
    const resSnap = resRef ? await tx.get(resRef) : null;
    const poSnap = poRef ? await tx.get(poRef) : null;
    const stock = snap.exists() ? snap.data() : { qty: {}, minQty: 0, avgCost: null };
    const move = { ...mv, itemKey: item.itemKey, qty: Number(mv.qty) };
    const err = validateMovement(move, stock, warehouses);
    if (err) throw new Error(err);
    const { stock: next, delta } = applyMovement(stock, move);
    const at = Timestamp.now();
    // belowMin: at or under its minimum (the menu counts these to warn)
    tx.set(stockRef, { ...next, ...describe(item), itemKey: item.itemKey, belowMin: needsReorder(next), updatedAt: at, updatedBy: by });
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
      ...(poRef ? { poId: move.poId, poNumber: move.poNumber || '' } : {}),
      after: next.qty,
      by,
      at,
    });
    if (resSnap?.exists() && resSnap.data().items?.[item.itemKey]) {
      const it = resSnap.data().items[item.itemKey];
      const items = { ...resSnap.data().items, [item.itemKey]: { ...it, issued: (Number(it.issued) || 0) + move.qty } };
      tx.update(resRef, { items, updatedAt: at, updatedBy: by });
    }
    if (poSnap?.exists()) {
      const po = poSnap.data();
      const lines = (po.lines || []).map((l, i) => (i === Number(move.poLine) ? { ...l, received: (Number(l.received) || 0) + move.qty } : l));
      tx.update(poRef, { lines, status: orderStatus({ ...po, lines }), updatedAt: at, updatedBy: by });
    }
  });
  return moveRef.id;
}

export async function setMinQty(cid, itemKey, minQty, user) {
  const ref = doc(db, `${base(cid)}/stock/${itemKey}`);
  const min = Math.max(0, Math.round(Number(minQty) || 0));
  const snap = await getDoc(ref);
  await updateDoc(ref, {
    minQty: min, belowMin: needsReorder({ ...(snap.data() || {}), minQty: min }), updatedAt: Timestamp.now(), updatedBy: actorOf(user),
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
      itemKey: item.itemKey, ...describe(item), qty, onHand: total, minQty, belowMin: needsReorder({ qty, minQty }),
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

/* ── reservations (what each project needs from the warehouse) ───────── */

export async function listReservations(cid) {
  const snap = await getDocs(collection(db, `${base(cid)}/reservations`));
  return snap.docs.map((d) => ({ projectId: d.id, ...d.data() }));
}

/** The saved estimate of a project (to read its takeoff). */
export async function loadProjectEstimate(cid, projectId) {
  const snap = await getDoc(doc(db, `${base(cid)}/projects/${projectId}`));
  if (!snap.exists()) throw new Error('That project no longer exists.');
  const d = snap.data();
  return { name: d.name || '', estimate: d.estimateData || {} };
}

/**
 * Reserve (or update) what a project needs: { itemKey: { qty, family, size, unit } }.
 * What was already issued to it, and its place in line, are kept.
 */
export async function saveReservation(cid, { projectId, projectName, items }, user) {
  const ref = doc(db, `${base(cid)}/reservations/${projectId}`);
  const by = actorOf(user);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists() ? snap.data() : null;
    const merged = {};
    for (const [k, it] of Object.entries(items)) merged[k] = { ...it, issued: Number(prev?.items?.[k]?.issued) || 0 };
    // items no longer in the takeoff but already issued stay, so the count is not lost
    for (const [k, it] of Object.entries(prev?.items || {})) if (!merged[k] && Number(it.issued) > 0) merged[k] = { ...it, qty: Number(it.issued) };
    const at = Timestamp.now();
    tx.set(ref, {
      projectId, projectName: projectName || '', items: merged,
      createdAt: prev?.createdAt || at, createdBy: prev?.createdBy || by, updatedAt: at, updatedBy: by,
    });
  });
}

export async function releaseReservation(cid, projectId) {
  await deleteDoc(doc(db, `${base(cid)}/reservations/${projectId}`));
}

/* ── purchase orders ─────────────────────────────────────────────────── */

export async function listOrders(cid) {
  const snap = await getDocs(query(collection(db, `${base(cid)}/purchaseOrders`), orderBy('createdAt', 'desc'), limit(200)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Create one order per draft, numbered PO-0001, PO-0002… for the company. */
export async function createOrders(cid, drafts, { warehouseId, note = '', projects = [] }, user) {
  const by = actorOf(user);
  const counter = doc(db, `${base(cid)}/counters/purchaseOrders`);
  const refs = drafts.map(() => doc(collection(db, `${base(cid)}/purchaseOrders`)));
  const numbers = [];
  await runTransaction(db, async (tx) => {
    const c = await tx.get(counter);
    let next = c.exists() ? Number(c.data().next) || 1 : 1;
    const at = Timestamp.now();
    drafts.forEach((d, i) => {
      const number = poNumber(next);
      numbers.push(number);
      next += 1;
      tx.set(refs[i], {
        number, vendorId: d.vendorId, vendorName: d.vendorName, lines: d.lines, total: d.total,
        warehouseId: warehouseId || null, note, projects, status: 'open',
        createdAt: at, createdBy: by, updatedAt: at, updatedBy: by,
      });
    });
    tx.set(counter, { next });
  });
  return numbers;
}

export async function cancelOrder(cid, poId, user) {
  await updateDoc(doc(db, `${base(cid)}/purchaseOrders/${poId}`), { status: 'cancelled', updatedAt: Timestamp.now(), updatedBy: actorOf(user) });
}

/**
 * Stock saved before the minimum warning existed: mark the items at or under
 * their minimum (belowMin), so the menu can count them. Writes only what is off.
 */
export async function syncBelowMin(cid, stocks, user) {
  const off = stocks.filter((s) => Boolean(s.belowMin) !== needsReorder(s));
  if (!off.length) return 0;
  const by = actorOf(user); const at = Timestamp.now();
  for (let i = 0; i < off.length; i += 400) {
    const batch = writeBatch(db);
    for (const s of off.slice(i, i + 400)) batch.update(doc(db, `${base(cid)}/stock/${s.itemKey}`), { belowMin: needsReorder(s), updatedBy: by, updatedAt: at });
    await batch.commit();
  }
  return off.length;
}
