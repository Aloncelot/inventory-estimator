// src/components/LooseMaterialSection.jsx
// One Loose Material section: Foundation, Basement, a floor level, Roof or a
// custom list. Calculated rows (by section kind) + manual rows, same table and
// notes as Wall Panels. Quantities come from computeLooseSection.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EyeOff, RotateCcw, ScanLine, Plus } from 'lucide-react';
import { tryEvaluate } from '@/domain/lib/calc';
import ItemPicker from '@/components/ItemPicker';
import EditableTitle from '@/components/ui/EditableTitle';
import { LEVEL_NAME_SUGGESTIONS } from '@/domain/lib/levelNames';
import SearchableSelect from './SearchableSelect';
import {
  GroupBlock, MatHead, MatSub, SortableMatRow, RemoveIconButton,
  NumInput, Fld, MultiplierSelect, noteOf, patchNote, SortableList, applyOrder,
} from '@/components/ui/mat';
import { computeLooseSection, sectionKind, rowCalcType } from '@/domain/estimate';
import { LOOSE_SECTION_DEFAULTS, looseRowDefaults } from '@/domain/lib/defaults';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

const LOOSE_ITEMS = [
  'Extra', 'Angle', 'Beams', 'Blocking', 'Blocking at openings', 'Bolts', 'Bottom Plate - Loose', 'Bottom Plate - Panel',
  'Bottom Plate PT - Panel', 'Brace', 'Caulk', 'Clips', 'Coiled Strap', 'Collar tie', 'Column Cap', 'Concrete nails',
  'Cornice', 'Diagonal Bracing', 'Eave', 'Epoxy', 'Fascia', 'Flashing Tape', 'Foam sill sealer', 'Framing nails', 'Gable',
  'Glue', 'Hangers - Beams', 'Hangers - Joist', 'Hangers - Stringer', 'Header Infill', 'Headers', 'Holdown',
  'House wrapping', 'Hurricane tie', 'I-Joist', 'Ice & Water Shield', 'In wall Post', 'Insulation', 'Joist', 'Kicker',
  'Lally Column', 'Landing', 'Ledger', 'Ledger bolts', 'Nailer', 'Nails', 'Nuts', 'Outriggers', 'Plates', 'Plates - Loose',
  'Plates - Panel', 'Post', 'Post base', 'Post Cap', 'Rafter', 'Rake', 'Ribbon Rim Board', 'Ridge', 'Rigid Insulation',
  'Rim Joist', 'Rimboard', 'Roofing nails', 'Screws', 'Sheathing', 'Sheathing nails', 'Sill Plate', 'SIP', 'Strapping',
  'Stringer', 'Stud plate', 'Studs', 'Subfascia', 'Subfloor', 'Tape - header/jambs', 'Tape - sill', 'Tape - Zip system',
  'Temporary Bracing', 'Threaded rod', 'Top Plate - Loose', 'Top Plate - Panel', 'Trim', 'Truss bracing', 'Underlayment',
  'Washer', 'Blocking at sheathing joints', 'Blocking Bathroom/Kitchen/Stairs', 'Panel band sheathing', 'PT Plates - Loose',
].map((label) => ({ value: label, label }));

export { sectionKind };

/* An extra row: anything the plan cannot count. Its quantity is the result
   of a calculation typed here (12*16+4, 3*(24+18)/8, 15%…) or a plain number. */
function ExtraCalc({ value, onCommit }) {
  const [text, setText] = useState(value || '');
  useEffect(() => { setText(value || ''); }, [value]);
  const t = text.trim();
  const res = t ? tryEvaluate(t) : null;
  const commit = () => { if (t !== (value || '')) onCommit(t); };
  return (
    <Fld label="Calculation" title="Type the quantity or the calculation for it: + − × ÷ ( ) and %">
      <input
        className={`ew-input extra-calc${res?.error ? ' is-bad' : ''}`}
        value={text}
        placeholder="e.g. 12*16+4"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setText(value || ''); }}
        aria-label="Extra calculation"
      />
      {t ? <span className={`extra-res${res?.error ? ' is-bad' : ''}`}>{res?.error ? 'Check it' : `= ${Number(res.value).toLocaleString('en-US', { maximumFractionDigits: 4 })}`}</span> : null}
    </Fld>
  );
}

