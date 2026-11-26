// src/components/HeaderSchedulePanel.jsx
// The project's header schedule, typed from the structural sheets once (or
// loaded from a template): per wall load, stud size, floors above and opening
// width, the header, trimmers and king studs. Every window and door type takes
// its row; templates keep a company's or an engineer's schedule for the next job.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Save, FolderOpen, ImageUp, ClipboardPaste } from 'lucide-react';
import { NumInput } from '@/components/ui/mat';
import { CollapsiblePanel } from '@/components/ui/Collapsible';
import { useConfirm } from '@/components/ui/confirm';
import {
  SCHEDULE_WALLS, SCHEDULE_SIZES, SCHEDULE_ABOVE, newScheduleRow, rowValues, toTemplate, fromTemplate,
  normalizeImportedSchedule, mergeImportedSchedule, BASIC_PARTITION_ROWS, EXAMPLE_TEMPLATE,
} from '@/domain/plans/headerSchedule';
import { listHeaderTemplates, saveHeaderTemplate, deleteHeaderTemplate } from '@/lib/headerTemplates';
import { readHeaderScheduleImage, aiErrorMessage } from '@/lib/ai';

const ftIn = (inch) => {
  const v = Number(inch) || 0;
  const ft = Math.floor(v / 12), i = Math.round((v - ft * 12) * 4) / 4;
  return `${ft}'-${i}"`;
};
const aboveLabel = (a) => (a === 'any' ? 'Any' : a === 0 ? 'None (top floor)' : `${a}`);

