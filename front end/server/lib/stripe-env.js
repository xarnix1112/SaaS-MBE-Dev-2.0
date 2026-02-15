/**
 * Configuration Stripe selon l'environnement
 * - dev + staging : clés test (sk_test_, whsec_...)
 * - production : clés live (sk_live_, whsec_...)
 */

import { getEnv, isProduction } from './env.js';

/**
 * Vérifie que la clé Stripe correspond à l'environnement
 */
export function validateStripeKeys() {
  const env = getEnv();
  const secretKey = process.env.STRIPE_SECRET_KEY || '';
  const isTestKey = secretKey.startsWith('sk_test_');
  const isLiveKey = secretKey.startsWith('sk_live_');

  if (env === 'production') {
    if (isTestKey) {
      console.error('[stripe-env] ⚠️ ERREUR: STRIPE_SECRET_KEY en mode test en production!');
      throw new Error('Stripe: utiliser les clés LIVE en production');
    }
  } else if (isLiveKey) {
    console.error('[stripe-env] ⚠️ ERREUR: STRIPE_SECRET_KEY en mode live en dev/staging!');
    throw new Error('Stripe: utiliser les clés TEST en dev/staging');
  }
  return true;
}

/**
 * Retourne la config Stripe selon l'environnement
 */
export function getStripeConfig() {
  const env = getEnv();
  return {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    connectClientId: process.env.STRIPE_CONNECT_CLIENT_ID,
    isLive: isProduction,
    env,
  };
}
