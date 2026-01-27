/**
 * Module de calcul d'expédition groupée
 * 
 * Calcule le coût d'expédition pour un groupement de devis avec :
 * - Algorithme d'empilement intelligent (bin packing)
 * - Calcul du poids volumétrique
 * - Optimisation multi-cartons
 */

import type { Carton } from '@/types/shipmentGroup';

/**
 * Dimensions d'un lot individuel
 */
export interface LotDimensions {
  length: number; // cm
  width: number; // cm
  height: number; // cm
  weight: number; // kg
  lotId: string;
  description?: string;
}

/**
 * Cartons standards disponibles (dimensions internes en cm)
 */
export const STANDARD_CARTONS = [
  { ref: 'S', length: 30, width: 20, height: 20, maxWeight: 10, label: 'Petit (30x20x20)' },
  { ref: 'M', length: 40, width: 30, height: 30, maxWeight: 20, label: 'Moyen (40x30x30)' },
  { ref: 'L', length: 60, width: 40, height: 40, maxWeight: 30, label: 'Grand (60x40x40)' },
  { ref: 'XL', length: 80, width: 60, height: 50, maxWeight: 40, label: 'Très grand (80x60x50)' },
] as const;

/**
 * Facteur de sécurité pour l'empilement (espace perdu entre objets)
 */
const PACKING_EFFICIENCY = 0.75; // 75% d'efficacité

/**
 * Diviseur pour le poids volumétrique (standard international)
 */
const VOLUMETRIC_DIVISOR = 5000; // cm³/kg

/**
 * Résultat du calcul d'expédition groupée
 */
export interface GroupedShippingResult {
  cartons: Carton[];
  totalRealWeight: number; // kg
  totalVolumetricWeight: number; // kg
  finalWeight: number; // max(real, volumetric)
  estimatedCost: number; // €
  packingDetails: {
    efficiency: number; // %
    wastedSpace: number; // cm³
    lotsPerCarton: Record<string, string[]>; // cartonId -> lotIds
  };
}

/**
 * Calcule le volume d'un lot en cm³
 */
function calculateVolume(dimensions: LotDimensions): number {
  return dimensions.length * dimensions.width * dimensions.height;
}

/**
 * Calcule le poids volumétrique en kg
 */
function calculateVolumetricWeight(volumeCm3: number): number {
  return volumeCm3 / VOLUMETRIC_DIVISOR;
}

/**
 * Trie les lots par volume décroissant (First Fit Decreasing)
 */
function sortLotsByVolume(lots: LotDimensions[]): LotDimensions[] {
  return [...lots].sort((a, b) => calculateVolume(b) - calculateVolume(a));
}

/**
 * Vérifie si un lot peut entrer dans un carton
 */
function canFitInCarton(
  lot: LotDimensions,
  carton: typeof STANDARD_CARTONS[number],
  currentWeight: number
): boolean {
  // Vérifier le poids
  if (currentWeight + lot.weight > carton.maxWeight) {
    return false;
  }

  // Vérifier les dimensions (toutes les orientations possibles)
  const lotDims = [lot.length, lot.width, lot.height].sort((a, b) => b - a);
  const cartonDims = [carton.length, carton.width, carton.height].sort((a, b) => b - a);

  return (
    lotDims[0] <= cartonDims[0] &&
    lotDims[1] <= cartonDims[1] &&
    lotDims[2] <= cartonDims[2]
  );
}

/**
 * Algorithme d'empilement First Fit Decreasing (FFD)
 * 
 * Stratégie :
 * 1. Trier les lots par volume décroissant
 * 2. Pour chaque lot, essayer de le placer dans un carton existant
 * 3. Si aucun carton ne convient, créer un nouveau carton
 */
export function packLotsIntoCartons(lots: LotDimensions[]): {
  cartons: Carton[];
  lotsPerCarton: Record<string, string[]>;
} {
  const sortedLots = sortLotsByVolume(lots);
  const cartons: Carton[] = [];
  const lotsPerCarton: Record<string, string[]> = {};

  for (const lot of sortedLots) {
    let placed = false;

    // Essayer de placer dans un carton existant
    for (const carton of cartons) {
      const currentWeight = carton.weight;
      const cartonType = STANDARD_CARTONS.find(
        c => c.length === carton.length && c.width === carton.width && c.height === carton.height
      );

      if (cartonType && canFitInCarton(lot, cartonType, currentWeight)) {
        carton.weight += lot.weight;
        lotsPerCarton[carton.cartonId].push(lot.lotId);
        placed = true;
        break;
      }
    }

    // Si pas placé, créer un nouveau carton
    if (!placed) {
      // Trouver le plus petit carton qui peut contenir le lot
      const suitableCarton = STANDARD_CARTONS.find(c => canFitInCarton(lot, c, 0));

      if (!suitableCarton) {
        console.warn(`[packLotsIntoCartons] ⚠️ Lot trop grand pour les cartons standards:`, lot);
        // Utiliser le plus grand carton disponible
        const largestCarton = STANDARD_CARTONS[STANDARD_CARTONS.length - 1];
        const newCarton: Carton = {
          cartonId: `CARTON-${cartons.length + 1}`,
          length: largestCarton.length,
          width: largestCarton.width,
          height: largestCarton.height,
          weight: lot.weight,
        };
        cartons.push(newCarton);
        lotsPerCarton[newCarton.cartonId] = [lot.lotId];
      } else {
        const newCarton: Carton = {
          cartonId: `CARTON-${cartons.length + 1}`,
          length: suitableCarton.length,
          width: suitableCarton.width,
          height: suitableCarton.height,
          weight: lot.weight,
        };
        cartons.push(newCarton);
        lotsPerCarton[newCarton.cartonId] = [lot.lotId];
      }
    }
  }

  return { cartons, lotsPerCarton };
}

