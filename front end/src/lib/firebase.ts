import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, onAuthStateChanged, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, User, setPersistence, browserLocalPersistence, browserSessionPersistence, sendPasswordResetEmail } from "firebase/auth";

const env = import.meta.env as Record<string, string | undefined>;

// Fallback config (si .env.local n'est pas lu / pas défini)
// Note: Pour une app web Firebase, ces valeurs ne sont pas des "secrets" au sens Stripe,
// mais elles doivent correspondre à TON projet Firebase.
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDfIvWIWpWGVcPHIxVqUpoxQzrHHr6Yjv0",
  authDomain: "sdv-automation-mbe.firebaseapp.com",
  projectId: "sdv-automation-mbe",
  storageBucket: "sdv-automation-mbe.firebasestorage.app",
  messagingSenderId: "603940578796",
  appId: "1:603940578796:web:89052f95b5eed311db8cc9",
  measurementId: "G-MW3N3FRJBX",
};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || DEFAULT_FIREBASE_CONFIG.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE_CONFIG.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_CONFIG.projectId,
  // fallback classique si pas renseigné
  storageBucket:
    env.VITE_FIREBASE_STORAGE_BUCKET ||
    DEFAULT_FIREBASE_CONFIG.storageBucket ||
    (env.VITE_FIREBASE_PROJECT_ID ? `${env.VITE_FIREBASE_PROJECT_ID}.appspot.com` : undefined),
  // plusieurs noms possibles
  messagingSenderId:
    env.VITE_FIREBASE_SENDER_ID ||
    env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || env.VITE_FIREBASE_APPID || DEFAULT_FIREBASE_CONFIG.appId,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || DEFAULT_FIREBASE_CONFIG.measurementId,
};

// Guard: ensure mandatory keys exist
export const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
if (!firebaseEnabled) {
  console.warn("[firebase] Configuration manquante. Vérifiez .env.local");
}

// Log "safe" (sans secrets) pour diagnostiquer rapidement
console.info("[firebase] env status", {
  enabled: firebaseEnabled,
  hasApiKey: Boolean(firebaseConfig.apiKey),
  hasAuthDomain: Boolean(firebaseConfig.authDomain),
  hasProjectId: Boolean(firebaseConfig.projectId),
  hasStorageBucket: Boolean(firebaseConfig.storageBucket),
  hasSenderId: Boolean(firebaseConfig.messagingSenderId),
  hasAppId: Boolean(firebaseConfig.appId),
});

const app = initializeApp(firebaseConfig);

// Firestore (principal)
export const db = getFirestore(app);

// Auth (anonyme) pour passer les règles Firestore/Storage par défaut
export const auth = getAuth(app);

export let lastAuthError: string | null = null;

// Auth ready - ne force plus l'authentification anonyme automatiquement
// L'authentification sera gérée par les pages Login/Register
export const authReady: Promise<void> =
  typeof window === "undefined" || !firebaseEnabled
    ? Promise.resolve()
    : new Promise((resolve) => {
        const unsub = onAuthStateChanged(auth, (user) => {
          unsub();
          resolve();
        });
      });

// Fonctions d'authentification email/password
export const registerWithEmail = async (email: string, password: string) => {
  return await createUserWithEmailAndPassword(auth, email, password);
};

export const loginWithEmail = async (email: string, password: string, rememberMe: boolean = true) => {
  // Définir la persistance avant la connexion
  await setPersistence(
    auth,
    rememberMe ? browserLocalPersistence : browserSessionPersistence
  );
  return await signInWithEmailAndPassword(auth, email, password);
};

export const logout = async () => {
  return await signOut(auth);
};

export const resetPassword = async (email: string) => {
  return await sendPasswordResetEmail(auth, email);
};

// Analytics (optionnel; only in browser and if supported)
export const analyticsPromise =
  typeof window !== "undefined"
    ? isSupported().then((ok) => (ok ? getAnalytics(app) : null)).catch(() => null)
    : Promise.resolve(null);

export { app };

