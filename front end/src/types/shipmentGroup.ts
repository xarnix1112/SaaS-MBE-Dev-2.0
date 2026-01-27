/**
 * Types pour le système de groupement d'expéditions
 * Permet de regrouper plusieurs devis pour une expédition unique
 */

export type ShipmentGroupStatus = 
  | 'draft'        // Groupe en cours de création
  | 'validated'    // Groupe validé, prêt pour paiement
  | 'paid'         // Paiement reçu
  | 'shipped';     // Expédié

export interface ShipmentGroupCarton {
  cartonId: string;
  cartonRef: string;  // Ex: "CAS202"
  length: number;     // cm
  width: number;      // cm
  height: number;     // cm
  weight: number;     // kg
  volumetricWeight: number; // kg
}

export interface ShipmentGroupBordereau {
  bordereauId: string;
  devisId: string;
  reference: string;  // Ex: "Salle A - Bordereau 452"
  saleRoom?: string;
}

export interface ShipmentGroup {
  id: string;
  saasAccountId: string;
  clientId: string;
  clientEmail: string;
  clientName: string;
  
  // Adresse normalisée pour le groupement
  recipientAddressRaw: string;
  recipientAddressNormalized: string;
  
  // Devis et bordereaux inclus
  devisIds: string[];
  bordereaux: ShipmentGroupBordereau[];
  
  // Emballage
  cartons: ShipmentGroupCarton[];
  
  // Poids et dimensions
  totalWeight: number;           // kg (réel)
  totalVolumetricWeight: number; // kg (volumétrique)
  finalWeight: number;           // max(réel, volumétrique)
  
  // Coûts
  shippingCost: number;          // €
  totalPackagingCost: number;    // €
  totalCost: number;             // shipping + packaging
  
  // Métadonnées
  status: ShipmentGroupStatus;
  createdAt: Date;
  updatedAt: Date;
  validatedAt?: Date;
  paidAt?: Date;
  shippedAt?: Date;
  
  // Paiement
  stripeSessionId?: string;
  stripeCheckoutUrl?: string;
}

export interface GroupableQuote {
  id: string;
  reference: string;
  clientName: string;
  clientEmail: string;
  recipientAddress: string;
  recipientAddressNormalized: string;
  totalWeight: number;
  totalVolume: number;
  bordereauCount: number;
  lotCount: number;
  createdAt: Date;
}

export interface GroupSuggestion {
  potentialSavings: number;      // € économisés
  quotes: GroupableQuote[];
  totalWeight: number;
  totalVolume: number;
  estimatedCartons: number;
  estimatedShippingCost: number;
}



