"use client";
import { useMemo, useEffect, useState } from "react";

const DEFAULT_RATES = {
  exteriorWalls:   { ratePerLF: 10.50, ratePerPanel: 84.00 },
  interiorShear:   { ratePerLF: 10.25, ratePerPanel: 82.00 },
  interiorBlocking:{ ratePerLF:  6.50, ratePerPanel: 52.00 },
  interiorNonLoad: { ratePerLF:  6.00, ratePerPanel: 48.00 },
  kneeWall:        { ratePerLF:  4.50, ratePerPanel: 36.00 },
  windows:         { each: 20.05 },
  exteriorDoors:   { each: 15.19 },
  blocking2x10:    { each: 0.60 }, // per row
};

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  currencyDisplay: "narrowSymbol",
});
function money(n){ return USD.format(Number(n || 0)); }
function fmt(n){ return Number(n || 0).toLocaleString("en-US"); }

export default function PanelsManufactureEstimate({
  rows = {},
  panelLenFt = 8,
  panelLenFtExterior,
  rates = DEFAULT_RATES,
  defaultCollapsed = false,
  persistKey = "inv:v1:ui:manufactureCollapsed",
  persistRatesKey = "inv:v1:ui:manufactureRates",
  onTotalChange,
  exteriorLF = 0
}) {
  const [collapsed, setCollapsed] = useState(!!defaultCollapsed);

  // editable Rate per LF, per LF-row key
  const [ratePerLFByKey, setRatePerLFByKey] = useState({
    exteriorWalls:   rates.exteriorWalls?.ratePerLF ?? 0,
    interiorShear:   rates.interiorShear?.ratePerLF ?? 0,
    interiorBlockingOnly: rates.interiorBlocking?.ratePerLF ?? 0,
    interiorNonLoad: rates.interiorNonLoad?.ratePerLF ?? 0,
    kneeWall:        rates.kneeWall?.ratePerLF ?? 0,
  });

  // load persisted collapse
  useEffect(() => {
    try {
      const raw = localStorage.getItem(persistKey);
      if (raw !== null) setCollapsed(raw === "1");
    } catch {}
  }, [persistKey]);

  // persist collapse
  useEffect(() => {
    try { localStorage.setItem(persistKey, collapsed ? "1" : "0"); } catch {}
  }, [collapsed, persistKey]);

  // load persisted rates
  useEffect(() => {
    try {
      const raw = localStorage.getItem(persistRatesKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          setRatePerLFByKey(prev => ({ ...prev, ...saved }));
        }
      }
    } catch {}
    // also (re)seed from incoming rates if they change
  }, [persistRatesKey, rates]);

  // persist rates on change
  useEffect(() => {
    try { localStorage.setItem(persistRatesKey, JSON.stringify(ratePerLFByKey)); } catch {}
  }, [ratePerLFByKey, persistRatesKey]);

  // safe shape from parent
  const safe = {
    exteriorWalls: rows.exteriorWalls || { lf:0, panels:0 },
    interiorShear: rows.interiorShear || { lf:0, panels:0 },
    interiorBlockingOnly: rows.interiorBlockingOnly || { lf:0, panels:0 },
    interiorNonLoad: rows.interiorNonLoad || { lf:0, panels:0 },
    kneeWall: rows.kneeWall || { lf:0, panels:0 },
    windows: rows.windows || { qty:0 },
    exteriorDoors: rows.exteriorDoors || { qty:0 },
    blocking2x10: rows.blocking2x10 || { rows:0 },
  };

  const lines = useMemo(() => {
    const L = [];
    const pushLF = (label, key, r) => {
      const lf = key === 'exteriorWalls' 
      ? Number(exteriorLF || 0) 
      : Number(safe[key].lf || 0);
      const panelLenThisRow = (key === 'exteriorWalls' && Number(panelLenFtExterior || 0) > 0)
        ? Number(panelLenFtExterior)
        : panelLenFt;
      const panels = safe[key].panels || Math.round(lf / Math.max(1, panelLenThisRow));
      const rateLF = Number(ratePerLFByKey[key] ?? r.ratePerLF ?? 0);
      const subtotal = lf * rateLF;

      L.push({
        key, label,
        lf,
        panelLenFt: panelLenThisRow,
        panels,
        ratePerLF: rateLF,
        ratePerPanel: r.ratePerPanel,
        total: subtotal
      });
    };
    
    pushLF("Exterior Walls", "exteriorWalls", rates.exteriorWalls);
    pushLF("Interior Shear walls", "interiorShear", rates.interiorShear);
    pushLF("Interior wall with blocking only", "interiorBlockingOnly", rates.interiorBlocking);
    pushLF("Interior Non-load bearing walls", "interiorNonLoad", rates.interiorNonLoad);
    pushLF("Knee wall", "kneeWall", rates.kneeWall);

    // unit-based items (not editable)
    L.push({
      key: 'windows',
      label: "Windows",
      lf: "0", panelLenFt: "n/a", panels: "n/a",
      ratePerLF: rates.windows.each, ratePerPanel: "n/a",
      total: (safe.windows.qty || 0) * (rates.windows.each || 0),
      qtyOnly: true, qty: safe.windows.qty || 0,
    });
    L.push({
      key: 'exteriorDoors',
      label: "Exterior Doors",
      lf: "0", panelLenFt: "n/a", panels: "n/a",
      ratePerLF: rates.exteriorDoors.each, ratePerPanel: "n/a",
      total: (safe.exteriorDoors.qty || 0) * (rates.exteriorDoors.each || 0),
      qtyOnly: true, qty: safe.exteriorDoors.qty || 0,
    });
    L.push({
      key: 'blocking2x10',
      label: "2x10 blocking rows",
      lf: "0", panelLenFt: "n/a", panels: "n/a",
      ratePerLF: rates.blocking2x10.each, ratePerPanel: "n/a",
      total: (safe.blocking2x10.rows || 0) * (rates.blocking2x10.each || 0),
      qtyOnly: true, qty: safe.blocking2x10.rows || 0,
    });

    return L;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rows), panelLenFt, JSON.stringify(rates), exteriorLF, ratePerLFByKey]);

  const totals = useMemo(() => {
    const lf = lines.reduce((s, x) => s + (Number(x.lf) || 0), 0);
    const panels = lines.reduce((s, x) => s + (Number(x.panels) || 0), 0);
    const total = lines.reduce((s, x) => s + (Number(x.total) || 0), 0);
    return { lf, panels, total };
  }, [lines]);

  useEffect(() => {
    if (typeof onTotalChange === 'function') {
      onTotalChange({ total: totals.total });
    }
  }, [totals.total, onTotalChange]);

  const contentId = "manufacture-estimate-body";

  const handleRateChange = (key) => (e) => {
    const val = Number(e.target.value);
    setRatePerLFByKey(prev => ({ ...prev, [key]: Number.isFinite(val) ? val : 0 }));
  };

  return (
    <section className="ew-card">
      <div className="ew-head" style={{ justifyContent:'space-between' }}>
        <h2 className="ew-h2" style={{ margin:0 }}>Panels Manufacture Estimate</h2>
        <button
          type="button"
          className="ew-chip"
          onClick={() => setCollapsed(v => !v)}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? '▶' : '🔽'} {money(totals.total)}
        </button>
      </div>

      {!collapsed && (
        <div className="table-wrap" id={contentId}>
          <table className="tbl" style={{ width:'100%', tableLayout:'fixed' }}>
            <colgroup>
              <col style={{ width:'26%' }} />
              <col style={{ width:'13%' }} />
              <col style={{ width:'13%' }} />
              <col style={{ width:'13%' }} />
              <col style={{ width:'12%' }} />
              <col style={{ width:'12%' }} />
              <col style={{ width:'11%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Wall type</th>
                <th className="num">lf / qty</th>
                <th className="num">panel</th>
                <th className="num"># panels</th>
                <th className="num">Rate per lf</th>
                <th className="num">Rate per panel</th>
                <th className="num">Final price per</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((r, i) => {
                const isEditableLF = !r.qtyOnly && typeof r.ratePerLF === 'number';
                return (
                  <tr key={r.key || i}>
                    <td>{r.label}</td>
                    <td className="num">{r.qtyOnly ? fmt(r.qty) : fmt(r.lf)}</td>
                    <td className="num">{r.panelLenFt}</td>
                    <td className="num">{r.qtyOnly ? "n/a" : fmt(r.panels)}</td>
                    <td className="num">
                      {isEditableLF ? (
                        <input
                          className="ew-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={ratePerLFByKey[r.key]}
                          onChange={handleRateChange(r.key)}
                          style={{ width: 110, textAlign:'right', padding: '6px 8px' }}
                          aria-label={`Rate per LF for ${r.label}`}
                          title="Rate per LF"
                        />
                      ) : (
                        money(r.ratePerLF)
                      )}
                    </td>
                    <td className="num">{r.ratePerPanel === "n/a" ? "n/a" : money(r.ratePerPanel)}</td>
                    <td className="num">{money(r.total)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th>TOTALS</th>
                <th className="num">{fmt(totals.lf)}</th>
                <th className="num">{panelLenFt}</th>
                <th className="num">{fmt(totals.panels)}</th>
                <th></th>
                <th></th>
                <th className="num">{money(totals.total)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
