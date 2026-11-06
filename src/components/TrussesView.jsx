// src/components/TrussesView.jsx
'use client';

import { useCallback, useMemo } from 'react';
import { GripVertical } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { PageHeader, AddRowButton, RemoveIconButton, TextInput, NumInput, fmtMoney } from '@/components/ui/mat';
import { trussesOf } from '@/domain/estimate';
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

const TrussIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4 2 20h20L12 4z" /><path d="M12 11v9" /><path d="M7 20l5-9 5 9" />
  </svg>
);

const generateId = (prefix = 'id-') => prefix + Math.random().toString(36).slice(2, 9);
const amountOf = (r) => r.amount ?? r.subtotal ?? '';

function TrussRow({ row, onPatch, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  return (
    <div
      ref={setNodeRef}
      className={`truss-row${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 5 : 'auto' }}
    >
      <span className="drag-handle" title="Drag to reorder" {...attributes} {...listeners}><GripVertical size={14} /></span>
      <TextInput className="ew-input-ghost" value={row.label || ''} onCommit={(v) => onPatch({ label: v })} placeholder="Description, e.g. 24' common trusses" aria-label="Description" />
      <NumInput allowEmpty value={amountOf(row)} onCommit={(v) => onPatch({ amount: v === '' ? '' : Number(v).toFixed(2) })} placeholder="0.00" aria-label="Amount" step="0.01" />
      <RemoveIconButton onClick={onRemove} title="Remove item" />
    </div>
  );
}

export default function TrussesView() {
  const { projectData, updateEstimateData, isLoaded } = useProject();
  const rows = useMemo(() => projectData?.estimateData?.trusses || [], [projectData]);
  const tr = trussesOf(projectData?.estimateData || {});
  const total = tr.total;
  const te = tr.estimate;
  const setTE = useCallback((patch) => updateEstimateData((prev) => ({ ...prev, trussEstimate: { ...(prev.trussEstimate || {}), ...(typeof patch === 'function' ? patch(prev.trussEstimate || {}) : patch) } })), [updateEstimateData]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const setRows = useCallback((fn) => updateEstimateData((prev) => ({ ...prev, trusses: fn(prev.trusses || []) })), [updateEstimateData]);
  const patchRow = (id, patch) => setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setRows((list) => {
      const from = list.findIndex((r) => r.id === active.id);
      const to = list.findIndex((r) => r.id === over.id);
      return from < 0 || to < 0 ? list : arrayMove(list, from, to);
    });
  };

  if (!isLoaded || !projectData) {
    return (
      <div className="app-content">
        <PageHeader icon={TrussIcon} title="Trusses" />
        <div className="empty-state">Open or create a project in Projects to add truss quotes.</div>
      </div>
    );
  }

  return (
    <div className="app-content">
      <PageHeader icon={TrussIcon} title="Trusses" meta={`${rows.length} item${rows.length === 1 ? '' : 's'}`} totalLabel="Trusses total" total={total} />

      <div className="ew-card" style={{ maxWidth: 820, padding: '0 6px' }}>
        <div className="truss-row ew-head">
          <span /><span>Description</span><span className="r">Amount ($)</span><span />
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            {rows.length === 0 ? (
              <div className="mat-empty">No truss items yet.</div>
            ) : rows.map((row) => (
              <TrussRow key={row.id} row={row} onPatch={(p) => patchRow(row.id, p)} onRemove={() => setRows((list) => list.filter((r) => r.id !== row.id))} />
            ))}
          </SortableContext>
        </DndContext>
        <div className="truss-row" style={{ borderBottom: 0 }}>
          <span />
          <AddRowButton onClick={() => setRows((list) => [...list, { id: generateId('truss-'), label: '', amount: '' }])}>Truss item</AddRowButton>
          <span className="r money-section">{fmtMoney(tr.quote)}</span>
          <span />
        </div>
      </div>

      <div className="ew-card tr-est" style={{ maxWidth: 820 }}>
        <div className="tr-est__head">
          <strong>Estimate per sq ft</strong>
          <span className="ew-subtle">Until the truss maker quotes: roof trusses over the top level, floor trusses under every level above the first.</span>
          <label className="fld">
            <span>Counts</span>
            <select className="ew-select" value={te.mode} onChange={(e) => setTE({ use: e.target.value })}>
              <option value="auto">Until the quote is typed</option>
              <option value="on">Always (with the quote)</option>
              <option value="off">Never (reference only)</option>
            </select>
          </label>
        </div>
        <table className="tbl">
          <thead><tr><th>Trusses</th><th className="num" title="From the floor drawn on the plan (openings in); type it if there is no plan">Area (sq ft)</th><th className="num">$ / sq ft</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {te.lines.map((l) => (
              <tr key={l.key}>
                <td>{l.label}</td>
                <td className="num">
                  <NumInput w={84} allowEmpty value={l.typed ? l.areaSqFt : ''} placeholder={String(l.auto || 0)} aria-label={`${l.label} area`}
                    onCommit={(v) => setTE((t) => { const areas = { ...(t.areas || {}) }; if (v === '') delete areas[l.key]; else areas[l.key] = Math.max(0, v); return { areas }; })} />
                </td>
                <td className="num">
                  <NumInput w={64} step="0.01" value={l.key === 'roof' ? te.roofRate : te.floorRate} aria-label={`${l.label} price per sq ft`}
                    onCommit={(v) => setTE(l.key === 'roof' ? { roofRate: Math.max(0, v) } : { floorRate: Math.max(0, v) })} />
                </td>
                <td className="num">{fmtMoney(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>{te.used ? 'Counted in the trusses total' : tr.quote > 0 && te.mode === 'auto' ? 'Reference: the quote above counts' : 'Not counted'}</td>
              <td className={`num${te.used ? ' money-section' : ' ew-subtle'}`}>{fmtMoney(te.total)}</td>
            </tr>
          </tfoot>
        </table>
        {tr.quote > 0 && te.total > 0 ? (
          <p className="ew-subtle">The quote is {Math.round(((tr.quote - te.total) / te.total) * 100)}% {tr.quote >= te.total ? 'above' : 'below'} the estimate.</p>
        ) : null}
      </div>
    </div>
  );
}
