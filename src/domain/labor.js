// src/domain/labor.js
// Labor of a project, by time: every task is a quantity the estimate already
// has (panels, windows, doors, hold-downs, floor joists and sheets, roof
// trusses and sheets) times the crew minutes it takes, times the factor of the
// level it is built on (higher is slower: lifting, scaffolds, ladders). Hours
// become cost with what the company pays per worker-hour (plus the burden), and
// the bill is that cost plus the company's markup. Per sq ft of floor is the
// other way to price it, shown side by side. Every time and rate is the company's own: the defaults are a start,
// kept per project and in templates.
//
// Times are crew minutes for the reference crew (5 by default): the time the
// whole crew spends per unit. Worker-hours = crew minutes × reference crew / 60,
// so they do not change with the crew size; days do (a bigger crew finishes
// sooner). Pure functions.

import { wallPanelsOf, looseOf, sectionKind } from './estimate';
import { hardwareCounts } from './plans/hardware';
import { levelAreas } from './estimate/trusses';

const n = (v) => Number(v) || 0;
const r2 = (v) => Math.round(v * 100) / 100;

export const LABOR_DEFAULTS = {
  crew: 5, // people in the framing crew
  refCrew: 5, // crew the times below are for
  hoursPerDay: 8,
  payRate: 30, // paid per worker-hour
  burdenPct: 0, // taxes, insurance, benefits on top of pay (25–40% for employees)
  markupPct: 80, // the company's markup over what the labor costs it (renovation: ~100%)
  priceBy: 'time', // what Summary takes: 'time' or 'sqft'
  sqftRate: 9, // the other way to price it: per sq ft of floor (labor only: about $4–10 in the US, $13–18 Northeast union)
  efficiencyPct: 70, // share of the day spent on the tasks below (the rest: start-up, moving material, crane waits, weather)
  windowsBy: 'installers', // 'installers' (dedicated) or 'crew'
  installers: 2,
  installerPayRate: 30,
  levelFactors: [1, 1.1, 1.2, 1.3],
  roofExtra: 0.1, // the roof: the top level's factor plus this
  times: {
    panel: 8, // crew min per panel up to the height below, no sheathing
    sheathedPct: 25, // + % for a sheathed panel (exterior and shear walls)
    tallFromFt: 10,
    tallPctPerFt: 10, // + % per foot of wall above that height
    windowInstallers: 30, // min per window, dedicated installers (their team)
    windowCrew: 60, // crew min per window, when the framing crew installs them
    door: 45, // crew min per exterior door
    hardware: 10, // crew min per hold-down / tie-down / strap from the plan
    floorJoist: 3, // crew min per 10 LF of joists and I-joists
    floorTruss: 6, // crew min per floor truss
    subfloorSheet: 4, // crew min per subfloor sheet (glue and nail)
    roofTruss: 10, // crew min per roof truss (set, brace, tie down)
    rafter: 12, // crew min per rafter (stick roof)
    roofSheet: 4, // crew min per roof sheathing sheet
    sillPlate: 6, // crew min per 10 LF of sill plate on concrete (sealer, anchors, plate)
    topPlate: 2, // crew min per 10 LF of loose top plate (lap and tie the panels)
    plumbBrace: 3, // crew min per panel to plumb, line and brace
    blocking: 4, // crew min per 10 LF of loose blocking
    post: 10, // crew min per post / column on the plan
    beam: 8, // crew min per 10 LF of beam (LVL, built-up)
    stair: 240, // crew min per stair flight
    setupDays: 0.5, // crew days per level: set-up, crane, cleanup
    punchListPct: 10, // + % of the crew's hours for the punch list
  },
};

/** The project's labor settings over the defaults. */
export function laborSettings(labor = {}) {
  return {
    ...LABOR_DEFAULTS,
    ...labor,
    times: { ...LABOR_DEFAULTS.times, ...(labor.times || {}) },
    levelFactors: Array.isArray(labor.levelFactors) && labor.levelFactors.length ? labor.levelFactors : LABOR_DEFAULTS.levelFactors,
  };
}

