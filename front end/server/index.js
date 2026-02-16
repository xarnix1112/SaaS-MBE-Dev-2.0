import dotenv from "dotenv";
import express from "express";
import path from "path";
import Stripe from "stripe";
import { fileURLToPath } from "url";
import fs from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  handleStripeConnect,
  handleStripeCallback,
  handleCreatePaiement,
  handleGetPaiements,
  handleStripeWebhook,
  handleStripeStatus,
  handleStripeDisconnect,
} from "./stripe-connect.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Charger les variables d'environnement
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

// Fallback local (ignoré par git) pour la clé Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  try {
    const p = path.join(__dirname, ".stripe_secret_key");
    if (fs.existsSync(p)) {
      const key = fs.readFileSync(p, "utf8").trim();
      if (key) process.env.STRIPE_SECRET_KEY = key;
    }
  } catch (_e) {
    // ignore
  }
}

const app = express();

// Le webhook Stripe a besoin du raw body, on ajoute un parser dédié uniquement pour cette route
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }));
app.post("/webhooks/stripe", express.raw({ type: "application/json" }));
// Le reste de l'API utilise du JSON
app.use(express.json());

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_SUCCESS_URL =
  process.env.STRIPE_SUCCESS_URL || "http://localhost:8080/payment/success";
const STRIPE_CANCEL_URL =
  process.env.STRIPE_CANCEL_URL || "http://localhost:8080/payment/cancel";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!STRIPE_SECRET_KEY) {
  console.warn("[server] STRIPE_SECRET_KEY not set. Calls will fail.");
}

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      // laisser par défaut l'apiVersion pour éviter les conflits
    })
  : null;

// Initialiser Firebase Admin SDK
let firestore = null;
try {
  const firebaseConfig = {
    projectId: process.env.FIREBASE_PROJECT_ID || "sdv-automation-mbe",
  };

  let serviceAccount = null;

  // 1) Fichier firebase-credentials.json
  const credentialsPath = path.join(__dirname, "..", "firebase-credentials.json");
  if (fs.existsSync(credentialsPath)) {
    serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  }
  // 2) Variable FIREBASE_CREDENTIALS_BASE64 (recommandé pour Railway, Render, etc.)
  else if (process.env.FIREBASE_CREDENTIALS_BASE64) {
    const decoded = Buffer.from(process.env.FIREBASE_CREDENTIALS_BASE64.trim(), "base64").toString("utf8");
    serviceAccount = JSON.parse(decoded);
  }

  if (serviceAccount) {
    initializeApp({
      credential: cert(serviceAccount),
      projectId: firebaseConfig.projectId,
    });
  } else {
    initializeApp({ projectId: firebaseConfig.projectId });
  }

  firestore = getFirestore();
  console.log("[server] ✅ Firebase Admin initialisé");
} catch (err) {
  console.warn("[server] ⚠️  Firebase Admin non initialisé:", err.message);
  console.warn("[server] Les webhooks ne pourront pas mettre à jour Firestore");
}

// Route de santé (pour vérifier le déploiement)
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "api" });
});

// Mémoire légère pour suivre les statuts récents (pas persistant)
const paymentStatus = new Map();

