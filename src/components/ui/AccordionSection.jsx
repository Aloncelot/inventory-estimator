// src/components/ui/AccordionSection.jsx
// Lightweight collapsible: renders `bar` (or a title button) and the body only
// while open. Kept for compatibility; new sections use GroupBlock in ui/mat.jsx.
'use client';

import { useCallback, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function AccordionSection({
  title, bar, summary, header, actions, defaultOpen = true, open: openProp,
  onOpenChange, hideHeaderWhenCollapsed = false, children, className = '',
}) {
  const isControlled = typeof openProp === 'boolean';
  const [uncontrolled, setUncontrolled] = useState(!!defaultOpen);
  const open = isControlled ? openProp : uncontrolled;
  const id = useId();

  const setOpen = useCallback((next) => {
    const value = typeof next === 'function' ? next(open) : !!next;
    if (!isControlled) setUncontrolled(value);
    onOpenChange?.(value);
  }, [isControlled, onOpenChange, open]);
  const toggle = useCallback(() => setOpen(!open), [setOpen, open]);

  const resolve = (n) => (typeof n === 'function' ? n({ open, toggle, id }) : n);
  const barNode = resolve(bar);

  return (
    <section className={`acc ${open ? 'acc--open' : ''} ${className}`}>
      {barNode ? (
        <div className="acc__summary">{barNode}</div>
      ) : (open || !hideHeaderWhenCollapsed) ? (
        <div className="acc__header">
          {open && header ? resolve(header) : (
            <button type="button" className="acc__button" aria-expanded={open} aria-controls={id} onClick={toggle} title={open ? 'Collapse' : 'Expand'} style={{ width: 'auto', gap: 6, padding: '0 4px' }}>
              <ChevronDown size={16} className={`acc__chev${open ? '' : ' is-closed'}`} />
              <span className="acc__title">{title}</span>
            </button>
          )}
          {actions ? <div className="acc__actions">{actions}</div> : null}
        </div>
      ) : null}
      {!open && summary ? <div className="acc__summary">{resolve(summary)}</div> : null}
      {open ? <div id={id} className="acc__body"><div className="acc__bodyInner">{children}</div></div> : null}
    </section>
  );
}
