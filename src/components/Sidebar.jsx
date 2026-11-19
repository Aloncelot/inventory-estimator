// src/components/Sidebar.jsx
// Navigation with spring motion: the panel width, the active-item pill that
// slides between entries, labels and the theme switch knob all use springs.
'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import FloatingCalc from '@/components/FloatingCalc';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { useAuth } from '@/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useCompany } from '@/context/CompanyContext';
import { roleLabel } from '@/domain/team';
import PresenceBar from '@/components/PresenceBar';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  LogOut, FolderOpen, LayoutDashboard, PanelsTopLeft, Layers, HardHat, ClipboardList, Receipt,
  Package, Sun, Moon, Sparkles, LifeBuoy, History, Users, Eye, Warehouse, LoaderCircle, PanelLeftClose, PanelLeftOpen, Undo2, Redo2, Calculator, Ruler, ScanLine, CalendarRange,
} from 'lucide-react';

const SPRING = { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 };
const SOFT_SPRING = { type: 'spring', stiffness: 260, damping: 28 };

// A Fink (W) roof truss, drawn like the lucide set (24 grid, 2px stroke).
const TrussIcon = ({ size = 18, ...props }) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 18 12 6l10 12z" />
    <path d="M8.7 18 7 12M8.7 18 12 6M15.3 18 12 6M15.3 18 17 12" />
  </svg>
);

const NAV = [
  { key: 'project', label: 'Projects', Icon: FolderOpen },
  { key: 'summary', label: 'Summary', Icon: LayoutDashboard, needsProject: true },
  { key: 'plans', label: 'Plan takeoff', Icon: ScanLine, needsProject: true },
  { key: 'wallpanels', label: 'Wall panels', Icon: PanelsTopLeft, needsProject: true },
  { key: 'loose', label: 'Loose material', Icon: Layers, needsProject: true },
  { key: 'trusses', label: 'Trusses', Icon: TrussIcon, needsProject: true },
  { key: 'layout', label: 'Layout check', Icon: Ruler, needsProject: true },
  { key: 'items', label: 'Price list', Icon: Package },
  { sep: true },
  { key: 'labor', label: 'Labor', Icon: HardHat, needsProject: true },
  { key: 'schedule', label: 'Schedule', Icon: CalendarRange, needsProject: true },
  { key: 'takeoff', label: 'Takeoff list', Icon: ClipboardList, needsProject: true },
  { key: 'quote', label: 'Quote', Icon: Receipt, needsProject: true },
  { key: 'history', label: 'Revisions', Icon: History, needsProject: true },
  { sep: true },
  { key: 'inventory', label: 'Inventory', Icon: Warehouse },
  { key: 'team', label: 'Company & team', Icon: Users },
  { key: 'help', label: 'Help', Icon: LifeBuoy },
];

// Three themes: Light, Quasar (the synthwave dark) and Graphite (a quiet dark).
// Both dark themes keep the .dark class; Graphite adds .graphite on top.
const THEMES = [
  { key: 'light', label: 'Light', Icon: Sun },
  { key: 'quasar', label: 'Quasar', Icon: Sparkles },
  { key: 'graphite', label: 'Graphite', Icon: Moon },
];

function currentTheme() {
  const h = document.documentElement;
  if (!h.classList.contains('dark')) return 'light';
  return h.classList.contains('graphite') ? 'graphite' : 'quasar';
}

function applyTheme(theme) {
  const h = document.documentElement;
  h.classList.toggle('dark', theme !== 'light');
  h.classList.toggle('graphite', theme === 'graphite');
  try { localStorage.setItem('theme', theme); } catch { /* storage blocked */ }
}

function Label({ show, children, className = 'menu-label' }) {
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.span
          className={className}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0, transition: { ...SOFT_SPRING, delay: 0.04 } }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          // leaving labels take no room, so the icons beside them never shift
          style={{ minWidth: 0 }}
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
      {!collapsed && trailing ? <span className={trailing === 'soon' ? 'soon' : 'menu-count'}>{trailing}</span> : null}
      {collapsed && trailing && trailing !== 'soon' ? <span className="menu-dot" aria-label={`${trailing} waiting`} /> : null}
    </motion.button>
  );
}

