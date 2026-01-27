import dotenv from "dotenv";
import express from "express";
import Stripe from "stripe";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import fs from "fs";

// Charger les variables d'environnement
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

// Fallback local (ignoré par git) pour la clé Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  try {
    const p = "server/.stripe_secret_key";
    if (fs.existsSync(p)) {
      const key = fs.readFileSync(p, "utf8").trim();
      if (key) process.env.STRIPE_SECRET_KEY = key;
    }
  } catch (_e) {
    // ignore
  }
}

const app = express();
app.use(express.json());

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_SUCCESS_URL =
  process.env.STRIPE_SUCCESS_URL || "http://localhost:8080/payment/success";
const STRIPE_CANCEL_URL =
  process.env.STRIPE_CANCEL_URL || "http://localhost:8080/payment/cancel";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!STRIPE_SECRET_KEY) {
  // eslint-disable-next-line no-console
  console.warn("[stripe-proxy] STRIPE_SECRET_KEY not set. Calls will fail.");
}

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// Initialiser Firebase Admin SDK
let firestore = null;
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const firebaseConfig = {
    projectId: process.env.FIREBASE_PROJECT_ID || "sdv-automation-mbe",
  };
  
  // Si on a un fichier de credentials, l'utiliser
  const credentialsPath = path.join(__dirname, "..", "firebase-credentials.json");
  if (fs.existsSync(credentialsPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
    initializeApp({
      credential: cert(serviceAccount),
      projectId: firebaseConfig.projectId,
    });
  } else {
    // Sinon, utiliser Application Default Credentials (pour production)
    initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }
  
  firestore = getFirestore();
  console.log("[stripe-proxy] ✅ Firebase Admin initialisé");
} catch (err) {
  console.warn("[stripe-proxy] ⚠️  Firebase Admin non initialisé:", err.message);
  console.warn("[stripe-proxy] Les webhooks ne pourront pas mettre à jour Firestore");
}

// Mémoire légère pour suivre les statuts récents (pas persistant)
const paymentStatus = new Map(); // key: paymentLinkId || reference -> { status, updatedAt, ref, linkId, amount, currency, reason }

// Ajoute des query params sur les URLs de retour pour les afficher côté front
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
    // eslint-disable-next-line no-console
    console.warn("[stripe-proxy] Cannot append params to url", urlString, e);
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

  return {
    line_items: [lineItem],
      after_completion: {
        type: "redirect",
        redirect: {
        url: withParams(successUrl || STRIPE_SUCCESS_URL, {
          ref: reference || "",
          amount,
          currency,
          source: "stripe",
          status: "success",
        }),
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

// Génère un lien de paiement Stripe (Payment Links API)
app.post("/api/stripe/link", async (req, res) => {
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
    console.error("[stripe-proxy] Error", error);
    if (error instanceof Stripe.errors.StripeError) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Proxy error", details: error?.message });
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
    console.error("[stripe-proxy] Error", error);
    if (error instanceof Stripe.errors.StripeError) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: "Proxy error", details: error?.message });
  }
});

// Webhook Stripe (dev) - log des événements
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(400).send("Stripe webhook not configured");
  }
  const sig = req.headers["stripe-signature"];
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);

    const obj = event.data.object || {};
    const ref = obj.metadata?.reference || obj.metadata?.ref || null;
    const linkId = obj.payment_link || obj.id || null;
    const amount = obj.amount || obj.amount_received || null;
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
        
        // Mettre à jour Firestore pour désactiver les liens de paiement
        if (firestore) {
          (async () => {
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
                
                let linkFound = false;
                const updatedPaymentLinks = paymentLinks.map((link) => {
                  const linkMatches =
                    link.id === linkId ||
                    link.url?.includes(linkId) ||
                    (link.status === "active" && linkId && !linkFound);
                  
                  if (linkMatches) {
                    linkFound = true;
                    return {
                      ...link,
                      status: "paid",
                      paidAt: Timestamp.now(),
                    };
                  }
                  if (link.status === "active") {
                    return {
                      ...link,
                      status: "expired",
                    };
                  }
                  return link;
                });
                
                await quoteDoc.ref.update({
                  paymentLinks: updatedPaymentLinks,
                  paymentStatus: "paid",
                  status: "awaiting_collection", // Passer en attente de collecte après paiement
                  updatedAt: Timestamp.now(),
                });
                
                console.log("[stripe-proxy] ✅ Devis mis à jour dans Firestore:", {
                  quoteId: quoteDoc.id,
                  reference: ref || quoteData.reference,
                  linksUpdated: updatedPaymentLinks.length,
                });
              }
            } catch (firestoreError) {
              console.error("[stripe-proxy] ❌ Erreur mise à jour Firestore:", firestoreError);
            }
          })();
        }
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

    console.log("[stripe-proxy] webhook", {
      type: event.type,
      status,
      ref,
      linkId,
      amount,
      currency,
      reason,
    });
    return res.status(200).send("ok");
  } catch (err) {
    console.error("[stripe-proxy] webhook error", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// Endpoint de lecture simple du dernier statut (debug)
app.get("/api/stripe/status", (req, res) => {
  const key = req.query.linkId || req.query.ref;
  if (!key) return res.status(400).json({ error: "Missing linkId or ref" });
  const data = paymentStatus.get(key);
  if (!data) return res.status(404).json({ error: "Not found" });
  return res.json(data);
});

const port = process.env.PORT || 5174;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[stripe-proxy] listening on port ${port}`);
});

