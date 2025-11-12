// src/components/LoosePanelMaterials.jsx
"use client";

import { Fragment, useMemo, useState, useEffect, useRef, useCallback, memo } from "react";
import { parseBoardLengthFt, unitPriceFrom } from "@/domain/lib/parsing";
import ItemPicker from "@/components/ItemPicker";
import AccordionSection from "@/components/ui/AccordionSection";
import RemoveButton from "./ui/RemoveButton"; // Make sure this import exists
import {
  looseExtBottomPlates,
  looseExtTopPlates,
  loosePanelBandSheathing,
  looseExtraSheathing,
  looseOpeningsBlocking,
  looseSecondBottomPlate,
  looseInt2x6PTPlates,
  looseInt2x6Plates,
  looseInt2x4PTPlates,
  looseInt2x4Plates,
  looseCabinetBlocking,
} from "@/domain/calculators";

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const fmt = (n) =>
  Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : "—";

// --- Helpers (Corrected) ---
const deref = (x) => (x && x.item ? x.item : x);
const getItem = (s) => deref(s);
const getUnit = (s) => deref(s)?.unit || deref(s)?.raw?.unit || "pcs";
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
const wordsPreview = (s = "", maxWords = 8) => {
  const parts = String(s).trim().split(/\s+/);
  const preview = parts.slice(0, maxWords).join(" ");
  return parts.length > maxWords ? `${preview}…` : preview || "";
};
/* ───────────────────────────────────────────────────────────────── */


