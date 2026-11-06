// src/components/TeamView.jsx
// Company & team: settings (name, inventory, warehouses), members and their
// roles, invitations. Everyone sees it; only an Admin changes it.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users, UserPlus, Trash2, Plus, X, Download, Mail } from 'lucide-react';
import { useAuth } from '@/AuthContext';
import { useCompany } from '@/context/CompanyContext';
import { useProject } from '@/context/ProjectContext';
import { PageHeader } from '@/components/ui/mat';
import { useConfirm } from '@/components/ui/confirm';
import {
  listMembers, setMemberRoles, removeMember, listInvites, inviteMember, cancelInvite,
  updateCompany, legacyCounts, importLegacy,
} from '@/lib/company';
import { ROLES, normalizeRoles, adminsAfter, addWarehouse, isEmail, normEmail, inviteMailto } from '@/domain/team';

const fmtWhen = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function RolePicks({ value, onChange, disabled }) {
  const set = new Set(value);
  return (
    <span className="role-picks">
      {ROLES.map((r) => (
        <label key={r.key} className={`role-pick${set.has(r.key) ? ' is-on' : ''}`} title={r.hint}>
          <input
            type="checkbox"
            checked={set.has(r.key)}
            disabled={disabled}
            onChange={(e) => {
              const next = new Set(set);
              if (e.target.checked) next.add(r.key); else next.delete(r.key);
              onChange(normalizeRoles([...next]));
            }}
          />
          {r.label}
        </label>
      ))}
    </span>
  );
}

