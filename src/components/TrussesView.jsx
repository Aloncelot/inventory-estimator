// src/components/TrussesView.jsx
'use client';

import { useCallback, useMemo } from 'react';
import { GripVertical } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { PageHeader, AddRowButton, RemoveIconButton, TextInput, NumInput, fmtMoney } from '@/components/ui/mat';
import { trussesTotal } from '@/domain/aggregate/projectTotals';
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
  const total = trussesTotal(projectData?.estimateData || {});

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
          <span className="r money-section">{fmtMoney(total)}</span>
          <span />
        </div>
      </div>
    </div>
  );
}
