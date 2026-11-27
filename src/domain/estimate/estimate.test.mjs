// Unit tests for the estimate calculations. Run with: npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWallSection, computeLevel, computePanelNails, computeLoosePanel, computeBracing,
  computeManufacture, computeWallPanels, computeLooseSection, computeLoose, computeProject,
  sectionAddonPerLF, pieceLength, wallPanelsOf,
  PANEL_NAIL_GROUPS, PANEL_NAIL_INPUTS,
} from './index.js';
import { migrateEstimate } from './migrate.js';
import { slimItem, slimEstimate, priceDateOf } from '../lib/selection.js';
import { isGroundLevelName, wallRowDefaults, LOOSE_SECTION_DEFAULTS, BRACING_DEFAULTS, PANEL_NAIL_DEFAULTS } from '../lib/defaults.js';
import { nailsPerSheet, perBoxFromSize, rollLengthFromSize } from '../lib/fastening.js';
import { roofPitchFactor, ROOF_PITCH_OPTIONS, calcSheathing } from '../calculators';

// a selection as ItemPicker stores it; $10 per unit
const pick = (familyLabel, sizeLabel, price = 10, extra = {}) => ({
  family: familyLabel.toLowerCase(), familyLabel, sizeLabel, sizeLookupId: 'x', vendorId: 'v', vendorName: 'V',
  item: { priceWithMarkup: price, unit: 'pcs', familyDisplay: familyLabel, sizeDisplay: sizeLabel, ...extra },
});

describe('piece length', () => {
  test('reads the trailing feet of a size label, 8 ft until picked', () => {
    assert.equal(pieceLength(pick('SPF#2', `2x6"-10'`)), 10);
    assert.equal(pieceLength(pick('SPF#2', `2x4"-8'`)), 8);
    assert.equal(pieceLength(null), 8);
    assert.equal(pieceLength(null, 16), 16);
  });
});

