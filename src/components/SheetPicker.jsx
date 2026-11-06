// src/components/SheetPicker.jsx
// Pick one sheet out of a drawing set: every page listed by the sheet number and
// title read from its title block, searchable (S2.201, "framing"), with a
// preview of the one selected. Only that sheet is kept, cut out as a PDF of its
// own; it can also be downloaded.
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Download, Search, X } from 'lucide-react';
import { sheetLabel, filterSheets } from '@/domain/plans/sheets';

async function readLabel(doc, pageNo) {
  const page = await doc.getPage(pageNo);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const texts = [];
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const m = mul(vp.transform, it.transform);
    texts.push({ str: it.str, x: m[4], y: m[5], size: Math.hypot(m[2], m[3]) || Math.hypot(m[0], m[1]), angle: Math.atan2(m[1], m[0]) });
  }
  page.cleanup();
  return sheetLabel(texts, vp.width, vp.height);
}

export default function SheetPicker({ doc, fileName, purpose, onPick, onDownload, onCancel }) {
  const n = doc.numPages;
  const [sheets, setSheets] = useState(() => Array.from({ length: n }, (_, i) => ({ page: i + 1, number: '', title: '', read: false })));
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(1);
  const [busy, setBusy] = useState('');
  const canvas = useRef(null);

  // read every title block, a page at a time
  useEffect(() => {
    let alive = true;
    (async () => {
      for (let p = 1; p <= n && alive; p += 1) {
        try {
          const lab = await readLabel(doc, p);
          if (alive) setSheets((s) => s.map((x) => (x.page === p ? { ...x, ...lab, read: true } : x)));
        } catch { if (alive) setSheets((s) => s.map((x) => (x.page === p ? { ...x, read: true } : x))); }
      }
    })();
    return () => { alive = false; };
  }, [doc, n]);

  // preview of the selected sheet
  useEffect(() => {
    let task = null;
    let alive = true;
    (async () => {
      const page = await doc.getPage(sel);
      if (!alive || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(560 / base.width, 380 / base.height) * (window.devicePixelRatio || 1) });
      const c = canvas.current;
      c.width = vp.width; c.height = vp.height;
      task = page.render({ canvasContext: c.getContext('2d'), viewport: vp });
      await task.promise.catch(() => {});
    })();
    return () => { alive = false; task?.cancel?.(); };
  }, [doc, sel]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const shown = useMemo(() => filterSheets(sheets.filter((s) => s.read || !query), query), [sheets, query]);
  const read = sheets.filter((s) => s.read).length;
  const cur = sheets[sel - 1];
  const run = async (label, fn) => { setBusy(label); try { await fn(); } finally { setBusy(''); } };

  return createPortal(
    <div className="cf-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="cf-dialog shp-dialog" role="dialog" aria-modal="true" aria-labelledby="shp-title">
        <div className="cf-head">
          <span className="cf-icon"><FileText size={18} /></span>
          <h2 id="shp-title" className="cf-title">Pick the sheet {purpose ? `· ${purpose}` : ''}</h2>
          <button type="button" className="ew-icon-btn shp-x" onClick={onCancel} aria-label="Close" disabled={Boolean(busy)}><X size={14} /></button>
        </div>
        <p className="cf-msg shp-msg">
          {fileName} has {n} sheets. Only the one you pick is kept{read < n ? ` · reading title blocks ${read}/${n}…` : ''}.
        </p>
        <div className="shp-body">
          <div className="shp-list">
            <label className="shp-search">
              <Search size={13} />
              <input
                className="ew-input" autoFocus value={query} placeholder="Sheet number or title: S2.201, framing…"
                onChange={(e) => { setQuery(e.target.value); const f = filterSheets(sheets, e.target.value)[0]; if (f) setSel(f.page); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && shown[0] && !busy) run('Cutting the sheet…', () => onPick(shown[0].page, shown[0])); }}
              />
            </label>
            <ul role="listbox" aria-label="Sheets">
              {shown.map((s) => (
                <li key={s.page} role="option" aria-selected={s.page === sel} className={s.page === sel ? 'is-on' : ''}
                  onClick={() => setSel(s.page)} onDoubleClick={() => !busy && run('Cutting the sheet…', () => onPick(s.page, s))}>
                  <span className="shp-no">{s.number || (s.read ? '—' : '…')}</span>
                  <span className="shp-title">{s.title || (s.read ? `Page ${s.page}` : '')}</span>
                  <span className="shp-pg">p. {s.page}</span>
                </li>
              ))}
              {!shown.length ? <li className="shp-none">No sheet matches.</li> : null}
            </ul>
          </div>
          <div className="shp-prev">
            <canvas ref={canvas} aria-label={`Preview of page ${sel}`} />
            <span className="ew-subtle">{cur?.number ? `${cur.number} · ` : ''}{cur?.title || `Page ${sel}`}</span>
          </div>
        </div>
        <div className="cf-actions">
          <button type="button" className="ew-btn ew-btn--ghost" onClick={() => run('Cutting the sheet…', () => onDownload(sel, cur))} disabled={Boolean(busy)} title="Save this sheet as a PDF of its own"><Download size={13} /> Download sheet</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="ew-btn ew-btn--ghost" onClick={onCancel} disabled={Boolean(busy)}>Cancel</button>
          <button type="button" className="ew-btn ew-btn--primary" onClick={() => run('Cutting the sheet…', () => onPick(sel, cur))} disabled={Boolean(busy)}>{busy || `Use ${cur?.number || `page ${sel}`}`}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
