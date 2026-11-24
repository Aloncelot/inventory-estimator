// src/components/landing/Landing.jsx
// The public page at /: what Nebula Estimator does, how a job goes through it,
// what each plan costs. The estimator itself lives at /app.
// The hero is a wall panel in three.js (HeroWall); "how it works" puts a
// house together on its own (HouseAssembly); behind everything, a forest
// and its mountains turn slightly as you scroll (ForestBackdrop).
'use client';

import { useState } from 'react';
import { Nav, Footer } from './Chrome';
import HeroWall from './HeroWall';
import HouseAssembly from './HouseAssembly';
import CookieConsent from './CookieConsent';
import ForestBackdrop from './ForestBackdrop';
import { PLANS, ANNUAL_DISCOUNT, TRIAL_DAYS, priceFor } from './plans';

const STEPS = [
  ['Attach the plans', 'Drop in the floor plans and the structural sheet as PDFs. Everyone on the team opens the same files.'],
  ['Trace the walls', 'Walls are detected on the plan and measured to scale. Headers, shear walls and hardware come from the structural sheet.'],
  ['Price the job', 'Wall panels by level, loose material, stairs, trucking and labor, priced from your own suppliers.'],
  ['Send the quote', 'A clean quote for your sales team. Every revision is kept, and change orders go to an admin for approval.'],
  ['Supply it', 'Reserve the lumber in your warehouse for the job and turn what is missing into purchase orders.'],
];

const FEATURES = [
  {
    title: 'Estimating',
    items: [
      ['Takeoff from the PDF', 'Wall detection with a scale you set once per sheet; you check, adjust and move on.'],
      ['Wall panels the way you build them', 'Plates, studs, sheathing, blocking, nails, bracing and manufacture rates per linear foot.'],
      ['Loose material and stairs', 'Subfloor, roof framing, landings and stringers, with IRC riser and tread checks.'],
      ['Engineered lumber by the foot', 'LVL, LSL and rim board priced per LF; sawn lumber in whole boards of the length you pick.'],
      ['Labor that matches the crew', 'Times per task, crew size and efficiency, so the hours on the quote are hours you can staff.'],
      ['Margins you control', 'Error buffer and material markup per project, tax by state, and the price per square foot at a glance.'],
    ],
  },
  {
    title: 'Team and approvals',
    items: [
      ['Roles', 'Admins run the company, estimators price the work, the warehouse keeps the stock. People can hold more than one.'],
      ['One editor at a time', 'See who has a project open. Nobody overwrites anybody; taking over is one click.'],
      ['Revisions and change orders', 'Freeze each bid, compare by quantity and by price, and send change orders to an admin to approve.'],
      ['Quality review', 'Automatic checks for missing materials and zero prices, then a colleague signs off before the bid goes out.'],
      ['Project tracking', 'Status, priority, bid due date, job start, client, and who the estimate went to.'],
    ],
  },
  {
    title: 'Warehouse and purchasing',
    items: [
      ['Stock by warehouse', 'Every receipt, issue, transfer and count in one log, with who did it and when.'],
      ['Receive as the invoice reads', 'Bundles, MBF or pieces: the app works out the pieces and the cost of each.'],
      ['Reservations by job start', 'The job that starts first gets the stock first. Shortages show before they reach the site.'],
      ['Purchase orders', 'What is short, plus what brings items back to their minimum, grouped into one order per supplier.'],
      ['Your own price list', 'Your suppliers and prices. A receipt that comes in 5% off the list asks an estimator to update it.'],
    ],
  },
];

const FAQ = [
  ['Do I need to install anything?', 'No. Nebula Estimator runs in the browser on any computer; sign in with a Google account.'],
  ['Does it read the plans by itself?', 'It finds the walls and the structural tags and measures them to scale. An estimator always checks the result: that is where the accuracy comes from.'],
  ['Can we use our own suppliers and prices?', 'Yes. Each company starts from a sample price list and makes it its own: suppliers, how each sells (each, bundle or MBF), and prices.'],
  ['What happens when the trial ends?', `After ${TRIAL_DAYS} days you choose a plan. Your projects, prices and stock stay where they are.`],
  ['Who can see our data?', 'Only the people your admin invites. Each company’s projects, prices and inventory are kept apart from every other company’s.'],
  ['Can we take our numbers elsewhere?', 'Takeoff lists export to CSV, and quotes, change orders and purchase orders print or save as PDF.'],
];

