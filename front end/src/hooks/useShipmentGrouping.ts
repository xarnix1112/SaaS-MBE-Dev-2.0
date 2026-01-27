/**
 * Hook useShipmentGrouping
 * 
 * Gère la logique de détection et création de groupements d'expédition
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getGroupableQuotes,
  createShipmentGroup,
  getShipmentGroup,
  deleteShipmentGroup,
} from '@/lib/shipmentGroups';
import type { GroupSuggestion, ShipmentGroup, GroupableQuote } from '@/types/shipmentGroup';
import type { Quote } from '@/types/quote';
import { toast } from 'sonner';

interface UseShipmentGroupingOptions {
  currentQuote: Quote;
  saasAccountId: string;
  onGroupCreated?: (group: ShipmentGroup) => void;
  onGroupDeleted?: () => void;
}

// Helper pour construire recipientAddress à partir de delivery.address
const buildRecipientAddress = (quote: Quote): string | undefined => {
  // Si recipientAddress existe déjà, l'utiliser
  if (quote.recipientAddress) {
    return quote.recipientAddress;
  }
  
  // Sinon, construire à partir de delivery.address
  if (quote.delivery?.address) {
    const addr = quote.delivery.address;
    const parts = [
      addr.line1,
      addr.line2,
      [addr.zip, addr.city].filter(Boolean).join(" ").trim(),
      addr.state,
      addr.country,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : undefined;
  }
  
  // Fallback: utiliser l'adresse du client
  if (quote.client?.address) {
    return quote.client.address;
  }
  
  return undefined;
};

export function useShipmentGrouping({
  currentQuote,
  saasAccountId,
  onGroupCreated,
  onGroupDeleted,
}: UseShipmentGroupingOptions) {
  const [suggestion, setSuggestion] = useState<GroupSuggestion | null>(null);
  const [currentGroup, setCurrentGroup] = useState<ShipmentGroup | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Détection des devis groupables
  const detectGrouping = useCallback(async () => {
    // Construire recipientAddress si nécessaire
    const recipientAddress = buildRecipientAddress(currentQuote);
    
    if (!currentQuote || !currentQuote.id || !recipientAddress || currentQuote.shipmentGroupId) {
      return;
    }

    setIsLoading(true);
    try {
      const { groupableQuotes, suggestion } = await getGroupableQuotes(currentQuote.id);

      if (suggestion) {
        // Le backend a déjà calculé la suggestion complète
        setSuggestion(suggestion);
        console.log('[useShipmentGrouping] 🔔 Groupement détecté:', {
          quoteCount: suggestion.quotes.length,
          potentialSavings: suggestion.potentialSavings.toFixed(2),
        });
      } else if (groupableQuotes.length > 0) {
        // Si pas de suggestion mais des devis groupables, créer une suggestion basique
        const totalWeight = groupableQuotes.reduce((sum, q) => sum + q.totalWeight, 0) + 
          (currentQuote.totalWeight || 0);
        
        const totalVolume = groupableQuotes.reduce((sum, q) => sum + q.totalVolume, 0) + 
          (currentQuote.totalVolume || 0);

        const individualCost = groupableQuotes.reduce((sum, q) => sum + (q.shippingCost || 0), 0) + 
          (currentQuote.shippingCost || 0);
        
        const estimatedGroupedCost = individualCost * 0.7;
        const potentialSavings = individualCost - estimatedGroupedCost;
        const estimatedCartons = Math.ceil(totalVolume / 0.15);

        // Construire recipientAddress si nécessaire
        const recipientAddress = buildRecipientAddress(currentQuote);
        
        const allQuotes: GroupableQuote[] = [
          {
            id: currentQuote.id,
            reference: currentQuote.reference,
            clientName: currentQuote.clientName || currentQuote.client?.name || '',
            clientEmail: currentQuote.clientEmail || currentQuote.client?.email || '',
            recipientAddress: recipientAddress || '',
            lotCount: currentQuote.lots?.length || 1, // Fallback à 1 si pas de lots
            totalWeight: currentQuote.totalWeight || 0,
            totalVolume: currentQuote.totalVolume || 0,
            shippingCost: currentQuote.shippingCost || 0,
            createdAt: currentQuote.createdAt,
          },
          ...groupableQuotes,
        ];

        setSuggestion({
          quotes: allQuotes,
          totalWeight,
          totalVolume,
          estimatedCartons,
          estimatedShippingCost: estimatedGroupedCost,
          potentialSavings,
        });
      } else {
        setSuggestion(null);
      }
    } catch (error) {
      console.error('[useShipmentGrouping] Erreur détection:', error);
      setSuggestion(null);
    } finally {
      setIsLoading(false);
    }
  }, [currentQuote]);

  // Charger le groupe existant si le devis est déjà groupé
  const loadExistingGroup = useCallback(async () => {
    if (!currentQuote || !currentQuote.shipmentGroupId) {
      setCurrentGroup(null);
      return;
    }

    setIsLoading(true);
    try {
      const group = await getShipmentGroup(currentQuote.shipmentGroupId);
      setCurrentGroup(group);
      console.log('[useShipmentGrouping] Groupe chargé:', group.id);
    } catch (error) {
      console.error('[useShipmentGrouping] Erreur chargement groupe:', error);
      setCurrentGroup(null);
    } finally {
      setIsLoading(false);
    }
  }, [currentQuote.shipmentGroupId]);

  // Créer un groupement
  const createGroup = useCallback(async (selectedQuoteIds: string[]) => {
    if (selectedQuoteIds.length < 2) {
      toast.error('Un groupement nécessite au moins 2 devis');
      return;
    }

    setIsCreating(true);
    try {
      const group = await createShipmentGroup(selectedQuoteIds, saasAccountId);

      setCurrentGroup(group);
      setSuggestion(null);
      
      if (onGroupCreated) {
        onGroupCreated(group);
      }

      console.log('[useShipmentGrouping] ✅ Groupe créé:', group.id);
      return group;
    } catch (error) {
      console.error('[useShipmentGrouping] Erreur création groupe:', error);
      throw error;
    } finally {
      setIsCreating(false);
    }
  }, [saasAccountId, onGroupCreated]);

  // Dissoudre un groupement
  const dissolveGroup = useCallback(async (groupId: string) => {
    setIsDeleting(true);
    try {
      await deleteShipmentGroup(groupId);
      setCurrentGroup(null);
      
      if (onGroupDeleted) {
        onGroupDeleted();
      }

      toast.success('Groupement dissous avec succès');
      console.log('[useShipmentGrouping] ✅ Groupe dissous:', groupId);
    } catch (error) {
      console.error('[useShipmentGrouping] Erreur dissolution groupe:', error);
      toast.error('Erreur lors de la dissolution du groupement');
      throw error;
    } finally {
      setIsDeleting(false);
    }
  }, [onGroupDeleted]);

  // Détection automatique au chargement
  useEffect(() => {
    if (!currentQuote || !currentQuote.id) {
      return;
    }
    
    if (currentQuote.shipmentGroupId) {
      loadExistingGroup();
    } else {
      detectGrouping();
    }
  }, [currentQuote?.id, currentQuote?.shipmentGroupId, detectGrouping, loadExistingGroup]);

  return {
    suggestion,
    currentGroup,
    isLoading,
    isCreating,
    isDeleting,
    createGroup,
    dissolveGroup,
    refreshDetection: detectGrouping,
  };
}

