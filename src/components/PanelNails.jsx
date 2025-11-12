// src/components/PanelNails.jsx
'use client';

import React, {
  Fragment,
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
  memo,
} from 'react';
import ItemPicker from '@/components/ItemPicker';
import AccordionSection from './ui/AccordionSection';
import { unitPriceFrom } from '@/domain/lib/parsing';

const moneyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);

// --- Helpers ---
const deref = (x) => (x && x.item ? x.item : x);
const getItem = (s) => deref(s);
const getUnit = (s) => deref(s)?.unit || deref(s)?.raw?.unit || 'box';
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
  'minmax(220px,1.3fr) 3.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr 1.6fr 0.8fr';

const Row = memo(
  function Row({ label, picker, row, hint, wasteEditor }) {
    return (
      <Fragment>
        <div className="ew-grid ew-row" style={{ '--cols': GRID_COLS }}>
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
          <div className="ew-right">{row.qtyFinal ?? '—'}</div>
          <div className="ew-right">{row.unit || '—'}</div>
          <div className="ew-right ew-money">
            {row.unitPrice ? fmtMoney(row.unitPrice) : '—'}
          </div>
          <div className="ew-right ew-money">
            {row.subtotal ? fmtMoney(row.subtotal) : '—'}
          </div>
          <div></div>
          <div></div>
        </div>
      </Fragment>
    );
  },
  (prev, next) => {
    // ... (memo comparison is unchanged) ...
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
     title = 'Panels — Nails (this level)',
     data,
     onChange, // This is a stable function: (updaterFn) => void
     totalPanelSheets = 0,
     totalBottomPlatePiecesPanel = 0,
     ptPlatePiecesPanels,
     panelPtBoards,
 }) {

  // 1. Destructure all data from the data prop
  const {
    collapsed = true, // Default to collapsed
    sel = {
      nailsSheath:  null,
      nailsFrame8d: null,
      nailsFrame12d:null,
    },
    waste = {
      sheath:  40,
      frame8d: 40,
      frame12d:40,
    }
  } = data || {}; // Provide default empty object

  // 2. Create NEW STABLE handlers that call onChange
  
  // **THIS IS THE FIX**
  // `onOpenChange` passes the *new open state* (a boolean)
  // We need to set `collapsed` to the *opposite* of that.
  const setCollapsed = useCallback((isOpen) => {
    onChange(prev => ({ ...prev, collapsed: !isOpen }));
  }, [onChange]);
  
  const pick = useCallback((k) => (v) => {
    onChange(prev => ({ ...prev, sel: { ...(prev.sel || {}), [k]: v } }));
  }, [onChange]);

  // This handler is now correct
  const setWaste = useCallback((k, e) => {
    const value = Number(e.target.value) || 0;
    onChange(prev => ({
      ...prev,
      waste: { ...(prev.waste || {}), [k]: value }
    }));
  }, [onChange]);


  // --- Calculations (useMemo) ---
  const ptBoards = useMemo(
    () => Number(ptPlatePiecesPanels ?? panelPtBoards ?? 0),
    [ptPlatePiecesPanels, panelPtBoards]
  );
  
  const panelSheets = useMemo(
    () => Number(totalPanelSheets || 0),
    [totalPanelSheets]
  );

  const rowSheath = useMemo(() => {
    const qtyRaw   = (Number(totalPanelSheets) || 0) * 80 / 2700;
    const pct      = Number(waste.sheath ?? 40);
    const qtyFinal = Math.ceil(qtyRaw * (1 + pct/100));
    const unit     = getUnit(sel.nailsSheath);
    const item     = getItem(sel.nailsSheath);
    const unitPrice= unitPriceFrom(item);
    const subtotal = qtyFinal * (Number(unitPrice) || 0);
    return { qtyRaw, qtyFinal, unit, item, unitPrice, subtotal, wastePct: pct };
  }, [totalPanelSheets, sel.nailsSheath, waste.sheath]);

  const rowFrame8d = useMemo(() => {
    const boards   = ptBoards;
    const qtyRaw   = boards * 25 / 2700;
    const pct      = Number(waste.frame8d ?? 40);
    const qtyFinal = Math.ceil(qtyRaw * (1 + pct/100));
    const unit     = getUnit(sel.nailsFrame8d);
    const item     = getItem(sel.nailsFrame8d);
    const unitPrice= unitPriceFrom(item);
    const subtotal = qtyFinal * (Number(unitPrice) || 0);
    return { boards, qtyRaw, qtyFinal, unit, item, unitPrice, subtotal, wastePct: pct };
  }, [ptBoards, sel.nailsFrame8d, waste.frame8d]);

  const rowFrame12d = useMemo(() => {
    const boards   = Number(totalBottomPlatePiecesPanel) || 0;
    const qtyRaw   = boards * 80 / 2500;
    const pct      = Number(waste.frame12d ?? 40);
    const qtyFinal = Math.ceil(qtyRaw * (1 + pct/100));
    const unit     = getUnit(sel.nailsFrame12d);
    const item     = getItem(sel.nailsFrame12d);
    const unitPrice= unitPriceFrom(item);
    const subtotal = qtyFinal * (Number(unitPrice) || 0);
    return { boards, qtyRaw, qtyFinal, unit, item, unitPrice, subtotal, wastePct: pct };
  }, [totalBottomPlatePiecesPanel, sel.nailsFrame12d, waste.frame12d]);

  const sectionTotal = useMemo(
      () => (rowSheath.subtotal||0) + (rowFrame8d.subtotal||0) + (rowFrame12d.subtotal||0),
      [rowSheath.subtotal, rowFrame8d.subtotal, rowFrame12d.subtotal]
  );
  
  // 3. Report total back to the context
  const lastTotalRef = useRef(null);
  useEffect(() => {
    const t = Number(sectionTotal) || 0;
    if (t !== (data?.total || 0)) {
      lastTotalRef.current = t;
      onChange(prevData => ({
        ...prevData,
        total: t,
      }));
    }
  }, [sectionTotal, onChange, data?.total]);

  // memo pickers (stable nodes)
  const pickerSheath = useMemo(() => (
    <ItemPicker
      compact 
      onSelect={pick('nailsSheath')}
      value={sel.nailsSheath}
      defaultVendor="Concord" 
      defaultFamilyLabel="Bright Ring Coil"
      defaultSizeLabel={`8D-2-3/8x.113-2.7M`}
    />
  ), [pick, sel.nailsSheath]);
  
  const picker8d = useMemo(() => (
    <ItemPicker
      compact 
      onSelect={pick('nailsFrame8d')}
      value={sel.nailsFrame8d}
      defaultVendor="Concord" 
      defaultFamilyLabel="Galvanized Ring Coil"
      defaultSizeLabel={`8D-2-3/8"`}
    />
  ), [pick, sel.nailsFrame8d]);
  
  const picker12d = useMemo(() => (
    <ItemPicker
      compact 
      onSelect={pick('nailsFrame12d')}
      value={sel.nailsFrame12d}
      defaultVendor="Concord" 
      defaultFamilyLabel="Bright Common Coil"
      defaultSizeLabel={`12D-3-1/4x.120-2.5M`}
    />
  ), [pick, sel.nailsFrame12d]);
  
  // hints
  const hintSheath = useMemo(() => `Panel sheets (Ext + Int Shear): ${totalPanelSheets} → boxes = ceil(((sheets × 80) / 2700) × (1 + waste%))`, [totalPanelSheets]);
  const hint8d = useMemo(() => `PT plate boards (panels): ${ptBoards} → boxes = ceil(((boards × 25) / 2700) × (1 + waste%))`, [ptBoards]);
  const hint12d = useMemo(() => `Bottom plate boards (panels): ${totalBottomPlatePiecesPanel} → boxes = ceil(((boards × 80) / 2500) × (1 + waste%))`, [totalBottomPlatePiecesPanel]);

  // 4. **RE-ADD** the AccordionSection wrapper
  return (
    <div className="ew-card">
      <AccordionSection
        open={!collapsed}
        onOpenChange={setCollapsed} // <-- Use new stable handler
        bar={({ open, toggle }) => (
            <div style={{ display:'flex', alignItems:'center', gap: 8, width: '100%' }}>
                <button
                    type="button" 
                    className="acc__button"
                    onClick={toggle} 
                    aria-expanded={open} 
                    title={open ? "Collapse" : "Expand"}
                >
                     <img
                        src={open ? '/icons/down.png' : '/icons/minimize.png'} // Use the correct icons
                        alt={open ? 'Collapse section' : 'Expand section'}
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
        <div className="ew-grid ew-head" style={{ '--cols': GRID_COLS }}>
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
                       onChange={(e) => setWaste('frame8d', e)} // <-- Use handler
                       style={{ width: 80, padding: 6, textAlign: 'right' }}
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
                       onChange={(e) => setWaste('sheath', e)} // <-- Use handler
                       style={{ width: 80, padding: 6, textAlign: 'right' }}
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
                       onChange={(e) => setWaste('frame12d', e)} // <-- Use handler
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

 const PanelNails = memo(
  PanelNailsComponent,
  (a, b) =>
    a.data === b.data &&
    a.onChange === b.onChange &&
    a.totalPanelSheets === b.totalPanelSheets &&
    a.totalBottomPlatePiecesPanel === b.totalBottomPlatePiecesPanel &&
    (a.ptPlatePiecesPanels ?? a.panelPtBoards ?? 0) ===
      (b.ptPlatePiecesPanels ?? b.panelPtBoards ?? 0) &&
    a.title === b.title
);

export default PanelNails;