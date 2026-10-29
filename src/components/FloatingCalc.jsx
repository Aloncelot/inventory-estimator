// src/components/FloatingCalc.jsx
// Floating calculator for quick checks. Drag it by its header; type an
// expression (12*8+4, 1,200/8, 15%) or use the keys. Enter = result,
// Esc clears, click a past result to reuse it.
'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { X, Copy, GripHorizontal, Delete } from 'lucide-react';
import { tryEvaluate } from '@/domain/lib/calc';

const KEYS = [
  'C', '(', ')', '⌫',
  '7', '8', '9', '÷',
  '4', '5', '6', '×',
  '1', '2', '3', '−',
  '0', '.', '%', '+',
  '=',
];
const OPS = new Set(['÷', '×', '−', '+', '(', ')', '%']);
const fmt = (n) => (n === null || n === undefined ? '' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 6 }));

export default function FloatingCalc({ onClose }) {
  const [expr, setExpr] = useState('');
  const [history, setHistory] = useState([]); // { expr, value }
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);
  const boundsRef = useRef(null);
  const drag = useDragControls();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const live = expr.trim() ? tryEvaluate(expr) : { value: null, error: null };

  const insert = (txt) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? expr.length;
    const end = el?.selectionEnd ?? expr.length;
    const next = expr.slice(0, start) + txt + expr.slice(end);
    setExpr(next);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + txt.length, start + txt.length); });
  };

  const commit = () => {
    if (!expr.trim()) return;
    const r = tryEvaluate(expr);
    if (r.error) return;
    setHistory((h) => [{ expr, value: r.value }, ...h].slice(0, 6));
    setExpr(String(r.value));
  };

  const press = (k) => {
    if (k === 'C') { setExpr(''); inputRef.current?.focus(); return; }
    if (k === '=') { commit(); inputRef.current?.focus(); return; }
    if (k === '⌫') { setExpr((x) => x.slice(0, -1)); inputRef.current?.focus(); return; }
    insert(k);
  };

  const copy = async () => {
    const v = live.value ?? history[0]?.value;
    if (v === null || v === undefined) return;
    try {
      await navigator.clipboard.writeText(String(v));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard blocked */ }
  };

  return (
    <div className="calc-bounds" ref={boundsRef}>
      <motion.div
        className="calc"
        role="dialog"
        aria-label="Calculator"
        drag
        dragMomentum={false}
        dragConstraints={boundsRef}
        dragElastic={0}
        dragListener={false}
        dragControls={drag}
        initial={{ opacity: 0, scale: 0.9, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 12 }}
        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); if (expr) setExpr(''); else onClose(); } }}
      >
        <DragHeader onClose={onClose} onPointerDown={(e) => drag.start(e)} />
        <div className="calc-screen">
          <input
            ref={inputRef}
            className="calc-input"
            value={expr}
            onChange={(e) => setExpr(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); commit(); } }}
            placeholder="0"
            inputMode="decimal"
            spellCheck={false}
            aria-label="Expression"
          />
          <div className={`calc-result${live.error ? ' is-error' : ''}`} aria-live="polite">
            {live.error ? '…' : live.value !== null ? `= ${fmt(live.value)}` : ' '}
            <button type="button" className="calc-copy" onClick={copy} title="Copy result" aria-label="Copy result">
              {copied ? 'Copied' : <Copy size={12} />}
            </button>
          </div>
        </div>
        <div className="calc-keys">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={`calc-key${OPS.has(k) ? ' is-op' : ''}${k === '=' ? ' is-eq' : ''}${k === 'C' || k === '⌫' ? ' is-clear' : ''}`}
              aria-label={k === '⌫' ? 'Delete last character' : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => press(k)}
            >
              {k === '⌫' ? <Delete size={14} /> : k}
            </button>
          ))}
        </div>
        {history.length ? (
          <ul className="calc-history" aria-label="Recent results">
            {history.map((h, i) => (
              <li key={i}>
                <button type="button" onClick={() => insert(String(h.value))} title="Insert this result">
                  <span className="e">{h.expr}</span>
                  <span className="v">{fmt(h.value)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </motion.div>
    </div>
  );
}

function DragHeader({ onClose, onPointerDown }) {
  return (
    <div className="calc-head" onPointerDown={onPointerDown} title="Drag to move">
      <GripHorizontal size={14} />
      <span>Calculator</span>
      <button type="button" className="ew-icon-btn" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} title="Close calculator" aria-label="Close calculator">
        <X size={14} />
      </button>
    </div>
  );
}
