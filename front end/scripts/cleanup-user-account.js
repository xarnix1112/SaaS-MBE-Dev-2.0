/**
 * Script de nettoyage des comptes utilisateurs orphelins
 * 
 * Ce script permet de nettoyer les données Firestore pour un utilisateur
 * qui a un compte Firebase Auth mais dont les documents Firestore sont
 * incomplets ou corrompus.
 * 
 * Usage:
 *   node scripts/cleanup-user-account.js <USER_UID>
 * 
 * Exemple:
 *   node scripts/cleanup-user-account.js zUWaigdSisakUVcmLp9BswbZgr22
 */

import admin from 'firebase-admin';
import readline from 'readline';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Obtenir le chemin du fichier actuel (équivalent de __dirname en ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialiser Firebase Admin
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '../firebase-credentials.json'), 'utf-8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Interface pour lire les inputs utilisateur
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => {
    rl.question(query, resolve);
  });
}

async function cleanupUserAccount(userUid) {
  console.log('\n========================================');
  console.log('🔍 DIAGNOSTIC DES DONNÉES UTILISATEUR');
  console.log('========================================\n');
  console.log(`User UID: ${userUid}\n`);

  try {
    // 1. Vérifier le document users
    console.log('📄 Vérification du document users...');
    const userDocRef = db.collection('users').doc(userUid);
    const userDoc = await userDocRef.get();
    
    if (userDoc.exists) {
      console.log('✅ Document users trouvé:');
      console.log(JSON.stringify(userDoc.data(), null, 2));
      console.log('');
    } else {
      console.log('❌ Document users NON TROUVÉ\n');
    }

    // 2. Vérifier les saasAccounts appartenant à cet utilisateur
    console.log('🏢 Vérification des saasAccounts...');
    const saasAccountsSnapshot = await db.collection('saasAccounts')
      .where('ownerUid', '==', userUid)
      .get();
    
    if (saasAccountsSnapshot.empty) {
      console.log('❌ Aucun saasAccount trouvé pour cet utilisateur\n');
    } else {
      console.log(`✅ ${saasAccountsSnapshot.size} saasAccount(s) trouvé(s):\n`);
      saasAccountsSnapshot.forEach((doc, index) => {
        console.log(`  [${index + 1}] ID: ${doc.id}`);
        console.log(`      Numéro MBE: ${doc.data().mbeNumber}`);
        console.log(`      Nom commercial: ${doc.data().commercialName}`);
        console.log(`      Ville: ${doc.data().mbeCity}`);
        console.log(`      Actif: ${doc.data().isActive}`);
        console.log('');
      });
    }

    // 3. Proposer le nettoyage
    console.log('========================================');
    console.log('🧹 OPTIONS DE NETTOYAGE');
    console.log('========================================\n');
    
    const answer = await question(
      'Que souhaitez-vous faire ?\n' +
      '  1. Supprimer UNIQUEMENT le(s) saasAccount(s)\n' +
      '  2. Supprimer le document users ET le(s) saasAccount(s)\n' +
      '  3. Annuler (ne rien faire)\n' +
      '\nVotre choix (1/2/3): '
    );

    switch (answer.trim()) {
      case '1':
        // Supprimer seulement les saasAccounts
        if (!saasAccountsSnapshot.empty) {
          const confirm = await question(
            `\n⚠️  ATTENTION: Vous allez supprimer ${saasAccountsSnapshot.size} saasAccount(s).\n` +
            'Cette action est IRRÉVERSIBLE.\n' +
            'Confirmer ? (oui/non): '
          );
          
          if (confirm.toLowerCase() === 'oui') {
            console.log('\n🗑️  Suppression des saasAccounts...');
            const batch = db.batch();
            saasAccountsSnapshot.forEach(doc => {
              batch.delete(doc.ref);
            });
            await batch.commit();
            console.log('✅ saasAccount(s) supprimé(s) avec succès\n');
          } else {
            console.log('\n❌ Opération annulée\n');
          }
        } else {
          console.log('\n⚠️  Aucun saasAccount à supprimer\n');
        }
        break;

      case '2':
        // Supprimer le document users ET les saasAccounts
        const confirm = await question(
          `\n⚠️  ATTENTION: Vous allez supprimer:\n` +
          `  - Le document users\n` +
          `  - ${saasAccountsSnapshot.size} saasAccount(s)\n` +
          'Cette action est IRRÉVERSIBLE.\n' +
          'Confirmer ? (oui/non): '
        );
        
        if (confirm.toLowerCase() === 'oui') {
          console.log('\n🗑️  Suppression des documents...');
          const batch = db.batch();
          
          // Supprimer le document users
          if (userDoc.exists) {
            batch.delete(userDocRef);
          }
          
          // Supprimer les saasAccounts
          saasAccountsSnapshot.forEach(doc => {
            batch.delete(doc.ref);
          });
          
          await batch.commit();
          console.log('✅ Tous les documents ont été supprimés avec succès\n');
          console.log('💡 Vous pouvez maintenant vous reconnecter et recréer votre compte via /setup-mbe\n');
        } else {
          console.log('\n❌ Opération annulée\n');
        }
        break;

      case '3':
        console.log('\n❌ Opération annulée\n');
        break;

      default:
        console.log('\n❌ Choix invalide. Opération annulée\n');
    }

  } catch (error) {
    console.error('\n❌ ERREUR:', error);
    console.error('\nDétails:', error.message);
  } finally {
    rl.close();
    process.exit(0);
  }
}

// Point d'entrée
const userUid = process.argv[2];

if (!userUid) {
  console.error('\n❌ ERREUR: Vous devez fournir un User UID\n');
  console.log('Usage: node scripts/cleanup-user-account.js <USER_UID>\n');
  console.log('Exemple: node scripts/cleanup-user-account.js zUWaigdSisakUVcmLp9BswbZgr22\n');
  process.exit(1);
}

cleanupUserAccount(userUid);
