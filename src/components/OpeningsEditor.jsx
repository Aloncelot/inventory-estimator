// src/components/OpeningsEditor.jsx
// The windows and doors a Header row frames: plan name, quantity, size, sill
// height (windows only) and kings / jacks per side. Shown under the Header row.
'use client';

import { Trash2, Plus } from 'lucide-react';
import { NumInput, TextInput } from '@/components/ui/mat';
import { newOpening } from '@/domain/estimate/openings';
import { feet } from '@/domain/lib/units';

export default function OpeningsEditor({ openings = [], perOpening = [], onChange }) {
  const byId = Object.fromEntries((perOpening || []).map((p) => [p.id, p]));
  const patch = (id, change) => onChange((list) => list.map((o) => (o.id === id ? { ...o, ...change } : o)));
  const remove = (id) => onChange((list) => list.filter((o) => o.id !== id));
  const add = (type) => onChange((list) => [...list, newOpening(type)]);

  return (
    <div className="op-block">
      {openings.length ? (
        <div className="op-grid" role="table" aria-label="Openings with this header">
          <div className="op-row op-head" role="row">
            <span>Type</span>
            <span>Name on plans</span>
            <span className="r">Qty</span>
            <span className="r" title="Rough opening width">Width (in)</span>
            <span className="r" title="Rough opening height">Height (in)</span>
            <span className="r" title="Height of the sill above the floor (windows)">Sill (in)</span>
            <span className="r" title="King studs on each side">Kings</span>
            <span className="r" title="Jack (trimmer) studs on each side">Jacks</span>
            <span className="r" title="Width + 1-1/2&quot; per jack on each side">Header</span>
            <span />
          </div>
          {openings.map((o) => {
            const door = o.type === 'door';
            return (
              <div key={o.id} className="op-row" role="row">
                <select
                  className="ew-select"
                  value={door ? 'door' : 'window'}
                  aria-label="Type"
                  onChange={(e) => patch(o.id, e.target.value === 'door' ? { type: 'door', sillIn: undefined } : { type: 'window', sillIn: o.sillIn ?? 36 })}
                >
                  <option value="window">Window</option>
                  <option value="door">Door</option>
                </select>
                <TextInput value={o.name || ''} placeholder={door ? 'e.g. Door 1.1' : 'e.g. Window A1'} onCommit={(v) => patch(o.id, { name: v })} aria-label="Name on plans" />
                <NumInput value={o.qty ?? 1} onCommit={(v) => patch(o.id, { qty: v })} aria-label="Quantity" />
                <NumInput value={o.widthIn ?? ''} onCommit={(v) => patch(o.id, { widthIn: v })} aria-label="Width, inches" />
                <NumInput value={o.heightIn ?? ''} onCommit={(v) => patch(o.id, { heightIn: v })} aria-label="Height, inches" />
                {door ? <span className="op-na">—</span> : (
                  <NumInput value={o.sillIn ?? ''} onCommit={(v) => patch(o.id, { sillIn: v })} aria-label="Sill height above the floor, inches" />
                )}
                <NumInput value={o.kings ?? 1} onCommit={(v) => patch(o.id, { kings: v })} aria-label="Kings per side" />
                <NumInput value={o.jacks ?? 1} onCommit={(v) => patch(o.id, { jacks: v })} aria-label="Jacks per side" />
                <span className="op-header">{byId[o.id] ? feet(byId[o.id].headerIn) : '—'}</span>
                <button type="button" className="row-action-btn delete" onClick={() => remove(o.id)} title="Remove opening" aria-label="Remove opening">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <span className="op-empty">No openings yet: add the windows and doors that use this header, or type the Header LF.</span>
      )}
      <div className="op-add">
        <button type="button" className="ew-btn ew-btn--ghost" onClick={() => add('window')}><Plus size={12} /> Window</button>
        <button type="button" className="ew-btn ew-btn--ghost" onClick={() => add('door')}><Plus size={12} /> Door</button>
      </div>
    </div>
  );
}
