// src/components/NailsAndBracing.jsx
"use client";

import React, {
  Fragment,
  useMemo,
  useState, // For local input state
  useEffect,
  useEffectEvent, // The new hook
  useCallback,
  memo,
} from "react";
import ItemPicker from "@/components/ItemPicker";
import { unitPriceFrom } from "@/domain/lib/parsing";
import AccordionSection from "@/components/ui/AccordionSection";

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);

// --- Helpers ---
const deref = (x) => (x && x.item ? x.item : x);
const getItem = (s) => deref(s);
const getUnit = (s) => deref(s)?.unit || deref(s)?.raw?.unit || "box";
const getSize = (s) =>
  deref(s)?.sizeLabel ||
  deref(s)?.sizeDisplay ||
  deref(s)?.raw?.sizeDisplay ||
  "";
const getFamily = (selLike) => {
  const it = selLike;
  return String(
    it?.familyLabel ??
      it?.familyDisplay ??
      it?.raw?.familyDisplay ??
      it?.raw?.familyLabel ??
      it?.family ??
      ""
  ).toLowerCase();
};
/* ----------------- */

const GRID_COLS =
  "minmax(220px,1.3fr) 3.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr 1.6fr 0.8fr";

const Row = memo(
  function Row({ label, picker, row, hint, wasteEditor }) {
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
          <div className="ew-right">
            {wasteEditor ?? (row ? row.wastePct : 0)}
          </div>
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
    // This shallow comparison is imperfect but good enough here
    return (
      prev.label === next.label &&
      prev.hint === next.hint &&
      prev.picker === next.picker &&
      prev.row === next.row &&
      prev.wasteEditor === next.wasteEditor
    );
  }
);

