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
  blocking2x10:     { each: 0.60 },
};

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (n) => USD.format(Number(n || 0));
const fmt   = (n) => Number(n || 0).toLocaleString("en-US");

export default function PanelsManufactureEstimate({
  rows = {},
  panelLenFt = 8,                 // global fallback
  panelLenFtInterior = 8,         // derived default for interior shear
  panelLenFtExterior = undefined, // derived default for exterior; if missing falls back to panelLenFt
  panelLenFtInteriorBlocking = 8,
  rates = DEFAULT_RATES,
  defaultCollapsed = false,
  persistKey = "inv:v1:ui:manufactureCollapsed",
  onTotalChange,
  exteriorLF = 0,
  interiorShearLF = 0,
  interiorBlockingLF = 0,
  interiorNonLoadLF,
  kneeWallLF,
}) {
  const [collapsed, setCollapsed] = useState(!!defaultCollapsed);

  // collapsed persistence
  useEffect(() => {
    try {
      const raw = localStorage.getItem(persistKey);
      if (raw !== null) setCollapsed(raw === "1");
    } catch {}
  }, [persistKey]);
  useEffect(() => {
    try { localStorage.setItem(persistKey, collapsed ? "1" : "0"); } catch {}
  }, [collapsed, persistKey]);

  // safe shape
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

  /* ── Editable Rate per LF (with “touched” so incoming rates don’t overwrite user edits) ── */
  const [rateByKey, setRateByKey] = useState({
    exteriorWalls: rates.exteriorWalls?.ratePerLF ?? 0,
    interiorShear: rates.interiorShear?.ratePerLF ?? 0,
    interiorBlockingOnly: rates.interiorBlocking?.ratePerLF ?? 0,
    interiorNonLoad: rates.interiorNonLoad?.ratePerLF ?? 0,
    kneeWall: rates.kneeWall?.ratePerLF ?? 0,
  });
  const [rateTouched, setRateTouched] = useState({});

  useEffect(() => {
    setRateByKey(prev => ({
      exteriorWalls:        rateTouched.exteriorWalls        ? prev.exteriorWalls        : (rates.exteriorWalls?.ratePerLF ?? prev.exteriorWalls ?? 0),
      interiorShear:        rateTouched.interiorShear        ? prev.interiorShear        : (rates.interiorShear?.ratePerLF ?? prev.interiorShear ?? 0),
      interiorBlockingOnly: rateTouched.interiorBlockingOnly ? prev.interiorBlockingOnly : (rates.interiorBlocking?.ratePerLF ?? prev.interiorBlockingOnly ?? 0),
      interiorNonLoad:      rateTouched.interiorNonLoad      ? prev.interiorNonLoad      : (rates.interiorNonLoad?.ratePerLF ?? prev.interiorNonLoad ?? 0),
      kneeWall:             rateTouched.kneeWall             ? prev.kneeWall             : (rates.kneeWall?.ratePerLF ?? prev.kneeWall ?? 0),
    }));
  }, [rates, rateTouched]);

  /* ── Editable Panel Length for Exterior + Interior Shear (with “touched”) ── */
  const [panelLenByKey, setPanelLenByKey] = useState({
    exteriorWalls: Number(panelLenFtExterior ?? panelLenFt) || 8,
    interiorShear: Number(panelLenFtInterior ?? 8) || 8,
    interiorBlockingOnly: Number(panelLenFtInteriorBlocking ?? 8) || 8,
  });
  const [panelLenTouched, setPanelLenTouched] = useState({});

  useEffect(() => {
    setPanelLenByKey(prev => ({
      ...prev,
      exteriorWalls: panelLenTouched.exteriorWalls
        ? prev.exteriorWalls
        : (Number(panelLenFtExterior ?? panelLenFt) || 8),
      interiorShear: panelLenTouched.interiorShear
        ? prev.interiorShear
        : (Number(panelLenFtInterior) || 8),
      interiorBlockingOnly: panelLenTouched.interiorBlockingOnly
        ? prev.interiorBlockingOnly
        : Number(panelLenFtInteriorBlocking) || 8,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelLenFtExterior, panelLenFtInterior, panelLenFtInteriorBlocking, panelLenFt]);

  const handlePanelLenChange = (key) => (e) => {
    const v = Number(e.target.value) || 0;
    setPanelLenByKey(prev => ({ ...prev, [key]: v }));
    setPanelLenTouched(prev => ({ ...prev, [key]: true }));
  };

  const handleRateBlur = (rowKey, field) => (e) => {
    const v = Number(e?.target?.value);
    const next = Number.isFinite(v) ? v : 0;
    setRows(prev => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [field]: next },
    }));
  };

  const manualLFKeys = useMemo(() => new Set(['windows', 'exteriorDoors', 'blocking2x10']), []);
  const [lfByKey, setLfByKey] = useState({});

  /* ── Build table lines ── */
  const lines = useMemo(() => {
    const L = [];

    const pushLF = (label, key, rateConfig) => {
      const lf = manualLFKeys.has(key)
        ? Number(lfByKey[key] ?? 0) :
        key === "exteriorWalls"         ? Number(exteriorLF         || 0) :
        key === "interiorShear"         ? Number(interiorShearLF    || 0) :
        key === "interiorBlockingOnly"  ? Number(interiorBlockingLF || 0) :
        key === "interiorNonLoad"       ? Number(interiorNonLoadLF  || 0) :
        key === "kneeWall"              ? Number(kneeWallLF         || 0) :
        Number(safe[key]?.lf || 0);      

      const usedPanelLenFt =
        Number(panelLenByKey[key]) ||
        (key === "exteriorWalls"
          ? Number(panelLenFtExterior ?? panelLenFt) || 8
          : key === "interiorShear"
          ? Number(panelLenFtInterior) || 8
          : key === "interiorBlockingOnly"
          ? Number(panelLenFtInteriorBlocking) || 8
          : key === "interiorNonLoad" || key === "kneeWall"
          ? Number(panelLenFtInterior) || 8
          : Number(panelLenFt) || 8);

      // ceil(LF / panelLen) * 1.1
      const panels = Math.ceil((lf / Math.max(1, usedPanelLenFt)) * 1.1);          
      const ratePerLF = Number(rateByKey[key] ?? rateConfig.ratePerLF ?? 0);
      const subtotal = lf * ratePerLF;

      L.push({
        label, key, lf,
        panelLenFt: usedPanelLenFt,
        panels,
        ratePerLF,
        ratePerPanel: rateConfig.ratePerPanel,
        total: subtotal,
        qtyOnly: false,
      });
    };

    pushLF("Exterior Walls", "exteriorWalls", rates.exteriorWalls);
    pushLF("Interior Shear walls", "interiorShear", rates.interiorShear);
    pushLF("Interior wall with blocking only", "interiorBlockingOnly", rates.interiorBlocking);
    pushLF("Interior Non-load bearing walls", "interiorNonLoad", rates.interiorNonLoad);
    pushLF("Knee wall", "kneeWall", rates.kneeWall);

    // unit-based items
    const qtyWindows  = Number(lfByKey.windows ?? safe.windows?.qty ?? 0);
    const rateWindows = Number(rateByKey.windows ?? rates.windows?.each ?? 0);
    L.push({
      label: "Windows", key: "windows",
      lf: 0, panelLenFt: "—", panels: "—",
      ratePerLF: rateWindows,                 // numeric (so your col-4 input works)
      total: qtyWindows * rateWindows,     // use SUBTOTAL (not "total")
      qtyOnly: true,
      qty: qtyWindows,                        // what col-1 displays for this row
    });
    const qtyDoors  = Number(lfByKey.exteriorDoors ?? safe.exteriorDoors?.qty ?? 0);
    const rateDoors = Number(rateByKey.exteriorDoors ?? rates.exteriorDoors?.each ?? 0);
    L.push({
      label: "Exterior Doors", key: "exteriorDoors",
      lf: 0, panelLenFt: "—", panels: "—",
      ratePerLF: rateDoors,
      total: qtyDoors * rateDoors,
      qtyOnly: true,
      qty: qtyDoors,
    });
    const qtyBlocking  = Number(lfByKey.blocking2x10 ?? safe.blocking2x10?.rows ?? 0);
    const rateBlocking = Number(rateByKey.blocking2x10 ?? rates.blocking2x10?.each ?? 0);
    L.push({
      label: "2x10 blocking rows", key: "blocking2x10",
      lf: 0, panelLenFt: "—", panels: "—",
      ratePerLF: rateBlocking,
      total: qtyBlocking * rateBlocking,
      qtyOnly: true,
      qty: qtyBlocking,
    });

    return L;
  }, [
    JSON.stringify(rows),
    rates,
    panelLenFt,
    panelLenFtExterior,
    panelLenFtInterior,
    panelLenFtInteriorBlocking,
    exteriorLF,
    interiorShearLF,
    interiorBlockingLF,
    panelLenByKey,
    rateByKey,
    lfByKey,
    safe,
  ]);

  const totals = useMemo(() => {
    const lf = lines.reduce((s, x) => s + (Number(x.lf) || 0), 0);
    const panels = lines.reduce((s, x) => s + (Number(x.panels) || 0), 0);
    const total = lines.reduce((s, x) => s + (Number(x.total) || 0), 0);
    return { lf, panels, total };
  }, [lines]);

  useEffect(() => {
    onTotalChange?.({ total: totals.total, panels: totals.panels });
  }, [totals.total, totals.panels, onTotalChange]);

  const contentId = "manufacture-estimate-body";

  return (
    <section className="ew-card">
  <div className="ew-head" style={{ display:'flex', alignItems:'center' }}>
    {/* Left: collapse button + title */}
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <button
        type="button"
        className="ew-btn"
        onClick={() => setCollapsed(v => !v)}
        aria-expanded={!collapsed}
        aria-controls={contentId}
        title={collapsed ? "Expand" : "Collapse"}
        style={{ padding:'4px 8px', lineHeight:1 }}
      >
        {collapsed ? '▶' : '🔽'}
      </button>
      <h2 className="ew-h2" style={{ margin:0 }}>Panels Manufacture Estimate</h2>
    </div>

    {/* Right: total chip (outside the collapse control) */}
    <div style={{ marginLeft:'auto' }} />
    <div
      className="ew-chip"
      title="Panels manufacture subtotal"
      style={{ fontWeight:800 }}
    >
      {money(totals.total)}
    </div>
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
                <th className="num">Rate per LF $</th>
                <th className="num">Rate per Panel $</th>
                <th className="num">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((r, i) => {
                const isLFRow = !r.qtyOnly;
                const isEditablePanel =
                  r.key === "exteriorWalls" || 
                  r.key === "interiorShear" || 
                  r.key === "interiorBlockingOnly" ||
                  r.key === "interiorNonLoad" || 
                  r.key === "kneeWall";

                const showRateEditable = isLFRow || manualLFKeys.has(r.key);

                return (
                  <tr key={i}>
                    <td>{r.label}</td>

                    {/* LF / Qty */}
                    <td className="num">
                      {manualLFKeys.has(r.key) ? (
                        <input
                          className="ew-input"
                          type="number"
                          step="0.01"
                          value={lfByKey[r.key] ?? 0}
                          onChange={(e) =>
                            setLfByKey(prev => ({ ...prev, [r.key]: Number(e.target.value) || 0 }))
                          }
                          style={{ width: 110, textAlign: 'right' }}
                        />
                      ) : (
                        // existing read-only display for computed rows:
                        <span>{Number(r.lf || 0).toLocaleString()}</span>
                      )}
                    </td>

                    {/* Panel length (editable only for exterior + interiorShear) */}
                    <td className="num">
                      {manualLFKeys.has(r.key) ? (
                        "—"   // not measured by LF
                      ) : isLFRow ? (
                        isEditablePanel ? (
                          <input
                            className="ew-input"
                            type="number"
                            min={1}
                            value={panelLenByKey[r.key] ?? r.panelLenFt ?? 8}
                            onChange={(e)=> {
                              const v = Number(e.target.value) || 0;
                                setPanelLenByKey(prev => ({ ...prev, [r.key]: v }));
                                setPanelLenTouched(prev => ({ ...prev, [r.key]: true }));
                            }}
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
                    <td className="num">{r.qtyOnly ? "-" : fmt(r.panels)}</td>

                    {/* Rate per LF (editable) */}
                    <td className="num">
                      {(showRateEditable || manualLFKeys.has(r.key)) ? (
                        <input
                          className="ew-input"
                          type="number"
                          step="0.01"
                          value={rateByKey[r.key] ?? r.ratePerLF ?? 0}
                          onChange={(e) =>
                            setRateByKey(prev => ({ ...prev, [r.key]: Number(e.target.value) || 0 }))
                          }
                          onBlur={() => setRateTouched(prev => ({ ...prev, [r.key]: true }))}
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

                    {/* Subtotal (col 6) */}
                    <td className="num ew-money">{money(r.total)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={3} style={{ textAlign: "right" }}>TOTALS</th>
                {/* Total # Panels (bright orange) */}
                <th className="num ew-total-panels">{fmt(totals.panels)}</th>
                {/* Skip Rate/LF and Rate/Panel */}
                <th colSpan={2}></th>
                {/* Total cost (unchanged style) */}
                <th className="num ew-total-panels">{money(totals.total)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
