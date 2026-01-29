// src/components/LoosePanelMaterials.jsx
"use client";

import React, { Fragment, useMemo, useState, useEffect, useRef, useCallback, memo } from "react";
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

// Iconos Lucide
import { ChevronDown, ChevronRight, StickyNote, RotateCcw } from 'lucide-react';

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmt = (n) => Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : "—";

const wordsPreview = (s = "", maxWords = 12) => {
  const parts = String(s).trim().split(/\s+/);
  if (!parts[0]) return '';
  return parts.length > maxWords ? `${parts.slice(0, maxWords).join(' ')}…` : parts.join(' ');
};

const deref = (x) => (x && x.item ? x.item : x);
const getItem = (s) => deref(s);
const getUnit = (s) => deref(s)?.unit || deref(s)?.raw?.unit || "pcs";
const getSize = (s) => deref(s)?.sizeLabel || deref(s)?.sizeDisplay || "";

/* ────────────────────────────────────────────────────────────────────────
   GRID ESTRICTO (220px inicial para alineación con Nails y Muros)
   ──────────────────────────────────────────────────────────────────────── */
const gridHeader = '220px 1fr 80px 100px 85px 60px 95px 110px 210px 60px';
const gridRows = '220px 1fr 70px 100px 80px 60px 90px 110px 180px 60px';

const defaultNote = { plan: '', comment: '', open: false };

/* ────────────────────────────────────────────────────────────────────────
   SUB-COMPONENTE: FILA DE MATERIALES
   ──────────────────────────────────────────────────────────────────────── */
const Row = memo(function Row({ label, picker, row, noteKey, noteApi, includeControl, wasteEditor }) {
  const { getNote, toggleOpen, setNote } = noteApi;
  const n = getNote(noteKey);

  return (
    <Fragment>
      <div className="ew-grid ew-row" style={{ display: 'grid', gridTemplateColumns: gridRows, alignItems: 'center' }}>
        <div style={{ fontWeight: 600, paddingLeft: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>{label}</div>
        <div style={{ padding: '0 8px' }}>
          {picker}
          {includeControl && (
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: '0.75rem', cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 14, height: 14 }} checked={includeControl.checked} onChange={(e) => includeControl.onChange(e.target.checked)} />
                <span className="ew-subtle">{includeControl.label}</span>
              </label>
            </div>
          )}
        </div>
        <div className="ew-right" style={{ paddingRight: '12px' }}>{row ? Math.ceil(row.qtyRaw || 0) : "—"}</div>
        <div className="ew-right" style={{ padding: '0 8px' }}>{wasteEditor ?? (row ? row.wastePct ?? 0 : "—")}</div>
        <div className="ew-right" style={{ paddingRight: '12px', fontWeight: 600 }}>{row?.qtyFinal ?? "—"}</div>
        <div className="ew-right" style={{ paddingRight: '8px', opacity: 0.7 }}>{row?.unit ?? "—"}</div>
        <div className="ew-right ew-money" style={{ paddingRight: '12px' }}>{row?.unitPrice ? fmt(row.unitPrice) : "—"}</div>
        <div className="ew-right ew-money" style={{ paddingRight: '12px', fontWeight: 700, color: 'var(--turq-200)' }}>{row?.subtotal ? fmt(row.subtotal) : "—"}</div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingRight: '12px' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
            <span className="ew-chip" style={{ fontSize: '0.7rem' }}>{n.plan || '—'}</span>
            <button className="row-action-btn" onClick={() => toggleOpen(noteKey)}><StickyNote size={16} className="gradient-icon" /></button>
          </div>
          {n.comment && <div className="ew-subtle" style={{ textAlign: 'right', fontSize: '0.65rem', marginTop: '2px' }}>{wordsPreview(n.comment)}</div>}
        </div>
        <div></div>
      </div>
      {n.open && (
        <div className="ew-row" style={{ padding: 12, background: 'var(--bg-750)', borderTop: '1px solid var(--border)' }}>
          <div className="controls2" style={{ width: "100%" }}>
            <label><span className="ew-subtle">Plan label</span><input className="ew-input focus-anim" type="text" value={n.plan} onChange={(e) => setNote(noteKey, { plan: e.target.value })} /></label>
            <label><span className="ew-subtle">Comment</span><textarea className="ew-input focus-anim" rows={3} value={n.comment} onChange={(e) => setNote(noteKey, { comment: e.target.value })} /></label>
          </div>
        </div>
      )}
    </Fragment>
  );
});