describe('wall section', () => {
  const base = { lengthLF: 80, heightFt: 9, studSpacingIn: 16, studMultiplier: 1, waste: { bottomPlate: 0, topPlate: 0, studs: 0, blocking: 0, sheathing: 0 } };

  test('plates = LF ÷ piece length from the size', () => {
    const r = computeWallSection({ ...base, sel: { bottomPlate: pick('PT', `2x6"-10'`), topPlate: pick('SPF#2', `2x6"-8'`) } });
    const row = Object.fromEntries(r.baseRows.map((x) => [x.key, x]));
    assert.equal(row.bottomPlate.qtyFinal, 8);   // 80 / 10
    assert.equal(row.topPlate.qtyFinal, 10);     // 80 / 8
    assert.equal(row.bottomPlate.piece.ft, 10);
    assert.equal(row.bottomPlate.subtotal, 80);
  });

  test('blocking = LF × rows ÷ piece length; rows = ceil(h/4) − 1', () => {
    const r = computeWallSection({ ...base, heightFt: 12, sel: { blocking: pick('SPF#2', `2x6"-8'`) } });
    const blocking = r.baseRows.find((x) => x.key === 'blocking');
    assert.equal(blocking.qtyRaw, 20);           // 80 / 8 × 2 rows
    assert.equal(blocking.piece.lf, 160);
  });

  test('a new section with no length has 0 studs until a length is typed', () => {
    const empty = computeWallSection({ lengthLF: 0, heightFt: 12, studSpacingIn: 16, studMultiplier: 1 });
    assert.equal(empty.baseRows.find((x) => x.key === 'studs').qtyFinal, 0);
    const typed = computeWallSection({ lengthLF: 16, heightFt: 12, studSpacingIn: 16, studMultiplier: 1, waste: { studs: 0 } });
    assert.equal(typed.baseRows.find((x) => x.key === 'studs').qtyFinal, 13); // 16×12/16 + 1
  });

  test('interior partitions have no blocking or sheathing; shear walls have sheathing', () => {
    const part = computeWallSection({ ...base, kind: 'partition' }, 'interior');
    assert.deepEqual(part.baseRows.map((x) => x.key), ['bottomPlate', 'topPlate', 'studs']);
    const shear = computeWallSection({ ...base, kind: 'shear' }, 'interior');
    assert.ok(shear.baseRows.some((x) => x.key === 'sheathing'));
    assert.equal(shear.kind, 'shear');
  });

  test('LVL header counts header LF only; lumber header is LF ÷ piece', () => {
    const r = computeWallSection({
      ...base,
      extras: [
        { id: 'a', type: 'Header', item: pick('LVL', '1-3/4x9-1/2"'), wastePct: 0, inputs: { headerLF: 24, lvlPieces: 9, lvlLength: 9 } },
        { id: 'b', type: 'Header', item: pick('SPF#2', `2x10"-12'`), wastePct: 0, inputs: { headerLF: 24 } },
      ],
    });
    assert.equal(r.extraRows[0].qtyRaw, 24);
    assert.equal(r.extraRows[0].unit, 'lf');
    assert.equal(r.extraRows[1].qtyRaw, 2);
    // PSL / PL PSL / Parallam follow the same LF calculation as LVL
    const psl = computeWallSection({
      ...base,
      extras: [
        { id: 'p1', type: 'Header', item: pick('PSL', '5-1/4x11-7/8"'), wastePct: 0, inputs: { headerLF: 15 } },
        { id: 'p2', type: 'Header', item: pick('PL PSL', '5-1/4x9-1/2"'), wastePct: 0, inputs: { headerLF: 10 } },
        { id: 'p3', type: 'Header', item: pick('Parallam', '5-1/4x5-1/4"'), wastePct: 0, inputs: { headerLF: 8 } },
      ],
    });
    assert.deepEqual(psl.extraRows.map((x) => [x.qtyRaw, x.unit]), [[15, 'lf'], [10, 'lf'], [8, 'lf']]);
    // LSL: by piece (like SPF#2) when the size carries a length, by LF when it has no length
    const lsl = computeWallSection({
      ...base,
      extras: [
        { id: 'l1', type: 'Header', item: pick('LSL', `4x4"-12'`), wastePct: 0, inputs: { headerLF: 24 } },
        { id: 'l2', type: 'Header', item: pick('LSL', '4x4"'), wastePct: 0, inputs: { headerLF: 24 } },
        { id: 'l3', type: 'Header', item: pick('LSL', '3-1/2x3-1/2'), wastePct: 0, inputs: { headerLF: 18 } },
      ],
    });
    assert.equal(lsl.extraRows[0].qtyRaw, 2);     // 24 / 12' = 2 pcs
    assert.equal(lsl.extraRows[1].qtyRaw, 24);    // no length → LF directly
    assert.equal(lsl.extraRows[1].unit, 'lf');
    assert.equal(lsl.extraRows[2].qtyRaw, 18);    // fractional size without length → LF directly
    assert.equal(lsl.extraRows[2].unit, 'lf');
  });

  test('legacy LVL pieces × length is used only when there is no header LF', () => {
    const r = computeWallSection({ ...base, extras: [{ id: 'a', type: 'Header', item: pick('LVL', 'x'), wastePct: 0, inputs: { lvlPieces: 2, lvlLength: 10 } }] });
    assert.equal(r.extraRows[0].qtyRaw, 20);
  });

  test('headers infill appears automatically from infill-family header LF', () => {
    const none = computeWallSection({ ...base });
    assert.equal(none.infill, null);
    const r = computeWallSection({
      ...base,
      sel: { headersInfill: pick('CDX SE', `4x8'-1/2"`, 30) },
      waste: { ...base.waste, headersInfill: 0 },
      extras: [{ id: 'b', type: 'Header', item: pick('SPF#2', `2x10"-12'`), wastePct: 0, inputs: { headerLF: 48 } }],
    });
    assert.ok(r.infill);
    assert.equal(r.infill.qtyFinal, 1);           // 48/3/32×2 = 1
    assert.equal(r.subtotal, Math.round((r.baseRows.reduce((s, x) => s + x.subtotal, 0) + r.extraRows[0].subtotal + 30) * 100) / 100);
    // solid 1-ply 4x/6x headers fill the full wall depth (3.5" / 5.5") and need no infill
    const solidByPlies = computeWallSection({
      ...base,
      extras: [{ id: 'b', type: 'Header', item: pick('SPF#2', `2x10"-12'`), wastePct: 0, inputs: { headerLF: 48, plies: 1 } }],
    });
    assert.equal(solidByPlies.infill, null);
    const solidBySize = computeWallSection({
      ...base,
      extras: [{ id: 'b', type: 'Header', item: pick('DF#2', `6x8"-12'`), wastePct: 0, inputs: { headerLF: 48 } }],
    });
    assert.equal(solidBySize.infill, null);
    // manual exclusion suppresses infill even for built-up 2x headers
    const excluded = computeWallSection({
      ...base,
      noInfill: true,
      extras: [{ id: 'b', type: 'Header', item: pick('SPF#2', `2x10"-12'`), wastePct: 0, inputs: { headerLF: 48 } }],
    });
    assert.equal(excluded.infill, null);
    assert.equal(excluded.headerLFPool, 48);
  });

  test('legacy "Headers infill" extra rows are ignored as rows but keep their material', () => {
    const r = computeWallSection({
      ...base,
      extras: [
        { id: 'b', type: 'Header', item: pick('SPF#2', `2x10"-12'`), wastePct: 0, inputs: { headerLF: 48 } },
        { id: 'old', type: 'Headers infill', item: pick('CDX SE', `4x8'-1/2"`, 30), wastePct: 0 },
      ],
    });
    assert.equal(r.extraRows.length, 1);
    assert.equal(r.infill.unitPrice, 30);
  });

  test('stats: zip sheets, PT boards, 2×6 detection', () => {
    const r = computeWallSection({
      ...base, heightFt: 8,
      sel: { sheathing: pick('Green Zip', `4x8'-7/16"`), bottomPlate: pick('PT', `2x6"-8'`), studs: pick('SPF#2', `2x6"-10'`) },
    });
    assert.equal(r.stats.panelSheets, 20);        // 80×8/32
    assert.equal(r.stats.zipSheetsFinal, 20);
    assert.equal(r.stats.panelPtBoards, 10);
    assert.equal(r.stats.wallKind, 'int-2x6');
  });
});

