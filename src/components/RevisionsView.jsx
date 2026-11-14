// src/components/RevisionsView.jsx
// Revisions of the open project and its change orders, plus the change log.
//   - Save revision: freezes the estimate (Rev 0 is the bid and the contract).
//   - Compare: any revision against another or against the estimate now, by
//     category and by material (what quantities did, what prices did).
//   - Change order: the estimator asks to move the contract to a newer
//     revision; an Admin approves or rejects it (the project may be on hold or
//     cancelled, or the new drawings may have come by mistake).
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, Save, Send, Mail, AlertTriangle, Info as InfoIcon } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { useCompany } from '@/context/CompanyContext';
import { useAuth } from '@/AuthContext';
import { PageHeader, fmtMoney } from '@/components/ui/mat';
import HistoryView from '@/components/HistoryView';
import ChangeOrderList from '@/components/ChangeOrderList';
import { listRevisions, saveRevision, listChangeOrders, requestChangeOrder, getProjectMeta, listReviews, requestReview } from '@/lib/projects';
import ReviewList from '@/components/ReviewList';
import { qaChecks } from '@/domain/quality';
import { listMembers } from '@/lib/company';
import { slimEstimate } from '@/domain/lib/selection';
import { grandTotals, compareEstimates, revisionAlerts, contractOf, statusLabel } from '@/domain/revisions';

const fmtDay = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtMoney(Math.abs(Number(v) || 0))}`;
const diffClass = (v) => (v > 0 ? 'pl-up' : v < 0 ? 'pl-down' : 'ew-subtle');

function Compare({ c, showAll, setShowAll }) {
  const lines = showAll ? c.lines : c.lines.slice(0, 12);
  return (
    <>
      <table className="tbl rev-tbl">
        <thead><tr><th>Category</th><th className="num">Before</th><th className="num">Now</th><th className="num">Change</th></tr></thead>
        <tbody>
          {c.categories.map((x) => (
            <tr key={x.key}><td>{x.label}</td><td className="num">{fmtMoney(x.base)}</td><td className="num">{fmtMoney(x.current)}</td><td className={`num ${diffClass(x.diff)}`}>{x.diff ? signed(x.diff) : '—'}</td></tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td>Grand total</td><td className="num">{fmtMoney(c.base.grandTotal)}</td><td className="num">{fmtMoney(c.current.grandTotal)}</td><td className={`num ${diffClass(c.amount)}`}><strong>{c.amount ? signed(c.amount) : '—'}</strong></td></tr>
        </tfoot>
      </table>
      <div className="rev-effects">
        <span>Materials at cost:</span>
        <span><strong className={diffClass(c.effects.quantity)}>{signed(c.effects.quantity)}</strong> from quantities <span className="ew-subtle">(the drawings changed: the client&apos;s change)</span></span>
        <span><strong className={diffClass(c.effects.price)}>{signed(c.effects.price)}</strong> from prices <span className="ew-subtle">(suppliers&apos; prices moved)</span></span>
      </div>
      {c.lines.length ? (
        <table className="tbl rev-tbl">
          <thead><tr><th>Material</th><th className="num">Qty before</th><th className="num">Qty now</th><th className="num">Price before</th><th className="num">Price now</th><th className="num">By quantity</th><th className="num">By price</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className={`rev-line rev-line--${l.change}`}>
                <td>{l.name}{l.change !== 'changed' ? <span className="ew-subtle"> · {l.change}</span> : null}</td>
                <td className="num">{l.qtyBase} <span className="ew-subtle">{l.unit}</span></td>
                <td className="num">{l.qty}</td>
                <td className="num">{l.qtyBase ? fmtMoney(l.priceBase) : ''}</td>
                <td className="num">{l.qty ? fmtMoney(l.price) : ''}</td>
                <td className={`num ${diffClass(l.qtyEffect)}`}>{l.qtyEffect ? signed(l.qtyEffect) : ''}</td>
                <td className={`num ${diffClass(l.priceEffect)}`}>{l.priceEffect ? signed(l.priceEffect) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="ew-subtle">No material changed.</p>}
      {c.lines.length > 12 ? <button type="button" className="ew-link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${c.lines.length} materials`}</button> : null}
    </>
  );
}

