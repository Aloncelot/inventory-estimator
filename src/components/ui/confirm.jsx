// src/components/ui/confirm.jsx
// App-styled replacement for window.confirm():
//   const confirm = useConfirm();
//   if (await confirm({ title, message, confirmLabel, tone: 'danger' })) { ... }
'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, HelpCircle } from 'lucide-react';

const ConfirmContext = createContext(null);
const SPRING = { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 };

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null); // { title, message, confirmLabel, cancelLabel, tone, resolve }

  const confirm = useCallback((opts = {}) => new Promise((resolve) => {
    setReq({ title: 'Are you sure?', confirmLabel: 'Confirm', cancelLabel: 'Cancel', tone: 'default', ...opts, resolve });
  }), []);

  const close = useCallback((answer) => {
    setReq((cur) => { cur?.resolve(answer); return null; });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {typeof document !== 'undefined' ? createPortal(
        <AnimatePresence>{req ? <ConfirmDialog key="confirm" req={req} onClose={close} /> : null}</AnimatePresence>,
        document.body
      ) : null}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ req, onClose }) {
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);
  const danger = req.tone === 'danger';

  useEffect(() => {
    const prev = document.activeElement;
    // destructive actions focus "Cancel" so Enter never deletes by accident
    (danger ? cancelRef : confirmRef).current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(false); }
      if (e.key === 'Tab') {
        const els = [cancelRef.current, confirmRef.current].filter(Boolean);
        const i = els.indexOf(document.activeElement);
        e.preventDefault();
        els[(i + (e.shiftKey ? -1 : 1) + els.length) % els.length]?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [danger, onClose]);

  const Icon = danger ? AlertTriangle : HelpCircle;

  return (
    <motion.div
      className="cf-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(false); }}
    >
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cf-title"
        aria-describedby={req.message ? 'cf-msg' : undefined}
        className={`cf-dialog${danger ? ' is-danger' : ''}`}
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 6, transition: { duration: 0.12 } }}
        transition={SPRING}
      >
        <div className="cf-head">
          <span className="cf-icon"><Icon size={18} /></span>
          <h2 id="cf-title" className="cf-title">{req.title}</h2>
        </div>
        {req.message ? <p id="cf-msg" className="cf-msg">{req.message}</p> : null}
        <div className="cf-actions">
          {req.cancelLabel ? (
            <button ref={cancelRef} type="button" className="ew-btn" onClick={() => onClose(false)}>{req.cancelLabel}</button>
          ) : null}
          <button
            ref={confirmRef}
            type="button"
            className={`ew-btn ${danger ? 'ew-btn--danger' : 'ew-btn--primary'}`}
            onClick={() => onClose(true)}
          >
            {req.confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  // falls back to the browser dialog if a component renders outside the provider
  return ctx || (async ({ title, message }) => window.confirm([title, message].filter(Boolean).join('\n\n')));
}
