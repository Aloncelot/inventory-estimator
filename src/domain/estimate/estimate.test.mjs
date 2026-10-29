// Unit tests for the estimate calculations. Run with: npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWallSection, computeLevel, computePanelNails, computeLoosePanel, computeNailsAndBracing,
  computeManufacture, computeWallPanels, computeLooseSection, computeLoose, computeProject,
  sectionAddonPerLF, pieceLength, wallPanelsOf,
} from './index.js';
import { migrateEstimate } from './migrate.js';
import { slimItem, slimEstimate, priceDateOf } from '../lib/selection.js';
import { isGroundLevelName, wallRowDefaults } from '../lib/defaults.js';

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

describe('nails', () => {
  test('panel nails from level sheets / boards / bottom plates', () => {
    const n = computePanelNails({ waste: { sheath: 0, frame8d: 0, frame12d: 0 } }, { panelSheets: 270, bottomPlatePieces: 250, ptBoards: 108 });
    const q = Object.fromEntries(n.baseRows.map((r) => [r.key, r.qtyFinal]));
    assert.deepEqual(q, { sheath: 8, frame8d: 1, frame12d: 8 });
  });

  test('nails & bracing: temporary bracing = panels × 3', () => {
    const n = computeNailsAndBracing({}, { panelsAll: 10 });
    assert.equal(n.baseRows.find((r) => r.key === 'tempBracing').qtyFinal, 30);
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
    const lvl = computeLevel(est.levels[0]);
    assert.equal(lvl.derived.extLengthSum, 80);
    assert.equal(lvl.derived.int2x4LF, 40);
    assert.equal(lvl.total, Math.round((lvl.exteriorTotal + lvl.interiorTotal + lvl.panelNails.total + lvl.loose.subtotal) * 100) / 100);
    const wp = computeWallPanels(est);
    assert.equal(wp.lf.exteriorWalls, 80);
    assert.equal(wp.lf.interiorNonLoad, 40);
    assert.equal(wp.total, Math.round((lvl.total + wp.nails.total + wp.manufacture.total) * 100) / 100);
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

describe('defaults', () => {
  test('ground level walls start on PT bottom plates', () => {
    assert.equal(wallRowDefaults('exterior', 'bottomPlate', { groundLevel: true }).family, 'PT');
    assert.equal(wallRowDefaults('exterior', 'bottomPlate').family, 'SPF#2');
    assert.ok(isGroundLevelName('Basement'));
    assert.ok(!isGroundLevelName('Level 2'));
  });
});
