// src/hooks/useLocalStorageJson.js
'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Persist a JSON-serializable value to localStorage.
 * - Loads once on mount
 * - Saves (debounced) whenever the value changes
 */
export function useLocalStorageJson(key, initialValue) {
  const [state, setState] = useState(initialValue);
  const loadedRef = useRef(false);

  // load once
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
      if (raw != null) setState(JSON.parse(raw));
    } catch {
      // ignore parse errors
    }
    loadedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // save with a small debounce (reduces writes while typing)
  useEffect(() => {
    if (!loadedRef.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch {
        /* ignore quota errors */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [key, state]);

  return [state, setState];
}
