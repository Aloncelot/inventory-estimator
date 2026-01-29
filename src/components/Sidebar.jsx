'use client';

import { useState, useEffect } from "react";
import { useAuth } from "@/AuthContext";
// 1. IMPORTAR EL CONTEXTO DEL PROYECTO
import { useProject } from "@/context/ProjectContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  LogIn,
  FolderOpen,
  LayoutDashboard,
  SquareDashedBottom,
  Layers,
  HardHat,
  ClipboardList,
  Receipt,
  ShoppingCart,
  Download,
  Save,
  Sun,
  Moon,
  Loader2 // Importamos un icono de carga por si acaso, o usamos Save animado
} from 'lucide-react';

// --- 1. Icono Personalizado para "Trusses" ---
const TrussIcon = (props) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3L2 21h20L12 3z" />
    <path d="M12 10v11" />
    <path d="M7 21l5-11 5 11" />
  </svg>
);

// --- 2. Definición de Gradientes ---
const IconGradients = () => (
  <svg width="0" height="0" style={{ position: 'absolute', visibility: 'hidden' }}>
    <defs>
      <linearGradient id="icon-grad-dark" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stopColor="#34d399" />
        <stop offset="100%" stopColor="#64748b" />
      </linearGradient>
      <linearGradient id="icon-grad-light" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stopColor="#14532d" />
        <stop offset="100%" stopColor="#15803d" />
      </linearGradient>
    </defs>
  </svg>
);

const MENU = [
  { key: "auth", label: "Login / Logout", Icon: LogIn },
  { key: "project", label: "Project", Icon: FolderOpen },
  { key: "summary", label: "Summary", Icon: LayoutDashboard },
  { key: "trusses", label: "Trusses", Icon: TrussIcon },
  { key: "wallpanels", label: "Wall Panels", Icon: SquareDashedBottom },
  { key: "loose", label: "Loose Material", Icon: Layers },
  // Secciones Coming Soon
  { key: "labor", label: "Labor", Icon: HardHat, disabled: true },
  { key: "takeoff", label: "Takeoff list", Icon: ClipboardList, disabled: true },
  { key: "quote", label: "Quote (QuickBooks)", Icon: Receipt, disabled: true },
  { key: "items", label: "Material List", Icon: ShoppingCart },
  { key: "export", label: "Export", Icon: Download, disabled: true },
  { key: "save", label: "Save Changes", Icon: Save },
];

