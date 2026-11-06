// src/lib/headerTemplates.js
// Header schedule templates of the company: kept apart from
// the projects so every new project can start from one. One document each
// under companies/{cid}/headerSchedules.
import { collection, doc, getDocs, setDoc, addDoc, deleteDoc, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

// uid here is the company's base path (companies/{cid})
const path = (uid) => `${uid}/headerSchedules`;

export async function listHeaderTemplates(uid) {
  if (!uid) return [];
  const snap = await getDocs(query(collection(db, path(uid)), orderBy('name')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Save a template; with id it is replaced, without a new one is made. Returns its id. */
export async function saveHeaderTemplate(uid, tpl, id) {
  if (!uid) throw new Error('Sign in to keep templates.');
  const data = { name: tpl.name, rows: tpl.rows, updatedAt: Timestamp.now() };
  if (id) { await setDoc(doc(db, path(uid), id), data); return id; }
  const ref = await addDoc(collection(db, path(uid)), data);
  return ref.id;
}

export const deleteHeaderTemplate = (uid, id) => deleteDoc(doc(db, path(uid), id));
