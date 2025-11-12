// src/components/ui/AccordionSection.jsx
"use client";
import { Children, useCallback, useEffect, useId, useRef, useState } from "react";

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

  const setOpen = useCallback(
    (next) => {
      const value = typeof next === "function" ? next(open) : !!next;
      if (!isControlled) setUncontrolled(value);
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange, open]
  );

  const toggle = useCallback(() => setOpen(!open), [setOpen, open]);

  // 2. Re-added bodyRef
  const bodyRef = useRef(null);
  const innerRef = useRef(null);
  const id = useId();

  // 3. Re-added the useEffect to manage max-height
  useEffect(() => {
    const el = bodyRef.current;
    const innerEl = innerRef.current;
    if (!el || !innerEl) return;

    let resizeObserver;

    if (open) {
      // --- Al abrir ---
      el.style.maxHeight = `${innerEl.scrollHeight}px`; // Ajustar altura inicial
      el.style.opacity = "1";
      el.setAttribute("aria-hidden", "false");

      // 1. Definimos el callback del observador
      // Esto se disparará CADA VEZ que el tamaño del contenido interno cambie
      const onResize = () => {
        el.style.maxHeight = `${innerEl.scrollHeight}px`;
      };

      // 2. Creamos y activamos el observador
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(innerEl); // Empezamos a observar el div interior

    } else {
      // --- Al cerrar ---
      el.style.maxHeight = "0px";
      el.style.opacity = "0";
      el.setAttribute("aria-hidden", "true");
    }
    
    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect(); // Dejamos de observar
      }
    };
  }, [open]);

  const resolve = (nodeOrFn) =>
    typeof nodeOrFn === "function" ? nodeOrFn({ open, toggle, id }) : nodeOrFn;

  const barNode = resolve(bar);
  const summaryNode = resolve(summary);
  const headerNode = resolve(header);

  return (
    <section className={`acc ${open ? "acc--open" : ""} ${className}`}>
      {barNode ? (
        <div className="acc__summary">{barNode}</div>
      ) : (
        <>
          {(open || !hideHeaderWhenCollapsed) && (
            <div
              className="acc__header"
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flex: 1,
                }}
              >
                {open && headerNode ? (
                  headerNode
                ) : (
                  <button
                    type="button"
                    className="acc__button"
                    style={{
                      fontFamily: "Nova Flat",
                      color: "#59d2c8",
                      fontSize: "18px",
                    }}
                    aria-expanded={open}
                    aria-controls={id}
                    onClick={toggle}
                    title={open ? "Collapse" : "Expand"}
                  >
                    <img
                      src={open ? "/icons/down.png" : "/icons/minimize.png"}
                      alt={open ? "Collapse section" : "Expand section"}
                      width={16}
                      height={16}
                      className="acc__chev"
                      style={{
                        display: "inline-block",
                        verticalAlign: "middle",
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

      {/* 4. Re-added the ref to the body div */}
      <div id={id} ref={bodyRef} className="acc__body">
        <div ref={innerRef} className="acc__bodyInner">{children}</div>
      </div>
    </section>
  );
}