// src/components/LoginView.jsx
'use client';
import { useAuth } from '@/AuthContext';

export default function LoginView() {
  const { signIn, loading, authError } = useAuth();

  return (
    <div className="app-content" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div className="lvl" style={{ width: 'min(360px, 100%)', padding: '20px 18px', textAlign: 'center' }}>
        <h1 className="text-section-title" style={{ marginBottom: 6 }}>Inventory Estimator</h1>
        <p className="ew-subtle" style={{ margin: '0 0 16px' }}>Sign in with your Google account to open your estimates.</p>
        <button type="button" onClick={signIn} className="ew-btn ew-btn--primary" disabled={loading} style={{ height: 30, padding: '0 14px', fontSize: 'var(--fs)' }}>
          <img src="/icons/google.png" alt="" width={16} height={16} />
          Sign in with Google
        </button>
        {authError ? (
          <p role="alert" style={{ marginTop: 12, color: 'var(--danger)' }}>{authError}</p>
        ) : null}
      </div>
    </div>
  );
}
