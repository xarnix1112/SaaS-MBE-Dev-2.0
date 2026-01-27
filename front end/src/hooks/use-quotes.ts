import { useQuery } from "@tanstack/react-query";
import { loadQuotes } from "@/lib/sheetQuotes";
import { mockQuotes } from "@/data/mockData";
import { Quote } from "@/types/quote";

export function useQuotes() {
  return useQuery<Quote[]>({
    queryKey: ["quotes"],
    queryFn: loadQuotes,
    placeholderData: mockQuotes,
    staleTime: 1000 * 30, // Réduire à 30 secondes pour forcer un refresh plus fréquent
    refetchOnWindowFocus: true, // Recharger quand on revient sur la fenêtre
    refetchInterval: 1000 * 60, // Recharger toutes les minutes
  });
}

