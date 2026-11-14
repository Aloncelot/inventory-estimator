// src/domain/presence.js
// Who has a project open, and who may edit it. Each open project writes a
// small presence document per person that it refreshes every HEARTBEAT_MS;
// one older than TTL_MS is someone who left (closed the tab, lost the
// connection). One person edits at a time: among those editing, the one who
// started last (took over last) holds the project; everybody else sees it.
// Pure functions.

export const HEARTBEAT_MS = 25000;
export const TTL_MS = 75000;
// a tab in the background stops writing: it leaves one mark (away) that holds
// its place, and the project, for this long
export const AWAY_TTL_MS = 30 * 60 * 1000;

const ms = (t) => (t?.toMillis ? t.toMillis() : t instanceof Date ? t.getTime() : Number(t) || 0);

/** People with the project open now, the most recent editor first, then by name. */
export function activeOf(list = [], now = Date.now()) {
  return list.filter((p) => p && now - ms(p.at) < (p.away ? AWAY_TTL_MS : TTL_MS))
    .sort((a, b) => (b.editing - a.editing) || ms(b.editSince) - ms(a.editSince) || String(a.name).localeCompare(String(b.name)));
}

/** Who holds the project for editing (null: nobody). */
export function holderOf(active = []) {
  return active.filter((p) => p.editing).sort((a, b) => ms(b.editSince) - ms(a.editSince))[0] || null;
}

/** Two letters for a person: "Maria Lopez" → "ML", "joe@acme.com" → "JO". */
export function initialsOf(name = '') {
  const s = String(name).split('@')[0].trim();
  const parts = s.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase() || '?';
}

const PALETTE = ['#4a7fd4', '#c4632b', '#3f8a4f', '#8a4fb0', '#b0892c', '#2b9a9a', '#c43f6e', '#5b6b7a'];
/** A steady color per person. */
export function colorOf(uid = '') {
  let h = 0;
  for (const c of String(uid)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/**
 * Whether saving would overwrite someone else's save: the estimate on the
 * server is not the one this screen started from.
 */
export const isConflict = (baseAt, serverAt) => Boolean(baseAt && serverAt && ms(baseAt) !== ms(serverAt));