function Pricing() {
  const [annual, setAnnual] = useState(true);
  return (
    <section className="lp-sec lp-pricing" id="pricing" aria-labelledby="pricing-h">
      <div className="lp-wrap">
        <div className="lp-sec__head">
          <h2 id="pricing-h">Pricing for the whole company</h2>
          <p>One price per company, not per seat. View-only users are free on every plan, and every plan starts with a {TRIAL_DAYS}-day trial.</p>
          <div className="lp-billing" role="group" aria-label="Billing period">
            <button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>Monthly</button>
            <button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>Yearly, save {Math.round(ANNUAL_DISCOUNT * 100)}%</button>
          </div>
        </div>
        <div className="lp-plans">
          {PLANS.map((p) => (
            <article key={p.key} className={`lp-plan${p.featured ? ' is-featured' : ''}`} aria-labelledby={`plan-${p.key}`}>
              <h3 id={`plan-${p.key}`}>{p.name}</h3>
              <p className="lp-plan__for">{p.for}</p>
              <p className="lp-plan__price">
                <span className="n">${priceFor(p, annual)}</span>
                <span className="u">per month{annual ? ', billed yearly' : ''}</span>
              </p>
              <p className="lp-plan__users">{p.users} users with editing roles</p>
              <ul>
                {p.includes.map((x) => <li key={x}>{x}</li>)}
              </ul>
              <a className={`lp-btn${p.featured ? '' : ' lp-btn--line'}`} href="/app">Start the {TRIAL_DAYS}-day trial</a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="lp lp--forest">
      <ForestBackdrop />
      <Nav />
      <main>
        <section className="lp-hero" aria-labelledby="hero-h">
          <HeroWall />
          <div className="lp-wrap lp-hero__in">
            <div className="lp-hero__copy">
              <h1 id="hero-h">Estimates built the way you build walls.</h1>
              <p className="lp-lead">From the plan PDFs to a quote your sales team can send.</p>
              <div className="lp-cta">
                <a className="lp-btn" href="/app">Start the {TRIAL_DAYS}-day trial</a>
                <a className="lp-btn lp-btn--line" href="#how">See how a job goes through it</a>
              </div>
              <p className="lp-note">No card needed for the trial.</p>
            </div>
          </div>
        </section>

        <HouseAssembly steps={STEPS} />
        <div className="lp-vista" aria-hidden="true" />

        <section className="lp-sec lp-features" id="features" aria-labelledby="features-h">
          <div className="lp-wrap">
            <div className="lp-sec__head">
              <h2 id="features-h">What it covers</h2>
              <p>Made by a wall-panel estimator for the whole path of a job, from the takeoff to the purchase order.</p>
            </div>
            {FEATURES.map((g) => (
              <div key={g.title} className="lp-fgroup">
                <h3>{g.title}</h3>
                <dl>
                  {g.items.map(([t, d]) => (
                    <div key={t}><dt>{t}</dt><dd>{d}</dd></div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>

        <Pricing />
        <div className="lp-vista" aria-hidden="true" />

        <section className="lp-sec lp-faq" id="faq" aria-labelledby="faq-h">
          <div className="lp-wrap lp-faq__in">
            <h2 id="faq-h">Questions</h2>
            <div className="lp-faq__list">
              {FAQ.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-close" aria-labelledby="close-h">
          <div className="lp-wrap lp-close__in">
            <h2 id="close-h">Price your next job in Nebula Estimator.</h2>
            <a className="lp-btn" href="/app">Start the {TRIAL_DAYS}-day trial</a>
          </div>
        </section>
      </main>
      <Footer />
      <CookieConsent />
    </div>
  );
}
