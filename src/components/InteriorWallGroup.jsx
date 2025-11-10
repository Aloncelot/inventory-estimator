// src/components/InteriorWallGroup.jsx
'use client';

import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import ItemPicker from '@/components/ItemPicker';
import AccordionSection from '@/components/ui/AccordionSection';
import RemoveButton from './ui/RemoveButton';
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
import { isLVL, isVersaColumn, isLumberFamily, isInfillFamily } from '@/domain/lib/families';

// --- Helpers (Unchanged) ---
const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmt = n => (Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : '—');

const wordsPreview = (s = '', maxWords = 8) => {
  const parts = String(s).trim().split(/\s+/);
  const preview = parts.slice(0, maxWords).join(' ');
  return parts.length > maxWords ? `${preview}…` : preview || '';
};

const deref = (x) => (x && x.item ? x.item : x);
const getItem = (selLike) => deref(selLike);
const getUnit = (selLike) =>
  deref(selLike)?.unit || deref(selLike)?.raw?.unit || "pcs";

const getSize = (selLike) =>
  deref(selLike)?.sizeLabel ||
  deref(selLike)?.sizeDisplay ||
  deref(selLike)?.raw?.sizeDisplay ||
  "";

const getFamily = (selLike) => {
  const it = selLike; 
  return String(
    it?.familyLabel ??
    it?.familyDisplay ??
    it?.raw?.familyDisplay ??
    it?.raw?.familyLabel ??
    it?.family ??
    ""
  ).toLowerCase();
};
/* ────────────────────────────────────────────────────────────────────────── */