describe('manufacture', () => {
  test('add-ons: +$1/LF per extra stud, +$2/LF over 10 ft', () => {
    assert.equal(sectionAddonPerLF({ studMultiplier: 1, heightFt: 9 }), 0);
    assert.equal(sectionAddonPerLF({ studMultiplier: 2, heightFt: 9 }), 1);
    assert.equal(sectionAddonPerLF({ studMultiplier: 3, heightFt: 12 }), 4);
  });

  test('total = LF × (base rate + LF-weighted add-on)', () => {
    const m = computeManufacture({}, { exteriorWalls: 100 }, { exteriorWalls: { lf: 100, addon: 100 } });
    const ext = m.lines.find((l) => l.key === 'exteriorWalls');
    assert.equal(ext.ratePerLF, 11.5);
    assert.equal(ext.total, 1150);
    assert.equal(ext.panels, Math.ceil(100 / 8 * 1.1));
  });

  test('windows and doors are qty × each', () => {
    const m = computeManufacture({ manualInputByKey: { windows: 3 } }, {});
    assert.equal(m.lines.find((l) => l.key === 'windows').total, 3 * 20.05);
  });
});

describe('nailing schedule (IRC R602.3(1))', () => {
  test('nails per 4×8 sheet over studs @ 16": 6/12 = 70, 4/12 = 94, 3/12 = 118', () => {
    assert.equal(nailsPerSheet({ edgeIn: 6, fieldIn: 12 }), 70);
    assert.equal(nailsPerSheet({ edgeIn: 4, fieldIn: 12 }), 94);
    assert.equal(nailsPerSheet({ edgeIn: 3, fieldIn: 12 }), 118);
    assert.equal(nailsPerSheet({ edgeIn: 6, fieldIn: 12, studSpacingIn: 24 }), 61); // 1 stud under the middle
  });

  test('count per box and roll length come from the size label', () => {
    assert.equal(perBoxFromSize('8D-2-3/8x.113-2.7M', 1), 2700);
    assert.equal(perBoxFromSize('12D-3-1/4x.120-2.5M', 1), 2500);
    assert.equal(perBoxFromSize('3"-100s', 1), 100);
    assert.equal(perBoxFromSize('weird', 77), 77);
    assert.equal(rollLengthFromSize(`5-1/2"x50'`), 50);
  });

  test('a section reports sheathing nails from its own schedule', () => {
    const base = { lengthLF: 32, heightFt: 8, studSpacingIn: 16, waste: { sheathing: 0 } };
    const std = computeWallSection(base);            // 8 sheets × 70
    assert.equal(std.nailing.sheathNails, 8 * 70);
    const shear = computeWallSection({ ...base, edgeNailIn: 4 });
    assert.equal(shear.nailing.sheathNails, 8 * 94);
    assert.equal(shear.baseRows.find((r) => r.key === 'sheathing').tag.text, '4/12');
  });

  test('framing nails: 2 per stud end, doubled studs @ 24", braced bottom plates 3 per 16"', () => {
    const r = computeWallSection({ lengthLF: 16, heightFt: 8, studSpacingIn: 16, studMultiplier: 2 });
    // 13 stud locations × 2 studs = 26 studs → 26 × 2 ends × 2 nails
    assert.equal(r.nailing.plateStudNails, 104);
    // 13 extra studs × (8 ft @ 24" + 1 = 5)
    assert.equal(r.nailing.doubleStudNails, 65);
    // exterior = braced wall: (16 ft @ 16" + 1 = 13) × 3
    assert.equal(r.nailing.bottomPlateNails, 39);
    const part = computeWallSection({ lengthLF: 16, heightFt: 8, kind: 'partition' }, 'interior');
    assert.equal(part.nailing.bottomPlateNails, 13);
  });
});

