// src/components/Summary.jsx
'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { LayoutDashboard, RefreshCw, Lock, LockOpen } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { PageHeader, NumInput, TextInput, fmtMoney } from '@/components/ui/mat';
import { projectTotals } from '@/domain/aggregate/projectTotals';
import { useConfirm } from '@/components/ui/confirm';

const TAX_RATES = { MA: 6.25, RI: 7.0, CT: 6.35, ME: 5.5, NH: 0.0, 'NO TAX': 0.0 };

const parseStateFromAddress = (address) => {
  if (!address) return null;
  const match = address.match(/\b([A-Z]{2})\b/g);
  if (!match) return null;
  const st = match[match.length - 1];
  return TAX_RATES[st] !== undefined ? st : null;
};

export default function Summary() {
  const { projectData, updateProject, refreshProjectPrices, isSaving } = useProject();
  const est = useMemo(() => projectData?.estimateData || {}, [projectData]);
  const info = useMemo(() => est.summaryInfo || {}, [est.summaryInfo]);
  const snapshot = est.snapshotTotals || null;

  const setInfo = useCallback((key, value) => {
    updateProject((prev) => ({ ...prev, summaryInfo: { ...(prev.summaryInfo || {}), [key]: value } }));
  }, [updateProject]);

  // first open: fill estimate date and project name
  useEffect(() => {
    if (!projectData) return;
    const needsDate = !info.estimateDate;
    const needsName = !info.projectName && projectData.name;
    if (!needsDate && !needsName) return;
    const d = new Date();
    const iso = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
    updateProject((prev) => ({
      ...prev,
      summaryInfo: {
        ...(prev.summaryInfo || {}),
        ...(needsDate ? { estimateDate: iso } : {}),
        ...(needsName ? { projectName: projectData.name } : {}),
      },
    }));
  }, [projectData, info.estimateDate, info.projectName, updateProject]);

  const totals = projectTotals(est);
  const state = info.taxState || parseStateFromAddress(info.address) || 'NO TAX';
  const taxRate = info.isTaxExempt ? 0 : (TAX_RATES[state] || 0);
  const tax = totals.subtotal * (taxRate / 100);
  const shipping = Number(info.shipping) || 0;
  const grand = totals.subtotal + tax + shipping;

  const confirm = useConfirm();
  const lockTotals = async () => {
    if (!(await confirm({ title: 'Lock as original quote?', message: 'These totals are saved as the original quote, and later changes are compared against them.', confirmLabel: 'Lock quote' }))) return;
    updateProject((prev) => ({
      ...prev,
      snapshotTotals: {
        wallPanelsTotal: totals.wallPanels, trussTotal: totals.trusses, looseTotal: totals.loose,
        subtotal: totals.subtotal, taxAmount: tax, shippingAmount: shipping, grandTotal: grand,
        lockedAt: new Date().toISOString(),
      },
    }));
  };
  const clearSnapshot = async () => {
    if (await confirm({ title: 'Clear the original quote?', message: 'The comparison columns disappear. Lock a new quote any time.', confirmLabel: 'Clear quote', tone: 'danger' })) updateProject((prev) => ({ ...prev, snapshotTotals: null }));
  };
  const refresh = async () => {
    if (await confirm({ title: 'Refresh prices?', message: 'Every selected item gets the latest price from the material list. Totals update right away.', confirmLabel: 'Refresh prices' })) refreshProjectPrices();
  };

  if (!projectData) {
    return (
      <div className="app-content">
        <PageHeader icon={LayoutDashboard} title="Summary" />
        <div className="empty-state">Open or create a project in Projects to see its summary.</div>
      </div>
    );
  }

  const lines = [
    ['Wall panels', totals.wallPanels, snapshot?.wallPanelsTotal],
    ['Loose material', totals.loose, snapshot?.looseTotal],
    ['Trusses', totals.trusses, snapshot?.trussTotal],
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
        </div>
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
            {lines.map(([label, cur, orig]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="num">{fmtMoney(cur)}</td>
                {snapshot ? <td className="num ew-subtle">{orig !== undefined ? fmtMoney(orig) : '—'}</td> : null}
                {snapshot ? diffCell(orig, cur) : null}
              </tr>
            ))}
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
                  {!info.isTaxExempt ? (
                    <select className="ew-select" style={{ width: 90 }} value={state} onChange={(e) => setInfo('taxState', e.target.value)} title="Detected from the address; change if needed">
                      {Object.keys(TAX_RATES).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : null}
                  <span className="ew-subtle">{taxRate.toFixed(2)}%</span>
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
