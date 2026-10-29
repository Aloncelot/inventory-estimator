// src/components/Sidebar.jsx
// Navigation with spring motion: the panel width, the active-item pill that
// slides between entries, labels and the theme switch knob all use springs.
'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { useAuth } from '@/AuthContext';
import { useProject } from '@/context/ProjectContext';
import {
  LogOut, FolderOpen, LayoutDashboard, PanelsTopLeft, Layers, HardHat, ClipboardList, Receipt,
  Package, Download, Save, Sun, Moon, LoaderCircle, PanelLeftClose, PanelLeftOpen, Undo2, Redo2,
} from 'lucide-react';

const SPRING = { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 };
const SOFT_SPRING = { type: 'spring', stiffness: 260, damping: 28 };

const TrussIcon = ({ size = 18, ...props }) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4 2 20h20L12 4z" />
    <path d="M12 11v9" />
    <path d="M7 20l5-9 5 9" />
  </svg>
);

const NAV = [
  { key: 'project', label: 'Projects', Icon: FolderOpen },
  { key: 'summary', label: 'Summary', Icon: LayoutDashboard, needsProject: true },
  { key: 'wallpanels', label: 'Wall panels', Icon: PanelsTopLeft, needsProject: true },
  { key: 'loose', label: 'Loose material', Icon: Layers, needsProject: true },
  { key: 'trusses', label: 'Trusses', Icon: TrussIcon, needsProject: true },
  { key: 'items', label: 'Material list', Icon: Package },
  { sep: true },
  { key: 'labor', label: 'Labor', Icon: HardHat, soon: true },
  { key: 'takeoff', label: 'Takeoff list', Icon: ClipboardList, soon: true },
  { key: 'quote', label: 'Quote', Icon: Receipt, soon: true },
  { key: 'export', label: 'Export', Icon: Download, soon: true },
];

function applyTheme(dark) {
  document.documentElement.classList.toggle('dark', dark);
  try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* storage blocked */ }
}

function Label({ show, children, className = 'menu-label' }) {
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.span
          className={className}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0, transition: { ...SOFT_SPRING, delay: 0.04 } }}
          exit={{ opacity: 0, x: -8, transition: { duration: 0.08 } }}
        >
          {children}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

