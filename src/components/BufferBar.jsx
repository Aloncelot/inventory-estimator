// src/components/BufferBar.jsx
// The error buffer of a page (wall panels or loose material): a % of the
// materials at cost for what the takeoff may miss. 10% unless changed here.
'use client';

import { NumInput, fmtMoney } from '@/components/ui/mat';
import { bufferPctOf } from '@/domain/markup';

export default function BufferBar({ est, part, base, updateProject, readOnly, note }) {
  const pct = bufferPctOf(est, part);
  const amount = Math.round(base * pct) / 100;
  const set = (v) => updateProject((prev) => ({ ...prev, buffers: { ...(prev.buffers || {}), [part]: Math.max(0, Number(v) || 0) } }));
  return (
    <div className="buf-bar" title="A contingency for what the takeoff may miss. Added to the materials before the markup; Summary and the Quote include it.">
      <strong>Error buffer</strong>
      {readOnly ? <span>{pct}%</span> : <NumInput w={56} step="1" value={pct} onCommit={set} aria-label="Error buffer %" />}
      <span className="ew-subtle">% of {fmtMoney(base)} in materials{note ? ` ${note}` : ''} =</span>
      <strong>{fmtMoney(amount)}</strong>
      <span className="ew-subtle">· with it: {fmtMoney(base + amount)}</span>
    </div>
  );
}
