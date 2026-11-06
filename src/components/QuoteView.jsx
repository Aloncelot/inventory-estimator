// src/components/QuoteView.jsx
// The client quote: wall panels, loose material, trusses and labor (each can be
// left out), in detail or one line each, with tax and shipping as in Summary.
// Printable to PDF.
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Receipt, Printer } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { PageHeader, TextInput, NumInput, fmtMoney } from '@/components/ui/mat';
import { computeQuote } from '@/domain/estimate/quote';
import { useCompany } from '@/context/CompanyContext';
import { scopeOf } from '@/domain/scope';
import { getCurrency } from '@/domain/lib/currency';

/** Scope and terms by what the quote includes. */
function defaultScope(inc) {
  const has = (k) => inc[k] !== false;
  const parts = [];
  if (has('wallPanels')) parts.push(`${inc.structural === false ? 'partition' : inc.partitions === false ? 'exterior, bearing and shear' : 'exterior and interior'} wall panels built in the shop (studs, plates, headers, kings and jacks, posts, sheathing as specified), panel nails and fasteners, loose plates and blocking, temporary bracing`);
  if (has('loose')) parts.push('loose material: floor framing and subfloor, beams and posts, stairs, roof framing and sheathing, structural hardware and blocking as listed');
  if (has('trusses')) parts.push('floor and roof trusses');
  if (has('labor')) parts.push('installation labor: setting the panels, trusses and floor framing, exterior windows and doors, structural hardware, punch list');
  const out = ['labor', 'trusses', 'loose'].filter((k) => !has(k)).map((k) => ({ labor: 'installation', trusses: 'trusses', loose: 'loose material not listed' }[k]));
  return `Framing package: ${parts.join('; ')}.`
    + ` Excludes${out.length ? ` ${out.join(', ')},` : ''} interior doors, finishes, permits, and delivery unless shown.`
    + ' Quantities per the drawings listed; changes to the drawings are priced as a change order.';
}
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

/** One group of a part: an optional heading (a level), its lines, its subtotal when headed. */
function QuoteGroup({ g, showTitle }) {
  return (
    <>
      {showTitle ? <tr className="q-level"><td colSpan={3}>{g.title}</td></tr> : null}
      {g.lines.map((l) => (
        <tr key={l.key}>
          <td className={showTitle ? 'q-indent2' : 'q-indent'}>{l.label}</td>
          <td className="q-muted">{l.detail}</td>
          <td className="num">{fmtMoney(l.amount)}</td>
        </tr>
      ))}
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

  const detail = quote.detail || 'detail';
  const { company } = useCompany();
  const markupDefault = company?.materialMarkupPct ?? 0;
  const q = useMemo(() => computeQuote(est, { shipping: quote.shipping, detail, markupDefault }), [est, quote.shipping, detail, markupDefault]);
  const sc = scopeOf(est);
  const include = { wallPanels: sc.structural || sc.partitions, structural: sc.structural, partitions: sc.partitions, loose: sc.loose, trusses: sc.trusses, labor: sc.labor };
  const only = q.blocks.length === 1 && q.blocks[0].key === 'wallPanels';

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
        meta={q.blocks.map((b) => b.title).join(' · ') || 'Nothing included'}
        totalLabel="Quote total"
        total={q.total}
        actions={(
          <button type="button" className="ew-btn ew-btn--primary" onClick={() => window.print()} title="Print or save as PDF (choose “Save as PDF” as the printer)">
            <Printer size={13} /> Print / Save as PDF
          </button>
        )}
      />

      <div className="ew-card q-opts no-print">
        <span className="q-opts__lbl">Scope</span>
        <span className="ew-subtle">{q.blocks.map((b) => b.title).join(' · ') || 'Nothing in scope'} · set in Summary</span>
        <label className="fld">
          <span>Show</span>
          <select className="ew-select" value={detail} onChange={(e) => setQuote({ detail: e.target.value })}>
            <option value="detail">Each part in detail</option>
            <option value="summary">One line per part</option>
          </select>
        </label>
      </div>

      <article className="quote-doc" aria-label="Quote">
        <header className="q-head">
          <div className="q-from">
            <QField className="q-company" value={from.company} placeholder="Company name" onCommit={(v) => setFrom('company', v)} />
            <QField value={from.address} placeholder="Company address" onCommit={(v) => setFrom('address', v)} />
            <QField value={from.contact} placeholder="Phone · email" onCommit={(v) => setFrom('contact', v)} />
          </div>
          <div className="q-title">
            <h2>{only ? 'Wall Panels Quote' : 'Framing Quote'}</h2>
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
          {q.blocks.map((b) => (
            <tbody key={b.key}>
              {detail === 'detail' ? <tr className="q-group"><th colSpan={3}>{b.title}{b.note ? <span className="q-note"> · {b.note}</span> : null}</th></tr> : null}
              {b.groups.map((g) => (
                <QuoteGroup key={g.id} g={g} showTitle={Boolean(g.title) && detail === 'detail'} />
              ))}
              {detail === 'detail' ? <tr className="q-sub"><td colSpan={2}>{b.title} subtotal</td><td className="num">{fmtMoney(b.total)}</td></tr> : null}
            </tbody>
          ))}
          <tfoot>
            <tr><td colSpan={2}>Subtotal</td><td className="num">{fmtMoney(q.subtotal)}</td></tr>
            <tr>
              <td colSpan={2}>{q.taxExempt ? 'Sales tax (exempt)' : q.taxCountry ? `Sales tax ${q.taxLabel}${q.labor && !q.taxOnLabor ? ' on materials' : ''}` : 'Sales tax (none)'}</td>
              <td className="num">{fmtMoney(q.tax)}</td>
            </tr>
            <tr>
              <td colSpan={2}>Shipping</td>
              <td className="num">
                <span className="no-print"><NumInput w={96} step="0.01" value={q.shipping} onCommit={(v) => setQuote({ shipping: v })} aria-label="Shipping" /></span>
                <span className="print-only">{fmtMoney(q.shipping)}</span>
              </td>
            </tr>
            <tr className="q-total"><td colSpan={2}>Total <span className="q-cur">{getCurrency()}</span></td><td className="num">{fmtMoney(q.total)}</td></tr>
          </tfoot>
        </table>

        {q.blocks.length === 0 ? (
          <p className="q-muted no-print">Nothing to quote yet: fill Wall panels, Loose material, Trusses or Labor, and include them above.</p>
        ) : null}

        <section className="q-scope">
          <div className="q-lbl">Scope &amp; terms</div>
          <QField multiline value={quote.scope ?? defaultScope(include)} onCommit={(v) => setQuote({ scope: v })} />
          {quote.scope !== undefined ? <button type="button" className="ew-btn ew-btn--ghost no-print q-reset" onClick={() => updateProject((prev) => { const { scope, ...rest } = prev.quote || {}; return { ...prev, quote: rest }; })} title="Back to the text that follows what the quote includes">Default text</button> : null}
        </section>
      </article>
    </div>
  );
}
