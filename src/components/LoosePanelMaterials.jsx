// src/components/LoosePanelMaterials.jsx
'use client';

import { Fragment, useMemo, useState, useEffect } from 'react';
import { parseBoardLengthFt, unitPriceFrom } from '@/domain/lib/parsing';
import ItemPicker from '@/components/ItemPicker';
import { useLocalStorageJson } from '@/hooks/useLocalStorageJson';

import {
  // exterior
  looseExtBottomPlates, looseExtTopPlates, loosePanelBandSheathing,
  looseExtraSheathing, looseOpeningsBlocking, looseSecondBottomPlate,
  // interior
  looseInt2x6PTPlates, looseInt2x6Plates, looseInt2x4PTPlates, looseInt2x4Plates, looseCabinetBlocking,
  // general
  looseConcreteNails, looseSheathingNails, looseFramingNails, looseTempBracing,
} from '@/domain/calculators';

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmt = n => (Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : '—');

const deref = x => (x && x.item ? deref(x.item) : x);
const getItem = s => deref(s);
const getUnit = s => deref(s)?.unit || deref(s)?.raw?.unit || 'pcs';
const getSize = s => deref(s)?.sizeDisplay || deref(s)?.sizeLabel || deref(s)?.raw?.sizeDisplay || '';
const wordsPreview = (s = '', maxWords = 8) => {
  const parts = String(s).trim().split(/\s+/);
  const preview = parts.slice(0, maxWords).join(' ');
  return parts.length > maxWords ? `${preview}…` : preview || '';
};


