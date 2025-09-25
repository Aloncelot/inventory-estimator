// src/components/LoosePanelMaterials.jsx
'use client';

import { Fragment, useMemo, useState, useEffect } from 'react';
import { parseBoardLengthFt } from '@/domain/lib/parsing';
import ItemPicker from '@/components/ItemPicker';
import { useLocalStorageJson } from '@/hooks/useLocalStorageJson';

import {
  // exterior
  looseExtBottomPlates, looseExtTopPlates, loosePanelBandSheathing,
  looseExtraSheathing, looseZipTapeFromSheets, looseOpeningsBlocking, looseSecondBottomPlate,
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

/**
 * Optional props (you may pass later from groups):
 * - extLengthLF: number             // exterior walls LF
 * - extZipSheetsFinal: number       // ZIP sheets from exterior groups
 * - int2x6LF: number                // interior 2x6 LF
 * - int2x4LF: number                // interior 2x4 LF
 */
export default function LoosePanelMaterials({
  title = 'Loose materials — Wall Panels',
  persistKey = 'loose-panels-0',
  onRemove,
  extLengthLF,
  extZipSheetsFinal,
  int2x6LF,
  int2x4LF,
  ptLFTotal,
  platePiecesTotal,
  onTotalChange,
  onSubtotalChange,
}) {
  // Collapsible
  const [collapsed, setCollapsed] = useState(false);

  // Notes per row
  const [notes, setNotes] = useLocalStorageJson(`inv:v1:notes:${persistKey}`, {});
  const getNote = k => notes[k] || { plan: '', comment: '', open: false };
  const setNote = (k, patch) => setNotes(prev => ({ ...prev, [k]: { ...getNote(k), ...patch } }));
  const toggleOpen = k => setNote(k, { open: !getNote(k).open });

  // ── Exterior context (manual if props not provided) ─────────────
  const [extInputs, setExtInputs] = useState({
    lengthLF: extLengthLF ?? 0,
    panelBandLF: 0,
    panelBandHeightFt: 4,
    lfPerZipSheet: 12,
    tapeRollLenFt: 75,
    openingsBlockingLF: 0,
  });

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
  const effectiveInt2x6LF  = Number(int2x6LF   ?? intInputs.int2x6LF ?? 0);
  const effectiveInt2x4LF  = Number(int2x4LF   ?? intInputs.int2x4LF ?? 0);

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
        wastePct: 10 
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
        wastePct: 10 
      });
    }

    // Panel band sheathing (ZIP family by default)
    {
      const res = loosePanelBandSheathing({ 
        panelBandLF: Number(extInputs.panelBandLF||0), 
        bandHeightFt: Number(extInputs.panelBandHeightFt||0), 
        item: getItem(sel.panelBandSheathing), 
        unit: getUnit(sel.panelBandSheathing)||'sheet' 
      });
      out.push({ 
        key: 'panelBandSheathing', 
        label: 'Panel band sheathing', ...res, 
        item: getItem(sel.panelBandSheathing), 
        wastePct: 10 
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

    // Tape – ZIP system
    {
      const panelBandSheets = out.find(r => r.key === 'panelBandSheathing')?.qtyFinal || 0;
      const extraSheets     = include.extraSheathing ? (out.find(r => r.key === 'extraSheathing')?.qtyFinal || 0) : 0;
      const extZipSheets    = Number(extZipSheetsFinal || 0);
      const totalSheets     = extZipSheets + panelBandSheets + extraSheets;
      const seamLF          = totalSheets * Number(extInputs.lfPerZipSheet || 0);

      const res = looseZipTapeFromSheets({ 
        totalSheets, 
        lfPerSheet: Number(extInputs.lfPerZipSheet||0), 
        rollLenFt: Number(extInputs.tapeRollLenFt||75), 
        item: getItem(sel.zipTape), 
        unit: getUnit(sel.zipTape)||'roll' 
      });
      out.push({ 
        key: 'zipTape', 
        label: 'Tape – ZIP system', ...res, 
        item: getItem(sel.zipTape), 
        wastePct: 5 
      });
    }

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
        wastePct: 10 
      });
    }

    return out;
  }, [
    sel, include,
    effectiveExtLF, extZipSheetsFinal,
    extInputs.panelBandLF, extInputs.panelBandHeightFt, extInputs.lfPerZipSheet, extInputs.tapeRollLenFt, extInputs.openingsBlockingLF,
    lenBottomPT, lenTopPlate, lenOpeningBlk, lenSecondBottom
  ]);

  // ── Build INTERIOR rows ────────────────────────────────────────
  const interiorRows = useMemo(() => {
    const out = [];

    // Interior 2×6 — PT Plates – Loose
    {
      const res = looseInt2x6PTPlates({ 
        lengthLF: effectiveInt2x6LF, 
        boardLenFt: lenInt2x6PT, 
        item: getItem(sel.int2x6PT), 
        unit: getUnit(sel.int2x6PT) 
      });
      out.push({ 
        key: 'int2x6PT', 
        label: 'Interior 2×6 — PT Plates – Loose', ...res, 
        item: getItem(sel.int2x6PT), 
        wastePct: 10 
      });
    }

    // Interior 2×6 — Plates – Loose
    {
      const res = looseInt2x6Plates({ 
        lengthLF: effectiveInt2x6LF, 
        boardLenFt: lenInt2x6Pl, 
        item: getItem(sel.int2x6Plate), 
        unit: getUnit(sel.int2x6Plate) 
      });
      out.push({ 
        key: 'int2x6Plate', 
        label: 'Interior 2×6 — Plates – Loose', ...res, 
        item: getItem(sel.int2x6Plate), 
        wastePct: 10 
      });
    }

    // Interior 2×4 — PT Plates – Loose
    {
      const res = looseInt2x4PTPlates({ 
        lengthLF: effectiveInt2x4LF, 
        boardLenFt: lenInt2x4PT, 
        item: getItem(sel.int2x4PT), 
        unit: getUnit(sel.int2x4PT) 
      });
      out.push({ 
        key: 'int2x4PT', 
        label: 'Interior 2×4 — PT Plates – Loose', ...res, 
        item: getItem(sel.int2x4PT), 
        wastePct: 10 
      });
    }

    // Interior 2×4 — Plates – Loose
    {
      const res = looseInt2x4Plates({ 
        lengthLF: effectiveInt2x4LF, 
        boardLenFt: lenInt2x4Pl, 
        item: getItem(sel.int2x4Plate), 
        unit: getUnit(sel.int2x4Plate) 
      });
      out.push({ 
        key: 'int2x4Plate', 
        label: 'Interior 2×4 — Plates – Loose', ...res, 
        item: getItem(sel.int2x4Plate), 
        wastePct: 10 
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
  const sheetsInThisSection =
    (exteriorRows.find(r => r.key === 'panelBandSheathing')?.qtyFinal || 0) +
    (exteriorRows.find(r => r.key === 'extraSheathing')?.qtyFinal || 0);

  const ptLFAll = Number(ptLFTotal ?? (effectiveExtLF + effectiveInt2x6LF + effectiveInt2x4LF));
  const wallsLFTotal = effectiveExtLF + effectiveInt2x6LF + effectiveInt2x4LF;

  // ── Build GENERAL (nails & bracing) rows ───────────────────────
  const generalRows = useMemo(() => {
    const out = [];

    // Concrete nails (Fastener Plus, Drive Pins with Washers (HD), 3"-100s)
    {
      const res = looseConcreteNails({ 
        ptLF: ptLFTotal, 
        item: getItem(sel.nailsConcrete), 
        unit: getUnit(sel.nailsConcrete) || 'box' 
      });
      out.push({
        key: 'nailsConcrete',
        label: 'Concrete nails',
        ...res,
        item: getItem(sel.nailsConcrete),
        wastePct: 50
      });
    }

    // Sheathing nails (Concord, Bright Ring Coil, 8D-2-3/8x.113-2.7M)
    {
      const res = looseSheathingNails({ 
        sheetsCount: sheetsInThisSection, 
        item: getItem(sel.nailsSheathing), 
        unit: getUnit(sel.nailsSheathing) || 'box' 
      });
      out.push({
        key: 'nailsSheathing',
        label: 'Sheathing nails',
        ...res,
        item: getItem(sel.nailsSheathing),
        wastePct: 50
      });
    }

    // Framing nails (G&P Warehouse, Bright Common Coil, 12D-3-1/4x.120-2.5M)
    {
      const res = looseFramingNails({ 
        wallLF: wallsLFTotal, 
        item: getItem(sel.nailsFraming), 
        unit: getUnit(sel.nailsFraming) || 'box' 
      });
      out.push({
        key: 'nailsFraming',
        label: 'Framing nails',
        ...res,
        item: getItem(sel.nailsFraming),
        wastePct: 50
      });
    }

    // Temporary Bracing (G&P, SPF#2, 2x4"-16')
    {
      // Treat as boards of 16': lengthLF = (platePiecesTotal * 3 * 16), boardLen = 16 → qtyRaw = platePiecesTotal * 3
      const res = looseTempBracing({ 
        platePiecesTotal: Number(platePiecesTotal ?? generalInputs.platePiecesTotal ?? 0), 
        item: getItem(sel.tempBracing), 
        unit: getUnit(sel.tempBracing) 
      });
      out.push({
        key: 'tempBracing',
        label: 'Temporary Bracing',
        ...res,
        item: getItem(sel.tempBracing),
        wastePct: 10
      });
    }

    return out;
  }, [
    sel,
    ptLFTotal, sheetsInThisSection, wallsLFTotal,
    generalInputs.platePiecesTotal
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
            <input className="ew-input focus-anim" type="number" inputMode="decimal"
              value={extInputs.panelBandLF}
              onChange={e => setExtInputs(v => ({ ...v, panelBandLF: Number(e.target.value) }))}
            />
          </label>
          <label>
            <span className="ew-subtle">Band height (ft)</span>
            <input className="ew-input focus-anim" type="number" inputMode="decimal"
              value={extInputs.panelBandHeightFt}
              onChange={e => setExtInputs(v => ({ ...v, panelBandHeightFt: Number(e.target.value) }))}
            />
          </label>
          <label>
            <span className="ew-subtle">ZIP seam LF / sheet</span>
            <input className="ew-input focus-anim" type="number" inputMode="decimal"
              value={extInputs.lfPerZipSheet}
              onChange={e => setExtInputs(v => ({ ...v, lfPerZipSheet: Number(e.target.value) }))}
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
                <div className="ew-hint">Sheets computed from Band LF × Band height</div>
              </div>
            )}
            row={exteriorRows.find(r => r.key === 'panelBandSheathing')}
          />

          {/* Extra sheathing (optional include) */}
          <Row
            gridCols={gridCols}
            label="Extra sheathing (optional)"
            noteKey="loose:extraSheathing"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('extraSheathing')}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="CDX SE"
              />
            )}
            row={exteriorRows.find(r => r.key === 'extraSheathing')}
            includeControl={{
              checked: include.extraSheathing,
              onChange: (v) => setInclude(p => ({ ...p, extraSheathing: v })),
              label: 'Include extra sheathing',
            }}
          />

          {/* Tape – ZIP system */}
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
                <label style={{ minWidth: 170 }}>
                  <span className="ew-subtle">Roll length (ft)</span>
                  <input className="ew-input focus-anim" type="number"
                    value={extInputs.tapeRollLenFt}
                    onChange={e => setExtInputs(v => ({ ...v, tapeRollLenFt: Number(e.target.value) }))}
                  />
                </label>
                <div className="ew-hint">
                  ZIP sheets = (ext: {Number(extZipSheetsFinal||0)}) + (band: {Math.ceil(exteriorRows.find(r=>r.key==='panelBandSheathing')?.qtyFinal||0)}){include.extraSheathing ? ` + (extra: ${Math.ceil(exteriorRows.find(r=>r.key==='extraSheathing')?.qtyFinal||0)})` : ''}
                </div>
              </div>
            )}
            row={exteriorRows.find(r => r.key === 'zipTape')}
          />

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

          {/* Second bottom plate (optional include) */}
          <Row
            gridCols={gridCols}
            label="Second bottom plate (optional)"
            noteKey="loose:secondBottom"
            noteApi={{ getNote, toggleOpen, setNote }}
            picker={(
              <ItemPicker
                compact
                onSelect={setPick('secondBottom')}
                defaultVendor="Gillies & Prittie Warehouse"
                defaultFamilyLabel="SPF#2"
              />
            )}
            row={exteriorRows.find(r => r.key === 'secondBottom')}
            includeControl={{
              checked: include.secondBottom,
              onChange: (v) => setInclude(p => ({ ...p, secondBottom: v })),
              label: 'Include second bottom plate',
            }}
          />
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
          <div className="ew-hint" style={{ alignSelf:'end' }}>
            Temporary bracing uses: pieces × 3 ⇒ boards of 2×4″–16′ (+10% waste)
          </div>
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
                defaultVendor="Fastener Plus"
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
                defaultVendor="Gillies & Prittie Warehouse"
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
