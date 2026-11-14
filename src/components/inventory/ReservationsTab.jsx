// src/components/inventory/ReservationsTab.jsx
// What each project needs from the warehouse. An Estimator reads a project's
// takeoff and reserves its materials; stock goes to the oldest reservation
// first, and whatever stock cannot cover shows as short (to order). Issuing
// material to the project counts against its reservation.
'use client';

import { useMemo, useState } from 'react';
import { ClipboardList, RefreshCw, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm';
import { loadProjectEstimate, saveReservation, releaseReservation } from '@/lib/inventory';
import { materialNeeds } from '@/domain/takeoff';
import { allocate } from '@/domain/reserve';

const qtyFmt = (v) => (Number(v) || 0).toLocaleString('en-US');
const fmtWhen = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const nameOf = (it, key) => (it?.family ? `${it.family} · ${it.size}` : it?.name || key);

export default function ReservationsTab({ cid, user, canReserve, projects, reservations, stocks, alloc, catalog, onChanged }) {
  const confirm = useConfirm();
  const [pick, setPick] = useState('');
  const [draft, setDraft] = useState(null);   // { projectId, projectName, items, skipped }
  const [open, setOpen] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  // read a project's takeoff into a reservation draft
  const readTakeoff = async (projectId) => {
    setBusy('Reading the takeoff…'); setErr('');
    try {
      const { name, estimate } = await loadProjectEstimate(cid, projectId);
      const { items, unpicked } = materialNeeds(estimate);
      const out = {}; let unknown = 0;
      for (const x of items) {
        const c = catalog.get(x.itemKey);
        if (!c) { unknown += 1; continue; }
        out[x.itemKey] = { qty: x.qty, family: c.family, size: c.size, unit: c.unit || x.unit || 'pcs' };
      }
      setDraft({ projectId, projectName: name || projects.find((p) => p.id === projectId)?.name || '', items: out, unknown, unpicked });
      setPick(projectId);
    } catch (e) { setErr(e?.message || String(e)); } finally { setBusy(''); }
  };

  // the draft as stock would cover it, in its place in line
  const preview = useMemo(() => {
    if (!draft) return null;
    const prev = reservations.find((r) => r.projectId === draft.projectId);
    const others = reservations.filter((r) => r.projectId !== draft.projectId);
    const items = Object.fromEntries(Object.entries(draft.items).map(([k, it]) => [k, { ...it, issued: prev?.items?.[k]?.issued || 0 }]));
    const startDate = projects.find((p) => p.id === draft.projectId)?.meta?.startDate || null;
    const a = allocate(stocks, [...others, { projectId: draft.projectId, startDate, createdAt: prev?.createdAt || Number.MAX_SAFE_INTEGER, items }]);
    return Object.entries(a.byProject[draft.projectId] || {}).map(([k, r]) => ({ itemKey: k, ...draft.items[k], ...r }))
      .sort((x, y) => (y.short > 0) - (x.short > 0) || `${x.family}${x.size}`.localeCompare(`${y.family}${y.size}`, undefined, { numeric: true }));
  }, [draft, reservations, stocks, projects]);

  const save = async () => {
    setBusy('Reserving…'); setErr('');
    try {
      await saveReservation(cid, draft, user);
      const short = preview.filter((r) => r.short > 0).length;
      onChanged(`Reserved ${preview.length} materials for ${draft.projectName}${short ? `; ${short} short (see Purchase orders)` : ''}.`);
      setDraft(null);
    } catch (e) { setErr(e?.message || String(e)); } finally { setBusy(''); }
  };
  const release = async (r) => {
    if (!(await confirm({ title: `Release ${r.projectName}?`, message: 'Its materials go back to the free stock. What was already issued to it stays in the movement log.', confirmLabel: 'Release', tone: 'danger' }))) return;
    try { await releaseReservation(cid, r.projectId); onChanged(`Released the reservation of ${r.projectName}.`); } catch (e) { setErr(e?.message || String(e)); }
  };

  // in the order they are served: Job starts first, then the oldest reservation
  const startMs = (r) => (r.startDate ? new Date(`${r.startDate}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER);
  const ordered = [...reservations].sort((a, b) => startMs(a) - startMs(b) || (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));

  return (
    <div className="inv-res">
      {canReserve ? (
        <div className="ew-card inv-res__new">
          <label className="fld" style={{ '--w': '280px' }}>
            <span>Reserve for a project</span>
            <select className="ew-select" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">— pick a project —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}{reservations.some((r) => r.projectId === p.id) ? ' (reserved)' : ''}</option>)}
            </select>
          </label>
          <button type="button" className="ew-btn ew-btn--primary" disabled={!pick || !!busy || !catalog.size} onClick={() => readTakeoff(pick)}><ClipboardList size={13} /> Read its takeoff</button>
          <span className="ew-subtle">Uses the project&apos;s saved takeoff: every picked material of wall panels, loose material and bracing.</span>
        </div>
      ) : <p className="ew-subtle">View only: reserving needs the Estimator role.</p>}
      {busy ? <p className="ew-subtle">{busy}</p> : null}
      {err ? <p className="gate-err">{err}</p> : null}

      {draft && preview ? (
        <div className="ew-card inv-log">
          <div className="inv-form__head">
            <h3>{draft.projectName}: {preview.length} materials</h3>
          </div>
          {draft.unknown || draft.unpicked ? (
            <p className="ew-subtle">
              {draft.unknown ? `${draft.unknown} not in the company's price list. ` : ''}
              {draft.unpicked ? `${draft.unpicked} takeoff lines without a material picked. ` : ''}
              Those are not reserved.
            </p>
          ) : null}
          <table className="tbl inv-tbl">
            <thead><tr><th>Material</th><th className="num">Needs</th><th className="num">Issued</th><th className="num">Covered by stock</th><th className="num">Short</th></tr></thead>
            <tbody>
              {preview.map((r) => (
                <tr key={r.itemKey} className={r.short ? 'is-low' : ''}>
                  <td>{nameOf(r, r.itemKey)}</td>
                  <td className="num">{qtyFmt(r.need)} <span className="ew-subtle">{r.unit}</span></td>
                  <td className="num">{r.issued ? qtyFmt(r.issued) : ''}</td>
                  <td className="num">{qtyFmt(r.allocated)}</td>
                  <td className="num">{r.short ? <span className="inv-st inv-st--out">{qtyFmt(r.short)}</span> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="inv-form__foot">
            <button type="button" className="ew-btn ew-btn--primary" onClick={save} disabled={!!busy || !preview.length}>Reserve</button>
            <button type="button" className="ew-btn ew-btn--ghost" onClick={() => setDraft(null)}>Cancel</button>
            <span className="ew-subtle">The job that starts first (Job starts, in Projects) is served first; without a date, in the order reserved. Reading the takeoff again later updates the quantities.</span>
          </div>
        </div>
      ) : null}

      {!ordered.length ? <div className="empty-state">No reservations yet.</div> : (
        <div className="ew-card inv-card">
          <table className="tbl inv-tbl">
            <thead>
              <tr><th>Project</th><th title="Its Job starts date: the job that starts first is served first">Job starts</th><th className="num">Materials</th><th className="num">Reserved</th><th className="num">Short</th><th>Reserved on</th><th /></tr>
            </thead>
            <tbody>
              {ordered.map((r) => {
                const a = alloc.byProject[r.projectId] || {};
                const rows = Object.entries(a);
                const reserved = rows.reduce((s, [, x]) => s + x.allocated, 0);
                const short = rows.filter(([, x]) => x.short > 0).length;
                const isOpen = open === r.projectId;
                return [
                  <tr key={r.projectId}>
                    <td><button type="button" className="ew-link inv-name" onClick={() => setOpen(isOpen ? '' : r.projectId)}>{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {r.projectName || r.projectId}</button></td>
                    <td>{r.startDate ? new Date(`${r.startDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : <span className="ew-subtle" title="Set it in Projects (ⓘ); without it, served after the dated ones">—</span>}</td>
                    <td className="num">{rows.length}</td>
                    <td className="num">{qtyFmt(reserved)}</td>
                    <td className="num">{short ? <span className="inv-st inv-st--out">{short} items</span> : <span className="ew-subtle">none</span>}</td>
                    <td className="ew-subtle">{fmtWhen(r.createdAt)}{r.updatedBy?.name ? ` · ${r.updatedBy.name}` : ''}</td>
                    <td className="inv-acts">
                      {canReserve ? <button type="button" className="ew-icon-btn" title="Read its takeoff again" aria-label="Update from the takeoff" onClick={() => readTakeoff(r.projectId)}><RefreshCw size={13} /></button> : null}
                      {canReserve ? <button type="button" className="ew-icon-btn delete" title="Release (project done or cancelled)" aria-label="Release" onClick={() => release(r)}><Trash2 size={13} /></button> : null}
                    </td>
                  </tr>,
                  isOpen ? (
                    <tr key={`${r.projectId}-d`} className="inv-res__detail">
                      <td colSpan={7}>
                        <table className="tbl">
                          <thead><tr><th>Material</th><th className="num">Needs</th><th className="num">Issued</th><th className="num">Reserved</th><th className="num">Short</th></tr></thead>
                          <tbody>
                            {rows.map(([k, x]) => (
                              <tr key={k}>
                                <td>{nameOf(r.items?.[k], k)}</td>
                                <td className="num">{qtyFmt(x.need)} <span className="ew-subtle">{r.items?.[k]?.unit}</span></td>
                                <td className="num">{x.issued ? qtyFmt(x.issued) : ''}</td>
                                <td className="num">{qtyFmt(x.allocated)}</td>
                                <td className="num">{x.short ? <span className="inv-st inv-st--out">{qtyFmt(x.short)}</span> : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
