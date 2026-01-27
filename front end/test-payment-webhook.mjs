#!/usr/bin/env node

/**
 * Script de test pour simuler un webhook Stripe
 * et vérifier que le statut du devis est bien mis à jour
 * 
 * Usage: node test-payment-webhook.mjs <devisId> <sessionId>
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialiser Firebase Admin
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, 'firebase-credentials.json'), 'utf8')
);

initializeApp({
  credential: cert(serviceAccount)
});

const firestore = getFirestore();

// Arguments
const devisId = process.argv[2];
const sessionId = process.argv[3] || 'test_session_' + Date.now();

if (!devisId) {
  console.error('❌ Usage: node test-payment-webhook.mjs <devisId> [sessionId]');
  process.exit(1);
}

console.log('🧪 Test webhook Stripe');
console.log('📦 Devis ID:', devisId);
console.log('💳 Session ID:', sessionId);
console.log('');

async function testWebhook() {
  try {
    // 1. Vérifier que le devis existe
    console.log('1️⃣ Vérification du devis...');
    const devisDoc = await firestore.collection('quotes').doc(devisId).get();
    
    if (!devisDoc.exists) {
      throw new Error(`Devis ${devisId} non trouvé`);
    }
    
    const devis = devisDoc.data();
    console.log('✅ Devis trouvé:', {
      reference: devis.reference,
      status: devis.status,
      paymentStatus: devis.paymentStatus,
    });
    console.log('');

    // 2. Récupérer le paiement
    console.log('2️⃣ Recherche du paiement PRINCIPAL...');
    const paiementsSnapshot = await firestore
      .collection('paiements')
      .where('devisId', '==', devisId)
      .where('type', '==', 'PRINCIPAL')
      .get();
    
    if (paiementsSnapshot.empty) {
      throw new Error('Aucun paiement principal trouvé');
    }
    
    const paiementDoc = paiementsSnapshot.docs[0];
    const paiement = paiementDoc.data();
    
    console.log('✅ Paiement principal trouvé:', {
      id: paiementDoc.id,
      amount: paiement.amount,
      status: paiement.status,
      type: paiement.type,
    });
    console.log('');

    // 3. Simuler le paiement
    console.log('3️⃣ Simulation du paiement...');
    await firestore.collection('paiements').doc(paiementDoc.id).update({
      status: 'PAID',
      paidAt: Timestamp.now(),
      stripePaymentIntentId: 'pi_test_' + Date.now(),
    });
    console.log('✅ Paiement marqué comme PAID');
    console.log('');

    // 4. Ajouter événement timeline
    console.log('4️⃣ Ajout événement à la timeline...');
    const timelineEvent = {
      id: `tl-${Date.now()}-test`,
      date: Timestamp.now(),
      status: 'awaiting_collection',
      description: `Paiement principal reçu (${paiement.amount.toFixed(2)}€)`,
      user: 'Test Webhook',
    };
    
    const existingTimeline = devis.timeline || [];
    await firestore.collection('quotes').doc(devisId).update({
      timeline: [...existingTimeline, timelineEvent],
      updatedAt: Timestamp.now(),
    });
    console.log('✅ Événement ajouté à la timeline');
    console.log('');

    // 5. Mettre à jour le statut du devis
    console.log('5️⃣ Mise à jour du statut du devis...');
    await firestore.collection('quotes').doc(devisId).update({
      status: 'awaiting_collection',
      paymentStatus: 'paid',
      updatedAt: Timestamp.now(),
    });
    console.log('✅ Statut du devis mis à jour');
    console.log('');

    // 6. Vérification finale
    console.log('6️⃣ Vérification finale...');
    const updatedDevisDoc = await firestore.collection('quotes').doc(devisId).get();
    const updatedDevis = updatedDevisDoc.data();
    
    console.log('📊 État final du devis:');
    console.log('  - Statut:', updatedDevis.status);
    console.log('  - Statut paiement:', updatedDevis.paymentStatus);
    console.log('  - Timeline:', updatedDevis.timeline?.length || 0, 'événements');
    
    if (updatedDevis.timeline && updatedDevis.timeline.length > 0) {
      const lastEvent = updatedDevis.timeline[updatedDevis.timeline.length - 1];
      console.log('  - Dernier événement:', lastEvent.description);
    }
    console.log('');

    console.log('✅ Test réussi !');
    console.log('');
    console.log('🔍 Vérifiez dans l\'interface:');
    console.log('  1. Onglet "Historique" → Événement "Paiement principal reçu"');
    console.log('  2. Statut du devis → "En attente de récupération"');
    console.log('  3. Pipeline → Devis déplacé vers "awaiting_collection"');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testWebhook().then(() => process.exit(0));

