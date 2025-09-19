// src/components/InteriorWallGroup.jsx
'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import ItemPicker from '@/components/ItemPicker';
import { useLocalStorageJson } from '@/hooks/useLocalStorageJson';

/* ──────────────────────────────────────────────────────────────────────────
   Helpers (mirrors exterior group)
   ────────────────────────────────────────────────────────────────────────── */

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmt = n => (Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : '—');

/** Parse trailing feet at end of size labels like `2x6"-16'` → 16 */
function parseBoardLengthFt(sizeLabel) {
  const s = String(sizeLabel || '').trim();
  let num = '';
  for (let i = s.length - 1; i >= 0; i--) {
    const ch = s[i];
    if (ch >= '0' && ch <= '9') { num = ch + num; continue; }
    if (num) break;
  }
  return num ? Number(num) : null;
}

/** Unit price resolver that tolerates both compact/raw items */
function unitPriceFrom(item) {
  if (!item) return 0;
  const supplier = item.supplierPrice ?? item.raw?.basePrice ?? item.raw?.supplierPrice ?? null;
  const markup   = item.markupPct     ?? item.raw?.markupPct     ?? null;
  if (supplier != null && markup != null) return Number(supplier) * (1 + Number(markup)/100);
  const peg = item.priceWithMarkup ?? item.raw?.priceWithMarkup ?? null;
  return Number(peg || 0);
}

/** Comment preview (first N words with ellipsis) */
const wordsPreview = (s = '', maxWords = 8) => {
  const parts = String(s).trim().split(/\s+/);
  const preview = parts.slice(0, maxWords).join(' ');
  return parts.length > maxWords ? `${preview}…` : preview || '';
};

