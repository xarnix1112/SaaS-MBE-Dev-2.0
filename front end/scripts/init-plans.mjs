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

// Chercher les credentials (dev ou prod)
const possiblePaths = [
  join(__dirname, "..", "firebase-credentials.json"),
  join(__dirname, "..", "firebase-credentials-dev.json"),
];

let credentialsPath = null;
for (const p of possiblePaths) {
  if (existsSync(p)) {
    credentialsPath = p;
    break;
  }
}

if (!credentialsPath) {
  console.error("❌ Aucun firebase-credentials.json ou firebase-credentials-dev.json trouvé");
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
  basic: {
    name: "Basic",
    features: {
      createQuote: true,
      tracking: true,
      advancedAnalytics: false,
      apiAccess: false,
      customWorkflows: false,
      prioritySupport: false,
    },
    limits: {
      quotesPerYear: 200,
      usersMax: 2,
    },
  },
  pro: {
    name: "Pro",
    features: {
      createQuote: true,
      tracking: true,
      advancedAnalytics: true,
      apiAccess: false,
      customWorkflows: true,
      prioritySupport: true,
    },
    limits: {
      quotesPerYear: 1000,
      usersMax: 5,
    },
  },
  enterprise: {
    name: "Enterprise",
    features: {
      createQuote: true,
      tracking: true,
      advancedAnalytics: true,
      apiAccess: true,
      customWorkflows: true,
      prioritySupport: true,
      customBranding: true,
      dedicatedSupport: true,
    },
    limits: {
      quotesPerYear: -1, // illimité
      usersMax: 50,
    },
  },
};

async function initPlans() {
  console.log("🚀 Initialisation de la collection plans (Feature Flags)...\n");

  try {
    const batch = db.batch();

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
    console.log("   - basic: 200 devis/an, 2 utilisateurs");
    console.log("   - pro: 1000 devis/an, 5 utilisateurs");
    console.log("   - enterprise: illimité, 50 utilisateurs\n");
    console.log("📝 Prochaine étape: les saasAccounts utiliseront planId pour charger leur plan.");
  } catch (error) {
    console.error("❌ Erreur:", error);
    process.exit(1);
  }
}

initPlans();
