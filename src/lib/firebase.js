// src/lib/firebase.js
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

// Only validate envs on the server/build (never in the browser)
if (typeof window === "undefined") {
  const required = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    // "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID", // optional
  ];
  for (const k of required) {
    if (!process.env[k]) {
      throw new Error(`[firebase] Missing env var: ${k}`);
    }
  }
}

// Use direct references so Next can inline them at build time
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // optional
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// App Check: proves requests come from this app, so others can't spend the
// project's Gemini quota (Firebase AI Logic requires it). Needs a reCAPTCHA
// Enterprise site key from Firebase console > App Check. On localhost a debug
// token is used instead: the browser console prints it the first time; add it
// in App Check > Manage debug tokens (or put it in NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN).
let appCheck = null;
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && !window.__estimateHubAppCheck) {
  if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN || true;
  }
  try {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
    window.__estimateHubAppCheck = appCheck;
  } catch (e) {
    console.warn("[firebase] App Check not started:", e?.message || e);
  }
}
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
// Always show the account chooser so you can pick between your Google accounts
googleProvider.setCustomParameters({ prompt: "select_account" });

// Cloud Storage: plan PDFs, so the whole team sees them (needs the Blaze plan)
const storage = getStorage(app);

export { app, db, auth, googleProvider, storage, appCheck };
