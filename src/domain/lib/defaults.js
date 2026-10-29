// src/domain/lib/defaults.js
// Material each row starts with (family / size / vendor), matched by label
// against the material list. Rows with a saved choice are never changed.

const GP = 'Gillies & Prittie Warehouse';
const d = (family, size, vendor = GP) => ({ family, size, vendor });

/** Ground-level walls sit on pressure-treated plates. */
export const isGroundLevelName = (name = '') => /basement|cellar|ground|(\b|^)level\s*1(\b|$)|1st/i.test(String(name));

export function wallRowDefaults(variant, key, { groundLevel = false } = {}) {
  switch (key) {
    case 'bottomPlate': return d(groundLevel ? 'PT' : 'SPF#2', `2x6"-8'`);
    case 'topPlate':
    case 'blocking': return d('SPF#2', `2x6"-8'`);
    case 'studs': return d('SPF#2', `2x6"-10'`);
    case 'sheathing': return variant === 'exterior' ? d('Green Zip', `4x8'-7/16"`) : d('CDX SE', `4x8'-1/2"`);
    default: return null;
  }
}

export function wallExtraDefaults(type) {
  if (type === 'Headers infill' || type === 'Extra sheathing') return d('CDX SE', `4x8'-1/2"`);
  if (['Header', 'Post', 'Studs', 'Extra blocking'].includes(type)) return d('SPF#2', `2x6"-10'`);
  return null;
}

export const LOOSE_PANEL_DEFAULTS = {
  extBottomPT: d('PT', `2x6"-8'`),
  extTopPlate: d('SPF#2', `2x6"-8'`),
  panelBandSheathing: d('Green Zip', `4x8'-1/2"`),
  extraSheathing: d('CDX SE', `4x8'-1/2"`),
  zipTape: d('ZIP Flashing Tape', '3.75in x 75ft'),
  openingsBlocking: d('SPF#2', `2x6"-8'`),
  secondBottom: d('SPF#2', `2x6"-8'`),
  int2x6PT: d('PT', `2x6"-8'`),
  int2x6Plate: d('SPF#2', `2x6"-8'`),
  int2x4PT: d('PT', `2x4"-8'`),
  int2x4Plate: d('SPF#2', `2x4"-8'`),
  intCabinetBlocking: d('SPF#2', `2x10"-8'`),
};

export const PANEL_NAIL_DEFAULTS = {
  sheath: d('Bright Ring Coil', '8D-2-3/8x.113-2.7M', 'Concord'),
  frame8d: d('Galvanized Ring Coil', '8D-2-3/8"', 'Concord'),
  frame12d: d('Bright Common Coil', '12D-3-1/4x.120-2.5M', 'Concord'),
};

export const NAILS_BRACING_DEFAULTS = {
  nailsConcrete: d('Drive Pins with Washers (HD)', '3"-100s', 'Home Depot'),
  nailsSheathing: d('Bright Ring Coil', '8D-2-3/8x.113-2.7M', 'Concord'),
  nailsFraming: d('Bright Common Coil', '12D-3-1/4x.120-2.5M', 'Concord'),
  tempBracing: d('SPF#2', `2x4"-16'`),
};

export const LOOSE_SECTION_DEFAULTS = {
  foamSeal: d('FoamSeal', `5-1/2"x50'`, 'The Home Depot'),
  sillPlate: d('PT', `2x6"-16'`),
  blocking: d('PT', `2x6"-16'`),
  concreteNails: d('Drive Pins with Washers (HD)', '3"-100s', 'The Home Depot'),
  lallyColumn: d('Concrete column w/2plates', `3-1/2"x10'`, 'Concord'),
  rafter: d('SPF#2', `2x12"-16'`, 'Fairway Lumber'),
  ridge: d('LVL', '1-3/4x18"', 'BlueLinx'),
  hurricaneTies: d('Galvanized', 'H2.5A', 'Fastener Plus'),
  gable: d('SPF#2', `2x6"-16'`),
  gableStuds: d('SPF#2', `2x6"-10'`),
  sheathing: d('CDX SE', `4x8'-5/8"`),
  clips: d('PSCL Clip', '5/8"-250s', 'Fastener Plus'),
  eave: d('SPF#2', `2x6"-16'`),
  rake: d('SPF#2', `2x6"-16'`),
  trim: d('PVC Trim (V)', `1x8"-8'`, 'The Home Depot'),
  trimScrews: d('50lf Cortex Screws and plugs', '2"', 'The Home Depot'),
};

/** Manual loose rows carry their own suggestion (from the level template). */
export const looseRowDefaults = (row) =>
  row?.defaultFamily ? d(row.defaultFamily, row.defaultSize, row.defaultVendor || GP) : null;
