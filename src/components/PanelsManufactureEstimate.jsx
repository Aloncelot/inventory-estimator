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
function parseMoney(str) {
  const s = String(str ?? "").replace(/[^0-9.\-]/g, "");
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

export default function PanelsManufactureEstimate({
  rows = {},
  panelLenFt = 8,                 // default incoming "panel" length (from bottom plate)
  rates = DEFAULT_RATES,
  defaultCollapsed = false,
  persistKey = "inv:v1:ui:manufactureCollapsed",
  onTotalChange,
  exteriorLF = 0
}) {
  const [collapsed, setCollapsed] = useState(!!defaultCollapsed);

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

  // Editable “Rate per LF” for LF-based rows
  const [rateByKey, setRateByKey] = useState(() => ({
    exteriorWalls:        rates.exteriorWalls?.ratePerLF ?? 0,
    interiorShear:        rates.interiorShear?.ratePerLF ?? 0,
    interiorBlockingOnly: rates.interiorBlocking?.ratePerLF ?? 0,
    interiorNonLoad:      rates.interiorNonLoad?.ratePerLF ?? 0,
    kneeWall:             rates.kneeWall?.ratePerLF ?? 0,
  }));
  useEffect(() => {
    setRateByKey(prev => ({
      exteriorWalls:        prev.exteriorWalls ?? rates.exteriorWalls?.ratePerLF ?? 0,
      interiorShear:        prev.interiorShear ?? rates.interiorShear?.ratePerLF ?? 0,
      interiorBlockingOnly: prev.interiorBlockingOnly ?? rates.interiorBlocking?.ratePerLF ?? 0,
      interiorNonLoad:      prev.interiorNonLoad ?? rates.interiorNonLoad?.ratePerLF ?? 0,
      kneeWall:             prev.kneeWall ?? rates.kneeWall?.ratePerLF ?? 0,
    }));
  }, [rates]);

  // Editable “Panel” length (currently only used for Exterior Walls)
  const [panelLenByKey, setPanelLenByKey] = useState(() => ({
    exteriorWalls: Number(panelLenFt) || 8,
  }));
  // If parent updates panelLenFt (e.g., you pick a new bottom plate length), adopt it as default
  useEffect(() => {
    setPanelLenByKey(prev => ({
      ...prev,
      exteriorWalls: Number.isFinite(Number(panelLenFt)) && Number(panelLenFt) > 0
        ? Number(panelLenFt)
        : (prev.exteriorWalls || 8),
    }));
  }, [panelLenFt]);

  const lines = useMemo(() => {
    const L = [];

    const pushLF = (label, key, r) => {
      const lf = key === 'exteriorWalls'
        ? Number(exteriorLF || 0)
        : Number(safe[key].lf || 0);

      const usedPanelLenFt =
        key === 'exteriorWalls'
          ? (Number(panelLenByKey.exteriorWalls) || 8)
          : panelLenFt; // for now only exterior is editable/derived; others can follow later

      const u = Number(usedPanelLenFt) || 0;
      const panels =
        safe[key].panels ||
        (u > 0 ? Math.ceil((lf / u) * 1.1) : 0);

      const editableRate = rateByKey[key] ?? r.ratePerLF ?? 0;
      const subtotal = lf * editableRate;

      L.push({
        key,
        label,
        lf,
        panelLenFt: usedPanelLenFt,
        panels,
        ratePerLF: editableRate,
        ratePerPanel: r.ratePerPanel,
        total: subtotal,
        qtyOnly: false,
        canEditPanelLen: key === 'exteriorWalls',
      });
    };

    pushLF("Exterior Walls", "exteriorWalls", rates.exteriorWalls);
    pushLF("Interior Shear walls", "interiorShear", rates.interiorShear);
    pushLF("Interior wall with blocking only", "interiorBlockingOnly", rates.interiorBlocking);
    pushLF("Interior Non-load bearing walls", "interiorNonLoad", rates.interiorNonLoad);
    pushLF("Knee wall", "kneeWall", rates.kneeWall);

    // unit-based items (not LF; no panel length here)
    L.push({
      key: "windows",
      label: "Windows",
      lf: "0", panelLenFt: "n/a", panels: "n/a",
      ratePerLF: rates.windows.each, ratePerPanel: "n/a",
      total: (safe.windows.qty || 0) * (rates.windows.each || 0),
      qtyOnly: true, qty: safe.windows.qty || 0,
    });
    L.push({
      key: "exteriorDoors",
      label: "Exterior Doors",
      lf: "0", panelLenFt: "n/a", panels: "n/a",
      ratePerLF: rates.exteriorDoors.each, ratePerPanel: "n/a",
      total: (safe.exteriorDoors.qty || 0) * (rates.exteriorDoors.each || 0),
      qtyOnly: true, qty: safe.exteriorDoors.qty || 0,
    });
    L.push({
      key: "blocking2x10",
      label: "2x10 blocking rows",
      lf: "0", panelLenFt: "n/a", panels: "n/a",
      ratePerLF: rates.blocking2x10.each, ratePerPanel: "n/a",
      total: (safe.blocking2x10.rows || 0) * (rates.blocking2x10.each || 0),
      qtyOnly: true, qty: safe.blocking2x10.rows || 0,
    });

    return L;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rows), panelLenFt, JSON.stringify(rates), exteriorLF, rateByKey, panelLenByKey]);

  const totals = useMemo(() => {
    const lf = lines.reduce((s, x) => s + (Number(x.lf) || 0), 0);
    const panels = lines.reduce((s, x) => s + (Number(x.panels) || 0), 0);
    const total = lines.reduce((s, x) => s + (Number(x.total) || 0), 0);
    return { lf, panels, total };
  }, [lines]);

  useEffect(() => {
    onTotalChange?.({ total: totals.total });
  }, [totals.total, onTotalChange]);

  const contentId = "manufacture-estimate-body";

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
                <th className="num">LF / Qty</th>
                <th className="num">Panel Length</th>
                <th className="num"># Panels</th>
                <th className="num">Rate per LF</th>
                <th className="num">Rate per Panel</th>
                <th className="num">Final Price per wall type</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td className="num">{r.qtyOnly ? fmt(r.qty) : fmt(r.lf)}</td>

                  {/* Panel length (editable for Exterior Walls) */}
                  <td className="num">
                    {r.canEditPanelLen ? (
                      <input
                        className="ew-input"
                        inputMode="decimal"
                        style={{ width: 90, textAlign: 'right' }}
                        value={panelLenByKey.exteriorWalls ?? ''}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setPanelLenByKey(prev => ({
                            ...prev,
                            exteriorWalls: Number.isFinite(v) && v > 0 ? v : 0
                          }));
                        }}
                        title="Panel length (ft)"
                      />
                    ) : (
                      r.panelLenFt
                    )}
                  </td>

                  <td className="num">{r.qtyOnly ? "n/a" : fmt(r.panels)}</td>

                  {/* Rate per LF: editable for LF rows */}
                  <td className="num">
                    {r.qtyOnly ? (
                      money(r.ratePerLF)
                    ) : (
                      <input
                        className="ew-input"
                        inputMode="decimal"
                        style={{ width: 110, textAlign: 'right' }}
                        value={money(rateByKey[r.key] ?? 0)}
                        onChange={(e) => {
                          const v = parseMoney(e.target.value);
                          setRateByKey(prev => ({ ...prev, [r.key]: v }));
                        }}
                        title="Rate per LF"
                      />
                    )}
                  </td>

                  <td className="num">
                    {r.ratePerPanel === "n/a" ? "n/a" : money(r.ratePerPanel)}
                  </td>
                  <td className="num">{money(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>TOTALS</th>
                <th className="num">{fmt(totals.lf)}</th>
                <th className="num">-</th>
                <th className="num">{fmt(totals.panels)}</th>
                <th className="num">-</th>
                <th className="num">-</th>
                <th className="num">{money(totals.total)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
