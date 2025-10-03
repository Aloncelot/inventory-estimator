// src/components/InteriorWallGroup.jsx
'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import ItemPicker from '@/components/ItemPicker';
import { useLocalStorageJson } from '@/hooks/useLocalStorageJson';

// Shared calculators & helpers
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

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmt = n => (Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : '—');

/** Comment preview (first N words with ellipsis) */
const wordsPreview = (s = '', maxWords = 8) => {
  const parts = String(s).trim().split(/\s+/);
  const preview = parts.slice(0, maxWords).join(' ');
  return parts.length > maxWords ? `${preview}…` : preview || '';
};

const deref = x => (x && x.item ? deref(x.item) : x);
const getItem   = selLike => deref(selLike);
const getUnit   = selLike => deref(selLike)?.unit || deref(selLike)?.raw?.unit || 'pcs';
const getSize   = selLike => deref(selLike)?.sizeDisplay || deref(selLike)?.sizeLabel || deref(selLike)?.raw?.sizeDisplay || '';
const getFamily = selLike => deref(selLike)?.raw?.familyDisplay || deref(selLike)?.familyDisplay || deref(selLike)?.raw?.family || selLike?.familyLabel || '';

/* ──────────────────────────────────────────────────────────────────────────
   Component
   ────────────────────────────────────────────────────────────────────────── */

