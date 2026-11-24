// src/components/landing/Legal.jsx
// The privacy policy and the cookie policy, in the landing site's chrome.
// They describe what the app actually stores (src/lib/firebase.js, ai.js,
// localStorage keys). Have the owner's lawyer review them before launch,
// and update UPDATED when the text changes.
'use client';

import { Nav, Footer } from './Chrome';
import CookieConsent from './CookieConsent';
import { openConsent } from './consent';
import { QUASAR_URL } from '@/components/QuasarMark';

const UPDATED = 'November 24, 2026';

function Page({ title, children }) {
  return (
    <div className="lp">
      <Nav home={false} />
      <main className="lp-legal">
        <div className="lp-wrap lp-legal__in">
          <h1>{title}</h1>
          <p className="lp-legal__date">Last updated {UPDATED}</p>
          {children}
        </div>
      </main>
      <Footer />
      <CookieConsent />
    </div>
  );
}

const Contact = () => (
  <>Nebula Estimator is built and run by <a href={QUASAR_URL} target="_blank" rel="noopener noreferrer">Quasar Devs</a>; reach them through their site.</>
);

export function PrivacyPolicy() {
  return (
    <Page title="Privacy policy">
      <p>This page explains what Nebula Estimator collects when you visit this site and when your company uses the app, why, and the choices you have. <Contact /></p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Your Google account basics.</strong> When you sign in with Google we receive your name, email address and profile photo. We never see your Google password.</li>
        <li><strong>Your company’s work.</strong> Projects, plan PDFs, estimates, quotes, revisions, change orders, price lists, suppliers, inventory and purchase orders that your team enters.</li>
        <li><strong>Who did what.</strong> The app records who edited a project, who saved a revision, and who received, issued or moved stock, with the time, so your team can see its own history.</li>
        <li><strong>Assistant messages.</strong> If you use the assistant, your messages and the parts of the open estimate it needs are sent to Google’s Gemini model through Firebase AI Logic to produce an answer.</li>
      </ul>

      <h2>Where it is kept</h2>
      <p>Nebula Estimator runs on Google Firebase: Firebase Authentication for sign-in, Cloud Firestore for your data and Cloud Storage for plan files. Firebase App Check with Google reCAPTCHA Enterprise checks that requests come from the real app and not from bots. Google processes this data for us as a service provider.</p>

      <h2>Who can see it</h2>
      <p>Only the people your company’s admin invites, with the role the admin gives them. Each company’s projects, prices and inventory are kept apart from every other company’s. We do not sell your data, show ads or share it with advertisers.</p>

      <h2>How long we keep it</h2>
      <p>Your company’s data stays while your company uses Nebula Estimator. An admin can remove a team member at any time. To have your account or your company’s data deleted, contact Quasar Devs.</p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>Ask for a copy of your personal data, correct it, or have it deleted.</li>
        <li>Export your work: takeoff lists to CSV; quotes, change orders and purchase orders to PDF.</li>
        <li>Change your cookie choice at any time: <button type="button" className="lp-link" onClick={openConsent}>cookie settings</button>.</li>
      </ul>
      <p>Depending on where you live (for example under the GDPR or the CCPA) you may have further rights, including to object to processing or to complain to your data protection authority.</p>

      <h2>Changes</h2>
      <p>When this policy changes we update the date at the top of the page.</p>
    </Page>
  );
}

const STORAGE = [
  ['Firebase sign-in session', 'Necessary', 'Keeps you signed in to the app.', 'Google Firebase, in your browser’s storage', 'Until you sign out'],
  ['Firebase App Check token', 'Necessary', 'Proves requests come from the real app.', 'Google Firebase, in your browser’s storage', 'Renewed automatically'],
  ['_GRECAPTCHA', 'Necessary', 'Google reCAPTCHA Enterprise tells people from bots.', 'Google (google.com)', '6 months'],
  ['eh-consent', 'Necessary', 'Remembers your cookie choice.', 'Nebula Estimator, local storage', 'Until you clear it'],
  ['theme, ui-state, calc-open', 'Necessary', 'Remembers the theme, the page and the project you had open, and the calculator, as you set them in the app.', 'Nebula Estimator, local storage', 'Until you clear it'],
];

export function CookiePolicy() {
  return (
    <Page title="Cookie policy">
      <p>Nebula Estimator uses a few cookies and similar browser storage. All of them are needed for sign-in, security or settings you choose yourself. We run no advertising cookies and, today, no analytics.</p>

      <h2>What is stored</h2>
      <div className="lp-legal__table">
        <table>
          <thead>
            <tr><th scope="col">Name</th><th scope="col">Category</th><th scope="col">Purpose</th><th scope="col">Set by</th><th scope="col">Lasts</th></tr>
          </thead>
          <tbody>
            {STORAGE.map(([n, c, p, b, d]) => (
              <tr key={n}><th scope="row">{n}</th><td>{c}</td><td>{p}</td><td>{b}</td><td>{d}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Analytics</h2>
      <p>Off unless you turn it on. Nebula Estimator does not run analytics today; if it is added, it will only run for visitors who said yes.</p>

      <h2>Your choice</h2>
      <p>Necessary storage cannot be turned off without breaking sign-in. You can change everything else at any time in <button type="button" className="lp-link" onClick={openConsent}>cookie settings</button>, and you can clear all of it in your browser’s settings.</p>
    </Page>
  );
}
