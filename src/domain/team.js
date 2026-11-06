// src/domain/team.js
// Companies, roles and the change history: the pure part (no Firebase).
//
// Roles combine freely; a member may hold any of them.
//   admin     — members, invitations and company settings (inventory, warehouses)
//   estimator — create and edit projects, templates and the price lists
//   warehouse — the inventory (stock, movements) when the company keeps one
// Everyone in the company can see everything; the role decides who changes it.

export const ROLES = [
  { key: 'admin', label: 'Admin', hint: 'Members, invitations and company settings' },
  { key: 'estimator', label: 'Estimator', hint: 'Creates and edits estimates, templates and price lists' },
  { key: 'warehouse', label: 'Warehouse', hint: 'Manages the inventory: stock and movements' },
];
const ROLE_KEYS = ROLES.map((r) => r.key);

/** Known roles only, in a fixed order, no repeats. */
export function normalizeRoles(roles) {
  const set = new Set(Array.isArray(roles) ? roles : []);
  return ROLE_KEYS.filter((k) => set.has(k));
}

export const roleLabel = (key) => ROLES.find((r) => r.key === key)?.label || key;

/** What a member may do. Inventory needs the company to keep one. */
export function permissionsOf(roles, company = {}) {
  const r = new Set(normalizeRoles(roles));
  const inventory = Boolean(company?.inventoryEnabled);
  return {
    isMember: r.size > 0,
    isAdmin: r.has('admin'),
    canEditEstimate: r.has('estimator'),
    canEditInventory: inventory && r.has('warehouse'),
    inventoryEnabled: inventory,
  };
}

export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail(e));

/** The person who made a change, as stored with it. */
export function actorOf(user) {
  if (!user) return null;
  return { uid: user.uid, email: normEmail(user.email), name: user.displayName || normEmail(user.email) };
}

/** Admins left after a change; the company must always keep one. */
export function adminsAfter(members, uid, roles) {
  return members.filter((m) => (m.uid === uid ? normalizeRoles(roles) : normalizeRoles(m.roles)).includes('admin')).length;
}

/* ── warehouses ─────────────────────────────────────────────────────── */

const whId = () => `wh-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function addWarehouse(list, name) {
  const n = String(name || '').trim();
  if (!n) return list || [];
  return [...(list || []), { id: whId(), name: n, address: '' }];
}

/* ── what changed between two saves ─────────────────────────────────── */

const TOP_LABELS = {
  summaryInfo: 'Summary',
  scope: 'Scope',
  labor: 'Labor',
  trusses: 'Trusses',
  trussEstimate: 'Trusses',
  looseList: 'Loose material',
  bracing: 'Bracing',
  manufactureEstimate: 'Panel manufacture',
  quote: 'Quote',
  takeoff: 'Takeoff list',
  layout: 'Layout check',
  headerSchedule: 'Header schedule',
  notes: 'Notes',
};
const LEVEL_LABELS = {
  plan: 'Plan takeoff',
  exteriorSections: 'Wall panels',
  interiorSections: 'Wall panels',
  looseMaterials: 'Loose material',
  panelNails: 'Panel nails',
  name: 'Renamed',
};
// view settings and derived numbers: not worth a line in the history
const IGNORE = new Set(['snapshotTotals', 'planDisplay']);

/**
 * Short list of what changed, e.g. ["1st Level · Plan takeoff", "Labor"].
 * Updates are immutable, so an untouched part keeps the same object.
 */
export function changeSummary(prev, next) {
  if (!prev || !next || prev === next) return [];
  const out = [];
  const add = (s) => { if (!out.includes(s)) out.push(s); };
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    if (IGNORE.has(k) || prev[k] === next[k]) continue;
    if (k !== 'levels') { add(TOP_LABELS[k] || k); continue; }
    const before = new Map((prev.levels || []).map((l) => [l.id, l]));
    const after = new Map((next.levels || []).map((l) => [l.id, l]));
    for (const [id, l] of after) {
      const old = before.get(id);
      const name = l.name || 'Level';
      if (!old) { add(`${name} · Added`); continue; }
      if (old === l) continue;
      const lk = new Set([...Object.keys(old), ...Object.keys(l)]);
      let any = false;
      for (const f of lk) {
        if (old[f] === l[f] || f === 'id') continue;
        any = true;
        add(`${name} · ${LEVEL_LABELS[f] || f}`);
      }
      if (!any) add(name);
    }
    for (const [id, l] of before) if (!after.has(id)) add(`${l.name || 'Level'} · Removed`);
  }
  return out;
}

/** Join two summaries (an entry that grows over a session). */
export function mergeSummary(a, b, max = 30) {
  const out = [...(a || [])];
  for (const s of b || []) if (!out.includes(s)) out.push(s);
  return out.slice(0, max);
}

/** A history entry keeps growing while the same person keeps working. */
export const HISTORY_SESSION_MS = 15 * 60 * 1000;
export function continuesEntry(last, uid, now) {
  return Boolean(last && last.by?.uid === uid && now - last.atMs < HISTORY_SESSION_MS);
}

/* ── invitation email (opens the user's own mail app) ───────────────── */

/** A mailto: link with the invitation written out; nothing is sent by the app. */
export function inviteMailto({ email, roles, companyName, inviterName, appUrl }) {
  const roleText = normalizeRoles(roles).map(roleLabel).join(', ') || 'view only';
  const company = companyName || 'our company';
  const subject = `You're invited to ${company} on Inventory Estimator`;
  const body = [
    'Hi,',
    '',
    `${inviterName || 'I'} invited you to join ${company} on Inventory Estimator as: ${roleText}.`,
    '',
    `1. Open ${appUrl}`,
    `2. Sign in with Google using this email: ${normEmail(email)}`,
    '3. Click "Join" on the invitation.',
    '',
    'Thanks!',
  ].join('\n');
  return `mailto:${encodeURIComponent(normEmail(email))}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/* ── project size (Firestore keeps up to 1 MB per document) ─────────── */

export const DOC_LIMIT_BYTES = 1048576;
export const DOC_WARN_BYTES = 700 * 1024;

/** About how much a document weighs in Firestore (UTF-8 JSON is a close, slightly high guess). */
export function approxDocBytes(data) {
  try { return new TextEncoder().encode(JSON.stringify(data)).length; } catch { return 0; }
}
export const fmtKB = (bytes) => `${Math.round((Number(bytes) || 0) / 1024).toLocaleString('en-US')} KB`;
