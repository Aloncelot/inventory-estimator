// src/components/ui/Collapsible.jsx
// Spring-animated accordion primitives for Plan Takeoff (tools bar and sub-sections).
'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const BODY_SPRING = { type: 'spring', stiffness: 360, damping: 32, mass: 0.9 };
const CHEVRON_SPRING = { type: 'spring', stiffness: 420, damping: 28 };

/** Persists open/closed state in localStorage when a storageKey is given. */
export function useCollapsible(storageKey, defaultOpen = true) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return defaultOpen;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === '0') return false;
      if (saved === '1') return true;
    } catch { /* private mode / SSR */ }
    return defaultOpen;
  });
  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (storageKey) {
        try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* private mode */ }
      }
      return next;
    });
  }, [storageKey]);
  return [open, toggle, setOpen];
}

/** Animated arrow icon: points down when closed, rotates smoothly to point up when open. */
export function SpringChevron({ open, size = 15 }) {
  return (
    <motion.span
      className="cl-chev"
      animate={{ rotate: open ? 180 : 0 }}
      transition={CHEVRON_SPRING}
      aria-hidden="true"
    >
      <ChevronDown size={size} />
    </motion.span>
  );
}

/** Spring-animated height/opacity wrapper for any collapsible content. */
export function CollapsibleBody({ open, children, className = '' }) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="body"
          className={`cl-body${className ? ` ${className}` : ''}`}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={BODY_SPRING}
          style={{ overflow: 'hidden' }}
        >
          <div className="cl-body__inner">{children}</div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Collapsible sub-section card (.ot-panel) with a spring-animated arrow button
 * and body. Header actions stay clickable without toggling the accordion.
 */
export function CollapsiblePanel({ title, subtitle, actions, storageKey, defaultOpen = true, children }) {
  const [open, toggle] = useCollapsible(storageKey, defaultOpen);
  return (
    <section className={`ot-panel${open ? '' : ' is-collapsed'}`}>
      <div className="ot-head cl-head">
        <button
          type="button"
          className="cl-trigger"
          onClick={toggle}
          aria-expanded={open}
          title={open ? `Hide ${title}` : `Show ${title}`}
        >
          <SpringChevron open={open} />
          <strong>{title}</strong>
        </button>
        {subtitle ? <span className="ew-subtle">{subtitle}</span> : null}
        {actions ? <span className="ot-add">{actions}</span> : null}
      </div>
      <CollapsibleBody open={open}>{children}</CollapsibleBody>
    </section>
  );
}
