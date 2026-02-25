#!/usr/bin/env node
/**
 * Mode DRY-RUN : Vérifie la configuration production avant déploiement.
 * Exécute ce script AVANT de merger staging vers master pour détecter les problèmes.
 *
 * Usage:
 *   cd "front end"
 *   node scripts/verify-production-config.mjs
 *
 * ou avec NODE_ENV=production pour simuler l'environnement:
 *   NODE_ENV=production node scripts/verify-production-config.mjs
 *
 * Pour tester avec des variables locales (sans secrets prod) :
 *   créez .env.production.local avec des valeurs de test.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Charger les variables depuis .env, .env.local, .env.production.local (pour tests locaux)
for (const name of ['.env', '.env.local', '.env.production.local']) {
  const p = path.join(rootDir, name);
  if (fs.existsSync(p)) dotenv.config({ path: p, override: true, quiet: true });
}

const results = { ok: [], warn: [], error: [] };

function ok(msg) {
  results.ok.push(msg);
  console.log(`  ✅ ${msg}`);
}

function warn(msg) {
  results.warn.push(msg);
  console.log(`  ⚠️  ${msg}`);
}

function error(msg) {
  results.error.push(msg);
  console.log(`  ❌ ${msg}`);
}

console.log('\n🔍 Vérification configuration Production (mode dry-run)\n');
console.log('═'.repeat(60));

// 1. Fichiers Firebase
console.log('\n1. Fichiers Firebase credentials');
const credPaths = [
  path.join(rootDir, 'firebase-credentials-prod.json'),
  path.join(rootDir, 'firebase-credentials.json'),
];
const hasCred = credPaths.some((p) => fs.existsSync(p));
if (hasCred) {
  ok(`Fichier credentials trouvé (${credPaths.find((p) => fs.existsSync(p))?.split('/').pop()})`);
} else {
  warn('Aucun firebase-credentials-prod.json ni firebase-credentials.json trouvé localement.');
  ok('En production Railway, FIREBASE_CREDENTIALS_BASE64 est utilisé (normal).');
}

// 2. Variables d'environnement attendues (simulation)
console.log('\n2. Variables d\'environnement attendues (Production)');
const expectedVars = [
  'NODE_ENV',
  'FIREBASE_PROJECT_ID',
  'APP_URL',
  'FRONTEND_URL',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CONNECT_CLIENT_ID',
];
const hasBase64 = !!process.env.FIREBASE_CREDENTIALS_BASE64;
if (hasBase64) {
  ok('FIREBASE_CREDENTIALS_BASE64 défini (Railway)');
} else {
  warn('FIREBASE_CREDENTIALS_BASE64 non défini (normal en local, requis sur Railway)');
}

const nodeEnv = process.env.NODE_ENV || 'development';
if (nodeEnv === 'production') {
  ok('NODE_ENV=production');
} else {
  warn(`NODE_ENV=${nodeEnv} — Pour un vrai test prod, lance avec: NODE_ENV=production node scripts/verify-production-config.mjs`);
}

// 3. URL Production
console.log('\n3. URLs Production attendues');
const appUrl = process.env.APP_URL || '';
const frontendUrl = process.env.FRONTEND_URL || '';
if (appUrl.includes('api.mbe-sdv.fr')) {
  ok(`APP_URL=${appUrl}`);
} else if (appUrl) {
  warn(`APP_URL=${appUrl} — Production attendue: https://api.mbe-sdv.fr`);
} else {
  warn('APP_URL non défini (sera requis sur Railway prod)');
}
if (frontendUrl.includes('mbe-sdv.fr') && !frontendUrl.includes('staging')) {
  ok(`FRONTEND_URL=${frontendUrl}`);
} else if (frontendUrl) {
  warn(`FRONTEND_URL=${frontendUrl}`);
} else {
  warn('FRONTEND_URL non défini — Production: https://mbe-sdv.fr ou https://www.mbe-sdv.fr');
}

// 4. Stripe
console.log('\n4. Stripe (Production = mode live)');
const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const isProdEnv = nodeEnv === 'production';
if (stripeKey.startsWith('sk_live_')) {
  ok('STRIPE_SECRET_KEY en mode live (sk_live_)');
} else if (stripeKey.startsWith('sk_test_')) {
  if (isProdEnv) {
    error('STRIPE_SECRET_KEY en mode test alors que NODE_ENV=production ! Utilise sk_live_ pour prod.');
  } else {
    warn('STRIPE_SECRET_KEY en mode test (attendu en local ; en prod sur Railway = sk_live_)');
  }
} else if (stripeKey) {
  warn('STRIPE_SECRET_KEY présent mais format non reconnu');
} else {
  warn('STRIPE_SECRET_KEY non défini');
}

// 5. Resend (emails production)
console.log('\n5. Emails (Resend pour production)');
const resendKey = process.env.RESEND_API_KEY || '';
if (resendKey && resendKey.startsWith('re_')) {
  ok('RESEND_API_KEY configuré');
} else {
  warn('RESEND_API_KEY non configuré — Les emails en prod passent par Resend');
}

// 6. Paytweak (optionnel)
console.log('\n6. Paytweak');
warn('Paytweak : configuré par compte (Firestore customFeatures.customPaytweak). Pas de variable globale.');

// 7. Fichiers critiques
console.log('\n7. Fichiers critiques du build');
const criticalFiles = [
  'package.json',
  'vite.config.ts',
  'src/main.tsx',
  'server/ai-proxy.js',
  'server/payment-provider.js',
];
for (const f of criticalFiles) {
  const p = path.join(rootDir, f);
  if (fs.existsSync(p)) ok(f);
  else error(`Manquant: ${f}`);
}

// Résumé
console.log('\n' + '═'.repeat(60));
console.log('\n📋 RÉSUMÉ');
console.log(`  ✅ OK: ${results.ok.length}`);
console.log(`  ⚠️  Avertissements: ${results.warn.length}`);
console.log(`  ❌ Erreurs: ${results.error.length}`);

if (results.error.length > 0) {
  console.log('\n❌ Des erreurs bloquantes ont été détectées. Corrigez-les avant le déploiement.\n');
  process.exit(1);
}

if (results.warn.length > 0) {
  console.log('\n⚠️  Vérifiez les avertissements avant de déployer en production.\n');
  process.exit(0);
}

console.log('\n✅ Aucune erreur détectée. La configuration semble prête pour la production.\n');
process.exit(0);
