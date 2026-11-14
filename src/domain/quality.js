// src/domain/quality.js
// Quality check of an estimate: what a reviewer should look at before the bid
// goes out (one item missed is thousands of dollars). Automatic checks, then a
// person reviews: the estimator asks a colleague, who marks it checked or
// sends it back with notes. Pure functions.

import { buildTakeoff } from './takeoff';
import { scopeOf } from './scope';
import { grandTotals, PRICE_AGE_DAYS } from './revisions';
import { taxFor } from './lib/tax';
import { wallPanelsOf } from './estimate';

const n = (v) => Number(v) || 0;

/**
 * @returns [{ key, level: 'error' | 'warn' | 'ok', text }]
 *   error: very likely money missing; warn: worth a look; ok: passed.
 */
export function qaChecks(est = {}, { markupDefault = 0, now = Date.now() } = {}) {
  const out = [];
  const add = (key, level, text) => out.push({ key, level, text });
  const sc = scopeOf(est);
  const info = est.summaryInfo || {};
  const t = buildTakeoff(est);
  const g = grandTotals(est, { markupDefault });

  // every takeoff line has a material picked and a price
  const lines = [];
  for (const lv of t.levels) for (const grp of [...lv.wallPanels, ...lv.loose]) lines.push(...grp.lines.map((l) => ({ ...l, where: lv.name })));
  for (const grp of t.project) if (grp.key !== 'trusses') lines.push(...grp.lines);
  const unpicked = lines.filter((l) => !l.picked && n(l.qty) > 0);
  const noPrice = lines.filter((l) => l.picked && n(l.qty) > 0 && !n(l.total));
  if (unpicked.length) add('unpicked', 'error', `${unpicked.length} takeoff line${unpicked.length === 1 ? '' : 's'} without a material picked: ${unpicked.slice(0, 4).map((l) => l.name).join(', ')}${unpicked.length > 4 ? '…' : ''}`);
  else add('unpicked', 'ok', 'Every takeoff line has a material.');
  if (noPrice.length) add('noprice', 'error', `${noPrice.length} material${noPrice.length === 1 ? '' : 's'} at $0: ${noPrice.slice(0, 4).map((l) => l.name).join(', ')}${noPrice.length > 4 ? '…' : ''}`);
  else add('noprice', 'ok', 'Every material has a price.');

  // each part in the scope has something in it
  if ((sc.structural || sc.partitions) && !g.wallPanelsTotal) add('wallpanels', 'error', 'Wall panels are in the scope but come to $0.');
  const trk = wallPanelsOf(est).trucking;
  if ((sc.structural || sc.partitions) && trk.panels && !trk.total) add('trucking', 'warn', 'Panel trucking is not priced (Wall panels page): panels per truck, miles and rates.');
  if (sc.loose && !g.looseTotal) add('loose', 'warn', 'Loose material is in the scope but comes to $0.');
  if (sc.trusses && !g.trussTotal) add('trusses', 'warn', "Trusses are in the scope but have no price: enter the truss maker's quote or the per sq ft estimate.");
  if (sc.labor && !g.laborTotal) add('labor', 'warn', 'Labor is in the scope but comes to $0.');
  const emptyLevels = (est.levels || []).filter((l) => !(l.exteriorSections || []).some((s) => n(s.lengthLF)) && !(l.interiorSections || []).some((s) => n(s.lengthLF)));
  if ((sc.structural || sc.partitions) && emptyLevels.length) add('levels', 'warn', `${emptyLevels.map((l) => l.name || 'A level').join(', ')} ${emptyLevels.length === 1 ? 'has' : 'have'} no walls.`);

  // money settings
  if (!g.markupPct) add('markup', 'warn', 'No material markup.');
  if (!n(est.buffers?.wallPanels ?? 10) && !n(est.buffers?.loose ?? 10)) add('buffer', 'warn', 'No error buffer on wall panels or loose material.');
  const tax = taxFor(info);
  if (!tax.state || tax.state === 'NONE' || (!tax.rate && !tax.exempt)) add('tax', 'warn', 'No sales tax: check the address (state) in Summary, or mark it exempt.');
  if (!g.areaSqFt) add('area', 'warn', 'No floor area: the price per sq ft cannot be checked against your usual range.');

  // dates
  if (!info.drawingsDate) add('drawings', 'warn', 'No drawings date in Summary: revisions cannot tell when new drawings came.');
  if (info.pricesAt) {
    const d = Math.floor((now - new Date(info.pricesAt).getTime()) / 86400000);
    if (d > PRICE_AGE_DAYS) add('prices', 'warn', `Prices are ${d} days old: refresh them in Summary.`);
  }
  return out.sort((a, b) => ['error', 'warn', 'ok'].indexOf(a.level) - ['error', 'warn', 'ok'].indexOf(b.level));
}

export const REVIEW_STATUS_LABEL = { pending: 'Waiting for review', approved: 'Checked', changes: 'Changes needed', withdrawn: 'Withdrawn' };
