// src/components/ExteriorWallGroup.jsx
'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import ItemPicker from '@/components/ItemPicker';

// ── helpers ──────────────────────────────────────────────────────────────
const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmt = (n) => (Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : '—');

function parseBoardLengthFt(sizeLabel) {
  // extracts trailing feet like 8' 10' 12' 16'
  const s = String(sizeLabel || '').trim();
  let num = '';
  for (let i = s.length - 1; i >= 0; i--) {
    const ch = s[i];
    if (ch >= '0' && ch <= '9') { num = ch + num; continue; }
    if (num) break;
  }
  return num ? Number(num) : null;
}

function unitPriceFrom(item) {
  if (!item) return 0;
  const supplier = item.supplierPrice ?? item.raw?.basePrice ?? item.raw?.supplierPrice ?? null;
  const markup   = item.markupPct ?? item.raw?.markupPct ?? null;
  if (supplier != null && markup != null) return Number(supplier) * (1 + Number(markup) / 100);
  const peg = item.priceWithMarkup ?? item.raw?.priceWithMarkup ?? null;
  return Number(peg || 0);
}

const norm = (s='') => String(s).toLowerCase().replace(/[^a-z0-9# ]+/g,'').trim();
const isSPF_PT_SYP = (f) => {
  const x = norm(f);
  return (
    x.includes('spf#2') || x.includes('spf2') ||
    x.includes('syp#2') || x.includes('syp2') || x.includes('spy#2') || x.includes('spy2') ||
    x === 'pt' || x.includes('treated')
  );
};
const isLVL = (f) => norm(f).includes('lvl');
const isVersaColumn = (f) => norm(f).includes('versa');
const isLumberFamily = (f) =>
  isSPF_PT_SYP(f) || norm(f).includes('frt') || norm(f).includes('douglas fir') ||
  norm(f).includes('hem fir') || norm(f).includes('hemfir');

// Families counted toward Headers infill LF pool
const isInfillFamily = (f) => {
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

// Raw (pre-waste) quantities (ceil after waste)
const platesRaw   = (lengthLF, boardLenFT) => Number(lengthLF||0) / Math.max(1, Number(boardLenFT||0));
const studsRaw    = (lengthLF, spacingIn=16, studMult=1) => {
  const studsAlong = Math.floor((Number(lengthLF||0)*12)/Math.max(1,Number(spacingIn||16))) + 1; // include end stud
  return studsAlong * Math.max(1, Number(studMult||1));
};
const blockingRaw = (lengthLF, heightFt, boardLenFT) => {
  const rows = Math.ceil(Number((heightFt||0)/4)-1);
  const perRow = Number(lengthLF||0)/Math.max(1,Number(boardLenFT||0));
  return perRow * rows;
};
const sheathingRaw= (lengthLF, heightFt) => (Number(lengthLF||0)*Number(heightFt||0))/32;
const applyWaste  = (qty, wastePct) => Math.ceil(Number(qty||0) * (1 + Number(wastePct||0)/100));

// unwrap ItemPicker selection safely
const deref = (x) => (x && x.item ? deref(x.item) : x);
const getItem   = (selLike) => deref(selLike);
const getUnit   = (selLike) => deref(selLike)?.unit || deref(selLike)?.raw?.unit || 'pcs';
const getSize   = (selLike) => deref(selLike)?.sizeDisplay || deref(selLike)?.sizeLabel || deref(selLike)?.raw?.sizeDisplay || '';
const getFamily = (selLike) => deref(selLike)?.raw?.familyDisplay || deref(selLike)?.familyDisplay || deref(selLike)?.raw?.family || selLike?.familyLabel || '';

// ── component ────────────────────────────────────────────────────────────
export default function ExteriorWallGroup({ title = 'Exterior walls — preset', onRemove }) {
  // shared inputs
  const [lengthLF, setLengthLF] = useState(100);
  const [heightFt, setHeightFt] = useState(12);
  const [studSpacingIn, setStudSpacingIn] = useState(16);
  const [studMultiplier, setStudMultiplier] = useState(1);

  // per-row waste defaults (editable per row)
  const [waste, setWaste] = useState({
    bottomPlate: 10, topPlate: 10, studs: 60, blocking: 10, sheathing: 20
  });

  // selections
  const [sel, setSel] = useState({
    bottomPlate:null, topPlate:null, studs:null, blocking:null, sheathing:null
  });
  const setPick = (key) => (choice) => setSel(prev => ({ ...prev, [key]: choice }));

  // board lengths from chosen sizes (fallback 12')
  const bottomLen = parseBoardLengthFt(getSize(sel.bottomPlate)) ?? 12;
  const topLen    = parseBoardLengthFt(getSize(sel.topPlate))    ?? 12;
  const blockLen  = parseBoardLengthFt(getSize(sel.blocking))    ?? 12;

  // base rows with final qty and pricing
  const baseRows = useMemo(() => {
    const defs = [
      { key:'bottomPlate', label:'Bottom plate',   unit: getUnit(sel.bottomPlate), qtyRaw: platesRaw(lengthLF, bottomLen), item: getItem(sel.bottomPlate) },
      { key:'topPlate',    label:'Top plate',      unit: getUnit(sel.topPlate),    qtyRaw: platesRaw(lengthLF, topLen),    item: getItem(sel.topPlate) },
      { key:'studs',       label:'Studs',          unit: getUnit(sel.studs),       qtyRaw: studsRaw(lengthLF, studSpacingIn, studMultiplier), item: getItem(sel.studs) },
      { key:'blocking',    label:'Blocking',       unit: getUnit(sel.blocking),    qtyRaw: blockingRaw(lengthLF, heightFt, blockLen),          item: getItem(sel.blocking) },
      { key:'sheathing',   label:'Sheathing (4x8)',unit: getUnit(sel.sheathing) || 'sheet', qtyRaw: sheathingRaw(lengthLF, heightFt), item: getItem(sel.sheathing) },
    ];
    return defs.map(d => {
      const hasItem   = !!d.item;
      const wastePct  = Number(waste[d.key] ?? 0);
      const qtyFinal  = hasItem ? applyWaste(d.qtyRaw, wastePct) : 0;
      const unitPrice = hasItem ? unitPriceFrom(d.item) : 0;
      const subtotal  = hasItem ? Number(unitPrice * qtyFinal) : 0;
      const qtyRawDisplay = hasItem ? Math.ceil(d.qtyRaw) : 0;
      return { ...d, wastePct, qtyFinal, unitPrice, subtotal, qtyRawDisplay };
    });
  }, [sel, waste, lengthLF, heightFt, studSpacingIn, studMultiplier, bottomLen, topLen, blockLen]);

  // ── Extras: Header, Headers infill (auto), Post ───────────────────────
  // { id, type:'Header'|'Headers infill'|'Post', item, wastePct, inputs:{...} }
  const [extras, setExtras] = useState([]);
  const seq = useRef(1);
  const addExtra = (type) => setExtras(prev => ([...prev, { id:`x${seq.current++}`, type, item:null, wastePct:5, inputs:{} }]));
  const removeExtra = (id) => setExtras(prev => prev.filter(r=>r.id!==id));
  const updateExtra = (id, patch) => setExtras(prev => prev.map(r => r.id===id ? { ...r, ...patch } : r));

  // auto add/remove Headers infill row based on eligible headers LF pool
  useEffect(() => {
    const headerLF = extras
      .filter(r => r.type === 'Header' && isInfillFamily(getFamily(r)))
      .reduce((s, r) => s + Number(r.inputs.headerLF || 0), 0);

    const hasInfill = extras.some(r => r.type === 'Headers infill');

    if (headerLF > 0 && !hasInfill) {
      setExtras(prev => ([...prev, { id: 'infill', type: 'Headers infill', item: null, wastePct: 5, inputs: {} }]));
    } else if (headerLF === 0 && hasInfill) {
      setExtras(prev => prev.filter(r => r.type !== 'Headers infill'));
    }
  }, [extras]);

  // compute extras with qtys & pricing
  const computedExtras = useMemo(() => {
    const headerLFPool = extras
      .filter(r => r.type === 'Header' && isInfillFamily(getFamily(r)))
      .reduce((s,r) => s + Number(r.inputs.headerLF || 0), 0);

    return extras.map(r => {
      const fam = getFamily(r);
      const itm = getItem(r);
      const sizeLabel = getSize(r);
      const boardLenFt = parseBoardLengthFt(sizeLabel) ?? 0;

      let qtyRaw = 0; // pre-waste
      let unit = getUnit(r) || 'pcs';

      if (r.type === 'Header') {
        if (isLVL(fam)) {
          // LVL: Qty (LF) = header length (ft) * pieces
          const lenFt  = Number(r.inputs.headerLenFt || 0);
          const pieces = Number(r.inputs.headerPieces || 0);
          qtyRaw = lenFt * pieces; unit = 'lf';
        } else {
          // Non-LVL: Qty (pcs) = total header LF / board length parsed from Size
          const lf = Number(r.inputs.headerLF || 0);
          qtyRaw = boardLenFt ? (lf / boardLenFt) : 0; unit = 'pcs';
        }
      }

      if (r.type === 'Post') {
        if (isLVL(fam) || isVersaColumn(fam)) {
          const pieces = Number(r.inputs.pieces || 0);
          const hft    = Number(r.inputs.heightFt ?? heightFt);
          qtyRaw = pieces * hft; unit = 'lf';
        } else if (isLumberFamily(fam)) {
          const ppp  = Number(r.inputs.piecesPerPost || 0);
          const posts= Number(r.inputs.numPosts || 0);
          qtyRaw = ppp * posts; unit = 'pcs';
        } else {
          qtyRaw = Number(r.inputs.qty || 0);
        }
      }

      if (r.type === 'Headers infill') {
        // QTY = Σ Header LF (eligible) ÷ 3 ÷ 32 × 2 → sheets
        qtyRaw = (headerLFPool / 3 / 32) * 2;
        unit = 'sheet';
      }

      const hasItem   = !!itm;
      const qtyFinal  = hasItem ? applyWaste(qtyRaw, r.wastePct ?? 5) : 0;
      const unitPrice = hasItem ? unitPriceFrom(itm) : 0;
      const subtotal  = hasItem ? Number(unitPrice * qtyFinal) : 0;
      const qtyRawDisplay = hasItem ? Math.ceil(qtyRaw) : 0;

      return { ...r, unit, qtyRaw, qtyRawDisplay, qtyFinal, unitPrice, subtotal, boardLenFt };
    });
  }, [extras, heightFt]);

  const groupSubtotal = useMemo(() => {
    const b = baseRows.reduce((s,r)=> s + (r.subtotal||0), 0);
    const x = computedExtras.reduce((s,r)=> s + (r.subtotal||0), 0);
    return b + x;
  }, [baseRows, computedExtras]);

  // ── UI ─────────────────────────────────────────────────────────────────
  // Item | Vendor·Family·Size | Qty | Waste % | Final qty | Unit | Unit price | Subtotal | (controls)
  const gridCols = 'minmax(180px,1.1fr) 3.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr 0.8fr';
  const rowS  = { display:'grid', gridTemplateColumns:gridCols, gap:12, alignItems:'center', padding:'8px 12px' };
  const headS = { ...rowS, fontWeight:600, background:'var(--surface-3)', borderRadius:8 };

  return (
    <div className="ew-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 className="ew-h2" style={{ margin: 0 }}>{title}</h2>
        {onRemove && <button className="ew-btn" onClick={onRemove}>Remove section</button>}
      </div>
    <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 12 }}>      

      {/* Shared inputs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, minmax(160px,1fr))', gap:12, marginBottom:12 }}>
        <label>Length (LF)
          <input className="ew-input focus-anim" type="number" inputMode='decimal' value={lengthLF} onChange={e=>setLengthLF(e.target.value)} style={{ width:'100%', padding:6 }} />
        </label>
        <label>Height (ft)
          <input className="ew-input focus-anim" type="number" inputMode='decimal' value={heightFt} onChange={e=>setHeightFt(e.target.value)} style={{ width:'100%', padding:6 }} />
        </label>
        <label>Stud spacing (in)
          <input className="ew-input focus-anim" type="number" inputMode='decimal' value={studSpacingIn} onChange={e=>setStudSpacingIn(e.target.value)} style={{ width:'100%', padding:6 }} />
        </label>
        <label>Studs per location
          
          <select className="ew-select focus-anim" value={studMultiplier} onChange={e=>setStudMultiplier(Number(e.target.value))} style={{ width:'100%', padding:6 }}>
            <option value={1}>Single</option>
            <option value={2}>Double</option>
            <option value={3}>Triple</option>
            <option value={4}>Quad</option>
          </select>
          
        </label>
      </div>

      {/* Header row */}
      <div className="ew-grid ew-head" style={{ '--cols': gridCols }}>
        <div>Item</div>
        <div>Vendor · Family · Size</div>
        <div className='ew-right'>Qty</div>
        <div className='ew-right'>Waste %</div>
        <div className='ew-right'>Final qty</div>
        <div className='ew-right'>Unit</div>
        <div className='ew-right'>Unit price</div>
        <div className='ew-right'>Subtotal</div>
        <div></div>
      </div>

      {/* Base rows */}

      <div className='ew-rows'>
        {baseRows.map(row => (         
            <div key={row.key} className="ew-grid ew-row" style={{ '--cols': gridCols }}>
            <div>{row.label}</div>
            <div><ItemPicker onSelect={setPick(row.key)} 
            compact 
            defaultVendorId="gillies_prittie_warehouse" 
            defaultFamilySlug="spf2" 
            defaultFamilyLabel="SPF#2" 
            />
            
            </div>
            <div className='ew-right focus-anim'>{row.qtyRawDisplay}</div>
            <div className='ew-right'>
              <input className='ew-input focus-anim'
                type="number"
                value={row.wastePct}
                onChange={e=> setWaste(w=> ({ ...w, [row.key]: Number(e.target.value) })) }
                style={{ width:80, padding:6, textAlign:'right' }}
              />
            </div>
            <div className='ew-right focus-anim'>{row.qtyFinal}</div>
            <div className='ew-right focus-anim'>{row.unit}</div>
            <div className='ew-right ew-money focus-anim'>{row.unitPrice ? fmt(row.unitPrice) : '—'}</div>
            <div className='ew-right ew-money focus-anim'>{row.subtotal ? fmt(row.subtotal) : '—'}</div>
            <div></div>
            </div>          
        ))}
      </div>

      {/* Extras */}
      <h3 style={{ marginTop:16 }}>Extras</h3>
      <div style={{ display:'grid', gridTemplateColumns:gridCols, gap:10, alignItems:'start' }}>
        {computedExtras.map(r => (
          <Fragment key={r.id}>
            <div>
              {r.type}
              {r.type !== 'Headers infill' && (
                <div>
                  <button onClick={()=>removeExtra(r.id)} style={{ marginTop:6, padding:'4px 8px' }}>Remove</button>
                </div>
              )}
            </div>

            <div>
              <ItemPicker onSelect={item => updateExtra(r.id, { item })} 
              compact 
              defaultVendorId="gillies_prittie_warehouse" 
              defaultFamilySlug="spf2" 
              defaultFamilyLabel="SPF#2" 
              />

              {/* Header inputs */}
              {r.type==='Header' && (
                isLVL(getFamily(r)) ? (
                  <div style={{ marginTop:6, display:'flex', gap:8 }}>
                    <label style={{ display:'flex', flexDirection:'column' }}>Header length (ft)
                      <input className='ew-input focus-anim'
                        type="number"
                        value={r.inputs.headerLenFt || ''}
                        onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, headerLenFt:Number(e.target.value)} })}
                        
                      />
                    </label>
                    <label style={{ display:'flex', flexDirection:'column' }}>Pieces (#)
                      <input className='ew-input focus-anim'
                        type="number"
                        value={r.inputs.headerPieces || ''}
                        onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, headerPieces:Number(e.target.value)} })}
                      
                      />
                    </label>
                    <div style={{ fontSize:12, color:'#666', alignSelf:'end' }}>
                      Qty (LF) = length × pieces
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop:6, display:'flex', gap:8, alignItems:'end' }}>
                    <label style={{ display:'flex', flexDirection:'column' }}>Total header LF
                      <input className='ew-input focus-anim'
                        type="number"
                        value={r.inputs.headerLF || ''}
                        onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, headerLF:Number(e.target.value)} })}
                        
                      />
                    </label>
                    <div style={{ fontSize:12, color:'#666' }}>
                      Board length from size: {r.boardLenFt || parseBoardLengthFt(getSize(r)) || '—'} ft
                    </div>
                  </div>
                )
              )}

              {/* Post inputs */}
              {r.type==='Post' && (
                (isLVL(getFamily(r)) || isVersaColumn(getFamily(r))) ? (
                  <div style={{ marginTop:6, display:'flex', gap:8 }}>
                    <label style={{ display:'flex', flexDirection:'column' }}>Pieces
                      <input className='ew-input focus-anim'
                        type="number"
                        value={r.inputs.pieces || ''}
                        onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, pieces:Number(e.target.value)} })}
                       
                      />
                    </label>
                    <label style={{ display:'flex', flexDirection:'column' }}>Height (ft)
                      <input className='ew-input focus-anim'
                        type="number"
                        value={r.inputs.heightFt ?? heightFt}
                        onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, heightFt:Number(e.target.value)} })}
                       
                      />
                    </label>
                  </div>
                ) : isLumberFamily(getFamily(r)) ? (
                  <div style={{ marginTop:6, display:'flex', gap:8 }}>
                    <label style={{ display:'flex', flexDirection:'column' }}>Pieces per post
                      <input className='ew-input focus-anim'
                        type="number"
                        value={r.inputs.piecesPerPost || ''}
                        onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, piecesPerPost:Number(e.target.value)} })}
                        
                      />
                    </label>
                    <label style={{ display:'flex', flexDirection:'column' }}>Posts (#)
                      <input className='ew-input focus-anim'
                        type="number"
                        value={r.inputs.numPosts || ''}
                        onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, numPosts:Number(e.target.value)} })}
                        
                      />
                    </label>
                  </div>
                ) : null
              )}

              {r.type==='Headers infill' && (
                <div style={{ marginTop:6, fontSize:12, color:'#666' }}>
                  QTY = Σ Header LF (SPF#2 / PT / Hem Fir / SYP#2 / SYP#1 / FRT) ÷ 3 ÷ 32 × 2 (then waste)
                </div>
              )}
            </div>

            <div style={{textAlign:'right'}}>{Math.ceil(r.qtyRaw ?? 0)}</div>
            <div style={{textAlign:'right'}}>
              <input className='ew-input focus-anim'
                type="number"
                value={r.wastePct}
                onChange={e=>updateExtra(r.id, { wastePct: Number(e.target.value) })}
                style={{ width:80, padding:6, textAlign:'right' }}
              />
            </div>
            <div style={{textAlign:'right'}}>{r.qtyFinal ?? '—'}</div>
            <div style={{textAlign:'right'}}>{r.unit}</div>
            <div style={{textAlign:'right'}}>{r.unitPrice ? fmt(r.unitPrice) : '—'}</div>
            <div style={{textAlign:'right'}}>{r.subtotal ? fmt(r.subtotal) : '—'}</div>
            <div></div>
          </Fragment>
        ))}
      </div>

      {/* Add extra row & total */}
      <div style={{ marginTop:12, display:'flex', gap:8, alignItems:'center' }}>
        <button onClick={()=>addExtra('Header')} style={{ padding:'8px 12px' }}>➕ Header</button>
        <button onClick={()=>addExtra('Post')} style={{ padding:'8px 12px' }}>➕ Post</button>
        <div style={{ marginLeft:'auto', fontWeight:700 }}>
          Group subtotal: {fmt(groupSubtotal)}
        </div>
      </div>
    </div>
    </div>
  );
}
