/**
 * Hook pour les paramètres d'assurance (insuranceSettings)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authenticatedFetch } from "@/lib/api";
import type { InsuranceConfig } from "@/lib/insurance";

const QUERY_KEY = ["insurance", "settings"];

async function fetchInsuranceSettings(): Promise<InsuranceConfig & { saasAccountId?: string }> {
  const res = await authenticatedFetch("/api/insurance/settings");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erreur chargement paramètres assurance");
  }
  return res.json();
}

export function useInsuranceSettings() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchInsuranceSettings,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useUpdateInsuranceSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<InsuranceConfig>) => {
      const res = await authenticatedFetch("/api/insurance/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erreur enregistrement");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
