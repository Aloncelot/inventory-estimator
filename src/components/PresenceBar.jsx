// src/components/PresenceBar.jsx
// Who else has the open project: small rounded squares with initials (the
// app's shapes, not circles); the one editing has a pencil mark. With the
// menu collapsed only a "+" square shows: hovering lists the names, clicking
// keeps the list open until its × is clicked.
'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, X } from 'lucide-react';
import { initialsOf, colorOf } from '@/domain/presence';

const state = (p) => `${p.editing ? 'editing' : 'viewing'}${p.away ? ', away' : ''}`;
const label = (p) => `${p.name} · ${state(p)}`;

function Tile({ p, size = 24 }) {
  return (
    <span className={`pres-tile${p.away ? ' is-away' : ''}`} style={{ '--c': colorOf(p.uid), width: size, height: size }} title={label(p)} aria-label={label(p)}>
      {initialsOf(p.name)}
      {p.editing ? <span className="pres-tile__edit"><Pencil size={8} /></span> : null}
    </span>
  );
}

function List({ people, onClose, pinned }) {
  return (
    <div className="pres-pop__body">
      {pinned ? <button type="button" className="pres-pop__x" onClick={onClose} aria-label="Close"><X size={12} /></button> : null}
      <div className="pres-pop__title">Also in this project</div>
      {people.map((p) => (
        <div key={p.uid} className="pres-pop__row">
          <Tile p={p} size={22} />
          <span>{p.name}</span>
          <span className="ew-subtle">{state(p)}</span>
        </div>
      ))}
    </div>
  );
}

export default function PresenceBar({ others, collapsed }) {
  const btn = useRef(null);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  if (!others?.length) return null;

  if (!collapsed) {
    const shown = others.slice(0, 5);
    return (
      <div className="pres-row" aria-label="Also in this project">
        <span className="pres-row__lbl">Here now</span>
        {shown.map((p) => <Tile key={p.uid} p={p} />)}
        {others.length > shown.length ? <span className="pres-tile pres-tile--more" title={others.slice(5).map(label).join('\n')}>+{others.length - shown.length}</span> : null}
      </div>
    );
  }

  const open = hover || pinned;
  const r = btn.current?.getBoundingClientRect();
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`pres-tile pres-tile--more pres-plus${pinned ? ' is-on' : ''}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => setPinned(true)}
        aria-label={`${others.length} more in this project`}
        aria-expanded={open}
      >
        +{others.length > 1 ? others.length : ''}
      </button>
      {open && r && typeof document !== 'undefined' ? createPortal(
        <div className={`pres-pop${pinned ? ' is-pinned' : ''}`} style={{ left: r.right + 10, bottom: Math.max(8, window.innerHeight - r.bottom) }} role="dialog" aria-label="Also in this project">
          <List people={others} pinned={pinned} onClose={() => { setPinned(false); setHover(false); }} />
        </div>,
        document.body,
      ) : null}
    </>
  );
}
