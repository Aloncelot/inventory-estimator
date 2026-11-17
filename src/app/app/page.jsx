// src/app/app/page.jsx — the estimator app at /app
'use client';

import { useEffect } from 'react';
import { useLocalStorageJson } from '@/hooks/useLocalStorageJson';
import { ProjectProvider, useProject } from '@/context/ProjectContext';
import { useAuth } from '@/AuthContext';
import { DOC_WARN_BYTES, DOC_LIMIT_BYTES, fmtKB } from '@/domain/team';
import { CompanyProvider, useCompany } from '@/context/CompanyContext';

import Sidebar from '@/components/Sidebar';
import LoginView from '@/components/LoginView';
import LogoutView from '@/components/LogoutView';
import ProjectView from '@/components/ProjectView';
import Summary from '@/components/Summary';
import WallPanelsView from '@/components/WallPanelsView';
import TrussesView from '@/components/TrussesView';
import MaterialListView from '@/components/MaterialListView';
import LooseMaterialView from '@/components/LooseMaterialView';
import QuoteView from '@/components/QuoteView';
import LayoutView from '@/components/LayoutView';
import PlanTakeoffView from '@/components/PlanTakeoffView';
import LaborView from '@/components/LaborView';
import ScheduleView from '@/components/ScheduleView';
import TakeoffView from '@/components/TakeoffView';
import RevisionsView from '@/components/RevisionsView';
import TeamView from '@/components/TeamView';
import InventoryView from '@/components/InventoryView';
import HelpView from '@/components/help/HelpView';
import { topicForPage } from '@/components/help/content';
import { CircleHelp, Sparkles } from 'lucide-react';
import { AssistantProvider, useAssistant } from '@/context/AssistantContext';
import AssistantPanel from '@/components/assistant/AssistantPanel';
import CompanyGate from '@/components/CompanyGate';
import { PageHeader } from '@/components/ui/mat';
import { ConfirmProvider } from '@/components/ui/confirm';

const SOON = {
};

// Estimate views stay mounted (hidden when inactive) so scroll position and
// open sections survive switching pages. Totals no longer depend on this:
// they are calculated from the data in src/domain/estimate.
const PERSISTENT = ['wallpanels', 'loose', 'trusses'];

export default function Home() {
  const [ui, setUi] = useLocalStorageJson('ui-state', { active: 'summary', collapsed: false, currentProjectId: null });
  return (
    <CompanyProvider>
      <ProjectProvider initialProjectId={ui.currentProjectId || null}>
        <ConfirmProvider>
          <Shell ui={ui} setUi={setUi} />
        </ConfirmProvider>
      </ProjectProvider>
    </CompanyProvider>
  );
}

