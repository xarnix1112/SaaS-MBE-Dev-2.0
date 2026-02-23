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

async function fetchFeatures(saasAccountId?: string): Promise<FeaturesData> {
  const headers: Record<string, string> = {};
  if (saasAccountId) headers["X-Saas-Account-Id"] = saasAccountId;
  const res = await authenticatedFetch("/api/features", { headers });
  if (!res.ok) {
    throw new Error("Impossible de charger les fonctionnalités");
  }
  return res.json();
}

export function useFeatures(saasAccountId?: string) {
  return useQuery<FeaturesData>({
    queryKey: ["features", saasAccountId ?? "default"],
    queryFn: () => fetchFeatures(saasAccountId),
    staleTime: 1000 * 30, // 30 s pour que le quota devis reste à jour
    refetchOnWindowFocus: true,
  });
}
