'use client';
// *** CORRECCIÓN: 'useEffectEvent' eliminado de la importación ***
import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
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

const TAX_RATES = {
  'MA': 6.25,
  'RI': 7.0,
  'CT': 6.35,
  'ME': 5.5,
  'NH': 0.0,
  'NO TAX': 0.0,
};

const parseStateFromAddress = (address) => {
  if (!address) return null;
  const match = address.match(/\b([A-Z]{2})\b(?=.*$|\s+\d{5})?/g);
  
  if (!match) return null;
  
  const potentialState = match[match.length - 1];
  
  if (Object.keys(TAX_RATES).includes(potentialState)) {
    return potentialState;
  }
  
  return null;
};

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
  
  const summaryInfo = useMemo(() => {
    return projectData?.estimateData?.summaryInfo || {};
  }, [projectData]);

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

  const handleTaxSettingChange = useCallback((key, value) => {
    updateProject(prevEstimate => ({
      ...prevEstimate,
      summaryInfo: {
        ...(prevEstimate.summaryInfo || {}),
        [key]: value
      }
    }));
  }, [updateProject]);

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

  const effectiveState = useMemo(() => {
    if (summaryInfo.taxState) {
      return summaryInfo.taxState;
    }
    const parsed = parseStateFromAddress(summaryInfo.address);
    return parsed || 'NO TAX';
  }, [summaryInfo.taxState, summaryInfo.address]);

  const taxRate = useMemo(() => {
    if (summaryInfo.isTaxExempt) {
      return 0;
    }
    return TAX_RATES[effectiveState] || 0;
  }, [summaryInfo.isTaxExempt, effectiveState]);
  
  const taxAmount = useMemo(() => {
    return trussSubtotal * (taxRate / 100);
  }, [trussSubtotal, taxRate]);
  
  const totalWithTax = useMemo(() => {
    return trussSubtotal + taxAmount;
  }, [trussSubtotal, taxAmount]);
  
  
  // *** CORRECCIÓN: Eliminado useEffectEvent ***
  const lastSentTotalRef = useRef(null);

  useEffect(() => {
    // Llama a 'onTrussTotal' directamente.
    // 'onTrussTotal' es la función 'setTrussTotal' de 'page.jsx',
    // que es estable por defecto.
    if (typeof onTrussTotal === 'function') {
      if (totalWithTax !== lastSentTotalRef.current) {
        onTrussTotal(totalWithTax);
        lastSentTotalRef.current = totalWithTax;
      }
    }
  }, [totalWithTax, onTrussTotal]); // Añadido onTrussTotal al array
  // *** FIN DE LA CORRECCIÓN ***


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
          title="Sum of all truss items + tax"
        >
          Total: {fmt(totalWithTax)}
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
          
          <div className="ew-row" style={{ padding: '12px 10px', background: 'var(--bg-800)', borderTop: '1px solid var(--border)'}}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span className="text-summary-subcategory" style={{fontWeight: 700}}>Subtotal</span>
              <span className="text-summary-subcategory" style={{fontWeight: 700, fontSize: '1.1rem'}}>{fmt(trussSubtotal)}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 90px', gap: '16px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    style={{ width: '18px', height: '18px' }}
                    checked={summaryInfo.isTaxExempt || false}
                    onChange={(e) => handleTaxSettingChange('isTaxExempt', e.target.checked)}
                  />
                  <span className="text-summary-subcategory">Tax Exempt</span>
                </label>
                
                {!summaryInfo.isTaxExempt && (
                  <select
                    className="ew-select focus-anim"
                    value={effectiveState}
                    onChange={(e) => handleTaxSettingChange('taxState', e.target.value)}
                    title="Select tax state (auto-detected from address)"
                    style={{maxWidth: '120px'}}
                  >
                    {Object.keys(TAX_RATES).map(stateAbbr => (
                      <option key={stateAbbr} value={stateAbbr}>
                        {stateAbbr}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="ew-right" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                {!summaryInfo.isTaxExempt && (
                  <span className="text-summary-subcategory" style={{color: 'var(--text-300)'}}>
                    ({taxRate.toFixed(2)}%)
                  </span>
                )}
                <span className="text-summary-subcategory" style={{fontWeight: 700, fontSize: '1.1rem'}}>
                  {fmt(taxAmount)}
                </span>
              </div>
              <div></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
              <span className="text-level-total">Total</span>
              <span className="text-level-total" style={{fontSize: '1.25rem'}}>{fmt(totalWithTax)}</span>
            </div>
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