export default function TeamView() {
  const { user } = useAuth();
  const { company, companyId, perms } = useCompany();
  const { fetchProjectsList, appId } = useProject();
  const confirm = useConfirm();
  const admin = perms.isAdmin;
  const uid = user?.uid;
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState('');
  const [newRoles, setNewRoles] = useState(['estimator']);
  const [whName, setWhName] = useState('');
  const [msg, setMsg] = useState('');
  const [legacy, setLegacy] = useState(null);
  const [busy, setBusy] = useState(false);
  const [justInvited, setJustInvited] = useState(null);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    try {
      setMembers(await listMembers(companyId));
      setInvites(admin ? await listInvites(companyId) : []);
    } catch (e) { setMsg(e?.message || String(e)); }
  }, [companyId, admin]);
  useEffect(() => { refresh(); }, [refresh]);

  // anything left in the old personal workspace (before companies existed)
  useEffect(() => {
    if (!uid || !perms.canEditEstimate) return;
    legacyCounts(uid).then(setLegacy).catch(() => setLegacy(null));
  }, [uid, perms.canEditEstimate]);

  const act = async (fn, ok) => {
    setMsg('');
    try { await fn(); if (ok) setMsg(ok); await refresh(); } catch (e) { setMsg(e?.message || String(e)); }
  };

  if (!company) return null;

  const mailto = (iv) => inviteMailto({
    email: iv.email,
    roles: iv.roles,
    companyName: company.name,
    inviterName: user?.displayName || user?.email,
    appUrl: typeof window !== 'undefined' ? window.location.origin : '',
  });

  const changeRoles = (m, roles) => {
    if (adminsAfter(members, m.uid, roles) === 0) { setMsg('The company needs at least one Admin.'); return; }
    act(() => setMemberRoles(companyId, m.uid, roles, user));
  };
  const remove = async (m) => {
    if (adminsAfter(members.filter((x) => x.uid !== m.uid), null, []) === 0) { setMsg('The company needs at least one Admin.'); return; }
    if (!(await confirm({ title: `Remove ${m.name || m.email}?`, message: 'They will lose access to the company. Their past changes stay in the history.', confirmLabel: 'Remove', tone: 'danger' }))) return;
    act(() => removeMember(companyId, m.uid), `${m.email} was removed.`);
  };
  const invite = (e) => {
    e.preventDefault();
    const em = normEmail(email);
    if (!isEmail(em)) { setMsg('Write a valid email.'); return; }
    if (members.some((m) => m.email === em)) { setMsg(`${em} is already a member.`); return; }
    const roles = newRoles;
    act(async () => { await inviteMember(companyId, company.name, em, roles, user); setEmail(''); setJustInvited({ email: em, roles }); },
      `Invitation saved. ${em} joins by signing in with that Google account.`);
  };
  const setCompany = (patch) => act(() => updateCompany(companyId, patch, user));
  const warehouses = company.warehouses || [];
  const doImport = async () => {
    setBusy(true);
    await act(async () => {
      const d = await importLegacy(user, companyId);
      setLegacy(await legacyCounts(user.uid));
      fetchProjectsList(appId);
      setMsg(`Imported ${d.projects} projects, ${d.laborTemplates + d.headerSchedules} templates and ${d.noteImages} images (anything already here was kept).`);
    });
    setBusy(false);
  };
  const legacyTotal = legacy ? Object.values(legacy).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="app-content">
      <PageHeader icon={Users} title="Company & team" meta={`${members.length} member${members.length === 1 ? '' : 's'}`} />
      {!admin ? <p className="ew-subtle">Only an Admin can change the company, its members and invitations.</p> : null}
      {msg ? (
        <p className="team-msg">
          {msg}
          {justInvited && msg.startsWith('Invitation saved') ? (
            <a className="ew-btn ew-btn--primary team-mail" href={mailto(justInvited)}><Mail size={13} /> Email the invitation</a>
          ) : null}
        </p>
      ) : null}

      <section className="ew-card team-card">
        <h3>Company</h3>
        <div className="team-row">
          <label className="fld" style={{ '--w': '280px' }}>
            <span>Name</span>
            <input
              className="ew-input"
              defaultValue={company.name}
              key={company.name}
              disabled={!admin}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== company.name) setCompany({ name: v }); }}
            />
          </label>
          <label className="fld" style={{ '--w': '150px' }} title="What a new project starts with. Each project can change its own in Summary; the price list holds supplier prices without markup.">
            <span>Material markup (%)</span>
            <input
              className="ew-input num"
              type="number"
              min="0"
              step="0.5"
              defaultValue={company.materialMarkupPct ?? ''}
              key={`mk-${company.materialMarkupPct}`}
              disabled={!admin}
              placeholder="e.g. 25"
              onBlur={(e) => {
                const v = e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0);
                if (v !== (company.materialMarkupPct ?? null)) setCompany({ materialMarkupPct: v });
              }}
            />
          </label>
          <label className="pv-check" title="Off when the company orders materials straight from suppliers and keeps no stock">
            <input type="checkbox" checked={Boolean(company.inventoryEnabled)} disabled={!admin} onChange={(e) => setCompany({ inventoryEnabled: e.target.checked })} />
            Inventory (we keep materials in our own warehouses)
          </label>
        </div>
        {company.inventoryEnabled ? (
          <div className="team-wh">
            <span className="ew-subtle">Warehouses</span>
            {warehouses.map((w) => (
              <span key={w.id} className="ew-chip">
                <input
                  className="ew-input team-wh__name"
                  defaultValue={w.name}
                  key={w.name}
                  disabled={!admin}
                  aria-label="Warehouse name"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== w.name) setCompany({ warehouses: warehouses.map((x) => (x.id === w.id ? { ...x, name: v } : x)) });
                  }}
                />
                {admin && warehouses.length > 1 ? (
                  <button type="button" className="ew-icon-btn" aria-label={`Remove ${w.name}`} title="Remove warehouse" onClick={() => setCompany({ warehouses: warehouses.filter((x) => x.id !== w.id) })}><X size={12} /></button>
                ) : null}
              </span>
            ))}
            {admin ? (
              <form className="team-wh__add" onSubmit={(e) => { e.preventDefault(); if (whName.trim()) { setCompany({ warehouses: addWarehouse(warehouses, whName) }); setWhName(''); } }}>
                <input className="ew-input" value={whName} onChange={(e) => setWhName(e.target.value)} placeholder="New warehouse" aria-label="New warehouse name" />
                <button type="submit" className="ew-btn ew-btn--ghost" disabled={!whName.trim()}><Plus size={13} /> Add</button>
              </form>
            ) : null}
          </div>
        ) : <p className="ew-subtle">Inventory is off: materials are ordered straight from suppliers.</p>}
      </section>

      <section className="ew-card team-card">
        <h3>Members</h3>
        <table className="tbl team-tbl">
          <colgroup><col /><col className="team-c-roles" /><col className="team-c-x" /></colgroup>
          <thead><tr><th>Member</th><th>Roles</th><th /></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.uid}>
                <td>
                  <strong>{m.name || m.email}</strong>{m.uid === user?.uid ? <span className="ew-subtle"> (you)</span> : null}
                  <div className="ew-subtle">{m.email}</div>
                </td>
                <td><RolePicks value={normalizeRoles(m.roles)} disabled={!admin} onChange={(r) => changeRoles(m, r)} /></td>
                <td className="num">
                  {admin && m.uid !== user?.uid ? <button type="button" className="ew-icon-btn" onClick={() => remove(m)} aria-label={`Remove ${m.email}`} title="Remove from the company"><Trash2 size={13} /></button> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ew-subtle team-legend">
          {ROLES.map((r) => <span key={r.key}><strong>{r.label}</strong>: {r.hint}. </span>)}
          Without a role a member can see everything but change nothing.
        </p>
      </section>

      {admin ? (
        <section className="ew-card team-card">
          <h3>Invitations</h3>
          <form className="team-row" onSubmit={invite}>
            <label className="fld" style={{ '--w': '260px' }}>
              <span>Google account email</span>
              <input className="ew-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
            </label>
            <RolePicks value={newRoles} onChange={setNewRoles} />
            <button type="submit" className="ew-btn ew-btn--primary" disabled={!email.trim()}><UserPlus size={13} /> Invite</button>
          </form>
          <p className="ew-subtle">The app sends no email by itself: the ✉ button opens your mail app with the invitation already written (link, roles and steps), you just press Send.</p>
          {invites.length ? (
            <table className="tbl team-tbl">
              <colgroup><col /><col className="team-c-roles" /><col className="team-c-x" /></colgroup>
              <thead><tr><th>Pending</th><th>Roles</th><th /></tr></thead>
              <tbody>
                {invites.map((iv) => (
                  <tr key={iv.email}>
                    <td>{iv.email}<div className="ew-subtle">{iv.invitedBy?.name ? `by ${iv.invitedBy.name} · ` : ''}{fmtWhen(iv.invitedAt)}</div></td>
                    <td>{iv.roles.map((k) => ROLES.find((r) => r.key === k)?.label || k).join(', ') || 'View only'}</td>
                    <td className="num">
                      <a className="ew-icon-btn" href={mailto(iv)} aria-label={`Email the invitation to ${iv.email}`} title="Email the invitation (opens your mail app)"><Mail size={13} /></a>
                      <button type="button" className="ew-icon-btn" onClick={() => act(() => cancelInvite(companyId, iv.email))} aria-label={`Cancel invitation for ${iv.email}`} title="Cancel invitation"><X size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      ) : null}

      {legacyTotal > 0 ? (
        <section className="ew-card team-card">
          <h3>Your previous workspace</h3>
          <p className="ew-subtle">
            Before companies, your work was kept under your own account: {legacy.projects} projects, {legacy.laborTemplates + legacy.headerSchedules} templates, {legacy.noteImages} note images.
            Import copies whatever is not in the company yet; nothing already here is overwritten.
          </p>
          <div><button type="button" className="ew-btn" disabled={busy} onClick={doImport}><Download size={13} /> {busy ? 'Importing…' : 'Import into the company'}</button></div>
        </section>
      ) : null}
    </div>
  );
}
