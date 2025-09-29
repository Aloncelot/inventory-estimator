'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

// Keyboard-friendly, searchable combobox.
// Props:
// - value: string | undefined
// - onChange: (value) => void
// - options: Array<{ value: string, label: string }>
// - placeholder?: string
// - disabled?: boolean
// - loading?: boolean
// - ariaLabel?: string
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

  // Current label (for controlled value)
  const selected = useMemo(
    () => options.find(o => o.value === value) || null,
    [options, value]
  );

  // Filter by label (case-insensitive, accent-insensitive if you wish to add)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Ensure activeIndex is in bounds when the list changes
  useEffect(() => {
    if (!filtered.length) setActiveIndex(-1);
    else if (activeIndex < 0 || activeIndex >= filtered.length) setActiveIndex(0);
  }, [filtered, activeIndex]);

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

  // When opening, prefill the input with the selected label for quick refine
  useEffect(() => {
    if (!open) return;
    // If user hasn’t typed, show current selection (if any)
    if (!query && selected) {
      setQuery(selected.label);
      // Put cursor at end
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (input) input.setSelectionRange(input.value.length, input.value.length);
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleInputFocus() {
    if (disabled) return;
    setOpen(true);
  }

  function handleInputChange(e) {
    setQuery(e.target.value);
    if (!open) setOpen(true);
  }

  function commitSelection(opt) {
    onChange && onChange(opt.value);
    setOpen(false);
    setQuery(''); // clear so it shows the selected label when closed
  }

  function onKeyDown(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!filtered.length) return;
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!filtered.length) return;
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length && activeIndex >= 0) {
        commitSelection(filtered[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
    }
  }

  const displayText = open
    ? query
    : (selected?.label ?? '');

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
        <ul 
        id={listId} 
        role="listbox" 
        className="combo-list">
          {loading ? (
            <li className="combo-empty">Loading…</li>
          ) : filtered.length ? (
            filtered.map((o, idx) => (
              <li
                key={o.value}
                role="option"
                aria-selected={value === o.value}
                className={'combo-option' + (idx === activeIndex ? ' active' : '')}
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
