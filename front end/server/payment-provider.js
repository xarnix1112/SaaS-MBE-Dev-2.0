/**
 * Logique Payment Provider (Stripe / Paytweak)
 * Utilisé par stripe-connect, ai-proxy (auto-génération, POST paytweak/link).
 *
 * Auth Paytweak (doc Connexion à l'API):
 * 1. hello (Paytweak-API-KEY: public) → Paytweak-Security-Token
 * 2. verify (Paytweak-USER-TOKEN: base64(security+private)) → Paytweak-Work-Token
 * 3. Requêtes API avec Paytweak-Token: work_token (validité 10 min)
 */

import fetch from 'node-fetch';

const CUSTOM_PAYTWEAK_ACCOUNT_IDS = ['es4IiIhl03aPttsTz5xj', 'JrCRpURxF7k6PHwueLPr'];
const PAYTWEAK_API_BASE = process.env.VITE_PAYTWEAK_API_BASE || 'https://api.paytweak.com';
const PAYTWEAK_LINKS_URL = `${PAYTWEAK_API_BASE.replace(/\/+$/, '')}/v1/links/`;

// Cache work token par saasAccountId (validité ~9 min pour laisser une marge)
const workTokenCache = new Map();
const CACHE_TTL_MS = 9 * 60 * 1000;

export function hasCustomPaytweak(saasData, saasAccountId) {
  return saasData?.customFeatures?.customPaytweak === true || CUSTOM_PAYTWEAK_ACCOUNT_IDS.includes(saasAccountId);
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
    const secrets = secretsDoc.exists ? secretsDoc.data() : {};
    paytweakConfigured = Boolean(secrets.publicKey && secrets.privateKey);
  }
  return {
    hasCustomPaytweak: hasCustomPaytweak(saas, saasAccountId),
    paymentProvider,
    paytweakConfigured,
    stripeConnected,
  };
}

export async function getPaytweakKeys(firestore, saasAccountId) {
  if (!firestore || !saasAccountId) return null;
  const secretsDoc = await firestore.collection('saasAccounts').doc(saasAccountId).collection('secrets').doc('paytweak').get();
  if (!secretsDoc.exists) return null;
  const { publicKey, privateKey } = secretsDoc.data() || {};
  return publicKey && privateKey ? { publicKey, privateKey } : null;
}

/** @deprecated Utiliser getPaytweakKeys - gardé pour compat */
export async function getPaytweakApiKey(firestore, saasAccountId) {
  const keys = await getPaytweakKeys(firestore, saasAccountId);
  return keys ? keys.publicKey : null;
}

/**
 * Obtient un work token Paytweak via hello → verify.
 * Utilise un cache pour éviter les appels répétés.
 */
