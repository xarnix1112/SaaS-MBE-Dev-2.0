/**
 * Logique de calcul et d'optimisation des cartons pour les devis
 * Système SaaS-safe : chaque compte a ses propres cartons
 */

export interface Carton {
  id: string;
  carton_ref: string;
  inner_length: number;  // cm
  inner_width: number;   // cm
  inner_height: number;  // cm
  packaging_price: number; // € TTC
  isDefault: boolean;
  isActive: boolean;
}

export interface Item {
  length: number;  // cm
  width: number;   // cm
  height: number;  // cm
  weight?: number; // kg
  quantity?: number;
}

export interface PackagingResult {
  cartons: {
    carton: Carton;
    items: Item[];
    volumetricWeight: number; // kg
  }[];
  totalPackagingCost: number; // € TTC
  totalVolumetricWeight: number; // kg
  warnings: string[];
}

/**
 * Calcule le volume d'un item en cm³
 */
function getItemVolume(item: Item): number {
  return item.length * item.width * item.height;
}

/**
 * Calcule le volume d'un carton en cm³
 */
function getCartonVolume(carton: Carton): number {
  return carton.inner_length * carton.inner_width * carton.inner_height;
}

/**
 * Vérifie si un item peut rentrer dans un carton (avec marge de protection)
 * @param item - Item à emballer
 * @param carton - Carton à tester
 * @param protectionMargin - Marge de protection en cm (bulle, calage)
 */
function canFitInCarton(item: Item, carton: Carton, protectionMargin: number = 2): boolean {
  // Dimensions de l'item avec marge de protection
  const itemWithMargin = {
    length: item.length + protectionMargin * 2,
    width: item.width + protectionMargin * 2,
    height: item.height + protectionMargin * 2,
  };

  // Essayer toutes les orientations possibles
  const itemDimensions = [
    itemWithMargin.length,
    itemWithMargin.width,
    itemWithMargin.height,
  ].sort((a, b) => b - a); // Trier par ordre décroissant

  const cartonDimensions = [
    carton.inner_length,
    carton.inner_width,
    carton.inner_height,
  ].sort((a, b) => b - a); // Trier par ordre décroissant

  // Vérifier si chaque dimension de l'item peut rentrer dans le carton
  return (
    itemDimensions[0] <= cartonDimensions[0] &&
    itemDimensions[1] <= cartonDimensions[1] &&
    itemDimensions[2] <= cartonDimensions[2]
  );
}

/**
 * Trouve le carton le plus petit qui peut contenir un item
 */
function findBestCartonForItem(
  item: Item,
  cartons: Carton[],
  protectionMargin: number = 2
): Carton | null {
  const fittingCartons = cartons.filter(carton => canFitInCarton(item, carton, protectionMargin));

  if (fittingCartons.length === 0) {
    return null;
  }

  // Trier par volume croissant et retourner le plus petit
  return fittingCartons.sort((a, b) => getCartonVolume(a) - getCartonVolume(b))[0];
}

/**
 * Calcule le poids volumétrique d'un carton
 * @param carton - Carton
 * @param coefficient - Coefficient de conversion (par défaut 5000 pour la plupart des transporteurs)
 */
export function calculateVolumetricWeight(carton: Carton, coefficient: number = 5000): number {
  return (carton.inner_length * carton.inner_width * carton.inner_height) / coefficient;
}

/**
 * Optimise l'emballage des items dans des cartons
 * @param items - Liste des items à emballer
 * @param cartons - Liste des cartons disponibles (filtrés par saasAccountId)
 * @param protectionMargin - Marge de protection en cm (bulle, calage)
 * @returns Résultat de l'optimisation avec cartons utilisés et coûts
 */
