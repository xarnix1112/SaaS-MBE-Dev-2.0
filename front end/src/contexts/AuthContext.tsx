/**
 * AuthContext - Fournit l'état d'authentification de manière centralisée
 *
 * Un seul abonnement onAuthStateChanged pour toute l'app,
 * évitant les appels Firestore redondants et les re-renders en cascade.
 */

import { createContext, useContext, useState, useEffect } from 'react';
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
    } catch (err: unknown) {
      lastError = err;
      const e = err as { code?: string; message?: string };
      const isOffline =
        e?.code === 'unavailable' ||
        e?.message?.includes('client is offline');
      if (!isOffline || attempt === maxRetries) throw err;
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

export interface AuthState {
  user: User | null;
  saasAccount: SaasAccount | null;
  /** ID du compte SaaS (saasAccount.id) - utilisé par usePermissions, API, etc. */
  saasAccountId: string | null;
  userDoc: UserDoc | null;
  isLoading: boolean;
  isSetupComplete: boolean;
  hasActiveSubscription: boolean;
  teamMemberId: string | null;
  isTeamMember: boolean;
}

const defaultState: AuthState = {
  user: null,
  saasAccount: null,
  saasAccountId: null,
  userDoc: null,
  isLoading: true,
  isSetupComplete: false,
  hasActiveSubscription: false,
  teamMemberId: null,
  isTeamMember: false,
};

const AuthContext = createContext<AuthState>(defaultState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(defaultState);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user || user.isAnonymous) {
        setAuthState({
          user: null,
          saasAccount: null,
          saasAccountId: null,
          userDoc: null,
          isLoading: false,
          isSetupComplete: false,
          hasActiveSubscription: false,
          teamMemberId: null,
          isTeamMember: false,
        });
        return;
      }

      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDocWithRetry(userDocRef);

        if (!userDocSnap.exists()) {
          setAuthState({
            user,
            saasAccount: null,
            saasAccountId: null,
            userDoc: null,
            isLoading: false,
            isSetupComplete: false,
            hasActiveSubscription: false,
            teamMemberId: null,
            isTeamMember: false,
          });
          return;
        }

        const userDocData = userDocSnap.data() as UserDoc;
        const saasAccountId = userDocData.saasAccountId;

        if (!saasAccountId) {
          setAuthState({
            user,
            saasAccount: null,
            saasAccountId: null,
            userDoc: userDocData,
            isLoading: false,
            isSetupComplete: false,
            hasActiveSubscription: false,
            teamMemberId: null,
            isTeamMember: false,
          });
          return;
        }

        const saasAccountRef = doc(db, 'saasAccounts', saasAccountId);
        const saasAccountSnap = await getDocWithRetry(saasAccountRef);

        if (!saasAccountSnap.exists()) {
          setAuthState({
            user,
            saasAccount: null,
            saasAccountId: null,
            userDoc: userDocData,
            isLoading: false,
            isSetupComplete: false,
            hasActiveSubscription: false,
            teamMemberId: null,
            isTeamMember: false,
          });
          return;
        }

        const saasAccountData = saasAccountSnap.data() as SaasAccount;
        const hasActiveSubscription = !!(saasAccountData?.stripeSubscriptionId);
        const teamMemberId = userDocData.teamMemberId ?? null;
        const isTeamMember = !!(userDocData.type === 'team' && teamMemberId);

        setAuthState({
          user,
          saasAccount: { id: saasAccountSnap.id, ...saasAccountData },
          saasAccountId: saasAccountSnap.id,
          userDoc: userDocData,
          isLoading: false,
          isSetupComplete: true,
          hasActiveSubscription,
          teamMemberId,
          isTeamMember,
        });
      } catch (error: unknown) {
        const e = error as { code?: string; message?: string };
        const isUnavailable =
          e?.code === 'unavailable' ||
          e?.message?.includes('client is offline') ||
          e?.message?.includes('Load failed') ||
          e?.message?.includes('Failed to fetch') ||
          e?.message?.includes('NetworkError') ||
          String(e?.message || '').toLowerCase().includes('access control') ||
          String(e?.message || '').toLowerCase().includes('network request failed');

        if (e?.code === 'permission-denied') {
          setAuthState({
            user,
            saasAccount: null,
            saasAccountId: null,
            userDoc: null,
            isLoading: false,
            isSetupComplete: false,
            hasActiveSubscription: false,
            teamMemberId: null,
            isTeamMember: false,
          });
        } else if (isUnavailable) {
          setAuthState({
            user,
            saasAccount: null,
            saasAccountId: null,
            userDoc: null,
            isLoading: false,
            isSetupComplete: false,
            hasActiveSubscription: false,
            teamMemberId: null,
            isTeamMember: false,
          });
        } else {
          setAuthState({
            user: null,
            saasAccount: null,
            saasAccountId: null,
            userDoc: null,
            isLoading: false,
            isSetupComplete: false,
            hasActiveSubscription: false,
            teamMemberId: null,
            isTeamMember: false,
          });
        }
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={authState}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
