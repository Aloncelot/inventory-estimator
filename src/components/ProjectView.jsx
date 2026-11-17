// src/components/ProjectView.jsx
// The Projects page: the company's projects with status, client and due
// date, filters, creating and opening a project, and what is waiting on the
// user (change orders to approve, quality reviews to answer).
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderOpen, RefreshCw, Search, Info } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { useCompany } from '@/context/CompanyContext';
import { useAuth } from '@/AuthContext';
import { PageHeader, fmtMoney } from '@/components/ui/mat';
import { fmtKB } from '@/domain/team';
import { PROJECT_STATUSES, statusLabel, dueIn, lostLabel, priorityLabel } from '@/domain/revisions';
import { listClients, listChangeOrders, getProjectMeta, listReviews } from '@/lib/projects';
import ReviewList, { canAnswer } from '@/components/ReviewList';
import { REVIEW_STATUS_LABEL } from '@/domain/quality';
import { listMembers } from '@/lib/company';
import ProjectInfo from '@/components/ProjectInfo';
import ChangeOrderList from '@/components/ChangeOrderList';

const CLOSED = ['lost', 'cancelled', 'done'];

function DueTag({ date, status }) {
  const d = dueIn(date);
  if (d == null) return <span className="ew-subtle">—</span>;
  const late = d < 0 && !CLOSED.includes(status) && status !== 'won';
  const soon = d >= 0 && d <= 3 && !CLOSED.includes(status);
  const day = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return <span className={late ? 'proj-due is-late' : soon ? 'proj-due is-soon' : 'ew-subtle'} title={late ? `${-d} days late` : `${d} days left`}>{day}{late ? ' · late' : soon ? ` · ${d === 0 ? 'today' : `${d}d`}` : ''}</span>;
}

