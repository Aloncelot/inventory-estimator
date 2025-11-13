// src/app/page.jsx
"use client";

import {
  useCallback,
  useState,
  useMemo,
  useEffect,
  useRef,
  Activity, 
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


// Helper (sin cambios)
function ComingSoonView({ activeKey }) {
  const titles = {
    auth: "Login / Logout",
    loose: "Loose Material",
    labor: "Labor",
    takeoff: "Takeoff list",
    quote: "Quote (QuickBooks)",
    export: "Export",
    items: "Material List",
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

  // --- *** CORRECCIÓN: Separar los estados de los totales *** ---
  const [wallPanelsTotal, setWallPanelsTotal] = useState(0);
  const [trussTotal, setTrussTotal] = useState(0);
  
  // El 'grandTotal' real ahora es una suma calculada
  const grandTotal = wallPanelsTotal + trussTotal;
  // --- *** FIN DE LA CORRECCIÓN *** ---

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
    "loose",
    "labor",
    "takeoff",
    "quote",
    "export",
    "items",
  ];
  const isPlaceholder = placeholderKeys.includes(active);

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
              <Activity mode={active === 'project' ? 'visible' : 'hidden'}>
                <ProjectView />
              </Activity>
              
              {/* --- *** CORRECCIÓN: Pasar los 3 props al Summary *** --- */}
              <Activity mode={active === 'summary' ? 'visible' : 'hidden'}>
                <div className="app-content">
                  <Summary 
                    wallPanelsTotal={wallPanelsTotal}
                    trussTotal={trussTotal}
                    grandTotal={grandTotal}
                  />
                </div>
              </Activity>

              {/* --- *** CORRECCIÓN: Usar el setter correcto *** --- */}
              <Activity mode={active === 'wallpanels' ? 'visible' : 'hidden'}>
                <WallPanelsView onGrandTotal={setWallPanelsTotal} />
              </Activity>
              
              {/* --- *** CORRECCIÓN: Usar el setter correcto *** --- */}
              <Activity mode={active === 'trusses' ? 'visible' : 'hidden'}>
                <TrussesView onTrussTotal={setTrussTotal} />
              </Activity>
              
              <Activity mode={isPlaceholder ? 'visible' : 'hidden'}>
                <ComingSoonView activeKey={active} />
              </Activity>
            </>
          )}
        </main>
      </div>
    </ProjectProvider>
  );
}