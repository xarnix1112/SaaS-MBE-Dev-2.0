/**
 * Hook pour récupérer les features, limites et usage du compte SaaS
 *
 * GET /api/features
 */

import { useQuery } from "@tanstack/react-query";
import { authenticatedFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export interface FeaturesData {
  features: Record<string, boolean>;
  limits: Record<string, number>;
  usage: Record<string, number>;
  remaining: Record<string, number>;
  planId: string;
  planName: string;
  billingPeriod: {
    yearStart: string;
    yearEnd: string;
  } | null;
}

async function fetchFeatures(): Promise<FeaturesData> {
  const res = await authenticatedFetch("/api/features");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Impossible de charger les fonctionnalités");
  }
  return res.json();
}

export function useFeatures() {
  const { saasAccount } = useAuth();
  return useQuery<FeaturesData>({
    queryKey: ["features"],
    queryFn: fetchFeatures,
    enabled: !!saasAccount?.id,
    staleTime: 1000 * 30, // 30 s pour que le quota devis reste à jour
    refetchOnWindowFocus: true,
    retry: 2,
  });
}
