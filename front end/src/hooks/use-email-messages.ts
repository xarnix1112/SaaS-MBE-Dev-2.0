import { useQuery } from '@tanstack/react-query';
import { getEmailMessagesForQuote } from '@/lib/emailMessages';
import { EmailMessage } from '@/types/quote';

/**
 * Hook pour récupérer les messages email d'un devis
 * @param devisId ID du devis
 * @returns Query result avec les messages
 */
export function useEmailMessages(devisId: string | undefined) {
  return useQuery<EmailMessage[]>({
    queryKey: ['emailMessages', devisId],
    queryFn: () => {
      if (!devisId) return [];
      return getEmailMessagesForQuote(devisId);
    },
    enabled: !!devisId,
    staleTime: 30 * 1000, // 30 secondes
    refetchInterval: 30 * 1000, // Rafraîchir toutes les 30 secondes
    refetchOnWindowFocus: true,
  });
}

