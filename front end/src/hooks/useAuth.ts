/**
 * Hook useAuth
 * 
 * Gère l'état d'authentification et les informations du compte SaaS
 */

import { useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, DocumentReference, DocumentSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { SaasAccount, UserDoc } from '@/types/auth';

/** Retry getDoc sur erreur "unavailable" (client offline) avec backoff exponentiel */
async function getDocWithRetry(
  ref: DocumentReference,
  maxRetries = 3
): Promise<DocumentSnapshot> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await getDoc(ref);
    } catch (err: any) {
      lastError = err;
      const isOffline = err?.code === 'unavailable' || err?.message?.includes('client is offline');
      if (!isOffline || attempt === maxRetries) throw err;
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      console.warn(`[useAuth] Tentative ${attempt + 1}/${maxRetries + 1} échouée (unavailable), retry dans ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

interface AuthState {
  user: User | null;
  saasAccount: SaasAccount | null;
  userDoc: UserDoc | null;
  isLoading: boolean;
  isSetupComplete: boolean;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    saasAccount: null,
    userDoc: null,
    isLoading: true,
    isSetupComplete: false,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Ignorer les utilisateurs anonymes (considérés comme non connectés)
      if (!user || user.isAnonymous) {
        setAuthState({
          user: null,
          saasAccount: null,
          userDoc: null,
          isLoading: false,
          isSetupComplete: false,
        });
        return;
      }

      try {
        // Log pour diagnostiquer le projet Firebase utilisé
        console.log('[useAuth] Tentative de chargement du document user:', {
          uid: user.uid,
          projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        });
        
        // Charger le document user (avec retry sur erreur "unavailable")
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDocWithRetry(userDocRef);

        if (!userDocSnap.exists()) {
          // User existe mais pas de document user → utilisateur vient de se connecter mais n'a pas encore complété le setup MBE
          // Garder l'utilisateur connecté pour permettre la redirection vers /setup-mbe
          console.log('[useAuth] Document user non trouvé - utilisateur doit compléter le setup MBE');
          setAuthState({
            user, // Garder l'utilisateur connecté pour permettre le setup
            saasAccount: null,
            userDoc: null,
            isLoading: false,
            isSetupComplete: false,
          });
          return;
        }

        const userDocData = userDocSnap.data() as UserDoc;
        const saasAccountId = userDocData.saasAccountId;

        if (!saasAccountId) {
          // User existe mais pas de saasAccountId → setup non terminé
          setAuthState({
            user,
            saasAccount: null,
            userDoc: userDocData,
            isLoading: false,
            isSetupComplete: false,
          });
          return;
        }

        // Charger le saasAccount (avec retry sur erreur "unavailable")
        const saasAccountRef = doc(db, 'saasAccounts', saasAccountId);
        const saasAccountSnap = await getDocWithRetry(saasAccountRef);

        if (!saasAccountSnap.exists()) {
          // saasAccountId existe mais le document n'existe pas → erreur
          console.error('[useAuth] saasAccount non trouvé:', saasAccountId);
          setAuthState({
            user,
            saasAccount: null,
            userDoc: userDocData,
            isLoading: false,
            isSetupComplete: false,
          });
          return;
        }

        const saasAccountData = saasAccountSnap.data() as SaasAccount;

        setAuthState({
          user,
          saasAccount: { id: saasAccountSnap.id, ...saasAccountData },
          userDoc: userDocData,
          isLoading: false,
          isSetupComplete: true,
        });
      } catch (error: any) {
        console.error('[useAuth] Erreur lors du chargement:', error);
        console.error('[useAuth] Code erreur:', error?.code);
        console.error('[useAuth] Message erreur:', error?.message);
        console.error('[useAuth] User UID:', user?.uid);
        
        // Si c'est une erreur de permissions, cela peut être dû à :
        // 1. Les règles Firestore ne sont pas déployées correctement
        // 2. Les restrictions de la clé API Firebase bloquent Cloud Firestore API
        // 3. Le document user n'existe vraiment pas
        const isUnavailable = error?.code === 'unavailable' || error?.message?.includes('client is offline');

        if (error?.code === 'permission-denied') {
          console.error('[useAuth] ⚠️ ERREUR DE PERMISSIONS FIRESTORE');
          console.error('[useAuth] Vérifiez que:');
          console.error('[useAuth] 1. Les règles Firestore sont déployées (firebase deploy --only firestore:rules)');
          console.error('[useAuth] 2. Les restrictions API incluent "Cloud Firestore API"');
          console.error('[useAuth] 3. Le document users/' + user?.uid + ' existe dans Firestore');
          
          setAuthState({
            user,
            saasAccount: null,
            userDoc: null,
            isLoading: false,
            isSetupComplete: false,
          });
        } else if (isUnavailable) {
          // Firestore injoignable (réseau, proxy, etc.) — garder l'utilisateur connecté
          // pour qu'il puisse rafraîchir ou accéder à /setup-mbe
          console.warn('[useAuth] ⚠️ Firestore injoignable après retries. L\'utilisateur reste connecté.');
          setAuthState({
            user,
            saasAccount: null,
            userDoc: null,
            isLoading: false,
            isSetupComplete: false,
          });
        } else {
          setAuthState({
            user: null,
            saasAccount: null,
            userDoc: null,
            isLoading: false,
            isSetupComplete: false,
          });
        }
      }
    });

    return () => unsubscribe();
  }, []);

  return authState;
}

