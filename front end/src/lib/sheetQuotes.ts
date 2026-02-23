import Papa from "papaparse";
import { Quote, VerificationIssue } from "@/types/quote";
import { mockQuotes } from "@/data/mockData";
import { mergeEnhancementsIntoQuotes } from "@/lib/quoteEnhancements";
import { upsertQuotesToFirestore } from "@/lib/quoteEnhancements";

type SheetRef = { id: string; gid: string };

// ❌ SUPPRIMÉ — Ancien système Google Sheets par défaut
// En mode SaaS, chaque compte doit connecter son propre Google Sheet via OAuth
// const DEFAULT_SHEETS: SheetRef[] = [];

const parseSheetRef = (raw: string): SheetRef | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const [id, gid = "0"] = trimmed.split(":");
  return { id, gid };
};

const envSheets = (() => {
  const fromList =
    import.meta.env.VITE_GOOGLE_SHEETS ||
    import.meta.env.VITE_GOOGLE_SHEET_ID ||
    "";
  return fromList
    .split(",")
    .map(parseSheetRef)
    .filter((v): v is SheetRef => Boolean(v));
})();

// ❌ SUPPRIMÉ — Plus de Google Sheets par défaut en mode SaaS
// const SHEETS_TO_TRY: SheetRef[] = envSheets.length > 0 ? envSheets : [];

