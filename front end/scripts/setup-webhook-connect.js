/**
 * Script pour configurer le webhook Stripe Connect via l'API
 * 
 * Usage:
 *   node front end/scripts/setup-webhook-connect.js
 * 
 * Prérequis:
 *   - STRIPE_SECRET_KEY doit être configuré dans .env.local
 *   - Le backend doit être déployé et accessible
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import Stripe from "stripe";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger les variables d'environnement
const envLocalPath = resolve(__dirname, "..", ".env.local");
const envPath = resolve(__dirname, "..", ".env");

dotenv.config({ path: envPath });
dotenv.config({ path: envLocalPath, override: true });

// Configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://api.mbe-sdv.fr/webhooks/stripe";
const TEST_MODE = process.env.STRIPE_TEST_MODE !== "false"; // Par défaut en mode test

if (!STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY non trouvé dans .env.local");
  console.error("   Ajoutez: STRIPE_SECRET_KEY=sk_test_...");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2025-06-30.basil",
});

async function setupWebhook() {
  console.log("🔧 Configuration du webhook Stripe Connect...\n");
  console.log(`📍 URL du webhook: ${WEBHOOK_URL}`);
  console.log(`🔑 Mode: ${TEST_MODE ? "TEST" : "LIVE"}\n`);

  try {
    // 1. Lister les webhooks existants
    console.log("📋 Recherche des webhooks existants...");
    const existingWebhooks = await stripe.webhookEndpoints.list({
      limit: 100,
    });

    // Chercher un webhook existant avec la même URL
    const existingWebhook = existingWebhooks.data.find(
      (wh) => wh.url === WEBHOOK_URL
    );

    if (existingWebhook) {
      console.log(`✅ Webhook existant trouvé: ${existingWebhook.id}`);
      console.log(`   URL: ${existingWebhook.url}`);
      console.log(`   Statut: ${existingWebhook.status}`);
      console.log(`   Connect: ${existingWebhook.connect ? "Oui" : "Non"}\n`);

      // Vérifier si le webhook écoute les comptes connectés
      if (existingWebhook.connect) {
        console.log("✅ Le webhook écoute déjà les comptes connectés !");
        console.log(`\n🔑 Signing secret: ${existingWebhook.secret || "Non disponible"}`);
        console.log("\n⚠️  Si vous ne voyez pas le secret, récupérez-le depuis:");
        console.log(`   https://dashboard.stripe.com/${TEST_MODE ? "test" : ""}/webhooks/${existingWebhook.id}`);
        return;
      } else {
        console.log("⚠️  Le webhook existant n'écoute PAS les comptes connectés.");
        console.log("   Suppression de l'ancien webhook...\n");
        await stripe.webhookEndpoints.del(existingWebhook.id);
        console.log("✅ Ancien webhook supprimé\n");
      }
    }

    // 2. Créer un nouveau webhook avec connect: true
    console.log("🆕 Création d'un nouveau webhook avec connect: true...");
    const webhook = await stripe.webhookEndpoints.create({
      url: WEBHOOK_URL,
      description: "Webhook Stripe Connect - Production",
      enabled_events: [
        "checkout.session.completed",
        "payment_intent.succeeded",
        "payment_intent.payment_failed",
      ],
      connect: true, // ⚠️ CRUCIAL : Activer pour les comptes connectés
    });

    console.log("✅ Webhook créé avec succès !\n");
    console.log("📊 Détails du webhook:");
    console.log(`   ID: ${webhook.id}`);
    console.log(`   URL: ${webhook.url}`);
    console.log(`   Statut: ${webhook.status}`);
    console.log(`   Connect: ${webhook.connect ? "Oui ✅" : "Non ❌"}`);
    console.log(`   Événements: ${webhook.enabled_events.length}\n`);

    // 3. Récupérer le signing secret
    console.log("🔑 Récupération du signing secret...");
    const secret = webhook.secret;

    if (secret) {
      console.log(`✅ Signing secret: ${secret}\n`);
      console.log("📝 INSTRUCTIONS POUR RAILWAY:\n");
      console.log("1. Allez sur Railway → Votre service backend");
      console.log("2. Onglet 'Variables'");
      console.log("3. Ajoutez ou modifiez la variable:");
      console.log(`   Nom: STRIPE_WEBHOOK_SECRET`);
      console.log(`   Valeur: ${secret}`);
      console.log("4. Redéployez le backend\n");
    } else {
      console.log("⚠️  Le secret n'est pas disponible immédiatement.");
      console.log("   Récupérez-le depuis le Dashboard Stripe:");
      console.log(`   https://dashboard.stripe.com/${TEST_MODE ? "test" : ""}/webhooks/${webhook.id}\n`);
    }

    console.log("✅ Configuration terminée !");
    console.log("\n🧪 Test:");
    console.log("1. Effectuez un paiement test");
    console.log("2. Vérifiez les logs Railway");
    console.log("3. Vérifiez que le webhook est appelé immédiatement\n");
  } catch (error) {
    console.error("❌ Erreur lors de la configuration:", error.message);
    if (error.raw) {
      console.error("   Détails:", error.raw);
    }
    process.exit(1);
  }
}

// Exécuter le script
setupWebhook();