export function optimizePackaging(
  items: Item[],
  cartons: Carton[],
  protectionMargin: number = 2
): PackagingResult {
  const result: PackagingResult = {
    cartons: [],
    totalPackagingCost: 0,
    totalVolumetricWeight: 0,
    warnings: [],
  };

  // Vérifier qu'il y a des cartons disponibles
  if (cartons.length === 0) {
    result.warnings.push('❌ Aucun carton configuré. Veuillez ajouter des cartons dans les paramètres.');
    return result;
  }

  // Trouver le carton par défaut
  const defaultCarton = cartons.find(c => c.isDefault);
  if (!defaultCarton) {
    result.warnings.push('❌ Aucun carton par défaut défini. Veuillez en définir un dans les paramètres.');
    return result;
  }

  // Développer les items avec quantité
  const expandedItems: Item[] = [];
  items.forEach(item => {
    const quantity = item.quantity || 1;
    for (let i = 0; i < quantity; i++) {
      expandedItems.push({ ...item, quantity: 1 });
    }
  });

  // Stratégie simple : un carton par item (peut être amélioré plus tard)
  // TODO: Implémenter un algorithme de bin packing pour optimiser
  expandedItems.forEach(item => {
    const bestCarton = findBestCartonForItem(item, cartons, protectionMargin);
    
    if (!bestCarton) {
      // Si aucun carton ne convient, utiliser le carton par défaut et avertir
      result.warnings.push(
        `⚠️ L'item (${item.length}×${item.width}×${item.height} cm) est trop grand pour tous les cartons. Utilisation du carton par défaut.`
      );
      
      result.cartons.push({
        carton: defaultCarton,
        items: [item],
        volumetricWeight: calculateVolumetricWeight(defaultCarton),
      });
      
      result.totalPackagingCost += defaultCarton.packaging_price;
      result.totalVolumetricWeight += calculateVolumetricWeight(defaultCarton);
    } else {
      result.cartons.push({
        carton: bestCarton,
        items: [item],
        volumetricWeight: calculateVolumetricWeight(bestCarton),
      });
      
      result.totalPackagingCost += bestCarton.packaging_price;
      result.totalVolumetricWeight += calculateVolumetricWeight(bestCarton);
    }
  });

  return result;
}

/**
 * Calcule le coût d'emballage pour un devis
 * Version simplifiée qui utilise le carton par défaut si aucune optimisation n'est faite
 */
export function calculatePackagingCost(
  items: Item[],
  cartons: Carton[]
): { cost: number; cartonUsed: Carton | null; warnings: string[] } {
  const warnings: string[] = [];

  if (cartons.length === 0) {
    warnings.push('❌ Aucun carton configuré');
    return { cost: 0, cartonUsed: null, warnings };
  }

  const defaultCarton = cartons.find(c => c.isDefault);
  if (!defaultCarton) {
    warnings.push('❌ Aucun carton par défaut défini');
    return { cost: 0, cartonUsed: null, warnings };
  }

  // Si pas d'items ou items vides, utiliser le carton par défaut
  if (!items || items.length === 0) {
    return {
      cost: defaultCarton.packaging_price,
      cartonUsed: defaultCarton,
      warnings,
    };
  }

  // Optimiser l'emballage
  const packagingResult = optimizePackaging(items, cartons);
  
  return {
    cost: packagingResult.totalPackagingCost,
    cartonUsed: packagingResult.cartons[0]?.carton || defaultCarton,
    warnings: packagingResult.warnings,
  };
}

/**
 * Formate le résultat d'emballage pour l'affichage
 */
export function formatPackagingResult(result: PackagingResult): string {
  if (result.cartons.length === 0) {
    return 'Aucun carton utilisé';
  }

  const cartonCounts = new Map<string, number>();
  result.cartons.forEach(({ carton }) => {
    const count = cartonCounts.get(carton.carton_ref) || 0;
    cartonCounts.set(carton.carton_ref, count + 1);
  });

  const lines: string[] = [];
  cartonCounts.forEach((count, ref) => {
    lines.push(`${count}× ${ref}`);
  });

  return lines.join(', ');
}

