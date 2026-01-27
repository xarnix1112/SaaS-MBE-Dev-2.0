#!/usr/bin/env node
/**
 * Script de vérification de la configuration du webhook Stripe et Firebase
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

console.log('🔍 Vérification de la configuration du webhook Stripe et Firebase\n');

// 1. Vérifier .env.local
const envLocalPath = path.join(projectRoot, '.env.local');
let envLocal = {};
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, 'utf8');
  content.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      envLocal[match[1].trim()] = match[2].trim();
    }
  });
  console.log('✅ .env.local trouvé');
} else {
  console.log('❌ .env.local non trouvé');
  process.exit(1);
}

// 2. Vérifier STRIPE_WEBHOOK_SECRET
const webhookSecret = envLocal.STRIPE_WEBHOOK_SECRET;
if (!webhookSecret) {
  console.log('❌ STRIPE_WEBHOOK_SECRET non défini dans .env.local');
  process.exit(1);
} else if (!webhookSecret.startsWith('whsec_')) {
  console.log('⚠️  STRIPE_WEBHOOK_SECRET ne commence pas par "whsec_"');
} else {
  console.log('✅ STRIPE_WEBHOOK_SECRET configuré:', webhookSecret.substring(0, 20) + '...');
}

// 3. Vérifier STRIPE_SECRET_KEY
const stripeKey = envLocal.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.log('⚠️  STRIPE_SECRET_KEY non défini dans .env.local');
} else if (!stripeKey.startsWith('sk_')) {
  console.log('⚠️  STRIPE_SECRET_KEY ne commence pas par "sk_"');
} else {
  console.log('✅ STRIPE_SECRET_KEY configuré:', stripeKey.substring(0, 20) + '...');
}

// 4. Vérifier firebase-credentials.json
const credentialsPath = path.join(projectRoot, 'firebase-credentials.json');
if (fs.existsSync(credentialsPath)) {
  try {
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    if (credentials.project_id) {
      console.log('✅ firebase-credentials.json trouvé et valide');
      console.log('   Project ID:', credentials.project_id);
      console.log('   Client Email:', credentials.client_email);
    } else {
      console.log('❌ firebase-credentials.json invalide (project_id manquant)');
      process.exit(1);
    }
  } catch (e) {
    console.log('❌ Erreur lors de la lecture de firebase-credentials.json:', e.message);
    process.exit(1);
  }
} else {
  console.log('❌ firebase-credentials.json non trouvé');
  console.log('   Chemin attendu:', credentialsPath);
  process.exit(1);
}

// 5. Vérifier que les routes webhook sont correctement configurées
const aiProxyPath = path.join(projectRoot, 'server', 'ai-proxy.js');
const indexPath = path.join(projectRoot, 'server', 'index.js');

let aiProxyHasWebhook = false;
let indexHasWebhook = false;
let aiProxyHasFirebase = false;
let indexHasFirebase = false;
let aiProxyDisablesLink = false;
let indexDisablesLink = false;

if (fs.existsSync(aiProxyPath)) {
  const content = fs.readFileSync(aiProxyPath, 'utf8');
  aiProxyHasWebhook = content.includes('app.post("/api/stripe/webhook"');
  aiProxyHasFirebase = content.includes('firebase-admin');
  aiProxyDisablesLink = content.includes('stripe.paymentLinks.update') && content.includes('active: false');
}

if (fs.existsSync(indexPath)) {
  const content = fs.readFileSync(indexPath, 'utf8');
  indexHasWebhook = content.includes('app.post("/api/stripe/webhook"');
  indexHasFirebase = content.includes('firebase-admin');
  indexDisablesLink = content.includes('stripe.paymentLinks.update') && content.includes('active: false');
}

console.log('\n📋 Vérification des fichiers serveur:');
console.log('   ai-proxy.js (dev):');
console.log('     - Route webhook:', aiProxyHasWebhook ? '✅' : '❌');
console.log('     - Firebase Admin:', aiProxyHasFirebase ? '✅' : '❌');
console.log('     - Désactivation Payment Link:', aiProxyDisablesLink ? '✅' : '❌');
console.log('   index.js (production):');
console.log('     - Route webhook:', indexHasWebhook ? '✅' : '❌');
console.log('     - Firebase Admin:', indexHasFirebase ? '✅' : '❌');
console.log('     - Désactivation Payment Link:', indexDisablesLink ? '✅' : '❌');

if (!aiProxyHasWebhook || !indexHasWebhook) {
  console.log('\n❌ Routes webhook manquantes dans les fichiers serveur');
  process.exit(1);
}

if (!aiProxyHasFirebase || !indexHasFirebase) {
  console.log('\n❌ Firebase Admin non configuré dans les fichiers serveur');
  process.exit(1);
}

if (!aiProxyDisablesLink || !indexDisablesLink) {
  console.log('\n⚠️  La désactivation automatique des Payment Links n\'est pas implémentée dans tous les fichiers');
  console.log('   Cela peut permettre la réutilisation des liens après paiement');
}

console.log('\n✅ Configuration vérifiée avec succès!');
console.log('\n📝 Instructions:');
console.log('   1. Pour le développement local, utilisez Stripe CLI:');
console.log('      stripe listen --forward-to localhost:5174/api/stripe/webhook');
console.log('   2. Pour la production, configurez l\'URL du webhook dans le dashboard Stripe:');
console.log('      https://votre-domaine.com/api/stripe/webhook');
console.log('   3. Assurez-vous que STRIPE_WEBHOOK_SECRET correspond au secret du webhook configuré');