function NavItem({ active, disabled, collapsed, onClick, title, Icon, label, trailing }) {
  return (
    <motion.button
      type="button"
      className={`menu-item${active ? ' active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      title={title}
      whileHover={disabled ? undefined : { x: collapsed ? 0 : 3 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={SPRING}
    >
      {active ? <motion.span layoutId="nav-active" className="nav-pill" transition={SPRING} /> : null}
      <span className="menu-ico"><Icon size={18} /></span>
      <Label show={!collapsed}>{label}</Label>
      {!collapsed && trailing ? <span className="soon">{trailing}</span> : null}
    </motion.button>
  );
}

const TIME_FMT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const isTextField = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function SaveStatus({ status, lastSavedAt, error, collapsed }) {
  const text = status === 'saving' ? 'Saving…'
    : status === 'error' ? 'Not saved — retrying'
    : status === 'dirty' ? 'Unsaved changes'
    : lastSavedAt ? `Saved ${TIME_FMT.format(lastSavedAt)}` : 'Saved';
  const title = status === 'error' ? `Save failed: ${error}. Changes are kept and retried automatically.`
    : status === 'dirty' ? 'Changes save automatically in a moment (Ctrl+S saves now)'
    : text;
  return (
    <span className={`save-status is-${status}`} title={title} role="status" aria-live="polite">
      {status === 'saving' ? <LoaderCircle size={11} className="animate-spin" /> : <span className="dot" />}
      {collapsed ? null : <span>{text}</span>}
    </span>
  );
}

export default function Sidebar({ active, onChange, collapsed, onCollapsedChange }) {
  const { user } = useAuth();
  const {
    saveProject, isSaving, projectId, projectData, saveStatus, saveError, lastSavedAt, isDirty,
    undo, redo, canUndo, canRedo,
  } = useProject();

  // Ctrl/Cmd+Z undo, Ctrl+Shift+Z / Ctrl+Y redo. Inside a text field the
  // browser's own undo for that field wins.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      if (isTextField(document.activeElement)) return;
      if (!projectId) return;
      e.preventDefault();
      if (k === 'y' || (k === 'z' && e.shiftKey)) redo(); else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [projectId, undo, redo]);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => { setIsDark(document.documentElement.classList.contains('dark')); }, []);
  const setTheme = (dark) => { setIsDark(dark); applyTheme(dark); };

  // Ctrl/Cmd + S saves the open project
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (projectId && !isSaving) saveProject();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [projectId, isSaving, saveProject]);

  const canSave = Boolean(user && projectId && projectData && !isSaving && (isDirty || saveStatus === 'error'));
  const initial = (user?.displayName || user?.email || 'U')[0].toUpperCase();

  return (
    <MotionConfig reducedMotion="user">
      <motion.aside
        className={`app-side${collapsed ? ' is-collapsed' : ''}`}
        initial={false}
        animate={{ width: collapsed ? 60 : 224 }}
        transition={SOFT_SPRING}
      >
        <div className="side-head">
          <Label show={!collapsed} className="side-brand">{projectData?.name || 'Estimator'}</Label>
          <motion.button
            type="button"
            className="ew-icon-btn side-toggle"
            onClick={() => onCollapsedChange(!collapsed)}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            whileTap={{ scale: 0.9 }}
            transition={SPRING}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </motion.button>
        </div>

        <nav className="side-menu" aria-label="Main">
          {NAV.map((it, i) => {
            if (it.sep) return <div key={`sep${i}`} className="side-sep" />;
            const disabled = it.soon || (it.needsProject && !projectId);
            return (
              <NavItem
                key={it.key}
                active={active === it.key}
                disabled={disabled}
                collapsed={collapsed}
                onClick={() => !disabled && onChange(it.key)}
                title={it.soon ? `${it.label} — coming soon` : disabled ? 'Open a project first' : it.label}
                Icon={it.Icon}
                label={it.label}
                trailing={it.soon ? 'soon' : null}
              />
            );
          })}

          <div className="side-sep" />
          {projectId && projectData ? (
            <div className={`side-tools${collapsed ? ' is-collapsed' : ''}`}>
              <SaveStatus status={saveStatus} lastSavedAt={lastSavedAt} error={saveError} collapsed={collapsed} />
              <motion.button type="button" className="ew-icon-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" whileTap={canUndo ? { scale: 0.85 } : undefined} transition={SPRING}>
                <Undo2 size={16} />
              </motion.button>
              <motion.button type="button" className="ew-icon-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" whileTap={canRedo ? { scale: 0.85 } : undefined} transition={SPRING}>
                <Redo2 size={16} />
              </motion.button>
            </div>
          ) : null}
          <NavItem
            active={false}
            disabled={!canSave}
            collapsed={collapsed}
            onClick={() => canSave && saveProject()}
            title={projectId ? (isDirty ? 'Save now (Ctrl+S) — changes also save automatically' : 'All changes saved') : 'Open a project first'}
            Icon={isSaving ? (p) => <LoaderCircle {...p} className="animate-spin" /> : Save}
            label={isSaving ? 'Saving…' : 'Save now'}
          />
        </nav>

        <div className="side-foot">
          {collapsed ? (
            <motion.button
              type="button"
              className="ew-icon-btn"
              onClick={() => setTheme(!isDark)}
              title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label="Toggle theme"
              style={{ alignSelf: 'center' }}
              whileTap={{ scale: 0.85, rotate: -30 }}
              transition={SPRING}
            >
              {isDark ? <Moon size={16} /> : <Sun size={16} />}
            </motion.button>
          ) : (
            <div className="theme-switch" role="group" aria-label="Theme">
              <motion.span className="theme-knob" layout transition={SPRING} style={{ gridColumn: isDark ? 1 : 2 }} />
              <button type="button" aria-pressed={isDark} onClick={() => setTheme(true)}><Moon size={14} /> Dark</button>
              <button type="button" aria-pressed={!isDark} onClick={() => setTheme(false)}><Sun size={14} /> Light</button>
            </div>
          )}

          {user ? (
            <div className="side-user">
              {collapsed ? (
                <motion.button type="button" className="avatar" onClick={() => onChange('auth')} title={`${user.email} — sign out`} aria-label="Sign out" whileTap={{ scale: 0.9 }} transition={SPRING}>
                  {initial}
                </motion.button>
              ) : (
                <span className="avatar" aria-hidden="true">{initial}</span>
              )}
              <Label show={!collapsed} className="name">{user.displayName || user.email}</Label>
              {!collapsed ? (
                <button type="button" className="ew-icon-btn" style={{ marginLeft: 'auto' }} onClick={() => onChange('auth')} title="Sign out" aria-label="Sign out">
                  <LogOut size={16} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </motion.aside>
    </MotionConfig>
  );
}