describe('panel nails (per level)', () => {
  const plates = { pt: { lf: 96, pieces: 6 }, topPlates: { lf: 96, pieces: 6 }, extraPlates: { lf: 0, pieces: 0 }, looseSheets: 10 };

  test('concrete rows only on a level that is on concrete', () => {
    const upper = computePanelNails({}, { plates, isGround: false });
    assert.ok(!upper.baseRows.some((r) => r.group === 'concrete'));
    const ground = computePanelNails({}, { plates, isGround: true });
    assert.deepEqual(ground.baseRows.filter((r) => r.group === 'concrete').map((r) => r.key), ['drivePins', 'epoxy']);
    const forced = computePanelNails({ onConcrete: true }, { plates });
    assert.ok(forced.onConcrete);
  });

  test('drive pins by spacing (+1 per piece), epoxy per anchor bolt, foam per roll', () => {
    const r = computePanelNails({ waste: { drivePins: 0, epoxy: 0, foamSill: 0 } }, { plates, isGround: true });
    const row = Object.fromEntries(r.baseRows.map((x) => [x.key, x]));
    assert.equal(row.drivePins.count, 96 * 12 / 16 + 6);   // 72 + 6 = 78 pins
    assert.equal(row.drivePins.qtyFinal, 1);               // 1 box of 100
    // 24 anchors (96 LF @ 48") × π/4 × (0.625² − 0.5²) × 7" = 18.55 in³ ÷ 10 fl oz (18.05 in³)
    assert.equal(r.anchors, 24);
    assert.ok(Math.abs(row.epoxy.count - 18.555) < 0.01);
    assert.equal(row.epoxy.qtyFinal, 2);
  });

  test('PT bottom plates built into the panels count for the concrete items too', () => {
    const panelPT = computeWallSection({ lengthLF: 48, heightFt: 8, sel: { bottomPlate: pick('PT', `2x6"-16'`) } }).nailing;
    assert.equal(panelPT.ptLF, 48);
    assert.equal(panelPT.ptPieces, 3);
    const r = computePanelNails({}, { sections: [panelPT], plates, isGround: true });
    assert.equal(r.ptLF, 96 + 48);
    assert.equal(r.baseRows.find((x) => x.key === 'drivePins').count, Math.ceil(144 * 12 / 16) + 6 + 3);
    const spf = computeWallSection({ lengthLF: 48, heightFt: 8, sel: { bottomPlate: pick('SPF#2', `2x6"-16'`) } }).nailing;
    assert.equal(spf.ptLF, 0);
  });

  test('loose top plate: 10d @ 24" + 16 nails per splice; sheathing from sections', () => {
    const sections = [computeWallSection({ lengthLF: 32, heightFt: 8, waste: { sheathing: 0 } }).nailing];
    const r = computePanelNails({ waste: { topPlate: 0, sheath: 0 } }, { sections, plates });
    const row = Object.fromEntries(r.baseRows.map((x) => [x.key, x]));
    assert.equal(row.topPlate.count, (96 * 12 / 24 + 1) + 6 * 16);
    assert.equal(row.sheath.count, 560);
    assert.equal(row.sheath.qtyFinal, 1);                  // 560 ÷ 2,700
    assert.equal(row.sheathLoose.count, 10 * 70);
  });
});

describe('bracing', () => {
  test('wall panels: panels × braces per panel', () => {
    const b = computeBracing({}, { panels: 10 });
    assert.equal(b.baseRows.find((x) => x.key === 'panels').qtyFinal, 20);
  });

  test('trusses: 2 bundles per 5,000 sq ft, braced one section at a time', () => {
    const t = (inputs, ctx = {}) => computeBracing({ inputs }, ctx).baseRows.find((x) => x.key === 'trusses').qtyFinal;
    assert.equal(t({ buildingAreaSqFt: 5000 }), 2 * 294);
    assert.equal(t({ buildingAreaSqFt: 2000 }), 1 * 294);            // 0.8 bundle → 1
    assert.equal(t({ buildingAreaSqFt: 20000 }), 2 * 294);           // reused: 5,000 sq ft at a time
    assert.equal(t({ buildingAreaSqFt: 20000, reuseAreaSqFt: 0 }), 8 * 294); // no reuse
    assert.equal(t({}, { roofAreaSqFt: 4000 }), 2 * 294);            // falls back to Roof sq ft
    assert.equal(t({}), 0);
  });
});

describe('loose top plates', () => {
  test('warn when the loose top plate is not longer than the panels', () => {
    const short = computeLoosePanel({ sel: { extTopPlate: pick('SPF#2', `2x6"-8'`) } }, { extLengthLF: 40, panelLenFt: 8 });
    assert.ok(short.exteriorRows.find((r) => r.key === 'extTopPlate').warn);
    const ok = computeLoosePanel({ sel: { extTopPlate: pick('SPF#2', `2x6"-16'`) } }, { extLengthLF: 40, panelLenFt: 8 });
    assert.equal(ok.exteriorRows.find((r) => r.key === 'extTopPlate').warn, undefined);
    assert.deepEqual(ok.plates.topPlates, { lf: 40, pieces: 3 });
  });
});

describe('loose materials (wall panels)', () => {
  test('optional rows count only when included; band follows exterior LF', () => {
    const sel = { extraSheathing: pick('CDX SE', `4x8'-1/2"`, 20) };
    const off = computeLoosePanel({ sel }, { extLengthLF: 64 });
    assert.equal(off.exteriorRows.find((r) => r.key === 'extraSheathing').subtotal, 0);
    assert.equal(off.bandLF, 64);
    const on = computeLoosePanel({ sel, include: { extraSheathing: true } }, { extLengthLF: 64 });
    assert.ok(on.exteriorRows.find((r) => r.key === 'extraSheathing').subtotal > 0);
    assert.ok(on.subtotal > off.subtotal);
  });

  test('ZIP tape only when exterior walls use ZIP', () => {
    assert.ok(!computeLoosePanel({}, { extLengthLF: 64 }).exteriorRows.some((r) => r.key === 'zipTape'));
    assert.ok(computeLoosePanel({}, { extLengthLF: 64, extZipSheets: 12 }).exteriorRows.some((r) => r.key === 'zipTape'));
  });
});

