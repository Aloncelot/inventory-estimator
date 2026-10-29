// src/components/LogoutView.jsx
'use client';
import { useState } from 'react';
import { LogOut, LoaderCircle } from 'lucide-react';
import { useAuth } from '@/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { PageHeader } from '@/components/ui/mat';

export default function LogoutView({ onCancel }) {
  const { user, signOutUser } = useAuth();
  const { isDirty, isSaving, saveProject } = useProject();
  const [busy, setBusy] = useState(false);
  const pending = isDirty || isSaving;

  const signOut = async () => {
    setBusy(true);
    try {
      if (pending) {
        const ok = await saveProject();
        if (ok === false && isDirty) { setBusy(false); return; }
      }
      await signOutUser();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-content">
      <PageHeader icon={LogOut} title="Sign out" />
      <div className="ew-card" style={{ maxWidth: 440 }}>
        <p style={{ margin: '0 0 10px' }}>
          You&apos;re signed in as <strong>{user?.email}</strong>.{' '}
          {pending
            ? 'This project has unsaved changes — they are saved before you sign out.'
            : 'All changes are saved.'}
        </p>
        <div className="ew-inline">
          <button type="button" className="ew-btn" onClick={onCancel}>Stay signed in</button>
          <button type="button" className="ew-btn ew-btn--danger" onClick={signOut} disabled={busy}>
            {busy ? <LoaderCircle size={12} className="animate-spin" /> : <LogOut size={12} />}
            {pending ? ' Save and sign out' : ' Sign out'}
          </button>
        </div>
      </div>
    </div>
  );
}
