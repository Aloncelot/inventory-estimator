// src/components/PanelsManufactureEstimate.jsx
"use client";
import { useMemo, useEffect, useState, useCallback, useRef } from "react";
import AccordionSection from "./ui/AccordionSection";

 const DEFAULT_RATES = {
     exteriorWalls:     { ratePerLF: 10.50, ratePerPanel: 84.00 },
     interiorShear:     { ratePerLF: 10.25, ratePerPanel: 82.00 },
     interiorBlocking: { ratePerLF:  6.50, ratePerPanel: 52.00 },
     interiorNonLoad:  { ratePerLF:  6.00, ratePerPanel: 48.00 },
     kneeWall:         { ratePerLF:  4.50, ratePerPanel: 36.00 },
     windows:          { each: 20.05 },
     exteriorDoors:    { each: 15.19 },
     blocking2x10:     { each:  0.60 },
 };

 const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
 const money = (n) => USD.format(Number(n || 0));
 const fmt   = (n) => Number(n || 0).toLocaleString("en-US");

 export default function PanelsManufactureEstimate({
     data,
     onChange, // This is now a stable function: (updaterFn) => void
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
    
    // 1. Destructure data from props
    const {
        collapsed = false,
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

    
    // --- **THIS IS THE FIX (PART 1)** ---
    // All update handlers are now stable and pass an "updater function"
    
    const updateField = useCallback((fieldName, value) => {
        // Pass a function to onChange
        onChange(prevData => ({ ...prevData, [fieldName]: value }));
    }, [onChange]);

    const setCollapsed = (isCollapsed) => {
        updateField('collapsed', !!isCollapsed);
    };

     const handlePanelLenChange = useCallback((key) => (e) => {
         const v = Number(e.target.value) || 0;
         onChange(prevData => ({
             ...prevData,
             panelLenByKey: { ...(prevData.panelLenByKey || {}), [key]: Math.max(1, v) },
             panelLenTouched: { ...(prevData.panelLenTouched || {}), [key]: true }
         }));
     }, [onChange]);

     const handleRateChange = useCallback((key) => (e) => {
         const v = e.target.value;
         onChange(prevData => ({
            ...prevData,
            rateByKey: { ...(prevData.rateByKey || {}), [key]: v }
         }));
     }, [onChange]);

     const handleRateBlur = useCallback((key) => (e) => {
          const v = parseFloat(e.target.value);
          const finalRate = Number.isFinite(v) ? v : 0;
          onChange(prevData => ({
              ...prevData,
              rateByKey: { ...(prevData.rateByKey || {}), [key]: finalRate },
              rateTouched: { ...(prevData.rateTouched || {}), [key]: true }
          }));
     }, [onChange]);

      const handleManualInputChange = useCallback((key) => (e) => {
          const v = e.target.value;
          onChange(prevData => ({
              ...prevData,
              manualInputByKey: { ...(prevData.manualInputByKey || {}), [key]: v }
          }));
      }, [onChange]);

     const handleManualInputBlur = useCallback((key) => (e) => {
         const v = parseInt(e.target.value, 10);
         const finalValue = Number.isFinite(v) && v >= 0 ? v : 0;
         onChange(prevData => ({
             ...prevData,
             manualInputByKey: { ...(prevData.manualInputByKey || {}), [key]: finalValue },
             manualInputTouched: { ...(prevData.manualInputTouched || {}), [key]: true }
         }));
     }, [onChange]);
     
    // --- **THIS IS THE FIX (PART 2)** ---
    // These effects now only depend on props and the stable `onChange`
    
     useEffect(() => {
        let needsUpdate = false;
        const newRates = { ...rateByKey };

        if (!rateTouched.exteriorWalls && newRates.exteriorWalls !== (rates.exteriorWalls?.ratePerLF ?? 0)) {
            newRates.exteriorWalls = rates.exteriorWalls?.ratePerLF ?? 0;
            needsUpdate = true;
        }
        // ... (repeat for all other rates) ...
        
        if (needsUpdate) {
            onChange(prevData => ({ ...prevData, rateByKey: newRates }));
        }
     }, [rates, rateTouched, rateByKey, onChange]);
     
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
            onChange(prevData => ({ ...prevData, panelLenByKey: newPanelLens }));
        }
     }, [panelLenFtExterior, panelLenFt, panelLenTouched, panelLenByKey, onChange]);


     // --- Calculations (useMemo) ---
     // (This logic is unchanged)
     const lines = useMemo(() => {
         const L = [];
         const pushLF = (label, key, rateConfigDefault) => {
             const lf =
                 key === "exteriorWalls"        ? Number(exteriorLF         || 0) :
                 key === "interiorShear"        ? Number(interiorShearLF    || 0) :
                 key === "interiorBlockingOnly" ? Number(interiorBlockingLF || 0) :
                 key === "interiorNonLoad"      ? Number(interiorNonLoadLF  || 0) :
                 key === "kneeWall"             ? Number(kneeWallLF         || 0) :
                 0;
             const usedPanelLenFt = Number(panelLenByKey[key]) || 8;
             const panels = Math.ceil((lf / Math.max(1, usedPanelLenFt)) * 1.1);
             const ratePerLF = Number(rateByKey[key] ?? rateConfigDefault?.ratePerLF ?? 0);
             const ratePerPanel = Number(rateConfigDefault?.ratePerPanel ?? 0);
             const subtotal = lf * ratePerLF;
             L.push({ label, key, lf, panelLenFt: usedPanelLenFt, panels, ratePerLF, ratePerPanel, total: subtotal, isQtyBased: false });
         };
         const pushQty = (label, key, rateConfigDefault) => {
             const qty = Number(manualInputByKey[key] ?? 0);
             const rateEach = Number(rateByKey[key] ?? rateConfigDefault?.each ?? 0);
             const subtotal = qty * rateEach;
             L.push({ label, key, qty, lf: 0, panelLenFt: '—', panels: '—', ratePerLF: rateEach, ratePerPanel: 'n/a', total: subtotal, isQtyBased: true });
         };

         pushLF("Exterior Walls",                     "exteriorWalls",        rates.exteriorWalls);
         pushLF("Interior Shear walls",               "interiorShear",        rates.interiorShear);
         pushLF("Interior wall with blocking only",   "interiorBlockingOnly", rates.interiorBlocking);
         pushLF("Interior Non-load bearing walls",    "interiorNonLoad",      rates.interiorNonLoad);
         pushLF("Knee wall",                          "kneeWall",             rates.kneeWall);
         pushQty("Windows",                           "windows",              rates.windows);
         pushQty("Exterior Doors",                    "exteriorDoors",        rates.exteriorDoors);
         pushQty("2x10 blocking rows",                "blocking2x10",         rates.blocking2x10);
         
         return L;
     }, [
         rates, panelLenByKey, rateByKey, manualInputByKey,
         exteriorLF, interiorShearLF, interiorBlockingLF, interiorNonLoadLF, kneeWallLF
     ]);

     const totals = useMemo(() => {
         const lf = lines.reduce((s, x) => s + (Number(x.lf) || 0), 0);
         const panels = lines.filter(x => !x.isQtyBased).reduce((s, x) => s + (Number(x.panels) || 0), 0);
         const total = lines.reduce((s, x) => s + (Number(x.total) || 0), 0);
         return { lf, panels, total };
     }, [lines]);


     // --- **THIS IS THE FIX (PART 3)** ---
     // This effect reports totals. It must NOT depend on `data`.
     const lastSentRef = useRef(null);
     useEffect(() => {
        const newTotals = { total: totals.total, panels: totals.panels };
        const sig = JSON.stringify(newTotals);

        if (sig !== lastSentRef.current) {
             lastSentRef.current = sig;
             // Use functional update form
             onChange(prevData => ({
               ...prevData,
               total: newTotals.total,
               panels: newTotals.panels,
             }));
        }
     }, [totals, onChange]); // <-- Only depends on `totals` and stable `onChange`


     // --- RENDER ---
     // (This logic is unchanged)
     return (
         <AccordionSection
             open={!collapsed}
             onOpenChange={(isOpen) => setCollapsed(!isOpen)} 
             bar={({ open, toggle }) => (
                 <div style={{ display:'flex', alignItems:'center', gap: 8, width: '100%' }}>
                     <button
                         type="button"
                         className="acc__button"
                         onClick={toggle}
                         aria-expanded={open}
                         title={open ? "Collapse" : "Expand"}
                     >
                          <img
                             src={open ? '/icons/minimize.png' : '/icons/down.png'}
                             alt={open ? 'Collapse section' : 'Expand section'}
                             width={16}
                             height={16}
                             className="acc__chev"
                             style={{ display: 'inline-block', verticalAlign: 'middle' }}
                         />
                     </button>
                     <h2 className="ew-h2" style={{ margin:0 }}>Panels Manufacture Estimate</h2>
                     <div style={{ marginLeft:'auto' }} />
                     <div
                         className="ew-right"
                         title="Panels manufacture subtotal"
                         style={{ fontWeight:800 }}
                     >
                         {money(totals.total)}
                     </div>
                 </div>
             )}
         >
             <div className="table-wrap">
                 <table className="tbl" style={{ width: "100%", tableLayout: "fixed" }}>
                     <colgroup><col style={{ width: "26%" }} /><col style={{ width: "13%" }} /><col style={{ width: "13%" }} /><col style={{ width: "13%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} /><col style={{ width: "11%" }} /></colgroup>
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
                                 <tr key={r.key}>
                                     <td>{r.label}</td>
                                     <td className="num">
                                        {r.isQtyBased ? (
                                             <input
                                                 className="ew-input focus-anim"
                                                 type="number" min="0" step="1"
                                                 value={manualInputByKey[r.key] ?? ''}
                                                 onChange={handleManualInputChange(r.key)}
                                                 onBlur={handleManualInputBlur(r.key)}
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
                                             <input
                                                 className="ew-input focus-anim"
                                                 type="number" min="1" step="0.01"
                                                 value={panelLenByKey[r.key] ?? ''}
                                                 onChange={handlePanelLenChange(r.key)}
                                                 style={{ width: 90, textAlign: "right", padding: '4px 8px' }}
                                             />
                                         ) : (
                                              r.panelLenFt
                                         )}
                                     </td>
                                     <td className="num">{r.isQtyBased ? "—" : fmt(r.panels)}</td>
                                     <td className="num">
                                         <input
                                             className="ew-input focus-anim"
                                             type="number" step="0.01" min="0"
                                             value={rateByKey[r.key] ?? ''}
                                             onChange={handleRateChange(r.key)}
                                             onBlur={handleRateBlur(r.key)}
                                             style={{ width: 110, textAlign: "right", padding: '4px 8px' }}
                                         />
                                     </td>
                                     <td className="num">
                                         {r.ratePerPanel === "n/a" ? "n/a" : money(r.ratePerPanel)}
                                     </td>
                                     <td className="num ew-money">{money(r.total)}</td>
                                 </tr>
                             );
                         })}
                     </tbody>
                     <tfoot>
                         <tr>
                             <th colSpan={3} style={{ textAlign: "right" }}>TOTALS</th>
                             <th className="num ew-total-panels">{fmt(totals.panels)}</th>
                             <th colSpan={2}></th>
                             <th className="num ew-total-panels">{money(totals.total)}</th>
                         </tr>
                     </tfoot>
                 </table>
             </div>
         </AccordionSection>
     );
 }