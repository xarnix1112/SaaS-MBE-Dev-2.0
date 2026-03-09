/**
 * Script d'initialisation de la collection plans (Feature Flags)
 *
 * Plans dynamiques : Basic, Pro, Enterprise
 * Usage: node scripts/init-plans.mjs
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Chercher les credentials (staging > dev > fallback)
// Variable d'environnement PLANS_INIT_CREDENTIALS pour forcer un fichier
const credentialsFromEnv = process.env.PLANS_INIT_CREDENTIALS;
const possiblePaths = credentialsFromEnv
  ? [join(__dirname, "..", credentialsFromEnv)]
  : [
      join(__dirname, "..", "firebase-credentials-staging.json"),
      join(__dirname, "..", "firebase-credentials-dev.json"),
      join(__dirname, "..", "firebase-credentials.json"),
    ];

let credentialsPath = null;
for (const p of possiblePaths) {
  if (existsSync(p)) {
    credentialsPath = p;
    break;
  }
}

if (!credentialsPath) {
  console.error("❌ Aucun fichier de credentials trouvé. Utilisez :");
  console.error("   - firebase-credentials-staging.json (staging)");
  console.error("   - firebase-credentials-dev.json (dev)");
  console.error("   - firebase-credentials.json (fallback)");
  console.error("   Ou : PLANS_INIT_CREDENTIALS=firebase-credentials-staging.json npm run plans:init");
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(credentialsPath, "utf8"));
console.log(`📁 Utilisation de: ${credentialsPath}\n`);

initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = getFirestore();

const PLANS = {
  starter: {
    name: "Starter",
    price: 45,
    queuePriority: "standard",
    features: {
      createQuote: true,
      tracking: true,
      stripePayment: true,
      pushToMbeHub: false,
      multiAgency: false,
      paymentPersonnalise: false,
      supportPrioritaire: false,
      supportVisioOnboarding: false,
      supportContactDirect: false,
    },
    limits: {
      quotesPerYear: 2000,
      usersMax: 1,
      auctionHousesMax: 2,
      customEmailsMax: 0,
      evolutionsIncluded: 0,
    },
  },
  pro: {
    name: "Pro",
    price: 85,
    queuePriority: "medium",
    features: {
      createQuote: true,
      tracking: true,
      stripePayment: true,
      pushToMbeHub: true,
      multiAgency: true,
      paymentPersonnalise: false,
      supportPrioritaire: true,
      supportVisioOnboarding: false,
      supportContactDirect: false,
      smartChoiceShipping: true,
    },
    limits: {
      quotesPerYear: 6000,
      usersMax: 3,
      auctionHousesMax: 5,
      customEmailsMax: 3,
      evolutionsIncluded: 2,
    },
  },
  ultra: {
    name: "Ultra",
    price: 150,
    queuePriority: "high",
    features: {
      createQuote: true,
      tracking: true,
      stripePayment: true,
      pushToMbeHub: true,
      multiAgency: true,
      paymentPersonnalise: true,
      supportPrioritaire: true,
      supportVisioOnboarding: true,
      supportContactDirect: true,
      customizeAutoEmails: true,
      smartChoiceShipping: true,
    },
    limits: {
      quotesPerYear: -1,
      usersMax: -1,
      auctionHousesMax: -1,
      customEmailsMax: 10,
      evolutionsIncluded: 5,
    },
  },
};

async function initPlans() {
  console.log("🚀 Initialisation de la collection plans (Feature Flags)...\n");

  try {
    const batch = db.batch();

    // Remplace les anciens plans (basic, enterprise) par les nouveaux
    const toDelete = ['basic', 'enterprise'];
    for (const oldId of toDelete) {
      const ref = db.collection("plans").doc(oldId);
      batch.delete(ref);
    }
    for (const [planId, data] of Object.entries(PLANS)) {
      const ref = db.collection("plans").doc(planId);
      batch.set(ref, {
        ...data,
        updatedAt: Timestamp.now(),
      });
      console.log(`   ✅ Plan ${planId} préparé`);
    }

    await batch.commit();
    console.log("\n✅ Collection plans créée avec succès!");
    console.log("\n📋 Plans disponibles:");
    console.log("   - starter (45€): 2000 devis/an, 1 user, 2 salles des ventes");
    console.log("   - pro (85€): 6000 devis/an, 3 users, 5 salles des ventes");
    console.log("   - ultra (150€): devis illimités\n");
    console.log("📝 Prochaine étape: les saasAccounts utiliseront planId pour charger leur plan.");
  } catch (error) {
    console.error("❌ Erreur:", error);
    process.exit(1);
  }
}

initPlans();
