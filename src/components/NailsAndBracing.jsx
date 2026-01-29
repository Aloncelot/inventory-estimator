// src/components/NailsAndBracing.jsx
"use client";

import React, {
  Fragment,
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
  memo,
} from "react";
import ItemPicker from "@/components/ItemPicker";
import { unitPriceFrom } from "@/domain/lib/parsing";
import AccordionSection from "@/components/ui/AccordionSection";

// Iconos Lucide
import {
  ChevronDown,
  ChevronRight,
  StickyNote,
  Cross,
  Trash2,
  GripVertical
} from 'lucide-react';

// Importaciones DND-KIT para los Extras
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmtMoney = (n) => Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : "$0.00";

const wordsPreview = (s = "", maxWords = 12) => {
  const parts = String(s || "").trim().split(/\s+/);
  if (!parts[0]) return '';
  return parts.length > maxWords ? `${parts.slice(0, maxWords).join(' ')}…` : parts.join(' ');
};

const deref = (x) => (x && x.item ? x.item : x);
const getItem = (s) => deref(s);
const getUnit = (s) => deref(s)?.unit || deref(s)?.raw?.unit || "box";

const gridHeader = '220px 1fr 80px 100px 85px 60px 95px 110px 210px 60px';
const gridRows = '220px 1fr 70px 100px 80px 60px 90px 110px 180px 60px';

const defaultNote = { plan: '', comment: '', open: false };

/* ────────────────────────────────────────────────────────────────────────
   SUB-COMPONENTE: FILA DE CLAVOS (SORTABLE)
   ──────────────────────────────────────────────────────────────────────── */
const SortableNailRow = memo(function SortableNailRow({
  id, label, picker, row, wasteEditor, n, onToggleNote, onNoteChange, onRemove, isExtra
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    display: 'grid',
    gridTemplateColumns: gridRows,
    alignItems: 'center',
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.6 : 1,
    position: 'relative',
    background: isDragging ? 'var(--bg-750)' : 'transparent'
  };

  return (
    <div ref={setNodeRef}>
      <div style={style} className="ew-grid ew-row">
        <div style={{ fontWeight: 600, paddingLeft: '8px' }}>{label}</div>
        <div style={{ padding: '0 8px' }}>{picker}</div>
        <div className="ew-right" style={{ paddingRight: '12px' }}>{Number.isFinite(row.qtyRaw) ? Math.ceil(row.qtyRaw) : 0}</div>
        <div className="ew-right" style={{ padding: '0 8px' }}>{wasteEditor}</div>
        <div className="ew-right" style={{ paddingRight: '12px', fontWeight: 600 }}>{row.qtyFinal || "0"}</div>
        <div className="ew-right" style={{ paddingRight: '8px', opacity: 0.7 }}>{row.unit || "—"}</div>
        <div className="ew-right ew-money" style={{ paddingRight: '12px' }}>{fmtMoney(row.unitPrice)}</div>
        <div className="ew-right ew-money" style={{ paddingRight: '12px', fontWeight: 700, color: 'var(--turq-200)' }}>{fmtMoney(row.subtotal)}</div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingRight: '12px' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
            <span className="ew-chip" style={{ fontSize: '0.7rem' }}>{n.plan || '—'}</span>
            <button className="row-action-btn" onClick={onToggleNote} title="Notes">
              <StickyNote size={16} className="gradient-icon" />
            </button>
          </div>
          {n.comment && <div className="ew-subtle" style={{ textAlign: 'right', fontSize: '0.65rem', marginTop: '2px' }}>{wordsPreview(n.comment)}</div>}
        </div>

        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
          {isExtra && (
            <>
              <div {...attributes} {...listeners} className="drag-handle" style={{ cursor: 'grab' }}><GripVertical size={16} className="gradient-icon" /></div>
              <button className="row-action-btn delete" onClick={onRemove} title="Remove row"><Trash2 size={16} className="gradient-icon" /></button>
            </>
          )}
        </div>
      </div>

      {n.open && (
        <div className="ew-row" style={{ padding: 12, background: 'var(--bg-750)', borderTop: '1px solid var(--border)' }}>
          <div className="controls2" style={{ width: "100%" }}>
            <label><span className="ew-subtle">Plan Label</span><input className="ew-input focus-anim" type="text" value={n.plan || ''} onChange={e => onNoteChange({ plan: e.target.value })} /></label>
            <label><span className="ew-subtle">Comment</span><textarea className="ew-input focus-anim" rows={3} value={n.comment || ''} onChange={e => onNoteChange({ comment: e.target.value })} /></label>
          </div>
        </div>
      )}
    </div>
  );
});

/* ────────────────────────────────────────────────────────────────────────
   COMPONENTE PRINCIPAL: NAILS AND BRACING
   ──────────────────────────────────────────────────────────────────────── */
