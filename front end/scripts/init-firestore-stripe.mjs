/**
 * Script d'initialisation des collections Firestore pour Stripe Connect
 * 
 * Ce script crée les collections nécessaires et un client de test
 * 
 * Usage: node scripts/init-firestore-stripe.mjs
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialiser Firebase Admin
const credentialsPath = join(__dirname, "..", "firebase-credentials.json");

if (!existsSync(credentialsPath)) {
  console.error("❌ Fichier firebase-credentials.json non trouvé");
  console.error("   Placez-le dans le dossier 'front end/'");
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(credentialsPath, "utf8"));

initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = getFirestore();

async function initFirestore() {
  console.log("🚀 Initialisation des collections Firestore pour Stripe Connect...\n");

  try {
    // 1. Créer un client de test
    console.log("1️⃣  Création d'un client de test...");
    const clientRef = db.collection("clients").doc();
    await clientRef.set({
      name: "Client Test SaaS",
      email: "client-test@example.com",
      stripeAccountId: null,
      stripeConnected: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    console.log(`   ✅ Client créé: ${clientRef.id}`);
    console.log(`   📝 Utilisez cet ID pour tester: ${clientRef.id}\n`);

    // 2. Créer un devis de test
    console.log("2️⃣  Création d'un devis de test...");
    const devisRef = db.collection("devis").doc();
    await devisRef.set({
      clientSaasId: clientRef.id,
      clientFinalEmail: "client-final@example.com",
      reference: `DEV-${Date.now()}`,
      status: "DRAFT",
      totalAmount: 1500.0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    console.log(`   ✅ Devis créé: ${devisRef.id}`);
    console.log(`   📝 Référence: DEV-${Date.now()}\n`);

    // 3. Créer un paiement de test (PENDING)
    console.log("3️⃣  Création d'un paiement de test...");
    const paiementRef = db.collection("paiements").doc();
    await paiementRef.set({
      devisId: devisRef.id,
      clientSaasId: clientRef.id,
      stripeSessionId: "cs_test_example_" + Date.now(),
      amount: 1500.0,
      type: "PRINCIPAL",
      status: "PENDING",
      description: "Paiement principal du devis",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    console.log(`   ✅ Paiement créé: ${paiementRef.id}\n`);

    // 4. Afficher les collections créées
    console.log("📊 Collections Firestore créées:");
    console.log("   - clients");
    console.log("   - devis");
    console.log("   - paiements\n");

    // 5. Afficher les IDs pour les tests
    console.log("🔑 IDs pour les tests:");
    console.log(`   CLIENT_ID="${clientRef.id}"`);
    console.log(`   DEVIS_ID="${devisRef.id}"`);
    console.log(`   PAIEMENT_ID="${paiementRef.id}"\n`);

    console.log("✅ Initialisation terminée avec succès!");
    console.log("\n📝 Prochaines étapes:");
    console.log("   1. Configurez vos variables d'environnement (.env.local):");
    console.log("      - STRIPE_SECRET_KEY");
    console.log("      - STRIPE_CONNECT_CLIENT_ID");
    console.log("      - STRIPE_WEBHOOK_SECRET");
    console.log("      - APP_URL");
    console.log("   2. Démarrez le serveur: npm run dev:all");
    console.log("   3. Allez dans Paramètres → Paiements");
    console.log("   4. Connectez votre compte Stripe");
    console.log("   5. Créez un paiement pour le devis de test\n");
  } catch (error) {
    console.error("❌ Erreur lors de l'initialisation:", error);
    process.exit(1);
  }
}

initFirestore();

