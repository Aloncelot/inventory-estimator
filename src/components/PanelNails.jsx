// src/components/PanelNails.jsx
// Nails for the wall panels of one level (driven by the level's sheets and plates).
'use client';

import { memo, useCallback, useEffect, useRef } from 'react';
import ItemPicker from '@/components/ItemPicker';
import {
  GroupBlock, MatHead, MatSub, SortableMatRow, AddRowButton, SortableList, applyOrder, NumInput, Fld, noteOf, patchNote,
} from '@/components/ui/mat';
import { computePanelNails, PANEL_NAIL_SEL_KEY as SEL_KEY } from '@/domain/estimate';
import { PANEL_NAIL_DEFAULTS } from '@/domain/lib/defaults';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

/** Editing helpers for "extra nails" rows (quantities come from computeNailExtras). */
export function useNailExtras(update) {
  const patchExtra = useCallback((id, patch) => update((p) => ({
    ...p, extras: (p.extras || []).map((x) => (x.id === id ? { ...x, ...patch } : x)),
  })), [update]);
  const patchInputs = useCallback((ex, patch) => patchExtra(ex.id, { inputs: { ...(ex.inputs || {}), ...patch } }), [patchExtra]);
  const remove = useCallback((id) => update((p) => ({ ...p, extras: (p.extras || []).filter((x) => x.id !== id) })), [update]);
  const add = useCallback((prefix = 'n') => update((p) => ({
    ...p,
    extras: [...(p.extras || []), { id: `${prefix}${Date.now()}`, label: 'Nails', wastePct: 40, inputs: { mode: 'LF', qty: 0, density: 0, perBox: 1 }, sel: null }],
  })), [update]);
  const onDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return;
    update((p) => {
      const list = p.extras || [];
      const from = list.findIndex((x) => x.id === active.id);
      const to = list.findIndex((x) => x.id === over.id);
      return from < 0 || to < 0 ? p : { ...p, extras: arrayMove(list, from, to) };
    });
  }, [update]);

  const inputsFor = (ex) => [
    <Fld key="mode" label="By">
      <select className="ew-select" style={{ width: 70 }} value={ex.inputs?.mode || 'LF'} onChange={(e) => patchInputs(ex, { mode: e.target.value })}>
        <option value="LF">LF</option>
        <option value="Sheets">Sheets</option>
      </select>
    </Fld>,
    <Fld key="qty" label={`Qty (${ex.inputs?.mode || 'LF'})`} w={56}><NumInput value={ex.inputs?.qty ?? 0} onCommit={(v) => patchInputs(ex, { qty: v })} /></Fld>,
    <Fld key="density" label="Nails/unit" w={48}><NumInput value={ex.inputs?.density ?? 0} onCommit={(v) => patchInputs(ex, { density: v })} /></Fld>,
    <Fld key="perBox" label="Nails/box" w={56}><NumInput value={ex.inputs?.perBox ?? 1} onCommit={(v) => patchInputs(ex, { perBox: v })} /></Fld>,
  ];

  return { patchExtra, remove, add, onDragEnd, inputsFor };
}

function PanelNailsComponent({
  title = 'Panel nails', data, calc: calcProp, onChange,
  totalPanelSheets = 0, totalBottomPlatePiecesPanel = 0, ptPlatePiecesPanels = 0,
}) {
  const { sel = {}, notes = {}, collapsed = true } = data || {};
  const calc = calcProp || computePanelNails(data, { panelSheets: totalPanelSheets, bottomPlatePieces: totalBottomPlatePiecesPanel, ptBoards: ptPlatePiecesPanels });

  const updRef = useRef(onChange);
  useEffect(() => { updRef.current = onChange; }, [onChange]);
  const update = useCallback((fn) => updRef.current?.(fn), []);

  const ptBoards = Number(ptPlatePiecesPanels || 0);
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
      open={!collapsed}
      onToggle={(o) => update((p) => ({ ...p, collapsed: !o }))}
      title={title}
      toolbar={<span className="ew-subtle">{totalPanelSheets} sheets · {totalBottomPlatePiecesPanel} bottom plates · {ptBoards} PT boards</span>}
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
            material={<ItemPicker value={sel[SEL_KEY[r.key]]} onSelect={(v) => update((p) => ({ ...p, sel: { ...(p.sel || {}), [SEL_KEY[r.key]]: v } }))} defaults={PANEL_NAIL_DEFAULTS[r.key]} />}
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
          <AddRowButton onClick={() => x.add('n')}>Nails item</AddRowButton>
        </div>
      </div>
    </GroupBlock>
  );
}

const PanelNails = memo(PanelNailsComponent);
export default PanelNails;
