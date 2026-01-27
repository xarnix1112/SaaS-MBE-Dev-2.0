/**
 * Script de vérification de la configuration Stripe Connect
 * 
 * Usage: node scripts/check-stripe-config.mjs
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger les variables d'environnement
dotenv.config({ path: join(__dirname, "..", ".env.local") });

console.log("🔍 Vérification de la configuration Stripe Connect\n");

let hasErrors = false;

// 1. Vérifier les variables d'environnement
console.log("1️⃣  Variables d'environnement");

const requiredEnvVars = [
  { name: "STRIPE_SECRET_KEY", prefix: ["sk_test_", "sk_live_"] },
  { name: "STRIPE_CONNECT_CLIENT_ID", prefix: ["ca_"] },
  { name: "STRIPE_WEBHOOK_SECRET", prefix: ["whsec_"] },
  { name: "APP_URL", prefix: null },
];

for (const { name, prefix } of requiredEnvVars) {
  const value = process.env[name];
  
  if (!value) {
    console.log(`   ❌ ${name} : MANQUANT`);
    hasErrors = true;
  } else if (prefix && !prefix.some(p => value.startsWith(p))) {
    console.log(`   ⚠️  ${name} : Format invalide (devrait commencer par ${prefix.join(" ou ")})`);
    hasErrors = true;
  } else {
    console.log(`   ✅ ${name} : OK`);
  }
}

console.log();

// 2. Vérifier Firebase credentials
console.log("2️⃣  Firebase credentials");

const credentialsPath = join(__dirname, "..", "firebase-credentials.json");
if (existsSync(credentialsPath)) {
  try {
    const credentials = JSON.parse(readFileSync(credentialsPath, "utf8"));
    if (credentials.project_id) {
      console.log(`   ✅ firebase-credentials.json : OK (project: ${credentials.project_id})`);
    } else {
      console.log("   ⚠️  firebase-credentials.json : project_id manquant");
      hasErrors = true;
    }
  } catch (e) {
    console.log("   ❌ firebase-credentials.json : Format invalide");
    hasErrors = true;
  }
} else {
  console.log("   ⚠️  firebase-credentials.json : Fichier non trouvé (optionnel en dev)");
}

console.log();

// 3. Vérifier les fichiers du projet
console.log("3️⃣  Fichiers du projet");

const requiredFiles = [
  "server/stripe-connect.js",
  "server/index.js",
  "src/lib/stripeConnect.ts",
  "src/types/stripe.ts",
  "src/components/quotes/QuotePaiements.tsx",
  "scripts/init-firestore-stripe.mjs",
];

for (const file of requiredFiles) {
  const filePath = join(__dirname, "..", file);
  if (existsSync(filePath)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} : MANQUANT`);
    hasErrors = true;
  }
}

console.log();

// 4. Résumé
console.log("📊 Résumé");
console.log("─".repeat(50));

if (hasErrors) {
  console.log("❌ Configuration incomplète\n");
  console.log("📝 Actions requises :");
  console.log("   1. Créez un fichier .env.local dans front end/");
  console.log("   2. Copiez le contenu de env.stripe.example");
  console.log("   3. Remplissez les valeurs Stripe");
  console.log("   4. Consultez QUICK_START_STRIPE.md pour plus d'infos\n");
  process.exit(1);
} else {
  console.log("✅ Configuration complète !\n");
  console.log("🚀 Prochaines étapes :");
  console.log("   1. Initialisez Firestore : node scripts/init-firestore-stripe.mjs");
  console.log("   2. Démarrez Stripe CLI : stripe listen --forward-to http://localhost:8080/webhooks/stripe");
  console.log("   3. Démarrez le serveur : npm run dev:all");
  console.log("   4. Testez la connexion Stripe dans Paramètres → Paiements\n");
  process.exit(0);
}

