// src/components/LoosePanelMaterials.jsx
// Loose materials that come with the wall panels of one level.
// Wall lengths come from the level's wall sections; panel band and cabinet
// blocking are typed in. Quantities come from computeLoosePanel.
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import ItemPicker from '@/components/ItemPicker';
import { GroupBlock, MatHead, SortableMatRow, MatSub, NumInput, Fld, noteOf, patchNote, SortableList, applyOrder } from '@/components/ui/mat';
import { computeLoosePanel } from '@/domain/estimate';
import { LOOSE_PANEL_DEFAULTS } from '@/domain/lib/defaults';

export default function LoosePanelMaterials({ title = 'Loose materials (wall panels)', data, calc: calcProp, onChange }) {
  const {
    collapsed = true, notes = {}, panelBandEdited = false,
    extInputs = {}, intInputs = {},
    include = { secondBottom: false, extraSheathing: false },
    sel = {},
  } = data || {};
  const calc = calcProp || computeLoosePanel(data);
  const { extLF: effExtLF, int2x6LF: i6LF, int2x4LF: i4LF, bandLF, subtotal } = calc;

  const updRef = useRef(onChange);
  useEffect(() => { updRef.current = onChange; }, [onChange]);
  const update = useCallback((fn) => updRef.current?.(fn), []);

  const setPick = (key) => (item) => update((p) => ({ ...p, sel: { ...(p.sel || {}), [key]: item } }));
  const setWaste = (key) => (v) => update((p) => ({ ...p, waste: { ...(p.waste || {}), [key]: v } }));
  const setNote = (key) => (patch) => update(patchNote(key, patch));

  const extOrdered = applyOrder(calc.exteriorRows, data?.extOrder);
  const intOrdered = applyOrder(calc.interiorRows, data?.intOrder);

  const renderRow = (row) => (
    <SortableMatRow
      key={row.key}
      id={row.key}
      label={row.label}
      piece={row.piece}
      inputs={row.optional ? (
        <label className="fld">
          <input type="checkbox" checked={!!include[row.key]} onChange={(e) => update((p) => ({ ...p, include: { ...(p.include || {}), [row.key]: e.target.checked } }))} />
          <span>Include in estimate</span>
        </label>
      ) : null}
      material={<ItemPicker value={sel[row.key]} onSelect={setPick(row.key)} defaults={LOOSE_PANEL_DEFAULTS[row.key]} />}
      qty={row.qtyRaw}
      waste={row.noWaste ? null : row.wastePct}
      onWasteCommit={setWaste(row.key)}
      final={row.excluded ? 0 : row.qtyFinal}
      unit={row.unit}
      unitPrice={row.unitPrice}
      priceDate={row.priceDate}
      subtotal={row.subtotal}
      note={noteOf(notes, `loose:${row.key}`)}
      onNoteChange={setNote(`loose:${row.key}`)}
    />
  );

  const toolbar = (
    <>
      <Fld label="Ext. LF" title="From exterior wall sections"><span className="strong">{effExtLF.toLocaleString('en-US')}</span></Fld>
      <Fld label="Panel band LF" w={60}>
        <NumInput
          value={bandLF}
          onCommit={(v) => update((p) => ({ ...p, panelBandEdited: true, extInputs: { ...(p.extInputs || {}), panelBandLF: v } }))}
        />
        {panelBandEdited ? (
          <button type="button" className="row-action-btn" title="Reset to exterior LF" onClick={() => update((p) => ({ ...p, panelBandEdited: false }))}>
            <RotateCcw size={12} />
          </button>
        ) : null}
      </Fld>
      <Fld label="Openings blocking LF" w={56}>
        <NumInput value={extInputs.openingsBlockingLF ?? 0} onCommit={(v) => update((p) => ({ ...p, extInputs: { ...(p.extInputs || {}), openingsBlockingLF: v } }))} />
      </Fld>
      <Fld label="Int. 2×6 / 2×4 LF" title="From interior wall sections"><span className="strong">{i6LF.toLocaleString('en-US')} / {i4LF.toLocaleString('en-US')}</span></Fld>
      <Fld label="Cabinet blocking LF" w={56}>
        <NumInput value={intInputs.blockingLF ?? 0} onCommit={(v) => update((p) => ({ ...p, intInputs: { ...(p.intInputs || {}), blockingLF: v } }))} />
      </Fld>
    </>
  );

  return (
    <GroupBlock
      open={!collapsed}
      onToggle={(o) => update((p) => ({ ...p, collapsed: !o }))}
      title={title}
      toolbar={toolbar}
      subtotal={subtotal}
    >
      <div className="mat" role="table">
        <MatHead />
        <MatSub>Exterior</MatSub>
        <SortableList ids={extOrdered.map((r) => r.key)} onMove={(a, o, ids) => update((p) => ({ ...p, extOrder: ids }))}>
          {extOrdered.map(renderRow)}
        </SortableList>
        <MatSub>Interior</MatSub>
        <SortableList ids={intOrdered.map((r) => r.key)} onMove={(a, o, ids) => update((p) => ({ ...p, intOrder: ids }))}>
          {intOrdered.map(renderRow)}
        </SortableList>
      </div>
    </GroupBlock>
  );
}
