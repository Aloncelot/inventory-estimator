// src/context/AuthContext.js
"use client";
import { createContext, useContext, useState, useEffect, useMemo } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase"; // Adjust path if needed

const AuthContext = createContext({
  user: undefined, // undefined: loading, null: logged out, object: logged in
  loading: true,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const loading = user === undefined;

  useEffect(() => {
    // Listen for auth state changes
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser); // Will be null if logged out, user object if logged in
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => ({ user, loading }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook to use the auth context
export const useAuth = () => {
  return useContext(AuthContext);
};