export default function Sidebar({
  active,
  onChange,
  collapsed,
  onCollapsedChange
}) {
  const { user } = useAuth();

  // 2. OBTENER FUNCIONES DE GUARDADO
  // Extraemos saveProject y el estado isSaving del contexto
  const { saveProject, isSaving } = useProject();

  // --- Lógica del Tema (Dark/Light) ---
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialDark = stored === 'dark' || (!stored && systemDark);
    setIsDark(initialDark);
    applyTheme(initialDark);
  }, []);

  const applyTheme = (dark) => {
    if (dark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const toggleTheme = () => {
    const newVal = !isDark;
    setIsDark(newVal);
    applyTheme(newVal);
  };

  // --- Animaciones ---
  const sidebarVariants = {
    expanded: { width: 240 },
    collapsed: { width: 68 }
  };

  const textVariants = {
    hidden: { opacity: 0, x: -10, width: 0, display: "none" },
    visible: {
      opacity: 1, x: 0, width: "auto", display: "block",
      transition: { delay: 0.1, duration: 0.2 }
    },
    exit: {
      opacity: 0, x: -10, width: 0, transition: { duration: 0.1 }
    }
  };

  return (
    <motion.aside
      className="app-side"
      initial={false}
      animate={collapsed ? "collapsed" : "expanded"}
      variants={sidebarVariants}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      style={{
        height: '100vh',
        overflow: "hidden",
        whiteSpace: "nowrap",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-800)",
        borderRight: "1px solid var(--border)",
        position: 'relative',
        zIndex: 20
      }}
    >
      <IconGradients />

      {/* --- Toggle Header --- */}
      <div
        className="side-head"
        style={{
          padding: "16px",
          display: "flex",
          justifyContent: collapsed ? "center" : "flex-end",
          alignItems: "center",
          minHeight: "60px",
          flexShrink: 0
        }}
      >
        <button
          className="ew-btn ew-icon-btn"
          onClick={() => onCollapsedChange(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{ background: "transparent", border: "none", color: "var(--text-300)", cursor: "pointer" }}
        >
          {collapsed ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
              <line x1="9" y1="4" x2="9" y2="20"></line>
              <polyline points="15 8 13 10 15 12"></polyline>
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
              <line x1="9" y1="4" x2="9" y2="20"></line>
              <polyline points="13 8 15 10 13 12"></polyline>
            </svg>
          )}
        </button>
      </div>

      {/* --- Menú --- */}
      <nav
        className="side-menu custom-scrollbar"
        style={{ flex: 1, padding: "0 8px", overflowY: "auto", overflowX: "hidden" }}
      >
        {MENU.map((it) => {
          const isActive = active === it.key;
          const isDisabled = it.disabled;
          const isSave = it.key === "save";

          let textColor = "var(--text-300)";
          let cursor = "pointer";
          let fontStyle = "normal";

          if (isActive) {
            textColor = "#e2e8f0";
          } else if (isDisabled) {
            textColor = "var(--text-400)";
            fontStyle = "italic";
            cursor = "not-allowed";
          } else if (isSave) {
            textColor = isSaving ? "var(--turq-400)" : "var(--turq-300)";
          }

          // 3. HANDLER INTELIGENTE
          const handleClick = () => {
            if (isDisabled) return;

            if (isSave) {
              // Si es GUARDAR, ejecutamos la acción y NO navegamos
              saveProject();
            } else {
              // Si es cualquier otro, navegamos normalmente
              onChange(it.key);
            }
          };

          return (
            <button
              key={it.key}
              onClick={handleClick} // Usamos el nuevo handler
              className="menu-item group"
              disabled={isDisabled || (isSave && isSaving)} // Deshabilitar guardar mientras guarda
              title={collapsed ? it.label : ""}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                width: "100%",
                padding: "10px 12px",
                marginBottom: "4px",
                justifyContent: collapsed ? "center" : "flex-start",
                background: "transparent",
                color: textColor,
                cursor: cursor,
                fontStyle: fontStyle,
                border: "none",
                outline: "none"
              }}
              onMouseEnter={(e) => {
                if (!isActive && !isDisabled) e.currentTarget.style.backgroundColor = "var(--bg-750)";
              }}
              onMouseLeave={(e) => {
                if (!isActive && !isDisabled) e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="activeSidebarItem"
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: "8px",
                    backgroundColor: "rgba(30, 58, 58, 0.6)",
                    border: "1px solid rgba(94, 234, 212, 0.15)",
                    zIndex: 0
                  }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}

              <div style={{ position: "relative", zIndex: 1, display: 'flex', alignItems: 'center' }}>
                <div style={{ width: 20, height: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {/* Si es Save y está guardando, mostramos spinner */}
                  {isSave && isSaving ? (
                    <Loader2 size={20} className="animate-spin text-turq-200" />
                  ) : (
                    <it.Icon
                      size={20}
                      style={{
                        stroke: (isActive) ? "#2dd4bf" : (isDisabled ? "currentColor" : "var(--icon-fill, url(#icon-grad-dark))"),
                        opacity: isDisabled ? 0.4 : 1,
                        filter: isActive ? "drop-shadow(0 0 2px rgba(45,212,191,0.3))" : "none"
                      }}
                    />
                  )}
                </div>

                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      className="menu-label"
                      variants={textVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      style={{ marginLeft: "12px", fontSize: "0.95rem", fontWeight: isActive ? 500 : 400 }}
                    >
                      {/* Texto condicional al guardar */}
                      {isSave && isSaving
                        ? "Saving..."
                        : (it.label + (isDisabled ? " (Soon)" : ""))
                      }
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </button>
          );
        })}
      </nav>

      {/* --- Footer --- */}
      <div
        className="side-foot"
        style={{
          marginTop: "auto",
          padding: "16px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg-750)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          flexShrink: 0
        }}
      >
        {/* Switch Tema */}
        <div style={{ display: "flex", justifyContent: collapsed ? "center" : "flex-start" }}>
          {collapsed ? (
            <button
              onClick={toggleTheme}
              className="ew-btn ew-icon-btn"
              title="Toggle Theme"
              style={{ background: "var(--bg-800)", border: "1px solid var(--border)" }}
            >
              {isDark ? <Moon size={18} style={{ fill: "currentColor" }} /> : <Sun size={18} className="text-amber-500" />}
            </button>
          ) : (
            <div
              onClick={toggleTheme}
              style={{
                background: "var(--bg-900)",
                border: "1px solid var(--border)",
                borderRadius: "99px",
                padding: "4px",
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
                position: "relative",
                width: "100%",
                height: "36px"
              }}
            >
              <div style={{ display: "flex", width: "100%", justifyContent: "space-between", padding: "0 8px", position: "absolute", zIndex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Moon size={14} className="text-slate-400" />
                  <span style={{ fontSize: "10px", color: "var(--text-300)" }}>DARK</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: "10px", color: "var(--text-300)" }}>LIGHT</span>
                  <Sun size={14} className="text-amber-500" />
                </div>
              </div>
              <motion.div
                layout
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                style={{
                  width: "50%",
                  height: "26px",
                  background: "var(--bg-750)",
                  borderRadius: "99px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  zIndex: 2,
                  marginLeft: isDark ? "0%" : "50%"
                }}
              />
            </div>
          )}
        </div>

        {/* User Info */}
        {user && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              overflow: "hidden"
            }}
          >
            <div
              style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "var(--turq-300)", color: "#e2e8f0",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: "bold", flexShrink: 0, fontSize: "14px"
              }}
            >
              {user.email ? user.email[0].toUpperCase() : "U"}
            </div>
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  variants={textVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  style={{ marginLeft: "10px", overflow: "hidden" }}
                >
                  <div
                    className="ew-subtle"
                    style={{
                      whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden",
                      color: "var(--text-100)", fontWeight: 500, fontSize: "0.85rem"
                    }}
                    title={user.displayName || user.email}
                  >
                    {user.displayName || "User"}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.aside>
  );
}