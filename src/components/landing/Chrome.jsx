// src/components/landing/Chrome.jsx
// The landing site's nav and footer, shared by / and the privacy and cookie
// pages, plus the wordmark.
'use client';

import { useAuth } from '@/AuthContext';
import QuasarMark, { QUASAR_URL } from '@/components/QuasarMark';
import { openConsent } from './consent';
import NebulaMark from '@/components/NebulaMark';

export function Wordmark() {
  return (
    <a className="lp-logo" href="/" aria-label="Nebula Estimator home">
      <NebulaMark className="lp-logo__mark" size={30} />
      <span>Nebula Estimator</span>
    </a>
  );
}

export function Nav({ home = true }) {
  const { user } = useAuth() || {};
  const at = (hash) => (home ? hash : `/${hash}`);
  return (
    <header className="lp-nav">
      <div className="lp-wrap lp-nav__in">
        <Wordmark />
        <nav aria-label="Page">
          <a href={at('#how')}>How it works</a>
          <a href={at('#features')}>Features</a>
          <a href={at('#pricing')}>Pricing</a>
          <a href={at('#faq')}>FAQ</a>
        </nav>
        <a className="lp-btn lp-btn--line lp-btn--sm" href="/app">{user ? 'Open Nebula Estimator' : 'Sign in'}</a>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="lp-foot">
      <div className="lp-wrap lp-foot__in">
        <div className="lp-foot__brand">
          <Wordmark />
          <span className="lp-foot__copy">© {new Date().getFullYear()} Nebula Estimator</span>
        </div>
        <nav className="lp-foot__links" aria-label="Footer">
          <a href="/#pricing">Pricing</a>
          <a href="/app">Sign in</a>
          <a href="/privacy">Privacy</a>
          <a href="/cookies">Cookies</a>
          <button type="button" className="lp-link" onClick={openConsent}>Cookie settings</button>
        </nav>
        <a className="lp-built" href={QUASAR_URL} target="_blank" rel="noopener noreferrer">
          <span>Built by</span>
          <QuasarMark style={{ height: 44 }} />
          <span className="quasar-word">QUASAR <b>DEVS</b></span>
        </a>
      </div>
    </footer>
  );
}
