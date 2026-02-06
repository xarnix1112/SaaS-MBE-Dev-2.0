/**
 * Hook useAuth
 * 
 * Gère l'état d'authentification et les informations du compte SaaS
 */

import { useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { SaasAccount, UserDoc } from '@/types/auth';

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
        // Charger le document user
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
          // User existe mais pas de document user → peut être une session invalide ou utilisateur non inscrit
          // Dans ce cas, on considère l'utilisateur comme non connecté pour permettre la connexion/inscription
          console.log('[useAuth] Document user non trouvé - session Firebase invalide ou utilisateur non inscrit');
          console.log('[useAuth] Redirection vers /welcome pour permettre la connexion/inscription');
          setAuthState({
            user: null, // Considérer comme non connecté pour permettre la connexion
            saasAccount: null,
            userDoc: null,
            isLoading: false,
            isSetupComplete: false,
          });
          // Déconnecter l'utilisateur Firebase pour nettoyer la session invalide
          try {
            await auth.signOut();
            console.log('[useAuth] Session Firebase invalide nettoyée');
          } catch (signOutError) {
            console.warn('[useAuth] Erreur lors du nettoyage de la session:', signOutError);
          }
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

        // Charger le saasAccount
        const saasAccountRef = doc(db, 'saasAccounts', saasAccountId);
        const saasAccountSnap = await getDoc(saasAccountRef);

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
        
        // Si c'est une erreur de permissions, l'utilisateur existe mais n'a peut-être pas encore de document user
        // Dans ce cas, on considère qu'il est connecté mais le setup n'est pas terminé
        if (error?.code === 'permission-denied') {
          console.warn('[useAuth] Permission refusée - l\'utilisateur n\'a peut-être pas encore de document user');
          setAuthState({
            user,
            saasAccount: null,
            userDoc: null,
            isLoading: false,
            isSetupComplete: false,
          });
        } else {
          // Pour les autres erreurs, considérer comme non connecté
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