async function getPaytweakWorkToken(firestore, saasAccountId) {
  const cached = workTokenCache.get(saasAccountId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const keys = await getPaytweakKeys(firestore, saasAccountId);
  if (!keys) throw new Error('Clés Paytweak non configurées (publique + privée)');

  const base = PAYTWEAK_API_BASE.replace(/\/+$/, '');

  // 1. hello
  const helloRes = await fetch(`${base}/hello`, {
    method: 'GET',
    headers: { 'Paytweak-API-KEY': keys.publicKey },
  });
  const helloText = await helloRes.text();
  if (!helloRes.ok) {
    throw new Error(`Paytweak hello failed ${helloRes.status}: ${helloText}`);
  }
  let helloData;
  try {
    helloData = JSON.parse(helloText);
  } catch {
    throw new Error('Réponse Paytweak hello invalide');
  }
  const securityToken = helloData['Paytweak-Security-Token'] || helloData.paytweakSecurityToken;
  if (!securityToken) {
    throw new Error('Paytweak: Security token manquant dans la réponse hello');
  }

  // 2. verify
  const userToken = Buffer.from(String(securityToken).trim() + keys.privateKey, 'utf8').toString('base64');
  const verifyRes = await fetch(`${base}/verify`, {
    method: 'GET',
    headers: { 'Paytweak-USER-TOKEN': userToken },
  });
  const verifyText = await verifyRes.text();
  if (!verifyRes.ok) {
    throw new Error(`Paytweak verify failed ${verifyRes.status}: ${verifyText}`);
  }
  let verifyData;
  try {
    verifyData = JSON.parse(verifyText);
  } catch {
    throw new Error('Réponse Paytweak verify invalide');
  }
  const workToken = verifyData['Paytweak-Work-Token'] || verifyData.paytweakWorkToken || verifyData.token;
  if (!workToken) {
    throw new Error('Paytweak: Work token manquant dans la réponse verify');
  }

  workTokenCache.set(saasAccountId, { token: workToken, expiresAt: Date.now() + CACHE_TTL_MS });
  return workToken;
}

/**
 * Construit l'order_id au format: NomFamilleBordereau-NumeroBordereau-SalleDeVente-devisId
 * Pour le groupe: group-groupId
 * freetext contient la même info lisible.
 */
function buildPaytweakOrderId(quote, devisId, groupId) {
  if (groupId) return `group-${groupId}`;
  const nomFamille = (quote.reference || 'MBE').replace(/[\s\/\\]/g, '_').substring(0, 30);
  const numero = (quote.auctionSheet?.bordereauNumber || quote.lot?.bordereauNumber || '0').replace(/[\s\/\\]/g, '_');
  const salle = (quote.auctionSheet?.auctionHouse || quote.lot?.auctionHouse || 'SDV').replace(/[\s\/\\]/g, '_').substring(0, 40);
  return devisId ? `${nomFamille}-${numero}-${salle}__${devisId}` : `${nomFamille}-${numero}-${salle}`;
}

/**
 * Extrait devisId ou groupId depuis l'order_id renvoyé par le webhook Paytweak.
 * @returns {{ devisId?: string, groupId?: string, reference?: string } | null}
 */
export function parsePaytweakOrderId(orderId) {
  if (!orderId || typeof orderId !== 'string') return null;
  if (orderId.startsWith('group-')) {
    const groupId = orderId.slice(6);
    return groupId ? { groupId } : null;
  }
  const idx = orderId.lastIndexOf('__');
  if (idx >= 0) {
    const devisId = orderId.slice(idx + 2);
    return devisId ? { devisId } : null;
  }
  return { reference: orderId };
}

/**
 * Crée un lien Paytweak pour un compte SaaS.
 * Conforme à la doc: POST /v1/links/, header Paytweak-Token, params order_id, amount, cur, etc.
 *
 * @param {FirebaseFirestore.Firestore} firestore
 * @param {string} saasAccountId
 * @param {object} payload - { amount, currency, reference, description, customer, successUrl, cancelUrl, devisId, groupId, quote }
 * @param {string} baseUrl - URL de base (ex: APP_URL)
 * @returns {Promise<{url: string, id?: string, order_id?: string}>}
 */
export async function createPaytweakLinkForAccount(firestore, saasAccountId, payload, baseUrl = 'https://staging.mbe-sdv.fr') {
  const workToken = await getPaytweakWorkToken(firestore, saasAccountId);
  let { amount, currency = 'EUR', reference, description, customer, devisId, groupId, quote } = payload;

  if (!quote && firestore && devisId) {
    const quoteDoc = await firestore.collection('quotes').doc(devisId).get();
    if (quoteDoc.exists) quote = { id: quoteDoc.id, ...quoteDoc.data() };
  }
  const quoteData = quote || { reference, auctionSheet: {}, lot: {} };
  const order_id = buildPaytweakOrderId(quoteData, devisId || reference, groupId);
  const nomFamille = (quoteData?.reference || reference || 'MBE').substring(0, 30);
  const numero = quoteData?.auctionSheet?.bordereauNumber || quoteData?.lot?.bordereauNumber || '';
  const salle = quoteData?.auctionSheet?.auctionHouse || quoteData?.lot?.auctionHouse || '';
  const freetext = [salle && `Salle: ${salle}`, numero && `Bordereau: ${numero}`, nomFamille && `Réf: ${nomFamille}`].filter(Boolean).join(' | ') || reference;

  const postData = new URLSearchParams({
    order_id,
    amount: String(amount),
    cur: currency,
    lng: 'FR',
    freetext: freetext || reference,
    email: customer?.email || '',
    firstname: (customer?.name || '').split(/\s+/)[0] || '',
    lastname: (customer?.name || '').split(/\s+/).slice(1).join(' ') || '',
  });

  const res = await fetch(PAYTWEAK_LINKS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Paytweak-Token': workToken,
    },
    body: postData.toString(),
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
  if (data.code && data.code !== 'OK') {
    throw new Error(data.message || `Paytweak: ${data.code}`);
  }
  const url = data?.url || data?.paymentUrl || data?.link_url || '';
  if (!url) {
    throw new Error("Pas d'URL de paiement dans la réponse Paytweak");
  }
  return {
    url,
    id: data?.order_id || data?.id || `pt-${Date.now()}`,
    order_id: data?.order_id || order_id,
  };
}