export default function LoosePanelMaterials({
  title = 'Loose materials — Wall Panels',
  persistKey = 'loose-panels-0',
  onRemove,
  extLengthLF,
  extZipSheetsFinal,
  extZipSheetsSum,
  int2x6LF,
  int2x4LF,
  ptLFTotal,
  platePiecesTotal,
  onTotalChange,
  onSubtotalChange,
  totalPanelsAllLevels,
  levelsCount,
}) {

  const extSheets = useMemo(
    () => Number(extZipSheetsFinal ?? extZipSheetsSum ?? 0),
    [extZipSheetsFinal, extZipSheetsSum]
  );
 
  const showZipTape = extSheets > 0;

    // Collapsible
  const [collapsed, setCollapsed] = useState(false);

  // Notes per row
  const [notes, setNotes] = useLocalStorageJson(`inv:v1:notes:${persistKey}`, {});
  const getNote = k => notes[k] || { plan: '', comment: '', open: false };
  const setNote = (k, patch) => setNotes(prev => ({ ...prev, [k]: { ...getNote(k), ...patch } }));
  const toggleOpen = k => setNote(k, { open: !getNote(k).open });

  // ── Exterior context (manual if props not provided) ─────────────
  const [extInputs, setExtInputs] = useState({
    lengthLF:             Number(extLengthLF ?? 0),
    panelBandLF:          Number(extLengthLF ?? 0),
    panelBandHeightFt:    4,
    lfPerZipSheet:        12,
    tapeRollLenFt:        75,
    openingsBlockingLF:   0,
  });

  const [panelBandEdited, setPanelBandEdited] = useState(false);

  // ── Interior context (manual if props not provided) ─────────────
  const [intInputs, setIntInputs] = useState({
    int2x6LF: int2x6LF ?? 0,
    int2x4LF: int2x4LF ?? 0,
    blockingLF: 0,                 // bathroom/kitchen blocking LF (always included)
  });


  // Include toggles (ONLY for these two)
  const [include, setInclude] = useState({
    secondBottom: false,
    extraSheathing: false,
  });

  // General (nails/bracing) helpers
  const [generalInputs, setGeneralInputs] = useState({
    platePiecesTotal: 0,           // total plate boards (from panel groups) for bracing calc
  });

  // Selections
  const [sel, setSel] = useState({
    // Exterior
    extBottomPT: null,
    extTopPlate: null,
    panelBandSheathing: null,
    zipTape: null,
    openingsBlocking: null,
    secondBottom: null,
    extraSheathing: null,

    // Interior
    int2x6PT: null,
    int2x6Plate: null,
    int2x4PT: null,
    int2x4Plate: null,
    intCabinetBlocking: null,

    // General (nails & bracing)
    nailsConcrete: null,
    nailsSheathing: null,
    nailsFraming: null,
    tempBracing: null,
  });
  const setPick = key => item => setSel(prev => ({ ...prev, [key]: item }));

  // Derived effective LFs
  const effectiveExtLF     = Number(extLengthLF ?? extInputs.lengthLF ?? 0);
  const effectiveInt2x6LF  = Number(int2x6LF    ?? intInputs.int2x6LF ?? 0);
  const effectiveInt2x4LF  = Number(int2x4LF    ?? intInputs.int2x4LF ?? 0);

  useEffect(() => {
  if (!panelBandEdited) {
    const ext = Number(extLengthLF ?? extInputs.lengthLF ?? 0);
    setExtInputs(v => ({ ...v, panelBandLF: ext }));
  }
}, [extLengthLF, panelBandEdited]); // extInputs.lengthLF if you allow editing that too


  // Board lengths from sizes
  const lenBottomPT      = parseBoardLengthFt(getSize(sel.extBottomPT)) || 12;
  const lenTopPlate      = parseBoardLengthFt(getSize(sel.extTopPlate)) || 12;
  const lenOpeningBlk    = parseBoardLengthFt(getSize(sel.openingsBlocking)) || 10;
  const lenSecondBottom  = parseBoardLengthFt(getSize(sel.secondBottom)) || 12;
  
  const lenInt2x6PT      = parseBoardLengthFt(getSize(sel.int2x6PT)) || 12;
  const lenInt2x6Pl      = parseBoardLengthFt(getSize(sel.int2x6Plate)) || 12;
  const lenInt2x4PT      = parseBoardLengthFt(getSize(sel.int2x4PT)) || 12;
  const lenInt2x4Pl      = parseBoardLengthFt(getSize(sel.int2x4Plate)) || 12;
  
  // ── Build EXTERIOR rows ────────────────────────────────────────
  const exteriorRows = useMemo(() => {
    const out = [];



    // PT Bottom Plates – Loose
    {
      const res = looseExtBottomPlates({ 
        lengthLF: effectiveExtLF, 
        boardLenFt: lenBottomPT, 
        item: getItem(sel.extBottomPT), 
        unit: getUnit(sel.extBottomPT) 
      });
      out.push({ 
        key: 'extBottomPT', 
        label: 'PT Bottom Plates – Loose', ...res, 
        item: getItem(sel.extBottomPT), 
        wastePct: 5
      });
    }
    

    // Top Plates – Loose
    {
      const res = looseExtTopPlates({ 
        lengthLF: effectiveExtLF, 
        boardLenFt: lenTopPlate, item: getItem(sel.extTopPlate), 
        unit: getUnit(sel.extTopPlate) 
      });
      out.push({ 
        key: 'extTopPlate', 
        label: 'Top Plates – Loose', ...res, 
        item: getItem(sel.extTopPlate), 
        wastePct: 5 
      });
    }

    // Panel band sheathing (ZIP family by default)
    {
      const res = loosePanelBandSheathing({
        panelBandLF: Number(extInputs.panelBandLF || 0),
        bandHeightFt: 4, // 4' band ⇒ sheets ≈ LF / 8 (waste applied inside)
        item: getItem(sel.panelBandSheathing),
        unit: getUnit(sel.panelBandSheathing) || 'sheet',
        wastePct: 20,
      });

      out.push({ 
        key: 'panelBandSheathing', 
        label: 'Panel band sheathing', ...res, 
        item: getItem(sel.panelBandSheathing), 
        wastePct: 20 
      });
    }

    // Extra sheathing (optional)
    if (include.extraSheathing) {
      // Treat as an extra layer across exterior length × band height (tweak if needed later)
      const res = looseExtraSheathing({ 
        extLengthLF: effectiveExtLF, 
        bandHeightFt: Number(extInputs.panelBandHeightFt||4), 
        item: getItem(sel.extraSheathing), 
        unit: getUnit(sel.extraSheathing)||'sheet' 
      });
      out.push({ 
        key: 'extraSheathing', 
        label: 'Extra sheathing (optional)', ...res, 
        item: getItem(sel.extraSheathing), 
        wastePct: 10 
      });
    }

    // Tape – ZIP system  (Rolls = total ZIP sheets ÷ 6; per-level)
    {
      if (showZipTape) {
      const panelBandSheetsLocal =
      Number(out.find(r => r.key === 'panelBandSheathing')?.qtyFinal || 0);
      const extraSheetsLocal =
      include.extraSheathing ? Number(out.find(r => r.key === 'extraSheathing')?.qtyFinal || 0) : 0;

      const panelBandSheets = out.find(r => r.key === 'panelBandSheathing')?.qtyFinal || 0;
      const extraSheets     = include.extraSheathing ? (out.find(r => r.key === 'extraSheathing')?.qtyFinal || 0) : 0;
      const totalSheets =  Number(extSheets) + panelBandSheetsLocal + extraSheetsLocal;


      const qtyRaw   = Number(totalSheets) / 6;
      const qtyFinal = Math.ceil(qtyRaw);           // whole rolls only
      const unit     = getUnit(sel.zipTape) || 'roll';
      const item     = getItem(sel.zipTape);
      const unitPrice = unitPriceFrom(item);
      const subtotal  = qtyFinal * (Number(unitPrice) || 0);

      out.push({
        key: 'zipTape',
        label: 'Tape – ZIP system',
        unit, qtyRaw, qtyFinal, unitPrice, subtotal,
        item,
        wastePct: 15, // explicit: rule has no waste factor
      });
    }}

    // Blocking at openings (LF ÷ board length)
    {
      const res = looseOpeningsBlocking({ 
        openingsLF: Number(extInputs.openingsBlockingLF||0), 
        boardLenFt: lenOpeningBlk, 
        item: getItem(sel.openingsBlocking), 
        unit: getUnit(sel.openingsBlocking) 
      });
      out.push({ 
        key: 'openingsBlocking', 
        label: 'Blocking at openings', ...res, 
        item: getItem(sel.openingsBlocking), 
        wastePct: 10 
      });
    }

    // Second bottom plate (optional)
    if (include.secondBottom) {
      const res = looseSecondBottomPlate({ 
        lengthLF: effectiveExtLF, 
        boardLenFt: lenSecondBottom, 
        item: getItem(sel.secondBottom), 
        unit: getUnit(sel.secondBottom) 
      });
      out.push({ 
        key: 'secondBottom', 
        label: 'Second bottom plate (optional)', ...res, 
        item: getItem(sel.secondBottom), 
        wastePct: 5 
      });
    }

    return out;
  }, [
    sel, include,
    effectiveExtLF, extZipSheetsFinal,
    extInputs.panelBandLF, extInputs.panelBandHeightFt, extInputs.lfPerZipSheet, extInputs.tapeRollLenFt, extInputs.openingsBlockingLF,
    lenBottomPT, lenTopPlate, lenOpeningBlk, lenSecondBottom, extSheets
  ]);

  const rowsByKey = useMemo(
    () => Object.fromEntries(exteriorRows.map(r => [r.key, r])),
    [exteriorRows]
  );

  const bandSheets  = Math.ceil(rowsByKey.panelBandSheathing?.qtyFinal || 0);
  const extraSheets = include.extraSheathing 
    ? Math.ceil(rowsByKey.extraSheathing?.qtyFinal || 0) 
    : 0;

  // If you need the combined count for nails:
  const sheetsInThisSection = Number(extSheets) + bandSheets + extraSheets;

  // ── Build INTERIOR rows ────────────────────────────────────────
  const interiorRows = useMemo(() => {
    const out = [];

    // Interior 2×6 — PT Plates – Loose
    {
      const res = looseInt2x6PTPlates({ 
        lengthLF: effectiveInt2x6LF, 
        boardLenFt: lenInt2x6PT, 
        item: getItem(sel.int2x6PT), 
        unit: getUnit(sel.int2x6PT),
        wastePct: 5, 
      });
      out.push({ 
        key: 'int2x6PT', 
        label: 'Interior 2×6 — PT Plates – Loose', ...res, 
        item: getItem(sel.int2x6PT), 
        wastePct: 5
      });
    }

    // Interior 2×6 — Plates – Loose
    {
      const res = looseInt2x6Plates({ 
        lengthLF: effectiveInt2x6LF, 
        boardLenFt: lenInt2x6Pl, 
        item: getItem(sel.int2x6Plate), 
        unit: getUnit(sel.int2x6Plate),
        wastePct: 5, 
      });
      out.push({ 
        key: 'int2x6Plate', 
        label: 'Interior 2×6 — Plates – Loose', ...res, 
        item: getItem(sel.int2x6Plate), 
        wastePct: 5
      });
    }

    // Interior 2×4 — PT Plates – Loose
    {
      const res = looseInt2x4PTPlates({ 
        lengthLF: effectiveInt2x4LF, 
        boardLenFt: lenInt2x4PT, 
        item: getItem(sel.int2x4PT), 
        unit: getUnit(sel.int2x4PT),
        wastePct: 5,
      });
      out.push({ 
        key: 'int2x4PT', 
        label: 'Interior 2×4 — PT Plates – Loose', ...res, 
        item: getItem(sel.int2x4PT), 
        wastePct: 5 
      });
    }

    // Interior 2×4 — Plates – Loose
    {
      const res = looseInt2x4Plates({ 
        lengthLF: effectiveInt2x4LF, 
        boardLenFt: lenInt2x4Pl, 
        item: getItem(sel.int2x4Plate), 
        unit: getUnit(sel.int2x4Plate),
        wastePct: 5,
      });
      out.push({ 
        key: 'int2x4Plate', 
        label: 'Interior 2×4 — Plates – Loose', ...res, 
        item: getItem(sel.int2x4Plate), 
        wastePct: 5 
      });
    }

    // Walls (general) — Blocking for Bathroom & Kitchen
    {
      const blkLen = parseBoardLengthFt(getSize(sel.intCabinetBlocking)) || 8;
      const res = looseCabinetBlocking({ 
        blockingLF: Number(intInputs.blockingLF||0), 
        boardLenFt: blkLen, item: getItem(sel.intCabinetBlocking), 
        unit: getUnit(sel.intCabinetBlocking) 
      });
      out.push({
        key: 'intCabinetBlocking',
        label: 'Walls (general) — Blocking for Bathroom & Kitchen',
        ...res,
        item: getItem(sel.intCabinetBlocking),
        wastePct: 10
      });
    }
    
    return out;
  }, [
    sel,
    effectiveInt2x6LF, effectiveInt2x4LF,
    intInputs.blockingLF,
    lenInt2x6PT, lenInt2x6Pl, lenInt2x4PT, lenInt2x4Pl
  ]);

  

  // Totals for nails math

  const ptLFAll = Number(ptLFTotal ?? (effectiveExtLF + effectiveInt2x6LF + effectiveInt2x4LF));
  const wallsLFTotal = effectiveExtLF + effectiveInt2x6LF + effectiveInt2x4LF;

  // ── Build GENERAL (nails & bracing) rows ───────────────────────
  const generalRows = useMemo(() => {
    const out = [];

    // Concrete nails (Home Depot, Drive Pins with Washers (HD), 3"-100s)
    // Formula: (PT pieces × 25 / 100) with +40% waste ⇒ ceil(...)
    {
      // Count PT pieces from the rows we already computed in this section
      const extPTpieces   = Math.ceil(exteriorRows.find(r => r.key === 'extBottomPT')?.qtyFinal || 0);
      const int2x6PTpcs   = Math.ceil(interiorRows.find(r => r.key === 'int2x6PT')?.qtyFinal || 0);
      const int2x4PTpcs   = Math.ceil(interiorRows.find(r => r.key === 'int2x4PT')?.qtyFinal || 0);
      const ptPiecesTotal = extPTpieces + int2x6PTpcs + int2x4PTpcs;
      // Boxes: each box is "100s"; we need (pieces * 25) / 100, then add 40% waste
      const qtyRaw   = (ptPiecesTotal * 25) / 100;
      const qtyFinal = Math.ceil(qtyRaw * 1.40);
      const unit      = getUnit(sel.nailsConcrete) || 'box';
      const item      = getItem(sel.nailsConcrete);
      const unitPrice = unitPriceFrom(item);
      const subtotal  = qtyFinal * (Number(unitPrice) || 0);
      out.push({
        key: 'nailsConcrete',
        label: 'Concrete nails',
        unit, qtyRaw, qtyFinal, unitPrice, subtotal,
        item,
        wastePct: 40
        });
    }

    // Sheathing nails (Concord, Bright Ring Coil, 8D-2-3/8x.113-2.7M)
    {
      const qtyRaw = (Number(sheetsInThisSection) || 0) * 80 /2700;
      const qtyFinal = Math.ceil(qtyRaw * 1.40);
      const unit = getUnit(sel.nailsSheathing) || 'box';
      const item = getItem(sel.nailsSheathing);
      const unitPrice = unitPriceFrom(item);
      const subtotal = qtyFinal * (Number(unitPrice) || 0);

      out.push({
        key: 'nailsSheathing',
        label: 'Sheathing nails',
        unit, qtyRaw, qtyFinal, unitPrice, subtotal, item, wastePct: 40,
      });
    }
    // Framing nails (G&P Warehouse, Bright Common Coil, 12D-3-1/4x.120-2.5M)
    {
      // Total plates in this section = sum of all plate PIECES (exterior + interior)
      const ex = Object.fromEntries(exteriorRows.map(r => [r.key, r]));
      const inr = Object.fromEntries(interiorRows.map(r => [r.key, r]));
      const q = (obj, k) => Math.ceil(obj[k]?.qtyFinal || 0);

      const totalPlatePieces  =
        q(ex, 'extBottomPT')  +
        q(ex, 'extTopPlate')  +
        q(ex, 'secondBottom') +
        q(inr, 'int2x6PT')    +
        q(inr, 'int2x6Plate') +
        q(inr, 'int2x4PT')    +
        q(inr, 'int2x4Plate') ;

      // Math: pieces * 25 / 2500 + 40% waste
      const qtyRaw   = (totalPlatePieces * 25) / 2500;
      const qtyFinal = Math.ceil(qtyRaw * 1.40);

      const unit      = getUnit(sel.nailsFraming) || 'box';
      const item      = getItem(sel.nailsFraming);
      const unitPrice = unitPriceFrom(item);
      const subtotal  = qtyFinal * (Number(unitPrice) || 0);

      out.push({
        key: 'nailsFraming',
        label: 'Framing nails',
        unit, qtyRaw, qtyFinal, unitPrice, subtotal,
        item,
        wastePct: 40,
});
    }

    // Temporary Bracing
    {
      const allPanels = Number(totalPanelsAllLevels || 0);
      const lvlCount  = Math.max(1, Number(levelsCount || 1));
      const qtyRaw    = (allPanels * 3) / lvlCount;
      const qtyFinal  = Math.ceil(qtyRaw);   // whole-count
      const unit      = getUnit(sel.tempBracing) || 'pcs';
      const item      = getItem(sel.tempBracing);
      const unitPrice = unitPriceFrom(item);
      const subtotal  = qtyFinal * (Number(unitPrice) || 0);

      out.push({
        key: 'tempBracing',
        label: 'Temporary Bracing',
        unit, qtyRaw, qtyFinal, unitPrice, subtotal,
        item,
        wastePct: 0
      });
    }
    
    return out;
  }, [
    sel,
    sheetsInThisSection, wallsLFTotal,
    generalInputs.platePiecesTotal,
    exteriorRows, interiorRows,
    totalPanelsAllLevels,
    levelsCount,
  ]);

  const sectionSubtotal = useMemo(() => {
    const a = exteriorRows.reduce((s,r)=>s+(r.subtotal||0),0);
    const b = interiorRows.reduce((s,r)=>s+(r.subtotal||0),0);
    const c = generalRows.reduce((s,r)=>s+(r.subtotal||0),0);
    return a + b + c;
  }, [exteriorRows, interiorRows, generalRows]);

  const gridCols =
    'minmax(220px,1.3fr) 3.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr 1.6fr 0.8fr';

  // Notify parent (Level) with Loose-materials subtotal
  useEffect(() => {
    if (typeof onSubtotalChange === 'function') {
      onSubtotalChange({ subtotal: Number(sectionSubtotal) || 0 });
    }
    if (typeof onTotalChange === 'function'){
      onTotalChange(Number(sectionSubtotal) || 0);
    }
  }, [sectionSubtotal, onSubtotalChange, onTotalChange]);

  return (
    <div className="ew-card">
      {/* Header + collapse + remove */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          className="ew-btn"
          onClick={() => setCollapsed(c => !c)}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand' : 'Collapse'}
          style={{ padding: '4px 8px', lineHeight: 1 }}
        >
          {collapsed ? '▶' : '🔽'}
        </button>
        <h2 className="ew-h2" style={{ margin: 0 }}>{title}</h2>
        {onRemove && <button className="ew-btn" onClick={onRemove}>Remove section</button>}
      </div>

      {/* Collapsed summary */}
      <div
        style={{
          display: collapsed ? 'block' : 'none',
          padding: 12,
          border: '1px solid var(--border)',
          borderRadius: 10,
          marginTop: 8
        }}
        aria-hidden={!collapsed}
      >
        <div style={{ fontWeight: 700, color: '#f18d5b' }}>
          Subtotal: {fmt(sectionSubtotal)}
        </div>
      </div>

      {/* Full content */}
      <div
        style={{
          display: collapsed ? 'none' : 'block',
          padding: 16,
          border: '1px solid var(--border)',
          borderRadius: 12
        }}
        aria-hidden={collapsed}
      >
        {/* ───────────── Exterior walls ───────────── */}
        <h3 className="ew-h3" style={{ marginTop: 0, marginBottom: 6 }}>Exterior walls</h3>

        {/* Exterior context */}
        <div className="controls4" style={{ marginBottom: 12 }}>
          <label>
            <span className="ew-subtle">Exterior wall length (LF)</span>
            <input className="ew-input focus-anim" type="number" inputMode="decimal"
              value={extLengthLF ?? extInputs.lengthLF}
              onChange={e => setExtInputs(v => ({ ...v, lengthLF: Number(e.target.value) }))}
              disabled={typeof extLengthLF === 'number'}
              title={typeof extLengthLF === 'number' ? 'Provided by context' : 'Manual'}
            />
          </label>
          <label>
            <span className="ew-subtle">Panel band LF</span>
            <div className="flex items-center gap-2">
              <input
                className="ew-input focus-anim"
                type="number"
                inputMode="decimal"
                value={extInputs.panelBandLF}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPanelBandEdited(true);
                  setExtInputs(prev => ({ ...prev, panelBandLF: Number.isFinite(v) ? v : 0 }));
                }}
                style={{ width: 140, textAlign: "right" }}
              />
              {/* optional reset to re-link it to exterior LF */}
              <button
                type="button"
                className="ew-btn-secondary"
                onClick={() => {
                  setPanelBandEdited(false);
                  setExtInputs(prev => ({
                    ...prev,
                    panelBandLF: Number(extLengthLF ?? prev.lengthLF ?? 0),
                  }));
                }}
                title="Use Exterior LF"
              >
                ↺ use exterior LF
              </button>
            </div>
          </label>
          <label>
            <span className="ew-subtle">Band height (ft)</span>
            <input className="ew-input focus-anim" type="number" inputMode="decimal"
              value={extInputs.panelBandHeightFt}
              onChange={e => setExtInputs(v => ({ ...v, panelBandHeightFt: Number(e.target.value) }))}
            />
          </label>         
        </div>

        {/* Exterior header */}
        <div className="ew-grid ew-head" style={{ '--cols': gridCols }}>
          <div>Item</div>
          <div>Vendor · Family · Size</div>
          <div className="ew-right">Qty</div>
          <div className="ew-right">Waste %</div>
          <div className="ew-right">Final qty</div>
          <div className="ew-right">Unit</div>
          <div className="ew-right">Unit price</div>
          <div className="ew-right">Subtotal</div>
          <div>Notes</div>
          <div></div>
        </div>

        <div className="ew-rows">
          {/* PT Bottom Plates – Loose */}
          <Row
            gridCols={gridCols}
            label="PT Bottom Plates – Loose"
            noteKey="loose:extBottomPT"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('extBottomPT')}
                defaultVendor="Fastener Plus" /* vendor here doesn’t matter for lumber; use G&P if you prefer */
                defaultFamilyLabel="PT"
              />
            )}
            row={exteriorRows.find(r => r.key === 'extBottomPT')}
          />

          {/* Top Plates – Loose */}
          <Row
            gridCols={gridCols}
            label="Top Plates – Loose"
            noteKey="loose:extTopPlate"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('extTopPlate')}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="SPF#2"
              />
            )}
            row={exteriorRows.find(r => r.key === 'extTopPlate')}
          />

          {/* Panel band sheathing */}
          <Row
            gridCols={gridCols}
            label="Panel band sheathing"
            noteKey="loose:panelBandSheathing"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <div className="ew-inline" style={{ alignItems: 'end' }}>
                <ItemPicker
                  compact
                  onSelect={setPick('panelBandSheathing')}
                  defaultVendor="Gillies & Prittie Warehouse"
                  defaultFamilyLabel="Green Zip"
                />
                <div className="ew-hint">Here: 4′ band ⇒ sheets ≈ (Exterior LF ÷ 8) + waste</div>
              </div>
            )}
            row={exteriorRows.find(r => r.key === 'panelBandSheathing')}
          />


          {/* Tape – ZIP system */}
          {showZipTape && (
            <Row
            gridCols={gridCols}
            label="Tape – ZIP system"
            noteKey="loose:zipTape"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <div className="ew-inline" style={{ alignItems: 'end' }}>
                  <ItemPicker
                    compact
                    onSelect={setPick('zipTape')}
                    defaultVendor="Gillies & Prittie Warehouse"
                    defaultFamilyLabel="ZIP Flashing Tape"
                  />       
                  <div className="ew-hint">
                    ZIP sheets = (ext: {extSheets}) + (band: {bandSheets})
                    {include.extraSheathing ? ` + (extra: ${extraSheets})` : ''}
                  </div>
                </div>
              )}
              row={exteriorRows.find(r => r.key === 'zipTape')}
              />
            )}

          {/* Blocking at openings */}
          <Row
            gridCols={gridCols}
            label="Blocking at openings"
            noteKey="loose:openingsBlocking"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <div className="ew-inline" style={{ alignItems: 'end' }}>
                <ItemPicker
                  compact
                  onSelect={setPick('openingsBlocking')}
                  defaultVendor="Gillies & Prittie Warehouse"
                  defaultFamilyLabel="SPF#2"
                  />
                <label style={{ minWidth: 170 }}>
                  <span className="ew-subtle">Openings blocking (LF)</span>
                  <input className="ew-input focus-anim" type="number"
                    value={extInputs.openingsBlockingLF}
                    onChange={e => setExtInputs(v => ({ ...v, openingsBlockingLF: Number(e.target.value) }))}
                    />
                </label>
              </div>
            )}
            row={exteriorRows.find(r => r.key === 'openingsBlocking')}
            />

            {include.extraSheathing && (
              <Row
                gridCols={gridCols}
                label="Extra sheathing (optional)"
                noteKey="loose:extraSheathing"
                noteApi={{ getNote, toggleOpen, setNote }}
                picker={(
                  <div className="ew-inline" style={{ alignItems: 'end', gap: 8 }}>
                    <ItemPicker
                      compact
                      onSelect={setPick('extraSheathing')}
                      defaultVendor="Gillies & Prittie Warehouse"
                      defaultFamilyLabel="CDX SE"
                    />
                    <button
                      type="button"
                      className="ew-btn"
                      onClick={() => setInclude(p => ({ ...p, extraSheathing: false }))}
                      title="Remove this row"
                    >
                      Remove
                    </button>
                  </div>
                )}
                row={exteriorRows.find(r => r.key === 'extraSheathing')}
              />
            )}

          {/* Second bottom plate (optional include) */}
          {include.secondBottom && (
            <Row
              gridCols={gridCols}
              label="Second bottom plate (optional)"
              noteKey="loose:secondBottom"
              noteApi={{ getNote, toggleOpen, setNote }}
              picker={(
                <div className="ew-inline" style={{ alignItems: 'end', gap: 8 }}>
                  <ItemPicker
                    compact
                    onSelect={setPick('secondBottom')}
                    defaultVendor="Gillies & Prittie Warehouse"
                    defaultFamilyLabel="SPF#2"
                  />
                  <button
                    type="button"
                    className="ew-btn"
                    onClick={() => setInclude(p => ({ ...p, secondBottom: false }))}
                    title="Remove this row"
                  >
                    Remove
                  </button>
                </div>
              )}
              row={exteriorRows.find(r => r.key === 'secondBottom')}
            />
          )}
        </div>
        {/* Exterior “add optional rows” footer, like wall panels */}
        <div className="ew-footer" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="ew-btn"
            onClick={() => setInclude(p => ({ ...p, extraSheathing: true }))}
            disabled={include.extraSheathing}
            title={include.extraSheathing ? 'Already added' : 'Add extra sheathing row'}
          >
            ➕ Extra sheathing
          </button>

          <button
            className="ew-btn"
            onClick={() => setInclude(p => ({ ...p, secondBottom: true }))}
            disabled={include.secondBottom}
            title={include.secondBottom ? 'Already added' : 'Add second bottom plate row'}
          >
            ➕ Second bottom plate
          </button>

          {/* Spacer grows; keep it like the panels footer layout */}
          <div style={{ flex: 1 }} />

          {/* You can optionally echo a small subtotal for exterior-only if you want */}
          {/* <div className="ew-subtle">Exterior subtotal: {fmt(exteriorRows.reduce((s,r)=>s+(r.subtotal||0),0))}</div> */}
        </div>


        {/* ───────────── Interior walls ───────────── */}
        <h3 className="ew-h3" style={{ marginTop: 16, marginBottom: 6 }}>Interior walls</h3>

        {/* Interior context */}
        <div className="controls4" style={{ marginBottom: 12 }}>
          <label>
            <span className="ew-subtle">Interior 2×6 LF</span>
            <input className="ew-input focus-anim" type="number" inputMode="decimal"
              value={int2x6LF ?? intInputs.int2x6LF}
              onChange={e => setIntInputs(v => ({ ...v, int2x6LF: Number(e.target.value) }))}
              disabled={typeof int2x6LF === 'number'}
              title={typeof int2x6LF === 'number' ? 'Provided by context' : 'Manual'}
            />
          </label>
          <label>
            <span className="ew-subtle">Interior 2×4 LF</span>
            <input className="ew-input focus-anim" type="number" inputMode="decimal"
              value={int2x4LF ?? intInputs.int2x4LF}
              onChange={e => setIntInputs(v => ({ ...v, int2x4LF: Number(e.target.value) }))}
              disabled={typeof int2x4LF === 'number'}
              title={typeof int2x4LF === 'number' ? 'Provided by context' : 'Manual'}
            />
          </label>
          <label>
            <span className="ew-subtle">Blocking LF (bath/kitchen)</span>
            <input className="ew-input focus-anim" type="number" inputMode="decimal"
              value={intInputs.blockingLF || 0}
              onChange={e => setIntInputs(v => ({ ...v, blockingLF: Number(e.target.value) }))}
            />
          </label>
          <div></div>
        </div>

        {/* Interior header */}
        <div className="ew-grid ew-head" style={{ '--cols': gridCols }}>
          <div>Item</div>
          <div>Vendor · Family · Size</div>
          <div className="ew-right">Qty</div>
          <div className="ew-right">Waste %</div>
          <div className="ew-right">Final qty</div>
          <div className="ew-right">Unit</div>
          <div className="ew-right">Unit price</div>
          <div className="ew-right">Subtotal</div>
          <div>Notes</div>
          <div></div>
        </div>

        <div className="ew-rows">
          {/* Interior rows */}
          <Row
            gridCols={gridCols}
            label="Interior 2×6 — PT Plates – Loose"
            noteKey="loose:int2x6PT"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('int2x6PT')}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="PT"
              />
            )}
            row={interiorRows.find(r => r.key === 'int2x6PT')}
          />
          <Row
            gridCols={gridCols}
            label="Interior 2×6 — Plates – Loose"
            noteKey="loose:int2x6Plate"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('int2x6Plate')}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="SPF#2"
              />
            )}
            row={interiorRows.find(r => r.key === 'int2x6Plate')}
          />
          <Row
            gridCols={gridCols}
            label="Interior 2×4 — PT Plates – Loose"
            noteKey="loose:int2x4PT"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('int2x4PT')}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="PT"
              />
            )}
            row={interiorRows.find(r => r.key === 'int2x4PT')}
          />
          <Row
            gridCols={gridCols}
            label="Interior 2×4 — Plates – Loose"
            noteKey="loose:int2x4Plate"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('int2x4Plate')}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="SPF#2"
              />
            )}
            row={interiorRows.find(r => r.key === 'int2x4Plate')}
          />
          <Row
            gridCols={gridCols}
            label="Walls (general) — Blocking for Bathroom & Kitchen"
            noteKey="loose:intCabinetBlocking"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('intCabinetBlocking')}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="SPF#2"
              />
            )}
            row={interiorRows.find(r => r.key === 'intCabinetBlocking')}
          />
        </div>

        {/* ───────────── General — nails & bracing ───────────── */}
        <h3 className="ew-h3" style={{ marginTop: 16, marginBottom: 6 }}>General — Nails & bracing</h3>

        {/* General inputs (plate pieces for bracing) */}
        <div className="controls4" style={{ marginBottom: 12 }}>
          <label>
            <span className="ew-subtle">Total plate pieces (from panel groups)</span>
            <input className="ew-input focus-anim" type="number" inputMode="decimal"
              value={generalInputs.platePiecesTotal}
              onChange={e => setGeneralInputs(v => ({ ...v, platePiecesTotal: Number(e.target.value) }))}
            />
          </label>
          <div></div>
          <div></div>
        </div>

        {/* General header */}
        <div className="ew-grid ew-head" style={{ '--cols': gridCols }}>
          <div>Item</div>
          <div>Vendor · Family · Size</div>
          <div className="ew-right">Qty</div>
          <div className="ew-right">Waste %</div>
          <div className="ew-right">Final qty</div>
          <div className="ew-right">Unit</div>
          <div className="ew-right">Unit price</div>
          <div className="ew-right">Subtotal</div>
          <div>Notes</div>
          <div></div>
        </div>

        <div className="ew-rows">
          {/* Concrete nails */}
          <Row
            gridCols={gridCols}
            label="Concrete nails"
            noteKey="loose:nailsConcrete"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('nailsConcrete')}
                defaultVendor="Home Depot"
                defaultFamilyLabel="Drive Pins with Washers (HD)"
                defaultSizeLabel={`3"-100s`}
              />
            )}
            row={generalRows.find(r => r.key === 'nailsConcrete')}
          />

          {/* Sheathing nails */}
          <Row
            gridCols={gridCols}
            label="Sheathing nails"
            noteKey="loose:nailsSheathing"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('nailsSheathing')}
                defaultVendor="Concord"
                defaultFamilyLabel="Bright Ring Coil"
                defaultSizeLabel={`8D-2-3/8x.113-2.7M`}
              />
            )}
            row={generalRows.find(r => r.key === 'nailsSheathing')}
          />

          {/* Framing nails */}
          <Row
            gridCols={gridCols}
            label="Framing nails"
            noteKey="loose:nailsFraming"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('nailsFraming')}
                defaultVendor="Concord"
                defaultFamilyLabel="Bright Common Coil"
                defaultSizeLabel={`12D-3-1/4x.120-2.5M`}
              />
            )}
            row={generalRows.find(r => r.key === 'nailsFraming')}
          />

          {/* Temporary Bracing */}
          <Row
            gridCols={gridCols}
            label="Temporary Bracing"
            noteKey="loose:tempBracing"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('tempBracing')}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="SPF#2"
                defaultSizeLabel={`2x4"-16'`}
              />
            )}
            row={generalRows.find(r => r.key === 'tempBracing')}
          />
            <div className="ew-hint" style={{ alignSelf:'end' }}>
              Temporary bracing uses: pieces × 3 ⇒ boards of 2×4″–16′ (+10% waste)
            </div>
        </div>

        <div className="ew-footer">
          <div className="ew-total">Section subtotal: {fmt(sectionSubtotal)}</div>
        </div>
      </div>
    </div>
  );
}

