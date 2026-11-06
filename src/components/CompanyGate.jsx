// src/components/CompanyGate.jsx
// Shown after sign-in until the user belongs to a company: join by invitation,
// create the company (founders only, bringing their old projects along) or
// ask an admin for an invitation.
'use client';

import { useState } from 'react';
import { Building2, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '@/AuthContext';
import { useCompany } from '@/context/CompanyContext';
import { createCompany, importLegacy, companyBase } from '@/lib/company';
import { copyStarterCatalog } from '@/lib/catalog';
import { PageHeader } from '@/components/ui/mat';
import { roleLabel } from '@/domain/team';

export default function CompanyGate() {
  const { user, signOutUser } = useAuth();
  const { status, error, removed, invites, canFound, accept, decline, refresh } = useCompany();
  const [name, setName] = useState('');
  const [inventory, setInventory] = useState(true);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const run = async (label, fn) => {
    setBusy(label); setMsg('');
    try { await fn(); } catch (e) { setMsg(e?.message || String(e)); } finally { setBusy(''); }
  };

  const found = () => run('Creating the company…', async () => {
    const cid = await createCompany(user, name, { inventoryEnabled: inventory });
    setBusy('Bringing your projects and templates over…');
    await importLegacy(user, cid, (d) => setBusy(`Bringing your projects over… ${d.projects || 0} projects`));
    setBusy('Copying the starter price list…');
    await copyStarterCatalog({ base: companyBase(cid), onProgress: (c) => setBusy(`Copying the starter price list… ${c.prices} prices`) })
      .catch((e) => console.warn('Starter price list not copied:', e));
    await refresh();
  });

  if (status === 'loading') {
    return <div className="app-content"><div className="empty-state">Loading your company…</div></div>;
  }

  return (
    <div className="app-content">
      <PageHeader icon={Building2} title="Company" />
      <div className="ew-card gate-card">
        {status === 'error' ? (
          <>
            <p>Your company could not be read: {error}</p>
            <button type="button" className="ew-btn" onClick={refresh}><RefreshCw size={13} /> Try again</button>
          </>
        ) : status === 'invited' ? (
          <>
            <h3>You have an invitation</h3>
            {invites.map((inv) => (
              <div key={inv.companyId} className="gate-invite">
                <div>
                  <strong>{inv.companyName || 'A company'}</strong>
                  <span className="ew-subtle"> · {inv.roles.map(roleLabel).join(', ') || 'view only'}{inv.invitedBy?.name ? ` · from ${inv.invitedBy.name}` : ''}</span>
                </div>
                <button type="button" className="ew-btn ew-btn--primary" disabled={!!busy} onClick={() => run('Joining…', () => accept(inv))}>Join</button>
                <button type="button" className="ew-btn ew-btn--ghost" disabled={!!busy} onClick={() => run('Declining…', () => decline(inv))}>Decline</button>
              </div>
            ))}
          </>
        ) : canFound ? (
          <>
            <h3>Create your company</h3>
            <p className="ew-subtle">Projects, templates and the inventory belong to the company. You will be its Admin, Estimator and Warehouse; invite the rest of the team afterwards. Your existing projects and templates come along, and the company starts with a copy of the starter price list to make its own.</p>
            <label className="fld" style={{ '--w': '320px' }}>
              <span>Company name</span>
              <input className="ew-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Framing" autoFocus />
            </label>
            <label className="pv-check">
              <input type="checkbox" checked={inventory} onChange={(e) => setInventory(e.target.checked)} />
              We keep materials in our own warehouse (inventory). Turn it off if materials are ordered straight from suppliers; it can be changed later.
            </label>
            <div><button type="button" className="ew-btn ew-btn--primary" disabled={!name.trim() || !!busy} onClick={found}>Create company</button></div>
          </>
        ) : (
          <>
            <h3>{removed ? 'You are no longer part of a company' : 'Not part of a company yet'}</h3>
            <p>The account <strong>{user?.email}</strong> has no access. Ask your company&apos;s admin to invite this email, then sign in again.</p>
            <div className="gate-actions">
              <button type="button" className="ew-btn" onClick={refresh}><RefreshCw size={13} /> Check again</button>
              <button type="button" className="ew-btn ew-btn--ghost" onClick={signOutUser}><LogOut size={13} /> Use another account</button>
            </div>
          </>
        )}
        {busy ? <p className="ew-subtle">{busy}</p> : null}
        {msg ? <p className="gate-err">{msg}</p> : null}
      </div>
    </div>
  );
}
