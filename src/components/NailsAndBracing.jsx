// src/components/NailsAndBracing.jsx
// General nails & temporary bracing for all levels together.
'use client';

import { useCallback, useEffect, useRef } from 'react';
import ItemPicker from '@/components/ItemPicker';
import { useNailExtras } from '@/components/PanelNails';
import {
  GroupBlock, MatHead, MatSub, SortableMatRow, AddRowButton, SortableList, applyOrder, noteOf, patchNote,
} from '@/components/ui/mat';
import { computeNailsAndBracing } from '@/domain/estimate';
import { NAILS_BRACING_DEFAULTS } from '@/domain/lib/defaults';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

export default function NailsAndBracing({ title = 'Nails & bracing (all levels)', data, calc: calcProp, onChange, totals = {} }) {
  const { collapsed = true, sel = {}, notes = {} } = data || {};
  const calc = calcProp || computeNailsAndBracing(data, totals);

  const updRef = useRef(onChange);
  useEffect(() => { updRef.current = onChange; }, [onChange]);
  const update = useCallback((fn) => updRef.current?.(fn), []);

  const orderedBase = applyOrder(calc.baseRows, data?.rowOrder);
  const extras = calc.extraRows;
  const x = useNailExtras(update);
  const total = calc.total;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  return (
    <GroupBlock
      standalone
      open={!collapsed}
      onToggle={(o) => update((p) => ({ ...p, collapsed: !o }))}
      title={title}
      subtotal={total}
    >
      <div className="mat" role="table">
        <MatHead />
        <SortableList ids={orderedBase.map((r) => r.key)} onMove={(a, o, ids) => update((p) => ({ ...p, rowOrder: ids }))}>
        {orderedBase.map((r) => (
          <SortableMatRow
            key={r.key}
            id={r.key}
            label={r.label}
            labelTitle={`${r.label} — based on ${r.hint}`}
            material={<ItemPicker value={sel[r.key]} onSelect={(v) => update((p) => ({ ...p, sel: { ...(p.sel || {}), [r.key]: v } }))} defaults={NAILS_BRACING_DEFAULTS[r.key]} />}
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
        {extras.length > 0 ? <MatSub>Extra nails</MatSub> : null}
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={x.onDragEnd}>
          <SortableContext items={extras.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            {extras.map((ex) => (
              <SortableMatRow
                key={ex.id}
                id={ex.id}
                label={ex.label || 'Nails'}
                inputs={x.inputsFor(ex)}
                material={<ItemPicker value={ex.sel} onSelect={(v) => x.patchExtra(ex.id, { sel: v })} />}
                qty={ex.qtyRaw}
                waste={ex.wastePct}
                onWasteCommit={(v) => x.patchExtra(ex.id, { wastePct: v })}
                final={ex.qtyFinal}
                unit={ex.unit}
                unitPrice={ex.unitPrice}
                priceDate={ex.priceDate}
                subtotal={ex.subtotal}
                note={noteOf(notes, ex.id)}
                onNoteChange={(patch) => update(patchNote(ex.id, patch))}
                onRemove={() => x.remove(ex.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
        <div className="mat-foot">
          <AddRowButton onClick={() => x.add('gn')}>Nails item</AddRowButton>
        </div>
      </div>
    </GroupBlock>
  );
}