const TIME_FMT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const isTextField = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function SaveStatus({ status, lastSavedAt, error, collapsed }) {
  if (status === 'readonly') {
    return (
      <span className="save-status is-readonly" title="You can see this project but not change it: editing needs the Estimator role." role="status">
        <Eye size={12} />{collapsed ? null : <span>View only</span>}
      </span>
    );
  }
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
  const { company, companyId, roles, perms } = useCompany();
  // on the Projects item: change orders waiting for an admin, estimates waiting for this person's review
  const [pendingCOs, setPendingCOs] = useState(0);
  const [toReview, setToReview] = useState(0);
  useEffect(() => {
    if (!companyId || !perms?.isAdmin) { setPendingCOs(0); return undefined; }
    const q = query(collection(db, `companies/${companyId}/changeOrders`), where('status', '==', 'pending'));
    return onSnapshot(q, (snap) => setPendingCOs(snap.size), () => setPendingCOs(0));
  }, [companyId, perms?.isAdmin]);
  // on the Inventory item: materials at or under their minimum
  const [reorder, setReorder] = useState(0);
  const invOn = Boolean(company?.inventoryEnabled);
  useEffect(() => {
    if (!companyId || !invOn) { setReorder(0); return undefined; }
    const q = query(collection(db, `companies/${companyId}/stock`), where('belowMin', '==', true));
    return onSnapshot(q, (snap) => setReorder(snap.size), () => setReorder(0));
  }, [companyId, invOn]);
  const uid = user?.uid;
  useEffect(() => {
    if (!companyId || !uid || !(perms?.canEditEstimate || perms?.isAdmin)) { setToReview(0); return undefined; }
    const q = query(collection(db, `companies/${companyId}/reviews`), where('status', '==', 'pending'));
    return onSnapshot(q, (snap) => setToReview(snap.docs.filter((d) => {
      const r = d.data();
      return r.requestedBy?.uid !== uid && (!r.reviewer || r.reviewer.uid === uid);
    }).length), () => setToReview(0));
  }, [companyId, uid, perms?.canEditEstimate, perms?.isAdmin]);
  const {
    saveProject, isSaving, projectId, projectData, saveStatus, saveError, lastSavedAt,
    undo, redo, canUndo, canRedo, presence,
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
  const [theme, setThemeState] = useState('quasar');

  useEffect(() => { setThemeState(currentTheme()); }, []);

  // floating calculator (remembered per browser)
  const [calcOpen, setCalcOpen] = useState(false);
  useEffect(() => { try { setCalcOpen(localStorage.getItem('calc-open') === '1'); } catch { /* storage blocked */ } }, []);
  const toggleCalc = (open) => {
    setCalcOpen(open);
    try { localStorage.setItem('calc-open', open ? '1' : '0'); } catch { /* storage blocked */ }
  };
  const setTheme = (t) => { setThemeState(t); applyTheme(t); };
  const themeIdx = Math.max(0, THEMES.findIndex((t) => t.key === theme));
  const ThemeIcon = THEMES[themeIdx].Icon;
  const nextTheme = THEMES[(themeIdx + 1) % THEMES.length];

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

  // the others with the open project (the menu no longer has Save now: it saves on its own, Ctrl+S still works)
  const others = (presence || []).filter((p) => p.uid !== user?.uid);
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
                trailing={it.soon ? 'soon' : it.key === 'project' && pendingCOs + toReview ? String(pendingCOs + toReview) : it.key === 'inventory' && reorder ? String(reorder) : null}
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
        </nav>

        <div className="side-foot">
          {collapsed ? (
            <motion.button
              type="button"
              className={`ew-icon-btn${calcOpen ? ' is-on' : ''}`}
              onClick={() => toggleCalc(!calcOpen)}
              title={calcOpen ? 'Hide calculator' : 'Show calculator'}
              aria-label="Toggle calculator"
              aria-pressed={calcOpen}
              style={{ alignSelf: 'center' }}
              whileTap={{ scale: 0.85 }}
              transition={SPRING}
            >
              <Calculator size={16} />
            </motion.button>
          ) : (
            <button
              type="button"
              className={`calc-switch${calcOpen ? ' is-on' : ''}`}
              role="switch"
              aria-checked={calcOpen}
              onClick={() => toggleCalc(!calcOpen)}
              title={calcOpen ? 'Hide calculator' : 'Show calculator'}
            >
              <Calculator size={14} />
              <span>Calculator</span>
              <span className="calc-switch__track"><motion.span className="calc-switch__knob" layout transition={SPRING} /></span>
            </button>
          )}
          {collapsed ? (
            <motion.button
              type="button"
              className="ew-icon-btn"
              onClick={() => setTheme(nextTheme.key)}
              title={`${THEMES[themeIdx].label} theme. Switch to ${nextTheme.label}`}
              aria-label={`Switch to ${nextTheme.label} theme`}
              style={{ alignSelf: 'center' }}
              whileTap={{ scale: 0.85, rotate: -30 }}
              transition={SPRING}
            >
              <ThemeIcon size={16} />
            </motion.button>
          ) : (
            <div className="theme-switch" role="group" aria-label="Theme">
              <motion.span className="theme-knob" layout transition={SPRING} style={{ gridColumn: themeIdx + 1 }} />
              {THEMES.map(({ key, label, Icon }, i) => (
                <button key={key} type="button" style={{ gridColumn: i + 1 }} aria-pressed={theme === key} onClick={() => setTheme(key)} title={`${label} theme`}><Icon size={13} /> {label}</button>
              ))}
            </div>
          )}

          {user ? (
            <>
            {!collapsed ? <PresenceBar others={others} collapsed={false} /> : null}
            <div className="side-user">
              {collapsed ? (
                <motion.button type="button" className="avatar" onClick={() => onChange('auth')} title={`${user.email} — sign out`} aria-label="Sign out" whileTap={{ scale: 0.9 }} transition={SPRING}>
                  {initial}
                </motion.button>
              ) : (
                <span className="avatar" aria-hidden="true">{initial}</span>
              )}
              <Label show={!collapsed} className="name">
                <span className="side-user__who">{user.displayName || user.email}</span>
                {company ? <span className="side-user__role" title={company.name}>{roles.map(roleLabel).join(' · ') || 'No role'}</span> : null}
              </Label>
              {!collapsed ? (
                <button type="button" className="ew-icon-btn" style={{ marginLeft: 'auto' }} onClick={() => onChange('auth')} title="Sign out" aria-label="Sign out">
                  <LogOut size={16} />
                </button>
              ) : null}
            </div>
            {collapsed ? <PresenceBar others={others} collapsed /> : null}
            </>
          ) : null}
        </div>
      </motion.aside>
      {typeof document !== 'undefined' ? createPortal(
        <AnimatePresence>{calcOpen ? <FloatingCalc key="calc" onClose={() => toggleCalc(false)} /> : null}</AnimatePresence>,
        document.body
      ) : null}
    </MotionConfig>
  );
}
