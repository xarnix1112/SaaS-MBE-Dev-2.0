/**
 * SCRIPT DE FORCE-INITIALISATION DE LA GRILLE TARIFAIRE
 * 
 * Ce script SUPPRIME les données existantes et ré-initialise complètement
 * la grille tarifaire pour un compte SaaS.
 * 
 * Usage: node server/force-init-shipping.js <saasAccountId>
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
  { minWeight: 15, order: 5 },
  { minWeight: 20, order: 6 },
  { minWeight: 30, order: 7 },
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
 * Supprimer toutes les données existantes
 */
async function deleteExistingData(saasAccountId) {
  console.log(`\n[force-init] 🗑️  Suppression des données existantes pour saasAccountId: ${saasAccountId}`);
  
  const collections = ['shippingZones', 'shippingServices', 'weightBrackets', 'shippingRates', 'shippingSettings'];
  
  for (const collectionName of collections) {
    console.log(`[force-init] Suppression collection: ${collectionName}`);
    
    if (collectionName === 'shippingSettings') {
      // Settings utilise saasAccountId comme ID du document
      const docRef = firestore.collection(collectionName).doc(saasAccountId);
      const doc = await docRef.get();
      if (doc.exists) {
        await docRef.delete();
        console.log(`[force-init] ✅ Document ${collectionName}/${saasAccountId} supprimé`);
      } else {
        console.log(`[force-init] ℹ️  Document ${collectionName}/${saasAccountId} n'existe pas`);
      }
    } else {
      // Autres collections : requête par saasAccountId
      const snapshot = await firestore
        .collection(collectionName)
        .where('saasAccountId', '==', saasAccountId)
        .get();
      
      if (snapshot.empty) {
        console.log(`[force-init] ℹ️  Aucun document dans ${collectionName}`);
      } else {
        const batch = firestore.batch();
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`[force-init] ✅ ${snapshot.size} document(s) supprimé(s) de ${collectionName}`);
      }
    }
  }
  
  console.log('[force-init] ✅ Suppression terminée\n');
}

/**
 * Créer les nouvelles données
 */
async function createNewData(saasAccountId) {
  console.log(`[force-init] 🚀 Création des nouvelles données pour saasAccountId: ${saasAccountId}\n`);
  
  try {
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    
    // 1. Créer les zones
    console.log('[force-init] 📍 Création des zones...');
    const zoneIds = {};
    for (const zone of DEFAULT_ZONES) {
      const zoneRef = firestore.collection('shippingZones').doc();
      zoneIds[zone.code] = zoneRef.id;
      await zoneRef.set({
        ...zone,
        saasAccountId,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      console.log(`[force-init]   ✅ Zone ${zone.code} créée (ID: ${zoneRef.id})`);
    }
    console.log(`[force-init] ✅ ${DEFAULT_ZONES.length} zones créées\n`);
    
    // 2. Créer les services
    console.log('[force-init] 🚚 Création des services...');
    const serviceIds = {};
    for (const service of DEFAULT_SERVICES) {
      const serviceRef = firestore.collection('shippingServices').doc();
      serviceIds[service.name] = serviceRef.id;
      await serviceRef.set({
        ...service,
        saasAccountId,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      console.log(`[force-init]   ✅ Service ${service.name} créé (ID: ${serviceRef.id})`);
    }
    console.log(`[force-init] ✅ ${DEFAULT_SERVICES.length} services créés\n`);
    
    // 3. Créer les tranches de poids
    console.log('[force-init] ⚖️  Création des tranches de poids...');
    const bracketIds = [];
    for (const bracket of DEFAULT_WEIGHT_BRACKETS) {
      const bracketRef = firestore.collection('weightBrackets').doc();
      bracketIds.push(bracketRef.id);
      await bracketRef.set({
        ...bracket,
        saasAccountId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      console.log(`[force-init]   ✅ Tranche ${bracket.minWeight}kg créée (ID: ${bracketRef.id})`);
    }
    console.log(`[force-init] ✅ ${DEFAULT_WEIGHT_BRACKETS.length} tranches créées\n`);
    
    // 4. Créer les paramètres
    console.log('[force-init] ⚙️  Création des paramètres...');
    const settingsRef = firestore.collection('shippingSettings').doc(saasAccountId);
    await settingsRef.set({
      ...DEFAULT_SETTINGS,
      saasAccountId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    console.log(`[force-init] ✅ Paramètres créés (ID: ${saasAccountId})\n`);
    
    console.log('[force-init] ✅ Initialisation terminée avec succès');
    
    return {
      success: true,
      zoneIds,
      serviceIds,
      bracketIds,
      settingsId: saasAccountId,
    };
  } catch (error) {
    console.error('[force-init] ❌ Erreur lors de la création:', error);
    throw error;
  }
}

/**
 * Fonction principale
 */
async function forceInit(saasAccountId) {
  console.log('='.repeat(80));
  console.log('  FORCE-INITIALISATION DE LA GRILLE TARIFAIRE');
  console.log('='.repeat(80));
  
  // 1. Supprimer les données existantes
  await deleteExistingData(saasAccountId);
  
  // 2. Créer les nouvelles données
  const result = await createNewData(saasAccountId);
  
  console.log('\n' + '='.repeat(80));
  console.log('  RÉSULTAT FINAL');
  console.log('='.repeat(80));
  console.log('✅ Zones créées:', Object.keys(result.zoneIds).length);
  console.log('✅ Services créés:', Object.keys(result.serviceIds).length);
  console.log('✅ Tranches créées:', result.bracketIds.length);
  console.log('✅ Paramètres créés: OUI');
  console.log('='.repeat(80));
  
  return result;
}

// Exécution en ligne de commande
if (import.meta.url === `file://${process.argv[1]}`) {
  const saasAccountId = process.argv[2];
  
  if (!saasAccountId) {
    console.error('❌ Usage: node force-init-shipping.js <saasAccountId>');
    process.exit(1);
  }
  
  forceInit(saasAccountId)
    .then((result) => {
      console.log('\n✅ Terminé avec succès !');
      console.log('🔄 Rechargez la page pour voir les changements.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Erreur fatale:', error);
      process.exit(1);
    });
}

