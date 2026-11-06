// src/components/TakeoffView.jsx
// The takeoff list: materials and quantities by level. Wall panels by wall
// type, loose material by what it is; the project's bracing, trusses and panel
// manufacture at the end. Prices stay hidden unless asked for: the list shows
// the final value only. Printable, and downloadable as CSV.
'use client';

import { useMemo } from 'react';
import { ClipboardList, Printer, Download } from 'lucide-react';
import { useProject } from '@/context/ProjectContext';
import { PageHeader, fmtMoney } from '@/components/ui/mat';
import { buildTakeoff, takeoffCsv } from '@/domain/takeoff';

const qtyFmt = (v) => (Math.round(n(v) * 100) / 100).toLocaleString('en-US');
function n(v) { return Number(v) || 0; }

function Group({ g, prices }) {
  return (
    <table className="tbl tk-tbl">
      <colgroup>
        <col className="tk-c-use" /><col /><col className="tk-c-q" /><col className="tk-c-u" />
        {prices ? <><col className="tk-c-p" /><col className="tk-c-p" /></> : null}
      </colgroup>
      <thead>
        <tr>
          <th className="tk-g">{g.label}</th>
          <th>Material</th>
          <th className="num">Qty</th>
          <th>Unit</th>
          {prices ? <><th className="num">Unit price</th><th className="num">Total</th></> : null}
        </tr>
      </thead>
      <tbody>
        {g.lines.map((l) => (
          <tr key={l.key} className={l.picked ? '' : 'tk-unpicked'}>
            {/* what it is for, then the material; a row with nothing picked has only its use */}
            <td className="tk-use">{l.picked ? l.uses.join(' · ') : l.name}</td>
            <td>{l.picked ? <span className="tk-name">{l.name}</span> : <span className="tk-warn" title="No material picked for this row in the estimate">not picked</span>}</td>
            <td className="num">{qtyFmt(l.qty)}</td>
            <td className="ew-subtle">{l.unit}</td>
            {prices ? <><td className="num">{fmtMoney(l.unitPrice)}</td><td className="num">{fmtMoney(l.total)}</td></> : null}
          </tr>
        ))}
      </tbody>
      {prices ? <tfoot><tr><td colSpan={5}>Subtotal</td><td className="num">{fmtMoney(g.total)}</td></tr></tfoot> : null}
    </table>
  );
}

export default function TakeoffView() {
  const { projectData, updateProject, isLoaded } = useProject();
  const est = useMemo(() => projectData?.estimateData || {}, [projectData]);
  const t = useMemo(() => buildTakeoff(est), [est]);
  const prices = Boolean(est.takeoff?.prices);
  const setTk = (patch) => updateProject((prev) => ({ ...prev, takeoff: { ...(prev.takeoff || {}), ...patch } }));
  const setPrices = (v) => setTk({ prices: v });
  const name = est.summaryInfo?.projectName || projectData?.name || 'Project';

  if (!isLoaded || !projectData) {
    return (
      <div className="app-content">
        <PageHeader icon={ClipboardList} title="Takeoff list" />
        <div className="empty-state">Open or create a project in Projects to see its takeoff list.</div>
      </div>
    );
  }

  const download = () => {
    const blob = new Blob([takeoffCsv(t, { prices })], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${name} - takeoff.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="app-content">
      <PageHeader
        icon={ClipboardList}
        title="Takeoff list"
        meta={`${t.levels.length} level${t.levels.length === 1 ? '' : 's'}`}
        totalLabel="Materials value"
        total={t.total}
        actions={(
          <>
            <label className="fld no-print" title="Wall panels are what the shop builds and ships. Auto: sheathing goes on in the shop when the sheets run vertical and are as tall as the panel; horizontal sheets or taller walls are sheathed on site, so their sheets ship loose.">
              <span>Wall sheathing</span>
              <select className="ew-select" value={est.takeoff?.sheathing || 'auto'} onChange={(e) => setTk({ sheathing: e.target.value })}>
                <option value="auto">Auto ({est.layout?.sheathing === 'horizontal' ? 'horizontal: loose' : 'by wall height'})</option>
                <option value="panels">Installed on the panels</option>
                <option value="loose">Loose, sheathed on site</option>
              </select>
            </label>
            <label className="pv-check no-print"><input type="checkbox" checked={prices} onChange={(e) => setPrices(e.target.checked)} /> Show prices</label>
            <button type="button" className="ew-btn ew-btn--ghost no-print" onClick={download} title="Download the list as CSV (Excel, Google Sheets)"><Download size={13} /> CSV</button>
            <button type="button" className="ew-btn ew-btn--primary no-print" onClick={() => window.print()} title="Print or save as PDF"><Printer size={13} /> Print / PDF</button>
          </>
        )}
      />

      <article className="tk-doc">
        <header className="tk-head print-only">
          <h2>{name} · Takeoff list</h2>
          <span>{est.summaryInfo?.address || ''}</span>
        </header>

        {t.levels.map((lv) => (
          <section key={lv.id} className="ew-card tk-level">
            <h3 className="tk-lvl">{lv.name}{prices ? <span className="tk-lvl__total">{fmtMoney(lv.total)}</span> : null}</h3>
            {lv.wallPanels.length ? (
              <>
                <h4 className="tk-part">Wall panels</h4>
                {lv.wallPanels.map((g) => <Group key={g.key} g={g} prices={prices} />)}
              </>
            ) : null}
            {lv.loose.length ? (
              <>
                <h4 className="tk-part">Loose material</h4>
                {lv.loose.map((g) => <Group key={g.key} g={g} prices={prices} />)}
              </>
            ) : null}
          </section>
        ))}

        {t.project.length ? (
          <section className="ew-card tk-level">
            <h3 className="tk-lvl">Whole project</h3>
            {t.project.map((g) => <Group key={g.key} g={g} prices={prices} />)}
          </section>
        ) : null}

        <div className="ew-card tk-final">
          <span>Materials value{prices ? '' : ' (prices hidden)'}</span>
          <strong className="money-grand">{fmtMoney(t.total)}</strong>
        </div>
        {!t.levels.length ? <div className="empty-state">No materials yet: fill Wall panels and Loose material.</div> : null}
      </article>
    </div>
  );
}
