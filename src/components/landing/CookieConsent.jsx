// src/components/landing/CookieConsent.jsx
// The cookie notice: shown until the visitor chooses, reopened from the
// footer. Two equal choices up front (accept or necessary only), and a
// settings view with one switch per category.
'use client';

import { useEffect, useRef, useState } from 'react';
import { readConsent, saveConsent, OPEN_EVENT } from './consent';

export default function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const panelRef = useRef(null);
  const returnTo = useRef(null);

  useEffect(() => {
    const saved = readConsent();
    if (!saved) setOpen(true);
    else setAnalytics(saved.analytics);
    const onOpen = () => {
      returnTo.current = document.activeElement;
      setAnalytics(readConsent()?.analytics || false);
      setDetail(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  // reopened from the footer: focus moves into the panel, Escape closes it
  useEffect(() => {
    if (!open || !detail) return;
    panelRef.current?.querySelector('input:not(:disabled), button')?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && readConsent()) close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, detail]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    setOpen(false);
    setDetail(false);
    returnTo.current?.focus?.();
  };
  const choose = (a) => { saveConsent({ analytics: a }); setAnalytics(a); close(); };

  if (!open) return null;
  return (
    <section ref={panelRef} className="lp-consent" role="region" aria-labelledby="consent-h">
      <h2 id="consent-h">Cookies on Nebula Estimator</h2>
      {!detail ? (
        <p>
          We store only what sign-in and bot protection need. Analytics stays off unless you turn it on.
          {' '}<a href="/cookies">How we use cookies</a>
        </p>
      ) : (
        <fieldset className="lp-consent__cats">
          <legend className="lp-sr">Cookie categories</legend>
          <label className="lp-switch">
            <input type="checkbox" checked disabled />
            <span className="lp-switch__track" aria-hidden="true" />
            <span><strong>Necessary</strong> Keeps you signed in, protects sign-in from bots (Google reCAPTCHA) and remembers this choice. Always on.</span>
          </label>
          <label className="lp-switch">
            <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
            <span className="lp-switch__track" aria-hidden="true" />
            <span><strong>Analytics</strong> Counts visits so we can improve the site. Not in use today; your choice applies if it is added.</span>
          </label>
        </fieldset>
      )}
      <div className="lp-consent__act">
        {detail ? (
          <button type="button" className="lp-btn" onClick={() => choose(analytics)}>Save my choice</button>
        ) : (
          <>
            <button type="button" className="lp-btn" onClick={() => choose(true)}>Accept all</button>
            <button type="button" className="lp-btn lp-btn--line" onClick={() => choose(false)}>Necessary only</button>
            <button type="button" className="lp-link" onClick={() => setDetail(true)}>Settings</button>
          </>
        )}
      </div>
    </section>
  );
}
