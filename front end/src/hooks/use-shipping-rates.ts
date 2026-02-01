/**
 * HOOKS REACT QUERY POUR LA GRILLE TARIFAIRE D'EXPÉDITION
 * 
 * Gestion complète des zones, services, tranches de poids, tarifs et paramètres
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { auth } from "@/lib/firebase";
import {
  ShippingZone,
  ShippingService,
  WeightBracket,
  ShippingRate,
  ShippingSettings,
  ShippingGridData,
  ShippingZoneInput,
  ShippingServiceInput,
  WeightBracketInput,
  ShippingRateInput,
  ShippingSettingsInput,
} from "@/types/shipping";

const API_BASE_ROOT = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5174';
const API_BASE = `${API_BASE_ROOT}/api/shipping`;

/**
 * Helper pour récupérer le token d'authentification
 */
async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Utilisateur non authentifié");
  }
  return await user.getIdToken();
}

/**
 * Helper pour les requêtes API
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || "Erreur API");
  }

  return response.json();
}

// ==========================================
// ZONES D'EXPÉDITION
// ==========================================

/**
 * Hook pour récupérer toutes les zones
 */
export function useShippingZones() {
  return useQuery<ShippingZone[]>({
    queryKey: ["shipping", "zones"],
    queryFn: () => apiRequest<ShippingZone[]>("/zones"),
  });
}

/**
 * Hook pour créer une zone
 */
export function useCreateZone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ShippingZoneInput) =>
      apiRequest<ShippingZone>("/zones", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipping", "zones"] });
      queryClient.invalidateQueries({ queryKey: ["shipping", "grid"] });
    },
  });
}

/**
 * Hook pour mettre à jour une zone
 */
export function useUpdateZone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ShippingZoneInput> }) =>
      apiRequest<ShippingZone>(`/zones/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipping", "zones"] });
      queryClient.invalidateQueries({ queryKey: ["shipping", "grid"] });
    },
  });
}

/**
 * Hook pour supprimer une zone (soft delete)
 */
export function useDeleteZone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ success: boolean; message: string }>(`/zones/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipping", "zones"] });
      queryClient.invalidateQueries({ queryKey: ["shipping", "grid"] });
    },
  });
}

// ==========================================
// SERVICES D'EXPÉDITION
// ==========================================

/**
 * Hook pour récupérer tous les services
 */
export function useShippingServices() {
  return useQuery<ShippingService[]>({
    queryKey: ["shipping", "services"],
    queryFn: () => apiRequest<ShippingService[]>("/services"),
  });
}

/**
 * Hook pour créer un service
 */
export function useCreateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ShippingServiceInput) =>
      apiRequest<ShippingService>("/services", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipping", "services"] });
      queryClient.invalidateQueries({ queryKey: ["shipping", "grid"] });
    },
  });
}

/**
 * Hook pour mettre à jour un service
 */
export function useUpdateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ShippingServiceInput> }) =>
      apiRequest<ShippingService>(`/services/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipping", "services"] });
      queryClient.invalidateQueries({ queryKey: ["shipping", "grid"] });
    },
  });
}

/**
 * Hook pour supprimer un service (soft delete)
 */
export function useDeleteService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ success: boolean; message: string }>(`/services/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipping", "services"] });
      queryClient.invalidateQueries({ queryKey: ["shipping", "grid"] });
    },
  });
}

// ==========================================
// TRANCHES DE POIDS
// ==========================================

/**
 * Hook pour récupérer toutes les tranches de poids
 */
export function useWeightBrackets() {
  return useQuery<WeightBracket[]>({
    queryKey: ["shipping", "weightBrackets"],
    queryFn: () => apiRequest<WeightBracket[]>("/weight-brackets"),
  });
}

/**
 * Hook pour créer une tranche de poids
 */
export function useCreateWeightBracket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: WeightBracketInput) =>
      apiRequest<WeightBracket>("/weight-brackets", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipping", "weightBrackets"] });
      queryClient.invalidateQueries({ queryKey: ["shipping", "grid"] });
    },
  });
}

