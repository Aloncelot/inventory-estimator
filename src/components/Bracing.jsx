// src/components/Bracing.jsx
// Temporary bracing for all levels, estimated apart for wall panels and trusses
// (on site the same pieces may be reused, but they are counted separately).
'use client';

import { useCallback, useEffect, useRef } from 'react';
import ItemPicker from '@/components/ItemPicker';
import { GroupBlock, MatHead, SortableMatRow, SortableList, applyOrder, NumInput, Fld, noteOf, patchNote } from '@/components/ui/mat';
import { computeBracing } from '@/domain/estimate';
import { BRACING_DEFAULTS } from '@/domain/lib/defaults';

export default function Bracing({ title = 'Bracing (all levels)', data, calc: calcProp, onChange }) {
  const { collapsed = true, sel = {}, notes = {} } = data || {};
  const calc = calcProp || computeBracing(data);
  const { inputs } = calc;

  const updRef = useRef(onChange);
  useEffect(() => { updRef.current = onChange; }, [onChange]);
  const update = useCallback((fn) => updRef.current?.(fn), []);
  const setInput = (key, v) => update((p) => ({ ...p, inputs: { ...(p.inputs || {}), [key]: v } }));

  const rowInputs = (r) => {
    if (r.key === 'panels') return [
      <Fld key="pp" label="Braces / panel" w={44}><NumInput value={inputs.bracesPerPanel} onCommit={(v) => setInput('bracesPerPanel', v)} /></Fld>,
    ];
    if (r.key === 'trusses') return [
      <Fld key="ar" label="Building area (sq ft)" w={64} title="Leave 0 to use the Roof sq ft from Loose material">
        <NumInput value={inputs.buildingAreaSqFt || ''} placeholder={calc.roofAreaSqFt ? String(calc.roofAreaSqFt) : '0'} onCommit={(v) => setInput('buildingAreaSqFt', v)} />
      </Fld>,
      <Fld key="ru" label="Braced at once (sq ft)" w={56} title="Bracing is bought for one section and reused; 0 = whole building at once">
        <NumInput value={inputs.reuseAreaSqFt} onCommit={(v) => setInput('reuseAreaSqFt', v)} />
      </Fld>,
      <Fld key="pb" label="Pcs / bundle" w={44}><NumInput value={inputs.piecesPerBundle} onCommit={(v) => setInput('piecesPerBundle', v)} /></Fld>,
    ];
    return null;
  };

  const rows = applyOrder(calc.baseRows, data?.rowOrder);

  return (
    <GroupBlock
      standalone
      open={!collapsed}
      onToggle={(o) => update((p) => ({ ...p, collapsed: !o }))}
      title={title}
      toolbar={<span className="ew-subtle">{calc.panels.toLocaleString('en-US')} panels</span>}
      subtotal={calc.total}
    >
      <div className="mat" role="table">
        <MatHead />
        <SortableList ids={rows.map((r) => r.key)} onMove={(a, o, ids) => update((p) => ({ ...p, rowOrder: ids }))}>
          {rows.map((r) => (
            <SortableMatRow
              key={r.key}
              id={r.key}
              label={r.label}
              labelTitle={`${r.label} — ${r.hint}`}
              inputs={rowInputs(r)}
              material={<ItemPicker value={sel[r.key]} onSelect={(v) => update((p) => ({ ...p, sel: { ...(p.sel || {}), [r.key]: v } }))} defaults={BRACING_DEFAULTS[r.key]} />}
              qty={r.qtyRaw}
              waste={r.wastePct}
              onWasteCommit={(v) => update((p) => ({ ...p, waste: { ...(p.waste || {}), [r.key]: v } }))}
              final={r.qtyFinal}
              unit={r.unit}
              unitPrice={r.unitPrice}
              priceDate={r.priceDate}
              subtotal={r.subtotal}
              note={noteOf(notes, r.key)}
              onNoteChange={(patch) => update(patchNote(r.key, patch))}
            />
          ))}
        </SortableList>
      </div>
    </GroupBlock>
  );
}
