// src/components/ui/AccordionSection.jsx
"use client";

import { useCallback, useState, useId } from "react";
import { motion } from "framer-motion";

export default function AccordionSection({
  title,
  bar,
  summary,
  header,
  actions,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  hideHeaderWhenCollapsed = false,
  children,
  className = "",
}) {
  const isControlled = typeof openProp === "boolean";
  const [uncontrolled, setUncontrolled] = useState(!!defaultOpen);
  const open = isControlled ? openProp : uncontrolled;
  const id = useId();

  const setOpen = useCallback(
    (next) => {
      const value = typeof next === "function" ? next(open) : !!next;
      if (!isControlled) setUncontrolled(value);
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange, open]
  );

  const toggle = useCallback(() => setOpen(!open), [setOpen, open]);

  const resolve = (nodeOrFn) =>
    typeof nodeOrFn === "function" ? nodeOrFn({ open, toggle, id }) : nodeOrFn;

  const barNode = resolve(bar);
  const summaryNode = resolve(summary);
  const headerNode = resolve(header);

  const bodyVariants = {
    open: {
      height: "auto",
      opacity: 1,
      transition: {
        height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
        opacity: { duration: 0.2, delay: 0.1 },
      },
    },
    collapsed: {
      height: 0,
      opacity: 0,
      transition: {
        height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
        opacity: { duration: 0.2 },
      },
    },
  };

  return (
    <section
      className={`acc ${open ? "acc--open" : ""} ${className}`}
      style={{ overflow: "hidden" }}
    >
      {barNode ? (
        <div className="acc__summary">{barNode}</div>
      ) : (
        <>
          {(open || !hideHeaderWhenCollapsed) && (
            <div
              className="acc__header"
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                {open && headerNode ? (
                  headerNode
                ) : (
                  <button
                    type="button"
                    className="acc__button"
                    style={{
                      fontFamily: "var(--font-titles)",
                      color: "var(--turq-200)",
                      fontSize: "18px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px"
                    }}
                    aria-expanded={open}
                    aria-controls={id}
                    onClick={toggle}
                    title={open ? "Collapse" : "Expand"}
                  >
                    <img
                      src={open ? "/icons/down.png" : "/icons/minimize.png"}
                      alt=""
                      width={16}
                      height={16}
                      style={{
                        transition: "transform 0.3s ease",
                        transform: open ? "rotate(0deg)" : "rotate(-90deg)"
                      }}
                    />
                    <span className="acc__title">{title}</span>
                  </button>
                )}
              </div>
              {actions ? <div className="acc__actions">{actions}</div> : null}
            </div>
          )}

          {!open && summaryNode ? (
            <div className="acc__summary">{summaryNode}</div>
          ) : null}
        </>
      )}

      <motion.div
        id={id}
        initial={defaultOpen ? "open" : "collapsed"}
        animate={open ? "open" : "collapsed"}
        variants={bodyVariants}
        className="acc__body"
        style={{ overflow: "hidden" }}
        /* FIX: Usamos el booleano directamente. 
           Si open es true, inert es false (interactivo).
           Si open es false, inert es true (bloqueado).
        */
        inert={!open ? true : undefined}
      >
        <div className="acc__bodyInner" style={{ padding: "1px 0" }}>
          {children}
        </div>
      </motion.div>
    </section>
  );
}