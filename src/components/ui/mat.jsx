// src/components/ui/mat.jsx
// Shared building blocks so every estimating section looks and behaves the same:
// page header, collapsible group, compact inputs, the material row grid and notes.
'use client';

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, StickyNote, GripVertical, Trash2, Plus, X, ImagePlus, ClipboardPaste, Image as ImageIcon, ChevronLeft, ChevronRight, LoaderCircle, AlertTriangle } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { saveNoteImage, loadNoteImage, imageFromDataTransfer, imageFromClipboard } from '@/lib/noteImages';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { formatMoney } from '@/domain/lib/currency';

/* ── formatting ─────────────────────────────────────────────────────────── */
export const fmtMoney = (n) => formatMoney(n); // in the open project's currency (USD / CAD)
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
const HEAD = ['Item', 'Family · Size · Vendor', 'Qty', 'Waste %', 'Final', 'Unit', 'Unit $', 'Age', 'Subtotal', 'Plan · Notes', ''];
export function MatHead({ labels = HEAD }) {
  return (
    <div className="mat-head" role="row">
      {labels.map((h, i) => (
        <div key={i} role="columnheader" className={i >= 2 && i <= 9 && i !== 7 ? 'r' : ''} title={i === 7 ? 'How old the price is (from the material list)' : undefined}>{h}</div>
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

const emptyNote = { plan: '', comment: '', images: [] };

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
export function PriceCell({ price }) {
  return price ? fmtMoney(price) : <span className="muted">—</span>;
}
/** Age of the price, in its own aligned column right of Unit $. */
export function PriceAge({ price, date }) {
  if (!price) return null;
  const age = priceAge(date);
  if (!age) return <span className="price-age is-unknown" title="Price date unknown — refresh prices to record it">?</span>;
  return (
    <span
      className={`price-age${age.stale ? ' is-stale' : ''}`}
      title={`Price from ${age.date} (${age.long})${age.stale ? ' — consider refreshing prices' : ''}`}
    >
      {age.short}
    </span>
  );
}

/* ── images attached to notes ───────────────────────────────────────────
   Shown only as a "View image" link; the image opens in a floating viewer.
   Click outside the image (or Esc) closes it. */
export function ImageLightbox({ images = [], start = 0, onClose }) {
  const { appId } = useProject() || {};
  const [i, setI] = useState(start);
  const [src, setSrc] = useState(null);
  const [error, setError] = useState('');
  const img = images[i];

  useEffect(() => {
    let alive = true;
    setSrc(null); setError('');
    loadNoteImage(appId, img?.id)
      .then((url) => { if (alive) { if (url) setSrc(url); else setError('This image is no longer available.'); } })
      .catch(() => { if (alive) setError('Could not load the image.'); });
    return () => { alive = false; };
  }, [appId, img?.id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'ArrowRight' && images.length > 1) setI((x) => (x + 1) % images.length);
      if (e.key === 'ArrowLeft' && images.length > 1) setI((x) => (x - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [images.length, onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <motion.div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={img?.name || 'Image'}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.figure
        className="lightbox-fig"
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      >
        {src ? <img src={src} alt={img?.name || 'Attached image'} /> : (
          <div className="lightbox-msg">{error || <><LoaderCircle size={16} className="animate-spin" /> Loading image…</>}</div>
        )}
        <figcaption>
          {images.length > 1 ? (
            <button type="button" className="ew-icon-btn" onClick={() => setI((x) => (x - 1 + images.length) % images.length)} aria-label="Previous image"><ChevronLeft size={16} /></button>
          ) : null}
          <span>{img?.name}{images.length > 1 ? ` · ${i + 1} / ${images.length}` : ''}</span>
          {images.length > 1 ? (
            <button type="button" className="ew-icon-btn" onClick={() => setI((x) => (x + 1) % images.length)} aria-label="Next image"><ChevronRight size={16} /></button>
          ) : null}
        </figcaption>
      </motion.figure>
    </motion.div>,
    document.body
  );
}

export function ViewImageLink({ images = [], className = '' }) {
  const [open, setOpen] = useState(false);
  if (!images?.length) return null;
  return (
    <>
      <button type="button" className={`view-image ${className}`} onClick={() => setOpen(true)} title="Open the attached image">
        <ImageIcon size={12} /> View image{images.length > 1 ? `s (${images.length})` : ''}
      </button>
      <AnimatePresence>{open ? <ImageLightbox images={images} onClose={() => setOpen(false)} /> : null}</AnimatePresence>
    </>
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
  label, labelTitle, material, inputs, piece, tag, warn,
  qty, waste, onWasteCommit, final, unit, unitPrice, subtotal, priceDate, below,
  note = emptyNote, onNoteChange,
  onRemove, extraActions, handleProps, rowRef, rowStyle, isDragging,
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const n = { ...emptyNote, ...(note || {}) };
  const images = Array.isArray(n.images) ? n.images : [];
  const hasNote = Boolean(n.plan || n.comment || images.length);

  return (
    <div ref={rowRef} style={rowStyle} className="mat-item">
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
          {tag ? <span className="row-tag" title={tag.title}>{tag.text}</span> : null}
          {warn ? <span className="row-warn" title={warn} role="img" aria-label={warn}><AlertTriangle size={12} /></span> : null}
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
        <div className="r money-row"><PriceCell price={unitPrice} /></div>
        <div className="age-cell"><PriceAge price={unitPrice} date={priceDate} /></div>
        <div className="r money-row strong">{subtotal ? fmtMoney(subtotal) : <span className="muted">—</span>}</div>
        <div className="note-cell">
          {n.plan ? <span className="note-plan" title={n.plan}>{n.plan}</span> : null}
          {images.length ? <ViewImageLink images={images} /> : null}
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
      {below || null}
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
  const { appId } = useProject() || {};
  const planRef = useRef(null);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const images = Array.isArray(note.images) ? note.images : [];
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => { planRef.current?.focus(); }, []);

  const attach = useCallback(async (file) => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const saved = await saveNoteImage(appId, file);
      onChange({ images: [...imagesRef.current, saved] });
    } catch (e) {
      setError(e?.message || 'Could not attach the image.');
    } finally {
      setBusy(false);
    }
  }, [appId, onChange]);

  const onPaste = (e) => {
    const file = imageFromDataTransfer(e.clipboardData);
    if (file) { e.preventDefault(); attach(file); }
  };
  const pasteFromClipboard = async () => {
    try { attach(await imageFromClipboard()); } catch (e) { setError(e?.message || 'Could not read the clipboard.'); }
  };

  return (
    <div
      className={`note-editor${dragOver ? ' is-drop' : ''}`}
      onPaste={onPaste}
      onDragOver={(e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { const f = imageFromDataTransfer(e.dataTransfer); setDragOver(false); if (f) { e.preventDefault(); attach(f); } }}
    >
      <label>
        Plan label
        <TextInput ref={planRef} value={note.plan} placeholder="e.g. S5 / Detail 3" onCommit={(v) => onChange({ plan: v })} />
      </label>
      <label>
        Comment
        <TextInput multiline value={note.comment} placeholder="Notes for this line… (paste a screenshot with Ctrl+V)" onCommit={(v) => onChange({ comment: v })} />
      </label>
      <div className="note-tools">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; attach(f); }}
        />
        <button type="button" className="row-action-btn" onClick={() => fileRef.current?.click()} disabled={busy} title="Attach an image (or drop / paste it here)" aria-label="Attach image">
          {busy ? <LoaderCircle size={14} className="animate-spin" /> : <ImagePlus size={14} />}
        </button>
        <button type="button" className="row-action-btn" onClick={pasteFromClipboard} disabled={busy} title="Paste image from clipboard" aria-label="Paste image from clipboard">
          <ClipboardPaste size={14} />
        </button>
        <button type="button" className="row-action-btn" onClick={onClose} title="Close notes" aria-label="Close notes">
          <X size={14} />
        </button>
      </div>
      {images.length || error ? (
        <div className="note-images">
          {images.map((img, idx) => (
            <span key={img.id} className="note-image">
              <ViewImageLink images={[img]} />
              <button
                type="button"
                className="row-action-btn delete"
                title={`Remove ${img.name}`}
                aria-label={`Remove image ${idx + 1}`}
                onClick={() => onChange({ images: imagesRef.current.filter((x) => x.id !== img.id) })}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {error ? <span className="note-error" role="alert">{error}</span> : null}
        </div>
      ) : null}
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
