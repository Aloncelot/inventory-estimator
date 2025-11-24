// src/components/LooseMaterialSection.jsx
'use client';

import { useMemo, useCallback, useState, useEffect } from 'react';
import AccordionSection from '@/components/ui/AccordionSection';
import ItemPicker from '@/components/ItemPicker';
import RemoveButton from '@/components/ui/RemoveButton';
import EditableTitle from '@/components/ui/EditableTitle';
import SearchableSelect from './SearchableSelect';
import { parseBoardLengthFt, unitPriceFrom } from '@/domain/lib/parsing';
import { 
  calcFoamSeal, 
  calcSillPlate, 
  calcPlates, 
  calcStuds, 
  calcSheathing, 
  calcTape, 
  calcConcreteNails, 
  calcLallyColumn 
} from '@/domain/calculators';
import { getSizesForFamily } from '@/lib/catalog';

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmt = (n) => (Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : '—');

const deref = (x) => (x && x.item ? x.item : x);
const getItem = (selLike) => deref(selLike);
const getUnit = (selLike) => deref(selLike)?.unit || deref(selLike)?.raw?.unit || 'pcs';
const getSize = (selLike) => deref(selLike)?.sizeLabel || deref(selLike)?.sizeDisplay || '';

const wordsPreview = (s = '', maxWords = 8) => {
  const parts = String(s).trim().split(/\s+/);
  const preview = parts.slice(0, maxWords).join(' ');
  return parts.length > maxWords ? `${preview}…` : preview || '';
};

// --- Debounced Inputs (Performance Optimization) ---
function DebouncedInput({ value: propValue, onChange, className, ...props }) {
  // Inicializar con un valor seguro (si propValue es null/undefined, usar '')
  const [localValue, setLocalValue] = useState(propValue ?? '');
  
  useEffect(() => { 
      setLocalValue(propValue ?? ''); 
  }, [propValue]);

  const commit = () => {
    if (localValue !== propValue) onChange(localValue);
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { commit(); e.target.blur(); }
    else if (e.key === 'Escape') { setLocalValue(propValue ?? ''); e.target.blur(); }
  };

  return (
    <input
      {...props}
      className={`ew-input focus-anim ${className || ''}`}
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  );
}

function DebouncedTextarea({ value: propValue, onChange, className, ...props }) {
  const [localValue, setLocalValue] = useState(propValue ?? '');
  useEffect(() => { setLocalValue(propValue ?? ''); }, [propValue]);

  const commit = () => {
    if (localValue !== propValue) onChange(localValue);
  };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { commit(); e.target.blur(); }
    else if (e.key === 'Escape') { setLocalValue(propValue ?? ''); e.target.blur(); }
  };
  
  return (
    <textarea
      {...props}
      className={`ew-input focus-anim ${className || ''}`}
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  );
}

const LOOSE_ITEMS_OPTIONS = [
  "Angle", "Beams", "Blocking", "Blocking at openings", "Bolts", 
  "Bottom Plate - Loose", "Bottom Plate - Panel", "Bottom Plate PT - Panel", 
  "Brace", "Caulk", "Clips", "Coiled Strap", "Collar tie", "Column Cap", 
  "Concrete nails", "Cornice", "Diagonal Bracing", "Eave", "Epoxy", 
  "Fascia", "Flashing Tape", "Foam sill sealer", "Framing nails", "Gable", 
  "Glue", "Hangers - Beams", "Hangers - Joist", "Hangers - Stringer", 
  "Header Infill", "Headers", "Holdown", "House wrapping", "Hurricane tie", 
  "I-Joist", "Ice & Water Shield", "In wall Post", "Insulation", "Joist", 
  "Kicker", "Lally Column", "Landing", "Ledger", "Ledger bolts", "Nailer", 
  "Nails", "Nuts", "Outriggers", "Plates", "Plates - Loose", "Plates - Panel", 
  "Post", "Post base", "Post Cap", "Rafter", "Rake", "Ribbon Rim Board", 
  "Ridge", "Rigid Insulation", "Rim Joist", "Rimboard", "Roofing nails", 
  "Screws", "Sheathing", "Sheathing nails", "Sill Plate", "SIP", "Strapping", 
  "Stringer", "Stud plate", "Studs", "Subfascia", "Subfloor", 
  "Tape - header/jambs", "Tape - sill", "Tape - Zip system", 
  "Temporary Bracing", "Threaded rod", "Top Plate - Loose", "Top Plate - Panel", 
  "Trim", "Truss bracing", "Underlayment", "Washer", 
  "Blocking at sheathing joints", "Blocking Bathroom/Kitchen/Stairs", 
  "Panel band sheathing", "PT Plates - Loose"
].map(label => ({ value: label, label }));


