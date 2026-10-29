// src/components/ui/mat.jsx
// Shared building blocks so every estimating section looks and behaves the same:
// page header, collapsible group, compact inputs, the material row grid and notes.
'use client';

import { useEffect, useRef, useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, StickyNote, GripVertical, Trash2, Plus, X } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';

/* ── formatting ─────────────────────────────────────────────────────────── */
const USD = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
export const fmtMoney = (n) => (Number.isFinite(Number(n)) ? USD.format(Number(n)) : '$0.00');
export const fmtQty = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return Number.isInteger(v) ? v.toLocaleString('en-US') : Math.ceil(v).toLocaleString('en-US');
};
export const sumBy = (arr = [], key = 'subtotal') =>
  Number((arr || []).reduce((s, r) => s + (Number(r?.[key]) || 0), 0).toFixed(2));

/* ── page header (sticky, one line) ─────────────────────────────────────── */
export function PageHeader({ icon: Icon, title, meta, totalLabel = 'Total', total, actions }) {
  return (
    <header className="page-head">
      {Icon ? <span className="page-head__icon"><Icon size={18} /></span> : null}
      <h1 className="text-section-title">{title}</h1>
      {meta ? <span className="page-head__meta">{meta}</span> : null}
      {actions ? <div className="page-head__actions">{actions}</div> : null}
      {total !== undefined ? (
        <div className="page-head__total">
          <span className="lbl">{totalLabel}</span>
          <span className="money-grand">{fmtMoney(total)}</span>
        </div>
      ) : null}
    </header>
  );
}

/* ── chevron toggle ─────────────────────────────────────────────────────── */
export function Chevron({ open, onClick, label = 'section' }) {
  return (
    <button
      type="button"
      className="acc__button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
      title={open ? 'Collapse' : 'Expand'}
    >
      <motion.span style={{ display: 'inline-flex' }} initial={false} animate={{ rotate: open ? 0 : -90 }} transition={COLLAPSE_SPRING}>
        <ChevronDown size={16} />
      </motion.span>
    </button>
  );
}

/* ── inputs that commit on blur / Enter (keeps typing fast) ─────────────── */
export function NumInput({ value, onCommit, className = '', w, allowEmpty = false, ...rest }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  const commit = () => {
    if (String(local) === String(value ?? '')) return;
    if (allowEmpty && local === '') return onCommit('');
    onCommit(Number(local) || 0);
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      className={`ew-input ${className}`}
      style={w ? { width: w } : undefined}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { setLocal(value ?? ''); e.currentTarget.blur(); }
      }}
      {...rest}
    />
  );
}

export function TextInput({ value, onCommit, className = '', multiline = false, ...rest }) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  const commit = () => { if (local !== (value ?? '')) onCommit(local); };
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <Tag
      type={multiline ? undefined : 'text'}
      rows={multiline ? 1 : undefined}
      className={`ew-input ${className}`}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !(multiline && e.shiftKey)) { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { setLocal(value ?? ''); e.currentTarget.blur(); }
      }}
      {...rest}
    />
  );
}

