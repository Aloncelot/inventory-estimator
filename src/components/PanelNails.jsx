// src/components/PanelNails.jsx
// Every fastener of one level's wall panels: on-concrete items (drive pins,
// epoxy, foam sill sealer), sheathing, framing and plate nails. Quantities
// come from computePanelNails (IRC R602.3(1) + each section's nailing schedule).
'use client';

import { Fragment, memo, useCallback, useEffect, useRef } from 'react';
import ItemPicker from '@/components/ItemPicker';
import {
  GroupBlock, MatHead, MatSub, SortableMatRow, AddRowButton, SortableList, applyOrder, NumInput, Fld, noteOf, patchNote,
} from '@/components/ui/mat';
import { computePanelNails, PANEL_NAIL_GROUPS } from '@/domain/estimate';
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

function PanelNailsComponent({ title = 'Panel nails', data, calc: calcProp, onChange, isGround = false }) {
  const { sel = {}, notes = {}, collapsed = true } = data || {};
  const calc = calcProp || computePanelNails(data, { isGround });
  const { inputs } = calc;

  const updRef = useRef(onChange);
  useEffect(() => { updRef.current = onChange; }, [onChange]);
  const update = useCallback((fn) => updRef.current?.(fn), []);
  const setInput = (key, v) => update((p) => ({ ...p, inputs: { ...(p.inputs || {}), [key]: v } }));

  const extras = calc.extraRows;
  const x = useNailExtras(update);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // inputs shown above the picker of the rows that need them
  const rowInputs = (r) => {
    if (r.key === 'drivePins') return [
      <Fld key="sp" label="Pin spacing (in)" w={44}><NumInput value={inputs.pinSpacingIn} onCommit={(v) => setInput('pinSpacingIn', v)} /></Fld>,
    ];
    if (r.key === 'epoxy') return [
      <Fld key="as" label="Anchor spacing (in)" w={44}><NumInput value={inputs.anchorSpacingIn} onCommit={(v) => setInput('anchorSpacingIn', v)} /></Fld>,
      <Fld key="ad" label="Rod Ø (in)" w={48}><NumInput step="0.125" value={inputs.anchorDiaIn} onCommit={(v) => setInput('anchorDiaIn', v)} /></Fld>,
      <Fld key="hd" label="Hole Ø (in)" w={48}><NumInput step="0.125" value={inputs.holeDiaIn} onCommit={(v) => setInput('holeDiaIn', v)} /></Fld>,
      <Fld key="em" label="Embed (in)" w={40}><NumInput value={inputs.embedIn} onCommit={(v) => setInput('embedIn', v)} /></Fld>,
      <Fld key="co" label="Cartridge (fl oz)" w={44}><NumInput value={inputs.cartridgeOz} onCommit={(v) => setInput('cartridgeOz', v)} /></Fld>,
    ];
    return null;
  };

  const groups = Object.keys(PANEL_NAIL_GROUPS)
    .map((g) => ({ key: g, label: PANEL_NAIL_GROUPS[g], rows: applyOrder(calc.baseRows.filter((r) => r.group === g), data?.rowOrder) }))
    .filter((g) => g.rows.length > 0);

  const toolbar = (
    <label className="fld" title="Drive pins, epoxy and foam sill sealer are counted only for walls sitting on concrete">
      <input
        type="checkbox"
        checked={calc.onConcrete}
        onChange={(e) => update((p) => ({ ...p, onConcrete: e.target.checked }))}
      />
      <span>On concrete</span>
    </label>
  );

  return (
    <GroupBlock
      open={!collapsed}
      onToggle={(o) => update((p) => ({ ...p, collapsed: !o }))}
      title={title}
      toolbar={toolbar}
      subtotal={calc.total}
    >
      <div className="mat" role="table">
        <MatHead />
        {groups.map((g) => (
          <Fragment key={g.key}>
            <MatSub>{g.label}</MatSub>
            <SortableList
              ids={g.rows.map((r) => r.key)}
              onMove={(a, o, ids) => update((p) => {
                // keep the other groups' order, replace this group's
                const rest = (p.rowOrder || []).filter((k) => !ids.includes(k));
                return { ...p, rowOrder: [...rest, ...ids] };
              })}
            >
              {g.rows.map((r) => (
                <SortableMatRow
                  key={r.key}
                  id={r.key}
                  label={r.label}
                  labelTitle={`${r.label} — ${r.hint}`}
                  inputs={rowInputs(r)}
                  material={<ItemPicker value={sel[r.selKey]} onSelect={(v) => update((p) => ({ ...p, sel: { ...(p.sel || {}), [r.selKey]: v } }))} defaults={PANEL_NAIL_DEFAULTS[r.key]} />}
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
          </Fragment>
        ))}
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
