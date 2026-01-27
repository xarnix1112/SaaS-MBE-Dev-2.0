import { doc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Liste des collections à initialiser. Ajoutez/enlevez ici selon vos besoins.
const BASE_COLLECTIONS = [
  { name: "auctionHouses", description: "Salles de ventes" },
  { name: "quotes", description: "Devis" },
  { name: "shipments", description: "Colis / expéditions" },
  { name: "clients", description: "Clients" },
  { name: "recipients", description: "Destinataires / réceptionnaires" },
  { name: "paymentLinks", description: "Liens de paiement" },
  { name: "payments", description: "Paiements et statuts" },
];

let alreadyRun = false;

/**
 * Crée un document _meta dans chaque collection pour forcer leur existence.
 * Idempotent : ne fait rien si déjà exécuté pendant la session.
 */
export async function bootstrapFirestoreCollections() {
  if (alreadyRun) return;
  alreadyRun = true;

  // Si la config Firebase est absente, on ne tente rien
  if (!import.meta.env.VITE_FIREBASE_API_KEY || !import.meta.env.VITE_FIREBASE_PROJECT_ID) {
    console.warn("[firestore-bootstrap] Config Firebase manquante, aucun bootstrap effectué.");
    return;
  }

  const now = new Date().toISOString();

  await Promise.all(
    BASE_COLLECTIONS.map(({ name, description }) =>
      setDoc(
        doc(db, name, "_meta"),
        {
          description,
          updatedAt: now,
          createdAt: now,
        },
        { merge: true }
      )
    )
  ).catch((err) => {
    console.warn("[firestore-bootstrap] Impossible de créer les collections", err);
  });
}

