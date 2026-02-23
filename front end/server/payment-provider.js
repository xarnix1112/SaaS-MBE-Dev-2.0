/**
 * Logique Payment Provider (Stripe / Paytweak)
 * Utilisé par stripe-connect, ai-proxy (auto-génération, POST paytweak/link).
 */

import fetch from 'node-fetch';

const CUSTOM_PAYTWEAK_ACCOUNT_ID = 'es4IiIhl03aPttsTz5xj';
const PAYTWEAK_API_BASE = process.env.VITE_PAYTWEAK_API_BASE || 'https://api.paytweak.com';
const PAYTWEAK_LINK_PATH = process.env.VITE_PAYTWEAK_LINK_PATH || '/v1/link';

export function hasCustomPaytweak(saasData, saasAccountId) {
  return saasData?.customFeatures?.customPaytweak === true || saasAccountId === CUSTOM_PAYTWEAK_ACCOUNT_ID;
}

export async function getPaymentProviderConfig(firestore, saasAccountId) {
  if (!firestore || !saasAccountId) return null;
  const saasDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
  if (!saasDoc.exists) return null;
  const saas = saasDoc.data();
  const stripeConnected = Boolean(saas.integrations?.stripe?.connected && saas.integrations?.stripe?.stripeAccountId);
  const paymentProvider = saas.paymentProvider || 'stripe';
  let paytweakConfigured = false;
  if (hasCustomPaytweak(saas, saasAccountId)) {
    const secretsDoc = await firestore.collection('saasAccounts').doc(saasAccountId).collection('secrets').doc('paytweak').get();
    paytweakConfigured = secretsDoc.exists && Boolean(secretsDoc.data()?.apiKey);
  }
  return {
    hasCustomPaytweak: hasCustomPaytweak(saas, saasAccountId),
    paymentProvider,
    paytweakConfigured,
    stripeConnected,
  };
}

export async function getPaytweakApiKey(firestore, saasAccountId) {
  if (!firestore || !saasAccountId) return null;
  const secretsDoc = await firestore.collection('saasAccounts').doc(saasAccountId).collection('secrets').doc('paytweak').get();
  return secretsDoc.exists ? (secretsDoc.data()?.apiKey || null) : null;
}

/**
 * Crée un lien Paytweak pour un compte SaaS.
 * @param {FirebaseFirestore.Firestore} firestore
 * @param {string} saasAccountId
 * @param {object} payload - { amount, currency, reference, description, customer, successUrl, cancelUrl }
 * @param {string} baseUrl - URL de base pour success/cancel (ex: APP_URL)
 * @returns {Promise<{url: string, id?: string}>}
 */
export async function createPaytweakLinkForAccount(firestore, saasAccountId, payload, baseUrl = 'https://staging.mbe-sdv.fr') {
  const apiKey = await getPaytweakApiKey(firestore, saasAccountId);
  if (!apiKey) {
    throw new Error('Clé API Paytweak non configurée');
  }
  const { amount, currency = 'EUR', reference, description, customer, successUrl, cancelUrl } = payload;
  const fullPayload = {
    amount,
    currency,
    reference,
    description: description || reference,
    customer: { name: customer?.name || '', email: customer?.email || '', phone: customer?.phone || '' },
    successUrl: successUrl || `${baseUrl}/payment/success`,
    cancelUrl: cancelUrl || `${baseUrl}/payment/cancel`,
  };
  const paytweakUrl = `${PAYTWEAK_API_BASE.replace(/\/+$/, '')}${PAYTWEAK_LINK_PATH}`;
  const res = await fetch(paytweakUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP_PAYTWEAK_TOKEN': apiKey,
    },
    body: JSON.stringify(fullPayload),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Paytweak API error ${res.status}: ${text || res.statusText}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Réponse Paytweak invalide');
  }
  const link = data?.paymentUrl || data?.url || data?.redirectUrl || data?.link || data?.shortUrl || data?.short_url || '';
  if (!link) {
    throw new Error('Pas d\'URL de paiement dans la réponse Paytweak');
  }
  return { url: link, id: data?.id || `pt-${Date.now()}` };
}
