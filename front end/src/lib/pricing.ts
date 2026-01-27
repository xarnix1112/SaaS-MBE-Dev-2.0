import Papa from "papaparse";

// URLs de publication spécifiques pour chaque onglet
// Format : /e/{PUB_ID}/pub?gid={GID}&single=true&output=csv
// 
// URLs validées :
// - Prix carton : gid=1299775832
// - Prix expé volume/zone : gid=1518712190
// - My new form (devis) : gid=1137251647 (dans sheetQuotes.ts)
const CARTON_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR2YRtgja8K3BZMILM-qJl_pztYKJSqiB0g1-wo02KzydyMGyXoDgdfA0Ih4Bf4hp40XL1NJObMuEHz/pub?gid=1299775832&single=true&output=csv";
const SHIPPING_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR2YRtgja8K3BZMILM-qJl_pztYKJSqiB0g1-wo02KzydyMGyXoDgdfA0Ih4Bf4hp40XL1NJObMuEHz/pub?gid=1518712190&single=true&output=csv";

// GID par défaut (utilisés comme fallback si nécessaire)
const DEFAULT_CARTON_GID = "1299775832"; // Prix carton
const DEFAULT_SHIPPING_GID = "1518712190"; // Prix expé volume/zone

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

interface ShippingZone {
  zone: string;
  countries: string[];
  express: {
    [weightRange: string]: number; // "0-1", "1-2", etc.
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
 * Charge les prix des cartons depuis la page "Prix carton"
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
    // Utiliser l'URL spécifique pour "Prix carton" (URL complète, plus besoin de GID)
    const url = CARTON_SHEET_URL;
    console.log(`[pricing] Chargement Prix carton depuis: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`[pricing] Erreur ${response.status} lors du chargement Prix carton: ${response.statusText}`);
      console.error(`[pricing] URL utilisée: ${url}`);
      console.error(`[pricing] Vérifiez que l'onglet "Prix carton" est publié individuellement dans Google Sheets`);
      // En cas d'erreur, retourner le cache si disponible
      if (cartonPricesCache) {
        console.warn('[pricing] Utilisation du cache en cas d\'erreur');
        return cartonPricesCache;
      }
      return prices;
    }
    
    const csv = await response.text();
    if (csv.toLowerCase().includes("<html")) {
      console.warn("[pricing] La page Prix carton n'est pas publiée");
      return prices;
    }
    
    // Parser avec et sans header pour gérer différents formats
    const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
    const rows = parsed.data as Record<string, string>[];
    
    // Si pas de données avec header, essayer sans header
    if (rows.length === 0 || Object.keys(rows[0] || {}).length === 0) {
      const parsedNoHeader = Papa.parse(csv, { header: false, skipEmptyLines: true });
      const dataRows = parsedNoHeader.data as string[][];
      
      // Chercher la ligne d'en-tête
      let headerRowIndex = -1;
      let refColIndex = -1;
      let priceColIndex = -1;
      
      for (let i = 0; i < Math.min(5, dataRows.length); i++) {
        const row = dataRows[i] || [];
        for (let j = 0; j < row.length; j++) {
          const cell = (row[j] || "").toString().toLowerCase();
          if (cell.includes("référence") || cell.includes("reference") || cell.includes("ref") || cell.includes("carton")) {
            refColIndex = j;
            headerRowIndex = i;
          }
          if (cell.includes("prix") || cell.includes("price")) {
            priceColIndex = j;
            if (headerRowIndex === -1) headerRowIndex = i;
          }
        }
        if (refColIndex >= 0 && priceColIndex >= 0) break;
      }
      
      // Parser les données
      if (refColIndex >= 0 && priceColIndex >= 0 && headerRowIndex >= 0) {
        for (let i = headerRowIndex + 1; i < dataRows.length; i++) {
          const row = dataRows[i] || [];
          const ref = (row[refColIndex] || "").toString().trim();
          const priceStr = (row[priceColIndex] || "").toString().trim();
          
          if (ref && priceStr) {
            const cleanedPrice = priceStr
              .replace(/\s+/g, "")
              .replace("€", "")
              .replace(",", ".")
              .replace(/[^\d.]/g, "");
            const price = parseFloat(cleanedPrice);
            if (!isNaN(price) && price > 0) {
              // Nettoyer la référence : enlever " / — " ou " / - " au début
              let cleanedRef = ref.trim();
              // Enlever le préfixe " / — " ou " / - " ou " /— " ou " /- " (avec ou sans espace)
              cleanedRef = cleanedRef.replace(/^[\s\/\u2014\u2013-]+/i, "").trim();
              const refUpper = cleanedRef.toUpperCase();
              prices.set(refUpper, price);
              // Stocker aussi dans cartonData (sans dimensions car non disponibles sans header)
              cartonData.set(refUpper, { ref: refUpper, price });
            }
          }
        }
      }
    } else {
      // Parser avec header - Format attendu : carton_ref, inner_length, inner_width, inner_height, packaging_price
      console.log('[pricing] Headers détectés:', Object.keys(rows[0] || {}));
      for (const row of rows) {
        // Chercher la colonne avec la référence du carton (carton_ref)
        // Essayer plusieurs variantes de noms de colonnes (normalisées)
        const normalizedRow: Record<string, string> = {};
        Object.keys(row).forEach(key => {
          const normalizedKey = key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          normalizedRow[normalizedKey] = row[key];
        });
        
        // Format attendu : carton_ref, inner_length, inner_width, inner_height, packaging_price
        // Chercher la référence (carton_ref en priorité)
        const ref = row["carton_ref"] || normalizedRow["carton_ref"] || normalizedRow["cartonref"] || 
                   normalizedRow["reference"] || normalizedRow["ref"] || normalizedRow["carton"] || 
                   row["Référence"] || row["reference"] || row["Ref"] || row["ref"] || row["Carton"] || row["carton"] || "";
        
        // Chercher les dimensions (inner_length, inner_width, inner_height)
        const lengthStr = row["inner_length"] || normalizedRow["inner_length"] || normalizedRow["innerlength"] ||
                         row["L (cm)"] || row["l (cm)"] || row["length"] || normalizedRow["length"] || "";
        const widthStr = row["inner_width"] || normalizedRow["inner_width"] || normalizedRow["innerwidth"] ||
                         row["l (cm)"] || row["width"] || normalizedRow["width"] || "";
        const heightStr = row["inner_height"] || normalizedRow["inner_height"] || normalizedRow["innerheight"] ||
                          row["H (cm)"] || row["h (cm)"] || row["height"] || normalizedRow["height"] || "";
        
        // Parser les dimensions
        const parseDimension = (str: string): number | null => {
          if (!str) return null;
          const cleaned = str.toString().replace(/\s+/g, "").replace(",", ".").replace(/[^\d.]/g, "");
          const val = parseFloat(cleaned);
          return !isNaN(val) && val > 0 ? val : null;
        };
        const length = parseDimension(lengthStr);
        const width = parseDimension(widthStr);
        const height = parseDimension(heightStr);
        
        // Chercher le prix (packaging_price en priorité)
        // PapaParse peut renommer les colonnes dupliquées (packaging_price_1, etc.)
        let priceStr = row["packaging_price"] || row["Packaging_price"] || 
                       normalizedRow["packaging_price"] || normalizedRow["packagingprice"];
        
        // Si pas trouvé, chercher dans toutes les colonnes qui contiennent "prix" ou "price"
        if (!priceStr) {
          for (const key of Object.keys(row)) {
            const keyLower = key.toLowerCase();
            if (keyLower.includes("packaging") && (keyLower.includes("prix") || keyLower.includes("price"))) {
              priceStr = row[key];
              break;
            }
          }
        }
        
        // Fallback : chercher "prix" ou "price" en général
        if (!priceStr) {
          priceStr = normalizedRow["prix"] || normalizedRow["prix ttc"] || normalizedRow["price"] ||
                     row["Prix"] || row["prix"] || row["Prix TTC"] || row["prix ttc"] || row["Price"] || 
                     row["Prix TTC (€)"] || row["Prix (€)"] || "";
        }
        
        if (ref && priceStr) {
          // Nettoyer le prix (enlever espaces, €, virgules, etc.)
          const cleanedPrice = priceStr.toString()
            .replace(/\s+/g, "")
            .replace("€", "")
            .replace(",", ".")
            .replace(/[^\d.]/g, "");
          const price = parseFloat(cleanedPrice);
          if (!isNaN(price) && price > 0) {
            // Nettoyer la référence : enlever " / — " ou " / - " au début
            let cleanedRef = ref.trim();
            // Enlever le préfixe " / — " ou " / - " ou " /— " ou " /- " (avec ou sans espace)
            cleanedRef = cleanedRef.replace(/^[\s\/\u2014\u2013-]+/i, "").trim();
            const refUpper = cleanedRef.toUpperCase();
            prices.set(refUpper, price);
            
            // Stocker aussi les données complètes avec dimensions pour recherche par dimensions
            const dimensions = (length && width && height) ? { length, width, height } : undefined;
            cartonData.set(refUpper, { ref: refUpper, price, dimensions });
            
            console.log(`[pricing] Prix trouvé: "${ref}" -> "${refUpper}" = ${price}€${dimensions ? ` (${length}x${width}x${height}cm)` : ''}`);
          } else {
            console.warn(`[pricing] Prix invalide pour ${ref}: "${priceStr}" -> "${cleanedPrice}"`);
          }
        } else {
          if (!ref) console.warn('[pricing] Référence manquante dans la ligne:', row);
          if (!priceStr) console.warn('[pricing] Prix manquant dans la ligne:', row);
        }
      }
    }
    
    console.log(`[pricing] ${prices.size} prix de cartons chargés depuis Google Sheets`);
    if (prices.size > 0) {
      console.log('[pricing] Exemples de prix chargés:', Array.from(prices.entries()).slice(0, 5));
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
 * Charge les tarifs d'expédition depuis la page "Prix expé volume/zone"
 */
export async function loadShippingRates(gid?: string, forceReload: boolean = false): Promise<ShippingZone[]> {
  // Vérifier le cache
  if (!forceReload && shippingRatesCache && (Date.now() - cacheTimestamp) < CACHE_DURATION) {
    console.log(`[pricing] Utilisation du cache pour les tarifs d'expédition (${shippingRatesCache.length} zones)`);
    return shippingRatesCache;
  }
  
  const zones: ShippingZone[] = [];
  
  try {
    // Utiliser l'URL spécifique pour "Prix expé volume/zone" (URL complète, plus besoin de GID)
    const url = SHIPPING_SHEET_URL;
    console.log(`[pricing] 🔄 CHARGEMENT TARIFS D'EXPÉDITION depuis: ${url}`);
    console.log(`[pricing] URL complète: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`[pricing] Erreur ${response.status} lors du chargement Prix expé volume/zone: ${response.statusText}`);
      console.error(`[pricing] URL utilisée: ${url}`);
      console.error(`[pricing] Vérifiez que l'onglet "Prix expé volume/zone" est publié individuellement dans Google Sheets`);
      // En cas d'erreur, retourner le cache si disponible
      if (shippingRatesCache) {
        console.warn('[pricing] Utilisation du cache en cas d\'erreur');
        return shippingRatesCache;
      }
      return zones;
    }
    
    const csv = await response.text();
    console.log(`[pricing] CSV reçu: ${csv.length} caractères`);
    
    if (csv.toLowerCase().includes("<html")) {
      console.error(`[pricing] ❌ La page Prix expé volume/zone n'est pas publiée - réponse HTML au lieu de CSV`);
      console.error(`[pricing] ❌ Vérifiez que l'onglet est publié avec le format CSV`);
      return zones;
    }
    
    if (csv.trim().length === 0) {
      console.error(`[pricing] ❌ CSV vide reçu`);
      return zones;
    }
    
    console.log(`[pricing] ✅ CSV valide reçu (${csv.split('\n').length} lignes)`);
    
    // Parser sans header car la structure est complexe (zones, pays, poids, tarifs)
    const parsedNoHeader = Papa.parse(csv, { header: false, skipEmptyLines: true });
    const rows = parsedNoHeader.data as string[][];
    const useArrayFormat = true;
    
    console.log(`[pricing] ${rows.length} lignes à parser pour les tarifs d'expédition`);
    
    // Parser la structure du tableau
    // Format attendu : Zones avec pays et tarifs par poids (1kg, 2kg, 5kg, 10kg, 15kg, 20kg, 30kg)
    // Structure : ZONE A – FRANCE, puis Service \ Poids (kg), puis STANDARD/EXPRESS avec prix
    let currentZone: ShippingZone | null = null;
    let isInExpressRow = false;
    let weightColumns: number[] = []; // Indices des colonnes de poids (1, 2, 5, 10, 15, 20, 30)
    
    console.log('[pricing] Parsing shipping rates, nombre de lignes:', rows.length);
    
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx];
      let rowValues: string[] = [];
      let firstCell = "";
      
      if (useArrayFormat && Array.isArray(row)) {
        rowValues = row.map(v => (v || "").toString().trim());
        firstCell = rowValues[0] || "";
      } else if (!useArrayFormat && typeof row === 'object') {
        rowValues = Object.values(row as Record<string, string>).map(v => (v || "").toString().trim());
        firstCell = rowValues[0] || "";
      } else {
        continue;
      }
      
      const allCells = rowValues.filter(Boolean);
      
      // Détecter une nouvelle zone (ligne avec "ZONE" suivi d'une lettre, ex: "ZONE A – FRANCE")
      if (firstCell.match(/^ZONE\s+[A-H]/i)) {
        if (currentZone) {
          zones.push(currentZone);
          console.log(`[pricing] Zone ${currentZone.zone} finalisée avec ${currentZone.countries.length} pays et ${Object.keys(currentZone.express).length} tranches`);
        }
        const zoneMatch = firstCell.match(/ZONE\s+([A-H])/i);
        currentZone = {
          zone: zoneMatch ? `Zone ${zoneMatch[1].toUpperCase()}` : firstCell.replace(/^ZONE\s+/i, "Zone "),
          countries: [],
          express: {},
        };
        isInExpressRow = false;
        weightColumns = [];
        console.log(`[pricing] Nouvelle zone détectée: ${currentZone.zone} (ligne ${rowIdx + 1})`);
      }
      
      // Détecter la ligne d'en-tête des poids (Service \ Poids (kg), puis 1, 2, 5, 10, 15, 20, 30)
      if (firstCell.toLowerCase().includes("service") && firstCell.toLowerCase().includes("poids")) {
        // Les colonnes suivantes contiennent les poids : 1, 2, 5, 10, 15, 20, 30
        weightColumns = [];
        for (let i = 1; i < rowValues.length; i++) {
          const cell = (rowValues[i] || "").toString().trim();
          const weight = parseInt(cell);
          if (!isNaN(weight) && weight > 0) {
            weightColumns.push(i);
            console.log(`[pricing] Colonne poids détectée: index ${i} = ${weight}kg`);
          }
        }
        console.log(`[pricing] ${weightColumns.length} colonnes de poids détectées pour ${currentZone?.zone || 'zone inconnue'}`);
        continue;
      }
      
      // Détecter les pays (codes à 2 lettres comme FR, DE, etc. ou listes entre parenthèses)
      if (currentZone) {
        // Cas 1: Ligne avec pays entre parenthèses : "(BE, LU, DE, NL, ES, IT)" ou "(FR)"
        if (firstCell.includes("(") && firstCell.includes(")")) {
          // Extraire les codes pays entre parenthèses
          const countryMatches = firstCell.matchAll(/\(([^)]+)\)/g);
          for (const match of countryMatches) {
            const countriesStr = match[1];
            // Nettoyer et extraire les codes pays (gérer "USA – DHL only" en filtrant)
            const countryCodes = countriesStr
              .split(",")
              .map(c => {
                // Extraire le code pays (2 lettres) même s'il y a du texte après
                const codeMatch = c.trim().match(/\b([A-Z]{2})\b/);
                return codeMatch ? codeMatch[1] : null;
              })
              .filter((c): c is string => c !== null && c.length === 2)
              .map(c => c.toUpperCase());
            
            if (countryCodes.length > 0) {
              currentZone.countries.push(...countryCodes);
              console.log(`[pricing] Pays ajoutés à ${currentZone.zone}:`, countryCodes);
            }
          }
        }
        
        // Cas 2: Ligne avec juste le code pays : "(FR)" ou "FR"
        const countryCodeMatch = firstCell.match(/^\(([A-Z]{2})\)$/);
        if (countryCodeMatch && currentZone) {
          const code = countryCodeMatch[1].toUpperCase();
          if (!currentZone.countries.includes(code)) {
            currentZone.countries.push(code);
            console.log(`[pricing] Pays ajouté à ${currentZone.zone}: ${code}`);
          }
        }
        
        // Cas 3: Chercher des codes pays isolés (2 lettres majuscules) dans toutes les cellules
        const countryCodes = allCells.filter(v => 
          v && v.match(/^[A-Z]{2}$/)
        ) as string[];
        if (countryCodes.length > 0) {
          countryCodes.forEach(code => {
            if (!currentZone.countries.includes(code)) {
              currentZone.countries.push(code);
            }
          });
          if (countryCodes.length > 0) {
            console.log(`[pricing] Codes pays isolés ajoutés à ${currentZone.zone}:`, countryCodes);
          }
        }
      }
      
      // Détecter la ligne EXPRESS (doit être exactement "EXPRESS")
      if (firstCell.toUpperCase().trim() === "EXPRESS") {
        isInExpressRow = true;
        console.log(`[pricing] Ligne EXPRESS détectée pour ${currentZone?.zone} (ligne ${rowIdx + 1})`);
        
        // Parser les prix Express pour chaque poids
        // Les poids sont dans les colonnes : 1, 2, 5, 10, 15, 20, 30
        if (currentZone && weightColumns.length > 0) {
          const weights = [1, 2, 5, 10, 15, 20, 30]; // Poids standard du CSV
          console.log(`[pricing] Parsing ${weightColumns.length} prix Express pour ${currentZone.zone}`);
          
          for (let i = 0; i < Math.min(weightColumns.length, weights.length); i++) {
            const colIdx = weightColumns[i];
            if (colIdx < rowValues.length) {
              const priceStr = (rowValues[colIdx] || "").toString().trim();
              // Nettoyer le prix (gérer "NA", espaces, virgules, etc.)
              let cleanedPrice = priceStr
                .replace(/\s+/g, "")
                .replace("€", "")
                .replace("EUR", "")
                .replace(",", ".")
                .replace(/[^\d.]/g, "");
              
              // Si c'est "NA", mettre 0 mais ne pas l'enregistrer
              if (priceStr.toUpperCase() === "NA") {
                console.log(`[pricing] Prix Express ${currentZone.zone} pour ${weights[i]}kg: NA (non disponible)`);
                continue;
              }
              
              const price = parseFloat(cleanedPrice);
              if (!isNaN(price) && price > 0) {
                const weight = weights[i];
                // Créer une tranche de poids
                // Pour 1kg -> "1-2", pour 2kg -> "2-5", pour 5kg -> "5-10", pour 10kg -> "10-15", etc.
                const nextWeight = i < weights.length - 1 ? weights[i + 1] : weight + 10;
                const range = `${weight}-${nextWeight}`;
                currentZone.express[range] = price;
                console.log(`[pricing] ✅ Prix Express ${currentZone.zone}: ${range}kg = ${price}€`);
              } else {
                console.warn(`[pricing] Prix invalide pour ${currentZone.zone} ${weights[i]}kg: "${priceStr}" -> "${cleanedPrice}"`);
              }
            }
          }
        } else if (currentZone && weightColumns.length === 0) {
          // Si les colonnes de poids n'ont pas été détectées, essayer de les trouver maintenant
          console.warn(`[pricing] ⚠️ Colonnes de poids non détectées pour ${currentZone.zone}, tentative de détection alternative...`);
          // Essayer de détecter les poids dans cette ligne directement
          const weights = [1, 2, 5, 10, 15, 20, 30];
          for (let i = 1; i < rowValues.length && i <= weights.length; i++) {
            const priceStr = (rowValues[i] || "").toString().trim();
            if (priceStr.toUpperCase() !== "NA" && priceStr) {
              const cleanedPrice = priceStr.replace(/\s+/g, "").replace("€", "").replace(",", ".").replace(/[^\d.]/g, "");
              const price = parseFloat(cleanedPrice);
              if (!isNaN(price) && price > 0) {
                const weight = weights[i - 1];
                const nextWeight = i < weights.length ? weights[i] : weight + 10;
                const range = `${weight}-${nextWeight}`;
                currentZone.express[range] = price;
                console.log(`[pricing] ✅ Prix Express (détection alt) ${currentZone.zone}: ${range}kg = ${price}€`);
              }
            }
          }
        } else if (!currentZone) {
          console.warn(`[pricing] ⚠️ Ligne EXPRESS détectée mais aucune zone active`);
        }
      }
    }
    
    if (currentZone) {
      zones.push(currentZone);
    }
    
    console.log(`[pricing] ${zones.length} zones de tarification chargées depuis Google Sheets`);
    if (zones.length > 0) {
      console.log('[pricing] Détail des zones chargées:');
      zones.forEach(z => {
        console.log(`  - ${z.zone}: ${z.countries.length} pays, ${Object.keys(z.express).length} tranches de poids`);
        console.log(`    Pays: ${z.countries.slice(0, 5).join(', ')}${z.countries.length > 5 ? '...' : ''}`);
        console.log(`    Poids Express:`, Object.entries(z.express).slice(0, 3).map(([r, p]) => `${r}kg=${p}€`).join(', '));
      });
    } else {
      console.warn('[pricing] Aucune zone chargée - vérifiez le format du CSV');
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
    console.error(`[pricing] ❌ AUCUNE ZONE CHARGÉE - Vérifiez le format du CSV et la publication du Google Sheet`);
  } else {
    console.log(`[pricing] ✅ ${zones.length} zone(s) chargée(s) avec succès`);
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
    console.error(`[pricing] ❌ AUCUNE ZONE CHARGÉE - Vérifiez que le Google Sheet (gid=1518712190) est publié et accessible`);
    console.error(`[pricing] ❌ URL attendue: ${SHIPPING_SHEET_URL}`);
    console.error(`[pricing] ❌ Testez cette URL dans un navigateur privé pour vérifier l'accessibilité`);
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