export default function NailsAndBracing({
  title = "General — Nails & bracing (all levels)",
  data,
  onChange, // This is a stable function: (updaterFn) => void
  totals = {},
}) {
  const {
    panelsAll = 0,
    platePiecesAll = 0,
    ptPiecesAll = 0,
    sheetsExtAll = 0,
    sheetsBandAll = 0,
    sheetsExtraAll = 0,
  } = totals;

  const {
    collapsed = true,
    sel = {
      nailsConcrete: null,
      nailsSheathing: null,
      nailsFraming: null,
      tempBracing: null,
    },
    waste = {
      nailsConcrete: 40,
      nailsSheathing: 40,
      nailsFraming: 40,
      tempBracing: 0,
    },
  } = data || {};

  // --- START: Input Optimization ---
  const [localWaste, setLocalWaste] = useState(waste);

  useEffect(() => {
    // When props change, merge them into localWaste,
    // ensuring defaults are kept if a key is missing
    setLocalWaste(prev => ({
        nailsConcrete: waste.nailsConcrete ?? prev.nailsConcrete ?? 40,
        nailsSheathing: waste.nailsSheathing ?? prev.nailsSheathing ?? 40,
        nailsFraming: waste.nailsFraming ?? prev.nailsFraming ?? 40,
        tempBracing: waste.tempBracing ?? prev.tempBracing ?? 0,
    }));
  }, [waste]);


  const handleLocalWasteChange = useCallback((key, e) => {
    setLocalWaste((prev) => ({ ...prev, [key]: e.target.value }));
  }, []);

  const commitWasteChange = useCallback(
    (key, valueToCommit) => {
      const numericValue = Number(valueToCommit) || 0;
      onChange((prev) => ({
        ...prev,
        waste: { ...(prev.waste || {}), [key]: numericValue },
      }));
      setLocalWaste((prev) => ({ ...prev, [key]: numericValue }));
    },
    [onChange]
  );

  const handleWasteBlur = useCallback(
    (key, e) => {
      commitWasteChange(key, e.target.value);
    },
    [commitWasteChange]
  );

  const handleWasteKeyDown = useCallback(
    (key, e) => {
      if (e.key === "Enter") {
        commitWasteChange(key, e.target.value);
        e.target.blur();
      } else if (e.key === "Escape") {
        // On escape, revert local state to the prop state
        setLocalWaste(waste);
        e.target.blur();
      }
    },
    [commitWasteChange, waste]
  );
  // --- END: Input Optimization ---

  const setCollapsed = useCallback(
    (isOpen) => {
      onChange((prev) => ({ ...prev, collapsed: !isOpen }));
    },
    [onChange]
  );

  const setSel = useCallback(
    (k, v) => {
      onChange((prev) => ({ ...prev, sel: { ...(prev.sel || {}), [k]: v } }));
    },
    [onChange]
  );

  const onConcreteSelect = useCallback((val) => setSel("nailsConcrete", val), [
    setSel,
  ]);
  const onSheathingSelect = useCallback((val) => setSel("nailsSheathing", val), [
    setSel,
  ]);
  const onFramingSelect = useCallback((val) => setSel("nailsFraming", val), [
    setSel,
  ]);
  const onBracingSelect = useCallback((val) => setSel("tempBracing", val), [
    setSel,
  ]);

  // --- Calculations (useMemo) ---
  const allSheetsLoose = useMemo(
    () => Number(sheetsBandAll) + Number(sheetsExtraAll),
    [sheetsBandAll, sheetsExtraAll]
  );

  const concrete = useMemo(() => {
    const basePieces = Number(ptPiecesAll) || 0;
    const qtyRaw = (basePieces * 25) / 100;
    const pct = Number(waste.nailsConcrete ?? 40);
    const qtyFinal = Math.ceil(qtyRaw * (1 + pct / 100));
    const unit = getUnit(sel.nailsConcrete) || "box";
    const item = getItem(sel.nailsConcrete);
    const unitPrice = unitPriceFrom(item);
    const subtotal = qtyFinal * (Number(unitPrice) || 0);
    return { qtyRaw, qtyFinal, unit, item, unitPrice, subtotal, wastePct: pct };
  }, [ptPiecesAll, sel.nailsConcrete, waste.nailsConcrete]);

  const sheathing = useMemo(() => {
    const qtyRaw = ((Number(allSheetsLoose) || 0) * 80) / 2700;
    const pct = Number(waste.nailsSheathing ?? 40);
    const qtyFinal = Math.ceil(qtyRaw * (1 + pct / 100));
    const unit = getUnit(sel.nailsSheathing) || "box";
    const item = getItem(sel.nailsSheathing);
    const unitPrice = unitPriceFrom(item);
    const subtotal = qtyFinal * (Number(unitPrice) || 0);
    return { qtyRaw, qtyFinal, unit, item, unitPrice, subtotal, wastePct: pct };
  }, [allSheetsLoose, sel.nailsSheathing, waste.nailsSheathing]);

  const framing = useMemo(() => {
    const qtyRaw = ((Number(platePiecesAll) || 0) * 25) / 2500;
    const pct = Number(waste.nailsFraming ?? 40);
    const qtyFinal = Math.ceil(qtyRaw * (1 + pct / 100));
    const unit = getUnit(sel.nailsFraming) || "box";
    const item = getItem(sel.nailsFraming);
    const unitPrice = unitPriceFrom(item);
    const subtotal = qtyFinal * (Number(unitPrice) || 0);
    return { qtyRaw, qtyFinal, unit, item, unitPrice, subtotal, wastePct: pct };
  }, [platePiecesAll, sel.nailsFraming, waste.nailsFraming]);

  const bracing = useMemo(() => {
    const qtyRaw = Math.max(0, Number(panelsAll) || 0) * 3;
    const pct = Number(waste.tempBracing ?? 0);
    const qtyFinal = Math.ceil(qtyRaw * (1 + pct / 100));
    const unit = getUnit(sel.tempBracing) || "pcs";
    const item = getItem(sel.tempBracing);
    const unitPrice = unitPriceFrom(item);
    const subtotal = qtyFinal * (Number(unitPrice) || 0);
    return { qtyRaw, qtyFinal, unit, item, unitPrice, subtotal, wastePct: pct };
  }, [panelsAll, sel.tempBracing, waste.tempBracing]);

  const sectionTotal = useMemo(
    () =>
      (concrete.subtotal || 0) +
      (sheathing.subtotal || 0) +
      (framing.subtotal || 0) +
      (bracing.subtotal || 0),
    [concrete.subtotal, sheathing.subtotal, framing.subtotal, bracing.subtotal]
  );

  // --- useEffectEvent Refactor ---
  const onDataChange = useEffectEvent(onChange);
  useEffect(() => {
    const t = Number(sectionTotal) || 0;
    onDataChange((prevData) => ({
      ...prevData,
      total: t,
    }));
  }, [sectionTotal]);

  // ---- Memoize pickers and hints (FULLY WRITTEN) ----
  const concretePicker = useMemo(
    () => (
      <ItemPicker
        compact
        onSelect={onConcreteSelect}
        value={sel.nailsConcrete}
        defaultVendor="Home Depot"
        defaultFamilyLabel="Drive Pins with Washers (HD)"
        defaultSizeLabel={`3"-100s`}
      />
    ),
    [onConcreteSelect, sel.nailsConcrete]
  );

  const sheathingPicker = useMemo(
    () => (
      <ItemPicker
        compact
        onSelect={onSheathingSelect}
        value={sel.nailsSheathing}
        defaultVendor="Concord"
        defaultFamilyLabel="Bright Ring Coil"
        defaultSizeLabel={`8D-2-3/8x.113-2.7M`}
      />
    ),
    [onSheathingSelect, sel.nailsSheathing]
  );

  const framingPicker = useMemo(
    () => (
      <ItemPicker
        compact
        onSelect={onFramingSelect}
        value={sel.nailsFraming}
        defaultVendor="Concord"
        defaultFamilyLabel="Bright Common Coil"
        defaultSizeLabel={`12D-3-1/4x.120-2.5M`}
      />
    ),
    [onFramingSelect, sel.nailsFraming]
  );

  const bracingPicker = useMemo(
    () => (
      <ItemPicker
        compact
        onSelect={onBracingSelect}
        value={sel.tempBracing}
        defaultVendor="Gillies & Prittie Warehouse"
        defaultFamilyLabel="SPF#2"
        defaultSizeLabel={`2x4"-16'`}
      />
    ),
    [onBracingSelect, sel.tempBracing]
  );

  const concreteHint = useMemo(() => {
    const base = Number(ptPiecesAll) || 0;
    const n = new Intl.NumberFormat("en-US").format(base);
    return `PT pieces: ${n} → boxes = pt pieces × 25 / 100 + 40% waste`;
  }, [ptPiecesAll]);

  const sheathingHint = useMemo(
    () =>
      `Loose sheets = (band: ${sheetsBandAll})` +
      (sheetsExtraAll ? ` + (extra: ${sheetsExtraAll})` : ""),
    [sheetsBandAll, sheetsExtraAll]
  );
  const framingHint = useMemo(
    () =>
      `Loose non-PT boards = ${platePiecesAll} → boxes = ceil((boards × 25 / 2500) × 1.4)`,
    [platePiecesAll]
  );
  const bracingHint = useMemo(
    () => `Bracing pieces = panels × 3 (panels: ${panelsAll})`,
    [panelsAll]
  );

  return (
    <div className="ew-card">
      <AccordionSection
        title={title}
        open={!collapsed}
        onOpenChange={(isOpen) => setCollapsed(isOpen)}
        bar={({ open, toggle }) => (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
            }}
          >
            <button
              type="button"
              className="acc__button"
              onClick={toggle}
              aria-expanded={open}
              title={open ? "Collapse" : "Expand"}
            >
              <img
                src={open ? "/icons/down.png" : "/icons/minimize.png"}
                alt={open ? "Collapse section" : "Expand section"}
                width={16}
                height={16}
                className="acc__chev"
                style={{ display: "inline-block", verticalAlign: "middle" }}
              />
            </button>
            <span className="text-section-header">{title}</span>
            <div
              className="ew-right text-subtotal-orange"
              style={{
                marginLeft: "auto",                
                fontWeight: "700",
                fontFamily: "'Nova Mono', monospace",
              }}
            >
              Subtotal: {fmtMoney(sectionTotal)}
            </div>
          </div>
        )}
      >
        <div className="ew-grid ew-head" style={{ "--cols": GRID_COLS }}>
          <div>Item</div>
          <div>Family · Size · Vendor</div>
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
            label="Concrete nails"
            row={concrete}
            picker={concretePicker}
            hint={concreteHint}
            wasteEditor={
              <input
                className="ew-input focus-anim"
                type="number"
                inputMode="decimal"
                // *** LA CORRECCIÓN ESTÁ AQUÍ ***
                value={localWaste.nailsConcrete ?? 0}
                onChange={(e) => handleLocalWasteChange("nailsConcrete", e)}
                onBlur={(e) => handleWasteBlur("nailsConcrete", e)}
                onKeyDown={(e) => handleWasteKeyDown("nailsConcrete", e)}
                style={{ width: 80, padding: 6, textAlign: "right" }}
                title="Waste %"
              />
            }
          />
          <Row
            label="Sheathing nails"
            row={sheathing}
            picker={sheathingPicker}
            hint={sheathingHint}
            wasteEditor={
              <input
                className="ew-input focus-anim"
                type="number"
                inputMode="decimal"
                // *** LA CORRECCIÓN ESTÁ AQUÍ ***
                value={localWaste.nailsSheathing ?? 0}
                onChange={(e) => handleLocalWasteChange("nailsSheathing", e)}
                onBlur={(e) => handleWasteBlur("nailsSheathing", e)}
                onKeyDown={(e) => handleWasteKeyDown("nailsSheathing", e)}
                style={{ width: 80, padding: 6, textAlign: "right" }}
                title="Waste %"
              />
            }
          />
          <Row
            label="Framing nails"
            row={framing}
            picker={framingPicker}
            hint={framingHint}
            wasteEditor={
              <input
                className="ew-input focus-anim"
                type="number"
                inputMode="decimal"
                // *** LA CORRECCIÓN ESTÁ AQUÍ ***
                value={localWaste.nailsFraming ?? 0}
                onChange={(e) => handleLocalWasteChange("nailsFraming", e)}
                onBlur={(e) => handleWasteBlur("nailsFraming", e)}
                onKeyDown={(e) => handleWasteKeyDown("nailsFraming", e)}
                style={{ width: 80, textAlign: "right" }}
                title="Waste %"
              />
            }
          />
          <Row
            label="Temporary Bracing"
            row={bracing}
            picker={bracingPicker}
            hint={bracingHint}
            wasteEditor={
              <input
                className="ew-input focus-anim"
                type="number"
                inputMode="decimal"
                // *** LA CORRECCIÓN ESTÁ AQUÍ ***
                value={localWaste.tempBracing ?? 0}
                onChange={(e) => handleLocalWasteChange("tempBracing", e)}
                onBlur={(e) => handleWasteBlur("tempBracing", e)}
                onKeyDown={(e) => handleWasteKeyDown("tempBracing", e)}
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