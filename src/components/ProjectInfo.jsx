// src/components/ProjectInfo.jsx
// A project's information: status, due date, client, the estimator on it and
// who the estimate went to (usually the salesperson who brought the job).
// Saved on the project's meta, apart from the estimate.
'use client';

import { useState } from 'react';
import { Mail, Plus, X } from 'lucide-react';
import { updateProjectMeta, addClient } from '@/lib/projects';
import { PROJECT_STATUSES, PRIORITIES, LOST_REASONS } from '@/domain/revisions';
import { fmtMoney } from '@/components/ui/mat';

export default function ProjectInfo({ cid, project, clients, members, user, onSaved, onClientAdded, onClose }) {
  const m = project.meta || {};
  const [f, setF] = useState({
    status: m.status || 'not_started', dueDate: m.dueDate || '', startDate: m.startDate || '', clientId: m.clientId || '',
    priority: m.priority || 'normal', lostReason: m.lostReason || '', lostNote: m.lostNote || '',
    // one or more estimators on the job
    estimatorUids: (m.estimators?.length ? m.estimators : m.estimator ? [m.estimator] : []).map((x) => x.uid).concat(m.estimators?.length || m.estimator ? [] : ['']),
    sentToName: m.sentTo?.name || '', sentToEmail: m.sentTo?.email || '', sentOn: m.sentTo?.date || '',
    notes: m.notes || '',
  });
  const [newClient, setNewClient] = useState(null);   // { name, email } while adding one
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const estimatorsList = members.filter((x) => (x.roles || []).includes('estimator'));

  const createClient = async () => {
    if (!newClient?.name?.trim()) return;
    setBusy(true); setErr('');
    try {
      const c = await addClient(cid, newClient, user);
      onClientAdded(c);
      set({ clientId: c.id });
      setNewClient(null);
    } catch (e) { setErr(e?.message || String(e)); } finally { setBusy(false); }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const client = clients.find((c) => c.id === f.clientId);
      const ests = [...new Set(f.estimatorUids.filter(Boolean))].map((uid) => members.find((x) => x.uid === uid)).filter(Boolean)
        .map((x) => ({ uid: x.uid, name: x.name || x.email, email: x.email }));
      const meta = await updateProjectMeta(cid, project.id, {
        status: f.status, dueDate: f.dueDate || null, startDate: f.startDate || null, priority: f.priority,
        lostReason: f.status === 'lost' ? f.lostReason || 'other' : null, lostNote: f.status === 'lost' ? f.lostNote.trim() : '',
        clientId: client?.id || null, clientName: client?.name || '',
        estimators: ests, estimator: ests[0] || null,
        sentTo: f.sentToName || f.sentToEmail ? { name: f.sentToName.trim(), email: f.sentToEmail.trim(), date: f.sentOn || null } : null,
        notes: f.notes.trim(),
      }, user);
      onSaved(project.id, meta);
    } catch (e2) { setErr(e2?.message || String(e2)); } finally { setBusy(false); }
  };

  // the estimate by email to whoever it goes to (from the user's own mail app)
  const total = m.contract?.grandTotal ?? m.lastRevision?.grandTotal;
  const mailto = f.sentToEmail
    ? `mailto:${encodeURIComponent(f.sentToEmail)}?subject=${encodeURIComponent(`Estimate: ${project.name}`)}&body=${encodeURIComponent(
      `Hi ${f.sentToName || ''},\n\nHere is the estimate for ${project.name}${total ? `: ${fmtMoney(total)}` : ''}.\n\n`,
    )}`
    : null;

  return (
    <form className="proj-info" onSubmit={save}>
      <label className="fld" style={{ '--w': '150px' }}>
        <span>Status</span>
        <select className="ew-select" value={f.status} onChange={(e) => set({ status: e.target.value })}>
          {PROJECT_STATUSES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </label>
      {f.status === 'lost' ? (
        <>
          <label className="fld" style={{ '--w': '200px' }}>
            <span>Why lost</span>
            <select className="ew-select" value={f.lostReason} onChange={(e) => set({ lostReason: e.target.value })}>
              <option value="">— pick one —</option>
              {LOST_REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="fld" style={{ '--w': '240px' }}>
            <span>Detail</span>
            <input className="ew-input" value={f.lostNote} onChange={(e) => set({ lostNote: e.target.value })} placeholder="e.g. 8% above the winner" />
          </label>
        </>
      ) : null}
      <label className="fld" style={{ '--w': '120px' }}>
        <span>Priority</span>
        <select className="ew-select" value={f.priority} onChange={(e) => set({ priority: e.target.value })}>
          {PRIORITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label className="fld" style={{ '--w': '150px' }} title="When the estimate has to be delivered">
        <span>Bid due</span>
        <input className="ew-input" type="date" value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
      </label>
      <label className="fld" style={{ '--w': '150px' }} title="When the job starts on site (for stock and orders)">
        <span>Job starts</span>
        <input className="ew-input" type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />
      </label>
      <label className="fld" style={{ '--w': '220px' }}>
        <span>Client</span>
        <select className="ew-select" value={newClient ? '__new' : f.clientId} onChange={(e) => (e.target.value === '__new' ? setNewClient({ name: '', email: '' }) : (setNewClient(null), set({ clientId: e.target.value })))}>
          <option value="">— none —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="__new">+ New client…</option>
        </select>
      </label>
      {newClient ? (
        <span className="proj-info__new">
          <input className="ew-input" placeholder="Client name" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} autoFocus />
          <input className="ew-input" placeholder="Email (optional)" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
          <button type="button" className="ew-btn" disabled={!newClient.name.trim() || busy} onClick={createClient}><Plus size={12} /> Add</button>
        </span>
      ) : null}
      <div className="fld proj-info__ests" style={{ '--w': 'auto' }}>
        <span>Estimators</span>
        {f.estimatorUids.map((uid, i) => (
          <span key={i} className="proj-info__est">
            <select className="ew-select" style={{ width: 170 }} value={uid} onChange={(e) => set({ estimatorUids: f.estimatorUids.map((u, j) => (j === i ? e.target.value : u)) })} aria-label={`Estimator ${i + 1}`}>
              <option value="">— unassigned —</option>
              {estimatorsList.filter((x) => x.uid === uid || !f.estimatorUids.includes(x.uid)).map((x) => <option key={x.uid} value={x.uid}>{x.name || x.email}</option>)}
            </select>
            {f.estimatorUids.length > 1 ? <button type="button" className="ew-icon-btn" title="Remove" aria-label="Remove estimator" onClick={() => set({ estimatorUids: f.estimatorUids.filter((_, j) => j !== i) })}><X size={12} /></button> : null}
          </span>
        ))}
        {f.estimatorUids.length < estimatorsList.length ? (
          <button type="button" className="ew-icon-btn" title="Add another estimator" aria-label="Add estimator" onClick={() => set({ estimatorUids: [...f.estimatorUids, ''] })}><Plus size={13} /></button>
        ) : null}
      </div>
      <div className="proj-info__sent">
        <label className="fld" style={{ '--w': '180px' }}>
          <span>Sent to</span>
          <input className="ew-input" value={f.sentToName} onChange={(e) => set({ sentToName: e.target.value })} placeholder="e.g. the salesperson" />
        </label>
        <label className="fld" style={{ '--w': '220px' }}>
          <span>Email</span>
          <input className="ew-input" type="email" value={f.sentToEmail} onChange={(e) => set({ sentToEmail: e.target.value })} placeholder="name@company.com" />
        </label>
        <label className="fld" style={{ '--w': '150px' }}>
          <span>On</span>
          <input className="ew-input" type="date" value={f.sentOn} onChange={(e) => set({ sentOn: e.target.value })} />
        </label>
        {mailto ? <a className="ew-btn" href={mailto}><Mail size={12} /> Email it</a> : null}
      </div>
      <label className="fld proj-info__notes" style={{ '--w': '100%' }}>
        <span>Notes</span>
        <input className="ew-input" value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. GC wants the shear walls priced apart" />
      </label>
      {err ? <p className="gate-err">{err}</p> : null}
      <div className="proj-info__foot">
        <button type="submit" className="ew-btn ew-btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="ew-btn ew-btn--ghost" onClick={onClose}>Close</button>
      </div>
    </form>
  );
}
