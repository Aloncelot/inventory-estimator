// src/components/ExteriorWallGroup.jsx
'use strict';

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffectEvent,
} from 'react';
import ItemPicker from '@/components/ItemPicker';
import {
  calcPlates,
  calcStuds,
  calcBlocking,
  calcSheathing,
  calcHeader,
  calcPost,
} from '@/domain/calculators';
import { parseBoardLengthFt } from '@/domain/lib/parsing';
import {
  isLVL,
  isVersaColumn,
} from '@/domain/lib/families';
import AccordionSection from '@/components/ui/AccordionSection';
import EditableTitle from './ui/EditableTitle';

// Iconos Lucide
import {
  ChevronDown,
  ChevronRight,
  Cross, // Cambiado de Plus a Cross según tu instrucción
  Trash2,
  GripVertical,
  StickyNote
} from 'lucide-react';

// --- IMPORTACIONES DND-KIT ---
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

// Helpers
const moneyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const fmt = (n) => (Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : '$0.00');

const wordsPreview = (s = '', maxWords = 12) => {
  const parts = String(s || "").trim().split(/\s+/);
  if (!parts[0]) return '';
  const preview = parts.slice(0, maxWords).join(' ');
  return parts.length > maxWords ? `${preview}…` : preview;
};

const deref = (x) => (x && x.item ? x.item : x);
const getItem = (selLike) => deref(selLike);
const getUnit = (selLike) => deref(selLike)?.unit || deref(selLike)?.raw?.unit || 'pcs';
const getSize = (selLike) => deref(selLike)?.sizeLabel || deref(selLike)?.sizeDisplay || deref(selLike)?.raw?.sizeDisplay || '';

const getFamily = (selLike) => {
  const it = selLike;
  return String(it?.familyLabel ?? it?.familyDisplay ?? it?.raw?.familyDisplay ?? it?.raw?.familyLabel ?? it?.family ?? '').toLowerCase();
};

const defaultNote = { plan: '', comment: '', open: false };

const gridHeader = '150px 1fr 80px 100px 85px 60px 95px 110px 210px 60px';
const gridRows = '150px 1fr 70px 100px 80px 60px 90px 110px 180px 60px';

/* ────────────────────────────────────────────────────────────────────────
   SUB-COMPONENTE: FILA EXTRA ORDENABLE (SORTABLE)
   ──────────────────────────────────────────────────────────────────────── */
