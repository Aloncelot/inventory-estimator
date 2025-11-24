// src/app/page.jsx
"use client";

import {
  useCallback,
  useState,
  useEffect,
  useRef,
} from "react";
import { useLocalStorageJson } from "@/hooks/useLocalStorageJson";
import { ProjectProvider } from "@/context/ProjectContext";
import { useAuth } from "@/AuthContext";
import Sidebar from "@/components/Sidebar";
import WallPanelsView from "@/components/WallPanelsView";
import Summary from "@/components/Summary";
import ProjectView from "@/components/ProjectView";
import LoginView from "@/components/LoginView";
import TrussesView from "@/components/TrussesView";
import MaterialListView from "@/components/MaterialListView"; 
import LooseMaterialView from "@/components/LooseMaterialView";

// Helper 
function ComingSoonView({ activeKey }) {
  const titles = {

    labor: "Labor",
    takeoff: "Takeoff list",
    quote: "Quote (QuickBooks)",
    export: "Export",
  };
  
  return (
    <div className="app-content">
      <div className="ew-card">
        <h2 className="ew-h2" style={{ marginTop: 0 }}>
          {titles[activeKey] || "Section"}
        </h2>
        <div className="ew-subtle">Coming soon…</div>
      </div>
    </div>
  );
}

export default function Home() {
  const [ui, setUi] = useLocalStorageJson("inv:v1:ui", {
    collapsed: false,
    active: "project",
    currentProjectId: null, 
  });
  
  const { collapsed, active, currentProjectId } = ui;
  const { user, loading: authLoading } = useAuth();
  const prevUserRef = useRef(user);

  const [wallPanelsTotal, setWallPanelsTotal] = useState(0);
  const [trussTotal, setTrussTotal] = useState(0);
  
  const setActive = useCallback(
    (key) => {
      setUi((prev) => ({ ...prev, active: key }));
    },
    [setUi]
  );

  useEffect(() => {
    if (!prevUserRef.current && user) {
      console.log("User logged in, switching to Project view.");
      setActive("project"); 
    }
    prevUserRef.current = user;
  }, [user, setActive]);

  const setCollapsed = useCallback(
    (val) => {
      setUi((prev) => ({ ...prev, collapsed: !!val }));
    },
    [setUi]
  );

  const placeholderKeys = [
    "labor",
    "takeoff",
    "quote",
    "export",
  ];
  const isPlaceholder = placeholderKeys.includes(active);

  const projectStyle = {
    display: active === 'project' ? 'block' : 'none'
  };
  const summaryStyle = {
    display: active === 'summary' ? 'block' : 'none'
  };
  const wallPanelsStyle = {
    display: active === 'wallpanels' ? 'block' : 'none'
  };
  const trussesStyle = {
    display: active === 'trusses' ? 'block' : 'none'
  };
  const itemsStyle = {
    display: active === 'items' ? 'block' : 'none'
  };
  const looseStyle = {
    display: active === 'loose' ? 'block' : 'none'
  };
  const placeholderStyle = {
    display: isPlaceholder ? 'block' : 'none'
  };

  return (
    <ProjectProvider initialProjectId={currentProjectId}>
      <div className={`app-shell ${collapsed ? "sb-collapsed" : ""}`}>
        <Sidebar
          active={active}
          collapsed={collapsed}
          onChange={setActive}
          onCollapsedChange={setCollapsed}
        />
        <main className="app-main">
          {authLoading ? (
            <div className="app-content">
              <div className="ew-card">Loading Authentication...</div>
            </div>
          ) : !user ? (
            <LoginView />
          ) : (
            <>
              <div style={projectStyle}>
                <ProjectView /> 
              </div>
              
              <div style={summaryStyle}>
                <div className="app-content">
                  <Summary 
                    wallPanelsTotal={wallPanelsTotal}
                    trussTotal={trussTotal}
                  />
                </div>
              </div>

              <div style={wallPanelsStyle}>
                <WallPanelsView onGrandTotal={setWallPanelsTotal} />
              </div>
              
              <div style={trussesStyle}>
                <TrussesView onTrussTotal={setTrussTotal} />
              </div>
              
              <div style={itemsStyle}>
                <MaterialListView />
              </div>

              <div style={looseStyle}>
                <LooseMaterialView />
              </div>
              
              <div style={placeholderStyle}>
                <ComingSoonView activeKey={active} />
              </div>
            </>
          )}
        </main>
      </div>
    </ProjectProvider>
  );
}