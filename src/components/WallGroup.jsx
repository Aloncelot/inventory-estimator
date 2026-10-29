// src/components/WallGroup.jsx
// One wall section (exterior or interior). Both kinds share the same layout,
// calculators, notes and extras; only the base rows and extra types differ.
// All quantities come from `calc` (computeWallSection in src/domain/estimate);
// this component only renders them and edits the section's inputs.
'use client';

import { useCallback, useEffect, useRef } from 'react';
import ItemPicker from '@/components/ItemPicker';
import EditableTitle from '@/components/ui/EditableTitle';
import {
  GroupBlock, MatHead, MatRow, MatSub, SortableMatRow, AddRowButton, RemoveIconButton,
  NumInput, Fld, MultiplierSelect, noteOf, patchNote, SortableList, applyOrder,
} from '@/components/ui/mat';
import { isLVL, isVersaColumn } from '@/domain/lib/families';
import { getFamily } from '@/domain/lib/selection';
import { computeWallSection } from '@/domain/estimate';
import { wallRowDefaults, wallExtraDefaults } from '@/domain/lib/defaults';

import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

const EXTRA_TYPES = {
  exterior: ['Header', 'Post', 'Studs'],
  interior: ['Header', 'Post', 'Studs', 'Extra blocking'],
};

const KIND_OPTIONS = [
  { value: 'partition', label: 'Partition' },
  { value: 'bearing', label: 'Bearing' },
  { value: 'shear', label: 'Shear' },
  { value: 'knee', label: 'Knee' },
];

