// src/components/ui/AccordionSection.jsx
"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";

export default function AccordionSection({
  title,
  bar,
  summary, // node or (ctx)=>node  (shown only when collapsed)
  header, // node or (ctx)=>node  (shown only when expanded)
  actions,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  hideHeaderWhenCollapsed = false, // ignored if `bar` is provided
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

  const bodyRef = useRef(null);
  const id = useId();

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const h = el.scrollHeight;
    el.style.maxHeight = open ? `${h}px` : "0px";
    el.style.opacity = open ? "1" : "0";
    el.setAttribute("aria-hidden", open ? "false" : "true");
  }, [open, children]);

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
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {open && headerNode ? (
                  headerNode
                ) : (
                  <button
                    type="button"
                    className="acc__button"
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

      <div id={id} ref={bodyRef} className="acc__body">
        <div className="acc__bodyInner">{children}</div>
      </div>
    </section>
  );
}
