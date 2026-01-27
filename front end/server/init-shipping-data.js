/**
 * SCRIPT D'INITIALISATION DES DONNÉES DE LA GRILLE TARIFAIRE
 * 
 * Ce script initialise les zones, services et tranches de poids par défaut
 * pour un nouveau compte SaaS.
 * 
 * Utilisation:
 * - Appelé automatiquement lors de la création d'un compte SaaS
 * - Peut être appelé manuellement via: node server/init-shipping-data.js <saasAccountId>
 */

import admin from 'firebase-admin';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialiser Firebase Admin si pas déjà fait
if (!admin.apps.length) {
  const credentialsPath = join(__dirname, '../firebase-credentials.json');
  const serviceAccount = JSON.parse(readFileSync(credentialsPath, 'utf8'));
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const firestore = admin.firestore();

/**
 * Zones d'expédition par défaut (basées sur les zones MBE)
 */
const DEFAULT_ZONES = [
  {
    code: 'A',
    name: 'Zone A - France',
    countries: ['FR'],
    order: 1,
  },
  {
    code: 'B',
    name: 'Zone B - Europe Proche',
    countries: ['BE', 'LU', 'DE', 'NL', 'ES', 'IT'],
    order: 2,
  },
  {
    code: 'C',
    name: 'Zone C - Europe Étendue',
    countries: ['PT', 'AT', 'DK', 'IE', 'SE', 'FI', 'PL', 'CZ', 'HU'],
    order: 3,
  },
  {
    code: 'D',
    name: 'Zone D - Europe Élargie',
    countries: ['UK', 'CH', 'NO', 'GR', 'RO', 'BG', 'HR'],
    order: 4,
  },
  {
    code: 'E',
    name: 'Zone E - Amérique du Nord',
    countries: ['CA', 'MX', 'US'],
    order: 5,
  },
  {
    code: 'F',
    name: 'Zone F - Asie Pacifique',
    countries: ['CN', 'HK', 'JP', 'KR', 'SG', 'TW', 'TH', 'MY', 'AU', 'NZ'],
    order: 6,
  },
  {
    code: 'G',
    name: 'Zone G - Amérique du Sud',
    countries: ['BR', 'AR', 'CL', 'CO', 'PE', 'VE'],
    order: 7,
  },
  {
    code: 'H',
    name: 'Zone H - Afrique & Moyen-Orient',
    countries: ['MA', 'TN', 'DZ', 'SN', 'CI', 'AE', 'SA'],
    order: 8,
  },
];

/**
 * Services d'expédition par défaut
 */
const DEFAULT_SERVICES = [
  {
    name: 'STANDARD',
    description: 'Livraison standard (5-7 jours)',
    order: 1,
  },
  {
    name: 'EXPRESS',
    description: 'Livraison express (2-3 jours)',
    order: 2,
  },
];

/**
 * Tranches de poids par défaut (en kg)
 */
const DEFAULT_WEIGHT_BRACKETS = [
  { minWeight: 1, order: 1 },
  { minWeight: 2, order: 2 },
  { minWeight: 5, order: 3 },
  { minWeight: 10, order: 4 },
  { minWeight: 20, order: 5 },
  { minWeight: 30, order: 6 },
  { minWeight: 40, order: 7 },
];

/**
 * Paramètres par défaut
 */
const DEFAULT_SETTINGS = {
  overweightPolicy: 'FLAT_FEE',
  overweightFlatFee: 180,
  overweightMessage: 'Poids supérieur aux tranches standards',
};

/**
 * Initialiser les données pour un compte SaaS
 */
export async function initializeShippingRates(saasAccountId) {
  console.log(`[init-shipping] 🚀 Initialisation pour saasAccountId: ${saasAccountId}`);
  
  try {
    const batch = firestore.batch();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    
    // 1. Créer les zones
    console.log('[init-shipping] 📍 Création des zones...');
    const zoneIds = {};
    for (const zone of DEFAULT_ZONES) {
      const zoneRef = firestore.collection('shippingZones').doc();
      zoneIds[zone.code] = zoneRef.id;
      batch.set(zoneRef, {
        ...zone,
        saasAccountId,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    console.log(`[init-shipping] ✅ ${DEFAULT_ZONES.length} zones créées`);
    
    // 2. Créer les services
    console.log('[init-shipping] 🚚 Création des services...');
    const serviceIds = {};
    for (const service of DEFAULT_SERVICES) {
      const serviceRef = firestore.collection('shippingServices').doc();
      serviceIds[service.name] = serviceRef.id;
      batch.set(serviceRef, {
        ...service,
        saasAccountId,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    console.log(`[init-shipping] ✅ ${DEFAULT_SERVICES.length} services créés`);
    
    // 3. Créer les tranches de poids
    console.log('[init-shipping] ⚖️  Création des tranches de poids...');
    const bracketIds = [];
    for (const bracket of DEFAULT_WEIGHT_BRACKETS) {
      const bracketRef = firestore.collection('weightBrackets').doc();
      bracketIds.push(bracketRef.id);
      batch.set(bracketRef, {
        ...bracket,
        saasAccountId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    console.log(`[init-shipping] ✅ ${DEFAULT_WEIGHT_BRACKETS.length} tranches créées`);
    
    // 4. Créer les paramètres
    console.log('[init-shipping] ⚙️  Création des paramètres...');
    const settingsRef = firestore.collection('shippingSettings').doc(saasAccountId);
    batch.set(settingsRef, {
      ...DEFAULT_SETTINGS,
      saasAccountId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    console.log('[init-shipping] ✅ Paramètres créés');
    
    // Commit le batch
    await batch.commit();
    console.log('[init-shipping] 💾 Batch commit réussi');
    
    // 5. Créer les tarifs par défaut (null = service non disponible)
    // On ne crée pas de tarifs par défaut, l'utilisateur devra les remplir
    console.log('[init-shipping] ℹ️  Aucun tarif créé par défaut (à remplir par l\'utilisateur)');
    
    console.log('[init-shipping] ✅ Initialisation terminée avec succès');
    
    return {
      success: true,
      zoneIds,
      serviceIds,
      bracketIds,
      settingsId: saasAccountId,
    };
  } catch (error) {
    console.error('[init-shipping] ❌ Erreur lors de l\'initialisation:', error);
    throw error;
  }
}

/**
 * Vérifier si les données existent déjà
 */
export async function hasShippingData(saasAccountId) {
  try {
    const zonesSnapshot = await firestore
      .collection('shippingZones')
      .where('saasAccountId', '==', saasAccountId)
      .limit(1)
      .get();
    
    return !zonesSnapshot.empty;
  } catch (error) {
    console.error('[init-shipping] ❌ Erreur lors de la vérification:', error);
    return false;
  }
}

/**
 * Initialiser uniquement si les données n'existent pas
 */
export async function initializeShippingRatesIfNeeded(saasAccountId) {
  console.log(`[init-shipping] 🔍 Vérification des données pour saasAccountId: ${saasAccountId}`);
  
  const exists = await hasShippingData(saasAccountId);
  
  if (exists) {
    console.log('[init-shipping] ℹ️  Données déjà existantes, initialisation ignorée');
    return { success: true, skipped: true };
  }
  
  console.log('[init-shipping] 🆕 Aucune donnée trouvée, initialisation...');
  return await initializeShippingRates(saasAccountId);
}

// Exécution en ligne de commande
if (import.meta.url === `file://${process.argv[1]}`) {
  const saasAccountId = process.argv[2];
  
  if (!saasAccountId) {
    console.error('❌ Usage: node init-shipping-data.js <saasAccountId>');
    process.exit(1);
  }
  
  initializeShippingRatesIfNeeded(saasAccountId)
    .then((result) => {
      console.log('✅ Résultat:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erreur:', error);
      process.exit(1);
    });
}

