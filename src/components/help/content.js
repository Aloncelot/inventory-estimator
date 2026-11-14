// src/components/help/content.js
// The Help pages. One topic per page of the app (`page` is its sidebar key),
// each split into sections. A block is a paragraph (string), a list
// ({ ul: [...] }), ordered steps ({ ol: [...] }) or a tip ({ tip: '...' }).

export const HELP = [
  {
    id: 'start', title: 'Getting started',
    intro: 'Estimate Hub takes a framing job from the plan PDFs to a quote, and then to the warehouse that supplies it.',
    sections: [
      { id: 'flow', title: 'How a job goes through it', body: [
        { ol: [
          'Create the project in Projects and fill in its information: client, dates, status and who is estimating it.',
          'Attach the plans in Plan takeoff, set the scale and check the walls the app detects.',
          'Review the Wall panels, Loose material and Trusses pages, then the Labor.',
          'Check the Summary and the Quote, run a quality review and send it.',
          'When the job is won, reserve the stock from the Takeoff list and order what is missing.',
        ] },
      ] },
      { id: 'sidebar', title: 'The sidebar', body: [
        'Pages that need a project stay greyed out until one is open. The arrows at the top undo and redo changes in the open project.',
        'Collapse the sidebar with the button next to the logo to get more room on the plans. When collapsed, the names show on hover.',
        { tip: 'Ctrl+S (Cmd+S on a Mac) saves the open project at any time.' },
      ] },
      { id: 'themes', title: 'Themes', body: [
        'Pick a theme at the bottom of the sidebar. Your choice is kept in this browser.',
        { ul: [
          'Light: a bright theme for daylight and printing.',
          'Quasar: the dark theme with neon accents.',
          'Graphite: a quiet dark theme with grey-blue surfaces and one blue accent.',
        ] },
      ] },
      { id: 'calculator', title: 'Calculator', body: [
        'The Calculator switch in the sidebar opens a floating calculator. It stays open while you change pages.',
      ] },
    ],
  },
  {
    id: 'projects', title: 'Projects', page: 'project',
    intro: 'The list of every estimate in the company, with the information that tells the team where each one stands.',
    sections: [
      { id: 'create', title: 'Create and open a project', body: [
        'Use New project, give it a name and open it. Opening a project makes it the current one for every other page.',
      ] },
      { id: 'info', title: 'Project information', body: [
        'Each project keeps its client, address, the date the plans came in, the bid due date, the job start date, status, priority and the estimators working on it.',
        { ul: [
          'Status: Not started, Estimating, Sent, On hold, Won, Lost, Cancelled or Done. A lost job asks for the reason so the company can see why bids are lost.',
          'Priority: Low, Normal, High or Urgent, each with its own color in the list.',
          'Clients come from a shared list; pick one or add a new one.',
          'Sent to: who received the estimate and at which email.',
        ] },
        'Admins can change the information of a project even while someone else is editing it; the estimate itself is not touched.',
      ] },
      { id: 'presence', title: 'Who has it open', body: [
        'The avatars at the bottom of the sidebar show who else has the project open. Hover to see names; click to keep the list open.',
        'Only one person edits at a time. The others see it in view only, with a banner that says who is editing. Take over switches the current editor to view only, after saving what they had.',
        'If someone saves while you had the project open, a banner offers to load their version or keep yours.',
      ] },
    ],
  },
  {
    id: 'summary', title: 'Summary', page: 'summary',
    intro: 'The totals of the open project at a glance.',
    sections: [
      { id: 'totals', title: 'Totals', body: [
        'Material, labor, trucking and the grand total, by level and for the whole job. The rate per square foot divides the grand total by the project square footage.',
      ] },
      { id: 'buffer', title: 'Error buffer', body: [
        'A percentage added to the material to cover waste and takeoff error. It starts at 10% and is set separately for wall panels and for loose material.',
      ] },
    ],
  },
  {
    id: 'plans', title: 'Plan takeoff', page: 'plans',
    intro: 'Measure the walls straight from the plan PDF. What you trace here feeds the wall panels and loose material of each level.',
    sections: [
      { id: 'attach', title: 'Attach the plans', body: [
        'Choose the PDF for the level and the sheet that shows it. A separate structural sheet can be attached to the same level. Files are stored with the company, so everyone on the team opens the same plans.',
      ] },
      { id: 'scale', title: 'Set the scale', body: [
        { ol: [
          'Pick Calibrate.',
          'Click both ends of a dimension you know on the sheet.',
          'Type its real length.',
        ] },
        { tip: 'Calibrate on the longest dimension you can find; a short one multiplies any click error.' },
      ] },
      { id: 'detect', title: 'Detect walls', body: [
        'Detect walls finds the walls on the sheet using the scale and the line styles. Run it again after changing the scale: it keeps the walls you drew, changed or deleted.',
      ] },
      { id: 'tools', title: 'Tools', body: [
        { ul: [
          'Select: pick walls to change their type, height or delete them.',
          'Add wall: draw a wall the detection missed.',
          'Add opening: click both sides of a window or door on a wall.',
          'Add post and Add hardware: place what the structural plans show (posts, hold-downs, straps).',
          'Blocking: draw blocking runs for bathrooms, kitchens, stair railings or other.',
          'Floor opening: mark a stair, shaft or open-to-below so it comes off the subfloor.',
        ] },
      ] },
    ],
  },
  {
    id: 'wallpanels', title: 'Wall panels', page: 'wallpanels',
    intro: 'The panels of each level, built from the plan takeoff, with their material and manufacture.',
    sections: [
      { id: 'walls', title: 'Walls and panels', body: [
        'Each wall carries its height, stud size and spacing, plates and sheathing. Openings add their headers, king and jack studs, sills and cripples.',
      ] },
      { id: 'material', title: 'Material', body: [
        'Plates, studs, sheathing, blocking, nails and bracing are counted per wall. Material sold by the linear foot, such as LVL and LSL, is priced by the foot; sawn lumber is priced in whole boards of the length you pick.',
      ] },
      { id: 'trucking', title: 'Trucking', body: [
        'Enter how many panels fit on a truck, the flat charge per trip, the rate per mile and the distance. Trips are worked out from the panel count.',
      ] },
    ],
  },
  {
    id: 'loose', title: 'Loose material', page: 'loose',
    intro: 'Everything that is not in a panel: subfloor, roof framing, fire blocking, stairs and the like.',
    sections: [
      { id: 'sections', title: 'Sections', body: [
        'Material is grouped in sections per level. Add rows from the price list and set the quantity, or let the plan takeoff fill them.',
      ] },
      { id: 'stairs', title: 'Stairs', body: [
        'Describe each flight and its landings. The app works out the stringers, treads, landing joists, ledgers, hangers and the rail blocking, and checks the riser and tread against the IRC.',
        'Stringers longer than 12 feet use LVL instead of SPF, priced by the linear foot.',
        { tip: 'Labor for stairs is added on its own in the Labor page.' },
      ] },
    ],
  },
  {
    id: 'trusses', title: 'Trusses', page: 'trusses',
    intro: 'Trusses quoted by the supplier, carried into the estimate.',
    sections: [
      { id: 'entry', title: 'Entering trusses', body: [
        'Add the trusses from the supplier quote per level. They are carried into the totals and the quote.',
      ] },
    ],
  },
  {
    id: 'layout', title: 'Layout check', page: 'layout',
    intro: 'A visual check of the walls traced on each level before you price them.',
    sections: [
      { id: 'use', title: 'What to look for', body: [
        'Check that no wall is missing, doubled or of the wrong type before pricing. Fix what you find in Plan takeoff.',
      ] },
    ],
  },
  {
    id: 'items', title: 'Price list', page: 'items',
    intro: 'The company price list: every material, how it is sold and what each supplier charges.',
    sections: [
      { id: 'families', title: 'Families and items', body: [
        'Materials are grouped in families (studs, plates, sheathing, engineered lumber…). Each item says how it is sold: each, bundle, MBF or linear foot.',
      ] },
      { id: 'vendors', title: 'Suppliers and prices', body: [
        'An item can have a price from several suppliers. The estimate uses the supplier you choose for it.',
        'Prices change here, by an estimator. When the warehouse receives material at a price more than 5% off the list, the estimators are asked to review it.',
      ] },
      { id: 'markup', title: 'Markup', body: [
        'The list holds costs. The markup is applied in each estimate, so the same list serves every job.',
      ] },
    ],
  },
  {
    id: 'labor', title: 'Labor', page: 'labor',
    intro: 'Hours and cost for building the panels and installing the job.',
    sections: [
      { id: 'tasks', title: 'Tasks and rates', body: [
        'Each task has a time per unit, the crew size and an efficiency. The hours come from the quantities in the estimate.',
      ] },
      { id: 'stairs', title: 'Stairs', body: [
        'Each flight and each landing adds its own time. A U-shaped stair with its landing takes a crew about three hours.',
      ] },
    ],
  },
  {
    id: 'takeoff', title: 'Takeoff list', page: 'takeoff',
    intro: 'The full material list of the job, ready to send to the yard or to reserve in the warehouse.',
    sections: [
      { id: 'list', title: 'The list', body: [
        'Every item of the panels and the loose material, summed across levels, with the error buffer included.',
      ] },
      { id: 'reserve', title: 'Reserve stock', body: [
        'Reserve stock sets the material aside in the warehouse for this job. What the warehouse does not have shows as short, so it can be ordered in time.',
      ] },
    ],
  },
  {
    id: 'quote', title: 'Quote', page: 'quote',
    intro: 'What the client sees: the price of the job, with the markup and tax applied.',
    sections: [
      { id: 'build', title: 'Building the quote', body: [
        'Material markup, tax by state, labor, trucking and trusses add up to the price. Set the markup and the tax per project.',
      ] },
      { id: 'quality', title: 'Quality review', body: [
        'Before a bid goes out, automatic checks look for missing materials, zero prices and similar slips. Then ask a colleague to review it; the review stays with the project.',
      ] },
      { id: 'print', title: 'Printing and sending', body: [
        'Print the quote or save it as a PDF from the browser. Mark the project as Sent and record who it went to.',
      ] },
    ],
  },
  {
    id: 'history', title: 'Revisions', page: 'history',
    intro: 'Every bid you sent, frozen as it was, and the changes requested after it.',
    sections: [
      { id: 'revisions', title: 'Revisions', body: [
        'Save a revision when a bid goes out. Compare any two revisions by quantity and by price to see what changed and why the total moved.',
      ] },
      { id: 'changes', title: 'Change orders', body: [
        'A change after the bid goes in as a change order. An admin approves or rejects it, and the team is notified.',
      ] },
      { id: 'history', title: 'History', body: [
        'The project history lists who saved what and when.',
      ] },
    ],
  },
  {
    id: 'inventory', title: 'Inventory', page: 'inventory',
    intro: 'The warehouse: stock on hand, what is set aside for jobs and what needs ordering.',
    sections: [
      { id: 'stock', title: 'Stock', body: [
        'Stock per item with its minimum. Items below the minimum are flagged, and To order takes you to the purchase orders.',
      ] },
      { id: 'receive', title: 'Receiving material', body: [
        'Receive as the invoice reads: bundles, MBF or pieces. The app works out the pieces and the cost of each. Pick the supplier; a price more than 5% off the list asks an estimator to review it.',
      ] },
      { id: 'reservations', title: 'Reservations', body: [
        'Jobs reserve their material from the Takeoff list. Stock goes first to the job that starts first; shortages show before they reach the site.',
      ] },
      { id: 'orders', title: 'Purchase orders', body: [
        'What is short plus what brings each item back to its minimum, grouped into one draft order per supplier. Edit the quantities, then send and receive against it.',
      ] },
      { id: 'moves', title: 'Movements', body: [
        'Every receipt, issue, transfer and count in one log, with who did it and when.',
      ] },
    ],
  },
  {
    id: 'team', title: 'Company & team', page: 'team',
    intro: 'Who is in the company and what each person can do.',
    sections: [
      { id: 'roles', title: 'Roles', body: [
        { ul: [
          'Admin: members, invitations and company settings; approves change orders.',
          'Estimator: creates and edits estimates, templates and price lists.',
          'Warehouse: stock, receipts, reservations and orders.',
        ] },
        'A person can hold more than one role. Anyone without a role can see projects but not change them.',
      ] },
      { id: 'invite', title: 'Inviting people', body: [
        'Admins invite by email. The invitation links to Estimate Hub; the person signs in with that email and joins the company.',
      ] },
    ],
  },
  {
    id: 'about', title: 'About',
    intro: 'Estimate Hub is built and maintained by QuasarDevs.',
    sections: [
      { id: 'who', title: 'Who made it', body: [
        { about: true },
        'QuasarDevs is the studio of Alonso Correa, a full-stack developer who spent years estimating wall panels for residential framing. Estimate Hub follows the way that work is really done: from the plans to the takeoff, the quote, and the warehouse that supplies the job.',
      ] },
      { id: 'contact', title: 'Contact and feedback', body: [
        'Found a mistake, or missing something your shop needs? Send it over; requests from people who use it every day shape what comes next.',
        { links: [['QuasarDevs website', 'https://quasardevs.com'], ['GitHub', 'https://github.com/Aloncelot']] },
      ] },
      { id: 'built', title: 'Built with', body: [
        'Next.js and React for the app, Firebase for sign-in, data and plan files, and PDF.js to read the plans in the browser.',
      ] },
    ],
  },
];

export const helpTopic = (id) => HELP.find((t) => t.id === id) || HELP[0];
export const topicForPage = (page) => HELP.find((t) => t.page === page)?.id || 'start';

// plain text of a topic, for search
export function topicText(t) {
  const parts = [t.title, t.intro];
  for (const s of t.sections) {
    parts.push(s.title);
    for (const b of s.body) {
      if (typeof b === 'string') parts.push(b);
      else parts.push(...(b.ul || b.ol || []), b.tip || '', ...(b.links || []).map(([l]) => l), b.about ? 'quasardevs quasar devs alonso correa' : '');
    }
  }
  return parts.join(' ').toLowerCase();
}
