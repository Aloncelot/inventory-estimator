"use client";
import { useMemo, useEffect, useState } from "react";

const DEFAULT_RATES = {
  exteriorWalls:    { ratePerLF: 10.50, ratePerPanel: 84.00 },
  interiorShear:    { ratePerLF: 10.25, ratePerPanel: 82.00 },
  interiorBlocking: { ratePerLF:  6.50, ratePerPanel: 52.00 },
  interiorNonLoad:  { ratePerLF:  6.00, ratePerPanel: 48.00 },
  kneeWall:         { ratePerLF:  4.50, ratePerPanel: 36.00 },
  windows:          { each: 20.05 },
  exteriorDoors:    { each: 15.19 },
  blocking2x10:     { each: 0.60 }, // per row
};

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (n) => USD.format(Number(n || 0));
const fmt   = (n) => Number(n || 0).toLocaleString("en-US");

export default function PanelsManufactureEstimate({
  rows = {},
  // default panel length “fallback” (used by non-editable rows)
  panelLenFt = 8,
  // ⬇ NEW: interior shear derived default (editable in the table)
  panelLenFtInterior = 8,
  // already had exterior derived default (editable in the table)
  panelLenFtExterior = undefined, // optional; if not sent we’ll use panelLenFt
  rates = DEFAULT_RATES,
  defaultCollapsed = false,
  persistKey = "inv:v1:ui:manufactureCollapsed",
  onTotalChange,
  // LFs coming from the levels:
  exteriorLF = 0,
  interiorShearLF = 0, // ⬅ NEW
}) {
  const [collapsed, setCollapsed] = useState(!!defaultCollapsed);

  // persist collapsed
  useEffect(() => {
    try {
      const raw = localStorage.getItem(persistKey);
      if (raw !== null) setCollapsed(raw === "1");
    } catch {}
  }, [persistKey]);
  useEffect(() => {
    try { localStorage.setItem(persistKey, collapsed ? "1" : "0"); } catch {}
  }, [collapsed, persistKey]);

  // safe shape for other rows (still allowed to feed values via "rows" prop)
  const safe = {
    exteriorWalls: rows.exteriorWalls || { lf: 0, panels: 0 },
    interiorShear: rows.interiorShear || { lf: 0, panels: 0 },
    interiorBlockingOnly: rows.interiorBlockingOnly || { lf: 0, panels: 0 },
    interiorNonLoad: rows.interiorNonLoad || { lf: 0, panels: 0 },
    kneeWall: rows.kneeWall || { lf: 0, panels: 0 },
    windows: rows.windows || { qty: 0 },
    exteriorDoors: rows.exteriorDoors || { qty: 0 },
    blocking2x10: rows.blocking2x10 || { rows: 0 },
  };

  // Editable per-LF rates by row key (persist in state)
  const [rateByKey, setRateByKey] = useState({
    exteriorWalls: rates.exteriorWalls?.ratePerLF ?? 0,
    interiorShear: rates.interiorShear?.ratePerLF ?? 0,
    interiorBlockingOnly: rates.interiorBlocking?.ratePerLF ?? 0,
    interiorNonLoad: rates.interiorNonLoad?.ratePerLF ?? 0,
    kneeWall: rates.kneeWall?.ratePerLF ?? 0,
  });

  // Editable panel length per row key (only exterior + interiorShear for now)
  const [panelLenByKey, setPanelLenByKey] = useState({
    exteriorWalls: Number(panelLenFtExterior ?? panelLenFt) || 8,
    interiorShear: Number(panelLenFtInterior ?? 8) || 8,
  });

  // If parents send a new default (e.g., when user picks a new bottom plate),
  // refresh our “initial” only if user hasn’t typed anything for that row yet.
  useEffect(() => {
    setPanelLenByKey((prev) => {
      const next = { ...prev };
      if (!prev.exteriorWalls && panelLenFtExterior) {
        next.exteriorWalls = Number(panelLenFtExterior) || 8;
      }
      if (!prev.interiorShear && panelLenFtInterior) {
        next.interiorShear = Number(panelLenFtInterior) || 8;
      }
      return next;
    });
  }, [panelLenFtExterior, panelLenFtInterior]);

  const lines = useMemo(() => {
    const L = [];

    const pushLF = (label, key, rateConfig) => {
      const lf =
        key === "exteriorWalls"
          ? Number(exteriorLF || 0)
          : key === "interiorShear"
          ? Number(interiorShearLF || 0)
          : Number(safe[key]?.lf || 0);

      // Which panel length do we use for math?
      const usedPanelLenFt =
        Number(panelLenByKey[key]) ||
        (key === "exteriorWalls"
          ? Number(panelLenFtExterior ?? panelLenFt) || 8
          : key === "interiorShear"
          ? Number(panelLenFtInterior) || 8
          : Number(panelLenFt) || 8);

      // Your spec: ceil(LF / panelLen) * 1.1
      const panels = Math.ceil((lf / Math.max(1, usedPanelLenFt)) * 1.1);

      const ratePerLF = Number(rateByKey[key] ?? rateConfig.ratePerLF ?? 0);
      const subtotal = lf * ratePerLF;

      L.push({
        label,
        key,
        lf,
        panelLenFt: usedPanelLenFt,
        panels,
        ratePerLF,
        ratePerPanel: rateConfig.ratePerPanel,
        total: subtotal,
      });
    };

    pushLF("Exterior Walls", "exteriorWalls", rates.exteriorWalls);
    pushLF("Interior Shear walls", "interiorShear", rates.interiorShear);
    pushLF("Interior wall with blocking only", "interiorBlockingOnly", rates.interiorBlocking);
    pushLF("Interior Non-load bearing walls", "interiorNonLoad", rates.interiorNonLoad);
    pushLF("Knee wall", "kneeWall", rates.kneeWall);

    // unit-based items
    L.push({
      label: "Windows",
      key: "windows",
      lf: 0,
      panelLenFt: "n/a",
      panels: "n/a",
      ratePerLF: rates.windows.each,
      ratePerPanel: "n/a",
      total: (safe.windows.qty || 0) * (rates.windows.each || 0),
      qtyOnly: true,
      qty: safe.windows.qty || 0,
    });
    L.push({
      label: "Exterior Doors",
      key: "exteriorDoors",
      lf: 0,
      panelLenFt: "n/a",
      panels: "n/a",
      ratePerLF: rates.exteriorDoors.each,
      ratePerPanel: "n/a",
      total: (safe.exteriorDoors.qty || 0) * (rates.exteriorDoors.each || 0),
      qtyOnly: true,
      qty: safe.exteriorDoors.qty || 0,
    });
    L.push({
      label: "2x10 blocking rows",
      key: "blocking2x10",
      lf: 0,
      panelLenFt: "n/a",
      panels: "n/a",
      ratePerLF: rates.blocking2x10.each,
      ratePerPanel: "n/a",
      total: (safe.blocking2x10.rows || 0) * (rates.blocking2x10.each || 0),
      qtyOnly: true,
      qty: safe.blocking2x10.rows || 0,
    });

    return L;
  }, [
    JSON.stringify(rows),
    rates,
    panelLenFt,
    panelLenFtExterior,
    panelLenFtInterior,
    exteriorLF,
    interiorShearLF,
    panelLenByKey,
    rateByKey,
  ]);

  const totals = useMemo(() => {
    const lf = lines.reduce((s, x) => s + (Number(x.lf) || 0), 0);
    const panels = lines.reduce((s, x) => s + (Number(x.panels) || 0), 0);
    const total = lines.reduce((s, x) => s + (Number(x.total) || 0), 0);
    return { lf, panels, total };
  }, [lines]);

  useEffect(() => {
    if (typeof onTotalChange === "function") onTotalChange({ total: totals.total });
  }, [totals.total, onTotalChange]);

  const contentId = "manufacture-estimate-body";

  return (
    <section className="ew-card">
      <div className="ew-head" style={{ justifyContent: "space-between" }}>
        <h2 className="ew-h2" style={{ margin: 0 }}>Panels Manufacture Estimate</h2>
        <button
          type="button"
          className="ew-chip"
          onClick={() => setCollapsed(v => !v)}
          aria-expanded={!collapsed}
          aria-controls={contentId}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "▶" : "🔽"} {money(totals.total)}
        </button>
      </div>

      {!collapsed && (
        <div className="table-wrap" id={contentId}>
          <table className="tbl" style={{ width: "100%", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "26%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "11%" }} />
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
              {lines.map((r, i) => {
                const isLFRow = !r.qtyOnly;
                const isEditablePanel = r.key === "exteriorWalls" || r.key === "interiorShear";
                const showRateEditable = isLFRow; // only LF-based rows can edit rate per LF

                return (
                  <tr key={i}>
                    <td>{r.label}</td>

                    {/* LF / Qty */}
                    <td className="num">{r.qtyOnly ? fmt(r.qty) : fmt(r.lf)}</td>

                    {/* Panel length (editable only for exterior + interiorShear) */}
                    <td className="num">
                      {isLFRow ? (
                        isEditablePanel ? (
                          <input
                            className="ew-input"
                            type="number"
                            min={1}
                            value={panelLenByKey[r.key] ?? r.panelLenFt ?? 8}
                            onChange={(e) =>
                              setPanelLenByKey((prev) => ({
                                ...prev,
                                [r.key]: Number(e.target.value) || 0,
                              }))
                            }
                            style={{ width: 90, textAlign: "right" }}
                          />
                        ) : (
                          r.panelLenFt
                        )
                      ) : (
                        "n/a"
                      )}
                    </td>

                    {/* # Panels */}
                    <td className="num">{r.qtyOnly ? "n/a" : fmt(r.panels)}</td>

                    {/* Rate per LF (editable) */}
                    <td className="num">
                      {showRateEditable ? (
                        <input
                          className="ew-input"
                          type="number"
                          step="0.01"
                          value={rateByKey[r.key] ?? r.ratePerLF ?? 0}
                          onChange={(e) =>
                            setRateByKey((prev) => ({
                              ...prev,
                              [r.key]: Number(e.target.value) || 0,
                            }))
                          }
                          onBlur={(e) =>
                            setRateByKey((prev) => ({
                              ...prev,
                              [r.key]: Number(Number(e.target.value).toFixed(2)),
                            }))
                          }
                          style={{ width: 110, textAlign: "right" }}
                        />
                      ) : (
                        "n/a"
                      )}
                    </td>

                    {/* Rate per panel (read-only) */}
                    <td className="num">
                      {r.ratePerPanel === "n/a" ? "n/a" : money(r.ratePerPanel)}
                    </td>

                    {/* Final price */}
                    <td className="num">{money(r.total)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th>TOTALS</th>
                <th className="num">{fmt(totals.lf)}</th>
                <th className="num">{panelLenByKey.exteriorWalls ?? panelLenFt}</th>
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