describe('loose material page', () => {
  test('foundation sill plate uses the size length; basement nails follow the sill', () => {
    const foundation = { id: 'f', kind: 'foundation', inputs: { foundationLF: 160 }, sel: { sillPlate: pick('PT', `2x6"-16'`) }, waste: { sillPlate: 0, foamSeal: 0 } };
    const f = computeLooseSection(foundation);
    assert.equal(f.calcRows.find((r) => r.key === 'sillPlate').qtyFinal, 10);
    const b = computeLooseSection({ id: 'b', kind: 'basement', inputs: {} }, foundation);
    assert.match(b.calcRows.find((r) => r.key === 'concreteNails').hint, /^10 /);
  });

  test('hidden sections are left out of the total', () => {
    const est = { looseList: [
      { id: 'a', name: 'X', kind: 'custom', rows: [{ id: 'r', type: 'Bolts', qty: 2, wastePct: 0, item: pick('Bolt', '1/2"', 5) }] },
      { id: 'b', name: 'Y', kind: 'custom', isHidden: true, rows: [{ id: 'r2', type: 'Bolts', qty: 2, wastePct: 0, item: pick('Bolt', '1/2"', 5) }] },
    ] };
    assert.equal(computeLoose(est).total, 10);
  });
});

describe('project', () => {
  const est = {
    levels: [{
      id: 'l1', name: 'Level 1',
      exteriorSections: [{ id: 's1', lengthLF: 80, heightFt: 9, sel: { bottomPlate: pick('PT', `2x6"-8'`) }, waste: { bottomPlate: 0 } }],
      interiorSections: [{ id: 's2', kind: 'partition', lengthLF: 40, heightFt: 9, sel: {} }],
      panelNails: {}, looseMaterials: {},
    }],
    trusses: [{ id: 't', amount: '1000.00' }],
    looseList: [],
  };

  test('level total = sections + panel nails + loose; page adds nails & manufacture', () => {
    const lvl = computeLevel(est.levels[0], { isGround: true });
    assert.equal(lvl.derived.extLengthSum, 80);
    assert.equal(lvl.derived.int2x4LF, 40);
    assert.equal(lvl.total, Math.round((lvl.exteriorTotal + lvl.interiorTotal + lvl.panelNails.total + lvl.loose.subtotal) * 100) / 100);
    const wp = computeWallPanels(est);
    assert.equal(wp.lf.exteriorWalls, 80);
    assert.equal(wp.lf.interiorNonLoad, 40);
    assert.equal(wp.total, Math.round((lvl.total + wp.bracing.total + wp.manufacture.total) * 100) / 100);
  });

  test('project totals do not depend on stored totals', () => {
    const withJunk = { ...est, levels: [{ ...est.levels[0], total: 999999 }] };
    assert.deepEqual(computeProject(withJunk), computeProject(est));
    assert.equal(computeProject(est).trusses, 1000);
  });

  test('results are cached per estimate object', () => {
    assert.equal(wallPanelsOf(est), wallPanelsOf(est));
  });
});

describe('document size', () => {
  test('slimItem keeps prices, unit, labels and a price date', () => {
    const full = { basePrice: 5, markupPct: 10, priceWithMarkup: 5.5, unit: 'pcs', familyDisplay: 'PT', sizeDisplay: `2x6"-8'`, history: new Array(50).fill({ x: 1 }), joinKey: 'pt|2x6', updatedAt: { seconds: 1700000000, nanoseconds: 0 } };
    const slim = slimItem(full);
    assert.equal(slim.history, undefined);
    assert.equal(slim.priceWithMarkup, 5.5);
    assert.equal(slim.priceDate, 1700000000000);
  });

  test('slimEstimate finds selections anywhere and keeps everything else', () => {
    const est = { levels: [{ name: 'L', exteriorSections: [{ lengthLF: 10, sel: { bottomPlate: pick('PT', `2x6"-8'`, 10, { history: [1, 2, 3] }) } }] }] };
    const out = slimEstimate(est);
    const sel = out.levels[0].exteriorSections[0].sel.bottomPlate;
    assert.equal(out.levels[0].exteriorSections[0].lengthLF, 10);
    assert.equal(sel.item.history, undefined);
    assert.equal(sel.sizeLabel, `2x6"-8'`);
    assert.ok(priceDateOf(sel) > 0);
    assert.ok(JSON.stringify(out).length < JSON.stringify(est).length + 40);
  });

  test('migrateEstimate drops stored totals and moves legacy headers infill', () => {
    const est = {
      levels: [{ id: 'l', total: 5, looseMaterials: { subtotal: 3, generalStats: {} }, panelNails: { total: 1 },
        exteriorSections: [{ id: 's', groupSubtotal: 9, panelSheets: 4, extras: [{ id: 'i', type: 'Headers infill', item: pick('CDX SE', 'x'), wastePct: 7 }] }],
        interiorSections: [] }],
      looseList: [{ id: 'x', subtotal: 2 }],
      manufactureEstimate: { total: 1, panels: 2, rateByKey: { windows: 3 } },
    };
    const m = migrateEstimate(est);
    assert.equal(m.levels[0].total, undefined);
    assert.equal(m.levels[0].looseMaterials.generalStats, undefined);
    assert.equal(m.levels[0].exteriorSections[0].groupSubtotal, undefined);
    assert.equal(m.levels[0].exteriorSections[0].extras.length, 0);
    assert.equal(m.levels[0].exteriorSections[0].waste.headersInfill, 7);
    assert.equal(m.levels[0].exteriorSections[0].sel.headersInfill.familyLabel, 'CDX SE');
    assert.equal(m.looseList[0].subtotal, undefined);
    assert.deepEqual(m.manufactureEstimate, { rateByKey: { windows: 3 } });
  });
});

