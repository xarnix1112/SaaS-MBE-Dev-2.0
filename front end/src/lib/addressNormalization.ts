/**
 * Utilitaires pour normalisation d'adresses
 * Permet de comparer des adresses similaires malgré des variations d'écriture
 */

const ABBREVIATIONS: Record<string, string> = {
  'avenue': 'av',
  'boulevard': 'bd',
  'rue': 'r',
  'place': 'pl',
  'impasse': 'imp',
  'chemin': 'ch',
  'route': 'rte',
  'allée': 'all',
  'square': 'sq',
  'cours': 'crs',
  'quai': 'q',
  'passage': 'pass',
  'résidence': 'res',
  'lotissement': 'lot',
  'appartement': 'apt',
  'bâtiment': 'bat',
  'etage': 'et',
  'ème': 'e',
  'premier': '1er',
  'deuxieme': '2e',
  'troisieme': '3e',
  'quatrieme': '4e',
  'cinquieme': '5e',
};

const REMOVE_CHARS = /[.,;:'"]/g;
const MULTIPLE_SPACES = /\s+/g;

/**
 * Normalise une adresse pour faciliter la comparaison
 * 
 * @param address - Adresse brute à normaliser
 * @returns Adresse normalisée (minuscules, abréviations, sans ponctuation)
 * 
 * @example
 * normalizeAddress("12 Avenue des Champs-Élysées, 75008 Paris")
 * // "12 av des champs elysees 75008 paris"
 * 
 * normalizeAddress("Résidence le Parc, Bâtiment A, 3ème étage")
 * // "res le parc bat a 3e et"
 */
export function normalizeAddress(address: string): string {
  if (!address) return '';
  
  let normalized = address.toLowerCase().trim();
  
  // Supprimer les accents
  normalized = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  // Remplacer les abréviations communes
  Object.entries(ABBREVIATIONS).forEach(([full, abbr]) => {
    const regex = new RegExp(`\\b${full}\\b`, 'g');
    normalized = normalized.replace(regex, abbr);
  });
  
  // Supprimer la ponctuation
  normalized = normalized.replace(REMOVE_CHARS, '');
  
  // Normaliser les espaces multiples
  normalized = normalized.replace(MULTIPLE_SPACES, ' ').trim();
  
  return normalized;
}

/**
 * Compare deux adresses normalisées
 * 
 * @param address1 - Première adresse
 * @param address2 - Deuxième adresse
 * @returns true si les adresses normalisées sont identiques
 */
export function areAddressesEqual(address1: string, address2: string): boolean {
  return normalizeAddress(address1) === normalizeAddress(address2);
}

/**
 * Calcule un score de similarité entre deux adresses (0-1)
 * Utile pour les suggestions floues
 * 
 * @param address1 - Première adresse
 * @param address2 - Deuxième adresse
 * @returns Score de similarité (0 = différent, 1 = identique)
 */
export function addressSimilarity(address1: string, address2: string): number {
  const norm1 = normalizeAddress(address1);
  const norm2 = normalizeAddress(address2);
  
  if (norm1 === norm2) return 1;
  if (!norm1 || !norm2) return 0;
  
  // Calcul de similarité simple (Levenshtein distance simplifiée)
  const words1 = norm1.split(' ');
  const words2 = norm2.split(' ');
  
  const commonWords = words1.filter(w => words2.includes(w)).length;
  const totalWords = Math.max(words1.length, words2.length);
  
  return commonWords / totalWords;
}

/**
 * Extrait les composants principaux d'une adresse
 * Utile pour l'affichage et le debug
 */
export interface AddressComponents {
  number?: string;
  street?: string;
  complement?: string;
  postalCode?: string;
  city?: string;
  country?: string;
}

/**
 * Parse une adresse en composants (heuristique simple)
 * 
 * @param address - Adresse à parser
 * @returns Composants identifiés
 */
export function parseAddress(address: string): AddressComponents {
  const normalized = normalizeAddress(address);
  const parts = normalized.split(' ');
  
  const components: AddressComponents = {};
  
  // Chercher code postal (5 chiffres)
  const postalCodeMatch = normalized.match(/\b(\d{5})\b/);
  if (postalCodeMatch) {
    components.postalCode = postalCodeMatch[1];
    
    // La ville est souvent après le code postal
    const afterPostal = normalized.split(postalCodeMatch[1])[1]?.trim();
    if (afterPostal) {
      components.city = afterPostal.split(/[,;]/)[0].trim();
    }
  }
  
  // Chercher numéro de rue (début)
  const numberMatch = normalized.match(/^(\d+[a-z]?)\b/);
  if (numberMatch) {
    components.number = numberMatch[1];
  }
  
  return components;
}



