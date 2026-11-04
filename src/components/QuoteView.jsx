// src/components/QuoteView.jsx
// Wall-panels-only quote for the client: per level and category, then bracing
// and manufacture, with tax and shipping as in Summary. Printable to PDF.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Receipt, Printer } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { PageHeader, TextInput, NumInput, fmtMoney } from '@/components/ui/mat';
import { computeWallPanelsQuote } from '@/domain/estimate/quote';

const DEFAULT_SCOPE = 'Wall panel framing package: exterior and interior wall panels, panel nails and fasteners, '
  + 'loose plates and blocking, temporary bracing and panel manufacture. Excludes trusses, floor and roof framing, '
  + 'hardware not listed, delivery unless shown, and installation.';
const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? String(iso) : DATE_FMT.format(d);
};
const addDays = (iso, days) => {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + (Number(days) || 0));
  return d.toISOString().slice(0, 10);
};

// company block is the same on every quote: remembered in this browser
const FROM_KEY = 'quote-from';
const readFrom = () => { try { return JSON.parse(localStorage.getItem(FROM_KEY) || '{}'); } catch { return {}; } };
const writeFrom = (v) => { try { localStorage.setItem(FROM_KEY, JSON.stringify(v)); } catch { /* storage blocked */ } };

/** Text field on screen, plain text on paper. */
function QField({ value, onCommit, placeholder, className = '', multiline = false }) {
  return (
    <>
      <TextInput className={`q-input no-print ${className}`} value={value || ''} placeholder={placeholder} onCommit={onCommit} multiline={multiline} />
      <span className={`print-only ${className}`}>{value || ''}</span>
    </>
  );
}

