// src/lib/planFiles.js
// The plan PDFs. Each one lives in Cloud Storage under the company
// (companies/{cid}/plans/{projectId}/{levelId}[/struct].pdf), so everyone on
// the team sees the plans of a project, and in this browser (IndexedDB) as a
// cache, so a plan opens at once the second time and still works offline.
// Without Cloud Storage (the Spark plan, or no bucket yet) the PDFs stay in
// this browser only, as before.
'use client';

import { ref, uploadBytes, getBlob } from 'firebase/storage';
import { storage } from './firebase';

const DB = 'inventory-estimator-plans';
const STORE = 'files';
export const MAX_PLAN_MB = 50;

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB is not available')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
const putLocal = (key, blob) => run('readwrite', (s) => s.put(blob, key));
const getLocal = (key) => run('readonly', (s) => s.get(key)).catch(() => undefined);

// the company's folder, set when the company is ready (CompanyContext)
let base = null;
export function setPlanBase(b) { base = b || null; }

/** projectId:levelId[:struct] → companies/{cid}/plans/projectId/levelId[/struct].pdf */
export const storagePathOf = (key, b = base) => (b ? `${b}/plans/${String(key).split(':').map((x) => x.replace(/[^\w-]/g, '_')).join('/')}.pdf` : null);

/**
 * Keep a plan: in this browser now, and in Cloud Storage for the team.
 * @returns {{ cloud: boolean, error?: string }}
 */
export async function savePlanFile(key, blob) {
  await putLocal(key, blob);
  const path = storagePathOf(key);
  if (!path) return { cloud: false };
  if (blob.size > MAX_PLAN_MB * 1024 * 1024) return { cloud: false, error: `Over ${MAX_PLAN_MB} MB: kept on this computer only.` };
  try {
    await uploadBytes(ref(storage, path), blob, { contentType: 'application/pdf' });
    return { cloud: true };
  } catch (e) {
    console.warn('Plan not uploaded (kept in this browser):', e?.code || e);
    return { cloud: false, error: e?.code || String(e) };
  }
}

/** A plan from this browser, or else from Cloud Storage (then kept here too). */
export async function loadPlanFile(key) {
  const local = await getLocal(key);
  if (local) return local;
  const path = storagePathOf(key);
  if (!path) return undefined;
  try {
    const blob = await getBlob(ref(storage, path));
    putLocal(key, blob).catch(() => {});
    return blob;
  } catch {
    return undefined;   // not uploaded (attached before, on another computer) or no Storage
  }
}
