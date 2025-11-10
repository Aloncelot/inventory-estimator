// src/components/PanelNails.jsx
"use client";

import React, {
  Fragment,
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
  memo,
} from "react";
import ItemPicker from "@/components/ItemPicker";
import AccordionSection from "./ui/AccordionSection";
import { useLocalStorageJson } from "../hooks/useLocalStorageJson";
import { unitPriceFrom } from "@/domain/lib/parsing";

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);

const deref = (x) => (x && x.item ? deref(x.item) : x);
const getItem = (s) => deref(s);
const getUnit = (s) => deref(s)?.unit || deref(s)?.raw?.unit || "box";

// Row: stable, avoids re-render unless real numbers change
const Row = memo(
  function Row({ label, picker, row, hint, wasteEditor }) {
    const GRID_COLS =
      "minmax(220px,1.3fr) 3.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr 1.6fr 0.8fr";
    return (
      <Fragment>
        <div className="ew-grid ew-row" style={{ "--cols": GRID_COLS }}>
          <div>{label}</div>
          <div>
            {picker}
            {hint ? (
              <div className="ew-hint" style={{ marginTop: 6 }}>
                {hint}
              </div>
            ) : null}
          </div>
          <div className="ew-right">{Math.ceil(row.qtyRaw || 0)}</div>
          <div className="ew-right">{wasteEditor ?? row.wastePct}</div>
          <div className="ew-right">{row.qtyFinal ?? "—"}</div>
          <div className="ew-right">{row.unit || "—"}</div>
          <div className="ew-right ew-money">
            {row.unitPrice ? fmtMoney(row.unitPrice) : "—"}
          </div>
          <div className="ew-right ew-money">
            {row.subtotal ? fmtMoney(row.subtotal) : "—"}
          </div>
          <div></div>
          <div></div>
        </div>
      </Fragment>
    );
  },
  (prev, next) => {
    const a = prev.row || {};
    const b = next.row || {};
    return (
      prev.label === next.label &&
      prev.hint === next.hint &&
      prev.picker === next.picker &&
      a.qtyRaw === b.qtyRaw &&
      a.qtyFinal === b.qtyFinal &&
      a.unit === b.unit &&
      a.unitPrice === b.unitPrice &&
      a.subtotal === b.subtotal &&
      a.wastePct === b.wastePct
    );
  }
);

