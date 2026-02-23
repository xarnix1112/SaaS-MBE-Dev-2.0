/**
 * Hook pour récupérer les features, limites et usage du compte SaaS
 *
 * GET /api/features
 */

import { useQuery } from "@tanstack/react-query";
import { authenticatedFetch } from "@/lib/api";

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
    throw new Error("Impossible de charger les fonctionnalités");
  }
  return res.json();
}

export function useFeatures() {
  return useQuery<FeaturesData>({
    queryKey: ["features"],
    queryFn: fetchFeatures,
    staleTime: 1000 * 60 * 5, // 5 min
    refetchOnWindowFocus: true,
  });
}