export default function QuoteView() {
  const { projectData, projectId, updateProject, isLoaded } = useProject();
  const est = useMemo(() => projectData?.estimateData || {}, [projectData]);
  const info = est.summaryInfo || {};
  const quote = est.quote || {};

  const [savedFrom, setSavedFrom] = useState({});
  useEffect(() => { setSavedFrom(readFrom()); }, []);
  const from = { ...savedFrom, ...(quote.from || {}) };

  const setQuote = useCallback((patch) => updateProject((prev) => ({ ...prev, quote: { ...(prev.quote || {}), ...patch } })), [updateProject]);
  const setFrom = (key, v) => {
    const next = { ...from, [key]: v };
    setQuote({ from: next });
    writeFrom(next);
    setSavedFrom(next);
  };

  const q = useMemo(() => computeWallPanelsQuote(est, { shipping: quote.shipping }), [est, quote.shipping]);

  if (!isLoaded || !projectData) {
    return (
      <div className="app-content">
        <PageHeader icon={Receipt} title="Quote" />
        <div className="empty-state">Open or create a project in Projects to prepare its quote.</div>
      </div>
    );
  }

  const quoteDate = info.estimateDate || new Date().toISOString().slice(0, 10);
  const validDays = quote.validDays ?? 30;
  const quoteNo = quote.quoteNo || `WP-${quoteDate.replace(/-/g, '')}-${String(projectId || '').slice(0, 4).toUpperCase()}`;

  return (
    <div className="app-content">
      <PageHeader
        icon={Receipt}
        title="Quote"
        meta="Wall panels only"
        totalLabel="Quote total"
        total={q.total}
        actions={(
          <button type="button" className="ew-btn ew-btn--primary" onClick={() => window.print()} title="Print or save as PDF (choose “Save as PDF” as the printer)">
            <Printer size={13} /> Print / Save as PDF
          </button>
        )}
      />

      <article className="quote-doc" aria-label="Wall panels quote">
        <header className="q-head">
          <div className="q-from">
            <QField className="q-company" value={from.company} placeholder="Company name" onCommit={(v) => setFrom('company', v)} />
            <QField value={from.address} placeholder="Company address" onCommit={(v) => setFrom('address', v)} />
            <QField value={from.contact} placeholder="Phone · email" onCommit={(v) => setFrom('contact', v)} />
          </div>
          <div className="q-title">
            <h2>Wall Panels Quote</h2>
            <dl>
              <dt>Quote #</dt><dd><QField value={quoteNo} onCommit={(v) => setQuote({ quoteNo: v })} /></dd>
              <dt>Date</dt><dd>{fmtDate(quoteDate)}</dd>
              <dt>Valid until</dt>
              <dd>
                {fmtDate(addDays(quoteDate, validDays))}
                <span className="no-print q-valid"> (<NumInput w={40} value={validDays} onCommit={(v) => setQuote({ validDays: v })} aria-label="Valid days" /> days)</span>
              </dd>
            </dl>
          </div>
        </header>

        <section className="q-to">
          <div>
            <div className="q-lbl">Prepared for</div>
            <QField className="q-strong" value={quote.clientName} placeholder="Client name" onCommit={(v) => setQuote({ clientName: v })} />
            <QField value={quote.clientContact} placeholder="Client contact" onCommit={(v) => setQuote({ clientContact: v })} />
          </div>
          <div>
            <div className="q-lbl">Project</div>
            <div className="q-strong">{info.projectName || projectData.name}</div>
            <div>{info.address || <span className="no-print q-muted">Add the project address in Summary</span>}</div>
            {info.drawingsDate ? <div className="q-muted">Drawings dated {fmtDate(info.drawingsDate)}</div> : null}
          </div>
        </section>

        <table className="q-table">
          <colgroup><col /><col style={{ width: '34%' }} /><col style={{ width: '18%' }} /></colgroup>
          <thead>
            <tr><th>Description</th><th>Detail</th><th className="num">Amount</th></tr>
          </thead>
          {q.groups.map((g) => (
            <tbody key={g.id}>
              <tr className="q-group"><th colSpan={3}>{g.title}</th></tr>
              {g.lines.map((l) => (
                <tr key={l.key}>
                  <td className="q-indent">{l.label}</td>
                  <td className="q-muted">{l.detail}</td>
                  <td className="num">{fmtMoney(l.amount)}</td>
                </tr>
              ))}
              <tr className="q-sub"><td colSpan={2}>{g.title} subtotal</td><td className="num">{fmtMoney(g.subtotal)}</td></tr>
            </tbody>
          ))}
          {q.general.length ? (
            <tbody>
              <tr className="q-group"><th colSpan={3}>All levels</th></tr>
              {q.general.map((l) => (
                <tr key={l.key}>
                  <td className="q-indent">{l.label}</td>
                  <td className="q-muted">{l.detail}</td>
                  <td className="num">{fmtMoney(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          ) : null}
          <tfoot>
            <tr><td colSpan={2}>Subtotal</td><td className="num">{fmtMoney(q.subtotal)}</td></tr>
            <tr>
              <td colSpan={2}>{q.taxExempt ? 'Sales tax (exempt)' : `Sales tax ${q.taxState} ${q.taxRate}%`}</td>
              <td className="num">{fmtMoney(q.tax)}</td>
            </tr>
            <tr>
              <td colSpan={2}>Shipping</td>
              <td className="num">
                <span className="no-print"><NumInput w={96} step="0.01" value={q.shipping} onCommit={(v) => setQuote({ shipping: v })} aria-label="Shipping" /></span>
                <span className="print-only">{fmtMoney(q.shipping)}</span>
              </td>
            </tr>
            <tr className="q-total"><td colSpan={2}>Total</td><td className="num">{fmtMoney(q.total)}</td></tr>
          </tfoot>
        </table>

        {q.groups.length === 0 && q.general.length === 0 ? (
          <p className="q-muted no-print">No wall panel amounts yet — fill the Wall panels page first.</p>
        ) : null}

        <section className="q-scope">
          <div className="q-lbl">Scope &amp; terms</div>
          <QField multiline value={quote.scope ?? DEFAULT_SCOPE} onCommit={(v) => setQuote({ scope: v })} />
        </section>
      </article>
    </div>
  );
}
