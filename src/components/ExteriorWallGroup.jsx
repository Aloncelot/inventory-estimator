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
  calcHeadersInfill,
} from '@/domain/calculators';
import { parseBoardLengthFt } from '@/domain/lib/parsing';
import {
  isLVL,
  isVersaColumn,
  isLumberFamily,
  isInfillFamily,
} from '@/domain/lib/families';
import AccordionSection from '@/components/ui/AccordionSection';
import RemoveButton from '@/components/ui/RemoveButton';
import EditableTitle from './ui/EditableTitle';

// Helpers
const moneyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const fmt = (n) => (Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : '—');
const wordsPreview = (s = '', maxWords = 8) => {
  const parts = String(s).trim().split(/\s+/);
  const preview = parts.slice(0, maxWords).join(' ');
  return parts.length > maxWords ? `${preview}…` : preview || '';
};

const deref = (x) => (x && x.item ? x.item : x);
const getItem = (selLike) => deref(selLike);
const getUnit = (selLike) =>
  deref(selLike)?.unit || deref(selLike)?.raw?.unit || 'pcs';

const getSize = (selLike) =>
  deref(selLike)?.sizeLabel ||
  deref(selLike)?.sizeDisplay ||
  deref(selLike)?.raw?.sizeDisplay ||
  '';

const getFamily = (selLike) => {
  const it = selLike; // Do NOT deref
  return String(
    it?.familyLabel ??
      it?.familyDisplay ??
      it?.raw?.familyDisplay ??
      it?.raw?.familyLabel ??
      it?.family ??
      ''
  ).toLowerCase();
};

const defaultNote = { plan: '', comment: '', open: false };

function DebouncedInput({ value: propValue, onChange, ...props }) {
  const [localValue, setLocalValue] = useState(propValue);

  useEffect(() => {
    setLocalValue(propValue);
  }, [propValue]);

  const commitChange = () => {
    if (localValue !== propValue) {
      onChange(localValue);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      commitChange();
      e.target.blur();
    } else if (e.key === 'Escape') {
      setLocalValue(propValue);
      e.target.blur();
    }
  };

  return (
    <input
      {...props}
      className="ew-input focus-anim"
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onBlur={commitChange}
      onKeyDown={handleKeyDown}
    />
  );
}

function DebouncedTextarea({ value: propValue, onChange, ...props }) {
  const [localValue, setLocalValue] = useState(propValue);

  useEffect(() => {
    setLocalValue(propValue);
  }, [propValue]);

  const commitChange = () => {
    if (localValue !== propValue) {
      onChange(localValue);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      commitChange();
      e.target.blur();
    } else if (e.key === 'Escape') {
      setLocalValue(propValue);
      e.target.blur();
    }
  };
  
  return (
    <textarea
      {...props}
      className="ew-input focus-anim"
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onBlur={commitChange}
      onKeyDown={handleKeyDown}
    />
  );
}
/* ────────────────────────────────────────────────────────────────────────── */

