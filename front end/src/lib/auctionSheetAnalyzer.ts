/**
 * Service d'analyse de bordereau d'adjudication
 * Simule l'OCR et l'extraction d'informations depuis un document scanné
 */

export interface AuctionLot {
  lotNumber: string;
  description: string;
  estimatedDimensions?: {
    length: number;
    width: number;
    height: number;
    weight: number;
  };
  value?: number;
}

export interface RecommendedCarton {
  ref: string;
  label?: string;
  /** Dimensions internes (cm) si connues */
  inner?: {
    length: number;
    width: number;
    height: number;
  } | null;
  /** Marge appliquée côté serveur (debug) */
  required?: {
    length: number;
    width: number;
    height: number;
  };
  priceTTC?: number | null;
  source?: string;
}

export interface AuctionSheetAnalysis {
  auctionHouse?: string;
  auctionDate?: Date;
  lots: AuctionLot[];
  totalLots: number;
  totalObjects: number;
  /** True uniquement si l'utilisateur a explicitement retiré le bordereau */
  removed?: boolean;
  /** Montant total payé (ex: "Total invoice", "Facture total") */
  invoiceTotal?: number;
  /** Texte brut du total (debug OCR) */
  invoiceTotalRaw?: string;
  /** Numéro de bordereau (ex: "INV-12345") */
  bordereauNumber?: string;
  /** Carton recommandé (si dimensions disponibles) */
  recommendedCarton?: RecommendedCarton;
  rawText?: string;
}

/**
 * Recherche des dimensions potentielles basées sur la description de l'objet
 */
function estimateDimensionsFromDescription(description: string): {
  length: number;
  width: number;
  height: number;
  weight: number;
} {
  const desc = description.toLowerCase();
  
  // Recherche de mots-clés pour estimer les dimensions
  let length = 50; // valeurs par défaut en cm
  let width = 40;
  let height = 30;
  let weight = 5; // en kg
  
  // Tableaux
  if (desc.includes('table') || desc.includes('bureau')) {
    length = 120;
    width = 80;
    height = 75;
    weight = 20;
  }
  // Chaises
  else if (desc.includes('chaise') || desc.includes('fauteuil')) {
    length = 50;
    width = 50;
    height = 100;
    weight = 5;
  }
  // Commodes/Armoires
  else if (desc.includes('commode') || desc.includes('armoire') || desc.includes('buffet')) {
    length = 100;
    width = 50;
    height = 120;
    weight = 40;
  }
  // Tableaux/Peintures
  else if (desc.includes('tableau') || desc.includes('peinture') || desc.includes('affiche')) {
    length = 60;
    width = 50;
    height = 5;
    weight = 2;
  }
  // Vases/Céramiques
  else if (desc.includes('vase') || desc.includes('céramique') || desc.includes('porcelaine')) {
    length = 30;
    width = 30;
    height = 40;
    weight = 2;
  }
  // Bijoux/Petits objets
  else if (desc.includes('bijou') || desc.includes('montre') || desc.includes('bague')) {
    length = 10;
    width = 10;
    height = 5;
    weight = 0.1;
  }
  // Livres
  else if (desc.includes('livre') || desc.includes('ouvrage')) {
    length = 25;
    width = 18;
    height = 3;
    weight = 0.5;
  }
  // Sculptures
  else if (desc.includes('sculpture') || desc.includes('statue')) {
    length = 40;
    width = 30;
    height = 60;
    weight = 10;
  }
  // Luminaires
  else if (desc.includes('lampe') || desc.includes('lustre') || desc.includes('applique')) {
    length = 30;
    width = 30;
    height = 50;
    weight = 3;
  }
  
  // Recherche de dimensions explicites dans la description (ex: "50x40x30")
  const dimensionMatch = desc.match(/(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)/);
  if (dimensionMatch) {
    length = parseInt(dimensionMatch[1]);
    width = parseInt(dimensionMatch[2]);
    height = parseInt(dimensionMatch[3]);
  }
  
  // Recherche de poids explicite
  const weightMatch = desc.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilogramme)/);
  if (weightMatch) {
    weight = parseFloat(weightMatch[1].replace(',', '.'));
  }
  
  return { length, width, height, weight };
}

/**
 * Analyse un fichier de bordereau d'adjudication (simulation OCR)
 * Dans une vraie implémentation, cela appellerait une API OCR comme Tesseract, Google Vision, etc.
 */
