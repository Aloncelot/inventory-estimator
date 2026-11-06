// src/lib/nav.js
// Jump between pages with something to show there (e.g. one material in the
// inventory or in the price list). The shell listens for the event and
// switches the page; the page then takes its focus once.
'use client';

let pending = null;

export function goTo(page, focus = null) {
  pending = focus ? { page, ...focus } : null;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('app:navigate', { detail: { page } }));
}

/** The focus left for this page, if any (read once). */
export function takeFocus(page) {
  if (!pending || pending.page !== page) return null;
  const f = pending;
  pending = null;
  return f;
}