export default function ExteriorWallGroup({
  sectionData,
  onUpdateSection,
  title = 'Exterior walls',
  onRemove,
  bottomDefaultFamily = 'SPF#2',
}) {
  const {
    id,
    lengthLF = 0,
    heightFt = 12,
    studSpacingIn = 16,
    studMultiplier = 1,
    waste = {
      bottomPlate: 10,
      topPlate: 10,
      studs: 60,
      blocking: 10,
      sheathing: 20,
    },
    sel = {
      bottomPlate: null,
      topPlate: null,
      studs: null,
      blocking: null,
      sheathing: null,
    },
    notes = {},
    extras = [],
    collapsed=false,
  } = sectionData;

  const [inputValueLF, setInputValueLF] = useState(String(lengthLF));
  const [inputValueHeight, setInputValueHeight] = useState(String(heightFt));
  const [inputValueSpacing, setInputValueSpacing] = useState(
    String(studSpacingIn)
  );
  const [inputValueMultiplier, setInputValueMultiplier] = useState(
    String(studMultiplier)
  );
  const [localWaste, setLocalWaste] = useState(waste);
  const [localExtraWaste, setLocalExtraWaste] = useState({});

  useEffect(() => {
    setInputValueLF(String(lengthLF));
  }, [lengthLF]);

  useEffect(() => {
    setInputValueHeight(String(heightFt));
  }, [heightFt]);

  useEffect(() => {
    setInputValueSpacing(String(studSpacingIn));
  }, [studSpacingIn]);

  useEffect(() => {
    setInputValueMultiplier(String(studMultiplier));
  }, [studMultiplier]);

  const { bottomPlate, topPlate, studs, blocking, sheathing } = waste;
  useEffect(() => {
    setLocalWaste((prev) => ({
      bottomPlate: bottomPlate ?? prev.bottomPlate ?? 10,
      topPlate: topPlate ?? prev.topPlate ?? 10,
      studs: studs ?? prev.studs ?? 60,
      blocking: blocking ?? prev.blocking ?? 10,
      sheathing: sheathing ?? prev.sheathing ?? 20,
    }));
  }, [bottomPlate, topPlate, studs, blocking, sheathing]);

  const extrasWasteSig = useMemo(() => {
    return (extras || []).map((ex) => `${ex.id}:${ex.wastePct}`).join(',');
  }, [extras]);

  useEffect(() => {
    const newWasteMap = {};
    for (const ex of extras) {
      // Ensure we don't overwrite a "dirty" value with a prop value
      setLocalExtraWaste(prev => ({
        ...prev,
        [ex.id]: prev[ex.id] ?? ex.wastePct ?? 0
      }));
    }
  }, [extrasWasteSig]); // Only re-init when extras array changes

  const onUpdate = useEffectEvent(onUpdateSection);

  const commitFieldChange = useCallback(
    (fieldName, value) => {
      // Convert to number, but allow 'select' to commit strings (which are coerced)
      const numericValue = Number(value) || 0;
      let valToCommit = numericValue;

      // The multiplier is a select, so we just use its value
      if (fieldName === 'studMultiplier') {
        valToCommit = Number(value); // Already a number from select
      }

      onUpdate((prevData) => ({ ...prevData, [fieldName]: valToCommit }));
      
      // Resync local state
      if (fieldName === 'lengthLF') setInputValueLF(String(valToCommit));
      if (fieldName === 'heightFt') setInputValueHeight(String(valToCommit));
      if (fieldName === 'studSpacingIn')
        setInputValueSpacing(String(valToCommit));
      if (fieldName === 'studMultiplier')
        setInputValueMultiplier(String(valToCommit));
    },
    [onUpdate]
  );

  const handleLocalWasteChange = useCallback((key, e) => {
    setLocalWaste((prev) => ({ ...prev, [key]: e.target.value }));
  }, []);

  const commitWasteChange = useCallback(
    (key, valueToCommit) => {
      const numericValue = Number(valueToCommit) || 0;
      onUpdate((prev) => ({
        ...prev,
        waste: { ...(prev.waste || {}), [key]: numericValue },
      }));
      setLocalWaste((prev) => ({ ...prev, [key]: numericValue }));
    },
    [onUpdate]
  );

  const handleWasteBlur = useCallback(
    (key, e) => {
      commitWasteChange(key, e.target.value);
    },
    [commitWasteChange]
  );

  const handleWasteKeyDown = useCallback(
    (key, e) => {
      if (e.key === 'Enter') {
        commitWasteChange(key, e.target.value);
        e.target.blur();
      } else if (e.key === 'Escape') {
        setLocalWaste(waste);
        e.target.blur();
      }
    },
    [commitWasteChange, waste]
  );

  const updateExtra = useCallback(
    (id, patch) => {
      onUpdate((prevData) => ({
        ...prevData,
        extras: (prevData.extras || []).map((r) =>
          r.id === id ? { ...r, ...patch } : r
        ),
      }));
    },
    [onUpdate]
  );
  
  const handleLocalExtraWasteChange = useCallback((id, e) => {
    setLocalExtraWaste((prev) => ({ ...prev, [id]: e.target.value }));
  }, []);


  const commitExtraWasteChange = useCallback(
    (id, valueToCommit) => {
      const numericValue = Number(valueToCommit) || 0;
      updateExtra(id, { wastePct: numericValue });
    },
    [updateExtra]
  );

  const handleExtraWasteBlur = useCallback(
    (id, e) => {
      commitExtraWasteChange(id, e.target.value);
    },
    [commitExtraWasteChange]
  );

  const handleExtraWasteKeyDown = useCallback(
    (id, e) => {
      if (e.key === 'Enter') {
        commitExtraWasteChange(id, e.target.value);
        e.target.blur();
      } else if (e.key === 'Escape') {
        const propWaste = extras.find((ex) => ex.id === id)?.wastePct ?? 0;
        setLocalExtraWaste((prev) => ({ ...prev, [id]: propWaste }));
        e.target.blur();
      }
    },
    [commitExtraWasteChange, extras]
  );

  const handleNameChange = useCallback((newName) => {
  onUpdate(prev => ({ ...prev, name: newName }));
}, [onUpdate]);

  // --- END: Input Optimization ---

  const setCollapsed = useCallback((isOpen) => {
    onUpdate(prev => ({ ...prev, collapsed: !isOpen }));
  }, [onUpdate]);

  // --- Stable handlers for props (now use `onUpdate`) ---
  const updateField = useCallback(
    (fieldName, value) => {
      onUpdate((prevData) => ({ ...prevData, [fieldName]: value }));
    },
    [onUpdate]
  );

  const setPick = useCallback(
    (key) => (choice) => {
      onUpdate((prevData) => ({
        ...prevData,
        sel: { ...(prevData.sel || {}), [key]: choice },
      }));
    },
    [onUpdate]
  );

  const getNote = (k) => ({ ...defaultNote, ...(notes || {})[k] });
  const setNote = useCallback(
    (k, patch) => {
      onUpdate((prevData) => {
        const currentNotes = prevData.notes || {};
        const newNotes = {
          ...currentNotes,
          [k]: { ...defaultNote, ...(currentNotes[k] || {}), ...patch },
        };
        return { ...prevData, notes: newNotes };
      });
    },
    [onUpdate]
  );

  const toggleOpen = useCallback((k) => setNote(k, { open: !getNote(k).open }), [
    setNote,
    getNote,
  ]);

  const addExtra = useCallback(
    (type) => {
      let newExtra = {
        id: `x${Date.now()}`,
        type,
        item: null,
        wastePct: 5,
        inputs: {},
      };
      
      if (type === 'Studs') {
        newExtra.inputs = {
          lengthLF: 10,
          studSpacingIn: 16,
          studMultiplier: 1,
          staggered: false
        };
        newExtra.wastePct = 60; // Default studs waste
      }
      
      onUpdate((prevData) => ({
        ...prevData,
        extras: [...(prevData.extras || []), newExtra],
      }));
    },
    [onUpdate]
  );

  const removeExtra = useCallback(
    (id) => {
      onUpdate((prevData) => ({
        ...prevData,
        extras: (prevData.extras || []).filter((r) => r.id !== id),
      }));
    },
    [onUpdate]
  );

  // --- Calculations ---
  const _parsedBottom = parseBoardLengthFt(getSize(sel.bottomPlate));
  const bottomLen = _parsedBottom ?? 12;
  const bottomBoardLenFt = Number.isFinite(_parsedBottom) ? _parsedBottom : 0;
  const topLen = parseBoardLengthFt(getSize(sel.topPlate)) ?? 12;
  const blockLen = parseBoardLengthFt(getSize(sel.blocking)) ?? 12;

  const baseRows = useMemo(() => {
    // ... (This logic is unchanged, it correctly uses prop state `waste`)
    const rows = [];
    {
      const res = calcPlates({ lengthLF, boardLenFt: bottomLen, wastePct: waste.bottomPlate ?? 0, item: getItem(sel.bottomPlate), unit: getUnit(sel.bottomPlate) });
      rows.push({ key: 'bottomPlate', label: 'Bottom plate', item: getItem(sel.bottomPlate), unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, wastePct: waste.bottomPlate ?? 0 });
    }
    {
      const res = calcPlates({ lengthLF, boardLenFt: topLen, wastePct: waste.topPlate ?? 0, item: getItem(sel.topPlate), unit: getUnit(sel.topPlate) });
      rows.push({ key: 'topPlate', label: 'Top plate', item: getItem(sel.topPlate), unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, wastePct: waste.topPlate ?? 0 });
    }
    {
      const res = calcStuds({ lengthLF, spacingIn: studSpacingIn, multiplier: studMultiplier, wastePct: waste.studs ?? 0, item: getItem(sel.studs), unit: getUnit(sel.studs) });
      rows.push({ key: 'studs', label: 'Studs', item: getItem(sel.studs), unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, wastePct: waste.studs ?? 0 });
    }
    {
      const res = calcBlocking({ lengthLF, heightFt, boardLenFt: blockLen, wastePct: waste.blocking ?? 0, item: getItem(sel.blocking), unit: getUnit(sel.blocking) });
      rows.push({ key: 'blocking', label: 'Blocking', item: getItem(sel.blocking), unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, wastePct: waste.blocking ?? 0 });
    }
    {
      const res = calcSheathing({ lengthLF, heightFt, wastePct: waste.sheathing ?? 0, item: getItem(sel.sheathing), unit: getUnit(sel.sheathing) || 'sheet' });
      rows.push({ key: 'sheathing', label: 'Sheathing', item: getItem(sel.sheathing), unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, wastePct: waste.sheathing ?? 0 });
    }
    return rows;
  }, [
    sel,
    waste,
    lengthLF,
    heightFt,
    studSpacingIn,
    studMultiplier,
    bottomLen,
    topLen,
    blockLen,
  ]);

  const rowByKey = useMemo(
    () => Object.fromEntries(baseRows.map((r) => [r.key, r])),
    [baseRows]
  );
  
  // ... (Other calculations are unchanged) ...
  const panelSheets = useMemo(() => {
    const sheathingRow = baseRows.find((r) => r.key === 'sheathing');
    return Math.ceil(Number(sheathingRow?.qtyFinal || 0));
  }, [baseRows]);
  const bottomIsPT = /pt/i.test(getFamily(sel.bottomPlate));
  const panelPtBoards = bottomIsPT ? Math.ceil(Number(rowByKey?.bottomPlate?.qtyFinal || 0)) : 0;
  const sheathingRow = (baseRows ?? []).find(r => (r.key === 'sheathing') || /sheathing/i.test(r.label || ''));
  const isZip = /zip/.test(getFamily(sheathingRow?.item));
  const zipSheetsFinal = isZip ? Math.ceil(Number(sheathingRow?.qtyFinal || 0)) : 0;
  const platePieces = (rowByKey?.bottomPlate?.qtyFinal ?? 0) + (rowByKey?.topPlate?.qtyFinal ?? 0);
  const ptLF = Number(lengthLF || 0);

  const extrasSignature = useMemo(() => {
    return (extras || [])
      .map(r => `${r.type}:${getFamily(r.item)}:${r.inputs.headerLF || 0}`)
      .join(',');
  }, [extras]);

  useEffect(() => {
    const headerLF = (extras || []).filter(r => r.type === 'Header' && isInfillFamily(getFamily(r.item))).reduce((s, r) => s + Number(r.inputs.headerLF || 0), 0);
    const infillItem = (extras || []).find(r => r.type === 'Headers infill'); 
    
    if (headerLF > 0 && !infillItem) { 
      addExtra('Headers infill'); 
    }
    if (headerLF === 0 && infillItem) { 
      removeExtra(infillItem.id); 
    }
  }, [extrasSignature, addExtra, removeExtra]); 

  const computedExtras = useMemo(() => {
    const headerLFPool = (extras || []).filter(r => r.type === 'Header' && isInfillFamily(getFamily(r.item))).reduce((s, r) => s + Number(r?.inputs?.headerLF || 0), 0);
    return (extras || []).map(r => {
      const fam = getFamily(r.item);
      const boardLenFt = parseBoardLengthFt(getSize(r.item)) ?? 0;
      if (r.type === 'Header') {
        const res = calcHeader({ isLVL: isLVL(fam), headerLF: Number(r?.inputs?.headerLF || 0), lvlPieces: Number(r?.inputs?.lvlPieces || 0), lvlLength: Number(r?.inputs?.lvlLength || 0), boardLenFt, wastePct: r.wastePct ?? 5, item: getItem(r.item) });
        return { ...r, unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, boardLenFt };
      }
      if (r.type === 'Post') {
        const res = calcPost({ isLinearLF: isLVL(fam) || isVersaColumn(fam), pieces: Number(r?.inputs?.pieces || 0), heightFt: Number(r?.inputs?.heightFt ?? heightFt), piecesPerPost: Number(r?.inputs?.piecesPerPost || 0), numPosts: Number(r?.inputs?.numPosts || 0), wastePct: r.wastePct ?? 5, item: getItem(r.item) });
        return { ...r, unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, boardLenFt };
      }
      if (r.type === 'Headers infill') {
        const res = calcHeadersInfill({ headerLFPool, wastePct: r.wastePct ?? 5, item: getItem(r.item) });
        return { ...r, unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, boardLenFt: null };
      }
      if (r.type === 'Studs') {
        const res = calcStuds({
          lengthLF: Number(r.inputs?.lengthLF || 0),
          spacingIn: Number(r.inputs?.studSpacingIn || 16),
          multiplier: Number(r.inputs?.studMultiplier || 1),
          wastePct: r.wastePct ?? 60,
          item: getItem(r.item),
          unit: getUnit(r.item)
        });
        return { ...r, unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, boardLenFt: null };
      }
      return r;
    });
  }, [extras, heightFt]);
  
  const groupSubtotal = useMemo(() => {
    const b = baseRows.reduce((s, r) => s + (r.subtotal || 0), 0);
    const x = computedExtras.reduce((s, r) => s + (r.subtotal || 0), 0);
    return b + x;
  }, [baseRows, computedExtras]);

  // This is the final reporting useEffect. (Unchanged, this is correct)
  const lastSentSigRef = useRef('');
  useEffect(() => {
    const currentStats = {
      lengthLF,
      zipSheetsFinal,
      panelSheets,
      platePieces: Math.ceil(platePieces),
      bottomPlatePiecesPanel: Math.ceil(rowByKey.bottomPlate?.qtyFinal || 0),
      ptLF,
      groupSubtotal,
      bottomBoardLenFt,
      panelPtBoards,
    };

    const currentSig = JSON.stringify(currentStats);
    if (currentSig !== lastSentSigRef.current) {
      lastSentSigRef.current = currentSig;
      onUpdate((prevData) => ({
        ...prevData,
        ...currentStats,
      }));
    }
  }, [
    onUpdate, 
    lengthLF,
    zipSheetsFinal,
    panelSheets,
    platePieces,
    rowByKey.bottomPlate?.qtyFinal,
    ptLF,
    groupSubtotal,
    bottomBoardLenFt,
    panelPtBoards,
  ]);

  /* ────────────────────────────────────────────────────────────────────────
     Render
     ──────────────────────────────────────────────────────────────────────── */
  const gridCols =
    'minmax(180px,1.1fr) 3.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr 1.6fr 0.8fr';

  return (
    <div className="ew-card">
      {/* --- *** MODIFICADO *** --- */}
      <AccordionSection
        open={!collapsed}
        onOpenChange={setCollapsed}
        bar={({ open, toggle }) => (
          <div style={{ display:'flex', alignItems:'center', gap: 8, width: '100%' }}>
              <button
                  type="button" 
                  className="acc__button"
                  onClick={toggle} 
                  aria-expanded={open} 
                  title={open ? "Collapse" : "Expand"}
              >
                   <img
                      src={open ? '/icons/down.png' : '/icons/minimize.png'} 
                      alt={open ? 'Collapse section' : 'Expand section'}
                      width={16}
                      height={16}
                      className="acc__chev"
                      style={{ display: 'inline-block', verticalAlign: 'middle' }}
                  />
              </button>
              <EditableTitle 
                value={title} 
                onChange={handleNameChange}
                textClass="text-section-header" 
              />
              <div 
                className="ew-right text-subtotal-orange" 
                style={{ marginLeft: 'auto' }}
              >
                  Subtotal: {fmt(groupSubtotal)}
              </div>
              {onRemove ? (
                <RemoveButton
                  onClick={onRemove}
                  title="Remove section"
                  label="Remove section"
                />
              ) : null}
          </div>
        )}
      >
        {/* --- Optimized Inputs --- */}
        <div className="controls4" style={{ marginBottom: 12 }}>
          <label>
            <span className="ew-subtle">Length (LF)</span>
            <input
              className="ew-input focus-anim"
              type="number"
              inputMode="decimal"
              value={inputValueLF ?? 0}
              onChange={(e) => setInputValueLF(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' &&
                commitFieldChange('lengthLF', e.target.value)
              }
              onBlur={(e) => commitFieldChange('lengthLF', e.target.value)}
            />
          </label>
          <label>
            <span className="ew-subtle">Height (ft)</span>
            <input
              className="ew-input focus-anim"
              type="number"
              inputMode="decimal"
              value={inputValueHeight ?? 0}
              onChange={(e) => setInputValueHeight(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' &&
                commitFieldChange('heightFt', e.target.value)
              }
              onBlur={(e) => commitFieldChange('heightFt', e.target.value)}
            />
          </label>
          <label>
            <span className="ew-subtle">Stud spacing (in)</span>
            <input
              className="ew-input focus-anim"
              type="number"
              inputMode="decimal"
              value={inputValueSpacing ?? 0}
              onChange={(e) => setInputValueSpacing(e.target.value)}
              onKeyDown={(e) =>
                e.key === 'Enter' &&
                commitFieldChange('studSpacingIn', e.target.value)
              }
              onBlur={(e) => commitFieldChange('studSpacingIn', e.target.value)}
            />
          </label>
          <label>
            <span className="ew-subtle">Studs per location</span>
            {/* --- *** CAMBIADO A <select> *** --- */}
            <select
              className="ew-select focus-anim"
              value={inputValueMultiplier ?? 1}
              onChange={(e) => {
                // Selects commit immediately
                commitFieldChange('studMultiplier', e.target.value);
              }}
            >
              <option value={1}>Single</option>
              <option value={2}>Double</option>
              <option value={3}>Triple</option>
              <option value={4}>Quad</option>
            </select>
          </label>
        </div>
        {/* --- End Optimized Inputs --- */}

        <div className="ew-grid ew-head" style={{ '--cols': gridCols }}>
          <div>Item</div>
          <div>Family · Size · Vendor</div>
          <div className="ew-right">Qty</div>
          <div className="ew-right">Waste %</div>
          <div className="ew-right">Final qty</div>
          <div className="ew-right">Unit</div>
          <div className="ew-right">Unit price</div>
          <div className="ew-right">Subtotal</div>
          <div>Plan & Notes</div>
          <div></div>
        </div>

        <div className="ew-rows">
          {baseRows.map((row) => {
            const noteKey = `base:${row.key}`;
            const n = getNote(noteKey);
            return (
              <Fragment key={row.key}>
                <div className="ew-grid ew-row" style={{ '--cols': gridCols }}>
                  <div>{row.label}</div>
                  <ItemPicker
                    compact
                    onSelect={setPick(row.key)}
                    value={sel[row.key]}
                    defaultVendor="Gillies & Prittie Warehouse"
                    defaultFamilyLabel={
                      row.key === 'sheathing'
                        ? 'Green Zip'
                        : row.key === 'bottomPlate'
                        ? bottomDefaultFamily
                        : 'SPF#2'
                    }
                    defaultSizeLabel={
                      row.key === 'sheathing'
                        ? `4x8'-7/16"`
                        : row.key === 'bottomPlate' ||
                          row.key === 'topPlate' ||
                          row.key === 'blocking'
                        ? `2x6"-8'`
                        : row.key === 'studs'
                        ? `2x6"-10'`
                        : undefined
                    }
                    preferredSeries={
                      row.key === 'sheathing' ? undefined : '2x6'
                    }
                  />
                  <div className="ew-right">{Math.ceil(row.qtyRaw)}</div>
                  <div className="ew-right">
                    {/* --- Optimized Waste Inputs --- */}
                    <input
                      className="ew-input focus-anim"
                      type="number"
                      inputMode="decimal"
                      value={localWaste[row.key] ?? 0}
                      onChange={(e) => handleLocalWasteChange(row.key, e)}
                      onBlur={(e) => handleWasteBlur(row.key, e)}
                      onKeyDown={(e) => handleWasteKeyDown(row.key, e)}
                      style={{ width: 80, textAlign: 'right' }}
                    />
                  </div>
                  <div className="ew-right">{row.qtyFinal}</div>
                  <div className="ew-right">{row.unit}</div>
                  <div className="ew-right ew-money">
                    {row.unitPrice ? fmt(row.unitPrice) : '—'}
                  </div>
                  <div className="ew-right ew-money">
                    {row.subtotal ? fmt(row.subtotal) : '—'}
                  </div>            
                  <div>
                    <div className="ew-subtle" style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
                      <span className="ew-chip" title={n.plan || ''}>{n.plan || '—'}</span>
                      <button className="ew-btn" style={{ padding:'4px 8px' }} onClick={()=>toggleOpen(noteKey)}>
                        {n.open ? 'Hide' : 'Notes'}
                      </button>
                    </div>
                    {n.comment && (
                      <div className="ew-subtle" title={n.comment}>{wordsPreview(n.comment)}</div>
                    )}
                  </div>
                  <div></div>
                </div>
                {n.open && ( 
                  <div className="ew-row" style={{ padding:12 }}>
                    <div className="controls2" style={{ width:'100%' }}>
                      <label>
                        <span className="ew-subtle">Plan label</span>
                        <DebouncedInput
                          type="text"
                          placeholder="e.g., A2.4 / S5 – Detail 03"
                          value={n.plan}
                          onChange={v => setNote(noteKey, { plan: v })}
                        />
                      </label>
                      <label>
                        <span className="ew-subtle">Comment</span>
                        <DebouncedTextarea
                          rows={3}
                          placeholder="Add any notes for this item…"
                          value={n.comment}
                          onChange={v => setNote(noteKey, { comment: v })}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>

        <h3 className="ew-h3" style={{ marginTop: 12, marginBottom: 6 }}>
          Extras
        </h3>

        <div className="ew-rows">
          {computedExtras.map((ex) => {
            const noteKey = `extra:${ex.id}`;
            const n = getNote(noteKey);
            return (
              <Fragment key={ex.id}>
                <div className="ew-grid ew-row" style={{ '--cols': gridCols }}>
                  <div>
                    <div
                      style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                    >
                      <span style={{ fontWeight: 600 }}>{ex.type}</span>
                      {ex.type !== 'Headers infill' && (
                        <RemoveButton
                          onClick={() => removeExtra(ex.id)}
                          title="Remove row"
                          label="Remove row"
                        />
                      )}
                    </div>
                  </div>
                  <div>
                    <ItemPicker
                      compact
                      onSelect={(item) => updateExtra(ex.id, { item })}
                      value={ex.item}
                      defaultVendor="Gillies & Prittie Warehouse"
                      defaultFamilyLabel={
                        ex.type === 'Headers infill' ? 'CDX SE' :
                        ex.type === 'Studs' ? 'SPF#2' :
                        'SPF#2'
                      }
                      defaultSizeLabel={
                        ex.type === 'Headers infill' ? `4x8'-1/2"` :
                        ex.type === 'Studs' ? `2x6"-10'` :
                        (ex.type === 'Header' || ex.type === 'Post') ? `2x6"-10'` :
                        undefined
                      }
                    />
                    
                    {/* --- *** RESTORED: Header Inputs *** --- */}
                    {ex.type === 'Header' &&
                      (isLVL(getFamily(ex.item)) ? (
                        <div
                          className="ew-inline"
                          style={{ marginTop: 6, alignItems: 'end' }}
                        >
                          <label style={{ minWidth: 120 }}>
                            <span className="ew-subtle">Pieces</span>
                            <input
                              className="ew-input focus-anim"
                              type="number"
                              value={ex.inputs?.lvlPieces || ''}
                              onChange={(e) =>
                                updateExtra(ex.id, {
                                  inputs: {
                                    ...ex.inputs,
                                    lvlPieces: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                          <label style={{ minWidth: 140 }}>
                            <span className="ew-subtle">Length (lf)</span>
                            <input
                              className="ew-input focus-anim"
                              type="number"
                              value={ex.inputs?.lvlLength || ''}
                              onChange={(e) =>
                                updateExtra(ex.id, {
                                  inputs: {
                                    ...ex.inputs,
                                    lvlLength: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                        </div>
                      ) : (
                        <div
                          className="ew-inline"
                          style={{ marginTop: 6, alignItems: 'end' }}
                        >
                          <label style={{ minWidth: 160 }}>
                            <span className="ew-subtle">Total header LF</span>
                            <input
                              className="ew-input focus-anim"
                              type="number"
                              value={ex.inputs?.headerLF || ''}
                              onChange={(e) =>
                                updateExtra(ex.id, {
                                  inputs: {
                                    ...ex.inputs,
                                    headerLF: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                          <div className="ew-hint">
                            Board length from size:{' '}
                            {ex.boardLenFt ||
                              parseBoardLengthFt(getSize(ex.item)) ||
                              '—'}{' '}
                            ft
                          </div>
                        </div>
                      ))}
                      
                    {/* --- *** RESTORED: Post Inputs *** --- */}
                    {ex.type === 'Post' &&
                      (isLVL(getFamily(ex.item)) ||
                      isVersaColumn(getFamily(ex.item)) ? (
                        <div
                          className="ew-inline"
                          style={{ marginTop: 6, alignItems: 'end' }}
                        >
                          <label style={{ minWidth: 120 }}>
                            <span className="ew-subtle">Pieces</span>
                            <input
                              className="ew-input focus-anim"
                              type="number"
                              value={ex.inputs?.pieces || ''}
                              onChange={(e) =>
                                updateExtra(ex.id, {
                                  inputs: {
                                    ...ex.inputs,
                                    pieces: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                          <label style={{ minWidth: 140 }}>
                            <span className="ew-subtle">Height (ft)</span>
                            <input
                              className="ew-input focus-anim"
                              type="number"
                              value={ex.inputs?.heightFt ?? heightFt}
                              onChange={(e) =>
                                updateExtra(ex.id, {
                                  inputs: {
                                    ...ex.inputs,
                                    heightFt: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                        </div>
                      ) : isLumberFamily(getFamily(ex.item)) ? (
                        <div
                          className="ew-inline"
                          style={{ marginTop: 6, alignItems: 'end' }}
                        >
                          <label style={{ minWidth: 160 }}>
                            <span className="ew-subtle">Pieces per post</span>
                            <input
                              className="ew-input focus-anim"
                              type="number"
                              value={ex.inputs?.piecesPerPost || ''}
                              onChange={(e) =>
                                updateExtra(ex.id, {
                                  inputs: {
                                    ...ex.inputs,
                                    piecesPerPost: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                          <label style={{ minWidth: 140 }}>
                            <span className="ew-subtle">Posts (#)</span>
                            <input
                              className="ew-input focus-anim"
                              type="number"
                              value={ex.inputs?.numPosts || ''}
                              onChange={(e) =>
                                updateExtra(ex.id, {
                                  inputs: {
                                    ...ex.inputs,
                                    numPosts: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </label>
                        </div>
                      ) : null)}

                    {/* --- *** UPDATED: Studs Inputs *** --- */}
                    {ex.type === 'Studs' && (
                      <div className="ew-inline" style={{ marginTop:6, alignItems:'end' /* No flexWrap */ }}>
                        <label style={{minWidth: 100}}><span className="ew-subtle">Length (LF)</span>
                          <input className="ew-input focus-anim" type="number"
                            value={ex.inputs?.lengthLF || 0}
                            onChange={e => updateExtra(ex.id, { inputs: { ...ex.inputs, lengthLF: Number(e.target.value) } })}
                          />
                        </label>
                        <label style={{minWidth: 100}}><span className="ew-subtle">Spacing (in)</span>
                          <input className="ew-input focus-anim" type="number"
                            value={ex.inputs?.studSpacingIn || 16}
                            onChange={e => updateExtra(ex.id, { inputs: { ...ex.inputs, studSpacingIn: Number(e.target.value) } })}
                          />
                        </label>
                        {/* --- This is now a <select> --- */}
                        <label style={{minWidth: 120}}><span className="ew-subtle">Per Location</span>
                          <select 
                            className="ew-select focus-anim"
                            value={ex.inputs?.studMultiplier || 1}
                            onChange={e => updateExtra(ex.id, { inputs: { ...ex.inputs, studMultiplier: Number(e.target.value) } })}
                          >
                            <option value={1}>Single</option>
                            <option value={2}>Double</option>
                            <option value={3}>Triple</option>
                            <option value={4}>Quad</option>
                          </select>
                        </label>
                        {/* --- This is the checkbox --- */}
                        <label style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 100, height: '40px', paddingBottom: '2px' }}>
                          <input type="checkbox"
                            style={{ width: 16, height: 16 }}
                            checked={!!ex.inputs?.staggered}
                            onChange={e => updateExtra(ex.id, { inputs: { ...ex.inputs, staggered: e.target.checked } })}
                          />
                          <span className="ew-subtle" style={{ userSelect: 'none' }}>Staggered</span>
                        </label>
                      </div>
                    )}
                      
                    {ex.type === 'Headers infill' && (
                      <div className="ew-hint" style={{ marginTop: 6 }}>
                        QTY = Σ Header LF ÷ 3 ÷ 32 × 2 (then waste)
                      </div>
                    )}
                  </div>
                  <div className="ew-right">{Math.ceil(ex.qtyRaw ?? 0)}</div>
                  <div className="ew-right">
                    {/* --- *** OPTIMIZED: Extra Waste Input *** --- */}
                    <input
                      className="ew-input focus-anim"
                      type="number"
                      inputMode="decimal"
                      value={localExtraWaste[ex.id] ?? 0}
                      onChange={(e) => handleLocalExtraWasteChange(ex.id, e)}
                      onBlur={(e) => handleExtraWasteBlur(ex.id, e)}
                      onKeyDown={(e) => handleExtraWasteKeyDown(ex.id, e)}
                      style={{ width: 80, textAlign: 'right' }}
                    />
                  </div>
                  <div className="ew-right">{ex.qtyFinal ?? '—'}</div>
                  <div className="ew-right">{ex.unit}</div>
                  <div className="ew-right ew-money">
                    {ex.unitPrice ? fmt(ex.unitPrice) : '—'}
                  </div>
                  <div className="ew-right ew-money">
                    {ex.subtotal ? fmt(ex.subtotal) : '—'}
                  </div>
                  {/* ... (Note logic unchanged) ... */}
                  <div>
                    <div className="ew-subtle" style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
                      <span className="ew-chip" title={n.plan || ''}>{n.plan || '—'}</span>
                      <button className="ew-btn" style={{ padding:'4px 8px' }} onClick={()=>toggleOpen(noteKey)}>
                        {n.open ? 'Hide' : 'Notes'}
                      </button>
                    </div>
                    {n.comment && (
                      <div className="ew-subtle" title={n.comment}>{wordsPreview(n.comment)}</div>
                    )}
                  </div>
                  <div></div>
                </div>
                {n.open && ( 
                  <div className="ew-row" style={{ padding:12 }}>
                    <div className="controls2" style={{ width:'100%' }}>
                      <label>
                        <span className="ew-subtle">Plan label</span>
                        <DebouncedInput
                          type="text"
                          placeholder="e.g., A2.4 / S5 – Detail 03"
                          value={n.plan}
                          onChange={v => setNote(noteKey, { plan: v })}
                        />
                      </label>
                      <label>
                        <span className="ew-subtle">Comment</span>
                        <DebouncedTextarea
                          rows={3}
                          placeholder="Add any notes for this item…"
                          value={n.comment}
                          onChange={v => setNote(noteKey, { comment: v })}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>

        <div className="ew-footer">
          {/* --- *** BUTTONS RESTORED AND ADDED *** --- */}
          <button className="ew-btn" onClick={() => addExtra('Header')}>
            <img
              src={'/icons/plus-sign.png'}
              width={12}
              height={12}
              alt="Add"
              style={{
                display: 'inline-block',
                verticalAlign: 'middle',
                marginRight: '6px',
              }}
            />
            Header
          </button>
          <button className="ew-btn" onClick={() => addExtra('Post')}>
            <img
              src={'/icons/plus-sign.png'}
              width={12}
              height={12}
              alt="Add"
              style={{
                display: 'inline-block',
                verticalAlign: 'middle',
                marginRight: '6px',
              }}
            />
            Post
          </button>
          <button className="ew-btn" onClick={() => addExtra('Studs')}>
            <img
              src={'/icons/plus-sign.png'}
              width={12}
              height={12}
              alt="Add"
              style={{
                display: 'inline-block',
                verticalAlign: 'middle',
                marginRight: '6px',
              }}
            />
            Studs
          </button>
          {/* (We can add 'Blocking' back if you need it) */}
          <div
            className="ew-right"
            style={{ marginLeft: 'auto', color: '#f18d5b' }}
          >
            Group subtotal: {fmt(groupSubtotal)}
          </div>
        </div>
      </AccordionSection>
    </div>
  );
}