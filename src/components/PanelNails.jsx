// src/components/PanelNails.jsx
'use client';

import React, { Fragment, useMemo, useState, useEffect, useRef, useCallback, memo } from 'react';
import ItemPicker from '@/components/ItemPicker';
import AccordionSection from './ui/AccordionSection';
import { unitPriceFrom } from '@/domain/lib/parsing';

// Iconos Lucide - Cambiado Plus por Cross
import { StickyNote, ChevronDown, ChevronRight, Cross, Trash2, GripVertical } from 'lucide-react';

import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMoney = (n) => moneyFmt.format(Number(n) || 0);

const wordsPreview = (s = '', maxWords = 12) => {
  const parts = String(s || "").trim().split(/\s+/);
  if (!parts[0]) return '';
  const preview = parts.slice(0, maxWords).join(' ');
  return parts.length > maxWords ? `${preview}…` : preview;
};

const deref = (x) => (x && x.item ? x.item : x);
const getItem = (s) => deref(s);
const getUnit = (s) => deref(s)?.unit || deref(s)?.raw?.unit || 'box';

/* ────────────────────────────────────────────────────────────────────────
   CONSTANTES DE GRID ESTRICTAS (Alineación 1:1 con Muros)
   ──────────────────────────────────────────────────────────────────────── */
const GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: '220px 1fr 80px 100px 80px 60px 100px 120px 200px 60px',
  alignItems: 'center',
  gap: '0'
};

const defaultNote = { plan: '', comment: '', open: false };

/* ────────────────────────────────────────────────────────────────────────
   SUB-COMPONENTE: FILA (BASE Y EXTRA)
   ──────────────────────────────────────────────────────────────────────── */
const NailRowLayout = memo(function NailRowLayout({
  id, label, picker, row, wasteEditor, n, onToggleNote, onNoteChange, onRemove, isExtra, attributes, listeners, setNodeRef, transform, transition, isDragging
}) {
  const style = {
    ...GRID_STYLE,
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition,
    zIndex: isDragging ? 100 : 'auto',
    opacity: isDragging ? 0.6 : 1,
    position: 'relative',
    background: isDragging ? 'var(--bg-750)' : 'transparent',
    minHeight: '48px',
    padding: '4px 0',
    borderBottom: '1px solid var(--border-subtle)'
  };

  return (
    <div ref={setNodeRef} className="ew-grid-container">
      <div style={style} className="ew-row">
        <div style={{ fontWeight: 600, paddingLeft: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>
          {label}
        </div>
        <div style={{ padding: '0 8px' }}>{picker}</div>
        <div className="ew-right" style={{ paddingRight: '12px' }}>{Math.ceil(row.qtyRaw || 0)}</div>
        <div className="ew-right" style={{ padding: '0 8px' }}>{wasteEditor}</div>
        <div className="ew-right" style={{ paddingRight: '12px', fontWeight: 600 }}>{row.qtyFinal ?? '—'}</div>
        <div className="ew-right" style={{ paddingRight: '8px', opacity: 0.7 }}>{row.unit || '—'}</div>
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
        <div className="ew-row" style={{ padding: 8, background: 'var(--bg-750)', borderTop: '1px solid var(--border)' }}>
          <div style={{ width: '100%', display: 'flex', gap: 12 }}>
            <label style={{ flex: 1 }}><span className="ew-subtle">Plan Label</span>
              <input className="ew-input" type="text" value={n.plan || ""} onChange={e => onNoteChange({ plan: e.target.value })} /></label>
            <label style={{ flex: 2 }}><span className="ew-subtle">Comment</span>
              <input className="ew-input" type="text" value={n.comment || ""} onChange={e => onNoteChange({ comment: e.target.value })} /></label>
          </div>
        </div>
      )}
    </div>
  );
});

const StaticNailRow = (props) => <NailRowLayout {...props} isExtra={false} />;
const SortableNailRow = (props) => {
  const sortable = useSortable({ id: props.id });
  return <NailRowLayout {...props} {...sortable} isExtra={true} />;
};