export default function WallGroup({ variant = 'exterior', sectionData, calc: calcProp, groundLevel = false, onUpdateSection, title, onRemove, dragHandleProps }) {
  const {
    lengthLF = 0, heightFt = 12, studSpacingIn = 16, studMultiplier = 1,
    sel = {}, notes = {}, collapsed = false,
  } = sectionData;
  const calc = calcProp || computeWallSection(sectionData, variant);
  const { kind } = calc;

  // stable updater (parent recreates its callback every render)
  const updRef = useRef(onUpdateSection);
  useEffect(() => { updRef.current = onUpdateSection; }, [onUpdateSection]);
  const update = useCallback((fn) => updRef.current?.(fn), []);

  const setField = useCallback((field, v) => update((p) => ({ ...p, [field]: v })), [update]);
  const setSel = useCallback((key, item) => update((p) => ({ ...p, sel: { ...(p.sel || {}), [key]: item } })), [update]);
  const setWaste = useCallback((key, v) => update((p) => ({ ...p, waste: { ...(p.waste || {}), [key]: v } })), [update]);
  const setNote = useCallback((key, patch) => update(patchNote(key, patch)), [update]);

  const updateExtra = useCallback((id, patch) => update((p) => ({
    ...p, extras: (p.extras || []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
  })), [update]);
  const setExtraInput = useCallback((ex, field, v) => updateExtra(ex.id, { inputs: { ...(ex.inputs || {}), [field]: v } }), [updateExtra]);
  const removeExtra = useCallback((id) => update((p) => ({ ...p, extras: (p.extras || []).filter((r) => r.id !== id) })), [update]);
  const addExtra = useCallback((type) => {
    const inputs = type === 'Studs' ? { lengthLF: 10, studSpacingIn: 16, studMultiplier: 1 }
      : type === 'Extra blocking' ? { rows: 1 } : {};
    const wastePct = type === 'Studs' ? 60 : type === 'Extra blocking' ? 10 : 5;
    update((p) => ({
      ...p,
      extras: [...(p.extras || []), { id: `x${Date.now()}${Math.random().toString(36).slice(2, 5)}`, type, item: null, wastePct, inputs }],
    }));
  }, [update]);

  const orderedBase = applyOrder(calc.baseRows, sectionData.rowOrder);
  const extraRows = calc.extraRows;
  const infill = calc.infill;

  /* ── drag & drop for extras ────────────────────────────────────────── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    update((p) => {
      const list = p.extras || [];
      const from = list.findIndex((x) => x.id === active.id);
      const to = list.findIndex((x) => x.id === over.id);
      return from < 0 || to < 0 ? p : { ...p, extras: arrayMove(list, from, to) };
    });
  };

  /* ── extra-row inputs (shown above the picker) ─────────────────────── */
  const extraInputs = (ex) => {
    const fam = getFamily(ex.item);
    const n = (field, label, w = 56, fallback = '') => (
      <Fld key={field} label={label} w={w}>
        <NumInput value={ex.inputs?.[field] ?? fallback} onCommit={(v) => setExtraInput(ex, field, v)} />
      </Fld>
    );
    // LVL (and PT / FRT LVL) is counted only by header LF; lumber headers also use header LF ÷ piece length
    if (ex.type === 'Header') {
      const legacyLF = isLVL(fam) && !ex.inputs?.headerLF ? Number(ex.inputs?.lvlPieces || 0) * Number(ex.inputs?.lvlLength || 0) : '';
      return [n('headerLF', 'Header LF', 64, legacyLF || '')];
    }
    if (ex.type === 'Post') return (isLVL(fam) || isVersaColumn(fam))
      ? [n('pieces', 'Pieces'), n('heightFt', 'Height (ft)', 56, heightFt)]
      : [n('piecesPerPost', 'Pcs/post'), n('numPosts', 'Posts')];
    if (ex.type === 'Studs') return [
      n('lengthLF', 'Length (LF)'), n('studSpacingIn', 'Spacing (in)', 48, 16),
      <Fld key="mult" label="Per location"><MultiplierSelect value={ex.inputs?.studMultiplier} onChange={(v) => setExtraInput(ex, 'studMultiplier', v)} /></Fld>,
    ];
    if (ex.type === 'Extra blocking') return [n('rows', 'Rows', 44, 1)];
    return null;
  };

  const toolbar = (
    <>
      <Fld label="Length (LF)" w={64}><NumInput value={lengthLF} onCommit={(v) => setField('lengthLF', v)} /></Fld>
      <Fld label="Height (ft)" w={48}><NumInput value={heightFt} onCommit={(v) => setField('heightFt', v)} /></Fld>
      <Fld label="Spacing (in)" w={44}><NumInput value={studSpacingIn} onCommit={(v) => setField('studSpacingIn', v)} /></Fld>
      <Fld label="Studs/loc."><MultiplierSelect value={studMultiplier} onChange={(v) => setField('studMultiplier', v)} /></Fld>
      {variant === 'interior' ? (
        <Fld label="Kind">
          <select className="ew-select" style={{ width: 88 }} value={kind} onChange={(e) => setField('kind', e.target.value)}>
            {KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Fld>
      ) : null}
    </>
  );

  return (
    <GroupBlock
      dragHandleProps={dragHandleProps}
      open={!collapsed}
      onToggle={(o) => setField('collapsed', !o)}
      title={<EditableTitle value={title || 'Section'} onChange={(v) => setField('name', v)} textClass="text-section-header" label="section" />}
      toolbar={toolbar}
      subtotal={calc.subtotal}
      actions={onRemove ? <RemoveIconButton onClick={onRemove} title="Remove section" /> : null}
    >
      <div className="mat" role="table">
        <MatHead />
        <SortableList ids={orderedBase.map((r) => r.key)} onMove={(a, o, ids) => setField('rowOrder', ids)}>
        {orderedBase.map((row) => (
          <SortableMatRow
            key={row.key}
            id={row.key}
            label={row.label}
            piece={row.piece}
            material={<ItemPicker value={sel[row.key]} onSelect={(i) => setSel(row.key, i)} defaults={wallRowDefaults(variant, row.key, { groundLevel })} />}
            qty={row.qtyRaw}
            waste={row.wastePct}
            onWasteCommit={(v) => setWaste(row.key, v)}
            final={row.qtyFinal}
            unit={row.unit}
            unitPrice={row.unitPrice}
            priceDate={row.priceDate}
            subtotal={row.subtotal}
            note={noteOf(notes, `base:${row.key}`)}
            onNoteChange={(patch) => setNote(`base:${row.key}`, patch)}
          />
        ))}
        </SortableList>

        {extraRows.length > 0 || infill ? <MatSub>Extras</MatSub> : null}
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
          <SortableContext items={extraRows.map((x) => x.id)} strategy={verticalListSortingStrategy}>
            {extraRows.map((ex) => (
              <SortableMatRow
                key={ex.id}
                id={ex.id}
                label={ex.type}
                piece={ex.piece}
                inputs={extraInputs(ex)}
                material={<ItemPicker value={ex.item} onSelect={(item) => updateExtra(ex.id, { item })} defaults={wallExtraDefaults(ex.type)} />}
                qty={ex.qtyRaw}
                waste={ex.wastePct}
                onWasteCommit={(v) => updateExtra(ex.id, { wastePct: v })}
                final={ex.qtyFinal}
                unit={ex.unit}
                unitPrice={ex.unitPrice}
                priceDate={ex.priceDate}
                subtotal={ex.subtotal}
                note={noteOf(notes, `extra:${ex.id}`)}
                onNoteChange={(patch) => setNote(`extra:${ex.id}`, patch)}
                onRemove={() => removeExtra(ex.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
        {infill ? (
          <MatRow
            label="Headers infill"
            labelTitle={`Headers infill — added automatically for ${calc.headerLFPool} LF of infill-family headers`}
            material={<ItemPicker value={infill.item} onSelect={(item) => setSel('headersInfill', item)} defaults={wallExtraDefaults('Headers infill')} />}
            qty={infill.qtyRaw}
            waste={infill.wastePct}
            onWasteCommit={(v) => setWaste('headersInfill', v)}
            final={infill.qtyFinal}
            unit={infill.unit}
            unitPrice={infill.unitPrice}
            priceDate={infill.priceDate}
            subtotal={infill.subtotal}
            note={noteOf(notes, 'extra:headersInfill')}
            onNoteChange={(patch) => setNote('extra:headersInfill', patch)}
          />
        ) : null}

        <div className="mat-foot">
          {EXTRA_TYPES[variant].map((t) => <AddRowButton key={t} onClick={() => addExtra(t)}>{t}</AddRowButton>)}
        </div>
      </div>
    </GroupBlock>
  );
}
