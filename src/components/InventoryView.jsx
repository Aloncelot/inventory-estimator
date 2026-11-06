// src/components/InventoryView.jsx
// The company's inventory: stock by warehouse and the movement log. Everyone
// in the company sees it; the Warehouse role records movements (receive,
// issue, transfer, count). Whole pieces only.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Warehouse, Plus, RefreshCw, Sparkles, Trash2, X, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, ClipboardCheck } from 'lucide-react';
import { useAuth } from '@/AuthContext';
import { useCompany } from '@/context/CompanyContext';
import { useProject } from '@/context/ProjectContext';
import { PageHeader, fmtMoney } from '@/components/ui/mat';
import { useConfirm } from '@/components/ui/confirm';
import { getItemPrices } from '@/lib/catalog';
import { goTo, takeFocus } from '@/lib/nav';
import {
  listStock, listMovements, recordMovement, loadCatalogItems, seedSampleStock, clearSampleStock, setMinQty,
} from '@/lib/inventory';
import {
  BUY_UNITS, boardFeetOf, receiptPieces, costPerPiece, priceVariance, isFlagged,
} from '@/domain/purchase';
import {
  MOVE_TYPES, moveLabel, matchesSearch, onHand, stockStatus, stockValue, stockRows, inventoryTotals, validateMovement,
} from '@/domain/inventory';

const MOVE_ICONS = { in: ArrowDownToLine, out: ArrowUpFromLine, transfer: ArrowLeftRight, adjust: ClipboardCheck };
const fmtWhen = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const qtyFmt = (v) => (Number(v) || 0).toLocaleString('en-US');
const STATUS = { out: 'Out', low: 'Low', ok: '' };

