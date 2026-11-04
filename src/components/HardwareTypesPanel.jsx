// src/components/HardwareTypesPanel.jsx
// Structural hardware types of a level (H1, H2…): hold-downs, straps, anchors,
// clips… placed on walls by hand, or counted per wall type (at each wall end,
// or along the walls at a spacing) as the structural tables give them. The
// counts go to "Hardware · <level>" in Loose material.
'use client';

import { Plus, Trash2 } from 'lucide-react';
import { NumInput } from '@/components/ui/mat';
import { HW_RULES, SHEAR_TYPES } from '@/domain/plans/hardware';

export default function HardwareTypesPanel({ types = [], counts, groups = [], shearTypes = [], color, onPatchType, onAddType, onDeleteType, onSelectType, selectedType }) {
  const total = types.reduce((s, t) => s + (counts.get(t.id) || 0), 0);
  return (
    <section className="ot-panel">
      <div className="ot-head">
        <strong>Structural hardware</strong>
        <span className="ew-subtle">{total} pieces in {types.length} type{types.length === 1 ? '' : 's'} · to Loose material</span>
        <span className="ot-add">
          <button type="button" className="ew-btn ew-btn--ghost" onClick={onAddType}><Plus size={13} /> Hardware type</button>
        </span>
      </div>
      {types.length ? (
        <table className="tbl ot-tbl">
          <thead>
            <tr>
              <th>Type</th>
              <th>Name</th>
              <th>Counted</th>
              <th className="num" title="Per wall end, or spacing in inches">Qty / spacing</th>
              <th title="Wall types this rule applies to">Wall types</th>
              <th className="num">Count</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {types.map((t) => {
              const set = (patch) => onPatchType(t.id, patch);
              const count = counts.get(t.id) || 0;
              const sel = new Set(t.groups || []);
              return (
                <tr key={t.id} className={`ot-row${selectedType === t.id ? ' is-on' : ''}`}>
                  <td><button type="button" className="ot-tag" style={{ borderColor: color }} onClick={() => onSelectType(t.id)} title={`Select the walls with ${t.id}`}>{t.id}</button></td>
                  <td><input className="ew-input hw-name" value={t.name || ''} placeholder="e.g. HDU5 hold-down" onChange={(e) => set({ name: e.target.value })} /></td>
                  <td>
                    <select className="ew-select" value={t.rule || 'each'} onChange={(e) => set({ rule: e.target.value })}>
                      {HW_RULES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </td>
                  <td className="num">
                    {t.rule === 'shear' ? (
                      <span className="hw-shear">
                        {(shearTypes.length ? shearTypes : SHEAR_TYPES).map((k) => (
                          <label key={k} title={`Type ${k}: spacing, in (0 = none)`}>{k}<NumInput w={36} value={t.byType?.[k] ?? 0} onCommit={(v) => set({ byType: { ...(t.byType || {}), [k]: Math.max(0, v) } })} /></label>
                        ))}
                      </span>
                    ) : t.rule === 'ends' ? <NumInput w={40} value={t.perEnd ?? 1} onCommit={(v) => set({ perEnd: Math.max(1, Math.round(v) || 1) })} title="Pieces at each end" />
                      : t.rule === 'spacing' ? <NumInput w={48} value={t.spacingIn ?? 32} onCommit={(v) => set({ spacingIn: Math.max(4, v) })} title="Spacing, in" />
                        : <span className="ew-subtle">—</span>}
                  </td>
                  <td className="hw-groups">
                    {t.rule === 'each' ? <span className="ew-subtle">Use Add hardware on the drawing</span> : t.rule === 'shear' ? <span className="ew-subtle">Shear walls, by the type of each tag</span> : groups.map((g) => (
                      <label key={g.key} className={`hw-chip${sel.has(g.key) ? ' is-on' : ''}`}>
                        <input type="checkbox" checked={sel.has(g.key)} onChange={(e) => set({ groups: e.target.checked ? [...sel, g.key] : [...sel].filter((x) => x !== g.key) })} />
                        {g.label}
                      </label>
                    ))}
                  </td>
                  <td className="num" style={{ fontWeight: 600 }}>{count}</td>
                  <td><input className="ew-input ot-notes" value={t.notes || ''} placeholder="per S-001 table" onChange={(e) => set({ notes: e.target.value })} /></td>
                  <td><button type="button" className="ew-icon-btn" onClick={() => onDeleteType(t.id)} title="Delete this type (and its placed pieces)" aria-label="Delete type"><Trash2 size={13} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <p className="ew-subtle">No hardware yet. Add a type for each item of the structural hardware table.</p>}
      <p className="ew-subtle ot-help">
        &quot;At wall ends&quot; counts pieces at both ends of every wall of the checked types (hold-downs on shear walls); &quot;Along walls&quot; counts one
        every spacing plus one (anchor bolts, straps); &quot;Along shear walls&quot; does the same on each shear wall at its type&apos;s spacing. Pick the item in Loose material → Hardware · {`<level>`}.
      </p>
    </section>
  );
}
