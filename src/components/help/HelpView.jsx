// src/components/help/HelpView.jsx
// Help: an index of topics (one per page of the app) on the left with a
// search box, the open topic on the right with links to its sections.
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LifeBuoy, Search, Lightbulb } from 'lucide-react';
import { PageHeader } from '@/components/ui/mat';
import { HELP, helpTopic, topicText } from './content';
import QuasarMark, { QUASAR_URL } from '@/components/QuasarMark';

function Block({ b }) {
  if (typeof b === 'string') return <p>{b}</p>;
  if (b.ol) return <ol>{b.ol.map((x) => <li key={x}>{x}</li>)}</ol>;
  if (b.ul) return <ul>{b.ul.map((x) => <li key={x}>{x}</li>)}</ul>;
  if (b.links) return <ul className="help-links">{b.links.map(([label, href]) => <li key={href}><a href={href} target="_blank" rel="noopener noreferrer">{label}</a></li>)}</ul>;
  if (b.about) {
    return (
      <a className="help-about" href={QUASAR_URL} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
        <QuasarMark style={{ height: 72 }} />
        <span>
          <span className="quasar-word">QUASAR <b>DEVS</b></span>
          <p>Built by QuasarDevs. Software for the trades, by people who worked in them.</p>
        </span>
      </a>
    );
  }
  if (b.tip) return <p className="help-tip"><Lightbulb size={14} aria-hidden="true" /> <span>{b.tip}</span></p>;
  return null;
}

export default function HelpView({ topic: initialTopic, onOpenPage }) {
  const [topicId, setTopicId] = useState(initialTopic || 'start');
  const [q, setQ] = useState('');
  const bodyRef = useRef(null);

  useEffect(() => { if (initialTopic) setTopicId(initialTopic); }, [initialTopic]);
  useEffect(() => { bodyRef.current?.scrollTo?.({ top: 0 }); }, [topicId]);

  const topic = helpTopic(topicId);
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return HELP;
    return HELP.filter((t) => { const txt = topicText(t); return words.every((w) => txt.includes(w)); });
  }, [q]);

  const jump = (sid) => {
    const el = document.getElementById(`help-${topic.id}-${sid}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="app-content help">
      <PageHeader icon={LifeBuoy} title="Help" />
      <div className="help-grid">
        <nav className="help-index" aria-label="Help topics">
          <label className="help-search">
            <Search size={14} aria-hidden="true" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search help" aria-label="Search help" />
          </label>
          {shown.length ? (
            <ul>
              {shown.map((t) => (
                <li key={t.id}>
                  <button type="button" className={t.id === topic.id ? 'is-on' : ''} aria-current={t.id === topic.id ? 'page' : undefined} onClick={() => setTopicId(t.id)}>{t.title}</button>
                </li>
              ))}
            </ul>
          ) : <p className="help-empty">Nothing matches “{q}”. Try another word.</p>}
        </nav>

        <article className="help-body" ref={bodyRef}>
          <header className="help-head">
            <h2>{topic.title}</h2>
            <p>{topic.intro}</p>
            {topic.page && onOpenPage ? (
              <button type="button" className="ew-btn ew-btn--ghost" onClick={() => onOpenPage(topic.page)}>Open {topic.title}</button>
            ) : null}
          </header>
          {topic.sections.length > 1 ? (
            <nav className="help-toc" aria-label="On this page">
              {topic.sections.map((s) => <button key={s.id} type="button" onClick={() => jump(s.id)}>{s.title}</button>)}
            </nav>
          ) : null}
          {topic.sections.map((s) => (
            <section key={s.id} id={`help-${topic.id}-${s.id}`} className="help-sec">
              <h3>{s.title}</h3>
              {s.body.map((b, i) => <Block key={i} b={b} />)}
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
