// src/components/Summary.jsx
'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { LayoutDashboard, RefreshCw, Lock, LockOpen } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { PageHeader, NumInput, TextInput, fmtMoney } from '@/components/ui/mat';
import { projectTotals } from '@/domain/aggregate/projectTotals';
import { useConfirm } from '@/components/ui/confirm';

import { US_STATES, CA_PROVINCES, NO_TAX, SOURCES, regionOf, taxFor } from '@/domain/lib/tax';
import { CURRENCIES, currencyOf } from '@/domain/lib/currency';
import { SCOPE_PARTS, scopeOf } from '@/domain/scope';
import { useCompany } from '@/context/CompanyContext';

export default function Summary() {
  const { projectData, updateProject, refreshProjectPrices, isSaving } = useProject();
  const { company } = useCompany();
  const markupDefault = company?.materialMarkupPct ?? 0;
  const est = useMemo(() => projectData?.estimateData || {}, [projectData]);
  const info = useMemo(() => est.summaryInfo || {}, [est.summaryInfo]);
  const snapshot = est.snapshotTotals || null;

  const setInfo = useCallback((key, value) => {
    updateProject((prev) => ({ ...prev, summaryInfo: { ...(prev.summaryInfo || {}), [key]: value } }));
  }, [updateProject]);

  // first open: fill estimate date, project name and the company's material markup
  useEffect(() => {
    if (!projectData) return;
    const needsDate = !info.estimateDate;
    const needsName = !info.projectName && projectData.name;
    const needsMarkup = info.materialMarkupPct === undefined && company?.materialMarkupPct != null;
    if (!needsDate && !needsName && !needsMarkup) return;
    const d = new Date();
    const iso = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
    updateProject((prev) => ({
      ...prev,
      summaryInfo: {
        ...(prev.summaryInfo || {}),
        ...(needsDate ? { estimateDate: iso } : {}),
        ...(needsName ? { projectName: projectData.name } : {}),
        ...(needsMarkup ? { materialMarkupPct: company.materialMarkupPct } : {}),
      },
    }));
  }, [projectData, info.estimateDate, info.projectName, info.materialMarkupPct, company?.materialMarkupPct, updateProject]);

  const totals = projectTotals(est, { markupDefault });
  const taxInfo = taxFor(info);
  const state = taxInfo.state;
  const region = regionOf(state);
  const taxRate = taxInfo.rate;
  // sales tax on the materials; on labor too when the state taxes it
  const taxBase = info.taxLabor ? totals.subtotal : totals.materials;
  const tax = taxBase * (taxRate / 100);
  const shipping = Number(info.shipping) || 0;
  const grand = totals.subtotal + tax + shipping;

  const confirm = useConfirm();
  const lockTotals = async () => {
    if (!(await confirm({ title: 'Lock as original quote?', message: 'These totals are saved as the original quote, and later changes are compared against them.', confirmLabel: 'Lock quote' }))) return;
    updateProject((prev) => ({
      ...prev,
      snapshotTotals: {
        wallPanelsTotal: totals.wallPanels, trussTotal: totals.trusses, looseTotal: totals.loose, laborTotal: totals.labor,
        markupTotal: totals.markup, markupPct: totals.markupPct,
        subtotal: totals.subtotal, taxAmount: tax, shippingAmount: shipping, grandTotal: grand,
        lockedAt: new Date().toISOString(),
      },
    }));
  };
  const clearSnapshot = async () => {
    if (await confirm({ title: 'Clear the original quote?', message: 'The comparison columns disappear. Lock a new quote any time.', confirmLabel: 'Clear quote', tone: 'danger' })) updateProject((prev) => ({ ...prev, snapshotTotals: null }));
  };
  const refresh = async () => {
    if (await confirm({ title: 'Refresh prices?', message: 'Every selected item gets the latest price from the price list. Totals update right away.', confirmLabel: 'Refresh prices' })) refreshProjectPrices();
  };

  if (!projectData) {
    return (
      <div className="app-content">
        <PageHeader icon={LayoutDashboard} title="Summary" />
        <div className="empty-state">Open or create a project in Projects to see its summary.</div>
      </div>
    );
  }

  const sc = scopeOf(est);
  const setScope = (key, v) => updateProject((prev) => ({ ...prev, scope: { ...(prev.scope || {}), [key]: v } }));
  const wpLabel = sc.structural && sc.partitions ? 'Wall panels' : sc.structural ? 'Wall panels · structural' : sc.partitions ? 'Wall panels · partitions' : 'Wall panels';
  const lines = [
    [wpLabel, totals.wallPanels, snapshot?.wallPanelsTotal, sc.structural || sc.partitions],
    ['Loose material', totals.loose, snapshot?.looseTotal, sc.loose],
    ['Trusses', totals.trusses, snapshot?.trussTotal, sc.trusses],
    [`Labor (${totals.laborBy === 'sqft' ? 'per sq ft' : `by time · ${Math.round(totals.laborHours).toLocaleString('en-US')} h`})`, totals.labor, snapshot?.laborTotal, sc.labor],
  ];
  const diffCell = (orig, cur) => {
    if (orig === undefined || orig === null) return <td className="num ew-subtle">—</td>;
    const d = cur - orig;
    const color = d > 0 ? 'var(--danger)' : d < 0 ? 'var(--ok)' : 'var(--text-300)';
    return <td className="num" style={{ color }}>{d === 0 ? '—' : `${d > 0 ? '+' : ''}${fmtMoney(d)}`}</td>;
  };

  return (
    <div className="app-content">
      <PageHeader
        icon={LayoutDashboard}
        title="Summary"
        meta={projectData.name}
        totalLabel="Grand total"
        total={grand}
        actions={(
          <>
            <button type="button" className="ew-btn" onClick={refresh} disabled={isSaving} title="Reload prices for all items">
              <RefreshCw size={12} className={isSaving ? 'animate-spin' : ''} /> {isSaving ? 'Refreshing…' : 'Refresh prices'}
            </button>
            {snapshot ? (
              <button type="button" className="ew-btn" onClick={clearSnapshot}><LockOpen size={12} /> Clear original quote</button>
            ) : (
              <button type="button" className="ew-btn ew-btn--primary" onClick={lockTotals}><Lock size={12} /> Lock as original quote</button>
            )}
          </>
        )}
      />

      <div className="ew-card">
        <div className="toolbar" style={{ padding: 0 }}>
          <label className="fld" style={{ '--w': '220px' }}><span>Project name</span><TextInput value={info.projectName || ''} onCommit={(v) => setInfo('projectName', v)} /></label>
          <label className="fld" style={{ '--w': '300px' }}><span>Address</span><TextInput value={info.address || ''} onCommit={(v) => setInfo('address', v)} placeholder="Street, City, ST 00000" /></label>
          <label className="fld" style={{ '--w': '130px' }}><span>Drawings date</span><input className="ew-input" type="date" value={info.drawingsDate || ''} onChange={(e) => setInfo('drawingsDate', e.target.value)} /></label>
          <label className="fld" style={{ '--w': '130px' }}><span>Estimate date</span><input className="ew-input" type="date" value={info.estimateDate || ''} onChange={(e) => setInfo('estimateDate', e.target.value)} /></label>
          <label className="fld" style={{ '--w': '170px' }} title="Which dollars the prices and totals are in. Prices are shown as entered in the price lists: no exchange conversion. Unset, a Canadian tax province makes it CAD.">
            <span>Currency</span>
            <select className="ew-select" value={info.currency || ''} onChange={(e) => setInfo('currency', e.target.value || null)}>
              <option value="">{`Auto · ${currencyOf({ ...info, currency: null })}`}</option>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="ew-card sm-scope" style={{ maxWidth: 820 }}>
        <strong>Scope</strong>
        <div className="sm-scope__grp">
          <span className="sm-scope__lbl">Wall panels</span>
          {SCOPE_PARTS.filter((p) => p.group === 'wallPanels').map((p) => (
            <label key={p.key} className="pv-check" title={p.hint}><input type="checkbox" checked={sc[p.key]} onChange={(e) => setScope(p.key, e.target.checked)} /> {p.label} <span className="ew-subtle">({p.hint.toLowerCase()})</span></label>
          ))}
        </div>
        <div className="sm-scope__grp">
          {SCOPE_PARTS.filter((p) => !p.group).map((p) => (
            <label key={p.key} className="pv-check"><input type="checkbox" checked={sc[p.key]} onChange={(e) => setScope(p.key, e.target.checked)} /> {p.label}</label>
          ))}
        </div>
        <span className="ew-subtle">What the price covers: Summary, Labor, the Takeoff list and the Quote leave out the rest.</span>
      </div>

      <div className="ew-card" style={{ maxWidth: 820 }}>
        <table className="tbl">
          <colgroup><col /><col style={{ width: 150 }} />{snapshot ? <><col style={{ width: 150 }} /><col style={{ width: 120 }} /></> : null}</colgroup>
          <thead>
            <tr>
              <th>Category</th>
              <th className="num">Current</th>
              {snapshot ? <th className="num">Original ({new Date(snapshot.lockedAt).toLocaleDateString()})</th> : null}
              {snapshot ? <th className="num">Difference</th> : null}
            </tr>
          </thead>
          <tbody>
            {lines.map(([label, cur, orig, on]) => (
              <tr key={label} className={on ? '' : 'sm-out'}>
                <td>{label}{on ? null : <span className="ew-subtle"> · not in scope</span>}</td>
                <td className="num">{fmtMoney(cur)}</td>
                {snapshot ? <td className="num ew-subtle">{orig !== undefined ? fmtMoney(orig) : '—'}</td> : null}
                {snapshot ? diffCell(orig, cur) : null}
              </tr>
            ))}
            <tr>
              <td>
                <div className="ew-inline" title="Added to the wall panel materials and loose material (not to panel manufacture, trusses or labor). The quote shows the prices with it; the estimate pages and the price list show cost.">
                  <span>Material markup</span>
                  <NumInput w={64} step="0.5" value={totals.markupPct} onCommit={(v) => setInfo('materialMarkupPct', Math.max(0, v))} aria-label="Material markup %" />
                  <span className="ew-subtle">% of {fmtMoney(totals.markupBase)} in materials</span>
                  {!totals.markupPct ? <span className="sm-warn">No markup on materials</span> : null}
                </div>
              </td>
              <td className="num">{fmtMoney(totals.markup)}</td>
              {snapshot ? <td className="num ew-subtle">{snapshot.markupTotal !== undefined ? fmtMoney(snapshot.markupTotal) : '—'}</td> : null}
              {snapshot ? diffCell(snapshot.markupTotal, totals.markup) : null}
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>Subtotal</td>
              <td className="num money-section">{fmtMoney(totals.subtotal)}</td>
              {snapshot ? <td className="num ew-subtle">{fmtMoney(snapshot.subtotal)}</td> : null}
              {snapshot ? diffCell(snapshot.subtotal, totals.subtotal) : null}
            </tr>
            <tr>
              <td>
                <div className="ew-inline">
                  <span>Tax</span>
                  <label className="fld"><input type="checkbox" checked={!!info.isTaxExempt} onChange={(e) => setInfo('isTaxExempt', e.target.checked)} /><span>Exempt</span></label>
                  {!info.isTaxExempt ? <label className="fld" title="Sales tax goes on the materials; tick it where the state taxes labor too"><input type="checkbox" checked={!!info.taxLabor} onChange={(e) => setInfo('taxLabor', e.target.checked)} /><span>On labor too</span></label> : null}
                  {!info.isTaxExempt ? (
                    <>
                      <select className="ew-select tx-select" value={state} onChange={(e) => setInfo('taxState', e.target.value)} title="State or province of the job site, detected from the address; change if needed">
                        <option value={NO_TAX}>No tax</option>
                        <optgroup label="United States">
                          {US_STATES.map((r) => <option key={r.code} value={r.code}>{r.code} · {r.name}</option>)}
                        </optgroup>
                        <optgroup label="Canada">
                          {CA_PROVINCES.map((r) => <option key={r.code} value={r.code}>{r.code} · {r.name}</option>)}
                        </optgroup>
                      </select>
                      {region?.country === 'US' ? (
                        <label className="fld tx-local" title={`City, county and district rate of the job site. ${region.name} average: ${region.avgLocal}%`}>
                          <span>+ local</span>
                          <NumInput w={56} step="0.001" value={info.taxLocal ?? 0} onCommit={(v) => setInfo('taxLocal', Math.max(0, v))} aria-label="Local tax rate" />
                          <span className="ew-subtle">% (avg {region.avgLocal}%)</span>
                        </label>
                      ) : null}
                    </>
                  ) : null}
                  <span className="ew-subtle" title={region ? SOURCES[region.country] : ''}>
                    {info.isTaxExempt || !region ? `${taxRate.toFixed(2)}%` : region.country === 'CA' ? taxInfo.label.replace(`${region.code} `, '') + ` = ${+taxRate.toFixed(3)}%` : `${+taxRate.toFixed(3)}%`}
                  </span>
                </div>
              </td>
              <td className="num">{fmtMoney(tax)}</td>
              {snapshot ? <td className="num ew-subtle">{fmtMoney(snapshot.taxAmount)}</td> : null}
              {snapshot ? diffCell(snapshot.taxAmount, tax) : null}
            </tr>
            <tr>
              <td>Shipping</td>
              <td className="num"><NumInput w={110} value={info.shipping ?? 0} onCommit={(v) => setInfo('shipping', v)} aria-label="Shipping" /></td>
              {snapshot ? <td className="num ew-subtle">{fmtMoney(snapshot.shippingAmount)}</td> : null}
              {snapshot ? diffCell(snapshot.shippingAmount, shipping) : null}
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>Grand total</td>
              <td className="num money-grand">{fmtMoney(grand)}</td>
              {snapshot ? <td className="num">{fmtMoney(snapshot.grandTotal)}</td> : null}
              {snapshot ? diffCell(snapshot.grandTotal, grand) : null}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
