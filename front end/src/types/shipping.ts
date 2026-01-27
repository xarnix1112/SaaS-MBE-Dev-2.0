/**
 * TYPES POUR LE SYSTÈME DE GRILLE TARIFAIRE D'EXPÉDITION
 * 
 * Architecture SaaS B2B :
 * - Chaque client SaaS a sa propre grille tarifaire
 * - Zones, services, tranches de poids et tarifs configurables
 * - Interpolation automatique entre tranches
 * - Forfait hors gabarit
 * - Versioning pour devis figés
 */

import { Timestamp } from "firebase/firestore";

/**
 * ZONE D'EXPÉDITION
 * 
 * Définit une zone géographique avec ses pays
 * Exemples : Europe Proche, Europe Élargie, Monde, etc.
 */
export interface ShippingZone {
  id: string;
  saasAccountId: string;
  
  name: string; // "Europe Proche"
  code: string; // "ZONE_EU_PROCHE"
  
  countries: string[]; // ["FR", "BE", "LU", "DE"]
  exceptions?: string[]; // ["DOM-TOM"] (pour futures évolutions)
  
  isActive: boolean;
  order?: number; // Pour trier l'affichage
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * SERVICE D'EXPÉDITION
 * 
 * Type de livraison proposé
 * Exemples : STANDARD, EXPRESS, ECONOMY, PRIORITY
 */
export interface ShippingService {
  id: string;
  saasAccountId: string;
  
  name: string; // "EXPRESS"
  description?: string; // "Livraison rapide"
  
  isActive: boolean;
  order?: number; // Pour trier l'affichage
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * TRANCHE DE POIDS
 * 
 * Définit les paliers de poids pour la tarification
 * Exemples : jusqu'à 1kg, 2kg, 5kg, 10kg, 20kg, 30kg
 */
export interface WeightBracket {
  id: string;
  saasAccountId: string;
  
  minWeight: number; // 10 (tranche à partir de 10 kg)
  order: number; // Pour trier l'affichage (1, 2, 3, ...)
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * TARIF D'EXPÉDITION
 * 
 * Prix pour une combinaison zone + service + tranche de poids
 * null = service non disponible pour cette combinaison
 */
export interface ShippingRate {
  id: string;
  saasAccountId: string;
  
  zoneId: string;
  serviceId: string;
  weightBracketId: string;
  
  price: number | null; // null = NA (service non disponible)
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * PARAMÈTRES D'EXPÉDITION
 * 
 * Configuration globale pour le compte SaaS
 * Gère les cas hors gabarit et autres paramètres
 */
export interface ShippingSettings {
  saasAccountId: string; // Utilisé comme ID du document
  
  // Politique hors gabarit
  overweightPolicy: "FLAT_FEE" | "DISABLED"; // FLAT_FEE = forfait fixe, DISABLED = pas de gestion
  overweightFlatFee?: number; // Montant du forfait (ex: 180€)
  overweightMessage?: string; // Message affiché au client
  
