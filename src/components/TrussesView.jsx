'use client';
import { useCallback, useMemo, useState, useEffect } from 'react';
import { useProject } from '@/context/ProjectContext';
import { Plus } from 'lucide-react';
import AddButton from '@/components/ui/AddButton';
import { motion } from "framer-motion";
import {
  GripVertical,
  Trash2,
  DollarSign
} from 'lucide-react';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

// --- Icono de Trusses ---
const TrussIcon = (props) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3L2 21h20L12 3z" />
    <path d="M12 10v11" />
    <path d="M7 21l5-11 5 11" />
  </svg>
);

// --- Helpers de Formato ---
const generateId = (prefix = 'id-') => prefix + Math.random().toString(36).slice(2, 9);

// Aseguramos que siempre muestre 2 decimales en los totales (Textos estáticos)
const moneyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const fmt = (n) => (Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : '$0.00');

// Limpia comas para cálculos
const parseFormattedNumber = (value) => String(value).replace(/,/g, '');

// Formatea MIENTRAS escribes (permite punto decimal y escritura libre)
const formatNumberString = (numStr) => {
  if (numStr === '' || numStr === undefined || numStr === null) return '';
  const s = String(numStr);
  if (s === '-') return '';
  if (s === '.') return '0.';
  if (isNaN(Number(s))) return '';

  const [integer, decimal] = s.split('.');
  const formattedInteger = new Intl.NumberFormat('en-US').format(integer);
  return decimal !== undefined ? `${formattedInteger}.${decimal}` : formattedInteger;
};

// --- Fila Sortable ---
function SortableTrussRow({ row, onLabelChange, onAmountChange }) {
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
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
  };

  // --- NUEVA LÓGICA: Finalizar Edición (Enter o Blur) ---
  const handleFinishEditing = (e) => {
    const rawValue = e.target.value;
    const cleanVal = parseFormattedNumber(rawValue);
    const num = parseFloat(cleanVal);

    if (!isNaN(num)) {
      // Forzamos 2 decimales al guardar (ej: 10 -> "10.00")
      onAmountChange(num.toFixed(2));
    } else {
      // Si está vacío o inválido, lo dejamos como vacío o 0 según prefieras
      if (cleanVal === '') onAmountChange('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur(); // Esto disparará el onBlur automáticamente
    }
  };

  return (
    <div ref={setNodeRef} style={style} className="ew-row">
      <div
        {...attributes}
        {...listeners}
        className="drag-handle"
        title="Drag to reorder"
        style={{ width: 32, display: 'flex', justifyContent: 'center' }}
      >
        <GripVertical className="gradient-icon" size={20} />
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <input
          className="ew-input-ghost"
          style={{ fontWeight: 500 }}
          type="text"
          value={row.label || ''}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder="Description (e.g. 24' Common Trusses)"
        />

        <div style={{ position: 'relative', width: '140px', marginRight: '42px' }}>
          <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-300)' }}>
            <DollarSign size={14} />
          </div>

          {/* INPUT DE MONTO MEJORADO */}
          <input
            className="ew-input-ghost"
            type="text"
            inputMode="decimal"
            value={formatNumberString(row.amount)}
            // onChange: Actualiza mientras escribes (permite "10.")
            onChange={(e) => {
              const val = parseFormattedNumber(e.target.value);
              if (!isNaN(Number(val)) || val === '' || val === '.') {
                onAmountChange(val);
              }
            }}
            // onBlur: Al salir, formatea bonito (10 -> 10.00)
            onBlur={handleFinishEditing}
            // onKeyDown: Detecta Enter
            onKeyDown={handleKeyDown}
            placeholder="0.00"
            style={{ textAlign: 'right', paddingLeft: '24px' }}
          />
        </div>
      </div>

      {/* Como pasamos removeExtraRow desde el padre, necesitamos recibirlo en props o usar context */}
      {/* CORRECCIÓN: Usar la prop onRemove que pasamos desde el padre */}
      <button
        className="row-action-btn delete"
        onClick={row.onRemove} // Usaremos una prop inyectada o wrapper
        title="Remove item"
        style={{ width: 32 }}
      >
        <Trash2 className="gradient-icon" size={18} />
      </button>
    </div>
  );
}

