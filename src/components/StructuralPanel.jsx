// src/components/StructuralPanel.jsx
// The structural framing plan of this level: posts, tie-down rods, hold-down
// callouts and shear wall tags read from it and placed on the walls of the
// architectural plan, lined up by the grid bubbles both sheets share.
'use client';

import { Upload, RefreshCw, Trash2, Plus } from 'lucide-react';
import { shearLengths, SHEAR_TYPES } from '@/domain/plans/hardware';

const fmt = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');
const UNLABELED_CHOICES = {
  '2x4': ['4x4', '(2) 2x4', '(3) 2x4', ''],
  '2x6': ['6x6', '4x6', '(2) 2x6', '(3) 2x6', ''],
};

export default function StructuralPanel({ plan, busy, onUpload, onPage, onPlace, onRemove, onPatch, onShearHardware, onConcrete }) {
  const st = plan.structural;
  const opts = st?.opts || {};
  const found = st?.found;
  const placed = st?.placed || {};
  const missed = st?.missed || [];
  const lens = shearLengths(plan);
  const setOpt = (patch) => onPatch({ opts: { ...opts, ...patch } });
  const unl = opts.unlabeled || { '2x4': '4x4', '2x6': '6x6' };
  const missedBy = missed.reduce((m, x) => ({ ...m, [x.kind]: (m[x.kind] || 0) + 1 }), {});
  const sizes = found ? Object.entries(found.posts.reduce((m, p) => ({ ...m, [p.labeled ? p.name : 'unlabeled']: (m[p.labeled ? p.name : 'unlabeled'] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]) : [];
  return (
    <section className="ot-panel">
      <div className="ot-head">
        <strong>Structural plan</strong>
        <span className="ew-subtle">
          {st?.fileName ? `${st.fileName}${st.pageCount > 1 ? ` · sheet ${st.page}` : ''}` : 'Posts, tie-downs, hold-downs and shear walls from the framing plan'}
        </span>
        <span className="ot-add">
          {st?.fileName && st.pageCount > 1 ? (
            <select className="ew-select" style={{ width: 64 }} value={st.page || 1} onChange={(e) => onPage(Number(e.target.value))} aria-label="Structural sheet" disabled={Boolean(busy)}>
              {Array.from({ length: st.pageCount }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
            </select>
          ) : null}
          <button type="button" className={`ew-btn${st?.fileName ? ' ew-btn--ghost' : ''}`} onClick={onUpload} disabled={Boolean(busy)}><Upload size={13} /> {st?.fileName ? 'Replace' : 'Upload structural PDF'}</button>
        </span>
      </div>

      {!st?.fileName ? (
        <p className="ew-subtle">
          Upload the framing plan of this level (the sheet that shows posts, hold-downs and shear wall tags). It is lined up with this plan by
          the grid bubbles both sheets share (2.A, 2.B, 2.1…), and what it shows is placed on the walls found here.
        </p>
      ) : !st.align ? (
        <p className="lc-note">The grid bubbles of the two sheets do not match, so the structural plan cannot be lined up. Check that both sheets show the same grid lines.</p>
      ) : (
        <>
          <div className="sp-grid">
            <div className="fp-box">
              <strong>Found on the sheet</strong>
              <span>{fmt(found.posts.length)} posts · {fmt(found.labels)} size labels</span>
              <span className="ew-subtle sp-sizes">{sizes.map(([k, v]) => `${k} ${v}`).join(' · ')}</span>
              <span>{fmt(found.rods.length)} tie-down rods</span>
              <span>{found.callouts.length ? found.callouts.map((c) => `(${c.qty}) ${c.model}`).join(', ') : 'No hold-down callouts'}</span>
              <span>{fmt(found.shear.length)} shear wall tags</span>
              <span className="ew-subtle">Lined up by {st.align.labels.join(', ')}</span>
            </div>
            <div className="fp-box">
              <strong>Place on the walls</strong>
              {[['posts', 'Posts', 'post'], ['rods', 'Tie-down rods', 'rod'], ['callouts', 'Hold-down callouts', 'callout'], ['shear', 'Shear wall types', 'shear']].map(([key, label, kind]) => (
                <label key={key} className="pv-check">
                  <input type="checkbox" checked={opts[key] !== false} onChange={(e) => setOpt({ [key]: e.target.checked })} />
                  {label}{placed[key] !== undefined ? ` · ${placed[key]} placed${missedBy[kind] ? `, ${missedBy[kind]} off the walls` : ''}` : ''}
                </label>
              ))}
              <span className="ew-subtle">Posts without a size label (framing plan note):</span>
              <div className="sp-unl">
                {Object.keys(UNLABELED_CHOICES).map((size) => (
                  <label key={size} className="fld"><span>In {size} walls</span>
                    <select className="ew-select" value={unl[size] ?? ''} onChange={(e) => setOpt({ unlabeled: { ...unl, [size]: e.target.value } })}>
                      {UNLABELED_CHOICES[size].map((c) => <option key={c} value={c}>{c || 'As drawn'}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <div className="sp-actions">
                <button type="button" className="ew-btn ew-btn--primary" onClick={onPlace} disabled={Boolean(busy)}><RefreshCw size={13} /> Place on walls</button>
                {placed.posts !== undefined ? <button type="button" className="ew-btn ew-btn--ghost" onClick={onRemove} disabled={Boolean(busy)}><Trash2 size={13} /> Remove placed</button> : null}
              </div>
              {missed.length ? <span className="ew-subtle">Marked ✕ on the drawing: items that fall where no wall was found. Add the wall, then place again.</span> : null}
            </div>
            <div className="fp-box">
              <strong>Shear walls</strong>
              {lens.size ? (
                <table className="tbl sp-shear">
                  <thead><tr><th>Type</th><th className="num">LF</th></tr></thead>
                  <tbody>
                    {SHEAR_TYPES.filter((t) => lens.has(t)).map((t) => <tr key={t}><td>{t}</td><td className="num">{fmt(lens.get(t))}</td></tr>)}
                  </tbody>
                </table>
              ) : <span className="ew-subtle">No shear wall types on the walls yet.</span>}
              {lens.size ? (
                <button type="button" className="ew-btn ew-btn--ghost" onClick={onShearHardware} title="A hardware type counted along the shear walls at each type's spacing; edit the spacings in Structural hardware">
                  <Plus size={13} /> {onConcrete ? 'Anchor bolts by shear type' : 'Sill lag screws by shear type'}
                </button>
              ) : null}
              <span className="ew-subtle">Each tag gives its type and length; select a wall to change them.</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
