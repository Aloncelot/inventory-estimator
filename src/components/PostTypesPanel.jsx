// src/components/PostTypesPanel.jsx
// Post types of a level (P1, P2…): built-up (plies of the wall's studs) or
// solid (one piece: 4x6, 6x6, PSL, LVL, Versa). Posts are placed on walls in
// Plan takeoff; each type becomes a Post row in the wall section where its
// posts are (Wall panels), where its material is picked.
'use client';

import { Plus, Trash2 } from 'lucide-react';
import { NumInput } from '@/components/ui/mat';
import { POST_KINDS } from '@/domain/plans/sync';

export default function PostTypesPanel({ types = [], use, color, selectedType, onSelectType, onPatchType, onAddType, onDeleteType }) {
  const total = types.reduce((s, t) => s + (use.get(t.id) || 0), 0);
  return (
    <section className="ot-panel">
      <div className="ot-head">
        <strong>Post types</strong>
        <span className="ew-subtle">{total} post{total === 1 ? '' : 's'} in {types.length} type{types.length === 1 ? '' : 's'} · from the structural plans</span>
        <span className="ot-add">
          <button type="button" className="ew-btn ew-btn--ghost" onClick={() => onAddType('builtup')}><Plus size={13} /> Built-up type</button>
          <button type="button" className="ew-btn ew-btn--ghost" onClick={() => onAddType('solid')}><Plus size={13} /> Solid type</button>
        </span>
      </div>
      {types.length ? (
        <table className="tbl ot-tbl">
          <thead>
            <tr>
              <th>Type</th>
              <th className="num">Count</th>
              <th>Kind</th>
              <th className="num" title="Built-up: pieces of the wall's studs nailed together">Plies</th>
              <th className="num" title="Solid: width along the wall, in (3.5 for 4x, 5.5 for 6x, 5.25 PSL…)">Width (in)</th>
              <th title="What the structural plans call for; the material is picked on the Post row in Wall panels">Post per plans (note)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {types.map((t) => {
              const count = use.get(t.id) || 0;
              const set = (patch) => onPatchType(t.id, patch);
              return (
                <tr key={t.id} className={`ot-row${selectedType === t.id ? ' is-on' : ''}`}>
                  <td><button type="button" className="ot-tag" style={{ borderColor: color }} onClick={() => onSelectType(t.id)} title={`Select the walls with ${t.id}`}>{t.id}</button></td>
                  <td className="num" style={{ fontWeight: 600 }}>{count}</td>
                  <td>
                    <select className="ew-select" value={t.kind} onChange={(e) => set(e.target.value === 'solid' ? { kind: 'solid', widthIn: t.widthIn || 5.5 } : { kind: 'builtup', plies: t.plies || 3 })}>
                      {POST_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </select>
                  </td>
                  <td className="num">{t.kind === 'solid' ? <span className="ew-subtle">—</span> : <NumInput w={40} value={t.plies ?? 3} onCommit={(v) => set({ plies: Math.max(1, Math.round(v) || 1) })} />}</td>
                  <td className="num">{t.kind === 'solid' ? <NumInput w={48} value={t.widthIn ?? 5.5} onCommit={(v) => set({ widthIn: Math.max(1, v) })} /> : <span className="ew-subtle">{(t.plies ?? 3) * 1.5}</span>}</td>
                  <td><input className="ew-input ot-notes" value={t.notes || ''} placeholder="e.g. (3) 2x6 or 5-1/4x5-1/4 PSL per S-201" onChange={(e) => set({ notes: e.target.value })} /></td>
                  <td>{count === 0 ? <button type="button" className="ew-icon-btn" onClick={() => onDeleteType(t.id)} title="Delete this unused type" aria-label="Delete type"><Trash2 size={13} /></button> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <p className="ew-subtle">No posts yet. Use Add post on the drawing to place them where the structural plans show them.</p>}
      <p className="ew-subtle ot-help">
        Built-up posts use the wall&apos;s studs (pieces per post = plies); solid posts are one piece, bought by LF when the material is LVL, PSL or Versa.
        Posts replace the studs where they stand, and panel joints stay clear of them.
      </p>
    </section>
  );
}
