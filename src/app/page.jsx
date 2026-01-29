// src/app/page.jsx
// src/app/page.jsx
'use client';

import { useState, useCallback } from "react";
// Si no tienes este hook personalizado, usa useState normal, pero aquí asumo que existe por tus archivos
import { useLocalStorageJson } from "@/hooks/useLocalStorageJson";

import { ProjectProvider } from "@/context/ProjectContext";
import { useAuth } from "@/AuthContext";

// Componentes
import Sidebar from "@/components/Sidebar";
import LoginView from "@/components/LoginView";
import LogoutView from "@/components/LogoutView";
import ProjectView from "@/components/ProjectView";
import Summary from "@/components/Summary";
import WallPanelsView from "@/components/WallPanelsView";
import TrussesView from "@/components/TrussesView";
import MaterialListView from "@/components/MaterialListView";
import LooseMaterialView from "@/components/LooseMaterialView";

// Vista placeholder para secciones futuras
function ComingSoonView({ title }) {
  return (
    <div className="app-content">
      <div className="ew-card">
        <h2 className="ew-h2" style={{ marginTop: 0 }}>{title}</h2>
        <div className="ew-subtle">This section is coming soon…</div>
      </div>
    </div>
  );
}

export default function Home() {
  const { user, loading: authLoading } = useAuth();

  // Estado de la UI (Persistente en LocalStorage)
  // Si no tienes el hook useLocalStorageJson, cambia esto por:
  // const [ui, setUi] = useState({ active: 'project', collapsed: false });
  const [ui, setUi] = useLocalStorageJson('ui-state', {
    active: 'summary', // Vista por defecto al abrir
    collapsed: false
  });

  // Totales (Estado elevado para el Summary)
  const [wallPanelsTotal, setWallPanelsTotal] = useState(0);
  const [trussTotal, setTrussTotal] = useState(0);

  // Helpers para actualizar UI
  const setActive = (key) => setUi(prev => ({ ...prev, active: key }));
  const setCollapsed = (val) => setUi(prev => ({ ...prev, collapsed: val }));

  const activeKey = ui.active;

  // --- RENDERIZADO DE LA VISTA PRINCIPAL ---
  const renderMainContent = () => {
    switch (activeKey) {
      case 'auth':
        // Aquí está la solución: Si eliges Auth y estás logueado -> Confirmación Logout
        return <LogoutView onCancel={() => setActive('summary')} />;

      case 'project':
        return <ProjectView />;

      case 'summary':
        return <Summary wallPanelsTotal={wallPanelsTotal} trussTotal={trussTotal} />;

      case 'wallpanels':
        return <WallPanelsView onGrandTotal={setWallPanelsTotal} />;

      case 'trusses':
        return <TrussesView onTrussTotal={setTrussTotal} />;

      case 'items':
        return <MaterialListView />;

      case 'loose':
        return <LooseMaterialView />;

      case 'labor':
        return <ComingSoonView title="Labor" />;
      case 'takeoff':
        return <ComingSoonView title="Takeoff List" />;
      case 'quote':
        return <ComingSoonView title="Quote (QuickBooks)" />;
      case 'export':
        return <ComingSoonView title="Export" />;

      default:
        return <Summary wallPanelsTotal={wallPanelsTotal} trussTotal={trussTotal} />;
    }
  };

  return (
    <ProjectProvider>
      <div className="app-container">

        {/* Sidebar siempre visible (controla la navegación) */}
        <Sidebar
          active={activeKey}
          onChange={setActive}
          collapsed={ui.collapsed}
          onCollapsedChange={setCollapsed}
        />

        <main className="app-main">
          {/* 1. Cargando Auth */}
          {authLoading ? (
            <div className="app-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: 100 }}>
              <div className="ew-subtle">Loading session...</div>
            </div>
          )
            // 2. Si NO hay usuario -> Login Forzoso (Ocupa toda la pantalla principal)
            : !user ? (
              <LoginView />
            )
              // 3. Si HAY usuario -> Renderizamos la vista seleccionada
              : (
                <div className="animate-fade-in" style={{ height: '100%' }}>
                  {renderMainContent()}
                </div>
              )}
        </main>

      </div>
    </ProjectProvider>
  );
}