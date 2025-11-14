'use client';
import { useCallback, useMemo, useState, useEffect, useRef, useEffectEvent } from 'react';
import { useProject } from '@/context/ProjectContext';
import EditableTitle from '@/components/ui/EditableTitle';
import AddButton from '@/components/ui/AddButton';
import RemoveButton from '@/components/ui/RemoveButton';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const generateId = (prefix = 'id-') => prefix + Math.random().toString(36).slice(2, 9);

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmt = (n) => (Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : '—');

const parseFormattedNumber = (value) => {
  return String(value).replace(/,/g, '');
};

const formatNumberString = (numStr) => {
  if (numStr === '' || numStr === '-') return '';
  if (numStr === '.') return '0.';
  
  const [integer, decimal] = String(numStr).split('.');
  
  const formattedInteger = new Intl.NumberFormat('en-US').format(
    Number(integer.replace(/[^0-9-]/g, '') || 0)
  );
  
  if (decimal !== undefined) {
    return `${formattedInteger}.${decimal}`;
  }
  
  if (String(numStr).endsWith('.')) {
    return `${formattedInteger}.`;
  }
  
  return formattedInteger;
};

// --- Constantes de Impuestos ELIMINADAS ---

function TrussRow({
  row,
  onLabelChange,
  onAmountChange,
  onRemove,
  setNodeRef = null,
  style = {},
  dragHandleProps = {},
}) {
  const [localAmount, setLocalAmount] = useState(String(row.subtotal || 0));

  useEffect(() => {
    setLocalAmount(String(row.subtotal || 0));
  }, [row.subtotal]);

  const handleAmountChange = (e) => {
    const parsedValue = parseFormattedNumber(e.target.value);
    if (/^\d*\.?\d*$/.test(parsedValue)) {
      setLocalAmount(parsedValue);
    }
  };

  const handleAmountBlur = () => {
    const numericValue = Number(localAmount) || 0;
    if (numericValue !== row.subtotal) {
      onAmountChange(numericValue);
    }
    setLocalAmount(String(numericValue));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
        handleAmountBlur();
        e.target.blur();
    }
    if (e.key === 'Escape') {
        setLocalAmount(String(row.subtotal || 0));
        e.target.blur();
    }
  };

  return (
    <div
      ref={setNodeRef}
      className="ew-grid ew-row"
      style={{ '--cols': '1fr 200px 90px', padding: '8px 10px', gap: '16px', ...style }}
    >
      <EditableTitle
        value={row.label}
        onChange={onLabelChange}
        textClass="text-summary-subcategory"
      />
      <div className="ew-inline" style={{justifyContent: 'flex-end'}}>
         <span className="ew-subtle" style={{fontSize: '1.1rem', paddingBottom: '4px', color: 'var(--text-300)'}}>$</span>
         <input
          type="text"
          inputMode="decimal"
          className="ew-input focus-anim"
          value={formatNumberString(localAmount)}
          onChange={handleAmountChange}
          onBlur={handleAmountBlur}
          onKeyDown={handleKeyDown}
          placeholder="0.00"
          style={{ width: '150px', textAlign: 'right', fontSize: '1rem' }}
         />
      </div>
      <div className="ew-right" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button
          type="button"
          className="ew-btn ew-icon-btn"
          title="Drag to reorder"
          aria-label="Drag to reorder"
          style={{ cursor: 'grab' }}
          {...dragHandleProps}
        >
          <img src="/icons/drag-handle.png" width={20} height={20} alt="Drag" />
        </button>
        <RemoveButton onClick={onRemove} title="Remove row" label="Remove row" />
      </div>
    </div>
  );
}

function SortableTrussRow({ row, ...props }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TrussRow
      row={row}
      {...props}
      setNodeRef={setNodeRef}
      style={style}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  );
}

