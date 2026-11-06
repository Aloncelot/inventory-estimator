// src/lib/laborTemplates.js
// Labor templates of the company: crew, rates, production
// times and level factors, so every project starts from the company's own.
// One document each under companies/{cid}/laborTemplates.
import { collection, doc, getDocs, setDoc, addDoc, deleteDoc, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

// uid here is the company's base path (companies/{cid})
const path = (uid) => `${uid}/laborTemplates`;

export async function listLaborTemplates(uid) {
  if (!uid) return [];
  const snap = await getDocs(query(collection(db, path(uid)), orderBy('name')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Save a template; with id it is replaced, without a new one is made. Returns its id. */
export async function saveLaborTemplate(uid, tpl, id) {
  if (!uid) throw new Error('Sign in to keep templates.');
  const data = { ...tpl, updatedAt: Timestamp.now() };
  if (id) { await setDoc(doc(db, path(uid), id), data); return id; }
  const ref = await addDoc(collection(db, path(uid)), data);
  return ref.id;
}

export const deleteLaborTemplate = (uid, id) => deleteDoc(doc(db, path(uid), id));