function Shell({ ui, setUi }) {
  const { user, loading: authLoading } = useAuth();
  const { projectId, projectData, readOnly, projectBytes, lockedBy, takeOver, canEditRole, conflict, resolveConflict } = useProject();
  const { status: companyStatus } = useCompany();

  // remember the open project so a reload reopens it
  useEffect(() => {
    if (projectId && projectId !== ui.currentProjectId) setUi((prev) => ({ ...prev, currentProjectId: projectId }));
  }, [projectId, ui.currentProjectId, setUi]);

  // opening Help lands on the topic of the page you were on
  const setActive = (key) => setUi((prev) => ({ ...prev, active: key, ...(key === 'help' && prev.active !== 'help' ? { helpTopic: topicForPage(prev.active) } : {}) }));
  // other pages can send the user here with something to show (src/lib/nav.js)
  useEffect(() => {
    const onNav = (e) => { if (e.detail?.page) setUi((prev) => ({ ...prev, active: e.detail.page })); };
    window.addEventListener('app:navigate', onNav);
    return () => window.removeEventListener('app:navigate', onNav);
  }, [setUi]);
  const setCollapsed = (val) => setUi((prev) => ({ ...prev, collapsed: val }));
  const active = ui.active;

  const renderOther = () => {
    switch (active) {
      case 'auth': return <LogoutView onCancel={() => setActive('summary')} />;
      case 'project': return <ProjectView onOpened={(pg) => setActive(pg || 'summary')} />;
      case 'items': return <MaterialListView />;
      case 'summary': return <Summary />;
      case 'quote': return <QuoteView />;
      case 'layout': return <LayoutView />;
      case 'plans': return <PlanTakeoffView />;
      case 'labor': return <LaborView />;
      case 'schedule': return <ScheduleView />;
      case 'takeoff': return <TakeoffView />;
      case 'history': return <RevisionsView />;
      case 'team': return <TeamView />;
      case 'inventory': return <InventoryView />;
      case 'help': return <HelpView topic={ui.helpTopic} onOpenPage={setActive} />;
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
    <AssistantProvider resetKey={projectId}>
      <Layout ui={ui} active={active} setActive={setActive} setCollapsed={setCollapsed} renderOther={renderOther}
        user={user} authLoading={authLoading} companyStatus={companyStatus} projectData={projectData} projectBytes={projectBytes}
        conflict={conflict} resolveConflict={resolveConflict} readOnly={readOnly} lockedBy={lockedBy} takeOver={takeOver} canEditRole={canEditRole} />
    </AssistantProvider>
  );
}

function Layout({ ui, active, setActive, setCollapsed, renderOther, user, authLoading, companyStatus, projectData, projectBytes, conflict, resolveConflict, readOnly, lockedBy, takeOver, canEditRole }) {
  const assistant = useAssistant();
  const ready = user && companyStatus === 'ready';
  return (
    <div className={`app-container${ready && assistant.open ? ' has-aside' : ''}`}>
      <Sidebar active={active} onChange={setActive} collapsed={ui.collapsed} onCollapsedChange={setCollapsed} />

      <main className={`app-main${readOnly && user && companyStatus === 'ready' && !['team', 'project', 'items', 'inventory', 'help'].includes(active) ? ' is-readonly' : ''}`}>
        {authLoading ? (
          <div className="app-content"><div className="empty-state">Checking your session…</div></div>
        ) : !user ? (
          <LoginView />
        ) : companyStatus !== 'ready' ? (
          active === 'auth' ? <LogoutView onCancel={() => setActive('summary')} /> : <CompanyGate />
        ) : (
          <>
            {projectData && projectBytes > DOC_WARN_BYTES && active !== 'team' ? (
              <div className={`size-warn no-print${projectBytes > DOC_LIMIT_BYTES ? ' is-over' : ''}`}>
                {projectBytes > DOC_LIMIT_BYTES
                  ? `This project is ${fmtKB(projectBytes)}, over the 1 MB limit, and can't be saved. Remove unused plan walls or levels, or split it.`
                  : `This project is ${fmtKB(projectBytes)} of the 1 MB a project can hold. Consider splitting very large jobs.`}
              </div>
            ) : null}
            {conflict && projectData ? (
              <div className="ro-banner ro-banner--conflict no-print">
                <span>{conflict.by?.name || 'Someone'} saved this project{conflict.at ? ` at ${conflict.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''} while you had it open. Your latest changes are not saved yet.</span>
                <button type="button" className="ew-btn" onClick={() => resolveConflict('reload')} title="Your changes since then are dropped">Load their version</button>
                <button type="button" className="ew-btn ew-btn--ghost" onClick={() => resolveConflict('mine')} title="Their changes are replaced by yours">Keep mine</button>
              </div>
            ) : null}
            {readOnly && projectData && lockedBy && !['team', 'project', 'auth', 'inventory', 'help'].includes(active) ? (
              <div className="ro-banner no-print">
                <span><strong>{lockedBy.name}</strong> is editing this project. You can see it; it updates when you open it again or take over.</span>
                <button type="button" className="ew-btn" onClick={takeOver} title="They switch to view only; what they had not saved is saved first">Take over</button>
              </div>
            ) : readOnly && projectData && !canEditRole && !['team', 'project', 'auth', 'history', 'inventory', 'help'].includes(active) ? (
              <div className="ro-banner no-print">View only: you can see this project but not change it. Editing needs the Estimator role; ask an Admin.</div>
            ) : null}
            <div hidden={active !== 'wallpanels'}><WallPanelsView /></div>
            <div hidden={active !== 'loose'}><LooseMaterialView /></div>
            <div hidden={active !== 'trusses'}><TrussesView /></div>
            {renderOther()}
            {active !== 'help' && active !== 'auth' ? (
              <button type="button" className="help-fab no-print" onClick={() => setActive('help')} title="Help for this page" aria-label="Help for this page"><CircleHelp size={18} /></button>
            ) : null}
            {!assistant.open && active !== 'auth' ? (
              <button type="button" className="as-fab no-print" onClick={() => assistant.setOpen(true)} title="Assistant (Ctrl+I)" aria-label="Open the assistant"><Sparkles size={17} /></button>
            ) : null}
          </>
        )}
      </main>
      {ready ? <AssistantPanel /> : null}
    </div>
  );
}
