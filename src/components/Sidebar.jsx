// src/components/Sidebar.jsx
"use client";

import { useMemo } from "react";
import { useProject } from "@/context/ProjectContext";
import { useAuth } from "@/AuthContext";

const MENU = [
  { key: "auth", label: "Login / Logout", icon: "/icons/login.png" },
  { key: "project", label: "Project", icon: "/icons/files.png" },
  { key: "summary", label: "Summary", icon: "/icons/search.png" },
  { key: "trusses", label: "Trusses", icon: "/icons/line-chart.png" },
  { key: "wallpanels", label: "Wall Panels", icon: "/icons/framing.png" },
  { key: "loose", label: "Loose Material", icon: "/icons/loose.png" },
  { key: "labor", label: "Labor", icon: "/icons/worker.png" },
  { key: "takeoff", label: "Takeoff list", icon: "/icons/list.png" },
  { key: "quote", label: "Quote (QuickBooks)", icon: "/icons/dollar.png" },
  { key: "items", label: "Material List", icon: "/icons/trolley.png" },
  { key: "export", label: "Export", icon: "/icons/download.png" },
  { key: "save", label: "Save", icon: "/icons/save.png" },
  { key: "mode", label: "Light Mode", icon: "/icons/brightness.png" },
];

export default function Sidebar({
  active = "wallpanels",
  collapsed = false,
  onChange, 
  onCollapsedChange, 
}) {
  const { user, signIn, signOutUser } = useAuth();
  const { saveProject, isSaving, projectData, projectId } = useProject();

  const items = useMemo(() => MENU, []);

  const activeVisualIdx = items.findIndex((i) => i.key === active);
  const topOffset = 6 + (activeVisualIdx >= 0 ? activeVisualIdx * 56 : 0);

  const canSave = !!user && !!projectId && !!projectData && !isSaving;
  const alwaysVisibleKeys = ["auth", "project", "mode"];

  const handleItemClick = (item) => {

    if (item.key === "save") {
      if (canSave) {
        saveProject();
      }
      return; // Don't navigate
    }
    if (item.key === "mode") {
      console.log("Toggle theme clicked");
      return; // Don't navigate
    }
    if (item.key === "auth") {
      if (user) {
        signOutUser();
      } else {
        signIn();
      }
      return; // Don't navigate
    }

    onChange?.(item.key);
  };

  return (
    <aside className={`sidebar ${collapsed ? "open" : ""}`}>
      <header>
        <button
          type="button"
          className="sidebar-burger"
          onClick={() => onCollapsedChange?.(!collapsed)}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <img
            src="/icons/menu.png"
            alt={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            width={24}
            height={24}
            aria-hidden
          />
        </button>
      </header>

      <nav
        className="menu"
        style={{ ["--top"]: `${topOffset}px` }}
        role="navigation"
        aria-label="Main"
      >
        {items.map((it, idx) => {
          const isActive =
            it.key === active && !["save", "mode", "auth"].includes(it.key);

          const comingSoonKeys = [
            "loose",
            "labor",
            "takeoff",
            "quote",
            "export",
            "items",
          ];

          let isDisabled = false;
          let titleText = it.label;

          if (comingSoonKeys.includes(it.key)) {
            isDisabled = true;
            titleText = "Coming soon...";
          } else if (it.key === "save") {
            isDisabled = !canSave;
            if (isSaving) titleText = "Saving...";
            else if (!projectId) titleText = "Load or create a project to save";
          } else if (alwaysVisibleKeys.includes(it.key)) {
            isDisabled = false;
          } else {
            isDisabled = !user || !projectId;
            if (isDisabled && user && !projectId) {
              titleText = "Load or create a project to view this section";
            }
          }

          let labelText = it.label;
          if (it.key === "save" && isSaving) {
            labelText = "Saving...";
          }
          if (it.key === "auth") {
            labelText = user ? "Logout" : "Login";
          }

          return (
            <button
              key={it.key}
              type="button"
              className={`menu-item ${isActive ? " active" : ""} ${
                isDisabled ? " disabled" : ""
              }`}
              onClick={() => !isDisabled && handleItemClick(it)}
              title={titleText} 
              aria-current={isActive ? "page" : undefined}
              aria-disabled={isDisabled ? true : undefined}
            >
              <img
                src={it.icon}
                alt=""
                width={20}
                height={20}
                className="menu-ico"
                aria-hidden
              />
              <p className="menu-label">{labelText}</p>
            </button>
          );
        })}
      </nav>
      <div
        className="side-foot"
        style={{
          marginTop: "auto",
          textAlign: collapsed ? "center" : "left",
          padding: collapsed ? "10px 0" : "10px",
        }}
      >
        {user && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              gap: "8px",
              padding: "0 10px",
            }}
          >
            {!collapsed && (
              <span
                className="ew-subtle"
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={user.displayName || user.email}
              >
                {user.displayName || user.email}
              </span>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
