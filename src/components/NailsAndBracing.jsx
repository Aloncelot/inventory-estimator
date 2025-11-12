// src/components/NailsAndBracing.jsx
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
import { unitPriceFrom } from "@/domain/lib/parsing";
import AccordionSection from "@/components/ui/AccordionSection";

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);

// --- Helpers ---
const deref = (x) => (x && x.item? x.item : x);
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
    it?.familyLabel??
    it?.familyDisplay??
    it?.raw?.familyDisplay??
    it?.raw?.familyLabel??
    it?.family??
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
            {hint? (
              <div className="ew-hint" style={{ marginTop: 6 }}>
                {hint}
              </div>
            ) : null}
          </div>
          <div className="ew-right">{Math.ceil(row.qtyRaw || 0)}</div>
          <div className="ew-right">
            {wasteEditor?? (row? row.wastePct : 0 )}
          </div>
          <div className="ew-right">{row.qtyFinal?? "—"}</div>
          <div className="ew-right">{row.unit || "—"}</div>
          <div className="ew-right ew-money">
            {row.unitPrice? fmtMoney(row.unitPrice) : "—"}
          </div>
          <div className="ew-right ew-money">
            {row.subtotal? fmtMoney(row.subtotal) : "—"}
          </div>
          <div></div>
          <div></div>
        </div>
      </Fragment>
    );
  },
  (prev, next) => {
    //... (memo comparison)...
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
      a.wastePct === b.wastePct &&
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
    ptPiecesAll = 0, // Now correctly named
    sheetsExtAll = 0,
    sheetsBandAll = 0,
    sheetsExtraAll = 0,
  } = totals;

  // 1. Destructure all data from the data prop
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
    }
  } = data || {};

  // 2. Create NEW STABLE handlers that call onChange
  const setCollapsed = useCallback((isOpen) => {
    onChange(prev => ({...prev, collapsed:!isOpen }));
  }, [onChange]);

  const setSel = useCallback((k, v) => {
    onChange(prev => ({...prev, sel: {...(prev.sel || {}), [k]: v } }));
  }, [onChange]);
  
  const setWaste = useCallback((k, e) => {
    const value = Number(e.target.value);
    // Only update if it's a valid number
    if (!isNaN(value) && Number.isFinite(value)) {
      onChange(prev => ({
       ...prev,
        waste: {...(prev.waste || {}), [k]: value }
      }));
    } else if (e.target.value === "") {
      // Allow clearing the input, default to 0
       onChange(prev => ({
       ...prev,
        waste: {...(prev.waste || {}), [k]: 0 }
      }));
    }
  }, [onChange]);

  // Create stable callbacks for ItemPicker
  const onConcreteSelect  = useCallback((val) => setSel('nailsConcrete', val), );
  const onSheathingSelect = useCallback((val) => setSel('nailsSheathing', val),);
  const onFramingSelect   = useCallback((val) => setSel('nailsFraming', val),  );
  const onBracingSelect   = useCallback((val) => setSel('tempBracing', val),   );

  // --- Calculations (useMemo) ---
  const allSheetsLoose = useMemo(
    () => Number(sheetsBandAll) + Number(sheetsExtraAll),
   
  );

  const concrete = useMemo(() => {
    const basePieces = Number(ptPiecesAll) || 0;
    const qtyRaw = (basePieces * 25) / 100;
    const pct = Number(waste.nailsConcrete?? 40);
    const qtyFinal = Math.ceil(qtyRaw * (1 + pct/100));
    const unit = getUnit(sel.nailsConcrete) || "box";
    const item = getItem(sel.nailsConcrete);
    const unitPrice = unitPriceFrom(item);
    const subtotal = qtyFinal * (Number(unitPrice) || 0);
    return { qtyRaw, qtyFinal, unit, item, unitPrice, subtotal, wastePct: pct };
  }, [ptPiecesAll, sel.nailsConcrete, waste.nailsConcrete]);

  const sheathing = useMemo(() => {
    const qtyRaw = (Number(allSheetsLoose) || 0) * 80 / 2700;
    const pct = Number(waste.nailsSheathing?? 40);
    const qtyFinal = Math.ceil(qtyRaw * (1 + pct/100));
    const unit = getUnit(sel.nailsSheathing) || "box";
    const item = getItem(sel.nailsSheathing);
    const unitPrice = unitPriceFrom(item);
    const subtotal = qtyFinal * (Number(unitPrice) || 0);
    return { qtyRaw, qtyFinal, unit, item, unitPrice, subtotal, wastePct: pct };
  },);

  const framing = useMemo(() => {
    const qtyRaw = (Number(platePiecesAll) || 0) * 25 / 2500;
    const pct = Number(waste.nailsFraming?? 40);
    const qtyFinal = Math.ceil(qtyRaw * (1 + pct/100));
    const unit = getUnit(sel.nailsFraming) || "box";
    const item = getItem(sel.nailsFraming);
    const unitPrice = unitPriceFrom(item);
    const subtotal = qtyFinal * (Number(unitPrice) || 0);
    return { qtyRaw, qtyFinal, unit, item, unitPrice, subtotal, wastePct: pct };
  }, [platePiecesAll, sel.nailsFraming, waste.nailsFraming]);

  const bracing = useMemo(() => {
    const qtyRaw = Math.max(0, Number(panelsAll) || 0) * 3;
    const pct = Number(waste.tempBracing?? 0);
    const qtyFinal = Math.ceil(qtyRaw * (1 + pct/100));
    const unit = getUnit(sel.tempBracing) || "pcs";
    const item = getItem(sel.tempBracing);
    const unitPrice = unitPriceFrom(item);
    const subtotal = qtyFinal * (Number(unitPrice) || 0);
    return { qtyRaw, qtyFinal, unit, item, unitPrice, subtotal, wastePct: pct };
  },);

  const sectionTotal = useMemo(
    () =>
      (concrete.subtotal || 0) +
      (sheathing.subtotal || 0) +
      (framing.subtotal || 0) +
      (bracing.subtotal || 0),
    [concrete.subtotal, sheathing.subtotal, framing.subtotal, bracing.subtotal]
  );

  // 3. Report total back to the context
  const lastTotalRef = useRef(null);
  useEffect(() => {
    const t = Number(sectionTotal) || 0;
    if (t!== (data?.total || 0)) {
      lastTotalRef.current = t;
      onChange(prevData => ({
       ...prevData,
        total: t,
      }));
    }
  },);

  // ---- Memoize pickers and hints ----
  const concretePicker = useMemo(
    () => (
      <ItemPicker
        compact onSelect={onConcreteSelect}
        value={sel.nailsConcrete}
        defaultVendor="Home Depot"
        defaultFamilyLabel="Drive Pins with Washers (HD)"
        defaultSizeLabel={`3"-100s`}
      />
    ),
   
  );

  const sheathingPicker = useMemo(
    () => (
      <ItemPicker
        compact onSelect={onSheathingSelect}
        value={sel.nailsSheathing}
        defaultVendor="Concord"
        defaultFamilyLabel="Bright Ring Coil"
        defaultSizeLabel={`8D-2-3/8x.113-2.7M`}
      />
    ),
   
  );

  const framingPicker = useMemo(
    () => (
      <ItemPicker
        compact onSelect={onFramingSelect}
        value={sel.nailsFraming}
        defaultVendor="Concord"
        defaultFamilyLabel="Bright Common Coil"
        defaultSizeLabel={`12D-3-1/4x.120-2.5M`}
      />
    ),
   
  );

  const bracingPicker = useMemo(
    () => (
      <ItemPicker
        compact onSelect={onBracingSelect}
        value={sel.tempBracing}
        defaultVendor="Gillies & Prittie Warehouse"
        defaultFamilyLabel="SPF#2"
        defaultSizeLabel={`2x4"-16'`}
      />
    ),
   
  );

  const concreteHint = useMemo(() => {
    const base = Number(ptPiecesAll) || 0;
    const n = new Intl.NumberFormat("en-US").format(base);
    return `PT pieces: ${n} → boxes = pt pieces × 25 / 100 + 40% waste`;
  }, [ptPiecesAll]);

  const sheathingHint = useMemo(
    () =>
      `Loose sheets = (band: ${sheetsBandAll})` +
      (sheetsExtraAll? ` + (extra: ${sheetsExtraAll})` : ""),
   
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
        open={!collapsed} // <-- Use state from prop
        onOpenChange={(isOpen) => setCollapsed(isOpen)} // <-- Use new handler
        bar={({ open, toggle }) => (
          <div style={{ display:'flex', alignItems:'center', gap: 8, width: '100%' }}>
              <button
                  type="button" 
                  className="acc__button"
                  onClick={toggle} 
                  aria-expanded={open} 
                  title={open? "Collapse" : "Expand"}
              >
                   <img
                      src={open? '/icons/down.png' : '/icons/minimize.png'}
                      alt={open? 'Collapse section' : 'Expand section'}
                      width={16}
                      height={16}
                      className="acc__chev"
                      style={{ display: 'inline-block', verticalAlign: 'middle' }}
                  />
              </button>
              <span className="ew-head">{title}</span>
              <div className="ew-right" style={{ marginLeft: 'auto', color: '#f18d5b', fontWeight: '700', fontSize: '16px', fontFamily: "'Nova Mono', monospace" }}>
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
                type="number" inputMode="decimal"
                value={waste.nailsConcrete || 0}
                onChange={(e) => setWaste('nailsConcrete', e)}
                style={{ width: 80, padding: 6, textAlign: 'right' }}
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
                type="number" inputMode="decimal"
                value={waste.nailsSheathing || 0}
                onChange={(e) => setWaste('nailsSheathing', e)}
                style={{ width: 80, padding: 6, textAlign: 'right' }}
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
                type="number" inputMode="decimal"
                value={waste.nailsFraming || 0}
                onChange={(e) => setWaste('nailsFraming', e)}
                style={{ width: 80, padding: 6, textAlign: 'right' }}
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
                type="number" inputMode="decimal"
                value={waste.tempBracing || 0}
                onChange={(e) => setWaste('tempBracing', e)}
                style={{ width: 80, padding: 6, textAlign: 'right' }}
                title="Waste %"
              />
            }
          />
        </div>
      </AccordionSection>
    </div>
  );
}