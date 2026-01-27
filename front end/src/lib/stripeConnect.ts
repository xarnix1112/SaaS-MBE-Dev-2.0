/**
 * API Client pour Stripe Connect
 * 
 * Toutes les interactions avec Stripe passent par le backend
 * AUCUNE clé Stripe n'est exposée côté frontend
 */

import type {
  StripeConnectResponse,
  StripeStatusResponse,
  CreatePaiementRequest,
  CreatePaiementResponse,
  Paiement,
} from "@/types/stripe";
import { authenticatedFetch } from "./api";

const API_BASE = "";

/**
 * Génère l'URL OAuth Stripe Connect
 * Le saasAccountId est récupéré automatiquement depuis le token Firebase
 */
export async function connectStripe(): Promise<string> {
  const response = await authenticatedFetch(`${API_BASE}/api/stripe/connect`, {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Erreur inconnue" }));
    throw new Error(error.error || "Erreur lors de la connexion Stripe");
  }

  const data: StripeConnectResponse = await response.json();
  return data.url;
}

/**
 * Vérifie le statut de connexion Stripe
 * Le saasAccountId est récupéré automatiquement depuis le token Firebase
 */
export async function getStripeStatus(): Promise<StripeStatusResponse> {
  const response = await authenticatedFetch(`${API_BASE}/api/stripe/status`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Erreur inconnue" }));
    throw new Error(error.error || "Erreur lors de la vérification du statut");
  }

  return response.json();
}

/**
 * Déconnecte un compte Stripe
 * Le saasAccountId est récupéré automatiquement depuis le token Firebase
 */
export async function disconnectStripe(): Promise<void> {
  const response = await authenticatedFetch(`${API_BASE}/api/stripe/disconnect`, {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Erreur inconnue" }));
    throw new Error(error.error || "Erreur lors de la déconnexion");
  }
}

/**
 * Crée un paiement pour un devis
 * Retourne l'URL de la Checkout Session Stripe
 */
export async function createPaiement(
  devisId: string,
  data: CreatePaiementRequest
): Promise<CreatePaiementResponse> {
  const response = await authenticatedFetch(`${API_BASE}/api/devis/${devisId}/paiement`, {
    method: "POST",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Erreur inconnue" }));
    throw new Error(error.error || "Erreur lors de la création du paiement");
  }

  return response.json();
}

/**
 * Récupère tous les paiements d'un devis
 */
export async function getPaiements(devisId: string): Promise<Paiement[]> {
  const response = await authenticatedFetch(`${API_BASE}/api/devis/${devisId}/paiements`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Erreur inconnue" }));
    throw new Error(error.error || "Erreur lors de la récupération des paiements");
  }

  const data = await response.json();
  
  // Convertir les dates
  return data.map((p: any) => ({
    ...p,
    createdAt: p.createdAt ? new Date(p.createdAt) : undefined,
    updatedAt: p.updatedAt ? new Date(p.updatedAt) : undefined,
    paidAt: p.paidAt ? new Date(p.paidAt) : null,
  }));
}

/**
 * Hook React pour le polling des paiements
 */
export function usePaiementsPolling(
  devisId: string | undefined,
  intervalMs: number = 30000
): {
  paiements: Paiement[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
} {
  const [paiements, setPaiements] = React.useState<Paiement[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const refresh = React.useCallback(async () => {
    if (!devisId) return;

    try {
      setError(null);
      const data = await getPaiements(devisId);
      setPaiements(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Erreur inconnue"));
    } finally {
      setIsLoading(false);
    }
  }, [devisId]);

  React.useEffect(() => {
    refresh();

    const interval = setInterval(refresh, intervalMs);
    return () => clearInterval(interval);
  }, [refresh, intervalMs]);

  return { paiements, isLoading, error, refresh };
}

// Import React pour le hook
import * as React from "react";

/**
 * Annule un paiement
 */
export async function cancelPaiement(paiementId: string): Promise<void> {
  const response = await authenticatedFetch(`${API_BASE}/api/paiement/${paiementId}/cancel`, {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Erreur inconnue" }));
    throw new Error(error.error || "Erreur lors de l'annulation du paiement");
  }
}

