// src/components/ReviewList.jsx
// Quality reviews of estimates: the reviewer marks one checked or sends it
// back with notes; whoever asked may withdraw it while it waits.
'use client';

import { useState } from 'react';
import { Check, X, Undo2 } from 'lucide-react';
import { fmtMoney } from '@/components/ui/mat';
import { decideReview, withdrawReview } from '@/lib/projects';
import { REVIEW_STATUS_LABEL } from '@/domain/quality';

const fmtDay = (ts) => (ts?.toDate ? ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

/** Whether this person may answer the review (not the one who asked; the one named, if any). */
export const canAnswer = (r, user, perms) => r.status === 'pending' && Boolean(perms?.canEditEstimate || perms?.isAdmin)
  && r.requestedBy?.uid !== user?.uid && (!r.reviewer || r.reviewer.uid === user?.uid);

function Row({ r, cid, user, perms, showProject, onChanged, onOpenProject }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const mine = r.requestedBy?.uid === user?.uid;
  const answer = canAnswer(r, user, perms);
  const run = async (fn, m) => {
    setBusy(true); setErr('');
    try { await fn(); onChanged(m, r); } catch (e) { setErr(e?.message || String(e)); } finally { setBusy(false); }
  };
  return (
    <div className={`co-row rv-row--${r.status}`}>
      <div className="co-row__head">
        {showProject ? <button type="button" className="ew-link" onClick={() => onOpenProject?.(r.projectId)}><strong>{r.projectName}</strong></button> : null}
        <span className={`co-st rv-st--${r.status}`}>{REVIEW_STATUS_LABEL[r.status] || r.status}</span>
        <span>{fmtMoney(r.grandTotal)}</span>
        <span className="ew-subtle">{r.requestedBy?.name} → {r.reviewer?.name || 'any estimator'} · {fmtDay(r.requestedAt)}</span>
        {r.checks?.errors || r.checks?.warnings ? <span className="ew-subtle">automatic check: {r.checks.errors} errors, {r.checks.warnings} warnings</span> : null}
      </div>
      {r.message ? <p className="co-row__msg">“{r.message}”</p> : null}
      {r.status !== 'pending' && r.decidedBy ? (
        <p className="ew-subtle co-row__msg">{REVIEW_STATUS_LABEL[r.status]} by {r.decidedBy.name || r.decidedBy.email} · {fmtDay(r.decidedAt)}{r.note ? `: “${r.note}”` : ''}</p>
      ) : null}
      {answer || (mine && r.status === 'pending') ? (
        <div className="co-row__acts">
          {answer ? (
            <>
              <input className="ew-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notes, e.g. 2nd floor missing the hold-downs" />
              <button type="button" className="ew-btn ew-btn--primary" disabled={busy} onClick={() => run(() => decideReview(cid, r, true, note, user), `${r.projectName}: checked.`)}><Check size={12} /> Checked</button>
              <button type="button" className="ew-btn" disabled={busy || !note.trim()} title={note.trim() ? '' : 'Write what needs to change'} onClick={() => run(() => decideReview(cid, r, false, note, user), `${r.projectName}: sent back with notes.`)}><X size={12} /> Needs changes</button>
            </>
          ) : null}
          {mine && r.status === 'pending' ? <button type="button" className="ew-btn ew-btn--ghost" disabled={busy} onClick={() => run(() => withdrawReview(cid, r, user), 'Review withdrawn.')}><Undo2 size={12} /> Withdraw</button> : null}
        </div>
      ) : null}
      {err ? <p className="gate-err">{err}</p> : null}
    </div>
  );
}

export default function ReviewList({ reviews, empty = 'No reviews.', ...rest }) {
  if (!reviews?.length) return <div className="empty-state">{empty}</div>;
  return <div className="co-list">{reviews.map((r) => <Row key={r.id} r={r} {...rest} />)}</div>;
}
