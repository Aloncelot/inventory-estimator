// src/lib/noteImages.js
// Images attached to row notes (screenshots of plan details).
// Each image is its own Firestore document under artifacts/{uid}/noteImages,
// so the project document stays small; the note keeps only { id, name }.
// Images are resized/compressed in the browser to stay under Firestore's
// 1 MB document limit (no Firebase Storage bucket needed).
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

const MAX_SIDE = 2000;          // px, longest side
const MAX_BYTES = 900 * 1024;   // keep well under the 1 MB document limit

const cache = new Map();        // id → Promise<dataUrl>

const newId = () => `img-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function loadBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This file is not an image the browser can open.')); };
    img.src = url;
  });
}

/** Resize + compress until the data URL fits in one Firestore document. */
export async function compressImage(file) {
  const img = await loadBitmap(file);
  let scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  // screenshots of plans are mostly line work: WebP keeps lines crisp at small sizes
  const type = 'image/webp';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.9, 0.8, 0.7, 0.6]) {
      const dataUrl = canvas.toDataURL(type, q);
      if (dataUrl.length <= MAX_BYTES) return { dataUrl, width: canvas.width, height: canvas.height };
    }
    scale *= 0.75;
  }
  throw new Error('Image is too large even after compressing.');
}

/** Compress and save an image file; returns { id, name } for the note. */
export async function saveNoteImage(uid, file) {
  if (!uid) throw new Error('Sign in to attach images.');
  const { dataUrl, width, height } = await compressImage(file);
  const id = newId();
  const name = file.name && file.name !== 'image.png' ? file.name : `Screenshot ${new Date().toLocaleString('en-US')}`;
  await setDoc(doc(db, `artifacts/${uid}/noteImages/${id}`), { dataUrl, name, width, height, createdAt: Timestamp.now() });
  cache.set(id, Promise.resolve(dataUrl));
  return { id, name };
}

export function loadNoteImage(uid, id) {
  if (!uid || !id) return Promise.resolve(null);
  if (!cache.has(id)) {
    const p = getDoc(doc(db, `artifacts/${uid}/noteImages/${id}`))
      .then((snap) => (snap.exists() ? snap.data().dataUrl : null))
      .catch((e) => { cache.delete(id); throw e; });
    cache.set(id, p);
  }
  return cache.get(id);
}

/** First image file in a paste / drop event (screenshots arrive as clipboard files). */
export function imageFromDataTransfer(dt) {
  if (!dt) return null;
  for (const item of dt.items || []) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
  }
  for (const f of dt.files || []) if (f.type.startsWith('image/')) return f;
  return null;
}

/** Read an image straight from the system clipboard (button click). */
export async function imageFromClipboard() {
  if (!navigator.clipboard?.read) throw new Error('Press Ctrl+V inside the note to paste the image.');
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (type) {
      const blob = await item.getType(type);
      return new File([blob], 'image.png', { type });
    }
  }
  throw new Error('There is no image in the clipboard.');
}
