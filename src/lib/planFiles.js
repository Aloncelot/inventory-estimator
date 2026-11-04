// src/lib/planFiles.js
// The plan PDFs themselves stay in this browser (IndexedDB): they are too big
// for the project document. The project only keeps the walls found on them, so
// estimates work anywhere; re-attach the PDF on another computer to see it.
'use client';

const DB = 'inventory-estimator-plans';
const STORE = 'files';

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

export const savePlanFile = (key, blob) => run('readwrite', (s) => s.put(blob, key));
export const loadPlanFile = (key) => run('readonly', (s) => s.get(key)).catch(() => undefined);
