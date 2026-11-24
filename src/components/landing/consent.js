// src/components/landing/consent.js
// The visitor's cookie choice, kept in localStorage. Necessary storage
// (sign-in, bot protection, the choice itself) is always on. Analytics is
// off until the visitor turns it on; Nebula Estimator runs no analytics today,
// so anything added later must check hasConsent('analytics') first.

export const CONSENT_KEY = 'eh-consent';
export const CONSENT_VERSION = 1;
export const CONSENT_EVENT = 'eh:consent';
export const OPEN_EVENT = 'eh:consent-open';

export function readConsent() {
  try {
    const v = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');
    return v && v.version === CONSENT_VERSION ? v : null;
  } catch {
    return null;
  }
}

export function saveConsent({ analytics }) {
  const v = { version: CONSENT_VERSION, necessary: true, analytics: !!analytics, at: new Date().toISOString() };
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(v)); } catch { /* private mode: the banner asks again next time */ }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: v }));
  return v;
}

export const hasConsent = (category) => category === 'necessary' || !!readConsent()?.[category];

/** Opens the cookie settings from anywhere (the footer link). */
export const openConsent = () => window.dispatchEvent(new Event(OPEN_EVENT));
