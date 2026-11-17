// src/domain/assistant/history.js
/**
 * Earlier turns for the model: user and model taking turns, starting with the
 * user. Notes ("Applied.") and errors are left out; turns of the same role in
 * a row are joined, since the model rejects them.
 */
export function chatHistory(messages, max = 12) {
  const turns = [];
  for (const m of messages) {
    if (!m.text || m.error || m.note) continue;
    const last = turns[turns.length - 1];
    if (last && last.role === m.role) last.text += `\n${m.text}`;
    else turns.push({ role: m.role, text: m.text });
  }
  let out = turns.slice(-max);
  while (out.length && out[0].role !== 'user') out = out.slice(1);
  // the request about to be sent is a user turn: the history must end with the model
  while (out.length && out[out.length - 1].role !== 'model') out = out.slice(0, -1);
  return out;
}
