// src/context/CompanyContext.jsx
// The signed-in user's company, roles and permissions. The member and company
// documents are watched live, so a role change by an admin applies at once.
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/AuthContext';
import { findMembership, acceptInvite, declineInvite, createCompany, companyBase } from '@/lib/company';
import { permissionsOf, normalizeRoles } from '@/domain/team';
import { isAllowedEmail } from '@/lib/allowedUsers';
import { setCatalogBase } from '@/lib/catalog';

const CompanyContext = createContext({ status: 'loading', perms: permissionsOf([]) });

export function CompanyProvider({ children }) {
  const { user } = useAuth();
  // loading | member | invited | none | error
  const [state, setState] = useState({ status: 'loading' });
  const [company, setCompany] = useState(null);
  const [member, setMember] = useState(null);

  const resolve = useCallback(async () => {
    if (!user) { setState({ status: 'loading' }); return; }
    setState({ status: 'loading' });
    try {
      setState(await findMembership(user));
    } catch (e) {
      console.error('Company lookup failed:', e);
      setState({ status: 'error', error: e?.message || String(e) });
    }
  }, [user]);

  useEffect(() => { resolve(); }, [resolve]);

  const companyId = state.status === 'member' ? state.companyId : null;
  useEffect(() => {
    if (!companyId || !user) { setCompany(null); setMember(null); return undefined; }
    const offC = onSnapshot(doc(db, 'companies', companyId), (s) => setCompany(s.exists() ? { id: s.id, ...s.data() } : null), () => setCompany(null));
    const offM = onSnapshot(doc(db, `companies/${companyId}/members/${user.uid}`), (s) => {
      if (s.exists()) setMember({ uid: s.id, ...s.data() });
      else { setMember(null); setState({ status: 'none', removed: true }); }   // removed by an admin
    }, () => setMember(null));
    return () => { offC(); offM(); };
  }, [companyId, user]);

  const accept = useCallback(async (invite) => { await acceptInvite(user, invite); await resolve(); }, [user, resolve]);
  const decline = useCallback(async (invite) => { await declineInvite(user, invite); await resolve(); }, [user, resolve]);
  const create = useCallback(async (name, opts) => { const id = await createCompany(user, name, opts); await resolve(); return id; }, [user, resolve]);

  const roles = useMemo(() => normalizeRoles(member?.roles), [member]);
  const perms = useMemo(() => permissionsOf(roles, company || {}), [roles, company]);
  const ready = Boolean(companyId && company && member);

  // the price list in use is the company's own (set before the pages render)
  setCatalogBase(ready ? companyBase(companyId) : null);

  const value = useMemo(() => ({
    status: ready ? 'ready' : state.status === 'member' ? 'loading' : state.status,
    error: state.error,
    removed: state.removed,
    invites: state.invites || [],
    canFound: Boolean(user && isAllowedEmail(user.email)),
    companyId: ready ? companyId : null,
    base: ready ? companyBase(companyId) : null,
    company: ready ? company : null,
    member,
    roles,
    perms,
    accept,
    decline,
    create,
    refresh: resolve,
  }), [ready, state, user, companyId, company, member, roles, perms, accept, decline, create, resolve]);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export const useCompany = () => useContext(CompanyContext);
