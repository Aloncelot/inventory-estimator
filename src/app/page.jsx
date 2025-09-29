// src/app/page.jsx
'use client';

import { useCallback, useState, useMemo } from 'react';
import { useLocalStorageJson } from '@/hooks/useLocalStorageJson';
import Sidebar from '@/components/Sidebar';
import WallPanelsView from '@/components/WallPanelsView';
import Summary from '@/components/Summary';

export default function Home() {
  const [ui, setUi] = useLocalStorageJson('inv:v1:ui', {
    collapsed: false,
    active: 'wallpanels',
  });
  const { collapsed, active } = ui;

  const [grandTotal, setGrandTotal] = useState(0);

  const setActive = useCallback((key) => {
    setUi((prev) => ({ ...prev, active: key }));
  }, [setUi]);

  const setCollapsed = useCallback((val) => {
    setUi((prev) => ({ ...prev, collapsed: !!val }));
  }, [setUi]);

  // Render exactly one tab
  const content = useMemo(() => {
    switch (active) {
      case 'summary':
        return (
          <div className="app-content">
            <Summary grandTotal={grandTotal} />
          </div>
        );
      case 'wallpanels':
        return (
          <WallPanelsView onGrandTotal={setGrandTotal} />
        );
      default:
        return (
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
              <div className="ew-subtle">Coming soon…</div>
            </div>
          </div>
        );
    }
  }, [active, grandTotal]);

  return (
    <div className={`app-shell ${collapsed ? 'sb-collapsed' : ''}`}>
      <Sidebar
        active={active}
        collapsed={collapsed}
        onChange={setActive}
        onCollapsedChange={setCollapsed}
      />
      <main className="app-main">
        {content}
      </main>
    </div>
  );
}