/** Factor of the level at index i (0 = first): past the list, + 0.1 a level. */
export function levelFactor(s, i) {
  const f = s.levelFactors;
  if (i < f.length) return n(f[i]) || 1;
  return r2((n(f[f.length - 1]) || 1) + 0.1 * (i - f.length + 1));
}

const PANEL_LEN_KEY = { exterior: 'exteriorWalls', bearing: 'interiorBlockingOnly', shear: 'interiorShear', partition: 'interiorNonLoad', knee: 'kneeWall' };
const KIND_NAME = { exterior: 'Exterior', bearing: 'Bearing', shear: 'Shear', partition: 'Partition', knee: 'Knee' };

/**
 * Every task of the project with its quantity and time.
 * @returns {{tasks:Array, totals:object, settings:object}}
 */
const cache = new WeakMap();
export function computeLabor(est = {}) {
  // the estimate is immutable: one calculation per version (Labor and Summary share it)
  if (est && typeof est === 'object' && cache.has(est)) return cache.get(est);
  const out = computeLaborNow(est);
  if (est && typeof est === 'object') cache.set(est, out);
  return out;
}

function computeLaborNow(est = {}) {
  const s = laborSettings(est.labor);
  const t = s.times;
  const qty = est.labor?.qty || {}; // quantities typed over the estimate's
  const tasks = [];
  const add = (task) => {
    const auto = n(task.auto);
    const typed = qty[task.key] !== undefined && qty[task.key] !== null && qty[task.key] !== '';
    const q = typed ? n(qty[task.key]) : auto;
    const team = task.team || 'crew';
    const teamSize = team === 'installers' ? Math.max(1, n(s.installers) || 1) : Math.max(1, n(s.refCrew) || 5);
    const minutes = q * n(task.min) * n(task.factor || 1); // team minutes
    // the days are not all on the tasks: their hours over the share that is
    const eff = task.noEfficiency ? 1 : Math.min(1, Math.max(0.2, n(s.efficiencyPct) / 100 || 1));
    const workerHours = (minutes * teamSize) / 60 / eff;
    tasks.push({ ...task, qty: q, auto, typed, team, minutes, workerHours });
  };

  // walls: panels by level and wall type; windows, doors, hardware
  const wp = wallPanelsOf(est);
  const lens = est.manufactureEstimate?.panelLenByKey || {};
  const levels = (est.levels || []).filter(Boolean);
  let panels = 0;
  let wallLF = 0;
  wp.levels.forEach((L, i) => {
    const lvl = levels[i] || {};
    const name = lvl.name || `Level ${i + 1}`;
    const factor = levelFactor(s, i);
    const byKind = new Map();
    for (const sec of [...L.exterior, ...L.interior]) {
      const st = sec.stats || {};
      const lf = n(st.lengthLF);
      if (!lf) continue;
      const kind = st.kind || 'partition';
      const len = n(lens[PANEL_LEN_KEY[kind]]) || 8;
      const count = Math.ceil(lf / Math.max(1, len));
      const sheathed = kind === 'exterior' || kind === 'shear';
      const tall = Math.max(0, n(st.heightFt) - n(t.tallFromFt));
      const each = n(t.panel) * (1 + (sheathed ? n(t.sheathedPct) / 100 : 0)) * (1 + (tall * n(t.tallPctPerFt)) / 100);
      const g = byKind.get(kind) || { count: 0, mins: 0, lf: 0 };
      g.count += count; g.mins += count * each; g.lf += lf;
      byKind.set(kind, g);
    }
    let lvlPanels = 0, lvlLF = 0;
    for (const [kind, g] of byKind) {
      panels += g.count; wallLF += g.lf; lvlPanels += g.count; lvlLF += g.lf;
      add({ key: `panels|${lvl.id || i}|${kind}`, group: 'Walls', level: name, levelIndex: i, label: `${KIND_NAME[kind] || kind} panels`, unit: 'panels', auto: g.count, min: g.count ? g.mins / g.count : n(t.panel), factor, hint: `${Math.round(g.lf)} LF` });
    }
    const id = lvl.id || i;
    if (lvlPanels) {
      add({ key: `plumb|${id}`, group: 'Walls', level: name, levelIndex: i, label: 'Plumb, line and brace', unit: 'panels', auto: lvlPanels, min: t.plumbBrace, factor });
      add({ key: `topPlate|${id}`, group: 'Walls', level: name, levelIndex: i, label: 'Loose top plate', unit: '10 LF', auto: Math.ceil(lvlLF / 10), min: t.topPlate, factor });
    }
    const blkLF = n(L.loose?.stats?.blockingLF);
    if (blkLF) add({ key: `blocking|${id}`, group: 'Walls', level: name, levelIndex: i, label: 'Loose blocking', unit: '10 LF', auto: Math.ceil(blkLF / 10), min: t.blocking, factor });
    const posts = (lvl.plan?.walls || []).reduce((a, w) => a + (w.posts || []).length, 0);
    if (posts) add({ key: `posts|${id}`, group: 'Walls', level: name, levelIndex: i, label: 'Posts and columns', unit: 'pcs', auto: posts, min: t.post, factor });
    add({ key: `stairs|${id}`, group: 'Stairs', level: name, levelIndex: i, label: 'Stair flights', unit: 'flights', auto: 0, min: t.stair, factor, typedOnly: true });
    add({ key: `setup|${id}`, group: 'Site', level: name, levelIndex: i, label: 'Set-up, crane and cleanup', unit: 'crew days', auto: n(t.setupDays), min: n(s.hoursPerDay || 8) * 60, factor: 1, noEfficiency: true });
    const windows = [...L.exterior, ...L.interior].reduce((a, x) => a + n(x.stats?.windows), 0);
    const doors = L.exterior.reduce((a, x) => a + n(x.stats?.doors), 0);
    const byInstallers = s.windowsBy !== 'crew';
    if (windows) add({ key: `windows|${lvl.id || i}`, group: 'Windows & doors', level: name, levelIndex: i, label: byInstallers ? 'Windows (installers)' : 'Windows (framing crew)', unit: 'windows', auto: windows, min: byInstallers ? t.windowInstallers : t.windowCrew, factor, team: byInstallers ? 'installers' : 'crew' });
    if (doors) add({ key: `doors|${lvl.id || i}`, group: 'Windows & doors', level: name, levelIndex: i, label: 'Exterior doors', unit: 'doors', auto: doors, min: t.door, factor });
    const hw = lvl.plan ? [...hardwareCounts(lvl.plan).values()].reduce((a, v) => a + n(v), 0) : 0;
    if (hw || qty[`hardware|${lvl.id || i}`] !== undefined) add({ key: `hardware|${lvl.id || i}`, group: 'Walls', level: name, levelIndex: i, label: 'Hold-downs and hardware', unit: 'pcs', auto: hw, min: t.hardware, factor });
  });

  // floors and roof from Loose material; trusses are typed (the Trusses page has amounts only)
  const loose = looseOf(est);
  const list = (est.looseList || []).filter(Boolean);
  const levelIndexOf = (sec, k) => {
    const nm = String(sec.name || '').toLowerCase();
    const i = levels.findIndex((l) => l.name && nm.includes(String(l.name).toLowerCase()));
    if (i >= 0) return i;
    const m = /(\d+)/.exec(nm);
    return m ? Math.max(0, Number(m[1]) - 1) : k;
  };
  let floorNo = 0;
  for (const sec of list) {
    if (sec.isHidden) continue;
    const kind = sectionKind(sec);
    const c = loose.byId[sec.id];
    if (!c) continue;
    // what is installed, before the waste of the material order
    const pcs = (types) => (c.manualRows || []).filter((r) => types.includes(r.calcType)).reduce((a, r) => a + n(r.qtyRaw), 0);
    const lfOf = (types) => (c.manualRows || []).filter((r) => types.includes(r.calcType)).reduce((a, r) => a + n(r.inputs?.lengthLF), 0);
    if (kind === 'foundation') {
      const inp = sec.inputs || {};
      const sLF = n(inp.planFoamLF != null && !inp.foundationManual ? inp.planFoamLF : inp.foundationLF);
      const name = levels[0]?.name || 'Level 1';
      add({ key: `sill|${sec.id}`, group: 'Walls', level: name, levelIndex: 0, label: 'Sill plates and anchors', unit: '10 LF', auto: Math.ceil(sLF / 10), min: t.sillPlate, factor: levelFactor(s, 0) });
    } else if (kind === 'level') {
      const i = levelIndexOf(sec, floorNo += 1);
      const factor = levelFactor(s, i);
      const name = sec.name || `Floor ${floorNo}`;
      add({ key: `floorJoists|${sec.id}`, group: 'Floor', level: name, levelIndex: i, label: 'Joists and I-joists', unit: '10 LF', auto: Math.ceil(lfOf(['joist', 'ijoist']) / 10), min: t.floorJoist, factor });
      add({ key: `floorTrusses|${sec.id}`, group: 'Floor', level: name, levelIndex: i, label: 'Floor trusses', unit: 'pcs', auto: 0, min: t.floorTruss, factor, typedOnly: true });
      add({ key: `subfloor|${sec.id}`, group: 'Floor', level: name, levelIndex: i, label: 'Subfloor sheets', unit: 'sheets', auto: Math.ceil(pcs(['subfloor'])), min: t.subfloorSheet, factor });
      const bLF = lfOf(['beam']);
      if (bLF) add({ key: `beams|${sec.id}`, group: 'Floor', level: name, levelIndex: i, label: 'Beams', unit: '10 LF', auto: Math.ceil(bLF / 10), min: t.beam, factor });
    } else if (kind === 'roof') {
      const top = Math.max(0, levels.length - 1);
      const factor = r2(levelFactor(s, top) + n(s.roofExtra));
      const name = sec.name || 'Roof';
      const row = (key) => (c.calcRows || []).find((r) => r.key === key);
      add({ key: `roofTrusses|${sec.id}`, group: 'Roof', level: name, levelIndex: top + 1, label: 'Roof trusses', unit: 'pcs', auto: 0, min: t.roofTruss, factor, typedOnly: true });
      add({ key: `rafters|${sec.id}`, group: 'Roof', level: name, levelIndex: top + 1, label: 'Rafters', unit: 'pcs', auto: n(row('rafter')?.qtyRaw), min: t.rafter, factor });
      add({ key: `roofSheets|${sec.id}`, group: 'Roof', level: name, levelIndex: top + 1, label: 'Roof sheathing', unit: 'sheets', auto: Math.ceil(n(row('sheathing')?.qtyRaw)), min: t.roofSheet, factor });
    }
  }

  // punch list: a share of the crew's hours, at the end
  const punchKey = 'punchList';
  const pTyped = qty[punchKey] !== undefined && qty[punchKey] !== null && qty[punchKey] !== '';
  const pct = pTyped ? n(qty[punchKey]) : n(t.punchListPct);
  const base = tasks.filter((x) => x.team === 'crew').reduce((a, x) => a + x.workerHours, 0);
  if (base > 0 || pTyped) {
    tasks.push({
      key: punchKey, group: 'Site', level: 'Punch list', levelIndex: 1e6, label: 'Punch list', unit: '% of the crew hours',
      qty: pct, auto: n(t.punchListPct), typed: pTyped, team: 'crew', min: 0, factor: 1, minutes: 0,
      workerHours: (base * pct) / 100, hint: `${Math.round(base).toLocaleString('en-US')} h`,
    });
  }

  // totals: the framing crew and the window installers, each with their rates
  const crewTasks = tasks.filter((x) => x.team === 'crew');
  const instTasks = tasks.filter((x) => x.team === 'installers');
  const wh = (list2) => list2.reduce((a, x) => a + x.workerHours, 0);
  const crewWH = wh(crewTasks), instWH = wh(instTasks);
  const burden = 1 + n(s.burdenPct) / 100;
  const markup = 1 + n(s.markupPct) / 100;
  const crewRate = n(s.payRate) * burden; // what a worker-hour costs the company
  const instRate = n(s.installerPayRate) * burden;
  const cost = crewWH * crewRate + instWH * instRate;
  const bill = cost * markup;
  // per sq ft: the floor area of every level (as drawn on the plans, openings in), or typed
  const areas = levelAreas(est);
  const autoArea = areas.reduce((a, x) => a + x.areaSqFt, 0);
  const areaTyped = est.labor?.areaSqFt !== undefined && est.labor?.areaSqFt !== null && est.labor?.areaSqFt !== '';
  const areaSqFt = areaTyped ? n(est.labor.areaSqFt) : autoArea;
  const sqftBill = areaSqFt * n(s.sqftRate);
  const crewDays = crewWH / Math.max(1, n(s.crew) || 1) / Math.max(1, n(s.hoursPerDay) || 8);
  const instDays = instWH / Math.max(1, n(s.installers) || 1) / Math.max(1, n(s.hoursPerDay) || 8);
  const totals = {
    workerHours: r2(crewWH + instWH), crewWorkerHours: r2(crewWH), installerWorkerHours: r2(instWH),
    crewHours: r2(crewWH / Math.max(1, n(s.crew) || 1)), crewDays: r2(crewDays), installerDays: r2(instDays),
    cost: r2(cost), bill: r2(bill), margin: r2(bill - cost),
    crewRate: r2(crewRate), crewBillRate: r2(crewRate * markup), installerBillRate: r2(instRate * markup),
    areaSqFt: Math.round(areaSqFt), autoAreaSqFt: Math.round(autoArea), areaTyped, levelAreas: areas, sqftBill: r2(sqftBill),
    sqftDiffPct: bill ? Math.round(((sqftBill - bill) / bill) * 100) : 0,
    timePerSqft: areaSqFt ? r2(bill / areaSqFt) : 0,
    panels, wallLF: r2(wallLF),
    perPanel: panels ? r2(bill / panels) : 0,
    perLF: wallLF ? r2(bill / wallLF) : 0,
    wallBill: r2(tasks.filter((x) => x.group === 'Walls' || x.group === 'Windows & doors').reduce((a, x) => a + x.workerHours * (x.team === 'installers' ? instRate : crewRate) * markup, 0)),
  };
  totals.wallPerPanel = panels ? r2(totals.wallBill / panels) : 0;
  totals.wallPerLF = wallLF ? r2(totals.wallBill / wallLF) : 0;
  return { tasks, totals, settings: s };
}

/* ───────────────────── templates ───────────────────── */

/** The labor Summary adds: by time, or per sq ft when the project prices it that way. */
export function laborTotal(est = {}) {
  const { totals, settings } = computeLabor(est);
  const by = settings.priceBy === 'sqft' ? 'sqft' : 'time';
  return { by, amount: by === 'sqft' ? totals.sqftBill : totals.bill, hours: totals.workerHours };
}

const TEMPLATE_KEYS = ['priceBy', 'crew', 'refCrew', 'hoursPerDay', 'payRate', 'burdenPct', 'markupPct', 'sqftRate', 'efficiencyPct', 'windowsBy', 'installers', 'installerPayRate', 'levelFactors', 'roofExtra', 'times'];
/** A template from the project's labor settings (no quantities: those belong to the project). */
export const toLaborTemplate = (labor, name) => ({ name, ...Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, laborSettings(labor)[k]])) });
/** The project's labor settings from a template, keeping the quantities typed in the project. */
export const fromLaborTemplate = (tpl, labor = {}, templateId) => ({ ...Object.fromEntries(TEMPLATE_KEYS.filter((k) => tpl[k] !== undefined).map((k) => [k, tpl[k]])), qty: labor.qty || {}, templateId, templateName: tpl.name });
