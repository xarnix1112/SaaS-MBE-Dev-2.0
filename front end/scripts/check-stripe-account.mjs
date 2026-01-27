#!/usr/bin/env node

/**
 * Script pour vérifier la configuration du compte Stripe connecté
 */

import Stripe from 'stripe';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Charger les variables d'environnement
const envLocalPath = path.resolve(__dirname, '..', '.env.local');
const envPath = path.resolve(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const CONNECTED_ACCOUNT_ID = 'acct_1SouIJA0EsyRRiXS'; // ID du compte connecté depuis les logs

if (!STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY non définie dans .env.local');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

async function checkConnectedAccount() {
  console.log('🔍 Vérification du compte Stripe connecté...\n');
  console.log(`Compte ID: ${CONNECTED_ACCOUNT_ID}\n`);

  try {
    // Récupérer les informations du compte connecté
    const account = await stripe.accounts.retrieve(CONNECTED_ACCOUNT_ID);

    console.log('✅ Compte Stripe trouvé !\n');
    console.log('📊 Informations du compte :');
    console.log('─────────────────────────────────────');
    console.log(`Type: ${account.type}`);
    console.log(`Email: ${account.email || '(non défini)'}`);
    console.log(`Business name: ${account.business_profile?.name || '❌ NON DÉFINI'}`);
    console.log(`Support email: ${account.business_profile?.support_email || '(non défini)'}`);
    console.log(`Support phone: ${account.business_profile?.support_phone || '(non défini)'}`);
    console.log(`Charges enabled: ${account.charges_enabled ? '✅' : '❌'}`);
    console.log(`Payouts enabled: ${account.payouts_enabled ? '✅' : '❌'}`);
    console.log('─────────────────────────────────────\n');

    // Vérifier si le nom d'entreprise est défini
    if (!account.business_profile?.name) {
      console.error('❌ PROBLÈME IDENTIFIÉ :');
      console.error('   Le nom d\'entreprise (Business name) n\'est PAS défini.\n');
      console.error('✅ SOLUTION :');
      console.error('   1. Connecte-toi au compte Stripe : ' + (account.email || 'compte connecté'));
      console.error('   2. Va sur : https://dashboard.stripe.com/settings/account');
      console.error('   3. Remplis le champ "Business name" (ou "Nom de l\'entreprise")');
      console.error('   4. Sauvegarde\n');
      console.error('   OU utilise ce lien direct :');
      console.error(`   https://dashboard.stripe.com/${CONNECTED_ACCOUNT_ID}/settings/account\n`);
      process.exit(1);
    } else {
      console.log('✅ Le nom d\'entreprise est configuré !');
      console.log(`   Nom: "${account.business_profile.name}"\n`);
      console.log('🎉 Ce compte est prêt à utiliser Stripe Checkout !\n');
    }

  } catch (error) {
    console.error('❌ Erreur lors de la récupération du compte :', error.message);
    
    if (error.code === 'account_invalid') {
      console.error('\n⚠️  Le compte connecté n\'existe pas ou n\'est pas accessible.');
      console.error('   Reconnecte ton compte Stripe dans : Paramètres → Paiements\n');
    }
    
    process.exit(1);
  }
}

checkConnectedAccount();

