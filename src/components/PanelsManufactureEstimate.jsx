// src/components/PanelsManufactureEstimate.jsx
"use client";
import { useEffect, useCallback, useRef } from "react";
import { computeManufacture, STUD_MULTIPLIER_ADDON_PER_LF, TALL_WALL_ADDON_PER_LF, TALL_WALL_LIMIT_FT } from '@/domain/estimate';
import { RotateCcw } from 'lucide-react';
import { GroupBlock, NumInput } from "@/components/ui/mat";
import { useConfirm } from "@/components/ui/confirm";

// rates and add-on rules live in src/domain/estimate (computeManufacture)
export { STUD_MULTIPLIER_ADDON_PER_LF, TALL_WALL_ADDON_PER_LF, TALL_WALL_LIMIT_FT, sectionAddonPerLF } from '@/domain/estimate';

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n) => Number.isFinite(Number(n)) ? USD.format(Number(n)) : "$0.00";
const fmt = (n) => Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-US") : "0";


export default function PanelsManufactureEstimate({ data, calc: calcProp, onChange }) {
  const { collapsed = true, rateByKey = {}, panelLenByKey = {}, manualInputByKey = {} } = data || {};
  const calc = calcProp || computeManufacture(data);
  const lines = calc.lines;
  const totals = { panels: calc.panels, total: calc.total };

  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);


  const confirm = useConfirm();
  const handleResetAll = useCallback(async () => {
    const ok = await confirm({ title: 'Reset manufacture rates?', message: 'Rates, panel lengths and window/door counts go back to their defaults.', confirmLabel: 'Reset rates', tone: 'danger' });
    if (ok && onChangeRef.current) {
      onChangeRef.current(p => ({ ...p, rateByKey: {}, rateTouched: {}, panelLenByKey: {}, panelLenTouched: {}, manualInputByKey: {} }));
    }
  }, [confirm]);

  const handleBlur = (field, key, val) => {
    const num = Number(val) || 0;
    if (onChangeRef.current) {
      onChangeRef.current(p => ({
        ...p, [field]: { ...(p[field] || {}), [key]: num },
        ...(/rate|panelLen/i.test(field) ? { [`${field.replace('ByKey', 'Touched')}`]: { ...(p[`${field.replace('ByKey', 'Touched')}`] || {}), [key]: true } } : {})
      }));
    }
  };

  const lfKeys = ["exteriorWalls", "interiorShear", "interiorBlockingOnly", "interiorNonLoad", "kneeWall", "blocking2x10"];

  return (
    <GroupBlock
      standalone
      open={!collapsed}
      onToggle={(o) => onChangeRef.current && onChangeRef.current((p) => ({ ...p, collapsed: !o }))}
      title="Panels manufacture"
      toolbar={<button type="button" className="ew-btn ew-btn--ghost" onClick={handleResetAll} title="Reset rates and panel lengths to defaults"><RotateCcw size={12} /> Reset rates</button>}
      subtotal={totals.total}
    >
      <table className="tbl">
        <colgroup>
          <col style={{ width: '26%' }} /><col /><col /><col /><col style={{ width: '24%' }} /><col /><col />
        </colgroup>
        <thead>
          <tr>
            <th>Wall type</th>
            <th className="num">LF / qty</th>
            <th className="num">Panel length (ft)</th>
            <th className="num">Panels</th>
            <th className="num" title="Base rate + add-ons for doubled studs and walls over 10 ft">Rate / LF · each</th>
            <th className="num">Rate / panel</th>
            <th className="num">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((r) => (
            <tr key={r.key}>
              <td style={{ fontWeight: 600 }}>{r.label}</td>
              <td className="num">
                {r.isQtyBased ? (
                  <NumInput w={72} value={manualInputByKey[r.key] ?? 0} onCommit={(v) => handleBlur('manualInputByKey', r.key, v)} />
                ) : Number(r.lf || 0).toLocaleString('en-US')}
              </td>
              <td className="num">
                {r.isQtyBased || !lfKeys.includes(r.key) ? <span className="ew-subtle">—</span> : (
                  <NumInput w={56} value={panelLenByKey[r.key] ?? r.panelLenFt} onCommit={(v) => handleBlur('panelLenByKey', r.key, v)} />
                )}
              </td>
              <td className="num" style={{ fontWeight: 600 }}>{r.isQtyBased ? <span className="ew-subtle">—</span> : fmt(r.panels)}</td>
              <td className="num">
                <div className="rate-cell">
                  <NumInput w={64} step="0.01" value={rateByKey[r.key] ?? r.baseRate} onCommit={(v) => handleBlur('rateByKey', r.key, v)} aria-label={`${r.label} base rate`} />
                  {r.addonPerLF > 0 ? (
                    <span
                      className="rate-addon"
                      title={`Base ${money(r.baseRate)} + ${money(r.addonPerLF)}/LF average add-on (studs per location over single: +$${STUD_MULTIPLIER_ADDON_PER_LF}/LF each; walls over ${TALL_WALL_LIMIT_FT} ft: +$${TALL_WALL_ADDON_PER_LF}/LF)`}
                    >
                      +{money(r.addonPerLF)} = <strong>{money(r.ratePerLF)}</strong>
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="num ew-subtle">{typeof r.ratePerPanel === 'number' ? money(r.ratePerPanel) : '—'}</td>
              <td className="num" style={{ fontWeight: 600 }}>{money(r.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="num ew-subtle">Total panels</td>
            <td className="num">{fmt(totals.panels)}</td>
            <td colSpan={2}></td>
            <td className="num money-section">{money(totals.total)}</td>
          </tr>
        </tfoot>
      </table>
    </GroupBlock>
  );
}
