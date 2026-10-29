// src/app/page.jsx
'use client';

import { useEffect } from 'react';
import { useLocalStorageJson } from '@/hooks/useLocalStorageJson';
import { ProjectProvider, useProject } from '@/context/ProjectContext';
import { useAuth } from '@/AuthContext';
import { Hammer, ClipboardList, Receipt, Download } from 'lucide-react';

import Sidebar from '@/components/Sidebar';
import LoginView from '@/components/LoginView';
import LogoutView from '@/components/LogoutView';
import ProjectView from '@/components/ProjectView';
import Summary from '@/components/Summary';
import WallPanelsView from '@/components/WallPanelsView';
import TrussesView from '@/components/TrussesView';
import MaterialListView from '@/components/MaterialListView';
import LooseMaterialView from '@/components/LooseMaterialView';
import { PageHeader } from '@/components/ui/mat';
import { ConfirmProvider } from '@/components/ui/confirm';

const SOON = {
  labor: { title: 'Labor', icon: Hammer },
  takeoff: { title: 'Takeoff list', icon: ClipboardList },
  quote: { title: 'Quote (QuickBooks)', icon: Receipt },
  export: { title: 'Export', icon: Download },
};

// Estimate views stay mounted (hidden when inactive) so scroll position and
// open sections survive switching pages. Totals no longer depend on this:
// they are calculated from the data in src/domain/estimate.
const PERSISTENT = ['wallpanels', 'loose', 'trusses'];

export default function Home() {
  const [ui, setUi] = useLocalStorageJson('ui-state', { active: 'summary', collapsed: false, currentProjectId: null });
  return (
    <ProjectProvider initialProjectId={ui.currentProjectId || null}>
      <ConfirmProvider>
        <Shell ui={ui} setUi={setUi} />
      </ConfirmProvider>
    </ProjectProvider>
  );
}

function Shell({ ui, setUi }) {
  const { user, loading: authLoading } = useAuth();
  const { projectId } = useProject();

  // remember the open project so a reload reopens it
  useEffect(() => {
    if (projectId && projectId !== ui.currentProjectId) setUi((prev) => ({ ...prev, currentProjectId: projectId }));
  }, [projectId, ui.currentProjectId, setUi]);

  const setActive = (key) => setUi((prev) => ({ ...prev, active: key }));
  const setCollapsed = (val) => setUi((prev) => ({ ...prev, collapsed: val }));
  const active = ui.active;

  const renderOther = () => {
    switch (active) {
      case 'auth': return <LogoutView onCancel={() => setActive('summary')} />;
      case 'project': return <ProjectView onOpened={() => setActive('summary')} />;
      case 'items': return <MaterialListView />;
      case 'summary': return <Summary />;
      default:
        if (SOON[active]) {
          return (
            <div className="app-content">
              <PageHeader icon={SOON[active].icon} title={SOON[active].title} />
              <div className="empty-state">This section isn&apos;t built yet.</div>
            </div>
          );
        }
        return PERSISTENT.includes(active) ? null : <Summary />;
    }
  };

  return (
    <div className="app-container">
      <Sidebar active={active} onChange={setActive} collapsed={ui.collapsed} onCollapsedChange={setCollapsed} />

      <main className="app-main">
        {authLoading ? (
          <div className="app-content"><div className="empty-state">Checking your session…</div></div>
        ) : !user ? (
          <LoginView />
        ) : (
          <>
            <div hidden={active !== 'wallpanels'}><WallPanelsView /></div>
            <div hidden={active !== 'loose'}><LooseMaterialView /></div>
            <div hidden={active !== 'trusses'}><TrussesView /></div>
            {renderOther()}
          </>
        )}
      </main>
    </div>
  );
}