/* ────────────────────────────────────────────────────────────────────────
   COMPONENTE PRINCIPAL: LOOSE PANEL MATERIALS
   ──────────────────────────────────────────────────────────────────────── */
export default function LoosePanelMaterials({
  title = 'Loose materials — Wall Panels',
  data, onChange, onRemove,
  extLengthLF, int2x6LF, int2x4LF, extZipSheetsFinal, extZipSheetsSum,
}) {
  const {
    collapsed = true, notes = {}, panelBandEdited = false,
    extInputs = { lengthLF: 0, panelBandLF: 0, openingsBlockingLF: 0 },
    intInputs = { int2x6LF: 0, int2x4LF: 0, blockingLF: 0 },
    include = { secondBottom: false, extraSheathing: false },
    sel = {},
    waste = { extBottomPT: 10, extTopPlate: 10, panelBandSheathing: 20, extraSheathing: 10, zipTape: 0, openingsBlocking: 10, secondBottom: 10, int2x6PT: 5, int2x6Plate: 5, int2x4PT: 5, int2x4Plate: 5, intCabinetBlocking: 10 }
  } = data || {};

  // Estados locales para optimizar escritura (onBlur/onEnter)
  const [localWaste, setLocalWaste] = useState(waste);
  const [localControls, setLocalControls] = useState({
    extLF: extLengthLF ?? extInputs.lengthLF ?? 0,
    bandLF: extInputs.panelBandLF ?? 0,
    int6LF: int2x6LF ?? intInputs.int2x6LF ?? 0,
    int4LF: int2x4LF ?? intInputs.int2x4LF ?? 0,
    blockingLF: intInputs.blockingLF ?? 0
  });

  useEffect(() => { setLocalWaste(waste); }, [JSON.stringify(waste)]);
  useEffect(() => {
    setLocalControls({
      extLF: extLengthLF ?? extInputs.lengthLF,
      bandLF: extInputs.panelBandLF,
      int6LF: int2x6LF ?? intInputs.int2x6LF,
      int4LF: int2x4LF ?? intInputs.int2x4LF,
      blockingLF: intInputs.blockingLF
    });
  }, [extLengthLF, extInputs.lengthLF, extInputs.panelBandLF, int2x6LF, intInputs.int2x6LF, int2x4LF, intInputs.int2x4LF, intInputs.blockingLF]);

  // Handlers definidos correctamente
  const setPick = useCallback(key => item => {
    onChange(prev => ({ ...prev, sel: { ...(prev.sel || {}), [key]: item } }));
  }, [onChange]);

  const commitWasteChange = useCallback((key, val) => {
    onChange(p => ({ ...p, waste: { ...(p.waste || {}), [key]: Number(val) || 0 } }));
  }, [onChange]);

  const commitControl = useCallback((field, val) => {
    const num = Number(val) || 0;
    onChange(prev => {
      if (field === 'extLF') return { ...prev, extInputs: { ...prev.extInputs, lengthLF: num } };
      if (field === 'bandLF') return { ...prev, panelBandEdited: true, extInputs: { ...prev.extInputs, panelBandLF: num } };
      if (field === 'int6LF') return { ...prev, intInputs: { ...prev.intInputs, int2x6LF: num } };
      if (field === 'int4LF') return { ...prev, intInputs: { ...prev.intInputs, int2x4LF: num } };
      if (field === 'blockingLF') return { ...prev, intInputs: { ...prev.intInputs, blockingLF: num } };
      return prev;
    });
  }, [onChange]);

  // Cálculos
  const effExtLF = Number(extLengthLF ?? extInputs.lengthLF ?? 0);
  const extSheets = Number(extZipSheetsFinal ?? extZipSheetsSum ?? 0);

  // Sincronizar Panel Band si no ha sido editado manualmente
  useEffect(() => {
    if (!panelBandEdited && extInputs.panelBandLF !== effExtLF) {
      onChange(p => ({ ...p, extInputs: { ...p.extInputs, panelBandLF: effExtLF } }));
    }
  }, [effExtLF, panelBandEdited, onChange]);

  const exteriorRows = useMemo(() => {
    const out = [];
    out.push({ key: 'extBottomPT', label: 'PT Bottom Plates – Loose', ...looseExtBottomPlates({ lengthLF: effExtLF, boardLenFt: parseBoardLengthFt(getSize(sel.extBottomPT)) || 16, item: getItem(sel.extBottomPT), unit: getUnit(sel.extBottomPT), wastePct: waste.extBottomPT }) });
    out.push({ key: 'extTopPlate', label: 'Top Plates – Loose', ...looseExtTopPlates({ lengthLF: effExtLF, boardLenFt: parseBoardLengthFt(getSize(sel.extTopPlate)) || 16, item: getItem(sel.extTopPlate), unit: getUnit(sel.extTopPlate), wastePct: waste.extTopPlate }) });
    out.push({ key: 'panelBandSheathing', label: 'Panel band sheathing', ...loosePanelBandSheathing({ panelBandLF: extInputs.panelBandLF, bandHeightFt: 4, item: getItem(sel.panelBandSheathing), unit: getUnit(sel.panelBandSheathing) || 'sheet', wastePct: waste.panelBandSheathing }) });
    if (include.extraSheathing) out.push({ key: 'extraSheathing', label: 'Extra sheathing (optional)', ...looseExtraSheathing({ extLengthLF: effExtLF, bandHeightFt: 4, item: getItem(sel.extraSheathing), unit: getUnit(sel.extraSheathing) || 'sheet', wastePct: waste.extraSheathing }) });
    if (extSheets > 0) {
      const totalS = extSheets + Number(out.find(r => r.key === 'panelBandSheathing')?.qtyFinal || 0) + (include.extraSheathing ? Number(out.find(r => r.key === 'extraSheathing')?.qtyFinal || 0) : 0);
      const qtyF = Math.ceil(totalS / 6);
      out.push({ key: 'zipTape', label: 'Tape – ZIP system', unit: 'roll', qtyRaw: totalS / 6, qtyFinal: qtyF, unitPrice: unitPriceFrom(getItem(sel.zipTape)), subtotal: qtyF * (unitPriceFrom(getItem(sel.zipTape)) || 0), item: getItem(sel.zipTape) });
    }
    out.push({ key: 'openingsBlocking', label: 'Blocking at openings', ...looseOpeningsBlocking({ openingsLF: extInputs.openingsBlockingLF, boardLenFt: parseBoardLengthFt(getSize(sel.openingsBlocking)) || 10, item: getItem(sel.openingsBlocking), unit: getUnit(sel.openingsBlocking), wastePct: waste.openingsBlocking }) });
    if (include.secondBottom) out.push({ key: 'secondBottom', label: 'Second bottom plate (optional)', ...looseSecondBottomPlate({ lengthLF: effExtLF, boardLenFt: parseBoardLengthFt(getSize(sel.secondBottom)) || 16, item: getItem(sel.secondBottom), unit: getUnit(sel.secondBottom), wastePct: waste.secondBottom }) });
    return out;
  }, [sel, include, effExtLF, extSheets, extInputs, waste]);

  const interiorRows = useMemo(() => {
    const out = [];
    const i6LF = Number(int2x6LF ?? intInputs.int2x6LF ?? 0);
    const i4LF = Number(int2x4LF ?? intInputs.int2x4LF ?? 0);
    out.push({ key: 'int2x6PT', label: 'Interior 2×6 — PT Plates', ...looseInt2x6PTPlates({ lengthLF: i6LF, boardLenFt: parseBoardLengthFt(getSize(sel.int2x6PT)) || 16, item: getItem(sel.int2x6PT), unit: getUnit(sel.int2x6PT), wastePct: waste.int2x6PT }) });
    out.push({ key: 'int2x6Plate', label: 'Interior 2×6 — Plates', ...looseInt2x6Plates({ lengthLF: i6LF, boardLenFt: parseBoardLengthFt(getSize(sel.int2x6Plate)) || 16, item: getItem(sel.int2x6Plate), unit: getUnit(sel.int2x6Plate), wastePct: waste.int2x6Plate }) });
    out.push({ key: 'int2x4PT', label: 'Interior 2×4 — PT Plates', ...looseInt2x4PTPlates({ lengthLF: i4LF, boardLenFt: parseBoardLengthFt(getSize(sel.int2x4PT)) || 16, item: getItem(sel.int2x4PT), unit: getUnit(sel.int2x4PT), wastePct: waste.int2x4PT }) });
    out.push({ key: 'int2x4Plate', label: 'Interior 2×4 — Plates', ...looseInt2x4Plates({ lengthLF: i4LF, boardLenFt: parseBoardLengthFt(getSize(sel.int2x4Plate)) || 16, item: getItem(sel.int2x4Plate), unit: getUnit(sel.int2x4Plate), wastePct: waste.int2x4Plate }) });
    out.push({ key: 'intCabinetBlocking', label: 'Blocking for Bath/Kitchen', ...looseCabinetBlocking({ blockingLF: intInputs.blockingLF, boardLenFt: parseBoardLengthFt(getSize(sel.intCabinetBlocking)) || 8, item: getItem(sel.intCabinetBlocking), unit: getUnit(sel.intCabinetBlocking), wastePct: waste.intCabinetBlocking }) });
    return out;
  }, [sel, int2x6LF, int2x4LF, intInputs, waste]);

  const sectionSubtotal = exteriorRows.reduce((s, r) => s + (r.subtotal || 0), 0) + interiorRows.reduce((s, r) => s + (r.subtotal || 0), 0);

  const noteApi = {
    getNote: k => (notes || {})[k] || { plan: "", comment: "", open: false },
    toggleOpen: k => onChange(p => ({ ...p, notes: { ...p.notes, [k]: { ...(p.notes?.[k] || {}), open: !(p.notes?.[k]?.open) } } })),
    setNote: (k, patch) => onChange(p => ({ ...p, notes: { ...p.notes, [k]: { ...(p.notes?.[k] || {}), ...patch } } }))
  };

  return (
    <div className="ew-card">
      <AccordionSection
        open={!collapsed} onOpenChange={isOpen => onChange(p => ({ ...p, collapsed: !isOpen }))}
        bar={({ open, toggle }) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <button type="button" className="acc__button" onClick={toggle} style={{ border: 'none', background: 'transparent' }}>
              {open ? <ChevronDown className="gradient-icon" size={20} /> : <ChevronRight className="gradient-icon" size={20} />}
            </button>
            <span className="text-section-header">{title}</span>
            <div className="ew-right text-subtotal-orange ml-auto">Subtotal: {fmt(sectionSubtotal)}</div>
          </div>
        )}
      >
        {/* INPUTS DE CONTROL EDITABLES EN UNA SOLA FILA */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '24px', minHeight: '60px', alignItems: 'center' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="ew-subtle" style={{ fontSize: '0.7rem' }}>Ext Wall Length (LF)</span>
            <input className="ew-input focus-anim" type="number"
              value={localControls.extLF}
              onChange={e => setLocalControls(p => ({ ...p, extLF: e.target.value }))}
              onBlur={e => commitControl('extLF', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && e.target.blur()}
              style={{ height: '32px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="ew-subtle" style={{ fontSize: '0.7rem' }}>Panel Band (LF)</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <input className="ew-input focus-anim" type="number"
                value={localControls.bandLF}
                onChange={e => setLocalControls(p => ({ ...p, bandLF: e.target.value }))}
                onBlur={e => commitControl('bandLF', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                style={{ height: '32px', flex: 1 }} />
              {panelBandEdited && <button className="row-action-btn" onClick={() => onChange(p => ({ ...p, panelBandEdited: false }))} title="Reset"><RotateCcw size={14} className="gradient-icon" /></button>}
            </div>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="ew-subtle" style={{ fontSize: '0.7rem' }}>Int 2×6 (LF)</span>
            <input className="ew-input focus-anim" type="number"
              value={localControls.int6LF}
              onChange={e => setLocalControls(p => ({ ...p, int6LF: e.target.value }))}
              onBlur={e => commitControl('int6LF', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && e.target.blur()}
              style={{ height: '32px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="ew-subtle" style={{ fontSize: '0.7rem' }}>Int 2×4 (LF)</span>
            <input className="ew-input focus-anim" type="number"
              value={localControls.int4LF}
              onChange={e => setLocalControls(p => ({ ...p, int4LF: e.target.value }))}
              onBlur={e => commitControl('int4LF', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && e.target.blur()}
              style={{ height: '32px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="ew-subtle" style={{ fontSize: '0.7rem' }}>Int Blocking (LF)</span>
            <input className="ew-input focus-anim" type="number"
              value={localControls.blockingLF}
              onChange={e => setLocalControls(p => ({ ...p, blockingLF: e.target.value }))}
              onBlur={e => commitControl('blockingLF', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && e.target.blur()}
              style={{ height: '32px' }} />
          </label>
        </div>

        {/* HEADER UNIFORME */}
        <div className="ew-grid ew-grid-header" style={{ display: 'grid', gridTemplateColumns: gridHeader, marginBottom: '4px', alignItems: 'stretch', minHeight: '40px', borderRadius: '4px' }}>
          {['Item', 'Family · Size · Vendor', 'Qty', 'Waste %', 'Final qty', 'Unit', 'Unit price', 'Subtotal', 'Plan & Notes', ''].map((h, i) => (
            <div key={h} style={{ display: 'flex', alignItems: 'center', justifyContent: i > 1 && i < 9 ? 'flex-end' : 'flex-start', padding: '0 8px' }}>{h}</div>
          ))}
        </div>

        {/* FILAS DE MATERIALES */}
        <div className="ew-rows">
          <div style={{ padding: '8px 12px', background: 'var(--bg-750)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--turq-400)' }}>Exterior Logic Materials</div>
          {exteriorRows.map(row => (
            <Row key={row.key} label={row.label} row={row} noteKey={`loose:${row.key}`} noteApi={noteApi}
              picker={<ItemPicker compact onSelect={setPick(row.key)} value={sel[row.key]} />}
              includeControl={row.key === 'extraSheathing' || row.key === 'secondBottom' ? { label: 'Include in estimate', checked: include[row.key], onChange: v => onChange(p => ({ ...p, include: { ...p.include, [row.key]: v } })) } : null}
              wasteEditor={row.key !== 'zipTape' ? <input className="ew-input focus-anim" type="number" value={localWaste[row.key]} onChange={e => setLocalWaste(v => ({ ...v, [row.key]: e.target.value }))} onBlur={e => commitWasteChange(row.key, e.target.value)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} style={{ width: '100%', textAlign: 'right' }} /> : null}
            />
          ))}

          <div style={{ padding: '8px 12px', background: 'var(--bg-750)', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--turq-400)', marginTop: 12 }}>Interior Logic Materials</div>
          {interiorRows.map(row => (
            <Row key={row.key} label={row.label} row={row} noteKey={`loose:${row.key}`} noteApi={noteApi}
              picker={<ItemPicker compact onSelect={setPick(row.key)} value={sel[row.key]} />}
              wasteEditor={<input className="ew-input focus-anim" type="number" value={localWaste[row.key]} onChange={e => setLocalWaste(v => ({ ...v, [row.key]: e.target.value }))} onBlur={e => commitWasteChange(row.key, e.target.value)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} style={{ width: '100%', textAlign: 'right' }} />}
            />
          ))}
        </div>
      </AccordionSection>
    </div>
  );
}