function SortableExtraRow({
  ex, gridRows, updateExtra, removeExtra, getNote, toggleOpen, setNote, heightFt, localExtraWaste, handleLocalExtraWasteChange, handleExtraWasteBlur
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ex.id });

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

  const noteKey = `extra:${ex.id}`;
  const n = getNote(noteKey);

  return (
    <div ref={setNodeRef}>
      <div style={style} className="ew-grid ew-row">
        <div style={{ fontWeight: 600 }}>{ex.type}</div>
        <div>
          <ItemPicker compact onSelect={(item) => updateExtra(ex.id, { item })} value={ex.item} defaultVendor="Gillies & Prittie Warehouse" />
          <div style={{ display: 'flex', gap: '8px', marginTop: 2 }}>
            {ex.type === 'Header' && (
              isLVL(getFamily(ex.item)) ? (
                <>
                  <label style={{ flex: 1 }}><span className="ew-subtle">Pieces</span>
                    <input className="ew-input" type="number" value={ex.inputs?.lvlPieces || ''} onChange={(e) => updateExtra(ex.id, { inputs: { ...ex.inputs, lvlPieces: Number(e.target.value) || 0 } })} />
                  </label>
                  <label style={{ flex: 1 }}><span className="ew-subtle">Length (lf)</span>
                    <input className="ew-input" type="number" value={ex.inputs?.lvlLength || ''} onChange={(e) => updateExtra(ex.id, { inputs: { ...ex.inputs, lvlLength: Number(e.target.value) || 0 } })} />
                  </label>
                </>
              ) : (
                <label style={{ flex: 1 }}><span className="ew-subtle">Total header LF</span>
                  <input className="ew-input" type="number" value={ex.inputs?.headerLF || ''} onChange={(e) => updateExtra(ex.id, { inputs: { ...ex.inputs, headerLF: Number(e.target.value) || 0 } })} />
                </label>
              )
            )}
            {ex.type === 'Post' && (
              <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                {isLVL(getFamily(ex.item)) || isVersaColumn(getFamily(ex.item)) ? (
                  <>
                    <label style={{ flex: 1 }}><span className="ew-subtle">Pieces</span>
                      <input className="ew-input" type="number" value={ex.inputs?.pieces || ''} onChange={(e) => updateExtra(ex.id, { inputs: { ...ex.inputs, pieces: Number(e.target.value) || 0 } })} />
                    </label>
                    <label style={{ flex: 1 }}><span className="ew-subtle">Height (ft)</span>
                      <input className="ew-input" type="number" value={ex.inputs?.heightFt ?? heightFt} onChange={(e) => updateExtra(ex.id, { inputs: { ...ex.inputs, heightFt: Number(e.target.value) || 0 } })} />
                    </label>
                  </>
                ) : (
                  <>
                    <label style={{ flex: 1 }}><span className="ew-subtle">Pcs/post</span>
                      <input className="ew-input" type="number" value={ex.inputs?.piecesPerPost || ''} onChange={(e) => updateExtra(ex.id, { inputs: { ...ex.inputs, piecesPerPost: Number(e.target.value) || 0 } })} />
                    </label>
                    <label style={{ flex: 1 }}><span className="ew-subtle">Posts (#)</span>
                      <input className="ew-input" type="number" value={ex.inputs?.numPosts || ''} onChange={(e) => updateExtra(ex.id, { inputs: { ...ex.inputs, numPosts: Number(e.target.value) || 0 } })} />
                    </label>
                  </>
                )}
              </div>
            )}
            {ex.type === 'Studs' && (
              <>
                <label style={{ flex: 1 }}><span className="ew-subtle">Length (LF)</span>
                  <input className="ew-input" type="number" value={ex.inputs?.lengthLF || ''} onChange={e => updateExtra(ex.id, { inputs: { ...ex.inputs, lengthLF: Number(e.target.value) || 0 } })} />
                </label>
                <label style={{ flex: 1 }}><span className="ew-subtle">Stud Spacing (in)</span>
                  <input className="ew-input" type="number" value={ex.inputs?.studSpacingIn || ''} onChange={e => updateExtra(ex.id, { inputs: { ...ex.inputs, studSpacingIn: Number(e.target.value) || 16 } })} />
                </label>
                <label style={{ flex: 1 }}><span className="ew-subtle">Per Location</span>
                  <select style={{ minHeight: '32px' }} className="ew-select" value={ex.inputs?.studMultiplier || 1} onChange={e => updateExtra(ex.id, { inputs: { ...ex.inputs, studMultiplier: Number(e.target.value) || 1 } })}>
                    <option value={1}>Single</option><option value={2}>Double</option><option value={3}>Triple</option><option value={4}>Quad</option>
                  </select>
                </label>
              </>
            )}
          </div>
        </div>

        <div className="ew-right">{Math.ceil(ex.qtyRaw || 0)}</div>
        <div className="ew-right">
          <input className="ew-input focus-anim" type="number" inputMode="decimal"
            value={localExtraWaste[ex.id] ?? ex.wastePct ?? 0}
            onChange={(e) => handleLocalExtraWasteChange(ex.id, e)}
            onBlur={(e) => handleExtraWasteBlur(ex.id, e)}
            style={{ width: '100%', textAlign: 'right' }} />
        </div>

        <div className="ew-right">{ex.qtyFinal || 0}</div>
        <div className="ew-right">{ex.unit || 'pcs'}</div>
        <div className="ew-right ew-money">{ex.unitPrice ? fmt(ex.unitPrice) : '—'}</div>
        <div className="ew-right ew-money">{ex.subtotal ? fmt(ex.subtotal) : '—'}</div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingRight: '8px' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
            <span className="ew-chip" style={{ fontSize: '0.7rem' }}>{n.plan || '—'}</span>
            <button className="row-action-btn" onClick={() => toggleOpen(noteKey)}><StickyNote size={16} className="gradient-icon" /></button>
          </div>
          {n.comment && <div className="ew-subtle" style={{ textAlign: 'right', fontSize: '0.65rem', marginTop: '2px' }}>{wordsPreview(n.comment)}</div>}
        </div>

        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
          {ex.type !== 'Headers infill' && (
            <>
              <div {...attributes} {...listeners} className="drag-handle"><GripVertical size={16} className="gradient-icon" /></div>
              <button className="row-action-btn delete" onClick={() => removeExtra(ex.id)}><Trash2 className="gradient-icon" size={16} /></button>
            </>
          )}
        </div>
      </div>

      {n.open && (
        <div className="ew-row" style={{ padding: 8, background: 'var(--bg-750)', borderTop: '1px solid var(--border)' }}>
          <div style={{ width: '100%', display: 'flex', gap: 12 }}>
            <label style={{ flex: 1 }}><span className="ew-subtle">Plan Label</span>
              <input className="ew-input" type="text" value={n.plan || ""} onChange={e => setNote(noteKey, { plan: e.target.value })} /></label>
            <label style={{ flex: 2 }}><span className="ew-subtle">Comment</span>
              <input className="ew-input" type="text" value={n.comment || ""} onChange={e => setNote(noteKey, { comment: e.target.value })} /></label>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   COMPONENTE PRINCIPAL: EXTERIOR WALL GROUP
   ──────────────────────────────────────────────────────────────────────── */
export default function ExteriorWallGroup({ sectionData, onUpdateSection, title = 'Exterior walls', onRemove }) {
  const { lengthLF = 0, heightFt = 12, studSpacingIn = 16, studMultiplier = 1, waste = {}, sel = {}, notes = {}, extras = [], collapsed = false } = sectionData;

  const [inputValueLF, setInputValueLF] = useState(String(lengthLF));
  const [inputValueHeight, setInputValueHeight] = useState(String(heightFt));
  const [inputValueSpacing, setInputValueSpacing] = useState(String(studSpacingIn));
  const [inputValueMultiplier, setInputValueMultiplier] = useState(String(studMultiplier));

  // Fix uncontrolled warning: Initialize with empty object if undefined
  const [localWaste, setLocalWaste] = useState(waste || {});
  const [localExtraWaste, setLocalExtraWaste] = useState({});

  useEffect(() => {
    setInputValueLF(String(lengthLF));
    setInputValueHeight(String(heightFt));
    setInputValueSpacing(String(studSpacingIn));
    setInputValueMultiplier(String(studMultiplier));
  }, [lengthLF, heightFt, studSpacingIn, studMultiplier]);

  // Sincronización de waste prop -> state local para evitar el error de consola
  const wasteSig = JSON.stringify(waste);
  useEffect(() => {
    setLocalWaste(waste || {});
  }, [wasteSig]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onUpdate = useEffectEvent(onUpdateSection);

  const commitFieldChange = useCallback((fieldName, value) => {
    onUpdate((prev) => ({ ...prev, [fieldName]: Number(value) || 0 }));
  }, [onUpdate]);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = extras.findIndex((x) => x.id === active.id);
      const newIndex = extras.findIndex((x) => x.id === over.id);
      onUpdate(prev => ({ ...prev, extras: arrayMove(prev.extras, oldIndex, newIndex) }));
    }
  };

  const updateExtra = useCallback((id, patch) => {
    onUpdate((prev) => ({ ...prev, extras: (prev.extras || []).map((r) => r.id === id ? { ...r, ...patch } : r) }));
  }, [onUpdate]);

  const removeExtra = useCallback((id) => {
    onUpdate((prev) => ({ ...prev, extras: (prev.extras || []).filter((r) => r.id !== id) }));
  }, [onUpdate]);

  const addExtra = useCallback((type) => {
    const inputs = type === 'Studs' ? { lengthLF: 10, studSpacingIn: 16, studMultiplier: 1 } : {};
    onUpdate((prev) => ({ ...prev, extras: [...(prev.extras || []), { id: `x${Date.now()}`, type, item: null, wastePct: 5, inputs }] }));
  }, [onUpdate]);

  const baseRows = useMemo(() => {
    const bottomLen = parseBoardLengthFt(getSize(sel.bottomPlate)) || 12;
    const topLen = parseBoardLengthFt(getSize(sel.topPlate)) || 12;
    const blockLen = parseBoardLengthFt(getSize(sel.blocking)) || 12;
    return [
      { key: 'bottomPlate', label: 'Bottom plate', ...calcPlates({ lengthLF, boardLenFt: bottomLen, wastePct: waste.bottomPlate || 0, item: getItem(sel.bottomPlate), unit: getUnit(sel.bottomPlate) }) },
      { key: 'topPlate', label: 'Top plate', ...calcPlates({ lengthLF, boardLenFt: topLen, wastePct: waste.topPlate || 0, item: getItem(sel.topPlate), unit: getUnit(sel.topPlate) }) },
      { key: 'studs', label: 'Studs', ...calcStuds({ lengthLF, spacingIn: studSpacingIn, multiplier: studMultiplier, wastePct: waste.studs || 0, item: getItem(sel.studs), unit: getUnit(sel.studs) }) },
      { key: 'blocking', label: 'Blocking', ...calcBlocking({ lengthLF, heightFt, boardLenFt: blockLen, wastePct: waste.blocking || 0, item: getItem(sel.blocking), unit: getUnit(sel.blocking) }) },
      { key: 'sheathing', label: 'Sheathing', ...calcSheathing({ lengthLF, heightFt, wastePct: waste.sheathing || 0, item: getItem(sel.sheathing), unit: getUnit(sel.sheathing) || 'sheet' }) },
    ];
  }, [lengthLF, heightFt, studSpacingIn, studMultiplier, sel, waste]);

  const computedExtras = useMemo(() => {
    return (extras || []).map(r => {
      const fam = getFamily(r.item);
      const boardLenFt = parseBoardLengthFt(getSize(r.item)) || 0;
      let res = { subtotal: 0, qtyFinal: 0, unit: 'pcs' };
      if (r.type === 'Header') res = calcHeader({ isLVL: isLVL(fam), headerLF: r.inputs?.headerLF || 0, lvlPieces: r.inputs?.lvlPieces || 0, lvlLength: r.inputs?.lvlLength || 0, boardLenFt, wastePct: r.wastePct, item: getItem(r.item) });
      if (r.type === 'Post') res = calcPost({ isLinearLF: isLVL(fam) || isVersaColumn(fam), pieces: r.inputs?.pieces || 0, heightFt: r.inputs?.heightFt || heightFt, piecesPerPost: r.inputs?.piecesPerPost || 0, numPosts: r.inputs?.numPosts || 0, wastePct: r.wastePct, item: getItem(r.item) });
      if (r.type === 'Studs') res = calcStuds({ lengthLF: r.inputs?.lengthLF || 0, spacingIn: r.inputs?.studSpacingIn || 16, multiplier: r.inputs?.studMultiplier || 1, wastePct: r.wastePct, item: getItem(r.item), unit: getUnit(r.item) });
      return { ...r, ...res };
    });
  }, [extras, heightFt]);

  const groupSubtotal = useMemo(() => {
    const sum = baseRows.reduce((s, r) => s + (r.subtotal || 0), 0) + computedExtras.reduce((s, r) => s + (r.subtotal || 0), 0);
    return Number(sum.toFixed(2)) || 0;
  }, [baseRows, computedExtras]);

  const lastSentSigRef = useRef('');
  useEffect(() => {
    const currentStats = {
      lengthLF,
      groupSubtotal: Number(groupSubtotal.toFixed(2)),
    };
    const currentSig = JSON.stringify(currentStats);
    if (currentSig !== lastSentSigRef.current) {
      lastSentSigRef.current = currentSig;
      onUpdate((prevData) => ({ ...prevData, ...currentStats }));
    }
  }, [onUpdate, lengthLF, groupSubtotal]);

  const getNote = (k) => ({ ...defaultNote, ...(notes || {})[k] });
  const setNote = useCallback((k, patch) => { onUpdate((prev) => ({ ...prev, notes: { ...prev.notes, [k]: { ...defaultNote, ...prev.notes?.[k], ...patch } } })); }, [onUpdate]);
  const toggleOpen = useCallback((k) => setNote(k, { open: !getNote(k).open }), [setNote, getNote]);

  return (
    <div className="ew-card">
      <AccordionSection
        open={!collapsed}
        onOpenChange={(isOpen) => onUpdate(p => ({ ...p, collapsed: !isOpen }))}
        bar={({ open, toggle }) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <button type="button" className="acc__button" onClick={toggle} style={{ border: 'none', background: 'transparent' }}>
              {open ? <ChevronDown className="gradient-icon" size={20} /> : <ChevronRight className="gradient-icon" size={20} />}
            </button>
            <EditableTitle value={title} onChange={(n) => onUpdate(p => ({ ...p, name: n }))} textClass="text-section-header" />
            <div className="ew-right text-subtotal-orange" style={{ marginLeft: 'auto' }}>Subtotal: {fmt(groupSubtotal)}</div>
            {onRemove && <button className="row-action-btn delete" onClick={onRemove}><Trash2 className="gradient-icon" size={18} /></button>}
          </div>
        )}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px', minHeight: '60px', alignItems: 'center' }}>
          {['lengthLF', 'heightFt', 'studSpacingIn'].map((f, i) => (
            <label key={f} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span className="ew-subtle" style={{ fontSize: '0.7rem' }}>{['Length (LF)', 'Height (ft)', 'Stud spacing (in)'][i]}</span>
              <input className="ew-input focus-anim" type="number" style={{ fontSize: '0.8rem', height: '28px' }} value={[inputValueLF, inputValueHeight, inputValueSpacing][i]} onChange={(e) => [setInputValueLF, setInputValueHeight, setInputValueSpacing][i](e.target.value)} onBlur={(e) => commitFieldChange(f, e.target.value)} />
            </label>
          ))}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span className="ew-subtle" style={{ fontSize: '0.7rem' }}>Studs per location</span>
            <select className="ew-select focus-anim" style={{ fontSize: '0.8rem', height: '28px', padding: '0 24px 0 8px' }} value={inputValueMultiplier} onChange={(e) => { setInputValueMultiplier(e.target.value); commitFieldChange('studMultiplier', e.target.value); }}>
              <option value={1}>Single</option><option value={2}>Double</option><option value={3}>Triple</option><option value={4}>Quad</option>
            </select>
          </label>
        </div>

        <div className="ew-grid ew-grid-header" style={{ display: 'grid', gridTemplateColumns: gridHeader, marginBottom: '4px', alignItems: 'stretch', minHeight: '40px', borderRadius: '4px' }}>
          {['Item', 'Family · Size · Vendor', 'Qty', 'Waste %', 'Final qty', 'Unit', 'Unit price', 'Subtotal', 'Plan & Notes', ''].map((h, i) => (
            <div key={h} style={{ display: 'flex', alignItems: 'center', justifyContent: i > 1 && i < 9 ? 'flex-end' : 'flex-start', padding: '0 8px' }}>{h}</div>
          ))}
        </div>

        <div className="ew-rows">
          {baseRows.map((row) => {
            const noteKey = `base:${row.key}`;
            const n = getNote(noteKey);
            return (
              <Fragment key={row.key}>
                <div className="ew-grid ew-row" style={{ display: 'grid', gridTemplateColumns: gridRows, alignItems: 'center' }}>
                  <div>{row.label}</div>
                  <ItemPicker compact onSelect={(i) => onUpdate(p => ({ ...p, sel: { ...p.sel, [row.key]: i } }))} value={sel[row.key]} />
                  <div className="ew-right">{Math.ceil(row.qtyRaw || 0)}</div>
                  <div className="ew-right">
                    <input className="ew-input focus-anim" type="number" style={{ width: '100%', textAlign: 'right' }} value={localWaste[row.key] ?? 0} onChange={(e) => setLocalWaste(v => ({ ...v, [row.key]: e.target.value }))} onBlur={(e) => onUpdate(p => ({ ...p, waste: { ...p.waste, [row.key]: Number(e.target.value) || 0 } }))} />
                  </div>
                  <div className="ew-right">{row.qtyFinal || 0}</div>
                  <div className="ew-right">{row.unit || 'pcs'}</div>
                  <div className="ew-right ew-money">{fmt(row.unitPrice)}</div>
                  <div className="ew-right ew-money">{fmt(row.subtotal)}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingRight: '8px' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                      <span className="ew-chip" style={{ fontSize: '0.7rem' }}>{n.plan || '—'}</span>
                      <button className="row-action-btn" onClick={() => toggleOpen(noteKey)}><StickyNote size={16} className="gradient-icon" /></button>
                    </div>
                    {n.comment && <div className="ew-subtle" style={{ textAlign: 'right', fontSize: '0.65rem', marginTop: '2px' }}>{wordsPreview(n.comment)}</div>}
                  </div>
                  <div></div>
                </div>
              </Fragment>
            );
          })}
        </div>

        <h3 className="ew-h3" style={{ marginTop: 24, marginBottom: 8, fontSize: '1rem', opacity: 0.8 }}>Extras</h3>
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
          <div className="ew-rows">
            <SortableContext items={extras.map(x => x.id)} strategy={verticalListSortingStrategy}>
              {computedExtras.map((ex) => (
                <SortableExtraRow
                  key={ex.id} ex={ex} gridRows={gridRows} updateExtra={updateExtra} removeExtra={removeExtra}
                  getNote={getNote} toggleOpen={toggleOpen} setNote={setNote} heightFt={heightFt}
                  localExtraWaste={localExtraWaste}
                  handleLocalExtraWasteChange={(id, e) => setLocalExtraWaste(v => ({ ...v, [id]: e.target.value }))}
                  handleExtraWasteBlur={(id, e) => updateExtra(id, { wastePct: Number(e.target.value) || 0 })}
                />
              ))}
            </SortableContext>
          </div>
        </DndContext>

        <div className="ew-footer">
          {['Header', 'Post', 'Studs'].map(t => (
            <button key={t} className="ew-btn" onClick={() => addExtra(t)}>
              <Cross size={14} className="gradient-icon" /> {t}
            </button>
          ))}
          <div className="ew-right text-subtotal-orange" style={{ marginLeft: 'auto' }}>Group subtotal: {fmt(groupSubtotal)}</div>
        </div>
      </AccordionSection>
    </div>
  );
}