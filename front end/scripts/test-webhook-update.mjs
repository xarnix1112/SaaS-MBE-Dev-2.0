#!/usr/bin/env node
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envLocalPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}

const credentialsPath = path.resolve(__dirname, '..', 'firebase-credentials.json');
const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount),
});

const firestore = getFirestore();

async function testWebhookUpdate() {
  console.log('🔍 Vérification des paiements dans Firestore...\n');

  try {
    const paiementsSnapshot = await firestore.collection('paiements').get();

    if (paiementsSnapshot.empty) {
      console.log('❌ Aucun paiement trouvé dans Firestore.');
      process.exit(1);
    }

    console.log(`✅ ${paiementsSnapshot.size} paiement(s) trouvé(s)\n`);

    paiementsSnapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`📄 Paiement ID: ${doc.id}`);
      console.log(`   Devis ID: ${data.devisId}`);
      console.log(`   Montant: ${data.amount}€`);
      console.log(`   Status: ${data.status}`);
      console.log(`   Session: ${data.stripeSessionId}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Erreur :', error);
    process.exit(1);
  }
}

testWebhookUpdate();