const norm = (s='') => String(s).toLowerCase().replace(/[^a-z0-9# ]+/g,'').trim();
const isSPF_PT_SYP = f => {
  const x = norm(f);
  return x.includes('spf#2') || x.includes('spf2') ||
         x.includes('syp#2') || x.includes('syp2') || x.includes('spy#2') || x.includes('spy2') ||
         x === 'pt' || x.includes('treated');
};
const isLVL = f => norm(f).includes('lvl');
const isVersaColumn = f => norm(f).includes('versa');
const isLumberFamily = f =>
  isSPF_PT_SYP(f) || norm(f).includes('frt') || norm(f).includes('douglas fir') ||
  norm(f).includes('hem fir') || norm(f).includes('hemfir');

const isInfillFamily = f => {
  const x = norm(f);
  return (
    x.includes('spf#2') || x.includes('spf2') ||
    x === 'pt' || x.includes('treated') ||
    x.includes('hem fir') || x.includes('hemfir') ||
    x.includes('syp#2') || x.includes('syp2') ||
    x.includes('syp#1') || x.includes('syp1') ||
    x.includes('frt')
  );
};

const platesRaw   = (lengthLF, boardLenFT) => Number(lengthLF||0)/Math.max(1, Number(boardLenFT||0));
const studsRaw    = (lengthLF, spacingIn=16, studMult=1) => {
  const studsAlong = Math.floor((Number(lengthLF||0)*12)/Math.max(1,Number(spacingIn||16))) + 1; // include end stud
  return studsAlong * Math.max(1, Number(studMult||1));
};
const blockingRaw = (lengthLF, heightFt, boardLenFT) => {
  const rows = Math.floor(Number((heightFt||0)/4)); // every 4 ft
  const perRow = Number(lengthLF||0)/Math.max(1,Number(boardLenFT||0));
  return perRow * rows;
};
const sheathingRaw= (lengthLF, heightFt) => (Number(lengthLF||0)*Number(heightFt||0))/32;
const applyWaste  = (qty, wastePct) => Math.ceil(Number(qty||0) * (1 + Number(wastePct||0)/100));

const deref = x => (x && x.item ? deref(x.item) : x);
const getItem   = selLike => deref(selLike);
const getUnit   = selLike => deref(selLike)?.unit || deref(selLike)?.raw?.unit || 'pcs';
const getSize   = selLike => deref(selLike)?.sizeDisplay || deref(selLike)?.sizeLabel || deref(selLike)?.raw?.sizeDisplay || '';
const getFamily = selLike => deref(selLike)?.raw?.familyDisplay || deref(selLike)?.familyDisplay || deref(selLike)?.raw?.family || selLike?.familyLabel || '';

/* ──────────────────────────────────────────────────────────────────────────
   Component
   ────────────────────────────────────────────────────────────────────────── */

export default function InteriorWallGroup({ 
  title = 'Interior walls', 
  onRemove, 
  persistKey = 'interior-0',
}) {
  /* Interior toggles */
  const [series, setSeries] = useState('2x6');          // 2x4 | 2x6 | 2x8 | 2x10
  const [kind, setKind]     = useState('partition');    // partition | bearing | shear | standard

  /* Shared inputs */
  const [lengthLF, setLengthLF]         = useState(0);
  const [heightFt, setHeightFt]         = useState(12);
  const [studSpacingIn, setStudSpacingIn] = useState(16);
  const [studMultiplier, setStudMultiplier] = useState(1);

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
  const bottomLen = parseBoardLengthFt(getSize(sel.bottomPlate)) ?? 12;
  const topLen    = parseBoardLengthFt(getSize(sel.topPlate))    ?? 12;
  const blockLen  = parseBoardLengthFt(getSize(sel.blocking))    ?? 12;

  /* Visibility */
  const showBlocking  = kind === 'bearing';
  const showSheathing = kind === 'shear';

  /* Build base rows (keeps your quantities/pricing logic) */
  const baseRows = useMemo(() => {
    const defs = [
      { key:'bottomPlate', label:`Bottom plate (${series})`, unit:getUnit(sel.bottomPlate), qtyRaw:platesRaw(lengthLF, bottomLen), item:getItem(sel.bottomPlate) },
      { key:'topPlate',    label:`Top plate (${series})`,    unit:getUnit(sel.topPlate),    qtyRaw:platesRaw(lengthLF, topLen),    item:getItem(sel.topPlate) },
      { key:'studs',       label:`Studs (${series})`,        unit:getUnit(sel.studs),       qtyRaw:studsRaw(lengthLF, studSpacingIn, studMultiplier), item:getItem(sel.studs) },
      ...(showBlocking  ? [{ key:'blocking',  label:`Blocking (${series})`, unit:getUnit(sel.blocking),  qtyRaw:blockingRaw(lengthLF, heightFt, blockLen), item:getItem(sel.blocking) }] : []),
      ...(showSheathing ? [{ key:'sheathing', label:'Sheathing (4x8)',       unit:getUnit(sel.sheathing) || 'sheet', qtyRaw:sheathingRaw(lengthLF, heightFt), item:getItem(sel.sheathing) }] : []),
    ];
    return defs.map(d => {
      const wastePct = Number(waste[d.key] ?? 0);
      const qtyFinal = applyWaste(d.qtyRaw, wastePct);
      const unitPrice = unitPriceFrom(d.item);
      const subtotal = Number(unitPrice * qtyFinal) || 0;
      return { ...d, wastePct, qtyFinal, unitPrice, subtotal, qtyRaw: d.qtyRaw };
    });
  }, [series, kind, sel, waste, lengthLF, heightFt, studSpacingIn, studMultiplier, bottomLen, topLen, blockLen, showBlocking, showSheathing]);

  /* Extras (kept as-is, just rendered in ew-rows with Notes like exterior) */
  const [extras, setExtras] = useState([]);
  const seq = useRef(1);
  const addExtra    = type => setExtras(prev => ([...prev, { id:`x${seq.current++}`, type, item:null, wastePct:5, inputs:{} }]));
  const removeExtra = id   => setExtras(prev => prev.filter(r=>r.id!==id));
  const updateExtra = (id, patch) => setExtras(prev => prev.map(r => r.id===id ? { ...r, ...patch } : r));

  // Auto-add/remove "Headers infill" row based on pool
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
    const headerLFPool = extras
      .filter(r => r.type==='Header' && isInfillFamily(getFamily(r)))
      .reduce((s,r) => s + Number(r.inputs.headerLF || 0), 0);

    return extras.map(r => {
      const fam = getFamily(r);
      const sizeLabel = getSize(r);
      const boardLenFt = parseBoardLengthFt(sizeLabel) ?? 0;

      let qtyRaw = 0;
      let unit = getUnit(r) || 'pcs';

      if (r.type==='Header') {
        if (isLVL(fam)) {
          const lf = Number(r.inputs.lvlLength || 0);
          const pcs = Number(r.inputs.lvlPieces || 0);
          qtyRaw = lf * pcs; // LF
          unit = 'lf';
        } else {
          const lf = Number(r.inputs.headerLF || 0);
          qtyRaw = boardLenFt ? (lf / boardLenFt) : 0; // pcs
          unit = 'pcs';
        }
      }

      if (r.type==='Post') {
        if (isLVL(fam) || isVersaColumn(fam)) {
          const pieces = Number(r.inputs.pieces || 0);
          const hft    = Number(r.inputs.heightFt ?? heightFt);
          qtyRaw = pieces * hft; // LF
          unit = 'lf';
        } else if (isLumberFamily(fam)) {
          const ppp = Number(r.inputs.piecesPerPost || 0);
          const posts= Number(r.inputs.numPosts || 0);
          qtyRaw = ppp * posts; // pcs
          unit = 'pcs';
        } else {
          qtyRaw = Number(r.inputs.qty || 0);
        }
      }

      if (r.type === 'Headers infill') {
        qtyRaw = (headerLFPool / 3 / 32) * 2;
        unit = 'sheet';
      }

      const qtyFinal  = applyWaste(qtyRaw, r.wastePct ?? 5);
      const unitPrice = unitPriceFrom(getItem(r));
      const subtotal  = Number(unitPrice * qtyFinal) || 0;

      return { ...r, unit, qtyRaw, qtyFinal, unitPrice, subtotal, boardLenFt };
    });
  }, [extras, heightFt]);

  const groupSubtotal = useMemo(() => {
    const b = baseRows.reduce((s,r)=> s + (r.subtotal||0), 0);
    const x = computedExtras.reduce((s,r)=> s + (r.subtotal||0), 0);
    return b + x;
  }, [baseRows, computedExtras]);

  /* ────────────────────────────────────────────────────────────────────────
     Render
     ──────────────────────────────────────────────────────────────────────── */

  // Columns (added Notes after Subtotal; last column kept for controls)
  // Item | Selection | Qty | Waste % | Final | Unit | Unit price | Subtotal | Notes | (controls)
  const gridCols =
    'minmax(180px,1.1fr) 3.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr 1.6fr 0.8fr';

  return (
    <div className="ew-card">
      {/* Header + remove (match exterior) */}
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <h2 className="ew-h2" style={{ margin:0 }}>{title}</h2>
        {onRemove && <button className="ew-btn" onClick={onRemove}>Remove section</button>}
      </div>

      {/* Inner wrapper with tokenized border (dark-mode friendly) */}
      <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 12 }}>
        {/* Group controls — row 1 */}
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

        {/* Group controls — row 2 */}
        <div className="controls2" style={{ marginBottom: 12 }}>
          <label>
            <span className="ew-subtle">Series (stud size)</span>
            <select
              className="ew-select focus-anim"
              value={series}
              onChange={e=>setSeries(e.target.value)}
            >
              <option value="2x6">2×6″</option>
              <option value="2x4">2×4″</option>
              <option value="2x8">2×8″</option>
              <option value="2x10">2×10″</option>
            </select>
          </label>
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
                      defaultVendor="gillies_prittie_warehouse"
                      defaultFamily="SPF#2"
                      defaultFamilyLabel="SPF#2"
                      defaultFamilySlug="spf2"
                    />
                  </div>

                  {/* Qty raw (rounded up visually) */}
                  <div className="ew-right">{Math.ceil(row.qtyRaw)}</div>

                  {/* Waste % (per-row) */}
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

                  {/* Notes (chip + toggle + compact preview) */}
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

                  {/* controls column (blank) */}
                  <div></div>
                </div>

                {/* Drawer row (full width) */}
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

        {/* Extras rows (switch to ew-rows for consistent styling) */}
        <div className="ew-rows">
          {computedExtras.map(r => {
            const noteKey = `extra:${r.id}`;
            const n = getNote(noteKey);

            return (
              <Fragment key={r.id}>
                {/* main extras row */}
                <div className="ew-grid ew-row" style={{ '--cols': gridCols }}>
                  {/* Type + remove */}
                  <div>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <span style={{ fontWeight: 600 }}>{r.type}</span>
                      {r.type !== 'Headers infill' && (
                        <button className="ew-btn" onClick={()=>removeExtra(r.id)}>Remove</button>
                      )}
                    </div>
                  </div>

                  {/* ItemPicker + type-specific inputs */}
                  <div>
                    <ItemPicker
                      compact
                      onSelect={item => updateExtra(r.id, { item })}
                      defaultVendor="gillies_prittie_warehouse"
                      defaultFamily="SPF#2"
                      defaultFamilyLabel="SPF#2"
                      defaultFamilySlug="spf2"
                    />

                    {/* Type-specific param inputs (unchanged logic) */}
                    {r.type==='Header' && (
                      isLVL(getFamily(r)) ? (
                        <div className="ew-inline" style={{ marginTop:6 }}>
                          <label>Pieces
                            <input className="ew-input focus-anim" type="number" value={r.inputs.lvlPieces || ''} onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, lvlPieces:Number(e.target.value)} })} />
                          </label>
                          <label>Length (lf)
                            <input className="ew-input focus-anim" type="number" value={r.inputs.lvlLength || ''} onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, lvlLength:Number(e.target.value)} })} />
                          </label>
                        </div>
                      ) : (
                        <div className="ew-inline" style={{ marginTop:6 }}>
                          <label>Total header LF
                            <input className="ew-input focus-anim" type="number" value={r.inputs.headerLF || ''} onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, headerLF:Number(e.target.value)} })} />
                          </label>
                          <div className="ew-hint">Board length from size: {r.boardLenFt || parseBoardLengthFt(getSize(r)) || '—'} ft</div>
                        </div>
                      )
                    )}

                    {r.type==='Post' && (
                      (isLVL(getFamily(r)) || isVersaColumn(getFamily(r))) ? (
                        <div className="ew-inline" style={{ marginTop:6 }}>
                          <label>Pieces
                            <input className="ew-input focus-anim" type="number" value={r.inputs.pieces || ''} onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, pieces:Number(e.target.value)} })} />
                          </label>
                          <label>Height (ft)
                            <input className="ew-input focus-anim" type="number" value={r.inputs.heightFt ?? heightFt} onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, heightFt:Number(e.target.value)} })} />
                          </label>
                        </div>
                      ) : isLumberFamily(getFamily(r)) ? (
                        <div className="ew-inline" style={{ marginTop:6 }}>
                          <label>Pieces per post
                            <input className="ew-input focus-anim" type="number" value={r.inputs.piecesPerPost || ''} onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, piecesPerPost:Number(e.target.value)} })} />
                          </label>
                          <label>Posts (#)
                            <input className="ew-input focus-anim" type="number" value={r.inputs.numPosts || ''} onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, numPosts:Number(e.target.value)} })} />
                          </label>
                        </div>
                      ) : null
                    )}

                    {r.type==='Headers infill' && (
                      <div className="ew-hint" style={{ marginTop:6 }}>
                        QTY = Σ Header LF (SPF#2 / PT / Hem Fir / SYP#2 / SYP#1 / FRT) ÷ 3 ÷ 32 × 2 (then waste)
                      </div>
                    )}
                  </div>

                  {/* Qty raw */}
                  <div className="ew-right">{Math.ceil(r.qtyRaw ?? 0)}</div>

                  {/* Waste % */}
                  <div className="ew-right">
                    <input
                      className="ew-input focus-anim"
                      type="number"
                      inputMode="decimal"
                      value={r.wastePct}
                      onChange={e=>updateExtra(r.id, { wastePct: Number(e.target.value) })}
                      style={{ width:80, textAlign:'right' }}
                    />
                  </div>

                  {/* Final qty */}
                  <div className="ew-right">{r.qtyFinal ?? '—'}</div>

                  {/* Unit */}
                  <div className="ew-right">{r.unit}</div>

                  {/* Unit price */}
                  <div className="ew-right ew-money">{r.unitPrice ? fmt(r.unitPrice) : '—'}</div>

                  {/* Subtotal */}
                  <div className="ew-right ew-money">{r.subtotal ? fmt(r.subtotal) : '—'}</div>

                  {/* Notes cell */}
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

                {/* extras details drawer */}
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

        {/* Footer / actions */}
        <div className="ew-footer">
          <button className="ew-btn" onClick={() => addExtra('Header')}>➕ Header</button>
          <button className="ew-btn" onClick={() => addExtra('Post')}>➕ Post</button>
          <div className="ew-total">Group subtotal: {fmt(groupSubtotal)}</div>
        </div>
      </div>
    </div>
  );
}
