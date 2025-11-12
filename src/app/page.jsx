// src/app/page.jsx
"use client";

// 1. Importamos 'Activity' desde 'react'
import {
  useCallback,
  useState,
  useMemo,
  useEffect,
  useRef,
  Activity, // ¡Añadido!
} from "react";
import { useLocalStorageJson } from "@/hooks/useLocalStorageJson";
import { ProjectProvider } from "@/context/ProjectContext";
import { useAuth } from "@/AuthContext";
import Sidebar from "@/components/Sidebar";
import WallPanelsView from "@/components/WallPanelsView";
import Summary from "@/components/Summary";
import ProjectView from "@/components/ProjectView";
import LoginView from "@/components/LoginView";

// --- Helper para las vistas "Próximamente" ---
// Esto limpia la lógica de renderizado principal
function ComingSoonView({ activeKey }) {
  const titles = {
    auth: "Login / Logout",
    trusses: "Trusses",
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
// --- Fin del Helper ---

export default function Home() {
  const [ui, setUi] = useLocalStorageJson("inv:v1:ui", {
    collapsed: false,
    active: "project",
    currentProjectId: null, 
  });
  
  const { collapsed, active, currentProjectId } = ui;
  const { user, loading: authLoading } = useAuth();
  const prevUserRef = useRef(user);

  const [grandTotal, setGrandTotal] = useState(0);

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

  // 2. Ya no necesitamos el 'useMemo' para 'content'.
  // Renderizaremos directamente en el JSX.

  // Definimos las claves que usan el componente "ComingSoonView"
  const placeholderKeys = [
    "trusses",
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
          {/* 3. Movemos la lógica de carga y autenticación aquí */}
          {authLoading ? (
            <div className="app-content">
              <div className="ew-card">Loading Authentication...</div>
            </div>
          ) : !user ? (
            <LoginView />
          ) : (
            /* 4. Renderizamos TODAS las vistas principales,
                  envueltas en <Activity /> */
            <>
              <Activity mode={active === 'project' ? 'visible' : 'hidden'}>
                <ProjectView />
              </Activity>
              
              <Activity mode={active === 'summary' ? 'visible' : 'hidden'}>
                <div className="app-content">
                  <Summary grandTotal={grandTotal} />
                </div>
              </Activity>

              <Activity mode={active === 'wallpanels' ? 'visible' : 'hidden'}>
                <WallPanelsView onGrandTotal={setGrandTotal} />
              </Activity>
              
              {/* 5. Manejamos todas las vistas "Próximamente" */}
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