describe('migration of nails & bracing', () => {
  test('old Nails & bracing splits into panel nails rows and the Bracing section', () => {
    const est = {
      levels: [{ id: 'a', panelNails: { sel: { nailsFrame12d: pick('Bright Common Coil', '12D') }, waste: { frame12d: 30, frame8d: 20 }, rowOrder: ['frame8d', 'sheath'] } }, { id: 'b' }],
      nailsAndBracing: {
        sel: { nailsConcrete: pick('Drive Pins', '3"-100s'), tempBracing: pick('SPF#2', `2x4"-16'`) },
        waste: { nailsConcrete: 25, tempBracing: 5 },
        extras: [{ id: 'gn1', label: 'Nails', inputs: { qty: 1, density: 1, perBox: 1 } }],
      },
    };
    const m = migrateEstimate(est);
    assert.equal(m.nailsAndBracing, undefined);
    assert.equal(m.levels[0].panelNails.waste.framing, 30);
    assert.equal(m.levels[0].panelNails.waste.bottomPlate, 20);
    assert.deepEqual(m.levels[0].panelNails.rowOrder, ['bottomPlate', 'sheath']);
    assert.equal(m.levels[0].panelNails.sel.drivePins.familyLabel, 'Drive Pins');
    assert.equal(m.levels[0].panelNails.waste.drivePins, 25);
    assert.equal(m.levels[0].panelNails.extras.length, 1);
    assert.equal(m.levels[1].panelNails.extras, undefined);
    assert.equal(m.bracing.sel.panels.familyLabel, 'SPF#2');
    assert.equal(m.bracing.waste.panels, 5);
  });
});

describe('defaults', () => {
  test('ground level walls start on PT bottom plates', () => {
    assert.equal(wallRowDefaults('exterior', 'bottomPlate', { groundLevel: true }).family, 'PT');
    assert.equal(wallRowDefaults('exterior', 'bottomPlate').family, 'SPF#2');
    assert.ok(isGroundLevelName('Basement'));
    assert.ok(!isGroundLevelName('Level 2'));
  });
});

test('fireblocking row for tall walls without blocking (IRC R302.11)', async () => {
  const { computeWallSection } = await import('./index.js');
  const tall = computeWallSection({ lengthLF: 100, heightFt: 12, kind: 'partition', sel: {} }, 'interior');
  const row = tall.baseRows.find((r) => r.key === 'fireBlocking');
  assert.ok(row, 'a 12 ft partition gets fireblocking');
  assert.equal(row.piece.lf, 100);
  const ten = computeWallSection({ lengthLF: 100, heightFt: 10, kind: 'partition', sel: {} }, 'interior');
  assert.ok(!ten.baseRows.some((r) => r.key === 'fireBlocking'));
  const ext = computeWallSection({ lengthLF: 100, heightFt: 12, sel: {} }, 'exterior');
  assert.ok(!ext.baseRows.some((r) => r.key === 'fireBlocking'), 'blocking rows already fireblock');
});

