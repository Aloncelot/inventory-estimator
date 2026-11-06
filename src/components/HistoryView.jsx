// src/components/HistoryView.jsx
// Who changed the open project, when, and which parts. One entry per working
// session of a person (it keeps growing while they work, up to 15 minutes
// between saves).
'use client';

import { useCallback, useEffect, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { PageHeader } from '@/components/ui/mat';
import { listHistory } from '@/lib/company';

const fmt = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtTime = (ts) => (ts?.toDate ? ts.toDate().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '');

export default function HistoryView() {
  const { projectId, projectData, appId, lastSavedAt } = useProject();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const path = appId && projectId ? `${appId}/projects/${projectId}` : null;

  const load = useCallback(async () => {
    if (!path) return;
    setErr('');
    try { setRows(await listHistory(path)); } catch (e) { setErr(e?.message || String(e)); setRows([]); }
  }, [path]);
  // reload after each save so the newest entry shows
  useEffect(() => { load(); }, [load, lastSavedAt]);

  if (!projectData) {
    return (
      <div className="app-content">
        <PageHeader icon={History} title="History" />
        <div className="empty-state">Open a project to see its history.</div>
      </div>
    );
  }

  const by = projectData.updatedBy;
  const created = projectData.createdBy;
  return (
    <div className="app-content">
      <PageHeader
        icon={History}
        title="History"
        meta={by ? `Last change by ${by.name || by.email} · ${fmt(projectData.updatedAt)}` : `Last saved ${fmt(projectData.updatedAt)}`}
        actions={<button type="button" className="ew-btn" onClick={load}><RefreshCw size={12} /> Refresh</button>}
      />
      {err ? <p className="gate-err">History could not be read: {err}</p> : null}
      <div className="ew-card" style={{ padding: '0 6px' }}>
        {rows === null ? <div className="empty-state">Loading…</div> : rows.length === 0 ? (
          <div className="empty-state">No changes recorded yet. Every save from now on is listed here with who made it.</div>
        ) : (
          <table className="tbl hist-tbl">
            <colgroup><col className="hist-c-when" /><col className="hist-c-who" /><col /></colgroup>
            <thead><tr><th>When</th><th>Who</th><th>What changed</th></tr></thead>
            <tbody>
              {rows.map((h) => {
                const span = h.startedAt && h.at && h.startedAt.toMillis() !== h.at.toMillis() ? ` – ${fmtTime(h.at)}` : '';
                return (
                  <tr key={h.id}>
                    <td>{fmt(h.startedAt || h.at)}{span}</td>
                    <td><strong>{h.by?.name || h.by?.email || '—'}</strong>{h.by?.name && h.by?.email && h.by.name !== h.by.email ? <div className="ew-subtle">{h.by.email}</div> : null}</td>
                    <td className="hist-what">{(h.sections || []).map((s) => <span key={s} className="ew-chip">{s}</span>)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {created ? <p className="ew-subtle">Created by {created.name || created.email} · {fmt(projectData.createdAt)}</p> : null}
    </div>
  );
}