export default function LoosePanelMaterials({
  title = 'Loose materials — Wall Panels',
  data,       // <-- 1. Receive data
  onChange,   // <-- 2. Receive stable updater: (updaterFn) => void
  onRemove,
  // Contextual props from Level
  extLengthLF,
  extZipSheetsFinal,
  extZipSheetsSum,
  int2x6LF,
  int2x4LF,
  ptLFTotal,
  levelId,
  platePiecesTotal,
}) {

  // 3. Destructure all data from the data prop
  const {
    collapsed = true, 
    notes = {},
    extInputs = {
      lengthLF: Number(extLengthLF ?? 0),
      panelBandLF: Number(extLengthLF ?? 0),
      panelBandHeightFt: 4,
      openingsBlockingLF: 0,
    },
    panelBandEdited = false,
    intInputs = {
      int2x6LF: int2x6LF ?? 0,
      int2x4LF: int2x4LF ?? 0,
      blockingLF: 0,
    },
    include = {
      secondBottom: false,
      extraSheathing: false,
    },
    sel = {
      extBottomPT: null, extTopPlate: null, panelBandSheathing: null,
      zipTape: null, openingsBlocking: null, secondBottom: null,
      extraSheathing: null, int2x6PT: null, int2x6Plate: null,
      int2x4PT: null, int2x4Plate: null, intCabinetBlocking: null,
    },
    waste = {
      extBottomPT: 10, extTopPlate: 10, panelBandSheathing: 20,
      extraSheathing: 10, zipTape: 0, openingsBlocking: 10,
      secondBottom: 10, int2x6PT: 5, int2x6Plate: 5,
      int2x4PT: 5, int2x4Plate: 5, intCabinetBlocking: 10,
    }
  } = data || {}; // Provide default empty object

  // 4. Create NEW STABLE handlers that call onChange
  
  const setCollapsed = useCallback((isOpen) => {
    onChange(prev => ({ ...prev, collapsed: !isOpen }));
  }, [onChange]);

  const setNote = useCallback((k, patch) => {
    onChange(prev => {
      const currentNotes = prev.notes || {};
      const newNotes = { ...currentNotes, [k]: { ...(currentNotes[k] || {}), ...patch } };
      return { ...prev, notes: newNotes };
    });
  }, [onChange]);
  
  const getNote = k => (notes || {})[k] || { plan: "", comment: "", open: false };
  const toggleOpen = useCallback((k) => setNote(k, { open: !getNote(k).open }), [setNote, getNote]);

  const setExtInputs = useCallback((updater) => {
    onChange(prev => ({
      ...prev,
      // **THIS IS THE FIX for Bug #2**
      // Ensure we use the functional form correctly
      extInputs: typeof updater === 'function' ? updater(prev.extInputs || {}) : updater
    }));
  }, [onChange]);
  
  const setIntInputs = useCallback((updater) => {
    onChange(prev => ({
      ...prev,
      // **THIS IS THE FIX for Bug #3**
      intInputs: typeof updater === 'function' ? updater(prev.intInputs || {}) : updater
    }));
  }, [onChange]);
  
  const setInclude = useCallback((updater) => {
    onChange(prev => ({
      ...prev,
      include: typeof updater === 'function' ? updater(prev.include || {}) : updater
    }));
  }, [onChange]);

  const setPick = useCallback(key => item => {
    onChange(prev => ({
      ...prev,
      sel: { ...(prev.sel || {}), [key]: item }
    }));
  }, [onChange]);
  
  const setPanelBandEdited = useCallback((val) => {
    onChange(prev => ({ ...prev, panelBandEdited: val }));
  }, [onChange]);

  // **THIS IS THE FIX** for uncontrolled input error
  const setWaste = useCallback((key, e) => {
    const rawValue = e.target.value;
    const value = Number(rawValue);
    // Only update state if it's a valid number, otherwise just pass the raw string
    // This allows intermediate states like "1."
    if (!isNaN(value) && Number.isFinite(value)) {
      onChange(prev => ({
        ...prev,
        waste: { ...(prev.waste || {}), [key]: value }
      }));
    } else if (rawValue === "") {
      // Allow clearing the input
       onChange(prev => ({
        ...prev,
        waste: { ...(prev.waste || {}), [key]: 0 } // Or null, but 0 is safer for calcs
      }));
    }
  }, [onChange]);

  // --- **FIX for Bug #1 & #2**: Local state for "LF" inputs ---
  // Ensure default value is never null/undefined
  const [openingsLF, setOpeningsLF] = useState(String(extInputs.openingsBlockingLF || 0));
  const [blockingLF, setBlockingLF] = useState(String(intInputs.blockingLF || 0));

  // Sync local state when prop changes
  useEffect(() => {
    setOpeningsLF(String(extInputs.openingsBlockingLF || 0));
  }, [extInputs.openingsBlockingLF]);
  
  useEffect(() => {
    setBlockingLF(String(intInputs.blockingLF || 0));
  }, [intInputs.blockingLF]);

  // Commit local state on blur/Enter
  const commitOpeningsLF = useCallback(() => {
    setExtInputs(v => ({ ...v, openingsBlockingLF: Number(openingsLF) || 0 }));
  }, [openingsLF, setExtInputs]);

  const commitBlockingLF = useCallback(() => {
    setIntInputs(v => ({ ...v, blockingLF: Number(blockingLF) || 0 }));
  }, [blockingLF, setIntInputs]);
  // -----------------------------------------------------------
  

  // --- (Calculations) ---
  const extSheets = useMemo(
    () => Number(extZipSheetsFinal ?? extZipSheetsSum ?? 0),
    [extZipSheetsFinal, extZipSheetsSum]
  );  
  const showZipTape = extSheets > 0;
  
  const effectiveExtLF     = Number(extLengthLF ?? extInputs.lengthLF ?? 0);
  const effectiveInt2x6LF  = Number(int2x6LF    ?? intInputs.int2x6LF ?? 0);
  const effectiveInt2x4LF  = Number(int2x4LF    ?? intInputs.int2x4LF ?? 0);

  useEffect(() => {
    if (!panelBandEdited) {
      const ext = Number(extLengthLF ?? extInputs.lengthLF ?? 0);
      if (extInputs.panelBandLF !== ext) {
        setExtInputs(v => ({ ...v, panelBandLF: ext }));
      }
    }
  }, [extLengthLF, extInputs.lengthLF, panelBandEdited, setExtInputs, extInputs.panelBandLF]);
  
  const lenBottomPT      = parseBoardLengthFt(getSize(sel.extBottomPT))       || 16;
  const lenTopPlate      = parseBoardLengthFt(getSize(sel.extTopPlate))       || 16;
  const lenOpeningBlk    = parseBoardLengthFt(getSize(sel.openingsBlocking))  || 10;
  const lenSecondBottom  = parseBoardLengthFt(getSize(sel.secondBottom))      || 16;
  const lenInt2x6PT      = parseBoardLengthFt(getSize(sel.int2x6PT))          || 16;
  const lenInt2x6Pl      = parseBoardLengthFt(getSize(sel.int2x6Plate))       || 16;
  const lenInt2x4PT      = parseBoardLengthFt(getSize(sel.int2x4PT))          || 16;
  const lenInt2x4Pl      = parseBoardLengthFt(getSize(sel.int2x4Plate))       || 16;
  
  const exteriorRows = useMemo(() => {
    const out = [];
    {
      const res = looseExtBottomPlates({
        lengthLF: Number(effectiveExtLF) || 0, boardLenFt: Math.max(Number(lenBottomPT) || 0, 1),
        item: getItem(sel.extBottomPT), unit: getUnit(sel.extBottomPT), wastePct: waste.extBottomPT
      });
      out.push({ key: 'extBottomPT', label: 'PT Bottom Plates – Loose', ...res, item: getItem(sel.extBottomPT) });
    }
    {
      const res = looseExtTopPlates({
        lengthLF: Number(effectiveExtLF) || 0, boardLenFt: Math.max(Number(lenTopPlate) || 0, 1),
        item: getItem(sel.extTopPlate), unit: getUnit(sel.extTopPlate), wastePct: waste.extTopPlate
      });
      out.push({ key: 'extTopPlate', label: 'Top Plates – Loose', ...res, item: getItem(sel.extTopPlate) });
    }
    {
      const res = loosePanelBandSheathing({
        panelBandLF: Number(extInputs.panelBandLF || 0), bandHeightFt: 4,
        item: getItem(sel.panelBandSheathing), unit: getUnit(sel.panelBandSheathing) || 'sheet', wastePct: waste.panelBandSheathing,
      });
      out.push({ key: 'panelBandSheathing', label: 'Panel band sheathing', ...res, item: getItem(sel.panelBandSheathing) });
    }
    if (include.extraSheathing) {
      const res = looseExtraSheathing({
        extLengthLF: Number(effectiveExtLF) || 0, bandHeightFt: 4, // <-- Removed extInputs.panelBandHeightFt
        item: getItem(sel.extraSheathing), unit: getUnit(sel.extraSheathing) || 'sheet', wastePct: waste.extraSheathing
      });
      out.push({ key: 'extraSheathing', label: 'Extra sheathing (optional)', ...res, item: getItem(sel.extraSheathing) });
    }
    if (showZipTape) {
      const panelBandSheetsLocal = Number(out.find(r => r.key === 'panelBandSheathing')?.qtyFinal || 0);
      const extraSheetsLocal = include.extraSheathing ? Number(out.find(r => r.key === 'extraSheathing')?.qtyFinal || 0) : 0;
      const totalSheets = Number(extSheets) + panelBandSheetsLocal + extraSheetsLocal;
      const qtyRaw = totalSheets / 6;
      const qtyFinal = Math.ceil(qtyRaw);
      const unit = getUnit(sel.zipTape) || 'roll';
      const item = getItem(sel.zipTape);
      const unitPrice = unitPriceFrom(item);
      const subtotal = qtyFinal * (Number(unitPrice) || 0);
      out.push({ key: 'zipTape', label: 'Tape – ZIP system', unit, qtyRaw, qtyFinal, unitPrice, subtotal, item, wastePct: waste.zipTape });
    }
    {
      const res = looseOpeningsBlocking({
        openingsLF: Number(extInputs.openingsBlockingLF || 0), boardLenFt: Math.max(Number(lenOpeningBlk) || 0, 1),
        item: getItem(sel.openingsBlocking), unit: getUnit(sel.openingsBlocking), wastePct: waste.openingsBlocking
      });
      out.push({ key: 'openingsBlocking', label: 'Blocking at openings', ...res, item: getItem(sel.openingsBlocking) });
    }
    if (include.secondBottom) {
      const res = looseSecondBottomPlate({
        lengthLF: Number(effectiveExtLF) || 0, boardLenFt: Math.max(Number(lenSecondBottom) || 0, 1),
        item: getItem(sel.secondBottom), unit: getUnit(sel.secondBottom), wastePct: waste.secondBottom
      });
      out.push({ key: 'secondBottom', label: 'Second bottom plate (optional)', ...res, item: getItem(sel.secondBottom) });
    }
    return out;
  }, [
    sel, include, effectiveExtLF, extSheets, extInputs.panelBandLF, 
    extInputs.openingsBlockingLF, lenBottomPT, lenTopPlate, lenOpeningBlk, lenSecondBottom, showZipTape, 
    waste
  ]);

  const rowsByKey = useMemo(() => Object.fromEntries(exteriorRows.map(r => [r.key, r])), [exteriorRows]);
  const sheetsBand = useMemo(() => Number(exteriorRows.find(r => r.key === 'panelBandSheathing')?.qtyFinal || 0), [exteriorRows]);
  const sheetsExtra = useMemo(() => Number(exteriorRows.find(r => r.key === 'extraSheathing')?.qtyFinal || 0), [exteriorRows]);
  const sheetsExt   = useMemo(() => Number(extZipSheetsFinal || extZipSheetsSum || 0), [extZipSheetsFinal, extZipSheetsSum]);

  const interiorRows = useMemo(() => {
    const out = [];
    {
      const res = looseInt2x6PTPlates({
        lengthLF: Number(effectiveInt2x6LF) || 0, boardLenFt: Math.max(Number(lenInt2x6PT) || 0, 1),
        item: getItem(sel.int2x6PT), unit: getUnit(sel.int2x6PT), wastePct: waste.int2x6PT,
      });
      out.push({ key: 'int2x6PT', label: 'Interior 2×6 — PT Plates – Loose', ...res, item: getItem(sel.int2x6PT) });
    }
    {
      const res = looseInt2x6Plates({
        lengthLF: Number(effectiveInt2x6LF) || 0, boardLenFt: Math.max(Number(lenInt2x6Pl) || 0, 1),
        item: getItem(sel.int2x6Plate), unit: getUnit(sel.int2x6Plate), wastePct: waste.int2x6Plate,
      });
      out.push({ key: 'int2x6Plate', label: 'Interior 2×6 — Plates – Loose', ...res, item: getItem(sel.int2x6Plate) });
    }
    {
      const res = looseInt2x4PTPlates({
        lengthLF: Number(effectiveInt2x4LF) || 0, boardLenFt: Math.max(Number(lenInt2x4PT) || 0, 1),
        item: getItem(sel.int2x4PT), unit: getUnit(sel.int2x4PT), wastePct: waste.int2x4PT,
      });
      out.push({ key: 'int2x4PT', label: 'Interior 2×4 — PT Plates – Loose', ...res, item: getItem(sel.int2x4PT) });
    }
    {
      const res = looseInt2x4Plates({
        lengthLF: Number(effectiveInt2x4LF) || 0, boardLenFt: Math.max(Number(lenInt2x4Pl) || 0, 1),
        item: getItem(sel.int2x4Plate), unit: getUnit(sel.int2x4Plate), wastePct: waste.int2x4Plate,
      });
      out.push({ key: 'int2x4Plate', label: 'Interior 2×4 — Plates – Loose', ...res, item: getItem(sel.int2x4Plate) });
    }
    {
      const blkLen = parseBoardLengthFt(getSize(sel.intCabinetBlocking)) || 8;
      const res = looseCabinetBlocking({
        blockingLF: Number(intInputs.blockingLF || 0), boardLenFt: Math.max(blkLen, 1),
        item: getItem(sel.intCabinetBlocking), unit: getUnit(sel.intCabinetBlocking), wastePct: waste.intCabinetBlocking
      });
      out.push({ key: 'intCabinetBlocking', label: 'Walls (general) — Blocking for Bathroom & Kitchen', ...res, item: getItem(sel.intCabinetBlocking) });
    }
    return out;
  }, [
    sel, effectiveInt2x6LF, effectiveInt2x4LF, lenInt2x6PT, lenInt2x6Pl, 
    lenInt2x4PT, lenInt2x4Pl, intInputs.blockingLF,
    waste
  ]);

  const nonPTPiecesLevel = useMemo(() => {
    const extTop = Math.ceil(exteriorRows.find(r => r.key === 'extTopPlate')?.qtyFinal || 0);
    const second = Math.ceil(exteriorRows.find(r => r.key === 'secondBottom')?.qtyFinal || 0);
    const int6Pl = Math.ceil(interiorRows.find(r => r.key === 'int2x6Plate')?.qtyFinal || 0);
    const int4Pl = Math.ceil(interiorRows.find(r => r.key === 'int2x4Plate')?.qtyFinal || 0);
    return extTop + second + int6Pl + int4Pl;
  }, [exteriorRows, interiorRows]);

  const ptPiecesLevel = useMemo(() => {
    const parts = [
      { lf: Number(effectiveExtLF)    || 0, len: Math.max(Number(lenBottomPT)   || 0, 1) },
      { lf: Number(effectiveInt2x6LF) || 0, len: Math.max(Number(lenInt2x6PT)   || 0, 1) },
      { lf: Number(effectiveInt2x4LF) || 0, len: Math.max(Number(lenInt2x4PT)   || 0, 1) },
    ];
    return parts.reduce((sum, { lf, len }) => sum + Math.ceil((lf * 1.05) / len), 0);
  }, [ effectiveExtLF, effectiveInt2x6LF, effectiveInt2x4LF, lenBottomPT, lenInt2x6PT, lenInt2x4PT ]);

  const sectionSubtotal = useMemo(() => {
    const a = exteriorRows.reduce((s,r)=>s+(r.subtotal||0),0);
    const b = interiorRows.reduce((s,r)=>s+(r.subtotal||0),0);
    return a + b;
  }, [exteriorRows, interiorRows]);

  
  const lastSentSigRef = useRef('');
  useEffect(() => {
    const generalStats = {
      id: levelId,
      sheetsExt: Number(sheetsExt) || 0,
      sheetsBand: Number(sheetsBand) || 0,
      sheetsExtra: Number(sheetsExtra) || 0,
      platePiecesTotal: Number(nonPTPiecesLevel) || 0,
      ptPieces: Number(ptPiecesLevel) || 0,
    };
    
    const sig = JSON.stringify({ subtotal: sectionSubtotal, stats: generalStats });

    if (sig !== lastSentSigRef.current) {
      lastSentSigRef.current = sig;
      onChange(prevData => ({
        ...prevData,
        subtotal: sectionSubtotal,
        generalStats: generalStats,
      }));
    }
  }, [sectionSubtotal, levelId, sheetsExt, sheetsBand, sheetsExtra, nonPTPiecesLevel, ptPiecesLevel, onChange]);
  
  
  // --- RENDER ---
  const gridCols = 'minmax(220px,1.3fr) 3.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr 1.6fr 0.8fr';
  const subtotalStyle = {
    fontFamily: "'Nova Flat', cursive",
    color: '#f18d5b',
    fontWeight: 700,
    marginLeft: 'auto'
  };

  return (
    <div className="ew-card">
      <AccordionSection
        open={!collapsed}
        onOpenChange={(isOpen) => setCollapsed(isOpen)} // Use the new stable handler
        bar={({ open, toggle }) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <button
              type="button" className="acc__button"
              onClick={toggle} aria-expanded={open} title={open ? "Collapse" : "Expand"}
            >
            <img
              src={open ? '/icons/down.png' : '/icons/minimize.png'} // Corrected icons
              alt={open ? 'Collapse section' : 'Expand section'}
              width={16} height={16} className="acc__chev"
              style={{ display: 'inline-block', verticalAlign: 'middle' }}
            />
            </button>
              <span className="ew-head">{title}</span> 
              <div style={subtotalStyle}>
                Subtotal: {fmt(sectionSubtotal)}
              </div>
              {onRemove && (
              <div style={{ marginLeft: '8px' }}> 
                <RemoveButton onClick={onRemove} title="Remove section" label="Remove section" />
              </div>
            )}
          </div>
        )}
      >  
        {/* ───────────── Exterior walls ───────────── */}
        <h3 className="ew-h3" style={{ marginTop: 0, marginBottom: 6 }}>
          Exterior walls
        </h3>

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
            <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
              <input
                className="ew-input focus-anim"
                type="number" inputMode="decimal"
                value={extInputs.panelBandLF}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPanelBandEdited(true);
                  setExtInputs(prev => ({ ...prev, panelBandLF: Number.isFinite(v) ? v : 0 }));
                }}
                style={{ minWidth: 80, textAlign: "right" }}
              />
              <button
                type="button"
                className="ew-btn ew-btn--turq"
                onClick={() => {
                  setPanelBandEdited(false);
                  setExtInputs(prev => ({
                    ...prev,
                    panelBandLF: Number(extLengthLF ?? prev.lengthLF ?? 0),
                  }));
                }}
                title="Use Exterior LF"
                style={{ padding: '5px 8px', fontSize: '12px' }}
              >
                ↺
              </button>
            </div>
          </label>
          {/* Removed Band Height Input */}
        </div>

        <div className="ew-grid ew-head" style={{ '--cols': gridCols }}>
          <div>Item</div>
          <div>Family · Size · Vendor</div>
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
          <Row
            gridCols={gridCols} label="PT Bottom Plates – Loose"
            noteKey="loose:extBottomPT" noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('extBottomPT')}
                value={sel.extBottomPT}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="PT"
                defaultSizeLabel={`2x6"-8'`}
              />
            )}
            row={exteriorRows.find(r => r.key === 'extBottomPT')}
            wasteEditor={
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={waste.extBottomPT || 0}
                onChange={(e) => setWaste('extBottomPT', e)}
                style={{ width: 80, padding: 6, textAlign: 'right' }}
                title="Waste %"
              />
            }
          />
          <Row
            gridCols={gridCols} label="Top Plates – Loose"
            noteKey="loose:extTopPlate" noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('extTopPlate')}
                value={sel.extTopPlate}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="SPF#2"
                defaultSizeLabel={`2x6"-8'`}
              />
            )}
            row={exteriorRows.find(r => r.key === 'extTopPlate')}
            wasteEditor={
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={waste.extTopPlate || 0}
                onChange={(e) => setWaste('extTopPlate', e)}
                style={{ width: 80, padding: 6, textAlign: 'right' }}
                title="Waste %"
              />
            }
          />
          <Row
            gridCols={gridCols} label="Panel band sheathing"
            noteKey="loose:panelBandSheathing" noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <div className="ew-inline" style={{ alignItems: 'end' }}>
                <ItemPicker
                  compact
                  onSelect={setPick('panelBandSheathing')}
                  value={sel.panelBandSheathing} 
                  defaultVendor="Gillies & Prittie Warehouse"
                  defaultFamilyLabel="Green Zip"
                  defaultSizeLabel={`4x8'-1/2"`}
                />
                <div className="ew-hint">Here: 4′ band ⇒ sheets ≈ (Exterior LF ÷ 8) + waste</div>
              </div>
            )}
            row={exteriorRows.find(r => r.key === 'panelBandSheathing')}
            wasteEditor={
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={waste.panelBandSheathing || 0}
                onChange={(e) => setWaste('panelBandSheathing', e)}
                style={{ width: 80, padding: 6, textAlign: 'right' }}
                title="Waste %"
              />
            }
          />
          {showZipTape && (
            <Row
            gridCols={gridCols} label="Tape – ZIP system"
            noteKey="loose:zipTape" noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <div className="ew-inline" style={{ alignItems: 'end' }}>
                  <ItemPicker
                    compact
                    onSelect={setPick('zipTape')}
                    value={sel.zipTape}
                    defaultVendor="Gillies & Prittie Warehouse"
                    defaultFamilyLabel="ZIP Flashing Tape"
                    defaultSizeLabel={`3.75in x 75ft`}
                  />       
                  <div className="ew-hint">
                    ZIP sheets = (ext: {extSheets}) + (band: {sheetsBand})
                    {include.extraSheathing ? ` + (extra: ${sheetsExtra})` : ''}
                  </div>
                </div>
              )}
              row={exteriorRows.find(r => r.key === 'zipTape')}
              // No waste editor for tape
            />
            )}
          <Row
            gridCols={gridCols} label="Blocking at openings"
            noteKey="loose:openingsBlocking" noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <div className="ew-inline" style={{ alignItems: 'end' }}>
                <ItemPicker
                  compact
                  onSelect={setPick('openingsBlocking')}
                  value={sel.openingsBlocking}
                  defaultVendor="Gillies & Prittie Warehouse"
                  defaultFamilyLabel="SPF#2"
                  defaultSizeLabel={`2x6"-8'`}
                  />
                <label style={{ minWidth: 170 }}>
                  <span className="ew-subtle">Openings blocking (LF)</span>
                  <input className="ew-input focus-anim" type="number"
                    value={openingsLF} // Use local state
                    onChange={e => setOpeningsLF(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && commitOpeningsLF()}
                    onBlur={commitOpeningsLF}
                    />
                </label>
              </div>
            )}
            row={exteriorRows.find(r => r.key === 'openingsBlocking')}
            wasteEditor={
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={waste.openingsBlocking || 0}
                onChange={(e) => setWaste('openingsBlocking', e)}
                style={{ width: 80, padding: 6, textAlign: 'right' }}
                title="Waste %"
              />
            }
            />
            {include.extraSheathing && (
              <Row
                gridCols={gridCols} label="Extra sheathing (optional)"
                noteKey="loose:extraSheathing" noteApi={{ getNote, toggleOpen, setNote }}
                picker={(
                  <div className="ew-inline" style={{ alignItems: 'end', gap: 8 }}>
                    <ItemPicker
                      compact
                      onSelect={setPick('extraSheathing')}
                      value={sel.extraSheathing}
                      defaultVendor="Gillies & Prittie Warehouse"
                      defaultFamilyLabel="CDX SE"
                      defaultSizeLabel={`4x8'-1/2"`}
                    />
                    <button
                      type="button" className="ew-btn"
                      onClick={() => setInclude(p => ({ ...p, extraSheathing: false }))}
                      title="Remove this row"
                    >Remove</button>
                  </div>
                )}
                row={exteriorRows.find(r => r.key === 'extraSheathing')}
                wasteEditor={
                  <input
                    className="ew-input focus-anim" type="number" inputMode="decimal"
                    value={waste.extraSheathing || 0}
                    onChange={(e) => setWaste('extraSheathing', e)}
                    style={{ width: 80, padding: 6, textAlign: 'right' }}
                    title="Waste %"
                  />
                }
              />
            )}
          {include.secondBottom && (
            <Row
              gridCols={gridCols} label="Second bottom plate (optional)"
              noteKey="loose:secondBottom" noteApi={{ getNote, toggleOpen, setNote }}
              picker={(
                <div className="ew-inline" style={{ alignItems: 'end', gap: 8 }}>
                  <ItemPicker
                    compact
                    onSelect={setPick('secondBottom')}
                    value={sel.secondBottom}
                    defaultVendor="Gillies & Prittie Warehouse"
                    defaultFamilyLabel="SPF#2"
                    defaultSizeLabel={`2x6"-8'`}
                  />
                  <button
                    type="button" className="ew-btn"
                    onClick={() => setInclude(p => ({ ...p, secondBottom: false }))}
                    title="Remove this row"
                  >Remove</button>
                </div>
              )}
              row={exteriorRows.find(r => r.key === 'secondBottom')}
              wasteEditor={
                <input
                  className="ew-input focus-anim" type="number" inputMode="decimal"
                  value={waste.secondBottom || 0}
                  onChange={(e) => setWaste('secondBottom', e)}
                  style={{ width: 80, padding: 6, textAlign: 'right' }}
                  title="Waste %"
                />
              }
            />
          )}
        </div>
        <div className="ew-footer" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="ew-btn"
            onClick={() => setInclude(p => ({ ...p, extraSheathing: true }))}
            disabled={include.extraSheathing}
          >
            <img src={"/icons/plus-sign.png"} width={12} height={12} alt="Add" style={{ display: "inline-block", verticalAlign: "middle", marginRight: '6px' }}/>
            Extra sheathing
          </button>
          <button
            className="ew-btn"
            onClick={() => setInclude(p => ({ ...p, secondBottom: true }))}
            disabled={include.secondBottom}
          >
            <img src={"/icons/plus-sign.png"} width={12} height={12} alt="Add" style={{ display: "inline-block", verticalAlign: "middle", marginRight: '6px' }}/>
            Second bottom plate
          </button>
          <div style={{ flex: 1 }} />
        </div>

        {/* ───────────── Interior walls ───────────── */}
        <h3 className="ew-h3" style={{ marginTop: 16, marginBottom: 6 }}>Interior walls</h3>

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
              value={blockingLF || 0} // Use local state
              onChange={e => setBlockingLF(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && commitBlockingLF()}
              onBlur={commitBlockingLF}
            />
          </label>
          <div></div>
        </div>

        <div className="ew-grid ew-head" style={{ '--cols': gridCols }}>
          {/* ... (Header row is unchanged) ... */}
        </div>

        <div className="ew-rows">
          <Row
            gridCols={gridCols} label="Interior 2×6 — PT Plates – Loose"
            noteKey="loose:int2x6PT" noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('int2x6PT')}
                value={sel.int2x6PT}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="PT"
                defaultSizeLabel={`2x6"-8'`}
              />
            )}
            row={interiorRows.find(r => r.key === 'int2x6PT')}
            wasteEditor={
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={waste.int2x6PT || 0}
                onChange={(e) => setWaste('int2x6PT', e)}
                style={{ width: 80, padding: 6, textAlign: 'right' }}
                title="Waste %"
              />
            }
          />
          <Row
            gridCols={gridCols} label="Interior 2×6 — Plates – Loose"
            noteKey="loose:int2x6Plate" noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('int2x6Plate')}
                value={sel.int2x6Plate}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="SPF#2"
                defaultSizeLabel={`2x6"-8'`}
              />
            )}
            row={interiorRows.find(r => r.key === 'int2x6Plate')}
            wasteEditor={
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={waste.int2x6Plate || 0}
                onChange={(e) => setWaste('int2x6Plate', e)}
                style={{ width: 80, padding: 6, textAlign: 'right' }}
                title="Waste %"
              />
            }
          />
          <Row
            gridCols={gridCols} label="Interior 2×4 — PT Plates – Loose"
            noteKey="loose:int2x4PT" noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('int2x4PT')}
                value={sel.int2x4PT}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="PT"
                defaultSizeLabel={`2x4"-8'`}
              />
            )}
            row={interiorRows.find(r => r.key === 'int2x4PT')}
            wasteEditor={
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={waste.int2x4PT || 0}
                onChange={(e) => setWaste('int2x4PT', e)}
                style={{ width: 80, padding: 6, textAlign: 'right' }}
                title="Waste %"
              />
            }
          />
          <Row
            gridCols={gridCols} label="Interior 2×4 — Plates – Loose"
            noteKey="loose:int2x4Plate" noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('int2x4Plate')}
                value={sel.int2x4Plate}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="SPF#2"
                defaultSizeLabel={`2x4"-8'`}
              />
            )}
            row={interiorRows.find(r => r.key === 'int2x4Plate')}
            wasteEditor={
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={waste.int2x4Plate || 0}
                onChange={(e) => setWaste('int2x4Plate', e)}
                style={{ width: 80, padding: 6, textAlign: 'right' }}
                title="Waste %"
              />
            }
          />
          <Row
            gridCols={gridCols} label="Walls (general) — Blocking for Bathroom & Kitchen"
            noteKey="loose:intCabinetBlocking" noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('intCabinetBlocking')}
                value={sel.intCabinetBlocking} 
                defaultVendor="Fairway Lumber"
                defaultFamilyLabel="SPF#2"
                defaultSizeLabel={`2x10"-8'`}
              />
            )}
            row={interiorRows.find(r => r.key === 'intCabinetBlocking')}
            wasteEditor={
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={waste.intCabinetBlocking || 0}
                onChange={(e) => setWaste('intCabinetBlocking', e)}
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

// --- Row Component ---
const Row = memo(
  function Row({ gridCols, label, picker, row, noteKey, noteApi, includeControl, wasteEditor }) {
    const { getNote, toggleOpen, setNote } = noteApi;
    const n = getNote(noteKey);

    return (
      <Fragment>
        <div className="ew-grid ew-row" style={{ "--cols": gridCols }}>
          <div>{label}</div>
          <div>
            {picker}
            {includeControl && (
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={includeControl.checked}
                    onChange={(e) => includeControl.onChange(e.target.checked)}
                  />
                  {includeControl.label}
                </label>
              </div>
            )}
          </div>
          <div className="ew-right">{row ? Math.ceil(row.qtyRaw || 0) : "—"}</div>
          
          <div className="ew-right">
            {wasteEditor ?? (row ? row.wastePct ?? 0 : "—")}
          </div>
          
          <div className="ew-right">{row?.qtyFinal ?? "—"}</div>
          <div className="ew-right">{row?.unit ?? "—"}</div>
          <div className="ew-right ew-money">
            {row?.unitPrice ? fmt(row.unitPrice) : "—"}
          </div>
          <div className="ew-right ew-money">
            {row?.subtotal ? fmt(row.subtotal) : "—"}
          </div>
          <div>
            <div className="ew-subtle" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
              <span className="ew-chip" title={n.plan || ""}>
                {n.plan || "—"}
              </span>
              <button
                className="ew-btn"
                style={{ padding: "4px 8px" }}
                onClick={() => toggleOpen(noteKey)}
              >
                {n.open ? "Hide" : "Notes"}
              </button>
            </div>
            {n.comment && (
              <div className="ew-subtle" title={n.comment}>
                {wordsPreview(n.comment)}
              </div>
            )}
          </div>
          <div></div>
        </div>
        {n.open && (
          <div className="ew-row" style={{ padding: 12 }}>
            <div className="controls2" style={{ width: "100%" }}>
              <label>
                <span className="ew-subtle">Plan label</span>
                <input
                  className="ew-input focus-anim"
                  type="text"
                  value={getNote(noteKey).plan}
                  onChange={(e) => setNote(noteKey, { plan: e.target.value })}
                />
              </label>
              <label>
                <span className="ew-subtle">Comment</span>
                <textarea
                  className="ew-input focus-anim"
                  rows={3}
                  value={getNote(noteKey).comment}
                  onChange={(e) => setNote(noteKey, { comment: e.target.value })}
                />
              </label>
            </div>
          </div>
        )}
      </Fragment>
    );
  },
  (prev, next) => {
    return prev.gridCols === next.gridCols && 
           prev.label === next.label &&
           prev.row === next.row &&
           prev.picker === next.picker &&
           prev.noteKey === next.noteKey &&
           prev.noteApi === next.noteApi &&
           prev.wasteEditor === next.wasteEditor;
  }
);