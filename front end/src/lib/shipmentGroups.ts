/**
 * Client API pour la gestion des groupements d'expédition
 */

import type { ShipmentGroup, GroupSuggestion, GroupableQuote } from '@/types/shipmentGroup';
import { authenticatedFetch } from './api';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5174';

/**
 * Récupère les devis groupables pour un devis donné
 * 
 * @param devisId - ID du devis pour lequel chercher des groupements possibles
 * @returns Liste des devis groupables et suggestion de groupement
 */
export async function getGroupableQuotes(devisId: string): Promise<{
  groupableQuotes: GroupableQuote[];
  suggestion: GroupSuggestion | null;
}> {
  const response = await authenticatedFetch(`${API_BASE}/api/devis/${devisId}/groupable-quotes`);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
    throw new Error(error.error || 'Erreur lors de la récupération des devis groupables');
  }
  
  const data = await response.json();
  
  // Convertir les dates
  if (data.groupableQuotes) {
    data.groupableQuotes = data.groupableQuotes.map((q: any) => ({
      ...q,
      createdAt: new Date(q.createdAt),
    }));
  }
  
  if (data.suggestion?.quotes) {
    data.suggestion.quotes = data.suggestion.quotes.map((q: any) => ({
      ...q,
      createdAt: new Date(q.createdAt),
    }));
  }
  
  return data;
}

/**
 * Crée un nouveau groupement d'expédition
 * 
 * @param devisIds - Liste des IDs des devis à grouper
 * @param clientSaasId - ID du compte SaaS client
 * @returns Le groupement créé
 */
export async function createShipmentGroup(
  devisIds: string[],
  clientSaasId: string
): Promise<ShipmentGroup> {
  const response = await authenticatedFetch(`${API_BASE}/api/shipment-groups`, {
    method: 'POST',
    body: JSON.stringify({ devisIds, clientSaasId }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
    throw new Error(error.error || 'Erreur lors de la création du groupement');
  }
  
  const data = await response.json();
  
  // Convertir les dates
  return {
    ...data.shipmentGroup,
    createdAt: new Date(data.shipmentGroup.createdAt),
    updatedAt: new Date(data.shipmentGroup.updatedAt),
    validatedAt: data.shipmentGroup.validatedAt 
      ? new Date(data.shipmentGroup.validatedAt) 
      : undefined,
    paidAt: data.shipmentGroup.paidAt 
      ? new Date(data.shipmentGroup.paidAt) 
      : undefined,
    shippedAt: data.shipmentGroup.shippedAt 
      ? new Date(data.shipmentGroup.shippedAt) 
      : undefined,
  };
}

/**
 * Récupère un groupement d'expédition par son ID
 * 
 * @param groupId - ID du groupement
 * @returns Le groupement
 */
export async function getShipmentGroup(groupId: string): Promise<ShipmentGroup> {
  const response = await authenticatedFetch(`${API_BASE}/api/shipment-groups/${groupId}`);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
    throw new Error(error.error || 'Erreur lors de la récupération du groupement');
  }
  
  const data = await response.json();
  
  // Convertir les dates
  return {
    ...data,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
    validatedAt: data.validatedAt ? new Date(data.validatedAt) : undefined,
    paidAt: data.paidAt ? new Date(data.paidAt) : undefined,
    shippedAt: data.shippedAt ? new Date(data.shippedAt) : undefined,
  };
}

/**
 * Dissout un groupement d'expédition (remet les devis en état individuel)
 * 
 * @param groupId - ID du groupement à dissoudre
 */
export async function deleteShipmentGroup(groupId: string): Promise<void> {
  const response = await authenticatedFetch(`${API_BASE}/api/shipment-groups/${groupId}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
    throw new Error(error.error || 'Erreur lors de la dissolution du groupement');
  }
}

/**
 * Crée un paiement pour un groupement d'expédition
 * 
 * @param groupId - ID du groupement
 * @param description - Description optionnelle du paiement
 * @returns Informations sur le paiement créé
 */
export async function createGroupPayment(
  groupId: string,
  description?: string
): Promise<{
  paiementId: string;
  checkoutUrl: string;
  sessionId: string;
  amount: number;
}> {
  const response = await authenticatedFetch(`${API_BASE}/api/shipment-groups/${groupId}/paiement`, {
    method: 'POST',
    body: JSON.stringify({ description }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
    throw new Error(error.error || 'Erreur lors de la création du paiement groupé');
  }

  return response.json();
}