export default function LooseMaterialSection({
    section,
    onUpdate,
    onRemove,
    onToggleHidden,
    dragHandleProps,
    foundationData,
}) {
    const { id, name, rows = [], collapsed = false, inputs = {}, sel={}, waste={}, notes={} } = section;

    const isFoundation = name === 'Foundation';
    const isBasement = name === 'Basement';

    const [localFoundationLF, setLocalFoundationLF] = useState(String(inputs.foundationLF || 0));
    const [localSillPlateLF, setLocalSillPlateLF] = useState(String(inputs.sillPlateLF || 0));
    const [sillPlateModified, setSillPlateModified] = useState(false);
    
    const [localBlockingLF, setLocalBlockingLF] = useState(String(inputs.blockingLF || 0));
    const [localColQty, setLocalColQty] = useState(String(inputs.colQty || 0));

    const [expandedRows, setExpandedRows] = useState(new Set());
    const toggleRow = (rowId) => {
        const newSet = new Set(expandedRows);
        if (newSet.has(rowId)) newSet.delete(rowId);
        else newSet.add(rowId);
        setExpandedRows(newSet);
    };

    useEffect(() => { setLocalFoundationLF(String(inputs.foundationLF || 0)) }, [inputs.foundationLF]);
    useEffect(() => { setLocalSillPlateLF(String(inputs.sillPlateLF || 0)) }, [inputs.sillPlateLF]);
    useEffect(() => { setLocalBlockingLF(String(inputs.blockingLF || 0)) }, [inputs.blockingLF]);
    useEffect(() => { setLocalColQty(String(inputs.colQty || 0)) }, [inputs.colQty]);

    const updateInput = useCallback((key, value) => {
        onUpdate(prev => ({ ...prev, inputs: { ...prev.inputs, [key]: value } }));
    }, [onUpdate]);

    const updateSel = useCallback((key, value) => {
        onUpdate(prev => ({ ...prev, sel: { ...prev.sel || {}, [key]: value } }));
    }, [onUpdate]);

    const updateWaste = useCallback((key, value) => {
        onUpdate(prev => ({ ...prev, waste: { ...prev.waste || {}, [key]: Number(value) } }));
    }, [onUpdate]);

    const updateRow = useCallback((rowId, patch) => {
        onUpdate(prev => ({
            ...prev,
            rows: (prev.rows || []).map(r => r.id === rowId ? { ...r, ...patch } : r)
        }));
    }, [onUpdate]);
    
    const removeRow = useCallback((rowId) => {
        onUpdate(prev => ({ 
            ...prev, 
            rows: (prev.rows || []).filter(r => r.id !== rowId) 
        }));
    }, [onUpdate]);

    const updateCalcNote = useCallback((rowKey, field, value) => {
         onUpdate(prev => ({
            ...prev,
            notes: {
                ...(prev.notes || {}),
                [rowKey]: { ...(prev.notes?.[rowKey] || {}), [field]: value }
            }
        }));
    }, [onUpdate]);
    
    const getCalcNote = (rowKey) => (notes[rowKey] || { plan: '', comment: '' });

    const handleFoundationLFBlur = () => {
        const val = Number(localFoundationLF);
        updateInput('foundationLF', val);
        if (!sillPlateModified) {
            updateInput('sillPlateLF', val);
            setLocalSillPlateLF(String(val));
        }
    };
    const handleSillPlateLFBlur = () => {
        updateInput('sillPlateLF', Number(localSillPlateLF));
        setSillPlateModified(true);
    };
    const handleBlockingBlur = () => updateInput('blockingLF', Number(localBlockingLF));
    const handleColBlur = () => updateInput('colQty', Number(localColQty));


    // --- 1. Foundation Rows ---
    const foundationRows = useMemo(()=> {
        if(!isFoundation) return [];
        const fLf = Number(inputs.foundationLF) || 0;
        const sLf = Number(inputs.sillPlateLF) || 0;
        const wFoam = Number(waste.foamSeal ?? 5);
        const wSill = Number(waste.sillPlate ?? 5);
        
        // Dynamically calculate board length from selection
        const sillBoardLen = parseBoardLengthFt(getSize(sel.sillPlate)) || 16;

        const row1 = calcFoamSeal({ lengthLF:fLf, wastePct:wFoam, item:getItem(sel.foamSeal) });
        const row2 = calcSillPlate({ lengthLF:sLf, boardLenFt:sillBoardLen, wastePct:wSill, item:getItem(sel.sillPlate) });

        return [ 
            { 
                id:'foamSeal', label: 'Foam sill sealer', ...row1, item: getItem(sel.foamSeal), key: 'foamSeal', isCalc: true,
                wastePct: wFoam,
                defaultVendor: "The Home Depot", defaultFamily: "FoamSeal", defaultSize: `5-1/2"x50'`
            },
            { 
                id:'sillPlate', label: 'Sill Plate', ...row2, item: getItem(sel.sillPlate), key: 'sillPlate', isCalc: true,
                wastePct: wSill,
                defaultVendor: "Gillies & Prittie Warehouse", defaultFamily: "PT", defaultSize: `2x6"-16'`
            },
         ];
    }, [isFoundation, inputs, sel, waste]);

    // --- 2. Basement Rows ---
    const basementRows = useMemo(() => {
        if (!isBasement) return [];

        const blkLF = Number(inputs.blockingLF) || 0;
        const wBlk = Number(waste.blocking ?? 10);
        const blkBoardLen = 16; 
        const r1 = calcPlates({ lengthLF: blkLF, boardLenFt: blkBoardLen, wastePct: wBlk, item: getItem(sel.blocking), unit: 'pcs' });

        let sillPlateFinalQty = 0;
        if (foundationData && foundationData.inputs) {
             const sLf = Number(foundationData.inputs.sillPlateLF) || 0;
             const sItem = foundationData.sel?.sillPlate;
             const sBoardLen = parseBoardLengthFt(getSize(sItem)) || 16;
             const sWaste = Number(foundationData.waste?.sillPlate ?? 5);
             const res = calcSillPlate({ lengthLF: sLf, boardLenFt: sBoardLen, wastePct: sWaste, item: sItem });
             sillPlateFinalQty = res.qtyFinal;
        }

        const wNails = Number(waste.concreteNails ?? 5);
        const r2 = calcConcreteNails({ sillPlateQty: sillPlateFinalQty, wastePct: wNails, item: getItem(sel.concreteNails) });

        const colQ = Number(inputs.colQty) || 0;
        const wCol = Number(waste.lallyColumn ?? 5);
        const r3 = calcLallyColumn({ qty: colQ, wastePct: wCol, item: getItem(sel.lallyColumn) });

        return [
            { 
                id: 'blocking', label: 'Blocking at openings', 
                ...r1, item: getItem(sel.blocking), key: 'blocking', isCalc: true,
                wastePct: wBlk, 
                defaultVendor: "Gillies & Prittie Warehouse", defaultFamily: "PT", defaultSize: `2x6"-16'`
            },
            { 
                id: 'concreteNails', label: 'Concrete nails', 
                ...r2, item: getItem(sel.concreteNails), key: 'concreteNails', isCalc: true,
                wastePct: wNails, 
                defaultVendor: "The Home Depot", defaultFamily: "Drive Pins with Washers (HD)", defaultSize: `3"-100s`
            },
            { 
                id: 'lallyColumn', label: 'Lally Column', 
                ...r3, item: getItem(sel.lallyColumn), key: 'lallyColumn', isCalc: true,
                wastePct: wCol, 
                defaultVendor: "Concord", defaultFamily: "Concrete column w/2plates", defaultSize: `3-1/2"x10'`
            },
        ];
    }, [isBasement, inputs, sel, waste, foundationData]);

    // --- 3. Manual Rows ---
    const calculatedManualRows = useMemo(() => {
        return rows.map(row => {
            const item = getItem(row.item);
            let result = { qtyRaw: Number(row.qty) || 0, qtyFinal: 0, unit: 'pcs', unitPrice: 0, subtotal: 0 };
            const typeLower = (row.type || '').toLowerCase();
            const wastePct = Number(row.wastePct) || 0;

            if (typeLower.includes('studs')) {
                const lf = Number(row.inputs?.lengthLF || 0);
                const sp = Number(row.inputs?.spacing || 16);
                const mu = Number(row.inputs?.multiplier || 1);
                result = calcStuds({ lengthLF: lf, spacingIn: sp, multiplier: mu, wastePct, item });
            } else if (typeLower.includes('plate') || typeLower.includes('blocking')) {
                const lf = Number(row.inputs?.lengthLF || 0);
                const boardLen = parseBoardLengthFt(getSize(item)) || 16;
                result = calcPlates({ lengthLF: lf, boardLenFt: boardLen, wastePct, item });
            } else if (typeLower.includes('sheathing')) {
                const lf = Number(row.inputs?.lengthLF || 0);
                const h  = Number(row.inputs?.height || 4);
                result = calcSheathing({ lengthLF: lf, heightFt: h, wastePct, item });
            } else if (typeLower.includes('tape')) {
                const lf = Number(row.inputs?.lengthLF || 0);
                const rollLen = 75; 
                result = calcTape({ seamLF: lf, rollLenFt: rollLen, wastePct, item });
            } else {
               const qRaw = Number(row.qty) || 0;
               const qFinal = Math.ceil(qRaw * (1 + wastePct / 100));
               const uPrice = unitPriceFrom(item);
               result = {
                   qtyRaw: qRaw,
                   qtyFinal: qFinal,
                   unit: getUnit(row.item),
                   unitPrice: uPrice,
                   subtotal: qFinal * uPrice
               };
            }
            return { ...row, ...result, isCalc: false };
        });
    }, [rows]);

    // --- Handlers ---
    const setCollapsed = useCallback((isCollapsed) => {
        onUpdate(prev => ({ ...prev, collapsed: isCollapsed }));
    }, [onUpdate]);

    const handleNameChange = useCallback((newName) => {
        onUpdate(prev => ({ ...prev, name: newName }));
    }, [onUpdate]);

    const addRow = useCallback((typeLabel) => {
        if (!typeLabel) return;
        const newRow = {
            id: `loose-row-${Date.now()}`,
            type: typeLabel, 
            item: null,
            qty: 0,
            wastePct: 5,
            notes: '',
            plan: '',
            inputs: {}, 
        };
        const typeLower = typeLabel.toLowerCase();
        if (typeLower.includes('studs')) { newRow.inputs = { lengthLF: 0, spacing: 16, multiplier: 1 }; newRow.wastePct = 10; }
        else if (typeLower.includes('plate') || typeLower.includes('blocking')) { newRow.inputs = { lengthLF: 0 }; newRow.wastePct = 10; }
        else if (typeLower.includes('sheathing')) { newRow.inputs = { lengthLF: 0, height: 4 }; newRow.wastePct = 15; }
        else if (typeLower.includes('tape')) { newRow.inputs = { lengthLF: 0 }; newRow.wastePct = 5; }
        onUpdate(prev => ({ ...prev, rows: [...(prev.rows || []), newRow] }));
    }, [onUpdate]);

    const sectionSubtotal = useMemo(() => {
        const fTotal = foundationRows.reduce((s, r) => s + (r.subtotal || 0), 0);
        const bTotal = basementRows.reduce((s, r) => s + (r.subtotal || 0), 0);
        const mTotal = calculatedManualRows.reduce((s, r) => s + (r.subtotal || 0), 0);
        return fTotal + bTotal + mTotal;
    }, [calculatedManualRows, foundationRows, basementRows]);

    const gridCols = 'minmax(180px,1.1fr) 3.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr 2.0fr 0.2fr';


    return (
        <div className="ew-card">
            <AccordionSection
                open={!collapsed}
                onOpenChange={(isOpen) => setCollapsed(!isOpen)}
                bar={({ open, toggle }) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                        <button
                            type="button" className="acc__button" style={{ cursor: 'grab', border: 'none', padding: '0 4px' }} title="Drag to reorder" {...dragHandleProps}
                        >
                            <img src="/icons/drag-handle.png" width={12} height={12} alt="Drag" style={{ opacity: 0.5 }} />
                        </button>
                        <button type="button" className="acc__button" onClick={toggle} aria-expanded={open} title={open ? "Collapse" : "Expand"}>
                            <img src={open ? '/icons/down.png' : '/icons/minimize.png'} alt={open ? 'Collapse' : 'Expand'} width={16} height={16} className="acc__chev" style={{ display: 'inline-block', verticalAlign: 'middle' }} />
                        </button>
                        <EditableTitle value={name} onChange={handleNameChange} textClass="text-section-header" />
                        <div className="ew-right text-subtotal-orange" style={{ marginLeft: 'auto' }}>Subtotal: {fmt(sectionSubtotal)}</div>
                        {onToggleHidden && (
                            <div style={{ marginLeft: '8px' }}>
                                <button className="ew-btn ew-icon-btn" onClick={onToggleHidden} title="Hide section">
                                     <img src="/icons/eye-off.png" width={20} height={20} alt="Hide" />
                                </button>
                            </div>
                        )}
                        {onRemove && (<div style={{ marginLeft: '4px' }}> <RemoveButton onClick={onRemove} title="Remove section" label="Remove section" /></div>)}
                    </div>
                )}
            >
                {/* --- FOUNDATION INPUTS --- */}
                {isFoundation && (
                    <div className="controls4" style={{ marginBottom: 12 }}>
                        <label>
                            <span className="ew-subtle">Foundation Wall Length (LF)</span>
                            <DebouncedInput 
                                type="number"
                                value={localFoundationLF}
                                onChange={val => { 
                                    setLocalFoundationLF(val); 
                                    const numVal = Number(val);
                                    updateInput('foundationLF', numVal);
                                    if (!sillPlateModified) {
                                        updateInput('sillPlateLF', numVal);
                                        setLocalSillPlateLF(String(numVal));
                                    }
                                }}
                            />
                        </label>
                         <label>
                            <span className="ew-subtle">Sill Plate Length (LF)</span>
                            <div style={{display: 'flex', gap: 4}}>
                                <DebouncedInput
                                    type="number"
                                    value={localSillPlateLF}
                                    onChange={val => {
                                        const numVal = Number(val);
                                        updateInput('sillPlateLF', numVal);
                                        setLocalSillPlateLF(String(numVal));
                                        setSillPlateModified(true);
                                    }}
                                />
                                <button className="ew-btn ew-icon-btn" title="Reset to Foundation Length" onClick={() => {
                                    setSillPlateModified(false);
                                    const val = Number(inputs.foundationLF || 0);
                                    updateInput('sillPlateLF', val);
                                    setLocalSillPlateLF(String(val));
                                }}>
                                    <img src="/icons/undo.png" width={14} height={14} alt="Reset"/>
                                </button>
                            </div>
                        </label>
                    </div>
                )}

                {/* --- BASEMENT INPUTS --- */}
                {isBasement && (
                     <div className="controls4" style={{ marginBottom: 12 }}>
                        <label>
                            <span className="ew-subtle">Blocking (LF)</span>
                            <DebouncedInput
                                type="number"
                                value={localBlockingLF}
                                onChange={val => {
                                    updateInput('blockingLF', Number(val));
                                    setLocalBlockingLF(val);
                                }}
                            />
                        </label>
                        <label>
                            <span className="ew-subtle">Lally Columns (Count)</span>
                            <DebouncedInput
                                type="number"
                                value={localColQty}
                                onChange={val => {
                                    updateInput('colQty', Number(val));
                                    setLocalColQty(val);
                                }}
                            />
                        </label>
                     </div>
                )}

                <div className="ew-grid ew-head" style={{ '--cols': gridCols }}>
                    <div>Item Name</div>
                    <div>Selection</div>
                    <div className="ew-right">Qty / LF</div>
                    <div className="ew-right">Waste %</div>
                    <div className="ew-right">Final</div>
                    <div className="ew-right">Unit</div>
                    <div className="ew-right">Price</div>
                    <div className="ew-right">Total</div>
                    <div>Plan & Notes</div>
                    <div></div>
                </div>

                <div className="ew-rows">
                    {isFoundation && foundationRows.map(r => (
                        <RowItem 
                            key={r.id} 
                            row={r} 
                            gridCols={gridCols}
                            pickerValue={sel[r.key]}
                            onUpdateItem={(i) => updateSel(r.key, i)}
                            onUpdateWaste={(v) => updateWaste(r.key, v)}
                            onUpdateNote={(field, val) => updateCalcNote(r.key, field, val)}
                            isManual={false}
                        />
                    ))}
                    
                    {isBasement && basementRows.map(r => (
                         <RowItem 
                            key={r.id} 
                            row={r} 
                            gridCols={gridCols}
                            pickerValue={sel[r.key]}
                            onUpdateItem={(i) => updateSel(r.key, i)}
                            onUpdateWaste={(v) => updateWaste(r.key, v)}
                            onUpdateNote={(field, val) => updateCalcNote(r.key, field, val)}
                            isManual={false}
                        />
                    ))}

                    {calculatedManualRows.map(r => (
                         <RowItem 
                            key={r.id} 
                            row={r} 
                            gridCols={gridCols}
                            pickerValue={r.item}
                            onUpdateItem={(i) => updateRow(r.id, { item: i })}
                            onUpdateWaste={(v) => updateRow(r.id, { wastePct: Number(v) })}
                            onUpdateNote={(field, val) => updateRow(r.id, { [field === 'comment' ? 'notes' : field]: val })}
                            onUpdateInput={(field, val) => {
                                if (field === 'qty') updateRow(r.id, { qty: Number(val) });
                                else updateRow(r.id, { inputs: { ...r.inputs, [field]: Number(val) } });
                            }}
                            onRemove={() => removeRow(r.id)}
                            isManual={true}
                        />
                    ))}

                    {rows.length === 0 && !isFoundation && !isBasement && (
                        <div style={{ padding: 12, color: 'var(--text-300)', fontStyle: 'italic' }}>
                            No items in this section yet. Use the menu below to add items.
                        </div>
                    )}
                </div>

                <div className="ew-footer">
                    <div style={{width: '300px'}}>
                        <SearchableSelect 
                            placeholder="+ Add Item..."
                            options={LOOSE_ITEMS_OPTIONS}
                            value="" 
                            onChange={(val) => {
                                if (val) addRow(val);
                            }}
                        />
                    </div>
                </div>

            </AccordionSection>
        </div>
    );
}