// --- Componente Principal ---
export default function TrussesView({ onTrussTotal }) {
  const { projectData, updateEstimateData, isLoaded } = useProject();

  const trussRows = useMemo(() => {
    return projectData?.estimateData?.trusses || [];
  }, [projectData]);

  const [activeId, setActiveId] = useState(null);
  const activeRow = useMemo(() => trussRows.find(r => r.id === activeId), [trussRows, activeId]);

  const total = useMemo(() => {
    return trussRows.reduce((sum, r) => {
      const val = parseFloat(r.amount);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [trussRows]);

  useEffect(() => {
    onTrussTotal(total);
  }, [total, onTrussTotal]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleUpdateRows = useCallback((newRows) => {
    updateEstimateData((prevEstimate) => ({
      ...prevEstimate,
      trusses: newRows,
    }));
  }, [updateEstimateData]);

  const handleDragStart = (event) => setActiveId(event.active.id);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = trussRows.findIndex((r) => r.id === active.id);
      const newIndex = trussRows.findIndex((r) => r.id === over.id);
      handleUpdateRows(arrayMove(trussRows, oldIndex, newIndex));
    }
    setActiveId(null);
  };

  const addExtraRow = () => {
    const newRow = { id: generateId('truss-'), label: 'New Truss Item', amount: '' };
    handleUpdateRows([...trussRows, newRow]);
  };

  const removeExtraRow = (id) => {
    handleUpdateRows(trussRows.filter(r => r.id !== id));
  };

  const handleLabelChange = (id, val) => {
    const next = trussRows.map(r => r.id === id ? { ...r, label: val } : r);
    handleUpdateRows(next);
  };

  const handleAmountChange = (id, val) => {
    const next = trussRows.map(r => r.id === id ? { ...r, amount: val } : r);
    handleUpdateRows(next);
  };

  if (!isLoaded) return <div className="ew-card">Loading...</div>;

  return (
    <div className="app-content">

      {/* Header Animado */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, type: "spring", bounce: 0.3 }}
        style={{ marginBottom: '32px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-800)', border: '1px solid var(--border)', borderRadius: '16px',
              boxShadow: 'var(--shadow)', color: 'var(--turq-200)'
            }}
          >
            <TrussIcon width={32} height={32} />
          </div>
          <div>
            <h1 className="ew-h2" style={{ fontSize: '2.5rem', margin: 0, lineHeight: 1.1 }}>
              Trusses
            </h1>
            <div className="ew-subtle" style={{ fontSize: '1rem', marginTop: '4px' }}>
              Roof structure estimates & custom items
            </div>
          </div>
        </div>
      </motion.div>

      {/* Tabla */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="ew-card" style={{ padding: 0, overflow: 'hidden' }}>

            {/* Header Tabla */}
            <div style={{
              display: 'flex', padding: '12px 16px', background: 'var(--bg-750)',
              borderBottom: '1px solid var(--border)', fontSize: '0.85rem', fontWeight: 700,
              color: 'var(--text-300)', textTransform: 'uppercase', letterSpacing: '0.05em'
            }}>
              <div style={{ width: 32 }}></div>
              <div style={{ flex: 1 }}>Description</div>
              <div style={{ width: 140, textAlign: 'right', marginRight: 42 }}>Amount</div>
              <div style={{ width: 32 }}></div>
            </div>

            {/* Rows */}
            <div className="ew-rows" style={{ border: 'none', borderRadius: 0 }}>
              <SortableContext
                items={trussRows.map(item => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {trussRows.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-300)' }}>
                    No truss items added yet. Click "Add Item" to start.
                  </div>
                ) : (
                  trussRows.map(row => (
                    <SortableTrussRow
                      key={row.id}
                      row={{ ...row, onRemove: () => removeExtraRow(row.id) }} // Pasamos el remove aquí para simplificar
                      onLabelChange={(label) => handleLabelChange(row.id, label)}
                      onAmountChange={(amount) => handleAmountChange(row.id, amount)}
                    />
                  ))
                )}
              </SortableContext>
            </div>

            {/* Total Footer */}
            {trussRows.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', padding: '16px 16px',
                background: 'var(--bg-750)', borderTop: '1px solid var(--border)'
              }}>
                <div style={{ flex: 1, textAlign: 'right', paddingRight: '12px' }}>
                  <span className="text-grand-total" style={{ fontSize: '1.1rem', color: 'var(--text-300)' }}>
                    Total
                  </span>
                </div>
                <div style={{ width: 140, textAlign: 'right', marginRight: 42 }}>
                  <span className="text-grand-total">
                    {fmt(total)}
                  </span>
                </div>
                <div style={{ width: 32 }}></div>
              </div>
            )}

            {/* Add Button */}
            <div className="ew-footer" style={{ padding: '16px', background: 'var(--bg-800)', borderTop: '1px solid var(--border)' }}>
              <AddButton
                onClick={addExtraRow}
                title="Add Truss Item"
                label="Add Truss Item"
              />
            </div>
          </div>

          <DragOverlay>
            {activeRow ? (
              <div className="ew-row" style={{ background: 'var(--bg-750)', boxShadow: 'var(--shadow)', border: '1px solid var(--turq-200)', borderRadius: '8px' }}>
                <div className="drag-handle"><GripVertical className="gradient-icon" size={20} /></div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="ew-input-ghost">{activeRow.label}</span>
                  <span className="ew-input-ghost" style={{ textAlign: 'right' }}>{fmt(activeRow.amount)}</span>
                </div>
                <div style={{ width: 32 }}></div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </motion.div>
    </div>
  );
}