export default function NailsAndBracing({
  title = "General — Nails & bracing (all levels)",
  data,
  onChange,
  totals = {},
}) {
  const { panelsAll = 0, platePiecesAll = 0, ptPiecesAll = 0, sheetsBandAll = 0, sheetsExtraAll = 0 } = totals;
  const { collapsed = true, sel = {}, waste = { nailsConcrete: 40, nailsSheathing: 40, nailsFraming: 40, tempBracing: 0 }, notes = {}, extras = [] } = data || {};

  const [localWaste, setLocalWaste] = useState(waste);
  const [editingInputs, setEditingInputs] = useState({});

  useEffect(() => { setLocalWaste(waste); }, [JSON.stringify(waste)]);

  const commitWasteChange = useCallback((key, val) => {
    onChange(p => ({ ...p, waste: { ...(p.waste || {}), [key]: Number(val) || 0 } }));
  }, [onChange]);

  const addExtra = useCallback(() => {
    onChange(prev => ({
      ...prev,
      extras: [...(prev.extras || []), {
        id: `gn${Date.now()}`, label: 'Nails', wastePct: 40,
        inputs: { mode: 'LF', qty: 0, density: 0, perBox: 1 },
        sel: null
      }]
    }));
  }, [onChange]);

  // Cálculos Base con Guardias de NaN
  const allSheetsLoose = (Number(sheetsBandAll) || 0) + (Number(sheetsExtraAll) || 0);

  const baseRows = useMemo(() => {
    const rows = [];

    const qConcrete = (Number(ptPiecesAll || 0) * 25) / 100;
    rows.push({ key: 'nailsConcrete', label: 'Concrete nails', qtyRaw: qConcrete, qtyFinal: Math.ceil(qConcrete * (1 + (waste.nailsConcrete / 100))), unit: getUnit(sel.nailsConcrete), unitPrice: unitPriceFrom(getItem(sel.nailsConcrete)) });

    const qSheath = (allSheetsLoose * 80) / 2700;
    rows.push({ key: 'nailsSheathing', label: 'Sheathing nails', qtyRaw: qSheath, qtyFinal: Math.ceil(qSheath * (1 + (waste.nailsSheathing / 100))), unit: getUnit(sel.nailsSheathing), unitPrice: unitPriceFrom(getItem(sel.nailsSheathing)) });

    const qFraming = (Number(platePiecesAll || 0) * 25) / 2500;
    rows.push({ key: 'nailsFraming', label: 'Framing nails', qtyRaw: qFraming, qtyFinal: Math.ceil(qFraming * (1 + (waste.nailsFraming / 100))), unit: getUnit(sel.nailsFraming), unitPrice: unitPriceFrom(getItem(sel.nailsFraming)) });

    // Corrección NaN
    const qBrace = Math.max(0, Number(panelsAll || 0)) * 3;
    rows.push({ key: 'tempBracing', label: 'Temporary Bracing', qtyRaw: qBrace, qtyFinal: Math.ceil(qBrace * (1 + (waste.tempBracing / 100))), unit: getUnit(sel.tempBracing), unitPrice: unitPriceFrom(getItem(sel.tempBracing)) });

    return rows.map(r => ({ ...r, subtotal: (r.qtyFinal || 0) * (r.unitPrice || 0) }));
  }, [ptPiecesAll, allSheetsLoose, platePiecesAll, panelsAll, sel, waste]);

  const computedExtras = useMemo(() => (extras || []).map(ex => {
    const { qty = 0, density = 0, perBox = 1 } = ex.inputs || {};
    const qtyRaw = (Number(qty) * Number(density)) / (Number(perBox) || 1);
    const qtyFinal = Math.ceil(qtyRaw * (1 + (ex.wastePct || 40) / 100));
    const up = unitPriceFrom(getItem(ex.sel));
    return { ...ex, qtyRaw, qtyFinal, unit: getUnit(ex.sel), unitPrice: up, subtotal: qtyFinal * (up || 0) };
  }), [extras]);

  const sectionTotal = Number((baseRows.reduce((s, r) => s + (r.subtotal || 0), 0) + computedExtras.reduce((s, r) => s + (r.subtotal || 0), 0)).toFixed(2));

  useEffect(() => { onChange(prev => ({ ...prev, total: sectionTotal })); }, [sectionTotal]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = extras.findIndex(x => x.id === active.id);
      const newIndex = extras.findIndex(x => x.id === over.id);
      onChange(prev => ({ ...prev, extras: arrayMove(prev.extras, oldIndex, newIndex) }));
    }
  };

  const getNote = (k) => ({ ...defaultNote, ...(notes || {})[k] });
  const setNote = (k, patch) => onChange(prev => ({ ...prev, notes: { ...prev.notes, [k]: { ...defaultNote, ...prev.notes?.[k], ...patch } } }));

  return (
    <div className="ew-card">
      <AccordionSection
        open={!collapsed} onOpenChange={isOpen => onChange(p => ({ ...p, collapsed: !isOpen }))}
        bar={({ open, toggle }) => (
          <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
            <button type="button" className="acc__button" onClick={toggle} style={{ border: 'none', background: 'transparent' }}>
              {open ? <ChevronDown className="gradient-icon" size={20} /> : <ChevronRight className="gradient-icon" size={20} />}
            </button>
            <span className="text-section-header">{title}</span>
            <div className="ew-right text-subtotal-orange ml-auto">Subtotal: {fmtMoney(sectionTotal)}</div>
          </div>
        )}
      >
        <div className="ew-grid ew-grid-header" style={{ display: 'grid', gridTemplateColumns: gridHeader, marginBottom: '4px', alignItems: 'stretch', background: 'var(--bg-750)', minHeight: '40px', borderRadius: '4px' }}>
          {['Item', 'Family · Size · Vendor', 'Qty', 'Waste %', 'Final qty', 'Unit', 'Unit price', 'Subtotal', 'Plan & Notes', ''].map((h, i) => (
            <div key={h} style={{ display: 'flex', alignItems: 'center', justifyContent: i > 1 && i < 9 ? 'flex-end' : 'flex-start', padding: '0 8px' }}>{h}</div>
          ))}
        </div>

        <div className="ew-rows">
          {baseRows.map(r => (
            <SortableNailRow key={r.key} id={r.key} label={r.label} row={r} isExtra={false}
              picker={<ItemPicker compact onSelect={v => onChange(p => ({ ...p, sel: { ...p.sel, [r.key]: v } }))} value={sel[r.key]} />}
              wasteEditor={<input className="ew-input focus-anim" type="number" value={localWaste[r.key] ?? 0} onChange={e => setLocalWaste(v => ({ ...v, [r.key]: e.target.value }))} onBlur={e => commitWasteChange(r.key, e.target.value)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} style={{ width: '100%', textAlign: 'right' }} />}
              n={getNote(r.key)} onToggleNote={() => setNote(r.key, { open: !getNote(r.key).open })} onNoteChange={patch => setNote(r.key, patch)}
            />
          ))}

          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
            <SortableContext items={extras.map(x => x.id)} strategy={verticalListSortingStrategy}>
              {computedExtras.map(ex => (
                <SortableNailRow key={ex.id} id={ex.id} label="Nails" row={ex} isExtra onRemove={() => onChange(prev => ({ ...prev, extras: (prev.extras || []).filter(x => x.id !== ex.id) }))}
                  picker={
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <ItemPicker compact onSelect={v => onChange(prev => ({ ...prev, extras: (prev.extras || []).map(x => x.id === ex.id ? { ...x, sel: v } : x) }))} value={ex.sel} defaultVendor="Concord" />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <select className="ew-select" style={{ flex: '0 0 95px', height: '32px' }} value={ex.inputs.mode} onChange={e => onChange(prev => ({ ...prev, extras: (prev.extras || []).map(x => x.id === ex.id ? { ...x, inputs: { ...x.inputs, mode: e.target.value } } : x) }))}>
                          <option value="LF">LF</option><option value="Sheets">Sheets</option>
                        </select>
                        {['qty', 'density', 'perBox'].map((f) => (
                          <label key={f} style={{ flex: 1 }}>
                            <span className="ew-subtle" style={{ fontSize: '0.6rem' }}>
                              {f === 'qty' ? `Qty (${ex.inputs?.mode || 'LF'})` : f === 'density' ? `Nails/Unit` : 'Nails/box'}
                            </span>
                            <input
                              className="ew-input"
                              style={{ height: '32px' }}
                              type="number"
                              value={editingInputs[`${ex.id}-${f}`] ?? ex.inputs?.[f] ?? 0}
                              onChange={e => setEditingInputs(p => ({ ...p, [`${ex.id}-${f}`]: e.target.value }))}
                              onBlur={e => {
                                onChange(prev => ({
                                  ...prev,
                                  extras: (prev.extras || []).map(x => x.id === ex.id
                                    ? { ...x, inputs: { ...(x.inputs || {}), [f]: Number(e.target.value) || 0 } }
                                    : x)
                                }));
                                setEditingInputs(p => { const n = { ...p }; delete n[`${ex.id}-${f}`]; return n; });
                              }}
                              onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  }
                  wasteEditor={<input className="ew-input focus-anim" type="number" value={ex.wastePct ?? 0} onChange={e => onChange(prev => ({ ...prev, extras: (prev.extras || []).map(x => x.id === ex.id ? { ...x, wastePct: e.target.value } : x) }))} style={{ width: '100%', textAlign: 'right' }} />}
                  n={getNote(ex.id)} onToggleNote={() => setNote(ex.id, { open: !getNote(ex.id).open })} onNoteChange={patch => setNote(ex.id, patch)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* FOOTER CON EL BOTON "CROSS" (PLUS) VISIBLE */}
        <div className="ew-footer" style={{ padding: '12px 8px' }}>
          <button className="ew-btn" onClick={addExtra}>
            <Cross size={14} className="gradient-icon" /> Add Nails Item
          </button>
          <div className="ew-right text-subtotal-orange ml-auto">Group subtotal: {fmtMoney(sectionTotal)}</div>
        </div>
      </AccordionSection>
    </div>
  );
}