// --- Unified Row Component ---
function RowItem({ row, gridCols, pickerValue, onUpdateItem, onUpdateWaste, onUpdateNote, onUpdateInput, onRemove, isManual }) {
    const [isOpen, setIsOpen] = useState(false);
    
    const typeLower = (row.type || '').toLowerCase();
    const hasCalc = typeLower.includes('stud') || typeLower.includes('plate') || typeLower.includes('blocking') || typeLower.includes('sheath') || typeLower.includes('tape');
    
    const noteData = isManual 
        ? { plan: row.plan, comment: row.notes } 
        : { plan: row.plan, comment: row.notes };

    return (
        <div>
            <div className="ew-grid ew-row" style={{ '--cols': gridCols }}>
                
                {/* 1. Item Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{row.label || row.type || 'Custom Item'}</span>
                    {isManual && (
                        <RemoveButton 
                            onClick={onRemove} 
                            title="Remove row" 
                            label="" 
                        />
                    )}
                </div>

                {/* 2. Selection */}
                <div>
                    <ItemPicker
                        compact
                        onSelect={onUpdateItem}
                        value={pickerValue}
                        defaultVendor={row.defaultVendor}
                        defaultFamilyLabel={row.defaultFamily}
                        defaultSizeLabel={row.defaultSize}
                    />
                    {isManual && hasCalc && (
                        <div className="ew-inline" style={{ marginTop: 6, alignItems: 'end', gap: 8 }}>
                             <label className="label-w-100">
                                <span className="ew-subtle">Length (LF)</span>
                                <DebouncedInput className="ew-input" type="number" value={row.inputs?.lengthLF||0} onChange={v => onUpdateInput('lengthLF', v)}/>
                             </label>
                             {typeLower.includes('stud') && (
                                 <>
                                 <label className="label-w-100"><span className="ew-subtle">Spacing</span><DebouncedInput className="ew-input" type="number" value={row.inputs?.spacing||16} onChange={v => onUpdateInput('spacing', v)}/></label>
                                 <label className="label-w-120"><span className="ew-subtle">Mult</span>
                                     <select className="ew-select focus-anim" value={row.inputs?.multiplier||1} onChange={e=>onUpdateInput('multiplier', e.target.value)}>
                                        <option value={1}>Single</option><option value={2}>Double</option><option value={3}>Triple</option><option value={4}>Quad</option>
                                     </select>
                                 </label>
                                 </>
                             )}
                             {typeLower.includes('sheathing') && (
                                 <label className="label-w-100"><span className="ew-subtle">Height</span><DebouncedInput className="ew-input" type="number" value={row.inputs?.height||4} onChange={v => onUpdateInput('height', v)}/></label>
                             )}
                        </div>
                    )}
                </div>

                {/* 3. Qty */}
                <div className="ew-right">
                    {(isManual && !hasCalc) ? (
                        <DebouncedInput className="ew-input" style={{ width: 60, textAlign: 'right' }} type="number" value={row.qty} onChange={v => onUpdateInput('qty', v)} />
                    ) : (
                        Math.ceil(row.qtyRaw || 0)
                    )}
                </div>
                
                {/* 4. Waste */}
                <div className="ew-right">
                    <DebouncedInput 
                        className="ew-input ew-input-waste" 
                        type="number" 
                        // FIX: Safe access to wastePct
                        value={row.wastePct ?? 5} 
                        onChange={onUpdateWaste} 
                    />
                </div>
                
                {/* 5-8. Results */}
                <div className="ew-right">{row.qtyFinal}</div>
                <div className="ew-right">{row.unit}</div>
                <div className="ew-right ew-money">{fmt(row.unitPrice)}</div>
                <div className="ew-right ew-money">{fmt(row.subtotal)}</div>
                
                {/* 9. Plan & Notes */}
                <div>
                    <div className="ew-subtle" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className="ew-chip ew-chip-loose" title={noteData.plan || ''}>
                            {noteData.plan || '—'}
                        </span>
                        <button 
                            className="ew-btn ew-btn-note ew-btn-note-loose" 
                            onClick={() => setIsOpen(!isOpen)}
                        >
                            {isOpen ? 'Hide' : 'Notes'}
                        </button>
                    </div>
                    {noteData.comment && !isOpen && (
                        <div className="ew-subtle" style={{marginTop: 2, fontSize: '0.7rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={noteData.comment}>
                            {wordsPreview(noteData.comment)}
                        </div>
                    )}
                </div>

                 {/* 10. Empty */}
                 <div></div> 
            </div>

            {/* Expansion */}
            {isOpen && (
                <div className="ew-row" style={{ padding: '8px 12px', background: 'var(--bg-750)', borderBottom: '1px solid var(--border)' }}>
                    <div className="controls2" style={{ width: '100%', gridTemplateColumns: '1fr 2fr' }}>
                        <label>
                            <span className="ew-subtle">Plan label</span>
                            <DebouncedInput
                                type="text"
                                placeholder="e.g., S5 / Detail 3"
                                value={noteData.plan || ''}
                                onChange={v => onUpdateNote('plan', v)}
                            />
                        </label>
                        <label>
                            <span className="ew-subtle">Comment</span>
                            <DebouncedTextarea
                                rows={1}
                                placeholder="Add notes..."
                                value={noteData.comment || ''}
                                onChange={v => onUpdateNote(isManual ? 'notes' : 'comment', v)}
                                style={{ resize: 'vertical', minHeight: '34px' }}
                            />
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
}