// src/components/PanelsManufactureEstimate.jsx
"use client";
import { useMemo, useEffect, useState, useCallback, useRef } from "react";
import AccordionSection from "./ui/AccordionSection";
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';

const DEFAULT_RATES = {
  exteriorWalls: { ratePerLF: 10.5 },
  interiorShear: { ratePerLF: 10.25 },
  interiorBlocking: { ratePerLF: 6.5 },
  interiorNonLoad: { ratePerLF: 6.0 },
  kneeWall: { ratePerLF: 4.5 },
  windows: { each: 20.05 },
  exteriorDoors: { each: 15.19 },
  blocking2x10: { each: 0.6 },
};

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => Number.isFinite(Number(n)) ? USD.format(Number(n)) : "$0.00";
const fmt = (n) => Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-US") : "0";

const gridHeader = '400px 140px 160px 160px 200px 150px 1fr';
const gridRows = '400px 140px 160px 145px 195px 145px 1fr';

export default function PanelsManufactureEstimate({
  data, onChange, rates = DEFAULT_RATES,
  panelLenFt = 8, panelLenFtInterior = 8, panelLenFtExterior = undefined,
  exteriorLF = 0, interiorShearLF = 0, interiorBlockingLF = 0,
  interiorNonLoadLF = 0, kneeWallLF = 0, blocking2x10LF = 0,
}) {
  const { collapsed = true, rateByKey = {}, rateTouched = {}, panelLenByKey = {}, panelLenTouched = {}, manualInputByKey = {} } = data || {};

  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const [localRateByKey, setLocalRateByKey] = useState(rateByKey);
  const [localPanelLenByKey, setLocalPanelLenByKey] = useState(panelLenByKey);
  const [localManualInputByKey, setLocalManualInputByKey] = useState(manualInputByKey);

  useEffect(() => { setLocalRateByKey(rateByKey); }, [JSON.stringify(rateByKey)]);
  useEffect(() => { setLocalPanelLenByKey(panelLenByKey); }, [JSON.stringify(panelLenByKey)]);
  useEffect(() => { setLocalManualInputByKey(manualInputByKey); }, [JSON.stringify(manualInputByKey)]);

  const handleResetAll = useCallback(() => {
    if (confirm("Reset all rates and panel lengths to defaults?") && onChangeRef.current) {
      onChangeRef.current(p => ({ ...p, rateByKey: {}, rateTouched: {}, panelLenByKey: {}, panelLenTouched: {}, manualInputByKey: {} }));
    }
  }, []);

  const handleBlur = (field, key, val) => {
    const num = Number(val) || 0;
    if (onChangeRef.current) {
      onChangeRef.current(p => ({
        ...p, [field]: { ...(p[field] || {}), [key]: num },
        ...(field.includes('Rate') || field.includes('panelLen') ? { [`${field.replace('ByKey', 'Touched')}`]: { ...(p[`${field.replace('ByKey', 'Touched')}`] || {}), [key]: true } } : {})
      }));
    }
  };

  const lines = useMemo(() => {
    const L = [];
    const pushLF = (label, key, rateConfigDefault) => {
      const lf = key === "exteriorWalls" ? Number(exteriorLF || 0) : key === "interiorShear" ? Number(interiorShearLF || 0) : key === "interiorBlockingOnly" ? Number(interiorBlockingLF || 0) : key === "interiorNonLoad" ? Number(interiorNonLoadLF || 0) : key === "kneeWall" ? Number(kneeWallLF || 0) : key === "blocking2x10" ? Number(blocking2x10LF || 0) : 0;
      const usedPanelLenFt = Number(panelLenByKey[key]) || (key === "exteriorWalls" ? Number(panelLenFtExterior ?? panelLenFt) : Number(panelLenFtInterior));
      const panels = Math.ceil((lf / Math.max(1, usedPanelLenFt)) * 1.1);
      const ratePerLF = Number(rateByKey[key] ?? rateConfigDefault?.ratePerLF ?? rateConfigDefault?.each ?? 0);
      L.push({ label, key, lf, panelLenFt: usedPanelLenFt, panels, ratePerLF, ratePerPanel: usedPanelLenFt * ratePerLF, total: ratePerLF * panels, isQtyBased: false });
    };

    const pushQty = (label, key, rateConfigDefault) => {
      const qty = Number(manualInputByKey[key] ?? 0);
      const rateEach = Number(rateByKey[key] ?? rateConfigDefault?.each ?? 0);
      L.push({ label, key, qty, lf: 0, panelLenFt: "—", panels: "—", ratePerLF: rateEach, ratePerPanel: "n/a", total: qty * rateEach, isQtyBased: true });
    };

    pushLF("Exterior Walls", "exteriorWalls", rates.exteriorWalls);
    pushLF("Interior Shear walls", "interiorShear", rates.interiorShear);
    pushLF("Interior wall (blocking only)", "interiorBlockingOnly", rates.interiorBlocking); // Fila 3: Bearing
    pushLF("Interior Non-load bearing", "interiorNonLoad", rates.interiorNonLoad);
    pushLF("Knee wall", "kneeWall", rates.kneeWall);
    pushQty("Windows", "windows", rates.windows);
    pushQty("Exterior Doors", "exteriorDoors", rates.exteriorDoors);
    pushLF("2x10 blocking rows", "blocking2x10", rates.blocking2x10); // Fila 8: Int Blocking
    return L;
  }, [rates, panelLenByKey, rateByKey, manualInputByKey, exteriorLF, interiorShearLF, interiorBlockingLF, interiorNonLoadLF, kneeWallLF, blocking2x10LF, panelLenFt, panelLenFtExterior, panelLenFtInterior]);

  const totals = useMemo(() => {
    const panels = lines.filter(x => !x.isQtyBased).reduce((s, x) => s + (Number(x.panels) || 0), 0);
    const total = Number(lines.reduce((s, x) => s + (Number(x.total) || 0), 0).toFixed(2));
    return { panels, total };
  }, [lines]);

  const lastSentRef = useRef(null);
  useEffect(() => {
    const sig = JSON.stringify(totals);
    if (sig !== lastSentRef.current) {
      lastSentRef.current = sig;
      if (onChangeRef.current) onChangeRef.current(prev => ({ ...prev, total: totals.total, panels: totals.panels }));
    }
  }, [totals]);

  return (
    <div className="ew-card">
      <AccordionSection
        open={!collapsed} onOpenChange={(isOpen) => onChangeRef.current && onChangeRef.current(p => ({ ...p, collapsed: !isOpen }))}
        bar={({ open, toggle }) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: "100%" }}>
            <button type="button" className="acc__button" onClick={toggle}>{open ? <ChevronDown className="gradient-icon" size={20} /> : <ChevronRight className="gradient-icon" size={20} />}</button>
            <h2 className="text-section-header">Panels Manufacture Estimate</h2>
            <button className="row-action-btn" onClick={(e) => { e.stopPropagation(); handleResetAll(); }} title="Reset defaults" style={{ marginLeft: 8 }}><RotateCcw size={16} className="gradient-icon" /></button>
            <div className="text-subtotal-orange ml-auto">Subtotal: {money(totals.total)}</div>
          </div>
        )}
      >
        <div style={{ marginTop: 12 }}>
          <div className="ew-grid ew-grid-header" style={{ display: 'grid', gridTemplateColumns: gridHeader, minHeight: '40px', background: 'var(--bg-750)', borderRadius: '4px', marginBottom: '4px', alignItems: 'center' }}>
            {['Wall type', 'LF / Qty', 'Panel Len (ft)', '# Panels', 'Rate / LF ($ Each)', 'Rate / Panel $', 'Subtotal'].map((h, i) => (
              <div key={h} style={{ padding: '0 12px', fontSize: '0.75rem', fontWeight: 700, textAlign: i === 0 ? 'left' : 'right' }}>{h}</div>
            ))}
          </div>
          <div className="ew-rows">
            {lines.map((r) => (
              <div key={r.key} className="ew-grid ew-row" style={{ display: 'grid', gridTemplateColumns: gridRows, minHeight: '48px', borderBottom: '1px solid var(--border-subtle)', alignItems: 'center' }}>
                <div style={{ paddingLeft: '12px', fontWeight: 600, fontSize: '0.85rem', textAlign: 'left' }}>{r.label}</div>
                <div style={{ paddingRight: '12px', textAlign: 'right' }}>
                  {r.isQtyBased ? (<input className="ew-input focus-anim" type="number" value={localManualInputByKey[r.key] ?? 0} onChange={e => setLocalManualInputByKey(p => ({ ...p, [r.key]: e.target.value }))} onBlur={e => handleBlur('manualInputByKey', r.key, e.target.value)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} style={{ width: '80px', textAlign: 'right', height: '28px' }} />) : <span>{Number(r.lf || 0).toLocaleString()}</span>}
                </div>
                <div style={{ paddingRight: '12px', textAlign: 'right' }}>
                  {r.isQtyBased ? "—" : ["exteriorWalls", "interiorShear", "interiorBlockingOnly", "interiorNonLoad", "kneeWall", "blocking2x10"].includes(r.key) ? (<input className="ew-input focus-anim" type="number" value={localPanelLenByKey[r.key] ?? r.panelLenFt} onChange={e => setLocalPanelLenByKey(p => ({ ...p, [r.key]: e.target.value }))} onBlur={e => handleBlur('panelLenByKey', r.key, e.target.value)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} style={{ width: '70px', textAlign: 'right', height: '28px' }} />) : r.panelLenFt}
                </div>
                <div style={{ paddingRight: '12px', fontWeight: 700, textAlign: 'right', opacity: r.isQtyBased ? 0.3 : 1 }}>{r.isQtyBased ? "—" : fmt(r.panels)}</div>
                <div style={{ paddingRight: '12px', textAlign: 'right' }}>
                  <input className="ew-input focus-anim" type="number" step="0.01" value={localRateByKey[r.key] ?? r.ratePerLF} onChange={e => setLocalRateByKey(p => ({ ...p, [r.key]: e.target.value }))} onBlur={e => handleBlur('rateByKey', r.key, e.target.value)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} style={{ width: '90px', textAlign: 'right', height: '28px' }} />
                </div>
                <div style={{ paddingRight: '12px', fontSize: '0.8rem', opacity: 0.7, textAlign: 'right' }}>{typeof r.ratePerPanel === "number" ? money(r.ratePerPanel) : "n/a"}</div>
                <div className="ew-right ew-money" style={{ paddingRight: '12px', color: 'var(--turq-200)', fontWeight: 700, textAlign: 'right' }}>{money(r.total)}</div>
              </div>
            ))}
          </div>
          <div className="ew-grid" style={{ display: 'grid', gridTemplateColumns: gridRows, minHeight: '48px', borderTop: '2px solid var(--border)', marginTop: '4px', alignItems: 'center' }}>
            <div style={{ gridColumn: '1 / span 3', textAlign: 'right', paddingRight: '12px', fontSize: '0.75rem', opacity: 0.6, fontWeight: 700 }}>TOTALS</div>
            <div style={{ paddingRight: '12px', color: 'var(--turq-400)', fontWeight: 800, textAlign: 'right' }}>{fmt(totals.panels)}</div>
            <div style={{ gridColumn: '5 / span 2' }}></div>
            <div className="ew-right ew-money" style={{ paddingRight: '12px', fontSize: '1.1rem', fontWeight: 800, textAlign: 'right' }}>{money(totals.total)}</div>
          </div>
        </div>
      </AccordionSection>
    </div>
  );
}