function ExtraLabel({ value, onCommit }) {
  const [text, setText] = useState(value || '');
  useEffect(() => { setText(value || ''); }, [value]);
  return (
    <input
      className="ew-input extra-desc"
      value={text}
      placeholder="Extra — what is it?"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== (value || '') && onCommit(text)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      aria-label="Extra description"
    />
  );
}

export default function LooseMaterialSection({ section, calc: calcProp, onUpdate, onRemove, onToggleHidden, dragHandleProps, foundationData }) {
  const { name, collapsed = false, inputs = {}, sel = {}, notes = {} } = section;
  const calc = calcProp || computeLooseSection(section, foundationData);
  const { kind, calcRows, manualRows, subtotal } = calc;

  const updRef = useRef(onUpdate);
  useEffect(() => { updRef.current = onUpdate; }, [onUpdate]);
  const update = useCallback((fn) => updRef.current?.(fn), []);

  const setInput = useCallback((key, v) => update((p) => ({ ...p, inputs: { ...(p.inputs || {}), [key]: v } })), [update]);
  const setSel = useCallback((key, v) => update((p) => ({ ...p, sel: { ...(p.sel || {}), [key]: v } })), [update]);
  const setWaste = useCallback((key, v) => update((p) => ({ ...p, waste: { ...(p.waste || {}), [key]: Number(v) || 0 } })), [update]);
  const updateRow = useCallback((id, patch) => update((p) => ({ ...p, rows: (p.rows || []).map((r) => (r.id === id ? { ...r, ...patch } : r)) })), [update]);
  const removeRow = useCallback((id) => update((p) => ({ ...p, rows: (p.rows || []).filter((r) => r.id !== id) })), [update]);

  const calcOrdered = applyOrder(calcRows, section.calcOrder);

  const addRow = useCallback((type) => {
    if (!type || type === '__CLEAR__') return;
    const ct = rowCalcType(type);
    const row = { id: `loose-row-${Date.now()}`, type, item: null, qty: 0, wastePct: 5, notes: '', plan: '', inputs: {} };
    if (ct === 'studs') Object.assign(row, { inputs: { lengthLF: 0, spacing: 16, multiplier: 1 }, wastePct: 10 });
    else if (ct === 'plates') Object.assign(row, { inputs: { lengthLF: 0 }, wastePct: 10 });
    else if (ct === 'sheathing') Object.assign(row, { inputs: { lengthLF: 0, height: 4 }, wastePct: 15 });
    else if (['tape', 'joist', 'ijoist', 'beam', 'strapping'].includes(ct)) row.inputs = { lengthLF: 0 };
    else if (ct === 'subfloor') row.inputs = { area: 0 };
    else if (ct === 'extra') Object.assign(row, { desc: '', inputs: { formula: '' }, wastePct: 0 });
    update((p) => ({ ...p, rows: [...(p.rows || []), row] }));
  }, [update]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    update((p) => {
      const list = p.rows || [];
      const from = list.findIndex((r) => r.id === active.id);
      const to = list.findIndex((r) => r.id === over.id);
      return from < 0 || to < 0 ? p : { ...p, rows: arrayMove(list, from, to) };
    });
  };

  /* ── per-row inputs ────────────────────────────────────────────────── */
  const rowInput = (row, field, label, w = 56, fallback = 0) => (
    <Fld key={field} label={label} w={w}>
      <NumInput
        value={row.inputs?.[field] ?? fallback}
        onCommit={(v) => updateRow(row.id, { inputs: { ...(row.inputs || {}), [field]: v } })}
      />
    </Fld>
  );
  const manualInputs = (row) => {
    switch (row.calcType) {
      case 'rimboard': return [rowInput(row, 'lengthLF', 'Length (LF)', 60, foundationData?.inputs?.foundationLF ?? 0)];
      case 'joist': case 'ijoist': case 'beam': case 'strapping': case 'plates': case 'tape':
        return [rowInput(row, 'lengthLF', 'Length (LF)', 60)];
      case 'subfloor': return [rowInput(row, 'area', 'Area (sq ft)', 64)];
      case 'studs': return [
        rowInput(row, 'lengthLF', 'Length (LF)', 56), rowInput(row, 'spacing', 'Spacing (in)', 44, 16),
        <Fld key="mult" label="Per location"><MultiplierSelect value={row.inputs?.multiplier} onChange={(v) => updateRow(row.id, { inputs: { ...(row.inputs || {}), multiplier: v } })} /></Fld>,
      ];
      case 'sheathing': return [rowInput(row, 'lengthLF', 'Length (LF)', 56), rowInput(row, 'height', 'Height (ft)', 44, 4)];
      case 'extra': return [<ExtraCalc key="calc" value={row.inputs?.formula ?? (row.qty ? String(row.qty) : '')} onCommit={(v) => updateRow(row.id, { inputs: { ...(row.inputs || {}), formula: v } })} />];
      default: return null;
    }
  };

  /* ── toolbar by kind ───────────────────────────────────────────────── */
  let toolbar = null;
  if (kind === 'foundation') {
    const fLF = Number(inputs.foundationLF) || 0;
    const hasPlan = inputs.planFoamLF != null;
    const fromPlan = hasPlan && !inputs.foundationManual;
    toolbar = fromPlan ? (
      <>
        <Fld label="Walls on concrete (LF)" title={`Exterior, bearing and shear walls of ${inputs.planFrom} (Plan takeoff)`}>
          <span className="strong plan-lf"><ScanLine size={12} /> {Number(inputs.planFoamLF).toLocaleString('en-US')}</span>
        </Fld>
        <label className="fld plan-src" title="Checked: foam sealer and sill plates (by wall size) come from Plan takeoff. Unchecked: type the LF here.">
          <span>From plan</span>
          <input type="checkbox" checked onChange={() => setInput('foundationManual', true)} />
        </label>
      </>
    ) : (
      <>
        {hasPlan ? (
          <label className="fld plan-src" title="Use the walls of the levels on concrete from Plan takeoff">
            <span>From plan</span>
            <input type="checkbox" checked={false} onChange={() => setInput('foundationManual', false)} />
          </label>
        ) : null}
        <Fld label="Foundation LF" w={64}>
          <NumInput value={inputs.foundationLF ?? 0} onCommit={(v) => update((p) => ({
            ...p, inputs: { ...(p.inputs || {}), foundationLF: v, ...(p.inputs?.sillPlateEdited ? {} : { sillPlateLF: v }) },
          }))} />
        </Fld>
        <Fld label="Sill plate LF" w={64}>
          <NumInput value={inputs.sillPlateLF ?? fLF} onCommit={(v) => update((p) => ({ ...p, inputs: { ...(p.inputs || {}), sillPlateLF: v, sillPlateEdited: true } }))} />
          {inputs.sillPlateEdited ? (
            <button type="button" className="row-action-btn" title="Use foundation LF" onClick={() => update((p) => ({ ...p, inputs: { ...(p.inputs || {}), sillPlateLF: fLF, sillPlateEdited: false } }))}>
              <RotateCcw size={12} />
            </button>
          ) : null}
        </Fld>
      </>
    );
  } else if (kind === 'basement') {
    toolbar = (
      <>
        <Fld label="Blocking LF" w={60}><NumInput value={inputs.blockingLF ?? 0} onCommit={(v) => setInput('blockingLF', v)} /></Fld>
        <Fld label="Lally columns" w={48}><NumInput value={inputs.colQty ?? 0} onCommit={(v) => setInput('colQty', v)} /></Fld>
      </>
    );
  } else if (kind === 'roof') {
    const f = (key, label, w = 56) => <Fld key={key} label={label} w={w}><NumInput value={inputs[key] ?? 0} onCommit={(v) => setInput(key, v)} /></Fld>;
    toolbar = (
      <>
        {f('rafterLF', 'Rafter LF')}{f('ridgeLF', 'Ridge LF')}{f('gableLF', 'Gable LF')}{f('eaveLF', 'Eave LF')}
        {f('rakeLF', 'Rake LF')}{f('trimLF', 'Trim LF')}{f('roofArea', 'Roof sq ft', 64)}
      </>
    );
  }

  const isProtected = ['foundation', 'basement', 'roof'].includes(kind);

  return (
    <GroupBlock
      standalone
      dragHandleProps={dragHandleProps}
      open={!collapsed}
      onToggle={(o) => update((p) => ({ ...p, collapsed: !o }))}
      title={<EditableTitle value={name} onChange={(v) => update((p) => ({ ...p, name: v, kind: p.kind || kind }))} textClass="text-section-header" label="section" suggestions={kind === 'level' ? LEVEL_NAME_SUGGESTIONS : undefined} />}
      toolbar={toolbar}
      subtotal={subtotal}
      actions={(
        <>
          {onToggleHidden ? (
            <button type="button" className="row-action-btn" onClick={onToggleHidden} title="Hide section (excluded from totals)" aria-label="Hide section">
              <EyeOff size={14} />
            </button>
          ) : null}
          {onRemove && !isProtected ? <RemoveIconButton onClick={onRemove} title="Delete section" /> : null}
        </>
      )}
    >
      <div className="mat" role="table">
        <MatHead />
        <SortableList ids={calcOrdered.map((r) => r.key)} onMove={(a, o, ids) => update((p) => ({ ...p, calcOrder: ids }))}>
        {calcOrdered.map((r) => (
          <SortableMatRow
            key={r.key}
            id={r.key}
            label={r.label}
            piece={r.piece}
            labelTitle={r.hint ? `${r.label} — based on ${r.hint}` : undefined}
            inputs={r.gable ? [
              <Fld key="sp" label="Spacing (in)" w={44}><NumInput value={inputs.gableStudSpacing ?? 16} onCommit={(v) => setInput('gableStudSpacing', v)} /></Fld>,
              <Fld key="mu" label="Per location"><MultiplierSelect value={inputs.gableStudMultiplier} onChange={(v) => setInput('gableStudMultiplier', v)} /></Fld>,
            ] : null}
            material={<ItemPicker value={sel[r.key]} onSelect={(v) => setSel(r.key, v)} defaults={r.defaults || LOOSE_SECTION_DEFAULTS[r.key]} />}
            qty={r.qtyRaw}
            waste={r.wastePct}
            onWasteCommit={(v) => setWaste(r.key, v)}
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

        {calcRows.length > 0 && manualRows.length > 0 ? <MatSub>Added items</MatSub> : null}
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
          <SortableContext items={manualRows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            {manualRows.map((r) => (
              <SortableMatRow
                key={r.id}
                id={r.id}
                label={r.calcType === 'extra' ? <ExtraLabel value={r.desc} onCommit={(v) => updateRow(r.id, { desc: v })} /> : (r.type || 'Custom item')}
                labelTitle={r.calcType === 'extra' ? `Extra: ${r.desc || 'no description'}` : undefined}
                piece={r.piece}
                inputs={manualInputs(r)}
                material={<ItemPicker value={r.item} onSelect={(v) => updateRow(r.id, { item: v })} defaults={looseRowDefaults(r)} />}
                qty={r.planHw
                  ? <span className="strong plan-lf" title={`Counted from the walls in Plan takeoff: ${r.plan || ''}`}>{r.qty ?? 0}</span>
                  : r.calcType === 'manual'
                    ? <NumInput value={r.qty ?? 0} onCommit={(v) => updateRow(r.id, { qty: v })} aria-label="Quantity" />
                    : r.qtyRaw}
                waste={r.wastePct}
                onWasteCommit={(v) => updateRow(r.id, { wastePct: v })}
                final={r.qtyFinal}
                unit={r.unit}
                unitPrice={r.unitPrice}
                priceDate={r.priceDate}
                subtotal={r.subtotal}
                note={{ plan: r.plan || '', comment: r.notes || '', images: r.noteImages || [] }}
                onNoteChange={(patch) => updateRow(r.id, {
                  ...('plan' in patch ? { plan: patch.plan } : {}),
                  ...('comment' in patch ? { notes: patch.comment } : {}),
                  ...('images' in patch ? { noteImages: patch.images } : {}),
                })}
                onRemove={() => removeRow(r.id)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {calcRows.length === 0 && manualRows.length === 0 ? (
          <div className="mat-empty">No items yet. Pick one below to add it.</div>
        ) : null}

        <div className="mat-foot">
          <button type="button" className="ew-btn" onClick={() => addRow('Extra')} title="A line for anything the plan cannot count: describe it, pick the material, type its calculation, add notes, plan label and images">
            <Plus size={13} /> Extra
          </button>
          <div style={{ width: 240 }}>
            <SearchableSelect placeholder="Add item…" ariaLabel="Add item" options={LOOSE_ITEMS} value="" onChange={addRow} />
          </div>
        </div>
      </div>
    </GroupBlock>
  );
}
