// src/components/ProjectView.jsx
'use client';

import { useMemo, useState } from 'react';
import { FolderOpen, RefreshCw, Search } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { PageHeader } from '@/components/ui/mat';

export default function ProjectView({ onOpened }) {
  const { projectsList, fetchProjectsList, createNewProject, loadProject, isListLoading, isSaving, appId, projectId } = useProject();
  const [newName, setNewName] = useState('');
  const [filter, setFilter] = useState('');
  const isReady = Boolean(appId);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? projectsList.filter((p) => (p.name || '').toLowerCase().includes(q)) : projectsList;
  }, [projectsList, filter]);

  const create = async (e) => {
    e.preventDefault();
    if (!newName.trim() || isSaving || !isReady) return;
    const id = await createNewProject(newName.trim());
    if (id) {
      setNewName('');
      await loadProject(id);
      onOpened?.();
    }
  };

  const open = async (id) => {
    if (id === projectId || !isReady) return;
    await loadProject(id);
    onOpened?.();
  };

  return (
    <div className="app-content">
      <PageHeader icon={FolderOpen} title="Projects" meta={`${projectsList.length} saved`} />

      <form onSubmit={create} className="toolbar" style={{ paddingTop: 0 }}>
        <input
          className="ew-input"
          style={{ width: 280 }}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New project name"
          aria-label="New project name"
          disabled={isSaving || !isReady}
        />
        <button type="submit" className="ew-btn ew-btn--primary" disabled={!newName.trim() || isSaving || !isReady}>
          {isSaving ? 'Creating…' : 'Create project'}
        </button>
        <span style={{ flex: 1 }} />
        <label className="fld" style={{ '--w': '200px' }}>
          <Search size={13} />
          <input className="ew-input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter projects" aria-label="Filter projects" />
        </label>
        <button type="button" className="ew-btn" onClick={() => fetchProjectsList(appId)} disabled={isListLoading || !isReady}>
          <RefreshCw size={12} className={isListLoading ? 'animate-spin' : ''} /> Refresh
        </button>
      </form>

      <div className="ew-card" style={{ padding: '0 6px' }}>
        <div className="proj-row ew-head" style={{ borderBottom: '1px solid var(--border-strong)' }}>
          <span>Project</span><span>Last saved</span><span />
        </div>
        {!isReady ? (
          <div className="empty-state">Loading your account…</div>
        ) : isListLoading && projectsList.length === 0 ? (
          <div className="empty-state">Loading projects…</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">{projectsList.length ? 'No project matches that filter.' : 'No projects yet. Create one above.'}</div>
        ) : (
          rows.map((p) => {
            const current = p.id === projectId;
            return (
              <div key={p.id} className={`proj-row${current ? ' is-current' : ''}`}>
                <button type="button" className="ew-link" style={{ textAlign: 'left', textDecoration: current ? 'none' : undefined, fontWeight: current ? 700 : 500 }} onClick={() => open(p.id)} disabled={current}>
                  {p.name || 'Untitled'}
                </button>
                <span className="ew-subtle">{p.updatedAt ? p.updatedAt.toLocaleString() : '—'}</span>
                {current ? <span className="ew-subtle" style={{ textAlign: 'right' }}>Open</span> : (
                  <button type="button" className="ew-btn" onClick={() => open(p.id)}>Open</button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
