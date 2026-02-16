import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, onAuthStateChanged, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, User, setPersistence, browserLocalPersistence, browserSessionPersistence, sendPasswordResetEmail } from "firebase/auth";

const env = import.meta.env as Record<string, string | undefined>;

// IMPORTANT SÉCURITÉ: Ne plus hardcoder la clé API dans le code source
// Utiliser uniquement les variables d'environnement pour éviter l'exposition publique sur GitHub
// Les variables d'environnement doivent être définies dans front end/.env.local (non commité)

// Vérification que les variables d'environnement requises sont présentes
const requiredEnvVars = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID || env.VITE_FIREBASE_APPID,
};

const missingVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.error('[firebase] ⚠️ Variables d\'environnement Firebase manquantes:', missingVars.join(', '));
  console.error('[firebase] Veuillez définir ces variables dans front end/.env.local');
}

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  // fallback classique si pas renseigné
  storageBucket:
    env.VITE_FIREBASE_STORAGE_BUCKET ||
    (env.VITE_FIREBASE_PROJECT_ID ? `${env.VITE_FIREBASE_PROJECT_ID}.appspot.com` : undefined),
  // plusieurs noms possibles
  messagingSenderId:
    env.VITE_FIREBASE_SENDER_ID ||
    env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    '',
  appId: env.VITE_FIREBASE_APP_ID || env.VITE_FIREBASE_APPID || '',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || '',
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
  projectId: firebaseConfig.projectId, // Afficher le projectId pour vérifier le projet utilisé
  hasStorageBucket: Boolean(firebaseConfig.storageBucket),
  hasSenderId: Boolean(firebaseConfig.messagingSenderId),
  hasAppId: Boolean(firebaseConfig.appId),
});

const app = initializeApp(firebaseConfig);

// Firestore (principal) - experimentalForceLongPolling contourne les erreurs "client is offline"
// sur certains réseaux où WebSocket échoue (proxy, pare-feu, etc.)
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

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
  try {
    // Définir la persistance avant la connexion
    await setPersistence(
      auth,
      rememberMe ? browserLocalPersistence : browserSessionPersistence
    );
    
    // Nettoyer l'email (enlever les espaces avant/après)
    const cleanedEmail = email.trim();
    
    console.log('[firebase] Tentative de connexion avec email:', cleanedEmail);
    
    const result = await signInWithEmailAndPassword(auth, cleanedEmail, password);
    
    console.log('[firebase] ✅ Connexion réussie, User ID:', result.user.uid);
    
    return result;
  } catch (error: any) {
    console.error('[firebase] ❌ Erreur lors de la connexion:', {
      code: error.code,
      message: error.message,
      email: email.trim(),
    });
    
    // Vérifier si c'est une erreur liée aux restrictions API
    if (error.code === 'auth/api-key-not-valid' || error.code === 'auth/network-request-failed') {
      console.error('[firebase] ⚠️ Erreur possiblement liée aux restrictions API Firebase');
      console.error('[firebase] Vérifiez que Firebase Authentication API est autorisée dans Google Cloud Console');
    }
    
    throw error;
  }
};

export const logout = async () => {
  try {
    console.log('[firebase] Déconnexion en cours...');
    await signOut(auth);
    console.log('[firebase] ✅ Déconnexion réussie');
    
    // Nettoyer le cache local si nécessaire
    if (typeof window !== 'undefined') {
      // Vider le localStorage pour éviter les problèmes de session
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('firebase:') || key.startsWith('firebaseui:'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      console.log('[firebase] Cache localStorage nettoyé');
    }
  } catch (error: any) {
    console.error('[firebase] ❌ Erreur lors de la déconnexion:', error);
    throw error;
  }
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

