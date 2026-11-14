// src/components/inventory/OrdersTab.jsx
// Purchase orders. What the reservations are short of, less what is already
// on order, is listed to order: each material from the cheapest supplier in
// the price list (changeable), in that supplier's unit (whole bundles, MBF).
// One order per supplier. Warehouse receives against the order: each line
// becomes a receipt in the movement log, with the price paid.
'use client';

import { useMemo, useState } from 'react';
import { ShoppingCart, Printer, X, ArrowDownToLine, Ban } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm';
import { fmtMoney } from '@/components/ui/mat';
import { createOrders, cancelOrder, recordMovement } from '@/lib/inventory';
import { onOrder, toOrder, cheapestOffer, draftOrders, orderStatus, lineReceipt, orderQty, PO_STATUS_LABEL } from '@/domain/reserve';
import { costPerPiece, priceVariance, isFlagged } from '@/domain/purchase';

const qtyFmt = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
const fmtDay = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const buyText = (l) => (l.buyUnit === 'bundle' ? `${qtyFmt(l.buyQty)} bundle${l.buyQty === 1 ? '' : 's'} of ${l.pcsPerBundle}` : l.buyUnit === 'mbf' ? `${qtyFmt(l.buyQty)} MBF` : `${qtyFmt(l.buyQty)} ${l.unit}`);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** A printable purchase order in a new window. */
function printOrder(po, companyName, whName) {
  const w = window.open('', '_blank');
  if (!w) return;
  const rows = po.lines.map((l) => `<tr><td>${esc(l.family)} · ${esc(l.size)}</td><td>${esc(buyText(l))}</td><td class="n">${qtyFmt(l.pieces)} ${esc(l.unit)}</td><td class="n">${fmtMoney(l.unitPrice)}</td><td class="n">${fmtMoney(l.amount)}</td></tr>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(po.number)} · ${esc(po.vendorName)}</title>
<style>body{font:13px system-ui,sans-serif;margin:32px;color:#222}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}.n{text-align:right}tfoot td{font-weight:700;border:0}.meta{display:flex;gap:40px;margin-top:12px}.meta div span{display:block;color:#777;font-size:11px}</style></head>
<body><h1>Purchase order ${esc(po.number)}</h1><div class="meta"><div><span>From</span>${esc(companyName)}</div><div><span>Supplier</span>${esc(po.vendorName)}</div><div><span>Date</span>${esc(fmtDay(po.createdAt))}</div><div><span>Deliver to</span>${esc(whName(po.warehouseId))}</div></div>
${po.note ? `<p>${esc(po.note)}</p>` : ''}<table><thead><tr><th>Material</th><th>Order</th><th class="n">Pieces</th><th class="n">Price / pc</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td colspan="4" class="n">Estimated total (price list)</td><td class="n">${fmtMoney(po.total)}</td></tr></tfoot></table>
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

function ReceiveForm({ po, cid, user, warehouses, catalog, onDone, onClose }) {
  const [wh, setWh] = useState(po.warehouseId || warehouses[0]?.id || '');
  const [rows, setRows] = useState(() => po.lines.map((l) => {
    const rest = Math.max(0, (Number(l.pieces) || 0) - (Number(l.received) || 0));
    return { pieces: rest || '', total: rest ? Math.round(rest * (Number(l.unitPrice) || 0) * 100) / 100 : '' };
  }));
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const set = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async (e) => {
    e.preventDefault();
    setErr('');
    let done = 0; let flagged = 0;
    try {
      for (let i = 0; i < po.lines.length; i += 1) {
        const l = po.lines[i];
        const pieces = Math.round(Number(rows[i].pieces) || 0);
        if (pieces <= 0) continue;
        setBusy(`Receiving ${l.family} ${l.size}…`);
        const perPiece = costPerPiece(rows[i].total, pieces);
        const variance = priceVariance(perPiece, l.unitPrice);
        if (isFlagged(variance)) flagged += 1;
        const c = catalog.get(l.itemKey) || {};
        await recordMovement(cid, warehouses, { itemKey: l.itemKey, family: l.family, size: l.size, unit: l.unit, materialType: c.materialType || '' }, {
          type: 'in', warehouseId: wh, qty: pieces, unitCost: perPiece ?? '', ref: po.number, note: '',
          purchase: { vendorId: po.vendorId, vendorName: po.vendorName, ...lineReceipt(l, pieces), totalPaid: rows[i].total === '' ? null : Number(rows[i].total), listPrice: l.unitPrice ?? null, variancePct: variance },
          priceReview: isFlagged(variance) ? 'open' : undefined,
          poId: po.id, poLine: i, poNumber: po.number,
        }, user);
        done += 1;
      }
      if (!done) { setErr('Enter the pieces that arrived.'); return; }
      onDone(`${po.number}: ${done} line${done === 1 ? '' : 's'} received${flagged ? `; ${flagged} at a different price, sent to the estimators` : ''}.`);
    } catch (e2) { setErr(`${e2?.message || e2}${done ? ` (${done} lines were saved)` : ''}`); if (done) onDone(''); } finally { setBusy(''); }
  };

  return (
    <form className="ew-card inv-form" onSubmit={save}>
      <div className="inv-form__head">
        <h3>Receive {po.number} · {po.vendorName}</h3>
        <button type="button" className="ew-icon-btn" onClick={onClose} aria-label="Close"><X size={14} /></button>
      </div>
      <label className="fld" style={{ '--w': '220px' }}>
        <span>Into warehouse</span>
        <select className="ew-select" value={wh} onChange={(e) => setWh(e.target.value)}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
      </label>
      <table className="tbl inv-tbl">
        <thead><tr><th>Material</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Arrived now</th><th className="num">Paid for them</th><th className="num">Per piece</th></tr></thead>
        <tbody>
          {po.lines.map((l, i) => {
            const per = costPerPiece(rows[i].total, rows[i].pieces);
            const v = priceVariance(per, l.unitPrice);
            return (
              <tr key={l.itemKey}>
                <td>{l.family} · {l.size}<div className="ew-subtle">{buyText(l)}</div></td>
                <td className="num">{qtyFmt(l.pieces)}</td>
                <td className="num">{qtyFmt(l.received)}</td>
                <td className="num"><input className="ew-input num inv-min" type="number" min="0" step="1" value={rows[i].pieces} onChange={(e) => set(i, { pieces: e.target.value })} aria-label={`Pieces of ${l.family} ${l.size}`} /></td>
                <td className="num"><input className="ew-input num" style={{ width: 100 }} type="number" min="0" step="0.01" value={rows[i].total} onChange={(e) => set(i, { total: e.target.value })} aria-label="Total paid" /></td>
                <td className={`num${isFlagged(v) ? ' pl-up' : ''}`}>{per != null ? fmtMoney(per) : ''}{isFlagged(v) ? <div className="ew-subtle">{v > 0 ? '+' : ''}{v}% vs. list</div> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {err ? <p className="gate-err">{err}</p> : null}
      <div className="inv-form__foot">
        <button type="submit" className="ew-btn ew-btn--primary" disabled={!!busy}>{busy || 'Save receipt'}</button>
        <span className="ew-subtle">Each line becomes a receipt in the movement log, with {po.number} as its reference.</span>
      </div>
    </form>
  );
}

export default function OrdersTab({ cid, user, company, canOrder, canReceive, orders, alloc, catalog, warehouses, whName, stocks = [], onChanged }) {
  const confirm = useConfirm();
  const [picks, setPicks] = useState({});   // itemKey -> { on, vendorId, pieces }
  const [wh, setWh] = useState(warehouses[0]?.id || '');
  const [note, setNote] = useState('');
  const [view, setView] = useState('');
  const [receiving, setReceiving] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  // items with a minimum come back up to it
  const mins = useMemo(() => Object.fromEntries(stocks.filter((x) => Number(x.minQty) > 0).map((x) => [x.itemKey, Number(x.minQty)])), [stocks]);
  const needed = useMemo(() => toOrder(alloc.byItem, onOrder(orders), mins).map((x) => {
    const c = catalog.get(x.itemKey) || { family: x.itemKey, size: '', unit: 'pcs', offers: [] };
    return { ...x, ...c, best: cheapestOffer(c.offers || []) };
  }).sort((a, b) => `${a.family}${a.size}`.localeCompare(`${b.family}${b.size}`, undefined, { numeric: true })), [alloc, orders, catalog, mins]);

  const lineOf = (x) => {
    const p = picks[x.itemKey] || {};
    const offer = (x.offers || []).find((o) => o.vendorId === (p.vendorId ?? x.best?.vendorId)) || x.best;
    const pieces = p.pieces !== undefined && p.pieces !== '' ? Number(p.pieces) : x.toOrder;
    return { on: p.on !== false, offer, pieces };
  };
  const setPick = (k, patch) => setPicks((ps) => ({ ...ps, [k]: { ...(ps[k] || {}), ...patch } }));
  const drafts = useMemo(() => draftOrders(needed.filter((x) => lineOf(x).on).map((x) => ({ ...x, ...lineOf(x) }))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [needed, picks]);

  // which projects the orders are for
  const projectsFor = (keys) => Object.entries(alloc.byProject)
    .filter(([, items]) => keys.some((k) => items[k]?.short > 0)).map(([pid]) => pid);

  const create = async () => {
    if (!drafts.length) return;
    setBusy('Creating purchase orders…'); setErr('');
    try {
      const nums = await createOrders(cid, drafts.map((d) => ({ ...d })), { warehouseId: wh, note, projects: projectsFor(drafts.flatMap((d) => d.lines.map((l) => l.itemKey))) }, user);
      setPicks({}); setNote('');
      onChanged(`Created ${nums.join(', ')}.`);
    } catch (e) { setErr(e?.message || String(e)); } finally { setBusy(''); }
  };
  const cancel = async (po) => {
    if (!(await confirm({ title: `Cancel ${po.number}?`, message: 'Its materials go back to the list to order. Lines already received stay in the inventory.', confirmLabel: 'Cancel order', tone: 'danger' }))) return;
    try { await cancelOrder(cid, po.id, user); onChanged(`${po.number} cancelled.`); } catch (e) { setErr(e?.message || String(e)); }
  };

  const shown = orders.find((o) => o.id === view);
  const receivingPo = orders.find((o) => o.id === receiving);

  return (
    <div className="inv-po">
      {canOrder ? (
        <div className="ew-card inv-log">
          <div className="inv-form__head"><h3>To order</h3></div>
          {!needed.length ? <p className="ew-subtle">Nothing to order: the stock and the open orders cover every reservation and every minimum.</p> : (
            <>
              <p className="ew-subtle">What the reservations are short of, plus what brings the materials with a minimum back up to it, less what is already on order. Each material from the cheapest supplier in the price list, in that supplier&apos;s unit.</p>
              <table className="tbl inv-tbl">
                <thead><tr><th /><th>Material</th><th className="num" title="What the reservations need and the stock cannot cover">Short</th><th className="num" title="Back up to the minimum">Refill</th><th className="num">On order</th><th className="num">Order (pcs)</th><th>Supplier</th><th>Buys as</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {needed.map((x) => {
                    const l = lineOf(x);
                    const q = l.offer ? orderQty(l.pieces, { buyUnit: l.offer.buyUnit, pcsPerBundle: l.offer.pcsPerBundle, size: x.size }) : null;
                    return (
                      <tr key={x.itemKey} className={l.on ? '' : 'sm-out'}>
                        <td><input type="checkbox" checked={l.on} onChange={(e) => setPick(x.itemKey, { on: e.target.checked })} aria-label={`Order ${x.family} ${x.size}`} /></td>
                        <td>{x.family} · {x.size}</td>
                        <td className="num">{x.short ? qtyFmt(x.short) : ''}</td>
                        <td className="num">{x.refill ? qtyFmt(x.refill) : ''}</td>
                        <td className="num">{x.onOrder ? qtyFmt(x.onOrder) : ''}</td>
                        <td className="num"><input className="ew-input num inv-min" type="number" min="0" step="1" value={picks[x.itemKey]?.pieces ?? x.toOrder} onChange={(e) => setPick(x.itemKey, { pieces: e.target.value })} /></td>
                        <td>
                          {(x.offers || []).length ? (
                            <select className="ew-select" value={l.offer?.vendorId || ''} onChange={(e) => setPick(x.itemKey, { vendorId: e.target.value })}>
                              {x.offers.map((o) => <option key={o.vendorId} value={o.vendorId}>{o.vendorName} · {fmtMoney(o.basePrice)}</option>)}
                            </select>
                          ) : <span className="ew-subtle">no supplier in the price list</span>}
                        </td>
                        <td className="ew-subtle">{q ? buyText({ ...l.offer, buyQty: q.buyQty, unit: x.unit }) : ''}</td>
                        <td className="num">{q && l.offer ? fmtMoney(q.pieces * (Number(l.offer.basePrice) || 0)) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="inv-po__make">
                <label className="fld" style={{ '--w': '200px' }}>
                  <span>Deliver to</span>
                  <select className="ew-select" value={wh} onChange={(e) => setWh(e.target.value)}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
                </label>
                <label className="fld" style={{ '--w': '320px' }}>
                  <span>Note for the supplier</span>
                  <input className="ew-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Deliver before 10 am" />
                </label>
                <button type="button" className="ew-btn ew-btn--primary" disabled={!drafts.length || !!busy} onClick={create}>
                  <ShoppingCart size={13} /> {drafts.length ? `Create ${drafts.length} purchase order${drafts.length === 1 ? '' : 's'} · ${fmtMoney(drafts.reduce((a, d) => a + d.total, 0))}` : 'Create purchase orders'}
                </button>
              </div>
              {drafts.length ? <p className="ew-subtle">{drafts.map((d) => `${d.vendorName}: ${d.lines.length} item${d.lines.length === 1 ? '' : 's'}`).join(' · ')}</p> : null}
            </>
          )}
        </div>
      ) : null}
      {busy ? <p className="ew-subtle">{busy}</p> : null}
      {err ? <p className="gate-err">{err}</p> : null}

      {receivingPo ? (
        <ReceiveForm key={receivingPo.id} po={receivingPo} cid={cid} user={user} warehouses={warehouses} catalog={catalog}
          onClose={() => setReceiving('')} onDone={(m) => { setReceiving(''); onChanged(m); }} />
      ) : null}

      {!orders.length ? <div className="empty-state">No purchase orders yet.</div> : (
        <div className="ew-card inv-card">
          <table className="tbl inv-tbl">
            <thead><tr><th>Order</th><th>Supplier</th><th>Status</th><th className="num">Items</th><th className="num">Est. total</th><th>Created</th><th /></tr></thead>
            <tbody>
              {orders.map((po) => {
                const st = orderStatus(po);
                return (
                  <tr key={po.id} className={st === 'cancelled' ? 'sm-out' : ''}>
                    <td><button type="button" className="ew-link inv-name" onClick={() => setView(view === po.id ? '' : po.id)}>{po.number}</button></td>
                    <td>{po.vendorName}</td>
                    <td><span className={`inv-po__st inv-po__st--${st}`}>{PO_STATUS_LABEL[st]}</span></td>
                    <td className="num">{(po.lines || []).length}</td>
                    <td className="num">{fmtMoney(po.total)}</td>
                    <td className="ew-subtle">{fmtDay(po.createdAt)}{po.createdBy?.name ? ` · ${po.createdBy.name}` : ''}</td>
                    <td className="inv-acts">
                      <button type="button" className="ew-icon-btn" title="Print" aria-label="Print" onClick={() => printOrder(po, company?.name || '', whName)}><Printer size={13} /></button>
                      {canReceive && (st === 'open' || st === 'partial') ? <button type="button" className="ew-icon-btn" title="Receive" aria-label="Receive" onClick={() => setReceiving(po.id)}><ArrowDownToLine size={13} /></button> : null}
                      {canOrder && st === 'open' ? <button type="button" className="ew-icon-btn delete" title="Cancel order" aria-label="Cancel order" onClick={() => cancel(po)}><Ban size={13} /></button> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {shown ? (
        <div className="ew-card inv-log">
          <div className="inv-form__head">
            <h3>{shown.number} · {shown.vendorName} · {PO_STATUS_LABEL[orderStatus(shown)]}</h3>
            <button type="button" className="ew-icon-btn" onClick={() => setView('')} aria-label="Close"><X size={14} /></button>
          </div>
          <p className="ew-subtle">Deliver to {whName(shown.warehouseId)}{shown.note ? ` · ${shown.note}` : ''}</p>
          <table className="tbl inv-tbl">
            <thead><tr><th>Material</th><th>Order</th><th className="num">Pieces</th><th className="num">Received</th><th className="num">Price / pc</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {(shown.lines || []).map((l) => (
                <tr key={l.itemKey}>
                  <td>{l.family} · {l.size}</td>
                  <td className="ew-subtle">{buyText(l)}</td>
                  <td className="num">{qtyFmt(l.pieces)}</td>
                  <td className="num">{qtyFmt(l.received)}</td>
                  <td className="num">{fmtMoney(l.unitPrice)}</td>
                  <td className="num">{fmtMoney(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
