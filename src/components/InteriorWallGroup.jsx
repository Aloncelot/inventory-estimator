// src/components/InteriorWallGroup.jsx
'use client';

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffectEvent, // React 19.2
} from 'react';
import ItemPicker from '@/components/ItemPicker';
import AccordionSection from '@/components/ui/AccordionSection';
import RemoveButton from './ui/RemoveButton';
import EditableTitle from './ui/EditableTitle';
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

// --- Helpers (Unchanged) ---
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
  const it = selLike;
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

export default function InteriorWallGroup({
  sectionData,
  onUpdateSection, // This prop MUST be a stable useCallback from the parent
  title = 'Interior walls',
  onRemove,
  bottomDefaultFamily = 'SPF#2',
}) {
  const {
    id,
    kind = 'partition',
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
    collapsed = false,
  } = sectionData;

  // --- START: Input Optimization ---

  // 1. Local state for main inputs
  const [inputValueLF, setInputValueLF] = useState(String(lengthLF));
  const [inputValueHeight, setInputValueHeight] = useState(String(heightFt));
  const [inputValueSpacing, setInputValueSpacing] = useState(
    String(studSpacingIn)
  );
  const [inputValueMultiplier, setInputValueMultiplier] = useState(
    String(studMultiplier)
  );
  const [inputValueKind, setInputValueKind] = useState(kind);

  // 2. Local state for base waste inputs
  const [localWaste, setLocalWaste] = useState(waste);

  // 3. Local state for extra waste inputs
  const [localExtraWaste, setLocalExtraWaste] = useState({});

  // 4. Sync local states from props
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
  
  useEffect(() => {
    setInputValueKind(kind);
  }, [kind]);

  // 5. Sync base waste state from props (using primitive dependencies)
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

  // 6. Sync extra waste state from props
  const extrasWasteSig = useMemo(() => {
    return (extras || []).map((ex) => `${ex.id}:${ex.wastePct}`).join(',');
  }, [extras]);

  useEffect(() => {
    for (const ex of extras) {
      setLocalExtraWaste((prev) => ({
        ...prev,
        [ex.id]: prev[ex.id] ?? ex.wastePct ?? 0,
      }));
    }
  }, [extrasWasteSig]);

  // 7. Stable event handler for `onUpdateSection`
  const onUpdate = useEffectEvent(onUpdateSection);

  // 8. Generic commit function for main inputs
  const commitFieldChange = useCallback(
    (fieldName, value) => {
      let valToCommit = value;
      
      // Coerce numeric inputs, but allow 'kind' to be a string
      if (fieldName !== 'kind') {
        valToCommit = Number(value) || 0;
      }
      
      onUpdate((prevData) => ({ ...prevData, [fieldName]: valToCommit }));
      
      // Resync local state
      if (fieldName === 'lengthLF') setInputValueLF(String(valToCommit));
      if (fieldName === 'heightFt') setInputValueHeight(String(valToCommit));
      if (fieldName === 'studSpacingIn')
        setInputValueSpacing(String(valToCommit));
      if (fieldName === 'studMultiplier')
        setInputValueMultiplier(String(valToCommit));
      if (fieldName === 'kind')
        setInputValueKind(String(valToCommit));
    },
    [onUpdate]
  );

  // 9. Commit handlers for base waste inputs
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
  
  // 10. Handlers for *extra* waste inputs
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
  const parts = newName.split('—');
  const nameOnly = parts[parts.length - 1]?.trim() || newName;

  onUpdate(prev => ({ ...prev, name: nameOnly }));
}, [onUpdate]); // onUpdate es estable



  // --- END: Input Optimization ---

  const setCollapsed = useCallback((isOpen) => {
    onUpdate(prev => ({ ...prev, collapsed: !isOpen }));
  }, [onUpdate]);
  
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
      // Add defaults for Interior-specific types
      if (type === 'Extra blocking') {
        newExtra.inputs = { rows: 1 };
        newExtra.wastePct = 10;
      }
      if (type === 'Extra sheathing') {
        newExtra.wastePct = 20;
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

  // --- (Calculation logic) ---
  const bottomLen = parseBoardLengthFt(getSize(sel.bottomPlate)) ?? 0;
  const bottomBoardLenFt = Number.isFinite(bottomLen) ? bottomLen : 0;
  const topLen = parseBoardLengthFt(getSize(sel.topPlate)) ?? 12;
  const blockLen = parseBoardLengthFt(getSize(sel.blocking)) ?? 12;
  const showBlocking = kind === 'bearing';
  const showSheathing = kind === 'shear';

  const baseRows = useMemo(() => {
    const rows = [];
    {
      const res = calcPlates({ lengthLF, boardLenFt: bottomLen, wastePct: waste.bottomPlate ?? 0, item: getItem(sel.bottomPlate), unit: getUnit(sel.bottomPlate) });
      rows.push({ key: 'bottomPlate', label: `Bottom plate`, item: getItem(sel.bottomPlate), unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, wastePct: waste.bottomPlate ?? 0, boardLenFt: res.boardLenFt });
    }
    {
      const res = calcPlates({ lengthLF, boardLenFt: topLen, wastePct: waste.topPlate ?? 0, item: getItem(sel.topPlate), unit: getUnit(sel.topPlate) });
      rows.push({ key: 'topPlate', label: `Top plate`, item: getItem(sel.topPlate), unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, wastePct: waste.topPlate ?? 0 });
    }
    {
      const res = calcStuds({ lengthLF, spacingIn: studSpacingIn, multiplier: studMultiplier, wastePct: waste.studs ?? 0, item: getItem(sel.studs), unit: getUnit(sel.studs) });
      rows.push({ key: 'studs', label: `Studs`, item: getItem(sel.studs), unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, wastePct: waste.studs ?? 0 });
    }
    if (showBlocking) {
      const res = calcBlocking({ lengthLF, heightFt, boardLenFt: blockLen, wastePct: waste.blocking ?? 0, item: getItem(sel.blocking), unit: getUnit(sel.blocking) });
      rows.push({ key: 'blocking', label: `Blocking`, item: getItem(sel.blocking), unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, wastePct: waste.blocking ?? 0 });
    }
    if (showSheathing) {
      const res = calcSheathing({ lengthLF, heightFt, wastePct: waste.sheathing ?? 0, item: getItem(sel.sheathing), unit: getUnit(sel.sheathing) || 'sheet' });
      rows.push({ key: 'sheathing', label: 'Sheathing (4x8)', item: getItem(sel.sheathing), unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, wastePct: waste.sheathing ?? 0 });
    }
    return rows;
  }, [
    sel,
    waste,
    showBlocking,
    showSheathing,
    lengthLF,
    heightFt,
    studSpacingIn,
    studMultiplier,
    bottomLen,
    topLen,
    blockLen,
  ]);

  const rowByKey = useMemo(
    () => Object.fromEntries((baseRows || []).map((r) => [r.key, r])),
    [baseRows]
  );

  // ... (Other calculations are unchanged) ...
  const panelSheets = useMemo(() => {
    if (!showSheathing) return 0;
    const sheathingRow = baseRows.find(r => r.key === 'sheathing');
    return Math.ceil(Number(sheathingRow?.qtyFinal || 0));
  }, [baseRows, showSheathing]);

  const isPTFamily = (fam) => /(^|\b)pt(\b|$)|pressure/i.test(String(fam || ''));
  const panelPtBoards = useMemo(() => {
    const fam = getFamily(sel.bottomPlate);
    const isPT = isPTFamily(fam);
    const qty = Math.ceil(Number(rowByKey.bottomPlate?.qtyFinal || 0));
    return isPT ? qty : 0;
  }, [sel.bottomPlate, rowByKey.bottomPlate?.qtyFinal]);

  const platePieces = (rowByKey.bottomPlate?.qtyFinal ?? 0) + (rowByKey.topPlate?.qtyFinal ?? 0);
  const ptLF = Number(lengthLF || 0);
  const sizeLabel = getSize(sel.studs) || getSize(sel.bottomPlate) || '';
  const is2x6 = /(^|\D)2\s*[x×]\s*6(\D|$)/i.test(sizeLabel);
  const wallKind = is2x6 ? 'int-2x6' : 'int-2x4';
  
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
      if (r.type === 'Extra blocking') {
        const rowsCnt = Math.max(1, Number(r?.inputs?.rows || 1));
        const res = calcPlates({ lengthLF: Number(lengthLF || 0) * rowsCnt, boardLenFt, wastePct: r.wastePct ?? 10, item: getItem(r.item), unit: getUnit(r.item) });
        return { ...r, unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, boardLenFt };
      }
      if (r.type === 'Extra sheathing') {
        const res = calcSheathing({ lengthLF, heightFt, wastePct: r.wastePct ?? 5, item: getItem(r.item), unit: getUnit(r.item) || 'sheet' });
        return { ...r, unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, boardLenFt: null };
      }
      if (r.type === 'Post') {
        const res = calcPost({ isLinearLF: isLVL(fam) || isVersaColumn(fam), pieces: Number(r?.inputs?.pieces || 0), heightFt: Number(r?.inputs?.heightFt ?? heightFt), piecesPerPost: Number(r?.inputs?.piecesPerPost || 0), numPosts: Number(r?.inputs?.numPosts || 0), wastePct: r.wastePct ?? 5, item: getItem(r.item) });
        return { ...r, unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, boardLenFt };
      }
      if (r.type === 'Headers infill') {
        const res = calcHeadersInfill({ headerLFPool, wastePct: r.wastePct ?? 5, item: getItem(r.item) });
        return { ...r, unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, boardLenFt: null };
      }
      // ***NUEVO***: Calculation for 'Studs'
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
  }, [extras, heightFt, lengthLF]);
  
  const groupSubtotal = useMemo(() => {
    const b = baseRows.reduce((s, r) => s + (r.subtotal || 0), 0);
    const x = computedExtras.reduce((s, r) => s + (r.subtotal || 0), 0);
    return b + x;
  }, [baseRows, computedExtras]);

  // This is the final reporting useEffect. (Unchanged, this is correct)
  const lastSentSigRef = useRef('');
  useEffect(() => {
    const currentStats = {
      kind,
      wallKind,
      lengthLF,
      platePieces: Math.ceil(platePieces),
      bottomPlatePiecesPanel: Math.ceil(rowByKey.bottomPlate?.qtyFinal || 0),
      ptLF,
      groupSubtotal,
      isShear: kind === 'shear',
      isBearing: kind === 'bearing',
      isPartition: kind === 'partition',
      isKnee: kind === 'knee',
      bottomBoardLenFt,
      panelPtBoards,
      panelSheets,
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
    kind,
    wallKind,
    panelPtBoards,
    panelSheets,
    lengthLF,
    platePieces,
    rowByKey.bottomPlate?.qtyFinal,
    ptLF,
    groupSubtotal,
    bottomBoardLenFt,
  ]);

  /* ────────────────────────────────────────────────────────────────────────
     Render
     ──────────────────────────────────────────────────────────────────────── */
  const gridCols =
    'minmax(180px,1.1fr) 3.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr 1.6fr 0.8fr';

  return (
    <div className="ew-card">
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
        {/* Inputs are wired to optimized handlers */}
        <div className="controls4" style={{ marginBottom: 8 }}>
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
            <select
              className="ew-select focus-anim"
              value={inputValueMultiplier ?? 1}
              onChange={(e) => {
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
        <div className="controls2" style={{ marginBottom: 12 }}>
          <label>
            <span className="ew-subtle">Wall kind</span>
            <select
              className="ew-select focus-anim"
              value={inputValueKind ?? 'partition'}
              onChange={(e) => {
                commitFieldChange('kind', e.target.value);
              }}
            >
              <option value="partition">Partition</option>
              <option value="bearing">Bearing (adds blocking)</option>
              <option value="shear">Shear (adds sheathing)</option>
              <option value="knee">Knee</option>
            </select>
          </label>
        </div>

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
                  <div>
                    <ItemPicker
                      compact
                      onSelect={setPick(row.key)}
                      value={sel[row.key]}
                      defaultVendor="Gillies & Prittie Warehouse"
                      defaultFamilyLabel={
                        row.key === 'sheathing'
                          ? 'CDX SE'
                          : row.key === 'bottomPlate'
                          ? bottomDefaultFamily
                          : 'SPF#2'
                      }
                      defaultSizeLabel={
                        row.key === 'sheathing'
                          ? `4x8'-1/2"`
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
                  </div>
                  <div className="ew-right">{Math.ceil(row.qtyRaw)}</div>
                  <div className="ew-right">
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
                          title={`Remove ${ex.type}`}
                          label={`Remove ${ex.type}`}
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
                        ex.type === 'Headers infill' ||
                        ex.type === 'Extra sheathing'
                          ? 'CDX SE'
                          : 'SPF#2'
                      }
                      defaultSizeLabel={
                        ex.type === 'Headers infill' ||
                        ex.type === 'Extra sheathing'
                          ? `4x8'-1/2"`
                          : ex.type === 'Header' ||
                            ex.type === 'Post' ||
                            ex.type === 'Extra blocking' ||
                            ex.type === 'Studs'
                          ? `2x6"-10'`
                          : undefined
                      }
                    />
                    
                    {/* --- *** RESTORED: Header Inputs *** --- */}
                    {ex.type === 'Header' &&
                      (isLVL(getFamily(ex.item)) ? (
                        <div className="ew-inline" style={{ marginTop:6, alignItems:'end' }}>
                          <label style={{ minWidth:120 }}><span className="ew-subtle">Pieces</span>
                            <input className="ew-input focus-anim" type="number"
                              value={ex.inputs?.lvlPieces || ''}
                              onChange={e=>updateExtra(ex.id,{ inputs:{...ex.inputs, lvlPieces:Number(e.target.value)} })}
                            />
                          </label>
                          <label style={{ minWidth:140 }}><span className="ew-subtle">Length (lf)</span>
                            <input className="ew-input focus-anim" type="number"
                              value={ex.inputs?.lvlLength || ''}
                              onChange={e=>updateExtra(ex.id,{ inputs:{...ex.inputs, lvlLength:Number(e.target.value)} })}
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="ew-inline" style={{ marginTop:6, alignItems:'end' }}>
                          <label style={{ minWidth:160 }}><span className="ew-subtle">Total header LF</span>
                            <input className="ew-input focus-anim" type="number"
                              value={ex.inputs?.headerLF || ''}
                              onChange={e=>updateExtra(ex.id,{ inputs:{...ex.inputs, headerLF:Number(e.target.value)} })}
                            />
                          </label>
                          <div className="ew-hint">Board length from size: {ex.boardLenFt || parseBoardLengthFt(getSize(ex.item)) || '—'} ft</div>
                        </div>
                      ))}
                      
                    {/* --- *** RESTORED: Post Inputs *** --- */}
                    {ex.type === 'Post' &&
                      (isLVL(getFamily(ex.item)) ||
                      isVersaColumn(getFamily(ex.item)) ? (
                        <div className="ew-inline" style={{ marginTop:6, alignItems:'end' }}>
                          <label style={{ minWidth:120 }}><span className="ew-subtle">Pieces</span>
                            <input className="ew-input focus-anim" type="number"
                              value={ex.inputs?.pieces || ''}
                              onChange={e=>updateExtra(ex.id,{ inputs:{...ex.inputs, pieces:Number(e.target.value)} })}
                            />
                          </label>
                          <label style={{ minWidth:140 }}><span className="ew-subtle">Height (ft)</span>
                            <input className="ew-input focus-anim" type="number"
                              value={ex.inputs?.heightFt ?? heightFt}
                              onChange={e=>updateExtra(ex.id,{ inputs:{...ex.inputs, heightFt:Number(e.target.value)} })}
                            />
                          </label>
                        </div>
                      ) : isLumberFamily(getFamily(ex.item)) ? (
                        <div className="ew-inline" style={{ marginTop:6, alignItems:'end' }}>
                          <label style={{ minWidth:160 }}><span className="ew-subtle">Pieces per post</span>
                            <input className="ew-input focus-anim" type="number"
                              value={ex.inputs?.piecesPerPost || ''}
                              onChange={e=>updateExtra(ex.id,{ inputs:{...ex.inputs, piecesPerPost:Number(e.target.value)} })}
                            />
                          </label>
                          <label style={{ minWidth:140 }}><span className="ew-subtle">Posts (#)</span>
                            <input className="ew-input focus-anim" type="number"
                              value={ex.inputs?.numPosts || ''}
                              onChange={e=>updateExtra(ex.id,{ inputs:{...ex.inputs, numPosts:Number(e.target.value)} })}
                            />
                          </label>
                        </div>
                      ) : null)}
                      
                    {/* --- *** NUEVO: Studs Inputs *** --- */}
                    {ex.type === 'Studs' && (
                      <div className="ew-inline" style={{ marginTop:6, alignItems:'end' }}>
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
                      
                    {/* --- *** RESTAURADO: Otros Inputs de Extras *** --- */}
                    {ex.type === 'Headers infill' && (
                      <div className="ew-hint" style={{ marginTop: 6 }}>
                        QTY = Σ Header LF ÷ 3 ÷ 32 × 2 (then waste)
                      </div>
                    )}
                    {ex.type === 'Extra sheathing' && (
                      <div className="ew-hint" style={{ marginTop: 6 }}>
                        Same math as regular sheathing (length × height ÷ 32),
                        then waste.
                      </div>
                    )}
                    {ex.type === 'Extra blocking' && (
                      <div
                        className="ew-inline"
                        style={{ marginTop: 6, alignItems: 'end', gap: 12 }}
                      >
                        <label style={{ minWidth: 140 }}>
                          <span className="ew-subtle">Rows (#)</span>
                          <input
                            className="ew-input focus-anim"
                            type="number"
                            min={1}
                            step={1}
                            value={ex.inputs?.rows || 1}
                            onChange={(e) =>
                              updateExtra(ex.id, {
                                inputs: {
                                  ...(ex.inputs || {}),
                                  rows: Math.max(1, Number(e.target.value || 1)),
                                },
                              })
                            }
                          />
                        </label>
                        <div className="ew-hint">
                          Same math as plates × rows (then waste). Board length
                          from size:{' '}
                          {ex.boardLenFt ||
                            parseBoardLengthFt(getSize(ex.item)) ||
                            '—'}{' '}
                          ft
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="ew-right">{Math.ceil(ex.qtyRaw ?? 0)}</div>
                  <div className="ew-right">
                    {/* --- *** OPTIMIZADO: Extra Waste Input *** --- */}
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
          {/* --- *** BOTONES RESTAURADOS Y AÑADIDOS *** --- */}
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
          <button className="ew-btn" onClick={() => addExtra('Extra blocking')}>
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
            Blocking
          </button>
          {showSheathing && (
            <button
              className="ew-btn"
              onClick={() => addExtra('Extra sheathing')}
            >
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
              Extra Sheathing
            </button>
          )}
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