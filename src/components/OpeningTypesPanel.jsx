// src/components/OpeningTypesPanel.jsx
// The window and door types of a level's exterior walls (W1, W2…, D1, D2…):
// how many there are and their size. Each type becomes a Header row in the
// plan section of its walls (Wall panels), where its material is picked.
'use client';

import { Plus, Trash2, RotateCcw, TriangleAlert } from 'lucide-react';
import { NumInput } from '@/components/ui/mat';
import { OPENING_DEFAULTS } from '@/domain/plans/framing';

const scopeOf = (t) => (t?.scope === 'interior' ? 'interior' : 'exterior');

export default function OpeningTypesPanel({ types = [], use, colors, selectedType, onSelectType, onPatchType, onAddType, onDeleteType, onMerge, hasSchedule = false, onBackToSchedule }) {
  const total = (kind, scope) => types.filter((t) => t.kind === kind && scopeOf(t) === scope).reduce((s, t) => s + (use.get(t.id)?.count || 0), 0);
  const kinds = (kind, scope) => types.filter((t) => t.kind === kind && scopeOf(t) === scope).length;
  return (
    <section className="ot-panel">
      <div className="ot-head">
        <strong>Window &amp; door types</strong>
        <span className="ew-subtle">
          Exterior: {total('window', 'exterior')} windows ({kinds('window', 'exterior')} types), {total('door', 'exterior')} doors ({kinds('door', 'exterior')}) ·
          Interior: {total('door', 'interior')} doors ({kinds('door', 'interior')} types){total('window', 'interior') ? `, ${total('window', 'interior')} windows` : ''}
        </span>
        <span className="ot-add">
          <button type="button" className="ew-btn ew-btn--ghost" onClick={() => onAddType('window', 'exterior')}><Plus size={13} /> Exterior window</button>
          <button type="button" className="ew-btn ew-btn--ghost" onClick={() => onAddType('door', 'exterior')}><Plus size={13} /> Exterior door</button>
          <button type="button" className="ew-btn ew-btn--ghost" onClick={() => onAddType('door', 'interior')}><Plus size={13} /> Interior door</button>
        </span>
      </div>
      {types.length ? (
        <table className="tbl ot-tbl ot-tbl--auto">
          <thead>
            <tr>
              <th>Type</th>
              <th>Walls</th>
              <th className="num">Count</th>
              <th className="num" title="Rough opening width, in">Width</th>
              <th className="num" title="Rough opening height, in">Height</th>
              <th className="num" title="Sill height from the floor, in">Sill</th>
              <th className="num" title="King studs each side">Kings</th>
              <th className="num" title="Jack studs each side">Jacks</th>
              <th className="num" title="Header plies (blank: 3 in 2x6 walls, 2 in 2x4 walls, or as typed on the Header row)">Plies</th>
              <th title="What the structural plans call for; the material is picked on the header row in Wall panels">Header per plans (note)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {types.map((t) => {
              const count = use.get(t.id)?.count || 0;
              const d = OPENING_DEFAULTS[t.kind];
              const set = (patch) => onPatchType(t.id, patch);
              // kings, jacks, plies and the header note typed here are kept over the header schedule
              const hand = (patch) => onPatchType(t.id, { ...patch, byHand: true });
              return (
                <tr key={t.id} className={`ot-row${selectedType === t.id ? ' is-on' : ''}`}>
                  <td>
                    <button type="button" className="ot-tag" style={{ borderColor: colors[t.kind] }} onClick={() => onSelectType(t.id)} title={`Select the walls with ${t.id}`}>{t.id}</button>
                    {t.manual ? <span className="ew-subtle ot-man" title="Made by hand: only openings you move here belong to it"> manual</span> : null}
                  </td>
                  <td className="ew-subtle">{scopeOf(t) === 'interior' ? (t.load === 'bearing' ? 'Interior · bearing' : 'Interior') : 'Exterior'}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{count}</td>
                  <td className="num"><NumInput w={56} value={t.widthIn} onCommit={(v) => set({ widthIn: v })} /></td>
                  <td className="num"><NumInput w={48} allowEmpty value={t.heightIn ?? ''} placeholder={String(d.heightIn)} onCommit={(v) => set({ heightIn: v === '' ? undefined : v })} /></td>
                  <td className="num">{t.kind === 'door' ? <span className="ew-subtle">—</span> : <NumInput w={44} allowEmpty value={t.sillIn ?? ''} placeholder={String(d.sillIn)} onCommit={(v) => set({ sillIn: v === '' ? undefined : v })} />}</td>
                  <td className="num"><NumInput w={36} allowEmpty value={t.kings ?? ''} placeholder="1" onCommit={(v) => hand({ kings: v === '' ? undefined : Math.max(1, v) })} /></td>
                  <td className="num"><NumInput w={36} allowEmpty value={t.jacks ?? ''} placeholder="1" onCommit={(v) => hand({ jacks: v === '' ? undefined : Math.max(1, v) })} /></td>
                  <td className="num"><NumInput w={36} allowEmpty value={t.plies ?? ''} placeholder="—" onCommit={(v) => hand({ plies: v === '' ? undefined : Math.max(1, Math.round(v)) })} /></td>
                  <td>
                    <span className="ot-sched">
                      <input className="ew-input ot-notes" value={t.notes || ''} title={t.notes || ''} placeholder="e.g. (2) 2x10 per S-201" onChange={(e) => hand({ notes: e.target.value })} />
                      {hasSchedule && t.byHand ? (
                        <button type="button" className="ew-icon-btn" onClick={() => onBackToSchedule(t.id)} title="Changed by hand: back to the header schedule" aria-label="Use the header schedule"><RotateCcw size={13} /></button>
                      ) : hasSchedule && t.schedMiss ? (
                        <span className="ot-miss" title="No row of the header schedule fits this width and wall: add one, or type the numbers here"><TriangleAlert size={13} /></span>
                      ) : hasSchedule && t.schedRow ? <span className="ew-subtle ot-src" title="From the header schedule">sched.</span> : null}
                    </span>
                  </td>
                  <td className="ot-acts">
                    {count > 0 ? (
                      <select className="ew-select ot-merge" value="" onChange={(e) => e.target.value && onMerge(t.id, e.target.value)} title="Move all its openings to another type (same header) and drop this one" aria-label={`Merge ${t.id} into`}>
                        <option value="">Merge into…</option>
                        {types.filter((x) => x.id !== t.id && x.kind === t.kind && scopeOf(x) === scopeOf(t)).map((x) => <option key={x.id} value={x.id}>{x.id} · {x.widthIn}&quot;</option>)}
                      </select>
                    ) : <button type="button" className="ew-icon-btn" onClick={() => onDeleteType(t.id)} title="Delete this unused type" aria-label="Delete type"><Trash2 size={13} /></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <p className="ew-subtle">No windows or doors on the walls yet.</p>}
      <p className="ew-subtle ot-help">
        Openings of the same kind within 1½&quot; of width share a type; exterior and interior walls have their own types. To give one opening another header (more load), select its wall and
        change its type, or make a new one. Each type becomes a Header row in the wall section where its openings are (Wall panels):
        pick the material there (family · size · vendor); the header length comes from the plan.
      </p>
    </section>
  );
}