export default function HeaderSchedulePanel({ schedule, uid, levelName, above, aboveOwn, onAbove, onChange, used }) {
  const confirm = useConfirm();
  const rows = schedule?.rows || [];
  const [templates, setTemplates] = useState([]);
  const [pick, setPick] = useState('');
  const [naming, setNaming] = useState(null); // name being typed for "Save as template"
  const [msg, setMsg] = useState('');
  const [reading, setReading] = useState(false);
  const imgInput = useRef(null);

  const importImage = async (file) => {
    if (!file || reading) return;
    setReading(true);
    setMsg('Reading header schedule image…');
    try {
      const raw = await readHeaderScheduleImage(file);
      const imported = normalizeImportedSchedule(raw);
      if (!imported.rows.length) {
        setMsg('No header schedule rows were found in that image.');
        return;
      }
      const impKinds = new Set(imported.rows.map((r) => r.walls));
      const overlaps = rows.some((r) => impKinds.has(r.walls));
      if (overlaps) {
        const labels = [...impKinds].map((k) => (k === 'bearing' ? 'bearing & shear' : k === 'nonbearing' ? 'non-bearing / partition' : 'all-walls')).join(' and ');
        const ok = await confirm({
          title: `Replace existing ${labels} rows?`,
          message: 'Rows for other wall types are kept. Window and door types you changed by hand keep your numbers.',
          confirmLabel: 'Import',
        });
        if (!ok) { setMsg(''); return; }
      }
      const merged = mergeImportedSchedule(schedule, imported, { mode: 'merge' });
      const kept = merged.rows.length - imported.rows.length;
      onChange(merged);
      setMsg(
        kept > 0
          ? `Imported ${imported.rows.length} rows (kept ${kept} existing rows of other wall types). Review them, then Save as template if needed.`
          : `Imported ${imported.rows.length} rows from the image. You can also import a separate partition table or add Basic partitions below.`
      );
    } catch (e) {
      setMsg(aiErrorMessage(e));
    } finally {
      setReading(false);
    }
  };
  const pasteFromClipboard = async () => {
    if (reading) return;
    if (!navigator.clipboard?.read) {
      setMsg('Click inside this panel and press Ctrl+V to paste a screenshot.');
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith('image/'));
        if (imgType) {
          const blob = await item.getType(imgType);
          await importImage(blob);
          return;
        }
      }
      setMsg('No screenshot found in the clipboard. Take a screenshot first, then click Paste screenshot (or press Ctrl+V).');
    } catch {
      setMsg('Clipboard access was blocked by the browser: click inside this panel and press Ctrl+V to paste your screenshot.');
    }
  };
  const onPaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type?.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) { e.preventDefault(); importImage(file); return; }
      }
    }
  };
  const hasPartitions = rows.some((r) => r.walls === 'nonbearing');
  const addBasicPartitions = () => {
    const nextRows = [...rows, ...BASIC_PARTITION_ROWS.map((r) => newScheduleRow(r))];
    set({ name: schedule?.name || 'Header schedule', rows: nextRows });
    setMsg('Added basic non-bearing partition headers (2x4 → 4x4, 2x6 → 6x6).');
  };

  const refresh = useCallback(async () => {
    try { setTemplates(await listHeaderTemplates(uid)); } catch (e) { setMsg(`Templates could not be read: ${e.message || e}`); }
  }, [uid]);
  useEffect(() => { if (uid) refresh(); }, [uid, refresh]);

  const set = (next) => onChange({ ...(schedule || {}), ...next });
  const setRow = (id, patch) => set({ rows: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const mine = templates.find((t) => t.id === schedule?.templateId);

  const load = async () => {
    const tpl = pick === '__example' ? EXAMPLE_TEMPLATE : pick === '__blank' ? { name: 'Header schedule', rows: [] } : templates.find((t) => t.id === pick);
    if (!tpl) return;
    if (rows.length) {
      const ok = await confirm({ title: `Use "${tpl.name}"?`, message: 'The schedule of this project is replaced. Window and door types you changed by hand keep your numbers.', confirmLabel: 'Use template' });
      if (!ok) return;
    }
    onChange(fromTemplate(tpl, templates.some((t) => t.id === pick) ? pick : undefined));
    setPick('');
  };
  const saveAs = async () => {
    const name = (naming || '').trim();
    if (!name) return;
    try {
      const id = await saveHeaderTemplate(uid, toTemplate(schedule, name));
      set({ name, templateId: id });
      setNaming(null); setMsg(`Saved as "${name}".`);
      refresh();
    } catch (e) { setMsg(e.message || String(e)); }
  };
  const update = async () => {
    try {
      await saveHeaderTemplate(uid, toTemplate(schedule, mine.name), mine.id);
      setMsg(`"${mine.name}" updated.`);
      refresh();
    } catch (e) { setMsg(e.message || String(e)); }
  };
  const remove = async () => {
    const tpl = templates.find((t) => t.id === pick);
    if (!tpl) return;
    const ok = await confirm({ title: `Delete the template "${tpl.name}"?`, message: 'Projects that used it keep their own copy of the schedule.', confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    await deleteHeaderTemplate(uid, tpl.id);
    setPick('');
    refresh();
  };

  return (
    <CollapsiblePanel
      title="Header schedule"
      storageKey="pt-sec-headers"
      subtitle={
        <>
          {rows.length ? `${schedule.name || 'Untitled'} · ${rows.length} rows · this project` : 'Kings, trimmers and header per opening width, from the structural sheets'}
          {mine ? ' · from your template' : ''}
        </>
      }
      actions={
        <span className="hs-tools">
          <input
            ref={imgInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importImage(f); }}
          />
          <button
            type="button"
            className="ew-btn ew-btn--ghost ro-hide"
            onClick={pasteFromClipboard}
            disabled={reading}
            title="Paste a screenshot straight from your clipboard (no need to save it as a file). Works for both bearing/shear and partition tables."
          >
            <ClipboardPaste size={13} /> {reading ? 'Reading…' : 'Paste screenshot'}
          </button>
          <button
            type="button"
            className="ew-btn ew-btn--ghost ro-hide"
            onClick={() => imgInput.current?.click()}
            disabled={reading}
            title="Upload an image of a bearing/shear or partition header schedule table"
          >
            <ImageUp size={13} /> Import image
          </button>
          <select className="ew-select" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Template">
            <option value="">Templates…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value="__example">{EXAMPLE_TEMPLATE.name}</option>
            <option value="__blank">Blank</option>
          </select>
          <button type="button" className="ew-btn ew-btn--ghost ro-hide" onClick={load} disabled={!pick}><FolderOpen size={13} /> Use</button>
          {templates.some((t) => t.id === pick) ? <button type="button" className="ew-icon-btn ro-hide" onClick={remove} title="Delete this template" aria-label="Delete template"><Trash2 size={13} /></button> : null}
          {mine ? <button type="button" className="ew-btn ew-btn--ghost ro-hide" onClick={update} disabled={!uid} title={`Save these rows into "${mine.name}"`}><Save size={13} /> Update template</button> : null}
          {naming === null
            ? <button type="button" className="ew-btn ew-btn--ghost ro-hide" onClick={() => setNaming(schedule?.name && !mine ? schedule.name : '')} disabled={!rows.length || !uid}><Save size={13} /> Save as template</button>
            : (
              <span className="hs-name">
                <input className="ew-input" autoFocus value={naming} placeholder="e.g. RRM Design · wood" onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveAs(); if (e.key === 'Escape') setNaming(null); }} />
                <button type="button" className="ew-btn ew-btn--primary" onClick={saveAs} disabled={!naming.trim()}>Save</button>
                <button type="button" className="ew-btn ew-btn--ghost" onClick={() => setNaming(null)}>Cancel</button>
              </span>
            )}
        </span>
      }
    >
      <div onPaste={onPaste}>
      {msg ? <p className="ew-subtle hs-msg">{msg}</p> : null}

      <div className="hs-above">
        <label className="fld">
          <span>Floors above {levelName}</span>
          <select className="ew-select" value={aboveOwn ?? ''} onChange={(e) => onAbove(e.target.value === '' ? undefined : Number(e.target.value))}>
            <option value="">{`${above} (from the levels)`}</option>
            {[0, 1, 2, 3, 4].map((a) => <option key={a} value={a}>{a === 0 ? '0 · top floor' : a}</option>)}
          </select>
        </label>
        <span className="ew-subtle">Picks the rows of the schedule for this level: the 1-story column of a sheet is 0 floors above, the 2-story column 1, the 3-story column 2.</span>
      </div>

      {rows.length ? (
        <table className="tbl ot-tbl ot-tbl--auto hs-tbl">
          <thead>
            <tr>
              <th title="Exterior, interior bearing and shear walls carry load">Walls</th>
              <th>Studs</th>
              <th title="Floors the wall carries above this level">Floors above</th>
              <th className="num" title="Widest rough opening this row covers, in">Opening up to (in)</th>
              <th title="As the schedule writes it: 4x10, (2) 2x10, 5-1/4x11-7/8 PSL…">Header</th>
              <th className="num" title="Pieces of the header; blank = from the header callout ((3) 2x10 → 3)">Plies</th>
              <th title="Sill at windows: 2x, (2) 2x… (windows only)">Window sill</th>
              <th title="Post / trimmer each side: 2x4, (2) 2x4, 4x4…">Trimmers</th>
              <th title="King studs each side: 2x4, (2) 2x4…">Kings</th>
              <th>Note</th>
              <th className="num" title="Window and door types of this level using this row">Types</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = rowValues(r);
              return (
                <tr key={r.id}>
                  <td><select className="ew-select" value={r.walls} onChange={(e) => setRow(r.id, { walls: e.target.value })}>{SCHEDULE_WALLS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}</select></td>
                  <td><select className="ew-select" value={r.size} onChange={(e) => setRow(r.id, { size: e.target.value })}>{SCHEDULE_SIZES.map((s) => <option key={s} value={s}>{s === 'any' ? 'Any' : s}</option>)}</select></td>
                  <td><select className="ew-select" value={String(r.above)} onChange={(e) => setRow(r.id, { above: e.target.value === 'any' ? 'any' : Number(e.target.value) })}>{SCHEDULE_ABOVE.map((a) => <option key={a} value={String(a)}>{aboveLabel(a)}</option>)}</select></td>
                  <td className="num"><NumInput w={52} value={r.upToIn} onCommit={(x) => setRow(r.id, { upToIn: Math.max(0, x) })} /> <span className="ew-subtle">{ftIn(r.upToIn)}</span></td>
                  <td><input className="ew-input hs-txt" value={r.header} placeholder="4x10" onChange={(e) => setRow(r.id, { header: e.target.value })} /></td>
                  <td className="num"><NumInput w={36} allowEmpty value={r.plies ?? ''} placeholder={String(v.plies || '')} onCommit={(x) => setRow(r.id, { plies: x === '' ? '' : Math.max(1, Math.round(x)) })} /></td>
                  <td><input className="ew-input hs-txt" value={r.sill || ''} placeholder="2x" onChange={(e) => setRow(r.id, { sill: e.target.value })} /></td>
                  <td><input className="ew-input hs-txt" value={r.jacks} placeholder="2x4" onChange={(e) => setRow(r.id, { jacks: e.target.value })} title={v.jacks ? `${v.jacks} each side` : ''} /></td>
                  <td><input className="ew-input hs-txt" value={r.kings} placeholder="2x4" onChange={(e) => setRow(r.id, { kings: e.target.value })} title={v.kings ? `${v.kings} each side` : ''} /></td>
                  <td><input className="ew-input hs-note" value={r.note} placeholder="per detail 32/S-401" onChange={(e) => setRow(r.id, { note: e.target.value })} /></td>
                  <td className="num">{used.get(r.id) || ''}</td>
                  <td><button type="button" className="ew-icon-btn" onClick={() => set({ rows: rows.filter((x) => x.id !== r.id) })} aria-label="Remove row" title="Remove row"><Trash2 size={13} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <p className="ew-subtle">No schedule yet: types keep the kings and jacks you type. Start from a template, or add the rows of the structural sheet.</p>}
      <div className="hs-foot" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button type="button" className="ew-btn ew-btn--ghost" onClick={() => {
          const last = rows[rows.length - 1];
          set({ name: schedule?.name || 'Header schedule', rows: [...rows, newScheduleRow(last ? { walls: last.walls, size: last.size, above: last.above, upToIn: Number(last.upToIn) + 24 } : {})] });
        }}><Plus size={13} /> Row</button>
        {!hasPartitions ? (
          <button
            type="button"
            className="ew-btn ew-btn--ghost"
            onClick={addBasicPartitions}
            title="Add basic non-bearing partition headers: 4x4 for 2x4 walls and 6x6 for 2x6 walls (when the plans do not include a partition header table)"
          >
            <Plus size={13} /> Basic partitions (4x4 / 6x6)
          </button>
        ) : null}
      </div>
      <p className="ew-subtle ot-help">
        Each window and door type takes the narrowest row that fits its width, for the most loaded and thickest wall it is in (exterior counts as bearing).
        A row for a given wall, stud size or floor count wins over an &quot;All&quot; / &quot;Any&quot; row. Types you change by hand keep your numbers.
        The header material (family · size · vendor) is still picked on its Header row in Wall panels; the row&apos;s header shows there as the note.
      </p>
      </div>
    </CollapsiblePanel>
  );
}
