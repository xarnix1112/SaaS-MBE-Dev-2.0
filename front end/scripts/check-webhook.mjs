#!/usr/bin/env node

/**
 * Script pour vérifier la configuration du webhook Stripe
 * Usage: node scripts/check-webhook.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envLocalPath = join(__dirname, '..', '.env.local');

console.log('🔍 Vérification de la configuration du webhook Stripe...\n');

// Vérifier .env.local
let envLocal = {};
try {
  const content = readFileSync(envLocalPath, 'utf8');
  content.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      envLocal[key] = value;
    }
  });
  console.log('✅ Fichier .env.local trouvé');
} catch (err) {
  console.error('❌ Fichier .env.local introuvable:', envLocalPath);
  process.exit(1);
}

// Vérifier STRIPE_WEBHOOK_SECRET
const webhookSecret = envLocal.STRIPE_WEBHOOK_SECRET;
if (!webhookSecret) {
  console.error('❌ STRIPE_WEBHOOK_SECRET non défini dans .env.local');
  process.exit(1);
}

if (!webhookSecret.startsWith('whsec_')) {
  console.warn('⚠️  STRIPE_WEBHOOK_SECRET ne commence pas par "whsec_"');
} else {
  console.log('✅ STRIPE_WEBHOOK_SECRET configuré:', webhookSecret.substring(0, 20) + '...');
}

// Vérifier STRIPE_SECRET_KEY
const stripeKey = envLocal.STRIPE_SECRET_KEY || envLocal.STRIPE_API_KEY;
if (!stripeKey) {
  console.error('❌ STRIPE_SECRET_KEY non défini dans .env.local');
  process.exit(1);
}

if (!stripeKey.startsWith('sk_')) {
  console.warn('⚠️  STRIPE_SECRET_KEY ne commence pas par "sk_"');
} else {
  console.log('✅ STRIPE_SECRET_KEY configuré:', stripeKey.substring(0, 20) + '...');
}

// Instructions
console.log('\n📋 Instructions pour tester le webhook:\n');
console.log('1. Assurez-vous que le serveur backend est lancé (npm run dev:all)');
console.log('2. Dans un TERMINAL SÉPARÉ, lancez Stripe CLI:');
console.log('   stripe listen --forward-to localhost:5174/api/stripe/webhook');
console.log('3. Stripe CLI affichera un nouveau secret (whsec_xxx)');
console.log('4. Remplacez STRIPE_WEBHOOK_SECRET dans .env.local par ce nouveau secret');
console.log('5. Redémarrez le serveur backend');
console.log('6. Testez un paiement et vérifiez les logs du serveur\n');

console.log('💡 Note: Le secret dans .env.local doit correspondre à celui affiché par Stripe CLI');
console.log('   Si vous utilisez Stripe CLI, le secret change à chaque fois que vous le lancez.\n');

