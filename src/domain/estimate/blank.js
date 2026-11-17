// src/domain/estimate/blank.js
// The blank pieces of a new estimate (levels, wall sections, loose rows and
// sections). Kept here, apart from React, so the pages and the assistant add
// things with the same defaults. ProjectContext also exposes them to pages.

export const generateId = (prefix = 'id-') => prefix + Math.random().toString(36).slice(2, 9);

export const blankSection = (props = {}) => ({
  id: generateId('section-'),
  name: "",
  lengthLF: 0,
  heightFt: 12,
  studSpacingIn: 16,
  studMultiplier: 1,
  kind: props.kind || 'partition',
  waste: { bottomPlate: 10, topPlate: 10, studs: 60, blocking: 10, sheathing: 20 },
  sel: { bottomPlate:null, topPlate:null, studs:null, blocking:null, sheathing:null },
  notes: {},
  extras: [],
  ...props,
});

export const blankLevel = (props = {}) => ({
  id: generateId('level-'),
  name: `Level ${props.index + 1 || 1}`,
  exteriorSections: [blankSection({ kind: 'exterior', name: 'Section 1' })],
  interiorSections: [blankSection({ kind: 'partition', name: 'Section 1' })],
  looseMaterials: {},
  panelNails: {},
  ...props,
});

export const blankTrussRow = (label, defaultAmount = 0) => ({
  id: generateId('truss-'),
  label: label,
  subtotal: defaultAmount,
});

// a Loose material row; the default vendor/family/size let the item picker preselect it
export const blankLooseRow = (type, vendor, family, size) => ({
  id: generateId('loose-item-'),
  type: type || 'Custom Item',
  item: null, 
  defaultVendor: vendor,
  defaultFamily: family,
  defaultSize: size,
  qty: 0,
  wastePct: 5,
  notes: '',
  plan: '',
  inputs: {},
});

export const blankLooseSection = (name = "New Section") => ({
  id: generateId('loose-sec-'),
  name: name,
  rows: [], 
  collapsed: false,
  inputs: {}, 
  sel: {},    
  waste: {},  
});

// a level's Loose material section ("1st Level", "2nd Level"…) with the usual floor rows
export const blankLevelLooseSection = (index) => {
    const n = index + 1;
    const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
    const name = `${n}${suffix} Level`;
    return {
        id: generateId('loose-sec-'),
        name: name,
        collapsed: false,
        inputs: {}, 
        sel: {},    
        waste: {},
        rows: [
            blankLooseRow("Rimboard", "Gillies & Prittie Warehouse", "SPF#2", `2x4"-16'`),
            blankLooseRow("Joist", "Gillies & Prittie Warehouse", "SPF#2", `2x12"-16'`),
            blankLooseRow("I-Joist", "Gillies & Prittie Warehouse", "NI-60 I-Joists", `2-1/2x14"`),
            blankLooseRow("Beams", "Gillies & Prittie Warehouse", "LVL", `1-3/4x9-1/2"`),
            blankLooseRow("Beams", "Gillies & Prittie Warehouse", "SPF#2", `2x12"-10'`),
            blankLooseRow("Blocking", "Gillies & Prittie Warehouse", "SPF#2", `2x12"-16'`),
            blankLooseRow("Subfloor", "Gillies & Prittie Warehouse", "OSB T&G", `4x8'-3/4"`),
            blankLooseRow("Glue", "Gillies & Prittie Warehouse", "Construction Adhesive", `28oz-ea`),
            blankLooseRow("Strapping", "Gillies & Prittie Warehouse", "Strapping", `1x3"-16'`),
        ]
    };
};

export const blankEstimateData = () => ({
  levels: [blankLevel({ index: 0 })],
  manufactureEstimate: {},
  bracing: {},
  trusses: [
    blankTrussRow("Roof Trusses & Hangers"),
    blankTrussRow("1st Floor Trusses & Hangers")
  ],
  looseList: [
    blankLooseSection("Foundation"),
    blankLooseSection("Basement"),
    blankLevelLooseSection(0), // the only section that starts with rows
    blankLooseSection("Roof"),
  ],
  summaryInfo: {
    projectName: "",
    address: "",
    drawingsDate: "",
    estimateDate: "",
    isTaxExempt: false,
    taxState: null,
    shipping: 0,
  },
  snapshotTotals: null 
});
