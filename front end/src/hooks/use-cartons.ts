import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authenticatedFetch } from '@/lib/api';
import { CartonInfo } from '@/types/quote';

interface Carton {
  id: string;
  saasAccountId: string;
  carton_ref: string;
  inner_length: number;
  inner_width: number;
  inner_height: number;
  packaging_price: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Récupérer tous les cartons actifs
export function useCartons() {
  return useQuery<Carton[]>({
    queryKey: ['cartons'],
    queryFn: async () => {
      const response = await authenticatedFetch('/api/cartons');

      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des cartons');
      }

      const data = await response.json();
      return data.cartons || [];
    },
  });
}

// Mettre à jour le carton d'un devis
export function useUpdateQuoteCarton() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ quoteId, cartonId }: { quoteId: string; cartonId: string }) => {
      const response = await authenticatedFetch(`/api/devis/${quoteId}/carton`, {
        method: 'PUT',
        body: JSON.stringify({ cartonId }),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la mise à jour du carton');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalider le cache des devis pour forcer un rechargement
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

// Convertir un Carton en CartonInfo pour l'affichage
export function cartonToCartonInfo(carton: Carton): CartonInfo {
  return {
    id: carton.id,
    ref: carton.carton_ref,
    inner_length: carton.inner_length,
    inner_width: carton.inner_width,
    inner_height: carton.inner_height,
    price: carton.packaging_price,
  };
}