function PanelNailsComponent({
  // Renamed temporarily to avoid conflict with memo export
  title = "Panels — Nails (this level)",
  persistKey = "panel-nails-default", // Added default persistKey
  // strictly per-level numeric inputs (PANELS ONLY; nothing from Loose)
  totalPanelSheets = 0, // Total sheets ON PANELS (Ext + Int Shear)
  totalBottomPlatePiecesPanel = 0, // Total BOTTOM plates (PT+NonPT) on panels
  ptPlatePiecesPanels, // PT plate boards used on panels (preferred prop)
  panelPtBoards, // legacy/alternate name — we'll normalize below
  onTotalChange, // optional
}) {
  // State for accordion collapse using local storage
  const [uiState, setUiState] = useLocalStorageJson(`inv:v1:${persistKey}:ui`, {
    collapsed: true,
  }); // Default to collapsed
  const collapsed = !!uiState.collapsed;
  const setCollapsed = useCallback(
    (isCollapsed) => {
      setUiState((prev) => ({ ...prev, collapsed: !!isCollapsed }));
    },
    [setUiState]
  );

  const ptBoards = useMemo(
    () => Number(ptPlatePiecesPanels ?? panelPtBoards ?? 0),
    [ptPlatePiecesPanels, panelPtBoards]
  );

  // local item selections only
  const [sel, setSel] = useState({
    nailsSheath: null, // Bright Ring Coil 8D-2-3/8x.113-2.7M
    nailsFrame8d: null, // Galvanized Ring Coil 8D-2-3/8"
    nailsFrame12d: null, // Bright Common Coil 12D-3-1/4x.120-2.5M
  });

  const pick = useCallback(
    (k) => (v) => {
      setSel((p) => (p[k] === v ? p : { ...p, [k]: v }));
    },
    []
  );

  // per-row editable waste %
  const [waste, setWaste] = useState({
    sheath: 40,
    frame8d: 40,
    frame12d: 40,
  });

  const panelSheets = useMemo(
    () => Number(totalPanelSheets || 0),
    [totalPanelSheets]
  );

  // ---- calcs (memo) ----
  const rowSheath = useMemo(() => {
    const qtyRaw = ((Number(totalPanelSheets) || 0) * 80) / 2700;
    const pct = Number(waste.sheath ?? 40);
    const qtyFinal = Math.ceil(qtyRaw * (1 + pct / 100));
    const unit = getUnit(sel.nailsSheath);
    const item = getItem(sel.nailsSheath);
    const unitPrice = unitPriceFrom(item);
    const subtotal = qtyFinal * (Number(unitPrice) || 0);
    return { qtyRaw, qtyFinal, unit, item, unitPrice, subtotal, wastePct: pct };
  }, [totalPanelSheets, sel.nailsSheath, waste.sheath]);

  const rowFrame8d = useMemo(() => {
    const boards = ptBoards;
    const qtyRaw = (boards * 25) / 2700;
    const pct = Number(waste.frame8d ?? 40);
    const qtyFinal = Math.ceil(qtyRaw * (1 + pct / 100));
    const unit = getUnit(sel.nailsFrame8d);
    const item = getItem(sel.nailsFrame8d);
    const unitPrice = unitPriceFrom(item);
    const subtotal = qtyFinal * (Number(unitPrice) || 0);
    return {
      boards,
      qtyRaw,
      qtyFinal,
      unit,
      item,
      unitPrice,
      subtotal,
      wastePct: pct,
    };
  }, [ptBoards, sel.nailsFrame8d, waste.frame8d]);

  const rowFrame12d = useMemo(() => {
    const boards = Number(totalBottomPlatePiecesPanel) || 0;
    const qtyRaw = (boards * 80) / 2500;
    const pct = Number(waste.frame12d ?? 40);
    const qtyFinal = Math.ceil(qtyRaw * (1 + pct / 100));
    const unit = getUnit(sel.nailsFrame12d);
    const item = getItem(sel.nailsFrame12d);
    const unitPrice = unitPriceFrom(item);
    const subtotal = qtyFinal * (Number(unitPrice) || 0);
    return {
      boards,
      qtyRaw,
      qtyFinal,
      unit,
      item,
      unitPrice,
      subtotal,
      wastePct: pct,
    };
  }, [totalBottomPlatePiecesPanel, sel.nailsFrame12d, waste.frame12d]);

  // section subtotal (guarded emit)
  const sectionTotal = useMemo(
    () =>
      (rowSheath.subtotal || 0) +
      (rowFrame8d.subtotal || 0) +
      (rowFrame12d.subtotal || 0),
    [rowSheath.subtotal, rowFrame8d.subtotal, rowFrame12d.subtotal]
  );
  const onTotalRef = useRef(onTotalChange);
  useEffect(() => {
    onTotalRef.current = onTotalChange;
  }, [onTotalChange]);
  const lastSentRef = useRef(null);
  useEffect(() => {
    const t = Number(sectionTotal) || 0;
    if (t !== lastSentRef.current) {
      lastSentRef.current = t;
      onTotalRef.current?.({ total: t });
    }
  }, [sectionTotal]);

  // memo pickers (stable nodes)
  const pickerSheath = useMemo(
    () => (
      <ItemPicker
        compact
        onSelect={pick("nailsSheath")}
        defaultVendor="Concord"
        defaultFamilyLabel="Bright Ring Coil"
        defaultSizeLabel={`8D-2-3/8x.113-2.7M`}
      />
    ),
    [pick]
  );
  const picker8d = useMemo(
    () => (
      <ItemPicker
        compact
        onSelect={pick("nailsFrame8d")}
        defaultVendor="Concord"
        defaultFamilyLabel="Galvanized Ring Coil"
        defaultSizeLabel={`8D-2-3/8"`}
      />
    ),
    [pick]
  );
  const picker12d = useMemo(
    () => (
      <ItemPicker
        compact
        onSelect={pick("nailsFrame12d")}
        defaultVendor="Concord"
        defaultFamilyLabel="Bright Common Coil"
        defaultSizeLabel={`12D-3-1/4x.120-2.5M`}
      />
    ),
    [pick]
  );

  // hints
  const hintSheath = useMemo(
    () =>
      `Panel sheets (Ext + Int Shear): ${totalPanelSheets} → boxes = ceil(((sheets × 80) / 2700) × (1 + waste%))`,
    [totalPanelSheets]
  );
  const hint8d = useMemo(
    () =>
      `PT plate boards (panels): ${ptBoards} → boxes = ceil(((boards × 25) / 2700) × (1 + waste%))`,
    [ptBoards]
  );
  const hint12d = useMemo(
    () =>
      `Bottom plate boards (panels): ${totalBottomPlatePiecesPanel} → boxes = ceil(((boards × 80) / 2500) × (1 + waste%))`,
    [totalBottomPlatePiecesPanel]
  );

  return (
    <div className="ew-card">
      {/* Use AccordionSection */}
      <AccordionSection
        open={!collapsed}
        onOpenChange={(isOpen) => setCollapsed(!isOpen)}
        // Use bar prop for header
        bar={({ open, toggle }) => (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
            }}
          >
            {/* Button with image indicator */}
            <button
              type="button"
              className="acc__button"
              style={{
                fontFamily: "Nova Flat",
                fontWeight: "700",
                color: "#59d2c8",
                fontSize: "18px",
              }}
              onClick={toggle}
              aria-expanded={open}
              title={open ? "Collapse" : "Expand"}
            >
              <img
                src={open ? "/icons/minimize.png" : "/icons/down.png"}
                alt={open ? "Collapse section" : "Expand section"}
                width={18}
                height={18}
                className="acc__chev"
                style={{
                  display: "inline-block",
                  verticalAlign: "middle",
                }}
              />{" "}
              {title}
            </button>
            <div
              className="ew_right"
              style={{
                marginLeft: "auto",
                fontFamily: "Nova Flat",
                fontSize: "16px",
                color: "#f18d5b",
                fontWeight: "700",
              }}
            >
              Subtotal: {fmtMoney(sectionTotal)}
            </div>
          </div>
        )}
      >
        {/* Content goes inside the AccordionSection */}
        <div
          className="ew-grid ew-head"
          style={{
            "--cols":
              "minmax(220px,1.3fr) 3.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr 1.6fr 0.8fr",
          }}
        >
          <div>Item</div>
          <div>Vendor · Family · Size</div>
          <div className="ew-right">Qty</div>
          <div className="ew-right">Waste %</div>
          <div className="ew-right">Final qty</div>
          <div className="ew-right">Unit</div>
          <div className="ew-right">Unit price</div>
          <div className="ew-right">Subtotal</div>
          <div></div>
          <div></div>
        </div>

        <div className="ew-rows">
          <Row
            label="Framing nails (8D)"
            row={rowFrame8d}
            picker={picker8d}
            hint={hint8d}
            wasteEditor={
              <input
                className="ew-input focus-anim"
                type="number"
                inputMode="decimal"
                value={waste.frame8d}
                onChange={(e) =>
                  setWaste((w) => ({
                    ...w,
                    frame8d: Number(e.target.value) || 0,
                  }))
                }
                style={{ width: 80, padding: 6, textAlign: "right" }}
                title="Waste %"
              />
            }
          />
          <Row
            label="Sheathing nails"
            row={rowSheath}
            picker={pickerSheath}
            hint={hintSheath}
            wasteEditor={
              <input
                className="ew-input focus-anim"
                type="number"
                inputMode="decimal"
                value={waste.sheath}
                onChange={(e) =>
                  setWaste((w) => ({
                    ...w,
                    sheath: Number(e.target.value) || 0,
                  }))
                }
                style={{ width: 80, padding: 6, textAlign: "right" }}
                title="Waste %"
              />
            }
          />
          <Row
            label="Framing nails (12D)"
            row={rowFrame12d}
            picker={picker12d}
            hint={hint12d}
            wasteEditor={
              <input
                className="ew-input focus-anim"
                type="number"
                inputMode="decimal"
                value={waste.frame12d}
                onChange={(e) =>
                  setWaste((w) => ({
                    ...w,
                    frame12d: Number(e.target.value) || 0,
                  }))
                }
                style={{ width: 80, padding: 6, textAlign: "right" }}
                title="Waste %"
              />
            }
          />
        </div>
      </AccordionSection>
    </div>
  );
}

// Export the memoized component with the original name
const PanelNails = memo(
  PanelNailsComponent,
  (a, b) =>
    a.totalPanelSheets === b.totalPanelSheets &&
    a.totalBottomPlatePiecesPanel === b.totalBottomPlatePiecesPanel &&
    (a.ptPlatePiecesPanels ?? a.panelPtBoards ?? 0) ===
      (b.ptPlatePiecesPanels ?? b.panelPtBoards ?? 0) &&
    a.title === b.title &&
    a.persistKey === b.persistKey // Added persistKey check
);

export default PanelNails;