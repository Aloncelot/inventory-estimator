// src/lib/company.js
// Companies, members, invitations and project history in Firestore.
//
//   users/{uid}                          { companyId, email }
//   companies/{cid}                      { name, inventoryEnabled, warehouses[], createdBy }
//   companies/{cid}/members/{uid}        { uid, email, name, roles[] }
//   companies/{cid}/invites/{email}      { email, companyId, companyName, roles[] }
//   companies/{cid}/projects/{pid}       the estimate, with updatedBy / updatedAt
//   companies/{cid}/projects/{pid}/history/{id}   { by, at, startedAt, sections[] }
//   companies/{cid}/laborTemplates | headerSchedules | noteImages
// The security rules (firestore.rules) enforce the roles; the app only mirrors them.
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, collectionGroup,
  query, where, orderBy, limit, writeBatch, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { normalizeRoles, normEmail, actorOf } from '@/domain/team';

export const companyBase = (cid) => (cid ? `companies/${cid}` : null);

/** Where the signed-in user belongs: a company, a pending invitation or nothing. */
export async function findMembership(user) {
  const email = normEmail(user.email);
  const me = await getDoc(doc(db, 'users', user.uid)).catch(() => null);
  const cid = me?.exists() ? me.data().companyId : null;
  if (cid) {
    const m = await getDoc(doc(db, `companies/${cid}/members/${user.uid}`)).catch(() => null);
    if (m?.exists()) return { status: 'member', companyId: cid };
  }
  // a missing index (first deploy) or no invitation both mean: nothing to join
  const inv = await getDocs(query(collectionGroup(db, 'invites'), where('email', '==', email), limit(5)))
    .catch((e) => { console.warn('Invitations could not be read:', e); return null; });
  if (inv && !inv.empty) return { status: 'invited', invites: inv.docs.map((d) => d.data()) };
  return { status: 'none' };
}

/** Join the company that invited this user, with the roles of the invitation. */
export async function acceptInvite(user, invite) {
  const cid = invite.companyId;
  const b = writeBatch(db);
  b.set(doc(db, `companies/${cid}/members/${user.uid}`), {
    uid: user.uid,
    email: normEmail(user.email),
    name: user.displayName || normEmail(user.email),
    roles: invite.roles,
    addedBy: invite.invitedBy || null,
    addedAt: Timestamp.now(),
  });
  b.set(doc(db, 'users', user.uid), { companyId: cid, email: normEmail(user.email), updatedAt: Timestamp.now() });
  b.delete(doc(db, `companies/${cid}/invites/${normEmail(user.email)}`));
  await b.commit();
  return cid;
}

export async function declineInvite(user, invite) {
  await deleteDoc(doc(db, `companies/${invite.companyId}/invites/${normEmail(user.email)}`));
}

/** A new company; its founder holds every role. */
export async function createCompany(user, name, { inventoryEnabled = true } = {}) {
  const ref = doc(collection(db, 'companies'));
  const now = Timestamp.now();
  const actor = actorOf(user);
  const b = writeBatch(db);
  b.set(ref, {
    name: String(name || '').trim() || 'My company',
    createdBy: user.uid,
    createdAt: now,
    inventoryEnabled: Boolean(inventoryEnabled),
    warehouses: inventoryEnabled ? [{ id: 'wh-main', name: 'Main warehouse', address: '' }] : [],
    updatedBy: actor,
    updatedAt: now,
  });
  b.set(doc(db, `companies/${ref.id}/members/${user.uid}`), {
    uid: user.uid, email: actor.email, name: actor.name,
    roles: ['admin', 'estimator', 'warehouse'], addedBy: actor, addedAt: now,
  });
  b.set(doc(db, 'users', user.uid), { companyId: ref.id, email: actor.email, updatedAt: now });
  await b.commit();
  return ref.id;
}

const LEGACY = ['projects', 'laborTemplates', 'headerSchedules', 'noteImages'];

/** How many documents the user still has in the old personal workspace. */
export async function legacyCounts(uid) {
  const out = {};
  for (const c of LEGACY) {
    try { out[c] = (await getDocs(collection(db, `artifacts/${uid}/${c}`))).size; } catch { out[c] = 0; }
  }
  return out;
}

/**
 * Copy the old personal workspace (artifacts/{uid}) into the company. Same
 * document ids, so running it twice changes nothing; a project already in the
 * company is never overwritten.
 */
export async function importLegacy(user, cid, onProgress) {
  const base = companyBase(cid);
  const actor = actorOf(user);
  const done = {};
  for (const c of LEGACY) {
    let snap;
    try { snap = await getDocs(collection(db, `artifacts/${user.uid}/${c}`)); } catch { done[c] = 0; continue; }
    done[c] = 0;
    for (const d of snap.docs) {
      const target = doc(db, `${base}/${c}/${d.id}`);
      if ((await getDoc(target)).exists()) continue;
      const data = d.data();
      const extra = c === 'projects'
        ? { updatedBy: actor, createdBy: data.createdBy || actor, importedFrom: `artifacts/${user.uid}/projects/${d.id}`, importedAt: Timestamp.now() }
        : {};
      await setDoc(target, { ...data, ...extra });
      done[c] += 1;
      onProgress?.({ ...done });
    }
  }
  return done;
}

/* ── company settings and members (admin) ───────────────────────────── */

export async function updateCompany(cid, patch, user) {
  await updateDoc(doc(db, 'companies', cid), { ...patch, updatedBy: actorOf(user), updatedAt: Timestamp.now() });
}

export async function listMembers(cid) {
  const snap = await getDocs(collection(db, `companies/${cid}/members`));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export async function setMemberRoles(cid, uid, roles, user) {
  await updateDoc(doc(db, `companies/${cid}/members/${uid}`), {
    roles: normalizeRoles(roles), updatedBy: actorOf(user), updatedAt: Timestamp.now(),
  });
}

export const removeMember = (cid, uid) => deleteDoc(doc(db, `companies/${cid}/members/${uid}`));

export async function listInvites(cid) {
  const snap = await getDocs(collection(db, `companies/${cid}/invites`));
  return snap.docs.map((d) => d.data()).sort((a, b) => a.email.localeCompare(b.email));
}

export async function inviteMember(cid, companyName, email, roles, user) {
  const e = normEmail(email);
  await setDoc(doc(db, `companies/${cid}/invites/${e}`), {
    email: e, companyId: cid, companyName: companyName || '', roles: normalizeRoles(roles),
    invitedBy: actorOf(user), invitedAt: Timestamp.now(),
  });
}

export const cancelInvite = (cid, email) => deleteDoc(doc(db, `companies/${cid}/invites/${normEmail(email)}`));

/* ── project history ────────────────────────────────────────────────── */

export async function addHistory(projectPath, entry) {
  const ref = await addDoc(collection(db, `${projectPath}/history`), entry);
  return ref.id;
}

export const updateHistory = (projectPath, id, patch) => updateDoc(doc(db, `${projectPath}/history/${id}`), patch);

export async function listHistory(projectPath, n = 100) {
  const snap = await getDocs(query(collection(db, `${projectPath}/history`), orderBy('at', 'desc'), limit(n)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
