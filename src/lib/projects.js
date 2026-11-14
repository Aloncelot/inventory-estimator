// src/lib/projects.js
// Project information, clients, revisions and change orders in Firestore:
//   companies/{cid}/projects/{pid}.meta          status, due date, client, who it was sent to,
//                                                the contract (revision and total), counters
//   companies/{cid}/projects/{pid}/revisions/{id} frozen copies of the estimate (Rev 0 = bid)
//   companies/{cid}/changeOrders/{id}            requests to move the contract to a new revision;
//                                                an Admin approves or rejects them
//   companies/{cid}/clients/{id}                 the company's clients
// The project's estimate is saved without touching meta, so editing the
// project and its information never overwrite each other.
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, query, where, orderBy, runTransaction, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { actorOf } from '@/domain/team';
import { coNumber } from '@/domain/revisions';

const base = (cid) => `companies/${cid}`;
const projectRef = (cid, pid) => doc(db, `${base(cid)}/projects/${pid}`);
const stamp = (user) => ({ updatedBy: actorOf(user), updatedAt: Timestamp.now() });

/** Change some fields of a project's information; returns the whole new meta. */
export async function updateProjectMeta(cid, pid, patch, user) {
  const ref = projectRef(cid, pid);
  const dotted = Object.fromEntries(Object.entries(patch).map(([k, v]) => [`meta.${k}`, v === undefined ? null : v]));
  await updateDoc(ref, { ...dotted, ...stamp(user) });
  const snap = await getDoc(ref);
  return snap.data()?.meta || {};
}

export async function getProjectMeta(cid, pid) {
  const snap = await getDoc(projectRef(cid, pid));
  return snap.data()?.meta || {};
}

/* ── clients ────────────────────────────────────────────────────────── */

