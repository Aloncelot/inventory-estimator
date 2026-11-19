// src/components/assistant/AssistantPanel.jsx
// The assistant, docked on the right like an IDE's side panel. It works on
// the page that registered with it (src/context/AssistantContext.jsx) and
// proposes changes the user applies or discards.
// Opening and closing use springs like the sidebar: on desktop the panel's
// width grows from 0 (the page makes room as it opens) while its content
// slides in; on narrow screens it rises as a bottom sheet.
'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { Sparkles, X, ArrowUp, Check, Eraser } from 'lucide-react';
import { useAssistant } from '@/context/AssistantContext';
import { goTo } from '@/lib/nav';

const ASIDE_W = 360; // keep in sync with --aside-w in globals.css
const SPRING = { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 };
const SOFT_SPRING = { type: 'spring', stiffness: 260, damping: 28 };
const NARROW = '(max-width: 900px)';

function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

export default function AssistantPanel() {
  const a = useAssistant();
  const narrow = useNarrow();
  const open = !!a?.open;
  const frame = narrow
    ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' }, transition: SOFT_SPRING }
    : { initial: { width: 0 }, animate: { width: ASIDE_W }, exit: { width: 0 }, transition: SOFT_SPRING };
  const body = narrow
    ? { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: 0.15 } }, exit: { opacity: 0, transition: { duration: 0.1 } } }
    : { initial: { opacity: 0, x: 28 }, animate: { opacity: 1, x: 0, transition: { ...SPRING, delay: 0.04 } }, exit: { opacity: 0, x: 28, transition: { duration: 0.12 } } };
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence initial={false}>
        {open ? (
          <motion.aside key={narrow ? 'sheet' : 'side'} className="as-panel no-print" aria-label="Assistant" {...frame}>
            <motion.div className="as-panel__inner" {...body}>
              <PanelBody a={a} />
            </motion.div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </MotionConfig>
  );
}

function PanelBody({ a }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [a?.messages, a?.pending, a?.busy]);
  useEffect(() => { if (a?.open && a?.page) inputRef.current?.focus(); }, [a?.open, a?.page]);

  const { page, messages, pending, busy } = a;

  const submit = (e) => {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    a.send(text);
    setText('');
  };

  return (
    <>
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
            {pending.changes.totals ? <p className="as-ends">Estimate total {pending.changes.totals.from} → <strong>{pending.changes.totals.to}</strong></p> : null}
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
    </>
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
