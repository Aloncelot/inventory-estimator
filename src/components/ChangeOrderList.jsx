// src/components/ChangeOrderList.jsx
// Change orders with their decision: an Admin approves or rejects one that is
// waiting (with a note), the estimator who asked may withdraw it, and anyone
// can print it.
'use client';

import { useState } from 'react';
import { Check, X, Printer, Undo2, ChevronDown, ChevronRight } from 'lucide-react';
import { fmtMoney } from '@/components/ui/mat';
import { decideChangeOrder, withdrawChangeOrder } from '@/lib/projects';
import { CO_STATUS_LABEL } from '@/domain/revisions';

const fmtDay = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtMoney(Math.abs(Number(v) || 0))}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** A printable change order (for the client or the salesperson). */
export function printChangeOrder(co, companyName) {
  const w = window.open('', '_blank');
  if (!w) return;
  const cats = (co.categories || []).filter((c) => c.diff).map((c) => `<tr><td>${esc(c.label)}</td><td class="n">${fmtMoney(c.base)}</td><td class="n">${fmtMoney(c.current)}</td><td class="n">${signed(c.diff)}</td></tr>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(co.number)} · ${esc(co.projectName)}</title>
<style>body{font:13px system-ui,sans-serif;margin:32px;color:#222}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}.n{text-align:right}tfoot td{font-weight:700;border:0}.meta{display:flex;gap:36px;margin-top:12px}.meta div span{display:block;color:#777;font-size:11px}</style></head>
<body><h1>Change order ${esc(co.number)}</h1><div class="meta"><div><span>From</span>${esc(companyName)}</div><div><span>Project</span>${esc(co.projectName)}</div>
<div><span>Revision</span>Rev ${co.fromRevision?.number} → Rev ${co.toRevision?.number}</div><div><span>Drawings</span>${esc(co.toRevision?.drawingsDate || '—')}</div><div><span>Status</span>${esc(CO_STATUS_LABEL[co.status] || co.status)}</div></div>
${co.message ? `<p>${esc(co.message)}</p>` : ''}
<table><thead><tr><th>Category</th><th class="n">Before</th><th class="n">Now</th><th class="n">Change</th></tr></thead><tbody>${cats}</tbody>
<tfoot><tr><td colspan="3" class="n">Contract before</td><td class="n">${fmtMoney(co.fromRevision?.grandTotal)}</td></tr>
<tr><td colspan="3" class="n">This change order</td><td class="n">${signed(co.amount)}</td></tr>
<tr><td colspan="3" class="n">Contract after</td><td class="n">${fmtMoney(co.toRevision?.grandTotal)}</td></tr></tfoot></table>
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

function Row({ co, cid, user, isAdmin, showProject, companyName, onChanged, onOpenProject }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const mine = co.requestedBy?.uid === user?.uid;
  const decide = async (approve) => {
    setBusy(true); setErr('');
    try { await decideChangeOrder(cid, co, approve, note, user); onChanged(`${co.number} ${approve ? 'approved' : 'rejected'}.`, co); } catch (e) { setErr(e?.message || String(e)); } finally { setBusy(false); }
  };
  const withdraw = async () => {
    setBusy(true); setErr('');
    try { await withdrawChangeOrder(cid, co, user); onChanged(`${co.number} withdrawn.`, co); } catch (e) { setErr(e?.message || String(e)); } finally { setBusy(false); }
  };
  return (
    <div className={`co-row co-row--${co.status}`}>
      <div className="co-row__head">
        <button type="button" className="ew-link inv-name" onClick={() => setOpen(!open)}>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {co.number}</button>
        {showProject ? <button type="button" className="ew-link" onClick={() => onOpenProject?.(co.projectId)}>{co.projectName}</button> : null}
        <span className="ew-subtle">Rev {co.fromRevision?.number} → Rev {co.toRevision?.number}</span>
        <strong className={co.amount > 0 ? 'pl-up' : co.amount < 0 ? 'pl-down' : ''}>{signed(co.amount)}</strong>
        <span className={`co-st co-st--${co.status}`}>{CO_STATUS_LABEL[co.status] || co.status}</span>
        <span className="ew-subtle">{co.requestedBy?.name} · {fmtDay(co.requestedAt)}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="ew-icon-btn" title="Print" aria-label="Print" onClick={() => printChangeOrder(co, companyName)}><Printer size={13} /></button>
      </div>
      {co.message ? <p className="co-row__msg">“{co.message}”</p> : null}
      {co.status !== 'pending' && co.decidedBy ? (
        <p className="ew-subtle co-row__msg">{CO_STATUS_LABEL[co.status]} by {co.decidedBy.name || co.decidedBy.email} · {fmtDay(co.decidedAt)}{co.decisionNote ? `: “${co.decisionNote}”` : ''}</p>
      ) : null}
      {open ? (
        <div className="co-row__body">
          <p className="ew-subtle">Materials at cost: {signed(co.effects?.quantity)} from quantities (drawings) · {signed(co.effects?.price)} from prices.</p>
          <table className="tbl">
            <thead><tr><th>Category</th><th className="num">Before</th><th className="num">Now</th><th className="num">Change</th></tr></thead>
            <tbody>{(co.categories || []).filter((c) => c.diff).map((c) => <tr key={c.key}><td>{c.label}</td><td className="num">{fmtMoney(c.base)}</td><td className="num">{fmtMoney(c.current)}</td><td className="num">{signed(c.diff)}</td></tr>)}</tbody>
          </table>
          {(co.lines || []).length ? (
            <table className="tbl">
              <thead><tr><th>Material</th><th className="num">Qty before</th><th className="num">Qty now</th><th className="num">By quantity</th><th className="num">By price</th></tr></thead>
              <tbody>
                {co.lines.slice(0, 15).map((l) => (
                  <tr key={l.key}><td>{l.name} <span className="ew-subtle">{l.change !== 'changed' ? `(${l.change})` : ''}</span></td><td className="num">{l.qtyBase}</td><td className="num">{l.qty}</td><td className="num">{l.qtyEffect ? signed(l.qtyEffect) : ''}</td><td className="num">{l.priceEffect ? signed(l.priceEffect) : ''}</td></tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}
      {co.status === 'pending' && (isAdmin || mine) ? (
        <div className="co-row__acts">
          {isAdmin ? (
            <>
              <input className="ew-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. the client put the job on hold" />
              <button type="button" className="ew-btn ew-btn--primary" disabled={busy} onClick={() => decide(true)}><Check size={12} /> Approve</button>
              <button type="button" className="ew-btn" disabled={busy} onClick={() => decide(false)}><X size={12} /> Reject</button>
            </>
          ) : null}
          {mine ? <button type="button" className="ew-btn ew-btn--ghost" disabled={busy} onClick={withdraw}><Undo2 size={12} /> Withdraw</button> : null}
        </div>
      ) : null}
      {err ? <p className="gate-err">{err}</p> : null}
    </div>
  );
}

export default function ChangeOrderList({ orders, empty = 'No change orders.', ...rest }) {
  if (!orders?.length) return <div className="empty-state">{empty}</div>;
  return <div className="co-list">{orders.map((co) => <Row key={co.id} co={co} {...rest} />)}</div>;
}