export default function InteriorWallGroup({
  sectionData,
  onUpdateSection, // This prop MUST be a stable useCallback from the parent
  title = 'Interior walls',
  onRemove,
  bottomDefaultFamily = 'SPF#2'
}) {

  const {
    id,
    kind = 'partition',
    lengthLF = 0,
    heightFt = 12,
    studSpacingIn = 16,
    studMultiplier = 1,
    waste = { bottomPlate: 10, topPlate: 10, studs: 60, blocking: 10, sheathing: 20 },
    sel = { bottomPlate:null, topPlate:null, studs:null, blocking:null, sheathing:null },
    notes = {},
    extras = [],
  } = sectionData;
  
  const [inputValueLF, setInputValueLF] = useState(String(lengthLF));
  useEffect(() => {
    setInputValueLF(String(lengthLF));
  }, [lengthLF]);
  
  const updateField = useCallback((fieldName, value) => {
    onUpdateSection(prevData => ({ ...prevData, [fieldName]: value }));
  }, [onUpdateSection]);

  const setWaste = useCallback((key, value) => {
    onUpdateSection(prevData => ({
      ...prevData,
      waste: { ...(prevData.waste || {}), [key]: Number(value) || 0 }
    }));
  }, [onUpdateSection]);
  
  const setPick = useCallback(key => choice => {
    onUpdateSection(prevData => ({
      ...prevData,
      sel: { ...(prevData.sel || {}), [key]: choice }
    }));
  }, [onUpdateSection]);

  const getNote = k => (notes || {})[k] || { plan:'', comment:'', open:false };
  const setNote = useCallback((k, patch) => {
    onUpdateSection(prevData => {
      const currentNotes = prevData.notes || {};
      const newNotes = { ...currentNotes, [k]: { ...(currentNotes[k] || {}), ...patch } };
      return { ...prevData, notes: newNotes };
    });
  }, [onUpdateSection]);

  const toggleOpen = useCallback(k => setNote(k, { open: !getNote(k).open }), [setNote, getNote]);
  
  const addExtra = useCallback(type => {
    const newExtra = { id:`x${Date.now()}`, type, item:null, wastePct:5, inputs:{} };
    onUpdateSection(prevData => ({
      ...prevData,
      extras: [...(prevData.extras || []), newExtra]
    }));
  }, [onUpdateSection]);

  const removeExtra = useCallback(id => {
    onUpdateSection(prevData => ({
      ...prevData,
      extras: (prevData.extras || []).filter(r => r.id !== id)
    }));
  }, [onUpdateSection]);

  const updateExtra = useCallback((id, patch) => {
    onUpdateSection(prevData => ({
      ...prevData,
      extras: (prevData.extras || []).map(r => r.id === id ? { ...r, ...patch } : r)
    }));
  }, [onUpdateSection]);

  const commitLengthLF = useCallback(() => {
    const newValue = Number(inputValueLF) || 0; 
    updateField('lengthLF', newValue);
  }, [inputValueLF, updateField]); 

  const handleKeyDownLF = useCallback((e) => {
    if (e.key === 'Enter') {
      commitLengthLF();
      e.target.blur(); 
    }
  }, [commitLengthLF]);
  
  // --- (Calculation logic) ---
  const bottomLen = parseBoardLengthFt(getSize(sel.bottomPlate)) ?? 0;
  const bottomBoardLenFt = Number.isFinite(bottomLen) ? bottomLen : 0;
  const topLen    = parseBoardLengthFt(getSize(sel.topPlate))    ?? 12;
  const blockLen  = parseBoardLengthFt(getSize(sel.blocking))    ?? 12;
  const showBlocking  = kind === 'bearing';
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
  }, [ sel, waste, showBlocking, showSheathing, lengthLF, heightFt, studSpacingIn, studMultiplier, bottomLen, topLen, blockLen ]);

  const rowByKey = useMemo(() => Object.fromEntries((baseRows || []).map(r => [r.key, r])), [baseRows]);
  
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

  // **THIS IS THE FIX for the infinite loop**
  useEffect(() => {
    const headerLF = (extras || []).filter(r => r.type === 'Header' && isInfillFamily(getFamily(r.item))).reduce((s, r) => s + Number(r.inputs.headerLF || 0), 0);
    const infillItem = (extras || []).find(r => r.type === 'Headers infill'); // <-- Find the actual item
    
    if (headerLF > 0 && !infillItem) { // <-- Check using the item
      addExtra('Headers infill');
    }
    if (headerLF === 0 && infillItem) { // <-- Check using the item
      removeExtra(infillItem.id); // <--- Pass the correct ID
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
      return r;
    });
  }, [extras, heightFt, lengthLF]);
  
  const groupSubtotal = useMemo(() => {
    const b = baseRows.reduce((s,r)=> s + (r.subtotal||0), 0);
    const x = computedExtras.reduce((s,r)=> s + (r.subtotal||0), 0);
    return b + x;
  }, [baseRows, computedExtras]);

  const lastSentSigRef = useRef('');
  useEffect(() => {
    const currentStats = {
      kind, wallKind, lengthLF,
      platePieces: Math.ceil(platePieces),
      bottomPlatePiecesPanel: Math.ceil(rowByKey.bottomPlate?.qtyFinal || 0),
      ptLF, groupSubtotal,
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
        
        onUpdateSection(prevData => ({
          ...prevData,
          ...currentStats
        }));
    }
  }, [ 
      onUpdateSection,
      kind, wallKind, panelPtBoards, panelSheets, 
      lengthLF, platePieces, rowByKey.bottomPlate?.qtyFinal, 
      ptLF, groupSubtotal, bottomBoardLenFt
  ]);

  /* ────────────────────────────────────────────────────────────────────────
     Render
     ──────────────────────────────────────────────────────────────────────── */
  const gridCols = 'minmax(180px,1.1fr) 3.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr 1.6fr 0.8fr';

  return (
    <div className="ew-card">
      <AccordionSection
        title={title}
        defaultOpen={true}
        summary={<div style={{ textAlign:'right', fontWeight: 700, color: '#f18d5b' }}>Subtotal: {fmt(groupSubtotal)}</div>}
        actions={onRemove ? <RemoveButton onClick={onRemove} title="Remove section" label="Remove section" /> : null}
      >            
          {/* Inputs are wired to stable handlers */}
          <div className="controls4" style={{ marginBottom: 8 }}>
            <label>
              <span className="ew-subtle">Length (LF)</span>
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={inputValueLF}
                onChange={e => setInputValueLF(e.target.value)}
                onKeyDown={handleKeyDownLF}
                onBlur={commitLengthLF}
              />
            </label>
            <label>
              <span className="ew-subtle">Height (ft)</span>
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={heightFt}
                onChange={e => updateField('heightFt', Number(e.target.value))}
              />
            </label>
            <label>
              <span className="ew-subtle">Stud spacing (in)</span>
              <input
                className="ew-input focus-anim" type="number" inputMode="decimal"
                value={studSpacingIn}
                onChange={e => updateField('studSpacingIn', Number(e.target.value))}
              />
            </label>
            <label>
              <span className="ew-subtle">Studs per location</span>
              <select
                className="ew-select focus-anim"
                value={studMultiplier}
                onChange={e => updateField('studMultiplier', Number(e.target.value))}
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
                value={kind}
                onChange={e => updateField('kind', e.target.value)}
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
            <div>Notes</div>
            <div></div>
          </div>

          <div className="ew-rows">
            {baseRows.map(row => {
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
                          row.key==='sheathing' ? 'CDX SE' :
                          row.key==='bottomPlate' ? bottomDefaultFamily : 'SPF#2'
                        }
                        defaultSizeLabel={
                          row.key === 'sheathing' ? `4x8'-1/2"` :
                          (row.key === 'bottomPlate' || row.key === 'topPlate' || row.key === 'blocking') ? `2x6"-8'` :
                          row.key === 'studs' ? `2x6"-10'` :
                          undefined
                        }
                        preferredSeries={row.key === 'sheathing' ? undefined : '2x6'}
                      />
                    </div>
                    <div className="ew-right">{Math.ceil(row.qtyRaw)}</div>
                    <div className="ew-right">
                      <input
                        className="ew-input focus-anim"
                        type="number" inputMode="decimal"
                        value={row.wastePct}
                        onChange={e=> setWaste(row.key, e.target.value)}
                        style={{ width:80, padding:6, textAlign:'right' }}
                      />
                    </div>
                    <div className="ew-right">{row.qtyFinal}</div>
                    <div className="ew-right">{row.unit}</div>
                    <div className="ew-right ew-money">{row.unitPrice ? fmt(row.unitPrice) : '—'}</div>
                    <div className="ew-right ew-money">{row.subtotal ? fmt(row.subtotal) : '—'}</div>
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
                          <input
                            className="ew-input focus-anim" type="text"
                            placeholder="e.g., A2.4 / S5 – Detail 03"
                            value={getNote(noteKey).plan}
                            onChange={e=>setNote(noteKey, { plan: e.target.value })}
                          />
                        </label>
                        <label>
                          <span className="ew-subtle">Comment</span>
                          <textarea
                            className="ew-input focus-anim" rows={3}
                            placeholder="Add any notes for this item…"
                            value={getNote(noteKey).comment}
                            onChange={e=>setNote(noteKey, { comment: e.target.value })}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>

          <h3 className="ew-h3" style={{ marginTop: 12, marginBottom: 6 }}>Extras</h3>

          <div className="ew-rows">
            {computedExtras.map(ex => {
              const noteKey = `extra:${ex.id}`;
              const n = getNote(noteKey);
              return (
                <Fragment key={ex.id}>
                  <div className="ew-grid ew-row" style={{ '--cols': gridCols }}>
                    <div>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
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
                        onSelect={item => updateExtra(ex.id, { item })}
                        value={ex.item}
                        defaultVendor="Gillies & Prittie Warehouse"
                        defaultFamilyLabel={
                          (ex.type === 'Headers infill' || ex.type === 'Extra sheathing')
                          ? 'CDX SE' 
                          : 'SPF#2'
                        }
                        defaultSizeLabel={
                          (ex.type === 'Headers infill' || ex.type === 'Extra sheathing') ? `4x8'-1/2"` :
                          (ex.type === 'Header' || ex.type === 'Post' || ex.type === 'Extra blocking') ? `2x6"-10'` :
                          undefined
                        }
                      />
                      {ex.type==='Header' && ( 
                        isLVL(getFamily(ex.item)) ? (
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
                        )
                      )}
                      {ex.type==='Post' && ( 
                        (isLVL(getFamily(ex.item)) || isVersaColumn(getFamily(ex.item))) ? (
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
                        ) : null
                      )}
                      {ex.type==='Headers infill' && ( 
                        <div className="ew-hint" style={{ marginTop:6 }}>
                          QTY = Σ Header LF ÷ 3 ÷ 32 × 2 (then waste)
                        </div>
                      )}
                      {ex.type==='Extra sheathing' && ( 
                        <div className='ew-hint' style={{marginTop:6}}>
                          Same math as regular sheathing (length × height ÷ 32), then waste.
                        </div>
                      )}
                      {ex.type==='Extra blocking' && ( 
                        <div className="ew-inline" style={{ marginTop:6, alignItems:'end', gap:12 }}>
                          <label style={{ minWidth:140 }}><span className="ew-subtle">Rows (#)</span>
                            <input
                              className="ew-input focus-anim" type="number" min={1} step={1}
                              value={ex.inputs?.rows || 1}
                              onChange={e => updateExtra(ex.id, {
                                inputs: { ...(ex.inputs || {}), rows: Math.max(1, Number(e.target.value || 1)) }
                              })}
                            />
                          </label>
                          <div className="ew-hint">
                            Same math as plates × rows (then waste). Board length from size: {ex.boardLenFt || parseBoardLengthFt(getSize(ex.item)) || '—'} ft
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="ew-right">{Math.ceil(ex.qtyRaw ?? 0)}</div>
                    <div className="ew-right">
                      <input
                        className="ew-input focus-anim"
                        type="number" inputMode="decimal"
                        value={ex.wastePct ?? 0}
                        onChange={e => updateExtra(ex.id, { wastePct: Number(e.target.value) })}
                        style={{ width: 80, textAlign: 'right' }}
                      />
                    </div>
                    <div className="ew-right">{ex.qtyFinal ?? '—'}</div>
                    <div className="ew-right">{ex.unit}</div>
                    <div className="ew-right ew-money">{ex.unitPrice ? fmt(ex.unitPrice) : '—'}</div>
                    <div className="ew-right ew-money">{ex.subtotal ? fmt(ex.subtotal) : '—'}</div>
                    <div>
                      <div className="ew-subtle" style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
                        <span className="ew-chip" title={n.plan || ''}>{n.plan || '—'}</span>
                        <button className="ew-btn" style={{ padding:'4px 8px' }} onClick={() => toggleOpen(noteKey)}>
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
                          <input
                            className="ew-input focus-anim"
                            type="text"
                            value={getNote(noteKey).plan}
                            onChange={e => setNote(noteKey, { plan: e.target.value })}
                          />
                        </label>
                        <label>
                          <span className="ew-subtle">Comment</span>
                          <textarea
                            className="ew-input focus-anim"
                            rows={3}
                            value={getNote(noteKey).comment}
                            onChange={e => setNote(noteKey, { comment: e.target.value })}
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
            <button className="ew-btn" onClick={() => addExtra('Header')}>
              <img
                  src={"/icons/plus-sign.png"}
                  width={12}
                  height={12}
                  alt="Add"
                  style={{
                    display: "inline-block",
                    verticalAlign: "middle",
                    marginRight: '6px'
                  }}
                />
              Header
            </button>
            <button className="ew-btn" onClick={() => addExtra('Post')}>
              <img
                  src={"/icons/plus-sign.png"}
                  width={12}
                  height={12}
                  alt="Add"
                  style={{
                    display: "inline-block",
                    verticalAlign: "middle",
                    marginRight: '6px'
                  }}
                />
              Post
            </button>
            <button className='ew-btn' onClick={() => addExtra('Extra blocking')}>
              <img
                  src={"/icons/plus-sign.png"}
                  width={12}
                  height={12}
                  alt="Add"
                  style={{
                    display: "inline-block",
                    verticalAlign: "middle",
                    marginRight: '6px'
                  }}
                />
              Blocking
            </button>
            {showSheathing && (
              <button className='ew-btn' onClick={ () => addExtra('Extra sheathing')}>
                <img
                    src={"/icons/plus-sign.png"}
                    width={12}
                    height={12}
                    alt="Add"
                    style={{
                      display: "inline-block",
                      verticalAlign: "middle",
                      marginRight: '6px'
                    }}
                  />
                Extra Sheathing
              </button>
            )}
            <div className="ew-right" style={{ marginLeft: 'auto', color: '#f18d5b'}}>
              Group subtotal: {fmt(groupSubtotal)}
            </div>
          </div>
      </AccordionSection>
    </div>      
  );
}