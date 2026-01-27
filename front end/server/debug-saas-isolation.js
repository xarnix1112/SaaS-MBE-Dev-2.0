/**
 * SCRIPT DE DIAGNOSTIC - ISOLATION SAAS
 * 
 * Ce script vérifie que chaque compte SaaS a bien ses propres données
 * et qu'il n'y a pas de fuite de données entre comptes.
 */

import admin from 'firebase-admin';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialiser Firebase Admin
const credentialsPath = join(__dirname, '..', 'firebase-credentials.json');
const serviceAccount = JSON.parse(readFileSync(credentialsPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const firestore = admin.firestore();

async function diagnoseSaasIsolation() {
  console.log('🔍 DIAGNOSTIC ISOLATION SAAS\n');
  console.log('='.repeat(60));
  
  try {
    // 1. Lister tous les comptes SaaS
    console.log('\n📊 1. COMPTES SAAS EXISTANTS:');
    const saasAccountsSnapshot = await firestore.collection('saasAccounts').get();
    
    if (saasAccountsSnapshot.empty) {
      console.log('❌ Aucun compte SaaS trouvé !');
      return;
    }
    
    console.log(`✅ ${saasAccountsSnapshot.size} compte(s) SaaS trouvé(s)\n`);
    
    const saasAccounts = [];
    saasAccountsSnapshot.forEach((doc) => {
      const data = doc.data();
      saasAccounts.push({
        id: doc.id,
        commercialName: data.commercialName,
        mbeNumber: data.mbeNumber,
        ownerUid: data.ownerUid,
      });
      console.log(`  - ${doc.id}`);
      console.log(`    Nom: ${data.commercialName}`);
      console.log(`    MBE: ${data.mbeNumber}`);
      console.log(`    Owner: ${data.ownerUid}\n`);
    });
    
    // 2. Pour chaque compte SaaS, vérifier les données de shipping
    console.log('='.repeat(60));
    console.log('\n📦 2. DONNÉES DE SHIPPING PAR COMPTE:\n');
    
    for (const account of saasAccounts) {
      console.log(`\n🏢 Compte: ${account.commercialName} (${account.id})`);
      console.log('-'.repeat(60));
      
      // Zones
      const zonesSnapshot = await firestore
        .collection('shippingZones')
        .where('saasAccountId', '==', account.id)
        .get();
      console.log(`  📍 Zones: ${zonesSnapshot.size}`);
      zonesSnapshot.forEach((doc) => {
        const data = doc.data();
        console.log(`     - ${data.code}: ${data.name} (${data.countries.length} pays)`);
      });
      
      // Services
      const servicesSnapshot = await firestore
        .collection('shippingServices')
        .where('saasAccountId', '==', account.id)
        .get();
      console.log(`  🚚 Services: ${servicesSnapshot.size}`);
      servicesSnapshot.forEach((doc) => {
        const data = doc.data();
        console.log(`     - ${data.name}: ${data.description}`);
      });
      
      // Tranches de poids
      const bracketsSnapshot = await firestore
        .collection('weightBrackets')
        .where('saasAccountId', '==', account.id)
        .get();
      console.log(`  ⚖️  Tranches de poids: ${bracketsSnapshot.size}`);
      bracketsSnapshot.forEach((doc) => {
        const data = doc.data();
        console.log(`     - ${data.minWeight}kg (ordre: ${data.order})`);
      });
      
      // Tarifs
      const ratesSnapshot = await firestore
        .collection('shippingRates')
        .where('saasAccountId', '==', account.id)
        .get();
      console.log(`  💰 Tarifs: ${ratesSnapshot.size}`);
      
      // Paramètres
      const settingsDoc = await firestore
        .collection('shippingSettings')
        .doc(account.id)
        .get();
      console.log(`  ⚙️  Paramètres: ${settingsDoc.exists ? 'OUI' : 'NON'}`);
    }
    
    // 3. Vérifier les fuites de données (données sans saasAccountId)
    console.log('\n' + '='.repeat(60));
    console.log('\n🚨 3. VÉRIFICATION DES FUITES DE DONNÉES:\n');
    
    const collections = ['shippingZones', 'shippingServices', 'weightBrackets', 'shippingRates'];
    
    for (const collectionName of collections) {
      const allDocs = await firestore.collection(collectionName).get();
      const docsWithoutSaasId = [];
      
      allDocs.forEach((doc) => {
        const data = doc.data();
        if (!data.saasAccountId) {
          docsWithoutSaasId.push(doc.id);
        }
      });
      
      if (docsWithoutSaasId.length > 0) {
        console.log(`❌ ${collectionName}: ${docsWithoutSaasId.length} document(s) SANS saasAccountId !`);
        docsWithoutSaasId.forEach((id) => {
          console.log(`   - ${id}`);
        });
      } else {
        console.log(`✅ ${collectionName}: Tous les documents ont un saasAccountId`);
      }
    }
    
    // 4. Vérifier les utilisateurs
    console.log('\n' + '='.repeat(60));
    console.log('\n👤 4. UTILISATEURS ET LEURS COMPTES SAAS:\n');
    
    const usersSnapshot = await firestore.collection('users').get();
    console.log(`Total utilisateurs: ${usersSnapshot.size}\n`);
    
    usersSnapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`  - UID: ${doc.id}`);
      console.log(`    saasAccountId: ${data.saasAccountId || 'NON DÉFINI'}`);
      console.log(`    role: ${data.role || 'NON DÉFINI'}\n`);
    });
    
    console.log('='.repeat(60));
    console.log('\n✅ DIAGNOSTIC TERMINÉ\n');
    
  } catch (error) {
    console.error('❌ Erreur lors du diagnostic:', error);
  }
  
  process.exit(0);
}

// Exécuter le diagnostic
diagnoseSaasIsolation();

