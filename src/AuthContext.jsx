// src/AuthContext.jsx

'use client';
 import { createContext, useContext, useState, useEffect, useMemo } from 'react';
 import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'; // Import sign-in/out
 import { auth, googleProvider } from '@/lib/firebase'; // Import auth and provider

 const AuthContext = createContext({
     user: undefined, // undefined: loading, null: logged out, object: logged in
     loading: true,
     signIn: async () => {}, // Add signIn function
     signOutUser: async () => {}, // Add signOut function (named differently to avoid conflict)
 });

 export function AuthProvider({ children }) {
     const [user, setUser] = useState(undefined);
     const loading = user === undefined;

     const signIn = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
            // onAuthStateChanged listener will automatically update the user state
        } catch (error) {
            console.error("Error signing in with Google:", error);
            // Handle sign-in errors (e.g., show a message to the user)
        }
    };

    const signOutUser = async () => {
        try {
            await signOut(auth);
            // onAuthStateChanged listener will automatically update the user state to null
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };

     useEffect(() => {
         // Listen for auth state changes
         const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
             console.log("Auth State Changed:", currentUser?.uid || 'No user'); // Debug log
             setUser(currentUser); // Will be null if logged out, user object if logged in
         });

         // Cleanup subscription on unmount
         return () => unsubscribe();
     }, []);

    // Memoize context value to prevent unnecessary re-renders
    const value = useMemo(() => ({ user, loading, signIn, signOutUser }), [user, loading]); // Add functions to value

    // Add a check to render children only after initial auth check is done (optional but good practice)
    // if (loading) {
    //     return <div style={{padding: 24}}>Checking Authentication...</div>; // Or a proper loading spinner
    // }

     return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
 }

 // Custom hook to use the auth context
 export const useAuth = () => {
     return useContext(AuthContext);
 };