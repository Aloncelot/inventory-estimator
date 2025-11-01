// src/components/AuthGate.jsx
"use client";
import { useEffect, useState } from "react";
import { auth, googleProvider } from "@/lib/firebase";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";

export default function AuthGate({ children }) {
  const [user, setUser] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  if (user === undefined) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!user) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Inventory Estimator</h1>
        <p>Sign in to continue.</p>
        <button onClick={() => signInWithPopup(auth, googleProvider)}>
          Sign in with Google
        </button>
      </div>
    );
  }
  return (
    <>
      <div style={{ padding: 12, fontSize: 12 }}>
        Signed in as {user.email} ·{" "}
        <button onClick={() => signOut(auth)}>Sign out</button>
      </div>
      {children}
    </>
  );
}
