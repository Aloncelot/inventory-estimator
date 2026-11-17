// src/components/assistant/AssistantPanel.jsx
// The assistant, docked on the right like an IDE's side panel. It works on
// the page that registered with it (src/context/AssistantContext.jsx) and
// proposes changes the user applies or discards.
'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, ArrowUp, Check, Eraser } from 'lucide-react';
import { useAssistant } from '@/context/AssistantContext';
import { goTo } from '@/lib/nav';

export default function AssistantPanel() {
  const a = useAssistant();
  const [text, setText] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [a?.messages, a?.pending, a?.busy]);
  useEffect(() => { if (a?.open && a?.page) inputRef.current?.focus(); }, [a?.open, a?.page]);

  if (!a?.open) return null;
  const { page, messages, pending, busy } = a;

  const submit = (e) => {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    a.send(text);
    setText('');
  };

  return (
    <aside className="as-panel no-print" aria-label="Assistant">
      <header className="as-head">
        <Sparkles size={16} aria-hidden="true" />
        <div className="as-head__title">
          <strong>Assistant</strong>
          <span>{page ? `${page.title}${page.subtitle ? ` · ${page.subtitle}` : ''}` : 'No page to work on'}</span>
        </div>
        {messages.length ? <button type="button" className="as-icon" onClick={a.clear} title="Clear the conversation" aria-label="Clear the conversation"><Eraser size={15} /></button> : null}
        <button type="button" className="as-icon" onClick={() => a.setOpen(false)} title="Close (Ctrl+I)" aria-label="Close the assistant"><X size={16} /></button>
      </header>

      <div className="as-list" ref={listRef} aria-live="polite">
        {!page ? (
          <div className="as-empty">
            <p>For now the assistant works on the schedule: moving tasks, changing lengths, linking and breaking them down.</p>
            <button type="button" className="ew-btn" onClick={() => goTo('schedule')}>Open Schedule</button>
          </div>
        ) : !messages.length ? (
          <div className="as-empty">
            <p>Tell it what changed on site, in your own words. It shows the changes before anything is saved.</p>
            <div className="as-examples">
              {(page.examples || []).map((ex) => <button key={ex} type="button" onClick={() => a.send(ex)} disabled={busy}>{ex}</button>)}
            </div>
          </div>
        ) : null}

        {messages.map((m, i) => (
          <div key={i} className={`as-msg as-msg--${m.role}${m.error ? ' is-error' : ''}${m.note ? ' is-note' : ''}`}>{m.role === 'model' && !m.error ? <Rich text={m.text} /> : m.text}</div>
        ))}

        {busy ? <div className="as-msg as-msg--model is-busy" aria-label="Working"><i /><i /><i /></div> : null}

        {pending && !busy ? (
          <section className="as-proposal" aria-label="Proposed changes">
            <h4>{pending.changes.items.length} change{pending.changes.items.length === 1 ? '' : 's'}</h4>
            <ul>
              {pending.changes.items.map((c, i) => <li key={i} className={`is-${c.kind}`}>{c.text}</li>)}
            </ul>
            {pending.changes.ends ? <p className="as-ends">Job ends {pending.changes.ends.from} → <strong>{pending.changes.ends.to}</strong></p> : null}
            <div className="as-proposal__actions">
              <button type="button" className="ew-btn ew-btn--primary" onClick={a.apply}><Check size={14} /> Apply</button>
              <button type="button" className="ew-btn ew-btn--ghost" onClick={a.discard}>Discard</button>
            </div>
          </section>
        ) : null}
      </div>

      <form className="as-input" onSubmit={submit}>
        <textarea
          ref={inputRef}
          rows={2}
          value={text}
          disabled={!page}
          placeholder={page ? 'Roof is delayed 2 weeks…' : 'Open the Schedule to use the assistant'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) submit(e); }}
          aria-label="Message to the assistant"
        />
        <button type="submit" className="as-send" disabled={!page || busy || !text.trim()} aria-label="Send"><ArrowUp size={16} /></button>
      </form>
    </aside>
  );
}

// The model writes a little markdown: **bold**, *italic*, `code` and "- " lists.
function inline(text, key) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={`${key}-${k++}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={`${key}-${k++}`}>{t.slice(1, -1)}</code>);
    else out.push(<em key={`${key}-${k++}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Rich({ text }) {
  const blocks = [];
  let list = null;
  String(text || '').split('\n').forEach((line, i) => {
    const li = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      if (!list) { list = []; blocks.push({ list }); }
      list.push(inline(li[1], `l${i}`));
      return;
    }
    list = null;
    if (line.trim()) blocks.push({ p: inline(line.replace(/^#+\s*/, ''), `p${i}`) });
  });
  return blocks.map((b, i) => (b.list
    ? <ul key={i} className="as-ul">{b.list.map((x, j) => <li key={j}>{x}</li>)}</ul>
    : <p key={i} className="as-p">{b.p}</p>));
}