  // Paramètres futurs
  defaultServiceId?: string; // Service par défaut
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * SNAPSHOT DE TARIF (DANS LE DEVIS)
 * 
 * Copie figée des informations de tarification au moment du calcul
 * Permet de conserver l'historique même si la grille change
 */
export interface ShippingSnapshot {
  zoneName: string;
  zoneCode: string;
  serviceName: string;
  weightBracket: number; // Tranche utilisée (en kg)
  price: number;
  isOverweight?: boolean; // true si forfait hors gabarit appliqué
  overweightFee?: number; // Montant du forfait hors gabarit
  calculatedAt: Timestamp;
}

/**
 * RÉSULTAT DE CALCUL D'EXPÉDITION
 * 
 * Retourné par la fonction de calcul
 */
export interface ShippingCalculationResult {
  price: number;
  zone: ShippingZone;
  service: ShippingService;
  weightBracket: WeightBracket;
  billableWeight: number; // Poids facturé (max entre réel et volumétrique)
  isOverweight: boolean;
  overweightFee?: number;
  snapshot: ShippingSnapshot;
}

/**
 * DONNÉES POUR CRÉATION/MISE À JOUR
 * (sans les champs auto-générés)
 */

export type ShippingZoneInput = Omit<ShippingZone, "id" | "createdAt" | "updatedAt">;
export type ShippingServiceInput = Omit<ShippingService, "id" | "createdAt" | "updatedAt">;
export type WeightBracketInput = Omit<WeightBracket, "id" | "createdAt" | "updatedAt">;
export type ShippingRateInput = Omit<ShippingRate, "id" | "createdAt" | "updatedAt">;
export type ShippingSettingsInput = Omit<ShippingSettings, "createdAt" | "updatedAt">;

/**
 * DONNÉES POUR LA GRILLE UI
 * 
 * Structure optimisée pour l'affichage type Excel
 */
export interface ShippingGridData {
  zones: ShippingZone[];
  services: ShippingService[];
  weightBrackets: WeightBracket[];
  rates: ShippingRate[];
  settings: ShippingSettings | null;
}

/**
 * CELLULE DE LA GRILLE
 * 
 * Représente une cellule dans la grille type Excel
 */
export interface ShippingGridCell {
  zoneId: string;
  serviceId: string;
  weightBracketId: string;
  price: number | null;
  rateId?: string; // ID du ShippingRate existant (pour update)
}

/**
 * ZONES PRÉ-CRÉÉES À L'INSCRIPTION
 * 
 * Zones par défaut pour faciliter le démarrage
 */
export const DEFAULT_SHIPPING_ZONES: Array<Omit<ShippingZone, "id" | "saasAccountId" | "createdAt" | "updatedAt">> = [
  {
    name: "France Métropolitaine",
    code: "ZONE_FR",
    countries: ["FR"],
    isActive: true,
  },
  {
    name: "Europe Proche",
    code: "ZONE_EU_PROCHE",
    countries: ["BE", "LU", "DE", "NL", "ES", "IT"],
    isActive: true,
  },
  {
    name: "Europe Élargie",
    code: "ZONE_EU_LARGE",
    countries: ["PT", "AT", "DK", "IE", "SE", "FI", "PL", "CZ", "HU"],
    isActive: true,
  },
  {
    name: "Europe Éloignée",
    code: "ZONE_EU_FAR",
    countries: ["UK", "CH", "NO", "GR", "RO", "BG", "HR"],
    isActive: true,
  },
  {
    name: "Amérique du Nord",
    code: "ZONE_NA",
    countries: ["US", "CA", "MX"],
    isActive: true,
  },
  {
    name: "Asie",
    code: "ZONE_ASIA",
    countries: ["CN", "HK", "JP", "KR", "SG", "TH", "IN", "MY", "ID", "VN"],
    isActive: true,
  },
  {
    name: "Amérique du Sud",
    code: "ZONE_SA",
    countries: ["BR", "AR", "CL", "CO", "PE", "VE"],
    isActive: true,
  },
  {
    name: "Afrique",
    code: "ZONE_AF",
    countries: ["MA", "TN", "DZ", "SN", "CI", "EG", "ZA", "KE"],
    isActive: true,
  },
];

/**
 * SERVICES PRÉ-CRÉÉS À L'INSCRIPTION
 */
export const DEFAULT_SHIPPING_SERVICES: Array<Omit<ShippingService, "id" | "saasAccountId" | "createdAt" | "updatedAt">> = [
  {
    name: "STANDARD",
    description: "Livraison standard (5-7 jours)",
    isActive: true,
    order: 1,
  },
  {
    name: "EXPRESS",
    description: "Livraison rapide (2-3 jours)",
    isActive: true,
    order: 2,
  },
];

/**
 * TRANCHES DE POIDS PRÉ-CRÉÉES À L'INSCRIPTION
 */
export const DEFAULT_WEIGHT_BRACKETS: Array<Omit<WeightBracket, "id" | "saasAccountId" | "createdAt" | "updatedAt">> = [
  { minWeight: 1, order: 1 },
  { minWeight: 2, order: 2 },
  { minWeight: 5, order: 3 },
  { minWeight: 10, order: 4 },
  { minWeight: 20, order: 5 },
  { minWeight: 30, order: 6 },
  { minWeight: 40, order: 7 },
];

/**
 * TYPES POUR L'INTERFACE UI (shipping-rate-builder)
 */

export interface ServiceRate {
  serviceName: string;
  serviceId: string;
  rates: (number | null)[]; // null = NA
}

// Type pour l'UI de la grille (format accordéon)
export interface ShippingZoneUI {
  id: string;
  code: string; // A, B, C, etc.
  name: string;
  countries: string; // "FR, BE, LU, DE"
  weightBrackets: number[]; // [1, 2, 5, 10, 15, 20, 30]
  services: ServiceRate[];
  isExpanded: boolean;
}

export const ZONE_COLORS: Record<string, string> = {
  A: 'zone-badge-a',
  B: 'zone-badge-b',
  C: 'zone-badge-c',
  D: 'zone-badge-d',
  E: 'zone-badge-e',
  F: 'zone-badge-f',
  G: 'zone-badge-g',
  H: 'zone-badge-h',
};

