// scripts/copy-firestore.js
// Copies ALL Firestore data (collections + subcollections) from one project to another.
//
// Each side can be EITHER a service-account key file (.json) OR a plain project ID.
// With a project ID it uses your own Google login (Application Default Credentials):
//   gcloud auth application-default login
//
// Usage:
//   node scripts/copy-firestore.js <source> <target> [--dry-run]
// Example (no keys needed):
//   node scripts/copy-firestore.js inventory-estimator estimator-12345 --dry-run

const admin = require("firebase-admin");
const path = require("path");

const [, , srcArg, dstArg, flag] = process.argv;
const DRY_RUN = flag === "--dry-run";
if (!srcArg || !dstArg) {
  console.error("Usage: node scripts/copy-firestore.js <source key.json | projectId> <target key.json | projectId> [--dry-run]");
  process.exit(1);
}

function initApp(arg, name) {
  if (arg.toLowerCase().endsWith(".json")) {
    const key = require(path.resolve(arg));
    const app = admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id }, name);
    return { app, projectId: key.project_id };
  }
  const app = admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: arg }, name);
  return { app, projectId: arg };
}

const S = initApp(srcArg, "src");
const D = initApp(dstArg, "dst");
const src = S.app.firestore();
const dst = D.app.firestore();
const srcKey = { project_id: S.projectId };
const dstKey = { project_id: D.projectId };

console.log(`Source: ${srcKey.project_id}  →  Target: ${dstKey.project_id}${DRY_RUN ? "  (DRY RUN)" : ""}`);
if (srcKey.project_id === dstKey.project_id) {
  console.error("Source and target are the same project. Aborting.");
  process.exit(1);
}

// Rewrite DocumentReferences so they point to the target project
function remap(value) {
  if (value instanceof admin.firestore.DocumentReference) return dst.doc(value.path);
  if (Array.isArray(value)) return value.map(remap);
  if (value && typeof value === "object" && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v)]));
  }
  return value; // Timestamps, GeoPoints, primitives are kept as-is
}

let batch = dst.batch();
let pending = 0;
let total = 0;

async function flush() {
  if (pending === 0) return;
  if (!DRY_RUN) await batch.commit();
  batch = dst.batch();
  pending = 0;
}

async function copyCollection(colRef) {
  const snap = await colRef.get();
  for (const doc of snap.docs) {
    if (!DRY_RUN) batch.set(dst.doc(doc.ref.path), remap(doc.data()));
    pending++;
    total++;
    if (pending >= 400) {
      await flush();
      console.log(`  ...${total} docs`);
    }
  }
  // Subcollections (also under docs that only exist as "parents")
  const refs = await colRef.listDocuments();
  for (const ref of refs) {
    for (const sub of await ref.listCollections()) {
      await copyCollection(sub);
    }
  }
}

(async () => {
  const roots = await src.listCollections();
  for (const col of roots) {
    console.log(`Copying /${col.id} ...`);
    await copyCollection(col);
  }
  await flush();
  console.log(`Done. ${total} documents ${DRY_RUN ? "would be" : "were"} copied.`);
  process.exit(0);
})().catch((err) => {
  console.error("Copy failed:", err);
  process.exit(1);
});
