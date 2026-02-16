import { authenticatedFetch } from './api';
import type { ShippingGridData, ShippingZone as FirestoreShippingZone, ShippingService, WeightBracket, ShippingRate } from '../types/shipping';

// ⚠️ DÉPRÉCIÉ : Les URLs Google Sheets ne sont plus utilisées
// Les tarifs sont maintenant chargés depuis Firestore via l'API
// Ces constantes sont conservées pour compatibilité mais ne sont plus utilisées
const CARTON_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR2YRtgja8K3BZMILM-qJl_pztYKJSqiB0g1-wo02KzydyMGyXoDgdfA0Ih4Bf4hp40XL1NJObMuEHz/pub?gid=1299775832&single=true&output=csv";
const SHIPPING_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR2YRtgja8K3BZMILM-qJl_pztYKJSqiB0g1-wo02KzydyMGyXoDgdfA0Ih4Bf4hp40XL1NJObMuEHz/pub?gid=1518712190&single=true&output=csv";
const DEFAULT_CARTON_GID = "1299775832";
const DEFAULT_SHIPPING_GID = "1518712190";

// Cache pour éviter de recharger les données à chaque appel
let cartonPricesCache: Map<string, number> | null = null;
let cartonDataCache: Map<string, { ref: string; price: number; dimensions?: { length: number; width: number; height: number } }> | null = null;
let shippingRatesCache: ShippingZone[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CartonPrice {
  ref: string;
  price: number;
  dimensions?: {
    length: number;
    width: number;
    height: number;
  };
}

// Interface pour compatibilité avec le code existant
// Transforme les données Firestore en format utilisé par les fonctions de calcul
interface ShippingZone {
  zone: string; // Code de la zone (ex: "Zone A")
  countries: string[]; // Codes pays (ex: ["FR", "BE"])
  express: {
    [weightRange: string]: number; // "1-2", "2-5", etc. → prix en €
  };
}

/**
 * Calcule le poids volumétrique en kg
 * Formule standard : (L × l × H) / 5000
 */
export function calculateVolumetricWeight(
  length: number,
  width: number,
  height: number
): number {
  return Math.ceil((length * width * height) / 5000);
}

/**
 * Trouve le GID d'une page par son nom approximatif
 * Note: Cette fonction nécessite que le sheet soit publié et accessible
 * 
 * Pour trouver le GID d'une page Google Sheets :
 * 1. Ouvrir le Google Sheet
 * 2. Cliquer sur l'onglet de la page (ex: "Prix carton")
 * 3. Regarder l'URL dans le navigateur : elle contient "gid=XXXXX"
 * 4. Le GID est le nombre après "gid="
 * 
 * Alternative : Utiliser les variables d'environnement :
 * - VITE_PRICING_CARTON_GID pour la page "Prix carton"
 * - VITE_PRICING_SHIPPING_GID pour la page "Prix expé volume/zone"
 */
// Fonction de recherche de GID (conservée pour compatibilité, mais les GID sont maintenant en dur)
async function findSheetGidByName(sheetName: string): Promise<string | null> {
  // Les GID sont maintenant configurés manuellement, mais on garde cette fonction
  // pour la compatibilité avec le code existant
  console.log(`[pricing] Recherche du GID pour "${sheetName}"...`);
  
  // Retourner directement les GID connus
  if (sheetName.toLowerCase().includes("carton") || sheetName.toLowerCase().includes("prixcarton")) {
    console.log(`[pricing] GID trouvé pour "${sheetName}": ${DEFAULT_CARTON_GID}`);
    return DEFAULT_CARTON_GID;
  }
  
  if (sheetName.toLowerCase().includes("expe") || sheetName.toLowerCase().includes("volume") || sheetName.toLowerCase().includes("zone")) {
    console.log(`[pricing] GID trouvé pour "${sheetName}": ${DEFAULT_SHIPPING_GID}`);
    return DEFAULT_SHIPPING_GID;
  }
  
  console.warn(`[pricing] Aucun GID trouvé pour "${sheetName}"`);
  return null;
}

/**
 * Charge les prix des cartons depuis Firestore via l'API /api/cartons
 * Chaque client SaaS utilise ses propres cartons configurés dans Paramètres → Cartons
 */
export async function loadCartonPrices(gid?: string, forceReload: boolean = false): Promise<Map<string, number>> {
  // Vérifier le cache
  if (!forceReload && cartonPricesCache && cartonDataCache && (Date.now() - cacheTimestamp) < CACHE_DURATION) {
    console.log('[pricing] Utilisation du cache pour les prix cartons');
    return cartonPricesCache;
  }
  
  const prices = new Map<string, number>();
  const cartonData = new Map<string, { ref: string; price: number; dimensions?: { length: number; width: number; height: number } }>();
  
  try {
    console.log(`[pricing] Chargement Prix carton depuis Firestore (cartons du client SaaS)`);
    
    // Charger les cartons depuis l'API
    const response = await authenticatedFetch('/api/cartons');
    
    const responseText = await response.text();
    if (!response.ok) {
      console.error(`[pricing] Erreur ${response.status} lors du chargement des cartons: ${responseText.slice(0, 200)}`);
      if (cartonPricesCache) {
        console.warn('[pricing] Utilisation du cache en cas d\'erreur');
        return cartonPricesCache;
      }
      return prices;
    }

    // Détecter réponse HTML (backend inaccessible ou VITE_API_BASE_URL incorrect)
    if (responseText.trim().toLowerCase().startsWith('<!doctype') || responseText.trim().startsWith('<!')) {
      console.error('[pricing] Backend inaccessible (réponse HTML). Vérifiez VITE_API_BASE_URL dans Vercel.');
      if (cartonPricesCache) return cartonPricesCache;
      return prices;
    }

    const data = JSON.parse(responseText) as { cartons?: unknown[] };
    const cartons = data.cartons || [];
    
    console.log(`[pricing] ✅ ${cartons.length} carton(s) chargé(s) depuis Firestore`);
    
    // Transformer les cartons Firestore en Map
    for (const carton of cartons) {
      if (!carton.isActive) continue;
      
      const ref = carton.carton_ref?.trim().toUpperCase() || '';
      const price = carton.packaging_price || 0;
      
      if (ref && price > 0) {
        // Nettoyer la référence : enlever " / — " ou " / - " au début
        const cleanedRef = ref.replace(/^[\s\/\u2014\u2013-]+/i, "").trim().toUpperCase();
        
        prices.set(cleanedRef, price);
        
        // Stocker aussi les données complètes avec dimensions
        const dimensions = (carton.inner_length && carton.inner_width && carton.inner_height) 
          ? { 
              length: carton.inner_length, 
              width: carton.inner_width, 
              height: carton.inner_height 
            } 
          : undefined;
        
        cartonData.set(cleanedRef, { 
          ref: cleanedRef, 
          price, 
          dimensions 
        });
        
        console.log(`[pricing] Prix trouvé: "${carton.carton_ref}" -> "${cleanedRef}" = ${price}€${dimensions ? ` (${dimensions.length}x${dimensions.width}x${dimensions.height}cm)` : ''}`);
      }
    }
    
    console.log(`[pricing] ${prices.size} prix de cartons chargés depuis Firestore`);
    if (prices.size > 0) {
      console.log('[pricing] Exemples de prix chargés:', Array.from(prices.entries()).slice(0, 5));
    } else {
      console.warn('[pricing] ⚠️ Aucun carton trouvé - vérifiez que des cartons sont configurés dans Paramètres → Cartons');
    }
    
    // Mettre à jour le cache
    cartonPricesCache = prices;
    cartonDataCache = cartonData;
    cacheTimestamp = Date.now();
  } catch (error) {
    console.error("[pricing] Erreur lors du chargement des prix cartons:", error);
    // En cas d'erreur, retourner le cache si disponible
    if (cartonPricesCache) {
      return cartonPricesCache;
    }
  }
  
  return prices;
}

/**
 * Charge les tarifs d'expédition depuis Firestore via l'API /api/shipping/grid
 * Chaque client SaaS utilise ses propres tarifs configurés dans la grille tarifaire
 */
export async function loadShippingRates(gid?: string, forceReload: boolean = false): Promise<ShippingZone[]> {
  // Vérifier le cache
  if (!forceReload && shippingRatesCache && (Date.now() - cacheTimestamp) < CACHE_DURATION) {
    console.log(`[pricing] Utilisation du cache pour les tarifs d'expédition (${shippingRatesCache.length} zones)`);
    return shippingRatesCache;
  }
  
  const zones: ShippingZone[] = [];
  
  try {
    console.log(`[pricing] 🔄 CHARGEMENT TARIFS D'EXPÉDITION depuis Firestore (grille tarifaire du client SaaS)`);
    
    // Charger la grille complète depuis l'API
    const response = await authenticatedFetch('/api/shipping/grid');
    
    const responseText = await response.text();
    if (!response.ok) {
      console.error(`[pricing] Erreur ${response.status} lors du chargement de la grille tarifaire: ${responseText.slice(0, 200)}`);
      if (shippingRatesCache) {
        console.warn('[pricing] Utilisation du cache en cas d\'erreur');
        return shippingRatesCache;
      }
      return zones;
    }

    // Détecter réponse HTML (backend inaccessible ou VITE_API_BASE_URL incorrect)
    if (responseText.trim().toLowerCase().startsWith('<!doctype') || responseText.trim().startsWith('<!')) {
      console.error('[pricing] Backend inaccessible (réponse HTML). Vérifiez VITE_API_BASE_URL dans Vercel.');
      if (shippingRatesCache) return shippingRatesCache;
      return zones;
    }

    const gridData = JSON.parse(responseText) as ShippingGridData;
    console.log(`[pricing] ✅ Grille tarifaire chargée: ${gridData.zones.length} zones, ${gridData.services.length} services, ${gridData.weightBrackets.length} tranches`);
    
    // Trouver le service EXPRESS
    const expressService = gridData.services.find(s => s.name.toUpperCase() === 'EXPRESS' && s.isActive);
    if (!expressService) {
      console.warn('[pricing] ⚠️ Service EXPRESS non trouvé dans la grille tarifaire');
      return zones;
    }
    
    // Transformer les données Firestore en format ShippingZone[]
    for (const zone of gridData.zones) {
      if (!zone.isActive) continue;
      
      // Récupérer tous les tarifs Express pour cette zone
      const expressRates: { [weightRange: string]: number } = {};
      
      // Trier les tranches de poids par ordre croissant
      const sortedBrackets = [...gridData.weightBrackets].sort((a, b) => a.minWeight - b.minWeight);
      
      for (let i = 0; i < sortedBrackets.length; i++) {
        const bracket = sortedBrackets[i];
        const nextBracket = sortedBrackets[i + 1];
        
        // Trouver le tarif pour cette zone + service EXPRESS + tranche
        const rate = gridData.rates.find(
          r => r.zoneId === zone.id && 
               r.serviceId === expressService.id && 
               r.weightBracketId === bracket.id &&
               r.price !== null
        );
        
        if (rate && rate.price !== null) {
          // Créer la tranche de poids (ex: "1-2", "2-5", etc.)
          const maxWeight = nextBracket ? nextBracket.minWeight : bracket.minWeight + 10;
          const weightRange = `${bracket.minWeight}-${maxWeight}`;
          expressRates[weightRange] = rate.price;
        }
      }
      
      if (Object.keys(expressRates).length > 0) {
        zones.push({
          zone: zone.name || zone.code || `Zone ${zone.id}`,
          countries: zone.countries || [],
          express: expressRates,
        });
        
        console.log(`[pricing] ✅ Zone ${zone.name} chargée: ${zone.countries.length} pays, ${Object.keys(expressRates).length} tranches Express`);
      }
    }
    
    console.log(`[pricing] ${zones.length} zones de tarification chargées depuis Firestore`);
    if (zones.length > 0) {
      console.log('[pricing] Détail des zones chargées:');
      zones.forEach(z => {
        console.log(`  - ${z.zone}: ${z.countries.length} pays, ${Object.keys(z.express).length} tranches de poids`);
        console.log(`    Pays: ${z.countries.slice(0, 5).join(', ')}${z.countries.length > 5 ? '...' : ''}`);
        console.log(`    Poids Express:`, Object.entries(z.express).slice(0, 3).map(([r, p]) => `${r}kg=${p}€`).join(', '));
      });
    } else {
      console.warn('[pricing] Aucune zone chargée - vérifiez que la grille tarifaire est initialisée dans Paramètres → Expédition');
    }
    
    // Mettre à jour le cache
    shippingRatesCache = zones;
    cacheTimestamp = Date.now();
  } catch (error) {
    console.error(`[pricing] ❌ ERREUR FATALE lors du chargement des tarifs d'expédition:`, error);
    console.error(`[pricing] ❌ Type d'erreur:`, error instanceof Error ? error.message : String(error));
    console.error(`[pricing] ❌ Stack:`, error instanceof Error ? error.stack : 'N/A');
    // En cas d'erreur, retourner le cache si disponible
    if (shippingRatesCache) {
      console.warn(`[pricing] ⚠️ Utilisation du cache en cas d'erreur (${shippingRatesCache.length} zones)`);
      return shippingRatesCache;
    }
    console.error(`[pricing] ❌ AUCUN CACHE DISPONIBLE - Les tarifs d'expédition ne peuvent pas être calculés`);
  }
  
  if (zones.length === 0) {
    console.error(`[pricing] ❌ AUCUNE ZONE CHARGÉE - Vérifiez que la grille tarifaire est initialisée dans Paramètres → Expédition`);
  } else {
    console.log(`[pricing] ✅ ${zones.length} zone(s) chargée(s) avec succès depuis Firestore`);
  }
  
  return zones;
}

/**
 * Nettoie une référence de carton en enlevant le préfixe " / — " ou " / - "
 * Cette fonction est exportée pour être utilisée partout dans l'application
 * pour afficher les noms de cartons sans le préfixe
 */
export function cleanCartonRef(ref: string | null | undefined): string {
  if (!ref) return "";
  // Enlever le préfixe " / — " ou " / - " ou " /— " ou " /- " (avec ou sans espace)
  // Supporte aussi les tirets Unicode (—, –) et les espaces variés
  // On garde la casse originale (pas de toUpperCase) pour l'affichage
  return ref.trim().replace(/^[\s\/\u2014\u2013-]+/i, "").trim();
}

/**
 * Nettoie une référence de carton pour la recherche (en majuscules)
 */
function cleanCartonRefForSearch(ref: string): string {
  return cleanCartonRef(ref).toUpperCase();
}

/**
 * Trouve le prix d'un carton par sa référence ou par ses dimensions
 * La référence peut contenir " / — " au début, elle sera automatiquement nettoyée
 * Si la référence n'est pas trouvée et que des dimensions sont fournies, recherche par dimensions
 */
export async function getCartonPrice(
  cartonRef: string, 
  dimensions?: { length: number; width: number; height: number }
): Promise<number> {
  // Recharger les données complètes (avec dimensions) si nécessaire
  await loadCartonPrices();
  
  if (!cartonRef || !cartonRef.trim()) {
    console.warn(`[pricing] ⚠️  Référence de carton vide, tentative par dimensions uniquement`);
  } else {
    const cleanedRef = cleanCartonRefForSearch(cartonRef);
    console.log(`[pricing] 🔍 Recherche prix carton: "${cartonRef}" -> "${cleanedRef}"`);
    console.log(`[pricing] 📊 Cache contient ${cartonPricesCache?.size || 0} références`);
    
    // Recherche exacte par référence d'abord
    let price = cartonPricesCache?.get(cleanedRef) || 0;
    if (price > 0) {
      console.log(`[pricing] ✅ Prix trouvé par référence exacte "${cleanedRef}": ${price}€`);
      return price;
    }
    
    // Si pas trouvé, essayer des variations (sans espaces, etc.)
    if (cartonPricesCache) {
      const variations = [
        cleanedRef,
        cleanedRef.replace(/\s+/g, ''), // Sans espaces
        cleanedRef.replace(/\s+/g, '-'), // Espaces remplacés par tirets
        cleanedRef.toLowerCase(), // Minuscules
        cleanedRef.toUpperCase(), // Majuscules (déjà fait par cleanCartonRefForSearch)
      ];
      
      for (const variant of variations) {
        if (variant !== cleanedRef) {
          price = cartonPricesCache.get(variant) || 0;
          if (price > 0) {
            console.log(`[pricing] ✅ Prix trouvé par variation "${variant}": ${price}€`);
            return price;
          }
        }
      }
      
      // Recherche partielle (contient le nom)
      const searchLower = cleanedRef.toLowerCase();
      for (const [ref, p] of cartonPricesCache.entries()) {
        if (ref.toLowerCase().includes(searchLower) || searchLower.includes(ref.toLowerCase())) {
          console.log(`[pricing] ✅ Prix trouvé par recherche partielle "${ref}" (recherche: "${searchLower}"): ${p}€`);
          return p;
        }
      }
    }
    
    console.warn(`[pricing] ⚠️  Prix non trouvé par référence "${cartonRef}" (nettoyé: "${cleanedRef}")`);
    console.warn(`[pricing] 📋 Références disponibles (10 premières):`, Array.from(cartonPricesCache?.keys() || []).slice(0, 10));
  }
  
  // Si pas trouvé par référence et que des dimensions sont fournies, chercher par dimensions
  if (dimensions && dimensions.length > 0 && dimensions.width > 0 && dimensions.height > 0) {
    console.log(`[pricing] 🔍 Recherche par dimensions: ${dimensions.length}x${dimensions.width}x${dimensions.height}cm`);
    
    // Recharger les données complètes si nécessaire
    if (!cartonDataCache) {
      await loadCartonPrices(undefined, true); // Force reload pour avoir les dimensions
    }
    
    if (cartonDataCache) {
      console.log(`[pricing] 📊 Cache dimensions contient ${cartonDataCache.size} cartons avec dimensions`);
      // Chercher un carton avec des dimensions correspondantes (tolérance de ±2cm)
      const tolerance = 2;
      for (const [ref, data] of cartonDataCache.entries()) {
        if (data.dimensions) {
          const { length: dL, width: dW, height: dH } = data.dimensions;
          const lengthMatch = Math.abs(dL - dimensions.length) <= tolerance;
          const widthMatch = Math.abs(dW - dimensions.width) <= tolerance;
          const heightMatch = Math.abs(dH - dimensions.height) <= tolerance;
          
          if (lengthMatch && widthMatch && heightMatch) {
            console.log(`[pricing] ✅ Prix trouvé par dimensions: "${ref}" (${dL}x${dW}x${dH}cm) = ${data.price}€`);
            return data.price;
          }
        }
      }
      console.warn(`[pricing] ⚠️  Aucun carton trouvé avec les dimensions ${dimensions.length}x${dimensions.width}x${dimensions.height}cm (tolérance ±${tolerance}cm)`);
      
      // Afficher quelques exemples de dimensions disponibles pour debug
      const examples = Array.from(cartonDataCache.entries())
        .filter(([_, data]) => data.dimensions)
        .slice(0, 5)
        .map(([ref, data]) => `${ref}: ${data.dimensions!.length}x${data.dimensions!.width}x${data.dimensions!.height}cm`);
      if (examples.length > 0) {
        console.warn(`[pricing] 📋 Exemples de dimensions disponibles:`, examples);
      }
    } else {
      console.warn(`[pricing] ⚠️  Cache dimensions non disponible`);
    }
  } else {
    console.warn(`[pricing] ⚠️  Dimensions non fournies ou invalides:`, dimensions);
  }
  
  return 0;
}

/**
 * Trouve la zone d'expédition pour un pays
 */
function findZoneForCountry(
  zones: ShippingZone[],
  countryCode: string
): ShippingZone | null {
  const upperCountry = countryCode.toUpperCase();
  console.log(`[pricing] 🔍 Recherche zone pour pays: "${upperCountry}"`);
  console.log(`[pricing] 🔍 Nombre de zones disponibles: ${zones.length}`);
  
  for (const zone of zones) {
    console.log(`[pricing] 🔍 Vérification ${zone.zone} (${zone.countries.length} pays): ${zone.countries.slice(0, 5).join(', ')}${zone.countries.length > 5 ? '...' : ''}`);
    const found = zone.countries.some(c => c.toUpperCase() === upperCountry);
    if (found) {
      console.log(`[pricing] ✅ Zone trouvée: ${zone.zone} contient ${upperCountry}`);
      console.log(`[pricing] ✅ Tous les pays de ${zone.zone}:`, zone.countries);
      return zone;
    }
  }
  
  console.error(`[pricing] ❌ Aucune zone trouvée pour "${upperCountry}"`);
  console.error(`[pricing] ❌ Zones disponibles avec leurs pays:`);
  zones.forEach(z => {
    console.error(`[pricing]   - ${z.zone}: ${z.countries.join(', ')}`);
  });
  return null;
}

/**
 * Calcule le prix d'expédition express pour un colis
 */
export async function calculateShippingPrice(
  countryCode: string,
  volumetricWeight: number,
  isExpress: boolean = true
): Promise<number> {
  console.log(`[pricing] Calcul prix expédition: pays=${countryCode}, poidsVol=${volumetricWeight}kg, express=${isExpress}`);
  
  if (!isExpress) {
    // Pour l'instant, on ne gère que l'express
    console.warn(`[pricing] Standard non géré, retour 0`);
    return 0;
  }
  
  if (!countryCode || countryCode.length !== 2) {
    console.error(`[pricing] Code pays invalide: "${countryCode}"`);
    return 0;
  }
  
  if (!volumetricWeight || isNaN(volumetricWeight) || volumetricWeight <= 0) {
    console.error(`[pricing] Poids volumétrique invalide: ${volumetricWeight}`);
    return 0;
  }
  
  console.log(`[pricing] 🔄 Appel de loadShippingRates() pour calculer le prix...`);
  const zones = await loadShippingRates();
  console.log(`[pricing] 📊 ${zones.length} zone(s) chargée(s) pour le calcul`);
  
  if (zones.length === 0) {
    console.error(`[pricing] ❌ AUCUNE ZONE CHARGÉE - Vérifiez que la grille tarifaire est initialisée dans Paramètres → Expédition`);
    console.error(`[pricing] ❌ Cliquez sur "Initialiser la grille tarifaire" si c'est la première fois`);
    return 0;
  }
  
  const zone = findZoneForCountry(zones, countryCode);
  
  if (!zone) {
    console.error(`[pricing] ❌ Zone non trouvée pour le pays ${countryCode}`);
    console.error(`[pricing] Zones disponibles:`, zones.map(z => `${z.zone} (${z.countries.join(', ')})`));
    return 0;
  }
  
  console.log(`[pricing] ✅ Zone trouvée: ${zone.zone} pour ${countryCode}`);
  console.log(`[pricing] 📊 Tranches de poids disponibles:`, Object.keys(zone.express));
  console.log(`[pricing] 📊 Détail des tranches:`, Object.entries(zone.express).map(([r, p]) => `${r}kg=${p}€`).join(', '));
  console.log(`[pricing] ⚖️ Poids volumétrique à matcher: ${volumetricWeight}kg`);
  
  // Trouver le tarif selon le poids volumétrique
  // Les tarifs sont organisés par tranches de poids : "1-2", "2-5", "5-10", etc.
  const weightRanges = Object.keys(zone.express).sort((a, b) => {
    const aMin = parseFloat(a.split("-")[0] || "0");
    const bMin = parseFloat(b.split("-")[0] || "0");
    return aMin - bMin;
  });
  
  // Trier les tranches par poids minimum croissant
  const sortedRanges = weightRanges.map(range => {
    const [min, max] = range.split("-").map(Number);
    return { range, min, max: max || Infinity };
  }).sort((a, b) => a.min - b.min);
  
  console.log(`[pricing] 📊 Tranches triées (${sortedRanges.length}):`, sortedRanges.map(r => `${r.range}kg [${r.min}-${r.max}[`).join(', '));
  
  // Trouver la tranche correspondante
  for (const { range, min, max } of sortedRanges) {
    console.log(`[pricing] 🔍 Test tranche ${range}kg: ${volumetricWeight}kg >= ${min} && ${volumetricWeight}kg < ${max} ?`);
    if (volumetricWeight >= min && volumetricWeight < max) {
      const price = zone.express[range] || 0;
      console.log(`[pricing] ✅ MATCH TROUVÉ: ${range}kg = ${price}€ pour ${volumetricWeight}kg`);
      console.log(`[pricing] ✅ PRIX EXPÉDITION FINAL = ${price}€`);
      return price;
    } else {
      console.log(`[pricing] ❌ Pas de match pour ${range}kg (${volumetricWeight}kg n'est pas dans [${min}-${max}[)`);
    }
  }
  
  // Si le poids dépasse toutes les tranches, prendre la dernière
  if (sortedRanges.length > 0) {
    const lastRange = sortedRanges[sortedRanges.length - 1];
    console.log(`[pricing] 🔍 Test dernière tranche ${lastRange.range}kg: ${volumetricWeight}kg >= ${lastRange.max} ?`);
    // Si le poids est supérieur ou égal à la dernière tranche max, utiliser le prix de la dernière tranche
    if (volumetricWeight >= lastRange.max) {
      const price = zone.express[lastRange.range] || 0;
      console.log(`[pricing] ✅ MATCH (dernière tranche): ${lastRange.range}kg = ${price}€ pour ${volumetricWeight}kg`);
      console.log(`[pricing] ✅ PRIX EXPÉDITION FINAL = ${price}€`);
      return price;
    }
  }
  
  console.error(`[pricing] ❌ AUCUNE TRANCHE TROUVÉE pour ${volumetricWeight}kg dans ${zone.zone}`);
  console.error(`[pricing] ❌ Tranches disponibles:`, sortedRanges.map(r => `${r.range}kg [${r.min}-${r.max}[`).join(', '));
  console.error(`[pricing] ❌ Poids volumétrique: ${volumetricWeight}kg`);
  return 0;
}