/* label + control on one line */
export function Fld({ label, w, children, title }) {
  return (
    <label className="fld" style={w ? { '--w': typeof w === 'number' ? `${w}px` : w } : undefined} title={title}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function MultiplierSelect({ value, onChange, w = 76 }) {
  return (
    <select className="ew-select" style={{ width: w }} value={value || 1} onChange={(e) => onChange(Number(e.target.value) || 1)}>
      <option value={1}>Single</option>
      <option value={2}>Double</option>
      <option value={3}>Triple</option>
      <option value={4}>Quad</option>
    </select>
  );
}

/* ── spring collapse (sections, levels) ─────────────────────────────────
   Height springs open/closed; overflow is clipped only while moving so
   dropdowns inside an open section are never cut off. */
const COLLAPSE_SPRING = { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 };
export function Collapse({ open, children, className }) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="body"
          className={className}
          initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
          animate={{ height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } }}
          exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
          transition={{ height: COLLAPSE_SPRING, opacity: { duration: 0.18 } }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ── collapsible group (Section 1, Panel nails, Foundation…) ────────────── */
export function GroupBlock({
  title, subtotal, subtotalLabel = 'Subtotal', open = true, onToggle,
  actions, toolbar, children, standalone = false, dragHandleProps, className = '',
}) {
  return (
    <section className={`grp${standalone ? ' is-standalone' : ''} ${className}`}>
      <div className="grp-head">
        {dragHandleProps ? (
          <span className="drag-handle" title="Drag to reorder" {...dragHandleProps}><GripVertical size={14} /></span>
        ) : null}
        <Chevron open={open} onClick={() => onToggle?.(!open)} label={typeof title === 'string' ? title : 'section'} />
        <div className="grp-title">{title}</div>
        {open && toolbar ? <div className="toolbar" style={{ padding: 0, marginLeft: 8 }}>{toolbar}</div> : null}
        {subtotal !== undefined ? (
          <div className="grp-total"><span className="lbl">{subtotalLabel}</span><span className="money-section">{fmtMoney(subtotal)}</span></div>
        ) : null}
        {actions}
      </div>
      <Collapse open={open} className="grp-body-wrap"><div className="grp-body">{children}</div></Collapse>
    </section>
  );
}

/* ── material table ─────────────────────────────────────────────────────── */
const HEAD = ['Item', 'Family · Size · Vendor', 'Qty', 'Waste %', 'Final', 'Unit', 'Unit $', 'Subtotal', 'Plan · Notes', ''];
export function MatHead({ labels = HEAD }) {
  return (
    <div className="mat-head" role="row">
      {labels.map((h, i) => (
        <div key={i} role="columnheader" className={i >= 2 && i <= 7 ? 'r' : i === 8 ? 'r' : ''}>{h}</div>
      ))}
    </div>
  );
}

export function MatSub({ children }) {
  return <div className="mat-sub">{children}</div>;
}

export function AddRowButton({ onClick, children, title }) {
  return (
    <button type="button" className="ew-btn" onClick={onClick} title={title}>
      <Plus size={13} /> {children}
    </button>
  );
}

export function RemoveIconButton({ onClick, title = 'Remove' }) {
  return (
    <button type="button" className="row-action-btn delete" onClick={onClick} title={title} aria-label={title}>
      <Trash2 size={14} />
    </button>
  );
}

const emptyNote = { plan: '', comment: '' };

/* ── price date ──────────────────────────────────────────────────────────
   Every chosen price carries the date it was last updated in the material
   list. Hover shows it; prices older than STALE_DAYS get a small age badge. */
export const STALE_DAYS = 90;
const DAY = 86400000;
const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export function priceAge(ms, now = Date.now()) {
  if (!ms) return null;
  const days = Math.max(0, Math.floor((now - ms) / DAY));
  const short = days < 1 ? 'today' : days < 60 ? `${days}d` : days < 730 ? `${Math.round(days / 30)}mo` : `${Math.round(days / 365)}y`;
  const long = days < 1 ? 'today' : days === 1 ? '1 day ago' : days < 60 ? `${days} days ago` : days < 730 ? `${Math.round(days / 30)} months ago` : `${Math.round(days / 365)} years ago`;
  return { days, short, long, date: DATE_FMT.format(new Date(ms)), stale: days > STALE_DAYS };
}
export function PriceCell({ price, date }) {
  if (!price) return <span className="muted">—</span>;
  const age = priceAge(date);
  return (
    <span className="price-cell" title={age ? `Price from ${age.date} (${age.long})${age.stale ? ' — consider refreshing prices' : ''}` : 'Price date unknown'}>
      {age?.stale ? <span className="price-age">{age.short}</span> : null}
      {fmtMoney(price)}
    </span>
  );
}

/**
 * One material line. Every section renders its rows through this, so columns,
 * spacing, notes and actions are identical everywhere.
 *
 * note:          { plan, comment }
 * onNoteChange:  (patch) => void   — persisted on blur
 * waste:         number | null     — null renders "—" (not editable)
 * onWasteCommit: (number) => void
 * qty:           number or a node (e.g. an input for manual rows)
 */
export const MatRow = memo(function MatRow({
  label, labelTitle, material, inputs, piece,
  qty, waste, onWasteCommit, final, unit, unitPrice, subtotal, priceDate,
  note = emptyNote, onNoteChange,
  onRemove, extraActions, handleProps, rowRef, rowStyle, isDragging,
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const n = { ...emptyNote, ...(note || {}) };
  const hasNote = Boolean(n.plan || n.comment);

  return (
    <div ref={rowRef} style={rowStyle}>
      <div className={`mat-row${isDragging ? ' is-dragging' : ''}`} role="row">
        <div className="mat-label" title={labelTitle || (typeof label === 'string' ? label : undefined)}>
          {handleProps ? <span className="drag-handle" title="Drag to reorder" {...handleProps}><GripVertical size={14} /></span> : null}
          <span>{label}</span>
          {piece?.ft ? (
            <span
              className="piece-ft"
              title={`Qty = ${Number(piece.lf || 0).toLocaleString('en-US')} LF ÷ ${piece.ft} ft pieces${piece.picked ? '' : ' (pick a size to use its length)'}`}
            >
              ÷{piece.ft}&apos;
            </span>
          ) : null}
        </div>
        <div className="mat-material">
          {inputs ? <div className="mat-inputs">{inputs}</div> : null}
          {material}
        </div>
        <div className="r">{typeof qty === 'object' && qty !== null ? qty : fmtQty(qty ?? 0)}</div>
        <div className="r">
          {waste === null || waste === undefined
            ? <span className="muted">—</span>
            : <NumInput value={waste} onCommit={onWasteCommit} aria-label="Waste percent" />}
        </div>
        <div className="r strong">{fmtQty(final ?? 0)}</div>
        <div className="r muted">{unit || '—'}</div>
        <div className="r money-row"><PriceCell price={unitPrice} date={priceDate} /></div>
        <div className="r money-row strong">{subtotal ? fmtMoney(subtotal) : <span className="muted">—</span>}</div>
        <div className="note-cell">
          {n.plan ? <span className="note-plan" title={n.plan}>{n.plan}</span> : null}
          {onNoteChange ? (
            <button
              type="button"
              className={`row-action-btn${hasNote ? ' is-on' : ''}`}
              onClick={() => setNoteOpen((o) => !o)}
              aria-expanded={noteOpen}
              title={noteOpen ? 'Close notes' : hasNote ? 'Edit notes' : 'Add plan label / note'}
            >
              <StickyNote size={14} />
            </button>
          ) : null}
        </div>
        <div className="mat-actions">
          {extraActions}
          {onRemove ? <RemoveIconButton onClick={onRemove} title="Remove row" /> : null}
        </div>
      </div>
      {!noteOpen && n.comment ? <div className="note-preview" title={n.comment}>{n.comment}</div> : null}
      {noteOpen && onNoteChange ? (
        <NoteEditor note={n} onChange={onNoteChange} onClose={() => setNoteOpen(false)} />
      ) : null}
    </div>
  );
});

export function SortableMatRow({ id, ...props }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <MatRow
      {...props}
      rowRef={setNodeRef}
      rowStyle={{ transform: CSS.Translate.toString(transform), transition, position: 'relative', zIndex: isDragging ? 5 : 'auto' }}
      isDragging={isDragging}
      handleProps={{ ...attributes, ...listeners }}
    />
  );
}

/* notes are edited locally and saved on blur (no re-render of the whole
   project on every keystroke) */
export function NoteEditor({ note, onChange, onClose }) {
  const planRef = useRef(null);
  useEffect(() => { planRef.current?.focus(); }, []);
  return (
    <div className="note-editor">
      <label>
        Plan label
        <TextInput ref={planRef} value={note.plan} placeholder="e.g. S5 / Detail 3" onCommit={(v) => onChange({ plan: v })} />
      </label>
      <label>
        Comment
        <TextInput multiline value={note.comment} placeholder="Notes for this line…" onCommit={(v) => onChange({ comment: v })} />
      </label>
      <button type="button" className="row-action-btn" onClick={onClose} title="Close notes" aria-label="Close notes">
        <X size={14} />
      </button>
    </div>
  );
}

/* helpers for the common "notes stored in data.notes[key]" pattern */
export const noteOf = (notes, key) => ({ ...emptyNote, ...((notes || {})[key] || {}) });
export const patchNote = (key, patch) => (prev) => ({
  ...prev,
  notes: { ...(prev.notes || {}), [key]: { ...emptyNote, ...((prev.notes || {})[key] || {}), ...patch } },
});

/* ── drag & drop helpers (rows, sections, levels) ─────────────────────── */

/** Sort `items` by a saved list of ids; unknown ids keep their natural order at the end. */
export function applyOrder(items = [], order = [], getId = (x) => x.key) {
  if (!order?.length) return items;
  const pos = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => (pos.get(getId(a)) ?? 1e6 + items.indexOf(a)) - (pos.get(getId(b)) ?? 1e6 + items.indexOf(b)));
}

/** Vertical sortable list. `onMove(activeId, overId, newIds)` fires after a drop. */
export function SortableList({ ids, onMove, children }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    if (from < 0 || to < 0) return;
    onMove(active.id, over.id, arrayMove(ids, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext>
    </DndContext>
  );
}

/** Render-prop wrapper: gives a block (level, section) its drag handle props. */
export function SortableBlock({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, position: 'relative', zIndex: isDragging ? 20 : 'auto', opacity: isDragging ? 0.85 : 1 }}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

/** Move an item inside an array by ids. */
export const reorderById = (list = [], activeId, overId, getId = (x) => x.id) => {
  const from = list.findIndex((x) => getId(x) === activeId);
  const to = list.findIndex((x) => getId(x) === overId);
  return from < 0 || to < 0 ? list : arrayMove(list, from, to);
};
