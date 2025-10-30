// src/components/AuthGate.jsx
// Simplified AuthGate.jsx (Optional - Only if needed for loading UI)
'use client';
import { useAuth } from "@/AuthContext"; 

export default function AuthGate({ children }) {
    const { loading } = useAuth(); // Only get loading state

    if (loading) {
        // Show a full-page loading indicator
        return <div style={{ padding: 24, textAlign: 'center', marginTop: '50px' }}>Loading Authentication...</div>;
    }

    // Once loading is false, just render children
    // page.jsx will handle showing LoginView or main content based on user state
    return <>{children}</>;
}