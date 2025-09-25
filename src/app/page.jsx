// src/app/page.jsx
'use client';

import { useCallback } from 'react';
import { useLocalStorageJson } from '@/hooks/useLocalStorageJson';
import Sidebar from '@/components/Sidebar';
import WallPanelsView from '@/components/WallPanelsView';

export default function Home() {
  const [ui, setUi] = useLocalStorageJson('inv:v1:ui', {
    collapsed: false,
    active: 'wallpanels',
  });
  const { collapsed, active } = ui;

  const setActive = useCallback((key) => {
    setUi(prev => ({ ...prev, active: key }));
  }, [setUi]);

  const setCollapsed = useCallback((val) => {
    setUi(prev => ({ ...prev, collapsed: !!val }));
  }, [setUi]);

  return (
    <div className={`app-shell ${collapsed ? 'sb-collapsed' : ''}`}>
      <Sidebar
        active={active}
        collapsed={collapsed}
        onChange={setActive}
        onCollapsedChange={setCollapsed}
      />
      <main className="app-main">
        {active === 'wallpanels' ? (
          <WallPanelsView />
        ) : (
          <div className="app-content">
            <div className="ew-card">
              <h2 className="ew-h2" style={{ marginTop: 0 }}>
                {({
                  auth:'Login / Logout',
                  project:'Project',
                  trusses:'Trusses',
                  loose:'Loose Material',
                  labor:'Labor',
                  summary:'Summary',
                  takeoff:'Takeoff list',
                  quote:'Quote (QuickBooks)',
                  export:'Export',
                })[active] || 'Section'}
              </h2>
              <div className="ew-subtle">Coming soon — for now, use <span className="ew-chip">Wall Panels</span>.</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
