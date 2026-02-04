/**
 * STRIPE CONNECT - OAUTH & CHECKOUT SESSIONS
 * 
 * Architecture SaaS B2B avec Stripe Connect
 * - Chaque client SaaS a son propre compte Stripe (Connected Account)
 * - OAuth Stripe pour connecter les comptes
 * - Checkout Sessions pour les paiements
 * - Webhook unique pour tous les événements
 */

import Stripe from "stripe";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { createNotification, NOTIFICATION_TYPES } from "./notifications.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Charger les variables d'environnement depuis le répertoire parent (front end/)
const envLocalPath = path.resolve(__dirname, '..', '.env.local');
const envPath = path.resolve(__dirname, '..', '.env');

// Charger .env puis .env.local (qui override .env)
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}

// Variables d'environnement requises
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_CONNECT_CLIENT_ID = process.env.STRIPE_CONNECT_CLIENT_ID;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const APP_URL = process.env.APP_URL || "http://localhost:8080";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8080";

if (!STRIPE_SECRET_KEY) {
  console.warn("[stripe-connect] ⚠️  STRIPE_SECRET_KEY non définie");
} else {
  console.log("[stripe-connect] ✅ STRIPE_SECRET_KEY chargée");
}

if (!STRIPE_CONNECT_CLIENT_ID) {
  console.warn("[stripe-connect] ⚠️  STRIPE_CONNECT_CLIENT_ID non définie");
} else {
  console.log("[stripe-connect] ✅ STRIPE_CONNECT_CLIENT_ID chargée");
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2024-12-18.acacia",
    })
  : null;

/**
 * HELPERS FIRESTORE
 */

/**
 * Ajoute un événement à l'historique d'un devis
 */
async function addTimelineEventToQuote(firestore, devisId, event) {
  try {
    const devisRef = firestore.collection("quotes").doc(devisId);
    const devisDoc = await devisRef.get();
    
    if (!devisDoc.exists) {
      console.warn(`[stripe-connect] Devis ${devisId} non trouvé pour ajout timeline`);
      return;
    }
    
    const devisData = devisDoc.data();
    const existingTimeline = devisData.timeline || [];
    
    // Éviter les doublons récents (même description dans les 5 dernières minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const isDuplicate = existingTimeline.some((e) => {
      const eventTime = e.date?.toDate ? e.date.toDate().getTime() : new Date(e.date).getTime();
      return e.description === event.description && eventTime > fiveMinutesAgo;
    });
    
    if (isDuplicate) {
      console.log(`[stripe-connect] Événement timeline dupliqué ignoré: ${event.description}`);
      return;
    }
    
    // Ajouter l'événement
    await devisRef.update({
      timeline: [...existingTimeline, event],
      updatedAt: Timestamp.now(),
    });
    
    console.log(`[stripe-connect] ✅ Événement timeline ajouté au devis ${devisId}:`, event.description);
  } catch (error) {
    console.error(`[stripe-connect] ❌ Erreur ajout timeline:`, error);
  }
}

/**
 * Récupère un client SaaS par son ID
 */
async function getClientById(firestore, clientId) {
  const doc = await firestore.collection("clients").doc(clientId).get();
  if (!doc.exists) {
    throw new Error(`Client ${clientId} non trouvé`);
  }
  return { id: doc.id, ...doc.data() };
}

/**
 * Récupère un compte SaaS par son stripeAccountId
 */
