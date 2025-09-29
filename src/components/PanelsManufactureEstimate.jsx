// src/components/PanelsManufactureEstimate.jsx
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
  rates = DEFAULT_RATES,
  defaultCollapsed = false,
  persistKey = "inv:v1:ui:manufactureCollapsed",
  onTotalChange,
}) {
  const [collapsed, setCollapsed] = useState(!!defaultCollapsed);

  // load persisted state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(persistKey);
      if (raw !== null) setCollapsed(raw === "1");
    } catch {}
  }, [persistKey]);

  // persist on change
  useEffect(() => {
    try { localStorage.setItem(persistKey, collapsed ? "1" : "0"); } catch {}
  }, [collapsed, persistKey]);

  // safe shape
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
      const lf = Number(safe[key].lf || 0);
      const panels = safe[key].panels || Math.round(lf / Math.max(1, panelLenFt));
      const subtotal = lf * (r.ratePerLF || 0); // switch to per-panel if needed
      L.push({ label, lf, panelLenFt, panels, ratePerLF: r.ratePerLF, ratePerPanel: r.ratePerPanel, total: subtotal });
    };

    pushLF("Exterior Walls", "exteriorWalls", rates.exteriorWalls);
    pushLF("Interior Shear walls", "interiorShear", rates.interiorShear);
    pushLF("Interior wall with blocking only", "interiorBlockingOnly", rates.interiorBlocking);
    pushLF("Interior Non-load bearing walls", "interiorNonLoad", rates.interiorNonLoad);
    pushLF("Knee wall", "kneeWall", rates.kneeWall);

    // unit-based items
    L.push({
      label: "Windows",
      lf: "0", panelLenFt: "n/a", panels: "n/a",
      ratePerLF: rates.windows.each, ratePerPanel: "n/a",
      total: (safe.windows.qty || 0) * (rates.windows.each || 0),
      qtyOnly: true, qty: safe.windows.qty || 0,
    });
    L.push({
      label: "Exterior Doors",
      lf: "0", panelLenFt: "n/a", panels: "n/a",
      ratePerLF: rates.exteriorDoors.each, ratePerPanel: "n/a",
      total: (safe.exteriorDoors.qty || 0) * (rates.exteriorDoors.each || 0),
      qtyOnly: true, qty: safe.exteriorDoors.qty || 0,
    });
    L.push({
      label: "2x10 blocking rows",
      lf: "0", panelLenFt: "n/a", panels: "n/a",
      ratePerLF: rates.blocking2x10.each, ratePerPanel: "n/a",
      total: (safe.blocking2x10.rows || 0) * (rates.blocking2x10.each || 0),
      qtyOnly: true, qty: safe.blocking2x10.rows || 0,
    });

    return L;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rows), panelLenFt, JSON.stringify(rates)]);

  const totals = useMemo(() => {
    const lf = lines.reduce((s, x) => s + (Number(x.lf) || 0), 0);
    const panels = lines.reduce((s, x) => s + (Number(x.panels) || 0), 0);
    const total = lines.reduce((s, x) => s + (Number(x.total) || 0), 0);
    return { lf, panels, total };
  }, [lines]);

  useEffect( () => {
    if ( typeof onTotalChange === 'function') {
      onTotalChange ({ total: totals.total});
    }
  }, [totals.total, onTotalChange]);

  const contentId = "manufacture-estimate-body";

  return (
    <section className="card">
      <div className="card-head" style={{
      display:"grid",
      gridTemplateColumns:"auto 1fr auto",
      alignItems:"center",
      gap:8
    }}>
      <button
        type="button"
        className="ew-chip"
        onClick={() => setCollapsed(v => !v)}
        aria-expanded={!collapsed}
        aria-controls={contentId}
        title={collapsed ? "Expand" : "Collapse"}
        style={{justifySelf:"start"}}
      >
        {collapsed ? "▶" : "▼"}
      </button>
      <h2 className="card-title" style={{ margin: 0 }}>Panels Manufacture Estimate</h2>
      <div className="sum-value" style={{ justifySelf:"end" }}>
        {money(totals.total)}
      </div>
    </div>

      {!collapsed && (
        <div className="table-wrap" id={contentId}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Wall type</th>
                <th className="num">lf / qty</th>
                <th className="num">panel</th>
                <th className="num"># panels</th>
                <th className="num">rate per</th>
                <th className="num">rate per panel</th>
                <th className="num">final price per</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((r, i) => (
                <tr key={i}>
                  <td>{r.label}</td>
                  <td className="num">{r.qtyOnly ? fmt(r.qty) : fmt(r.lf)}</td>
                  <td className="num">{r.panelLenFt}</td>
                  <td className="num">{r.qtyOnly ? "n/a" : fmt(r.panels)}</td>
                  <td className="num">{money(r.ratePerLF)}</td>
                  <td className="num">{r.ratePerPanel === "n/a" ? "n/a" : money(r.ratePerPanel)}</td>
                  <td className="num">{money(r.total)}</td>
                </tr>
              ))}
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
