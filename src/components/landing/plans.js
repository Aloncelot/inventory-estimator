// src/components/landing/plans.js
// The plans shown on the landing page (one price per company). Change the
// prices here; the page and its yearly prices follow.

export const TRIAL_DAYS = 14;
export const ANNUAL_DISCOUNT = 0.15;

export const PLANS = [
  {
    key: 'estimator',
    name: 'Estimator',
    for: 'For a framer who prices the work and buys straight from suppliers.',
    monthly: 99,
    users: 2,
    includes: [
      'Plan takeoff from PDF',
      'Wall panels, loose material, stairs, labor',
      'Quotes and revisions',
      'Company price list and suppliers',
    ],
  },
  {
    key: 'shop',
    name: 'Shop',
    for: 'For a panel shop with a warehouse and a few estimators.',
    monthly: 249,
    users: 6,
    featured: true,
    includes: [
      'Everything in Estimator',
      'Inventory, reservations and purchase orders',
      'Change orders approved by an admin',
      'Quality review before a bid goes out',
    ],
  },
  {
    key: 'plant',
    name: 'Plant',
    for: 'For larger operations with several yards.',
    monthly: 449,
    users: 15,
    includes: [
      'Everything in Shop',
      'Several warehouses and yards',
      'Priority support',
      'Help moving your price list in',
    ],
  },
];

/** The price per month shown: monthly, or the yearly price per month. */
export const priceFor = (plan, annual) => (annual ? Math.round(plan.monthly * (1 - ANNUAL_DISCOUNT)) : plan.monthly);