// Utilitaire pour URL par défaut basée sur host si non fourni
const buildReturnUrl = (req, fallback) => {
  const host = req.headers.host;
  if (!host) return fallback;
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}${fallback}`;
};

// Ajoute des query params lisibles sur la page de retour (succès / annulation)
const withParams = (urlString, params) => {
  try {
    const url = new URL(urlString);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  } catch (e) {
    console.warn("[stripe] Impossible d'ajouter les paramètres à l'URL", urlString, e);
    return urlString;
  }
};

// Construit le payload Payment Link à partir des champs fournis
const buildPaymentLinkPayload = ({
      amount,
      currency = "EUR",
      description,
      reference,
      customer,
      successUrl,
  priceId,
}) => {
  const hasPriceId = Boolean(priceId);
  const amountCents = hasPriceId ? null : Math.round(Number(amount) * 100);

  if (!hasPriceId && (!Number.isFinite(amountCents) || amountCents <= 0)) {
    throw new Error("Invalid amount (must be > 0)");
    }

    if (!description) {
    throw new Error("Missing description");
    }

  const lineItem = hasPriceId
    ? {
        price: priceId,
        quantity: 1,
      }
    : {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountCents,
            product_data: {
              name: description,
              metadata: {
                reference: reference || "",
              },
            },
          },
      };

  const effectiveSuccessUrl = withParams(
    successUrl || STRIPE_SUCCESS_URL,
    {
      ref: reference || "",
      amount,
      currency,
      source: "stripe",
      status: "success",
    }
  );

  return {
    line_items: [lineItem],
      after_completion: {
        type: "redirect",
        redirect: {
          url: effectiveSuccessUrl || STRIPE_SUCCESS_URL,
        },
      },
      metadata: {
        reference: reference || "",
        customer_name: customer?.name || "",
        customer_email: customer?.email || "",
        customer_phone: customer?.phone || "",
      },
    };
};

// API Stripe Payment Link
app.post("/api/stripe/link", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(400).json({ error: "Stripe not configured" });
    }

    const payload = buildPaymentLinkPayload({
      ...req.body,
      successUrl: req.body.successUrl || buildReturnUrl(req, "/payment/success"),
    });

    console.log("[stripe] payload", {
      reference: req.body.reference,
      amount: req.body.amount,
      currency: req.body.currency || "EUR",
      successUrl: payload.after_completion.redirect.url,
      priceId: req.body.priceId,
    });

    const paymentLink = await stripe.paymentLinks.create(payload);

    if (!paymentLink.url) {
      return res.status(502).json({ error: "No Stripe URL returned", data: paymentLink });
    }

    return res.json({ url: paymentLink.url, id: paymentLink.id });
  } catch (error) {
    console.error("[server] Stripe error", error);
    if (error instanceof Stripe.errors.StripeError) {
      return res.status(400).json({ error: error.message, code: error.code, details: error.raw });
    }
    return res.status(500).json({ error: "Server error", details: error?.message || "unknown" });
  }
});

// API Stripe Payment Link (variant priceId) - méthode "SaaS" simple
app.post("/api/stripe/create-payment-link", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(400).json({ error: "Stripe not configured" });
    }

    const payload = buildPaymentLinkPayload(req.body);
    const paymentLink = await stripe.paymentLinks.create(payload);

    if (!paymentLink.url) {
      return res.status(502).json({ error: "No Stripe URL returned", data: paymentLink });
    }

    return res.json({ url: paymentLink.url, id: paymentLink.id });
  } catch (error) {
    console.error("[server] Stripe create-payment-link error", error);
    if (error instanceof Stripe.errors.StripeError) {
      return res.status(400).json({ error: error.message, code: error.code, details: error.raw });
    }
    return res.status(500).json({ error: "Server error", details: error?.message || "unknown" });
  }
});

// Webhook Stripe pour marquer les paiements comme complétés (ex: Payment Link)
app.post("/api/stripe/webhook", async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(400).send("Stripe webhook not configured");
  }

  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe] webhook signature error", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const obj = event.data.object || {};
    let ref = obj.metadata?.reference || obj.metadata?.ref || null;
    
    // Pour checkout.session.completed, payment_link est un champ direct (plink_xxx)
    // Pour charge.succeeded et payment_intent.succeeded, on doit récupérer le checkout.session
    let linkId = obj.payment_link || obj.payment_link_id || null;
    
    // Si on n'a pas de linkId direct, essayer d'extraire depuis l'URL ou d'autres champs
    if (!linkId && obj.url) {
      // Extraire plink_xxx depuis l'URL si présente
      const urlMatch = obj.url.match(/plink_[\w]+/);
      if (urlMatch) {
        linkId = urlMatch[0];
      }
    }
    
    const amount = obj.amount || obj.amount_received || obj.amount_total || null;
    const currency = obj.currency || null;

    let status = "unknown";
    let reason = undefined;
    switch (event.type) {
      case "payment_link.created":
        status = "link_sent";
        break;
      case "payment_link.updated":
        status = obj.active === false ? "expired" : "link_sent";
        break;
      case "payment_link.canceled":
        status = "cancelled";
        break;
      case "checkout.session.completed":
      case "payment_intent.succeeded":
      case "charge.succeeded":
        status = "paid";
        break;
      case "payment_intent.payment_failed":
      case "charge.failed":
        status = "failed";
        reason = obj.last_payment_error?.message || obj.failure_message;
        break;
      case "payment_intent.canceled":
        status = "cancelled";
        break;
      default:
        status = "received";
    }

    paymentStatus.set(linkId || ref || `evt_${event.id}`, {
      status,
      updatedAt: new Date().toISOString(),
      ref,
      linkId,
      amount,
      currency,
      reason,
      event: event.type,
    });

    switch (event.type) {
      case "checkout.session.completed":
      case "payment_intent.succeeded":
      case "charge.succeeded":
        console.log("[stripe] paiement confirmé", {
          type: event.type,
          reference: ref,
          customer: obj.metadata?.customer_email,
          amount: amount,
          currency: currency,
        });
        
        // Mettre à jour Firestore pour désactiver les liens de paiement
        if (firestore) {
          try {
            let quoteDoc = null;
            
            // Chercher par référence dans les métadonnées
            if (ref) {
              const quotesByRef = await firestore
                .collection("quotes")
                .where("reference", "==", ref)
                .limit(1)
                .get();
              
              if (!quotesByRef.empty) {
                quoteDoc = quotesByRef.docs[0];
              }
            }
            
            // Si on n'a pas trouvé par référence, chercher par paymentLinkId dans l'URL
            if (!quoteDoc && linkId) {
              // Récupérer tous les devis et chercher celui qui contient ce lien
              const allQuotes = await firestore.collection("quotes").limit(100).get();
              
              for (const doc of allQuotes.docs) {
                const data = doc.data();
                const paymentLinks = data.paymentLinks || [];
                const hasLink = paymentLinks.some(
                  (link) =>
                    link.id === linkId ||
                    link.url?.includes(linkId) ||
                    (typeof link === "object" && link.url && link.url.includes(linkId))
                );
                
                if (hasLink) {
                  quoteDoc = doc;
                  break;
                }
              }
            }
            
            // Si on a trouvé le devis, mettre à jour les liens de paiement
            if (quoteDoc) {
              const quoteData = quoteDoc.data();
              const paymentLinks = quoteData.paymentLinks || [];
              const existingTimeline = quoteData.timeline || [];
              
              // Mettre à jour le statut du lien de paiement correspondant
              let linkFound = false;
              const updatedPaymentLinks = paymentLinks.map((link) => {
                // Comparer par ID du lien Stripe (peut être dans link.id ou link.url)
                const linkMatches =
                  link.id === linkId ||
                  (link.url && typeof link.url === 'string' && link.url.includes(linkId));
                
                if (linkMatches && !linkFound) {
                  linkFound = true;
                  console.log("[stripe] Lien de paiement trouvé et marqué comme payé:", link.id);
                  return {
                    ...link,
                    status: "paid",
                    paidAt: Timestamp.now(),
                  };
                }
                // Désactiver tous les autres liens actifs pour ce devis
                if (link.status === "active" && linkFound) {
                  console.log("[stripe] Désactivation d'un autre lien actif:", link.id);
                  return {
                    ...link,
                    status: "expired",
                  };
                }
                return link;
              });
              
              // Ajouter un événement à l'historique pour le paiement
              const timelineEvent = {
                id: `tl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                date: Timestamp.now(),
                status: "paid",
                description: "Paiement reçu et confirmé",
                user: "system",
              };
              
              // Éviter les doublons (même description et statut dans les 5 dernières minutes)
              const fiveMinutesAgo = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
              const isDuplicate = existingTimeline.some(
                (e) =>
                  e.status === "paid" &&
                  e.description === timelineEvent.description &&
                  (e.date?.toMillis ? e.date.toMillis() : new Date(e.date).getTime()) > fiveMinutesAgo.toMillis()
              );
              
              const updatedTimeline = isDuplicate 
                ? existingTimeline 
                : [...existingTimeline, timelineEvent];
              
              // Mettre à jour le devis dans Firestore
              // IMPORTANT: Quand un paiement est reçu, le devis passe automatiquement en "awaiting_collection"
              // pour qu'il apparaisse dans la page Collectes et puisse être planifié
              await quoteDoc.ref.update({
                paymentLinks: updatedPaymentLinks,
                paymentStatus: "paid",
                status: "awaiting_collection", // Passer en attente de collecte après paiement
                timeline: updatedTimeline,
                updatedAt: Timestamp.now(),
              });
              
              console.log("[stripe] ✅ Devis mis à jour dans Firestore:", {
                quoteId: quoteDoc.id,
                reference: ref || quoteData.reference,
                linksUpdated: updatedPaymentLinks.length,
              });
            } else {
              console.warn("[stripe] ⚠️  Devis non trouvé pour référence:", ref, "linkId:", linkId);
            }
          } catch (firestoreError) {
            console.error("[stripe] ❌ Erreur mise à jour Firestore:", firestoreError);
            // Ne pas faire échouer le webhook si Firestore échoue
          }
        }
        
        // Désactiver le Payment Link dans Stripe même si Firestore n'est pas configuré
        // C'est la partie la plus importante pour empêcher la réutilisation du lien
        // IMPORTANT: On ne désactive que pour les événements qui contiennent directement le payment_link
        const shouldDisableLink = (
          event.type === "checkout.session.completed" ||
          event.type === "payment.link.succeeded"
        );
        
        if (shouldDisableLink && stripe) {
          // Extraire le linkId depuis l'objet
          let paymentLinkIdToDisable = obj.payment_link || linkId || null;
          
          // Pour checkout.session.completed, payment_link est un champ direct
          if (!paymentLinkIdToDisable && event.type === "checkout.session.completed") {
            paymentLinkIdToDisable = obj.payment_link || null;
          }
          
          console.log("[stripe] 🔄 Tentative de désactivation du Payment Link:", {
            eventType: event.type,
            linkId,
            paymentLinkFromObj: obj.payment_link,
            paymentLinkIdToDisable,
            isValid: paymentLinkIdToDisable && paymentLinkIdToDisable.startsWith('plink_'),
          });
          
          if (paymentLinkIdToDisable && paymentLinkIdToDisable.startsWith('plink_')) {
            try {
              await stripe.paymentLinks.update(paymentLinkIdToDisable, {
                active: false,
              });
              console.log("[stripe] ✅ Payment Link désactivé dans Stripe:", paymentLinkIdToDisable);
            } catch (stripeError) {
              console.error("[stripe] ⚠️  Erreur lors de la désactivation du Payment Link dans Stripe:", {
                error: stripeError.message,
                code: stripeError.code,
                type: stripeError.type,
                paymentLinkId: paymentLinkIdToDisable,
              });
            }
          } else {
            console.warn("[stripe] ⚠️  Impossible de désactiver le Payment Link - ID manquant ou invalide:", {
              linkId,
              paymentLink: obj.payment_link,
              paymentLinkIdToDisable,
              eventType: event.type,
            });
          }
        } else if (
          (event.type === "payment_intent.succeeded" || event.type === "charge.succeeded") &&
          !linkId
        ) {
          // Pour ces événements, on ne peut pas désactiver le lien car on n'a pas le linkId
          // Mais on peut quand même mettre à jour Firestore par référence
          console.log("[stripe] ℹ️  Événement", event.type, "reçu sans linkId - désactivation du lien gérée par checkout.session.completed");
        }
        break;
      default:
        console.log("[stripe] webhook reçu", event.type);
    }
    return res.status(200).send("ok");
  } catch (err) {
    console.error("[stripe] webhook handler error", err);
    return res.status(500).send("Webhook handler error");
  }
});

