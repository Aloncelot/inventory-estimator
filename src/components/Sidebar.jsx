// src/components/Sidebar.jsx
"use client";

import { useMemo } from "react";

const MENU = [
  { key: "auth", label: "Login / Logout", icon: "/icons/login.png" },
  { key: "project", label: "Project", icon: "/icons/files.png" },
  { key: "trusses", label: "Trusses", icon: "/icons/roof.png" },
  { key: "wallpanels", label: "Wall Panels", icon: "/icons/wood.png" }, // Enabled one
  { key: "loose", label: "Loose Material", icon: "/icons/loose.png" },
  { key: "labor", label: "Labor", icon: "/icons/worker.png" },
  { key: "summary", label: "Summary", icon: "/icons/search.png" }, // Enabled one
  { key: "takeoff", label: "Takeoff list", icon: "/icons/list.png" },
  { key: "quote", label: "Quote (QuickBooks)", icon: "/icons/dollar.png" },
  { key: "export", label: "Export", icon: "/icons/download.png" },
];

export default function Sidebar({
  active = "wallpanels",
  collapsed = false,
  onChange, // (key) => void
  onCollapsedChange, // (bool) => void
}) {
  const items = useMemo(() => MENU, []);

  const activeIdx = Math.max(
    0,
    items.findIndex((i) => i.key === active)
  );

  return (
    <aside className={`sidebar ${collapsed ? "open" : ""}`}>
      <header>
        <button
          type="button"
          className="sidebar-burger"
          onClick={() => onCollapsedChange?.(!collapsed)}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {/* “burger” icon – keep it simple for now */}
          <img
            src="/icons/menu.png"
            alt={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            width={24} // Adjust size as needed
            height={24} // Adjust size as needed
            aria-hidden
          />
        </button>
      </header>
      <nav
        className="menu"
        // move the left color bar to the active button
        style={{ ["--top"]: `${6 + activeIdx * 56}px` }}
        role="navigation"
        aria-label="Main"
      >
        {items.map((it, idx) => {
          const isActive = it.key === active;
          const disabled = !(it.key === "wallpanels" || it.key === "summary");
          return (
            <button
              key={it.key}
              type="button"
              className={`menu-item${isActive ? " active" : ""}${
                disabled && !isActive ? " disabled" : ""
              }`}
              onClick={() => !disabled && onChange?.(it.key)}
              title={it.label}
              aria-current={isActive ? "page" : undefined}
              aria-disabled={disabled && !isActive ? true : undefined}
            >
              <img
                src={it.icon}
                alt={it.label} // Use label for alt text
                width={20} // Set desired width
                height={20} // Set desired height
                className="menu-ico" // Keep class for styling
                aria-hidden // Hide decorative image from screen readers (button has label)
              />
              <p className="menu-label">{it.label}</p>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
