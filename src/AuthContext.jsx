// src/AuthContext.jsx
// The signed-in Google account. Access to companies and projects is decided
// later, by company membership and the Firestore security rules.
'use client';

import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';

const AuthContext = createContext({
  user: undefined, // undefined while Firebase checks the session, null when signed out
  loading: true,
  signIn: async () => {},
  signOutUser: async () => {},
  authError: null,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [authError, setAuthError] = useState(null);
  const loading = user === undefined;

  // the user state itself is updated by onAuthStateChanged below
  const signIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      // closing the popup is not an error worth showing
      if (error?.code !== 'auth/popup-closed-by-user' && error?.code !== 'auth/cancelled-popup-request') {
        console.error('Error signing in with Google:', error);
        setAuthError('Sign-in did not finish. Try again, and allow pop-ups for this site if the window did not open.');
      }
    }
  };

  const signOutUser = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  useEffect(() => onAuthStateChanged(auth, (currentUser) => setUser(currentUser)), []);

  const value = useMemo(() => ({ user, loading, signIn, signOutUser, authError }), [user, loading, authError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
