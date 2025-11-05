// src/app/page.jsx
"use client";

import { useCallback, useState, useMemo, useEffect, useRef } from "react";
import { useLocalStorageJson } from "@/hooks/useLocalStorageJson"; // Ensure alias works or use relative path
import { ProjectProvider } from "@/context/ProjectContext"; // Ensure alias works or use relative path
import { useAuth } from "@/AuthContext";
import Sidebar from "@/components/Sidebar"; // Ensure alias works or use relative path
import WallPanelsView from "@/components/WallPanelsView"; // Ensure alias works or use relative path
import Summary from "@/components/Summary"; // Ensure alias works or use relative path
import ProjectView from "@/components/ProjectView"; // Ensure alias works or use relative path
import LoginView from "@/components/LoginView";

export default function Home() {
  const [ui, setUi] = useLocalStorageJson("inv:v1:ui", {
    collapsed: false,
    active: "project",
    currentProjectId: null, // Initial project ID state
  });
  // Destructure ALL needed values from ui state here
  const { collapsed, active, currentProjectId } = ui;
  const { user, loading: authLoading } = useAuth(); // Get user state from AuthContext
  const prevUserRef = useRef(user);

  const [grandTotal, setGrandTotal] = useState(0); // This might move into context later

  const setActive = useCallback(
    (key) => {
      setUi((prev) => ({ ...prev, active: key }));
    },
    [setUi]
  );

  useEffect(() => {
    // Check if the user state transitioned from logged-out/loading to logged-in
    if (!prevUserRef.current && user) {
      console.log("User logged in, switching to Project view.");
      setActive("project"); // Switch to project view
    }
    // Update the ref for the next render
    prevUserRef.current = user;
  }, [user, setActive]); // Depend on user and setActive

  const setCollapsed = useCallback(
    (val) => {
      setUi((prev) => ({ ...prev, collapsed: !!val }));
    },
    [setUi]
  );

  // Callback to update the currently tracked project ID in UI state
  // This might be triggered by ProjectView or when navigating
  const setCurrentProjectId = useCallback(
    (projectId) => {
      setUi((prev) => ({ ...prev, currentProjectId: projectId }));
    },
    [setUi]
  );

  // Render exactly one tab
  const content = useMemo(() => {
    if (authLoading) {
      return (
        <div className="app-content">
          <div className="ew-card">Loading Authentication...</div>
        </div>
      );
    }

    // If not loading and no user, show LoginView (unless active is 'auth' - handled by sidebar)
    if (!user) {
      return <LoginView />;
    }
    switch (active) {
      case "project": // Add case for ProjectView
        return <ProjectView />; // Needs access to context provided below
      case "summary":
        return (
          <div className="app-content">
            {/* Pass project data if needed */}
            <Summary grandTotal={grandTotal} />
          </div>
        );
      case "wallpanels":
        return <WallPanelsView onGrandTotal={setGrandTotal} />;
      default: // Placeholder for other sections
        return (
          <div className="app-content">
            <div className="ew-card">
              <h2 className="ew-h2" style={{ marginTop: 0 }}>
                {{
                  auth: "Login / Logout",

                  trusses: "Trusses",
                  loose: "Loose Material",
                  labor: "Labor",

                  takeoff: "Takeoff list",
                  quote: "Quote (QuickBooks)",
                  export: "Export",
                  items: "Material List",
                }[active] || "Section"}
              </h2>
              <div className="ew-subtle">Coming soon…</div>
            </div>
          </div>
        );
    }
  }, [active, grandTotal, currentProjectId, user, authLoading]);

  return (
    <ProjectProvider initialProjectId={currentProjectId}>
      <div className={`app-shell ${collapsed ? "sb-collapsed" : ""}`}>
        <Sidebar
          active={active}
          collapsed={collapsed}
          onChange={setActive}
          onCollapsedChange={setCollapsed}
        />
        <main className="app-main">{content}</main>
      </div>
    </ProjectProvider>
  );
}