function PanelNailsComponent({ title = 'Panels — Nails', data, onChange, totalPanelSheets = 0, totalBottomPlatePiecesPanel = 0, ptPlatePiecesPanels, panelPtBoards }) {
  const { sel = {}, waste = { sheath: 40, frame8d: 40, frame12d: 40 }, notes = {}, extras = [], collapsed = true } = data || {};
  const [localWaste, setLocalWaste] = useState(waste || {});
  const [editingInputs, setEditingInputs] = useState({});

  useEffect(() => { setLocalWaste({ sheath: waste.sheath ?? 40, frame8d: waste.frame8d ?? 40, frame12d: waste.frame12d ?? 40 }); }, [waste.sheath, waste.frame8d, waste.frame12d]);

  const updateExtraInputs = (id, patch) => { onChange(prev => ({ ...prev, extras: (prev.extras || []).map(x => x.id === id ? { ...x, inputs: { ...x.inputs, ...patch } } : x) })); };
  const updateExtraData = (id, patch) => { onChange(prev => ({ ...prev, extras: (prev.extras || []).map(x => x.id === id ? { ...x, ...patch } : x) })); };

  const ptBoards = Number(ptPlatePiecesPanels ?? panelPtBoards ?? 0);
  const baseRows = useMemo(() => {
    const qSheath = (Number(totalPanelSheets) || 0) * 80 / 2700;
    const q8d = ptBoards * 25 / 2700;
    const q12d = (Number(totalBottomPlatePiecesPanel) || 0) * 80 / 2500;
    return [
      { key: 'sheath', label: 'Sheathing nails', qtyRaw: qSheath, qtyFinal: Math.ceil(qSheath * (1 + (waste.sheath ?? 40) / 100)), unit: getUnit(sel.nailsSheath), unitPrice: unitPriceFrom(getItem(sel.nailsSheath)) },
      { key: 'frame8d', label: 'Framing nails (8D)', qtyRaw: q8d, qtyFinal: Math.ceil(q8d * (1 + (waste.frame8d ?? 40) / 100)), unit: getUnit(sel.nailsFrame8d), unitPrice: unitPriceFrom(getItem(sel.nailsFrame8d)) },
      { key: 'frame12d', label: 'Framing nails (12D)', qtyRaw: q12d, qtyFinal: Math.ceil(q12d * (1 + (waste.frame12d ?? 40) / 100)), unit: getUnit(sel.nailsFrame12d), unitPrice: unitPriceFrom(getItem(sel.nailsFrame12d)) }
    ].map(r => ({ ...r, subtotal: (r.qtyFinal || 0) * (r.unitPrice || 0) }));
  }, [totalPanelSheets, totalBottomPlatePiecesPanel, ptBoards, sel, waste]);

  const computedExtras = useMemo(() => (extras || []).map(ex => {
    const { qty, density, perBox } = ex.inputs || {};
    const qtyRaw = (Number(qty || 0) * Number(density || 0)) / (Number(perBox) || 1);
    const qtyFinal = Math.ceil(qtyRaw * (1 + (ex.wastePct || 40) / 100));
    const up = unitPriceFrom(getItem(ex.sel));
    return { ...ex, qtyRaw, qtyFinal, unit: getUnit(ex.sel), unitPrice: up, subtotal: qtyFinal * (up || 0) };
  }), [extras]);

  const sectionTotal = useMemo(() => Number((baseRows.reduce((s, r) => s + (r.subtotal || 0), 0) + computedExtras.reduce((s, r) => s + (r.subtotal || 0), 0)).toFixed(2)), [baseRows, computedExtras]);

  useEffect(() => { onChange(prev => ({ ...prev, total: sectionTotal })); }, [sectionTotal]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const handleDragEnd = (event) => { const { active, over } = event; if (active.id !== over?.id) { const oldIndex = extras.findIndex(x => x.id === active.id); const newIndex = extras.findIndex(x => x.id === over.id); onChange(prev => ({ ...prev, extras: arrayMove(prev.extras, oldIndex, newIndex) })); } };

  return (
    <div className="ew-card">
      <AccordionSection open={!collapsed} onOpenChange={isOpen => onChange(p => ({ ...p, collapsed: !isOpen }))}
        bar={({ open, toggle }) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <button type="button" className="acc__button" onClick={toggle} style={{ border: 'none', background: 'transparent' }}>
              {open ? <ChevronDown className="gradient-icon" size={20} /> : <ChevronRight className="gradient-icon" size={20} />}
            </button>
            <span className="text-section-header">{title}</span>
            <div className="ew-right text-subtotal-orange ml-auto" style={{ fontWeight: '700', fontFamily: "var(--font-money)" }}>Subtotal: {fmtMoney(sectionTotal)}</div>
          </div>
        )}
      >
        <div className="ew-grid ew-grid-header" style={{ ...GRID_STYLE, marginBottom: '4px', background: 'var(--bg-750)', minHeight: '40px', borderRadius: '4px' }}>
          {['Item', 'Family · Size · Vendor', 'Qty', 'Waste %', 'Final qty', 'Unit', 'Unit price', 'Subtotal', 'Plan & Notes', ''].map((h, i) => (
            <div key={h} style={{ display: 'flex', alignItems: 'center', justifyContent: i > 1 && i < 9 ? 'flex-end' : 'flex-start', padding: '0 8px' }}>{h}</div>
          ))}
        </div>

        <div className="ew-rows">
          {baseRows.map((r) => (
            <StaticNailRow
              key={r.key} id={r.key} label={r.label} row={r}
              picker={<ItemPicker compact onSelect={v => onChange(p => ({ ...p, sel: { ...p.sel, [`nails${r.key.charAt(0).toUpperCase() + r.key.slice(1)}`]: v } }))} value={sel[`nails${r.key.charAt(0).toUpperCase() + r.key.slice(1)}`]} defaultVendor="Concord" />}
              wasteEditor={<input className="ew-input focus-anim" type="number" value={localWaste[r.key] || 0} onChange={e => setLocalWaste(v => ({ ...v, [r.key]: e.target.value }))} onBlur={e => onChange(p => ({ ...p, waste: { ...(p.waste || {}), [r.key]: Number(e.target.value) || 0 } }))} style={{ width: '100%', textAlign: 'right' }} />}
              n={{ ...defaultNote, ...(notes || {})[r.key] }} onToggleNote={() => onChange(p => ({ ...p, notes: { ...p.notes, [r.key]: { ...(p.notes?.[r.key] || defaultNote), open: !(p.notes?.[r.key]?.open) } } }))}
              onNoteChange={patch => onChange(p => ({ ...p, notes: { ...p.notes, [r.key]: { ...(p.notes?.[r.key] || defaultNote), ...patch } } }))}
            />
          ))}

          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
            <SortableContext items={extras.map(x => x.id)} strategy={verticalListSortingStrategy}>
              {computedExtras.map((ex) => (
                <SortableNailRow
                  key={ex.id} id={ex.id} label="Nails" row={ex} onRemove={() => onChange(prev => ({ ...prev, extras: (prev.extras || []).filter(x => x.id !== ex.id) }))}
                  picker={
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <ItemPicker compact onSelect={v => updateExtraData(ex.id, { sel: v })} value={ex.sel} defaultVendor="Concord" />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <select className="ew-select" style={{ flex: '0 0 95px', height: '32px' }} value={ex.inputs.mode} onChange={e => updateExtraInputs(ex.id, { mode: e.target.value })}>
                          <option value="LF">LF</option><option value="Sheets">Sheets</option>
                        </select>
                        {['qty', 'density', 'perBox'].map((f) => (
                          <label key={f} style={{ flex: 1 }}>
                            <span className="ew-subtle" style={{ fontSize: '0.6rem' }}>{f === 'qty' ? `Qty (${ex.inputs.mode})` : f === 'density' ? `Nails/Unit` : 'Nails/box'}</span>
                            <input className="ew-input" style={{ height: '32px' }} type="number" value={editingInputs[`${ex.id}-${f}`] ?? ex.inputs[f] ?? 0}
                              onChange={e => setEditingInputs(p => ({ ...p, [`${ex.id}-${f}`]: e.target.value }))}
                              onBlur={e => { updateExtraInputs(ex.id, { [f]: Number(e.target.value) || 0 }); setEditingInputs(p => { const n = { ...p }; delete n[`${ex.id}-${f}`]; return n; }); }}
                              onKeyDown={e => e.key === 'Enter' && e.target.blur()} />
                          </label>
                        ))}
                      </div>
                    </div>
                  }
                  wasteEditor={<input className="ew-input focus-anim" type="number" value={ex.wastePct || 0} onChange={e => updateExtraData(ex.id, { wastePct: e.target.value })} style={{ width: '100%', textAlign: 'right' }} />}
                  n={{ ...defaultNote, ...(notes || {})[ex.id] }} onToggleNote={() => updateExtraData(ex.id, { notes: { ...(notes[ex.id] || defaultNote), open: !(notes[ex.id]?.open) } })}
                  onNoteChange={patch => onChange(p => ({ ...p, notes: { ...p.notes, [ex.id]: { ...(p.notes?.[ex.id] || defaultNote), ...patch } } }))}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="ew-footer" style={{ padding: '12px 8px' }}>
          <button className="ew-btn" onClick={() => onChange(prev => ({ ...prev, extras: [...(prev.extras || []), { id: `n${Date.now()}`, label: 'Nails', wastePct: 40, inputs: { mode: 'LF', qty: 0, density: 0, perBox: 1 }, sel: null }] }))}>
            <Cross size={14} className="gradient-icon" /> Add Nails Item
          </button>
          <div className="ew-right text-subtotal-orange ml-auto">Group subtotal: {fmtMoney(sectionTotal)}</div>
        </div>
      </AccordionSection>
    </div>
  );
}

const PanelNails = memo(PanelNailsComponent);
export default PanelNails;