// ==========================================
// ROUTES STRIPE CONNECT
// ==========================================

// OAuth Stripe Connect - Génération URL
app.post("/api/stripe/connect", (req, res) => handleStripeConnect(req, res));

// OAuth Stripe Connect - Callback
app.get("/stripe/callback", (req, res) => handleStripeCallback(req, res, firestore));

// Vérifier le statut de connexion Stripe
app.get("/api/stripe/status", (req, res) => handleStripeStatus(req, res, firestore));

// Déconnecter un compte Stripe
app.post("/api/stripe/disconnect", (req, res) => handleStripeDisconnect(req, res, firestore));

// Créer un paiement pour un devis
app.post("/api/devis/:id/paiement", (req, res) => handleCreatePaiement(req, res, firestore));

// Récupérer les paiements d'un devis
app.get("/api/devis/:id/paiements", (req, res) => handleGetPaiements(req, res, firestore));

// Webhook Stripe UNIQUE (Connect)
app.post("/webhooks/stripe", (req, res) => handleStripeWebhook(req, res, firestore));

// ==========================================
// FIN ROUTES STRIPE CONNECT
// ==========================================

// Serveur statique du build Vite
const distPath = path.join(__dirname, "../dist");
app.use(express.static(distPath));
// Catch-all pour le front (évite l'erreur path-to-regexp sur '*')
app.use((req, res, next) => {
  // Si la requête n'est pas une API, renvoyer l'index
  if (!req.path.startsWith("/api")) {
    return res.sendFile(path.join(distPath, "index.html"));
  }
  return next();
});

const port = process.env.PORT || 8080;
const host = process.env.HOST || "0.0.0.0"; // 0.0.0.0 requis pour Railway/Docker
app.listen(port, host, () => {
  console.log(`[server] listening on ${host}:${port}`);
});

