import test from 'node:test';
import assert from 'node:assert/strict';
import { activeOf, holderOf, initialsOf, colorOf, isConflict, TTL_MS } from './presence.js';

test('who is here and who holds the project', () => {
  const now = 1_000_000;
  const list = [
    { uid: 'a', name: 'Ana', at: now - 1000, editing: true, editSince: now - 50000 },
    { uid: 'b', name: 'Bo', at: now - 2000, editing: true, editSince: now - 10000 },   // took over later
    { uid: 'c', name: 'Cy', at: now - 3000, editing: false },
    { uid: 'd', name: 'Di', at: now - TTL_MS - 1, editing: true, editSince: now },       // left
  ];
  const act = activeOf(list, now);
  assert.deepEqual(act.map((p) => p.uid), ['b', 'a', 'c']);
  assert.equal(holderOf(act).uid, 'b');
  assert.equal(holderOf([{ uid: 'c', editing: false }]), null);
});

test('initials, colors, conflicts', () => {
  assert.equal(initialsOf('Maria Lopez'), 'ML');
  assert.equal(initialsOf('joe@acme.com'), 'JO');
  assert.equal(colorOf('u1'), colorOf('u1'));
  assert.ok(isConflict(100, 200));
  assert.ok(!isConflict(100, 100));
  assert.ok(!isConflict(null, 200), 'a project saved before versions existed');
});

test('a tab in the background stays present (away) without writing, up to 30 minutes', async () => {
  const { AWAY_TTL_MS } = await import('./presence.js');
  const now = 10_000_000;
  const list = [
    { uid: 'a', name: 'Ana', at: now - 20 * 60 * 1000, away: true, editing: true, editSince: 1 },
    { uid: 'b', name: 'Bo', at: now - AWAY_TTL_MS - 1, away: true },
    { uid: 'c', name: 'Cy', at: now - 2 * 60 * 1000 },          // visible but silent: left
  ];
  assert.deepEqual(activeOf(list, now).map((p) => p.uid), ['a']);
  assert.equal(holderOf(activeOf(list, now)).uid, 'a', 'still holds the project');
});
