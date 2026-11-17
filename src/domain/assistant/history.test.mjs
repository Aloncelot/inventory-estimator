import test from 'node:test';
import assert from 'node:assert/strict';
import { chatHistory } from './history.js';

test('history: user and model take turns, notes and errors left out', () => {
  const h = chatHistory([
    { role: 'user', text: 'walls are delayed 1 week' }, { role: 'model', text: 'Done.' }, { role: 'model', text: 'Applied.', note: true },
    { role: 'user', text: 'x' }, { role: 'model', text: 'failed', error: true }, { role: 'user', text: 'y' }, { role: 'model', text: 'ok' },
  ]);
  assert.deepEqual(h.map((t) => t.role), ['user', 'model', 'user', 'model']);
  assert.equal(h[2].text, 'x\ny');
  assert.deepEqual(chatHistory([{ role: 'model', text: 'hi' }]), []);
  assert.deepEqual(chatHistory([{ role: 'user', text: 'a' }]), []); // must end with the model
});