export default function InteriorWallGroup({
  onStatsChange,
  title = 'Interior walls',
  onRemove,
  persistKey = 'interior-0',
  bottomDefaultFamily = 'SPF#2'
}) {
  /* Interior toggles */  
  const [kind, setKind]     = useState('partition');    // partition | bearing | shear | standard

  /* Shared inputs */
  const [lengthLF, setLengthLF]             = useState(0);
  const [heightFt, setHeightFt]             = useState(12);
  const [studSpacingIn, setStudSpacingIn]   = useState(16);
  const [studMultiplier, setStudMultiplier] = useState(1);

  /* Collapsed/expanded (mirror exterior) */
  const [collapsed, setCollapsed] = useState(false);

  /* Per-row waste defaults (editable per row) */
  const [waste, setWaste] = useState({
    bottomPlate: 10, topPlate: 10, studs: 60, blocking: 10, sheathing: 20
  });

  /* Selections */
  const [sel, setSel] = useState({
    bottomPlate:null, topPlate:null, studs:null, blocking:null, sheathing:null
  });
  const setPick = key => choice => setSel(prev => ({ ...prev, [key]: choice }));

  /* Notes per row: { [rowKey]: { plan, comment, open } } */
  const [notes, setNotes] = useLocalStorageJson(`inv:v1:notes:${persistKey}`, {});
  const getNote = k => notes[k] || { plan:'', comment:'', open:false };
  const setNote = (k, patch) => setNotes(prev => ({ ...prev, [k]: { ...getNote(k), ...patch }}));
  const toggleOpen = k => setNote(k, { open: !getNote(k).open });

  /* Board lengths */
  const bottomLen = parseBoardLengthFt(getSize(sel.bottomPlate)) ?? 0;
  const bottomBoardLenFt = Number.isFinite(bottomLen) ? bottomLen : 0;
  const topLen    = parseBoardLengthFt(getSize(sel.topPlate))    ?? 12;
  const blockLen  = parseBoardLengthFt(getSize(sel.blocking))    ?? 12;

  /* Visibility (interior-specific) */
  const showBlocking  = kind === 'bearing';
  const showSheathing = kind === 'shear';

  /* Base rows */
  const baseRows = useMemo(() => {
    const rows = [];

    // Bottom plate
    {
      const res = calcPlates({
        lengthLF,
        boardLenFt: bottomLen,
        wastePct: waste.bottomPlate ?? 0,
        item: getItem(sel.bottomPlate),
        unit: getUnit(sel.bottomPlate),
      });
      rows.push({
        key: 'bottomPlate',
        label: `Bottom plate`,
        item: getItem(sel.bottomPlate),
        unit: res.unit,
        qtyRaw: res.qtyRaw,
        qtyFinal: res.qtyFinal,
        unitPrice: res.unitPrice,
        subtotal: res.subtotal,
        wastePct: waste.bottomPlate ?? 0,
        boardLenFt: res.boardLenFt,
      });
    }

    // Top plate
    {
      const res = calcPlates({
        lengthLF,
        boardLenFt: topLen,
        wastePct: waste.topPlate ?? 0,
        item: getItem(sel.topPlate),
        unit: getUnit(sel.topPlate),
      });
      rows.push({
        key: 'topPlate',
        label: `Top plate`,
        item: getItem(sel.topPlate),
        unit: res.unit,
        qtyRaw: res.qtyRaw,
        qtyFinal: res.qtyFinal,
        unitPrice: res.unitPrice,
        subtotal: res.subtotal,
        wastePct: waste.topPlate ?? 0,
      });
    }

    // Studs
    {
      const res = calcStuds({
        lengthLF,
        spacingIn: studSpacingIn,
        multiplier: studMultiplier,
        wastePct: waste.studs ?? 0,
        item: getItem(sel.studs),
        unit: getUnit(sel.studs),
      });
      rows.push({
        key: 'studs',
        label: `Studs`,
        item: getItem(sel.studs),
        unit: res.unit,
        qtyRaw: res.qtyRaw,
        qtyFinal: res.qtyFinal,
        unitPrice: res.unitPrice,
        subtotal: res.subtotal,
        wastePct: waste.studs ?? 0,
      });
    }

    // Blocking (bearing only)
    if (showBlocking) {
      const res = calcBlocking({
        lengthLF,
        heightFt,
        boardLenFt: blockLen,
        wastePct: waste.blocking ?? 0,
        item: getItem(sel.blocking),
        unit: getUnit(sel.blocking),
      });
      rows.push({
        key: 'blocking',
        label: `Blocking`,
        item: getItem(sel.blocking),
        unit: res.unit,
        qtyRaw: res.qtyRaw,
        qtyFinal: res.qtyFinal,
        unitPrice: res.unitPrice,
        subtotal: res.subtotal,
        wastePct: waste.blocking ?? 0,
      });
    }

    // Sheathing (shear only)
    if (showSheathing) {
      const res = calcSheathing({
        lengthLF,
        heightFt,
        wastePct: waste.sheathing ?? 0,
        item: getItem(sel.sheathing),
        unit: getUnit(sel.sheathing) || 'sheet',
      });
      rows.push({
        key: 'sheathing',
        label: 'Sheathing (4x8)',
        item: getItem(sel.sheathing),
        unit: res.unit,
        qtyRaw: res.qtyRaw,
        qtyFinal: res.qtyFinal,
        unitPrice: res.unitPrice,
        subtotal: res.subtotal,
        wastePct: waste.sheathing ?? 0,
      });
    }

    return rows;
  }, [
    sel, waste, showBlocking, showSheathing,
    lengthLF, heightFt, studSpacingIn, studMultiplier,
    bottomLen, topLen, blockLen
  ]);

  /* ── Emit live stats for wrapper/page (for Loose materials auto-aggregation) ── */
  const rowByKey = useMemo(
    () => Object.fromEntries((baseRows || []).map(r => [r.key, r])),
    [baseRows]
  );
  const platePieces =
    (rowByKey.bottomPlate?.qtyFinal ?? 0) +
    (rowByKey.topPlate?.qtyFinal ?? 0);
  const ptLF = Number(lengthLF || 0);
 // Infer interior series from the chosen sizes (studs preferred, else bottom plate)
  const sizeLabel = getSize(sel.studs) || getSize(sel.bottomPlate) || '';
  const is2x6 = /(^|\D)2\s*[x×]\s*6(\D|$)/i.test(sizeLabel);
  const wallKind = is2x6 ? 'int-2x6' : 'int-2x4';


  /* Extras (Header/Post + auto Headers infill) */
  const [extras, setExtras] = useState([]);
  const seq = useRef(1);
  const addExtra    = type => setExtras(prev => ([...prev, { id:`x${seq.current++}`, type, item:null, wastePct:5, inputs:{} }]));
  const removeExtra = id   => setExtras(prev => prev.filter(r=>r.id!==id));
  const updateExtra = (id, patch) => setExtras(prev => prev.map(r => r.id===id ? { ...r, ...patch } : r));

  // Auto-add/remove "Headers infill" based on Σ(Header LF) from qualifying lumber families
  useEffect(() => {
    const headerLF = extras
      .filter(r => r.type==='Header' && isInfillFamily(getFamily(r)))
      .reduce((s,r) => s + Number(r.inputs.headerLF || 0), 0);

    const hasInfill = extras.some(r => r.type==='Headers infill');
    if (headerLF > 0 && !hasInfill) {
      setExtras(prev => ([...prev, { id:'infill', type:'Headers infill', item:null, wastePct:5, inputs:{} }]));
    }
    if (headerLF === 0 && hasInfill) {
      setExtras(prev => prev.filter(r => r.type!=='Headers infill'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(extras.map(r => ({ t:r.type, f:getFamily(r), lf:r.inputs.headerLF||0 })))]);

  const computedExtras = useMemo(() => {
    // Pool for Headers infill (sum of qualifying lumber Header LF)
    const headerLFPool = extras
      .filter(r => r.type === 'Header' && isInfillFamily(getFamily(r)))
      .reduce((s, r) => s + Number(r?.inputs?.headerLF || 0), 0);

    return extras.map(r => {
      const fam = getFamily(r);
      const boardLenFt = parseBoardLengthFt(getSize(r)) ?? 0;

      if (r.type === 'Header') {
        const res = calcHeader({
          isLVL: isLVL(fam),
          headerLF: Number(r?.inputs?.headerLF || 0),
          lvlPieces: Number(r?.inputs?.lvlPieces || 0),
          lvlLength: Number(r?.inputs?.lvlLength || 0),
          boardLenFt,
          wastePct: r.wastePct ?? 5,
          item: getItem(r),
        });
        return { ...r, unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, boardLenFt };
      }

      if (r.type === 'Extra blocking') {
        const rowsCnt = Math.max(1, Number(r?.inputs?.rows || 1));
        const res = calcPlates({
          lengthLF: Number(lengthLF || 0) * rowsCnt,
          boardLenFt,
          wastePct: r.wastePct ?? 10,
          item: getItem(r),
          unit: getUnit(r),
        });
        return {
          ...r,
          unit: res.unit,
          qtyRaw: res.qtyRaw,
          qtyFinal: res.qtyFinal,
          unitPrice: res.unitPrice,
          subtotal: res.subtotal,
          boardLenFt
        };
      }

          if (r.type === 'Extra sheathing') {
            const res = calcSheathing({
              lengthLF,
              heightFt,
              wastePct: r.wastePct ?? 5,
              item: getItem(r),
              unit: getUnit(r) || 'sheet',
            });
            return {
              ...r,
              unit: res.unit,
              qtyRaw: res.qtyRaw,
              qtyFinal: res.qtyFinal,
              unitPrice: res.unitPrice,
              subtotal: res.subtotal,
              boardLenFt: null,
            };
          }

      if (r.type === 'Post') {
        const res = calcPost({
          isLinearLF: isLVL(fam) || isVersaColumn(fam),
          pieces: Number(r?.inputs?.pieces || 0),
          heightFt: Number(r?.inputs?.heightFt ?? heightFt),
          piecesPerPost: Number(r?.inputs?.piecesPerPost || 0),
          numPosts: Number(r?.inputs?.numPosts || 0),
          wastePct: r.wastePct ?? 5,
          item: getItem(r),
        });
        return { ...r, unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, boardLenFt };
      }

      if (r.type === 'Headers infill') {
        const res = calcHeadersInfill({
          headerLFPool,
          wastePct: r.wastePct ?? 5,
          item: getItem(r),
        });
        return { ...r, unit: res.unit, qtyRaw: res.qtyRaw, qtyFinal: res.qtyFinal, unitPrice: res.unitPrice, subtotal: res.subtotal, boardLenFt: null };
      }

      // Unknown extra type — pass through
      return r;
    });
  }, [extras, heightFt, lengthLF]);

  const groupSubtotal = useMemo(() => {
    const b = baseRows.reduce((s,r)=> s + (r.subtotal||0), 0);
    const x = computedExtras.reduce((s,r)=> s + (r.subtotal||0), 0);
    return b + x;
  }, [baseRows, computedExtras]);

    useEffect(() => {
    onStatsChange?.({
      id: persistKey,
      kind: wallKind,
      lengthLF: Number(lengthLF || 0),
      platePieces,
      ptLF: Number(lengthLF||0),
      groupSubtotal,
      isShear: kind === 'shear',
      bottomBoardLenFt: Number(rowByKey.bottomPlate?.boardLenFt ?? bottomLen ?? 0), 
    });
  }, [persistKey, kind, wallKind, lengthLF, platePieces, ptLF, groupSubtotal, bottomLen, rowByKey.bottomPlate?.boardLenFt]);

  /* ────────────────────────────────────────────────────────────────────────
     Render
     ──────────────────────────────────────────────────────────────────────── */

  // Columns (Item | Selection | Qty | Waste % | Final | Unit | Unit price | Subtotal | Notes | (controls))
  const gridCols =
    'minmax(180px,1.1fr) 3.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr 1.6fr 0.8fr';

  return (
    <div className="ew-card">
      {/* Header + collapse + remove (mirror exterior) */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <button
          className="ew-btn"
          onClick={() => setCollapsed(c => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand section' : 'Collapse section'}
          title={collapsed ? 'Expand' : 'Collapse'}
          style={{ padding:'4px 8px', lineHeight:1 }}
        >
          {collapsed ? '▶' : '🔽'}
        </button>

        <h2 className="ew-h2" style={{ margin:0 }}>{title}</h2>
        {onRemove && <button className="ew-btn" onClick={onRemove}>Remove section</button>}
      </div>

      {/* Collapsed summary (stay mounted) */}
      <div
        style={{
          display: collapsed ? 'block' : 'none',
          padding: 12,
          border: '1px solid var(--border)',
          borderRadius: 10,
          marginTop: 8
        }}
        aria-hidden={!collapsed}
      >
        <div style={{ fontWeight: 700, color: '#f18d5b' }}>
          Subtotal: {fmt(groupSubtotal)}
        </div>
      </div>

      {/* Full content (stay mounted) */}
      <div
        style={{
          display: collapsed ? 'none' : 'block',
          padding: 16,
          border: '1px solid var(--border)',
          borderRadius: 12
        }}
        aria-hidden={collapsed}
      >
        <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 12 }}>
          {/* Controls row 1 */}
          <div className="controls4" style={{ marginBottom: 8 }}>
            <label>
              <span className="ew-subtle">Length (LF)</span>
              <input
                className="ew-input focus-anim"
                type="number"
                inputMode="decimal"
                value={lengthLF}
                onChange={e=>setLengthLF(Number(e.target.value))}
              />
            </label>
            <label>
              <span className="ew-subtle">Height (ft)</span>
              <input
                className="ew-input focus-anim"
                type="number"
                inputMode="decimal"
                value={heightFt}
                onChange={e=>setHeightFt(Number(e.target.value))}
              />
            </label>
            <label>
              <span className="ew-subtle">Stud spacing (in)</span>
              <input
                className="ew-input focus-anim"
                type="number"
                inputMode="decimal"
                value={studSpacingIn}
                onChange={e=>setStudSpacingIn(Number(e.target.value))}
              />
            </label>
            <label>
              <span className="ew-subtle">Studs per location</span>
              <select
                className="ew-select focus-anim"
                value={studMultiplier}
                onChange={e=>setStudMultiplier(Number(e.target.value))}
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
                onChange={e=>setKind(e.target.value)}
              >
                <option value="partition">Partition</option>
                <option value="bearing">Bearing (adds blocking)</option>
                <option value="shear">Shear (adds sheathing)</option>
                <option value="standard">Standard</option>
              </select>
            </label>
          </div>

          {/* Header row */}
          <div className="ew-grid ew-head" style={{ '--cols': gridCols }}>
            <div>Item</div>
            <div>Vendor · Family · Size</div>
            <div className="ew-right">Qty</div>
            <div className="ew-right">Waste %</div>
            <div className="ew-right">Final qty</div>
            <div className="ew-right">Unit</div>
            <div className="ew-right">Unit price</div>
            <div className="ew-right">Subtotal</div>
            <div>Notes</div>
            <div></div>
          </div>

          {/* Base rows with Notes + drawer */}
          <div className="ew-rows">
            {baseRows.map(row => {
              const noteKey = `base:${row.key}`;
              const n = getNote(noteKey);

              return (
                <Fragment key={row.key}>
                  <div className="ew-grid ew-row" style={{ '--cols': gridCols }}>
                    {/* Item label */}
                    <div>{row.label}</div>

                    {/* ItemPicker */}
                    <div>
                      <ItemPicker
                        compact
                        onSelect={setPick(row.key)}
                        defaultVendor="Gillies & Prittie Warehouse"
                        defaultFamilyLabel={
                          row.key==='sheathing' ? 'CDX SE' :
                          row.key==='bottomPlate' ? bottomDefaultFamily : 'SPF#2'
                        }
                        defaultSizeLabel={row.key === 'sheathing' ? `4x8'-1/2"` : undefined}
                        preferredSeries={row.key === 'sheathing' ? undefined : '2x6'}
                      />
                    </div>

                    {/* Qty raw (rounded up visually) */}
                    <div className="ew-right">{Math.ceil(row.qtyRaw)}</div>

                    {/* Waste % */}
                    <div className="ew-right">
                      <input
                        className="ew-input focus-anim"
                        type="number"
                        inputMode="decimal"
                        value={row.wastePct}
                        onChange={e=> setWaste(w=> ({ ...w, [row.key]: Number(e.target.value) })) }
                        style={{ width:80, padding:6, textAlign:'right' }}
                      />
                    </div>

                    {/* Final qty */}
                    <div className="ew-right">{row.qtyFinal}</div>

                    {/* Unit */}
                    <div className="ew-right">{row.unit}</div>

                    {/* Unit price */}
                    <div className="ew-right ew-money">{row.unitPrice ? fmt(row.unitPrice) : '—'}</div>

                    {/* Subtotal */}
                    <div className="ew-right ew-money">{row.subtotal ? fmt(row.subtotal) : '—'}</div>

                    {/* Notes (chip + toggle + preview) */}
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

                    {/* controls col (blank) */}
                    <div></div>
                  </div>

                  {/* Drawer row */}
                  {n.open && (
                    <div className="ew-row" style={{ padding:12 }}>
                      <div className="controls2" style={{ width:'100%' }}>
                        <label>
                          <span className="ew-subtle">Plan label</span>
                          <input
                            className="ew-input focus-anim"
                            type="text"
                            placeholder="e.g., A2.4 / S5 – Detail 03"
                            value={getNote(noteKey).plan}
                            onChange={e=>setNote(noteKey, { plan: e.target.value })}
                          />
                        </label>
                        <label>
                          <span className="ew-subtle">Comment</span>
                          <textarea
                            className="ew-input focus-anim"
                            rows={3}
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

          {/* Extras header */}
          <h3 className="ew-h3" style={{ marginTop: 12, marginBottom: 6 }}>Extras</h3>

          {/* Extras rows */}
          <div className="ew-rows">
            {computedExtras.map(ex => {
              const noteKey = `extra:${ex.id}`;

              return (
                <Fragment key={ex.id}>
                  <div className="ew-grid ew-row" style={{ '--cols': gridCols }}>
                    {/* Type + remove */}
                    <div>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <span style={{ fontWeight: 600 }}>{ex.type}</span>
                        {ex.type !== 'Headers infill' && (
                          <button className="ew-btn" onClick={()=>removeExtra(ex.id)}>Remove</button>
                        )}
                      </div>
                    </div>

                    {/* ItemPicker + type-specific inputs */}
                    <div>
                      <ItemPicker
                        compact
                        onSelect={item => updateExtra(ex.id, { item })}
                        defaultVendor="Gillies & Prittie Warehouse"
                        defaultFamilyLabel={
                          (ex.type === 'Headers infill' || ex.type === 'Extra sheathing')
                          ? 'CDX SE' 
                          : 'SPF#2'
                        }
                        defaultSizeLabel={ex.type === 'Extra sheathing' ? `4x8'-1/2"` : undefined}
                      />

                      {/* Header params */}
                      {ex.type==='Header' && (
                        isLVL(getFamily(ex)) ? (
                          <div className="ew-inline" style={{ marginTop:6, alignItems:'end' }}>
                            <label style={{ minWidth:120 }}>
                              <span className="ew-subtle">Pieces</span>
                              <input className="ew-input focus-anim" type="number"
                                value={ex.inputs?.lvlPieces || ''}
                                onChange={e=>updateExtra(ex.id,{ inputs:{...ex.inputs, lvlPieces:Number(e.target.value)} })}
                              />
                            </label>
                            <label style={{ minWidth:140 }}>
                              <span className="ew-subtle">Length (lf)</span>
                              <input className="ew-input focus-anim" type="number"
                                value={ex.inputs?.lvlLength || ''}
                                onChange={e=>updateExtra(ex.id,{ inputs:{...ex.inputs, lvlLength:Number(e.target.value)} })}
                              />
                            </label>
                          </div>
                        ) : (
                          <div className="ew-inline" style={{ marginTop:6, alignItems:'end' }}>
                            <label style={{ minWidth:160 }}>
                              <span className="ew-subtle">Total header LF</span>
                              <input className="ew-input focus-anim" type="number"
                                value={ex.inputs?.headerLF || ''}
                                onChange={e=>updateExtra(ex.id,{ inputs:{...ex.inputs, headerLF:Number(e.target.value)} })}
                              />
                            </label>
                            <div className="ew-hint">Board length from size: {ex.boardLenFt || parseBoardLengthFt(getSize(ex)) || '—'} ft</div>
                          </div>
                        )
                      )}

                      {/* Post params */}
                      {ex.type==='Post' && (
                        (isLVL(getFamily(ex)) || isVersaColumn(getFamily(ex))) ? (
                          <div className="ew-inline" style={{ marginTop:6, alignItems:'end' }}>
                            <label style={{ minWidth:120 }}>
                              <span className="ew-subtle">Pieces</span>
                              <input className="ew-input focus-anim" type="number"
                                value={ex.inputs?.pieces || ''}
                                onChange={e=>updateExtra(ex.id,{ inputs:{...ex.inputs, pieces:Number(e.target.value)} })}
                              />
                            </label>
                            <label style={{ minWidth:140 }}>
                              <span className="ew-subtle">Height (ft)</span>
                              <input className="ew-input focus-anim" type="number"
                                value={ex.inputs?.heightFt ?? heightFt}
                                onChange={e=>updateExtra(ex.id,{ inputs:{...ex.inputs, heightFt:Number(e.target.value)} })}
                              />
                            </label>
                          </div>
                        ) : isLumberFamily(getFamily(ex)) ? (
                          <div className="ew-inline" style={{ marginTop:6, alignItems:'end' }}>
                            <label style={{ minWidth:160 }}>
                              <span className="ew-subtle">Pieces per post</span>
                              <input className="ew-input focus-anim" type="number"
                                value={ex.inputs?.piecesPerPost || ''}
                                onChange={e=>updateExtra(ex.id,{ inputs:{...ex.inputs, piecesPerPost:Number(e.target.value)} })}
                              />
                            </label>
                            <label style={{ minWidth:140 }}>
                              <span className="ew-subtle">Posts (#)</span>
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
                        <div className='ew-hint'
                        style={{marginTop:6}}>
                          Same math as regular sheathing (length × height ÷ 32), then waste.
                          </div>
                      )}
                      {ex.type==='Extra blocking' && (
                        <div className="ew-inline" style={{ marginTop:6, alignItems:'end', gap:12 }}>
                          <label style={{ minWidth:140 }}>
                            <span className="ew-subtle">Rows (#)</span>
                            <input
                              className="ew-input focus-anim"
                              type="number"
                              min={1}
                              step={1}
                              value={ex.inputs?.rows || 1}
                              onChange={e => updateExtra(ex.id, {
                                inputs: { ...(ex.inputs || {}), rows: Math.max(1, Number(e.target.value || 1)) }
                              })}
                            />
                          </label>
                          <div className="ew-hint">
                            Same math as plates × rows (then waste). Board length from size: {ex.boardLenFt || parseBoardLengthFt(getSize(ex)) || '—'} ft
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Qty / waste / unit / price / subtotal */}
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

                    {/* Notes */}
                    <div>
                      <div className="ew-subtle" style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
                        <span className="ew-chip" title={getNote(noteKey).plan || ''}>{getNote(noteKey).plan || '—'}</span>
                        <button className="ew-btn" style={{ padding:'4px 8px' }} onClick={() => toggleOpen(noteKey)}>
                          {getNote(noteKey).open ? 'Hide' : 'Notes'}
                        </button>
                      </div>
                      {getNote(noteKey).comment && (
                        <div className="ew-subtle" title={getNote(noteKey).comment}>{wordsPreview(getNote(noteKey).comment)}</div>
                      )}
                    </div>

                    {/* controls col (blank) */}
                    <div></div>
                  </div>

                  {/* Drawer */}
                  {getNote(noteKey).open && (
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

          {/* Footer / actions */}
          <div className="ew-footer">
            <button className="ew-btn" onClick={() => addExtra('Header')}>➕ Header</button>
            <button className="ew-btn" onClick={() => addExtra('Post')}>➕ Post</button>
            <button className='ew-btn' onClick={() => addExtra('Extra blocking')}>➕ Blocking</button>
            {showSheathing && (
              <button className='ew-btn' onClick={ () => addExtra('Extra sheathing')}>➕ Extra Sheathing</button>
            )}
            <div className="ew-total">Group subtotal: {fmt(groupSubtotal)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
