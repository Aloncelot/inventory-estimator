// src/components/Sidebar.jsx
'use client';

import { useMemo } from 'react';

const MENU = [
  { key: 'auth',       label: 'Login / Logout',     icon: '🔐' },
  { key: 'project',    label: 'Project',            icon: '📁' },
  { key: 'trusses',    label: 'Trusses',            icon: '🏗️' },
  { key: 'wallpanels', label: 'Wall Panels',        icon: '🧱' }, // the only enabled one for now
  { key: 'loose',      label: 'Loose Material',     icon: '📦' },
  { key: 'labor',      label: 'Labor',              icon: '🛠️' },
  { key: 'summary',    label: 'Summary',            icon: '📊' },
  { key: 'takeoff',    label: 'Takeoff list',       icon: '📄' },
  { key: 'quote',      label: 'Quote (QuickBooks)', icon: '🧾' },
  { key: 'export',     label: 'Export',             icon: '⬇️' },
];

export default function Sidebar({
  active = 'wallpanels',
  collapsed = false,
  onChange,            // (key) => void
  onCollapsedChange,   // (bool) => void
}) {
  const items = useMemo(() => MENU, []);

  const activeIdx = Math.max(
    0,
    items.findIndex(i => i.key === active)
  );

  return (
    <aside className={`sidebar ${collapsed ? 'open' : ''}`}>
      <header>
        <button
          type="button"
          className="sidebar-burger"
          onClick={() => onCollapsedChange?.(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {/* “burger” icon – keep it simple for now */}
          <span aria-hidden>☰</span>
        </button>

        {/* optional logo — replace src as needed */}
        <img src="/favicon.ico" alt="logo" />
      </header>

      <nav
        className="menu"
        // move the left color bar to the active button
        style={{ ['--top']: `${activeIdx === 0 ? 0 : activeIdx * 56}px` }}
        role="navigation"
        aria-label="Main"
      >
        {items.map((it, idx) => {
          const isActive = it.key === active;
          const disabled = !(it.key === 'wallpanels' || it.key === 'summary');
          return (
            <button
              key={it.key}
              type="button"
              className={`menu-item${isActive ? ' active' : ''}${disabled && !isActive ? ' disabled' : ''}`}
              onClick={() => !disabled && onChange?.(it.key)}
              title={it.label}
              aria-current={isActive ? 'page' : undefined}
              aria-disabled={disabled && !isActive ? true : undefined}
            >
              <i aria-hidden className="menu-ico">{it.icon}</i>
              <p className="menu-label">{it.label}</p>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
