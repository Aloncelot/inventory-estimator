// src/components/LoosePanelMaterials.jsx
"use client";

import React, { // 1. React import needed for Fragment/memo
  Fragment,
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
  useEffectEvent, // 2. Imported useEffectEvent
  memo,
} from "react";
import { parseBoardLengthFt, unitPriceFrom } from "@/domain/lib/parsing";
import ItemPicker from "@/components/ItemPicker";
import AccordionSection from "@/components/ui/AccordionSection";
import RemoveButton from "./ui/RemoveButton";
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

// --- Helpers (unchanged) ---
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
  data,       
  onChange,   // This is a stable function: (updaterFn) => void
  onRemove,
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
  } = data || {};

  // --- START: Input Optimization ---

  // 4. Stable event handler for `onChange`
  const onDataChange = useEffectEvent(onChange);
  
  // 5. Local state for "waste" inputs
  const [localWaste, setLocalWaste] = useState(waste);

  // 6. Local state for "LF" inputs
  const [localOpeningsLF, setLocalOpeningsLF] = useState(String(extInputs.openingsBlockingLF || 0));
  const [localBlockingLF, setLocalBlockingLF] = useState(String(intInputs.blockingLF || 0));

  // 7. Sync local state from props
  const wasteSig = JSON.stringify(waste); // Use a signature
  useEffect(() => {
    setLocalWaste(waste);
  }, [wasteSig]);
  
  useEffect(() => {
    setLocalOpeningsLF(String(extInputs.openingsBlockingLF || 0));
  }, [extInputs.openingsBlockingLF]);
  
  useEffect(() => {
    setLocalBlockingLF(String(intInputs.blockingLF || 0));
  }, [intInputs.blockingLF]);
  
  // 8. Handlers for "waste" inputs
  const handleLocalWasteChange = useCallback((key, e) => {
    setLocalWaste((prev) => ({ ...prev, [key]: e.target.value }));
  }, []);

  const commitWasteChange = useCallback(
    (key, valueToCommit) => {
      const numericValue = Number(valueToCommit) || 0;
      onDataChange((prev) => ({
        ...prev,
        waste: { ...(prev.waste || {}), [key]: numericValue },
      }));
      setLocalWaste((prev) => ({ ...prev, [key]: numericValue }));
    },
    [onDataChange]
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
        setLocalWaste(waste); // Revert to prop
        e.target.blur();
      }
    },
    [commitWasteChange, waste]
  );
  
  // 9. Handlers for "LF" inputs
  const commitOpeningsLF = useCallback(() => {
    const numericValue = Number(localOpeningsLF) || 0;
    onDataChange(prev => ({
      ...prev,
      extInputs: { ...(prev.extInputs || {}), openingsBlockingLF: numericValue }
    }));
    setLocalOpeningsLF(String(numericValue)); // Resync local
  }, [localOpeningsLF, onDataChange]);

  const commitBlockingLF = useCallback(() => {
    const numericValue = Number(localBlockingLF) || 0;
    onDataChange(prev => ({
      ...prev,
      intInputs: { ...(prev.intInputs || {}), blockingLF: numericValue }
    }));
    setLocalBlockingLF(String(numericValue)); // Resync local
  }, [localBlockingLF, onDataChange]);

  // --- END: Input Optimization ---


  // --- Stable Handlers (now use `onDataChange`) ---
  const setCollapsed = useCallback((isOpen) => {
    onDataChange(prev => ({ ...prev, collapsed: !isOpen }));
  }, [onDataChange]);

  const setNote = useCallback((k, patch) => {
    onDataChange(prev => {
      const currentNotes = prev.notes || {};
      const newNotes = { ...currentNotes, [k]: { ...(currentNotes[k] || {}), ...patch } };
      return { ...prev, notes: newNotes };
    });
  }, [onDataChange]);
  
  const getNote = k => (notes || {})[k] || { plan: "", comment: "", open: false };
  const toggleOpen = useCallback((k) => setNote(k, { open: !getNote(k).open }), [setNote, getNote]);

  const setExtInputs = useCallback((updater) => {
    onDataChange(prev => ({
      ...prev,
      extInputs: typeof updater === 'function' ? updater(prev.extInputs || {}) : updater
    }));
  }, [onDataChange]);
  
  const setIntInputs = useCallback((updater) => {
    onDataChange(prev => ({
      ...prev,
      intInputs: typeof updater === 'function' ? updater(prev.intInputs || {}) : updater
    }));
  }, [onDataChange]);
  
  const setInclude = useCallback((updater) => {
    onDataChange(prev => ({
      ...prev,
      include: typeof updater === 'function' ? updater(prev.include || {}) : updater
    }));
  }, [onDataChange]);

  const setPick = useCallback(key => item => {
    onDataChange(prev => ({
      ...prev,
      sel: { ...(prev.sel || {}), [key]: item }
    }));
  }, [onDataChange]);
  
  const setPanelBandEdited = useCallback((val) => {
    onDataChange(prev => ({ ...prev, panelBandEdited: val }));
  }, [onDataChange]);
  
  
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
  
  // Calculations now correctly depend on the 'waste' prop
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
        extLengthLF: Number(effectiveExtLF) || 0, bandHeightFt: 4, 
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
    waste // Depends on the 'waste' prop object
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
    waste // Depends on the 'waste' prop object
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

  
  // 10. Refactor: Use the `lastSentSigRef` pattern to prevent loops
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
      onDataChange(prevData => ({
        ...prevData,
        subtotal: sectionSubtotal,
        generalStats: generalStats,
      }));
    }
  }, [sectionSubtotal, levelId, sheetsExt, sheetsBand, sheetsExtra, nonPTPiecesLevel, ptPiecesLevel, onDataChange]);
  
  
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
              src={open ? '/icons/down.png' : '/icons/minimize.png'} 
              alt={open ? 'Collapse section' : 'Expand section'}
              width={16} height={16} className="acc__chev"
              style={{ display: 'inline-block', verticalAlign: 'middle' }}
            />
            </button>
              <span className="text-section-header">{title}</span>
              <div  className="ew-right text-subtotal-orange" 
              style={{ marginLeft: 'auto' }}>
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
            <span className="ew-subtle">Panel band (LF)</span>
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
                style={{ minWidth: 80, textAlign: "left" }}
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
          {/* ... (Header row unchanged) ... */}
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
              // 11. Optimized Input
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={localWaste.extBottomPT ?? 0}
                onChange={(e) => handleLocalWasteChange('extBottomPT', e)}
                onBlur={(e) => handleWasteBlur('extBottomPT', e)}
                onKeyDown={(e) => handleWasteKeyDown('extBottomPT', e)}
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
              // 11. Optimized Input
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={localWaste.extTopPlate ?? 0}
                onChange={(e) => handleLocalWasteChange('extTopPlate', e)}
                onBlur={(e) => handleWasteBlur('extTopPlate', e)}
                onKeyDown={(e) => handleWasteKeyDown('extTopPlate', e)}
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
              // 11. Optimized Input
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={localWaste.panelBandSheathing ?? 0}
                onChange={(e) => handleLocalWasteChange('panelBandSheathing', e)}
                onBlur={(e) => handleWasteBlur('panelBandSheathing', e)}
                onKeyDown={(e) => handleWasteKeyDown('panelBandSheathing', e)}
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
              // No waste editor for tape (waste.zipTape is 0)
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
                  {/* 11. Optimized Input */}
                  <input className="ew-input focus-anim" type="number"
                    value={localOpeningsLF ?? 0} 
                    onChange={e => setLocalOpeningsLF(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && commitOpeningsLF()}
                    onBlur={commitOpeningsLF}
                    />
                </label>
              </div>
            )}
            row={exteriorRows.find(r => r.key === 'openingsBlocking')}
            wasteEditor={
              // 11. Optimized Input
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={localWaste.openingsBlocking ?? 0}
                onChange={(e) => handleLocalWasteChange('openingsBlocking', e)}
                onBlur={(e) => handleWasteBlur('openingsBlocking', e)}
                onKeyDown={(e) => handleWasteKeyDown('openingsBlocking', e)}
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
                  // 11. Optimized Input
                  <input
                    className="ew-input focus-anim" type="number" inputMode="decimal"
                    value={localWaste.extraSheathing ?? 0}
                    onChange={(e) => handleLocalWasteChange('extraSheathing', e)}
                    onBlur={(e) => handleWasteBlur('extraSheathing', e)}
                    onKeyDown={(e) => handleWasteKeyDown('extraSheathing', e)}
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
                // 11. Optimized Input
                <input
                  className="ew-input focus-anim" type="number" inputMode="decimal"
                  value={localWaste.secondBottom ?? 0}
                  onChange={(e) => handleLocalWasteChange('secondBottom', e)}
                  onBlur={(e) => handleWasteBlur('secondBottom', e)}
                  onKeyDown={(e) => handleWasteKeyDown('secondBottom', e)}
                  style={{ width: 80, padding: 6, textAlign: 'right' }}
                  title="Waste %"
                />
              }
            />
          )}
        </div>
        <div className="ew-footer" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* ... (Footer buttons unchanged) ... */}
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
            {/* 11. Optimized Input */}
            <input className="ew-input focus-anim" type="number" inputMode="decimal"
              value={localBlockingLF ?? 0} 
              onChange={e => setLocalBlockingLF(e.target.value)}
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
              // 11. Optimized Input
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={localWaste.int2x6PT ?? 0}
                onChange={(e) => handleLocalWasteChange('int2x6PT', e)}
                onBlur={(e) => handleWasteBlur('int2x6PT', e)}
                onKeyDown={(e) => handleWasteKeyDown('int2x6PT', e)}
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
              // 11. Optimized Input
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={localWaste.int2x6Plate ?? 0}
                onChange={(e) => handleLocalWasteChange('int2x6Plate', e)}
                onBlur={(e) => handleWasteBlur('int2x6Plate', e)}
                onKeyDown={(e) => handleWasteKeyDown('int2x6Plate', e)}
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
              // 11. Optimized Input
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={localWaste.int2x4PT ?? 0}
                onChange={(e) => handleLocalWasteChange('int2x4PT', e)}
                onBlur={(e) => handleWasteBlur('int2x4PT', e)}
                onKeyDown={(e) => handleWasteKeyDown('int2x4PT', e)}
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
              // 11. Optimized Input
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={localWaste.int2x4Plate ?? 0}
                onChange={(e) => handleLocalWasteChange('int2x4Plate', e)}
                onBlur={(e) => handleWasteBlur('int2x4Plate', e)}
                onKeyDown={(e) => handleWasteKeyDown('int2x4Plate', e)}
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
              // 11. Optimized Input
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={localWaste.intCabinetBlocking ?? 0}
                onChange={(e) => handleLocalWasteChange('intCabinetBlocking', e)}
                onBlur={(e) => handleWasteBlur('intCabinetBlocking', e)}
                onKeyDown={(e) => handleWasteKeyDown('intCabinetBlocking', e)}
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
    // ... (memo comparison unchanged)
    return prev.gridCols === next.gridCols && 
           prev.label === next.label &&
           prev.row === next.row &&
           prev.picker === next.picker &&
           prev.noteKey === next.noteKey &&
           prev.noteApi === next.noteApi &&
           prev.wasteEditor === next.wasteEditor;
  }
);