import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headerOpenings, defaultPlies } from './openings.js';
import { computeWallSection, wallPanelsOf } from './index.js';
import { migrateEstimate } from './migrate.js';

const pick = (f, s) => ({ family: f.toLowerCase(), familyLabel: f, sizeLabel: s, vendorId: 'v', item: { priceWithMarkup: 10, sizeDisplay: s, familyDisplay: f } });

test('header length = width + 1-1/2" per jack each side; material = length × plies × qty', () => {
  const h = headerOpenings([
    { id: 'a', type: 'window', name: 'A1', widthIn: 36, qty: 2, kings: 1, jacks: 1 },
    { id: 'b', type: 'door', name: 'Door 1', widthIn: 60, qty: 1, kings: 2, jacks: 2 },
  ], { plies: 3, boardLenIn: 192 });
  assert.deepEqual(h.perOpening.map((p) => p.headerIn), [39, 66]);
  assert.equal(h.headerLF, ((39 * 2 + 66) * 3) / 12);
  assert.equal(h.pieces, 3);                 // 6 × 39" + 3 × 66" from 16' pieces
  assert.equal(h.kingsJacks, 2 * 2 * 2 + 2 * 4);
  assert.deepEqual([h.windows, h.doors], [2, 1]);
  assert.equal(defaultPlies(3.5), 2);
});

test('a Header row with openings takes its LF and kings & jacks from them', () => {
  const section = {
    id: 's', lengthLF: 40, heightFt: 9, sel: { studs: pick('SPF#2', `2x6"-10'`) },
    extras: [
      { id: 'h1', type: 'Header', item: pick('SPF#2', `2x10"-16'`), wastePct: 0, openings: [{ id: 'w', type: 'window', widthIn: 36, qty: 3 }] },
      { id: 'h2', type: 'Header', item: pick('LVL', '1-3/4x12"'), wastePct: 0, openings: [{ id: 'd', type: 'door', widthIn: 96, qty: 1 }] },
      { id: 'h3', type: 'Header', item: pick('SPF#2', `2x10"-16'`), wastePct: 0, inputs: { headerLF: 32 } },
    ],
  };
  const r = computeWallSection(section);
  const [lumber, lvl, typed] = r.extraRows;
  assert.equal(lumber.qtyRaw, 3);                          // 9 plies of 39", 4 per 16' piece
  assert.equal(lvl.qtyRaw, (99 * 3) / 12);                 // LVL bought by LF
  assert.equal(typed.qtyRaw, 2);                           // typed LF ÷ 16'
  assert.equal(r.openingRows[0].key, 'openStuds');
  assert.equal(r.openingRows[0].qtyRaw, 3 * 4 + 4);
  assert.ok(r.infill);                                     // SPF#2 headers still get their infill
  const wp = wallPanelsOf({ levels: [{ id: 'l', exteriorSections: [section], interiorSections: [] }] });
  const m = Object.fromEntries(wp.manufacture.lines.map((l) => [l.key, l.qty]));
  assert.deepEqual([m.windows, m.exteriorDoors], [3, 1]);
});

test('openings typed on the section earlier move onto a Header row', () => {
  const m = migrateEstimate({ levels: [{ id: 'l', exteriorSections: [{ id: 's', openings: [{ id: 'w', widthIn: 30, qty: 1 }], openingSpec: { lumberPlies: 3 } }] }] });
  const s = m.levels[0].exteriorSections[0];
  assert.equal(s.openings, undefined);
  assert.equal(s.extras[0].type, 'Header');
  assert.equal(s.extras[0].openings.length, 1);
});