export async function analyzeAuctionSheet(file: File): Promise<AuctionSheetAnalysis> {
  // Simulation d'un délai d'analyse OCR
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Dans une vraie implémentation, on utiliserait une API OCR ici
  // Pour la démo, on simule l'extraction depuis le nom du fichier et on génère des données d'exemple
  
  const fileName = file.name.toLowerCase();
  
  // Simulation d'extraction de texte (dans la vraie vie, ce serait le résultat OCR)
  const mockRawText = `
    BORDEREAU D'ADJUDICATION
    Salle des Ventes: Drouot
    Date: ${new Date().toLocaleDateString('fr-FR')}
    
    LOT 1: Table en bois massif, style Louis XVI, 120x80x75 cm, 20 kg
    LOT 2: Paire de chaises anciennes, tissu damassé, 50x50x100 cm, 5 kg chacune
    LOT 3: Commode en marqueterie, tiroirs, 100x50x120 cm, 40 kg
    LOT 4: Tableau à l'huile sur toile, cadre doré, 60x50x5 cm, 2 kg
    LOT 5: Vase en porcelaine de Sèvres, décor floral, 30x30x40 cm, 2 kg
  `;
  
  // Extraction simulée des lots
  const lots: AuctionLot[] = [];
  
  // Si le fichier contient "multi" ou "plusieurs", on génère plusieurs lots
  const hasMultipleLots = fileName.includes('multi') || fileName.includes('plusieurs') || fileName.includes('lots');
  
  if (hasMultipleLots) {
    lots.push(
      {
        lotNumber: '1',
        description: 'Table en bois massif, style Louis XVI',
        estimatedDimensions: estimateDimensionsFromDescription('Table en bois massif'),
        value: 1500
      },
      {
        lotNumber: '2',
        description: 'Paire de chaises anciennes, tissu damassé',
        estimatedDimensions: estimateDimensionsFromDescription('Paire de chaises anciennes'),
        value: 800
      },
      {
        lotNumber: '3',
        description: 'Commode en marqueterie, tiroirs',
        estimatedDimensions: estimateDimensionsFromDescription('Commode en marqueterie'),
        value: 2000
      },
      {
        lotNumber: '4',
        description: 'Tableau à l\'huile sur toile, cadre doré',
        estimatedDimensions: estimateDimensionsFromDescription('Tableau à l\'huile'),
        value: 3000
      },
      {
        lotNumber: '5',
        description: 'Vase en porcelaine de Sèvres, décor floral',
        estimatedDimensions: estimateDimensionsFromDescription('Vase en porcelaine'),
        value: 1200
      }
    );
  } else {
    // Un seul lot par défaut
    const defaultDescription = fileName.includes('table') ? 'Table ancienne' :
                                fileName.includes('chaise') ? 'Chaise ancienne' :
                                fileName.includes('commode') ? 'Commode ancienne' :
                                fileName.includes('tableau') ? 'Tableau ancien' :
                                'Objet d\'art';
    
    lots.push({
      lotNumber: '1',
      description: defaultDescription,
      estimatedDimensions: estimateDimensionsFromDescription(defaultDescription),
      value: 1000
    });
  }
  
  // Compter le nombre total d'objets (si plusieurs objets dans un lot)
  const totalObjects = lots.reduce((sum, lot) => {
    const desc = lot.description.toLowerCase();
    // Détecter "paire", "lot de", "ensemble"
    if (desc.includes('paire')) return sum + 2;
    if (desc.includes('lot de') || desc.includes('ensemble de')) {
      const match = desc.match(/lot de (\d+)|ensemble de (\d+)/);
      if (match) return sum + parseInt(match[1] || match[2] || '1');
    }
    return sum + 1;
  }, 0);
  
  return {
    auctionHouse: fileName.includes('drouot') ? 'Drouot' : 
                  fileName.includes('christie') ? 'Christie\'s' :
                  fileName.includes('sotheby') ? 'Sotheby\'s' :
                  'Salle des ventes',
    auctionDate: new Date(),
    lots,
    totalLots: lots.length,
    totalObjects,
    rawText: mockRawText
  };
}

/**
 * Recherche les dimensions potentielles pour une description donnée
 */
export function searchDimensionsForDescription(description: string): {
  length: number;
  width: number;
  height: number;
  weight: number;
} {
  return estimateDimensionsFromDescription(description);
}
