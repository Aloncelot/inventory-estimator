// src/components/SearchableSelect.jsx
'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

// Keyboard-friendly, searchable combobox.
export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  disabled = false,
  loading = false,
  ariaLabel,
}) {
  const id = useId();
  const listId = `${id}-listbox`;
  const inputRef = useRef(null);
  const rootRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  // Current option for controlled value
  const selected = useMemo(
    () => options.find(o => o.value === value) || null,
    [options, value]
  );

  // Filter by label (case-insensitive)
  const filtered = useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => (o.label || '').toLowerCase().includes(q));
  }, [options, query]);

  // Inject a "Clear selection" pseudo-option at the top when there is a selection
  const displayed = useMemo(() => {
    if (!selected) return filtered;
    return [{ value: '__CLEAR__', label: '✖ Clear selection' }, ...filtered];
  }, [filtered, selected]);

  // Keep active index in range
  useEffect(() => {
    if (!displayed.length) {
      setActiveIndex(prev => (prev === -1 ? prev : -1));
      return;
    }
    if (activeIndex < 0 || activeIndex >= displayed.length) {
      setActiveIndex(0);
    }
  }, [displayed, activeIndex]);

  // Close on outside click
  useEffect(() => {
    function onDocMouseDown(e) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  // When opening, prefill the input with the selected label for quick refine.
  useEffect(() => {
    if (!open) return;
    if (!query && selected?.label) {
      setQuery(prev => (prev === selected.label ? prev : selected.label));
      // Put cursor at end
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (input) input.setSelectionRange(input.value.length, input.value.length);
      });
    }
  }, [open, selected, query]);

  function handleInputFocus() {
    if (disabled) return;
    setOpen(true);
  }

  function handleInputChange(e) {
    const next = e.target.value;
    setQuery(next);
    if (!open) setOpen(true);
  }

  function commitSelection(opt) {
    if (!opt) return;
    if (opt.value === '__CLEAR__') {
      // Clear the selection and the query; close the list
      onChange?.('');
      setQuery('');
      setOpen(false);
      return;
    }
    if (opt.value !== value) onChange?.(opt.value);
    setOpen(false);
    // Clear so, when closed, the input shows selected label (via displayText)
    setQuery(prev => (prev === '' ? prev : ''));
  }

  function onKeyDown(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!displayed.length) return;
      setActiveIndex(i => Math.min(i + 1, displayed.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!displayed.length) return;
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (displayed.length && activeIndex >= 0) {
        commitSelection(displayed[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery(prev => (prev === '' ? prev : ''));
    }
  }

  const displayText = open ? query : (selected?.label ?? '');

  return (
    <div
      ref={rootRef}
      className="combo"
      role="combobox"
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-owns={listId}
      aria-controls={listId}
    >
      <input
        ref={inputRef}
        type="text"
        className="ew-select combo-input"
        placeholder={loading ? 'Loading…' : placeholder}
        value={displayText}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onKeyDown={onKeyDown}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled || loading}
        autoComplete="off"
        spellCheck="false"
      />

      <div className="combo-caret" aria-hidden />
      {open && (
        <ul id={listId} role="listbox" className="combo-list">
          {loading ? (
            <li className="combo-empty">Loading…</li>
          ) : displayed.length ? (
            displayed.map((o, idx) => (
              <li
                key={`${o.value}-${idx}`}
                role="option"
                aria-selected={o.value !== '__CLEAR__' && value === o.value}
                className={
                  'combo-option' +
                  (idx === activeIndex ? ' active' : '') +
                  (o.value === '__CLEAR__' ? ' danger' : '')
                }
                onMouseDown={(e) => { e.preventDefault(); commitSelection(o); }}
                onMouseEnter={() => setActiveIndex(idx)}
                title={o.label}
              >
                {o.label}
              </li>
            ))
          ) : (
            <li className="combo-empty">No matches</li>
          )}
        </ul>
      )}
    </div>
  );
}
