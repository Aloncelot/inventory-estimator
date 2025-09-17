// src/components/InteriorWallGroup.jsx
'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import ItemPicker from '@/components/ItemPicker';

// ── helpers (same as your exterior group) ────────────────────────────────
const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmt = n => (Number.isFinite(Number(n)) ? moneyFmt.format(Number(n)) : '—');

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

function unitPriceFrom(item) {
  if (!item) return 0;
  const supplier = item.supplierPrice ?? item.raw?.basePrice ?? item.raw?.supplierPrice ?? null;
  const markup   = item.markupPct     ?? item.raw?.markupPct     ?? null;
  if (supplier != null && markup != null) return Number(supplier) * (1 + Number(markup)/100);
  const peg = item.priceWithMarkup ?? item.raw?.priceWithMarkup ?? null;
  return Number(peg || 0);
}

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
  const studsAlong = Math.ceil((Number(lengthLF||0)*12)/Math.max(1,Number(spacingIn||16))) + 1;
  return studsAlong * Math.max(1, Number(studMult||1));
};
const blockingRaw = (lengthLF, heightFt, boardLenFT) => {
  const rows = Math.ceil(Number((heightFt||0)/4)-1);
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

const gridCols = 'minmax(180px,1.1fr) 3.7fr 0.6fr 0.6fr 0.7fr 0.6fr 0.9fr 1fr 0.8fr';

// ── component ────────────────────────────────────────────────────────────
export default function InteriorWallGroup({ title = 'Interior walls', onRemove }) {
  // Interior toggles
  const [series, setSeries] = useState('2x6');          // 2x4 | 2x6 | 2x8 | 2x10
  const [kind, setKind] = useState('partition');        // partition | bearing | shear

  // shared inputs
  const [lengthLF, setLengthLF] = useState(0);
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
  const setPick = key => choice => setSel(prev => ({ ...prev, [key]: choice }));

  // board lengths
  const bottomLen = parseBoardLengthFt(getSize(sel.bottomPlate)) ?? 12;
  const topLen    = parseBoardLengthFt(getSize(sel.topPlate))    ?? 12;
  const blockLen  = parseBoardLengthFt(getSize(sel.blocking))    ?? 12;

  // visibility
  const showBlocking  = kind === 'bearing';
  const showSheathing = kind === 'shear';

  // build rows
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
      return { ...d, wastePct, qtyFinal, unitPrice, subtotal };
    });
  }, [series, kind, sel, waste, lengthLF, heightFt, studSpacingIn, studMultiplier, bottomLen, topLen, blockLen, showBlocking, showSheathing]);

  // Extras (same logic as exterior)
  const [extras, setExtras] = useState([]);
  const seq = useRef(1);
  const addExtra = type => setExtras(prev => ([...prev, { id:`x${seq.current++}`, type, item:null, wastePct:5, inputs:{} }]));
  const removeExtra = id => setExtras(prev => prev.filter(r=>r.id!==id));
  const updateExtra = (id, patch) => setExtras(prev => prev.map(r => r.id===id ? { ...r, ...patch } : r));

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

      const qtyFinal = applyWaste(qtyRaw, r.wastePct ?? 5);
      const unitPrice = unitPriceFrom(getItem(r));
      const subtotal = Number(unitPrice * qtyFinal) || 0;

      return { ...r, unit, qtyRaw, qtyFinal, unitPrice, subtotal, boardLenFt };
    });
  }, [extras, heightFt]);

  const groupSubtotal = useMemo(() => {
    const b = baseRows.reduce((s,r)=> s + (r.subtotal||0), 0);
    const x = computedExtras.reduce((s,r)=> s + (r.subtotal||0), 0);
    return b + x;
  }, [baseRows, computedExtras]);

  // ── UI ─────────────────────────────────────────────────────────────────
  return (
    <div className="ew-card">
      <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 12 }}>  

      {/* Group controls — row 1 */}
      <div className="controls4" style={{ marginBottom: 8 }}>
        <label>Length (LF)
          <input className="ew-input" type="number" value={lengthLF}
            onChange={e=>setLengthLF(Number(e.target.value))}/>
        </label>
        <label>Height (ft)
          <input className="ew-input" type="number" value={heightFt}
            onChange={e=>setHeightFt(Number(e.target.value))}/>
        </label>
        <label>Stud spacing (in)
          <input className="ew-input" type="number" value={studSpacingIn}
            onChange={e=>setStudSpacingIn(Number(e.target.value))}/>
        </label>
        <label>Studs per location
          <select className="ew-select focus-anim" value={studMultiplier}
            onChange={e=>setStudMultiplier(Number(e.target.value))}>
            <option value={1}>Single</option>
            <option value={2}>Double</option>
            <option value={3}>Triple</option>
            <option value={4}>Quad</option>
          </select>
        </label>
        </div>
      </div>

      {/* Group controls — row 2 */}
      <div className="controls2" style={{ marginBottom: 12 }}>
        <label>Series (stud size)
          <select className="ew-select focus-anim" value={series}
            onChange={e=>setSeries(e.target.value)}>
            <option value="2x6">2×6″</option>
            <option value="2x4">2×4″</option>
            <option value="2x8">2×8″</option>
            <option value="2x10">2×10″</option>
          </select>
        </label>
        <label>Wall kind
          <select className="ew-select focus-anim" value={kind}
            onChange={e=>setKind(e.target.value)}>
            <option value="standard">Standard</option>
            <option value="bearing">Bearing (adds blocking)</option>
            <option value="shear">Shear (adds sheathing)</option>
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
        <div></div>
      </div>

      {/* Base rows */}
      <div className="ew-rows">
        {baseRows.map(row => (
          <div key={row.key} className="ew-grid ew-row" style={{ '--cols': gridCols }}>
            <div>{row.label}</div>
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
            <div className="ew-right">{Math.ceil(row.qtyRaw)}</div>
            <div className="ew-right">
              <input
                className="ew-input focus-anim"
                type="number"
                value={row.wastePct}
                onChange={e=> setWaste(w=> ({ ...w, [row.key]: Number(e.target.value) })) }
                style={{ width:80, padding:6, textAlign:'right' }}
              />
            </div>
            <div className="ew-right">{row.qtyFinal}</div>
            <div className="ew-right">{row.unit}</div>
            <div className="ew-right ew-money">{row.unitPrice ? fmt(row.unitPrice) : '—'}</div>
            <div className="ew-right ew-money">{row.subtotal ? fmt(row.subtotal) : '—'}</div>
            <div></div>
          </div>
        ))}
      </div>

      {/* Extras */}
      <h3 className="ew-h3">Extras</h3>
      <div style={{ display:'grid', gridTemplateColumns:gridCols, gap:10, alignItems:'start' }}>
        {computedExtras.map(r => (
          <Fragment key={r.id}>
            <div>
              {r.type}
              {r.type !== 'Headers infill' && (
                <div><button className="ew-btn" onClick={()=>removeExtra(r.id)}>Remove</button></div>
              )}
            </div>
            <div>
              <ItemPicker
                compact
                onSelect={item => updateExtra(r.id, { item })}
                defaultVendor="gillies_prittie_warehouse"
                defaultFamily="SPF#2"
                defaultFamilyLabel="SPF#2"
                defaultFamilySlug="spf2"
              />
              {r.type==='Header' && (
                isLVL(getFamily(r)) ? (
                  <div className="ew-inline">
                    <label>Pieces
                      <input className="ew-input focus-anim" type="number" value={r.inputs.lvlPieces || ''} onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, lvlPieces:Number(e.target.value)} })} />
                    </label>
                    <label>Length (lf)
                      <input className="ew-input focus-anim" type="number" value={r.inputs.lvlLength || ''} onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, lvlLength:Number(e.target.value)} })} />
                    </label>
                  </div>
                ) : (
                  <div className="ew-inline">
                    <label>Total header LF
                      <input className="ew-input focus-anim" type="number" value={r.inputs.headerLF || ''} onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, headerLF:Number(e.target.value)} })} />
                    </label>
                    <div className="ew-hint">Board length from size: {r.boardLenFt || parseBoardLengthFt(getSize(r)) || '—'} ft</div>
                  </div>
                )
              )}
              {r.type==='Post' && (
                (isLVL(getFamily(r)) || isVersaColumn(getFamily(r))) ? (
                  <div className="ew-inline">
                    <label>Pieces
                      <input className="ew-input focus-anim" type="number" value={r.inputs.pieces || ''} onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, pieces:Number(e.target.value)} })} />
                    </label>
                    <label>Height (ft)
                      <input className="ew-input focus-anim" type="number" value={r.inputs.heightFt ?? heightFt} onChange={e=>updateExtra(r.id,{ inputs:{...r.inputs, heightFt:Number(e.target.value)} })} />
                    </label>
                  </div>
                ) : isLumberFamily(getFamily(r)) ? (
                  <div className="ew-inline">
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
                <div className="ew-hint">QTY = Σ Header LF (SPF#2 / PT / Hem Fir / SYP#2 / SYP#1 / FRT) ÷ 3 ÷ 32 × 2 (then waste)</div>
              )}
            </div>
            <div className="ew-right">{Math.ceil(r.qtyRaw ?? 0)}</div>
            <div className="ew-right">
              <input className="ew-input focus-anim" type="number" value={r.wastePct} onChange={e=>updateExtra(r.id, { wastePct: Number(e.target.value) })} style={{ width:80, textAlign:'right' }} />
            </div>
            <div className="ew-right">{r.qtyFinal ?? '—'}</div>
            <div className="ew-right">{r.unit}</div>
            <div className="ew-right">{r.unitPrice ? fmt(r.unitPrice) : '—'}</div>
            <div className="ew-right">{r.subtotal ? fmt(r.subtotal) : '—'}</div>
            <div></div>
          </Fragment>
        ))}
      </div>

      <div className="ew-footer">
        <button className="ew-btn" onClick={() => addExtra('Header')}>➕ Header</button>
        <button className="ew-btn" onClick={() => addExtra('Post')}>➕ Post</button>
        <div className="ew-total">Group subtotal: {fmt(groupSubtotal)}</div>
      </div>
    </div>
    
  );
}