export async function listClients(cid) {
  const snap = await getDocs(collection(db, `${base(cid)}/clients`));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export async function addClient(cid, { name, contact = '', email = '', phone = '' }, user) {
  const ref = await addDoc(collection(db, `${base(cid)}/clients`), {
    name: name.trim(), contact: contact.trim(), email: email.trim(), phone: phone.trim(), createdBy: actorOf(user), createdAt: Timestamp.now(),
  });
  return { id: ref.id, name: name.trim(), contact, email, phone };
}

/* ── revisions ──────────────────────────────────────────────────────── */

export async function listRevisions(cid, pid) {
  const snap = await getDocs(query(collection(db, `${base(cid)}/projects/${pid}/revisions`), orderBy('number', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Freeze the estimate as the next revision. Rev 0 becomes the contract
 * straight away (it is the bid); later revisions reach the contract through
 * an approved change order. Returns { id, number, meta }.
 */
export async function saveRevision(cid, pid, { estimate, totals, label = '', note = '' }, user) {
  const pRef = projectRef(cid, pid);
  const rRef = doc(collection(db, `${base(cid)}/projects/${pid}/revisions`));
  const by = actorOf(user);
  let number = 0; let meta = {};
  await runTransaction(db, async (tx) => {
    const p = await tx.get(pRef);
    const m = p.data()?.meta || {};
    number = Number.isInteger(m.revisionCount) ? m.revisionCount : 0;
    const at = Timestamp.now();
    tx.set(rRef, {
      number, label: label.trim(), note: note.trim(), drawingsDate: estimate?.summaryInfo?.drawingsDate || '',
      estimateData: estimate, totals, by, at,
    });
    const contract = number === 0 ? { revisionId: rRef.id, number: 0, grandTotal: totals.grandTotal, totals, at } : m.contract || null;
    meta = { ...m, revisionCount: number + 1, lastRevision: { id: rRef.id, number, grandTotal: totals.grandTotal, at }, contract, ...(number === 0 ? { bidTotal: totals.grandTotal } : {}) };
    tx.update(pRef, {
      'meta.revisionCount': number + 1, 'meta.lastRevision': meta.lastRevision, 'meta.contract': contract,
      ...(number === 0 ? { 'meta.bidTotal': totals.grandTotal } : {}),
      updatedBy: by, updatedAt: at,
    });
  });
  return { id: rRef.id, number, meta };
}

/* ── change orders ──────────────────────────────────────────────────── */

export async function listChangeOrders(cid, { projectId, status } = {}) {
  const col = collection(db, `${base(cid)}/changeOrders`);
  const q = projectId ? query(col, where('projectId', '==', projectId)) : status ? query(col, where('status', '==', status)) : col;
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.requestedAt?.toMillis?.() || 0) - (a.requestedAt?.toMillis?.() || 0));
}

/**
 * Ask an Admin to move the contract from `fromRev` to `toRev`.
 * `compare` is compareEstimates(from, to): its categories, effects and the
 * largest material changes go with the request.
 */
export async function requestChangeOrder(cid, { projectId, projectName, fromRev, toRev, compare, message }, user) {
  const pRef = projectRef(cid, projectId);
  const coRef = doc(collection(db, `${base(cid)}/changeOrders`));
  const by = actorOf(user);
  let number = '';
  await runTransaction(db, async (tx) => {
    const p = await tx.get(pRef);
    const k = (Number(p.data()?.meta?.coCount) || 0) + 1;
    number = coNumber(k);
    const at = Timestamp.now();
    tx.set(coRef, {
      projectId, projectName: projectName || '', number,
      fromRevision: { id: fromRev.id, number: fromRev.number, grandTotal: fromRev.totals?.grandTotal ?? 0, drawingsDate: fromRev.drawingsDate || '' },
      toRevision: { id: toRev.id, number: toRev.number, grandTotal: toRev.totals?.grandTotal ?? 0, drawingsDate: toRev.drawingsDate || '', totals: toRev.totals },
      amount: compare.amount, categories: compare.categories, effects: compare.effects,
      lines: compare.lines.slice(0, 40), moreLines: Math.max(0, compare.lines.length - 40),
      message: (message || '').trim(), status: 'pending', requestedBy: by, requestedAt: at,
    });
    tx.update(pRef, { 'meta.coCount': k, updatedBy: by, updatedAt: at });
  });
  return number;
}

/**
 * An Admin's decision. Approving moves the project's contract to the change
 * order's revision.
 */
export async function decideChangeOrder(cid, co, approve, note, user) {
  const coRef = doc(db, `${base(cid)}/changeOrders/${co.id}`);
  const pRef = projectRef(cid, co.projectId);
  const by = actorOf(user);
  await runTransaction(db, async (tx) => {
    const c = await tx.get(coRef);
    if (c.data()?.status !== 'pending') throw new Error('This change order was already decided or withdrawn.');
    const at = Timestamp.now();
    tx.update(coRef, { status: approve ? 'approved' : 'rejected', decidedBy: by, decidedAt: at, decisionNote: (note || '').trim() });
    if (approve) {
      tx.update(pRef, {
        'meta.contract': { revisionId: co.toRevision.id, number: co.toRevision.number, grandTotal: co.toRevision.grandTotal, totals: co.toRevision.totals || null, at, changeOrder: co.number },
        updatedBy: by, updatedAt: at,
      });
    }
  });
}

/** The estimator takes back a request that is still waiting. */
export async function withdrawChangeOrder(cid, co, user) {
  await updateDoc(doc(db, `${base(cid)}/changeOrders/${co.id}`), { status: 'withdrawn', decidedBy: actorOf(user), decidedAt: Timestamp.now(), decisionNote: '' });
}

/* ── quality reviews ────────────────────────────────────────────────── */
//   companies/{cid}/reviews/{id}: an estimator asks a colleague (or anyone) to
//   check the estimate; the reviewer marks it checked or sends it back.

export async function listReviews(cid, { projectId, status } = {}) {
  const col = collection(db, `${base(cid)}/reviews`);
  const q = projectId ? query(col, where('projectId', '==', projectId)) : status ? query(col, where('status', '==', status)) : col;
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.requestedAt?.toMillis?.() || 0) - (a.requestedAt?.toMillis?.() || 0));
}

export async function requestReview(cid, { projectId, projectName, reviewer, message, grandTotal, checks }, user) {
  const pRef = projectRef(cid, projectId);
  const rRef = doc(collection(db, `${base(cid)}/reviews`));
  const by = actorOf(user);
  await runTransaction(db, async (tx) => {
    await tx.get(pRef);
    const at = Timestamp.now();
    tx.set(rRef, {
      projectId, projectName: projectName || '', reviewer: reviewer || null, message: (message || '').trim(),
      grandTotal, checks: { errors: checks.filter((c) => c.level === 'error').length, warnings: checks.filter((c) => c.level === 'warn').length },
      status: 'pending', requestedBy: by, requestedAt: at,
    });
    tx.update(pRef, { 'meta.review': { id: rRef.id, status: 'pending', at, by }, updatedBy: by, updatedAt: at });
  });
  return rRef.id;
}

/** The reviewer's answer: approved (checked) or changes needed, with notes. */
export async function decideReview(cid, review, approved, note, user) {
  const rRef = doc(db, `${base(cid)}/reviews/${review.id}`);
  const pRef = projectRef(cid, review.projectId);
  const by = actorOf(user);
  await runTransaction(db, async (tx) => {
    const r = await tx.get(rRef);
    if (r.data()?.status !== 'pending') throw new Error('This review was already answered or withdrawn.');
    const at = Timestamp.now();
    const status = approved ? 'approved' : 'changes';
    tx.update(rRef, { status, decidedBy: by, decidedAt: at, note: (note || '').trim() });
    tx.update(pRef, { 'meta.review': { id: review.id, status, at, by, grandTotal: review.grandTotal ?? null }, updatedBy: by, updatedAt: at });
  });
}

export async function withdrawReview(cid, review, user) {
  const by = actorOf(user);
  const at = Timestamp.now();
  await updateDoc(doc(db, `${base(cid)}/reviews/${review.id}`), { status: 'withdrawn', decidedBy: by, decidedAt: at, note: '' });
  await updateDoc(projectRef(cid, review.projectId), { 'meta.review': null, updatedBy: by, updatedAt: at }).catch(() => {});
}
