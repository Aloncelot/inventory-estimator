 "use client";
import { useMemo, useEffect, useState, useCallback } from "react";
// Corrected import paths to use relative paths
import AccordionSection from "./ui/AccordionSection";
import { useLocalStorageJson } from "../hooks/useLocalStorageJson";

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
     rows = {},
     panelLenFt = 8,           // global fallback
     panelLenFtInterior = 8,       // derived default for interior shear
     panelLenFtExterior = undefined, // derived default for exterior; if missing falls back to panelLenFt
     panelLenFtInteriorBlocking = 8,
     rates = DEFAULT_RATES,
     // defaultCollapsed = false, // We'll manage state internally now
     persistKey = "inv:v1:pme:ui", // Updated key for clarity and consistency
     onTotalChange,
     exteriorLF = 0,
     interiorShearLF = 0,
     interiorBlockingLF = 0,
     interiorNonLoadLF,
     kneeWallLF,
 }) {
     // State for accordion collapse using local storage
     const [uiState, setUiState] = useLocalStorageJson(persistKey, { collapsed: false });
     const collapsed = !!uiState.collapsed;
     const setCollapsed = useCallback((isCollapsed) => {
         setUiState(prev => ({ ...prev, collapsed: !!isCollapsed }));
     }, [setUiState]);

     // --- Safe Shape Calculation ---
     const safe = useMemo(() => ({
         exteriorWalls: rows.exteriorWalls || { lf: 0, panels: 0 },
         interiorShear: rows.interiorShear || { lf: 0, panels: 0 },
         interiorBlockingOnly: rows.interiorBlockingOnly || { lf: 0, panels: 0 },
         interiorNonLoad: rows.interiorNonLoad || { lf: 0, panels: 0 },
         kneeWall: rows.kneeWall || { lf: 0, panels: 0 },
         windows: rows.windows || { qty: 0 },
         exteriorDoors: rows.exteriorDoors || { qty: 0 },
         blocking2x10: rows.blocking2x10 || { rows: 0 },
     }), [rows]);


     // --- Rate per LF State ---
     const [rateByKey, setRateByKey] = useState(() => ({ // Initialize directly
         exteriorWalls: rates.exteriorWalls?.ratePerLF ?? 0,
         interiorShear: rates.interiorShear?.ratePerLF ?? 0,
         interiorBlockingOnly: rates.interiorBlocking?.ratePerLF ?? 0,
         interiorNonLoad: rates.interiorNonLoad?.ratePerLF ?? 0,
         kneeWall: rates.kneeWall?.ratePerLF ?? 0,
         windows: rates.windows?.each ?? 0, // Added for qty-based items
         exteriorDoors: rates.exteriorDoors?.each ?? 0, // Added for qty-based items
         blocking2x10: rates.blocking2x10?.each ?? 0, // Added for qty-based items
     }));
     const [rateTouched, setRateTouched] = useState({});

     // Update rates from props if not touched by user
     useEffect(() => {
         setRateByKey(prev => ({
             exteriorWalls:        rateTouched.exteriorWalls        ? prev.exteriorWalls        : (rates.exteriorWalls?.ratePerLF ?? prev.exteriorWalls ?? 0),
             interiorShear:        rateTouched.interiorShear        ? prev.interiorShear        : (rates.interiorShear?.ratePerLF ?? prev.interiorShear ?? 0),
             interiorBlockingOnly: rateTouched.interiorBlockingOnly ? prev.interiorBlockingOnly : (rates.interiorBlocking?.ratePerLF ?? prev.interiorBlockingOnly ?? 0),
             interiorNonLoad:      rateTouched.interiorNonLoad      ? prev.interiorNonLoad      : (rates.interiorNonLoad?.ratePerLF ?? prev.interiorNonLoad ?? 0),
             kneeWall:             rateTouched.kneeWall             ? prev.kneeWall             : (rates.kneeWall?.ratePerLF ?? prev.kneeWall ?? 0),
             windows:              rateTouched.windows              ? prev.windows              : (rates.windows?.each ?? prev.windows ?? 0),
             exteriorDoors:        rateTouched.exteriorDoors        ? prev.exteriorDoors        : (rates.exteriorDoors?.each ?? prev.exteriorDoors ?? 0),
             blocking2x10:         rateTouched.blocking2x10         ? prev.blocking2x10         : (rates.blocking2x10?.each ?? prev.blocking2x10 ?? 0),
         }));
     }, [rates, rateTouched]);


     // --- Panel Length State ---
     const [panelLenByKey, setPanelLenByKey] = useState(() => ({ // Initialize directly
         exteriorWalls: Number(panelLenFtExterior ?? panelLenFt) || 8,
         interiorShear: Number(panelLenFtInterior ?? 8) || 8,
         interiorBlockingOnly: Number(panelLenFtInteriorBlocking ?? 8) || 8,
         // NonLoad and KneeWall often don't have separate panel lengths specified, inherit from interior default
         interiorNonLoad: Number(panelLenFtInterior ?? 8) || 8,
         kneeWall: Number(panelLenFtInterior ?? 8) || 8,
     }));
     const [panelLenTouched, setPanelLenTouched] = useState({});

     // Update panel lengths from props if not touched
     useEffect(() => {
         setPanelLenByKey(prev => ({
             exteriorWalls:        panelLenTouched.exteriorWalls        ? prev.exteriorWalls        : (Number(panelLenFtExterior ?? panelLenFt) || 8),
             interiorShear:        panelLenTouched.interiorShear        ? prev.interiorShear        : (Number(panelLenFtInterior) || 8),
             interiorBlockingOnly: panelLenTouched.interiorBlockingOnly ? prev.interiorBlockingOnly : (Number(panelLenFtInteriorBlocking) || 8),
             interiorNonLoad:      panelLenTouched.interiorNonLoad      ? prev.interiorNonLoad      : (Number(panelLenFtInterior) || 8), // Use interior default
             kneeWall:             panelLenTouched.kneeWall             ? prev.kneeWall             : (Number(panelLenFtInterior) || 8), // Use interior default
         }));
     }, [panelLenFtExterior, panelLenFtInterior, panelLenFtInteriorBlocking, panelLenFt, panelLenTouched]); // Removed duplicate panelLenFt


     // --- Manual LF/Qty State (for rows not driven by props) ---
     const manualInputKeys = useMemo(() => new Set(['windows', 'exteriorDoors', 'blocking2x10']), []);
     const [manualInputByKey, setManualInputByKey] = useState(() => ({ // Initialize directly
         windows: safe.windows?.qty ?? 0,
         exteriorDoors: safe.exteriorDoors?.qty ?? 0,
         blocking2x10: safe.blocking2x10?.rows ?? 0,
     }));
     const [manualInputTouched, setManualInputTouched] = useState({});

     // Update manual inputs from rows prop if not touched (less common, but for completeness)
      useEffect(() => {
          setManualInputByKey(prev => ({
              windows: manualInputTouched.windows ? prev.windows : (safe.windows?.qty ?? 0),
              exteriorDoors: manualInputTouched.exteriorDoors ? prev.exteriorDoors : (safe.exteriorDoors?.qty ?? 0),
              blocking2x10: manualInputTouched.blocking2x10 ? prev.blocking2x10 : (safe.blocking2x10?.rows ?? 0),
          }));
      }, [safe, manualInputTouched]); // Depend on safe object

     // --- Build table lines ---
     const lines = useMemo(() => {
         const L = [];

         // Helper to push LF-based rows
         const pushLF = (label, key, rateConfigDefault) => {
             const lf =
                 key === "exteriorWalls"        ? Number(exteriorLF         || 0) :
                 key === "interiorShear"        ? Number(interiorShearLF    || 0) :
                 key === "interiorBlockingOnly" ? Number(interiorBlockingLF || 0) :
                 key === "interiorNonLoad"      ? Number(interiorNonLoadLF  || 0) :
                 key === "kneeWall"             ? Number(kneeWallLF         || 0) :
                 0; // Should not happen for these keys

             const usedPanelLenFt = Number(panelLenByKey[key]) || 8; // Use state value
             const panels = Math.ceil((lf / Math.max(1, usedPanelLenFt)) * 1.1);
             const ratePerLF = Number(rateByKey[key] ?? rateConfigDefault?.ratePerLF ?? 0); // Use state value
             const ratePerPanel = Number(rateConfigDefault?.ratePerPanel ?? 0); // Use prop/default rate
             const subtotal = lf * ratePerLF;

             L.push({
                 label, key, lf,
                 panelLenFt: usedPanelLenFt,
                 panels,
                 ratePerLF,
                 ratePerPanel, // Keep for display
                 total: subtotal,
                 isQtyBased: false,
             });
         };

          // Helper to push Qty-based rows
         const pushQty = (label, key, rateConfigDefault) => {
             const qty = Number(manualInputByKey[key] ?? 0); // Use state value
             const rateEach = Number(rateByKey[key] ?? rateConfigDefault?.each ?? 0); // Use state value for rate
             const subtotal = qty * rateEach;

             L.push({
                 label, key, qty,
                 lf: 0, // Not applicable
                 panelLenFt: '—', // Not applicable
                 panels: '—', // Not applicable
                 ratePerLF: rateEach, // Store 'each' rate here for the input field
                 ratePerPanel: 'n/a', // Not applicable
                 total: subtotal,
                 isQtyBased: true,
             });
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
         rates, // Use original rates for default ratePerPanel display
         panelLenByKey, rateByKey, manualInputByKey, // Use state values for calculations
         exteriorLF, interiorShearLF, interiorBlockingLF, interiorNonLoadLF, kneeWallLF // Use props for LF values
     ]);


     // --- Calculate Totals ---
     const totals = useMemo(() => {
         const lf = lines.reduce((s, x) => s + (Number(x.lf) || 0), 0);
         // Filter out qty-based rows before summing panels
         const panels = lines.filter(x => !x.isQtyBased).reduce((s, x) => s + (Number(x.panels) || 0), 0);
         const total = lines.reduce((s, x) => s + (Number(x.total) || 0), 0);
         return { lf, panels, total };
     }, [lines]);


     // --- Effect to notify parent of total changes ---
     useEffect(() => {
         onTotalChange?.({ total: totals.total, panels: totals.panels });
     }, [totals.total, totals.panels, onTotalChange]);


     // --- Handlers for Input Changes ---
     const handlePanelLenChange = useCallback((key) => (e) => {
         const v = Number(e.target.value) || 0;
         setPanelLenByKey(prev => ({ ...prev, [key]: Math.max(1, v) })); // Ensure panel length is at least 1
         setPanelLenTouched(prev => ({ ...prev, [key]: true }));
     }, []);

     const handleRateChange = useCallback((key) => (e) => {
         const v = e.target.value;
         // Allow intermediate empty/decimal states but store as number
         setRateByKey(prev => ({ ...prev, [key]: v }));
     }, []);

     const handleRateBlur = useCallback((key) => (e) => {
          const v = parseFloat(e.target.value);
          const finalRate = Number.isFinite(v) ? v : 0;
          setRateByKey(prev => ({ ...prev, [key]: finalRate }));
          setRateTouched(prev => ({ ...prev, [key]: true }));
     }, []);

      const handleManualInputChange = useCallback((key) => (e) => {
          const v = e.target.value;
          // Allow intermediate states but store number
          setManualInputByKey(prev => ({ ...prev, [key]: v }));
      }, []);

     const handleManualInputBlur = useCallback((key) => (e) => {
         const v = parseInt(e.target.value, 10); // Expect integers for qty/rows
         const finalValue = Number.isFinite(v) && v >= 0 ? v : 0;
         setManualInputByKey(prev => ({ ...prev, [key]: finalValue }));
         setManualInputTouched(prev => ({ ...prev, [key]: true }));
     }, []);


     // const contentId = "manufacture-estimate-body"; // Can be removed if not directly used

     return (
         // Use AccordionSection as the main wrapper
         <AccordionSection
             open={!collapsed}
             onOpenChange={(isOpen) => setCollapsed(!isOpen)}
             // Use the bar prop to render the header row
             bar={({ open, toggle }) => (
                 <div style={{ display:'flex', alignItems:'center', gap: 8, width: '100%' }}>
                     {/* Collapse/Expand button */}
                     <button
                         type="button"
                         className="acc__button" // Use standard accordion button class
                         onClick={toggle}
                         aria-expanded={open}
                         title={open ? "Collapse" : "Expand"}
                     >
                         {/* Use img tag for indicator */}
                          <img
                             src={open ? '/icons/minimize.png' : '/icons/down.png'}
                             alt={open ? 'Collapse section' : 'Expand section'}
                             width={16}
                             height={16}
                             className="acc__chev"
                             style={{ display: 'inline-block', verticalAlign: 'middle' }}
                         />
                     </button>
                     {/* Title */}
                     <h2 className="ew-h2" style={{ margin:0 }}>Panels Manufacture Estimate</h2>
                     {/* Total - aligned to the right */}
                     <div style={{ marginLeft:'auto' }} />
                     <div
                         className="ew-right"
                         title="Panels manufacture subtotal"
                         style={{ fontWeight:800 }} // Keep bold if needed
                     >
                         {money(totals.total)}
                     </div>
                 </div>
             )}
         >
             {/* The content (table) goes inside the AccordionSection */}
             <div className="table-wrap">
                 <table className="tbl" style={{ width: "100%", tableLayout: "fixed" }}>
                     {/* Remove whitespace between colgroup and col */}
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

                                     {/* LF / Qty */}
                                     <td className="num">
                                        {r.isQtyBased ? (
                                             <input
                                                 className="ew-input focus-anim"
                                                 type="number"
                                                 min="0"
                                                 step="1" // Usually integer quantities
                                                 value={manualInputByKey[r.key] ?? ''} // Controlled input
                                                 onChange={handleManualInputChange(r.key)}
                                                 onBlur={handleManualInputBlur(r.key)} // Validate and save number on blur
                                                 style={{ width: 110, textAlign: 'right', padding: '4px 8px' }}
                                             />
                                         ) : (
                                             <span>{Number(r.lf || 0).toLocaleString()}</span>
                                         )}
                                     </td>

                                     {/* Panel length */}
                                     <td className="num">
                                         {r.isQtyBased ? (
                                             "—"
                                         ) : isEditablePanel ? (
                                             <input
                                                 className="ew-input focus-anim"
                                                 type="number"
                                                 min="1"
                                                 step="0.01" // Allow decimals? Or keep integer?
                                                 value={panelLenByKey[r.key] ?? ''} // Controlled input
                                                 onChange={handlePanelLenChange(r.key)}
                                                 // onBlur event is handled by onChange setting state
                                                 style={{ width: 90, textAlign: "right", padding: '4px 8px' }}
                                             />
                                         ) : (
                                              r.panelLenFt // Display non-editable lengths if needed
                                         )}
                                     </td>

                                     {/* # Panels */}
                                     <td className="num">{r.isQtyBased ? "—" : fmt(r.panels)}</td>

                                     {/* Rate per LF / $ Each (editable) */}
                                     <td className="num">
                                         <input
                                             className="ew-input focus-anim"
                                             type="number"
                                             step="0.01"
                                             min="0"
                                             value={rateByKey[r.key] ?? ''} // Controlled input
                                             onChange={handleRateChange(r.key)}
                                             onBlur={handleRateBlur(r.key)} // Validate and save number on blur
                                             style={{ width: 110, textAlign: "right", padding: '4px 8px' }}
                                         />
                                     </td>

                                     {/* Rate per panel (read-only display) */}
                                     <td className="num">
                                         {r.ratePerPanel === "n/a" ? "n/a" : money(r.ratePerPanel)}
                                     </td>

                                     {/* Subtotal */}
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
         </AccordionSection> // Close AccordionSection
     );
 }