/**
 * Calcule le coût d'expédition groupée
 * 
 * @param lots - Liste des lots à expédier
 * @param destination - Code pays de destination (ex: "FR", "DE")
 * @returns Résultat du calcul avec détails
 */
export function calculateGroupedShipping(
  lots: LotDimensions[],
  destination: string = 'FR'
): GroupedShippingResult {
  console.log(`[calculateGroupedShipping] 📦 Calcul pour ${lots.length} lots vers ${destination}`);

  // 1. Empiler les lots dans des cartons
  const { cartons, lotsPerCarton } = packLotsIntoCartons(lots);

  console.log(`[calculateGroupedShipping] ✅ ${cartons.length} carton(s) nécessaire(s)`);

  // 2. Calculer le poids réel total
  const totalRealWeight = cartons.reduce((sum, c) => sum + c.weight, 0);

  // 3. Calculer le poids volumétrique total
  const totalVolumeCm3 = cartons.reduce(
    (sum, c) => sum + c.length * c.width * c.height,
    0
  );
  const totalVolumetricWeight = calculateVolumetricWeight(totalVolumeCm3);

  // 4. Le poids facturable est le maximum entre réel et volumétrique
  const finalWeight = Math.max(totalRealWeight, totalVolumetricWeight);

  console.log(`[calculateGroupedShipping] Poids réel: ${totalRealWeight.toFixed(2)} kg`);
  console.log(`[calculateGroupedShipping] Poids volumétrique: ${totalVolumetricWeight.toFixed(2)} kg`);
  console.log(`[calculateGroupedShipping] Poids facturable: ${finalWeight.toFixed(2)} kg`);

  // 5. Estimation du coût (simplifié - à remplacer par votre grille tarifaire)
  const estimatedCost = estimateShippingCost(finalWeight, destination, cartons.length);

  // 6. Calculer l'efficacité d'empilement
  const totalLotsVolume = lots.reduce((sum, lot) => sum + calculateVolume(lot), 0);
  const efficiency = (totalLotsVolume / totalVolumeCm3) * 100;
  const wastedSpace = totalVolumeCm3 - totalLotsVolume;

  return {
    cartons,
    totalRealWeight,
    totalVolumetricWeight,
    finalWeight,
    estimatedCost,
    packingDetails: {
      efficiency,
      wastedSpace,
      lotsPerCarton,
    },
  };
}

/**
 * Estimation du coût d'expédition (simplifié)
 * 
 * TODO: Intégrer avec votre grille tarifaire réelle
 */
function estimateShippingCost(
  weight: number,
  destination: string,
  cartonCount: number
): number {
  // Tarif de base par kg
  const baseRatePerKg = destination === 'FR' ? 2.5 : 5.0;
  
  // Coût par carton (manutention)
  const cartonHandlingCost = cartonCount * 3.0;
  
  // Coût total
  const totalCost = (weight * baseRatePerKg) + cartonHandlingCost;
  
  return Math.round(totalCost * 100) / 100; // Arrondir à 2 décimales
}

/**
 * Compare le coût d'expédition groupée vs individuelle
 */
export function compareGroupedVsIndividual(
  lots: LotDimensions[],
  individualCosts: number[],
  destination: string = 'FR'
): {
  groupedResult: GroupedShippingResult;
  individualTotal: number;
  savings: number;
  savingsPercent: number;
} {
  const groupedResult = calculateGroupedShipping(lots, destination);
  const individualTotal = individualCosts.reduce((sum, cost) => sum + cost, 0);
  const savings = individualTotal - groupedResult.estimatedCost;
  const savingsPercent = (savings / individualTotal) * 100;

  console.log(`[compareGroupedVsIndividual] 💰 Économie: ${savings.toFixed(2)}€ (${savingsPercent.toFixed(1)}%)`);

  return {
    groupedResult,
    individualTotal,
    savings,
    savingsPercent,
  };
}