export default function RevisionsView() {
  const { projectId, projectData, readOnly, applyMeta } = useProject();
  const { companyId, company, perms } = useCompany();
  const { user } = useAuth();
  const [tab, setTab] = useState('revisions');
  const [revs, setRevs] = useState(null);
  const [cos, setCos] = useState([]);
  const [members, setMembers] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [reviewer, setReviewer] = useState('');
  const [reviewMsg, setReviewMsg] = useState('');
  const [baseId, setBaseId] = useState('');
  const [targetId, setTargetId] = useState('current');
  const [label, setLabel] = useState('');
  const [message, setMessage] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [sentMail, setSentMail] = useState(null);

  const meta = projectData?.meta || {};
  const est = useMemo(() => projectData?.estimateData || {}, [projectData]);
  const markupDefault = company?.materialMarkupPct ?? 0;
  const current = useMemo(() => grandTotals(est, { markupDefault }), [est, markupDefault]);

  const load = useCallback(async () => {
    if (!companyId || !projectId) return;
    try {
      const [r, c, v] = await Promise.all([listRevisions(companyId, projectId), listChangeOrders(companyId, { projectId }), listReviews(companyId, { projectId }).catch(() => [])]);
      setRevs(r); setCos(c); setReviews(v);
    } catch (e) { setMsg(`Revisions could not be read: ${e?.message || e}`); setRevs([]); }
  }, [companyId, projectId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!companyId) return;
    listMembers(companyId).then(setMembers).catch(() => {});
  }, [companyId]);

  const last = revs?.length ? revs[revs.length - 1] : null;
  const contractRev = revs?.find((r) => r.id === meta.contract?.revisionId) || null;
  // compare the contract (or the latest revision) with the estimate now, unless chosen otherwise
  const base = revs?.find((r) => r.id === baseId) || contractRev || last;
  const target = targetId === 'current' ? null : revs?.find((r) => r.id === targetId) || null;
  const compare = useMemo(() => {
    if (!base) return null;
    const tEst = target ? target.estimateData : est;
    return compareEstimates(base.estimateData || {}, tEst || {}, { markupDefault, baseTotals: base.totals, currentTotals: target ? target.totals : current });
  }, [base, target, est, current, markupDefault]);

  const alerts = useMemo(() => revisionAlerts(est, last ? { number: last.number, drawingsDate: last.drawingsDate, at: last.at?.toMillis?.() } : null, {
    currentGrand: current.grandTotal, lastGrand: last?.totals?.grandTotal, status: meta.status,
  }), [est, last, current.grandTotal, meta.status]);

  const admins = members.filter((x) => (x.roles || []).includes('admin'));
  const checks = useMemo(() => qaChecks(est, { markupDefault }), [est, markupDefault]);
  const reviewers = members.filter((x) => x.uid !== user?.uid && ((x.roles || []).includes('estimator') || (x.roles || []).includes('admin')));
  const pendingReview = reviews.find((r) => r.status === 'pending');
  const askReview = async () => {
    setBusy('Sending for review…'); setMsg('');
    try {
      const who = members.find((x) => x.uid === reviewer);
      await requestReview(companyId, {
        projectId, projectName: projectData.name, message: reviewMsg, grandTotal: current.grandTotal, checks,
        reviewer: who ? { uid: who.uid, name: who.name || who.email, email: who.email } : null,
      }, user);
      setReviewMsg('');
      setMsg(`Sent for review${who ? ` to ${who.name || who.email}` : ''}.`);
      applyMeta(projectId, await getProjectMeta(companyId, projectId));
      await load();
    } catch (e) { setMsg(`Not sent: ${e?.message || e}`); } finally { setBusy(''); }
  };

  const contract = contractOf(meta.bidTotal ?? contractRev?.totals?.grandTotal ?? 0, cos);
  const canEstimate = !readOnly;
  const pendingFor = (revId) => cos.some((c) => c.status === 'pending' && c.toRevision?.id === revId);
  const canRequest = canEstimate && base && target && contractRev && base.id === contractRev.id && target.number > base.number && !pendingFor(target.id);

  const save = async () => {
    setBusy('Saving the revision…'); setMsg('');
    try {
      const r = await saveRevision(companyId, projectId, { estimate: slimEstimate(est), totals: current, label }, user);
      applyMeta(projectId, r.meta);
      setLabel('');
      setMsg(r.number === 0 ? 'Rev 0 saved: it is the bid and the contract. Later revisions go to an Admin as change orders.' : `Rev ${r.number} saved. Compare it with the contract and ask for a change order if it changes the price.`);
      await load();
      setTargetId(r.id);
    } catch (e) { setMsg(`Not saved: ${e?.message || e}`); } finally { setBusy(''); }
  };

  const request = async () => {
    setBusy('Sending to the admins…'); setMsg('');
    try {
      const number = await requestChangeOrder(companyId, { projectId, projectName: projectData.name, fromRev: base, toRev: target, compare, message }, user);
      setMessage('');
      setMsg(`${number} sent to the admins for approval.`);
      const to = admins.map((a) => a.email).filter(Boolean).join(',');
      setSentMail(to ? `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`${number} for ${projectData.name}: ${signed(compare.amount)}`)}&body=${encodeURIComponent(
        `${number} for ${projectData.name} is waiting for your approval in the estimator (Projects).\n\nRev ${base.number} → Rev ${target.number}: ${signed(compare.amount)}\n${message ? `\n${message}\n` : ''}`,
      )}` : null);
      await load();
    } catch (e) { setMsg(`Not sent: ${e?.message || e}`); } finally { setBusy(''); }
  };

  if (!projectData) {
    return (
      <div className="app-content">
        <PageHeader icon={History} title="Revisions" />
        <div className="empty-state">Open a project to see its revisions.</div>
      </div>
    );
  }

  return (
    <div className="app-content">
      <PageHeader
        icon={History}
        title="Revisions"
        meta={`${projectData.name} · ${statusLabel(meta.status || 'not_started')}`}
        totalLabel={meta.contract ? `Contract (Rev ${meta.contract.number})` : undefined}
        total={meta.contract ? contract.total : undefined}
      />
      <div className="inv-tabs" role="tablist" style={{ marginBottom: 12 }}>
        <button type="button" role="tab" aria-selected={tab === 'revisions'} className={tab === 'revisions' ? 'is-on' : ''} onClick={() => setTab('revisions')}>Revisions & change orders</button>
        <button type="button" role="tab" aria-selected={tab === 'qa'} className={tab === 'qa' ? 'is-on' : ''} onClick={() => setTab('qa')}>Quality check{checks.some((c) => c.level === 'error') ? ' ⚠' : ''}</button>
        <button type="button" role="tab" aria-selected={tab === 'log'} className={tab === 'log' ? 'is-on' : ''} onClick={() => setTab('log')}>Change log</button>
      </div>

      {tab === 'log' ? <HistoryView embedded /> : tab === 'qa' ? (
        <>
          {msg ? <p className="team-msg">{msg}</p> : null}
          <div className="ew-card">
            <h3 style={{ marginTop: 0 }}>Automatic check</h3>
            <ul className="qa-list">
              {checks.map((c) => (
                <li key={c.key} className={`qa--${c.level}`}><span className="qa-ico">{c.level === 'error' ? '✕' : c.level === 'warn' ? '!' : '✓'}</span>{c.text}</li>
              ))}
            </ul>
            <p className="ew-subtle">It catches what the numbers show (no material, $0 prices, empty parts). A colleague still has to read the drawings against the takeoff.</p>
          </div>
          {canEstimate ? (
            <div className="ew-card rev-request" style={{ marginTop: 12 }}>
              {pendingReview ? (
                <p className="ew-subtle">Waiting for {pendingReview.reviewer?.name || 'an estimator'} to review it.</p>
              ) : (
                <>
                  <label className="fld" style={{ '--w': '220px' }}>
                    <span>Reviewer</span>
                    <select className="ew-select" value={reviewer} onChange={(e) => setReviewer(e.target.value)}>
                      <option value="">Any estimator</option>
                      {reviewers.map((x) => <option key={x.uid} value={x.uid}>{x.name || x.email}</option>)}
                    </select>
                  </label>
                  <label className="fld" style={{ flex: 1 }}>
                    <span>What to look at</span>
                    <input className="ew-input" value={reviewMsg} onChange={(e) => setReviewMsg(e.target.value)} placeholder="e.g. Check the 2nd floor shear walls and the deck" />
                  </label>
                  <button type="button" className="ew-btn ew-btn--primary" disabled={!!busy} onClick={askReview}><Send size={13} /> Request review</button>
                </>
              )}
            </div>
          ) : null}
          <h3 className="rev-h">Reviews</h3>
          <ReviewList
            reviews={reviews} cid={companyId} user={user} perms={perms} empty="Not reviewed yet."
            onChanged={async (m) => { setMsg(m); applyMeta(projectId, await getProjectMeta(companyId, projectId)); await load(); }}
          />
        </>
      ) : (
        <>
          {alerts.map((a) => (
            <div key={a.key} className={`rev-alert rev-alert--${a.tone}`}>
              {a.tone === 'warn' ? <AlertTriangle size={14} /> : <InfoIcon size={14} />}
              <span>{a.text}{a.amount != null ? <strong className={diffClass(a.amount)}> {signed(a.amount)}</strong> : null}</span>
            </div>
          ))}
          {msg ? <p className="team-msg">{msg}{sentMail ? <> <a className="ew-link" href={sentMail}><Mail size={12} /> Email the admins too</a></> : null}</p> : null}

          {meta.contract ? (
            <div className="rev-contract">
              <div><span>Bid (Rev 0)</span><strong>{fmtMoney(meta.bidTotal ?? 0)}</strong></div>
              <div><span>Approved change orders</span><strong>{contract.approved ? signed(contract.total - (meta.bidTotal ?? 0)) : '—'}</strong><small className="ew-subtle">{contract.approved} approved</small></div>
              <div><span>Contract now</span><strong>{fmtMoney(contract.total)}</strong><small className="ew-subtle">Rev {meta.contract.number}</small></div>
              <div><span>Waiting for approval</span><strong>{contract.pending ? signed(contract.pendingAmount) : '—'}</strong><small className="ew-subtle">{contract.pending} pending</small></div>
              <div><span>Estimate now</span><strong>{fmtMoney(current.grandTotal)}</strong><small className={diffClass(current.grandTotal - contract.total)}>{current.grandTotal !== contract.total ? signed(current.grandTotal - contract.total) : 'same as contract'}</small></div>
            </div>
          ) : null}

          {canEstimate ? (
            <div className="ew-card rev-save">
              <label className="fld" style={{ '--w': '320px' }}>
                <span>{last ? `Save as Rev ${last.number + 1}` : 'Save as Rev 0 (the bid)'}</span>
                <input className="ew-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={last ? 'e.g. Drawings rev B, added 2nd floor deck' : 'e.g. Bid sent to sales'} />
              </label>
              <button type="button" className="ew-btn ew-btn--primary" disabled={!!busy || revs === null} onClick={save}><Save size={13} /> Save revision</button>
              <span className="ew-subtle">Freezes the estimate as it is now ({fmtMoney(current.grandTotal)}{est.summaryInfo?.drawingsDate ? `, drawings ${est.summaryInfo.drawingsDate}` : ''}).</span>
            </div>
          ) : null}

          {revs === null ? <div className="empty-state">Loading…</div> : revs.length ? (
            <div className="ew-card" style={{ padding: '0 6px' }}>
              <table className="tbl rev-tbl">
                <thead><tr><th>Revision</th><th>Drawings</th><th className="num">Total</th><th>Saved</th><th /></tr></thead>
                <tbody>
                  {[...revs].reverse().map((r) => (
                    <tr key={r.id} className={r.id === meta.contract?.revisionId ? 'is-contract' : ''}>
                      <td><strong>Rev {r.number}</strong>{r.label ? <span className="ew-subtle"> · {r.label}</span> : null}{r.id === meta.contract?.revisionId ? <span className="co-st co-st--approved">Contract</span> : null}{pendingFor(r.id) ? <span className="co-st co-st--pending">CO waiting</span> : null}</td>
                      <td className="ew-subtle">{r.drawingsDate || '—'}{r.estimateData?.summaryInfo?.drawingsReceived ? <div>received {r.estimateData.summaryInfo.drawingsReceived}</div> : null}</td>
                      <td className="num">{fmtMoney(r.totals?.grandTotal)}</td>
                      <td className="ew-subtle">{fmtDay(r.at)} · {r.by?.name || r.by?.email}</td>
                      <td className="proj-acts">
                        <button type="button" className="ew-btn ew-btn--ghost" title={r.id === contractRev?.id ? 'Compare the contract with the estimate now' : 'Compare with the contract'} onClick={() => {
                          if (r.id === contractRev?.id || !contractRev) { setBaseId(r.id); setTargetId('current'); } else { setBaseId(contractRev.id); setTargetId(r.id); }
                        }}>Compare</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {compare ? (
            <div className="ew-card rev-compare">
              <div className="rev-compare__head">
                <h3>Compare</h3>
                <select className="ew-select" style={{ width: 200 }} value={base.id} onChange={(e) => setBaseId(e.target.value)} aria-label="Before">
                  {revs.map((r) => <option key={r.id} value={r.id}>Rev {r.number}{r.id === meta.contract?.revisionId ? ' (contract)' : ''}</option>)}
                </select>
                <span>→</span>
                <select className="ew-select" style={{ width: 200 }} value={targetId} onChange={(e) => setTargetId(e.target.value)} aria-label="Now">
                  <option value="current">The estimate now</option>
                  {revs.map((r) => <option key={r.id} value={r.id}>Rev {r.number}</option>)}
                </select>
              </div>
              <Compare c={compare} showAll={showAll} setShowAll={setShowAll} />

              {canEstimate ? (
                <div className="rev-request">
                  {targetId === 'current' ? (
                    <p className="ew-subtle">To ask for a change order, save the estimate as a revision first, then compare it with the contract.</p>
                  ) : !contractRev || base.id !== contractRev.id ? (
                    <p className="ew-subtle">A change order goes from the contract (Rev {contractRev?.number ?? 0}) to a newer revision: pick the contract on the left.</p>
                  ) : target.number <= base.number ? (
                    <p className="ew-subtle">Pick a revision newer than the contract on the right.</p>
                  ) : pendingFor(target.id) ? (
                    <p className="ew-subtle">A change order for Rev {target.number} is already waiting for approval.</p>
                  ) : (
                    <>
                      <label className="fld" style={{ flex: 1 }}>
                        <span>Message for the admins</span>
                        <input className="ew-input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. New drawings from the GC (rev C, Nov 10): 2nd floor deck added" />
                      </label>
                      <button type="button" className="ew-btn ew-btn--primary" disabled={!!busy || !canRequest} onClick={request}><Send size={13} /> Request change order · {signed(compare.amount)}</button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          <h3 className="rev-h">Change orders</h3>
          <ChangeOrderList
            orders={cos} cid={companyId} user={user} isAdmin={Boolean(perms?.isAdmin)} companyName={company?.name || ''}
            empty="No change orders for this project."
            onChanged={async (m, co) => { setMsg(m); setSentMail(null); applyMeta(co.projectId, await getProjectMeta(companyId, co.projectId)); await load(); }}
          />
          {busy ? <p className="ew-subtle">{busy}</p> : null}
        </>
      )}
    </div>
  );
}