/**
 * Hook pour mettre à jour une tranche de poids
 */
export function useUpdateWeightBracket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<WeightBracketInput> }) =>
      apiRequest<WeightBracket>(`/weight-brackets/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipping", "weightBrackets"] });
      queryClient.invalidateQueries({ queryKey: ["shipping", "grid"] });
    },
  });
}

/**
 * Hook pour supprimer une tranche de poids (hard delete)
 */
export function useDeleteWeightBracket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ success: boolean; message: string }>(`/weight-brackets/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipping", "weightBrackets"] });
      queryClient.invalidateQueries({ queryKey: ["shipping", "grid"] });
    },
  });
}

// ==========================================
// TARIFS D'EXPÉDITION
// ==========================================

/**
 * Hook pour récupérer tous les tarifs
 */
export function useShippingRates() {
  return useQuery<ShippingRate[]>({
    queryKey: ["shipping", "rates"],
    queryFn: () => apiRequest<ShippingRate[]>("/rates"),
  });
}

/**
 * Hook pour créer ou mettre à jour un tarif (upsert)
 */
export function useUpsertRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ShippingRateInput) =>
      apiRequest<ShippingRate>("/rates", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipping", "rates"] });
      queryClient.invalidateQueries({ queryKey: ["shipping", "grid"] });
    },
  });
}

/**
 * Hook pour mettre à jour plusieurs tarifs en batch
 */
export function useUpsertRatesBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rates: ShippingRateInput[]) => {
      const results = await Promise.all(
        rates.map((rate) =>
          apiRequest<ShippingRate>("/rates", {
            method: "POST",
            body: JSON.stringify(rate),
          })
        )
      );
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipping", "rates"] });
      queryClient.invalidateQueries({ queryKey: ["shipping", "grid"] });
    },
  });
}

// ==========================================
// PARAMÈTRES D'EXPÉDITION
// ==========================================

/**
 * Hook pour récupérer les paramètres
 */
export function useShippingSettings() {
  return useQuery<ShippingSettings>({
    queryKey: ["shipping", "settings"],
    queryFn: () => apiRequest<ShippingSettings>("/settings"),
  });
}

/**
 * Hook pour mettre à jour les paramètres
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<ShippingSettingsInput>) =>
      apiRequest<ShippingSettings>("/settings", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipping", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["shipping", "grid"] });
    },
  });
}

// ==========================================
// GRILLE COMPLÈTE
// ==========================================

/**
 * Hook pour récupérer toutes les données de la grille en une seule requête
 * 
 * Plus performant que de faire 5 requêtes séparées
 */
export function useShippingGrid() {
  const user = auth.currentUser;
  const uid = user?.uid || "anonymous";
  
  return useQuery<ShippingGridData>({
    queryKey: ["shipping", "grid", uid],
    queryFn: () => apiRequest<ShippingGridData>("/grid"),
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!user, // Ne charger que si l'utilisateur est connecté
  });
}

// ==========================================
// HELPERS
// ==========================================

/**
 * Helper pour trouver un tarif dans la grille
 */
export function findRate(
  rates: ShippingRate[],
  zoneId: string,
  serviceId: string,
  weightBracketId: string
): ShippingRate | undefined {
  return rates.find(
    (rate) =>
      rate.zoneId === zoneId &&
      rate.serviceId === serviceId &&
      rate.weightBracketId === weightBracketId
  );
}

/**
 * Helper pour vérifier si un tarif existe
 */
export function hasRate(
  rates: ShippingRate[],
  zoneId: string,
  serviceId: string,
  weightBracketId: string
): boolean {
  return findRate(rates, zoneId, serviceId, weightBracketId) !== undefined;
}

/**
 * Helper pour obtenir le prix d'un tarif
 */
export function getRatePrice(
  rates: ShippingRate[],
  zoneId: string,
  serviceId: string,
  weightBracketId: string
): number | null {
  const rate = findRate(rates, zoneId, serviceId, weightBracketId);
  return rate ? rate.price : null;
}