function MoveForm({ item, stocks, warehouses, projects, onClose, onSaved, cid, user, defaultType = 'in' }) {
  const [catalog, setCatalog] = useState(null);
  const [search, setSearch] = useState(item ? `${item.family} · ${item.size}` : '');
  const [picked, setPicked] = useState(item || null);
  const [mv, setMv] = useState({
    type: defaultType, warehouseId: warehouses[0]?.id || '', toWarehouseId: warehouses[1]?.id || '',
    qty: '', unitCost: item?.lastCost ?? item?.avgCost ?? '', ref: '', projectId: '', note: '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch) => setMv((m) => ({ ...m, ...patch }));
  // receipts: what the invoice says, in the supplier's unit
  const [vendors, setVendors] = useState(null);   // this material's suppliers in the price list
  const [buy, setBuy] = useState({ vendorId: '', buyUnit: 'each', buyQty: '', pcsPerBundle: '', pieces: '', totalPaid: '' });
  const setB = (patch) => setBuy((b) => ({ ...b, ...patch }));
  const pickVendor = (list, id) => {
    const v = list.find((x) => x.vendorId === id);
    setB({ vendorId: id, buyUnit: v?.buyUnit || 'each', pcsPerBundle: v?.pcsPerBundle || '', pieces: '' });
  };

  // receiving can bring in any catalog item; the rest work on what is in stock
  useEffect(() => {
    if (mv.type !== 'in' || catalog) return;
    loadCatalogItems().then(setCatalog).catch((e) => setErr(`The price list could not be read: ${e.message || e}`));
  }, [mv.type, catalog]);

  const pickedKey = picked?.itemKey;
  useEffect(() => {
    setVendors(null);
    if (mv.type !== 'in' || !pickedKey) return undefined;
    let alive = true;
    getItemPrices(pickedKey).then((list) => {
      if (!alive) return;
      const withId = (list || []).filter((v) => v.vendorId);
      setVendors(withId);
      pickVendor(withId, withId[0]?.vendorId || '');
    }).catch(() => { if (alive) setVendors([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mv.type, pickedKey]);

  const byKey = useMemo(() => new Map(stocks.map((s) => [s.itemKey, s])), [stocks]);
  const options = useMemo(() => {
    const list = mv.type === 'in' ? (catalog || []).map((c) => byKey.get(c.itemKey) || c) : stocks.filter((s) => onHand(s) > 0 || mv.type === 'adjust');
    if (!search.trim() || (picked && search === `${picked.family} · ${picked.size}`)) return [];
    return list.filter((x) => matchesSearch(x, search)).slice(0, 12);
  }, [mv.type, catalog, stocks, byKey, search, picked]);

  const stock = picked ? byKey.get(picked.itemKey) : null;
  const have = stock ? onHand(stock, mv.warehouseId) : 0;
  const project = projects.find((p) => p.id === mv.projectId);

  // a receipt in the supplier's unit → pieces and cost per piece
  const isIn = mv.type === 'in';
  const vendor = (vendors || []).find((v) => v.vendorId === buy.vendorId) || null;
  const boardFeet = picked ? boardFeetOf(picked.size) : null;
  const autoPieces = receiptPieces({ buyUnit: buy.buyUnit, buyQty: buy.buyQty, pcsPerBundle: buy.pcsPerBundle, boardFeet });
  const pieces = buy.pieces !== '' ? Number(buy.pieces) : autoPieces;
  const perPiece = costPerPiece(buy.totalPaid, pieces);
  const variance = vendor ? priceVariance(perPiece, vendor.basePrice) : null;
  const unitWord = picked?.unit || 'pcs';

  const save = async (e) => {
    e.preventDefault();
    let move = { ...mv, qty: mv.qty === '' ? NaN : Number(mv.qty), itemKey: picked?.itemKey, projectName: project?.name || '' };
    if (isIn) {
      if (buy.buyUnit === 'bundle' && !(Number(buy.pcsPerBundle) > 0)) { setErr('Enter how many pieces come in each bundle.'); return; }
      if (buy.buyUnit === 'mbf' && !boardFeet) { setErr('MBF works only for sawn lumber with a size like 2x6"-8\'.'); return; }
      if (!(Number(buy.buyQty) > 0)) { setErr('Enter the quantity on the invoice.'); return; }
      move = {
        ...move,
        qty: pieces == null ? NaN : pieces,
        unitCost: perPiece ?? '',
        purchase: {
          vendorId: vendor?.vendorId || null,
          vendorName: vendor?.vendorName || '',
          buyUnit: buy.buyUnit,
          buyQty: Number(buy.buyQty),
          pcsPerBundle: buy.buyUnit === 'bundle' ? Number(buy.pcsPerBundle) : null,
          totalPaid: buy.totalPaid === '' ? null : Number(buy.totalPaid),
          listPrice: vendor?.basePrice ?? null,
          variancePct: variance,
        },
        priceReview: vendor && isFlagged(variance) ? 'open' : undefined,
      };
    }
    const v = validateMovement(move, stock || { qty: {} }, warehouses);
    if (v) { setErr(v); return; }
    setBusy(true); setErr('');
    try {
      await recordMovement(cid, warehouses, picked, move, user);
      onSaved(`${moveLabel(move.type)}: ${qtyFmt(move.qty)} ${picked.unit || 'pcs'} of ${picked.family} ${picked.size}${move.priceReview ? ` (price ${variance > 0 ? '+' : ''}${variance}% vs. the list: sent to the estimators to review)` : ''}`);
    } catch (e2) { setErr(e2?.message || String(e2)); } finally { setBusy(false); }
  };

  return (
    <form className="ew-card inv-form" onSubmit={save}>
      <div className="inv-form__head">
        <h3>Record a movement</h3>
        <button type="button" className="ew-icon-btn" onClick={onClose} aria-label="Close"><X size={14} /></button>
      </div>
      <div className="inv-types" role="radiogroup" aria-label="Movement">
        {MOVE_TYPES.map((t) => {
          const Icon = MOVE_ICONS[t.key];
          return (
            <button key={t.key} type="button" role="radio" aria-checked={mv.type === t.key} className={`inv-type${mv.type === t.key ? ' is-on' : ''}`} title={t.hint} onClick={() => set({ type: t.key })} disabled={t.key === 'transfer' && warehouses.length < 2}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>
      <div className="inv-grid">
        <label className="fld inv-item">
          <span>Material</span>
          <input className="ew-input" value={search} onChange={(e) => { setSearch(e.target.value); setPicked(null); }} placeholder={mv.type === 'in' && !catalog ? 'Loading the price list…' : 'Search family or size'} autoFocus={!item} />
          {options.length ? (
            <ul className="inv-options" role="listbox">
              {options.map((o) => (
                <li key={o.itemKey}>
                  <button type="button" onClick={() => { setPicked(o); setSearch(`${o.family} · ${o.size}`); }}>
                    <span>{o.family} · {o.size}</span>
                    <span className="ew-subtle">{byKey.has(o.itemKey) ? `${qtyFmt(onHand(byKey.get(o.itemKey)))} ${o.unit || ''} on hand` : 'not in stock'}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </label>
        <label className="fld">
          <span>{mv.type === 'transfer' ? 'From' : 'Warehouse'}</span>
          <select className="ew-select" value={mv.warehouseId} onChange={(e) => set({ warehouseId: e.target.value })}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        {mv.type === 'transfer' ? (
          <label className="fld">
            <span>To</span>
            <select className="ew-select" value={mv.toWarehouseId} onChange={(e) => set({ toWarehouseId: e.target.value })}>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
        ) : null}
        {isIn ? null : <label className="fld">
          <span>{mv.type === 'adjust' ? 'Counted' : 'Quantity'}{picked ? ` (${picked.unit || 'pcs'})` : ''}</span>
          <input className="ew-input num" type="number" min="0" step="1" inputMode="numeric" value={mv.qty} onChange={(e) => set({ qty: e.target.value })} />
          {picked ? <small className="ew-subtle">{qtyFmt(have)} on hand here</small> : null}
        </label>}
        {isIn ? (
          <>
            <label className="fld">
              <span>Supplier</span>
              <select className="ew-select" value={buy.vendorId} onChange={(e) => pickVendor(vendors || [], e.target.value)} disabled={!picked || vendors === null}>
                {(vendors || []).map((v) => <option key={v.vendorId} value={v.vendorId}>{v.vendorName}</option>)}
                <option value="">Other (not in the price list)</option>
              </select>
              {vendor ? <small className="ew-subtle">List {fmtMoney(vendor.basePrice)} / {vendor.unit || unitWord}</small> : null}
            </label>
            <label className="fld">
              <span>Bought by</span>
              <select className="ew-select" value={buy.buyUnit} onChange={(e) => setB({ buyUnit: e.target.value, pieces: '' })}>
                {BUY_UNITS.map((u) => <option key={u.key} value={u.key} disabled={u.key === 'mbf' && !boardFeet}>{u.key === 'each' ? `Each (${unitWord})` : u.label}{u.key === 'mbf' && !boardFeet ? ' (lumber only)' : ''}</option>)}
              </select>
            </label>
            {buy.buyUnit === 'bundle' ? (
              <label className="fld">
                <span>Pieces per bundle</span>
                <input className="ew-input num" type="number" min="1" step="1" value={buy.pcsPerBundle} onChange={(e) => setB({ pcsPerBundle: e.target.value, pieces: '' })} />
                <small className="ew-subtle">{vendor?.pcsPerBundle ? 'From the price list; change it if this bundle came different' : 'Not set for this supplier'}</small>
              </label>
            ) : null}
            <label className="fld">
              <span>Quantity ({buy.buyUnit === 'bundle' ? 'bundles' : buy.buyUnit === 'mbf' ? 'MBF' : unitWord})</span>
              <input className="ew-input num" type="number" min="0" step={buy.buyUnit === 'mbf' ? '0.001' : '1'} inputMode="decimal" value={buy.buyQty} onChange={(e) => setB({ buyQty: e.target.value, pieces: '' })} />
              {picked ? <small className="ew-subtle">{qtyFmt(have)} on hand here</small> : null}
            </label>
            {buy.buyUnit !== 'each' ? (
              <label className="fld">
                <span>Pieces received</span>
                <input className="ew-input num" type="number" min="0" step="1" value={buy.pieces !== '' ? buy.pieces : (autoPieces ?? '')} onChange={(e) => setB({ pieces: e.target.value })} />
                <small className="ew-subtle">{buy.buyUnit === 'mbf' && boardFeet ? `${boardFeet} BF per piece; ` : ''}worked out, or type the count</small>
              </label>
            ) : null}
            <label className="fld">
              <span>Total paid</span>
              <input className="ew-input num" type="number" min="0" step="0.01" value={buy.totalPaid} onChange={(e) => setB({ totalPaid: e.target.value })} placeholder="Invoice amount" />
              <small className="ew-subtle">For this material on the invoice</small>
            </label>
            {pieces > 0 ? (
              <div className={`inv-calc${isFlagged(variance) ? ' is-flag' : ''}`}>
                <strong>{qtyFmt(pieces)} {unitWord}</strong> into stock
                {perPiece != null ? <> · <strong>{fmtMoney(perPiece)}</strong> / {unitWord === 'pcs' ? 'pc' : unitWord}</> : null}
                {variance != null ? <> · {variance > 0 ? '+' : ''}{variance}% vs. the list</> : null}
                {isFlagged(variance) ? <div className="ew-subtle">Different from the price list: the estimators will be asked whether to update it.</div> : null}
              </div>
            ) : null}
          </>
        ) : null}
        {mv.type === 'out' ? (
          <label className="fld">
            <span>Project</span>
            <select className="ew-select" value={mv.projectId} onChange={(e) => set({ projectId: e.target.value })}>
              <option value="">— none (shop, other) —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        ) : null}
        <label className="fld">
          <span>{mv.type === 'in' ? 'PO / delivery ticket' : 'Reference'}</span>
          <input className="ew-input" value={mv.ref} onChange={(e) => set({ ref: e.target.value })} placeholder={mv.type === 'in' ? 'e.g. PO-1043' : ''} />
        </label>
        <label className="fld inv-note">
          <span>Note</span>
          <input className="ew-input" value={mv.note} onChange={(e) => set({ note: e.target.value })} />
        </label>
      </div>
      {err ? <p className="gate-err">{err}</p> : null}
      <div className="inv-form__foot">
        <button type="submit" className="ew-btn ew-btn--primary" disabled={!picked || busy}>{busy ? 'Saving…' : `Save ${moveLabel(mv.type).toLowerCase()}`}</button>
        <span className="ew-subtle">Saved with your name and the time; movements cannot be edited afterwards.</span>
      </div>
    </form>
  );
}

export default function InventoryView() {
  const { user } = useAuth();
  const { company, companyId, perms } = useCompany();
  const { projectsList } = useProject();
  const confirm = useConfirm();
  const [tab, setTab] = useState('stock');
  const [stocks, setStocks] = useState(null);
  const [moves, setMoves] = useState(null);
  const [wh, setWh] = useState('');
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [form, setForm] = useState(null);   // { item?, type? }
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [itemLog, setItemLog] = useState(null);   // { stock, rows }

  const warehouses = useMemo(() => company?.warehouses || [], [company]);
  const whName = useCallback((id) => warehouses.find((w) => w.id === id)?.name || id || '—', [warehouses]);
  const canEdit = perms.canEditInventory;

  const load = useCallback(async () => {
    if (!companyId || !company?.inventoryEnabled) return;
    try {
      const [s, m] = await Promise.all([listStock(companyId), listMovements(companyId)]);
      setStocks(s); setMoves(m);
    } catch (e) { setMsg(`The inventory could not be read: ${e.message || e}`); setStocks([]); setMoves([]); }
  }, [companyId, company?.inventoryEnabled]);
  useEffect(() => { load(); }, [load]);

  // opened from the price list: show that material
  useEffect(() => {
    if (!stocks) return;
    const f = takeFocus('inventory');
    if (!f) return;
    const s = stocks.find((x) => x.itemKey === f.itemKey);
    if (s) { setTab('stock'); setSearch(`${s.family} ${s.size}`); openLog(s); }
    else setMsg('That material is not in the inventory yet. Record a receipt to add it.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stocks]);

  const rows = useMemo(() => stockRows(stocks || [], { search, warehouseId: wh, lowOnly, hideEmpty }), [stocks, search, wh, lowOnly, hideEmpty]);
  const totals = useMemo(() => inventoryTotals(stocks || [], wh), [stocks, wh]);

  if (!company) return null;
  if (!company.inventoryEnabled) {
    return (
      <div className="app-content">
        <PageHeader icon={Warehouse} title="Inventory" />
        <div className="empty-state">Inventory is off for {company.name}: materials are ordered straight from suppliers. An Admin can turn it on in Company &amp; team.</div>
      </div>
    );
  }

  const seed = async () => {
    if (!(await confirm({ title: 'Generate sample stock?', message: 'Fills the inventory with fictitious quantities for the materials in the price lists, spread over your warehouses. Every receipt is marked as sample so an Admin can remove it later.', confirmLabel: 'Generate' }))) return;
    setBusy('Generating sample stock…'); setMsg('');
    try {
      const nItems = await seedSampleStock(companyId, warehouses, user, (d, t) => setBusy(`Generating sample stock… ${d} of ${t}`));
      setMsg(`Sample stock generated for ${nItems} materials.`);
      await load();
    } catch (e) { setMsg(e?.message || String(e)); } finally { setBusy(''); }
  };
  const clearSample = async () => {
    if (!(await confirm({ title: 'Remove the sample stock?', message: 'Deletes the fictitious stock and its sample movements. Real movements stay.', confirmLabel: 'Remove', tone: 'danger' }))) return;
    setBusy('Removing sample stock…');
    try { const k = await clearSampleStock(companyId, (d) => setBusy(`Removing… ${d}`)); setMsg(`${k} sample records removed.`); await load(); } catch (e) { setMsg(e?.message || String(e)); } finally { setBusy(''); }
  };
  async function openLog(s) {
    setItemLog({ stock: s, rows: null, prices: null });
    const [rows, prices] = await Promise.all([
      listMovements(companyId, { itemKey: s.itemKey, max: 100 }).catch((e) => ({ err: e.message || String(e) })),
      getItemPrices(s.itemKey).catch(() => []),
    ]);
    setItemLog({ stock: s, rows: Array.isArray(rows) ? rows : [], err: rows?.err, prices });
  }
  const editMin = async (s, v) => {
    if (!canEdit || Number(v) === Number(s.minQty || 0)) return;
    try { await setMinQty(companyId, s.itemKey, v, user); setStocks((list) => list.map((x) => (x.itemKey === s.itemKey ? { ...x, minQty: Math.max(0, Math.round(Number(v) || 0)) } : x))); } catch (e) { setMsg(e?.message || String(e)); }
  };
  const hasSample = (stocks || []).some((s) => s.sample);
  const showCols = !wh && warehouses.length > 1;

  return (
    <div className="app-content">
      <PageHeader
        icon={Warehouse}
        title="Inventory"
        meta={`${totals.items} materials · ${totals.low} low · ${totals.out} out${wh ? ` · ${whName(wh)}` : ''}`}
        totalLabel="Stock value"
        total={totals.value}
        actions={(
          <>
            <button type="button" className="ew-btn" onClick={load}><RefreshCw size={12} /> Refresh</button>
            {canEdit ? <button type="button" className="ew-btn ew-btn--primary" onClick={() => setForm({})}><Plus size={13} /> Record movement</button> : null}
          </>
        )}
      />
      {!canEdit ? <p className="ew-subtle">View only: recording movements needs the Warehouse role.</p> : null}
      {msg ? <p className="team-msg">{msg}</p> : null}
      {busy ? <p className="ew-subtle">{busy}</p> : null}

      {form ? (
        <MoveForm
          key={`${form.item?.itemKey || ''}-${form.type || ''}`}
          item={form.item}
          defaultType={form.type}
          stocks={stocks || []}
          warehouses={warehouses}
          projects={projectsList || []}
          cid={companyId}
          user={user}
          onClose={() => setForm(null)}
          onSaved={(text) => { setForm(null); setMsg(`Saved. ${text}.`); load(); }}
        />
      ) : null}

      <div className="inv-bar">
        <div className="inv-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'stock'} className={tab === 'stock' ? 'is-on' : ''} onClick={() => setTab('stock')}>Stock</button>
          <button type="button" role="tab" aria-selected={tab === 'moves'} className={tab === 'moves' ? 'is-on' : ''} onClick={() => setTab('moves')}>Movements</button>
        </div>
        <select className="ew-select" value={wh} onChange={(e) => setWh(e.target.value)} aria-label="Warehouse">
          <option value="">All warehouses</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        {tab === 'stock' ? (
          <>
            <input className="ew-input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search material" aria-label="Search material" style={{ width: 220 }} />
            <label className="pv-check ro-ok"><input className="ro-ok" type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Low or out only</label>
            <label className="pv-check ro-ok"><input className="ro-ok" type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} /> Hide empty</label>
          </>
        ) : null}
      </div>

      {stocks === null ? <div className="empty-state">Loading…</div> : tab === 'stock' ? (
        stocks.length === 0 ? (
          <div className="ew-card inv-empty">
            <p>No stock yet. Record a receipt to start{canEdit ? ', or fill the inventory with sample quantities to try it' : ''}.</p>
            {canEdit ? <button type="button" className="ew-btn" onClick={seed} disabled={!!busy}><Sparkles size={13} /> Generate sample stock</button> : null}
          </div>
        ) : (
          <div className="ew-card inv-card">
            <table className="tbl inv-tbl">
              <thead>
                <tr>
                  <th>Material</th>
                  <th className="inv-c-size">Size</th>
                  {showCols ? warehouses.map((w) => <th key={w.id} className="num inv-c-q">{w.name}</th>) : null}
                  <th className="num inv-c-q">{wh ? 'On hand' : 'Total'}</th>
                  <th className="inv-c-u">Unit</th>
                  <th className="num inv-c-min" title="Minimum to keep; at or under it the item shows as low">Min</th>
                  <th className="num inv-c-p">Avg cost</th>
                  <th className="num inv-c-p">Value</th>
                  <th className="inv-c-st" />
                  {canEdit ? <th className="inv-c-act" /> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const st = stockStatus(s, wh);
                  return (
                    <tr key={s.itemKey} className={`is-${st}`}>
                      <td><button type="button" className="ew-link inv-name" onClick={() => openLog(s)} title="See this material's movements">{s.family}</button><div className="ew-subtle inv-type-sub">{s.materialType}</div></td>
                      <td>{s.size}</td>
                      {showCols ? warehouses.map((w) => <td key={w.id} className="num">{qtyFmt(onHand(s, w.id))}</td>) : null}
                      <td className="num"><strong>{qtyFmt(onHand(s, wh))}</strong></td>
                      <td className="ew-subtle">{s.unit}</td>
                      <td className="num">
                        {canEdit ? (
                          <input className="ew-input num inv-min" type="number" min="0" step="1" defaultValue={s.minQty || 0} key={s.minQty} onBlur={(e) => editMin(s, e.target.value)} aria-label={`Minimum for ${s.family} ${s.size}`} />
                        ) : qtyFmt(s.minQty)}
                      </td>
                      <td className="num">{s.avgCost ? fmtMoney(s.avgCost) : '—'}</td>
                      <td className="num">{fmtMoney(stockValue(s, wh))}</td>
                      <td>{STATUS[st] ? <span className={`inv-st inv-st--${st}`}>{STATUS[st]}</span> : null}</td>
                      {canEdit ? (
                        <td className="inv-acts">
                          <button type="button" className="ew-icon-btn" title="Receive" aria-label="Receive" onClick={() => setForm({ item: s, type: 'in' })}><ArrowDownToLine size={13} /></button>
                          <button type="button" className="ew-icon-btn" title="Issue" aria-label="Issue" onClick={() => setForm({ item: s, type: 'out' })} disabled={onHand(s) <= 0}><ArrowUpFromLine size={13} /></button>
                          <button type="button" className="ew-icon-btn" title="Count" aria-label="Count" onClick={() => setForm({ item: s, type: 'adjust' })}><ClipboardCheck size={13} /></button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length ? <div className="empty-state">Nothing matches.</div> : null}
            {hasSample && perms.isAdmin ? (
              <div className="inv-sample"><span className="ew-subtle">Includes sample (fictitious) stock.</span> <button type="button" className="ew-btn ew-btn--ghost" onClick={clearSample} disabled={!!busy}><Trash2 size={12} /> Remove sample stock</button></div>
            ) : null}
          </div>
        )
      ) : (
        <MovesTable rows={(moves || []).filter((m) => !wh || m.warehouseId === wh || m.toWarehouseId === wh)} whName={whName} />
      )}

      {itemLog ? (
        <div className="ew-card inv-log">
          <div className="inv-form__head">
            <h3>{itemLog.stock.family} · {itemLog.stock.size}</h3>
            <button type="button" className="ew-icon-btn" onClick={() => setItemLog(null)} aria-label="Close"><X size={14} /></button>
          </div>
          <div className="inv-prices">
            <span className="ew-subtle">Supplier prices:</span>
            {itemLog.prices === null ? <span className="ew-subtle">loading…</span>
              : itemLog.prices.length ? itemLog.prices.map((p) => <span key={p.vendorName} className="ew-chip">{p.vendorName} {fmtMoney(p.basePrice)}{p.unit ? ` / ${p.unit}` : ''}</span>)
              : <span className="ew-subtle">none in the price list</span>}
            <button type="button" className="ew-link" onClick={() => goTo('items', { itemKey: itemLog.stock.itemKey, family: itemLog.stock.family })}>Open in Price list</button>
          </div>
          {itemLog.err ? <p className="gate-err">{itemLog.err}</p> : itemLog.rows === null ? <div className="empty-state">Loading…</div> : <MovesTable rows={itemLog.rows} whName={whName} compact />}
        </div>
      ) : null}
    </div>
  );
}

/** "Acme · 5 bundles · $2,000.00" for a receipt recorded from an invoice. */
function purchaseText(m) {
  const p = m.purchase;
  if (!p) return '';
  const unit = p.buyUnit === 'bundle' ? `bundle${p.buyQty === 1 ? '' : 's'}` : p.buyUnit === 'mbf' ? 'MBF' : '';
  const qty = p.buyUnit === 'each' ? '' : `${qtyFmt(p.buyQty)} ${unit}`;
  return [p.vendorName, qty, p.totalPaid != null ? `paid ${fmtMoney(p.totalPaid)}` : ''].filter(Boolean).join(' · ');
}

function MovesTable({ rows, whName, compact }) {
  if (!rows.length) return <div className="empty-state">No movements yet.</div>;
  return (
    <div className="ew-card inv-card">
      <table className="tbl inv-tbl">
        <thead>
          <tr>
            <th className="inv-c-when">When</th>
            <th className="inv-c-who">Who</th>
            <th className="inv-c-mv">Movement</th>
            {compact ? null : <th>Material</th>}
            <th>Warehouse</th>
            <th className="num inv-c-q">Qty</th>
            <th className="num inv-c-p">Unit cost</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const Icon = MOVE_ICONS[m.type] || Plus;
            const d = Object.values(m.delta || {}).reduce((a, b) => a + b, 0);
            const sign = m.type === 'in' ? '+' : m.type === 'out' ? '−' : m.type === 'adjust' ? (d >= 0 ? '+' : '−') : '';
            const shown = m.type === 'adjust' ? Math.abs(d) : m.qty;
            return (
              <tr key={m.id}>
                <td>{fmtWhen(m.at)}</td>
                <td>{m.by?.name || m.by?.email || '—'}</td>
                <td><span className={`inv-mv inv-mv--${m.type}`}><Icon size={12} /> {moveLabel(m.type)}</span></td>
                {compact ? null : <td>{m.family} · {m.size}</td>}
                <td>{m.type === 'transfer' ? `${whName(m.warehouseId)} → ${whName(m.toWarehouseId)}` : whName(m.warehouseId)}</td>
                <td className="num">{sign}{qtyFmt(shown)} <span className="ew-subtle">{m.unit}</span>{m.type === 'adjust' ? <div className="ew-subtle">counted {qtyFmt(m.qty)}</div> : null}</td>
                <td className="num">{m.unitCost != null ? fmtMoney(m.unitCost) : ''}</td>
                <td>{[purchaseText(m), m.projectName, m.ref, m.note].filter(Boolean).join(' · ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