async function getSaasAccountByStripeAccountId(firestore, stripeAccountId) {
  const snapshot = await firestore
    .collection("saasAccounts")
    .where("integrations.stripe.stripeAccountId", "==", stripeAccountId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Sauvegarde le stripeAccountId dans saasAccounts/{id}/integrations/stripe
 */
async function saveStripeAccountId(firestore, saasAccountId, stripeAccountId) {
  await firestore.collection("saasAccounts").doc(saasAccountId).update({
    "integrations.stripe": {
      connected: true,
      stripeAccountId: stripeAccountId,
      connectedAt: Timestamp.now()
    }
  });
}

/**
 * Récupère un devis par son ID
 * Note: Utilise la collection "quotes" (devis existants) au lieu de "devis"
 */
async function getDevisById(firestore, devisId) {
  const doc = await firestore.collection("quotes").doc(devisId).get();
  if (!doc.exists) {
    throw new Error(`Devis ${devisId} non trouvé`);
  }
  return { id: doc.id, ...doc.data() };
}

/**
 * Crée un nouveau paiement dans Firestore
 */
async function createPaiement(firestore, paiementData) {
  const docRef = await firestore.collection("paiements").add({
    ...paiementData,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return docRef.id;
}

/**
 * Met à jour un paiement
 */
async function updatePaiement(firestore, paiementId, updates) {
  await firestore.collection("paiements").doc(paiementId).update({
    ...updates,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Récupère un paiement par son stripeSessionId
 * Recherche aussi par devisId si le sessionId ne correspond pas exactement
 */
async function getPaiementBySessionId(firestore, sessionId, devisId = null) {
  console.log(`[stripe-connect] 🔍 Recherche paiement avec sessionId: ${sessionId}${devisId ? `, devisId: ${devisId}` : ''}`);
  
  // Première tentative : recherche directe par stripeSessionId
  let snapshot = await firestore
    .collection("paiements")
    .where("stripeSessionId", "==", sessionId)
    .limit(1)
    .get();

  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    const paiement = { id: doc.id, ...doc.data() };
    console.log(`[stripe-connect] ✅ Paiement trouvé par sessionId direct: ${paiement.id}`);
    return paiement;
  }

  console.log(`[stripe-connect] ⚠️  Paiement non trouvé par sessionId direct, recherche alternative...`);

  // Recherche alternative : si devisId est fourni, chercher tous les paiements du devis
  if (devisId) {
    try {
      const paiementsByDevis = await getPaiementsByDevisId(firestore, devisId);
      console.log(`[stripe-connect] 📊 ${paiementsByDevis.length} paiement(s) trouvé(s) pour devisId: ${devisId}`);
      
      // Chercher un paiement en attente qui pourrait correspondre
      const matchingPaiement = paiementsByDevis.find(
        p => p.stripeSessionId === sessionId || 
             (p.status === 'PENDING' && !p.stripeSessionId) // Paiement créé mais sessionId pas encore sauvegardé
      );
      
      if (matchingPaiement) {
        console.log(`[stripe-connect] ✅ Paiement trouvé par recherche alternative: ${matchingPaiement.id}`);
        return matchingPaiement;
      }
      
      // Afficher tous les paiements pour déboguer
      console.log(`[stripe-connect] 📋 Paiements disponibles pour ce devis:`, paiementsByDevis.map(p => ({
        id: p.id,
        stripeSessionId: p.stripeSessionId,
        status: p.status,
        amount: p.amount,
        type: p.type,
      })));
    } catch (error) {
      console.error(`[stripe-connect] ❌ Erreur lors de la recherche alternative:`, error);
    }
  }

  return null;
}

/**
 * Récupère tous les paiements d'un devis
 */
async function getPaiementsByDevisId(firestore, devisId) {
  const snapshot = await firestore
    .collection("paiements")
    .where("devisId", "==", devisId)
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Recalcule et met à jour le statut d'un devis en fonction de ses paiements
 * Note: Utilise la collection "quotes" et met à jour paymentStatus
 */
async function updateDevisStatus(firestore, devisId) {
  const paiements = await getPaiementsByDevisId(firestore, devisId);
  
  if (paiements.length === 0) {
    return;
  }

  // Filtrer uniquement les paiements actifs (pas annulés)
  const activePaiements = paiements.filter((p) => p.status !== "CANCELLED");
  
  if (activePaiements.length === 0) {
    return;
  }

  const allPaid = activePaiements.every((p) => p.status === "PAID");
  const somePaid = activePaiements.some((p) => p.status === "PAID");
  
  // Vérifier si le paiement PRINCIPAL est payé
  const principalPayment = activePaiements.find((p) => p.type === "PRINCIPAL");
  const principalIsPaid = principalPayment && principalPayment.status === "PAID";

  let paymentStatus;
  if (allPaid) {
    paymentStatus = "paid";
  } else if (somePaid) {
    paymentStatus = "partially_paid";
  } else {
    paymentStatus = "pending";
  }

  // Mettre à jour le devis dans la collection "quotes"
  const updateData = {
    paymentStatus,
    updatedAt: Timestamp.now(),
  };

  // Si le paiement PRINCIPAL est payé, passer le devis en "awaiting_collection"
  // (même si des surcoûts ne sont pas encore payés)
  if (principalIsPaid) {
    updateData.status = "awaiting_collection";
    
    console.log(`[stripe-connect] 💰 Paiement principal payé → Status: awaiting_collection`);
    
    // Ajouter un événement à l'historique uniquement si tous les paiements sont payés
    if (allPaid) {
      await addTimelineEventToQuote(firestore, devisId, {
        id: `tl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        date: Timestamp.now(),
        status: 'awaiting_collection',
        description: 'Tous les paiements ont été reçus - En attente de récupération',
        user: 'Système Automatisé',
      });
    }
  }

  await firestore.collection("quotes").doc(devisId).update(updateData);

  console.log(`[stripe-connect] ✅ Statut du devis ${devisId} mis à jour:`, {
    paymentStatus,
    status: updateData.status || '(inchangé)',
    principalIsPaid,
    allPaid,
  });
}

/**
 * ROUTES STRIPE CONNECT
 */

/**
 * POST /api/stripe/connect
 * Génère l'URL OAuth Stripe Connect
 */
export async function handleStripeConnect(req, res) {
  try {
    if (!stripe || !STRIPE_CONNECT_CLIENT_ID) {
      return res.status(400).json({ 
        error: "Stripe Connect non configuré. Vérifiez STRIPE_SECRET_KEY et STRIPE_CONNECT_CLIENT_ID" 
      });
    }

    // Récupérer le saasAccountId depuis req (ajouté par requireAuth middleware)
    const saasAccountId = req.saasAccountId;
    
    if (!saasAccountId) {
      return res.status(400).json({ error: "Compte SaaS non configuré. Veuillez compléter la configuration MBE." });
    }

    // Générer l'URL OAuth Stripe
    const url = stripe.oauth.authorizeUrl({
      response_type: "code",
      client_id: STRIPE_CONNECT_CLIENT_ID,
      scope: "read_write",
      redirect_uri: `${APP_URL}/stripe/callback`,
      state: saasAccountId, // Passer le saasAccountId dans le state
    });

    console.log("[stripe-connect] URL OAuth générée pour saasAccountId:", saasAccountId);

    return res.json({ url });
  } catch (error) {
    console.error("[stripe-connect] Erreur génération URL OAuth:", error);
    return res.status(500).json({ 
      error: "Erreur lors de la génération de l'URL OAuth",
      details: error.message 
    });
  }
}

/**
 * GET /stripe/callback
 * Callback OAuth Stripe Connect
 */
export async function handleStripeCallback(req, res, firestore) {
  try {
    if (!stripe) {
      return res.status(400).send("Stripe non configuré");
    }

    const { code, state: saasAccountId } = req.query;

    if (!code) {
      return res.redirect(`${FRONTEND_URL}/settings?error=no_code&source=stripe`);
    }

    if (!saasAccountId) {
      return res.redirect(`${FRONTEND_URL}/settings?error=no_saas_account_id&source=stripe`);
    }

    // Échanger le code contre un access token
    const response = await stripe.oauth.token({
      grant_type: "authorization_code",
      code,
    });

    const stripeAccountId = response.stripe_user_id;

    if (!stripeAccountId) {
      return res.redirect(`${FRONTEND_URL}/settings?error=no_stripe_account_id&source=stripe`);
    }

    // Vérifier que le saasAccount existe
    if (!firestore) {
      return res.redirect(`${FRONTEND_URL}/settings?error=firestore_not_configured&source=stripe`);
    }

    const saasAccountRef = firestore.collection('saasAccounts').doc(saasAccountId);
    const saasAccountDoc = await saasAccountRef.get();
    
    if (!saasAccountDoc.exists) {
      console.error('[stripe-connect] ❌ Compte SaaS non trouvé:', saasAccountId);
      return res.redirect(`${FRONTEND_URL}/settings?error=saas_account_not_found&source=stripe`);
    }

    // Sauvegarder dans saasAccounts/{id}/integrations/stripe
    await saveStripeAccountId(firestore, saasAccountId, stripeAccountId);
    console.log(`[stripe-connect] ✅ Compte Stripe connecté pour saasAccountId ${saasAccountId}:`, stripeAccountId);

    return res.redirect(`${FRONTEND_URL}/settings?connected=true&source=stripe`);
  } catch (error) {
    console.error("[stripe-connect] Erreur callback OAuth:", error);
    return res.redirect(`${FRONTEND_URL}/settings?error=${encodeURIComponent(error.message)}&source=stripe`);
  }
}

/**
 * POST /api/devis/:id/paiement
 * Crée un paiement Stripe Checkout pour un devis
 */
export async function handleCreatePaiement(req, res, firestore) {
  try {
    console.log("[stripe-connect] 📥 Création de paiement demandée");
    
    if (!stripe) {
      console.error("[stripe-connect] ❌ Stripe non configuré");
      return res.status(400).json({ error: "Stripe non configuré" });
    }

    if (!firestore) {
      console.error("[stripe-connect] ❌ Firestore non initialisé");
      return res.status(500).json({ error: "Firestore non initialisé" });
    }

    const { id: devisId } = req.params;
    const { amount, type = "PRINCIPAL", description } = req.body;

    console.log("[stripe-connect] Paramètres reçus:", { devisId, amount, type, description });

    // Validation
    if (!amount || amount <= 0) {
      console.error("[stripe-connect] ❌ Montant invalide:", amount);
      return res.status(400).json({ error: "Montant invalide" });
    }

    if (!["PRINCIPAL", "SURCOUT"].includes(type)) {
      console.error("[stripe-connect] ❌ Type invalide:", type);
      return res.status(400).json({ error: "Type invalide (PRINCIPAL ou SURCOUT)" });
    }

    // Récupérer le devis (collection "quotes")
    console.log("[stripe-connect] Recherche du devis:", devisId);
    const devis = await getDevisById(firestore, devisId);
    console.log("[stripe-connect] ✅ Devis trouvé:", { id: devis.id, reference: devis.reference });

    // Utiliser le saasAccountId du devis ou celui de la requête
    const saasAccountId = devis.saasAccountId || req.saasAccountId;
    
    if (!saasAccountId) {
      console.error("[stripe-connect] ❌ Aucun saasAccountId trouvé");
      return res.status(400).json({ 
        error: "Compte SaaS non configuré. Veuillez compléter la configuration MBE." 
      });
    }

    console.log("[stripe-connect] saasAccountId:", saasAccountId);

    // Récupérer le compte SaaS
    const saasAccountRef = firestore.collection("saasAccounts").doc(saasAccountId);
    const saasAccountDoc = await saasAccountRef.get();
    
    if (!saasAccountDoc.exists) {
      console.error("[stripe-connect] ❌ Compte SaaS non trouvé:", saasAccountId);
      return res.status(404).json({ 
        error: "Compte SaaS non trouvé" 
      });
    }

    const saasAccount = saasAccountDoc.data();
    const stripeIntegration = saasAccount.integrations?.stripe;

    if (!stripeIntegration || !stripeIntegration.connected || !stripeIntegration.stripeAccountId) {
      console.error("[stripe-connect] ❌ Compte SaaS sans Stripe connecté:", saasAccountId);
      return res.status(400).json({ 
        error: "Votre compte Stripe n'est pas connecté. Allez dans Paramètres → Paiements pour connecter votre compte." 
      });
    }

    const stripeAccountId = stripeIntegration.stripeAccountId;
    console.log("[stripe-connect] ✅ Compte Stripe trouvé:", stripeAccountId);

    // Créer la Checkout Session
    let session;
    try {
      session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "eur",
                product_data: {
                  name: description || `Devis ${devis.reference || devisId} - ${type}`,
                },
                unit_amount: Math.round(amount * 100), // en centimes
              },
              quantity: 1,
            },
          ],
          success_url: `${APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${APP_URL}/payment/cancel`,
          metadata: {
            devisId,
            paiementType: type,
            saasAccountId: saasAccountId, // Utiliser saasAccountId au lieu de clientSaasId
          },
        },
        {
          stripeAccount: stripeAccountId, // CRUCIAL: paiement sur le compte connecté
        }
      );
    } catch (stripeError) {
      console.error("[stripe-connect] ❌ Erreur Stripe Checkout:", stripeError.message);
      
      // Message d'erreur spécifique pour le nom d'entreprise manquant
      if (stripeError.message && stripeError.message.includes("account or business name")) {
        return res.status(400).json({
          error: "Configuration Stripe incomplète",
          message: "⚠️ Votre compte Stripe connecté doit avoir un nom d'entreprise configuré.",
          action: "1. Allez sur https://dashboard.stripe.com/settings/account\n2. Remplissez le champ 'Business name' (ou 'Nom de l'entreprise')\n3. Sauvegardez et réessayez",
          stripeAccountId: stripeAccountId,
        });
      }
      
      // Autres erreurs Stripe
      return res.status(400).json({
        error: "Erreur Stripe",
        message: stripeError.message,
        details: stripeError.raw?.message || stripeError.message,
      });
    }

    // Sauvegarder le paiement dans Firestore
    // Ne pas inclure description si elle est undefined (Firestore n'accepte pas undefined)
    const paiementData = {
      devisId,
      saasAccountId: saasAccountId,
      stripeAccountId: stripeAccountId,
      stripeSessionId: session.id,
      stripeCheckoutUrl: session.url, // URL du Checkout Stripe
      amount,
      type,
      status: "PENDING",
    };
    
    // Ajouter description seulement si elle est définie
    if (description) {
      paiementData.description = description;
    }
    
    const paiementId = await createPaiement(firestore, paiementData);

    console.log(`[stripe-connect] ✅ Checkout Session créée:`, {
      paiementId,
      sessionId: session.id,
      devisId,
      amount,
      type,
    });

    // Ajouter un événement à l'historique du devis
    await addTimelineEventToQuote(firestore, devisId, {
      id: `tl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      date: Timestamp.now(),
      status: devis.status || 'awaiting_payment',
      description: type === 'PRINCIPAL' 
        ? `Lien de paiement principal généré (${amount.toFixed(2)}€)`
        : `Lien de paiement pour surcoût généré (${amount.toFixed(2)}€)`,
      user: 'Système',
    });

    // Ajouter le lien de paiement au champ paymentLinks du devis
    const devisRef = firestore.collection("quotes").doc(devisId);
    const devisDoc = await devisRef.get();
    const existingPaymentLinks = devisDoc.data()?.paymentLinks || [];
    
    const newPaymentLink = {
      id: paiementId,
      url: session.url,
      amount: amount,
      type: type,
      status: 'pending', // 'pending' car pas encore payé
      createdAt: Timestamp.now(),
      stripeSessionId: session.id,
    };
    
    await devisRef.update({
      paymentLinks: [...existingPaymentLinks, newPaymentLink],
      status: type === 'PRINCIPAL' ? 'awaiting_payment' : devisDoc.data()?.status,
      updatedAt: Timestamp.now(),
    });
    
    console.log(`[stripe-connect] ✅ Lien de paiement ajouté au devis:`, {
      devisId,
      paiementId,
      url: session.url,
      status: 'pending',
    });

    return res.json({
      url: session.url,
      sessionId: session.id,
      paiementId,
    });
  } catch (error) {
    console.error("[stripe-connect] Erreur création paiement:", error);
    
    if (error.message && error.message.includes("non trouvé")) {
      return res.status(404).json({ error: error.message });
    }
    
    return res.status(500).json({ 
      error: "Erreur lors de la création du paiement",
      details: error.message 
    });
  }
}

/**
 * GET /api/devis/:id/paiements
 * Récupère tous les paiements d'un devis
 */
export async function handleGetPaiements(req, res, firestore) {
  try {
    console.log("[stripe-connect] 📥 Récupération des paiements demandée");
    
    if (!firestore) {
      console.error("[stripe-connect] ❌ Firestore non initialisé");
      return res.status(500).json({ error: "Firestore non initialisé" });
    }

    const { id: devisId } = req.params;
    console.log("[stripe-connect] Devis ID:", devisId);

    const paiements = await getPaiementsByDevisId(firestore, devisId);
    console.log("[stripe-connect] ✅ Paiements trouvés:", paiements.length);

    // Formater les dates pour le frontend
    const formatted = paiements.map((p) => ({
      ...p,
      createdAt: p.createdAt?.toDate?.() || p.createdAt,
      updatedAt: p.updatedAt?.toDate?.() || p.updatedAt,
      paidAt: p.paidAt?.toDate?.() || p.paidAt,
    }));

    return res.json(formatted);
  } catch (error) {
    console.error("[stripe-connect] ❌ Erreur récupération paiements:", error);
    
    // Erreur d'index Firestore manquant
    if (error.message && error.message.includes("requires an index")) {
      const indexUrl = error.details || error.message.match(/https:\/\/[^\s]+/)?.[0];
      return res.status(500).json({ 
        error: "Index Firestore manquant",
        message: "⚠️ Vous devez créer un index dans Firestore pour pouvoir lister les paiements.",
        action: indexUrl 
          ? `Cliquez sur ce lien pour créer l'index automatiquement : ${indexUrl}`
          : "Créez l'index Firestore pour la collection 'paiements'.",
        indexUrl: indexUrl,
      });
    }
    
    return res.status(500).json({ 
      error: "Erreur lors de la récupération des paiements",
      details: error.message 
    });
  }
}

/**
 * POST /api/paiement/:id/cancel
 * Annule un paiement
 */
export async function handleCancelPaiement(req, res, firestore) {
  try {
    console.log("[stripe-connect] 📥 Annulation de paiement demandée");
    
    if (!firestore) {
      console.error("[stripe-connect] ❌ Firestore non initialisé");
      return res.status(500).json({ error: "Firestore non initialisé" });
    }

    const { id: paiementId } = req.params;
    console.log("[stripe-connect] Paiement ID:", paiementId);

    // Vérifier que le paiement existe
    const paiementRef = firestore.collection("paiements").doc(paiementId);
    const paiementSnap = await paiementRef.get();

    if (!paiementSnap.exists) {
      return res.status(404).json({ error: "Paiement non trouvé" });
    }

    const paiement = paiementSnap.data();
    
    // Vérifier que le paiement est en attente
    if (paiement.status !== 'PENDING') {
      return res.status(400).json({ 
        error: "Seuls les paiements en attente peuvent être annulés",
        currentStatus: paiement.status 
      });
    }

    // Marquer le paiement comme CANCELLED
    await paiementRef.update({
      status: 'CANCELLED',
      updatedAt: Timestamp.now(),
    });

    console.log("[stripe-connect] ✅ Paiement annulé:", paiementId);

    // Ajouter un événement à l'historique du devis
    if (paiement.devisId) {
      await addTimelineEventToQuote(firestore, paiement.devisId, {
        id: `tl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        date: Timestamp.now(),
        status: 'awaiting_payment',
        description: `Lien de paiement annulé (${paiement.amount.toFixed(2)}€) - ${paiement.type === 'PRINCIPAL' ? 'Principal' : 'Surcoût'}`,
        user: 'Système',
      });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("[stripe-connect] ❌ Erreur annulation paiement:", error);
    return res.status(500).json({ 
      error: "Erreur lors de l'annulation du paiement",
      details: error.message 
    });
  }
}

/**
 * POST /webhooks/stripe
 * Webhook Stripe UNIQUE pour tous les comptes connectés
 */
export async function handleStripeWebhook(req, res, firestore) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(400).send("Stripe webhook non configuré");
  }

  let event;

  // Si l'event est déjà construit (venant de ai-proxy.js), l'utiliser directement
  if (req.stripeEvent) {
    event = req.stripeEvent;
    console.log("[stripe-connect] 📨 Utilisation de l'event pré-construit depuis ai-proxy");
  } else {
    // Sinon, construire l'event à partir de la signature
    const sig = req.headers["stripe-signature"];
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("[stripe-connect] ⚠️  Webhook signature invalide:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }

  try {
    // IMPORTANT: event.account contient le stripeAccountId du compte connecté
    const stripeAccountId = event.account;
    const obj = event.data.object;

    console.log(`[stripe-connect] 📨 Webhook reçu:`, {
      type: event.type,
      account: stripeAccountId,
      sessionId: obj.id,
    });

    // Traiter uniquement les événements de paiement
    if (event.type === "checkout.session.completed") {
      const session = obj;
      const { devisId, paiementType, saasAccountId, groupId, type } = session.metadata || {};

      console.log(`[stripe-connect] 🔍 Checkout Session Completed:`, {
        sessionId: session.id,
        devisId,
        groupId,
        type,
        paiementType,
        saasAccountId,
        metadata: session.metadata,
      });

      // Gérer les paiements de groupe
      if (type === "GROUP_PAYMENT" && groupId) {
        console.log(`[stripe-connect] 📦 Traitement paiement groupé: ${groupId}`);
        
        if (firestore && saasAccountId) {
          // Vérifier que le saasAccountId correspond au compte Stripe
          const saasAccountRef = firestore.collection('saasAccounts').doc(saasAccountId);
          const saasAccountDoc = await saasAccountRef.get();
          
          if (!saasAccountDoc.exists) {
            console.warn(`[stripe-connect] ⚠️  Compte SaaS non trouvé: ${saasAccountId}`);
            return res.status(200).send("ok");
          }
          
          const saasAccount = saasAccountDoc.data();
          const stripeIntegration = saasAccount.integrations?.stripe;
          
          if (!stripeIntegration || stripeIntegration.stripeAccountId !== stripeAccountId) {
            console.warn(`[stripe-connect] ⚠️  Mismatch Stripe Account: ${stripeIntegration?.stripeAccountId} !== ${stripeAccountId}`);
            return res.status(200).send("ok");
          }

          // Récupérer le paiement
          const paiement = await getPaiementBySessionId(firestore, session.id);
          
          if (!paiement) {
            console.error(`[stripe-connect] ❌ Paiement groupé non trouvé pour session: ${session.id}`);
            return res.status(200).send("ok");
          }

          console.log(`[stripe-connect] ✅ Paiement groupé trouvé: ${paiement.id}`);

          // Mettre à jour le paiement
          await updatePaiement(firestore, paiement.id, {
            status: "PAID",
            paidAt: Timestamp.now(),
            stripePaymentIntentId: session.payment_intent,
          });

          // Mettre à jour le statut du groupe
          await firestore.collection("shipmentGroups").doc(groupId).update({
            status: "paid",
            paidAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });

          console.log(`[stripe-connect] ✅ Groupe ${groupId} marqué comme PAID`);

          // Mettre à jour tous les devis du groupe
          const devisIds = paiement.devisIds || [];
          for (const devisId of devisIds) {
            await updateDevisStatus(firestore, devisId);
            
            // Ajouter un événement à l'historique
            await addTimelineEventToQuote(firestore, devisId, {
              id: `tl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              date: Timestamp.now(),
              status: 'awaiting_collection',
              description: `Paiement groupé reçu (Groupe: ${groupId})`,
              user: 'Stripe Webhook',
            });
          }

          // Créer une notification
          await createNotification(firestore, {
            clientSaasId: saasAccountId, // Utiliser saasAccountId comme clientSaasId
            type: NOTIFICATION_TYPES.PAYMENT_RECEIVED,
            title: 'Paiement groupé reçu',
            message: `Le groupement ${groupId} a été payé (${devisIds.length} devis)`,
          });

          console.log(`[stripe-connect] ✅ ${devisIds.length} devis mis à jour pour le groupe ${groupId}`);
        }

        return res.status(200).send("ok");
      }

      // Gérer les paiements individuels
      if (!devisId) {
        console.warn("[stripe-connect] ⚠️  Pas de devisId dans les metadata");
        return res.status(200).send("ok");
      }

      // Vérifier que le compte Stripe correspond au saasAccountId
      if (firestore && saasAccountId) {
        const saasAccountRef = firestore.collection('saasAccounts').doc(saasAccountId);
        const saasAccountDoc = await saasAccountRef.get();
        
        if (!saasAccountDoc.exists) {
          console.warn(`[stripe-connect] ⚠️  Compte SaaS non trouvé: ${saasAccountId}`);
          return res.status(200).send("ok");
        }
        
        const saasAccount = saasAccountDoc.data();
        const stripeIntegration = saasAccount.integrations?.stripe;
        
        if (!stripeIntegration || stripeIntegration.stripeAccountId !== stripeAccountId) {
          console.warn(`[stripe-connect] ⚠️  Mismatch Stripe Account pour saasAccountId ${saasAccountId}`);
          return res.status(200).send("ok");
        }

        console.log(`[stripe-connect] ✅ Compte SaaS trouvé: ${saasAccountId} (${saasAccount.commercialName})`);

        // Récupérer le paiement
        console.log(`[stripe-connect] 🔍 Recherche du paiement avec sessionId: ${session.id}`);
        console.log(`[stripe-connect] 📋 Métadonnées de la session:`, {
          devisId: devisId,
          saasAccountId: saasAccountId,
          paiementType: paiementType,
          sessionId: session.id,
          paymentIntent: session.payment_intent,
          amountTotal: session.amount_total,
          currency: session.currency,
        });
        
        const paiement = await getPaiementBySessionId(firestore, session.id, devisId);

        if (!paiement) {
          console.error(`[stripe-connect] ❌ Paiement non trouvé pour session: ${session.id}`);
          console.error(`[stripe-connect] 💡 Tentative de recherche alternative par devisId: ${devisId}`);
          
          // Essayer de trouver le paiement par devisId et statut PENDING
          if (devisId) {
            try {
              const paiementsByDevis = await getPaiementsByDevisId(firestore, devisId);
              console.log(`[stripe-connect] 📊 Paiements trouvés pour ce devis:`, paiementsByDevis.length);
              
              // Chercher un paiement avec le même sessionId ou en attente
              const matchingPaiement = paiementsByDevis.find(
                p => p.stripeSessionId === session.id || 
                     (p.status === 'PENDING' && p.amount === (session.amount_total / 100))
              );
              
              if (matchingPaiement) {
                console.log(`[stripe-connect] ✅ Paiement trouvé par recherche alternative:`, matchingPaiement.id);
                // Utiliser ce paiement trouvé
                const paiementId = matchingPaiement.id;
                await updatePaiement(firestore, paiementId, {
                  status: "PAID",
                  paidAt: Timestamp.now(),
                  stripePaymentIntentId: session.payment_intent,
                  stripeSessionId: session.id, // S'assurer que le sessionId est bien sauvegardé
                });
                
                console.log(`[stripe-connect] ✅ Paiement ${paiementId} mis à jour avec status PAID`);
                
                // Continuer avec le traitement normal
                const updatedPaiement = { ...matchingPaiement, status: "PAID", stripeSessionId: session.id };
                
                // Récupérer le devis pour déterminer le bon statut
                const devisRef = firestore.collection("quotes").doc(devisId);
                const devisDoc = await devisRef.get();
                const currentStatus = devisDoc.exists ? devisDoc.data().status : 'awaiting_payment';
                const timelineStatus = updatedPaiement.type === 'PRINCIPAL' ? 'awaiting_collection' : currentStatus;

                // Ajouter un événement à l'historique du devis
                await addTimelineEventToQuote(firestore, devisId, {
                  id: `tl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                  date: Timestamp.now(),
                  status: timelineStatus,
                  description: updatedPaiement.type === 'PRINCIPAL'
                    ? `Paiement principal reçu (${updatedPaiement.amount.toFixed(2)}€)`
                    : `Paiement de surcoût reçu (${updatedPaiement.amount.toFixed(2)}€)`,
                  user: 'Stripe Webhook',
                });

                // Créer une notification
                const devis = devisDoc.data();
                await createNotification(firestore, {
                  clientSaasId: saasAccountId,
                  devisId: devisId,
                  type: updatedPaiement.type === 'PRINCIPAL' 
                    ? NOTIFICATION_TYPES.PAYMENT_RECEIVED 
                    : NOTIFICATION_TYPES.SURCOUT_CREATED,
                  title: updatedPaiement.type === 'PRINCIPAL' 
                    ? 'Paiement reçu' 
                    : 'Paiement de surcoût reçu',
                  message: `Le devis ${devis.reference || devisId} a été payé (${updatedPaiement.amount.toFixed(2)}€)`,
                });

                // Recalculer le statut du devis
                await updateDevisStatus(firestore, devisId);
                console.log(`[stripe-connect] ✅ Statut du devis ${devisId} mis à jour`);
                
                return res.status(200).send("ok");
              } else {
                console.error(`[stripe-connect] ❌ Aucun paiement correspondant trouvé pour devisId: ${devisId}`);
                console.error(`[stripe-connect] 📋 Paiements disponibles:`, paiementsByDevis.map(p => ({
                  id: p.id,
                  stripeSessionId: p.stripeSessionId,
                  status: p.status,
                  amount: p.amount,
                })));
              }
            } catch (searchError) {
              console.error(`[stripe-connect] ❌ Erreur lors de la recherche alternative:`, searchError);
            }
          }
          
          console.error(`[stripe-connect] 💡 Vérifiez que le paiement existe dans Firestore avec ce stripeSessionId`);
          return res.status(200).send("ok");
        }

        console.log(`[stripe-connect] ✅ Paiement trouvé: ${paiement.id}`, {
          currentStatus: paiement.status,
          amount: paiement.amount,
          devisId: paiement.devisId,
        });

        // Mettre à jour le paiement
        console.log(`[stripe-connect] 🔄 Mise à jour du paiement ${paiement.id}...`);
        await updatePaiement(firestore, paiement.id, {
          status: "PAID",
          paidAt: Timestamp.now(),
          stripePaymentIntentId: session.payment_intent,
          stripeSessionId: session.id, // S'assurer que le sessionId est bien sauvegardé
        });

        console.log(`[stripe-connect] ✅ Paiement ${paiement.id} marqué comme PAID`, {
          paiementId: paiement.id,
          devisId: devisId,
          amount: paiement.amount,
          type: paiement.type,
          status: "PAID",
          stripeSessionId: session.id,
        });
        
        // Vérifier que la mise à jour a bien été effectuée en récupérant directement le document
        try {
          const paiementDoc = await firestore.collection("paiements").doc(paiement.id).get();
          if (paiementDoc.exists) {
            const updatedData = paiementDoc.data();
            if (updatedData.status === "PAID") {
              console.log(`[stripe-connect] ✅ Vérification: Paiement ${paiement.id} bien mis à jour avec status PAID`);
              console.log(`[stripe-connect] 📊 Données du paiement mis à jour:`, {
                id: paiement.id,
                status: updatedData.status,
                paidAt: updatedData.paidAt?.toDate?.() || updatedData.paidAt,
                stripeSessionId: updatedData.stripeSessionId,
                amount: updatedData.amount,
              });
            } else {
              console.error(`[stripe-connect] ❌ ERREUR: Paiement ${paiement.id} n'a pas été mis à jour correctement. Status actuel: ${updatedData.status}`);
            }
          } else {
            console.error(`[stripe-connect] ❌ ERREUR: Document paiement ${paiement.id} n'existe plus`);
          }
        } catch (verifyError) {
          console.error(`[stripe-connect] ❌ Erreur lors de la vérification:`, verifyError);
        }

        // Récupérer le devis pour déterminer le bon statut
        const devisRef = firestore.collection("quotes").doc(devisId);
        const devisDoc = await devisRef.get();
        const currentStatus = devisDoc.exists ? devisDoc.data().status : 'awaiting_payment';
        
        // Déterminer le statut pour l'événement timeline
        // Si c'est le paiement principal, le statut passera à awaiting_collection
        const timelineStatus = paiement.type === 'PRINCIPAL' ? 'awaiting_collection' : currentStatus;

        // Ajouter un événement à l'historique du devis
        await addTimelineEventToQuote(firestore, devisId, {
          id: `tl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          date: Timestamp.now(),
          status: timelineStatus,
          description: paiement.type === 'PRINCIPAL'
            ? `Paiement principal reçu (${paiement.amount.toFixed(2)}€)`
            : `Paiement de surcoût reçu (${paiement.amount.toFixed(2)}€)`,
          user: 'Stripe Webhook',
        });

        // Créer une notification pour le client
        const devis = devisDoc.data();
        await createNotification(firestore, {
          clientSaasId: saasAccountId,
          devisId: devisId,
          type: paiement.type === 'PRINCIPAL' 
            ? NOTIFICATION_TYPES.PAYMENT_RECEIVED 
            : NOTIFICATION_TYPES.SURCOUT_CREATED,
          title: paiement.type === 'PRINCIPAL' 
            ? 'Paiement reçu' 
            : 'Paiement de surcoût reçu',
          message: `Le devis ${devis.reference || devisId} a été payé (${paiement.amount.toFixed(2)}€)`,
        });

        console.log(`[stripe-connect] 🔔 Notification créée pour paiement ${paiement.type}`);

        // Recalculer le statut du devis (va passer à awaiting_collection si paiement principal)
        await updateDevisStatus(firestore, devisId);
        console.log(`[stripe-connect] ✅ Statut du devis ${devisId} mis à jour`);
      }
    }

    return res.status(200).send("ok");
  } catch (err) {
    console.error("[stripe-connect] ❌ Erreur traitement webhook:", err);
    return res.status(500).send("Webhook handler error");
  }
}

/**
 * GET /api/stripe/status
 * Vérifie le statut de connexion Stripe d'un client
 */
export async function handleStripeStatus(req, res, firestore) {
  try {
    if (!firestore) {
      return res.status(500).json({ error: "Firestore non initialisé" });
    }

    const saasAccountId = req.saasAccountId;
    
    if (!saasAccountId) {
      return res.status(400).json({ error: "Compte SaaS non configuré" });
    }

    const saasAccountRef = firestore.collection('saasAccounts').doc(saasAccountId);
    const saasAccountDoc = await saasAccountRef.get();
    
    if (!saasAccountDoc.exists) {
      return res.status(404).json({ error: "Compte SaaS non trouvé" });
    }

    const saasAccount = saasAccountDoc.data();
    const stripeIntegration = saasAccount.integrations?.stripe;

    return res.json({
      connected: Boolean(stripeIntegration?.connected && stripeIntegration?.stripeAccountId),
      stripeAccountId: stripeIntegration?.stripeAccountId || null,
      connectedAt: stripeIntegration?.connectedAt?.toDate?.() || null,
    });
  } catch (error) {
    console.error("[stripe-connect] Erreur vérification statut:", error);
    
    if (error.message && error.message.includes("non trouvé")) {
      return res.status(404).json({ error: error.message });
    }
    
    return res.status(500).json({ 
      error: "Erreur lors de la vérification du statut",
      details: error.message 
    });
  }
}

/**
 * POST /api/stripe/disconnect
 * Déconnecte un compte Stripe
 */
export async function handleStripeDisconnect(req, res, firestore) {
  try {
    if (!stripe) {
      return res.status(400).json({ error: "Stripe non configuré" });
    }

    if (!firestore) {
      return res.status(500).json({ error: "Firestore non initialisé" });
    }

    const saasAccountId = req.saasAccountId;
    
    if (!saasAccountId) {
      return res.status(400).json({ error: "Compte SaaS non configuré" });
    }

    const saasAccountRef = firestore.collection('saasAccounts').doc(saasAccountId);
    const saasAccountDoc = await saasAccountRef.get();
    
    if (!saasAccountDoc.exists) {
      return res.status(404).json({ error: "Compte SaaS non trouvé" });
    }

    const saasAccount = saasAccountDoc.data();
    const stripeIntegration = saasAccount.integrations?.stripe;

    if (!stripeIntegration || !stripeIntegration.stripeAccountId) {
      return res.status(400).json({ error: "Aucun compte Stripe connecté" });
    }

    // Révoquer l'accès OAuth (optionnel mais recommandé)
    try {
      await stripe.oauth.deauthorize({
        client_id: STRIPE_CONNECT_CLIENT_ID,
        stripe_user_id: stripeIntegration.stripeAccountId,
      });
    } catch (err) {
      console.warn("[stripe-connect] ⚠️  Erreur révocation OAuth:", err.message);
      // Continue quand même
    }

    // Supprimer l'intégration Stripe
    await saasAccountRef.update({
      'integrations.stripe': FieldValue.delete()
    });

    console.log(`[stripe-connect] ✅ Compte Stripe déconnecté pour saasAccountId ${saasAccountId}`);

    return res.json({ success: true });
  } catch (error) {
    console.error("[stripe-connect] Erreur déconnexion:", error);
    
    if (error.message && error.message.includes("non trouvé")) {
      return res.status(404).json({ error: error.message });
    }
    
    return res.status(500).json({ 
      error: "Erreur lors de la déconnexion",
      details: error.message 
    });
  }
}

/**
 * Créer un paiement pour un groupement d'expédition
 * 
 * POST /api/shipment-groups/:id/paiement
 */
export async function handleCreateGroupPaiement(req, res, firestore) {
  try {
    console.log("[stripe-connect] 📥 Création de paiement groupé demandée");
    
    if (!stripe) {
      console.error("[stripe-connect] ❌ Stripe non configuré");
      return res.status(400).json({ error: "Stripe non configuré" });
    }

    if (!firestore) {
      console.error("[stripe-connect] ❌ Firestore non initialisé");
      return res.status(500).json({ error: "Firestore non initialisé" });
    }

    const { id: groupId } = req.params;
    const { description } = req.body;

    console.log("[stripe-connect] Paramètres reçus:", { groupId, description });

    // Récupérer le groupe d'expédition
    console.log("[stripe-connect] Recherche du groupe:", groupId);
    const groupDoc = await firestore.collection("shipmentGroups").doc(groupId).get();
    
    if (!groupDoc.exists) {
      console.error("[stripe-connect] ❌ Groupe non trouvé:", groupId);
      return res.status(404).json({ error: "Groupe d'expédition non trouvé" });
    }

    const group = { id: groupDoc.id, ...groupDoc.data() };
    console.log("[stripe-connect] ✅ Groupe trouvé:", { 
      id: group.id, 
      devisCount: group.devisIds.length,
      shippingCost: group.shippingCost 
    });

    // Vérifier que le groupe n'est pas déjà payé
    if (group.status === "paid") {
      console.error("[stripe-connect] ❌ Groupe déjà payé:", groupId);
      return res.status(400).json({ error: "Ce groupement a déjà été payé" });
    }

    // Récupérer tous les devis du groupe
    const devisPromises = group.devisIds.map(id => 
      firestore.collection("quotes").doc(id).get()
    );
    const devisDocs = await Promise.all(devisPromises);
    const devisList = devisDocs
      .filter(doc => doc.exists)
      .map(doc => ({ id: doc.id, ...doc.data() }));

    if (devisList.length === 0) {
      console.error("[stripe-connect] ❌ Aucun devis trouvé dans le groupe");
      return res.status(404).json({ error: "Aucun devis trouvé dans le groupe" });
    }

    console.log("[stripe-connect] ✅ ${devisList.length} devis récupérés");

    // Calculer le montant total (somme des montants de tous les devis)
    const totalAmount = devisList.reduce((sum, devis) => {
      const amount = devis.totalAmount || 0;
      return sum + amount;
    }, 0);

    console.log("[stripe-connect] Montant total calculé:", totalAmount);

    if (totalAmount <= 0) {
      console.error("[stripe-connect] ❌ Montant total invalide:", totalAmount);
      return res.status(400).json({ error: "Montant total invalide" });
    }

    // Récupérer le client SaaS (utiliser le premier devis)
    const firstDevis = devisList[0];
    let clientSaasId = group.saasAccountId || firstDevis.clientSaasId || process.env.DEFAULT_CLIENT_ID;
    console.log("[stripe-connect] Client SaaS:", clientSaasId);

    // Récupérer le client SaaS
    let client;
    try {
      client = await getClientById(firestore, clientSaasId);
      console.log("[stripe-connect] ✅ Client récupéré:", { 
        id: client.id, 
        name: client.name, 
        stripeConnected: client.stripeConnected 
      });
    } catch (error) {
      console.error("[stripe-connect] ❌ Erreur récupération client:", error.message);
      return res.status(404).json({ 
        error: `Client ${clientSaasId} non trouvé` 
      });
    }

    if (!client.stripeAccountId) {
      console.error("[stripe-connect] ❌ Client sans compte Stripe:", client.id);
      return res.status(400).json({ 
        error: "Ce client n'a pas connecté son compte Stripe" 
      });
    }

    console.log("[stripe-connect] ✅ Compte Stripe trouvé:", client.stripeAccountId);

    // Créer les line items pour chaque devis
    const lineItems = devisList.map(devis => ({
      price_data: {
        currency: "eur",
        product_data: {
          name: `${devis.reference || devis.id} - ${devis.clientName || 'Client'}`,
          description: `Lot ${devis.lotNumber || ''} - ${devis.lotDescription || ''}`.slice(0, 100),
        },
        unit_amount: Math.round((devis.totalAmount || 0) * 100), // en centimes
      },
      quantity: 1,
    }));

    // Ajouter une ligne pour les frais d'expédition groupée
    if (group.shippingCost && group.shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: "eur",
          product_data: {
            name: "Expédition groupée",
            description: `${group.devisIds.length} devis expédiés ensemble`,
          },
          unit_amount: Math.round(group.shippingCost * 100), // en centimes
        },
        quantity: 1,
      });
    }

    // Créer la Checkout Session
    let session;
    try {
      session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          line_items: lineItems,
          success_url: `${APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}&group_id=${groupId}`,
          cancel_url: `${APP_URL}/payment/cancel?group_id=${groupId}`,
          metadata: {
            groupId: groupId,
            devisIds: group.devisIds.join(","),
            type: "GROUP_PAYMENT",
            clientSaasId: clientSaasId,
          },
        },
        {
          stripeAccount: client.stripeAccountId,
        }
      );

      console.log("[stripe-connect] ✅ Checkout Session créée:", session.id);
    } catch (error) {
      console.error("[stripe-connect] ❌ Erreur Stripe Checkout:", error.message);
      return res.status(500).json({ 
        error: "Erreur lors de la création du paiement",
        details: error.message 
      });
    }

    // Sauvegarder le paiement dans Firestore
    const paiementData = {
      groupId: groupId,
      devisIds: group.devisIds,
      clientSaasId: clientSaasId,
      stripeSessionId: session.id,
      stripeCheckoutUrl: session.url,
      amount: totalAmount + (group.shippingCost || 0),
      type: "GROUP",
      status: "PENDING",
      createdAt: Timestamp.now(),
    };

    if (description) {
      paiementData.description = description;
    }

    const paiementRef = await firestore.collection("paiements").add(paiementData);
    console.log("[stripe-connect] ✅ Paiement sauvegardé:", paiementRef.id);

    // Mettre à jour le statut du groupe
    await firestore.collection("shipmentGroups").doc(groupId).update({
      status: "validated",
      updatedAt: Timestamp.now(),
    });

    // Créer une notification pour le client
    await createNotification(firestore, {
      clientSaasId: clientSaasId,
      type: NOTIFICATION_TYPES.DEVIS_SENT, // Réutiliser ce type pour l'instant
      title: "Lien de paiement groupé créé",
      message: `Un lien de paiement a été créé pour le groupement ${groupId} (${group.devisIds.length} devis)`,
    });

    return res.json({
      success: true,
      paiementId: paiementRef.id,
      checkoutUrl: session.url,
      sessionId: session.id,
      amount: paiementData.amount,
    });
  } catch (error) {
    console.error("[stripe-connect] Erreur création paiement groupé:", error);
    return res.status(500).json({ 
      error: "Erreur lors de la création du paiement groupé",
      details: error.message 
    });
  }
}

export { stripe };