export default function ProjectView({ onOpened }) {
  const { projectsList, fetchProjectsList, createNewProject, loadProject, isListLoading, isSaving, appId, projectId, readOnly, applyMeta } = useProject();
  const { companyId, company, perms } = useCompany();
  const { user } = useAuth();
  const [newName, setNewName] = useState('');
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('open');   // open | all | a status
  const [editing, setEditing] = useState('');
  const [clients, setClients] = useState([]);
  const [members, setMembers] = useState([]);
  const [pending, setPending] = useState([]);
  const [toReview, setToReview] = useState([]);
  const [msg, setMsg] = useState('');
  const isReady = Boolean(appId);
  const canCreate = isReady && !readOnly;
  const canInfo = Boolean(perms?.canEditEstimate || perms?.isAdmin);

  const uid = user?.uid;
  const canEst = Boolean(perms?.canEditEstimate);
  const admin = Boolean(perms?.isAdmin);
  // clients, team members and pending change orders and reviews, for the side panels;
  // each list fails on its own (missing rules or permissions) without hiding the rest
  const loadSide = useCallback(async () => {
    if (!companyId) return;
    const [c, m, p, r] = await Promise.all([
      listClients(companyId).catch(() => []), listMembers(companyId).catch(() => []), listChangeOrders(companyId, { status: 'pending' }).catch(() => []),
      listReviews(companyId, { status: 'pending' }).catch(() => []),
    ]);
    setClients(c); setMembers(m); setPending(p);
    setToReview(r.filter((x) => canAnswer(x, { uid }, { canEditEstimate: canEst, isAdmin: admin })));
  }, [companyId, uid, canEst, admin]);
  useEffect(() => { loadSide(); }, [loadSide]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return projectsList.filter((p) => {
      const st = p.meta?.status || 'not_started';
      if (status === 'open' && CLOSED.includes(st)) return false;
      if (status !== 'open' && status !== 'all' && st !== status) return false;
      if (!q) return true;
      return [p.name, p.meta?.clientName, p.meta?.sentTo?.name].some((x) => (x || '').toLowerCase().includes(q));
    });
  }, [projectsList, filter, status]);
  const pendingBy = useMemo(() => pending.reduce((a, c) => ({ ...a, [c.projectId]: (a[c.projectId] || 0) + 1 }), {}), [pending]);

  const create = async (e) => {
    e.preventDefault();
    if (!newName.trim() || isSaving || !canCreate) return;
    const id = await createNewProject(newName.trim());
    if (id) {
      setNewName('');
      await loadProject(id);
      onOpened?.();
    }
  };

  const open = async (id, page) => {
    if (!isReady) return;
    if (id !== projectId) await loadProject(id);
    onOpened?.(page);
  };

  return (
    <div className="app-content">
      <PageHeader icon={FolderOpen} title="Projects" meta={`${projectsList.length} saved${pending.length ? ` · ${pending.length} change order${pending.length === 1 ? '' : 's'} waiting` : ''}`} />

      <form onSubmit={create} className="toolbar" style={{ paddingTop: 0 }}>
        {readOnly ? <span className="ew-subtle">View only: creating and editing projects needs the Estimator role.</span> : null}
        <input
          className="ew-input"
          style={{ width: 280 }}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New project name"
          aria-label="New project name"
          disabled={isSaving || !canCreate}
          hidden={readOnly}
        />
        <button type="submit" className="ew-btn ew-btn--primary" hidden={readOnly} disabled={!newName.trim() || isSaving || !canCreate}>
          {isSaving ? 'Creating…' : 'Create project'}
        </button>
        <span style={{ flex: 1 }} />
        <select className="ew-select" style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="open">Open projects</option>
          <option value="all">All projects</option>
          {PROJECT_STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label className="fld" style={{ '--w': '200px' }}>
          <Search size={13} />
          <input className="ew-input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter projects" aria-label="Filter projects" />
        </label>
        <button type="button" className="ew-btn" onClick={() => { fetchProjectsList(appId); loadSide(); }} disabled={isListLoading || !isReady}>
          <RefreshCw size={12} className={isListLoading ? 'animate-spin' : ''} /> Refresh
        </button>
      </form>

      {msg ? <p className="team-msg">{msg}</p> : null}
      {toReview.length ? (
        <div className="ew-card co-approvals rv-approvals">
          <h3>{toReview.length} estimate{toReview.length === 1 ? '' : 's'} waiting for your review</h3>
          <ReviewList
            reviews={toReview} cid={companyId} user={user} perms={perms} showProject
            onOpenProject={(id) => open(id, 'history')}
            onChanged={async (m, r) => { setMsg(m); loadSide(); applyMeta(r.projectId, await getProjectMeta(companyId, r.projectId)); }}
          />
        </div>
      ) : null}
      {perms?.isAdmin && pending.length ? (
        <div className="ew-card co-approvals">
          <h3>{pending.length} change order{pending.length === 1 ? '' : 's'} waiting for your approval</h3>
          <ChangeOrderList
            orders={pending} cid={companyId} user={user} isAdmin showProject companyName={company?.name || ''}
            onOpenProject={(id) => open(id, 'history')}
            onChanged={async (m, co) => { setMsg(m); loadSide(); applyMeta(co.projectId, await getProjectMeta(companyId, co.projectId)); }}
          />
        </div>
      ) : null}

      <div className="ew-card" style={{ padding: '0 6px' }}>
        <div className="proj-row proj-row--wide ew-head" style={{ borderBottom: '1px solid var(--border-strong)' }}>
          <span>Project</span><span>Status</span><span>Client</span><span>Bid due</span><span>Sent to</span><span className="num">Contract</span><span>Last change</span><span />
        </div>
        {!isReady ? (
          <div className="empty-state">Loading your account…</div>
        ) : isListLoading && projectsList.length === 0 ? (
          <div className="empty-state">Loading projects…</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">{projectsList.length ? 'No project matches.' : 'No projects yet. Create one above.'}</div>
        ) : (
          rows.map((p) => {
            const current = p.id === projectId;
            const m = p.meta || {};
            const st = m.status || 'not_started';
            return [
              <div key={p.id} className={`proj-row proj-row--wide${current ? ' is-current' : ''}`}>
                <span>
                  <button type="button" className="ew-link" style={{ textAlign: 'left', textDecoration: current ? 'none' : undefined, fontWeight: current ? 700 : 500 }} onClick={() => open(p.id)} disabled={current}>
                    {p.name || 'Untitled'}
                  </button>
                  {pendingBy[p.id] ? <span className="co-st co-st--pending" title="Change orders waiting for approval"> {pendingBy[p.id]} CO</span> : null}
                  {m.review?.status && m.review.status !== 'withdrawn' ? <span className={`co-st rv-st--${m.review.status}`} title={`${REVIEW_STATUS_LABEL[m.review.status]}${m.review.by?.name ? ` · ${m.review.by.name}` : ''}`}>{m.review.status === 'approved' ? '✓ Checked' : m.review.status === 'changes' ? 'Changes' : 'In review'}</span> : null}
                  {m.priority ? <span className={`proj-pri proj-pri--${m.priority}`}>{priorityLabel(m.priority)}</span> : null}
                  {(m.estimators?.length ? m.estimators : m.estimator ? [m.estimator] : []).length ? <div className="ew-subtle">{(m.estimators?.length ? m.estimators : [m.estimator]).map((x) => x.name).join(', ')}</div> : null}
                </span>
                <span><span className={`proj-st proj-st--${st}`}>{statusLabel(st)}</span>{st === 'lost' && m.lostReason ? <div className="ew-subtle">{lostLabel(m.lostReason)}</div> : null}</span>
                <span>{m.clientName || <span className="ew-subtle">—</span>}</span>
                <span><DueTag date={m.dueDate} status={st} /></span>
                <span>{m.sentTo?.name || m.sentTo?.email ? <>{m.sentTo.name || m.sentTo.email}{m.sentTo.date ? <div className="ew-subtle">{new Date(`${m.sentTo.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div> : null}</> : <span className="ew-subtle">—</span>}</span>
                <span className="num">{m.contract ? <>{fmtMoney(m.contract.grandTotal)}<div className="ew-subtle">Rev {m.contract.number}</div></> : <span className="ew-subtle">—</span>}</span>
                <span className="ew-subtle">{p.updatedAt ? p.updatedAt.toLocaleDateString() : '—'}{p.updatedBy ? ` · ${p.updatedBy.name || p.updatedBy.email}` : ''}{p.sizeBytes ? ` · ${fmtKB(p.sizeBytes)}` : ''}</span>
                <span className="proj-acts">
                  {canInfo ? <button type="button" className="ew-icon-btn" title="Status, client, due date…" aria-label="Project info" onClick={() => setEditing(editing === p.id ? '' : p.id)}><Info size={14} /></button> : null}
                  {current ? <span className="ew-subtle">Open</span> : <button type="button" className="ew-btn" onClick={() => open(p.id)}>Open</button>}
                </span>
              </div>,
              editing === p.id ? (
                <ProjectInfo
                  key={`${p.id}-info`} cid={companyId} project={p} clients={clients} members={members} user={user}
                  onClientAdded={(c) => setClients((list) => [...list, c].sort((a, b) => a.name.localeCompare(b.name)))}
                  onSaved={(id, meta) => { applyMeta(id, meta); setEditing(''); setMsg(`${p.name}: saved.`); }}
                  onClose={() => setEditing('')}
                />
              ) : null,
            ];
          })
        )}
      </div>
    </div>
  );
}
