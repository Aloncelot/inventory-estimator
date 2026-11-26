// src/context/AssistantContext.jsx
// The assistant panel on the right. A page that the assistant can work on
// registers itself with useAssistantPage: its tools, what the model reads
// about it, and how a draft is applied. A request runs the tools on a draft
// copy; the user sees the changes and applies them (one undo step) or not.
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { askAssistant, aiErrorMessage } from '@/lib/ai';
import { chatHistory } from '@/domain/assistant/history';

const Ctx = createContext(null);
const OPEN_KEY = 'assistant-open';

export function AssistantProvider({ resetKey, children }) {
  const [open, setOpenState] = useState(false);
  const [page, setPage] = useState(null); // the registered page (its spec is in pageRef)
  const pageRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [pending, setPending] = useState(null); // { base, draft, changes, pageKey }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try { setOpenState(localStorage.getItem(OPEN_KEY) === '1'); } catch { /* storage off */ }
  }, []);
  const setOpen = useCallback((v) => {
    setOpenState((prev) => {
      const next = typeof v === 'function' ? v(prev) : v;
      try { localStorage.setItem(OPEN_KEY, next ? '1' : '0'); } catch { /* storage off */ }
      return next;
    });
  }, []);

  // another project: another conversation
  useEffect(() => { setMessages([]); setPending(null); }, [resetKey]);

  // Ctrl+I opens and closes the panel
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'i') { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const register = useCallback((spec) => {
    pageRef.current = spec;
    const ex = (spec.examples || []).join('|');
    setPage((p) => (p?.key === spec.key && p?.title === spec.title && p?.subtitle === spec.subtitle && (p?.examples || []).join('|') === ex ? p : { key: spec.key, title: spec.title, subtitle: spec.subtitle, examples: spec.examples }));
  }, []);
  // only the page that registered can clear its registration, so a late cleanup never wipes the next page's
  const unregister = useCallback((key, spec) => {
    if (pageRef.current?.key === key && (!spec || pageRef.current === spec)) { pageRef.current = null; setPage(null); }
  }, []);

  const send = useCallback(async (text) => {
    const msg = String(text || '').trim();
    const spec = pageRef.current;
    if (!msg || busy || !spec) return;
    const current = spec.getState();
    // keep building on a proposal not applied yet, if the page has not changed since
    const keep = pending && pending.pageKey === spec.key && pending.base === current;
    const base = keep ? pending.base : current;
    let draft = keep ? pending.draft : current;
    const history = chatHistory(messages);
    setMessages((m) => [...m, { role: 'user', text: msg }]);
    setBusy(true);
    // per-request state for the tools (a tool such as find_material may keep what it found here)
    const session = {};
    try {
      const { text: answer } = await askAssistant({
        system: spec.system,
        history,
        message: `${spec.context(draft)}\n\nUser request: ${msg}`,
        tools: spec.tools,
        execute: async (name, args) => {
          const r = await spec.run(draft, name, args, session); // a tool may be async
          draft = r.state;
          return r.result;
        },
      });
      const changes = draft !== base ? spec.changes(base, draft) : null;
      const has = changes && (changes.items.length || changes.ends);
      setPending(has ? { base, draft, changes, pageKey: spec.key } : null);
      setMessages((m) => [...m, { role: 'model', text: answer || (has ? 'Here are the changes.' : 'Done.'), proposal: !!has }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'model', text: aiErrorMessage(e), error: true }]);
    } finally {
      setBusy(false);
    }
  }, [busy, messages, pending]);

  const apply = useCallback(() => {
    const spec = pageRef.current;
    if (!pending || !spec || spec.key !== pending.pageKey) return;
    if (spec.getState() !== pending.base) {
      setPending(null);
      setMessages((m) => [...m, { role: 'model', text: `${spec.title || 'This page'} changed after these changes were proposed, so they were not applied. Ask again.`, error: true }]);
      return;
    }
    spec.apply(pending.draft);
    setPending(null);
    setMessages((m) => [...m, { role: 'model', text: 'Applied. Undo takes it back.', note: true }]);
  }, [pending]);
  const discard = useCallback(() => {
    if (!pending) return;
    setPending(null);
    setMessages((m) => [...m, { role: 'model', text: 'Discarded.', note: true }]);
  }, [pending]);
  const clear = useCallback(() => { setMessages([]); setPending(null); }, []);

  const value = useMemo(() => ({ open, setOpen, page, messages, pending, busy, send, apply, discard, clear, register, unregister }),
    [open, setOpen, page, messages, pending, busy, send, apply, discard, clear, register, unregister]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAssistant = () => useContext(Ctx);


/**
 * Lets the assistant work on this page while it is open.
 * spec: { key, title, subtitle, examples, system, tools, context(state), getState(), run(state, name, args, session) → {state, result} or a Promise of it, changes(before, after), apply(state) }
 */
export function useAssistantPage(spec) {
  const a = useContext(Ctx);
  const ref = useRef(spec);
  ref.current = spec;
  const register = a?.register;
  const unregister = a?.unregister;
  const key = spec?.key;
  // the spec changes on every render; the assistant always reads the latest through this proxy
  const proxy = useMemo(() => ({
    get key() { return ref.current.key; },
    get title() { return ref.current.title; },
    get subtitle() { return ref.current.subtitle; },
    get examples() { return ref.current.examples; },
    get system() { return ref.current.system; },
    get tools() { return ref.current.tools; },
    context: (s) => ref.current.context(s),
    getState: () => ref.current.getState(),
    run: (s, n, args, session) => ref.current.run(s, n, args, session),
    changes: (b, d) => ref.current.changes(b, d),
    apply: (s) => ref.current.apply(s),
  }), []);
  useEffect(() => {
    if (!register || !key) return undefined;
    register(proxy);
    return () => unregister(key, proxy);
  }, [register, unregister, key, proxy, spec?.subtitle, (spec?.examples || []).join('|')]);
}