/** Shared row renderer (supports optional include checkbox under the picker) */
function Row({ gridCols, label, picker, row, noteKey, noteApi, includeControl }) {
  const { getNote, toggleOpen, setNote } = noteApi;
  const n = getNote(noteKey);

  return (
    <Fragment>
      <div className="ew-grid ew-row" style={{ '--cols': gridCols }}>
        <div>{label}</div>

        {/* Picker (+ optional include checkbox row) */}
        <div>
          {picker}
          {includeControl && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={includeControl.checked}
                  onChange={e => includeControl.onChange(e.target.checked)}
                />
                {includeControl.label}
              </label>
            </div>
          )}
        </div>

        {/* Qty raw */}
        <div className="ew-right">{row ? Math.ceil(row.qtyRaw || 0) : '—'}</div>

        {/* Waste % */}
        <div className="ew-right">{row ? (row.wastePct ?? 0) : '—'}</div>

        {/* Final qty */}
        <div className="ew-right">{row?.qtyFinal ?? '—'}</div>

        {/* Unit */}
        <div className="ew-right">{row?.unit ?? '—'}</div>

        {/* Unit price */}
        <div className="ew-right ew-money">{row?.unitPrice ? fmt(row.unitPrice) : '—'}</div>

        {/* Subtotal */}
        <div className="ew-right ew-money">{row?.subtotal ? fmt(row.subtotal) : '—'}</div>

        {/* Notes */}
        <div>
          <div className="ew-subtle" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <span className="ew-chip" title={n.plan || ''}>{n.plan || '—'}</span>
            <button className="ew-btn" style={{ padding: '4px 8px' }} onClick={() => toggleOpen(noteKey)}>
              {n.open ? 'Hide' : 'Notes'}
            </button>
          </div>
          {n.comment && (
            <div className="ew-subtle" title={n.comment}>{wordsPreview(n.comment)}</div>
          )}
        </div>

        {/* spacer */}
        <div></div>
      </div>

      {/* Drawer */}
      {n.open && (
        <div className="ew-row" style={{ padding: 12 }}>
          <div className="controls2" style={{ width: '100%' }}>
            <label>
              <span className="ew-subtle">Plan label</span>
              <input
                className="ew-input focus-anim"
                type="text"
                value={getNote(noteKey).plan}
                onChange={e => setNote(noteKey, { plan: e.target.value })}
              />
            </label>
            <label>
              <span className="ew-subtle">Comment</span>
              <textarea
                className="ew-input focus-anim"
                rows={3}
                value={getNote(noteKey).comment}
                onChange={e => setNote(noteKey, { comment: e.target.value })}
              />
            </label>
          </div>
        </div>
      )}
    </Fragment>
  );
}
