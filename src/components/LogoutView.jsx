'use client';

import { useAuth } from '@/AuthContext';

export default function LogoutView({ onCancel }) {
    const { user, signOutUser } = useAuth();

    return (
        <div className="app-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div className="ew-card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', padding: '40px' }}>

                {/* Icono decorativo */}
                <div
                    style={{
                        width: 60, height: 60, background: 'var(--bg-750)',
                        borderRadius: '50%', margin: '0 auto 20px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-300)'
                    }}
                >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                </div>

                <h2 className="ew-h2" style={{ marginBottom: '10px' }}>Sign Out?</h2>

                <p className="ew-subtle" style={{ marginBottom: '30px', fontSize: '0.95rem' }}>
                    You are currently signed in as <br />
                    <strong style={{ color: 'var(--text-100)' }}>{user?.email}</strong>.
                    <br /><br />
                    Are you sure you want to end your session?
                </p>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button
                        className="ew-btn"
                        onClick={onCancel}
                        style={{ minWidth: '100px' }}
                    >
                        Cancel
                    </button>

                    <button
                        className="ew-btn ew-btn--turq"
                        onClick={signOutUser}
                        style={{ minWidth: '100px' }}
                    >
                        Sign Out
                    </button>
                </div>
            </div>
        </div>
    );
}