const sheetUrl = ({ id, gid }: SheetRef) =>
  `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;

// ❌ SUPPRIMÉ — Plus d'URL CSV par défaut en mode SaaS
// Chaque compte SaaS doit connecter son propre Google Sheet via OAuth
const explicitCsvUrl = import.meta.env.VITE_GOOGLE_SHEETS_CSV_URL || "";

const parseCsvUrls = (value: string): string[] =>
  value
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);

const numberFrom = (value: string | number | undefined, fallback = 0) => {
  if (value === undefined || value === null) return fallback;
  const str = String(value).replace(",", ".").trim();
  const parsed = parseFloat(str);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sanitizeKey = (key: string) =>
  key
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[\\/]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeRow = (row: Record<string, string>): Record<string, string> => {
  return Object.entries(row).reduce<Record<string, string>>((acc, [key, val]) => {
    const normalizedKey = sanitizeKey(key);
    acc[normalizedKey] = (val ?? "").toString().trim();
    return acc;
  }, {});
};

const pick = (row: Record<string, string>, keys: string[], fallback = ""): string => {
  // exact match on sanitized keys
  for (const key of keys) {
    const normalized = sanitizeKey(key);
    if (row[normalized]) return row[normalized];
  }

  // fallback: contains-based match to handle composite headers
  const rowEntries = Object.entries(row);
  for (const key of keys) {
    const normalized = sanitizeKey(key);
    const found = rowEntries.find(([rowKey]) => rowKey.includes(normalized));
    if (found) return found[1];
  }

  return fallback;
};

const booleanFrom = (value: string | undefined): boolean => {
  if (!value) return false;
  const trimmed = value.trim();
  // Dans Google Sheets, l'assurance est "TRUE" (en majuscules) si le client veut de l'assurance, sinon vide
  // Vérifier d'abord "TRUE" en majuscules, puis les autres variantes
  if (trimmed === "TRUE" || trimmed === "true") return true;
  const normalized = trimmed.toLowerCase();
  return ["oui", "yes", "ok", "1", "vrai", "y", "o"].some((v) => normalized === v || normalized.includes(v));
};

// ID stable pour que les données Firestore restent reliées au bon devis,
// même si l'ordre des lignes dans Google Sheets change.
const hashString = (input: string): string => {
  // djb2
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
};

const stableQuoteIdFromRow = (normalized: Record<string, string>) => {
  // IMPORTANT: ne JAMAIS dépendre de l'index de ligne (sinon l'ID change dès qu'on insère/supprime une ligne).
  // On essaie d'utiliser les champs Google Forms les plus stables.
  const timestamp = pick(normalized, ["timestamp", "date", "heure"]);
  const email = pick(normalized, ["email", "courriel", "mail"]);
  const phone = pick(normalized, ["téléphone", "telephone", "phone"]);
  
  // Utiliser la même logique que buildQuoteFromRow pour construire le nom complet
  const clientFirstName = pick(normalized, ["prenom", "prénom", "firstname", "first name"], "");
  const clientLastName = pick(normalized, ["nom de famille", "lastname", "last name", "family name", "surname"], "");
  const clientNameFull = pick(normalized, ["nom complet", "full name", "name"], "");
  const clientNameOnly = pick(normalized, ["nom"], "");
  
  let clientName: string;
  if (clientFirstName && clientLastName) {
    clientName = `${clientFirstName} ${clientLastName}`.trim();
  } else if (clientNameFull) {
    clientName = clientNameFull;
  } else if (clientFirstName && clientNameOnly) {
    clientName = `${clientFirstName} ${clientNameOnly}`.trim();
  } else if (clientFirstName) {
    clientName = clientLastName ? `${clientFirstName} ${clientLastName}`.trim() : clientFirstName;
  } else if (clientNameOnly) {
    clientName = clientLastName ? `${clientNameOnly} ${clientLastName}`.trim() : clientNameOnly;
  } else if (clientLastName) {
    clientName = clientLastName;
  } else {
    clientName = "";
  }
  
  const lotNumber = pick(normalized, ["numéro de lot", "lot", "lot number"]);
  const lotDescription = pick(normalized, ["description", "objet", "lot description"]);

  const key = [timestamp, email, phone, clientName, lotNumber, lotDescription]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join("|");

  return `gs_${hashString(key || JSON.stringify(normalized))}`;
};

const buildQuoteFromRow = (row: Record<string, string>, index: number): Quote => {
  const normalized = normalizeRow(row);
  
  // DEBUG: Afficher TOUTES les clés normalisées pour le premier devis
  if (index === 0) {
    console.log(`[sheetQuotes] 🔍 TOUTES les clés normalisées disponibles dans Google Sheets:`, {
      allNormalizedKeys: Object.keys(normalized).sort(),
      sampleValues: Object.entries(normalized).slice(0, 20).map(([k, v]) => ({ key: k, value: v?.substring(0, 100) })),
    });
  }

  const timestamp = pick(normalized, ["timestamp", "date", "heure"]);
  const createdAt = timestamp ? new Date(timestamp) : new Date();
  const reference = pick(normalized, ["reference", "référence"], `DEV-GS-${index + 1}`);
  const stableId = stableQuoteIdFromRow(normalized);

  // Récupérer prénom et nom de famille séparément, puis les combiner
  // Priorité 1: Si on a prénom ET nom de famille séparés, les combiner
  const clientFirstName = pick(normalized, ["prenom", "prénom", "firstname", "first name"], "");
  const clientLastName = pick(normalized, ["nom de famille", "lastname", "last name", "family name", "surname"], "");
  
  // Priorité 2: Si on a un champ "nom complet" ou "name", l'utiliser
  const clientNameFull = pick(normalized, ["nom complet", "full name", "name"], "");
  
  // Priorité 3: Si on a seulement "nom" (sans "prénom" séparé), vérifier s'il contient déjà prénom+nom
  // Note: "nom" seul peut être soit le prénom, soit le nom complet, soit le nom de famille
  const clientNameOnly = pick(normalized, ["nom"], "");
  
  // Construire le nom complet selon la priorité
  let clientName: string;
  if (clientFirstName && clientLastName) {
    // Cas idéal: prénom et nom séparés -> "Prénom Nom"
    clientName = `${clientFirstName} ${clientLastName}`.trim();
  } else if (clientNameFull) {
    // Cas 2: nom complet dans un seul champ -> utiliser tel quel
    clientName = clientNameFull;
  } else if (clientFirstName && clientNameOnly) {
    // Cas 3: prénom + "nom" (qui peut être le nom de famille) -> "Prénom Nom"
    clientName = `${clientFirstName} ${clientNameOnly}`.trim();
  } else if (clientFirstName) {
    // Cas 4: seulement prénom -> essayer de trouver le nom de famille
    clientName = clientLastName 
      ? `${clientFirstName} ${clientLastName}`.trim()
      : clientFirstName;
  } else if (clientNameOnly) {
    // Cas 5: seulement "nom" (peut être prénom, nom complet, ou nom de famille)
    // Si on a aussi un nom de famille séparé, les combiner
    clientName = clientLastName 
      ? `${clientNameOnly} ${clientLastName}`.trim()
      : clientNameOnly;
  } else if (clientLastName) {
    // Cas 6: seulement nom de famille
    clientName = clientLastName;
  } else {
    // Fallback
    clientName = "Client Google Forms";
  }
  const clientEmail = pick(normalized, ["email", "courriel", "mail", "e-mail", "e mail", "e mail 1"], "");
  // Essayer plusieurs variantes pour le téléphone (sans le suffixe "1" qui est pour le destinataire)
  const clientPhone = pick(normalized, [
    "téléphone", 
    "telephone", 
    "phone", 
    "numéro de téléphone",
    "numero de telephone",
    "tel",
    "tél",
    "mobile",
    "portable",
    "numero telephone",
    "numéro telephone"
  ], "");
  // Essayer plusieurs variantes pour l'adresse du client (sans le suffixe "1" qui est pour le destinataire)
  const clientAddress = pick(normalized, [
    "adresse", 
    "adresse de livraison", 
    "address",
    "adresse complète",
    "adresse complete",
    "adresse postale",
    "adresse du client",
    "adresse client",
    "livraison adresse",
    "adresse livraison",
    "adresse complète du client",
    "adresse complete du client"
  ], "");
  const clientCity = pick(normalized, ["ville", "city"], "");
  const clientZip = pick(normalized, ["code postal", "zip", "postal code"], "");
  const clientState = pick(normalized, ["etat", "state", "province", "region"], "");
  
  // Log pour déboguer - AFFICHER TOUTES LES CLÉS DISPONIBLES pour voir ce qui est dans Google Sheets
  // Afficher toutes les clés qui contiennent "tel", "phone", "adresse", "address"
  const phoneKeys = Object.keys(normalized).filter(k => k.includes('tel') || k.includes('phone'));
  const addressKeys = Object.keys(normalized).filter(k => k.includes('adress') || k.includes('address'));
  console.log(`[sheetQuotes] 🔍 Informations client pour ${clientName || 'devis'}:`, {
    phoneFound: clientPhone || "MANQUANT",
    addressFound: clientAddress || "MANQUANTE",
    emailFound: clientEmail || "MANQUANT",
    phoneKeysAvailable: phoneKeys,
    addressKeysAvailable: addressKeys,
    allKeys: Object.keys(normalized).sort(),
  });

  const lotNumber = pick(normalized, ["numéro de lot", "lot", "lot number"], `LOT-${index + 1}`);
  const lotDescription = pick(normalized, ["description", "objet", "lot description"], "Objet à transporter");
  const lotAuctionHouse = pick(normalized, ["salle des ventes", "auction house", "maison de vente"], "Non précisée");

  const length = numberFrom(pick(normalized, ["longueur", "length", "longueur (cm)"]));
  const width = numberFrom(pick(normalized, ["largeur", "width", "largeur (cm)"]));
  const height = numberFrom(pick(normalized, ["hauteur", "height", "hauteur (cm)"]));
  const weight = numberFrom(pick(normalized, ["poids", "weight", "poids (kg)"]));
  const value = numberFrom(pick(normalized, ["valeur", "valeur estimée", "declared value", "value"]));

  // Récupérer la valeur brute de l'assurance pour le debug
  // La clé exacte dans Google Sheets est "souhaitez vous assurer votre vos bordereau x"
  // Mais on cherche aussi d'autres variantes pour être robuste
  const insuranceRaw = pick(normalized, [
    "souhaitez vous assurer votre vos bordereau x",
    "souhaitez vous assurer",
    "assurance",
    "insurance",
    "assurer",
    "souhaitez-vous assurer",
    "voulez-vous assurer",
    "assurez-vous",
  ]);
  const insurance = booleanFrom(insuranceRaw);
  console.log(`[sheetQuotes] 🔍 Assurance pour ${clientName}:`, {
    rawValue: insuranceRaw,
    parsedValue: insurance,
    allKeys: Object.keys(normalized).filter(k => k.includes('assur') || k.includes('insur')),
  });
  const express = booleanFrom(pick(normalized, ["express", "livraison express"]));

  // Livraison / destinataire
  const receiverQuestion = pick(normalized, [
    "etes vous le destinataire de lexpedition",
    "are you the shipping receiver",
    "destinataire",
  ]);
  const accessPointAddress = pick(normalized, [
    "adresse point relais ups access point shipping address",
    "point relais",
    "ups access point",
  ]);

  // Champs destinataire (duplications suffixées "1" dans le CSV publié)
  const receiverName = `${pick(normalized, ["prenom 1", "prénom 1", "receiver firstname"], "")} ${pick(
    normalized,
    ["nom de famille 1", "receiver lastname"],
    ""
  )}`.trim();
  const receiverEmail = pick(normalized, ["e mail 1", "email 1", "receiver email"], "");
  const receiverPhone = pick(normalized, ["numero de telephone 1", "téléphone 1", "receiver phone"], "");
  const receiverAddressLine1 = pick(normalized, ["adresse 1", "address 1", "receiver address"], "");
  const receiverAddressLine2 = pick(normalized, ["complement dadresse 1", "address line 2 1", "receiver address line2"], "");
  const receiverCity = pick(normalized, ["ville 1", "city 1"], "");
  const receiverState = pick(normalized, ["etat region province 1", "state 1", "province 1"], "");
  const receiverZip = pick(normalized, ["code postal 1", "zip 1", "postal code 1"], "");
  const receiverCountry = pick(normalized, ["pays 1", "country 1"], "");
  
  // Extraire aussi le pays du client (colonne "Pays" sans le "1")
  const clientCountry = pick(normalized, ["pays", "country"], "");

  // Déterminer le mode de livraison selon la réponse à la question
  // Réponses possibles :
  // - "Oui, livrer à mon adresse" ou "Oui" → mode "client" (client = destinataire)
  // - "Non, livrer à une autre adresse" ou "Non" → mode "receiver" (destinataire différent)
  // - "Livrer à un point relais UPS" ou présence d'une adresse de point relais → mode "pickup"
  const receiverQuestionLower = (receiverQuestion || "").toLowerCase();
  const isAccessPoint = Boolean(accessPointAddress) || 
                        receiverQuestionLower.includes("point relais") ||
                        receiverQuestionLower.includes("ups") ||
                        receiverQuestionLower.includes("access point");
  const isReceiverDifferent =
    receiverQuestionLower.includes("non") ||
    receiverQuestionLower.includes("no") ||
    receiverQuestionLower.includes("not") ||
    (receiverQuestionLower.includes("autre") && receiverQuestionLower.includes("adresse"));
  const isClientReceiver =
    receiverQuestionLower.includes("oui") ||
    receiverQuestionLower.includes("yes") ||
    receiverQuestionLower.includes("mon adresse") ||
    receiverQuestionLower.includes("my address");

  let deliveryMode: Quote["delivery"]["mode"] = "client"; // Par défaut, le client est le destinataire
  if (isAccessPoint) {
    deliveryMode = "pickup";
  } else if (isReceiverDifferent && !isClientReceiver) {
    deliveryMode = "receiver";
  } else {
    // Si "oui" ou pas de réponse claire, le client est le destinataire
    deliveryMode = "client";
  }

  const delivery: Quote["delivery"] =
    deliveryMode === "pickup"
      ? {
          mode: "pickup",
          contact: {
            name: clientName || "Client",
            email: clientEmail || "non-renseigne@client.com",
            phone: clientPhone || "",
          },
          address: {
            line1: accessPointAddress,
          },
        }
      : deliveryMode === "receiver"
        ? {
            mode: "receiver",
            contact: {
              name: receiverName || clientName || "Destinataire",
              email: receiverEmail || clientEmail || "",
              phone: receiverPhone || clientPhone || "",
            },
            address: {
              line1: receiverAddressLine1 || clientAddress,
              line2: receiverAddressLine2,
              city: receiverCity,
              state: receiverState,
              zip: receiverZip,
              country: receiverCountry,
            },
          }
        : {
            mode: "client",
            contact: {
              name: clientName || "Client",
              email: clientEmail || "non-renseigne@client.com",
              phone: clientPhone || "",
            },
            address: {
              line1: clientAddress,
              city: clientCity || "",
              state: clientState || "",
              zip: clientZip || "",
              country: clientCountry || receiverCountry || "", // Utiliser le pays du client ou celui du destinataire en fallback
            },
          };

  const verificationIssues: VerificationIssue[] = [];
  if (!clientAddress) {
    verificationIssues.push({
      field: "address",
      type: "missing",
      message: "Adresse manquante",
    });
  }
  if (!clientPhone) {
    verificationIssues.push({
      field: "phone",
      type: "missing",
      message: "Téléphone manquant",
    });
  }

  return {
    id: stableId,
    reference,
    client: {
      id: `client-${stableId}`,
      name: clientName || "Client Google Forms",
      email: clientEmail || "non-renseigne@client.com",
      phone: clientPhone || "Non renseigné",
      address: clientAddress || "",
    },
    lot: {
      id: `lot-${stableId}`,
      number: lotNumber,
      description: lotDescription,
      dimensions: {
        length,
        width,
        height,
        weight,
        estimated: true,
      },
      value,
      photos: [],
      auctionHouse: lotAuctionHouse,
    },
    status: "to_verify", // Nouveaux devis vont directement dans "À vérifier"
    paymentStatus: "pending",
    totalAmount: 0,
    options: {
      insurance,
      express,
      // Calcul de l'assurance : 2.5% de la valeur, avec un minimum de 12€ si valeur < 500€
      // Arrondi au supérieur : 13,50 = 14, 13,49 = 13,5
      insuranceAmount: insurance && value > 0 
        ? (() => {
            const calculated = value * 0.025;
            const minAmount = value < 500 ? 12 : 0;
            let finalAmount = Math.max(calculated, minAmount);
            
            // Arrondi au supérieur : si >= 0,50, arrondir à l'entier supérieur, sinon arrondir à 0,5 supérieur
            const decimal = finalAmount % 1;
            if (decimal >= 0.50) {
              finalAmount = Math.ceil(finalAmount);
            } else if (decimal > 0) {
              finalAmount = Math.floor(finalAmount) + 0.5;
            }
            
            console.log(`[sheetQuotes] 💰 Calcul assurance pour ${clientName}:`, {
              value,
              calculated: calculated.toFixed(2),
              minAmount,
              finalAmount: finalAmount.toFixed(2),
            });
            return finalAmount;
          })()
        : undefined,
      expressAmount: express ? 35 : undefined,
    },
    paymentLinks: [],
    messages: [],
    verificationIssues,
    delivery,
    timeline: [
      {
        id: `tl-${stableId}`,
        date: createdAt,
        status: "to_verify", // Nouveaux devis vont directement dans "À vérifier"
        description: "Demande de devis reçue via Google Forms",
      },
    ],
    internalNotes: [],
    auctionHouseComments: [],
    createdAt,
    updatedAt: createdAt,
  };
};

// ❌ FONCTION DÉSACTIVÉE — Ancien système CSV
// Les devis sont maintenant chargés depuis l'API backend qui filtre par saasAccountId
// La synchronisation se fait automatiquement via le polling Google Sheets dans ai-proxy.js
export async function fetchQuotesFromSheet(): Promise<Quote[]> {
  // ❌ Retourner un tableau vide pour désactiver complètement l'ancien système
  console.warn("[sheetQuotes] ⚠️  Ancien système CSV désactivé. Utilisez l'API /api/quotes avec authentification.");
  return [];
  
  /* ❌ CODE DÉSACTIVÉ - Ancien système CSV
  let lastError: unknown;
  const aggregatedQuotes: Quote[] = [];
  const csvUrls = parseCsvUrls(explicitCsvUrl);
  console.log(`[sheetQuotes] Chargement depuis ${csvUrls.length} URL(s) explicite(s):`, csvUrls);
  for (const url of csvUrls) {
    try {
      console.log(`[sheetQuotes] Tentative de chargement depuis: ${url}`);
      const response = await fetch(url);
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) {
        console.error(`[sheetQuotes] Erreur ${response.status} pour ${url}`);
        throw new Error(
          `CSV non accessible (code ${response.status}) depuis ${url}`
        );
      }
      if (contentType.includes("html")) {
        console.error(`[sheetQuotes] Réponse HTML au lieu de CSV pour ${url}`);
        throw new Error(
          `CSV non accessible (HTML reçu) depuis ${url}`
        );
      }
      const csv = await response.text();
      if (csv.toLowerCase().includes("<html")) {
        console.error(`[sheetQuotes] Contenu HTML détecté dans la réponse pour ${url}`);
        throw new Error(
          `CSV non accessible (HTML dans le contenu) depuis ${url}`
        );
      }
      console.log(`[sheetQuotes] CSV chargé avec succès (${csv.length} caractères) depuis ${url}`);
      const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
      const rows = (parsed.data as Record<string, string>[]).filter(Boolean);
      console.log(`[sheetQuotes] ${rows.length} ligne(s) trouvée(s) dans ${url}`);
      
      // DEBUG: Afficher les colonnes disponibles dans la première ligne
      if (rows.length > 0) {
        console.log(`[sheetQuotes] 🔍 Colonnes disponibles dans Google Sheets:`, {
          rawHeaders: Object.keys(rows[0]),
          normalizedHeaders: Object.keys(normalizeRow(rows[0])),
          firstRowSample: Object.entries(rows[0]).slice(0, 10).map(([k, v]) => ({ key: k, value: v?.substring(0, 50) })),
        });
      }
      
      const quotes = rows.map((row, idx) =>
        buildQuoteFromRow(row, aggregatedQuotes.length + idx)
      );
      console.log(`[sheetQuotes] ${quotes.length} devis créé(s) depuis ${url}`);
      
      // Log final pour le premier devis pour vérifier que tout est bien récupéré
      if (quotes.length > 0) {
        const firstQuote = quotes[0];
        console.log(`[sheetQuotes] ✅ Premier devis créé - Vérification des données:`, {
          reference: firstQuote.reference,
          clientName: firstQuote.client.name,
          clientEmail: firstQuote.client.email,
          clientPhone: firstQuote.client.phone || "MANQUANT",
          clientAddress: firstQuote.client.address || "MANQUANTE",
          insurance: firstQuote.options.insurance,
          insuranceAmount: firstQuote.options.insuranceAmount || "NON CALCULÉ",
        });
      }
      
      aggregatedQuotes.push(...quotes);
    } catch (error) {
      console.error(`[sheetQuotes] Erreur lors du chargement de ${url}:`, error);
      lastError = error;
    }
  }
  
  console.log(`[sheetQuotes] Total de ${aggregatedQuotes.length} devis chargé(s) depuis les URLs explicites`);

  if (aggregatedQuotes.length > 0) return aggregatedQuotes;

  for (const ref of SHEETS_TO_TRY) {
    try {
      const response = await fetch(sheetUrl(ref));
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) {
        lastError = new Error(
          `Erreur Google Sheets (${response.status}) pour ${ref.id}:${ref.gid}`
        );
        continue;
      }

      const csv = await response.text();
      if (contentType.includes("html") || csv.toLowerCase().includes("<html")) {
        lastError = new Error(
          "La feuille n'est pas publiée pour l'accès CSV public. Publie l'onglet au format CSV (Fichier > Publier sur le Web)."
        );
        continue;
      }
      const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });

      const rows = (parsed.data as Record<string, string>[]).filter(Boolean);
      const quotes = rows.map(buildQuoteFromRow);

      if (quotes.length > 0) {
        return quotes;
      }
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  throw lastError || new Error("Aucune source Google Sheets valide");
  */
}

// ❌ ANCIEN SYSTÈME SUPPRIMÉ - Utilisation uniquement des Google Sheets connectés par compte SaaS
// Les devis sont maintenant chargés depuis l'API backend qui filtre par saasAccountId
// La synchronisation se fait automatiquement via le polling Google Sheets dans ai-proxy.js

export async function loadQuotes(): Promise<Quote[]> {
  try {
    // Charger les devis depuis l'API backend (filtrés par saasAccountId)
    const { authenticatedFetch } = await import('@/lib/api');
    const response = await authenticatedFetch('/api/quotes');
    
    if (!response.ok) {
      console.warn("[quotes] API non disponible:", response.status);
      return mockQuotes;
    }
    
    const quotes = await response.json();
    
    if (!Array.isArray(quotes) || quotes.length === 0) {
      return mockQuotes;
    }
    
    // Les devis viennent déjà de Firestore avec tous les enrichissements
    // IMPORTANT: Fusionner les champs modifiés depuis Firestore (clientName, clientEmail, etc.)
    // dans la structure Quote (client.name, client.email, etc.)
    return quotes.map((q: any) => {
      // Fusionner les champs modifiés depuis Firestore dans la structure Quote
      // Les champs Firestore (clientName, clientEmail, etc.) ont priorité sur les champs Google Sheets
      const clientName = q.clientName !== undefined && q.clientName !== null ? q.clientName : (q.client?.name || '');
      const clientEmail = q.clientEmail !== undefined && q.clientEmail !== null ? q.clientEmail : (q.client?.email || '');
      const clientPhone = q.clientPhone !== undefined && q.clientPhone !== null ? q.clientPhone : (q.client?.phone || '');
      const clientAddress = q.clientAddress !== undefined && q.clientAddress !== null ? q.clientAddress : (q.client?.address || '');
      
      const lotNumber = q.lotNumber !== undefined && q.lotNumber !== null ? q.lotNumber : (q.lot?.number || '');
      const lotDescription = q.lotDescription !== undefined && q.lotDescription !== null ? q.lotDescription : (q.lot?.description || '');
      const lotValue = q.lotValue !== undefined && q.lotValue !== null ? q.lotValue : (q.lot?.value || 0);
      const lotAuctionHouse = q.lotAuctionHouse !== undefined && q.lotAuctionHouse !== null ? q.lotAuctionHouse : (q.lot?.auctionHouse || '');
      
      // Fusionner les dimensions du lot si elles existent dans Firestore
      const lotDimensions = q.lotDimensions ? {
        length: Number(q.lotDimensions.length) || 0,
        width: Number(q.lotDimensions.width) || 0,
        height: Number(q.lotDimensions.height) || 0,
        weight: Number(q.lotDimensions.weight) || 0,
        estimated: q.lotDimensions.estimated !== undefined ? q.lotDimensions.estimated : true,
      } : (q.lot?.dimensions || { length: 0, width: 0, height: 0, weight: 0, estimated: false });
      
      // Fusionner les dimensions réelles (sauvegardées depuis Préparation, stockées à la racine ou dans lot)
      const realDimensions = q.realDimensions ? {
        length: Number(q.realDimensions.length) || 0,
        width: Number(q.realDimensions.width) || 0,
        height: Number(q.realDimensions.height) || 0,
        weight: Number(q.realDimensions.weight) || 0,
        estimated: q.realDimensions.estimated !== undefined ? q.realDimensions.estimated : false,
      } : (q.lot?.realDimensions || undefined);
      
      // Fusionner les informations de livraison
      const deliveryMode = q.deliveryMode !== undefined && q.deliveryMode !== null ? q.deliveryMode : (q.delivery?.mode || 'client');
      const deliveryContactName = q.deliveryContactName !== undefined && q.deliveryContactName !== null ? q.deliveryContactName : (q.delivery?.contact?.name || '');
      const deliveryContactEmail = q.deliveryContactEmail !== undefined && q.deliveryContactEmail !== null ? q.deliveryContactEmail : (q.delivery?.contact?.email || '');
      const deliveryContactPhone = q.deliveryContactPhone !== undefined && q.deliveryContactPhone !== null ? q.deliveryContactPhone : (q.delivery?.contact?.phone || '');
      const deliveryAddress = q.deliveryAddress || q.delivery?.address || {};
      
      return {
        ...q,
        status: q.status || 'new',
        paymentStatus: q.paymentStatus || 'pending',
        createdAt: q.createdAt ? new Date(q.createdAt) : new Date(),
        updatedAt: q.updatedAt ? new Date(q.updatedAt) : new Date(),
        timeline: q.timeline?.map((event: any) => ({
          ...event,
          date: event.date ? new Date(event.date) : new Date()
        })) || [],
        verificationIssues: q.verificationIssues || [],
        // Fusionner les champs modifiés dans la structure client
        client: {
          ...(q.client || {}),
          name: clientName,
          email: clientEmail,
          phone: clientPhone,
          address: clientAddress,
        },
        // Fusionner les champs modifiés dans la structure lot
        lot: {
          ...(q.lot || {}),
          number: lotNumber,
          description: lotDescription,
          value: lotValue,
          auctionHouse: lotAuctionHouse,
          dimensions: lotDimensions,
          realDimensions,
        },
        // Fusionner les informations de livraison
        delivery: {
          mode: deliveryMode,
          contact: {
            name: deliveryContactName,
            email: deliveryContactEmail,
            phone: deliveryContactPhone,
          },
          address: deliveryAddress,
        },
        items: q.items || [],
        paymentLinks: q.paymentLinks?.map((link: any) => ({
          ...link,
          createdAt: link.createdAt ? new Date(link.createdAt) : new Date()
        })) || [],
        messages: q.messages || [],
        internalNotes: q.internalNotes || [],
        auctionHouseComments: q.auctionHouseComments || [],
        // S'assurer que les options avec les prix sont bien copiées
        // Fallback: si options.xxxPrice n'existe pas, utiliser la valeur à la racine (ancien format)
        options: {
          insurance: q.options?.insurance !== undefined ? q.options.insurance : (q.insurance !== undefined ? q.insurance : false),
          express: q.options?.express || false,
          insuranceAmount: q.options?.insuranceAmount !== undefined && q.options?.insuranceAmount !== null ? q.options.insuranceAmount : (q.insuranceAmount !== undefined && q.insuranceAmount !== null ? q.insuranceAmount : 0),
          expressAmount: q.options?.expressAmount || q.expressAmount || 0,
          packagingPrice: q.options?.packagingPrice !== undefined && q.options?.packagingPrice !== null ? q.options.packagingPrice : (q.packagingPrice !== undefined && q.packagingPrice !== null ? q.packagingPrice : 0),
          shippingPrice: q.options?.shippingPrice !== undefined && q.options?.shippingPrice !== null ? q.options.shippingPrice : (q.shippingPrice !== undefined && q.shippingPrice !== null ? q.shippingPrice : 0),
        }
      };
    }) as Quote[];
  } catch (error) {
    console.error("[quotes] Erreur lors du chargement des devis depuis l'API:", error);
    return mockQuotes;
  }
}

