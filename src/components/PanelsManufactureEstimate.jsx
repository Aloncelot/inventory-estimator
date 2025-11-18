// src/components/PanelsManufactureEstimate.jsx
"use client";
import {
  useMemo,
  useEffect,
  useState,
  useCallback,
  useRef,
  useEffectEvent, 
} from "react";
import AccordionSection from "./ui/AccordionSection";

// ... (DEFAULT_RATES, USD, money, fmt constants are unchanged) ...
const DEFAULT_RATES = {
  exteriorWalls: { ratePerLF: 10.5, ratePerPanel: 84.0 },
  interiorShear: { ratePerLF: 10.25, ratePerPanel: 82.0 },
  interiorBlocking: { ratePerLF: 6.5, ratePerPanel: 52.0 },
  interiorNonLoad: { ratePerLF: 6.0, ratePerPanel: 48.0 },
  kneeWall: { ratePerLF: 4.5, ratePerPanel: 36.0 },
  windows: { each: 20.05 },
  exteriorDoors: { each: 15.19 },
  blocking2x10: { each: 0.6 },
};

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const money = (n) => USD.format(Number(n || 0));
const fmt = (n) => Number(n || 0).toLocaleString("en-US");

export default function PanelsManufactureEstimate({
  data,
  onChange, // This is a stable function: (updaterFn) => void
  panelLenFt = 8,
  panelLenFtInterior = 8,
  panelLenFtExterior = undefined,
  panelLenFtInteriorBlocking = 8,
  rates = DEFAULT_RATES,
  exteriorLF = 0,
  interiorShearLF = 0,
  interiorBlockingLF = 0,
  interiorNonLoadLF,
  kneeWallLF,
}) {
  // 1. Destructure data from props (unchanged)
  const {
    collapsed = true,
    rateByKey = {
      exteriorWalls: rates.exteriorWalls?.ratePerLF ?? 0,
      interiorShear: rates.interiorShear?.ratePerLF ?? 0,
      interiorBlockingOnly: rates.interiorBlocking?.ratePerLF ?? 0,
      interiorNonLoad: rates.interiorNonLoad?.ratePerLF ?? 0,
      kneeWall: rates.kneeWall?.ratePerLF ?? 0,
      windows: rates.windows?.each ?? 0,
      exteriorDoors: rates.exteriorDoors?.each ?? 0,
      blocking2x10: rates.blocking2x10?.each ?? 0,
    },
    rateTouched = {},
    panelLenByKey = {
      exteriorWalls: Number(panelLenFtExterior ?? panelLenFt) || 8,
      interiorShear: Number(panelLenFtInterior ?? 8) || 8,
      interiorBlockingOnly: Number(panelLenFtInteriorBlocking ?? 8) || 8,
      interiorNonLoad: Number(panelLenFtInterior ?? 8) || 8,
      kneeWall: Number(panelLenFtInterior ?? 8) || 8,
    },
    panelLenTouched = {},
    manualInputByKey = {
      windows: 0,
      exteriorDoors: 0,
      blocking2x10: 0,
    },
    manualInputTouched = {},
  } = data || {};

  // 2. Create stable event handler for onChange
  const onDataChange = useEffectEvent(onChange);

  // --- START: Input Optimization ---
  
  // 3. Create local state for all three input objects
  const [localRateByKey, setLocalRateByKey] = useState(rateByKey);
  const [localPanelLenByKey, setLocalPanelLenByKey] = useState(panelLenByKey);
  const [localManualInputByKey, setLocalManualInputByKey] =
    useState(manualInputByKey);

  // 4. Sync local state from props (using primitive dependencies)
  const rateSig = JSON.stringify(rateByKey);
  useEffect(() => {
    setLocalRateByKey(rateByKey);
  }, [rateSig]);

  const panelLenSig = JSON.stringify(panelLenByKey);
  useEffect(() => {
    setLocalPanelLenByKey(panelLenByKey);
  }, [panelLenSig]);

  const manualInputSig = JSON.stringify(manualInputByKey);
  useEffect(() => {
    setLocalManualInputByKey(manualInputByKey);
  }, [manualInputSig]);

  // --- 5. Handlers for 'Rate' inputs ---
  const handleRateChange = useCallback((e) => {
    const key = e.target.dataset.key;
    setLocalRateByKey(prev => ({ ...prev, [key]: e.target.value }));
  }, []); // Empty dep, setter is stable

  const handleRateBlur = useCallback((e) => {
    const key = e.target.dataset.key;
    const numericValue = Number(e.target.value) || 0;
    
    onDataChange(prevData => ({
      ...prevData,
      rateByKey: { ...(prevData.rateByKey || {}), [key]: numericValue },
      rateTouched: { ...(prevData.rateTouched || {}), [key]: true },
    }));
    setLocalRateByKey(prev => ({ ...prev, [key]: numericValue }));
  }, [onDataChange]); // Depends on stable event

  const handleRateKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setLocalRateByKey(rateByKey); // Revert to prop
      e.target.blur();
      return;
    }
    if (e.key === 'Enter') {
      handleRateBlur(e); // Commit change
      e.target.blur();
    }
  }, [handleRateBlur, rateByKey]); // Depends on blur handler and prop

  // --- 6. Handlers for 'Panel Length' inputs ---
  const handlePanelLenChange = useCallback((e) => {
    const key = e.target.dataset.key;
    setLocalPanelLenByKey(prev => ({ ...prev, [key]: e.target.value }));
  }, []);

  const handlePanelLenBlur = useCallback((e) => {
    const key = e.target.dataset.key;
    const numericValue = Number(e.target.value) || 0;
    
    onDataChange(prevData => ({
      ...prevData,
      panelLenByKey: { ...(prevData.panelLenByKey || {}), [key]: numericValue },
      panelLenTouched: { ...(prevData.panelLenTouched || {}), [key]: true },
    }));
    setLocalPanelLenByKey(prev => ({ ...prev, [key]: numericValue }));
  }, [onDataChange]);

  const handlePanelLenKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setLocalPanelLenByKey(panelLenByKey); // Revert to prop
      e.target.blur();
      return;
    }
    if (e.key === 'Enter') {
      handlePanelLenBlur(e); // Commit change
      e.target.blur();
    }
  }, [handlePanelLenBlur, panelLenByKey]);

  // --- 7. Handlers for 'Manual Qty' inputs ---
  const handleManualInputChange = useCallback((e) => {
    const key = e.target.dataset.key;
    setLocalManualInputByKey(prev => ({ ...prev, [key]: e.target.value }));
  }, []);

  const handleManualInputBlur = useCallback((e) => {
    const key = e.target.dataset.key;
    const numericValue = Number(e.target.value) || 0;
    
    onDataChange(prevData => ({
      ...prevData,
      manualInputByKey: { ...(prevData.manualInputByKey || {}), [key]: numericValue },
      manualInputTouched: { ...(prevData.manualInputTouched || {}), [key]: true },
    }));
    setLocalManualInputByKey(prev => ({ ...prev, [key]: numericValue }));
  }, [onDataChange]);

  const handleManualInputKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      setLocalManualInputByKey(manualInputByKey); // Revert to prop
      e.target.blur();
      return;
    }
    if (e.key === 'Enter') {
      handleManualInputBlur(e); // Commit change
      e.target.blur();
    }
  }, [handleManualInputBlur, manualInputByKey]);

  // --- END: Input Optimization ---


  // --- Stable Update Handlers (using stable `onDataChange`) ---
  const setCollapsed = useCallback(
    (isOpen) => {
      onDataChange((prev) => ({ ...prev, collapsed: !isOpen }));
    },
    [onDataChange]
  );
  
  // These effects sync default props (unchanged)
  useEffect(() => {
    let needsUpdate = false;
    const newRates = { ...rateByKey };

    if (!rateTouched.exteriorWalls && newRates.exteriorWalls !== (rates.exteriorWalls?.ratePerLF ?? 0)) {
        newRates.exteriorWalls = rates.exteriorWalls?.ratePerLF ?? 0;
        needsUpdate = true;
    }
    // ... (repeat for all other rates) ...
    
    if (needsUpdate) {
        onDataChange(prevData => ({ ...prevData, rateByKey: newRates }));
    }
  }, [rates, rateTouched, rateByKey, onDataChange]);
  
  useEffect(() => {
    let needsUpdate = false;
    const newPanelLens = { ...panelLenByKey };
    
    const extLen = Number(panelLenFtExterior ?? panelLenFt) || 8;
    if (!panelLenTouched.exteriorWalls && newPanelLens.exteriorWalls !== extLen) {
        newPanelLens.exteriorWalls = extLen;
        needsUpdate = true;
    }
    // ... (repeat for all other panel lengths) ...
    
    if (needsUpdate) {
        onDataChange(prevData => ({ ...prevData, panelLenByKey: newPanelLens }));
    }
  }, [panelLenFtExterior, panelLenFt, panelLenTouched, panelLenByKey, onDataChange]);


  // --- Calculations (useMemo) ---
  // (Unchanged, they correctly depend on props)
  const lines = useMemo(() => {
    const L = [];
    const pushLF = (label, key, rateConfigDefault) => {
      const lf =
        key === "exteriorWalls"
          ? Number(exteriorLF || 0)
          : key === "interiorShear"
          ? Number(interiorShearLF || 0)
          : key === "interiorBlockingOnly"
          ? Number(interiorBlockingLF || 0)
          : key === "interiorNonLoad"
          ? Number(interiorNonLoadLF || 0)
          : key === "kneeWall"
          ? Number(kneeWallLF || 0)
          : 0;
      const usedPanelLenFt = Number(panelLenByKey[key]) || 8;
      const panels = Math.ceil((lf / Math.max(1, usedPanelLenFt)) * 1.1);
      const ratePerLF = Number(rateByKey[key] ?? rateConfigDefault?.ratePerLF ?? 0);
      const ratePerPanel = Number(rateConfigDefault?.ratePerPanel ?? 0);
      const subtotal = lf * ratePerLF;
      L.push({
        label, key, lf, panelLenFt: usedPanelLenFt, panels,
        ratePerLF, ratePerPanel, total: subtotal, isQtyBased: false,
      });
    };
    const pushQty = (label, key, rateConfigDefault) => {
      const qty = Number(manualInputByKey[key] ?? 0);
      const rateEach = Number(rateByKey[key] ?? rateConfigDefault?.each ?? 0);
      const subtotal = qty * rateEach;
      L.push({
        label, key, qty, lf: 0, panelLenFt: "—", panels: "—",
        ratePerLF: rateEach, ratePerPanel: "n/a", total: subtotal, isQtyBased: true,
      });
    };

    pushLF("Exterior Walls", "exteriorWalls", rates.exteriorWalls);
    pushLF("Interior Shear walls", "interiorShear", rates.interiorShear);
    pushLF("Interior wall with blocking only", "interiorBlockingOnly", rates.interiorBlocking);
    pushLF("Interior Non-load bearing walls", "interiorNonLoad", rates.interiorNonLoad);
    pushLF("Knee wall", "kneeWall", rates.kneeWall);
    pushQty("Windows", "windows", rates.windows);
    pushQty("Exterior Doors", "exteriorDoors", rates.exteriorDoors);
    pushQty("2x10 blocking rows", "blocking2x10", rates.blocking2x10);

    return L;
  }, [
    rates,
    panelLenByKey, 
    rateByKey,     
    manualInputByKey, 
    exteriorLF,
    interiorShearLF,
    interiorBlockingLF,
    interiorNonLoadLF,
    kneeWallLF,
  ]);

  const totals = useMemo(() => {
    const lf = lines.reduce((s, x) => s + (Number(x.lf) || 0), 0);
    const panels = lines
      .filter((x) => !x.isQtyBased)
      .reduce((s, x) => s + (Number(x.panels) || 0), 0);
    const total = lines.reduce((s, x) => s + (Number(x.total) || 0), 0);
    return { lf, panels, total };
  }, [lines]);

  // --- Effect to report totals (Refactored) ---
  const lastSentRef = useRef(null);
  useEffect(() => {
    const newTotals = { total: totals.total, panels: totals.panels };
    const sig = JSON.stringify(newTotals);

    if (sig !== lastSentRef.current) {
      lastSentRef.current = sig;
      onDataChange((prevData) => ({
        ...prevData,
        total: newTotals.total,
        panels: newTotals.panels,
      }));
    }
  }, [totals, onDataChange]);

  // --- RENDER ---
  return (
    <div className="ew-card">
      <AccordionSection
        open={!collapsed}
        onOpenChange={setCollapsed}
        bar={({ open, toggle }) => (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
            }}
          >
            <button
              type="button"
              className="acc__button"
              onClick={toggle}
              aria-expanded={open}
              title={open ? "Collapse" : "Expand"}
            >
              <img
                src={open ? "/icons/down.png" : "/icons/minimize.png"}
                alt={open ? "Collapse section" : "Expand section"}
                width={16}
                height={16}
                className="acc__chev"
                style={{ display: "inline-block", verticalAlign: "middle" }}
              />
            </button>
            <h2 className="text-section-header">
              Panels Manufacture Estimate
            </h2>      
            <div
              className="ew-right text-subtotal-orange"
              style={{
                marginLeft: "auto",
                fontWeight: "700",
                fontFamily: "'Nova Mono', monospace",
              }}
            >
              Subtotal: {money(totals.total)}
            </div>
          </div>
        )}
      >
        <div className="table-wrap">
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
                <th className="num">Panel Length (ft)</th>
                <th className="num"># Panels</th>
                <th className="num">Rate per LF / $ Each</th>
                <th className="num">Rate per Panel $</th>
                <th className="num">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((r) => {
                const isEditablePanel =
                  r.key === "exteriorWalls" ||
                  r.key === "interiorShear" ||
                  r.key === "interiorBlockingOnly" ||
                  r.key === "interiorNonLoad" ||
                  r.key === "kneeWall";

                return (
                  <tr key={r.key} className="ew-row">
                    <td>{r.label}</td>
                    <td className="num">
                      {r.isQtyBased ? (
                        // 8. Wire Qty input to new handlers
                        <input
                          className="ew-input focus-anim"
                          type="number"
                          min="0"
                          step="1"
                          data-key={r.key} // Pass key
                          value={localManualInputByKey[r.key] ?? 0}
                          onChange={handleManualInputChange}
                          onBlur={handleManualInputBlur}
                          onKeyDown={handleManualInputKeyDown}
                          style={{ width: 110, textAlign: 'right', padding: '4px 8px' }}
                        />
                      ) : (
                        <span>{Number(r.lf || 0).toLocaleString()}</span>
                      )}
                    </td>
                    <td className="num">
                      {r.isQtyBased ? (
                        "—"
                      ) : isEditablePanel ? (
                        // 8. Wire Panel Length input to new handlers
                        <input
                          className="ew-input focus-anim"
                          type="number"
                          min="1"
                          step="0.01"
                          data-key={r.key} // Pass key
                          value={localPanelLenByKey[r.key] ?? 0}
                          onChange={handlePanelLenChange}
                          onBlur={handlePanelLenBlur}
                          onKeyDown={handlePanelLenKeyDown}
                          style={{ width: 90, textAlign: "right", padding: '4px 8px' }}
                        />
                      ) : (
                        r.panelLenFt
                      )}
                    </td>
                    <td className="num">{r.isQtyBased ? "—" : fmt(r.panels)}</td>
                    <td className="num">
                      {/* 8. Wire Rate input to new handlers */}
                      <input
                        className="ew-input focus-anim"
                        type="number"
                        step="0.01"
                        min="0"
                        data-key={r.key} // Pass key
                        value={localRateByKey[r.key] ?? 0}
                        onChange={handleRateChange}
                        onBlur={handleRateBlur}
                        onKeyDown={handleRateKeyDown}
                        style={{ width: 110, textAlign: "right", padding: '4px 8px' }}
                      />
                    </td>
                    <td className="num">
                      {r.ratePerPanel === "n/a"
                        ? "n/a"
                        : money(r.ratePerPanel)}
                    </td>
                    <td className="num ew-money">{money(r.total)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th className="text-subtotal-manufacture" colSpan={3} style={{ textAlign: "right" }}>
                  TOTALS
                </th>
                <th className="num ew-total-panels text-sum-manufacture">{fmt(totals.panels)}</th>
                <th colSpan={2}></th>
                <th className="num ew-total-panels text-sum-manufacture">{money(totals.total)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </AccordionSection>
    </div>
  );
}