describe('roof pitch, optional roof framing rows, and permanent truss bracing', () => {
  test('roofPitchFactor and ROOF_PITCH_OPTIONS', () => {
    assert.deepEqual(ROOF_PITCH_OPTIONS, [0, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
    assert.equal(roofPitchFactor(0), 1);
    assert.equal(roofPitchFactor(-4), 1);
    assert.ok(Math.abs(roofPitchFactor(6) - Math.hypot(12, 6) / 12) < 1e-9);
    assert.ok(Math.abs(roofPitchFactor(12) - Math.SQRT2) < 1e-9);
  });

  test('roof section applies pitchFactor to slopedRoofArea, sheathing, clips, and optionally rafters', () => {
    const flat = computeLooseSection({
      id: 'rf', kind: 'roof',
      inputs: { roofArea: 1000, rafterLF: 160, pitchRise: 0 },
      waste: { sheathing: 0, rafter: 0, clips: 0 },
    });
    assert.equal(flat.pitchFactor, 1);
    assert.equal(flat.slopedRoofArea, 1000);
    assert.equal(flat.calcRows.find((r) => r.key === 'sheathing').qtyFinal, Math.ceil(1000 / 32));
    assert.equal(flat.calcRows.find((r) => r.key === 'sheathing').hint, undefined);
    assert.equal(flat.calcRows.find((r) => r.key === 'rafter').qtyFinal, 10);
    // no optional rows when inputs are 0 and nothing picked
    for (const k of ['hipValley', 'ceilingJoist', 'subfascia', 'fascia', 'soffit', 'overhang']) {
      assert.ok(!flat.calcRows.some((r) => r.key === k), `${k} omitted when unused`);
    }

    const pitched = computeLooseSection({
      id: 'rf', kind: 'roof',
      inputs: { roofArea: 1000, rafterLF: 160, pitchRise: 6, pitchRafters: true },
      waste: { sheathing: 0, rafter: 0, clips: 0 },
    });
    const pf = roofPitchFactor(6);
    const expectedSloped = Math.round(1000 * pf * 100) / 100;
    assert.equal(pitched.pitchFactor, pf);
    assert.equal(pitched.slopedRoofArea, expectedSloped);
    const sh = pitched.calcRows.find((r) => r.key === 'sheathing');
    assert.equal(sh.qtyFinal, Math.ceil(expectedSloped / 32));
    assert.match(sh.hint, /plan/);
    assert.match(sh.hint, /sloped/);
    const clips = pitched.calcRows.find((r) => r.key === 'clips');
    assert.equal(clips.qtyFinal, Math.ceil((sh.qtyFinal * 3) / 250));
    const rafter = pitched.calcRows.find((r) => r.key === 'rafter');
    assert.equal(rafter.qtyFinal, Math.ceil((160 * pf) / 16));
    assert.match(rafter.hint, /6:12/);

    // pitchRafters false keeps rafterLF unscaled
    const unscaledRafter = computeLooseSection({
      id: 'rf', kind: 'roof',
      inputs: { roofArea: 1000, rafterLF: 160, pitchRise: 6, pitchRafters: false },
      waste: { rafter: 0 },
    });
    assert.equal(unscaledRafter.calcRows.find((r) => r.key === 'rafter').qtyFinal, 10);
    assert.equal(unscaledRafter.calcRows.find((r) => r.key === 'rafter').hint, undefined);
  });

  test('optional roof framing rows appear when LF > 0 or item selected', () => {
    const r = computeLooseSection({
      id: 'rf', kind: 'roof',
      inputs: { hipValleyLF: 40, ceilingJoistLF: 160, subfasciaLF: 80, fasciaLF: 80, soffitLF: 80 },
      sel: {
        hipValley: pick('LVL', '1-3/4x18"'),
        overhang: pick('SPF#2', `2x4"-16'`), // selected with 0 LF still shows up
      },
      waste: { hipValley: 0, ceilingJoist: 0, subfascia: 0, fascia: 0, soffit: 10, overhang: 0 },
    });
    const byKey = Object.fromEntries(r.calcRows.map((x) => [x.key, x]));
    assert.equal(byKey.hipValley.unit, 'lf');
    assert.equal(byKey.hipValley.qtyFinal, 40);
    assert.equal(byKey.ceilingJoist.qtyFinal, 10); // 160 / 16
    assert.equal(byKey.subfascia.qtyFinal, 5);     // 80 / 16
    assert.equal(byKey.fascia.qtyFinal, 5);        // 80 / 16
    assert.equal(byKey.soffit.qtyFinal, 11);       // 80 / 8 = 10 + 10% = 11
    assert.equal(byKey.overhang.qtyFinal, 0);
  });

  test('permanent truss bracing row computes from area or explicit LF', () => {
    const fromArea = computeBracing({ inputs: { buildingAreaSqFt: 2000 } });
    const rowA = fromArea.baseRows.find((r) => r.key === 'permanentTrusses');
    assert.equal(rowA.qtyRaw, Math.ceil(300 / 16)); // 2000 * 0.15 = 300 LF / 16' = 19
    assert.equal(rowA.wastePct, 10);
    assert.equal(rowA.qtyFinal, Math.ceil(19 * 1.1));
    assert.match(rowA.hint, /300 LF/);

    const fromRoof = computeBracing({}, { roofAreaSqFt: 1000 });
    const rowR = fromRoof.baseRows.find((r) => r.key === 'permanentTrusses');
    assert.equal(rowR.qtyRaw, Math.ceil(150 / 16)); // 10 pcs

    const fromTyped = computeBracing({ inputs: { buildingAreaSqFt: 2000, permanentBraceLF: 160 }, waste: { permanentTrusses: 0 } });
    const rowT = fromTyped.baseRows.find((r) => r.key === 'permanentTrusses');
    assert.equal(rowT.qtyRaw, 10);
    assert.equal(rowT.qtyFinal, 10);
    assert.match(rowT.hint, /160 LF typed/);

    const empty = computeBracing({});
    assert.equal(empty.baseRows.find((r) => r.key === 'permanentTrusses').qtyFinal, 0);
  });
});

describe('connector fasteners and level hardware integration', () => {
  test('computePanelNails counts connector fasteners from hardwarePieces', () => {
    assert.equal(PANEL_NAIL_GROUPS.hardware, 'Structural connectors');
    assert.equal(PANEL_NAIL_INPUTS.fastenersPerConnector, 12);

    const r = computePanelNails({}, { hardwarePieces: 50 });
    const row = r.baseRows.find((x) => x.key === 'connectorFasteners');
    assert.equal(row.group, 'hardware');
    assert.equal(row.count, 600);
    assert.equal(row.qtyFinal, Math.ceil((600 / 500) * 1.15)); // 2 boxes
    assert.match(row.hint, /50 connectors/);
  });

  test('computeLevel derives hardwarePieces from level.plan.hardwareTypes', () => {
    const lvl = computeLevel({
      id: 'L1',
      exteriorSections: [],
      interiorSections: [],
      plan: {
        ptPerFt: 12,
        walls: [
          { id: 'w1', x1: 0, y1: 0, x2: 120, y2: 0, kind: 'exterior', size: '2x6', posts: [{ atFt: 2 }, { atFt: 6 }] },
        ],
        beams: [{ id: 'b1' }, { id: 'b2' }],
        hardwareTypes: [
          { id: 'H1', name: 'Post base', rule: 'posts', perPost: 1 },   // 2
          { id: 'H2', name: 'Beam hanger', rule: 'beams', perBeam: 2 }, // 4
        ],
      },
    });
    const row = lvl.panelNails.baseRows.find((x) => x.key === 'connectorFasteners');
    assert.equal(lvl.panelNails.hardwarePieces, 6);
    assert.equal(row.count, 6 * 12);
    assert.equal(row.qtyFinal, 1);
  });
});

describe('advanced shear walls', () => {
  test('calcSheathing supports sides multiplier', () => {
    assert.equal(calcSheathing({ lengthLF: 32, heightFt: 8 }).qtyRaw, 8);
    assert.equal(calcSheathing({ lengthLF: 32, heightFt: 8, sides: 2 }).qtyRaw, 16);
  });

  test('double-sided shear wall doubles sheathing sheets, nails, and updates tag & stats', () => {
    const s = computeWallSection({
      lengthLF: 32, heightFt: 8, kind: 'shear', doubleSided: true, edgeNailIn: 4, waste: { sheathing: 0 },
    }, 'interior');
    const sh = s.baseRows.find((r) => r.key === 'sheathing');
    assert.equal(sh.qtyFinal, 16);
    assert.equal(sh.tag.text, '2× · 4/12');
    assert.equal(s.nailing.sheathNails, 16 * 94);
    assert.equal(s.stats.doubleSided, true);

    // exterior wall ignores doubleSided
    const ext = computeWallSection({
      lengthLF: 32, heightFt: 8, doubleSided: true, waste: { sheathing: 0 },
    }, 'exterior');
    assert.equal(ext.baseRows.find((r) => r.key === 'sheathing').qtyFinal, 8);
    assert.equal(ext.stats.doubleSided, false);
  });

  test('shear chordStuds add to studs, tag, plateStud nails, and stats', () => {
    const s = computeWallSection({
      lengthLF: 16, heightFt: 8, kind: 'shear', chordStuds: 4, waste: { studs: 0 },
    }, 'interior');
    const studs = s.baseRows.find((r) => r.key === 'studs');
    assert.equal(studs.qtyFinal, 13 + 4);
    assert.equal(studs.tag.text, '+4');
    assert.equal(s.nailing.plateStudNails, (13 + 4) * 2 * 2);
    assert.equal(s.stats.chordStuds, 4);

    // combined with planJunctionStuds
    const both = computeWallSection({
      lengthLF: 16, heightFt: 8, kind: 'shear', planKey: 'interior|shear|2x6', planJunctionStuds: 3, chordStuds: 4, waste: { studs: 0 },
    }, 'interior');
    assert.equal(both.baseRows.find((r) => r.key === 'studs').qtyFinal, 13 + 7);
    assert.equal(both.baseRows.find((r) => r.key === 'studs').tag.text, '+7');
  });

  test('new defaults exist for roof framing, permanent bracing, and connector fasteners', () => {
    for (const k of ['hipValley', 'ceilingJoist', 'subfascia', 'fascia', 'soffit', 'overhang']) {
      assert.ok(LOOSE_SECTION_DEFAULTS[k], `LOOSE_SECTION_DEFAULTS.${k}`);
    }
    assert.ok(BRACING_DEFAULTS.permanentTrusses);
    assert.ok(PANEL_NAIL_DEFAULTS.connectorFasteners);
  });
});