export default function TrussesView({ onTrussTotal }) {
  const { projectData, updateProject, isLoaded } = useProject();
  const [activeId, setActiveId] = useState(null);

  const trussRows = useMemo(() => {
    return projectData?.estimateData?.trusses || [];
  }, [projectData]);
  
  // --- summaryInfo ya no es necesario aquí ---

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const updateTrussRows = useCallback((updater) => {
    updateProject(prevEstimate => ({ 
        ...prevEstimate, 
        trusses: updater(prevEstimate.trusses || []) 
    }));
  }, [updateProject]);

  // --- Handlers de Impuestos ELIMINADOS ---

  const handleLabelChange = useCallback((id, newLabel) => {
    updateTrussRows(rows => rows.map(row => row.id === id ? { ...row, label: newLabel } : row));
  }, [updateTrussRows]);

  const handleAmountChange = useCallback((id, newAmount) => {
    updateTrussRows(rows => rows.map(row => row.id === id ? { ...row, subtotal: newAmount } : row));
  }, [updateTrussRows]);

  const addExtraRow = useCallback(() => {
    const newRow = { 
        id: generateId('truss-'), 
        label: 'New Truss Item', 
        subtotal: 0 
    };
    updateTrussRows(rows => [...rows, newRow]);
  }, [updateTrussRows]);

  const removeExtraRow = useCallback((id) => {
     updateTrussRows(rows => rows.filter(row => row.id !== id));
  }, [updateTrussRows]);

  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    setActiveId(null);
    if (over && active.id !== over.id) {
      updateTrussRows(rows => {
        const oldIndex = rows.findIndex(item => item.id === active.id);
        const newIndex = rows.findIndex(item => item.id === over.id);
        if (oldIndex === -1 || newIndex === -1) {
            return rows;
        }
        return arrayMove(rows, oldIndex, newIndex);
      });
    }
  }, [updateTrussRows]);
  
  const activeRow = useMemo(() => {
    if (!activeId) return null;
    return trussRows.find(r => r.id === activeId);
  }, [activeId, trussRows]);
  
  const trussSubtotal = useMemo(() => {
     return trussRows.reduce((sum, r) => sum + (Number(r.subtotal) || 0), 0);
  }, [trussRows]);

  const onTotalChange = useEffectEvent(onTrussTotal);
  const lastSentTotalRef = useRef(null);

  useEffect(() => {
    if (typeof onTotalChange === 'function') {
      if (trussSubtotal !== lastSentTotalRef.current) {
        onTotalChange(trussSubtotal);
        lastSentTotalRef.current = trussSubtotal;
      }
    }
  }, [trussSubtotal, onTotalChange]);


  if (!isLoaded || !projectData) {
    return (
       <div className="app-content">
          <div className="ew-card">
              <span className="text-h1">Trusses</span>
              <p className="ew-subtle" style={{ marginTop: '10px' }}>
                Please create or load a project from the "Project" section to begin.
              </p>
          </div>
       </div>
    );
  }

  return (
    <div className="app-content">
      <div className="sticky-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span className="text-section-title">
          {projectData?.name ? `${projectData.name} - ` : ''}Trusses
        </span>
        <div
          className="ew-right text-grand-total"
          title="Sum of all truss items (pre-tax)"
        >
          Total: {fmt(trussSubtotal)}
        </div>
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="ew-card">
          <div className="ew-rows">
            <SortableContext
              items={trussRows.map(item => item.id)}
              strategy={verticalListSortingStrategy}
            >
              {trussRows.map(row => (
                <SortableTrussRow
                  key={row.id}
                  row={row}
                  onLabelChange={(label) => handleLabelChange(row.id, label)}
                  onAmountChange={(amount) => handleAmountChange(row.id, amount)}
                  onRemove={() => removeExtraRow(row.id)} 
                />
              ))}
            </SortableContext>
          </div>         
          <div className="ew-footer" style={{ justifyContent: 'flex-start', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
            <AddButton 
              onClick={addExtraRow} 
              title="Add Truss Item" 
              label="Add Extra Truss Item" 
            />
          </div>
        </div>
        <DragOverlay>
          {activeRow ? (
            <TrussRow
              row={activeRow}
              onLabelChange={() => {}}
              onAmountChange={() => {}}
              onRemove={() => {}}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}