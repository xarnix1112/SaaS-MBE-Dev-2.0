/**
 * Proxy backend pour l'analyse de bordereaux avec IA
 * Sécurise la clé API et permet d'utiliser Groq ou OpenAI
 */

import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import path, { dirname } from "path";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import Stripe from "stripe";
import fs from "fs";
import crypto from "crypto";
import { spawn } from "child_process";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
// pdfjs+canvas chargés uniquement dans ocr-pdf-worker.mjs (process séparé) pour éviter conflit sharp/canvas
import XLSX from "xlsx";
import bcrypt from "bcrypt";
import { Resend } from "resend";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { google } from "googleapis";
import * as Sentry from "@sentry/node";
import {
  handleStripeConnect,
  handleStripeCallback,
  handleCreatePaiement,
  handleGetPaiements,
  handleCancelPaiement,
  handleSyncPaymentAmount,
  handleCreateGroupPaiement,
  handleStripeWebhook,
  handleStripeStatus,
  handleStripeDisconnect,
} from "./stripe-connect.js";
import {
  handleGetNotifications,
  handleGetNotificationsCount,
  handleDeleteNotification,
  createNotification,
  NOTIFICATION_TYPES,
} from "./notifications.js";
import {
  handleGetGroupableQuotes,
  handleCreateShipmentGroup,
  handleGetShipmentGroup,
  handleDeleteShipmentGroup,
} from "./shipmentGroups.js";
import {
  getAccountFeaturesAndLimits,
  checkFeature,
  checkLimit,
} from "./middleware/featureFlags.js";
import {
  hasCustomPaytweak,
  getPaymentProviderConfig,
  getPaytweakApiKey,
  getPaytweakKeys,
  createPaytweakLinkForAccount,
  parsePaytweakOrderId,
} from "./payment-provider.js";
import {
  sendPaymentReceivedEmail,
  sendAwaitingCollectionEmail,
  sendCollectedEmail,
  sendAwaitingShipmentEmail,
  sendShippedEmail,
  getBodyContentPreview,
} from "./quote-automatic-emails.js";
import {
  getTemplatesForAccount,
  validateTemplate,
  DEFAULT_TEMPLATES,
  EMAIL_TYPES,
  EMAIL_TYPE_LABELS,
  PLACEHOLDERS,
  LIMITS,
} from "./email-templates.js";
import {
  getTemplatesExtendedForAccount,
  replacePlaceholdersExtended,
  buildBodyHtmlFromSections,
  buildEmailHtmlFromTemplate as buildEmailHtmlSimple,
  EMAIL_TYPES_EXTENDED,
  EMAIL_TYPE_LABELS_EXTENDED,
  PLACEHOLDERS_EXTENDED,
  DEFAULT_TEMPLATES_EXTENDED,
} from "./email-templates-extended.js";
import {
  createBilanSpreadsheet,
  exportAllQuotesToBilan,
  syncQuoteToBilanSheet,
} from "./bilan-google-sheet.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return EMAIL_REGEX.test((email || "").trim());
}

function extractEmailAddress(raw) {
  if (!raw) return "";
  const match = String(raw).match(/<([^>]+)>/);
  const email = (match ? match[1] : raw).trim();
  return email.replace(/^mailto:/i, "");
}

// Note: Le chargement des .env est fait après la définition de __dirname (voir plus bas)

// Fallback: certains fichiers .env* contiennent "export STRIPE_SECRET_KEY=..."
// que dotenv peut ignorer selon le format. On récupère explicitement la clé sans l'afficher.
function tryLoadEnvVarFromFiles(varName, filePaths) {
  if (process.env[varName]) return true;
  for (const p of filePaths) {
    try {
      if (!fs.existsSync(p)) continue;
      const content = fs.readFileSync(p, "utf8");
      const lines = content.split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        // accepte:
        // - KEY=...
        // - export KEY=...
        // - KEY: ...   (certains écrivent au format YAML)
        const re = new RegExp(`^(?:export\\s+)?${varName}\\s*(?:=|:)\\s*(.*)$`);
        const m = line.match(re);
        if (!m) continue;
        let val = (m[1] || "").trim();
        // supprimer commentaire inline (# ...) si présent (simple)
        if (val.includes("#")) {
          val = val.split("#")[0].trim();
        }
        // retirer quotes simples/doubles
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (val) {
          process.env[varName] = val;
          return true;
        }
      }
    } catch (_e) {
      // ignorer et continuer
    }
  }
  return false;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger les variables d'environnement depuis le répertoire parent (front end/)
// car .env.local est dans front end/, pas dans front end/server/
const envLocalPath = path.resolve(__dirname, '..', '.env.local');
const envDevLocalPath = path.resolve(__dirname, '..', '.env.development.local');
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });
dotenv.config({ path: envLocalPath, override: true });
if ((!process.env.NODE_ENV || process.env.NODE_ENV === 'development') && fs.existsSync(envDevLocalPath)) {
  dotenv.config({ path: envDevLocalPath, override: true });
  console.log('[Config] .env.development.local chargé');
}

console.log('[Config] Chargement .env depuis:', { 
  env: envPath, 
  envLocal: envLocalPath,
  envExists: fs.existsSync(envPath),
  envLocalExists: fs.existsSync(envLocalPath)
});

// Typeform désactivé en dev — évite les 500 sur bordereaux Typeform
const TYPEFORM_DISABLED_IN_DEV = process.env.DISABLE_TYPEFORM === 'true' || 
  !process.env.NODE_ENV || 
  process.env.NODE_ENV === 'development';
if (TYPEFORM_DISABLED_IN_DEV) {
  console.log('[Config] Typeform désactivé en dev (DISABLE_TYPEFORM ou NODE_ENV)');
}

// Configuration Resend Email API
// Obtiens ta clé API sur https://resend.com/api-keys
// Ajoute dans .env.local:
//   RESEND_API_KEY=re_xxxxxxxxx
//   EMAIL_FROM=devis@ton-domaine.com (ou ton-domaine@resend.dev pour tester)
//   EMAIL_FROM_NAME=MBE Devis

// Forcer le chargement des variables Resend
const RESEND_VARS = ['RESEND_API_KEY', 'EMAIL_FROM', 'EMAIL_FROM_NAME'];
for (const varName of RESEND_VARS) {
  if (!process.env[varName]) {
    tryLoadEnvVarFromFiles(varName, [envLocalPath, envPath]);
  }
}

// Charger les variables Resend (avec fallback si pas dans .env.local)
// IMPORTANT: Le domaine doit correspondre à un domaine vérifié dans Resend
// Le domaine vérifié est: mbe-sdv.fr (pas mbe-devis.fr)
let RESEND_API_KEY = process.env.RESEND_API_KEY || "re_JRnrHrja_4zoUeRkT5hAMhi3eJ4iQQyTq";
// FORCER l'utilisation de devis@mbe-sdv.fr (domaine vérifié)
// Ignorer toute valeur de .env.local pour cette variable
let EMAIL_FROM = "devis@mbe-sdv.fr"; // Domaine vérifié: mbe-sdv.fr (FORCÉ)
let EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "MBE-SDV";

// Si les variables Resend ne sont toujours pas chargées, lire directement le fichier
// NOTE: EMAIL_FROM est toujours forcé à devis@mbe-sdv.fr, on ne vérifie que RESEND_API_KEY
if (!process.env.RESEND_API_KEY && fs.existsSync(envLocalPath)) {
  console.log('[Config] Lecture directe de .env.local pour variables Resend...');
  try {
    const content = fs.readFileSync(envLocalPath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^(?:export\s+)?([A-Z_]+)\s*=\s*(.+)$/);
      if (match) {
        const key = match[1];
        let value = match[2].trim();
        if (value.includes('#')) value = value.split('#')[0].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (RESEND_VARS.includes(key)) {
          process.env[key] = value;
          // Mettre à jour les variables locales aussi
          if (key === 'RESEND_API_KEY') RESEND_API_KEY = value;
          // IGNORER EMAIL_FROM de .env.local - on force devis@mbe-sdv.fr
          if (key === 'EMAIL_FROM') {
            console.log(`[Config] ⚠️  EMAIL_FROM ignoré depuis .env.local (${value}) - utilisation forcée: devis@mbe-sdv.fr`);
            // Ne pas modifier EMAIL_FROM, on garde la valeur forcée
          } else if (key === 'EMAIL_FROM_NAME') {
            EMAIL_FROM_NAME = value;
            console.log(`[Config] ✅ Variable chargée: ${key} = ${value}`);
          } else {
          console.log(`[Config] ✅ Variable chargée: ${key} = ${key.includes('API_KEY') ? '***' : value}`);
          }
        }
      }
    }
  } catch (err) {
    console.error('[Config] ❌ Erreur lecture .env.local:', err.message);
  }
}

// Initialiser le client Resend avec les valeurs finales
// En staging : Resend n'est jamais utilisé (emails via Gmail uniquement)
let resendClient = null;
if (process.env.NODE_ENV !== 'staging' && RESEND_API_KEY) {
  // Vérifier que la clé API commence par "re_"
  if (!RESEND_API_KEY.startsWith('re_')) {
    console.error('[Config] ❌ Format de clé API Resend invalide (doit commencer par "re_")');
    console.error('[Config] Clé reçue:', RESEND_API_KEY.substring(0, 10) + '...');
  } else {
    try {
      resendClient = new Resend(RESEND_API_KEY);
      console.log('[Config] ✅ Client Resend initialisé avec succès');
      console.log('[Config] ✅ Resend configuré:', {
        hasApiKey: !!RESEND_API_KEY,
        apiKeyPrefix: RESEND_API_KEY.substring(0, 5) + '...',
        apiKeyLength: RESEND_API_KEY.length,
        emailFrom: EMAIL_FROM || 'NON CONFIGURÉ',
        emailFromName: EMAIL_FROM_NAME
      });
    } catch (err) {
      console.error('[Config] ❌ Erreur lors de l\'initialisation du client Resend:', err.message);
      resendClient = null;
    }
  }
} else {
  if (process.env.NODE_ENV === 'staging') {
    console.log('[Config] ℹ️  Staging: Resend désactivé (emails via Gmail uniquement)');
  } else {
    console.log('[Config] ⚠️  Resend non configuré (RESEND_API_KEY requis)');
  }
}

// Les variables Resend sont maintenant disponibles globalement

// Initialiser Sentry AVANT Express
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "production",
    tracesSampleRate: 1.0,
    // Capturer les erreurs non gérées
    beforeSend(event, hint) {
      console.log("[Sentry] Erreur capturée:", event.error?.message || event.message);
      return event;
    },
  });
  console.log("[Sentry] ✅ Sentry initialisé pour le backend");
} else {
  console.warn("[Sentry] ⚠️  SENTRY_DSN non configuré, Sentry désactivé");
}

const app = express();

// Note: Dans Sentry v10+, les handlers Express sont configurés automatiquement
// via setupExpressErrorHandler() après toutes les routes (voir plus bas)

// CORS en PREMIER (avant tout body parsing) - requis pour Railway qui peut renvoyer 502 sur OPTIONS sinon
const corsHeaders = (res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Dev');
  res.set('Access-Control-Max-Age', '86400');
};
app.use((req, res, next) => {
  corsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// IMPORTANT: Ne pas parser le body JSON pour les routes webhook Stripe
// Stripe a besoin du body brut (Buffer) pour vérifier la signature
// On applique express.raw() pour les routes webhook AVANT express.json()
app.use((req, res, next) => {
  // Appliquer express.raw() pour les routes webhook Stripe
  if (req.path === '/api/stripe/webhook' || req.path === '/webhooks/stripe') {
    return express.raw({ type: "application/json" })(req, res, next);
  }
  // Pour toutes les autres routes, continuer sans parser
  next();
});

// Puis appliquer express.json() pour toutes les autres routes
app.use(express.json());

// Middleware pour logger toutes les requêtes (très tôt pour debug)
app.use((req, res, next) => {
  console.log('[AI Proxy] 📥 Requête reçue:', req.method, req.url, 'Headers:', Object.keys(req.headers));
  next();
});

// Configuration multer pour les uploads
const upload = multer({ storage: multer.memoryStorage() });

// Utilitaire: pdfjs exige un Uint8Array (et pas un Buffer Node pur)
function toUint8Array(input) {
  // IMPORTANT: pdfjs est EXTRÊMEMENT strict et refuse catégoriquement les Buffer Node.js
  // Utilisation de Uint8Array.from() pour garantir une copie complètement indépendante
  if (Buffer.isBuffer(input)) {
    // Uint8Array.from() crée un nouveau tableau avec copie complète des données
    return Uint8Array.from(input);
  }
  if (input instanceof Uint8Array) {
    // Déjà un Uint8Array propre
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  // Tentative de conversion pour les autres types
  return new Uint8Array(input);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cartons (Excel "Excel carton/Essai 2024-08-23.xlsx")
// ─────────────────────────────────────────────────────────────────────────────
let cartonCatalogPromise = null;

function normalizeDim(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function sortDimsDesc({ length, width, height }) {
  const arr = [length, width, height].map(normalizeDim).filter((x) => x !== null);
  if (arr.length !== 3) return null;
  arr.sort((a, b) => b - a);
  return { length: arr[0], width: arr[1], height: arr[2] };
}

async function loadCartonCatalog() {
  if (cartonCatalogPromise) return cartonCatalogPromise;
  cartonCatalogPromise = (async () => {
    const excelPath = path.resolve(process.cwd(), "..", "Excel carton", "Essai 2024-08-23.xlsx");
    if (!fs.existsSync(excelPath)) {
      console.warn("[Cartons] Excel introuvable:", excelPath);
      return { cartons: [], tableauxRules: [], tubeRules: [], valiseRules: [], paletteRules: [], veloRule: null };
    }

    const wb = XLSX.readFile(excelPath);

    const readSheetRows = (name) => {
      const ws = wb.Sheets[name];
      if (!ws) return [];
      return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    };

    // 1) Cartons "Dimension-Prix Cartons"
    const dimRows = readSheetRows("Dimension-Prix Cartons");
    let headerRowIdx = dimRows.findIndex((r) => r.some((c) => String(c).toLowerCase().includes("l (cm)")));
    if (headerRowIdx < 0) headerRowIdx = 0;

    const cartons = [];
    for (let i = headerRowIdx + 1; i < dimRows.length; i++) {
      const r = dimRows[i];
      const ref = String(r?.[0] || "").trim();
      const label = String(r?.[1] || "").trim();
      const L = normalizeDim(r?.[2]);
      const l = normalizeDim(r?.[3]);
      const hMin = normalizeDim(r?.[4]);
      const hMax = normalizeDim(r?.[5]) || hMin;
      const priceHT = normalizeDim(r?.[6]);
      const priceTTC = normalizeDim(r?.[7]);
      if (!ref || !L || !l || !hMax) continue;
      cartons.push({
        ref,
        label,
        inner: { length: L, width: l, height: hMax },
        heightMin: hMin,
        heightMax: hMax,
        priceHT,
        priceTTC,
        source: "Dimension-Prix Cartons",
      });
    }

    // 2) Règles tableaux "Type Tableaux"
    const tablRows = readSheetRows("Type Tableaux");
    // data starts after header row containing "largeur"
    const tablStart = tablRows.findIndex((r) => String(r?.[0] || "").toLowerCase().includes("largeur"));
    const tableauxRules = [];
    for (let i = Math.max(0, tablStart + 1); i < tablRows.length; i++) {
      const r = tablRows[i];
      const wRule = String(r?.[0] || "").trim(); // ex: "si de 20 à 35"
      const dRule = String(r?.[1] || "").trim(); // ex: "de 0 à 7"
      const carton = String(r?.[2] || "").trim();
      if (!wRule || !carton) continue;
      tableauxRules.push({ wRule, dRule, carton, source: "Type Tableaux" });
    }

    // 3) Tube
    const tubeRows = readSheetRows("Type Tube");
    const tubeRules = [];
    for (const r of tubeRows) {
      const L = normalizeDim(r?.[1]);
      const d1 = normalizeDim(r?.[2]);
      const d2 = normalizeDim(r?.[3]);
      if (!L || !d1 || !d2) continue;
      tubeRules.push({ length: L, width: d1, height: d2, source: "Type Tube" });
    }

    // 4) Valise
    const valiseRows = readSheetRows("Type valise");
    const valiseRules = [];
    for (const r of valiseRows) {
      const name = String(r?.[0] || "").trim();
      const L = normalizeDim(r?.[1]);
      const l = normalizeDim(r?.[2]);
      const h = normalizeDim(r?.[3]);
      const kg = normalizeDim(r?.[4]);
      if (!name || !L || !l || !h) continue;
      valiseRules.push({ name, inner: { length: L, width: l, height: h }, maxWeight: kg || null, source: "Type valise" });
    }

    // 5) Palette / >25kg
    const palRows = readSheetRows("Type >25kg");
    const paletteRules = [];
    for (const r of palRows) {
      const name = String(r?.[0] || "").trim();
      const L = normalizeDim(r?.[1]);
      const l = normalizeDim(r?.[2]);
      const h = normalizeDim(r?.[3]);
      if (!name || !L || !l) continue;
      paletteRules.push({ name, inner: { length: L, width: l, height: h || null }, source: "Type >25kg" });
    }

    // 6) Vélo
    const veloRows = readSheetRows("Type Velo");
    let veloRule = null;
    for (const r of veloRows) {
      if (String(r?.[0] || "").toLowerCase().includes("dim carton")) {
        const L = normalizeDim(r?.[1]);
        const l = normalizeDim(r?.[2]);
        const h = normalizeDim(r?.[3]);
        if (L && l && h) veloRule = { inner: { length: L, width: l, height: h }, source: "Type Velo" };
      }
    }

    return { cartons, tableauxRules, tubeRules, valiseRules, paletteRules, veloRule };
  })();

  return cartonCatalogPromise;
}

function parseRange(ruleText) {
  const t = ruleText.toLowerCase();
  // "si de 20 à 35"
  let m = t.match(/(\d+)\s*à\s*(\d+)/);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  // "si <15" / "<15"
  m = t.match(/<\s*(\d+)/);
  if (m) return { min: 0, max: Number(m[1]) };
  // "si >42" / ">42"
  m = t.match(/>\s*(\d+)/);
  if (m) return { min: Number(m[1]), max: Number.POSITIVE_INFINITY };
  return null;
}

function guessCategoryFromDescription(desc) {
  const d = (desc || "").toLowerCase();
  if (/(tableau|cadre|peinture|toile|lithographie|estampe)/i.test(d)) return "tableau";
  if (/(tube|affiche|poster|plan|rouleau)/i.test(d)) return "tube";
  if (/(vélo|velo|bicyclette)/i.test(d)) return "velo";
  if (/(valise)/i.test(d)) return "valise";
  if (/(palette)/i.test(d)) return "palette";
  return "carton";
}

function pickSmallestFittingCarton(cartons, req) {
  const r = sortDimsDesc(req);
  if (!r) return null;
  const pad = 2; // marge emballage simple
  const need = { length: r.length + pad, width: r.width + pad, height: r.height + pad };
  const candidates = cartons.filter((c) => {
    const inner = c.inner;
    return inner.length >= need.length && inner.width >= need.width && inner.height >= need.height;
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.inner.length * a.inner.width * a.inner.height) - (b.inner.length * b.inner.width * b.inner.height));
  return { ...candidates[0], required: need };
}

function computeGroupDims(lots) {
  const dims = lots
    .map((l) => l?.estimatedDimensions)
    .filter(Boolean)
    .map((d) => sortDimsDesc(d))
    .filter(Boolean);
  if (dims.length === 0) return null;
  const maxL = Math.max(...dims.map((d) => d.length));
  const maxW = Math.max(...dims.map((d) => d.width));
  const maxH = Math.max(...dims.map((d) => d.height));
  const totalWeight = lots
    .map((l) => Number(l?.estimatedDimensions?.weight))
    .filter((x) => Number.isFinite(x) && x > 0)
    .reduce((a, b) => a + b, 0);
  return { length: maxL, width: maxW, height: maxH, weight: totalWeight || null };
}

/**
 * Nettoie une référence de carton en enlevant le préfixe " / — " ou " / - "
 */
function cleanCartonRef(ref) {
  if (!ref) return "";
  // Enlever le préfixe " / — " ou " / - " ou " /— " ou " /- " (avec ou sans espace)
  // Supporte aussi les tirets Unicode (—, –) et les espaces variés
  return ref.trim().replace(/^[\s\/\u2014\u2013-]+/i, "").trim();
}

async function suggestCartonForLots(lots) {
  const catalog = await loadCartonCatalog();
  const groupDims = computeGroupDims(lots);
  if (!groupDims) return null;
  const category = guessCategoryFromDescription(lots?.[0]?.description || "");

  // Règles spécifiques simples
  if (category === "velo" && catalog.veloRule) {
    return { ref: "VELO", label: "Carton vélo", inner: catalog.veloRule.inner, source: catalog.veloRule.source };
  }
  if (category === "valise" && catalog.valiseRules.length > 0) {
    const pick = pickSmallestFittingCarton(
      catalog.valiseRules.map((v) => ({ ref: v.name, label: v.name, inner: v.inner, priceTTC: null, source: v.source })),
      groupDims
    );
    if (pick) {
      // Nettoyer les références de carton
      return { 
        ref: cleanCartonRef(pick.ref), 
        label: cleanCartonRef(pick.label), 
        inner: pick.inner, 
        source: pick.source 
      };
    }
    return null;
  }
  if (category === "tube" && catalog.tubeRules.length > 0) {
    const pick = pickSmallestFittingCarton(
      catalog.tubeRules.map((t, idx) => ({ ref: `TUBE_${idx + 1}`, label: `${t.length}x${t.width}x${t.height}`, inner: { length: t.length, width: t.width, height: t.height }, source: t.source })),
      groupDims
    );
    if (pick) {
      return { 
        ref: cleanCartonRef(pick.ref), 
        label: cleanCartonRef(pick.label), 
        inner: pick.inner, 
        source: pick.source 
      };
    }
    return null;
  }
  if (category === "tableau" && catalog.tableauxRules.length > 0) {
    // width = dimension du milieu, depth = plus petite
    const sd = sortDimsDesc(groupDims);
    if (sd) {
      const largeur = sd.width;
      const profondeur = sd.height;
      for (const r of catalog.tableauxRules) {
        const w = parseRange(r.wRule);
        const d = r.dRule ? parseRange(r.dRule) : null;
        const wOk = w ? (largeur >= w.min && largeur <= w.max) : false;
        const dOk = d ? (profondeur >= d.min && profondeur <= d.max) : true;
        if (wOk && dOk) {
          return { 
            ref: cleanCartonRef(r.carton), 
            label: cleanCartonRef(r.carton), 
            inner: null, 
            source: r.source 
          };
        }
      }
    }
  }

  // Default: catalogue cartons dimension-prix
  const pick = pickSmallestFittingCarton(catalog.cartons, groupDims);
  if (!pick) return null;
  return {
    ref: cleanCartonRef(pick.ref),
    label: cleanCartonRef(pick.label || pick.ref),
    inner: pick.inner,
    priceTTC: pick.priceTTC ?? null,
    source: pick.source,
    required: pick.required,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe (pour /api/stripe/link)
// IMPORTANT: en dev, Vite proxy /api -> 5174 (ce serveur). Si cette route n'est
// pas ici, le front reçoit "Cannot POST /api/stripe/link".
// ─────────────────────────────────────────────────────────────────────────────
// Essayer de charger la clé Stripe depuis des fichiers .env* même si format "export ..."
// On supporte plusieurs noms au cas où (historique / confusion de nommage).
const STRIPE_ENV_CANDIDATES = [
  "STRIPE_SECRET_KEY",
  "STRIPE_API_KEY",
  "STRIPE_KEY",
  "STRIPE_SECRET",
];

for (const k of STRIPE_ENV_CANDIDATES) {
  tryLoadEnvVarFromFiles(k, [
    envLocalPath,
    envPath,
    path.resolve(__dirname, '.env.local'),
    path.resolve(__dirname, '.env'),
  ]);
}

// Si pas trouvé via env/.env.local, fallback sur un fichier local ignoré par git
if (
  !process.env.STRIPE_SECRET_KEY &&
  !process.env.STRIPE_API_KEY &&
  !process.env.STRIPE_KEY &&
  !process.env.STRIPE_SECRET
) {
  try {
    const p = "server/.stripe_secret_key";
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8").trim();
      // le fichier peut contenir soit la clé brute "sk_...", soit "STRIPE_SECRET_KEY=sk_..."
      const m =
        raw.match(/^(?:export\s+)?STRIPE_SECRET_KEY\s*(?:=|:)\s*(.*)$/m) || null;
      let key = m ? (m[1] || "").trim() : raw;
      if (
        (key.startsWith('"') && key.endsWith('"')) ||
        (key.startsWith("'") && key.endsWith("'"))
      ) {
        key = key.slice(1, -1);
      }
      if (key && key.startsWith("sk_")) {
        process.env.STRIPE_SECRET_KEY = key;
      }
    }
  } catch (_e) {
    // ignore
  }
}

const STRIPE_SECRET_KEY =
  process.env.STRIPE_SECRET_KEY ||
  process.env.STRIPE_API_KEY ||
  process.env.STRIPE_KEY ||
  process.env.STRIPE_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8080";
const STRIPE_SUCCESS_URL =
  process.env.STRIPE_SUCCESS_URL || `${FRONTEND_URL}/payment/success`;
const STRIPE_CANCEL_URL =
  process.env.STRIPE_CANCEL_URL || `${FRONTEND_URL}/payment/cancel`;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_SUBSCRIPTION_WEBHOOK_SECRET = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;

if (!STRIPE_SECRET_KEY) {
  console.warn("[ai-proxy] STRIPE_SECRET_KEY not set. Stripe calls will fail.");
  console.warn("[ai-proxy] Stripe env debug (no secrets):", {
    STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
    STRIPE_API_KEY: Boolean(process.env.STRIPE_API_KEY),
    STRIPE_KEY: Boolean(process.env.STRIPE_KEY),
    STRIPE_SECRET: Boolean(process.env.STRIPE_SECRET),
  });
}

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// Initialiser Firebase Admin SDK
let firestore = null;
try {
  const firebaseConfig = {
    projectId: process.env.FIREBASE_PROJECT_ID || "sdv-automation-mbe",
  };
  
  // 1) Fichier de credentials — priorité selon NODE_ENV pour isoler dev/staging/prod
  const credsDir = path.join(__dirname, "..");
  const env = process.env.NODE_ENV || "development";
  const credFilesByEnv = {
    production: ["firebase-credentials-prod.json", "firebase-credentials.json"],
    staging: ["firebase-credentials-staging.json", "firebase-credentials.json"],
    development: ["firebase-credentials-dev.json", "firebase-credentials.json"],
  };
  const credFiles = credFilesByEnv[env] || credFilesByEnv.development;
  let credentialsPath = null;
  for (const f of credFiles) {
    const p = path.join(credsDir, f);
    if (fs.existsSync(p)) {
      credentialsPath = p;
      break;
    }
  }
  console.log("[ai-proxy] 🔍 Environnement:", env, "| Recherche credentials dans:", credsDir);
  console.log("[ai-proxy] Fichier trouvé:", credentialsPath || "aucun");

  let serviceAccount = null;
  if (credentialsPath && fs.existsSync(credentialsPath)) {
    console.log("[ai-proxy] 📄 Lecture du fichier Firebase credentials...");
    serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
    console.log("[ai-proxy] ✅ Fichier Firebase credentials chargé, project_id:", serviceAccount.project_id);
  } else if (process.env.FIREBASE_CREDENTIALS_BASE64) {
    // 2a) Credentials en Base64 (recommandé sur Railway : aucun problème d'échappement)
    try {
      const decoded = Buffer.from(process.env.FIREBASE_CREDENTIALS_BASE64.trim(), "base64").toString("utf8");
      serviceAccount = JSON.parse(decoded);
      if (!serviceAccount.private_key || !serviceAccount.client_email) {
        throw new Error("JSON invalide : private_key ou client_email manquant");
      }
      console.log("[ai-proxy] ✅ Firebase credentials depuis FIREBASE_CREDENTIALS_BASE64, project_id:", serviceAccount.project_id);
    } catch (e) {
      console.error("[ai-proxy] ❌ FIREBASE_CREDENTIALS_BASE64 invalide:", e.message);
      serviceAccount = null;
    }
  } else if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    // 2b) Variables séparées (clé privée : risque d'échappement sur Railway)
    let rawKey = process.env.FIREBASE_PRIVATE_KEY.trim();
    if (rawKey.startsWith('"') && rawKey.endsWith('"')) {
      rawKey = rawKey.slice(1, -1);
    }
    // Convertir \n (et \\n si double-échappé) en vrais retours à la ligne
    let privateKey = rawKey.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");
    if (!privateKey.includes("-----END PRIVATE KEY-----")) {
      console.warn("[ai-proxy] ⚠️  FIREBASE_PRIVATE_KEY semble tronquée (pas de -----END PRIVATE KEY-----). Collez la clé sur UNE SEULE LIGNE avec \\n pour les retours à la ligne, ou utilisez FIREBASE_CREDENTIALS_BASE64.");
    }
    serviceAccount = {
      project_id: process.env.FIREBASE_PROJECT_ID.trim(),
      client_email: process.env.FIREBASE_CLIENT_EMAIL.trim(),
      private_key: privateKey,
    };
    console.log("[ai-proxy] ✅ Firebase credentials depuis variables d'environnement, project_id:", serviceAccount.project_id);
  }

  if (serviceAccount) {
    // Écrire un fichier temporaire pour GOOGLE_APPLICATION_CREDENTIALS (Firestore/gRPC)
    const tmpDir = process.env.TMPDIR || process.env.TEMP || "/tmp";
    const tmpCredPath = path.join(tmpDir, "firebase-credentials-railway.json");
    try {
      fs.writeFileSync(tmpCredPath, JSON.stringify(serviceAccount), "utf8");
      process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpCredPath;
      console.log("[ai-proxy] ✅ GOOGLE_APPLICATION_CREDENTIALS défini pour Firestore/gRPC");
    } catch (e) {
      console.warn("[ai-proxy] ⚠️  Impossible d'écrire le fichier credentials temporaire:", e.message);
    }
  }

  const effectiveProjectId = serviceAccount?.project_id || firebaseConfig.projectId;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET
    || process.env.VITE_FIREBASE_STORAGE_BUCKET
    || `${effectiveProjectId}.firebasestorage.app`
    || `${effectiveProjectId}.appspot.com`;

  if (serviceAccount) {
    console.log("[ai-proxy] 🔧 Initialisation de Firebase Admin avec credentials...");
    initializeApp({
      credential: cert(serviceAccount),
      projectId: effectiveProjectId,
      storageBucket,
    });
    console.log("[ai-proxy] ✅ Firebase App initialisée avec credentials, storageBucket:", storageBucket);
  } else {
    console.warn("[ai-proxy] ⚠️  Aucun fichier ni variables FIREBASE_* trouvés, utilisation des Application Default Credentials");
    initializeApp({
      projectId: firebaseConfig.projectId,
      storageBucket,
    });
  }

  console.log("[ai-proxy] 🔧 Initialisation de Firestore...");
  firestore = getFirestore();
  console.log("[ai-proxy] ✅ Firebase Admin initialisé avec succès");
  console.log("[ai-proxy] ✅ Firestore prêt à être utilisé");
} catch (err) {
  console.error("[ai-proxy] ❌ Erreur lors de l'initialisation de Firebase Admin:", err.message);
  console.error("[ai-proxy] Stack:", err.stack);
  console.warn("[ai-proxy] ⚠️  Les webhooks ne pourront pas mettre à jour Firestore");
  firestore = null;
}

const withParams = (urlString, params) => {
  try {
    const url = new URL(urlString);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
    return url.toString();
  } catch (_e) {
    return urlString;
  }
};

const buildPaymentLinkPayload = ({
  amount,
  currency = "EUR",
  description,
  reference,
  customer,
  successUrl,
  cancelUrl,
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
    ? { price: priceId, quantity: 1 }
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

  const effectiveSuccessUrl = withParams(successUrl || STRIPE_SUCCESS_URL, {
    ref: reference || "",
    amount,
    currency,
    source: "stripe",
    status: "success",
  });

  const effectiveCancelUrl = withParams(cancelUrl || STRIPE_CANCEL_URL, {
    ref: reference || "",
    amount,
    currency,
    source: "stripe",
    status: "cancel",
  });

  return {
    line_items: [lineItem],
    after_completion: {
      type: "redirect",
      redirect: { url: effectiveSuccessUrl || STRIPE_SUCCESS_URL },
    },
    metadata: {
      reference: reference || "",
      cancelUrl: effectiveCancelUrl || "",
      customer_name: customer?.name || "",
      customer_email: customer?.email || "",
      customer_phone: customer?.phone || "",
    },
  };
};

app.post("/api/stripe/link", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(400).json({ error: "Stripe not configured" });
    }
    const payload = buildPaymentLinkPayload(req.body);
    const paymentLink = await stripe.paymentLinks.create(payload);
    if (!paymentLink?.url) {
      return res.status(502).json({ error: "No Stripe URL returned", data: paymentLink });
    }
    return res.json({ url: paymentLink.url, id: paymentLink.id });
  } catch (error) {
    console.error("[ai-proxy] Stripe error", error);
    const message = error?.message || "unknown";
    return res.status(500).json({ error: message });
  }
});

// Endpoint de test pour vérifier que le webhook est accessible
app.get("/api/stripe/webhook/test", (req, res) => {
  res.json({
    status: "ok",
    webhookConfigured: Boolean(stripe && STRIPE_WEBHOOK_SECRET),
    stripeConfigured: Boolean(stripe),
    webhookSecretSet: Boolean(STRIPE_WEBHOOK_SECRET),
    firestoreConfigured: Boolean(firestore),
    message: "Webhook endpoint is accessible. Use Stripe CLI: stripe listen --forward-to localhost:5174/api/stripe/webhook",
  });
});

// Route de test Sentry - À RETIRER APRÈS LES TESTS
app.get("/api/test-sentry", (req, res) => {
  try {
    throw new Error("Test Sentry Backend - " + new Date().toISOString());
  } catch (error) {
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(error);
      console.log("[Test Sentry] ✅ Erreur de test envoyée à Sentry");
    } else {
      console.warn("[Test Sentry] ⚠️  SENTRY_DSN non configuré, erreur non envoyée");
    }
    res.status(500).json({ 
      success: false, 
      message: "Erreur de test envoyée à Sentry ! Vérifiez votre dashboard Sentry.",
      error: error.message,
      sentryConfigured: Boolean(process.env.SENTRY_DSN)
    });
  }
});

// Endpoint de test pour vérifier que le webhook Connect est accessible
app.get("/webhooks/stripe/test", (req, res) => {
  res.json({
    status: "ok",
    endpoint: "/webhooks/stripe",
    webhookConfigured: Boolean(stripe && STRIPE_WEBHOOK_SECRET),
    stripeConfigured: Boolean(stripe),
    webhookSecretSet: Boolean(STRIPE_WEBHOOK_SECRET),
    webhookSecretPrefix: STRIPE_WEBHOOK_SECRET ? STRIPE_WEBHOOK_SECRET.substring(0, 10) + '...' : 'missing',
    firestoreConfigured: Boolean(firestore),
    message: "Stripe Connect webhook endpoint is accessible. Configure in Stripe Dashboard: https://api.mbe-sdv.fr/webhooks/stripe",
    instructions: [
      "1. Go to Stripe Dashboard → Developers → Webhooks",
      "2. Add endpoint: https://api.mbe-sdv.fr/webhooks/stripe",
      "3. IMPORTANT: Enable 'Listen to events on Connected accounts'",
      "4. Select events: checkout.session.completed, payment_intent.succeeded",
      "5. Copy the Signing secret and add it to Railway as STRIPE_WEBHOOK_SECRET"
    ]
  });
});

// Webhook Stripe pour mettre à jour Firestore après un paiement réussi
// Body raw déjà appliqué dans le middleware
app.post("/api/stripe/webhook", async (req, res) => {
  console.log("[ai-proxy] 📥 Webhook reçu - Headers:", {
    'stripe-signature': req.headers['stripe-signature'] ? 'present' : 'missing',
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length'],
  });
  
  const hasAnySecret = STRIPE_WEBHOOK_SECRET || STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;
  if (!stripe || !hasAnySecret) {
    console.error("[ai-proxy] ❌ Webhook non configuré:", {
      stripe: Boolean(stripe),
      webhookSecret: Boolean(STRIPE_WEBHOOK_SECRET),
      subscriptionWebhookSecret: Boolean(STRIPE_SUBSCRIPTION_WEBHOOK_SECRET),
    });
    return res.status(400).send("Stripe webhook not configured");
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) {
    console.error("[ai-proxy] ❌ Signature Stripe manquante dans les headers");
    return res.status(400).send("Missing stripe-signature header");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    console.log("[ai-proxy] ✅ Webhook vérifié (plateforme), type:", event.type);
  } catch (err1) {
    if (STRIPE_SUBSCRIPTION_WEBHOOK_SECRET) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_SUBSCRIPTION_WEBHOOK_SECRET);
        console.log("[ai-proxy] ✅ Webhook vérifié (abonnements), type:", event.type);
      } catch (err2) {
        console.error("[ai-proxy] ❌ Erreur de vérification du webhook (les deux secrets ont échoué)");
        return res.status(400).send(`Webhook Error: ${err1.message}`);
      }
    } else {
      console.error("[ai-proxy] ❌ Erreur de vérification du webhook:", err1.message);
      return res.status(400).send(`Webhook Error: ${err1.message}`);
    }
  }

  try {
    const obj = event.data.object || {};
    // #region agent log
    if (event.type === 'checkout.session.completed') {
      console.log('[ai-proxy] 🔍 checkout.session.completed - metadata:', JSON.stringify(obj.metadata || {}), 'customer:', obj.customer ? 'present' : 'missing', 'subscription:', obj.subscription ? 'present' : 'missing');
    }
    // #endregion
    let ref = obj.metadata?.reference || obj.metadata?.ref || null;
    
    // Pour checkout.session.completed, payment_link est un champ direct (plink_xxx)
    // Pour charge.succeeded et payment_intent.succeeded, on doit récupérer le checkout.session
    let linkId = obj.payment_link || obj.payment_link_id || null;
    
    // Si on n'a pas de linkId et qu'on a un payment_intent, récupérer le checkout.session
    if (!linkId && (event.type === "payment_intent.succeeded" || event.type === "charge.succeeded")) {
      try {
        let paymentIntentId = null;
        
        if (event.type === "payment_intent.succeeded") {
          paymentIntentId = obj.id;
        } else if (event.type === "charge.succeeded" && obj.payment_intent) {
          paymentIntentId = obj.payment_intent;
        }
        
        if (paymentIntentId && stripe) {
          console.log("[ai-proxy] 🔍 Récupération du payment_intent:", paymentIntentId);
          // Récupérer le payment_intent pour obtenir le checkout.session
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
          
          console.log("[ai-proxy] Payment Intent récupéré:", {
            id: paymentIntent.id,
            metadata: paymentIntent.metadata,
            charges: paymentIntent.charges?.data?.length || 0,
          });
          
          // Chercher le checkout.session qui utilise ce payment_intent
          // Le payment_intent peut avoir un invoice ou un customer qui pointe vers le checkout.session
          // Mais le plus fiable est de chercher dans les charges récentes
          if (paymentIntent.charges?.data?.length > 0) {
            // Le charge peut avoir un payment_intent qui pointe vers un checkout.session
            // Mais généralement, pour les Payment Links, le checkout.session est créé avec le payment_intent
            // On peut essayer de chercher les checkout.sessions récents avec ce payment_intent
            // Note: Stripe ne permet pas de chercher directement, mais on peut utiliser l'API
            // Pour les Payment Links, le checkout.session a généralement le payment_intent dans son champ payment_intent
            console.log("[ai-proxy] ⚠️  Pour charge/payment_intent, le linkId sera extrait depuis checkout.session.completed");
            console.log("[ai-proxy] ⚠️  Ces événements seront traités uniquement pour Firestore (par référence)");
          }
          
          // Si on a une référence dans les métadonnées, on peut quand même mettre à jour Firestore
          if (paymentIntent.metadata?.reference) {
            ref = paymentIntent.metadata.reference || ref;
            console.log("[ai-proxy] ✅ Référence trouvée dans payment_intent metadata:", ref);
          }
        }
      } catch (retrieveError) {
        console.error("[ai-proxy] ⚠️  Erreur lors de la récupération du payment_intent:", retrieveError.message);
        // Continuer sans linkId, on cherchera par référence
      }
    }
    
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

    // #region agent log
    if (event.type === 'checkout.session.completed' && obj.metadata?.type !== 'plan_subscription' && !obj.metadata?.devisId) {
      console.log('[ai-proxy] ⚠️ checkout.session.completed IGNORÉ (pas devisId, pas plan_subscription) - metadata.type:', obj.metadata?.type, 'keys:', obj.metadata ? Object.keys(obj.metadata) : []);
    }
    // #endregion

    console.log("[ai-proxy] webhook reçu", {
      type: event.type,
      ref,
      linkId,
      paymentLink: obj.payment_link,
      paymentLinkId: obj.payment_link_id,
      objId: obj.id,
      amount,
      currency,
      metadata: obj.metadata,
    });

    // 🔥 STRIPE CONNECT : Si c'est un checkout.session.completed avec metadata.devisId
    // alors c'est un paiement Stripe Connect (pas un Payment Link)
    if (event.type === "checkout.session.completed" && obj.metadata?.devisId) {
      console.log("[ai-proxy] 🔀 Événement Stripe Connect détecté (devisId:", obj.metadata.devisId, "), redirection vers handler Stripe Connect");
      // Importer et appeler le handler Stripe Connect
      const stripeConnectModule = await import('./stripe-connect.js');
      // Créer un objet req/res modifié avec l'event déjà construit
      const modifiedReq = { ...req, stripeEvent: event };
      await stripeConnectModule.handleStripeWebhook(modifiedReq, res, firestore, { sendEmail });
      return; // Important : ne pas continuer le traitement Payment Link
    }

    // 🔥 Paiement plan SaaS : metadata.type === 'plan_subscription'
    if (event.type === "checkout.session.completed" && obj.metadata?.type === 'plan_subscription') {
      const saasAccountId = obj.metadata.saasAccountId;
      const planId = obj.metadata.planId;
      // #region agent log
      console.log('[ai-proxy] 📦 plan_subscription branch - saasAccountId:', saasAccountId, 'planId:', planId, 'firestore:', !!firestore);
      // #endregion
      if (saasAccountId && planId && firestore) {
        try {
          await firestore.collection('saasAccounts').doc(saasAccountId).update({
            planId,
            plan: ['pro', 'ultra'].includes(planId) ? 'pro' : 'free',
            stripeCustomerId: obj.customer || null,
            stripeSubscriptionId: obj.subscription || null,
            updatedAt: Timestamp.now(),
          });
          console.log('[ai-proxy] ✅ Plan activé via Stripe: saasAccountId=' + saasAccountId + ', planId=' + planId);
        } catch (e) {
          console.error('[ai-proxy] ❌ Erreur mise à jour plan après checkout:', e.message, e.code);
        }
      } else {
        // #region agent log
        console.warn('[ai-proxy] ⚠️ plan_subscription SKIP - saasAccountId:', !!saasAccountId, 'planId:', !!planId, 'firestore:', !!firestore);
        // #endregion
      }
      return res.status(200).send('OK');
    }

    // Mettre à jour Firestore pour les paiements réussis
    // On traite aussi payment.link.succeeded qui est l'événement principal pour les Payment Links
    if (
      (event.type === "checkout.session.completed" ||
        event.type === "payment_intent.succeeded" ||
        event.type === "charge.succeeded" ||
        event.type === "payment.link.succeeded")
    ) {
      if (!firestore) {
        console.error("[ai-proxy] ❌ Firestore non initialisé - impossible de mettre à jour le devis");
        // On continue quand même pour désactiver le Payment Link dans Stripe
      } else {
      try {
        let quoteDoc = null;

        // Chercher par référence dans les métadonnées
        if (ref) {
          console.log("[ai-proxy] 🔍 Recherche du devis par référence:", ref);
          const quotesByRef = await firestore
            .collection("quotes")
            .where("reference", "==", ref)
            .limit(1)
            .get();

          if (!quotesByRef.empty) {
            quoteDoc = quotesByRef.docs[0];
            console.log("[ai-proxy] ✅ Devis trouvé par référence:", quoteDoc.id);
          } else {
            console.warn("[ai-proxy] ⚠️  Aucun devis trouvé avec la référence:", ref);
          }
        }

        // Si on n'a pas trouvé par référence, chercher par paymentLinkId dans l'URL
        if (!quoteDoc && linkId) {
          console.log("[ai-proxy] Recherche du devis par paymentLinkId:", linkId);
          const allQuotes = await firestore.collection("quotes").limit(200).get();

          for (const doc of allQuotes.docs) {
            const data = doc.data();
            const paymentLinks = data.paymentLinks || [];
            const hasLink = paymentLinks.some(
              (link) => {
                // Comparer par ID Stripe (plink_xxx)
                if (link.id === linkId || link.url?.includes(linkId)) {
                  return true;
                }
                // Comparer par URL complète si le linkId est dans l'URL
                if (link.url && typeof link.url === 'string' && link.url.includes(linkId)) {
                  return true;
                }
                return false;
              }
            );

            if (hasLink) {
              quoteDoc = doc;
              console.log("[ai-proxy] Devis trouvé par paymentLinkId:", doc.id);
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
              console.log("[ai-proxy] Lien de paiement trouvé et marqué comme payé:", link.id);
              return {
                ...link,
                status: "paid",
                paidAt: Timestamp.now(),
              };
            }
            // Désactiver tous les autres liens actifs pour ce devis
            if (link.status === "active" && linkFound) {
              console.log("[ai-proxy] Désactivation d'un autre lien actif:", link.id);
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

          console.log("[ai-proxy] ✅ Devis mis à jour dans Firestore:", {
            quoteId: quoteDoc.id,
            reference: ref || quoteData.reference,
            linksUpdated: updatedPaymentLinks.length,
          });

          // Email automatique au client (paiement reçu - Payment Link)
          try {
            const saasAccountId = quoteData.saasAccountId;
            let commercialName = "votre MBE";
            if (saasAccountId && firestore) {
              const saasDoc = await firestore.collection("saasAccounts").doc(saasAccountId).get();
              if (saasDoc.exists && saasDoc.data().commercialName) {
                commercialName = saasDoc.data().commercialName;
              }
            }
            const amountEur = amount != null ? Number(amount) / 100 : null;
            const quoteForEmail = {
              ...quoteData,
              id: quoteDoc.id,
              saasAccountId,
              _saasCommercialName: commercialName,
              client: quoteData.client || { name: quoteData.clientName, email: quoteData.clientEmail || quoteData.delivery?.contact?.email },
              delivery: quoteData.delivery,
              reference: quoteData.reference,
            };
            await sendPaymentReceivedEmail(firestore, sendEmail, quoteForEmail, {
              amount: amountEur,
              isPrincipal: true,
            });
          } catch (emailErr) {
            console.error("[ai-proxy] ⚠️ Email paiement reçu non envoyé:", emailErr.message);
          }
        } else {
          console.warn("[ai-proxy] ⚠️  Devis non trouvé pour référence:", ref, "linkId:", linkId);
        }
      } catch (firestoreError) {
        console.error("[ai-proxy] ❌ Erreur mise à jour Firestore:", firestoreError);
        // Ne pas faire échouer le webhook si Firestore échoue
      }
      }
    }
    
    // Désactiver le Payment Link dans Stripe même si Firestore n'est pas configuré
    // C'est la partie la plus importante pour empêcher la réutilisation du lien
    // IMPORTANT: On ne désactive que pour les événements qui contiennent directement le payment_link
    // car charge.succeeded et payment_intent.succeeded n'ont pas le payment_link directement
    const shouldDisableLink = (
      event.type === "checkout.session.completed" ||
      event.type === "payment.link.succeeded"
    );
    
    if (shouldDisableLink && stripe) {
      // Utiliser linkId extrait plus haut, ou obj.payment_link directement
      let paymentLinkIdToDisable = linkId || obj.payment_link || null;
      
      console.log("[ai-proxy] 🔄 Tentative de désactivation du Payment Link:", {
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
          console.log("[ai-proxy] ✅ Payment Link désactivé dans Stripe:", paymentLinkIdToDisable);
        } catch (stripeError) {
          console.error("[ai-proxy] ⚠️  Erreur lors de la désactivation du Payment Link dans Stripe:", {
            error: stripeError.message,
            code: stripeError.code,
            type: stripeError.type,
            paymentLinkId: paymentLinkIdToDisable,
          });
        }
      } else {
        console.warn("[ai-proxy] ⚠️  Impossible de désactiver le Payment Link - ID manquant ou invalide:", {
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
      console.log("[ai-proxy] ℹ️  Événement", event.type, "reçu sans linkId - désactivation du lien gérée par checkout.session.completed");
    }

    return res.status(200).send("ok");
  } catch (err) {
    console.error("[ai-proxy] webhook handler error", err);
    return res.status(500).send("Webhook handler error");
  }
});

// ===== WEBHOOK PAYTWEAK =====
// Paytweak envoie les notifications en POST (JSON) ou GET (query). Pas d'auth requise.
app.post("/api/paytweak/webhook", async (req, res) => {
  let body = req.body;
  if (!body || typeof body !== 'object') body = {};
  return handlePaytweakWebhook(body, res);
});
app.get("/api/paytweak/webhook", async (req, res) => {
  return handlePaytweakWebhook(req.query || {}, res);
});

async function handlePaytweakWebhook(data, res) {
  try {
    const notice = data.notice || data.Notice;
    if (notice !== 'PAYMENT' && notice !== 'PAYMENT ') {
      if (notice) console.log('[paytweak-webhook] Notice ignorée:', notice);
      return res.status(200).send('ok');
    }

    const status = Number(data.Status ?? data.status);
    const orderId = data.order_id || data.orderId;
    const amountRaw = data.amount;
    const linkId = data.link_id || data.linkId;

    if (!orderId) {
      console.warn('[paytweak-webhook] order_id manquant');
      return res.status(200).send('ok');
    }

    // Statuts 5 (autorisé) et 9 (exécuté) = paiement réussi
    if (status !== 5 && status !== 9) {
      console.log('[paytweak-webhook] Statut non payé:', status, 'order_id:', orderId);
      return res.status(200).send('ok');
    }

    const parsed = parsePaytweakOrderId(orderId);
    if (!parsed || (!parsed.devisId && !parsed.groupId && !parsed.reference)) {
      console.warn('[paytweak-webhook] order_id non reconnu:', orderId);
      return res.status(200).send('ok');
    }

    if (!firestore) {
      console.error('[paytweak-webhook] Firestore non initialisé');
      return res.status(500).send('error');
    }

    const amountEur = amountRaw != null ? Number(amountRaw) : null;

    if (parsed.groupId) {
      const groupId = parsed.groupId;
      const groupDoc = await firestore.collection('shipmentGroups').doc(groupId).get();
      if (!groupDoc.exists) {
        console.warn('[paytweak-webhook] Groupe non trouvé:', groupId);
        return res.status(200).send('ok');
      }
      const groupData = groupDoc.data();
      const devisIds = groupData.devisIds || [];

      await firestore.collection('shipmentGroups').doc(groupId).update({
        status: 'paid',
        paidAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      for (const devisId of devisIds) {
        const quoteDoc = await firestore.collection('quotes').doc(devisId).get();
        if (!quoteDoc.exists) continue;
        const quoteData = quoteDoc.data();
        const paymentLinks = (quoteData.paymentLinks || []).map((link) => {
          const matches = linkId ? ((link.url && String(link.url).includes(linkId)) || link.id === linkId) : (link.status === 'active' || link.status === 'pending');
          return matches ? { ...link, status: 'paid', paidAt: Timestamp.now() } : link.status === 'active' ? { ...link, status: 'expired' } : link;
        });
        await quoteDoc.ref.update({
          paymentLinks,
          paymentStatus: 'paid',
          status: 'awaiting_collection',
          timeline: (quoteData.timeline || []).concat({
            id: `tl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            date: Timestamp.now(),
            status: 'paid',
            description: 'Paiement reçu et confirmé (Paytweak)',
            user: 'system',
          }),
          updatedAt: Timestamp.now(),
        });

        try {
          const saasAccountId = quoteData.saasAccountId;
          let commercialName = 'votre MBE';
          if (saasAccountId) {
            const saasDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
            if (saasDoc.exists && saasDoc.data().commercialName) commercialName = saasDoc.data().commercialName;
          }
          const quoteForEmail = {
            ...quoteData,
            id: quoteDoc.id,
            saasAccountId,
            _saasCommercialName: commercialName,
            client: quoteData.client || { name: quoteData.clientName, email: quoteData.clientEmail },
          };
          await sendPaymentReceivedEmail(firestore, sendEmail, quoteForEmail, { amount: amountEur, isPrincipal: true });
        } catch (e) {
          console.error('[paytweak-webhook] Email:', e.message);
        }
      }
      console.log('[paytweak-webhook] Groupe payé:', groupId, devisIds.length, 'devis');
    } else {
      let quoteDoc = null;
      if (parsed.devisId) {
        quoteDoc = await firestore.collection('quotes').doc(parsed.devisId).get();
      } else if (parsed.reference) {
        const refSnap = await firestore.collection('quotes').where('reference', '==', parsed.reference).limit(1).get();
        quoteDoc = refSnap.empty ? null : refSnap.docs[0];
      }
      if (!quoteDoc || !quoteDoc.exists) {
        console.warn('[paytweak-webhook] Devis non trouvé:', parsed.devisId || parsed.reference);
        return res.status(200).send('ok');
      }
      const devisId = quoteDoc.id;
      const quoteData = quoteDoc.data();
      const paymentLinks = (quoteData.paymentLinks || []).map((link) => {
        const matches = linkId ? ((link.url && String(link.url).includes(linkId)) || link.id === linkId) : (link.status === 'active' || link.status === 'pending');
        return matches ? { ...link, status: 'paid', paidAt: Timestamp.now() } : link.status === 'active' ? { ...link, status: 'expired' } : link;
      });

      await quoteDoc.ref.update({
        paymentLinks,
        paymentStatus: 'paid',
        status: 'awaiting_collection',
        timeline: (quoteData.timeline || []).concat({
          id: `tl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          date: Timestamp.now(),
          status: 'paid',
          description: 'Paiement reçu et confirmé (Paytweak)',
          user: 'system',
        }),
        updatedAt: Timestamp.now(),
      });

      try {
        const saasAccountId = quoteData.saasAccountId;
        let commercialName = 'votre MBE';
        if (saasAccountId) {
          const saasDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
          if (saasDoc.exists && saasDoc.data().commercialName) commercialName = saasDoc.data().commercialName;
        }
        const quoteForEmail = {
          ...quoteData,
          id: quoteDoc.id,
          saasAccountId,
          _saasCommercialName: commercialName,
          client: quoteData.client || { name: quoteData.clientName, email: quoteData.clientEmail },
        };
        await sendPaymentReceivedEmail(firestore, sendEmail, quoteForEmail, { amount: amountEur, isPrincipal: true });
      } catch (e) {
        console.error('[paytweak-webhook] Email:', e.message);
      }
      console.log('[paytweak-webhook] Devis payé:', devisId);
    }

    return res.status(200).send('ok');
  } catch (err) {
    console.error('[paytweak-webhook] Erreur:', err);
    return res.status(500).send('error');
  }
}

/**
 * Convertit un buffer en base64
 */
function bufferToBase64(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

/**
 * OCR (Tesseract) + pré-traitement image
 * Objectif: extraire du TEXTE fiable, puis parser (pas d'hallucination).
 */
let ocrWorkerPromise = null;
async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      // tesseract.js v6: fra+eng, OEM 3 (DEFAULT/automatique recommandé), PSM 6 (bloc uniforme documents)
      const worker = await createWorker("fra+eng", 3, {
        logger: (m) => {
          if (m?.status && (m.status === "initializing" || m.status === "recognizing text")) {
            console.log("[OCR]", m.status, m.progress ?? "");
          }
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: "6", // bloc uniforme (idéal bordereaux)
        preserve_interword_spaces: "1",
      });
      return worker;
    })();
  }
  return ocrWorkerPromise;
}

async function runOcrOnImage(buffer) {
  const worker = await getOcrWorker();

  // Préprocessing: binarisation recommandée pour documents (guide: threshold 150).
  // Triple passe: threshold 150 (documents), 180, ou sans binarisation (texte fin).
  const targetWidth = 3000; // ~300 DPI pour page A4
  const variants = [
    async () =>
      sharp(buffer)
        .rotate()
        .grayscale()
        .normalize()
        .threshold(150)
        .sharpen()
        .resize({ width: targetWidth, withoutEnlargement: false })
        .png()
        .toBuffer(),
    async () =>
      sharp(buffer)
        .rotate()
        .grayscale()
        .normalize()
        .threshold(180)
        .sharpen()
        .resize({ width: targetWidth, withoutEnlargement: false })
        .png()
        .toBuffer(),
    async () =>
      sharp(buffer)
        .rotate()
        .grayscale()
        .normalize()
        .sharpen()
        .resize({ width: targetWidth, withoutEnlargement: false })
        .png()
        .toBuffer(),
  ];

  let best = null;
  for (const makeBuf of variants) {
    const img = await makeBuf();
    const r = await worker.recognize(img);
    const text = (r?.data?.text || "").replace(/\r/g, "");
    const confidence = r?.data?.confidence ?? 0;
    const words = Array.isArray(r?.data?.words) ? r.data.words : [];
    const score = confidence * 10 + Math.min(3000, text.length);
    if (!best || score > best.score) {
      best = { text, confidence, words, score };
    }
  }

  return { text: best?.text || "", confidence: best?.confidence, words: best?.words || [] };
}

/**
 * Tente d'extraire le texte d'un PDF natif (sans OCR).
 * Retourne { pages, ocrRawText } si succès et PDF semble natif (>50 caractères), sinon null.
 */
async function extractTextFromNativePdf(pdfBuffer, log = () => {}) {
  const tempPath = path.join(__dirname, `.temp-pdf-text-${Date.now()}.pdf`);
  let stdout = "";
  let stderr = "";
  try {
    await fs.promises.writeFile(tempPath, pdfBuffer);
    const workerPath = path.join(__dirname, "ocr-pdf-text-extract.mjs");
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [workerPath, tempPath], {
        cwd: path.dirname(workerPath),
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { stderr += d.toString(); });
      child.on("close", (code) => {
        try {
          const out = JSON.parse(stdout || stderr || "{}");
          resolve(out);
        } catch {
          reject(new Error((stderr || stdout).trim() || `Worker exited ${code}`));
        }
      });
      child.on("error", reject);
    });
    if (result.error) return null;
    if (!result.isNative || (result.charCount ?? 0) < 50) {
      log(`[OCR]   → PDF détecté comme scanné (${result.charCount ?? 0} caractères) — utilisation Tesseract`);
      return null;
    }
    log(`[OCR]   → PDF natif détecté (${result.charCount} caractères) — extraction directe sans OCR`);
    return { pages: result.pages, ocrRawText: result.ocrRawText || "" };
  } catch (err) {
    return null;
  } finally {
    try { await fs.promises.unlink(tempPath); } catch {}
  }
}

/**
 * Rend les pages PDF en PNG.
 * 1. Essaie le worker Node (pdfjs+canvas) — peut échouer sur Linux/Railway
 *    avec "Failed to unwrap exclusive reference of CanvasElement"
 * 2. Si échec, fallback vers le script Python (pdf2image+poppler)
 */
async function renderPdfToPngBuffers(pdfBuffer, { maxPages = 10 } = {}) {
  const tempPath = path.join(__dirname, `.temp-pdf-${Date.now()}.pdf`);
  let stdout = "";
  let stderr = "";

  const readPngResult = (result) => {
    const { pngPaths, pageCount, renderedPages } = result;
    const buffers = [];
    for (const p of pngPaths) {
      buffers.push(fs.promises.readFile(p));
    }
    return Promise.all(buffers).then((bufs) => ({
      buffers: bufs,
      pageCount: pageCount ?? pngPaths.length,
      renderedPages: renderedPages ?? pngPaths.length,
    }));
  };

  const cleanupPngs = async (pngPaths) => {
    for (const p of pngPaths || []) {
      try { await fs.promises.unlink(p); } catch {}
    }
    if (pngPaths?.[0]) {
      try { await fs.promises.rmdir(path.dirname(pngPaths[0])); } catch {}
    }
  };

  try {
    await fs.promises.writeFile(tempPath, pdfBuffer);
    console.log("[PDF] Wrote temp file, spawning worker...");

    // 1. Essai worker Node (pdfjs+canvas)
    const workerPath = path.join(__dirname, "ocr-pdf-worker.mjs");
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [workerPath, tempPath], {
          cwd: path.dirname(workerPath),
          stdio: ["ignore", "pipe", "pipe"],
        });
        let out = "";
        let err = "";
        child.stdout.on("data", (d) => { out += d.toString(); });
        child.stderr.on("data", (d) => { err += d.toString(); });
        child.on("close", (code) => {
          if (code !== 0) {
            try {
              const parsed = JSON.parse(err || out);
              reject(new Error(parsed.error || `Worker exited ${code}`));
            } catch {
              reject(new Error((err || out).trim() || `Worker exited ${code}`));
            }
          } else {
            try {
              resolve(JSON.parse(out));
            } catch {
              reject(new Error("Worker output invalide: " + out.slice(0, 200)));
            }
          }
        });
        child.on("error", reject);
      });

      const { buffers, pageCount, renderedPages } = await readPngResult(result);
      await cleanupPngs(result.pngPaths);
      console.log("[PDF] Successfully rendered", renderedPages, "pages via Node worker");
      return { buffers, pageCount, renderedPages };
    } catch (nodeErr) {
      const msg = (nodeErr?.message || "").toLowerCase();
      const code = (nodeErr?.code || "").toLowerCase();
      const isCanvasError =
        msg.includes("unwrap") ||
        msg.includes("canvas") ||
        msg.includes("napi") ||
        msg.includes("canvaselement") ||
        code === "invalidarg";
      if (!isCanvasError) throw nodeErr;
      console.warn("[PDF] Node worker failed (canvas issue), trying Python fallback:", nodeErr.message);
    }

    // 2. Fallback: script Python (pdf2image+poppler)
    const pythonScript = path.join(__dirname, "scripts", "pdf-to-png.py");
    if (!fs.existsSync(pythonScript)) {
      throw new Error("Python fallback script not found: " + pythonScript);
    }
    const py = process.platform === "win32" ? "python" : "python3";
    const result = await new Promise((resolve, reject) => {
      stdout = "";
      stderr = "";
      const child = spawn(py, [pythonScript, tempPath, String(maxPages)], {
        cwd: path.dirname(pythonScript),
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { stderr += d.toString(); });
      child.on("close", (code) => {
        if (code !== 0) {
          try {
            const err = JSON.parse(stderr || stdout);
            reject(new Error(err.error || `Python script exited ${code}`));
          } catch {
            reject(new Error((stderr || stdout).trim() || `Python exited ${code}`));
          }
        } else {
          try {
            resolve(JSON.parse(stdout));
          } catch {
            reject(new Error("Python output invalide: " + stdout.slice(0, 200)));
          }
        }
      });
      child.on("error", (e) => reject(new Error(`Python not found: ${e.message}`)));
    });

    const { buffers, pageCount, renderedPages } = await readPngResult(result);
    await cleanupPngs(result.pngPaths);
    console.log("[PDF] Successfully rendered", renderedPages, "pages via Python (pdf2image)");
    return { buffers, pageCount, renderedPages };
  } catch (err) {
    console.error("[PDF] Error:", err.message);
    throw err;
  } finally {
    try { await fs.promises.unlink(tempPath); } catch {}
  }
}

function normalizeAmountStrict(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/\u00A0/g, " ").replace(/EUR/gi, "").replace(/€/g, "");
  s = s.replace(/[^\d.,\s]/g, "").replace(/\s+/g, "");
  if (!s) return null;
  // 1.200,00 -> 1200.00
  if (s.includes(".") && s.includes(",")) {
    s = s.replace(/\./g, "").replace(/,/g, ".");
  } else if (s.includes(",")) {
    s = s.replace(/,/g, ".");
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeDateToISO(raw) {
  if (!raw) return null;
  const s = String(raw);
  let m = s.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const yyyy = m[3];
    // Heuristique:
    // - si a > 12 => DD/MM
    // - si b > 12 => MM/DD
    // - si ambiguous (<=12/<=12) => null (pas d'invention)
    if (a > 12) return `${yyyy}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    if (b > 12) return `${yyyy}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
    return null;
  }
  m = s.match(/(\d{4})[\/.-](\d{2})[\/.-](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function normalizeDateToISOWithHint(raw, { preferMDY = false } = {}) {
  if (!raw) return null;
  const s = String(raw);
  const m = s.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);
  if (!m) return normalizeDateToISO(raw);
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  const yyyy = m[3];
  if (a > 12) return `${yyyy}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`; // DMY
  if (b > 12) return `${yyyy}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`; // MDY
  // ambiguous: use hint if provided, otherwise null
  if (preferMDY) return `${yyyy}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
  return null;
}

/** Numéro de lot plausible (petit entier, pas date, pas prix) */
function isPlausibleLotNumber(raw) {
  if (raw == null || raw === "") return false;
  const s = String(raw).trim();
  const m = s.match(/^\d{1,4}$/);
  if (!m) return false;
  const n = parseInt(m[0], 10);
  if (n > 9999) return false;
  if (n <= 0) return false;
  return true;
}

/**
 * Templates de bordereaux — zoning par maison de vente
 * millon: Invoice No. + Lot/Description/Hammer
 * boisgirard: BORDEREAU ACQUEREUR + Ligne/Description/Adjudication — zone lots vs zone fiscale
 */
const BORDEREAU_TEMPLATES = {
  millon: {
    lotHeaderKeywords: ["lot", "description", "hammer"],
    financialKeywords: ["total", "iban", "invoice total"],
  },
  boisgirard: {
    lotHeaderKeywords: ["ligne", "description", "adjudication"],
    financialKeywords: ["taux", "base adjug", "base ht", "total ht", "frais engag", "frais drouot", "somme à payer"],
  },
};

function detectBordereauTemplate(ocrText) {
  const text = String(ocrText || "").toLowerCase();
  if (text.includes("boisgirard") || text.includes("bordereau acquereur")) return "boisgirard";
  if (text.includes("millon") || text.includes("riviera") || /\binvoice\s+no\./i.test(text)) return "millon";
  return null;
}

/**
 * Détecte la zone tableau sur une page (zones logiques du document).
 * Les lots ne peuvent exister que dans cette zone.
 * @param {{ words: Array, lines?: Array }} page - Page avec words (et optionnellement lines)
 * @param {string|null} template - 'millon' | 'boisgirard' | null
 * @returns {{ headerY: number|null, tableStartY: number, tableEndY: number }|null}
 */
function detectTableZone(page, template = null) {
  const words = (page.words || []).filter(
    (w) => w && w.text && w.bbox && typeof w.bbox.y0 === "number"
  );
  if (words.length === 0) return null;

  const sorted = words
    .map((w) => ({
      ...w,
      y: (w.bbox.y0 + w.bbox.y1) / 2,
    }))
    .sort((a, b) => a.y - b.y);
  const yThreshold = 12;
  const rows = [];
  for (const w of sorted) {
    const last = rows[rows.length - 1];
    if (!last || Math.abs(last.y - w.y) > yThreshold) {
      rows.push({ y: w.y, words: [w] });
    } else {
      last.words.push(w);
      last.y = (last.y * (last.words.length - 1) + w.y) / last.words.length;
    }
  }
  for (const r of rows) r.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);

  const minY = Math.min(...words.map((w) => w.bbox.y0));
  const maxY = Math.max(...words.map((w) => w.bbox.y1));

  let headerY = null;
  const tpl = template && BORDEREAU_TEMPLATES[template];

  if (tpl) {
    // Boisgirard: header doit contenir Ligne + Description + Adjudication (simultanément)
    if (template === "boisgirard") {
      for (const row of rows) {
        const full = row.words.map((w) => w.text).join(" ").toLowerCase();
        const hasAll = ["ligne", "description", "adjudication"].every((k) => full.includes(k));
        if (hasAll) {
          headerY = row.y;
          break;
        }
      }
    } else {
      for (const row of rows) {
        const full = row.words.map((w) => w.text).join(" ").toLowerCase();
        const hasLot = /lot|ligne|num[eé]ro|n[°o]\.?/i.test(full);
        const hasDescOrPrice = /description|hammer|price|adjudication|prix/i.test(full);
        if (hasLot && hasDescOrPrice) {
          headerY = row.y;
          break;
        }
      }
    }
  } else {
    for (const row of rows) {
      const full = row.words.map((w) => w.text).join(" ").toLowerCase();
      const hasLot = /lot|ligne|num[eé]ro|n[°o]\.?/i.test(full);
      const hasDescOrPrice = /description|hammer|price|adjudication|prix/i.test(full);
      if (hasLot && hasDescOrPrice) {
        headerY = row.y;
        break;
      }
    }
  }

  let footerY = null;
  const footerRe = tpl
    ? new RegExp(tpl.financialKeywords.join("|"), "i")
    : /total|iban|bank|paiement|payment|commission|r[eé]gl[eé]|invoice\s+total|montant|amount/i;
  for (const row of rows) {
    if (headerY !== null && row.y <= headerY + 5) continue;
    const full = row.words.map((w) => w.text).join(" ").toLowerCase();
    if (footerRe.test(full)) {
      footerY = row.y;
      break;
    }
  }

  const margin = 8;
  return {
    headerY,
    tableStartY: headerY !== null ? headerY + margin : minY,
    tableEndY: footerY !== null ? footerY - margin : maxY,
  };
}

/**
 * Filtre les mots pour ne garder que ceux dans la zone tableau.
 */
function filterWordsByTableZone(words, zone) {
  if (!zone) return words;
  const { tableStartY, tableEndY } = zone;
  return words.filter((w) => {
    const y = (w.bbox?.y0 + w.bbox?.y1) / 2;
    return y >= tableStartY && y <= tableEndY;
  });
}

/**
 * Filtre les lignes pour ne garder que celles dans la zone tableau.
 */
function filterLinesByTableZone(lines, zone) {
  if (!zone || !lines?.length) return lines || [];
  const { tableStartY, tableEndY } = zone;
  return lines.filter((line) => {
    const words = line.words || [];
    if (words.length === 0) return true; // garder si pas de bbox
    const y = words.reduce((s, w) => s + (w.bbox?.y0 + w.bbox?.y1) / 2, 0) / words.length;
    return y >= tableStartY && y <= tableEndY;
  });
}

function buildLinesFromWords(words) {
  const cleaned = (words || [])
    .filter((w) => w && typeof w.text === "string" && w.text.trim() && w.bbox)
    .map((w) => ({
      text: w.text.trim(),
      bbox: w.bbox,
      x: (w.bbox.x0 + w.bbox.x1) / 2,
      y: (w.bbox.y0 + w.bbox.y1) / 2,
    }));
  if (cleaned.length === 0) return [];
  const minX = Math.min(...cleaned.map((w) => w.bbox.x0));
  const maxX = Math.max(...cleaned.map((w) => w.bbox.x1));
  const minY = Math.min(...cleaned.map((w) => w.bbox.y0));
  const maxY = Math.max(...cleaned.map((w) => w.bbox.y1));
  const W = Math.max(1, maxX - minX);
  const H = Math.max(1, maxY - minY);

  const sorted = cleaned
    .map((w) => ({
      ...w,
      xn: (w.x - minX) / W,
      yn: (w.y - minY) / H,
      x0n: (w.bbox.x0 - minX) / W,
      x1n: (w.bbox.x1 - minX) / W,
    }))
    .sort((a, b) => a.yn - b.yn || a.x0n - b.x0n);

  const rows = [];
  const yThreshold = 0.012;
  for (const w of sorted) {
    const last = rows[rows.length - 1];
    if (!last || Math.abs(last.yn - w.yn) > yThreshold) {
      rows.push({ yn: w.yn, words: [w] });
    } else {
      last.words.push(w);
      last.yn = (last.yn * (last.words.length - 1) + w.yn) / last.words.length;
    }
  }
  for (const r of rows) r.words.sort((a, b) => a.x0n - b.x0n);
  return rows.map((r) => ({
    yn: r.yn,
    text: r.words.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim(),
    words: r.words,
    x0: Math.min(...r.words.map((w) => w.x0n)),
    x1: Math.max(...r.words.map((w) => w.x1n)),
  }));
}

function extractSalleVenteFromHeader(lines) {
  const header = lines.filter((l) => l.yn <= 0.22);
  const blacklist = [
    "bordereau",
    "acquereur",
    "acheteur",
    "invoice",
    "facture",
    "total",
    "lot",
    "description",
    "adjudication",
    "buyer",
    "premium",
    "vos réfs",
    "vos refs",
  ];
  const candidates = header
    .map((l) => {
      const center = (l.x0 + l.x1) / 2;
      const letters = (l.text.match(/[A-Za-zÀ-ÿ]/g) || []).length;
      return { ...l, center, letters };
    })
    .filter((l) => {
      const low = l.text.toLowerCase();
      if (blacklist.some((b) => low.includes(b))) return false;
      if (l.letters < 6) return false;
      if (l.text.length > 80) return false;
      // haut-centre typique
      if (l.center < 0.30 || l.center > 0.70) return false;
      return true;
    })
    .sort((a, b) => a.yn - b.yn);
  if (candidates.length === 0) return null;
  return candidates[0].text || null;
}

function extractHeaderFields(lines) {
  const header = lines.filter((l) => l.yn <= 0.30);
  const allText = header.map((l) => l.text).join("\n");

  // numero_bordereau / invoice
  // PRIORITÉ 1: BORDEREAU ACQUEREUR N° (format Boisgirard Antonini et autres)
  let numero_bordereau = null;
  const bordereauAcquereurMatch = allText.match(/BORDEREAU\s+ACQU[ÉE]REUR\s*N[°ºo]?\s*(\d{3,8})/i);
  if (bordereauAcquereurMatch) {
    numero_bordereau = bordereauAcquereurMatch[1];
  }
  // PRIORITÉ 2: Invoice No. XXX-YY (format Millon: 0260-25 = vente-lot)
  if (!numero_bordereau) {
    const invoiceHyphen = allText.match(/\bInvoice\s*No\.?\s*[:#]?\s*(\d{3,4}\s*-\s*\d{2,3})\b/i);
    if (invoiceHyphen) numero_bordereau = invoiceHyphen[1].replace(/\s+/g, "").trim();
  }
  // PRIORITÉ 3: Invoice No. ou Facture N° générique (avec ou sans tiret)
  if (!numero_bordereau) {
    const numRegexes = [
      /\bInvoice\s*No\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-]{3,})\b/i,
      /\b(?:facture|bordereau)\s*(?:no\.?|n°|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/]{3,})\b/i,
    ];
    for (const re of numRegexes) {
      const m = allText.match(re);
      if (m) {
        numero_bordereau = m[1];
        break;
      }
    }
  }

  // vente (nom / référence)
  let vente = null;
  const venteMatch =
    allText.match(/\b(?:sale\s*no\.?|vente\s*(?:n°|no\.?)?)\s*[:#]?\s*([A-Z0-9\-\/ ]{3,})/i) ||
    allText.match(/\b(?:nom\s+de\s+la\s+vente|sale\s*title)\s*[:#]?\s*(.+)$/im);
  if (venteMatch) {
    vente = (venteMatch[1] || "").trim().replace(/\s+/g, " ") || null;
  }

  // date
  let date = null;
  const dateText =
    allText.match(/\b(?:date|vente\s+du|invoice\s+date|dated)\b[^0-9]{0,20}(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i) ||
    allText.match(/(\d{2}[\/.-]\d{2}[\/.-]\d{4})/);
  if (dateText) {
    const raw = dateText[1] || dateText[0];
    // si "dated" ou "Sale No." présent, le document est souvent en anglais (MM/DD/YYYY)
    const preferMDY = /\bdated\b/i.test(allText) || /\bsale\s*no\b/i.test(allText);
    date = normalizeDateToISOWithHint(raw, { preferMDY });
  }

  return { numero_bordereau, vente, date };
}

function extractTotalFromLines(lines) {
  // Certains documents placent le total au milieu-bas (pas forcément en footer strict).
  const footer = lines.filter((l) => l.yn >= 0.45);
  const key = /(total\s*invoice|invoice\s*total|facture\s*total|total\s*facture|montant\s*total|total\s*ttc)/i;
  const amountRe = /(\d{1,3}(?:[ \u00A0.,]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)/g;

  for (let i = 0; i < footer.length; i++) {
    const t = footer[i].text;
    if (!key.test(t)) continue;
    const matches = [...t.matchAll(amountRe)].map((m) => m[0]);
    if (matches.length) return normalizeAmountStrict(matches[matches.length - 1]);
    const next = footer[i + 1]?.text || "";
    const m2 = [...next.matchAll(amountRe)].map((m) => m[0]);
    if (m2.length) return normalizeAmountStrict(m2[m2.length - 1]);
  }

  // fallback global: dernière occurrence dans toute la page
  const all = lines.map((l) => l.text).join("\n");
  const globalMatch = all.match(
    /(total\s*invoice|invoice\s*total|facture\s*total|total\s*facture|montant\s*total|total\s*ttc)[\s\S]{0,80}?(\d[\d\s\u00A0.,]*\d)/i
  );
  if (globalMatch) return normalizeAmountStrict(globalMatch[2]);
  return null;
}

function extractFromOcrTextFallback(ocrText) {
  const out = {
    salle_vente: null,
    vente: null,
    numero_bordereau: null,
    date: null,
    total: null,
    lots: [],
  };

  const text = String(ocrText || "");
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Salle: mots-clés fréquents + ligne header.
  // Règle: si ambigu -> null (pas d'invention)
  const sallePatterns = [
    { re: /millon\s+riviera/i, value: "Millon Riviera" },
    { re: /boisgirard\s*[-•]?\s*antonini/i, value: "Boisgirard Antonini" },
    { re: /(?:nice\s+ench[eè]res?|sarl\s+nice\s+encheres?)/i, value: "Nice Enchères" },
    { re: /\bdrouot\b/i, value: "Drouot" },
    { re: /\bartcurial\b/i, value: "Artcurial" },
    { re: /\btajan\b/i, value: "Tajan" },
  ];
  for (const p of sallePatterns) {
    if (lines.some((l) => p.re.test(l))) {
      out.salle_vente = p.value;
      break;
    }
  }

  // Invoice No. — priorité au format XXX-YY (ex: 0260-25)
  const invHyphen = text.match(/\bInvoice\s*No\.?\s*[:#]?\s*(\d{3,4}\s*-\s*\d{2,3})\b/i);
  if (invHyphen) out.numero_bordereau = invHyphen[1].replace(/\s+/g, "");
  else {
    const inv = text.match(/\bInvoice\s*No\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/]{2,})\b/i);
    if (inv) out.numero_bordereau = inv[1];
  }
  // Bordereau acquéreur N° - Regex ROBUSTE (AVANT tout cleaning)
  if (!out.numero_bordereau) {
    const b = text.match(/BORDEREAU\s+ACQU[ÉE]REUR\s*N[°ºo]?\s*(\d{3,8})/i);
    if (b) {
      out.numero_bordereau = b[1];
      console.log(`[OCR][Bordereau] Numéro extrait depuis fallback: ${out.numero_bordereau}`);
    }
  }
  // TEMIS BORDEREAU D'ADJUDICATION N° (souvent en footer) — format "A - 4187 - 62" (éviter capture "Vente n°")
  if (!out.numero_bordereau) {
    const temis = text.match(/(?:TEMIS\s+)?BORDEREAU\s+D'?ADJUDICATION\s+N[°ºo]?\s*([A-Z]\s*-\s*\d+\s*-\s*\d+)/i);
    if (temis) out.numero_bordereau = temis[1].replace(/\s*-\s*/g, "-").replace(/\s+/g, "").trim();
  }

  // Vente / référence
  const saleLine = lines.find((l) => /\bSale\s*No\.?\b/i.test(l));
  if (saleLine) out.vente = saleLine.replace(/\s+/g, " ").trim();

  // Date (dated 11/19/2025)
  const dated = text.match(/\bdated\b[^0-9]{0,20}(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i);
  if (dated) out.date = normalizeDateToISOWithHint(dated[1], { preferMDY: true });
  // Date FR: Vente du : 27/11/2025
  if (!out.date) {
    const venteDu = text.match(/\bVente\s+du\s*:\s*(\d{2}[\/.-]\d{2}[\/.-]\d{4})/i);
    if (venteDu) out.date = normalizeDateToISOWithHint(venteDu[1], { preferMDY: false });
  }
  if (!out.date) {
    const anyDate = text.match(/(\d{2}[\/.-]\d{2}[\/.-]\d{4})/);
    if (anyDate) {
      const preferMDY = /\bSale\s*No\b/i.test(text) || /\bdated\b/i.test(text);
      out.date = normalizeDateToISOWithHint(anyDate[1], { preferMDY });
    }
  }

  // Total invoice
  const totalMatch = text.match(/\bTotal\s*invoice\b[\s:]*([0-9][0-9\s\u00A0.,]*\d)\s*(?:€|EUR)?/i);
  if (totalMatch) out.total = normalizeAmountStrict(totalMatch[1]);
  // Total FR: "Réglé le ... le montant de 77,00 €."
  if (out.total === null) {
    const regle = text.match(/\bRéglé\s+le\b[\s\S]{0,120}?\bmontant\s+de\b\s*([0-9][0-9\s\u00A0.,]*\d)\s*(?:€|EUR)?/i);
    if (regle) out.total = normalizeAmountStrict(regle[1]);
  }

  // Détecter si c'est un bordereau Boisgirard Antonini
  const isBoisgirardAntonini = /boisgirard|antonini/i.test(text);
  
  // Lots:
  // 1) EN: "Lot number  Description  Hammer price"
  // 2) FR: lignes qui se terminent par un prix (ex: "... XFS 60,00")
  // 3) BOISGIRARD ANTONINI: "Ligne Références Description Adjudication" avec deux nombres identiques
  const tableHeaderIdx = lines.findIndex(
    (l) => /lot\s*number/i.test(l) && /description/i.test(l) && /(hammer\s*price|adjudication|prix)/i.test(l)
  );
  
  // Détecter l'en-tête spécifique Boisgirard Antonini
  const boisgirardHeaderIdx = lines.findIndex(
    (l) => /ligne\s+réf\S*\s+description\s+adjudication/i.test(l)
  );

  const stopLineRe = /(total\s*invoice|invoice\s*total|facture\s*total|montant\s*total|réglé\s+le|paiement|iban|bic|tva|frais|page\s+\d+\s+sur|\d+\s+lot\(s\))/i;
  const isNoise = (l) => stopLineRe.test(l);

  // MODE SPÉCIFIQUE BOISGIRARD ANTONINI : parsing depuis prix vers deux nombres identiques (OCR bruité)
  if (isBoisgirardAntonini && (boisgirardHeaderIdx >= 0 || out.lots.length === 0)) {
    console.log('[OCR][BA] Mode parsing depuis texte brut (en-tête détecté ou fallback)');
    
    // Découper par prix (chaque prix = 1 lot potentiel)
    // Pattern prix avec décimales: "60,00" ou "60.00"
    const pricePattern = /(\d{1,3}[,\u00A0.]\d{2})\s*(?:€|EUR)?/g;
    const prices = [];
    let priceMatch;
    while ((priceMatch = pricePattern.exec(text)) !== null) {
      // Ignorer les prix qui sont dans des contextes non-lot (dates, numéros de téléphone, etc.)
      const contextStart = Math.max(0, priceMatch.index - 50);
      const contextEnd = Math.min(text.length, priceMatch.index + priceMatch[0].length + 50);
      const context = text.substring(contextStart, contextEnd);
      
      // Ignorer si c'est dans un contexte de date, téléphone, ou total
      if (/total|réglé|date|tél|phone|iban|bic/i.test(context)) {
        continue;
      }
      
      prices.push({
        price: priceMatch[1],
        index: priceMatch.index,
        fullMatch: priceMatch[0]
      });
    }
    
    console.log(`[OCR][BA] ${prices.length} prix détecté(s)`);
    
    for (const priceInfo of prices) {
      // Remonter dans les 100-200 caractères précédents pour trouver deux nombres identiques
      const startIdx = Math.max(0, priceInfo.index - 200);
      const context = text.substring(startIdx, priceInfo.index);
      
      // Chercher deux nombres identiques proches (pattern: nombre espace nombre)
      // Regex améliorée: cherche deux nombres séparés par des espaces/tabs
      const doubleNumberPattern = /(?:^|\n|\s)(\d{1,4})(\s+)(\d{1,4})(\s+)/;
      const doubleMatch = context.match(doubleNumberPattern);
      
      if (doubleMatch) {
        const [, num1, , num2] = doubleMatch;
        
        // Vérifier que les deux nombres sont identiques (signal fiable)
        if (num1 === num2) {
          // Vérifier que ce n'est pas une date ou un numéro de téléphone
          const isDate = /\d{2}[\/.-]\d{2}[\/.-]\d{4}/.test(context);
          const isPhone = /\+?\d{2,3}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}/.test(context);
          
          if (!isDate && !isPhone) {
            const lotNumber = num1;
            const prix_marteau = normalizeAmountStrict(priceInfo.price);
            
            // Extraire la description (entre les deux nombres et le prix)
            const descStart = startIdx + (doubleMatch.index || 0) + doubleMatch[0].length;
            const descEnd = priceInfo.index;
            let description = text.substring(descStart, descEnd)
              .replace(/\s+/g, " ")
              .trim();
            
            // Nettoyer la description (enlever références, codes, etc.)
            description = description
              .replace(/^[A-Z]{2,}[A-Z0-9]*\s*/i, "") // Enlever codes comme "XF5"
              .replace(/\d{1,3}[,\u00A0.]\d{2}\s*(?:€|EUR)?$/, "") // Enlever prix en fin
              .trim();
            
            console.log(`[OCR][BA] Prix trouvé: ${priceInfo.price}, Nombres candidats: ${num1} / ${num2}, Lot validé: ${lotNumber}`);
            
            if (description.length > 5) {
              out.lots.push({
                numero_lot: lotNumber,
                description: description,
                prix_marteau: prix_marteau
              });
            }
          }
        }
      }
    }
    
    console.log(`[OCR][BA] ${out.lots.length} lot(s) extrait(s) depuis texte brut`);
    
    // Si on a trouvé des lots, on retourne directement (sans continuer avec les patterns classiques)
    if (out.lots.length > 0) {
      return out;
    }
  }

  // Pattern FR "référence + prix" en fin de ligne (type Boisgirard).
  // IMPORTANT: on exige un prix avec décimales (xx,00) pour éviter de capturer des numéros (ex: 32320).
  const frRefPriceLine = /^(.*?)(?:\s+|^)([A-Z]{2,}[A-Z0-9]*)\s+(\d{1,3}(?:[ \u00A0.,]\d{3})*(?:[.,]\d{2}))\s*(?:€|EUR)?\s*$/;
  // Pattern EN "num lot + desc + prix" (prix peut être entier ou décimal)
  const enLotPriceLine = /^\s*(\d{1,6})\s+(.+?)\s+(\d{1,3}(?:[ \u00A0.,]\d{3})*(?:[.,]\d{2})?|\d+)\s*(?:€|EUR)?\s*$/;
  // blacklist de lignes à ne jamais traiter comme des lignes de lot
  const notLotLine = /(bordereau\s+acquereur|vente\s+du|ordre\s+n°|vos\s+réfs|monsieur|madame|adresse|tél|courriel|auction\s+house)/i;

  // Début de parsing:
  // - si header EN détecté: juste après
  // - sinon: chercher la 1ère ligne FR "REF + prix décimal"
  let startIdx = tableHeaderIdx >= 0 ? tableHeaderIdx + 1 : -1;
  if (startIdx < 0) {
    startIdx = lines.findIndex((l) => frRefPriceLine.test(l) && !notLotLine.test(l));
    if (startIdx < 0) startIdx = 0;
  }

  let current = null;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (isNoise(line)) {
      if (current) break;
      continue;
    }
    if (notLotLine.test(line)) continue;

    // EN: "38  Maison ...  420 €"
    const mEn = line.match(enLotPriceLine);
    if (mEn) {
      const num = mEn[1];
      const body = (mEn[2] || "").trim();
      const price = normalizeAmountStrict(mEn[3]);
      if (current) {
        current.description = current.description.replace(/\s+/g, " ").trim();
        out.lots.push(current);
      }
      current = { numero_lot: String(num), description: body, prix_marteau: price };
      continue;
    }

    // FR: "... XFS 60,00"
    // IMPORTANT: Pour Boisgirard Antonini, "XF5" est une référence, PAS un numéro de lot
    // Ne pas utiliser les codes alphanumériques comme numéro de lot
    const mFr = line.match(frRefPriceLine);
    if (mFr) {
      const body = (mFr[1] || "").trim();
      const ref = (mFr[2] || "").trim();
      const price = normalizeAmountStrict(mFr[3]);
      
      // Vérifier si c'est un code alphanumérique (à ignorer comme numéro de lot)
      const isAlphanumericCode = /[A-Za-z]/.test(ref) && /\d/.test(ref);

      if (current) {
        current.description = current.description.replace(/\s+/g, " ").trim();
        out.lots.push(current);
      }

      // Si c'est un code alphanumérique, ne pas l'utiliser comme numéro de lot
      // (normal pour certaines salles comme Boisgirard Antonini)
      current = { 
        numero_lot: isAlphanumericCode ? null : ref, 
        description: body, 
        prix_marteau: price 
      };
      continue;
    }

    if (current) {
      current.description += " " + line;
    }
  }
  if (current) {
    current.description = current.description.replace(/\s+/g, " ").trim();
    out.lots.push(current);
  }

  return out;
}

function extractLotsFromTable(lines, template = null) {
  let headerIdx = -1;
  let hasLigneColumn = false;
  const isBoisgirard = template === "boisgirard";
  let hasBoisgirardHeader = false;

  const tpl = template && BORDEREAU_TEMPLATES[template];
  const financialRe = tpl ? new RegExp(tpl.financialKeywords.join("|"), "i") : null;

  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].text.toLowerCase();
    if (isBoisgirard) {
      if (["ligne", "description", "adjudication"].every((k) => low.includes(k))) {
        headerIdx = i;
        hasLigneColumn = true;
        hasBoisgirardHeader = true;
        break;
      }
    } else {
      if (
        (low.includes("lot") || low.includes("ligne")) &&
        (low.includes("description") || low.includes("désignation")) &&
        (low.includes("adjudication") || low.includes("prix") || low.includes("hammer"))
      ) {
        headerIdx = i;
        hasLigneColumn = low.includes("ligne");
        break;
      }
    }
  }
  
  // Pour Boisgirard Antonini, on suppose toujours qu'il y a une colonne "Ligne" même si non détectée
  if (isBoisgirardAntonini && !hasLigneColumn) {
    hasLigneColumn = true;
  }

  // fallback si pas d'en-tête: commencer après la zone header (y>=0.22)
  const start = headerIdx >= 0 ? headerIdx + 1 : 0;
  const table = lines.slice(start).filter((l) => l.yn >= 0.18 && l.yn <= 0.90);

  const footerStop = financialRe ||
    /(total\s*invoice|invoice\s*total|facture\s*total|total\s*facture|montant\s*total|total\s*ttc|\d+\s+lot\(s\))/i;
  const lots = [];
  let current = null;

  // MODE SPÉCIFIQUE BOISGIRARD : parsing tabulaire avec zoning strict
  if (isBoisgirard && hasBoisgirardHeader) {
    console.log('[OCR][BA] Mode parsing tabulaire activé');
    for (const row of table) {
      if (footerStop.test(row.text)) {
        console.log('[OCR][BA] Footer détecté, arrêt du parsing');
        break;
      }
      
      const lowRow = row.text.toLowerCase();
      if (
        lowRow.includes("nombre de lots") ||
        lowRow.includes("nombre d'objets") ||
        lowRow.includes("lots détectés") ||
        lowRow.includes("salle des ventes") ||
        lowRow.includes("bordereau acquereur")
      ) continue;
      if (financialRe && financialRe.test(lowRow)) continue; // Anti-faux-lots: Taux, Base, Total HT, Frais...

      // Pattern spécifique Boisgirard : <number> <number> <description...> <price>
      // Les deux premiers nombres sont identiques = numéro de lot
      const baPattern = /^(\d{1,4})\s+(\d{1,4})\s+(.+?)\s+(\d{1,3}[,\u00A0.]\d{2})\s*(?:€|EUR)?/i;
      const match = row.text.match(baPattern);
      
      if (match) {
        const [, ligne, reference, description, priceStr] = match;
        
        if (ligne === reference) {
          const numVal = parseInt(ligne, 10);
          if (numVal > 5000) continue; // Anti-faux-lots: numéro fiscal
          const lotNumber = ligne;
          const prix_marteau = normalizeAmountStrict(priceStr);
          
          console.log(`[OCR][BA] Lot détecté: ligne=${ligne}, référence=${reference}, prix=${prix_marteau}`);
          
          if (current) lots.push(current);
          current = {
            numero_lot: lotNumber,
            description: cleanBoisgirardDescription(description),
            prix_marteau: prix_marteau ?? null,
          };
        } else {
          console.log(`[OCR][BA] Nombres non identiques (ignoré): ligne=${ligne}, référence=${reference}`);
        }
      } else if (current) {
        // Continuation de description (ligne suivante sans prix)
        const cont = row.text.trim();
        if (cont && !footerStop.test(cont)) {
          current.description = `${current.description} ${cleanBoisgirardDescription(cont)}`.trim();
        }
      }
    }
    
    if (current) lots.push(current);
    console.log(`[OCR][BA] ${lots.length} lot(s) extrait(s) en mode tabulaire`);
    
    return lots
      .map((l) => ({
        numero_lot: l.numero_lot !== null && l.numero_lot !== undefined ? String(l.numero_lot) : null,
        description: cleanBoisgirardDescription(l.description || ""),
        prix_marteau: l.prix_marteau,
      }))
      .filter((l) => {
        const hasDesc = (l.description || "").trim().length > 0;
        const hasPrice = l.prix_marteau !== null && l.prix_marteau > 0;
        return hasDesc || hasPrice;
      });
  }

  // MODE CLASSIQUE (autres salles ou OCR bruité)
  for (const row of table) {
    if (footerStop.test(row.text)) break;
    // ignorer lignes clairement hors-table (stats / labels)
    const lowRow = row.text.toLowerCase();
    if (
      lowRow.includes("nombre de lots") ||
      lowRow.includes("nombre d'objets") ||
      lowRow.includes("lots détectés") ||
      lowRow.includes("salle des ventes")
    ) {
      continue;
    }
    if (isBoisgirard && financialRe && financialRe.test(lowRow)) continue;

    const words = row.words || [];
    // split pseudo-colonnes
    // Pour les bordereaux avec colonne "Ligne", on ajuste les seuils
    const left = [];
    const mid = [];
    const right = [];
    for (const w of words) {
      // Si on a une colonne "Ligne", elle est généralement très à gauche (< 0.10 pour Boisgirard)
      // La colonne "Références" est ensuite (0.10-0.25)
      if (hasLigneColumn) {
        if (w.xn < 0.10) left.push(w.text); // Colonne "Ligne" (très à gauche)
        else if (w.xn > 0.75) right.push(w.text); // Colonne "Adjudication"
        else mid.push(w.text); // Colonnes "Références" et "Description"
      } else {
        // Format classique
      if (w.xn < 0.22) left.push(w.text);
      else if (w.xn > 0.75) right.push(w.text);
      else mid.push(w.text);
      }
    }
    const leftText = left.join(" ").trim();
    const midText = mid.join(" ").trim();
    const rightText = right.join(" ").trim();

    // lot number: priorité à la colonne "Ligne" (leftText) si elle existe
    // Sinon, chercher dans leftText ou au début de row.text
    // IMPORTANT: Ignorer les codes alphanumériques comme "XF5" - chercher uniquement des nombres purs
    let lotNumber = null;
    
    // Fonction pour vérifier si un texte est un code alphanumérique (à ignorer)
    const isAlphanumericCode = (text) => {
      // Codes comme "XF5", "A123", etc. - contiennent des lettres ET des chiffres
      return /[A-Za-z]/.test(text) && /\d/.test(text);
    };
    
    if (hasLigneColumn && leftText) {
      // Pour la colonne "Ligne", chercher un nombre simple au début
      const ligneMatch = leftText.match(/^(\d{1,6})\b/);
      if (ligneMatch && !isAlphanumericCode(ligneMatch[1])) {
        lotNumber = ligneMatch[1];
      }
    }
    
    // Fallback: chercher dans leftText ou row.text, mais ignorer les codes alphanumériques
    if (!lotNumber) {
      // Chercher tous les nombres dans leftText
      const leftParts = leftText.split(/\s+/).filter(Boolean);
      for (const p of leftParts) {
        // Prioriser les nombres purs (pas les codes alphanumériques)
        if (/^\d{1,6}$/.test(p) && !isAlphanumericCode(p)) {
          lotNumber = p;
          break;
        }
      }
      
      // Si pas trouvé dans leftText, chercher dans row.text (tous les nombres purs)
      if (!lotNumber) {
        // Chercher tous les nombres purs dans row.text (pas seulement au début)
        const allNumbers = row.text.match(/\b(\d{1,6})\b/g);
        if (allNumbers) {
          for (const num of allNumbers) {
            if (!isAlphanumericCode(num)) {
              // Vérifier que ce n'est pas un prix (généralement > 10 ou avec décimales)
              const numValue = parseInt(num, 10);
              if (numValue <= 999 && !row.text.includes(num + ",") && !row.text.includes(num + ".")) {
                lotNumber = num;
                break;
              }
            }
          }
        }
      }
    }

    // prix marteau si présent (optionnel)
    const prix_marteau = normalizeAmountStrict(rightText);

    // description: après le numéro de lot, puis mid, puis le reste (sans prix)
    let desc = midText;
    if (!desc && lotNumber) {
      const after = leftText
        .replace(/^lot\s*/i, "")
        .replace(/^n°?\s*/i, "")
        .replace(new RegExp(`^${lotNumber}\\b\\s*`), "")
        .trim();
      if (after) desc = after;
    }

    // Anti-faux-lots Boisgirard: numéro > 5000 = probablement numéro fiscal, ignorer la ligne
    let lotNumberFinal = lotNumber;
    if (isBoisgirard && lotNumber && parseInt(lotNumber, 10) > 5000) {
      lotNumberFinal = null;
      if (!midText.trim() && !rightText.trim()) continue; // ligne uniquement numérique, ne pas append
    }

    // IMPORTANT: Accepter les lots SANS numéro de lot (normal pour certaines salles comme Boisgirard Antonini)
    // Un lot est valide s'il a une description OU un prix
    const hasDescription = (desc || "").trim().length > 0;
    const hasPrice = prix_marteau !== null && prix_marteau > 0;
    const isValidLot = hasDescription || hasPrice;

    if (lotNumberFinal) {
      // Lot avec numéro
      if (current) lots.push(current);
      current = {
        numero_lot: String(lotNumberFinal),
        description: (desc || "").trim(),
        prix_marteau: prix_marteau ?? null,
      };
    } else if (isValidLot && !current) {
      // Nouveau lot SANS numéro (normal pour certaines salles)
      // Démarrer un nouveau lot si on a une description ou un prix
      current = {
        numero_lot: null, // null est valide - certaines salles n'ont pas de numéro de lot
        description: (desc || "").trim(),
        prix_marteau: prix_marteau ?? null,
      };
    } else if (current) {
      // continuation de description
      const cont = [leftText, desc, rightText]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (cont) current.description = `${current.description} ${cont}`.trim();
    }
  }

  if (current) lots.push(current);

  return lots
    .map((l) => ({
      numero_lot: l.numero_lot !== null && l.numero_lot !== undefined ? String(l.numero_lot) : null,
      description: (l.description || "").replace(/\s+/g, " ").trim(),
      prix_marteau: l.prix_marteau,
    }))
    // IMPORTANT: Ne pas rejeter les lots sans numéro de lot - accepter si description ou prix présent
    .filter((l) => {
      const hasDesc = (l.description || "").trim().length > 0;
      const hasPrice = l.prix_marteau !== null && l.prix_marteau > 0;
      return hasDesc || hasPrice; // Un lot est valide s'il a au moins une description ou un prix
    });
}

/**
 * Tente l'extraction hybride pdfplumber (extract_tables + extract_form_structure).
 * Activé par USE_PDFPLUMBER_BORDEREAU=true. Retourne { lots } si succès, null sinon.
 * Permet un fallback automatique vers l'extraction classique en cas d'échec.
 */
async function tryPdfplumberHybridExtraction(fileBuffer, log = () => {}) {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const scriptPath = path.join(projectRoot, ".cursor", "skills", "pdf", "scripts", "extract_bordereau_hybrid.py");
  const pythonPath = path.join(projectRoot, ".venv-pdf", "bin", "python");
  const tempPath = path.join(__dirname, `.temp-pdf-hybrid-${Date.now()}.pdf`);
  let stdout = "";
  let stderr = "";
  try {
    if (!fs.existsSync(scriptPath)) {
      log(`[OCR]   → Script pdfplumber hybride introuvable: ${scriptPath}`);
      return null;
    }
    await fs.promises.writeFile(tempPath, fileBuffer);
    const pythonCmd = fs.existsSync(pythonPath) ? pythonPath : "python3";
    const child = spawn(pythonCmd, [scriptPath, tempPath], {
      cwd: path.dirname(scriptPath),
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    const result = await new Promise((resolve, reject) => {
      child.on("close", (code) => {
        try {
          const out = JSON.parse(stdout || stderr || "{}");
          resolve(out);
        } catch {
          resolve(null);
        }
      });
      child.on("error", () => resolve(null));
    });
    if (!result || !result.success || !Array.isArray(result.lots)) {
      if (result?.error) log(`[OCR]   → pdfplumber hybride: ${result.error}`);
      return null;
    }
    return result;
  } catch (err) {
    log(`[OCR]   → pdfplumber hybride échec: ${err.message}`);
    return null;
  } finally {
    try { await fs.promises.unlink(tempPath); } catch {}
  }
}

async function extractBordereauFromFile(fileBuffer, mimeType, verbose = false) {
  const pages = [];
  let ocrRawText = "";
  const log = (msg) => { console.log(msg); };
  const logVerbose = verbose ? log : () => {};

  let hasNativePdf = false;
  if (mimeType === "application/pdf") {
    log(`[OCR]   → Format PDF détecté — analyse du type (natif vs scanné)...`);
    const nativeResult = await extractTextFromNativePdf(fileBuffer, log);
    if (nativeResult) {
      hasNativePdf = true;
      pages.push(...nativeResult.pages);
      ocrRawText = nativeResult.ocrRawText;
    } else {
      log(`[OCR]   → Conversion en images + Tesseract OCR...`);
      const { buffers, renderedPages } = await renderPdfToPngBuffers(fileBuffer, {
        maxPages: 10,
        scale: 4.0,
      });
      log(`[OCR]   → ${buffers.length} page(s) à analyser`);
      for (let i = 0; i < buffers.length; i++) {
        log(`[OCR]   → Page ${i + 1}/${buffers.length}: Tesseract OCR en cours...`);
        const r = await runOcrOnImage(buffers[i]);
        log(`[OCR]   → Page ${i + 1}: confiance ${(r.confidence ?? 0).toFixed(1)}%, ${(r.text || '').length} caractères`);
        logVerbose(`[OCR]   → [VERBOSE] Aperçu texte page ${i + 1}: "${(r.text || '').slice(0, 150)}..."`);
        const lines = buildLinesFromWords(r.words);
        pages.push({ pageIndex: i, lines, words: r.words, confidence: r.confidence, text: r.text });
        ocrRawText += `\n\n--- PAGE ${i + 1}/${renderedPages} (rendered) ---\n${r.text}`;
      }
    }
  } else if (mimeType.startsWith("image/")) {
    log(`[OCR]   → Format image détecté — Tesseract OCR en cours...`);
    const r = await runOcrOnImage(fileBuffer);
    log(`[OCR]   → Confiance ${(r.confidence ?? 0).toFixed(1)}%, ${(r.text || '').length} caractères`);
    logVerbose(`[OCR]   → [VERBOSE] Aperçu: "${(r.text || '').slice(0, 150)}..."`);
    const lines = buildLinesFromWords(r.words);
    pages.push({ pageIndex: 0, lines, words: r.words, confidence: r.confidence, text: r.text });
    ocrRawText = r.text;
  } else {
    throw new Error("Format non supporté. Utilisez une image (PNG/JPG) ou un PDF.");
  }

  const detectedTemplate = detectBordereauTemplate(ocrRawText);
  if (detectedTemplate) log(`[OCR]   → Template détecté: ${detectedTemplate}`);

  // ÉTAPE OBLIGATOIRE: Découpage en zones logiques — les lots ne peuvent exister QUE dans la zone tableau
  const allWords = pages.flatMap((p) => (p.words || []));
  const tableWordsByPage = [];
  for (const p of pages) {
    const zone = detectTableZone(p, detectedTemplate);
    const filtered = filterWordsByTableZone(p.words || [], zone);
    tableWordsByPage.push(...filtered);
    if (zone?.headerY != null) {
      log(`[OCR]   → Zone tableau détectée (page) — ${filtered.length} mots dans la zone`);
    }
  }
  const tableWords = tableWordsByPage;
  log(`[OCR]   → Extraction des lots: ${tableWords.length} mots dans zone tableau (sur ${allWords.length} total)`);

  // Lots: cascade d'extraction
  // Option: extraction hybride pdfplumber (tables + form_structure) — activé par USE_PDFPLUMBER_BORDEREAU=true
  // En cas d'échec ou si désactivé, fallback automatique vers l'extraction classique ci-dessous.
  let lotsAll = [];
  const usePdfplumberHybrid = process.env.USE_PDFPLUMBER_BORDEREAU === "true" || process.env.USE_PDFPLUMBER_BORDEREAU === "1";
  if (mimeType === "application/pdf" && hasNativePdf && usePdfplumberHybrid) {
    const hybridResult = await tryPdfplumberHybridExtraction(fileBuffer, log);
    if (hybridResult?.lots?.length > 0) {
      lotsAll = hybridResult.lots.map((l) => ({
        numero_lot: l.numero_lot != null ? String(l.numero_lot) : null,
        description: (l.description || "").trim(),
        prix_marteau: typeof l.prix_marteau === "number" ? l.prix_marteau : null,
        total: l.total != null ? l.total : (l.prix_marteau != null ? Math.round(l.prix_marteau * 1.20 * 100) / 100 : null),
      }));
      log(`[OCR]   → Méthode: pdfplumber hybride (${hybridResult.method}) → ${lotsAll.length} lots`);
    }
  }
  if (lotsAll.length === 0 && tableWords.length > 0) {
    const fromWords = extractLotsFromOcrWords(tableWords, detectedTemplate);
    if (fromWords.length > 0) {
      lotsAll = fromWords.map((l) => ({
        numero_lot: l.lotNumber !== null && l.lotNumber !== undefined ? String(l.lotNumber) : null,
        description: (l.description || "").trim(),
        prix_marteau: typeof l.value === "number" ? l.value : null,
        total: typeof l.value === "number" ? Math.round(l.value * 1.20 * 100) / 100 : null,
      }));
      log(`[OCR]   → Méthode: extraction spatiale (bounding boxes) → ${lotsAll.length} lots`);
    }
  }
  if (lotsAll.length === 0 && detectedTemplate !== "boisgirard") {
    const fromText = extractLotsFromOcrText(ocrRawText);
    if (fromText.length > 0) {
      lotsAll = fromText.map((l) => ({
        numero_lot: l.lotNumber !== null && l.lotNumber !== undefined ? String(l.lotNumber) : null,
        description: (l.description || "").trim(),
        prix_marteau: typeof l.value === "number" ? l.value : null,
        total: typeof l.value === "number" ? Math.round(l.value * 1.20 * 100) / 100 : null,
      }));
      log(`[OCR]   → Méthode: extraction depuis texte brut → ${lotsAll.length} lots`);
    }
  }
  if (lotsAll.length === 0) {
    for (const p of pages) {
      const zone = detectTableZone(p, detectedTemplate);
      const linesInZone = filterLinesByTableZone(p.lines || [], zone);
      const tableLots = extractLotsFromTable(linesInZone, detectedTemplate);
      for (const l of tableLots) lotsAll.push(l);
    }
    if (lotsAll.length > 0) log(`[OCR]   → Méthode: extraction tabulaire → ${lotsAll.length} lots`);
  }

  if (lotsAll.length === 0 && detectedTemplate === "boisgirard") {
    const fallbackBoisgirard = extractLotsFromOcrTextBoisgirard(ocrRawText);
    if (fallbackBoisgirard.length > 0) {
      lotsAll = fallbackBoisgirard.map((l) => ({
        numero_lot: l.numero_lot,
        description: l.description,
        prix_marteau: l.prix_marteau,
        total: l.prix_marteau != null ? Math.round(l.prix_marteau * 1.20 * 100) / 100 : null,
      }));
      log(`[OCR]   → Méthode: fallback texte Boisgirard → ${lotsAll.length} lots`);
    }
  }

  // Validation des lots par score de confiance (tous viennent de la zone tableau donc +2)
  const MIN_LOT_SCORE = 3;
  const beforeFilter = lotsAll.length;
  lotsAll = lotsAll.filter((l) => {
    let score = 2; // dans zone tableau
    if (isPlausibleLotNumber(l.numero_lot)) score += 1;
    if (l.prix_marteau != null && l.prix_marteau > 0) score += 1;
    if ((l.description || "").trim().length >= 10) score += 1;
    return score >= MIN_LOT_SCORE;
  });
  if (beforeFilter > lotsAll.length) {
    log(`[OCR]   → Validation lots: ${lotsAll.length} retenus (${beforeFilter - lotsAll.length} rejetés par score)`);
  }

  // Filtrer les lots fantômes : descriptions contenant coordonnées/footer (SIRET, IBAN, email, etc.)
  const FOOTER_LOT_RE = /\b(SIRET|IBAN|BIC|RIB|Capital\s*Social|ventes?\s*@|@[a-z0-9.-]+\.(?:com|fr)|04\s*\d{2}\s*\d{2}\s*\d{2}\s*\d{2}|commissaires-priseurs|TEMIS\s*BORDEREAU|virement|Fichier\s*TEMIS)/i;
  const beforeFooterFilter = lotsAll.length;
  lotsAll = lotsAll.filter((l) => {
    const desc = (l.description || "").trim();
    if (!desc) return true;
    if (FOOTER_LOT_RE.test(desc)) {
      log(`[OCR]   → Lot fantôme rejeté (footer/contact): ${l.numero_lot} — "${desc.slice(0, 60)}..."`);
      return false;
    }
    return true;
  });
  if (beforeFooterFilter > lotsAll.length) {
    log(`[OCR]   → Lots rejetés (contenu footer): ${lotsAll.length} retenus (${beforeFooterFilter - lotsAll.length} rejetés)`);
  }

  // dédoublonnage et ajout de total (prix+frais ~20%) si manquant
  const seen = new Set();
  const lots = [];
  for (const l of lotsAll) {
    const desc = (l.description || "").slice(0, 30);
    const key = `${l.numero_lot}::${desc}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const prix = l.prix_marteau != null ? l.prix_marteau : 0;
    const totalVal = l.total != null ? l.total : (prix > 0 ? Math.round(prix * 1.20 * 100) / 100 : null);
    lots.push({ ...l, total: totalVal });
  }

  // Champs header: cascade extraction salle des ventes
  const first = pages[0];
  const salle_vente = (allWords.length > 0 ? extractAuctionHouseFromOcrWords(allWords) : null) ||
    extractAuctionHouseFromOcrText(ocrRawText) ||
    (first ? extractSalleVenteFromHeader(first.lines) : null);
  const headerFields = first ? extractHeaderFields(first.lines) : { numero_bordereau: null, vente: null, date: null };
  // Numéro bordereau TEMIS (souvent en footer) : "A - 4187 - 62" — format strict pour éviter "Vente n°"
  if (!headerFields.numero_bordereau && ocrRawText) {
    const temisMatch = ocrRawText.match(/(?:TEMIS\s+)?BORDEREAU\s+D'?ADJUDICATION\s+N[°ºo]?\s*([A-Z]\s*-\s*\d+\s*-\s*\d+)/i);
    if (temisMatch) headerFields.numero_bordereau = temisMatch[1].replace(/\s*-\s*/g, "-").replace(/\s+/g, "").trim();
  }

  // Total: priorité footer (lines), fallback extraction depuis texte brut
  const last = pages[pages.length - 1];
  const totalFromLines = last ? extractTotalFromLines(last.lines) : null;
  const totalFromText = extractInvoiceTotalFromOcrText(ocrRawText);
  const total = (typeof totalFromLines === 'number' && totalFromLines > 0 ? totalFromLines : null) ??
    (typeof totalFromText?.value === 'number' && totalFromText.value > 0 ? totalFromText.value : null);

  log(`[OCR]   → Résultat: ${lots.length} lot(s), salle: ${salle_vente || 'non détectée'}, total: ${total !== null ? total : 'non détecté'}`);

  const result = {
    salle_vente: salle_vente || null,
    vente: headerFields.vente || null,
    numero_bordereau: headerFields.numero_bordereau || null,
    date: headerFields.date || null,
    total: typeof total === "number" ? total : null,
    lots,
  };

  // Fallback texte pur si extraction bbox partielle/ratée
  if (
    result.lots.length === 0 ||
    result.total === null ||
    result.numero_bordereau === null ||
    result.date === null ||
    result.vente === null ||
    result.salle_vente === null
  ) {
    const fallback = extractFromOcrTextFallback(ocrRawText);
    result.salle_vente = result.salle_vente ?? fallback.salle_vente;
    result.vente = result.vente ?? fallback.vente;
    result.numero_bordereau = result.numero_bordereau ?? fallback.numero_bordereau;
    result.date = result.date ?? fallback.date;
    result.total = result.total ?? fallback.total;
    if (result.lots.length === 0 && Array.isArray(fallback.lots) && fallback.lots.length > 0) {
      result.lots = fallback.lots;
    }
  }

  // Correction Millon — si "Millon" ou "Riviera" dans le doc ET salle erronée → imposer Millon Riviera
  const docHasMillon = ocrRawText && (/millon/i.test(ocrRawText) || /riviera/i.test(ocrRawText));
  const salleLooksWrong = result.salle_vente && /buyer|number|china|^\d+$/i.test(result.salle_vente);
  if (docHasMillon && (!result.salle_vente || salleLooksWrong)) {
    result.salle_vente = "Millon Riviera";
  }

  // Correction Boisgirard — si doc Boisgirard ET salle = "Vos réfs", adresse, ou similaire → imposer Boisgirard Antonini
  const docHasBoisgirard = ocrRawText && (/boisgirard/i.test(ocrRawText) || /bordereau\s*acquereur/i.test(ocrRawText));
  const salleBoisgirardWrong = result.salle_vente && (
    /vos\s*réfs|issy|adresse|^\d{5}\s|^\d+\s+[a-z]/i.test(result.salle_vente) ||
    (result.numero_bordereau && result.salle_vente.includes(result.numero_bordereau))
  );
  if (docHasBoisgirard && (!result.salle_vente || salleBoisgirardWrong)) {
    result.salle_vente = "Boisgirard Antonini";
  }

  // Correction Nice Enchères — si doc mentionne "Nice Enchères" ou "SARL NICE ENCHERES" (souvent confondu avec Drouot)
  const docHasNiceEncheres = ocrRawText && /(?:nice\s+ench[eè]res?|sarl\s+nice\s+encheres?|niceencheres)/i.test(ocrRawText);
  if (docHasNiceEncheres) {
    result.salle_vente = "Nice Enchères";
  }

  // Correction total — si total = numéro bordereau (ex: 32320), le rejeter
  if (result.numero_bordereau && result.total != null && String(Math.round(result.total)) === String(result.numero_bordereau).replace(/\D/g, "")) {
    result.total = null;
    const regle = ocrRawText.match(/\bRéglé\s+le\b[\s\S]{0,150}?\bmontant\s+de\b\s*([0-9][0-9\s\u00A0.,]*\d)\s*(?:€|EUR)?/i);
    if (regle) result.total = normalizeAmountStrict(regle[1]);
  }

  return { result, ocrRawText };
}

function normalizePriceToNumber(raw) {
  if (!raw) return 0;
  let s = String(raw).trim();
  // Retirer devise/espaces
  s = s.replace(/EUR/gi, "").replace(/€/g, "");
  // Garder chiffres + séparateurs
  s = s.replace(/[^\d.,\s]/g, "");
  // Supprimer espaces (séparateurs milliers)
  s = s.replace(/\s+/g, "");
  // Cas 1.200,00 (point milliers)
  // Si on a à la fois '.' et ',' -> '.' = milliers, ',' = décimal
  if (s.includes(".") && s.includes(",")) {
    s = s.replace(/\./g, "").replace(/,/g, ".");
  } else {
    // Si seulement ',' -> décimal
    if (s.includes(",")) s = s.replace(/,/g, ".");
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Retire les codes de référence (XF5, A12, etc.) en fin de description */
function cleanBoisgirardDescription(desc) {
  if (!desc || typeof desc !== "string") return (desc || "").trim();
  return desc
    .replace(/\s*:\s*[A-Z]{2,}[A-Z0-9]*\s*$/i, "")  // ": XF5" en fin
    .replace(/\s+[A-Z]{2,}[A-Z0-9]*\s*$/i, "")      // " XF5" en fin
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extraction Boisgirard depuis texte OCR avec zoning strict.
 * Zone lots = entre "Ligne/Description/Adjudication" et "Taux/Base/Total HT/Frais"
 * Gestion multi-lignes : description complète jusqu'au prix, codes (XF5) exclus
 */
function extractLotsFromOcrTextBoisgirard(ocrText) {
  const lines = ocrText.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const tpl = BORDEREAU_TEMPLATES.boisgirard;
  const financialRe = new RegExp(tpl.financialKeywords.join("|"), "i");

  let lotZoneStart = -1;
  let lotZoneEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    if (["ligne", "description", "adjudication"].every((k) => low.includes(k))) {
      lotZoneStart = i + 1;
    }
    if (lotZoneStart >= 0 && financialRe.test(low)) {
      lotZoneEnd = i;
      break;
    }
  }
  if (lotZoneStart < 0) return [];

  const zoneLines = lines.slice(lotZoneStart, lotZoneEnd);
  const lots = [];
  let current = null;
  const priceAtEnd = /(\d{1,3}[,\u00A0.]\d{2})\s*(?:€|EUR)?$/i;
  const lotStartPattern = /^(\d{1,4})\s+(\d{1,4})\s+(.*)$/;
  const baPattern = /^(\d{1,4})\s+(\d{1,4})\s+(.+?)\s+(\d{1,3}[,\u00A0.]\d{2})\s*(?:€|EUR)?/i;

  for (const line of zoneLines) {
    const low = line.toLowerCase();
    if (financialRe.test(low)) continue;

    const matchFull = line.match(baPattern);
    if (matchFull) {
      const [, ligne, ref, description, priceStr] = matchFull;
      if (ligne === ref && parseInt(ligne, 10) <= 5000) {
        if (current) lots.push(current);
        current = {
          numero_lot: ligne,
          description: cleanBoisgirardDescription(description),
          prix_marteau: normalizeAmountStrict(priceStr),
        };
      } else if (current) {
        const priceM = line.match(priceAtEnd);
        if (priceM) {
          const beforePrice = line.replace(priceAtEnd, "").trim();
          current.description = `${current.description} ${cleanBoisgirardDescription(beforePrice)}`.trim();
          if (!current.prix_marteau) current.prix_marteau = normalizeAmountStrict(priceM[1]);
        } else {
          current.description = `${current.description} ${line}`.trim();
        }
      }
    } else {
      const startM = line.match(lotStartPattern);
      if (startM && startM[1] === startM[2] && parseInt(startM[1], 10) <= 5000) {
        const priceM = line.match(priceAtEnd);
        if (current) lots.push(current);
        if (priceM) {
          const beforePrice = line.replace(lotStartPattern, "$3").replace(priceAtEnd, "").trim();
          current = {
            numero_lot: startM[1],
            description: cleanBoisgirardDescription(beforePrice),
            prix_marteau: normalizeAmountStrict(priceM[1]),
          };
        } else {
          current = {
            numero_lot: startM[1],
            description: cleanBoisgirardDescription(startM[3] || ""),
            prix_marteau: null,
          };
        }
      } else if (current) {
        const priceM = line.match(priceAtEnd);
        if (priceM) {
          const beforePrice = line.replace(priceAtEnd, "").trim();
          current.description = `${current.description} ${cleanBoisgirardDescription(beforePrice)}`.trim();
          if (!current.prix_marteau) current.prix_marteau = normalizeAmountStrict(priceM[1]);
        } else {
          current.description = `${current.description} ${line}`.trim();
        }
      }
    }
  }
  if (current) lots.push(current);

  return lots
    .filter((l) => (l.description || "").trim().length > 0 || (l.prix_marteau != null && l.prix_marteau > 0))
    .map((l) => ({
      numero_lot: l.numero_lot,
      description: cleanBoisgirardDescription(l.description || ""),
      prix_marteau: l.prix_marteau,
    }));
}

/**
 * Extraction déterministe depuis texte OCR.
 * Stratégie: on travaille ligne par ligne; on associe un prix en fin de ligne au lot en cours.
 */
function extractLotsFromOcrText(ocrText) {
  const lines = ocrText
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const lots = [];
  let current = null;

  // Prix typique: "1 200,00", "1200,00", "850", "2 500,50", parfois avec €
  const priceAtEnd = /(\d[\d\s.,]*\d)(?:\s*(?:€|EUR))?$/i;
  // Début de lot: ligne qui commence par un nombre (numéro lot) suivi d'un espace
  const lotStart = /^(\d{1,4})\b/;

  for (const line of lines) {
    // ignorer en-têtes de colonnes
    const lower = line.toLowerCase();
    if (
      lower.includes("ligne") &&
      (lower.includes("description") || lower.includes("adjudication"))
    ) {
      continue;
    }

    const startMatch = line.match(lotStart);
    const priceMatch = line.match(priceAtEnd);

    const hasLikelyPrice =
      !!priceMatch &&
      // éviter que "18ème" ou "40 cm" soit pris comme prix
      !line.toLowerCase().includes("cm") &&
      !line.toLowerCase().includes("mm");

    if (startMatch) {
      // Si on démarre un nouveau lot, pousser l'ancien
      if (current) {
        current.description = current.description.join(" ").trim();
        lots.push(current);
      }
      current = {
        lotNumber: startMatch[1],
        description: [line.replace(lotStart, "").trim()],
        value: 0,
        valueRaw: undefined,
      };

      // Si un prix est présent sur la même ligne (fin de ligne)
      if (hasLikelyPrice) {
        const raw = priceMatch[1];
        current.valueRaw = raw;
        current.value = normalizePriceToNumber(raw);
        // Retirer le prix de la description si collé en fin
        current.description[0] = current.description[0]
          .replace(priceAtEnd, "")
          .trim();
      }
      continue;
    }

    // Ligne de continuation (description multi-lignes)
    if (current) {
      if (hasLikelyPrice) {
        const raw = priceMatch[1];
        current.valueRaw = raw;
        current.value = normalizePriceToNumber(raw);
        current.description.push(line.replace(priceAtEnd, "").trim());
      } else {
        current.description.push(line);
      }
    }
  }

  if (current) {
    current.description = current.description.join(" ").trim();
    lots.push(current);
  }

  // Nettoyage final
  const cleaned = lots
    .map((l) => ({
      lotNumber: l.lotNumber !== null && l.lotNumber !== undefined ? String(l.lotNumber).trim() : null,
      description: (l.description || "").replace(/\s+/g, " ").trim(),
      value: typeof l.value === "number" ? l.value : 0,
      valueRaw: l.valueRaw,
    }))
    // IMPORTANT: Ne pas rejeter les lots sans numéro de lot - accepter si description ou prix présent
    .filter((l) => {
      const hasDesc = (l.description || "").trim().length > 0;
      const hasPrice = l.value > 0;
      return hasDesc || hasPrice; // Un lot est valide s'il a au moins une description ou un prix
    });

  return cleaned;
}

/**
 * Extraction table/colonnes depuis les bounding boxes OCR (beaucoup plus fiable que le texte brut).
 * @param {Array} words - Mots OCR avec bbox
 * @param {string|null} template - 'millon' | 'boisgirard' pour règles anti-faux-lots
 */
function extractLotsFromOcrWords(words, template = null) {
  const cleanedWords = (words || [])
    .filter((w) => w && typeof w.text === "string" && w.text.trim())
    .map((w) => ({
      text: w.text.trim(),
      conf: typeof w.confidence === "number" ? w.confidence : undefined,
      bbox: w.bbox,
    }))
    .filter((w) => w.bbox && typeof w.bbox.x0 === "number" && typeof w.bbox.x1 === "number" && typeof w.bbox.y0 === "number" && typeof w.bbox.y1 === "number");

  if (cleanedWords.length === 0) return [];

  const minX = Math.min(...cleanedWords.map((w) => w.bbox.x0));
  const maxX = Math.max(...cleanedWords.map((w) => w.bbox.x1));
  const width = Math.max(1, maxX - minX);

  // Grouper par lignes (cluster sur y-center)
  const sorted = cleanedWords
    .map((w) => ({ ...w, y: (w.bbox.y0 + w.bbox.y1) / 2, x: (w.bbox.x0 + w.bbox.x1) / 2 }))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const rows = [];
  const yThreshold = 12; // tolérance verticale (px)

  for (const w of sorted) {
    const last = rows[rows.length - 1];
    if (!last || Math.abs(last.y - w.y) > yThreshold) {
      rows.push({ y: w.y, words: [w] });
    } else {
      last.words.push(w);
      // moyenne glissante
      last.y = (last.y * (last.words.length - 1) + w.y) / last.words.length;
    }
  }

  // Trier les mots dans chaque ligne par x0
  for (const r of rows) {
    r.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
  }

  const lots = [];
  let current = null;

  const isPriceToken = (t) => /\d/.test(t) && !/cm|mm|kg/i.test(t);
  let headerY = null;
  let hasLigneColumn = false;
  const isBoisgirard = template === "boisgirard";
  const financialRe = isBoisgirard && BORDEREAU_TEMPLATES.boisgirard
    ? new RegExp(BORDEREAU_TEMPLATES.boisgirard.financialKeywords.join("|"), "i")
    : null;

  for (const row of rows) {
    const full = row.words.map((w) => w.text).join(" ").toLowerCase();
    if (isBoisgirard) {
      if (["ligne", "description", "adjudication"].every((k) => full.includes(k))) {
        headerY = row.y;
        hasLigneColumn = true;
        break;
      }
    } else if (full.includes("description") && (full.includes("adjudication") || full.includes("prix"))) {
      headerY = row.y;
      hasLigneColumn = full.includes("ligne");
      break;
    }
  }
  if (isBoisgirard && !hasLigneColumn) hasLigneColumn = true;

  if (isBoisgirard) {
    console.log('[OCR][BA] Mode extraction spatiale activé (bbox)');
    console.log(`[OCR][BA] Total mots OCR: ${cleanedWords.length}, Lignes détectées: ${rows.length}`);
    
    // Étape A : Détecter les prix (fiables)
    const priceWords = [];
    for (const row of rows) {
      if (headerY !== null && row.y <= headerY + 6) {
        continue;
      }
      
      for (const w of row.words) {
        // Détecter prix avec décimales: "60,00" ou "60.00"
        const priceMatch = w.text.match(/\b(\d{1,3}[,\u00A0.]\d{2})\b/);
        if (priceMatch) {
          const context = row.words.map(ww => ww.text).join(" ").toLowerCase();
          if (financialRe && financialRe.test(context)) continue; // Anti-faux-lots Boisgirard
          if (!/total|réglé|date|tél|phone|iban|bic/i.test(context)) {
            priceWords.push({
              word: w,
              price: priceMatch[1],
              row: row,
              bbox: w.bbox
            });
            console.log(`[OCR][BA] Prix détecté: ${priceMatch[1]} à (x: ${w.bbox.x0.toFixed(1)}, y: ${((w.bbox.y0 + w.bbox.y1) / 2).toFixed(1)})`);
          }
        }
      }
    }
    
    console.log(`[OCR][BA] ${priceWords.length} prix détecté(s) via bbox`);
    
    // Étape B : Pour chaque prix, remonter horizontalement à GAUCHE pour trouver le numéro de lot
    for (const priceInfo of priceWords) {
      const priceY = (priceInfo.bbox.y0 + priceInfo.bbox.y1) / 2;
      const priceX = priceInfo.bbox.x0; // Position X du prix
      const yTolerance = 10; // ±10px de tolérance verticale
      
      // Chercher tous les mots dans la même ligne verticale (±10px)
      const sameLineWords = [];
      for (const row of rows) {
        if (headerY !== null && row.y <= headerY + 6) {
          continue;
        }
        
        for (const w of row.words) {
          const wordY = (w.bbox.y0 + w.bbox.y1) / 2;
          if (Math.abs(wordY - priceY) <= yTolerance) {
            sameLineWords.push({
              word: w,
              x: w.bbox.x0,
              y: wordY,
              text: w.text
            });
          }
        }
      }
      
      // Trier par X (de gauche à droite)
      sameLineWords.sort((a, b) => a.x - b.x);
      
      // Étape C : Trouver le premier nombre entier simple à gauche du prix
      let lotNumber = null;
      let descriptionStartX = priceX;
      
      console.log(`[OCR][BA] Analyse ligne prix ${priceInfo.price}: ${sameLineWords.length} mot(s) sur la même ligne`);
      console.log(`[OCR][BA] Mots sur la ligne (gauche → droite):`, sameLineWords.map(w => `${w.text}@x${w.x.toFixed(0)}`).join(', '));
      
      for (const item of sameLineWords) {
        // Si on dépasse le prix, on s'arrête
        if (item.x >= priceX) {
          descriptionStartX = item.x;
          break;
        }
        
        // Chercher un nombre entier simple (1-4 chiffres)
        const numMatch = item.text.match(/^\b(\d{1,4})\b$/);
        if (numMatch) {
          const numValue = parseInt(numMatch[1], 10);
          // Vérifier que ce n'est pas un prix (généralement > 10 ou avec décimales)
          // et que ce n'est pas une date
          if (numValue <= 999 && !item.text.includes(",") && !item.text.includes(".")) {
            // Vérifier que ce n'est pas une date (format DD/MM/YYYY ou similaire)
            const isDate = sameLineWords.some(ww => 
              ww.text.match(/\d{2}[\/.-]\d{2}[\/.-]\d{4}/) ||
              (ww.text === numMatch[1] && sameLineWords.find(www => www.text.match(/^\d{2}$/) && Math.abs(www.x - item.x) < 50))
            );
            
            if (!isDate) {
              lotNumber = numMatch[1];
              console.log(`[OCR][BA] ✅ Lot détecté via bbox: ${lotNumber} (prix: ${priceInfo.price}, y: ${priceY.toFixed(1)}, x: ${item.x.toFixed(1)})`);
              break;
            } else {
              console.log(`[OCR][BA] ⚠️ Nombre ${numMatch[1]} ignoré (date détectée)`);
            }
          } else {
            console.log(`[OCR][BA] ⚠️ Nombre ${numMatch[1]} ignoré (prix ou format invalide)`);
          }
        }
      }
      
      if (!lotNumber) {
        console.log(`[OCR][BA] ⚠️ Aucun numéro de lot trouvé pour prix ${priceInfo.price} (${sameLineWords.length} mots analysés)`);
      }
      
      // Extraire la description (tous les mots entre le lot et le prix)
      const descriptionWords = sameLineWords
        .filter(item => {
          if (lotNumber && item.text === lotNumber) return false; // Exclure le numéro de lot
          if (item.x >= priceX) return false; // Exclure le prix et après
          return true;
        })
        .map(item => item.text)
        .join(" ")
        .trim();
      
      let description = cleanBoisgirardDescription(descriptionWords);
      
      const prix_marteau = normalizePriceToNumber(priceInfo.price);
      
      // Si on a trouvé un lot ou une description valide, l'ajouter
      if (lotNumber || (description.length > 5 && prix_marteau > 0)) {
        if (current) lots.push(current);
        current = {
          lotNumber: lotNumber || null,
          description: description ? [description] : [],
          value: prix_marteau,
        };
      } else if (current && prix_marteau > 0) {
        // Continuation de description
        if (description) current.description.push(description);
        if (!current.value) current.value = prix_marteau;
      }
    }
    
    if (current) lots.push(current);
    
    // Logs de debug
    console.log(`[OCR][BA] ${lots.length} lot(s) extrait(s) via extraction spatiale`);
    for (const lot of lots) {
      console.log(`[OCR][BA]   - Lot ${lot.lotNumber || 'N/A'}: "${lot.description.join(' ').substring(0, 50)}..." | Prix: ${lot.value}€`);
    }
    
    // Si on a trouvé des lots, retourner directement
    if (lots.length > 0) {
      // CAS PARTICULIER : Lot unique sans numéro détecté
      // RÈGLE MÉTIER : Si un seul lot, une seule description, un seul prix, et aucun numéro de lot
      if (lots.length === 1 && !lots[0].lotNumber && lots[0].value > 0) {
        console.log('[OCR][BA] ⚠️ Lot unique détecté sans numéro - Application fallback contrôlé: lotNumber = 1');
        lots[0].lotNumber = "1";
      }
      
      return lots
        .map((l) => ({
          lotNumber: l.lotNumber !== null && l.lotNumber !== undefined ? String(l.lotNumber) : null,
          description: (Array.isArray(l.description) ? l.description.join(" ") : String(l.description || "")).replace(/\s+/g, " ").trim(),
          value: typeof l.value === "number" && Number.isFinite(l.value) ? l.value : 0,
        }))
        .filter((l) => {
          const hasDesc = (l.description || "").trim().length > 0;
          const hasPrice = l.value > 0;
          return hasDesc || hasPrice;
        });
    }
  }

  // MODE CLASSIQUE (autres salles)
  for (const row of rows) {
    if (headerY !== null && row.y <= headerY + 6) {
      continue;
    }
    // Reconstituer texte par colonnes via x ratio
    // Pour les bordereaux avec colonne "Ligne", ajuster les seuils
    const left = [];
    const mid = [];
    const right = [];

    for (const w of row.words) {
      const xr = (w.x - minX) / width;
      if (hasLigneColumn) {
        // Colonne "Ligne" très à gauche (< 0.10 pour Boisgirard), "Références" ensuite (0.10-0.25)
        if (xr < 0.10) left.push(w.text); // Colonne "Ligne" (très à gauche)
        else if (xr > 0.72) right.push(w.text); // Colonne "Adjudication"
        else mid.push(w.text); // Colonnes "Références" et "Description"
      } else {
        // Format classique
      if (xr < 0.18) left.push(w.text);
      else if (xr > 0.72) right.push(w.text);
      else mid.push(w.text);
      }
    }

    const leftText = left.join(" ").trim();
    const midText = mid.join(" ").trim();
    const rightText = right.join(" ").trim();

    // Détecter numéro de lot
    // Priorité: si on a une colonne "Ligne", chercher un nombre simple dans leftText
    // IMPORTANT: Ignorer les codes alphanumériques comme "XF5" - chercher uniquement des nombres purs
    let lotNumber = null;
    
    // Fonction pour vérifier si un texte est un code alphanumérique (à ignorer)
    const isAlphanumericCode = (text) => {
      // Codes comme "XF5", "A123", etc. - contiennent des lettres ET des chiffres
      return /[A-Za-z]/.test(text) && /\d/.test(text);
    };
    
    if (hasLigneColumn && leftText) {
      // Pour la colonne "Ligne", chercher un nombre simple au début (ex: "8")
      const ligneMatch = leftText.match(/^(\d{1,4})\b/);
      if (ligneMatch && !isAlphanumericCode(ligneMatch[1])) {
        lotNumber = ligneMatch[1];
      }
    }
    
    // Fallback: chercher dans leftText ou midText, mais ignorer les codes alphanumériques
    if (!lotNumber) {
    const leftParts = leftText.split(/\s+/).filter(Boolean);
    for (const p of leftParts) {
        // Prioriser les nombres purs (pas les codes alphanumériques comme "XF5")
        if (/^\d{1,4}$/.test(p) && !isAlphanumericCode(p)) {
        lotNumber = p;
        break;
      }
    }
    // fallback: "Lot 12"
    if (!lotNumber && /lot\s*\d{1,4}/i.test(leftText)) {
      const m = leftText.match(/lot\s*(\d{1,4})/i);
        if (m && !isAlphanumericCode(m[1])) {
          lotNumber = m[1];
        }
      }
    }

    // Prix: tokens à droite (généralement nombre + €)
    let value = 0;
    if (rightText && isPriceToken(rightText)) {
      value = normalizePriceToNumber(rightText);
    }

    // Description candidate
    // IMPORTANT: sur ton format, la description est souvent juste APRÈS le numéro de lot.
    // Si la détection de colonnes place une partie de la description dans la zone "left",
    // on la récupère depuis leftText (après suppression du numéro).
    let descCandidate = (midText || "").trim();
    if (!descCandidate && lotNumber) {
      const leftAfter = leftText
        .replace(/^lot\s*/i, "")
        .replace(/^n°?\s*/i, "")
        .replace(new RegExp(`^${lotNumber}\\b\\s*`), "")
        .trim();
      if (leftAfter) descCandidate = leftAfter;
    }

    const isHeaderRow =
      /ligne|réf|références/i.test(leftText + " " + midText + " " + rightText) &&
      /description/i.test(leftText + " " + midText + " " + rightText);

    if (isHeaderRow) continue;

    // IMPORTANT: Accepter les lots SANS numéro de lot (normal pour certaines salles comme Boisgirard Antonini)
    const hasDescription = (descCandidate || "").trim().length > 0;
    const hasPrice = value > 0;
    const isValidLot = hasDescription || hasPrice;

    if (lotNumber) {
      // Lot avec numéro
      if (current) lots.push(current);
      current = {
        lotNumber,
        description: descCandidate ? [descCandidate] : [],
        value,
      };
    } else if (isValidLot && !current) {
      // Nouveau lot SANS numéro (normal pour certaines salles)
      // Démarrer un nouveau lot si on a une description ou un prix
      current = {
        lotNumber: null, // null est valide - certaines salles n'ont pas de numéro de lot
        description: descCandidate ? [descCandidate] : [],
        value,
      };
    } else if (current) {
      // continuation de description (ligne sans numéro)
      const cont = [leftText, descCandidate, rightText]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (cont) current.description.push(cont);
      // si un prix est sur une ligne suivante (rare), on le prend
      if (!current.value && value) current.value = value;
    }
  }

  if (current) lots.push(current);

  return lots
    .map((l) => {
      const rawDesc = (Array.isArray(l.description) ? l.description.join(" ") : String(l.description || "")).replace(/\s+/g, " ").trim();
      return {
        lotNumber: l.lotNumber !== null && l.lotNumber !== undefined ? String(l.lotNumber) : null,
        description: isBoisgirard ? cleanBoisgirardDescription(rawDesc) : rawDesc,
        value: typeof l.value === "number" && Number.isFinite(l.value) ? l.value : 0,
      };
    })
    // IMPORTANT: Ne pas rejeter les lots sans numéro de lot - accepter si description ou prix présent
    .filter((l) => {
      const hasDesc = (l.description || "").trim().length > 0;
      const hasPrice = l.value > 0;
      return hasDesc || hasPrice; // Un lot est valide s'il a au moins une description ou un prix
    });
}

function extractAuctionHouseFromOcrText(ocrText) {
  const head = ocrText.split("\n").slice(0, 50).join("\n");
  const lines = head
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // 1) Salles connues (retourner le nom canonique) — priorité aux salles explicitement nommées
  const headText = head.toLowerCase();
  if (/millon/i.test(head) && /riviera/i.test(head)) return "Millon Riviera";
  if (/boisgirard\s*[-•]?\s*antonini|antonini\s*[-•]?\s*boisgirard/i.test(head)) return "Boisgirard Antonini";
  if (/(?:nice\s+ench[eè]res?|sarl\s+nice\s+encheres?|nice\s+encheres?)/i.test(head)) return "Nice Enchères";
  if (/\bdrouot\b/i.test(head)) return "Drouot";
  if (/\bartcurial\b/i.test(head)) return "Artcurial";
  if (/\btajan\b/i.test(head)) return "Tajan";

  // 2) Filtrer lignes parasites
  const blacklist = [
    "nombre de lots",
    "nombre d'objets",
    "lots détectés",
    "ligne",
    "références",
    "description",
    "adjudication",
    "total invoice",
    "facture total",
    "total",
    "vos réfs",
    "vos refs",
  ];
  const candidates = lines.filter((l) => {
    const low = l.toLowerCase();
    if (blacklist.some((b) => low.includes(b))) return false;
    const letters = (l.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    return letters >= 6 && l.length <= 60;
  });

  const prefer =
    candidates.find((l) => l.includes("•")) ||
    candidates.find((l) => l === l.toUpperCase() && l.length >= 6) ||
    candidates[0];

  return prefer || undefined;
}

// La salle des ventes est généralement en HAUT, au MILIEU de la 1ère page.
// Avec les bounding boxes OCR, on peut cibler précisément cette zone.
function extractAuctionHouseFromOcrWords(words) {
  const cleanedWords = (words || [])
    .filter((w) => w && typeof w.text === "string" && w.text.trim() && w.bbox)
    .map((w) => ({
      text: w.text.trim(),
      bbox: w.bbox,
      x: (w.bbox.x0 + w.bbox.x1) / 2,
      y: (w.bbox.y0 + w.bbox.y1) / 2,
    }))
    .filter(
      (w) =>
        typeof w.bbox.x0 === "number" &&
        typeof w.bbox.x1 === "number" &&
        typeof w.bbox.y0 === "number" &&
        typeof w.bbox.y1 === "number"
    );

  if (cleanedWords.length === 0) return undefined;

  const minX = Math.min(...cleanedWords.map((w) => w.bbox.x0));
  const maxX = Math.max(...cleanedWords.map((w) => w.bbox.x1));
  const minY = Math.min(...cleanedWords.map((w) => w.bbox.y0));
  const maxY = Math.max(...cleanedWords.map((w) => w.bbox.y1));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  const topLimit = minY + height * 0.25; // haut 25%
  const topWords = cleanedWords.filter((w) => w.y <= topLimit);

  const sorted = topWords.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  const yThreshold = 14;
  for (const w of sorted) {
    const last = rows[rows.length - 1];
    if (!last || Math.abs(last.y - w.y) > yThreshold) rows.push({ y: w.y, words: [w] });
    else last.words.push(w);
  }
  for (const r of rows) r.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);

  const blacklist = [
    "bordereau",
    "acquereur",
    "acheteur",
    "buyer",
    "buyer's number",
    "nombre",
    "lots",
    "objets",
    "description",
    "adjudication",
    "total",
    "invoice",
    "facture",
    "china",
    "vos réfs",
    "vos refs",
    "issy-les-moulineaux",
  ];

  // Noms connus de salles (priorité absolue) — ne jamais confondre avec "Sale No." ou titre de vente
  const knownHouses = [
    { re: /millon\s*(?:riviera)?|riviera\s*(?:millon)?/i, value: "Millon Riviera" },
    { re: /boisgirard\s*[-•]?\s*antonini|antonini\s*[-•]?\s*boisgirard/i, value: "Boisgirard Antonini" },
    { re: /(?:nice\s+ench[eè]res?|sarl\s+nice\s+encheres?)/i, value: "Nice Enchères" },
    { re: /\bdrouot\b/i, value: "Drouot" },
    { re: /\bartcurial\b/i, value: "Artcurial" },
    { re: /\btajan\b/i, value: "Tajan" },
  ];
  const headerText = rows.map((r) => r.words.map((w) => w.text).join(" ")).join(" ");
  for (const { re, value } of knownHouses) {
    if (re.test(headerText)) return value;
  }

  // Exclure les titres de vente ("Sale No. XXX", "Collections & successions...")
  const saleTitlePattern = /sale\s*no\.?|vente\s*(?:no\.?|n°)|collections\s*&|successions/i;
  const candidates = rows
    .map((r) => {
      const text = r.words.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim();
      const rowMinX = Math.min(...r.words.map((w) => w.bbox.x0));
      const rowMaxX = Math.max(...r.words.map((w) => w.bbox.x1));
      const center = ((rowMinX + rowMaxX) / 2 - minX) / width;
      const letters = (text.match(/[A-Za-zÀ-ÿ]/g) || []).length;
      return { text, center, y: r.y, letters };
    })
    .filter((c) => {
      const low = c.text.toLowerCase();
      if (blacklist.some((b) => low.includes(b))) return false;
      if (saleTitlePattern.test(c.text)) return false; // pas le titre de vente
      if (c.letters < 6) return false;
      if (c.text.length > 60) return false; // salle = nom court
      if (c.center < 0.25 || c.center > 0.75) return false;
      return true;
    });

  candidates.sort((a, b) => a.y - b.y);
  return candidates[0]?.text;
}

function extractAuctionDateFromOcrText(ocrText) {
  const m = ocrText.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);
  if (!m) return undefined;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function extractInvoiceTotalFromOcrText(ocrText) {
  const text = String(ocrText || "");
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Priorité Boisgirard / FR: "Réglé le ... montant de 77,00 €"
  const regle = text.match(/\bRéglé\s+le\b[\s\S]{0,150}?\bmontant\s+de\b\s*([0-9][0-9\s\u00A0.,]*\d)\s*(?:€|EUR)?/i);
  if (regle) {
    const v = normalizeAmountStrict(regle[1]);
    if (v != null && v > 0) return { raw: regle[1], value: v };
  }

  const key = /(total\s*invoice|invoice\s*total|facture\s*total|total\s*facture|montant\s*total|total\s*ttc|\btotal\b)/i;
  const price = /(\d[\d\s.,]*\d)\s*(?:€|EUR)?/i;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!key.test(l)) continue;
    if (/total\s+ht\s*$/i.test(l)) continue;

    const m1 = l.match(price);
    if (m1) return { raw: m1[0], value: normalizePriceToNumber(m1[0]) };

    const next = lines[i + 1] || "";
    const m2 = next.match(price);
    if (m2) return { raw: m2[0], value: normalizePriceToNumber(m2[0]) };
  }

  return { raw: undefined, value: 0 };
}

/**
 * Parse le résultat de l'analyse (commun pour Groq et OpenAI)
 */
function parseAnalysisResult(contentText) {
  console.log('[Parse] Début du parsing, premiers caractères:', contentText.substring(0, 200));
  
  // Extraire le JSON - plusieurs patterns possibles
  let jsonStr = contentText;
  
  // Pattern 1: JSON dans des backticks ```json ... ```
  const jsonMatch1 = contentText.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch1) {
    jsonStr = jsonMatch1[1];
  } else {
    // Pattern 2: JSON brut entre accolades
    const jsonMatch2 = contentText.match(/\{[\s\S]*\}/);
    if (jsonMatch2) {
      jsonStr = jsonMatch2[0];
    }
  }
  
  // Nettoyer le JSON (enlever les espaces avant/après)
  jsonStr = jsonStr.trim();
  
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseError) {
    console.error('[Parse] Erreur parsing JSON:', parseError);
    console.error('[Parse] JSON tenté:', jsonStr.substring(0, 500));
    throw new Error(`Impossible de parser la réponse JSON de l'IA: ${parseError.message}. Réponse: ${contentText.substring(0, 200)}...`);
  }

  // Calculer le nombre total d'objets
  const totalObjects = parsed.lots.reduce((sum, lot) => {
    const desc = (lot.description || '').toLowerCase();
    // Détecter "paire de" = 2 objets
    if (desc.includes('paire de') || desc.includes('paire')) return sum + 2;
    // Détecter "lot de X" ou "ensemble de X"
    const lotMatch = desc.match(/lot de (\d+)|ensemble de (\d+)/);
    if (lotMatch) {
      const count = parseInt(lotMatch[1] || lotMatch[2] || '1');
      return sum + count;
    }
    // Détecter les nombres explicites (ex: "3 chaises", "deux tables")
    const numberWords = { 'deux': 2, 'trois': 3, 'quatre': 4, 'cinq': 5, 'six': 6 };
    for (const [word, num] of Object.entries(numberWords)) {
      if (desc.includes(word)) return sum + num;
    }
    // Par défaut : 1 objet par lot
    return sum + 1;
  }, 0);
  
  console.log(`[Parse] ${parsed.lots.length} lot(s) détecté(s), ${totalObjects} objet(s) au total`);

  // Normaliser les valeurs (convertir virgule en point pour les nombres)
  const normalizeValue = (val) => {
    if (val === null || val === undefined) {
      console.warn('[Parse] Valeur manquante pour un lot');
      return 0;
    }
    
    if (typeof val === 'number') {
      return val;
    }
    
    if (typeof val === 'string') {
      // Enlever les espaces, symboles €, et convertir virgule en point
      let cleaned = val.trim()
        .replace(/\s+/g, '') // Enlever tous les espaces
        .replace(/€/g, '') // Enlever le symbole €
        .replace(/EUR/g, '') // Enlever EUR
        .replace(/,/g, '.'); // Convertir virgule en point
      
      // Extraire uniquement les chiffres et le point décimal
      cleaned = cleaned.replace(/[^\d.]/g, '');
      
      const parsed = parseFloat(cleaned);
      if (isNaN(parsed)) {
        console.warn(`[Parse] Impossible de parser le prix: "${val}"`);
        return 0;
      }
      return parsed;
    }
    
    console.warn(`[Parse] Type de valeur inattendu: ${typeof val}, valeur: ${val}`);
    return 0;
  };

  // Normaliser la date
  const normalizeDate = (dateStr) => {
    if (!dateStr) return new Date();
    // Format DD/MM/YYYY -> YYYY-MM-DD
    const ddmmyyyy = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (ddmmyyyy) {
      return new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`);
    }
    return new Date(dateStr);
  };

  const normalizedLots = parsed.lots.map((lot, index) => {
    let description = lot.description || '';
    
    // Nettoyer et valider la description
    if (description) {
      description = description.trim();
      // Si la description est trop courte (< 10 caractères), c'est suspect
      if (description.length < 10) {
        console.warn(`[Parse] Lot ${index + 1}: Description très courte (${description.length} caractères): "${description}"`);
      }
    } else {
      console.warn(`[Parse] Lot ${index + 1}: Description manquante ou vide`);
      description = 'Objet non décrit';
    }
    
    const value = normalizeValue(lot.value);
    
    // Log pour déboguer les prix
    if (value === 0) {
      if (lot.value !== undefined && lot.value !== null && lot.value !== '') {
        console.warn(`[Parse] Lot ${index + 1}: Prix non parsé correctement. Original: "${lot.value}" (type: ${typeof lot.value})`);
      } else {
        console.warn(`[Parse] Lot ${index + 1}: Aucun prix trouvé (valeur: ${lot.value})`);
      }
    } else {
      console.log(`[Parse] Lot ${index + 1}: Prix parsé avec succès: ${value}€ (original: "${lot.value}")`);
    }
    
    return {
      lotNumber: lot.lotNumber || String(index + 1),
      description: description,
      estimatedDimensions: lot.dimensions ? {
        length: lot.dimensions.length || 50,
        width: lot.dimensions.width || 40,
        height: lot.dimensions.height || 30,
        weight: lot.dimensions.weight || 5,
      } : undefined,
      value: value,
    };
  });

  console.log(`[Parse] Résumé: ${normalizedLots.length} lot(s) extrait(s)`);
  normalizedLots.forEach((lot, idx) => {
    console.log(`[Parse] Lot ${idx + 1}: "${lot.description.substring(0, 50)}..." | Prix: ${lot.value}€`);
  });

  return {
    auctionHouse: parsed.auctionHouse || 'Salle des ventes',
    auctionDate: normalizeDate(parsed.auctionDate),
    lots: normalizedLots,
    totalLots: parsed.lots.length,
    totalObjects,
    rawText: contentText,
  };
}

/**
 * Analyse avec Groq (utilise des modèles open-source rapides)
 */
async function analyzeWithGroq(fileBuffer, mimeType, apiKey) {
  const isImage = mimeType.startsWith('image/');
  
  if (!isImage) {
    throw new Error("Le proxy OCR ne supporte que les images pour l'instant.");
  }

  // 1) OCR réel (pas de LLM ici)
  const { text: ocrText, confidence, words } = await runOcrOnImage(fileBuffer);
  if (!ocrText || ocrText.trim().length < 20) {
    throw new Error("OCR: texte trop court / illisible. Essayez une image plus nette (scan) ou plus grande.");
  }

  // 2) Extraction lots/prix depuis l'OCR (déterministe)
  //    Priorité: bounding boxes (table/colonnes). Fallback: texte brut.
  const lotsFromWords = extractLotsFromOcrWords(words);
  const lots = lotsFromWords.length > 0 ? lotsFromWords : extractLotsFromOcrText(ocrText);

  // 3) Salle + date depuis OCR (heuristiques)
  const auctionHouse = extractAuctionHouseFromOcrWords(words) || extractAuctionHouseFromOcrText(ocrText);
  const auctionDate = extractAuctionDateFromOcrText(ocrText);
  const invoiceTotal = extractInvoiceTotalFromOcrText(ocrText);

  // 4) Normalisation de sortie (compatible frontend)
  const parsedForObjects = { lots: lots.map((l) => ({ lotNumber: l.lotNumber, description: l.description, value: l.value })) };
  const totalObjects = parsedForObjects.lots.reduce((sum, lot) => {
    const desc = (lot.description || '').toLowerCase();
    if (desc.includes('paire de') || desc.includes('paire')) return sum + 2;
    const lotMatch = desc.match(/lot de (\d+)|ensemble de (\d+)/);
    if (lotMatch) {
      const count = parseInt(lotMatch[1] || lotMatch[2] || '1', 10);
      return sum + count;
    }
    return sum + 1;
  }, 0);

  return {
    auctionHouse,
    auctionDate: auctionDate ? new Date(auctionDate) : new Date(),
    lots: lots.map((l) => ({
      lotNumber: l.lotNumber,
      description: l.description,
      value: l.value,
      // NB: on garde valueRaw dans rawText/diagnostic plutôt que dans le type frontend
    })),
    totalLots: lots.length,
    totalObjects,
    invoiceTotal: invoiceTotal.value || undefined,
    invoiceTotalRaw: invoiceTotal.raw,
    rawText: `OCR(confidence=${confidence ?? "n/a"})\n\n${ocrText}`,
  };

}

/**
 * Système de prompt pour estimation des dimensions (logistique ventes aux enchères)
 */
const DIMENSIONS_SYSTEM_PROMPT = `You are a professional auction logistics expert specialized in books, paintings, luxury bags, jewelry and art objects.

Your task is to estimate realistic TRANSPORT dimensions (object + protective packaging) and weight.

The result will be used for real shipping box selection and logistics calculation.
Accuracy and realism are critical.

--------------------------------
STEP 1 — CHECK EXPLICIT DATA
--------------------------------
If the description contains dimensions:
- Extract them exactly
- Convert everything to centimeters
- Respect original proportions
- Add protective packaging margin:

  Books: +5%
  Paintings (framed): +8%
  Sculptures / fragile objects: +10%
  Jewelry: minimal margin (5%)
  Bags: +8%

If weight is explicitly written, use it.

--------------------------------
STEP 2 — IF DIMENSIONS ARE MISSING
--------------------------------
Identify the object category:

BOOK:
- Small book: 20x13x3 cm approx
- Large art book: 30x24x5 cm approx
- Add small packaging margin

PAINTING:
- Assume depth 5–8 cm framed
- Maintain realistic proportions

LUXURY BAG:
- Handbag typical range:
  20–40 cm length
  10–20 cm width
  15–30 cm height

JEWELRY:
- Small box size:
  8–15 cm typical
- Very low weight

ART OBJECT:
- Estimate realistic size
- Avoid extreme assumptions
- Use auction price as weight clue

--------------------------------
STEP 3 — PHYSICAL COHERENCE
--------------------------------
Ensure:
- length ≥ width ≥ height
- Weight matches size logically
- No unrealistic densities
- No extreme or exaggerated values

--------------------------------
STEP 4 — MULTIPLE ITEMS
--------------------------------
If multiple items:
- Stack logically if possible
- Otherwise estimate combined transport size

--------------------------------
OUTPUT FORMAT (STRICT JSON ONLY)
--------------------------------

{
  "length_cm": number,
  "width_cm": number,
  "height_cm": number,
  "weight_kg": number,
  "confidence": number (0-1),
  "category_detected": "BOOK | PAINTING | BAG | JEWELRY | ART_OBJECT"
}

Return ONLY valid JSON.
No explanation.
No text outside JSON.`;

/**
 * Estime les dimensions d'un objet en interrogeant Groq
 * @param {string} description - Description du/des lot(s)
 * @param {string} apiKey - Clé API Groq
 * @param {Object} context - Contexte utile (auctionHouse, price, date)
 */
async function estimateDimensionsForObject(description, apiKey, context = {}) {
  console.log(`[Dimensions] 🔍 Estimation dimensions pour: "${(description || '').substring(0, 100)}..."`);

  const contextParts = [];
  if (context.auctionHouse) contextParts.push(`Auction house: ${context.auctionHouse}`);
  if (context.price != null && context.price !== '') contextParts.push(`Auction price (hammer): ${context.price}€`);
  if (context.date) contextParts.push(`Sale date: ${context.date}`);

  const userContent = contextParts.length > 0
    ? `LOT DESCRIPTION:\n"""${description || ''}"""\n\nUSEFUL CONTEXT:\n${contextParts.join('\n')}`
    : `LOT DESCRIPTION:\n"""${description || ''}"""`;

  const normalizeResponse = (parsed) => {
    const toNum = (v) => {
      const n = Number.parseFloat(String(v).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    };
    const l = toNum(parsed?.length_cm ?? parsed?.length);
    const w = toNum(parsed?.width_cm ?? parsed?.width);
    const h = toNum(parsed?.height_cm ?? parsed?.height);
    const weight = toNum(parsed?.weight_kg ?? parsed?.weight);

    if (l == null && w == null && h == null) {
      return null;
    }

    const arr = [l, w, h].filter((x) => x != null && x > 0 && x <= 500);
    if (arr.length === 0) return null;

    arr.sort((a, b) => b - a);
    const length = Math.round(Math.min(arr[0], 500));
    const width = Math.round(Math.min(arr[1] ?? length, 500));
    const height = Math.round(Math.min(arr[2] ?? width, 500));

    const finalWeight = (weight != null && weight > 0 && weight <= 50)
      ? Number(weight.toFixed(1))
      : 5;

    const result = { length, width, height, weight: finalWeight };
    console.log(`[Dimensions] ✅ Dimensions normalisées:`, result);
    return result;
  };

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: DIMENSIONS_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        max_tokens: 250,
        temperature: 0.0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[Dimensions] ❌ Erreur API Groq:', response.status, errorText);
      return { length: 50, width: 40, height: 30, weight: 5 };
    }

    const data = await response.json();
    const contentText = data.choices[0]?.message?.content;

    if (!contentText) {
      console.warn('[Dimensions] ⚠️  Aucune réponse de Groq');
      return { length: 50, width: 40, height: 30, weight: 5 };
    }

    const jsonMatch = contentText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log(`[Dimensions] 📋 JSON parsé:`, parsed);
        const normalized = normalizeResponse(parsed);
        if (normalized) return normalized;
      } catch (parseError) {
        console.error('[Dimensions] ❌ Erreur parsing JSON:', parseError.message);
      }
    } else {
      console.warn('[Dimensions] ⚠️  Aucun JSON trouvé dans la réponse');
    }
  } catch (error) {
    console.error('[Dimensions] ❌ Erreur estimation:', error.message);
  }

  console.warn('[Dimensions] ⚠️  Utilisation des valeurs par défaut');
  return { length: 50, width: 40, height: 30, weight: 5 };
}

/**
 * Analyse avec Groq en fallback (modèle de base si le modèle de vision n'est pas disponible)
 */
async function analyzeWithGroqFallback(fileBuffer, mimeType, apiKey, prompt) {
  const base64 = bufferToBase64(fileBuffer, mimeType);
  const isImage = mimeType.startsWith('image/');
  
  const model = 'llama-3.1-8b-instant';
  
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'Tu es un expert en OCR (reconnaissance optique de caractères) spécialisé dans l\'analyse de documents français. ' +
                   'Tu analyses des bordereaux d\'adjudication avec une précision ABSOLUE, lettre par lettre, caractère par caractère. ' +
                   'MISSION CRITIQUE : Pour chaque lot, tu dois lire et copier TOUT le texte de la colonne Description sans rien omettre, ' +
                   'et extraire le prix exact depuis la colonne Adjudication. ' +
                   'Tu prends tout le temps nécessaire pour être précis. ' +
                   'Tu retournes UNIQUEMENT du JSON valide, sans texte avant/après, sans commentaires.',
        },
        {
          role: 'user',
          content: isImage 
            ? [
                { 
                  type: 'text', 
                  text: prompt + '\n\n⚠️ INSTRUCTIONS FINALES : Analyse l\'image avec une précision absolue. Lis TOUT le texte caractère par caractère.'
                },
                { 
                  type: 'image_url', 
                  image_url: { 
                    url: base64, 
                    detail: 'high'
                  } 
                }
              ]
            : prompt,
        },
      ],
      max_tokens: 8000,
      temperature: 0.0,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error (fallback): ${response.status} - ${error}`);
  }

  const data = await response.json();
  const contentText = data.choices[0]?.message?.content;
  
  if (!contentText) {
    throw new Error('Aucune réponse de l\'API Groq (fallback)');
  }

  console.log('[Groq Fallback] Réponse reçue, longueur:', contentText.length);
  
  // Parser le résultat initial (sans dimensions)
  const initialResult = parseAnalysisResult(contentText);
  
  // Pour chaque lot, estimer les dimensions avec une requête spécifique
  const lotsWithDimensions = await Promise.all(
    initialResult.lots.map(async (lot) => {
      if (lot.description) {
        const dimensions = await estimateDimensionsForObject(lot.description, apiKey, {});
        return {
          ...lot,
          estimatedDimensions: dimensions,
        };
      }
      return lot;
    })
  );
  
  return {
    ...initialResult,
    lots: lotsWithDimensions,
  };
}

/**
 * Analyse avec OpenAI GPT-4 Vision (fallback si Groq non disponible)
 */
async function analyzeWithOpenAI(fileBuffer, mimeType, apiKey) {
  const base64 = bufferToBase64(fileBuffer, mimeType);
  const isImage = mimeType.startsWith('image/');
  
  const content = [
    {
      type: 'text',
      text: `Analyse ce bordereau d'adjudication et extrais toutes les informations au format JSON :
{
  "auctionHouse": "nom de la salle des ventes",
  "auctionDate": "date ISO",
  "lots": [
    {
      "lotNumber": "numéro",
      "description": "description détaillée",
      "dimensions": {
        "length": longueur en cm (estime si non précisé),
        "width": largeur en cm (estime si non précisé),
        "height": hauteur en cm (estime si non précisé),
        "weight": poids en kg (estime si non précisé)
      },
      "value": valeur en euros si disponible
    }
  ]
}
Pour les dimensions, utilise ta connaissance des objets d'art. Retourne UNIQUEMENT le JSON.`,
    },
  ];

  if (isImage) {
    content.push({
      type: 'image_url',
      image_url: { url: base64 },
    });
  } else {
    throw new Error('Les PDFs nécessitent une conversion en images. Utilisez une image pour l\'instant.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Tu es un expert en analyse de bordereaux d\'adjudication. Extrais les informations au format JSON demandé.',
        },
        {
          role: 'user',
          content,
        },
      ],
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const contentText = data.choices[0]?.message?.content;
  
  if (!contentText) {
    throw new Error('Aucune réponse de l\'API OpenAI');
  }

  return parseAnalysisResult(contentText);
}

/**
 * Route POST /api/analyze-auction-sheet
 */
app.post('/api/analyze-auction-sheet', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    // OCR et extraction sont déterministes (sans LLM).
    // Groq est utilisé uniquement en post-traitement pour estimer les dimensions.
    const groqKey = process.env.GROQ_API_KEY;

    const mimeType = req.file.mimetype || 'image/jpeg';

    // Nouveau pipeline: OCR (Tesseract) + extraction déterministe + mapping vers l'UI existante
    const { result: extracted, ocrRawText } = await extractBordereauFromFile(req.file.buffer, mimeType);

    let lots = (extracted.lots || []).map((l) => ({
      // IMPORTANT: numero_lot peut être null pour certaines salles (ex: Boisgirard Antonini)
      // Utiliser null au lieu de undefined pour être explicite
      lotNumber: l.numero_lot !== null && l.numero_lot !== undefined ? String(l.numero_lot) : null,
      description: l.description,
      value: typeof l.prix_marteau === "number" ? l.prix_marteau : undefined,
    }));

    // Fallback: s'il n'y a aucun lot détecté, on crée un lot minimal pour remplir le devis
    if (!lots.length) {
      const lines = (ocrRawText || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 8);
      const blacklist = [/^page\s+\d+/i, /^ocr/i, /^---/];
      const candidate = lines.find((l) => !blacklist.some((b) => b.test(l)));
      const shortDesc = candidate ? candidate.slice(0, 180) : "Lot détecté (description indisponible)";
      lots = [
        {
          lotNumber: extracted.numero_bordereau || "LOT-1",
          description: shortDesc,
          value: typeof extracted.total === "number" ? extracted.total : undefined,
        },
      ];
    }

    // Estimation dimensions via Groq, à partir de la description OCR.
    // On limite le nombre d'appels pour éviter latence/coût (1er lot suffit pour remplir le devis).
    if (groqKey && lots.length > 0) {
      try {
        const targetIdx = 0;
        const target = lots[targetIdx];
        if (target?.description && target.description.trim().length > 0) {
          console.log(`[Analyze] 🔍 Estimation dimensions pour lot ${targetIdx + 1}: "${target.description.substring(0, 80)}..."`);
          const ctx = {
            auctionHouse: extracted.salle_vente || undefined,
            price: target.value,
            date: extracted.date || undefined,
          };
          const dims = await estimateDimensionsForObject(target.description, groqKey, ctx);
          console.log(`[Analyze] ✅ Dimensions estimées de l'objet:`, dims);
          lots = lots.map((l, idx) =>
            idx === targetIdx ? { ...l, estimatedDimensions: dims } : l
          );
        } else {
          console.warn(`[Analyze] ⚠️  Description manquante pour lot ${targetIdx + 1}`);
        }
      } catch (e) {
        console.error("[Analyze] ❌ Estimation Groq échouée:", e?.message || e);
        console.error("[Analyze] Stack:", e?.stack);
      }
    } else {
      if (!groqKey) {
        console.warn("[Analyze] ⚠️  GROQ_API_KEY non configurée, pas d'estimation de dimensions");
      }
    }

    // Suggestion de carton à partir du/des lots et dimensions estimées
    let recommendedCarton = null;
    try {
      console.log(`[Analyze] 📦 Recherche du carton approprié pour ${lots.length} lot(s)...`);
      recommendedCarton = await suggestCartonForLots(lots);
      if (recommendedCarton) {
        console.log(`[Analyze] ✅ Carton recommandé:`, {
          ref: recommendedCarton.ref,
          label: recommendedCarton.label,
          inner: recommendedCarton.inner,
          required: recommendedCarton.required,
        });
      } else {
        console.warn(`[Analyze] ⚠️  Aucun carton trouvé pour les dimensions estimées`);
      }
    } catch (e) {
      console.error("[Analyze] ❌ Suggestion carton échouée:", e?.message || e);
      console.error("[Analyze] Stack:", e?.stack);
    }

    const totalObjects = lots.reduce((sum, lot) => {
      const desc = (lot.description || "").toLowerCase();
      if (desc.includes("paire de") || desc.includes("paire")) return sum + 2;
      const m = desc.match(/lot de (\d+)|ensemble de (\d+)/);
      if (m) return sum + parseInt(m[1] || m[2] || "1", 10);
      return sum + 1;
    }, 0);

    res.json({
      auctionHouse: extracted.salle_vente || undefined,
      auctionDate: extracted.date ? new Date(extracted.date) : new Date(),
      lots,
      totalLots: lots.length,
      totalObjects,
      invoiceTotal: extracted.total ?? undefined,
      invoiceTotalRaw: extracted.total !== null ? String(extracted.total) : undefined,
      recommendedCarton: recommendedCarton || undefined,
      rawText: `OCR\n${ocrRawText}`,
    });
  } catch (error) {
    console.error('Erreur analyse bordereau:', error);
    res.status(500).json({ 
      error: error.message || 'Erreur lors de l\'analyse du bordereau' 
    });
  }
});

/**
 * Route SaaS: extraction structurée (format STRICT demandé)
 * Retourne uniquement le JSON au format:
 * { salle_vente, vente, numero_bordereau, date, total, lots[] }
 */
app.post('/api/bordereau/extract', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        salle_vente: null,
        vente: null,
        numero_bordereau: null,
        date: null,
        total: null,
        lots: [],
      });
    }

    const mimeType = req.file.mimetype || 'image/jpeg';
    const { result } = await extractBordereauFromFile(req.file.buffer, mimeType);

    // Garantie schema strict (pas de champs en plus)
    return res.json({
      salle_vente: result.salle_vente ?? null,
      vente: result.vente ?? null,
      numero_bordereau: result.numero_bordereau ?? null,
      date: result.date ?? null,
      total: typeof result.total === "number" ? result.total : null,
      lots: Array.isArray(result.lots)
        ? result.lots.map((l) => ({
            // IMPORTANT: numero_lot peut être null pour certaines salles (ex: Boisgirard Antonini)
            numero_lot: l.numero_lot !== null && l.numero_lot !== undefined ? String(l.numero_lot) : null,
            description: String(l.description || ""),
            prix_marteau:
              typeof l.prix_marteau === "number" ? l.prix_marteau : null,
          }))
        : [],
    });
  } catch (error) {
    console.error('Erreur extract bordereau:', error);
    // Toujours retourner un JSON valide au bon format
    return res.status(500).json({
      salle_vente: null,
      vente: null,
      numero_bordereau: null,
      date: null,
      total: null,
      lots: [],
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Email SMTP - Supporte Gmail (staging) et Resend (production)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Détecte si on est en environnement staging
 */
function isStagingEnv() {
  return process.env.NODE_ENV === 'staging';
}

/**
 * Envoie un email via l'API Gmail (compte connecté dans les paramètres)
 * Utilisé en staging ET en production. Nécessite saasAccountId et un compte Gmail connecté.
 * @param {Object} params - idem sendEmail
 * @returns {Promise<{ id: string, messageId: string, source: 'GMAIL' }>}
 */
async function sendEmailViaGmail({ to, subject, text, html, saasAccountId }) {
  if (!firestore || !saasAccountId) {
    throw new Error('Un compte Gmail doit être connecté. Connectez un compte Gmail dans Paramètres > Compte Email.');
  }

  const saasAccountRef = firestore.collection('saasAccounts').doc(saasAccountId);
  const saasAccountDoc = await saasAccountRef.get();
  if (!saasAccountDoc.exists) {
    throw new Error('Compte SaaS introuvable.');
  }

  const gmailIntegration = saasAccountDoc.data().integrations?.gmail;
  if (!gmailIntegration?.connected || !gmailIntegration?.email) {
    throw new Error('Aucun compte Gmail connecté pour cet espace. Connectez un compte Gmail dans Paramètres > Compte Email pour envoyer des emails.');
  }

  const toEmail = extractEmailAddress(to);
  if (!isValidEmail(toEmail)) {
    throw new Error(`Email destinataire invalide: ${to}`);
  }

  const fromEmail = gmailIntegration.email;
  let fromDisplayName = 'MBE Devis';
  const saasData = saasAccountDoc.data();
  if (saasData.commercialName) {
    fromDisplayName = `${saasData.commercialName} Devis`;
  }

  const content = (html && html.trim()) ? html.trim() : (text && text.trim()) ? text.trim() : '';
  if (!content) {
    throw new Error('Au moins text ou html doit être fourni');
  }

  const contentType = (html && html.trim()) ? 'text/html' : 'text/plain';
  const subjectEncoded = `=?UTF-8?B?${Buffer.from((subject || 'Sans sujet').trim(), 'utf8').toString('base64')}?=`;
  const mimeLines = [
    `From: "${fromDisplayName}" <${fromEmail}>`,
    `To: ${toEmail}`,
    `Subject: ${subjectEncoded}`,
    'MIME-Version: 1.0',
    `Content-Type: ${contentType}; charset=UTF-8`,
    '',
    content,
  ].join('\r\n');

  const raw = Buffer.from(mimeLines, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const tokens = {
    access_token: gmailIntegration.accessToken,
    refresh_token: gmailIntegration.refreshToken,
    expiry_date: gmailIntegration.expiresAt
      ? (gmailIntegration.expiresAt instanceof Date ? gmailIntegration.expiresAt.getTime() : gmailIntegration.expiresAt.toDate?.()?.getTime?.() ?? new Date(gmailIntegration.expiresAt).getTime())
      : null,
  };

  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
    throw new Error('Gmail OAuth non configuré sur le serveur (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET).');
  }

  const client = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI);
  client.setCredentials(tokens);

  if (tokens.expiry_date && Date.now() > tokens.expiry_date - 60000) {
    const { credentials } = await client.refreshAccessToken();
    await saasAccountRef.update({
      'integrations.gmail.accessToken': credentials.access_token,
      'integrations.gmail.expiresAt': credentials.expiry_date ? new Date(credentials.expiry_date) : null,
    });
    client.setCredentials(credentials);
  }

  const gmail = google.gmail({ version: 'v1', auth: client });
  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  const messageId = result.data.id;
  console.log('[Gmail] ✅ Email envoyé via compte connecté:', fromEmail, '→', toEmail, 'messageId:', messageId);
  return { id: messageId, messageId, source: 'GMAIL', from: fromEmail };
}

/**
 * Envoie un email via le compte Gmail connecté dans Paramètres > Compte Email.
 * Staging ET production : tous les emails partent de l'adresse Gmail de l'utilisateur.
 * @param {Object} params
 * @param {string} params.to - Email destinataire
 * @param {string} params.subject - Sujet
 * @param {string} params.text - Contenu texte brut (fallback)
 * @param {string} params.html - Contenu HTML
 * @param {string} [params.saasAccountId] - ID du compte SaaS (requis)
 * @returns {Promise<Object>} Réponse avec messageId
 */
async function sendEmail({ to, subject, text, html, saasAccountId }) {
  if (!saasAccountId) {
    throw new Error('Impossible d\'envoyer l\'email : connectez un compte Gmail dans Paramètres > Compte Email.');
  }
  return sendEmailViaGmail({ to, subject, text, html, saasAccountId });
  console.log('[Resend] Paramètres reçus:', {
    to: typeof to === 'string' ? to.substring(0, 50) : String(to),
    subject: typeof subject === 'string' ? subject.substring(0, 50) : String(subject),
    hasText: !!text,
    hasHtml: !!html,
    saasAccountId: saasAccountId || 'non fourni'
  });

  // Vérification du client Resend
  if (!resendClient) {
    console.error('[Resend] ❌ Client Resend non initialisé');
    console.error('[Resend] RESEND_API_KEY:', RESEND_API_KEY ? RESEND_API_KEY.substring(0, 5) + '...' : 'MANQUANT');
    throw new Error("Resend non configuré. Ajoute RESEND_API_KEY dans .env.local");
  }

  console.log('[Resend] ✅ Client Resend initialisé');

  // Vérification de l'email expéditeur
  if (!EMAIL_FROM || !isValidEmail(EMAIL_FROM)) {
    console.error('[Resend] ❌ EMAIL_FROM invalide:', EMAIL_FROM);
    throw new Error(`Email expéditeur invalide. Configure EMAIL_FROM dans .env.local`);
  }

  // Vérification que le domaine de l'email est correct
  const emailDomain = EMAIL_FROM.split('@')[1];
  console.log('[Resend] Domaine de l\'email expéditeur:', emailDomain);
  console.log('[Resend] ⚠️  Assurez-vous que ce domaine est vérifié dans Resend Dashboard > Domains');

  // Extraction et validation de l'email destinataire
  const toEmail = extractEmailAddress(to);
  if (!isValidEmail(toEmail)) {
    console.error('[Resend] ❌ Email destinataire invalide:', to);
    throw new Error(`Email destinataire invalide: ${to}`);
  }

  // Récupérer le nom commercial depuis Firestore si saasAccountId est fourni
  let fromDisplayName = EMAIL_FROM_NAME || 'MBE Devis';
  if (saasAccountId && firestore) {
    try {
      const saasAccountDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
      if (saasAccountDoc.exists) {
        const saasAccountData = saasAccountDoc.data();
        if (saasAccountData.commercialName) {
          fromDisplayName = `${saasAccountData.commercialName} Devis`;
          console.log('[Resend] ✅ Nom commercial récupéré:', fromDisplayName);
        }
      }
    } catch (error) {
      console.warn('[Resend] ⚠️  Erreur lors de la récupération du nom commercial, utilisation du fallback:', error.message);
    }
  }

  const fromValue = EMAIL_FROM.trim();
  fromDisplayName = fromDisplayName.trim();
  
  // Format Resend selon la documentation: "Name <email@domain.com>"
  // https://resend.com/docs/api-reference/emails/send-email
  // Format exact: "Display Name <email@domain.com>" avec un espace avant <
  const fromString = `${fromDisplayName} <${fromValue}>`;
  
  // Validation du format
  if (!fromString.match(/^.+ <.+@.+\..+>$/)) {
    console.error('[Resend] ❌ Format from invalide:', fromString);
    throw new Error(`Format expéditeur invalide. Attendu: "Name <email@domain.com>", reçu: ${fromString}`);
  }
  
  console.log('[Resend] Paramètres préparés:', {
    from: fromString,
    fromValue: fromValue,
    fromDisplayName: fromDisplayName,
    to: toEmail,
    subject: (subject || 'Sans sujet').trim(),
    textLength: text ? text.length : 0,
    htmlLength: html ? html.length : 0
  });

  // Préparer les paramètres pour l'API Resend selon la documentation officielle
  // https://resend.com/docs/api-reference/emails/send-email
  const emailParams = {
    from: fromString,
    to: [toEmail], // Resend attend un tableau de strings
    subject: (subject || 'Sans sujet').trim(),
  };

  // Ajouter text et html seulement s'ils sont définis et non vides
  // Resend accepte soit text, soit html, soit les deux
  if (text && text.trim()) {
    emailParams.text = text.trim();
  }
  if (html && html.trim()) {
    emailParams.html = html.trim();
  }

  // Vérification finale: au moins text ou html doit être présent
  if (!emailParams.text && !emailParams.html) {
    console.error('[Resend] ❌ Aucun contenu (text ou html) fourni');
    throw new Error('Au moins text ou html doit être fourni');
  }

  console.log('[Resend] Paramètres finaux pour API:', {
    from: emailParams.from,
    to: emailParams.to,
    subject: emailParams.subject,
    hasText: !!emailParams.text,
    hasHtml: !!emailParams.html,
    textPreview: emailParams.text ? emailParams.text.substring(0, 100) + '...' : null,
    htmlPreview: emailParams.html ? emailParams.html.substring(0, 100) + '...' : null
  });

  console.log('[Resend] 🚀 Envoi de la requête à Resend API...');

  try {
    // Appel à l'API Resend via SDK
    const result = await resendClient.emails.send(emailParams);
    
    console.log('[Resend] Réponse brute de Resend:', JSON.stringify(result, null, 2));

    // Resend retourne { data, error }
    const { data, error } = result;

    if (error) {
      console.error('[Resend] ❌ Erreur retournée par Resend API:', JSON.stringify(error, null, 2));
      const errorMsg = error.message || JSON.stringify(error);
      const errorType = error.type || error.name || '';
      const errorStatusCode = error.statusCode || 0;
      
      // Log détaillé de l'erreur pour diagnostic
      console.error('[Resend] Détails erreur:', {
        message: errorMsg,
        type: errorType,
        statusCode: errorStatusCode,
        fullError: error
      });
      
      // Propager l'erreur avec le message complet pour une meilleure détection
      // IMPORTANT: Utiliser le message original de Resend, pas "Erreur Resend API: ..."
      const enhancedError = new Error(errorMsg);
      enhancedError.resendError = error;
      enhancedError.resendType = errorType;
      enhancedError.resendStatusCode = errorStatusCode;
      throw enhancedError;
    }

    if (!data || !data.id) {
      console.error('[Resend] ❌ Réponse invalide de Resend (pas de data.id):', JSON.stringify(result, null, 2));
      throw new Error('Réponse invalide de Resend API');
    }

    console.log('[Resend] ✅ Email envoyé avec succès!');
    console.log('[Resend] Message ID:', data.id);
    console.log('[Resend] ===== FIN sendEmail (succès) =====');
    
    return { 
      id: data.id, 
      messageId: data.id,
      source: 'RESEND',
      from: fromValue
    };
  } catch (error) {
    const errorMessage = error.message || String(error);
    const isPatternError = errorMessage.includes('pattern') || errorMessage.includes('expected pattern');
    
    console.error('[Resend] ❌ EXCEPTION lors de l\'envoi:', {
      message: errorMessage,
      name: error.name,
      isPatternError: isPatternError,
      stack: error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : 'Pas de stack',
      errorString: String(error)
    });
    
    // Si c'est une erreur de pattern, essayer avec l'appel HTTP direct
    if (isPatternError) {
      console.log('[Resend] ⚠️  Erreur de pattern détectée, tentative avec appel HTTP direct...');
      try {
        const directResult = await sendEmailDirectHTTP({ to, subject, text, html, saasAccountId });
        console.log('[Resend] ✅ Email envoyé avec succès via HTTP direct!');
        console.log('[Resend] Message ID:', directResult.id);
        console.log('[Resend] ===== FIN sendEmail (succès via HTTP direct) =====');
        return {
          id: directResult.id,
          messageId: directResult.id,
          source: 'RESEND',
          from: fromValue
        };
      } catch (directError) {
        console.error('[Resend] ❌ Échec aussi avec HTTP direct:', directError.message);
        throw new Error(`Erreur envoi email Resend (SDK et HTTP direct): ${errorMessage}`);
      }
    }
    
    console.error('[Resend] ===== FIN sendEmail (erreur) =====');
    
    // IMPORTANT: Propager l'erreur avec ses métadonnées Resend si elles existent
    if (error.resendError || error.resendStatusCode) {
      const enhancedError = new Error(error.message || errorMessage);
      enhancedError.resendError = error.resendError || error;
      enhancedError.resendType = error.resendType || '';
      enhancedError.resendStatusCode = error.resendStatusCode || 0;
      console.error('[Resend] Propagation erreur avec métadonnées:', {
        message: enhancedError.message,
        resendStatusCode: enhancedError.resendStatusCode,
        resendType: enhancedError.resendType
      });
      throw enhancedError;
    }
    
    // Sinon, propager l'erreur originale telle quelle
    throw error;
  }
}

/**
 * Fonction de test: Appel HTTP direct à l'API Resend (contourne le SDK)
 * Utile pour diagnostiquer les problèmes avec le SDK
 */
async function sendEmailDirectHTTP({ to, subject, text, html, saasAccountId }) {
  console.log('[Resend Direct HTTP] ===== Test avec appel HTTP direct =====');
  
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY manquant');
  }
  
  if (!EMAIL_FROM || !isValidEmail(EMAIL_FROM)) {
    throw new Error(`EMAIL_FROM invalide: ${EMAIL_FROM}`);
  }
  
  const toEmail = extractEmailAddress(to);
  if (!isValidEmail(toEmail)) {
    throw new Error(`Email destinataire invalide: ${to}`);
  }
  
  // Récupérer le nom commercial depuis Firestore si saasAccountId est fourni
  let fromDisplayName = EMAIL_FROM_NAME || 'MBE Devis';
  if (saasAccountId && firestore) {
    try {
      const saasAccountDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
      if (saasAccountDoc.exists) {
        const saasAccountData = saasAccountDoc.data();
        if (saasAccountData.commercialName) {
          fromDisplayName = `${saasAccountData.commercialName} Devis`;
          console.log('[Resend Direct HTTP] ✅ Nom commercial récupéré:', fromDisplayName);
        }
      }
    } catch (error) {
      console.warn('[Resend Direct HTTP] ⚠️  Erreur lors de la récupération du nom commercial, utilisation du fallback:', error.message);
    }
  }
  
  const fromString = `${fromDisplayName} <${EMAIL_FROM}>`;
  
  const payload = {
    from: fromString,
    to: [toEmail],
    subject: (subject || 'Test').trim(),
  };
  
  if (text && text.trim()) {
    payload.text = text.trim();
  }
  if (html && html.trim()) {
    payload.html = html.trim();
  }
  
  console.log('[Resend Direct HTTP] Payload:', JSON.stringify(payload, null, 2));
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    const responseText = await response.text();
    console.log('[Resend Direct HTTP] Status:', response.status);
    console.log('[Resend Direct HTTP] Response:', responseText);
    
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      throw new Error(`Réponse non-JSON: ${responseText}`);
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(responseData)}`);
    }
    
    console.log('[Resend Direct HTTP] ✅ Succès!');
    return responseData;
  } catch (error) {
    console.error('[Resend Direct HTTP] ❌ Erreur:', error.message);
    throw error;
  }
}

/**
 * Route: Envoyer le devis par email au client
 * POST /api/send-quote-email
 * Body: { quote: Quote }
 */
app.post('/api/send-quote-email', async (req, res) => {
  console.log('[AI Proxy] ✅ POST /api/send-quote-email appelé - Route trouvée!');
  console.log('[AI Proxy] Request body:', JSON.stringify(req.body).substring(0, 200));
  
  let clientEmail = null;
  
  try {
    const { quote, customMessage } = req.body;
    console.log('[Email] 📦 Quote reçu - ID:', quote?.id);
    console.log('[Email] 📦 Quote.paymentLinks:', quote?.paymentLinks ? `${quote.paymentLinks.length} lien(s)` : 'undefined');

    if (!quote || !quote.client || !quote.client.email) {
      return res.status(400).json({ error: 'Quote ou email client manquant' });
    }

    // Récupérer les paymentLinks depuis Firestore (toujours vérifier pour avoir les données à jour)
    let paymentLinksToUse = quote.paymentLinks || [];
    
    // Toujours essayer de récupérer depuis Firestore pour avoir les données les plus récentes
    if (quote.id && firestore) {
      console.log('[Email] 🔍 Récupération des paymentLinks depuis Firestore...');
      try {
        const quoteDoc = await firestore.collection('quotes').doc(quote.id).get();
        if (quoteDoc.exists) {
          const quoteData = quoteDoc.data();
          const firestorePaymentLinks = quoteData.paymentLinks || [];
          
          // Utiliser les liens de Firestore s'ils existent, sinon utiliser ceux du quote
          if (firestorePaymentLinks.length > 0) {
            paymentLinksToUse = firestorePaymentLinks;
            console.log('[Email] ✅ PaymentLinks récupérés depuis Firestore:', paymentLinksToUse.length, 'lien(s)');
          } else if (paymentLinksToUse.length === 0) {
            console.log('[Email] ⚠️ Aucun paymentLink trouvé ni dans le quote ni dans Firestore');
          } else {
            console.log('[Email] ℹ️ Utilisation des paymentLinks du quote (Firestore vide):', paymentLinksToUse.length, 'lien(s)');
          }
        } else {
          console.log('[Email] ⚠️ Quote document non trouvé dans Firestore pour ID:', quote.id);
        }
      } catch (error) {
        console.error('[Email] ❌ Erreur lors de la récupération des paymentLinks:', error);
        // Continuer avec les paymentLinks du quote en cas d'erreur
        console.log('[Email] ℹ️ Utilisation des paymentLinks du quote en fallback:', paymentLinksToUse.length, 'lien(s)');
      }
    } else {
      console.log('[Email] ⚠️ Quote.id ou firestore manquant, utilisation des paymentLinks du quote:', paymentLinksToUse.length, 'lien(s)');
    }

    clientEmail = quote.client.email.trim().toLowerCase();
    
    // Validation de l'email
    if (!isValidEmail(clientEmail)) {
      return res.status(400).json({ 
        error: `Format d'email invalide: ${clientEmail}`,
        hint: 'Vérifiez que l\'email du client est correct'
      });
    }

    const clientName = quote.client.name || 'Client';
    const reference = quote.reference || 'N/A';
    
    // Récupération des informations du lot depuis auctionSheet
    const lots = quote.auctionSheet?.lots || [];
    const lotNumber = lots.length > 0 ? lots.map(l => l.number).join(', ') : 'N/A';
    const lotDescription = lots.length > 0 
      ? lots.map(l => l.description || 'Objet à transporter').join(', ')
      : 'Objet à transporter';
    
    const pickupAddress = quote.pickup?.address?.line1 || 'Non précisée';
    const deliveryAddress = quote.delivery?.address?.line1 || 'Non précisée';
    const auctionHouse = quote.auctionSheet?.auctionHouse || 'Non précisée';
    
    // Extraction des coûts détaillés depuis quote.options (calculés dans QuoteDetail.tsx)
    // Utiliser le prix du carton depuis auctionSheet.recommendedCarton si disponible
    // Sinon utiliser quote.options.packagingPrice comme fallback
    const cartonPrice = quote.auctionSheet?.recommendedCarton?.price || 
                        quote.auctionSheet?.recommendedCarton?.priceTTC || 
                        null;
    const packagingPrice = cartonPrice !== null && cartonPrice !== undefined ? cartonPrice : (quote.options?.packagingPrice || 0);
    const shippingPrice = quote.options?.shippingPrice || 0;
    const insuranceEnabled = quote.options?.insurance || false;
    const insuranceAmount = quote.options?.insuranceAmount || 0;
    
    // Valeur du lot pour l'assurance
    const lotValue = lots.length > 0 
      ? lots.reduce((sum, lot) => sum + (lot.total || lot.value || 0), 0)
      : 0;
    
    // Calcul de l'assurance via paramètres configurés par compte (insuranceSettings)
    const saasAccountIdForInsurance = quote.saasAccountId || req.saasAccountId;
    const finalInsuranceAmount = insuranceEnabled 
      ? (insuranceAmount > 0 ? insuranceAmount : await computeInsuranceAmountFromSettings(firestore, saasAccountIdForInsurance, lotValue, true, 0))
      : 0;
    
    // Calcul du total : emballage + transport + assurance (si activée)
    const calculatedTotal = packagingPrice + shippingPrice + finalInsuranceAmount;
    
    // Récupération du lien de paiement (le plus récent actif)
    console.log('[Email] 🔍 Recherche lien de paiement...');
    console.log('[Email] Nombre de paymentLinks:', paymentLinksToUse.length);
    console.log('[Email] PaymentLinks:', JSON.stringify(paymentLinksToUse, null, 2));
    
    // Fonction helper pour convertir createdAt en Date
    const getCreatedAtDate = (link) => {
      if (!link.createdAt) return new Date(0);
      if (link.createdAt.toDate) return link.createdAt.toDate(); // Firestore Timestamp
      if (link.createdAt instanceof Date) return link.createdAt;
      return new Date(link.createdAt);
    };
    
    // Filtrer les liens actifs (active, pending ou sans status)
    const isActive = (link) => {
      if (!link) return false;
      const s = link.status;
      return s === 'active' || s === 'pending' || !s;
    };
    const activeLinks = paymentLinksToUse.filter(isActive);

    // Détecter mode 2 liens (Standard + Express) pour les plans Pro/Ultra
    const standardLink = activeLinks.find((l) => l.type === 'PRINCIPAL_STANDARD');
    const expressLink = activeLinks.find((l) => l.type === 'PRINCIPAL_EXPRESS');
    const hasTwoLinks = standardLink && expressLink;

    // Lien unique (fallback) : plus récent actif
    const activePaymentLink = activeLinks.sort((a, b) => getCreatedAtDate(b) - getCreatedAtDate(a))[0];
    const paymentUrl = activePaymentLink?.url || null;

    // Construire la section paiement pour le template (lien unique ou 2 liens)
    // Texte brut pour compatibilité bodySections (escapeHtml) et bodyHtml
    let sectionPaiement;
    if (hasTwoLinks) {
      const stdUrl = standardLink?.url || '';
      const expUrl = expressLink?.url || '';
      const stdPrice = (standardLink?.amount ?? 0).toFixed(2);
      const expPrice = (expressLink?.amount ?? 0).toFixed(2);
      sectionPaiement = `Choisissez votre mode d'expédition :

• Standard (${stdPrice} €) : ${stdUrl}

• Express (${expPrice} €) : ${expUrl}

Dès qu'un des deux liens est payé, l'autre est automatiquement désactivé.`;
    } else {
      sectionPaiement = paymentUrl ? `👉 ${paymentUrl}` : '';
    }
    
    console.log('[Email] Active payment link:', activePaymentLink ? 'Trouvé' : 'Non trouvé');
    if (activePaymentLink) {
      console.log('[Email] Payment link details:', {
        id: activePaymentLink.id,
        url: paymentUrl,
        status: activePaymentLink.status,
        amount: activePaymentLink.amount,
        createdAt: activePaymentLink.createdAt
      });
    } else {
      console.log('[Email] ⚠️ Aucun lien de paiement actif trouvé. PaymentLinks disponibles:', paymentLinksToUse.map(l => ({
        id: l?.id,
        status: l?.status,
        hasUrl: !!l?.url
      })));
    }
    console.log('[Email] Payment URL:', paymentUrl);
    
    // Utiliser le montant du lien de paiement s'il existe, sinon le calculatedTotal
    const finalTotal = activePaymentLink?.amount || calculatedTotal;
    console.log('[Email] Final total:', finalTotal, '(from:', activePaymentLink ? 'payment link' : 'calculated', ')');

    // Charger le template personnalisable (quote_send)
    const saasAccountId = quote.saasAccountId || req.saasAccountId;
    let mbeName = quote._saasCommercialName || 'MBE';
    if (firestore && saasAccountId) {
      try {
        const saasDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
        if (saasDoc.exists && saasDoc.data().commercialName) {
          mbeName = saasDoc.data().commercialName;
        }
      } catch (e) {
        console.warn('[Email] Impossible de charger commercialName:', e.message);
      }
    }
    const templateValues = {
      bordereauNum: quote.auctionSheet?.bordereauNumber || 'N/A',
      reference,
      nomSalleVentes: auctionHouse,
      prixEmballage: packagingPrice.toFixed(2),
      prixTransport: shippingPrice.toFixed(2),
      prixAssurance: insuranceEnabled ? `${finalInsuranceAmount.toFixed(2)} €` : 'NON (Si vous souhaitez une assurance, merci de nous le signaler par retour de mail)',
      prixTotal: finalTotal.toFixed(2),
      sectionPaiement,
      lienPaiementSecurise: paymentUrl || '',
      paymentUrl: paymentUrl || '',
      adresseDestinataire: [
        quote.delivery?.address?.line1,
        quote.delivery?.address?.line2,
        quote.delivery?.address?.zip,
        quote.delivery?.address?.city,
        quote.delivery?.address?.country,
      ].filter(Boolean).join(', ') || deliveryAddress,
      clientName,
      date: new Date().toLocaleDateString('fr-FR'),
      lotNumber,
      lotDescription,
      mbeName,
      amount: finalTotal.toFixed(2),
      messagePersonnalise: customMessage || '',
    };
    const emailTemplates = firestore && saasAccountId
      ? (await firestore.collection('saasAccounts').doc(saasAccountId).get()).data()?.emailTemplates
      : null;
    const templates = getTemplatesExtendedForAccount(emailTemplates);
    const t = templates.quote_send || {};
    const renderedBody = Array.isArray(t.bodySections) && t.bodySections.length > 0
      ? buildBodyHtmlFromSections(t.bodySections, templateValues)
      : replacePlaceholdersExtended(t.bodyHtml || DEFAULT_TEMPLATES_EXTENDED.quote_send.bodyHtml, templateValues);
    const renderedSignature = replacePlaceholdersExtended(t.signature || DEFAULT_TEMPLATES_EXTENDED.quote_send.signature, templateValues).replace(/\n/g, '<br>');
    const htmlContent = buildEmailHtmlFromTemplate(
      { ...t, bannerColor: t.bannerColor || '#2563eb', buttonColor: t.buttonColor || '#2563eb', fontFamily: t.fontFamily || 'Arial, sans-serif', fontSize: t.fontSize || 14 },
      renderedBody,
      renderedSignature,
      { ...templateValues, lienPaiementSecurise: paymentUrl || '' }
    );
    const emailSubject = replacePlaceholdersExtended(t.subject || DEFAULT_TEMPLATES_EXTENDED.quote_send.subject, templateValues);

    // Texte brut
    const textContent = `
Bonjour ${clientName},

Voici votre devis de transport :

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEVIS ${reference}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 LOT ${lotNumber}
${lotDescription}

🏛️  Salle des ventes : ${auctionHouse}

📍 ADRESSE DE LIVRAISON
${deliveryAddress}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DÉTAIL DES COÛTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Emballage${(() => {
            const carton = quote.auctionSheet?.recommendedCarton;
            if (!carton) return '';
            const displayName = carton.label ? cleanCartonRef(carton.label) : (carton.ref ? cleanCartonRef(carton.ref) : '');
            return displayName ? ` (carton ${displayName})` : '';
          })()} : ${packagingPrice.toFixed(2)}€
Expédition (Express)${quote.delivery?.address?.country ? ` (${quote.delivery.address.country})` : ''} : ${shippingPrice.toFixed(2)}€
Assurance : ${insuranceEnabled ? 'Oui' : 'Non'}${insuranceEnabled ? `
  - Valeur assurée : ${lotValue.toFixed(2)}€
  - Coût assurance : ${finalInsuranceAmount.toFixed(2)}€` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 MONTANT TOTAL : ${finalTotal.toFixed(2)}€
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${(hasTwoLinks && standardLink?.url && expressLink?.url)
            ? `🔗 LIENS DE PAIEMENT (choisissez Standard ou Express) :

• Standard (${(standardLink?.amount ?? 0).toFixed(2)} €) : ${standardLink?.url || ''}

• Express (${(expressLink?.amount ?? 0).toFixed(2)} €) : ${expressLink?.url || ''}

Dès qu'un des deux liens est payé, l'autre est désactivé.`
            : paymentUrl
              ? `🔗 LIEN DE PAIEMENT :
${paymentUrl}

Cliquez sur le lien ci-dessus pour procéder au paiement.`
              : ''}

Pour toute question, n'hésitez pas à nous contacter.

Cordialement,
L'équipe MBE
    `.trim();

    // Envoi via Resend
    console.log('[AI Proxy] Envoi email via Resend à:', clientEmail);
    const result = await sendEmail({
      to: clientEmail,
      subject: emailSubject,
      text: textContent,
      html: htmlContent,
      saasAccountId,
    });
    console.log('[AI Proxy] Email envoyé avec succès:', result);

    console.log(`[Resend] Email envoyé avec succès:`, result.messageId);
    
    // Sauvegarder l'email dans Firestore (collection emailMessages)
    try {
      if (firestore && quote.id) {
        const emailMessageData = {
          devisId: quote.id,
          clientId: quote.client?.id || null,
          clientEmail: clientEmail,
          direction: 'OUT',
          source: result.source || 'RESEND',
          from: result.from || EMAIL_FROM || 'devis@mbe-sdv.fr',
          to: [clientEmail],
          subject: emailSubject,
          bodyText: textContent,
          bodyHtml: htmlContent,
          messageId: result.id || result.messageId || null,
          createdAt: Timestamp.now(),
        };
        
        await firestore.collection('emailMessages').add(emailMessageData);
        console.log('[emailMessages] ✅ Email sauvegardé dans Firestore pour devis:', quote.id);
      } else {
        console.warn('[emailMessages] ⚠️ Firestore non initialisé ou quote.id manquant, email non sauvegardé');
      }
    } catch (firestoreError) {
      // Ne pas faire échouer l'envoi d'email si la sauvegarde Firestore échoue
      console.error('[emailMessages] ❌ Erreur lors de la sauvegarde de l\'email dans Firestore:', firestoreError);
    }

    // Enregistrer la date d'envoi du devis (pour Bilan)
    if (firestore && quote.id) {
      try {
        await firestore.collection('quotes').doc(quote.id).update({
          quoteSentAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      } catch (e) {
        console.warn('[emailMessages] quoteSentAt non mis à jour:', e?.message);
      }
    }

    // Synchroniser vers le Bilan Google Sheet si configuré (saasAccountId déjà défini plus haut)
    if (firestore && quote.id && saasAccountId) {
      try {
        const saasDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
        if (saasDoc.exists) {
          const auth = getGoogleAuthForSaasAccount(saasDoc.data());
          if (auth) await syncQuoteToBilanSheet(firestore, auth, saasAccountId, quote.id);
        }
      } catch (bilanErr) {
        console.warn('[Bilan] Sync après envoi email:', bilanErr?.message);
      }
    }
    
    res.json({ success: true, messageId: result.id, to: clientEmail });
  } catch (error) {
    console.error(`[Resend] Erreur envoi email:`, error);
    console.error(`[Resend] Erreur complète:`, {
      message: error.message,
      name: error.name,
      resendError: error.resendError,
      resendType: error.resendType,
      resendStatusCode: error.resendStatusCode,
      stack: error.stack?.split('\n').slice(0, 3).join('\n')
    });
    
    // clientEmail est maintenant défini avant le try, donc accessible ici
    const errorMessage = error.message || 'Erreur lors de l\'envoi de l\'email';
    
    // Extraire les métadonnées Resend de l'erreur (peuvent être dans resendError ou directement dans error)
    // L'erreur peut avoir été propagée depuis sendEmail avec resendError, resendType, resendStatusCode
    const resendErrorObj = error.resendError || (error.name === 'Error' && error.resendError ? error.resendError : null) || error;
    const resendError = typeof resendErrorObj === 'object' && resendErrorObj !== null ? resendErrorObj : {};
    const resendType = error.resendType || resendError.type || resendError.name || '';
    const resendStatusCode = error.resendStatusCode || resendError.statusCode || 0;
    
    console.log('[Resend] Extraction métadonnées Resend:', {
      hasResendError: !!error.resendError,
      resendStatusCode,
      resendType,
      errorKeys: Object.keys(error),
      resendErrorKeys: resendErrorObj ? Object.keys(resendErrorObj) : []
    });
    
    let statusCode = 500;
    let errorCode = 'EMAIL_SEND_ERROR';
    let hint = '';
    
    // Détection précise des erreurs Resend
    // Erreur de domaine NON VÉRIFIÉ : doit contenir explicitement "not verified" ET "domain" dans le message
    const errorMsgLower = errorMessage.toLowerCase();
    const isDomainNotVerified = (
      (errorMsgLower.includes('domain') && errorMsgLower.includes('not verified')) ||
      errorMsgLower.includes('domain is not verified') ||
      (errorMsgLower.includes('the domain') && errorMsgLower.includes('is not verified'))
    );
    
    console.log('[Resend] Détection erreur domaine:', {
      isDomainNotVerified,
      errorMessage: errorMessage,
      resendStatusCode,
      containsDomain: errorMsgLower.includes('domain'),
      containsNotVerified: errorMsgLower.includes('not verified'),
      resendError: resendError
    });
    
    // Mapper les erreurs Resend pour une meilleure UX
    if (errorMessage.includes('non configuré') || errorMessage.includes('Resend non configuré')) {
      statusCode = 502;
      errorCode = 'RESEND_NOT_CONFIGURED';
      hint = `⚠️ Resend non configuré. Ajoutez RESEND_API_KEY et EMAIL_FROM dans front end/.env.local`;
    } else if (isDomainNotVerified) {
      // Seulement si c'est vraiment une erreur de domaine non vérifié
      statusCode = 400;
      errorCode = 'EMAIL_DOMAIN_NOT_VERIFIED';
      const emailDomain = EMAIL_FROM?.split('@')[1] || 'domaine inconnu';
      
      // Message d'erreur clair selon le domaine utilisé
      if (emailDomain === 'gmail.com' || emailDomain === 'yahoo.com' || emailDomain === 'hotmail.com' || emailDomain === 'outlook.com') {
        hint = `⚠️ Vous utilisez actuellement ${EMAIL_FROM} (domaine ${emailDomain}) qui n'est pas vérifiable dans Resend. Pour utiliser votre domaine vérifié mbe-sdv.fr, modifiez EMAIL_FROM dans votre fichier front end/.env.local avec : EMAIL_FROM=devis@mbe-sdv.fr (ou contact@mbe-sdv.fr)`;
      } else {
        hint = `⚠️ Le domaine "${emailDomain}" utilisé dans EMAIL_FROM (${EMAIL_FROM}) n'est pas vérifié dans Resend. Vérifiez que ce domaine est bien vérifié dans Resend Dashboard > Domains, ou utilisez un email avec le domaine mbe-sdv.fr (ex: devis@mbe-sdv.fr).`;
      }
    } else if (errorMessage.includes('API') || errorMessage.includes('api key') || errorMessage.includes('401') || (errorMessage.includes('403') && !isDomainNotVerified)) {
      statusCode = 403;
      errorCode = 'RESEND_AUTH_ERROR';
      hint = `⚠️ Erreur d'authentification Resend (403). Vérifiez que RESEND_API_KEY est correcte sur https://resend.com/api-keys. Si le domaine ${EMAIL_FROM?.split('@')[1] || 'mbe-sdv.fr'} est vérifié, cela peut être une autre erreur. Détails: ${errorMessage.substring(0, 200)}`;
    } else if (errorMessage.includes('invalid') || errorMessage.includes('format')) {
      statusCode = 400;
      errorCode = 'INVALID_EMAIL_FORMAT';
      hint = `⚠️ Format d'email invalide`;
    } else {
      // Erreur générique avec le message complet pour diagnostic
      statusCode = 500;
      errorCode = 'EMAIL_SEND_ERROR';
      hint = `⚠️ Erreur lors de l'envoi: ${errorMessage.substring(0, 150)}`;
    }
    
    console.error(`[Resend] Erreur mappée:`, {
      statusCode,
      errorCode,
      hint,
      originalMessage: errorMessage,
      resendType,
      resendStatusCode
    });
    
    res.status(statusCode).json({ 
      success: false,
      error: errorMessage,
      code: errorCode,
      hint: hint || undefined,
      clientEmail: clientEmail || 'email inconnu',
      emailFrom: EMAIL_FROM // Inclure l'email utilisé pour diagnostic
    });
  }
});

/**
 * Route: Envoyer le surcoût par email au client
 * POST /api/send-surcharge-email
 * Body: { quote: Quote, surchargePaiement: { id, amount, description, url } }
 */
app.post('/api/send-surcharge-email', async (req, res) => {
  console.log('[AI Proxy] ✅ POST /api/send-surcharge-email appelé - Route trouvée!');
  console.log('[AI Proxy] Request body:', JSON.stringify(req.body).substring(0, 200));
  
  let clientEmail = null;
  
  try {
    const { quote, surchargePaiement } = req.body;
    console.log('[Surcharge Email] 📦 Quote reçu - ID:', quote?.id);
    console.log('[Surcharge Email] 📦 Surcharge paiement:', surchargePaiement);

    if (!quote || !quote.client || !quote.client.email) {
      return res.status(400).json({ error: 'Quote ou email client manquant' });
    }

    if (!surchargePaiement || !surchargePaiement.amount || !surchargePaiement.url) {
      return res.status(400).json({ error: 'Informations surcoût manquantes (amount ou url)' });
    }

    clientEmail = quote.client.email.trim().toLowerCase();
    
    // Validation de l'email
    if (!isValidEmail(clientEmail)) {
      return res.status(400).json({ 
        error: `Format d'email invalide: ${clientEmail}`,
        hint: 'Vérifiez que l\'email du client est correct'
      });
    }

    const clientName = quote.client.name || 'Client';
    const reference = quote.reference || 'N/A';
    const surchargeAmount = surchargePaiement.amount;
    const surchargeUrl = surchargePaiement.url;
    const rawDescription = surchargePaiement.description || 'Surcoût supplémentaire';
    const enhancedDescription = rawDescription.trim().length > 0
      ? rawDescription.trim().charAt(0).toUpperCase() + rawDescription.trim().slice(1)
      : 'Surcoût supplémentaire';

    const saasAccountId = quote.saasAccountId || req.saasAccountId;
    let mbeName = quote._saasCommercialName || 'MBE';
    if (firestore && saasAccountId) {
      try {
        const saasDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
        if (saasDoc.exists && saasDoc.data().commercialName) {
          mbeName = saasDoc.data().commercialName;
        }
      } catch (e) {
        console.warn('[Surcharge Email] Impossible de charger commercialName:', e.message);
      }
    }

    const templateValues = {
      clientName,
      reference,
      description: enhancedDescription,
      amount: surchargeAmount.toFixed(2),
      lienPaiementSecurise: surchargeUrl,
      paymentUrl: surchargeUrl,
      mbeName,
    };
    const emailTemplates = firestore && saasAccountId
      ? (await firestore.collection('saasAccounts').doc(saasAccountId).get()).data()?.emailTemplates
      : null;
    const templates = getTemplatesExtendedForAccount(emailTemplates);
    const t = templates.surcharge || {};
    const defaultSurcharge = DEFAULT_TEMPLATES_EXTENDED.surcharge || {};
    const bodyHtmlRaw = t.bodyHtml || defaultSurcharge.bodyHtml || '';
    const renderedBody = replacePlaceholdersExtended(bodyHtmlRaw, templateValues);
    const signatureRaw = t.signature || defaultSurcharge.signature || 'Cordialement,<br><strong>{{mbeName}}</strong>';
    const renderedSignature = replacePlaceholdersExtended(signatureRaw, templateValues).replace(/\n/g, '<br>');
    // Utiliser buildEmailHtmlSimple (sans injection de bouton) car le bodyHtml du template
    // contient déjà la section paiement (bouton + lien)
    const htmlContent = buildEmailHtmlSimple(
      { ...t, bannerColor: t.bannerColor || '#2563eb', bannerTitle: t.bannerTitle || defaultSurcharge.bannerTitle },
      renderedBody,
      renderedSignature,
      templateValues
    );
    const subjectRaw = t.subject || defaultSurcharge.subject || 'Surcoût supplémentaire - {{reference}}';
    const emailSubject = replacePlaceholdersExtended(subjectRaw, templateValues);

    // Texte brut
    const textContent = `
Bonjour ${clientName},

Nous vous contactons concernant votre devis de transport ${reference}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SURCOÛT SUPPLÉMENTAIRE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${enhancedDescription}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 MONTANT DU SURCOÛT : ${surchargeAmount.toFixed(2)}€
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔗 LIEN DE PAIEMENT :
${surchargeUrl}

Cliquez sur le lien ci-dessus pour procéder au paiement du surcoût.

Pour toute question concernant ce surcoût, n'hésitez pas à nous contacter.

Cordialement,
L'équipe MBE
    `.trim();

    // Envoi via Resend
    console.log('[AI Proxy] Envoi email surcoût via Resend à:', clientEmail);
    const result = await sendEmail({
      to: clientEmail,
      subject: emailSubject,
      text: textContent,
      html: htmlContent,
      saasAccountId,
    });
    console.log('[AI Proxy] Email surcoût envoyé avec succès:', result);

    console.log(`[Resend] Email surcoût envoyé avec succès:`, result.messageId);
    
    // Sauvegarder l'email dans Firestore (collection emailMessages)
    try {
      if (firestore && quote.id) {
        const emailMessageData = {
          devisId: quote.id,
          clientId: quote.client?.id || null,
          clientEmail: clientEmail,
          direction: 'OUT',
          source: result.source || 'RESEND',
          from: result.from || EMAIL_FROM || 'devis@mbe-sdv.fr',
          to: [clientEmail],
          subject: emailSubject,
          bodyText: textContent,
          bodyHtml: htmlContent,
          messageId: result.id || result.messageId || null,
          createdAt: Timestamp.now(),
        };
        
        await firestore.collection('emailMessages').add(emailMessageData);
        console.log('[emailMessages] ✅ Email surcoût sauvegardé dans Firestore pour devis:', quote.id);
      } else {
        console.warn('[emailMessages] ⚠️ Firestore non initialisé ou quote.id manquant, email non sauvegardé');
      }
    } catch (firestoreError) {
      // Ne pas faire échouer l'envoi d'email si la sauvegarde Firestore échoue
      console.error('[emailMessages] ❌ Erreur lors de la sauvegarde de l\'email surcoût dans Firestore:', firestoreError);
    }
    
    res.json({ success: true, messageId: result.id, to: clientEmail });
  } catch (error) {
    console.error(`[Resend] Erreur envoi email surcoût:`, error);
    console.error(`[Resend] Erreur complète:`, {
      message: error.message,
      name: error.name,
      resendError: error.resendError,
      resendType: error.resendType,
      resendStatusCode: error.resendStatusCode,
      stack: error.stack?.split('\n').slice(0, 3).join('\n')
    });
    
    const errorMessage = error.message || 'Erreur lors de l\'envoi de l\'email surcoût';
    
    // Extraire les métadonnées Resend de l'erreur
    const resendErrorObj = error.resendError || (error.name === 'Error' && error.resendError ? error.resendError : null) || error;
    const resendError = typeof resendErrorObj === 'object' && resendErrorObj !== null ? resendErrorObj : {};
    const resendType = error.resendType || resendError.type || resendError.name || '';
    const resendStatusCode = error.resendStatusCode || resendError.statusCode || 0;
    
    let statusCode = 500;
    let errorCode = 'EMAIL_SEND_ERROR';
    let hint = '';
    
    // Détection précise des erreurs Resend (même logique que send-quote-email)
    const errorMsgLower = errorMessage.toLowerCase();
    const isDomainNotVerified = (
      (errorMsgLower.includes('domain') && errorMsgLower.includes('not verified')) ||
      errorMsgLower.includes('domain is not verified') ||
      (errorMsgLower.includes('the domain') && errorMsgLower.includes('is not verified'))
    );
    
    // Mapper les erreurs Resend pour une meilleure UX
    if (errorMessage.includes('non configuré') || errorMessage.includes('Resend non configuré')) {
      statusCode = 502;
      errorCode = 'RESEND_NOT_CONFIGURED';
      hint = `⚠️ Resend non configuré. Ajoutez RESEND_API_KEY et EMAIL_FROM dans front end/.env.local`;
    } else if (isDomainNotVerified) {
      statusCode = 400;
      errorCode = 'EMAIL_DOMAIN_NOT_VERIFIED';
      const emailDomain = EMAIL_FROM?.split('@')[1] || 'domaine inconnu';
      
      if (emailDomain === 'gmail.com' || emailDomain === 'yahoo.com' || emailDomain === 'hotmail.com' || emailDomain === 'outlook.com') {
        hint = `⚠️ Vous utilisez actuellement ${EMAIL_FROM} (domaine ${emailDomain}) qui n'est pas vérifiable dans Resend. Pour utiliser votre domaine vérifié mbe-sdv.fr, modifiez EMAIL_FROM dans votre fichier front end/.env.local avec : EMAIL_FROM=devis@mbe-sdv.fr (ou contact@mbe-sdv.fr)`;
      } else {
        hint = `⚠️ Le domaine "${emailDomain}" utilisé dans EMAIL_FROM (${EMAIL_FROM}) n'est pas vérifié dans Resend. Vérifiez que ce domaine est bien vérifié dans Resend Dashboard > Domains, ou utilisez un email avec le domaine mbe-sdv.fr (ex: devis@mbe-sdv.fr).`;
      }
    } else if (errorMessage.includes('API') || errorMessage.includes('api key') || errorMessage.includes('401') || (errorMessage.includes('403') && !isDomainNotVerified)) {
      statusCode = 403;
      errorCode = 'RESEND_AUTH_ERROR';
      hint = `⚠️ Erreur d'authentification Resend (403). Vérifiez que RESEND_API_KEY est correcte sur https://resend.com/api-keys. Si le domaine ${EMAIL_FROM?.split('@')[1] || 'mbe-sdv.fr'} est vérifié, cela peut être une autre erreur. Détails: ${errorMessage.substring(0, 200)}`;
    } else if (errorMessage.includes('invalid') || errorMessage.includes('format')) {
      statusCode = 400;
      errorCode = 'INVALID_EMAIL_FORMAT';
      hint = `⚠️ Format d'email invalide`;
    } else {
      statusCode = 500;
      errorCode = 'EMAIL_SEND_ERROR';
      hint = `⚠️ Erreur lors de l'envoi: ${errorMessage.substring(0, 150)}`;
    }
    
    res.status(statusCode).json({ 
      success: false,
      error: errorMessage,
      code: errorCode,
      hint: hint || undefined,
      clientEmail: clientEmail || 'email inconnu',
      emailFrom: EMAIL_FROM
    });
  }
});

/**
 * Route: Envoyer un email à la salle des ventes pour planifier une collecte
 * POST /api/send-collection-email
 * Body: { to, subject, text, auctionHouse, quotes, plannedDate, plannedTime, note }
 */
app.post('/api/send-collection-email', requireAuth, async (req, res) => {
  console.log('[AI Proxy] 📥 POST /api/send-collection-email appelé');
  try {
    const { to, subject, text, auctionHouse, quotes, plannedDate, plannedTime, note } = req.body;

    if (!to || !subject) {
      return res.status(400).json({ 
        success: false, 
        error: 'to et subject sont requis' 
      });
    }

    // Vérifier que tous les devis ont un numéro de bordereau
    if (quotes && quotes.length > 0) {
      const hasMissingBordereau = quotes.some(
        q => !q.bordereauNumber || !String(q.bordereauNumber || '').trim()
      );
      if (hasMissingBordereau) {
        return res.status(400).json({
          success: false,
          error: "Renseignez le numéro de bordereau pour tous les devis avant d'envoyer la demande de collecte."
        });
      }
    }

    console.log('[AI Proxy] Envoi email collecte à:', to, 'avec', quotes?.length || 0, 'devis');

    // Fonction helper pour formater la date en français (DD/MM/YYYY)
    function formatDateFrench(dateString) {
      if (!dateString) return '';
      try {
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
      } catch (e) {
        console.warn('[formatDateFrench] Erreur:', e);
        return dateString;
      }
    }

    // Récupérer le nom du MBE pour le bandeau "Demande de collecte – MBE Nice"
    let bannerTitle = 'Demande de collecte – MBE';
    const saasAccountIdForBanner = req.saasAccountId || (quotes && quotes.length > 0 ? quotes[0].saasAccountId : null);
    if (firestore && saasAccountIdForBanner) {
      try {
        const saasDoc = await firestore.collection('saasAccounts').doc(saasAccountIdForBanner).get();
        const commercialName = (saasDoc.exists && saasDoc.data().commercialName) ? String(saasDoc.data().commercialName).trim() : '';
        if (commercialName) {
          const raw = commercialName;
          const part = raw.toLowerCase().startsWith('mbe ') ? raw.substring(4).trim() : raw;
          const displayName = part ? 'MBE ' + (part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()) : 'MBE';
          bannerTitle = 'Demande de collecte – ' + displayName;
        }
      } catch (e) {
        console.warn('[send-collection-email] Impossible de charger commercialName:', e.message);
      }
    }

    // Générer un tableau HTML pour les lots
    let lotsTableHtml = '';
    if (quotes && quotes.length > 0) {
      const lotsRows = quotes.map((quote, index) => {
        const lotNumber = quote.lotNumber || quote.lotId || 'Non spécifié';
        const bordereauNum = (quote.bordereauNumber && String(quote.bordereauNumber).trim()) ? quote.bordereauNumber.trim() : '—';
        
        // Tronquer la description à environ 80 caractères (2 lignes de ~40 caractères)
        let description = quote.description || 'Description non disponible';
        const maxLength = 80;
        if (description.length > maxLength) {
          description = description.substring(0, maxLength).trim() + '...';
        }
        
        const value = quote.value ? `${quote.value.toFixed(2)}€` : 'Non renseignée';
        const dimensions = quote.dimensions 
          ? `${quote.dimensions.length}×${quote.dimensions.width}×${quote.dimensions.height} cm` 
          : 'Non renseignées';
        const weight = quote.dimensions?.weight ? `${quote.dimensions.weight} kg` : 'Non renseigné';
        const reference = quote.reference || 'N/A';
        const clientName = quote.clientName || 'Client non renseigné';
        
        // Log pour débug
        console.log(`[send-collection-email] Quote ${index + 1}:`, {
          lotNumber: quote.lotNumber,
          lotId: quote.lotId,
          clientName: quote.clientName,
          reference: quote.reference,
          descriptionLength: description.length
        });
        
        return `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px 8px; text-align: center; font-weight: 600;">${bordereauNum}</td>
            <td style="padding: 12px 8px; text-align: center; font-weight: 600;">${lotNumber}</td>
            <td style="padding: 12px 8px;">${clientName}</td>
            <td style="padding: 12px 8px; max-width: 300px;">${description}</td>
            <td style="padding: 12px 8px; text-align: right;">${value}</td>
            <td style="padding: 12px 8px; text-align: center;">${dimensions}</td>
            <td style="padding: 12px 8px; text-align: center;">${weight}</td>
            <td style="padding: 12px 8px; text-align: center; font-size: 0.875rem; color: #6b7280;">${reference}</td>
          </tr>
        `;
      }).join('');

      lotsTableHtml = `
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: white; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
              <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151;">N° Bordereau</th>
              <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151;">N° Lot</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151;">Client</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151;">Description</th>
              <th style="padding: 12px 8px; text-align: right; font-weight: 600; color: #374151;">Valeur</th>
              <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151;">Dimensions</th>
              <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151;">Poids</th>
              <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151;">Référence</th>
            </tr>
          </thead>
          <tbody>
            ${lotsRows}
          </tbody>
        </table>
      `;
    }

    // Construire l'email HTML complet
    const htmlBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">${bannerTitle}</h1>
            ${auctionHouse ? `<p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Salle des ventes : <strong>${auctionHouse}</strong></p>` : ''}
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
            <p style="margin: 0 0 20px 0; font-size: 16px;">Bonjour,</p>
            
            <p style="margin: 0 0 20px 0;">Nous souhaiterions planifier une collecte pour les lots suivants :</p>
            
            ${lotsTableHtml}
            
            ${plannedDate ? `
              <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 20px 0;">
                <p style="margin: 0; font-weight: 600; color: #374151;">📅 Date souhaitée</p>
                <p style="margin: 8px 0 0 0; font-size: 18px; color: #667eea;">${formatDateFrench(plannedDate)}${plannedTime ? ` à ${plannedTime}` : ''}</p>
              </div>
            ` : ''}
            
            ${note ? `
              <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 20px 0;">
                <p style="margin: 0; font-weight: 600; color: #374151;">📝 Note</p>
                <p style="margin: 8px 0 0 0; color: #6b7280;">${note}</p>
              </div>
            ` : ''}
            
            <p style="margin: 20px 0;">Pourriez-vous nous confirmer si cette collecte est possible et nous indiquer les disponibilités ?</p>
            
            <p style="margin: 20px 0 0 0;">Cordialement,<br><strong>MBE-SDV</strong></p>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 12px;">
            <p style="margin: 0;">Cet email a été envoyé automatiquement via la plateforme MBE-SDV</p>
          </div>
        </body>
      </html>
    `;

    // Générer la version texte (fallback)
    const textBody = text || `Demande de collecte pour ${quotes?.length || 0} lot(s)`;

    console.log('[AI Proxy] Envoi email collecte à:', to);
    // Récupérer saasAccountId depuis req.saasAccountId ou depuis le premier quote
    const saasAccountId = req.saasAccountId || (quotes && quotes.length > 0 ? quotes[0].saasAccountId : null);
    const result = await sendEmail({
      to,
      subject,
      text: textBody,
      html: htmlBody,
      saasAccountId,
    });

    console.log('[AI Proxy] Email collecte envoyé avec succès:', result);

    // Envoyer un email automatique à chaque client pour les devis concernés
    // + Enregistrer collectionPlannedAt sur chaque devis
    const effectiveSaasId = saasAccountId || (quotes && quotes[0]?.saasAccountId);
    if (quotes && quotes.length > 0 && firestore) {
      const now = Timestamp.now();
      // Afficher la date de collecte dans l'historique pour repérage rapide
      let descSuffix = '';
      if (plannedDate) {
        try {
          const d = new Date(plannedDate);
          descSuffix = ` pour le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
          if (plannedTime) descSuffix += ` à ${plannedTime}`;
        } catch (e) {
          console.warn('[AI Proxy] Erreur format date collecte:', e);
        }
      }
      const timelineEvent = {
        id: `tl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        date: now,
        status: 'awaiting_collection',
        description: `Collecte planifiée - Demande envoyée à ${auctionHouse || 'la salle des ventes'}${descSuffix}`,
      };
      for (const q of quotes) {
        try {
          const quoteId = q.id;
          if (!quoteId) continue;
          const quoteDoc = await firestore.collection('quotes').doc(quoteId).get();
          if (!quoteDoc.exists) continue;
          const quoteData = quoteDoc.data();
          const qSaasId = quoteData.saasAccountId || effectiveSaasId;
          let commercialName = 'votre MBE';
          if (qSaasId) {
            const saasDoc = await firestore.collection('saasAccounts').doc(qSaasId).get();
            if (saasDoc.exists && saasDoc.data().commercialName) {
              commercialName = saasDoc.data().commercialName;
            }
          }
          const quoteForEmail = {
            ...quoteData,
            id: quoteId,
            saasAccountId: qSaasId,
            _saasCommercialName: commercialName,
            client: quoteData.client || { name: quoteData.clientName, email: quoteData.clientEmail || quoteData.delivery?.contact?.email },
            delivery: quoteData.delivery,
            reference: quoteData.reference,
          };
          await sendAwaitingCollectionEmail(firestore, sendEmail, quoteForEmail);

          // Enregistrer que la collecte a été planifiée (permettre le bouton "Lot non récupéré")
          const quoteRef = firestore.collection('quotes').doc(quoteId);
          await quoteRef.update({
            collectionPlannedAt: now,
            collectionPlannedDate: plannedDate || null,
            collectionPlannedTime: plannedTime || null,
            timeline: FieldValue.arrayUnion(timelineEvent),
            updatedAt: now,
          });
        } catch (emailErr) {
          console.error('[AI Proxy] ⚠️ Email automatique (demande collecte) non envoyé pour devis:', q?.id, emailErr.message);
        }
      }
    }

    res.json({ 
      success: true, 
      messageId: result.id, 
      to,
      auctionHouse,
      quotesCount: quotes?.length || 0,
    });
  } catch (error) {
    console.error('[AI Proxy] Erreur envoi email collecte:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Erreur lors de l\'envoi de l\'email' 
    });
  }
});

/**
 * Route: Notifier le client qu'un lot n'a pas pu être récupéré
 * POST /api/devis/:id/notify-collection-failed
 * Body: { reason: string } (obligatoire, max 250 caractères)
 * Prérequis: devis avec collectionPlannedAt (collecte planifiée), status awaiting_collection
 */
app.post('/api/devis/:id/notify-collection-failed', requireAuth, async (req, res) => {
  const devisId = req.params.id;
  const { reason } = req.body || {};

  if (!devisId) {
    return res.status(400).json({ error: 'ID devis requis' });
  }
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ error: 'La raison est obligatoire' });
  }
  const reasonTrimmed = reason.trim();
  if (reasonTrimmed.length > 250) {
    return res.status(400).json({ error: 'La raison ne doit pas dépasser 250 caractères' });
  }

  try {
    const quoteRef = firestore.collection('quotes').doc(devisId);
    const quoteDoc = await quoteRef.get();
    if (!quoteDoc.exists) {
      return res.status(404).json({ error: 'Devis introuvable' });
    }

    const quoteData = quoteDoc.data();
    const status = quoteData?.status;
    const collectionPlannedAt = quoteData?.collectionPlannedAt;

    if (status !== 'awaiting_collection') {
      return res.status(400).json({ error: 'Ce devis n\'est pas en attente de collecte' });
    }
    if (!collectionPlannedAt) {
      return res.status(400).json({ error: 'Aucune collecte n\'a été planifiée pour ce devis. Planifiez d\'abord une collecte.' });
    }

    const clientEmail = quoteData?.client?.email || quoteData?.clientEmail || quoteData?.delivery?.contact?.email;
    if (!clientEmail || !isValidEmail(clientEmail)) {
      return res.status(400).json({ error: 'Aucun email client valide pour ce devis' });
    }

    // Récupérer les numéros de lots (single ou multi)
    let lotNumbers = [];
    if (quoteData?.auctionSheet?.lots?.length > 0) {
      lotNumbers = quoteData.auctionSheet.lots.map((l) => l.lotNumber || l.numero_lot || '').filter(Boolean);
    }
    if (lotNumbers.length === 0 && quoteData?.lot?.number) {
      lotNumbers = [quoteData.lot.number];
    }
    const lotDisplay = lotNumbers.length === 0
      ? 'votre lot'
      : lotNumbers.length === 1
        ? `le lot ${lotNumbers[0]}`
        : `les lots ${lotNumbers.join(', ')}`;

    // Récupérer la salle des ventes (nom + coordonnées)
    const auctionHouseName = quoteData?.lot?.auctionHouse || quoteData?.auctionSheet?.auctionHouse || quoteData?.lotAuctionHouse || 'la salle des ventes';
    let houseEmail = '';
    let houseContact = '';

    const housesSnap = await firestore.collection('auctionHouses').get();
    const normalizedSearch = (auctionHouseName || '').trim().toLowerCase();
    const houseDoc = housesSnap.docs.find((d) => {
      const name = (d.data().name || '').trim().toLowerCase();
      return name === normalizedSearch;
    });
    if (houseDoc) {
      const houseData = houseDoc.data();
      houseEmail = houseData.email || '';
      houseContact = houseData.contact || '';
    }

    const contactBlock = [
      auctionHouseName,
      houseEmail ? `Email : ${houseEmail}` : '',
      houseContact ? `Contact : ${houseContact}` : '',
    ].filter(Boolean).join('\n');

    // Tronquer la raison pour l'affichage (email + timeline) - ~80 caractères
    const reasonTruncated = reasonTrimmed.length > 80 ? reasonTrimmed.substring(0, 77) + '...' : reasonTrimmed;

    const reference = quoteData?.reference || devisId;
    const clientName = quoteData?.client?.name || quoteData?.clientName || 'Client';

    let commercialName = 'votre MBE';
    const saasAccountId = quoteData.saasAccountId || req.saasAccountId;
    let emailTemplates = null;
    if (saasAccountId) {
      const saasDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
      if (saasDoc.exists) {
        commercialName = saasDoc.data().commercialName || commercialName;
        emailTemplates = saasDoc.data().emailTemplates;
      }
    }

    const templates = getTemplatesExtendedForAccount(emailTemplates);
    const t = templates.collection_failed;
    const lotDisplayCapitalized = lotDisplay.charAt(0).toUpperCase() + lotDisplay.slice(1);
    const templateValues = {
      clientName,
      reference,
      mbeName: commercialName,
      lotDisplay: lotDisplayCapitalized,
      raison: reasonTruncated,
      coordonneesSalleVentes: contactBlock,
      nomSalleVentes: auctionHouseName,
    };
    const bodyHtml = Array.isArray(t.bodySections) && t.bodySections.length > 0
      ? buildBodyHtmlFromSections(t.bodySections, templateValues)
      : replacePlaceholdersExtended(t.bodyHtml || '', templateValues);
    const signatureHtml = replacePlaceholdersExtended(t.signature || '', templateValues).replace(/\n/g, '<br>');
    const subject = replacePlaceholdersExtended(t.subject || '', templateValues);
    const htmlContent = buildEmailHtmlSimple(
      { ...t, bannerColor: t.bannerColor || '#2563eb', fontFamily: t.fontFamily || 'Arial, sans-serif', fontSize: t.fontSize ?? 14 },
      bodyHtml,
      signatureHtml,
      templateValues
    );

    await sendEmail({
      to: clientEmail,
      subject,
      text: `${lotDisplayCapitalized} n'a pas pu être récupéré. Raison : ${reasonTruncated}. Merci de contacter la salle des ventes : ${contactBlock}`,
      html: htmlContent,
      saasAccountId,
    });

    const timelineEvent = {
      id: `tl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      date: Timestamp.now(),
      status: 'awaiting_collection',
      description: `Lot non récupéré auprès de la salle des ventes. Raison : ${reasonTruncated}`,
    };

    await quoteRef.update({
      timeline: FieldValue.arrayUnion(timelineEvent),
      updatedAt: Timestamp.now(),
    });

    console.log('[API] ✅ Notifié client collection failed:', devisId, '→', clientEmail);

    res.json({ success: true, message: 'Client notifié par email' });
  } catch (error) {
    console.error('[API] Erreur notify-collection-failed:', error);
    res.status(500).json({ error: error.message || 'Erreur lors de la notification' });
  }
});

/**
 * Route de test: Envoyer un email de test
 * POST /api/test-email
 * Body: { to: "email@example.com" } (optionnel)
 * En staging : requiert auth + compte Gmail connecté (saasAccountId)
 */
app.post('/api/test-email', requireAuth, async (req, res) => {
  console.log('[Test Email] Route appelée');
  try {
    const { to } = req.body || {};
    const testEmail = to || (!isStagingEnv() ? EMAIL_FROM : null);

    if (!testEmail || !isValidEmail(testEmail)) {
      return res.status(400).json({
        error: 'Email de test invalide',
        hint: isStagingEnv()
          ? 'En staging, fournissez un destinataire: { "to": "email@example.com" }'
          : `Fournissez un email valide: { "to": "email@example.com" }`,
      });
    }

    if (!isStagingEnv() && !resendClient) {
      return res.status(400).json({ 
        error: 'Resend non configuré',
        hint: 'Vérifiez RESEND_API_KEY dans .env.local'
      });
    }

    if (!isStagingEnv() && !EMAIL_FROM) {
      return res.status(400).json({
        error: 'EMAIL_FROM non configuré',
        hint: 'Configure EMAIL_FROM dans .env.local',
      });
    }

    console.log(`[Test Email] Envoi email de test à ${testEmail}... (staging=${isStagingEnv()})`);
    
    // Pour les emails de test, utiliser req.saasAccountId si disponible
    const saasAccountId = req.saasAccountId;
    const result = await sendEmail({
      to: testEmail,
      subject: '🧪 Email de test - MBE Devis',
      text: `Bonjour,

Ceci est un email de test depuis l'application MBE Devis.

Si vous recevez cet email, cela signifie que la configuration email fonctionne correctement !

Configuration:
- Provider: ${isStagingEnv() ? 'Gmail (compte connecté)' : 'Resend'}
- Date: ${new Date().toLocaleString('fr-FR')}

Cordialement,
L'équipe MBE`,
      saasAccountId,
    });

    res.json({ 
      success: true, 
      message: `Email de test envoyé avec succès à ${testEmail}`,
      messageId: result.messageId 
    });
  } catch (error) {
    console.error('[Test Email] Erreur:', error);
    res.status(500).json({ 
      error: error.message || 'Erreur lors de l\'envoi de l\'email de test',
      hint: error.message?.includes('API') 
        ? 'Vérifiez RESEND_API_KEY dans .env.local'
        : 'Vérifiez la configuration Resend dans .env.local'
    });
  }
});

/**
 * Route de diagnostic: Test avec appel HTTP direct (contourne le SDK)
 * POST /api/test-email-direct
 * Body: { to: "email@example.com" } (optionnel, utilise EMAIL_FROM par défaut)
 */
app.post('/api/test-email-direct', async (req, res) => {
  console.log('[Test Email Direct HTTP] Route appelée');
  try {
    const { to } = req.body || {};
    const testEmail = to || EMAIL_FROM;
    
    if (!testEmail || !isValidEmail(testEmail)) {
      return res.status(400).json({ 
        error: 'Email de test invalide',
        hint: `Fournissez un email valide: { "to": "email@example.com" }`
      });
    }

    if (!RESEND_API_KEY) {
      return res.status(400).json({ 
        error: 'RESEND_API_KEY manquant',
        hint: 'Vérifiez RESEND_API_KEY dans .env.local'
      });
    }

    if (!EMAIL_FROM) {
      return res.status(400).json({ 
        error: 'EMAIL_FROM non configuré',
        hint: 'Configure EMAIL_FROM dans .env.local'
      });
    }

    console.log(`[Test Email Direct HTTP] Envoi email de test à ${testEmail} via HTTP direct...`);
    
    // Pour les emails de test, utiliser req.saasAccountId si disponible
    const saasAccountId = req.saasAccountId;
    const result = await sendEmailDirectHTTP({
      to: testEmail,
      subject: '🧪 Email de test (HTTP direct) - MBE Devis',
      text: `Bonjour,

Ceci est un email de test depuis l'application MBE Devis (via appel HTTP direct).

Si vous recevez cet email, cela signifie que la configuration Resend fonctionne correctement !

Configuration:
- Provider: Resend (HTTP direct)
- From: ${EMAIL_FROM}
- Date: ${new Date().toLocaleString('fr-FR')}

Cordialement,
L'équipe MBE`,
      saasAccountId,
    });

    res.json({ 
      success: true, 
      message: `Email de test envoyé avec succès à ${testEmail} (via HTTP direct)`,
      messageId: result.id,
      method: 'HTTP direct'
    });
  } catch (error) {
    console.error('[Test Email Direct HTTP] Erreur:', error);
    res.status(500).json({ 
      error: error.message || 'Erreur lors de l\'envoi de l\'email de test',
      hint: error.message?.includes('401') || error.message?.includes('403')
        ? 'Vérifiez RESEND_API_KEY dans .env.local'
        : error.message?.includes('domain') || error.message?.includes('sender')
        ? 'Vérifiez que le domaine mbe-sdv.fr est vérifié et que devis@mbe-sdv.fr est autorisé dans Resend Dashboard > Domains'
        : 'Vérifiez la configuration Resend dans .env.local'
    });
  }
});

// Route de test SIMPLE pour isoler le problème
app.get('/api/test', (req, res) => {
  console.log('[AI Proxy] ✅ GET /api/test appelé - Route trouvée!');
  res.json({ ok: true, message: 'Backend fonctionne!' });
});

// Route de test de connectivité - DOIT être définie avant app.listen()
app.get('/api/health', (req, res) => {
  console.log('[AI Proxy] ✅ GET /api/health appelé - Route trouvée!');
  console.log('[AI Proxy] Request URL:', req.url);
  console.log('[AI Proxy] Request method:', req.method);
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    resendConfigured: !!resendClient,
    emailFrom: EMAIL_FROM
  });
});

// ============================================================================
// TEAM AUTH (sans requireAuth - connexion multi-user Pro/Ultra)
// ============================================================================

/** Trouve un saasAccount par email (comparaison insensible à la casse). Retourne le doc ou null. */
async function findSaasAccountByEmail(emailLower) {
  if (!firestore || !emailLower) return null;
  let doc = null;
  const snapExact = await firestore.collection('saasAccounts').where('email', '==', emailLower).limit(1).get();
  if (!snapExact.empty) return snapExact.docs[0];
  const snapLower = await firestore.collection('saasAccounts').where('emailLower', '==', emailLower).limit(1).get();
  if (!snapLower.empty) return snapLower.docs[0];
  const allSnap = await firestore.collection('saasAccounts').limit(500).get();
  doc = allSnap.docs.find((d) => (d.data().email || '').trim().toLowerCase() === emailLower);
  return doc || null;
}

/**
 * GET /auth/team-profiles?email=xxx
 * Cherche un saasAccount où email correspond (comparaison insensible à la casse) et planId in ['pro','ultra'].
 * Si au moins 1 teamMember actif → multiUser: true + liste des profils.
 * Sinon → multiUser: false.
 */
app.get('/auth/team-profiles', async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  const email = (req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Paramètre email requis' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Email invalide' });

  try {
    // #region agent log
    console.log('[DEBUG team-profiles] email=', email);
    fetch('http://127.0.0.1:7614/ingest/0bfbd811-2706-4d7c-9d97-3770fc92a237',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'86a80e'},body:JSON.stringify({sessionId:'86a80e',location:'ai-proxy.js:team-profiles',message:'team-profiles called',data:{email},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    const saasDoc = await findSaasAccountByEmail(email);
    // #region agent log
    console.log('[DEBUG team-profiles] findSaasAccountByEmail found=', !!saasDoc, 'saasAccountId=', saasDoc?.id);
    fetch('http://127.0.0.1:7614/ingest/0bfbd811-2706-4d7c-9d97-3770fc92a237',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'86a80e'},body:JSON.stringify({sessionId:'86a80e',location:'ai-proxy.js:findSaasAccountByEmail',message:'findSaasAccountByEmail result',data:{found:!!saasDoc,saasAccountId:saasDoc?.id},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    if (!saasDoc) {
      return res.json({ multiUser: false });
    }

    const saasData = saasDoc.data();
    const planId = (saasData.planId || saasData.plan || '').toLowerCase();
    // #region agent log
    console.log('[DEBUG team-profiles] planId=', planId, 'isProOrUltra=', ['pro', 'ultra'].includes(planId));
    fetch('http://127.0.0.1:7614/ingest/0bfbd811-2706-4d7c-9d97-3770fc92a237',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'86a80e'},body:JSON.stringify({sessionId:'86a80e',location:'ai-proxy.js:planId',message:'planId check',data:{planId,isProOrUltra:['pro','ultra'].includes(planId)},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    if (!['pro', 'ultra'].includes(planId)) {
      return res.json({ multiUser: false });
    }

    const saasAccountId = saasDoc.id;
    const saasEmail = (saasData.email || '').trim().toLowerCase();
    const membersSnap = await firestore
      .collection('saasAccounts')
      .doc(saasAccountId)
      .collection('teamMembers')
      .where('isActive', '==', true)
      .get();

    const profiles = membersSnap.docs
      .filter((doc) => !doc.data().isOwner)
      .map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          displayName: [d.firstName, d.lastName].filter(Boolean).join(' ').trim() || d.username,
          isOwner: false,
          useFirebase: false,
        };
      });

    if (email === saasEmail) {
      profiles.unshift({
        id: 'owner',
        displayName: 'Administrateur',
        isOwner: true,
        useFirebase: true,
      });
    }
    // #region agent log
    console.log('[DEBUG team-profiles] membersCount=', membersSnap.docs.length, 'profilesCount=', profiles.length, 'multiUser=', profiles.length > 0);
    fetch('http://127.0.0.1:7614/ingest/0bfbd811-2706-4d7c-9d97-3770fc92a237',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'86a80e'},body:JSON.stringify({sessionId:'86a80e',location:'ai-proxy.js:profiles',message:'profiles built',data:{membersCount:membersSnap.docs.length,profilesCount:profiles.length,multiUser:profiles.length>0},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    if (profiles.length === 0) {
      return res.json({ multiUser: false });
    }

    return res.json({ multiUser: true, profiles });
  } catch (err) {
    console.error('[auth/team-profiles] Erreur:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /auth/team-login
 * Body: { email, teamMemberId, password }
 * Vérifie bcrypt, crée/met à jour users/{syntheticUid}, retourne custom token Firebase.
 */
app.post('/auth/team-login', async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  const { email, teamMemberId, password } = req.body || {};
  if (!email || !teamMemberId || !password) {
    return res.status(400).json({ error: 'email, teamMemberId et password requis' });
  }

  const emailNorm = String(email).trim().toLowerCase();
  if (!isValidEmail(emailNorm)) return res.status(400).json({ error: 'Email invalide' });

  try {
    const saasDoc = await findSaasAccountByEmail(emailNorm);
    if (!saasDoc) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const saasAccountId = saasDoc.id;
    const memberRef = firestore
      .collection('saasAccounts')
      .doc(saasAccountId)
      .collection('teamMembers')
      .doc(teamMemberId);

    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const memberData = memberSnap.data();
    if (!memberData.isActive) {
      return res.status(401).json({ error: 'Compte désactivé' });
    }

    const passwordHash = memberData.passwordHash;
    if (!passwordHash) {
      return res.status(401).json({ error: 'Mot de passe non configuré' });
    }

    const match = await bcrypt.compare(password, passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const syntheticUid = `team_${saasAccountId}_${teamMemberId}`;
    const userRef = firestore.collection('users').doc(syntheticUid);
    await userRef.set({
      saasAccountId,
      teamMemberId,
      type: 'team',
      updatedAt: Timestamp.now(),
    }, { merge: true });

    const customToken = await getAuth().createCustomToken(syntheticUid);
    return res.json({ token: customToken });
  } catch (err) {
    console.error('[auth/team-login] Erreur:', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================================
// GMAIL OAUTH & SYNC
// ============================================================================

// Configuration OAuth Gmail
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || "http://localhost:5174/auth/gmail/callback";

let oauth2Client = null;
if (GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET) {
  oauth2Client = new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    GMAIL_REDIRECT_URI
  );
  console.log('[Gmail OAuth] ✅ OAuth2 client initialisé');
} else {
  console.warn('[Gmail OAuth] ⚠️  GMAIL_CLIENT_ID ou GMAIL_CLIENT_SECRET manquant');
}

// Configuration OAuth Google Sheets
// Utilise les mêmes credentials que Gmail (ou peut être séparé)
const GOOGLE_SHEETS_CLIENT_ID = process.env.GOOGLE_SHEETS_CLIENT_ID || GMAIL_CLIENT_ID;
const GOOGLE_SHEETS_CLIENT_SECRET = process.env.GOOGLE_SHEETS_CLIENT_SECRET || GMAIL_CLIENT_SECRET;
const GOOGLE_SHEETS_REDIRECT_URI = process.env.GOOGLE_SHEETS_REDIRECT_URI || "http://localhost:5174/auth/google-sheets/callback";

let googleSheetsOAuth2Client = null;
if (GOOGLE_SHEETS_CLIENT_ID && GOOGLE_SHEETS_CLIENT_SECRET) {
  googleSheetsOAuth2Client = new google.auth.OAuth2(
    GOOGLE_SHEETS_CLIENT_ID,
    GOOGLE_SHEETS_CLIENT_SECRET,
    GOOGLE_SHEETS_REDIRECT_URI
  );
  console.log('[Google Sheets OAuth] ✅ OAuth2 client initialisé');
} else {
  console.warn('[Google Sheets OAuth] ⚠️  GOOGLE_SHEETS_CLIENT_ID ou GOOGLE_SHEETS_CLIENT_SECRET manquant');
}

// Typeform OAuth (pour télécharger les bordereaux depuis les réponses Typeform)
const TYPEFORM_CLIENT_ID = process.env.TYPEFORM_CLIENT_ID;
const TYPEFORM_CLIENT_SECRET = process.env.TYPEFORM_CLIENT_SECRET;
const TYPEFORM_REDIRECT_URI = process.env.TYPEFORM_REDIRECT_URI || `http://localhost:5174/auth/typeform/callback`;
if (TYPEFORM_CLIENT_ID && TYPEFORM_CLIENT_SECRET) {
  console.log('[Typeform OAuth] ✅ Client initialisé');
} else {
  console.warn('[Typeform OAuth] ⚠️  TYPEFORM_CLIENT_ID ou TYPEFORM_CLIENT_SECRET manquant - connexion Typeform indisponible');
}

// Route: Démarrer le flux OAuth Gmail
// Nécessite authentification pour récupérer saasAccountId
app.get('/auth/gmail/start', requireAuth, (req, res) => {
  if (!oauth2Client) {
    return res.status(400).json({ error: 'Gmail OAuth non configuré. Ajoutez GMAIL_CLIENT_ID et GMAIL_CLIENT_SECRET dans les variables Railway (staging/prod) ou .env.local (dev). Voir GMAIL_OAUTH_ENVIRONNEMENTS.md' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré. Veuillez compléter la configuration MBE.' });
  }

  // Passer le saasAccountId dans le state pour le récupérer au callback
  // gmail.send : requis pour envoyer des emails via le compte connecté (staging)
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    state: req.saasAccountId // Passer le saasAccountId dans le state
  });

  console.log('[Gmail OAuth] URL OAuth générée pour saasAccountId:', req.saasAccountId);
  
  // Retourner l'URL en JSON pour que le frontend puisse rediriger
  // (car window.location.href ne passe pas les headers Authorization)
  res.json({ url });
});

// Route: Callback OAuth Gmail
app.get('/auth/gmail/callback', async (req, res) => {
  if (!oauth2Client || !firestore) {
    return res.status(400).json({ error: 'Gmail OAuth ou Firestore non configuré' });
  }

  const { code, state: saasAccountId } = req.query;
  if (!code) {
    return res.redirect(`${FRONTEND_URL}/settings/emails?error=no_code`);
  }

  if (!saasAccountId) {
    return res.redirect(`${FRONTEND_URL}/settings/emails?error=no_saas_account_id`);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });

    const emailAddress = profile.data.emailAddress;
    if (!emailAddress) {
      return res.redirect(`${FRONTEND_URL}/settings/emails?error=no_email`);
    }

    // Vérifier que le saasAccount existe
    const saasAccountRef = firestore.collection('saasAccounts').doc(saasAccountId);
    const saasAccountDoc = await saasAccountRef.get();
    
    if (!saasAccountDoc.exists) {
      console.error('[Gmail OAuth] ❌ Compte SaaS non trouvé:', saasAccountId);
      return res.redirect(`${FRONTEND_URL}/settings/emails?error=saas_account_not_found`);
    }

    // Stocker les tokens Gmail dans saasAccounts/{id}/integrations/gmail
    await saasAccountRef.update({
      'integrations.gmail': {
        connected: true,
        email: emailAddress,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        lastHistoryId: profile.data.historyId || null,
        connectedAt: Timestamp.now()
      }
    });

    console.log('[Gmail OAuth] ✅ Compte Gmail connecté pour saasAccountId:', saasAccountId, 'email:', emailAddress);

    res.redirect(`${FRONTEND_URL}/settings/emails?connected=true`);
  } catch (error) {
    console.error('[Gmail OAuth] ❌ Erreur lors du callback:', error);
    res.redirect(`${FRONTEND_URL}/settings/emails?error=${encodeURIComponent(error.message)}`);
  }
});

// Route: Récupérer les comptes email de l'utilisateur
app.get('/api/email-accounts', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  try {
    // Récupérer le compte SaaS et ses intégrations Gmail
    const saasAccountRef = firestore.collection('saasAccounts').doc(req.saasAccountId);
    const saasAccountDoc = await saasAccountRef.get();
    
    if (!saasAccountDoc.exists) {
      return res.status(404).json({ error: 'Compte SaaS non trouvé' });
    }

    const saasAccountData = saasAccountDoc.data();
    const gmailIntegration = saasAccountData.integrations?.gmail;

    const accountsData = [];
    
    if (gmailIntegration && gmailIntegration.connected) {
      accountsData.push({
        id: req.saasAccountId, // Utiliser saasAccountId comme ID
        provider: 'gmail',
        emailAddress: gmailIntegration.email,
        isActive: gmailIntegration.connected,
        connectedAt: gmailIntegration.connectedAt?.toDate ? gmailIntegration.connectedAt.toDate().toISOString() : null,
        lastSyncAt: gmailIntegration.lastSyncAt?.toDate ? gmailIntegration.lastSyncAt.toDate().toISOString() : null,
        // Ne pas exposer les tokens OAuth
        oauth: gmailIntegration.expiresAt ? { expiryDate: gmailIntegration.expiresAt } : null
      });
    }

    res.json(accountsData);
  } catch (error) {
    console.error('[API] Erreur lors de la récupération des comptes email:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route: Déconnecter un compte email
app.delete('/api/email-accounts/:accountId', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  const { accountId } = req.params;

  // Vérifier que l'accountId correspond au saasAccountId
  if (accountId !== req.saasAccountId) {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  try {
    const saasAccountRef = firestore.collection('saasAccounts').doc(req.saasAccountId);
    const saasAccountDoc = await saasAccountRef.get();
    
    if (!saasAccountDoc.exists) {
      return res.status(404).json({ error: 'Compte SaaS non trouvé' });
    }

    // Supprimer l'intégration Gmail
    await saasAccountRef.update({
      'integrations.gmail': FieldValue.delete()
    });

    console.log('[API] ✅ Compte Gmail déconnecté pour saasAccountId:', req.saasAccountId);
    res.json({ success: true, message: 'Compte déconnecté' });
  } catch (error) {
    console.error('[API] Erreur lors de la déconnexion du compte:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route: Récupérer les messages d'un devis
app.get('/api/devis/:devisId/messages', async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  const { devisId } = req.params;

  try {
    // Récupérer les messages Gmail pour ce devis
    let messagesQuery = firestore
      .collection('emailMessages')
      .where('userId', '==', CURRENT_USER_ID)
      .where('devisId', '==', devisId);

    // Essayer avec orderBy, mais si l'index n'existe pas, récupérer sans tri et trier en mémoire
    let messages;
    try {
      messages = await messagesQuery.orderBy('createdAt', 'desc').get();
    } catch (orderByError) {
      // Si l'index n'existe pas, récupérer sans orderBy et trier en mémoire
      console.warn('[API] Index Firestore manquant, tri en mémoire:', orderByError.message);
      messages = await messagesQuery.get();
    }

    const messagesData = messages.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        to: Array.isArray(data.to) ? data.to : (data.to ? [data.to] : []),
        receivedAt: data.receivedAt?.toDate ? data.receivedAt.toDate() : null,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null
      };
    });

    // Trier par date si orderBy a échoué (plus récent en premier)
    if (messagesData.length > 0 && !messagesData[0].createdAt) {
      // Les dates sont déjà des Date objects
    } else {
      messagesData.sort((a, b) => {
        const dateA = a.receivedAt || a.createdAt;
        const dateB = b.receivedAt || b.createdAt;
        if (!dateA || !dateB) return 0;
        const timeA = dateA instanceof Date ? dateA.getTime() : new Date(dateA).getTime();
        const timeB = dateB instanceof Date ? dateB.getTime() : new Date(dateB).getTime();
        return timeB - timeA; // Inversé pour avoir les plus récents en premier
      });
    }

    res.json(messagesData);
  } catch (error) {
    console.error('[API] Erreur lors de la récupération des messages:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fonction utilitaire: Extraire le texte brut d'un message Gmail
function extractPlainText(payload) {
  let text = '';
  
  if (payload.body?.data) {
    text = Buffer.from(payload.body.data, 'base64').toString('utf-8');
  } else if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        text = Buffer.from(part.body.data, 'base64').toString('utf-8');
        break;
      } else if (part.parts) {
        const subText = extractPlainText(part);
        if (subText) {
          text = subText;
          break;
        }
      }
    }
  }
  
  return text;
}

// Fonction utilitaire: Extraire l'email depuis un header "From"
function extractEmail(fromHeader) {
  if (!fromHeader) return null;
  const match = fromHeader.match(/<([^>]+)>/);
  return match ? match[1] : fromHeader.trim();
}

// Récupérer un header par nom (insensible à la casse)
function getHeader(headers, name) {
  if (!headers) return '';
  const h = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

// Extraire une référence de devis depuis le subject
// Exemples supportés : DEV-GS-4, DEV-123, DV-2024-001, DV_ABC_42
function extractQuoteRefFromSubject(subject = '') {
  const re = /(?:DEV|DV)[-_]?[A-Z0-9]+(?:[-_][A-Z0-9]+)*/gi;
  const matches = subject.match(re);
  if (!matches || matches.length === 0) return null;
  return matches[0].toUpperCase();
}

// Fonction: Trouver un devis par email client (essaie plusieurs champs, sans orderBy pour éviter l’index manquant)
async function findDevisByClientEmail(emailRaw, saasAccountId) {
  if (!firestore) return null;
  if (!emailRaw) return null;

  const email = emailRaw.trim().toLowerCase();

  const fieldsToTry = [
    'clientEmail',            // champ plat utilisé lors de l’upsert
    'client.email',           // email stocké dans l’objet client
    'delivery.contact.email', // email du destinataire/livraison
    'deliveryContactEmail',   // champ plat éventuellement ajouté
  ];

  for (const field of fieldsToTry) {
    try {
      // Filtrer par saasAccountId ET par email
      let query = firestore.collection('quotes')
        .where('saasAccountId', '==', saasAccountId)
        .where(field, '==', email)
        .limit(1);

      const snap = await query.get();

      if (!snap.empty) {
        return snap.docs[0].id;
      }
    } catch (error) {
      // Continuer avec les autres champs; log en debug
      console.error(`[Gmail Sync] Erreur lors de la recherche du devis avec ${field}:`, error);
    }
  }

  return null;
}

// Fonction: Récupérer et stocker un message Gmail
async function fetchAndStoreMessage(gmail, messageId, saasAccountId) {
  if (!firestore) return;

  try {
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    const headers = msg.data.payload.headers || [];
    const from = getHeader(headers, 'From');
    const to = getHeader(headers, 'To');
    const subject = getHeader(headers, 'Subject');
    const messageIdHeader = getHeader(headers, 'Message-ID');
    const inReplyTo = getHeader(headers, 'In-Reply-To');
    const references = getHeader(headers, 'References');
    const bodyText = extractPlainText(msg.data.payload);

    const fromEmail = extractEmail(from);
    // 1) Essayer de trouver le devis via le sujet (référence type DEV-xxxx)
    // Filtrer par saasAccountId pour ne chercher que dans les devis de ce compte
    let devisId = null;
    const refFromSubject = extractQuoteRefFromSubject(subject || '');
    if (refFromSubject) {
      try {
        const snap = await firestore
          .collection('quotes')
          .where('reference', '==', refFromSubject)
          .where('saasAccountId', '==', saasAccountId)
          .limit(1)
          .get();
        if (!snap.empty) {
          devisId = snap.docs[0].id;
        }
      } catch (err) {
        console.error('[Gmail Sync] Erreur recherche devis par référence:', err);
      }
    }

    // 2) Sinon fallback sur l'email expéditeur (filtrer par saasAccountId)
    if (!devisId && fromEmail) {
      devisId = await findDevisByClientEmail(fromEmail, saasAccountId);
    }

    // Vérifier si le message existe déjà (pour ce saasAccountId)
    const existing = await firestore
      .collection('emailMessages')
      .where('gmailMessageId', '==', msg.data.id)
      .where('saasAccountId', '==', saasAccountId)
      .limit(1)
      .get();

    if (!existing.empty) {
      console.log('[Gmail Sync] Message déjà stocké:', msg.data.id);
      return;
    }

    await firestore.collection('emailMessages').add({
      saasAccountId: saasAccountId, // CRITIQUE: Lier le message au compte SaaS
      devisId: devisId,
      quoteReference: refFromSubject || null,
      direction: 'IN',
      source: 'GMAIL',
      from: from,
      to: to,
      subject: subject,
      bodyText: bodyText,
      bodyHtml: null,
      gmailMessageId: msg.data.id,
      gmailThreadId: msg.data.threadId,
      receivedAt: msg.data.internalDate ? new Date(Number(msg.data.internalDate)) : Timestamp.now(),
      createdAt: Timestamp.now(),
      messageIdHeader: messageIdHeader || null,
      inReplyTo: inReplyTo || null,
      referencesHeader: references || null,
    });

    console.log('[Gmail Sync] ✅ Message stocké:', {
      messageId: msg.data.id,
      from: fromEmail,
      devisId: devisId || 'non rattaché',
      saasAccountId: saasAccountId
    });

    // Créer une notification si le message est lié à un devis
    if (devisId) {
      try {
        // Récupérer le devis pour vérifier le saasAccountId
        const devisDoc = await firestore.collection('quotes').doc(devisId).get();
        if (devisDoc.exists) {
          const devis = devisDoc.data();
          // Utiliser le saasAccountId du devis (doit correspondre)
          const devisSaasAccountId = devis.saasAccountId || saasAccountId;

          await createNotification(firestore, {
            clientSaasId: devisSaasAccountId, // Utiliser saasAccountId comme clientSaasId
            devisId: devisId,
            type: NOTIFICATION_TYPES.NEW_MESSAGE,
            title: 'Nouveau message client',
            message: `Le client a répondu au devis ${devis.reference || devisId}`,
          });

          console.log('[Gmail Sync] 🔔 Notification créée pour nouveau message');
        }
      } catch (notifError) {
        console.error('[Gmail Sync] Erreur création notification:', notifError);
      }
    }
  } catch (error) {
    console.error('[Gmail Sync] Erreur lors du stockage du message:', error);
  }
}

// Fonction: Synchroniser un compte Gmail pour un saasAccountId
async function syncGmailAccount(saasAccountId, gmailIntegration) {
  if (!firestore || !oauth2Client) return;

  try {
    // Reconstruire les tokens pour OAuth2
    const tokens = {
      access_token: gmailIntegration.accessToken,
      refresh_token: gmailIntegration.refreshToken,
      expiry_date: gmailIntegration.expiresAt ? (gmailIntegration.expiresAt instanceof Date ? gmailIntegration.expiresAt.getTime() : (gmailIntegration.expiresAt.toDate ? gmailIntegration.expiresAt.toDate().getTime() : new Date(gmailIntegration.expiresAt).getTime())) : null
    };

    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const historyParams = {
      userId: 'me',
      historyTypes: ['messageAdded']
    };

    if (gmailIntegration.lastHistoryId) {
      historyParams.startHistoryId = gmailIntegration.lastHistoryId;
    }

    const history = await gmail.users.history.list(historyParams);

    if (!history.data.history || history.data.history.length === 0) {
      console.log('[Gmail Sync] Aucun nouveau message pour saasAccountId:', saasAccountId);
      return;
    }

    let newHistoryId = gmailIntegration.lastHistoryId;

    for (const h of history.data.history) {
      if (h.messages) {
        for (const msg of h.messages) {
          // Passer saasAccountId au lieu de emailAccountId
          await fetchAndStoreMessage(gmail, msg.id, saasAccountId);
        }
      }
      if (h.historyId) {
        newHistoryId = h.historyId;
      }
    }

    // Mettre à jour le lastHistoryId dans saasAccounts/{id}/integrations/gmail
    if (newHistoryId) {
      await firestore.collection('saasAccounts').doc(saasAccountId).update({
        'integrations.gmail.lastHistoryId': newHistoryId,
        'integrations.gmail.lastSyncAt': Timestamp.now()
      });
      console.log('[Gmail Sync] ✅ Synchronisation terminée pour saasAccountId:', saasAccountId);
    }
  } catch (error) {
    console.error('[Gmail Sync] Erreur lors de la synchronisation pour saasAccountId:', saasAccountId, error);
    // Si le token a expiré, déconnecter Gmail
    if (error.code === 401) {
      await firestore.collection('saasAccounts').doc(saasAccountId).update({
        'integrations.gmail.connected': false
      });
      console.log('[Gmail Sync] ⚠️  Gmail déconnecté (token expiré) pour saasAccountId:', saasAccountId);
      
      // Créer une notification pour informer l'utilisateur
      try {
        await createNotification(firestore, {
          clientSaasId: saasAccountId,
          devisId: null,
          type: NOTIFICATION_TYPES.SYSTEM,
          title: '⚠️ Connexion Gmail expirée',
          message: 'Votre connexion Gmail a expiré et doit être renouvelée.\n\n' +
                   '📋 Pour reconnecter Gmail :\n' +
                   '1. Allez dans Paramètres > Intégrations\n' +
                   '2. Cliquez sur "Se reconnecter à Gmail"\n' +
                   '3. Autorisez l\'accès à votre compte Gmail\n\n' +
                   '✅ Une fois reconnecté, la synchronisation automatique des emails reprendra.'
        });
        console.log('[Gmail Sync] 🔔 Notification de déconnexion créée pour saasAccountId:', saasAccountId);
      } catch (notifError) {
        console.error('[Gmail Sync] Erreur création notification:', notifError);
      }
    }
  }
}

// Fonction: Synchroniser tous les comptes SaaS avec Gmail connecté
async function syncAllEmailAccounts() {
  if (!firestore) return;

  try {
    // OPTIMISATION: Utiliser une requête filtrée pour ne récupérer que les comptes avec Gmail connecté
    // Au lieu de lire TOUS les saasAccounts, on ne lit que ceux qui ont integrations.gmail.connected = true
    const saasAccounts = await firestore.collection('saasAccounts')
      .where('integrations.gmail.connected', '==', true)
      .get();

    let syncCount = 0;

    for (const doc of saasAccounts.docs) {
      const saasAccountData = doc.data();
      const gmailIntegration = saasAccountData.integrations?.gmail;

      // Double vérification (normalement toujours true grâce au where)
      if (gmailIntegration && gmailIntegration.connected) {
        await syncGmailAccount(doc.id, gmailIntegration);
        syncCount++;
      }
    }

    if (syncCount > 0) {
      console.log(`[Gmail Sync] ✅ Synchronisation de ${syncCount} compte(s) SaaS avec Gmail terminée`);
    }
  } catch (error) {
    // NOT_FOUND (code 5) = base Firestore vide ou en cours de création, ignorer silencieusement
    if (error?.code === 5 || error?.message?.includes('NOT_FOUND')) {
      return;
    }
    console.error('[Gmail Sync] Erreur lors de la synchronisation globale:', error?.message || error);
  }
}

// OPTIMISATION: Augmenter l'intervalle de polling pour réduire les lectures Firestore
// Passer de 60 secondes à 5 minutes (300 secondes)
if (firestore && oauth2Client) {
  console.log('[Gmail Sync] ✅ Polling Gmail activé (toutes les 5 minutes)');
  setInterval(syncAllEmailAccounts, 300_000); // 5 minutes au lieu de 60 secondes
  // Première synchronisation après 30 secondes (au lieu de 10)
  setTimeout(syncAllEmailAccounts, 30_000);
} else {
  console.warn('[Gmail Sync] ⚠️  Polling Gmail désactivé (Firestore ou OAuth non configuré)');
}

// ============================================================================
// GOOGLE SHEETS OAUTH & SYNC
// ============================================================================

// Route: Démarrer le flux OAuth Google Sheets
app.get('/auth/google-sheets/start', requireAuth, (req, res) => {
  if (!googleSheetsOAuth2Client) {
    return res.status(400).json({ error: 'Google Sheets OAuth non configuré. Ajoutez GOOGLE_SHEETS_CLIENT_ID et GOOGLE_SHEETS_CLIENT_SECRET dans les variables Railway ou .env.local. Voir GMAIL_OAUTH_ENVIRONNEMENTS.md' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré. Veuillez compléter la configuration MBE.' });
  }

  // Scopes: lecture pour bordereaux Typeform + écriture pour Bilan devis MBE
  const scopes = [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/spreadsheets', // Écriture pour Bilan devis MBE
    'https://www.googleapis.com/auth/drive.readonly', // CRITIQUE: Nécessaire pour accéder aux bordereaux dans Drive
    'https://www.googleapis.com/auth/drive.file', // Création/écriture fichiers (Bilan)
    'https://www.googleapis.com/auth/drive.metadata.readonly' // Pour lister les dossiers
  ];

  // Passer le saasAccountId dans le state pour le récupérer au callback
  const url = googleSheetsOAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    state: req.saasAccountId // Passer le saasAccountId dans le state
  });

  console.log('[Google Sheets OAuth] URL OAuth générée pour saasAccountId:', req.saasAccountId);
  
  // Retourner l'URL en JSON pour que le frontend puisse rediriger
  res.json({ url });
});

// Route: Callback OAuth Google Sheets
app.get('/auth/google-sheets/callback', async (req, res) => {
  if (!googleSheetsOAuth2Client || !firestore) {
    return res.status(400).json({ error: 'Google Sheets OAuth ou Firestore non configuré' });
  }

  const { code, state: saasAccountId } = req.query;
  if (!code) {
    return res.redirect(`${FRONTEND_URL}/settings?error=no_code&source=google-sheets`);
  }

  if (!saasAccountId) {
    return res.redirect(`${FRONTEND_URL}/settings?error=no_saas_account_id&source=google-sheets`);
  }

  try {
    const { tokens } = await googleSheetsOAuth2Client.getToken(code);
    googleSheetsOAuth2Client.setCredentials(tokens);

    // Vérifier que le saasAccount existe
    const saasAccountRef = firestore.collection('saasAccounts').doc(saasAccountId);
    const saasAccountDoc = await saasAccountRef.get();
    
    if (!saasAccountDoc.exists) {
      console.error('[Google Sheets OAuth] ❌ Compte SaaS non trouvé:', saasAccountId);
      return res.redirect(`${FRONTEND_URL}/settings?error=saas_account_not_found&source=google-sheets`);
    }

    // Stocker uniquement les tokens OAuth (sans sélectionner de sheet pour l'instant)
    // L'utilisateur devra choisir le sheet dans l'interface
    await saasAccountRef.update({
      'integrations.googleSheets': {
        connected: false, // Pas encore de sheet sélectionné
        oauthTokens: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null
        },
        connectedAt: Timestamp.now()
      }
    });

    console.log('[Google Sheets OAuth] ✅ OAuth Google Sheets autorisé pour saasAccountId:', saasAccountId);
    console.log('[Google Sheets OAuth] ⚠️  L\'utilisateur doit maintenant sélectionner un Google Sheet dans l\'interface');

    // Rediriger vers Settings avec un paramètre pour afficher la liste des sheets
    res.redirect(`${FRONTEND_URL}/settings?oauth_success=true&source=google-sheets&action=select_sheet`);
  } catch (error) {
    console.error('[Google Sheets OAuth] ❌ Erreur lors du callback:', error);
    res.redirect(`${FRONTEND_URL}/settings?error=${encodeURIComponent(error.message)}&source=google-sheets`);
  }
});

// ==========================================
// ROUTES OAUTH TYPEFORM (bordereaux depuis réponses Typeform)
// ==========================================

// Route: Démarrer le flux OAuth Typeform
app.get('/auth/typeform/start', requireAuth, (req, res) => {
  if (!TYPEFORM_CLIENT_ID || !TYPEFORM_CLIENT_SECRET) {
    return res.status(400).json({ error: 'Typeform OAuth non configuré. Vérifiez TYPEFORM_CLIENT_ID et TYPEFORM_CLIENT_SECRET.' });
  }
  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré.' });
  }
  const scopes = ['responses:read', 'offline'];
  const params = new URLSearchParams({
    client_id: TYPEFORM_CLIENT_ID,
    redirect_uri: TYPEFORM_REDIRECT_URI,
    scope: scopes.join(' '),
    state: req.saasAccountId
  });
  const url = `https://api.typeform.com/oauth/authorize?${params.toString()}`;
  console.log('[Typeform OAuth] URL générée pour saasAccountId:', req.saasAccountId);
  res.json({ url });
});

// Route: Callback OAuth Typeform
app.get('/auth/typeform/callback', async (req, res) => {
  if (!firestore || !TYPEFORM_CLIENT_ID || !TYPEFORM_CLIENT_SECRET) {
    return res.redirect(`${FRONTEND_URL}/settings?error=typeform_not_configured&source=typeform`);
  }
  const { code, state: saasAccountId } = req.query;
  if (!code) {
    return res.redirect(`${FRONTEND_URL}/settings?error=no_code&source=typeform`);
  }
  if (!saasAccountId) {
    return res.redirect(`${FRONTEND_URL}/settings?error=no_saas_account_id&source=typeform`);
  }
  try {
    const tokenRes = await fetch('https://api.typeform.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: TYPEFORM_CLIENT_ID,
        client_secret: TYPEFORM_CLIENT_SECRET,
        redirect_uri: TYPEFORM_REDIRECT_URI
      }).toString()
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[Typeform OAuth] Erreur token:', tokenRes.status, errText);
      throw new Error(`Typeform token exchange failed: ${tokenRes.status}`);
    }
    const tokens = await tokenRes.json();
    const saasAccountRef = firestore.collection('saasAccounts').doc(saasAccountId);
    const saasAccountDoc = await saasAccountRef.get();
    if (!saasAccountDoc.exists) {
      return res.redirect(`${FRONTEND_URL}/settings?error=saas_account_not_found&source=typeform`);
    }
    await saasAccountRef.update({
      'integrations.typeform': {
        connected: true,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt: tokens.expires_in ? Timestamp.fromMillis(Date.now() + tokens.expires_in * 1000) : null,
        connectedAt: Timestamp.now()
      }
    });
    console.log('[Typeform OAuth] ✅ Compte Typeform connecté pour saasAccountId:', saasAccountId);
    res.redirect(`${FRONTEND_URL}/settings?oauth_success=true&source=typeform`);
  } catch (error) {
    console.error('[Typeform OAuth] ❌ Erreur callback:', error);
    res.redirect(`${FRONTEND_URL}/settings?error=${encodeURIComponent(error.message)}&source=typeform`);
  }
});

// Route: Statut connexion Typeform
app.get('/api/typeform/status', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  if (!req.saasAccountId) return res.status(400).json({ error: 'Compte SaaS non configuré' });
  try {
    const saasDoc = await firestore.collection('saasAccounts').doc(req.saasAccountId).get();
    if (!saasDoc.exists) return res.status(404).json({ connected: false });
    const typeform = saasDoc.data()?.integrations?.typeform;
    res.json({
      connected: !!(typeform?.connected && typeform?.accessToken),
      connectedAt: typeform?.connectedAt?.toDate?.()?.toISOString?.() || null
    });
  } catch (e) {
    console.error('[Typeform] Erreur status:', e);
    res.status(500).json({ connected: false });
  }
});

// Route: Déconnecter Typeform
app.delete('/api/typeform/disconnect', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  if (!req.saasAccountId) return res.status(400).json({ error: 'Compte SaaS non configuré' });
  try {
    await firestore.collection('saasAccounts').doc(req.saasAccountId).update({
      'integrations.typeform': FieldValue.delete()
    });
    console.log('[Typeform] Déconnecté pour saasAccountId:', req.saasAccountId);
    res.json({ success: true });
  } catch (e) {
    console.error('[Typeform] Erreur déconnexion:', e);
    res.status(500).json({ error: e.message });
  }
});

// Route: Lister les Google Sheets disponibles
app.get('/api/google-sheets/list', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  if (!googleSheetsOAuth2Client) {
    return res.status(400).json({ error: 'Google Sheets OAuth non configuré' });
  }

  try {
    // Récupérer les tokens OAuth du compte
    const saasAccountRef = firestore.collection('saasAccounts').doc(req.saasAccountId);
    const saasAccountDoc = await saasAccountRef.get();
    
    if (!saasAccountDoc.exists) {
      return res.status(404).json({ error: 'Compte SaaS non trouvé' });
    }

    const saasAccountData = saasAccountDoc.data();
    const googleSheetsIntegration = saasAccountData.integrations?.googleSheets;
    const oauthTokens = googleSheetsIntegration?.oauthTokens;

    if (!oauthTokens || !oauthTokens.accessToken) {
      return res.status(400).json({ error: 'OAuth Google Sheets non autorisé. Connectez d\'abord votre compte Google.' });
    }

    // Reconstruire les tokens pour OAuth2
    let expiryDate = null;
    if (oauthTokens.expiresAt) {
      if (oauthTokens.expiresAt instanceof Date) {
        expiryDate = oauthTokens.expiresAt.getTime();
      } else if (oauthTokens.expiresAt.toDate) {
        expiryDate = oauthTokens.expiresAt.toDate().getTime();
      } else {
        expiryDate = new Date(oauthTokens.expiresAt).getTime();
      }
    }

    const auth = new google.auth.OAuth2(
      GOOGLE_SHEETS_CLIENT_ID,
      GOOGLE_SHEETS_CLIENT_SECRET,
      GOOGLE_SHEETS_REDIRECT_URI
    );
    auth.setCredentials({
      access_token: oauthTokens.accessToken,
      refresh_token: oauthTokens.refreshToken,
      expiry_date: expiryDate
    });

    // Récupérer les fichiers Google Sheets accessibles
    const drive = google.drive({ version: 'v3', auth });
    const files = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet'",
      fields: 'files(id, name, modifiedTime)',
      pageSize: 20,
      orderBy: 'modifiedTime desc'
    });

    if (!files.data.files || files.data.files.length === 0) {
      return res.json({ sheets: [] });
    }

    const sheets = files.data.files.map(file => ({
      id: file.id,
      name: file.name,
      modifiedTime: file.modifiedTime
    }));

    res.json({ sheets });
  } catch (error) {
    console.error('[API] Erreur lors de la récupération de la liste des Google Sheets:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route: Sélectionner un Google Sheet
app.post('/api/google-sheets/select', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  const { spreadsheetId, spreadsheetName } = req.body;

  if (!spreadsheetId || !spreadsheetName) {
    return res.status(400).json({ error: 'spreadsheetId et spreadsheetName requis' });
  }

  try {
    const saasAccountRef = firestore.collection('saasAccounts').doc(req.saasAccountId);
    const saasAccountDoc = await saasAccountRef.get();
    
    if (!saasAccountDoc.exists) {
      return res.status(404).json({ error: 'Compte SaaS non trouvé' });
    }

    const saasAccountData = saasAccountDoc.data();
    const googleSheetsIntegration = saasAccountData.integrations?.googleSheets;
    const oauthTokens = googleSheetsIntegration?.oauthTokens;

    if (!oauthTokens) {
      return res.status(400).json({ error: 'OAuth Google Sheets non autorisé' });
    }

    // Mettre à jour avec le sheet sélectionné (préserver columnMapping si existant)
    await saasAccountRef.update({
      'integrations.googleSheets': {
        connected: true,
        spreadsheetId: spreadsheetId,
        spreadsheetName: spreadsheetName,
        accessToken: oauthTokens.accessToken,
        refreshToken: oauthTokens.refreshToken,
        expiresAt: oauthTokens.expiresAt,
        lastRowImported: 1,
        lastSyncAt: null,
        connectedAt: googleSheetsIntegration.connectedAt || Timestamp.now(),
        selectedAt: Timestamp.now(),
        ...(googleSheetsIntegration?.columnMapping && { columnMapping: googleSheetsIntegration.columnMapping })
      }
    });

    console.log('[API] ✅ Google Sheet sélectionné pour saasAccountId:', req.saasAccountId, 'Sheet:', spreadsheetName);
    res.json({ success: true, message: 'Google Sheet sélectionné avec succès' });
  } catch (error) {
    console.error('[API] Erreur lors de la sélection du Google Sheet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route: Récupérer le statut Google Sheets
app.get('/api/google-sheets/status', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  try {
    const saasAccountRef = firestore.collection('saasAccounts').doc(req.saasAccountId);
    const saasAccountDoc = await saasAccountRef.get();
    
    if (!saasAccountDoc.exists) {
      return res.status(404).json({ error: 'Compte SaaS non trouvé' });
    }

    const saasAccountData = saasAccountDoc.data();
    const googleSheetsIntegration = saasAccountData.integrations?.googleSheets;

    // Vérifier si OAuth est autorisé mais pas de sheet sélectionné
    const hasOAuth = googleSheetsIntegration?.oauthTokens || (googleSheetsIntegration?.accessToken && googleSheetsIntegration?.refreshToken);
    const isConnected = googleSheetsIntegration?.connected && googleSheetsIntegration?.spreadsheetId;

    if (!hasOAuth) {
      return res.json({
        connected: false,
        oauthAuthorized: false,
        spreadsheetId: null,
        spreadsheetName: null,
        lastSyncAt: null,
        lastRowImported: null
      });
    }

    if (!isConnected) {
      return res.json({
        connected: false,
        oauthAuthorized: true,
        spreadsheetId: null,
        spreadsheetName: null,
        lastSyncAt: null,
        lastRowImported: null
      });
    }

    res.json({
      connected: true,
      oauthAuthorized: true,
      spreadsheetId: googleSheetsIntegration.spreadsheetId,
      spreadsheetName: googleSheetsIntegration.spreadsheetName,
      lastSyncAt: googleSheetsIntegration.lastSyncAt?.toDate ? googleSheetsIntegration.lastSyncAt.toDate().toISOString() : null,
      lastRowImported: googleSheetsIntegration.lastRowImported || 1,
      connectedAt: googleSheetsIntegration.connectedAt?.toDate ? googleSheetsIntegration.connectedAt.toDate().toISOString() : null
    });
  } catch (error) {
    console.error('[API] Erreur lors de la récupération du statut Google Sheets:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route: Déconnecter Google Sheets
app.delete('/api/google-sheets/disconnect', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  try {
    const saasAccountRef = firestore.collection('saasAccounts').doc(req.saasAccountId);
    const saasAccountDoc = await saasAccountRef.get();
    
    if (!saasAccountDoc.exists) {
      return res.status(404).json({ error: 'Compte SaaS non trouvé' });
    }

    // Supprimer l'intégration Google Sheets
    await saasAccountRef.update({
      'integrations.googleSheets': FieldValue.delete()
    });

    console.log('[API] ✅ Google Sheets déconnecté pour saasAccountId:', req.saasAccountId);
    res.json({ success: true, message: 'Google Sheets déconnecté' });
  } catch (error) {
    console.error('[API] Erreur lors de la déconnexion Google Sheets:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route: GET column mapping
app.get('/api/google-sheets/column-mapping', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  if (!req.saasAccountId) return res.status(400).json({ error: 'Compte SaaS non configuré' });
  try {
    const doc = await firestore.collection('saasAccounts').doc(req.saasAccountId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Compte non trouvé' });
    const gs = doc.data().integrations?.googleSheets || {};
    const mapping = { ...DEFAULT_COLUMN_MAPPING, ...(gs.columnMapping || {}) };
    res.json({ mapping, defaultMapping: DEFAULT_COLUMN_MAPPING });
  } catch (err) {
    console.error('[API] Erreur column-mapping GET:', err);
    res.status(500).json({ error: err.message });
  }
});

// Route: PUT column mapping
app.put('/api/google-sheets/column-mapping', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  if (!req.saasAccountId) return res.status(400).json({ error: 'Compte SaaS non configuré' });
  const { mapping } = req.body;
  if (!mapping || typeof mapping !== 'object') {
    return res.status(400).json({ error: 'mapping requis (objet)' });
  }
  for (const [k, v] of Object.entries(mapping)) {
    if (!DEFAULT_COLUMN_MAPPING.hasOwnProperty(k)) continue;
    if (v !== null && (typeof v !== 'number' || v < 0)) {
      return res.status(400).json({ error: `Champ "${k}" : valeur invalide (nombre >= 0 ou null)` });
    }
  }
  try {
    await firestore.collection('saasAccounts').doc(req.saasAccountId).update({
      'integrations.googleSheets.columnMapping': mapping
    });
    res.json({ success: true, message: 'Mapping enregistré' });
  } catch (err) {
    console.error('[API] Erreur column-mapping PUT:', err);
    res.status(500).json({ error: err.message });
  }
});

// Route: GET preview rows (premières lignes du sheet pour configurer le mapping)
app.get('/api/google-sheets/preview-rows', requireAuth, async (req, res) => {
  if (!firestore || !googleSheetsOAuth2Client) return res.status(500).json({ error: 'Config manquante' });
  if (!req.saasAccountId) return res.status(400).json({ error: 'Compte SaaS non configuré' });
  const limit = Math.min(parseInt(req.query.rows, 10) || 5, 20);
  try {
    const doc = await firestore.collection('saasAccounts').doc(req.saasAccountId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Compte non trouvé' });
    const gs = doc.data().integrations?.googleSheets || {};
    if (!gs.connected || !gs.spreadsheetId || !gs.accessToken) {
      return res.status(400).json({ error: 'Google Sheet non connecté' });
    }
    let expiryDate = null;
    if (gs.expiresAt) {
      if (gs.expiresAt.toDate) expiryDate = gs.expiresAt.toDate().getTime();
      else if (gs.expiresAt instanceof Date) expiryDate = gs.expiresAt.getTime();
      else expiryDate = new Date(gs.expiresAt).getTime();
    }
    const auth = new google.auth.OAuth2(GOOGLE_SHEETS_CLIENT_ID, GOOGLE_SHEETS_CLIENT_SECRET, GOOGLE_SHEETS_REDIRECT_URI);
    auth.setCredentials({ access_token: gs.accessToken, refresh_token: gs.refreshToken, expiry_date: expiryDate });
    const sheets = google.sheets({ version: 'v4', auth });
    const resp = await sheets.spreadsheets.get({
      spreadsheetId: gs.spreadsheetId,
      includeGridData: true,
      ranges: [`A1:ZZ${limit + 1}`]
    });
    const sheet = resp.data.sheets?.[0];
    const rowData = sheet?.data?.[0]?.rowData || [];
    const rows = rowData.map(row => {
      if (!row.values) return [];
      return row.values.map(c => c.formattedValue || '');
    });
    res.json({ rows });
  } catch (err) {
    console.error('[API] Erreur preview-rows:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// BILAN DEVIS MBE - Google Sheet dédié (En cours, Terminés, Refusés)
// ============================================================================

/** Crée une instance OAuth2 pour un compte SaaS (tokens depuis Google Sheets) */
function getGoogleAuthForSaasAccount(saasAccountData) {
  const gs = saasAccountData.integrations?.googleSheets;
  const tokens = gs?.oauthTokens || (gs?.accessToken ? {
    accessToken: gs.accessToken,
    refreshToken: gs.refreshToken,
    expiresAt: gs.expiresAt,
  } : null);
  if (!tokens?.accessToken) return null;

  let expiryDate = null;
  if (tokens.expiresAt) {
    if (tokens.expiresAt?.toDate) expiryDate = tokens.expiresAt.toDate().getTime();
    else if (tokens.expiresAt instanceof Date) expiryDate = tokens.expiresAt.getTime();
    else expiryDate = new Date(tokens.expiresAt).getTime();
  }

  const auth = new google.auth.OAuth2(
    GOOGLE_SHEETS_CLIENT_ID,
    GOOGLE_SHEETS_CLIENT_SECRET,
    GOOGLE_SHEETS_REDIRECT_URI
  );
  auth.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: expiryDate,
  });
  return auth;
}

// Route: Créer le Bilan devis MBE (spreadsheet + 3 feuilles)
app.post('/api/bilan/create', requireAuth, async (req, res) => {
  if (!firestore || !req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  try {
    const saasDoc = await firestore.collection('saasAccounts').doc(req.saasAccountId).get();
    if (!saasDoc.exists) return res.status(404).json({ error: 'Compte SaaS non trouvé' });

    const saasData = saasDoc.data();
    if (saasData.integrations?.bilanSheet?.spreadsheetId) {
      return res.status(400).json({ error: 'Le Bilan devis MBE existe déjà. Utilisez "Voir le bilan" pour l\'ouvrir.' });
    }

    const auth = getGoogleAuthForSaasAccount(saasData);
    if (!auth) {
      return res.status(400).json({ error: 'Connectez d\'abord Google Sheets dans Paramètres pour créer le Bilan.' });
    }

    const { spreadsheetId, spreadsheetUrl } = await createBilanSpreadsheet(auth, req.saasAccountId);

    await firestore.collection('saasAccounts').doc(req.saasAccountId).update({
      'integrations.bilanSheet': {
        spreadsheetId,
        spreadsheetUrl,
        createdAt: Timestamp.now(),
      },
    });

    // Export initial de tous les devis
    await exportAllQuotesToBilan(firestore, auth, req.saasAccountId);

    console.log('[Bilan] ✅ Spreadsheet créé pour saasAccountId:', req.saasAccountId);
    res.json({ success: true, spreadsheetId, spreadsheetUrl });
  } catch (error) {
    console.error('[Bilan] Erreur création:', error);
    res.status(500).json({ error: error.message || 'Erreur lors de la création du Bilan' });
  }
});

// Route: Récupérer le statut du Bilan
app.get('/api/bilan/status', requireAuth, async (req, res) => {
  if (!firestore || !req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  try {
    const saasDoc = await firestore.collection('saasAccounts').doc(req.saasAccountId).get();
    if (!saasDoc.exists) return res.status(404).json({ error: 'Compte SaaS non trouvé' });

    const bilanSheet = saasDoc.data().integrations?.bilanSheet;
    res.json({
      exists: Boolean(bilanSheet?.spreadsheetId),
      spreadsheetId: bilanSheet?.spreadsheetId || null,
      spreadsheetUrl: bilanSheet?.spreadsheetUrl || null,
    });
  } catch (error) {
    console.error('[Bilan] Erreur statut:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route: Synchroniser un devis vers le Bilan (appelée après chaque mise à jour)
app.post('/api/bilan/sync-quote/:quoteId', requireAuth, async (req, res) => {
  if (!firestore || !req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  const { quoteId } = req.params;
  if (!quoteId) return res.status(400).json({ error: 'quoteId requis' });

  try {
    const saasDoc = await firestore.collection('saasAccounts').doc(req.saasAccountId).get();
    if (!saasDoc.exists) return res.status(404).json({ error: 'Compte SaaS non trouvé' });

    const bilanSheet = saasDoc.data().integrations?.bilanSheet;
    if (!bilanSheet?.spreadsheetId) {
      return res.json({ success: true, skipped: true, reason: 'Bilan non créé' });
    }

    const auth = getGoogleAuthForSaasAccount(saasDoc.data());
    if (!auth) return res.json({ success: true, skipped: true, reason: 'OAuth non configuré' });

    await syncQuoteToBilanSheet(firestore, auth, req.saasAccountId, quoteId);
    res.json({ success: true });
  } catch (error) {
    console.error('[Bilan] Erreur sync devis:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// REFUS / ABANDON CLIENT - Devis refusé ou abandonné par le client final
// ============================================================================

const REFUSAL_REASON_LABELS = {
  tarif_trop_eleve: 'Tarif trop élevé',
  client_a_paye_concurrent: 'Client a payé un concurrent',
  plus_interesse: 'Plus intéressé',
  autre: 'Autre',
  pas_de_reponse: 'Pas de réponse / Abandonné',
  refus_explicite: 'Refus explicite',
};

app.post('/api/quotes/:quoteId/client-refused', requireAuth, async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte SaaS non configuré' });
  const { quoteId } = req.params;
  const { reason, reasonDetail } = req.body;
  if (!quoteId) return res.status(400).json({ error: 'quoteId requis' });
  const validReasons = ['tarif_trop_eleve', 'client_a_paye_concurrent', 'plus_interesse', 'autre', 'pas_de_reponse', 'refus_explicite'];
  const clientRefusalReason = validReasons.includes(reason) ? reason : 'autre';
  const clientRefusalReasonDetail = typeof reasonDetail === 'string' ? reasonDetail.trim() : undefined;

  try {
    const ref = firestore.collection('quotes').doc(quoteId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Devis introuvable' });
    const data = doc.data();
    if (data.saasAccountId !== req.saasAccountId) return res.status(403).json({ error: 'Accès refusé' });
    if (data.paymentStatus === 'paid') return res.status(400).json({ error: 'Un devis payé ne peut pas être marqué refusé' });

    const desc = REFUSAL_REASON_LABELS[clientRefusalReason] || 'Devis refusé par le client';
    const timelineEvent = {
      id: `tl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      date: Timestamp.now(),
      status: 'client_refused',
      description: clientRefusalReasonDetail ? `${desc} – ${clientRefusalReasonDetail}` : desc,
      user: 'Utilisateur',
    };

    const updateData = {
      clientRefusalStatus: 'client_refused',
      clientRefusalReason,
      clientRefusalAt: Timestamp.now(),
      timeline: FieldValue.arrayUnion(timelineEvent),
      updatedAt: Timestamp.now(),
    };
    if (clientRefusalReasonDetail) updateData.clientRefusalReasonDetail = clientRefusalReasonDetail;
    await ref.update(updateData);

    const auth = getGoogleAuthForSaasAccount((await firestore.collection('saasAccounts').doc(req.saasAccountId).get()).data());
    if (auth) await syncQuoteToBilanSheet(firestore, auth, req.saasAccountId, quoteId);

    res.json({ success: true });
  } catch (e) {
    console.error('[client-refused]', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/quotes/:quoteId/send-reminder', requireAuth, async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte SaaS non configuré' });
  const { quoteId } = req.params;
  if (!quoteId) return res.status(400).json({ error: 'quoteId requis' });

  try {
    const ref = firestore.collection('quotes').doc(quoteId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Devis introuvable' });
    const data = doc.data();
    if (data.saasAccountId !== req.saasAccountId) return res.status(403).json({ error: 'Accès refusé' });
    if (data.paymentStatus === 'paid' || data.clientRefusalStatus === 'client_refused') {
      return res.status(400).json({ error: 'Cette action n\'est pas possible pour ce devis' });
    }

    const timelineEvent = {
      id: `tl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      date: Timestamp.now(),
      status: data.status || 'awaiting_payment',
      description: 'Relance envoyée au client',
      user: 'Utilisateur',
    };

    await ref.update({
      reminderSentAt: Timestamp.now(),
      timeline: FieldValue.arrayUnion(timelineEvent),
      updatedAt: Timestamp.now(),
    });

    res.json({ success: true });
  } catch (e) {
    console.error('[send-reminder]', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// PAIEMENT MANUEL - Virement / CB téléphone
// ============================================================================

app.post('/api/quotes/:quoteId/mark-paid-manually', requireAuth, async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte SaaS non configuré' });
  const { quoteId } = req.params;
  const { method, paymentDate } = req.body;
  if (!quoteId) return res.status(400).json({ error: 'quoteId requis' });
  const validMethods = ['virement', 'cb_telephone'];
  const paymentMethod = validMethods.includes(method) ? method : 'virement';

  let paymentDateTimestamp;
  if (paymentDate && typeof paymentDate === 'string') {
    const d = new Date(paymentDate);
    if (!isNaN(d.getTime())) paymentDateTimestamp = Timestamp.fromDate(d);
  }
  if (!paymentDateTimestamp) paymentDateTimestamp = Timestamp.now();

  const desc = paymentMethod === 'virement' ? 'Payé par virement' : 'Payé par CB téléphone';
  const dateStr = new Date(paymentDateTimestamp.toDate?.() || paymentDateTimestamp).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  try {
    const ref = firestore.collection('quotes').doc(quoteId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Devis introuvable' });
    const data = doc.data();
    if (data.saasAccountId !== req.saasAccountId) return res.status(403).json({ error: 'Accès refusé' });
    if (data.paymentStatus === 'paid') return res.status(400).json({ error: 'Ce devis est déjà marqué comme payé' });
    if (data.clientRefusalStatus === 'client_refused') return res.status(400).json({ error: 'Un devis refusé ne peut pas être marqué payé' });

    const totalAmount = (data.options?.packagingPrice ?? 0) + (data.options?.shippingPrice ?? 0) + (data.options?.insuranceAmount ?? 0)
      || data.totalAmount || 0;

    const timelineEvent = {
      id: `tl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      date: paymentDateTimestamp,
      status: 'awaiting_collection',
      description: `${desc} le ${dateStr}`,
      user: 'Utilisateur',
    };

    // Désactiver les liens de paiement (virement/CB = pas de double paiement par lien)
    const existingLinks = data.paymentLinks || [];
    const updatedPaymentLinks = existingLinks.map((link) => {
      const l = link && typeof link === 'object' ? link : {};
      const status = l.status || 'active';
      if (status === 'active' || status === 'pending') {
        return { ...l, status: 'expired' };
      }
      return l;
    });

    // Annuler les paiements PENDING dans la collection paiements (Stripe Connect)
    const paiementsSnap = await firestore.collection('paiements').where('devisId', '==', quoteId).get();
    const batch = firestore.batch();
    let hasUpdates = false;
    paiementsSnap.docs.forEach((d) => {
      if (d.data().status === 'PENDING') {
        batch.update(d.ref, { status: 'CANCELLED', updatedAt: Timestamp.now() });
        hasUpdates = true;
      }
    });
    if (hasUpdates) await batch.commit();

    await ref.update({
      paymentStatus: 'paid',
      status: 'awaiting_collection',
      manualPaymentMethod: paymentMethod,
      manualPaymentDate: paymentDateTimestamp,
      paidAmount: totalAmount,
      paymentLinks: updatedPaymentLinks,
      timeline: FieldValue.arrayUnion(timelineEvent),
      updatedAt: Timestamp.now(),
    });

    const auth = getGoogleAuthForSaasAccount((await firestore.collection('saasAccounts').doc(req.saasAccountId).get()).data());
    if (auth) await syncQuoteToBilanSheet(firestore, auth, req.saasAccountId, quoteId);

    res.json({ success: true });
  } catch (e) {
    console.error('[mark-paid-manually]', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/quotes/:quoteId/unmark-paid', requireAuth, async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte SaaS non configuré' });
  const { quoteId } = req.params;
  if (!quoteId) return res.status(400).json({ error: 'quoteId requis' });

  try {
    const ref = firestore.collection('quotes').doc(quoteId);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Devis introuvable' });
    const data = doc.data();
    if (data.saasAccountId !== req.saasAccountId) return res.status(403).json({ error: 'Accès refusé' });
    if (data.paymentStatus !== 'paid') return res.status(400).json({ error: 'Ce devis n\'est pas marqué comme payé' });
    if (!data.manualPaymentMethod) return res.status(400).json({ error: 'Seuls les paiements manuels (virement/CB) peuvent être annulés' });

    const timelineEvent = {
      id: `tl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      date: Timestamp.now(),
      status: 'awaiting_payment',
      description: 'Paiement annulé – retour en attente de paiement',
      user: 'Utilisateur',
    };

    await ref.update({
      paymentStatus: 'pending',
      status: 'awaiting_payment',
      manualPaymentMethod: FieldValue.delete(),
      manualPaymentDate: FieldValue.delete(),
      paidAmount: 0,
      timeline: FieldValue.arrayUnion(timelineEvent),
      updatedAt: Timestamp.now(),
    });

    const auth = getGoogleAuthForSaasAccount((await firestore.collection('saasAccounts').doc(req.saasAccountId).get()).data());
    if (auth) await syncQuoteToBilanSheet(firestore, auth, req.saasAccountId, quoteId);

    res.json({ success: true });
  } catch (e) {
    console.error('[unmark-paid]', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// GOOGLE DRIVE API - GESTION DES BORDEREAUX
// ============================================================================

// Route: Lister les dossiers Google Drive
app.get('/api/google-drive/folders', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  try {
    const saasAccountRef = firestore.collection('saasAccounts').doc(req.saasAccountId);
    const saasAccountDoc = await saasAccountRef.get();
    
    if (!saasAccountDoc.exists) {
      return res.status(404).json({ error: 'Compte SaaS non trouvé' });
    }

    const saasAccountData = saasAccountDoc.data();
    const googleSheetsIntegration = saasAccountData.integrations?.googleSheets;

    if (!googleSheetsIntegration || !googleSheetsIntegration.accessToken) {
      return res.status(400).json({ error: 'OAuth Google non autorisé. Connectez d\'abord Google Sheets.' });
    }

    // Reconstruire les tokens
    let expiryDate = null;
    if (googleSheetsIntegration.expiresAt) {
      if (googleSheetsIntegration.expiresAt instanceof Timestamp) {
        expiryDate = googleSheetsIntegration.expiresAt.toDate().getTime();
      } else if (googleSheetsIntegration.expiresAt.toDate) {
        expiryDate = googleSheetsIntegration.expiresAt.toDate().getTime();
      } else if (googleSheetsIntegration.expiresAt instanceof Date) {
        expiryDate = googleSheetsIntegration.expiresAt.getTime();
      } else {
        expiryDate = new Date(googleSheetsIntegration.expiresAt).getTime();
      }
    }

    const auth = new google.auth.OAuth2(
      GOOGLE_SHEETS_CLIENT_ID,
      GOOGLE_SHEETS_CLIENT_SECRET,
      GOOGLE_SHEETS_REDIRECT_URI
    );
    auth.setCredentials({
      access_token: googleSheetsIntegration.accessToken,
      refresh_token: googleSheetsIntegration.refreshToken,
      expiry_date: expiryDate
    });

    // Récupérer les dossiers Google Drive
    const drive = google.drive({ version: 'v3', auth });
    const folders = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: 'files(id, name, modifiedTime, parents, webViewLink)',
      pageSize: 50,
      orderBy: 'modifiedTime desc'
    });

    if (!folders.data.files || folders.data.files.length === 0) {
      return res.json({ folders: [] });
    }

    const foldersList = folders.data.files.map(folder => ({
      id: folder.id,
      name: folder.name,
      modifiedTime: folder.modifiedTime,
      webViewLink: folder.webViewLink || null,
      parents: folder.parents || []
    }));

    res.json({ folders: foldersList });
  } catch (error) {
    console.error('[API] Erreur lors de la récupération des dossiers Google Drive:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route: Sélectionner un dossier Google Drive pour les bordereaux
app.post('/api/google-drive/select-folder', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  const { folderId, folderName } = req.body;

  if (!folderId || !folderName) {
    return res.status(400).json({ error: 'folderId et folderName requis' });
  }

  try {
    const saasAccountRef = firestore.collection('saasAccounts').doc(req.saasAccountId);
    
    // Mettre à jour avec le dossier sélectionné
    await saasAccountRef.update({
      'integrations.googleDrive': {
        connected: true,
        bordereauxFolderId: folderId,
        bordereauxFolderName: folderName,
        connectedAt: Timestamp.now()
      }
    });

    console.log('[API] ✅ Dossier Google Drive sélectionné pour saasAccountId:', req.saasAccountId, 'Dossier:', folderName);
    res.json({ success: true, message: 'Dossier Google Drive sélectionné avec succès' });
  } catch (error) {
    console.error('[API] Erreur lors de la sélection du dossier Google Drive:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route: Récupérer le statut Google Drive
app.get('/api/google-drive/status', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  try {
    const saasAccountRef = firestore.collection('saasAccounts').doc(req.saasAccountId);
    const saasAccountDoc = await saasAccountRef.get();
    
    if (!saasAccountDoc.exists) {
      return res.status(404).json({ error: 'Compte SaaS non trouvé' });
    }

    const saasAccountData = saasAccountDoc.data();
    const googleDriveIntegration = saasAccountData.integrations?.googleDrive;

    if (!googleDriveIntegration || !googleDriveIntegration.connected) {
      return res.json({
        connected: false,
        bordereauxFolderId: null,
        bordereauxFolderName: null,
        connectedAt: null
      });
    }

    res.json({
      connected: true,
      bordereauxFolderId: googleDriveIntegration.bordereauxFolderId,
      bordereauxFolderName: googleDriveIntegration.bordereauxFolderName,
      connectedAt: googleDriveIntegration.connectedAt?.toDate ? googleDriveIntegration.connectedAt.toDate().toISOString() : null
    });
  } catch (error) {
    console.error('[API] Erreur lors de la récupération du statut Google Drive:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route: Déconnecter Google Drive
app.delete('/api/google-drive/disconnect', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  try {
    const saasAccountRef = firestore.collection('saasAccounts').doc(req.saasAccountId);
    
    // Supprimer l'intégration Google Drive
    await saasAccountRef.update({
      'integrations.googleDrive': FieldValue.delete()
    });

    console.log('[API] ✅ Google Drive déconnecté pour saasAccountId:', req.saasAccountId);
    res.json({ success: true, message: 'Google Drive déconnecté avec succès' });
  } catch (error) {
    console.error('[API] Erreur lors de la déconnexion de Google Drive:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ROUTES API - CARTONS & EMBALLAGES (SaaS-isolated)
// ============================================================================

// Route: Récupérer tous les cartons d'un compte SaaS
app.get('/api/cartons', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  try {
    console.log('[Cartons] 📦 Récupération des cartons pour saasAccountId:', req.saasAccountId);
    
    const cartonsSnapshot = await firestore
      .collection('cartons')
      .where('saasAccountId', '==', req.saasAccountId)
      .where('isActive', '==', true)
      .orderBy('createdAt', 'desc')
      .get();

    const cartons = cartonsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || null,
      updatedAt: doc.data().updatedAt?.toDate?.() || null,
    }));

    console.log(`[Cartons] ✅ ${cartons.length} carton(s) récupéré(s)`);
    res.json({ cartons });
  } catch (error) {
    console.error('[Cartons] Erreur lors de la récupération:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route: Créer un nouveau carton
app.post('/api/cartons', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  try {
    const { carton_ref, inner_length, inner_width, inner_height, packaging_price, isDefault } = req.body;

    // Validations
    if (!carton_ref || !inner_length || !inner_width || !inner_height || packaging_price === undefined) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    if (inner_length <= 0 || inner_width <= 0 || inner_height <= 0) {
      return res.status(400).json({ error: 'Les dimensions doivent être supérieures à 0' });
    }

    if (packaging_price < 0) {
      return res.status(400).json({ error: 'Le prix doit être supérieur ou égal à 0' });
    }

    // Si ce carton est défini comme défaut, retirer le défaut des autres
    if (isDefault) {
      const existingDefaultSnapshot = await firestore
        .collection('cartons')
        .where('saasAccountId', '==', req.saasAccountId)
        .where('isDefault', '==', true)
        .get();

      const batch = firestore.batch();
      existingDefaultSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { isDefault: false, updatedAt: Timestamp.now() });
      });
      await batch.commit();
      console.log('[Cartons] ⭐ Ancien(s) carton(s) par défaut désactivé(s)');
    }

    // Créer le nouveau carton
    const cartonData = {
      saasAccountId: req.saasAccountId,
      carton_ref,
      inner_length: Number(inner_length),
      inner_width: Number(inner_width),
      inner_height: Number(inner_height),
      packaging_price: Number(packaging_price),
      isDefault: Boolean(isDefault),
      isActive: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const cartonRef = await firestore.collection('cartons').add(cartonData);
    
    console.log(`[Cartons] ✅ Carton créé: ${cartonRef.id} (${carton_ref})`);
    res.json({ 
      success: true, 
      carton: { id: cartonRef.id, ...cartonData } 
    });
  } catch (error) {
    console.error('[Cartons] Erreur lors de la création:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route: Mettre à jour un carton
app.put('/api/cartons/:id', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  try {
    const { id } = req.params;
    const { carton_ref, inner_length, inner_width, inner_height, packaging_price, isDefault } = req.body;

    // Vérifier que le carton appartient bien au compte SaaS
    const cartonDoc = await firestore.collection('cartons').doc(id).get();
    if (!cartonDoc.exists) {
      return res.status(404).json({ error: 'Carton introuvable' });
    }

    if (cartonDoc.data().saasAccountId !== req.saasAccountId) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Validations
    if (inner_length && inner_length <= 0) {
      return res.status(400).json({ error: 'La longueur doit être supérieure à 0' });
    }
    if (inner_width && inner_width <= 0) {
      return res.status(400).json({ error: 'La largeur doit être supérieure à 0' });
    }
    if (inner_height && inner_height <= 0) {
      return res.status(400).json({ error: 'La hauteur doit être supérieure à 0' });
    }
    if (packaging_price !== undefined && packaging_price < 0) {
      return res.status(400).json({ error: 'Le prix doit être supérieur ou égal à 0' });
    }

    // Si ce carton est défini comme défaut, retirer le défaut des autres
    if (isDefault) {
      const existingDefaultSnapshot = await firestore
        .collection('cartons')
        .where('saasAccountId', '==', req.saasAccountId)
        .where('isDefault', '==', true)
        .get();

      const batch = firestore.batch();
      existingDefaultSnapshot.docs.forEach(doc => {
        if (doc.id !== id) {
          batch.update(doc.ref, { isDefault: false, updatedAt: Timestamp.now() });
        }
      });
      await batch.commit();
    }

    // Mettre à jour le carton
    const updateData = {
      updatedAt: Timestamp.now(),
    };

    if (carton_ref !== undefined) updateData.carton_ref = carton_ref;
    if (inner_length !== undefined) updateData.inner_length = Number(inner_length);
    if (inner_width !== undefined) updateData.inner_width = Number(inner_width);
    if (inner_height !== undefined) updateData.inner_height = Number(inner_height);
    if (packaging_price !== undefined) updateData.packaging_price = Number(packaging_price);
    if (isDefault !== undefined) updateData.isDefault = Boolean(isDefault);

    await firestore.collection('cartons').doc(id).update(updateData);
    
    console.log(`[Cartons] ✅ Carton mis à jour: ${id}`);
    res.json({ success: true, message: 'Carton mis à jour avec succès' });
  } catch (error) {
    console.error('[Cartons] Erreur lors de la mise à jour:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route: Mettre à jour le carton d'un devis
app.put('/api/devis/:id/carton', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  try {
    const devisId = req.params.id;
    const { cartonId } = req.body;

    if (!cartonId) {
      return res.status(400).json({ error: 'ID du carton requis' });
    }

    console.log(`[API] 📦 Mise à jour du carton pour le devis ${devisId}: ${cartonId}`);

    // Vérifier que le devis existe et appartient au compte SaaS
    const devisDoc = await firestore.collection('quotes').doc(devisId).get();
    if (!devisDoc.exists) {
      return res.status(404).json({ error: 'Devis introuvable' });
    }

    const devis = devisDoc.data();
    if (devis.saasAccountId !== req.saasAccountId) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // Vérifier que le carton existe et appartient au compte SaaS
    const cartonDoc = await firestore.collection('cartons').doc(cartonId).get();
    if (!cartonDoc.exists) {
      return res.status(404).json({ error: 'Carton introuvable' });
    }

    const carton = cartonDoc.data();
    if (carton.saasAccountId !== req.saasAccountId) {
      return res.status(403).json({ error: 'Accès refusé au carton' });
    }

    if (!carton.isActive) {
      return res.status(400).json({ error: 'Ce carton n\'est plus actif' });
    }

    // Recalculer le poids volumétrique avec les dimensions du nouveau carton
    const length = Number(carton.inner_length) || 0;
    const width = Number(carton.inner_width) || 0;
    const height = Number(carton.inner_height) || 0;
    const volumetricWeight = length && width && height
      ? Math.ceil((length * width * height) / 5000)
      : 0;

    // Recalculer le tarif d'expédition selon la grille tarifaire
    let shippingPrice = devis.options?.shippingPrice || 0;
    if (volumetricWeight > 0) {
      const deliveryCountry = devis.delivery?.address?.country || '';
      const addressLine = devis.delivery?.address?.line1 || '';
      let countryCode = mapCountryToCode(deliveryCountry);
      if (!countryCode && addressLine) {
        const match = addressLine.match(/\b([A-Z]{2})\b/);
        if (match) countryCode = match[1];
      }
      if (countryCode) {
        shippingPrice = await calculateShippingPriceFromGrid(
          firestore, req.saasAccountId, countryCode, volumetricWeight
        );
        if (shippingPrice > 0) {
          console.log(`[API] ✅ Prix expédition recalculé: ${shippingPrice}€ (poids vol: ${volumetricWeight}kg, pays: ${countryCode})`);
        }
      }
    }

    // Mettre à jour le devis avec le nouveau carton
    const cartonInfo = {
      id: cartonId,
      ref: carton.carton_ref,
      inner_length: carton.inner_length,
      inner_width: carton.inner_width,
      inner_height: carton.inner_height,
      price: carton.packaging_price
    };

    const packagingPrice = carton.packaging_price;
    const insuranceAmount = devis.options?.insuranceAmount || 0;
    const totalAmount = (devis.options?.collectePrice || 0) + packagingPrice + shippingPrice + insuranceAmount;

    const updateData = {
      cartonId: cartonId,
      'options.packagingPrice': packagingPrice,
      'options.shippingPrice': shippingPrice,
      'auctionSheet.recommendedCarton': cartonInfo,
      'lot.dimensions': {
        ...(devis.lot?.dimensions || {}),
        length, width, height,
        weight: volumetricWeight,
      },
      totalAmount,
      updatedAt: Timestamp.now(),
      timeline: FieldValue.arrayUnion({
        id: `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        date: Timestamp.now(),
        status: devis.status || 'calculated',
        description: `Carton modifié: ${carton.carton_ref} (${carton.packaging_price}€), expédition: ${shippingPrice}€`
      })
    };

    await firestore.collection('quotes').doc(devisId).update(updateData);

    console.log(`[API] ✅ Carton mis à jour pour le devis ${devisId}: ${carton.carton_ref} (${carton.packaging_price}€)`);

    res.json({ 
      success: true, 
      message: `Carton mis à jour: ${carton.carton_ref}`,
      carton: cartonInfo,
      totalAmount
    });
  } catch (error) {
    console.error('[API] Erreur lors de la mise à jour du carton:', error);
    res.status(500).json({ error: error.message });
  }
});

// Routes: Mise à jour de statut de devis + emails automatiques au client
const STATUS_DESCRIPTIONS = {
  collected: 'Lot collecté auprès de la salle des ventes',
  awaiting_shipment: 'En attente d\'expédition',
  shipped: 'Expédié',
};

async function updateQuoteStatusAndSendEmail(req, res, targetStatus, extraFields = {}, emailFn) {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  if (!req.saasAccountId) return res.status(400).json({ error: 'Compte SaaS non configuré' });
  const quoteId = req.params.id;
  const devisDoc = await firestore.collection('quotes').doc(quoteId).get();
  if (!devisDoc.exists) return res.status(404).json({ error: 'Devis introuvable' });
  const devis = devisDoc.data();
  if (devis.saasAccountId !== req.saasAccountId) return res.status(403).json({ error: 'Accès refusé' });

  const existingTimeline = devis.timeline || [];
  const desc = STATUS_DESCRIPTIONS[targetStatus] || targetStatus;
  const timelineEvent = {
    id: `tl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    date: Timestamp.now(),
    status: targetStatus,
    description: desc,
    user: 'Système',
  };
  const fiveMinutesAgo = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
  const isDuplicate = existingTimeline.some(
    (e) => e.status === targetStatus && e.description === desc &&
      (e.date?.toMillis ? e.date.toMillis() : new Date(e.date).getTime()) > fiveMinutesAgo.toMillis()
  );
  const updatedTimeline = isDuplicate ? existingTimeline : [...existingTimeline, timelineEvent];

  const updateData = {
    status: targetStatus,
    timeline: updatedTimeline,
    updatedAt: Timestamp.now(),
    ...extraFields,
  };

  await firestore.collection('quotes').doc(quoteId).update(updateData);

  if (emailFn) {
    try {
      const saasDoc = await firestore.collection('saasAccounts').doc(devis.saasAccountId).get();
      const commercialName = saasDoc.exists && saasDoc.data().commercialName ? saasDoc.data().commercialName : 'votre MBE';
      const quoteForEmail = {
        ...devis,
        id: quoteId,
        saasAccountId: devis.saasAccountId,
        _saasCommercialName: commercialName,
        client: devis.client || { name: devis.clientName, email: devis.clientEmail || devis.delivery?.contact?.email },
        delivery: devis.delivery,
        reference: devis.reference,
      };
      await emailFn(firestore, sendEmail, quoteForEmail, extraFields);
    } catch (emailErr) {
      console.error('[API] ⚠️ Email automatique non envoyé:', emailErr.message);
    }
  }
  return res.json({ success: true, status: targetStatus });

}

async function emailCollected(fs, se, q) { await sendCollectedEmail(fs, se, q); }
async function emailAwaitingShipment(fs, se, q) { await sendAwaitingShipmentEmail(fs, se, q); }
async function emailShipped(fs, se, q, opts) {
  await sendShippedEmail(fs, se, q, { trackingNumber: opts?.trackingNumber, carrier: opts?.carrier });
}

app.post('/api/devis/:id/mark-collected', requireAuth, async (req, res) => {
  return updateQuoteStatusAndSendEmail(req, res, 'collected', { collectedAt: Timestamp.now() }, emailCollected);
});

app.post('/api/devis/:id/mark-awaiting-shipment', requireAuth, async (req, res) => {
  return updateQuoteStatusAndSendEmail(req, res, 'awaiting_shipment', {}, emailAwaitingShipment);
});

app.post('/api/devis/:id/mark-shipped', requireAuth, async (req, res) => {
  const { carrier, shippingOption, trackingNumber } = req.body || {};
  const extraFields = {
    carrier: carrier || null,
    shippingOption: shippingOption || null,
    trackingNumber: trackingNumber || null,
    shippedAt: Timestamp.now(),
  };
  return updateQuoteStatusAndSendEmail(req, res, 'shipped', extraFields, emailShipped);
});

// Route: Désactiver un carton (soft delete)
app.delete('/api/cartons/:id', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  try {
    const { id } = req.params;

    // Vérifier que le carton appartient bien au compte SaaS
    const cartonDoc = await firestore.collection('cartons').doc(id).get();
    if (!cartonDoc.exists) {
      return res.status(404).json({ error: 'Carton introuvable' });
    }

    if (cartonDoc.data().saasAccountId !== req.saasAccountId) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Vérifier si le carton est utilisé dans un devis
    const quotesSnapshot = await firestore
      .collection('quotes')
      .where('saasAccountId', '==', req.saasAccountId)
      .where('cartonId', '==', id)
      .limit(1)
      .get();

    if (!quotesSnapshot.empty) {
      // Soft delete uniquement
      await firestore.collection('cartons').doc(id).update({
        isActive: false,
        updatedAt: Timestamp.now(),
      });
      console.log(`[Cartons] ⚠️  Carton désactivé (utilisé dans des devis): ${id}`);
      return res.json({ success: true, message: 'Carton désactivé (utilisé dans des devis)' });
    }

    // Suppression réelle si jamais utilisé
    await firestore.collection('cartons').doc(id).delete();
    console.log(`[Cartons] ✅ Carton supprimé définitivement: ${id}`);
    res.json({ success: true, message: 'Carton supprimé avec succès' });
  } catch (error) {
    console.error('[Cartons] Erreur lors de la suppression:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route: Récupérer l'URL de prévisualisation du bordereau (pour "Voir bordereau" sans analyse)
app.get('/api/devis/:id/bordereau-preview', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  if (!req.saasAccountId) return res.status(400).json({ error: 'Compte SaaS non configuré' });
  const devisId = req.params.id;
  try {
    const devisDoc = await firestore.collection('quotes').doc(devisId).get();
    if (!devisDoc.exists) return res.status(404).json({ error: 'Devis non trouvé' });
    const devis = devisDoc.data();
    if (devis.saasAccountId !== req.saasAccountId) return res.status(403).json({ error: 'Accès refusé' });

    let url = null;
    let driveFileId = null;

    if (devis.bordereauId) {
      const bordereauDoc = await firestore.collection('bordereaux').doc(devis.bordereauId).get();
      if (bordereauDoc.exists) {
        const b = bordereauDoc.data();
        driveFileId = b.driveFileId;
        if (b.webViewLink) url = b.webViewLink;
      }
    }
    if (!driveFileId && devis.driveFileIdFromLink) driveFileId = devis.driveFileIdFromLink;

    if (driveFileId && !url) {
      const gs = (await firestore.collection('saasAccounts').doc(req.saasAccountId).get()).data()?.integrations?.googleSheets;
      if (gs?.accessToken) {
        let expiryDate = null;
        if (gs.expiresAt) {
          if (gs.expiresAt?.toDate) expiryDate = gs.expiresAt.toDate().getTime();
          else if (gs.expiresAt instanceof Date) expiryDate = gs.expiresAt.getTime();
          else expiryDate = new Date(gs.expiresAt).getTime();
        }
        const auth = new google.auth.OAuth2(GOOGLE_SHEETS_CLIENT_ID, GOOGLE_SHEETS_CLIENT_SECRET, GOOGLE_SHEETS_REDIRECT_URI);
        auth.setCredentials({ access_token: gs.accessToken, refresh_token: gs.refreshToken, expiry_date: expiryDate });
        const drive = google.drive({ version: 'v3', auth });
        const fileResp = await drive.files.get({ fileId: driveFileId, fields: 'webViewLink' });
        url = fileResp.data.webViewLink || `https://drive.google.com/file/d/${driveFileId}/preview`;
      } else {
        url = `https://drive.google.com/file/d/${driveFileId}/preview`;
      }
    }

    if (!url && devis.bordereauLink) {
      if (devis.bordereauLink.includes('drive.google.com')) {
        const m = devis.bordereauLink.match(/\/file\/d\/([^\/]+)/) || devis.bordereauLink.match(/[?&]id=([^&]+)/);
        if (m) url = `https://drive.google.com/file/d/${m[1]}/preview`;
      } else {
        url = devis.bordereauLink;
      }
    }

    if (!url) return res.status(404).json({ error: 'Aucun bordereau lié à ce devis ou lien non visualisable.' });
    res.json({ url });
  } catch (err) {
    console.error('[API] Erreur bordereau-preview:', err);
    res.status(500).json({ error: err.message });
  }
});

// Route: Rechercher manuellement un bordereau pour un devis spécifique
app.post('/api/devis/:id/search-bordereau', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  const devisId = req.params.id;

  try {
    console.log(`[API] 🔍 Recherche manuelle de bordereau pour devis ${devisId}`);

    // 1. Vérifier que le devis existe et appartient au bon SaaS account
    const devisDoc = await firestore.collection('quotes').doc(devisId).get();
    
    if (!devisDoc.exists) {
      return res.status(404).json({ error: 'Devis non trouvé' });
    }

    const devis = devisDoc.data();
    if (devis.saasAccountId !== req.saasAccountId) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // 2. Vérifier la configuration Google Sheets (pour OAuth token)
    const saasAccountDoc = await firestore.collection('saasAccounts').doc(req.saasAccountId).get();
    const googleSheetsIntegration = saasAccountDoc.data()?.integrations?.googleSheets;
    const googleDriveIntegration = saasAccountDoc.data()?.integrations?.googleDrive;

    if (!googleSheetsIntegration || !googleSheetsIntegration.accessToken) {
      return res.status(400).json({ error: 'Google Sheets non connecté (nécessaire pour accéder à Drive)' });
    }

    if (!googleDriveIntegration || !googleDriveIntegration.connected || !googleDriveIntegration.bordereauxFolderId) {
      return res.status(400).json({ error: 'Dossier Google Drive non configuré' });
    }

    // 3. Configurer OAuth client avec les tokens
    let accessToken = googleSheetsIntegration.accessToken;
    let refreshToken = googleSheetsIntegration.refreshToken;
    let expiresAt = googleSheetsIntegration.expiresAt;

    // Gérer les différents formats de expiresAt
    let expiresAtDate;
    if (expiresAt && typeof expiresAt.toDate === 'function') {
      expiresAtDate = expiresAt.toDate();
    } else if (expiresAt instanceof Date) {
      expiresAtDate = expiresAt;
    } else if (typeof expiresAt === 'string') {
      expiresAtDate = new Date(expiresAt);
    }

    // Vérifier et rafraîchir le token si nécessaire
    if (expiresAtDate && expiresAtDate < new Date()) {
      console.log('[API] 🔄 Token expiré, rafraîchissement...');
      googleSheetsOAuth2Client.setCredentials({
        refresh_token: refreshToken
      });
      const { credentials } = await googleSheetsOAuth2Client.refreshAccessToken();
      accessToken = credentials.access_token;
      
      // Mettre à jour le token dans Firestore
      await firestore.collection('saasAccounts').doc(req.saasAccountId).update({
        'integrations.googleSheets.accessToken': accessToken,
        'integrations.googleSheets.expiresAt': Timestamp.fromDate(new Date(credentials.expiry_date))
      });
    }

    // Configurer le client OAuth
    googleSheetsOAuth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    });

    // 4. Lancer la recherche
    const result = await searchAndLinkBordereauForDevis(
      devisId,
      req.saasAccountId,
      googleSheetsOAuth2Client,
      googleDriveIntegration.bordereauxFolderId
    );

    if (result) {
      console.log(`[API] ✅ Bordereau trouvé et lié pour devis ${devisId}`);
      res.json({ 
        success: true, 
        message: 'Bordereau trouvé et lié avec succès',
        bordereauId: result
      });
    } else {
      console.log(`[API] ⚠️  Aucun bordereau trouvé pour devis ${devisId}`);
      res.json({ 
        success: false, 
        message: 'Aucun bordereau correspondant trouvé dans le dossier Google Drive'
      });
    }
  } catch (error) {
    console.error('[API] Erreur lors de la recherche de bordereau:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route: Traiter un bordereau depuis Google Drive, lien (Drive/Typeform) ou URL directe
// Priorité: 1) bordereauId avec driveFileId (Google Drive) 2) driveFileIdFromLink (lien Drive dans Sheet) 3) bordereauLink (Drive ou Typeform)
app.post('/api/devis/:id/process-bordereau-from-link', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  if (!req.saasAccountId) return res.status(400).json({ error: 'Compte SaaS non configuré' });
  const devisId = req.params.id;
  const forceRetry = !!(req.body && req.body.forceRetry === true);
  console.log(`[OCR] 🚀 ========== DÉMARRAGE ANALYSE OCR ==========`);
  console.log(`[OCR] Devis: ${devisId} | forceRetry: ${forceRetry}`);
  try {
    const devisDoc = await firestore.collection('quotes').doc(devisId).get();
    if (!devisDoc.exists) return res.status(404).json({ error: 'Devis non trouvé' });
    const devis = devisDoc.data();
    if (devis.saasAccountId !== req.saasAccountId) return res.status(403).json({ error: 'Accès refusé' });

    const bordereauLink = devis.bordereauLink && typeof devis.bordereauLink === 'string' ? devis.bordereauLink : null;
    const driveFileIdFromLink = devis.driveFileIdFromLink || null;

    // En dev: désactiver totalement Typeform — retour 200 sans erreur si aucune alternative Drive
    const clientDev = req.get('x-client-dev') === 'true';
    const isLocalhost = (req.get('host') || '').includes('localhost') || (req.get('origin') || '').includes('localhost');
    const isDev = TYPEFORM_DISABLED_IN_DEV || clientDev || isLocalhost;
    if (isDev && bordereauLink && bordereauLink.includes('typeform.com')) {
      let hasDriveAlternative = !!driveFileIdFromLink;
      if (!hasDriveAlternative && devis.bordereauId) {
        const bDoc = await firestore.collection('bordereaux').doc(devis.bordereauId).get();
        hasDriveAlternative = bDoc.exists && !!bDoc.data()?.driveFileId;
      }
      if (!hasDriveAlternative) {
        console.log('[API] Typeform désactivé en dev: source bordereau ignorée (utilisez Google Drive)');
        return res.json({ success: true, skipped: true, typeformDisabled: true, message: 'Typeform désactivé en développement. Utilisez un lien Google Drive dans le Sheet.' });
      }
    }

    // Vérifier qu'on a au moins une source: bordereauId, driveFileIdFromLink, ou bordereauLink
    if (!devis.bordereauId && !driveFileIdFromLink && !bordereauLink) {
      return res.status(400).json({ error: 'Ce devis n\'a pas de lien bordereau. Ajoutez un lien Drive dans le Google Sheet ou connectez Typeform.' });
    }

    // Sauf si forceRetry, ne pas relancer si le bordereau existe déjà et est traité ou en cours
    if (!forceRetry && devis.bordereauId) {
      const bordereauDoc = await firestore.collection('bordereaux').doc(devis.bordereauId).get();
      if (bordereauDoc.exists) {
        const bData = bordereauDoc.data();
        if (bData.ocrStatus === 'completed') {
          const lotsCount = bData.ocrResult?.lots?.length || 0;
          return res.json({ success: true, message: lotsCount > 0 ? 'Bordereau déjà traité' : 'Bordereau traité (0 lot extrait)', alreadyProcessed: true, lotsCount });
        }
        if (bData.ocrStatus === 'processing') {
          return res.json({ success: true, message: 'OCR déjà en cours', alreadyProcessed: false, lotsCount: 0 });
        }
      }
    }

    let bordereauId = devis.bordereauId;
    let useDrive = false;

    // PRIORITÉ 1: bordereauId existe et le document bordereau a driveFileId → utiliser Google Drive (pas de Typeform)
    if (bordereauId) {
      const bordereauDoc = await firestore.collection('bordereaux').doc(bordereauId).get();
      if (bordereauDoc.exists && bordereauDoc.data().driveFileId) {
        useDrive = true;
        if (forceRetry) {
          await firestore.collection('bordereaux').doc(bordereauId).update({
            ocrStatus: 'pending', ocrResult: null, ocrError: null, ocrRawText: null, ocrCompletedAt: null,
            updatedAt: Timestamp.now()
          });
          console.log(`[API] forceRetry: réutilisation du bordereau ${bordereauId} (Drive) pour une nouvelle analyse OCR`);
        }
      }
    }

    // PRIORITÉ 2: driveFileIdFromLink (lien Drive dans le Sheet) → créer bordereau et utiliser Google Drive
    if (!useDrive && driveFileIdFromLink) {
      const saasAccountDoc = await firestore.collection('saasAccounts').doc(req.saasAccountId).get();
      if (!saasAccountDoc.exists) throw new Error('Compte SaaS introuvable');
      const gs = saasAccountDoc.data().integrations?.googleSheets;
      if (!gs || !gs.accessToken) throw new Error('Connectez Google Sheets dans Paramètres → Intégrations pour accéder aux bordereaux du Drive.');
      let expiryDate = null;
      if (gs.expiresAt) {
        if (gs.expiresAt instanceof Timestamp) expiryDate = gs.expiresAt.toDate().getTime();
        else if (gs.expiresAt?.toDate) expiryDate = gs.expiresAt.toDate().getTime();
        else if (gs.expiresAt instanceof Date) expiryDate = gs.expiresAt.getTime();
        else expiryDate = new Date(gs.expiresAt).getTime();
      }
      const auth = new google.auth.OAuth2(GOOGLE_SHEETS_CLIENT_ID, GOOGLE_SHEETS_CLIENT_SECRET, GOOGLE_SHEETS_REDIRECT_URI);
      auth.setCredentials({ access_token: gs.accessToken, refresh_token: gs.refreshToken, expiry_date: expiryDate });
      const drive = google.drive({ version: 'v3', auth });
      const fileResp = await drive.files.get({
        fileId: driveFileIdFromLink,
        fields: 'id, name, mimeType, size, webViewLink'
      });
      const bordereauFile = { id: fileResp.data.id, name: fileResp.data.name, mimeType: fileResp.data.mimeType || 'application/pdf', size: fileResp.data.size, webViewLink: fileResp.data.webViewLink };
      console.log(`[OCR] 📂 Source: Lien Drive du Sheet (driveFileIdFromLink) — création bordereau puis OCR`);
      bordereauId = await linkBordereauToDevis(devisId, bordereauFile, 'drive_link', req.saasAccountId);
      if (bordereauId) {
        console.log(`[OCR] ⏳ Bordereau créé (${bordereauFile.name}) — OCR lancé en arrière-plan`);
        return res.json({ success: true, message: 'Bordereau analysé depuis Google Drive', bordereauId });
      }
    }

    // PRIORITÉ 3: Si on a bordereauId avec driveFileId, lancer l'OCR sans télécharger (triggerOCRForBordereau utilise Drive)
    if (useDrive && bordereauId) {
      console.log(`[OCR] 📂 Source: Google Drive (bordereauId: ${bordereauId}) — téléchargement puis OCR`);
      await firestore.collection('quotes').doc(devisId).update({
        status: 'bordereau_linked', updatedAt: Timestamp.now(),
        timeline: FieldValue.arrayUnion({
          id: `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          date: Timestamp.now(), status: 'bordereau_linked',
          description: 'Bordereau analysé depuis Google Drive'
        })
      });
      console.log(`[OCR] ⏳ Lancement OCR en arrière-plan (bordereauId: ${bordereauId})...`);
      triggerOCRForBordereau(bordereauId, req.saasAccountId).catch(err => console.error('[API] Erreur OCR (Drive):', err));
      return res.json({ success: true, message: 'Bordereau analysé depuis Google Drive', bordereauId });
    }

    // PRIORITÉ 4: bordereauLink (Drive ou Typeform) - nécessite téléchargement
    if (!bordereauLink) {
      return res.status(400).json({ error: 'Aucune source de bordereau disponible. Ajoutez un lien Drive dans le Google Sheet ou un lien bordereau.' });
    }

    console.log(`[OCR] 📂 Source: URL/lien (${bordereauLink.substring(0, 60)}...) — téléchargement puis OCR`);
    const { buffer, mimeType } = await downloadFileFromUrl(bordereauLink, req.saasAccountId);
    const fileName = devis.bordereauFileName || bordereauLink.split('/').pop() || 'bordereau.pdf';
    if (forceRetry && bordereauId) {
      const bordereauDoc = await firestore.collection('bordereaux').doc(bordereauId).get();
      if (bordereauDoc.exists) {
        await firestore.collection('bordereaux').doc(bordereauId).update({
          ocrStatus: 'pending', ocrResult: null, ocrError: null, ocrRawText: null, ocrCompletedAt: null,
          mimeType: mimeType || 'application/pdf', updatedAt: Timestamp.now()
        });
        console.log(`[API] forceRetry: réutilisation du bordereau ${bordereauId} pour une nouvelle analyse OCR`);
      }
    }
    if (!bordereauId) {
      const bordereauRef = await firestore.collection('bordereaux').add({
        saasAccountId: req.saasAccountId, devisId, sourceType: 'url', sourceUrl: bordereauLink,
        driveFileId: null, driveFileName: fileName, mimeType: mimeType || 'application/pdf',
        linkedAt: Timestamp.now(), linkedBy: 'url_fetch', linkMethod: 'url', ocrStatus: 'pending',
        createdAt: Timestamp.now(), updatedAt: Timestamp.now()
      });
      bordereauId = bordereauRef.id;
      await firestore.collection('quotes').doc(devisId).update({
        bordereauId, status: 'bordereau_linked', updatedAt: Timestamp.now(),
        timeline: FieldValue.arrayUnion({
          id: `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          date: Timestamp.now(), status: 'bordereau_linked',
          description: bordereauLink.includes('drive.google.com') ? 'Bordereau traité depuis Google Drive' : 'Bordereau traité depuis le lien'
        })
      });
    } else {
      await firestore.collection('quotes').doc(devisId).update({
        status: 'bordereau_linked', updatedAt: Timestamp.now(),
        timeline: FieldValue.arrayUnion({
          id: `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          date: Timestamp.now(), status: 'bordereau_linked',
          description: 'Relance de l\'analyse du bordereau (forceRetry)'
        })
      });
    }
    console.log(`[OCR] ⏳ Lancement OCR en arrière-plan (bordereauId: ${bordereauId})...`);
    triggerOCRForBordereau(bordereauId, req.saasAccountId, { preDownloadedBuffer: buffer, mimeType: mimeType || 'application/pdf' }).catch(err => console.error('[API] Erreur OCR après fetch URL:', err));
    res.json({ success: true, message: forceRetry ? 'Relance de l\'analyse OCR en cours' : 'Bordereau téléchargé et analyse OCR lancée', bordereauId });
  } catch (error) {
    if (error.message === 'TYPEFORM_DISABLED_IN_DEV') {
      console.log('[API] Typeform désactivé en dev (depuis downloadFileFromUrl)');
      return res.json({ success: true, skipped: true, typeformDisabled: true, message: 'Typeform désactivé en développement. Utilisez un lien Google Drive dans le Sheet.' });
    }
    console.error('[API] Erreur traitement bordereau depuis lien:', error);
    res.status(500).json({ error: error.message });
  }
});

async function downloadFileFromUrl(url, saasAccountId) {
  if (!url || !url.startsWith('http')) throw new Error('URL invalide');
  let fetchUrl = url;
  if (url.includes('drive.google.com/file/d/')) {
    const m = url.match(/\/file\/d\/([^\/]+)/);
    if (m) fetchUrl = `https://drive.google.com/uc?export=download&id=${m[1]}`;
  } else if (url.includes('drive.google.com/open?id=')) {
    const m = url.match(/[?&]id=([^&]+)/);
    if (m) fetchUrl = `https://drive.google.com/uc?export=download&id=${m[1]}`;
  }
  const headers = {};
  if (url.includes('typeform.com')) {
    if (TYPEFORM_DISABLED_IN_DEV) {
      throw new Error('TYPEFORM_DISABLED_IN_DEV');
    }
    let typeformToken = null;
    if (saasAccountId && firestore) {
      const saasDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
      const typeform = saasDoc.exists ? saasDoc.data()?.integrations?.typeform : null;
      typeformToken = typeform?.accessToken || null;
    }
    if (!typeformToken && process.env.TYPEFORM_ACCESS_TOKEN) {
      typeformToken = process.env.TYPEFORM_ACCESS_TOKEN;
    }
    if (typeformToken) {
      headers['Authorization'] = `Bearer ${typeformToken}`;
    } else {
      throw new Error('Connectez votre compte Typeform dans Paramètres → Intégrations pour télécharger les bordereaux.');
    }
  }
  console.log(`[Download] Téléchargement depuis: ${fetchUrl.substring(0, 100)}...`);
  const response = await fetch(fetchUrl, { headers, redirect: 'follow' });
  if (!response.ok) throw new Error(`Échec téléchargement (${response.status}): ${response.statusText} - URL: ${fetchUrl.substring(0, 100)}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  let mimeType = response.headers.get('content-type') || 'application/octet-stream';
  if (mimeType.includes(';')) mimeType = mimeType.split(';')[0].trim();
  if (buffer.length < 100) throw new Error(`Fichier téléchargé trop petit ou vide (${buffer.length} bytes)`);

  // Vérifier la signature (magic bytes) du fichier pour détecter le vrai type
  const magic = buffer.slice(0, 8).toString('hex');
  const firstBytes = buffer.slice(0, 5).toString('ascii');
  console.log(`[Download] Fichier reçu: ${buffer.length} bytes, mimeType: ${mimeType}, magic: ${magic}`);

  if (mimeType.startsWith('text/html') || mimeType.startsWith('application/xhtml')) {
    const hint = fetchUrl.includes('api.typeform.com')
      ? ' Connectez votre compte Typeform dans Paramètres → Intégrations si ce n\'est pas déjà fait.'
      : ' URL potentiellement expirée ou authentification requise.';
    throw new Error(`Le fichier téléchargé est du HTML, pas un PDF.${hint}`);
  }

  const isPdf = firstBytes.startsWith('%PDF');
  const isJpeg = magic.startsWith('ffd8ff');
  const isPng = magic.startsWith('89504e47');
  const isGif = magic.startsWith('47494638');

  if (!isPdf && !isJpeg && !isPng && !isGif) {
    console.error(`[Download] ⚠️ Contenu non reconnu: magic=${magic}, mimeType=${mimeType}, taille=${buffer.length}`);
    const hint = fetchUrl.includes('api.typeform.com')
      ? ' Connectez votre compte Typeform dans Paramètres → Intégrations pour télécharger les bordereaux.'
      : '';
    throw new Error(`Format de fichier non reconnu. Le fichier n'est pas un PDF ou une image valide.${hint}`);
  }

  // Corriger le mimeType si nécessaire selon les magic bytes réels
  if (isPdf && !mimeType.includes('pdf')) mimeType = 'application/pdf';
  else if (isJpeg && !mimeType.startsWith('image/')) mimeType = 'image/jpeg';
  else if (isPng && !mimeType.startsWith('image/')) mimeType = 'image/png';
  else if (isGif && !mimeType.startsWith('image/')) mimeType = 'image/gif';

  console.log(`[Download] ✅ Fichier validé: ${buffer.length} bytes, type final: ${mimeType}`);
  return { buffer, mimeType };
}

// Route: Re-calculer un devis à partir de son bordereau existant
app.post('/api/devis/:id/recalculate', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  const devisId = req.params.id;

  try {
    console.log(`[API] 🔄 Re-calcul du devis ${devisId}`);

    // 1. Vérifier que le devis existe et appartient au bon SaaS account
    const devisDoc = await firestore.collection('quotes').doc(devisId).get();
    
    if (!devisDoc.exists) {
      return res.status(404).json({ error: 'Devis non trouvé' });
    }

    const devis = devisDoc.data();
    if (devis.saasAccountId !== req.saasAccountId) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // 2. Vérifier qu'un bordereau est lié
    if (!devis.bordereauId) {
      return res.status(400).json({ error: 'Aucun bordereau lié à ce devis' });
    }

    // 3. Récupérer le bordereau
    const bordereauDoc = await firestore.collection('bordereaux').doc(devis.bordereauId).get();
    
    if (!bordereauDoc.exists) {
      return res.status(404).json({ error: 'Bordereau non trouvé' });
    }

    const bordereau = bordereauDoc.data();

    // 4. Vérifier que l'OCR est terminé
    if (bordereau.ocrStatus !== 'completed' || !bordereau.ocrResult) {
      return res.status(400).json({ error: 'OCR non terminé pour ce bordereau' });
    }

    // 5. Re-déclencher le calcul avec les données OCR
    await calculateDevisFromOCR(devisId, bordereau.ocrResult, req.saasAccountId);

    console.log(`[API] ✅ Devis ${devisId} re-calculé avec succès`);

    return res.json({ 
      success: true, 
      message: 'Devis re-calculé avec succès',
      devisId: devisId
    });

  } catch (error) {
    console.error('[API] Erreur re-calcul devis:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Route: Tenter la génération automatique du lien de paiement (appelée par le frontend quand packaging+shipping sont calculés)
app.post('/api/devis/:id/try-auto-payment', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  if (!req.saasAccountId) return res.status(400).json({ error: 'Compte SaaS non configuré' });

  const devisId = req.params.id;

  try {
    const devisDoc = await firestore.collection('quotes').doc(devisId).get();
    if (!devisDoc.exists) return res.status(404).json({ error: 'Devis non trouvé' });

    const devis = devisDoc.data();
    if (devis.saasAccountId !== req.saasAccountId) return res.status(403).json({ error: 'Accès refusé' });

    const packagingPrice = devis.options?.packagingPrice ?? devis.packagingPrice ?? 0;
    const shippingPrice = devis.options?.shippingPrice ?? devis.shippingPrice ?? 0;
    const insuranceAmount = devis.options?.insuranceAmount ?? 0;
    const clientWantsInsurance = devis.options?.insurance === true;
    const insuranceOk = !clientWantsInsurance || (clientWantsInsurance && insuranceAmount > 0);
    const totalAmount = packagingPrice + shippingPrice + insuranceAmount;

    const hasPackagingAndShipping = packagingPrice > 0 && shippingPrice > 0;
    const shouldGenerate = hasPackagingAndShipping && insuranceOk && totalAmount > 0;

    if (!shouldGenerate) {
      return res.json({
        generated: false,
        reason: !hasPackagingAndShipping
          ? 'emballage et/ou expédition manquants'
          : !insuranceOk
            ? 'assurance demandée mais non calculée'
            : 'total = 0',
      });
    }

    // Si regenerate=true (réanalyse bordereau), annuler les anciens liens avant de créer le nouveau
    const { regenerate } = req.body || {};
    if (regenerate) {
      await cancelPrincipalPaymentLinksForDevis(firestore, devisId, stripe);
      // Recharger le devis pour avoir paymentLinks à jour
      const freshDevisDoc = await firestore.collection('quotes').doc(devisId).get();
      if (freshDevisDoc.exists) {
        Object.assign(devis, freshDevisDoc.data());
      }
    }

    const existingPaiements = await firestore
      .collection('paiements')
      .where('devisId', '==', devisId)
      .where('type', '==', 'PRINCIPAL')
      .where('status', '!=', 'CANCELLED')
      .limit(1)
      .get();

    if (!existingPaiements.empty) {
      return res.json({ generated: false, reason: 'Un paiement PRINCIPAL existe déjà' });
    }

    // Vérifier qu'aucun lien actif n'existe déjà (évite triple génération en cas d'appels concurrents)
    const existingLinks = devis.paymentLinks || [];
    const hasActiveLink = existingLinks.some((l) => (l?.status === 'active' || l?.status === 'pending'));
    if (hasActiveLink) {
      return res.json({ generated: false, reason: 'Un lien de paiement actif existe déjà' });
    }

    const saasAccountDoc = await firestore.collection('saasAccounts').doc(req.saasAccountId).get();
    if (!saasAccountDoc.exists) return res.status(404).json({ error: 'Compte SaaS non trouvé' });

    const saasAccount = saasAccountDoc.data();
    const stripeAccountId = saasAccount.integrations?.stripe?.stripeAccountId;
    const paymentConfig = await getPaymentProviderConfig(firestore, req.saasAccountId);
    const usePaytweak = paymentConfig?.hasCustomPaytweak && paymentConfig?.paymentProvider === 'paytweak' && paymentConfig?.paytweakConfigured;

    const clientName = devis.client?.name || 'Client';
    const bordereauNumber = devis.auctionSheet?.bordereauNumber || '';
    const auctionHouse = devis.lot?.auctionHouse || devis.auctionSheet?.auctionHouse || '';
    const description = [clientName, bordereauNumber, auctionHouse].filter(Boolean).join(' | ') || `Devis ${devis.reference || devisId} - PRINCIPAL`;

    const baseUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'https://staging.mbe-sdv.fr';

    if (usePaytweak) {
      const paytweakResult = await createPaytweakLinkForAccount(firestore, req.saasAccountId, {
        amount: totalAmount,
        currency: 'EUR',
        reference: devis.reference || devisId,
        description,
        customer: { name: devis.client?.name || '', email: devis.client?.email || '', phone: devis.client?.phone || '' },
        devisId,
        quote: devis,
      }, baseUrl);
      const paiementRef = firestore.collection('paiements').doc();
      try {
        await firestore.runTransaction(async (t) => {
          const freshDevis = await t.get(firestore.collection('quotes').doc(devisId));
          const freshLinks = (freshDevis.data()?.paymentLinks || []);
          if (freshLinks.some((l) => l?.status === 'active' || l?.status === 'pending')) {
            throw new Error('Lien actif déjà présent');
          }
          const paiementsSnap = await t.get(firestore.collection('paiements').where('devisId', '==', devisId).where('type', '==', 'PRINCIPAL').limit(1));
          const hasNonCancelled = paiementsSnap.docs.some((d) => d.data().status !== 'CANCELLED');
          if (hasNonCancelled) throw new Error('Paiement PRINCIPAL déjà existant');
          t.set(paiementRef, {
            devisId, amount: totalAmount, type: 'PRINCIPAL', status: 'PENDING',
            url: paytweakResult.url, saasAccountId: req.saasAccountId, paymentProvider: 'paytweak',
            createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
          });
          t.update(firestore.collection('quotes').doc(devisId), {
            paymentLinks: FieldValue.arrayUnion({ id: paiementRef.id, url: paytweakResult.url, amount: totalAmount, createdAt: new Date().toISOString(), status: 'active' }),
            status: 'awaiting_payment',
            timeline: FieldValue.arrayUnion({ id: `tl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, date: Timestamp.now(), status: 'calculated', description: `Lien Paytweak généré automatiquement (${totalAmount}€)`, user: 'Système Automatisé' }),
            updatedAt: Timestamp.now(),
          });
        });
      } catch (txErr) {
        if (txErr.message?.includes('Lien actif') || txErr.message?.includes('déjà existant')) {
          return res.json({ generated: false, reason: txErr.message });
        }
        throw txErr;
      }
      console.log(`[API] ✅ Lien Paytweak auto-généré (try-auto-payment): ${paytweakResult.url}`);
      return res.json({ generated: true, url: paytweakResult.url, paiementId: paiementRef.id });
    }

    if (!stripeAccountId || !stripe) {
      return res.json({ generated: false, reason: 'Stripe non connecté ou non configuré' });
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{ price_data: { currency: 'eur', product_data: { name: description }, unit_amount: Math.round(totalAmount * 100) }, quantity: 1 }],
        success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/payment/cancel`,
        metadata: { devisId, paiementType: 'PRINCIPAL', saasAccountId: req.saasAccountId },
      },
      { stripeAccount: stripeAccountId }
    );

    const paiementRef = firestore.collection('paiements').doc();
    try {
      await firestore.runTransaction(async (t) => {
        const freshDevis = await t.get(firestore.collection('quotes').doc(devisId));
        const freshLinks = (freshDevis.data()?.paymentLinks || []);
        if (freshLinks.some((l) => l?.status === 'active' || l?.status === 'pending')) {
          throw new Error('Lien actif déjà présent');
        }
        const paiementsSnap = await t.get(firestore.collection('paiements').where('devisId', '==', devisId).where('type', '==', 'PRINCIPAL').limit(1));
        const hasNonCancelled = paiementsSnap.docs.some((d) => d.data().status !== 'CANCELLED');
        if (hasNonCancelled) throw new Error('Paiement PRINCIPAL déjà existant');
        t.set(paiementRef, {
          devisId, stripeSessionId: session.id, stripeAccountId, amount: totalAmount,
          type: 'PRINCIPAL', status: 'PENDING', url: session.url, saasAccountId: req.saasAccountId,
          createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
        });
        t.update(firestore.collection('quotes').doc(devisId), {
          paymentLinks: FieldValue.arrayUnion({ id: paiementRef.id, url: session.url, amount: totalAmount, createdAt: new Date().toISOString(), status: 'active' }),
          status: 'awaiting_payment',
          timeline: FieldValue.arrayUnion({ id: `tl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, date: Timestamp.now(), status: 'calculated', description: `Lien de paiement généré automatiquement (${totalAmount}€)`, user: 'Système Automatisé' }),
          updatedAt: Timestamp.now(),
        });
      });
    } catch (txErr) {
      if (txErr.message?.includes('Lien actif') || txErr.message?.includes('déjà existant')) {
        return res.json({ generated: false, reason: txErr.message });
      }
      throw txErr;
    }

    console.log(`[API] ✅ Lien de paiement auto-généré (try-auto-payment): ${session.url}`);
    return res.json({ generated: true, url: session.url, paiementId: paiementRef.id });
  } catch (err) {
    console.error('[API] Erreur try-auto-payment:', err);
    return res.status(500).json({ error: err.message || 'Erreur lors de la génération du lien' });
  }
});

// Route: Forcer la resynchronisation
app.post('/api/google-sheets/resync', requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  try {
    // Déclencher la synchronisation immédiatement
    const saasAccountRef = firestore.collection('saasAccounts').doc(req.saasAccountId);
    const saasAccountDoc = await saasAccountRef.get();
    
    if (!saasAccountDoc.exists) {
      return res.status(404).json({ error: 'Compte SaaS non trouvé' });
    }

    const saasAccountData = saasAccountDoc.data();
    const googleSheetsIntegration = saasAccountData.integrations?.googleSheets;

    if (!googleSheetsIntegration || !googleSheetsIntegration.connected) {
      return res.status(400).json({ error: 'Google Sheets non connecté' });
    }

    // Lancer la synchronisation en arrière-plan
    syncSheetForAccount(req.saasAccountId, googleSheetsIntegration).catch(error => {
      console.error('[Google Sheets Sync] Erreur lors de la resync manuelle:', error);
    });

    res.json({ success: true, message: 'Synchronisation lancée' });
  } catch (error) {
    console.error('[API] Erreur lors de la resynchronisation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mapping par défaut des colonnes Google Sheet (index 0-based) - rétrocompatibilité
const DEFAULT_COLUMN_MAPPING = {
  clientFirstName: 0,
  clientLastName: 1,
  clientPhone: 2,
  clientEmail: 3,
  clientAddress: 4,
  clientAddressComplement: 5,
  clientCity: 6,
  clientState: 7,
  clientZip: 8,
  clientCountry: 9,
  receiverAnswer: 10,
  receiverAddress: 11,
  receiverAddressComplement: 12,
  receiverCity: 13,
  receiverState: 14,
  receiverZip: 15,
  receiverCountry: 16,
  receiverFirstName: 17,
  receiverLastName: 18,
  receiverPhone: 19,
  receiverEmail: 20,
  upsAccessPoint: 21,
  bordereau: 25,
  usefulInfo: 23,
  wantsInsurance: 24,
  submittedAt: 26,
  token: 27,
  wantsProfessionalInvoice: 28
};

// Fonction: Synchroniser un Google Sheet pour un compte SaaS
async function syncSheetForAccount(saasAccountId, googleSheetsIntegration) {
  if (!firestore || !googleSheetsOAuth2Client) return;

  try {
    // Reconstruire les tokens pour OAuth2
    // Gérer expiresAt qui peut être un Timestamp Firestore ou une Date
    let expiryDate = null;
    if (googleSheetsIntegration.expiresAt) {
      if (googleSheetsIntegration.expiresAt instanceof Timestamp) {
        expiryDate = googleSheetsIntegration.expiresAt.toDate().getTime();
      } else if (googleSheetsIntegration.expiresAt.toDate) {
        // Timestamp Firestore avec méthode toDate
        expiryDate = googleSheetsIntegration.expiresAt.toDate().getTime();
      } else if (googleSheetsIntegration.expiresAt instanceof Date) {
        expiryDate = googleSheetsIntegration.expiresAt.getTime();
      } else {
        // String ou number
        expiryDate = new Date(googleSheetsIntegration.expiresAt).getTime();
      }
    }
    
    const tokens = {
      access_token: googleSheetsIntegration.accessToken,
      refresh_token: googleSheetsIntegration.refreshToken,
      expiry_date: expiryDate
    };

    const auth = new google.auth.OAuth2(
      GOOGLE_SHEETS_CLIENT_ID,
      GOOGLE_SHEETS_CLIENT_SECRET,
      GOOGLE_SHEETS_REDIRECT_URI
    );
    auth.setCredentials(tokens);

    const sheets = google.sheets({ version: 'v4', auth });

    // Récupérer le mapping des colonnes (personnalisé ou défaut)
    const columnMapping = { ...DEFAULT_COLUMN_MAPPING, ...(googleSheetsIntegration.columnMapping || {}) };

    // CRITIQUE: Utiliser spreadsheets.get() avec includeGridData pour obtenir les hyperliens
    // Les bordereaux Typeform sont des liens cliquables dans les cellules
    // A2:ZZ pour supporter les colonnes supplémentaires (ex: facture professionnelle)
    const response = await sheets.spreadsheets.get({
      spreadsheetId: googleSheetsIntegration.spreadsheetId,
      includeGridData: true,
      ranges: ['A2:ZZ']
    });

    // Extraire les données avec métadonnées complètes
    const sheet = response.data.sheets?.[0];
    if (!sheet || !sheet.data || !sheet.data[0] || !sheet.data[0].rowData) {
      console.log('[Google Sheets Sync] Aucune donnée trouvée dans le sheet');
      return;
    }

    const rowData = sheet.data[0].rowData || [];
    
    // Convertir rowData en format rows (compatible avec le code existant)
    const rows = rowData.map(row => {
      if (!row.values) return [];
      return row.values.map(cell => {
        // Extraire la valeur formatée (texte affiché)
        const formattedValue = cell.formattedValue || '';
        // Extraire l'hyperlien si présent (CRITIQUE pour bordereaux)
        const hyperlink = cell.hyperlink || null;
        
        // Si c'est un lien, retourner un objet avec les deux
        if (hyperlink) {
          return { text: formattedValue, hyperlink: hyperlink };
        }
        // Sinon, retourner juste le texte (compatible avec le code existant)
        return formattedValue;
      });
    });
    const lastRowImported = googleSheetsIntegration.lastRowImported || 1;
    // startIndex = index dans le tableau rows (0-indexed)
    // Si lastRowImported = 1, on commence à l'index 0 (ligne 2 du sheet)
    // Si lastRowImported = 5, on commence à l'index 4 (ligne 6 du sheet)
    const startIndex = Math.max(0, lastRowImported - 1);

    let newDevisCount = 0;

    // Feature flags: vérifier la limite de devis pour le plan
    let remainingQuotes = Infinity;
    try {
      const saasAccountDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
      const saasData = saasAccountDoc.exists ? saasAccountDoc.data() : {};
      const rawPlan = saasData.planId || saasData.plan || 'starter';
      const planId = ['free', 'basic'].includes(rawPlan) ? 'starter' : rawPlan;
      const planDoc = await firestore.collection('plans').doc(planId).get();
      const plan = planDoc.exists ? planDoc.data() : null;
      const maxQuotes = plan?.limits?.quotesPerYear ?? 200;
      const used = saasData.usage?.quotesUsedThisYear ?? 0;
      remainingQuotes = maxQuotes === -1 ? Infinity : Math.max(0, maxQuotes - used);
    } catch (limitErr) {
      console.warn('[Google Sheets Sync] ⚠️  Vérification limite plan ignorée:', limitErr.message);
    }

    // Traiter uniquement les nouvelles lignes
    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i];
      
      // Ignorer les lignes vides
      if (!row || row.length === 0 || !row[0]) {
        console.log(`[Google Sheets Sync] Ligne ${i + 2} ignorée (ligne vide)`);
        continue;
      }

      // Helper pour extraire la valeur d'une cellule (texte ou objet avec hyperlink)
      const getCellValue = (cell) => {
        if (!cell) return '';
        if (typeof cell === 'object' && cell.text !== undefined) {
          return cell.text?.trim() || '';
        }
        return cell.toString().trim();
      };
      const getMappedValue = (field) => {
        const idx = columnMapping[field];
        if (idx == null || idx < 0) return '';
        return getCellValue(row[idx]);
      };
      const getMappedCell = (field) => {
        const idx = columnMapping[field];
        if (idx == null || idx < 0) return null;
        return row[idx];
      };
      
      // Informations client (expéditeur) - via mapping configurable
      const clientFirstName = getMappedValue('clientFirstName');
      const clientLastName = getMappedValue('clientLastName');
      const clientPhone = getMappedValue('clientPhone');
      const clientEmail = getMappedValue('clientEmail');
      const clientAddress = getMappedValue('clientAddress');
      const clientAddressComplement = getMappedValue('clientAddressComplement');
      const clientCity = getMappedValue('clientCity');
      const clientState = getMappedValue('clientState');
      const clientZip = getMappedValue('clientZip');
      const clientCountry = getMappedValue('clientCountry');
      
      // Vérifier si le client est le destinataire
      const receiverAnswer = getMappedValue('receiverAnswer');
      const isClientReceiver = receiverAnswer.toLowerCase() === 'oui' || receiverAnswer.toLowerCase() === 'yes';
      const isUpsAccessPoint = receiverAnswer.toLowerCase().includes('point relais') || 
                                receiverAnswer.toLowerCase().includes('access point') ||
                                receiverAnswer.toLowerCase().includes('ups');
      
      const upsAccessPoint = getMappedValue('upsAccessPoint');
      
      // Informations destinataire
      let receiverFirstName = '';
      let receiverLastName = '';
      let receiverPhone = '';
      let receiverEmail = '';
      let receiverAddress = '';
      let receiverAddressComplement = '';
      let receiverCity = '';
      let receiverState = '';
      let receiverZip = '';
      let receiverCountry = '';
      
      if (isClientReceiver) {
        receiverFirstName = clientFirstName;
        receiverLastName = clientLastName;
        receiverPhone = clientPhone;
        receiverEmail = clientEmail;
        receiverAddress = clientAddress;
        receiverAddressComplement = clientAddressComplement;
        receiverCity = clientCity;
        receiverState = clientState;
        receiverZip = clientZip;
        receiverCountry = clientCountry;
      } else if (isUpsAccessPoint && upsAccessPoint) {
        receiverFirstName = clientFirstName;
        receiverLastName = clientLastName;
        receiverPhone = clientPhone;
        receiverEmail = clientEmail;
        receiverAddress = upsAccessPoint;
        receiverAddressComplement = '';
        receiverCity = '';
        receiverState = '';
        receiverZip = '';
        receiverCountry = '';
      } else {
        receiverAddress = getMappedValue('receiverAddress');
        receiverAddressComplement = getMappedValue('receiverAddressComplement');
        receiverCity = getMappedValue('receiverCity');
        receiverState = getMappedValue('receiverState');
        receiverZip = getMappedValue('receiverZip');
        receiverCountry = getMappedValue('receiverCountry');
        receiverFirstName = getMappedValue('receiverFirstName');
        receiverLastName = getMappedValue('receiverLastName');
        receiverPhone = getMappedValue('receiverPhone');
        receiverEmail = getMappedValue('receiverEmail');
      }
      
      // Bordereau - CRITIQUE: Extraire le lien Google Drive si présent (via mapping)
      const bordereauCell = getMappedCell('bordereau');
      let bordereauInfo = '';
      let bordereauLink = null;
      let driveFileIdFromLink = null;
      let bordereauFileName = null;
      
      if (typeof bordereauCell === 'object' && bordereauCell !== null) {
        bordereauInfo = bordereauCell.text?.trim() || '';
        bordereauLink = bordereauCell.hyperlink || null;
      } else {
        bordereauInfo = (bordereauCell || '').toString().trim();
        // Si c'est une URL directe, l'utiliser comme bordereauLink
        if (bordereauInfo.startsWith('http')) {
          bordereauLink = bordereauInfo;
        }
      }
      
      // Extraire le nom du fichier et l'ID Drive depuis le lien
      if (bordereauLink) {
        console.log(`[Google Sheets Sync] 🔗 Bordereau link trouvé (col Z, index 25): ${bordereauLink}`);
        
        // Format Typeform: https://api.typeform.com/responses/files/{hash}/{filename}
        // Format Google Drive: https://drive.google.com/file/d/{fileId}/view
        // Format Google Drive (open): https://drive.google.com/open?id={fileId}
        
        // Extraire le nom du fichier depuis l'URL Typeform
        if (bordereauLink.includes('api.typeform.com/responses/files/')) {
          const parts = bordereauLink.split('/');
          bordereauFileName = parts[parts.length - 1]; // Dernier segment = nom du fichier
          bordereauFileName = decodeURIComponent(bordereauFileName); // Décoder les caractères spéciaux
          console.log(`[Google Sheets Sync] 📄 Nom du fichier extrait: ${bordereauFileName}`);
        }
        
        // Essayer d'extraire l'ID Drive depuis différents formats
        if (bordereauLink.includes('drive.google.com/file/d/')) {
          const match = bordereauLink.match(/\/file\/d\/([^\/]+)/);
          driveFileIdFromLink = match ? match[1] : null;
        } else if (bordereauLink.includes('drive.google.com/open?id=')) {
          const match = bordereauLink.match(/[?&]id=([^&]+)/);
          driveFileIdFromLink = match ? match[1] : null;
        }
      } else {
        console.log(`[Google Sheets Sync] ⚠️  Aucun lien bordereau trouvé pour ligne ${i + 2} (col Z, index 25)`);
      }
      
      const usefulInfo = getMappedValue('usefulInfo');
      const insuranceAnswer = getMappedValue('wantsInsurance');
      const wantsInsurance = insuranceAnswer.toLowerCase() === 'oui' || insuranceAnswer.toLowerCase() === 'yes';
      const submittedAt = getMappedValue('submittedAt');
      const token = getMappedValue('token');
      
      // Facture professionnelle (Oui/Yes → true)
      let wantsProfessionalInvoiceVal = null;
      const factureProRaw = getMappedValue('wantsProfessionalInvoice');
      if (factureProRaw && (factureProRaw.toLowerCase() === 'oui' || factureProRaw.toLowerCase() === 'yes')) {
        wantsProfessionalInvoiceVal = true;
      } else if (factureProRaw && (factureProRaw.toLowerCase() === 'non' || factureProRaw.toLowerCase() === 'no')) {
        wantsProfessionalInvoiceVal = false;
      }
      
      // Si pas de token, utiliser Submitted At comme fallback
      const externalId = token || submittedAt || `row-${i + 2}`; // Fallback sur numéro de ligne si rien

      // Construire le nom complet du client
      const clientName = `${clientFirstName} ${clientLastName}`.trim();
      
      // Construire l'adresse complète du client
      const clientFullAddress = [
        clientAddress,
        clientAddressComplement,
        `${clientZip} ${clientCity}`.trim(),
        clientState,
        clientCountry
      ].filter(Boolean).join(', ');

      // Ignorer si les données essentielles manquent
      if (!clientName && !clientEmail) {
        console.log(`[Google Sheets Sync] Ligne ${i + 2} ignorée (données manquantes: nom ou email client)`);
        continue;
      }
      
      // Construire le nom complet du destinataire
      const receiverName = `${receiverFirstName} ${receiverLastName}`.trim() || clientName;
      
      // Construire l'adresse complète du destinataire
      let receiverFullAddress = '';
      if (isUpsAccessPoint && upsAccessPoint) {
        // Pour le point relais UPS, l'adresse complète est directement dans upsAccessPoint
        receiverFullAddress = upsAccessPoint;
      } else {
        // Pour les autres cas, construire l'adresse normalement
        receiverFullAddress = [
          receiverAddress,
          receiverAddressComplement,
          `${receiverZip} ${receiverCity}`.trim(),
          receiverState,
          receiverCountry
        ].filter(Boolean).join(', ') || clientFullAddress;
      }

      // ANTI-DOUBLON AMÉLIORÉ: Utiliser une clé unique composée
      // Format: saasAccountId::spreadsheetId::externalId
      const sheetRowIndex = i + 2; // +2 car on commence à la ligne 2 (ligne 1 = headers)
      const uniqueKey = `${saasAccountId}::${googleSheetsIntegration.spreadsheetId}::${externalId}`;
      
      // Vérifier si un devis existe déjà avec cette clé unique
      const existingDevis = await firestore.collection('quotes')
        .where('saasAccountId', '==', saasAccountId)
        .where('uniqueKey', '==', uniqueKey)
        .limit(1)
        .get();

      if (!existingDevis.empty) {
        console.log(`[Google Sheets Sync] Devis déjà importé (uniqueKey: ${uniqueKey}), ignoré`);
        continue;
      }

      // Créer un nouveau devis avec la structure complète Quote
      const quoteData = {
        saasAccountId: saasAccountId, // CRITIQUE: Isolation par compte SaaS
        source: 'google_sheet',
        sheetRowIndex: sheetRowIndex, // 1-indexed (ligne 1 = headers)
        externalId: externalId, // Token Typeform ou Submitted At pour détection doublons
        uniqueKey: uniqueKey, // Clé unique pour anti-doublon: saasAccountId::spreadsheetId::externalId
        submittedAt: submittedAt, // Date de soumission Typeform
        bordereauLink: bordereauLink, // Lien Typeform vers le bordereau (si présent)
        driveFileIdFromLink: driveFileIdFromLink, // ID du fichier Drive extrait du lien (si possible)
        bordereauFileName: bordereauFileName || bordereauInfo || null, // Nom du fichier bordereau extrait de l'URL
        
        // Informations client (expéditeur)
        client: {
          name: clientName,
          email: clientEmail,
          phone: clientPhone,
          address: clientFullAddress
        },
        
        // Informations de livraison
        delivery: {
          mode: isUpsAccessPoint && upsAccessPoint ? 'pickup' : (isClientReceiver ? 'client' : 'receiver'),
          contact: {
            name: receiverName,
            email: receiverEmail || clientEmail,
            phone: receiverPhone || clientPhone
          },
          address: {
            line1: isUpsAccessPoint && upsAccessPoint ? upsAccessPoint : (receiverAddress || clientAddress),
            line2: isUpsAccessPoint ? null : (receiverAddressComplement || clientAddressComplement || null),
            city: isUpsAccessPoint ? null : (receiverCity || clientCity || null),
            state: isUpsAccessPoint ? null : (receiverState || clientState || null),
            zip: isUpsAccessPoint ? null : (receiverZip || clientZip || null),
            country: isUpsAccessPoint ? null : (receiverCountry || clientCountry || null)
          },
          note: usefulInfo || null
        },
        
        // Informations bordereau (sera complété lors de l'upload)
        auctionSheet: {
          fileName: bordereauInfo || null,
          totalLots: 0,
          totalObjects: 0
        },
        
        // Options
        options: {
          insurance: wantsInsurance,
          express: false,
          insuranceAmount: null,
          expressAmount: null,
          packagingPrice: null,
          shippingPrice: null
        },
        
        // Statuts
        status: bordereauLink ? 'bordereau_linked' : 'waiting_for_slip',
        paymentStatus: 'pending',
        paymentLinks: [],
        messages: [],
        verificationIssues: [],
        timeline: [{
          id: `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          date: Timestamp.now(),
          status: 'new',
          description: 'Devis créé depuis Google Sheets Typeform'
        }],
        internalNotes: [],
        auctionHouseComments: [],
        
        // Métadonnées Typeform
        typeformToken: token,
        typeformSubmittedAt: submittedAt || null,
        upsAccessPoint: upsAccessPoint || null,
        
        // Dates
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        
        // Champs pour compatibilité avec l'ancien système
        clientName: clientName,
        clientEmail: clientEmail,
        recipientAddress: receiverFullAddress,
        
        // Référence générée automatiquement
        reference: `GS-${Date.now()}-${sheetRowIndex}`,
        
        // Facture professionnelle (depuis questionnaire)
        ...(wantsProfessionalInvoiceVal === true && { wantsProfessionalInvoice: true }),
        ...(wantsProfessionalInvoiceVal === false && { wantsProfessionalInvoice: false })
      };

      // Vérifier limite plan avant création
      if (remainingQuotes <= 0) {
        console.log(`[Google Sheets Sync] ⚠️  Limite devis atteinte pour saasAccountId ${saasAccountId}, ligne ${sheetRowIndex} ignorée`);
        continue;
      }

      const devisRef = await firestore.collection('quotes').add(quoteData);
      const devisId = devisRef.id;

      newDevisCount++;
      remainingQuotes--;
      try {
        await firestore.collection('saasAccounts').doc(saasAccountId).update({
          'usage.quotesUsedThisYear': FieldValue.increment(1),
        });
      } catch (incErr) {
        console.warn('[Google Sheets Sync] ⚠️  Incrément usage échoué:', incErr.message);
      }
      console.log(`[Google Sheets Sync] ✅ Devis créé pour la ligne ${sheetRowIndex} (${clientName || clientEmail})`);

      // 🔔 CRÉER UNE NOTIFICATION pour le nouveau devis
      try {
        const notificationClientName = clientName || 'Client non renseigné';
        const notificationCountry = receiverCountry || 'Pays non renseigné';
        
        await createNotification(firestore, {
          clientSaasId: saasAccountId,
          devisId: devisId,
          type: NOTIFICATION_TYPES.NEW_QUOTE,
          title: 'Nouveau devis reçu',
          message: `Nouveau devis de ${notificationClientName} - Destination: ${notificationCountry}`
        });
        
        console.log(`[Google Sheets Sync] 🔔 Notification créée pour nouveau devis ${devisId}`);
      } catch (notifError) {
        console.error(`[Google Sheets Sync] ⚠️  Erreur lors de la création de notification:`, notifError);
        // Ne pas bloquer la création du devis si la notification échoue
      }

      // Si un dossier Drive est configuré, rechercher automatiquement le bordereau
      // Note: On lance la recherche même si bordereauLink existe (lien Typeform)
      // car le fichier doit être trouvé dans Google Drive pour l'OCR
      const saasAccountDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
      const googleDriveIntegration = saasAccountDoc.data()?.integrations?.googleDrive;
      
      if (googleDriveIntegration && googleDriveIntegration.connected && googleDriveIntegration.bordereauxFolderId) {
        console.log(`[Bordereau Auto] 🔍 Lancement recherche automatique pour devis ${devisId}`);
        // Recherche automatique du bordereau en arrière-plan (ne bloque pas le polling)
        searchAndLinkBordereauForDevis(devisId, saasAccountId, auth, googleDriveIntegration.bordereauxFolderId).catch(error => {
          console.error(`[Bordereau Auto] ❌ Erreur recherche pour devis ${devisId}:`, error.message);
        });
      } else {
        console.log(`[Bordereau Auto] ⚠️  Google Drive non configuré pour saasAccountId: ${saasAccountId}`);
      }
    }

    // Mettre à jour le lastRowImported et lastSyncAt
    // lastRowImported = dernière ligne traitée (1-indexed, ligne 1 = headers)
    // On met à jour avec la dernière ligne du sheet (même si certaines ont été ignorées)
    // Cela permet de ne pas re-traiter les lignes déjà vues
    const newLastRowImported = rows.length + 1; // +1 car on commence à la ligne 2, rows.length donne le nombre de lignes de données
    
    await firestore.collection('saasAccounts').doc(saasAccountId).update({
      'integrations.googleSheets.lastRowImported': newLastRowImported,
      'integrations.googleSheets.lastSyncAt': Timestamp.now()
    });
    
    console.log(`[Google Sheets Sync] ✅ lastRowImported mis à jour: ${newLastRowImported} (${rows.length} lignes de données, ${newDevisCount} nouveau(x) devis créé(s))`);

    console.log(`[Google Sheets Sync] ✅ Synchronisation terminée pour saasAccountId: ${saasAccountId}, ${newDevisCount} nouveau(x) devis créé(s)`);
  } catch (error) {
    console.error('[Google Sheets Sync] Erreur lors de la synchronisation pour saasAccountId:', saasAccountId, error);
    
    // Si le token a expiré, déconnecter Google Sheets
    if (error.code === 401) {
      await firestore.collection('saasAccounts').doc(saasAccountId).update({
        'integrations.googleSheets.connected': false
      });
      console.log('[Google Sheets Sync] ⚠️  Google Sheets déconnecté (token expiré) pour saasAccountId:', saasAccountId);
      
      // Créer une notification pour informer l'utilisateur
      try {
        await createNotification(firestore, {
          clientSaasId: saasAccountId,
          devisId: null,
          type: NOTIFICATION_TYPES.SYSTEM,
          title: '⚠️ Connexion Google Sheets expirée',
          message: 'Votre connexion Google Sheets a expiré et doit être renouvelée.\n\n' +
                   '📋 Pour reconnecter Google Sheets :\n' +
                   '1. Allez dans Paramètres > Intégrations\n' +
                   '2. Cliquez sur "Resynchroniser" ou "Se reconnecter à Google Sheets"\n' +
                   '3. Autorisez l\'accès à vos Google Sheets\n\n' +
                   '✅ Une fois reconnecté, la synchronisation automatique des nouveaux devis reprendra.'
        });
        console.log('[Google Sheets Sync] 🔔 Notification de déconnexion créée pour saasAccountId:', saasAccountId);
      } catch (notifError) {
        console.error('[Google Sheets Sync] Erreur création notification:', notifError);
      }
    }
  }
}

// Fonction: Synchroniser tous les comptes SaaS avec Google Sheets connecté
async function syncAllGoogleSheets() {
  if (!firestore) return;

  try {
    // OPTIMISATION: Utiliser une requête filtrée pour ne récupérer que les comptes avec Google Sheets connecté
    // Au lieu de lire TOUS les saasAccounts, on ne lit que ceux qui ont integrations.googleSheets.connected = true
    const saasAccounts = await firestore.collection('saasAccounts')
      .where('integrations.googleSheets.connected', '==', true)
      .get();

    let syncCount = 0;

    for (const doc of saasAccounts.docs) {
      const saasAccountData = doc.data();
      const googleSheetsIntegration = saasAccountData.integrations?.googleSheets;

      // Double vérification (normalement toujours true grâce au where)
      if (googleSheetsIntegration && googleSheetsIntegration.connected) {
        try {
          await syncSheetForAccount(doc.id, googleSheetsIntegration);
          syncCount++;
        } catch (accountError) {
          // invalid_grant = token expiré/révoqué → l'utilisateur doit reconnecter Google Sheets
          const msg = accountError?.message || String(accountError);
          if (msg.includes('invalid_grant') || msg.includes('Token has been expired')) {
            console.warn(`[Google Sheets Sync] ⚠️  Token expiré pour ${doc.id} - Reconnectez Google Sheets dans Paramètres`);
          } else {
            console.error(`[Google Sheets Sync] Erreur sync compte ${doc.id}:`, accountError);
          }
        }
      }
    }

    if (syncCount > 0) {
      console.log(`[Google Sheets Sync] ✅ Synchronisation de ${syncCount} compte(s) SaaS avec Google Sheets terminée`);
    }
  } catch (error) {
    // NOT_FOUND (code 5) = base Firestore vide ou en cours de création, ignorer silencieusement
    if (error?.code === 5 || error?.message?.includes('NOT_FOUND')) {
      return;
    }
    console.error('[Google Sheets Sync] Erreur lors de la synchronisation globale:', error?.message || error);
  }
}

// ============================================================================
// FONCTIONS DE LIAISON AUTOMATIQUE BORDEREAU → DEVIS
// ============================================================================

/**
 * Fonction wrapper pour rechercher et lier automatiquement un bordereau
 */
async function searchAndLinkBordereauForDevis(devisId, saasAccountId, auth, bordereauxFolderId) {
  try {
    // 1. Récupérer le devis
    const devisDoc = await firestore.collection('quotes').doc(devisId).get();
    if (!devisDoc.exists) return null;

    const devis = { id: devisId, ...devisDoc.data() };

    // 2. Créer client Drive
    const drive = google.drive({ version: 'v3', auth });

    // 3. Rechercher le bordereau
    const result = await findBordereauForDevis(devis, drive, bordereauxFolderId);

    // 4. Si trouvé, lier automatiquement
    if (result) {
      const bordereauId = await linkBordereauToDevis(devisId, result.file, result.method, saasAccountId);
      return bordereauId;
    }
    
    return null;
  } catch (error) {
    console.error('[Bordereau Auto] Erreur:', error);
    return null;
  }
}

/**
 * Recherche automatique d'un bordereau dans Google Drive pour un devis
 * Stratégie: FileId > FileName > Token > Email > Date (par ordre de fiabilité)
 */
async function findBordereauForDevis(devis, drive, bordereauxFolderId) {
  if (!drive || !bordereauxFolderId) return null;

  const searchCriteria = [];

  // 0. PRIORITÉ 0: Recherche directe par ID de fichier Drive (si extrait du lien)
  if (devis.driveFileIdFromLink) {
    try {
      console.log(`[Bordereau Search] Tentative de récupération directe du fichier: ${devis.driveFileIdFromLink}`);
      const file = await drive.files.get({
        fileId: devis.driveFileIdFromLink,
        fields: 'id, name, mimeType, size, modifiedTime, webViewLink, parents'
      });
      
      // Vérifier que le fichier est bien dans le bon dossier
      if (file.data.parents && file.data.parents.includes(bordereauxFolderId)) {
        console.log(`[Bordereau Search] ✅ Bordereau trouvé via ID direct: ${file.data.name}`);
        return {
          file: file.data,
          method: 'file_id'
        };
      }
    } catch (error) {
      console.log(`[Bordereau Search] Fichier ${devis.driveFileIdFromLink} non accessible ou pas dans le bon dossier`);
    }
  }

  // 1. PRIORITÉ 1: Recherche par nom de fichier (extrait du lien Typeform ou du Sheet)
  if (devis.bordereauFileName) {
    // Extraire le nom de fichier depuis l'URL Typeform si nécessaire
    let fileName = devis.bordereauFileName;
    if (fileName.includes('/')) {
      // Format: https://api.typeform.com/responses/files/{hash}/{filename}
      const parts = fileName.split('/');
      fileName = parts[parts.length - 1];
      // Décoder l'URL encodage si nécessaire
      fileName = decodeURIComponent(fileName);
    }
    
    // Nettoyer le nom de fichier pour la recherche
    // Enlever les extensions et caractères spéciaux pour recherche partielle
    // IMPORTANT: Enlever aussi les préfixes de hash Typeform (ex: ca0936feeca3-)
    const cleanFileName = fileName
      .replace(/^[a-f0-9]{12,16}-/i, '') // Enlever préfixe hash Typeform (12-16 caractères hexadécimaux)
      .replace(/\.[^.]+$/, '') // Enlever l'extension
      .replace(/_/g, ' ') // Remplacer underscores par espaces
      .split(' ')
      .filter(part => part.length > 3) // Garder seulement les mots de plus de 3 caractères
      .slice(0, 5) // Augmenter à 5 mots pour plus de précision
      .join(' ');
    
    if (cleanFileName.length > 3) {
      searchCriteria.push({
        method: 'filename',
        query: `'${bordereauxFolderId}' in parents and name contains '${cleanFileName}' and trashed=false`
      });
      console.log(`[Bordereau Search] Recherche par nom de fichier: "${cleanFileName}" (original: "${fileName}")`);
    }
  }

  // 2. PRIORITÉ 2: Recherche par Token Typeform
  if (devis.typeformToken && devis.typeformToken.length > 5) {
    searchCriteria.push({
      method: 'token',
      query: `'${bordereauxFolderId}' in parents and name contains '${devis.typeformToken}' and trashed=false`
    });
  }

  // 3. PRIORITÉ 3: Recherche par Email client
  if (devis.client?.email) {
    const emailPrefix = devis.client.email.split('@')[0];
    if (emailPrefix.length > 3) {
      searchCriteria.push({
        method: 'email',
        query: `'${bordereauxFolderId}' in parents and name contains '${emailPrefix}' and trashed=false`
      });
    }
  }

  // 4. PRIORITÉ 4: Recherche par proximité de date (± 10 minutes pour plus de tolérance)
  if (devis.typeformSubmittedAt && typeof devis.typeformSubmittedAt === 'string') {
    try {
      // Vérifier que c'est bien une date et pas une URL
      if (!devis.typeformSubmittedAt.startsWith('http')) {
        const submittedDate = new Date(devis.typeformSubmittedAt);
        if (!isNaN(submittedDate.getTime())) {
          const minDate = new Date(submittedDate.getTime() - 10 * 60 * 1000); // ± 10 minutes
          const maxDate = new Date(submittedDate.getTime() + 10 * 60 * 1000);
          searchCriteria.push({
            method: 'date',
            query: `'${bordereauxFolderId}' in parents and modifiedTime >= '${minDate.toISOString()}' and modifiedTime <= '${maxDate.toISOString()}' and trashed=false`
          });
          console.log(`[Bordereau Search] Recherche par date: ${submittedDate.toISOString()} (± 10 min)`);
        }
      }
    } catch (e) {
      console.warn('[Bordereau Search] Date invalide:', devis.typeformSubmittedAt);
    }
  }

  // Essayer chaque critère dans l'ordre
  for (const criteria of searchCriteria) {
    try {
      const result = await drive.files.list({
        q: criteria.query,
        fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
        pageSize: 10
      });

      if (result.data.files && result.data.files.length > 0) {
        console.log(`[Bordereau Search] ✅ Bordereau trouvé via ${criteria.method}: ${result.data.files[0].name}`);
        return {
          file: result.data.files[0],
          method: criteria.method
        };
      }
    } catch (error) {
      console.error(`[Bordereau Search] Erreur recherche ${criteria.method}:`, error.message);
    }
  }

  console.log(`[Bordereau Search] ⚠️  Aucun bordereau trouvé pour devis ${devis.id}`);
  return null;
}

/**
 * Lie un bordereau à un devis et déclenche l'OCR
 */
async function linkBordereauToDevis(devisId, bordereauFile, linkMethod, saasAccountId) {
  if (!firestore) return null;

  try {
    // 1. Créer le document bordereau dans Firestore
    const bordereauRef = await firestore.collection('bordereaux').add({
      saasAccountId,
      devisId,
      driveFileId: bordereauFile.id,
      driveFileName: bordereauFile.name,
      mimeType: bordereauFile.mimeType,
      size: bordereauFile.size,
      webViewLink: bordereauFile.webViewLink,
      linkedAt: Timestamp.now(),
      linkedBy: 'auto',
      linkMethod: linkMethod,
      ocrStatus: 'pending',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });

    // 2. Mettre à jour le devis avec la référence au bordereau
    await firestore.collection('quotes').doc(devisId).update({
      bordereauId: bordereauRef.id,
      status: 'bordereau_linked',
      updatedAt: Timestamp.now(),
      timeline: FieldValue.arrayUnion({
        id: `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        date: Timestamp.now(),
        status: 'bordereau_linked',
        description: `Bordereau lié automatiquement (méthode: ${linkMethod})`
      })
    });

    console.log(`[Bordereau Link] ✅ Bordereau ${bordereauFile.name} lié au devis ${devisId}`);

    // 3. Déclencher l'OCR automatiquement (asynchrone)
    triggerOCRForBordereau(bordereauRef.id, saasAccountId).catch(error => {
      console.error('[Bordereau Link] Erreur OCR:', error);
    });

    return bordereauRef.id;
  } catch (error) {
    console.error('[Bordereau Link] Erreur liaison:', error);
    return null;
  }
}

/**
 * Extraction des lots via Groq LLM (fallback quand Tesseract OCR retourne 0 lots)
 * Utilise le texte brut OCR pour extraire intelligemment les informations du bordereau
 */
async function extractLotsWithGroq(ocrRawText) {
  if (!process.env.GROQ_API_KEY || !ocrRawText) return {};
  try {
    console.log('[OCR Groq] 🤖 Extraction lots via Groq (fallback)...');
    const truncatedText = ocrRawText.slice(0, 5000);
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'Tu es un expert en analyse de bordereaux de ventes aux enchères françaises (Millon, Sotheby\'s, Christie\'s, Drouot, etc.). Tu extrais les données structurées en JSON strict.'
          },
          {
            role: 'user',
            content: `Analyse ce texte OCR extrait d\'un bordereau de vente aux enchères et extrait toutes les informations.

Réponds UNIQUEMENT avec du JSON valide (pas de markdown, pas d\'explication), format exact:
{
  "lots": [
    {"numero_lot": "1", "description": "Description complète de l\'objet", "prix_marteau": 150}
  ],
  "salle_vente": "Nom de la maison de vente",
  "date": "YYYY-MM-DD",
  "numero_bordereau": "numéro",
  "total": 500
}

Si une valeur est introuvable, utilise null. Le prix marteau est le prix d\'adjudication hors frais.

Texte OCR du bordereau:
---
${truncatedText}
---`
          }
        ],
        temperature: 0.05,
        max_tokens: 3000
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API error ${response.status}: ${errText.slice(0, 200)}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return {};
    // Extraire le JSON même si entouré de markdown
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    const parsed = JSON.parse(jsonMatch[0]);
    const lotsCount = parsed.lots?.length || 0;
    console.log(`[OCR Groq] ✅ Groq a extrait: ${lotsCount} lots, salle: ${parsed.salle_vente}, total: ${parsed.total}`);
    return parsed;
  } catch (e) {
    console.warn('[OCR Groq] ❌ Erreur extraction Groq:', e.message);
    return {};
  }
}

/**
 * Télécharge un fichier depuis Google Drive
 */
async function downloadFileFromDrive(drive, fileId) {
  try {
    const response = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(response.data);
  } catch (error) {
    console.error('[Drive Download] Erreur:', error.message);
    throw error;
  }
}

/**
 * Déclenche l'OCR pour un bordereau et calcule le devis (Drive ou URL)
 * @param {string} bordereauId - ID du bordereau
 * @param {string} saasAccountId - ID du compte SaaS
 * @param {object} [opts] - Options: { preDownloadedBuffer, mimeType } pour éviter un second téléchargement
 */
async function triggerOCRForBordereau(bordereauId, saasAccountId, opts = {}) {
  if (!firestore) return;
  const OCR_VERBOSE = process.env.OCR_VERBOSE === 'true' || process.env.OCR_VERBOSE === '1';
  try {
    console.log(`[OCR] 📄 Étape 1/6: Chargement du document bordereau (id: ${bordereauId})`);
    const bordereauDoc = await firestore.collection('bordereaux').doc(bordereauId).get();
    if (!bordereauDoc.exists) { console.error('[OCR] Bordereau introuvable:', bordereauId); return; }
    const bordereau = bordereauDoc.data();
    await firestore.collection('bordereaux').doc(bordereauId).update({ ocrStatus: 'processing', updatedAt: Timestamp.now() });
    console.log(`[OCR] 📄 Étape 2/6: Récupération du fichier (devis: ${bordereau.devisId})`);
    let fileBuffer, mimeType = opts.mimeType || bordereau.mimeType || 'application/pdf';
    if (opts.preDownloadedBuffer && Buffer.isBuffer(opts.preDownloadedBuffer)) {
      fileBuffer = opts.preDownloadedBuffer;
      console.log(`[OCR]   → Buffer pré-téléchargé utilisé (${(opts.preDownloadedBuffer.length / 1024).toFixed(1)} Ko)`);
    } else if (bordereau.sourceUrl) {
      console.log('[OCR]   → Téléchargement depuis sourceUrl...');
      const d = await downloadFileFromUrl(bordereau.sourceUrl, saasAccountId);
      fileBuffer = d.buffer; mimeType = d.mimeType;
      console.log(`[OCR]   → Fichier téléchargé (${(fileBuffer.length / 1024).toFixed(1)} Ko, ${mimeType})`);
    } else if (bordereau.driveFileId) {
      const saasAccountDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
      if (!saasAccountDoc.exists) throw new Error('Compte SaaS introuvable');
      const gs = saasAccountDoc.data().integrations?.googleSheets;
      if (!gs || !gs.accessToken) throw new Error('OAuth Google non configuré');
      let expiryDate = null;
      if (gs.expiresAt) {
        if (gs.expiresAt instanceof Timestamp) expiryDate = gs.expiresAt.toDate().getTime();
        else if (gs.expiresAt.toDate) expiryDate = gs.expiresAt.toDate().getTime();
        else if (gs.expiresAt instanceof Date) expiryDate = gs.expiresAt.getTime();
        else expiryDate = new Date(gs.expiresAt).getTime();
      }
      const auth = new google.auth.OAuth2(GOOGLE_SHEETS_CLIENT_ID, GOOGLE_SHEETS_CLIENT_SECRET, GOOGLE_SHEETS_REDIRECT_URI);
      auth.setCredentials({ access_token: gs.accessToken, refresh_token: gs.refreshToken, expiry_date: expiryDate });
      const drive = google.drive({ version: 'v3', auth });
      console.log('[OCR]   → Téléchargement depuis Google Drive...');
      fileBuffer = await downloadFileFromDrive(drive, bordereau.driveFileId);
      console.log(`[OCR]   → Fichier Drive téléchargé (${(fileBuffer.length / 1024).toFixed(1)} Ko)`);
    } else throw new Error('Bordereau sans source (ni sourceUrl ni driveFileId)');
    console.log(`[OCR] 📖 Étape 3/6: Analyse OCR (Tesseract) du document...`);
    const { result: ocrResult, ocrRawText } = await extractBordereauFromFile(fileBuffer, mimeType, OCR_VERBOSE);

    console.log(`[OCR] 📊 Étape 4/6: Extraction terminée — ${ocrResult.lots?.length || 0} lots, salle: ${ocrResult.salle_vente || 'non détectée'}, total: ${ocrResult.total ?? 'non détecté'}`);

    // Fallback Groq si l'extraction Tesseract n'a pas trouvé de lots
    if ((!ocrResult.lots || ocrResult.lots.length === 0) && ocrRawText && process.env.GROQ_API_KEY) {
      console.log(`[OCR] 🤖 Étape 4b/6: Tesseract n'a pas extrait de lots → tentative avec Groq LLM...`);
      const groqResult = await extractLotsWithGroq(ocrRawText);
      if (groqResult.lots && groqResult.lots.length > 0) {
        ocrResult.lots = groqResult.lots;
        if (!ocrResult.salle_vente && groqResult.salle_vente) ocrResult.salle_vente = groqResult.salle_vente;
        if (!ocrResult.date && groqResult.date) ocrResult.date = groqResult.date;
        if (!ocrResult.numero_bordereau && groqResult.numero_bordereau) ocrResult.numero_bordereau = groqResult.numero_bordereau;
        if (!ocrResult.total && groqResult.total) ocrResult.total = groqResult.total;
        console.log(`[OCR]   → Groq a extrait ${ocrResult.lots.length} lots`);
      } else {
        console.warn('[OCR] ⚠️ Groq n\'a pas non plus extrait de lots - le PDF est peut-être illisible ou format non standard');
      }
    }

    console.log(`[OCR] 💾 Étape 5/6: Sauvegarde du résultat OCR dans Firestore...`);
    // 7. Sauvegarder le résultat OCR
    await firestore.collection('bordereaux').doc(bordereauId).update({
      ocrStatus: 'completed',
      ocrResult: {
        lots: ocrResult.lots || [],
        salle_vente: ocrResult.salle_vente || null,
        total: ocrResult.total || null,
        date: ocrResult.date || null,
        numero_bordereau: ocrResult.numero_bordereau || null
      },
      ocrRawText: ocrRawText ? ocrRawText.slice(0, 10000) : null,
      ocrCompletedAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });

    console.log(`[OCR] 📐 Étape 6/6: Calcul du devis (prix, carton, expédition)...`);
    // 8. Déclencher le calcul du devis
    await calculateDevisFromOCR(bordereau.devisId, ocrResult, saasAccountId);
    console.log(`[OCR] ✅ ========== OCR TERMINÉ ========== Bordereau ${bordereauId}: ${ocrResult.lots?.length || 0} lots extraits → Devis mis à jour`);

  } catch (error) {
    console.error('[OCR] Erreur:', error);
    const errMsg = error?.message || String(error);
    const isTokenExpired = errMsg.includes('invalid_grant') || errMsg.includes('Token has been expired') || errMsg.includes('revoked');
    const userFriendlyError = isTokenExpired
      ? 'Connexion Google expirée ou révoquée. Reconnectez Google Sheets dans Paramètres → Intégrations pour relancer l\'analyse.'
      : errMsg;
    await firestore.collection('bordereaux').doc(bordereauId).update({
      ocrStatus: 'failed',
      ocrError: userFriendlyError,
      updatedAt: Timestamp.now()
    });
    if (isTokenExpired && firestore) {
      try {
        const bordereauDoc = await firestore.collection('bordereaux').doc(bordereauId).get();
        const devisId = bordereauDoc.exists ? bordereauDoc.data().devisId : null;
        await createNotification(firestore, {
          clientSaasId: saasAccountId,
          devisId,
          type: NOTIFICATION_TYPES.SYSTEM,
          title: '⚠️ Connexion Google expirée',
          message: 'L\'analyse du bordereau a échoué : votre connexion Google (Sheets/Drive) a expiré ou été révoquée.\n\n' +
                   '📋 Pour corriger :\n' +
                   '1. Allez dans Paramètres → Intégrations\n' +
                   '2. Déconnectez puis reconnectez Google Sheets\n' +
                   '3. Relancez l\'analyse du bordereau sur le devis\n\n' +
                   '✅ Une fois reconnecté, l\'analyse des bordereaux fonctionnera à nouveau.'
        });
      } catch (notifErr) {
        console.error('[OCR] Erreur création notification:', notifErr);
      }
    }
  }
}

/**
 * Parse le CSV des zones de tarification depuis Google Sheets
 * @param {string} csvText - Contenu CSV
 * @returns {Array} - Tableau de zones {zone, countries, express: {range: price}}
 */
function parseShippingZonesFromCSV(csvText) {
  const zones = [];
  const lines = csvText.split('\n').map(l => l.trim()).filter(l => l);
  
  let currentZone = null;
  let weightColumns = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    
    // Détecter les en-têtes de colonnes de poids (1kg, 2kg, 5kg, etc.)
    if (line.includes('1kg') || line.includes('2kg')) {
      weightColumns = [];
      for (let j = 0; j < values.length; j++) {
        if (/\d+kg/i.test(values[j])) {
          weightColumns.push(j);
        }
      }
      continue;
    }
    
    // Détecter une nouvelle zone (Zone A, Zone B, etc.)
    if (/^Zone\s+[A-Z]/i.test(values[0])) {
      if (currentZone) {
        zones.push(currentZone);
      }
      currentZone = {
        zone: values[0],
        countries: [],
        express: {}
      };
      continue;
    }
    
    // Ajouter des pays à la zone courante
    if (currentZone && values[0] && values[0].length === 2 && /^[A-Z]{2}$/i.test(values[0])) {
      currentZone.countries.push(values[0].toUpperCase());
      continue;
    }
    
    // Parser les prix Express
    if (currentZone && line.toUpperCase().includes('EXPRESS') && weightColumns.length > 0) {
      const weights = [1, 2, 5, 10, 15, 20, 30];
      
      for (let j = 0; j < Math.min(weightColumns.length, weights.length); j++) {
        const colIdx = weightColumns[j];
        if (colIdx < values.length) {
          const priceStr = values[colIdx].replace(/[^\d.]/g, '');
          const price = parseFloat(priceStr);
          
          if (!isNaN(price) && price > 0) {
            const weight = weights[j];
            const nextWeight = j < weights.length - 1 ? weights[j + 1] : weight + 10;
            const range = `${weight}-${nextWeight}`;
            currentZone.express[range] = price;
          }
        }
      }
    }
  }
  
  // Ajouter la dernière zone
  if (currentZone) {
    zones.push(currentZone);
  }
  
  return zones;
}

/**
 * Gère l'emballage de plusieurs lots
 * @param {Array} lots - Tableau de lots avec dimensions estimées
 * @param {string} saasAccountId - ID du compte SaaS
 * @returns {Object} - Résultat {cartons: Array, totalPrice: number, strategy: string}
 */
async function handleMultipleLots(lots, saasAccountId) {
  if (!lots || lots.length === 0) {
    return { cartons: [], totalPrice: 0, strategy: 'none' };
  }

  console.log(`[Lots Multiples] 📦 Gestion de ${lots.length} lot(s)`);

  // Récupérer tous les cartons actifs du client
  const cartonsSnapshot = await firestore
    .collection('cartons')
    .where('saasAccountId', '==', saasAccountId)
    .where('isActive', '==', true)
    .get();

  if (cartonsSnapshot.empty) {
    console.warn('[Lots Multiples] ⚠️  Aucun carton configuré');
    return { cartons: [], totalPrice: 0, strategy: 'no_cartons' };
  }

  const availableCartons = cartonsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  // Stratégie 1: Essayer de tout mettre dans un seul carton
  console.log('[Lots Multiples] 🔍 Stratégie 1: Un seul carton pour tous les lots');
  
  // Calculer les dimensions totales (en empilant les objets)
  const totalDimensions = lots.reduce((acc, lot) => {
    if (!lot.estimatedDimensions) return acc;
    
    const dims = lot.estimatedDimensions;
    return {
      length: Math.max(acc.length, dims.length),
      width: Math.max(acc.width, dims.width),
      height: acc.height + dims.height, // Empiler en hauteur
      weight: acc.weight + dims.weight
    };
  }, { length: 0, width: 0, height: 0, weight: 0 });

  console.log('[Lots Multiples] 📏 Dimensions totales (empilées):', totalDimensions);

  // Essayer de trouver un carton pour tout
  const singleCarton = await findOptimalCarton(totalDimensions, saasAccountId);
  
  if (singleCarton) {
    console.log(`[Lots Multiples] ✅ Stratégie 1 réussie: 1 carton ${singleCarton.carton_ref} pour ${lots.length} lots`);
    return {
      cartons: [{
        ...singleCarton,
        lotsCount: lots.length,
        lotNumbers: lots.map(l => l.numero_lot).filter(Boolean)
      }],
      totalPrice: singleCarton.packaging_price,
      strategy: 'single_carton'
    };
  }

  // Stratégie 2: Un carton par lot
  console.log('[Lots Multiples] 🔍 Stratégie 2: Un carton par lot');
  
  const cartonsPerLot = [];
  let totalPrice = 0;
  
  for (const lot of lots) {
    if (!lot.estimatedDimensions) {
      console.warn(`[Lots Multiples] ⚠️  Lot ${lot.numero_lot || 'sans numéro'} sans dimensions, ignoré`);
      continue;
    }
    
    const carton = await findOptimalCarton(lot.estimatedDimensions, saasAccountId);
    
    if (carton) {
      cartonsPerLot.push({
        ...carton,
        lotsCount: 1,
        lotNumbers: [lot.numero_lot].filter(Boolean)
      });
      totalPrice += carton.packaging_price;
      console.log(`[Lots Multiples] ✅ Lot ${lot.numero_lot || 'sans numéro'} → Carton ${carton.carton_ref} (${carton.packaging_price}€)`);
    } else {
      console.warn(`[Lots Multiples] ⚠️  Aucun carton trouvé pour lot ${lot.numero_lot || 'sans numéro'}`);
    }
  }

  if (cartonsPerLot.length > 0) {
    console.log(`[Lots Multiples] ✅ Stratégie 2 réussie: ${cartonsPerLot.length} carton(s) pour ${lots.length} lots (Total: ${totalPrice}€)`);
    return {
      cartons: cartonsPerLot,
      totalPrice,
      strategy: 'multiple_cartons'
    };
  }

  // Stratégie 3: Fallback sur carton par défaut
  console.log('[Lots Multiples] 🔍 Stratégie 3: Carton par défaut');
  const defaultCarton = availableCartons.find(c => c.isDefault);
  
  if (defaultCarton) {
    console.log(`[Lots Multiples] ✅ Stratégie 3: Carton par défaut ${defaultCarton.carton_ref}`);
    return {
      cartons: [{
        id: defaultCarton.id,
        carton_ref: defaultCarton.carton_ref,
        inner_length: defaultCarton.inner_length,
        inner_width: defaultCarton.inner_width,
        inner_height: defaultCarton.inner_height,
        packaging_price: defaultCarton.packaging_price,
        lotsCount: lots.length,
        lotNumbers: lots.map(l => l.numero_lot).filter(Boolean)
      }],
      totalPrice: defaultCarton.packaging_price,
      strategy: 'default_carton'
    };
  }

  console.warn('[Lots Multiples] ❌ Aucune stratégie n\'a fonctionné');
  return { cartons: [], totalPrice: 0, strategy: 'failed' };
}

/**
 * Trouve le carton optimal pour les dimensions données
 * @param {Object} dimensions - Dimensions estimées {length, width, height, weight}
 * @param {string} saasAccountId - ID du compte SaaS
 * @returns {Object|null} - Carton optimal ou null si aucun trouvé
 */
async function findOptimalCarton(dimensions, saasAccountId) {
  if (!firestore || !dimensions) return null;

  try {
    console.log('[Carton] 🔍 Recherche du carton optimal pour dimensions:', dimensions);

    // Récupérer tous les cartons actifs du client
    const cartonsSnapshot = await firestore
      .collection('cartons')
      .where('saasAccountId', '==', saasAccountId)
      .where('isActive', '==', true)
      .get();

    if (cartonsSnapshot.empty) {
      console.warn('[Carton] ⚠️  Aucun carton configuré pour ce compte SaaS');
      return null;
    }

    const cartons = cartonsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`[Carton] 📦 ${cartons.length} carton(s) disponible(s)`);

    // Marge de sécurité pour l'emballage (2 cm de chaque côté)
    const PADDING = 2;
    const requiredLength = dimensions.length + (PADDING * 2);
    const requiredWidth = dimensions.width + (PADDING * 2);
    const requiredHeight = dimensions.height + (PADDING * 2);

    console.log('[Carton] 📏 Dimensions requises (avec marge):', {
      length: requiredLength,
      width: requiredWidth,
      height: requiredHeight
    });

    // Filtrer les cartons qui peuvent contenir l'objet
    const suitableCartons = cartons.filter(carton => {
      const fits = carton.inner_length >= requiredLength &&
                   carton.inner_width >= requiredWidth &&
                   carton.inner_height >= requiredHeight;
      
      if (fits) {
        console.log(`[Carton] ✅ ${carton.carton_ref} peut contenir l'objet`);
      }
      
      return fits;
    });

    if (suitableCartons.length === 0) {
      console.warn('[Carton] ⚠️  Aucun carton assez grand trouvé');
      
      // Utiliser le carton par défaut si disponible
      const defaultCarton = cartons.find(c => c.isDefault);
      if (defaultCarton) {
        console.log(`[Carton] 🎯 Utilisation du carton par défaut: ${defaultCarton.carton_ref}`);
        return defaultCarton;
      }
      
      return null;
    }

    // Trouver le carton optimal (le plus petit qui convient)
    const optimalCarton = suitableCartons.reduce((best, current) => {
      const bestVolume = best.inner_length * best.inner_width * best.inner_height;
      const currentVolume = current.inner_length * current.inner_width * current.inner_height;
      
      return currentVolume < bestVolume ? current : best;
    });

    console.log(`[Carton] 🎯 Carton optimal sélectionné: ${optimalCarton.carton_ref} (${optimalCarton.inner_length}x${optimalCarton.inner_width}x${optimalCarton.inner_height}cm) - Prix: ${optimalCarton.packaging_price}€`);

    return optimalCarton;
  } catch (error) {
    console.error('[Carton] ❌ Erreur lors de la recherche du carton optimal:', error);
    return null;
  }
}

/**
 * Estime les dimensions d'un lot via Groq AI avec contexte enrichi
 * @param {string} description - Description du lot
 * @param {string} groqApiKey - Clé API Groq
 * @param {Object} context - Contexte additionnel (optionnel)
 * @param {string} context.auctionHouse - Salle des ventes
 * @param {number} context.price - Prix d'adjudication (€)
 * @param {string} context.date - Date de la vente
 * @returns {Object} - Dimensions estimées {length, width, height, weight}
 */
async function estimateDimensionsWithGroq(description, groqApiKey, context = {}) {
  if (!groqApiKey || !description) {
    console.warn('[Groq] ⚠️  Clé API ou description manquante');
    return null;
  }

  try {
    if (context.auctionHouse || context.price != null || context.date) {
      console.log(`[Groq] 📊 Contexte:`, context);
    }
    const dimensions = await estimateDimensionsForObject(description, groqApiKey, context);
    
    console.log('[Groq] ✅ Dimensions estimées:', dimensions);
    return dimensions;
  } catch (error) {
    console.error('[Groq] ❌ Erreur lors de l\'estimation:', error);
    return null;
  }
}

const PRINCIPAL_PAYMENT_TYPES = ['PRINCIPAL', 'PRINCIPAL_STANDARD', 'PRINCIPAL_EXPRESS'];

/**
 * Annule tous les liens de paiement principaux (Standard unique ou Standard+Express) pour un devis.
 * Utilisé avant : 1) création des 2 liens (prepare-quote-email), 2) régénération après réanalyse (calculateDevisFromOCR).
 */
async function cancelPrincipalPaymentLinksForDevis(firestore, devisId, stripe) {
  const paiementsSnap = await firestore
    .collection('paiements')
    .where('devisId', '==', devisId)
    .get();
  const toCancel = paiementsSnap.docs.filter((d) => {
    const data = d.data();
    return data.status === 'PENDING' && PRINCIPAL_PAYMENT_TYPES.includes(data.type);
  });
  if (toCancel.length === 0) return;
  const cancelledIds = new Set();
  for (const d of toCancel) {
    const p = { id: d.id, ...d.data() };
    await firestore.collection('paiements').doc(p.id).update({
      status: 'CANCELLED',
      updatedAt: Timestamp.now(),
    });
    cancelledIds.add(p.id);
    if (p.stripeSessionId && stripe) {
      try {
        await stripe.checkout.sessions.expire(p.stripeSessionId, {
          stripeAccount: p.stripeAccountId || undefined,
        });
        console.log(`[API] ✅ Session Stripe expirée: ${p.stripeSessionId}`);
      } catch (e) {
        console.warn(`[API] ⚠️ Impossible d'expirer session ${p.stripeSessionId}:`, e?.message);
      }
    }
  }
  const quoteDoc = await firestore.collection('quotes').doc(devisId).get();
  if (quoteDoc.exists) {
    const quote = quoteDoc.data();
    const links = quote.paymentLinks || [];
    const updated = links.map((l) =>
      cancelledIds.has(l.id) ? { ...l, status: 'expired' } : l
    );
    if (updated.some((l, i) => l.status !== (links[i]?.status))) {
      await firestore.collection('quotes').doc(devisId).update({
        paymentLinks: updated,
        updatedAt: Timestamp.now(),
      });
    }
  }
  console.log(`[API] ✅ ${toCancel.length} lien(s) principal(aux) annulé(s) pour devis ${devisId}`);
}

/**
 * Calcule automatiquement le devis à partir du résultat OCR
 */
async function calculateDevisFromOCR(devisId, ocrResult, saasAccountId) {
  if (!firestore) return;

  try {
    const devisDoc = await firestore.collection('quotes').doc(devisId).get();
    if (!devisDoc.exists) {
      console.error('[Calcul] Devis introuvable:', devisId);
      return;
    }

    const devis = devisDoc.data();

    // 1. Estimer les dimensions pour tous les lots (si pas déjà estimées)
    const lotsWithDimensions = [];
    
    if (ocrResult.lots && ocrResult.lots.length > 0) {
      console.log(`[Calcul] 📦 Traitement de ${ocrResult.lots.length} lot(s)`);
      
      for (const lot of ocrResult.lots) {
        let lotDimensions = null;
        
        // Si dimensions déjà estimées dans l'OCR, les utiliser
        if (lot.estimatedDimensions) {
          lotDimensions = lot.estimatedDimensions;
          console.log(`[Calcul] ✅ Lot ${lot.numero_lot || 'sans numéro'}: dimensions déjà estimées`, lotDimensions);
        }
        // Sinon, estimer via Groq si une description est disponible
        else if (lot.description && process.env.GROQ_API_KEY) {
          console.log(`[Calcul] 🤖 Lot ${lot.numero_lot || 'sans numéro'}: estimation via Groq...`);
          
          // Préparer le contexte enrichi
          const context = {
            auctionHouse: ocrResult.salle_vente || null,
            price: lot.prix_marteau || lot.total || null,
            date: ocrResult.date || null
          };
          
          lotDimensions = await estimateDimensionsWithGroq(
            lot.description, 
            process.env.GROQ_API_KEY,
            context
          );
          
          if (lotDimensions) {
            console.log(`[Calcul] ✅ Lot ${lot.numero_lot || 'sans numéro'}: dimensions estimées`, lotDimensions);
          }
        }
        
        // Ajouter le lot avec ses dimensions
        lotsWithDimensions.push({
          ...lot,
          estimatedDimensions: lotDimensions || { length: 50, width: 40, height: 30, weight: 5 }
        });
      }
    }

    // Si aucun lot, créer un lot par défaut
    if (lotsWithDimensions.length === 0) {
      lotsWithDimensions.push({
        numero_lot: null,
        description: 'Lot détecté',
        estimatedDimensions: { length: 50, width: 40, height: 30, weight: 5 }
      });
      console.warn('[Calcul] ⚠️  Aucun lot détecté, utilisation de dimensions par défaut');
    }

    // 2. Gérer l'emballage selon le nombre de lots
    let packagingPrice = 0;
    let cartonInfo = null;
    let cartonsInfo = [];
    let packagingStrategy = 'none';
    
    if (lotsWithDimensions.length === 1) {
      // Un seul lot: utiliser la logique simple
      console.log('[Calcul] 📦 Un seul lot détecté, sélection d\'un carton');
      const dimensions = lotsWithDimensions[0].estimatedDimensions;
      const optimalCarton = await findOptimalCarton(dimensions, saasAccountId);
      
      if (optimalCarton) {
        packagingPrice = optimalCarton.packaging_price;
        cartonInfo = {
          id: optimalCarton.id,
          ref: optimalCarton.carton_ref,
          label: optimalCarton.carton_ref,
          inner_length: optimalCarton.inner_length,
          inner_width: optimalCarton.inner_width,
          inner_height: optimalCarton.inner_height,
          inner: { length: optimalCarton.inner_length, width: optimalCarton.inner_width, height: optimalCarton.inner_height },
          required: { length: optimalCarton.inner_length, width: optimalCarton.inner_width, height: optimalCarton.inner_height },
          price: optimalCarton.packaging_price,
          priceTTC: optimalCarton.packaging_price
        };
        cartonsInfo = [cartonInfo];
        packagingStrategy = 'single_carton';
        console.log(`[Calcul] 📦 Carton sélectionné: ${optimalCarton.carton_ref} - Prix: ${packagingPrice}€`);
      } else {
        console.warn('[Calcul] ⚠️  Aucun carton trouvé, prix d\'emballage = 0€');
      }
    } else {
      // Plusieurs lots: utiliser la gestion avancée
      console.log(`[Calcul] 📦 ${lotsWithDimensions.length} lots détectés, gestion multi-lots`);
      const packagingResult = await handleMultipleLots(lotsWithDimensions, saasAccountId);
      
      packagingPrice = packagingResult.totalPrice;
      cartonsInfo = packagingResult.cartons;
      packagingStrategy = packagingResult.strategy;
      
      // Pour compatibilité, utiliser le premier carton comme cartonInfo principal
      if (cartonsInfo.length > 0) {
        const c0 = cartonsInfo[0];
        cartonInfo = {
          id: c0.id,
          ref: c0.carton_ref,
          label: c0.carton_ref,
          inner_length: c0.inner_length,
          inner_width: c0.inner_width,
          inner_height: c0.inner_height,
          inner: { length: c0.inner_length, width: c0.inner_width, height: c0.inner_height },
          required: { length: c0.inner_length, width: c0.inner_width, height: c0.inner_height },
          price: c0.packaging_price,
          priceTTC: c0.packaging_price
        };
      }
      
      console.log(`[Calcul] 📦 Stratégie: ${packagingStrategy}, ${cartonsInfo.length} carton(s), Prix total: ${packagingPrice}€`);
    }

    // 3. Calculer le poids volumétrique total (en kg)
    const totalWeight = lotsWithDimensions.reduce((sum, lot) => 
      sum + (lot.estimatedDimensions?.weight || 0), 0
    );
    
    const totalVolume = lotsWithDimensions.reduce((sum, lot) => {
      const dims = lot.estimatedDimensions;
      return sum + (dims ? (dims.length * dims.width * dims.height) : 0);
    }, 0);
    
    const volumetricWeight = totalVolume / 5000;

    // 4. Prix de collecte (fixe pour l'instant, à adapter selon distance)
    const collectePrice = 0; // À implémenter selon la logique métier

    // 5. Prix d'expédition (calculé selon poids volumétrique + destination)
    let shippingPrice = 0;
    
    // Utiliser le poids le plus élevé entre le poids réel et le poids volumétrique
    const finalWeight = Math.max(totalWeight, volumetricWeight);
    
    console.log(`[Calcul] ⚖️ Poids réel: ${totalWeight.toFixed(2)}kg, Poids volumétrique: ${volumetricWeight.toFixed(2)}kg, Poids final: ${finalWeight.toFixed(2)}kg`);
    
    // Si une destination est renseignée, calculer le prix d'expédition
    // Support: grille tarifaire OU MBE Hub (selon settings.shippingCalculationMethod)
    const destCountry = devis.destination?.country || devis.delivery?.address?.country;
    if (destCountry) {
      try {
        const countryCode = (typeof destCountry === 'string' ? destCountry : String(destCountry)).toUpperCase();
        const saasAccountDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
        const saasAccount = saasAccountDoc.exists ? saasAccountDoc.data() : null;
        const useMbeHub = saasAccount && (saasAccount.planId === 'pro' || saasAccount.planId === 'ultra') && (saasAccount.settings?.shippingCalculationMethod === 'mbehub');

        if (useMbeHub) {
          const creds = await getMbeHubCredentials(firestore, saasAccountId);
          if (creds) {
            const deliveryAddr = devis.delivery?.address || devis.destination || {};
            const dest = {
              zipCode: String(deliveryAddr.zip || deliveryAddr.zipCode || '').trim(),
              city: String(deliveryAddr.city || '').trim(),
              state: String(deliveryAddr.state || '').trim().slice(0, 2),
              country: countryCode,
            };
            const dims = cartonInfo
              ? { length: cartonInfo.inner_length ?? 10, width: cartonInfo.inner_width ?? 10, height: cartonInfo.inner_height ?? 10 }
              : { length: 10, width: 10, height: 10 };
            try {
              const env = process.env.MBE_HUB_ENV === 'prod' ? 'prod' : 'demo';
              const options = await mbehubSoap.getShippingOptions({
                username: creds.username,
                password: creds.password,
                env,
                destination: dest,
                weight: finalWeight,
                dimensions: dims,
                insurance: !!devis.options?.insurance,
                insuranceValue: Number(devis.options?.insuranceAmount) || 0,
              });
              const standardOpts = options.filter((o) => /standard/i.test(String(o.ServiceDesc || '')));
              const expressOpts = options.filter((o) => /express/i.test(String(o.ServiceDesc || '')));
              const pickCheapest = (arr) => {
                if (!arr.length) return null;
                return arr.reduce((a, b) => {
                  const pa = Number(a.GrossShipmentPrice ?? a.NetShipmentPrice ?? 9999);
                  const pb = Number(b.GrossShipmentPrice ?? b.NetShipmentPrice ?? 9999);
                  return pa <= pb ? a : b;
                });
              };
              const useExpress = !!devis.options?.express;
              const selectedOpt = useExpress ? pickCheapest(expressOpts) : pickCheapest(standardOpts);
              if (selectedOpt) {
                shippingPrice = Number(selectedOpt.GrossShipmentPrice ?? selectedOpt.NetShipmentPrice ?? 0);
                console.log(`[Calcul] 🚚 Prix expédition MBE Hub (${useExpress ? 'Express' : 'Standard'}): ${shippingPrice}€ pour ${countryCode}`);
              }
            } catch (mbeErr) {
              console.warn('[Calcul] ⚠️ MBE Hub échec, fallback grille:', mbeErr.message);
            }
          }
        }

        if (shippingPrice === 0) {
          console.log(`[Calcul] 🔍 Recherche de la zone pour ${countryCode} dans la grille tarifaire du compte ${saasAccountId}`);
        
        // 1. Trouver la zone qui contient ce pays
        const zonesSnapshot = await firestore
          .collection('shippingZones')
          .where('saasAccountId', '==', saasAccountId)
          .where('isActive', '==', true)
          .get();
        
        let matchingZone = null;
        zonesSnapshot.forEach((doc) => {
          const zoneData = doc.data();
          if (zoneData.countries && zoneData.countries.some(c => c.toUpperCase() === countryCode)) {
            matchingZone = { id: doc.id, ...zoneData };
          }
        });
        
        if (!matchingZone) {
          console.warn(`[Calcul] ⚠️  Zone non trouvée pour ${countryCode} dans la grille tarifaire du compte ${saasAccountId}`);
        } else {
          console.log(`[Calcul] ✅ Zone trouvée: ${matchingZone.code} - ${matchingZone.name}`);
          
          // 2. Récupérer les tranches de poids
          const bracketsSnapshot = await firestore
            .collection('weightBrackets')
            .where('saasAccountId', '==', saasAccountId)
            .orderBy('minWeight', 'asc')
            .get();
          
          const brackets = [];
          bracketsSnapshot.forEach((doc) => {
            brackets.push({ id: doc.id, ...doc.data() });
          });
          
          if (brackets.length === 0) {
            console.warn(`[Calcul] ⚠️  Aucune tranche de poids trouvée pour le compte ${saasAccountId}`);
          } else {
            console.log(`[Calcul] 📊 ${brackets.length} tranche(s) de poids trouvée(s)`);
            
            // 3. Récupérer le service EXPRESS (par défaut)
            const servicesSnapshot = await firestore
              .collection('shippingServices')
              .where('saasAccountId', '==', saasAccountId)
              .where('name', '==', 'EXPRESS')
              .where('isActive', '==', true)
              .limit(1)
              .get();
            
            if (servicesSnapshot.empty) {
              console.warn(`[Calcul] ⚠️  Service EXPRESS non trouvé pour le compte ${saasAccountId}`);
            } else {
              const serviceDoc = servicesSnapshot.docs[0];
              const serviceId = serviceDoc.id;
              console.log(`[Calcul] 📦 Service EXPRESS trouvé: ${serviceId}`);
              
              // 4. Trouver la tranche de poids correspondante
              let selectedBracket = null;
              for (let i = 0; i < brackets.length; i++) {
                const currentBracket = brackets[i];
                const nextBracket = brackets[i + 1];
                
                // Si c'est la dernière tranche ou si le poids est inférieur à la tranche suivante
                if (!nextBracket || finalWeight < nextBracket.minWeight) {
                  selectedBracket = currentBracket;
                  break;
                }
              }
              
              if (!selectedBracket) {
                console.warn(`[Calcul] ⚠️  Aucune tranche de poids correspondante pour ${finalWeight}kg`);
              } else {
                console.log(`[Calcul] ⚖️  Tranche de poids sélectionnée: ${selectedBracket.minWeight}kg`);
                
                // 5. Récupérer le tarif
                const rateSnapshot = await firestore
                  .collection('shippingRates')
                  .where('saasAccountId', '==', saasAccountId)
                  .where('zoneId', '==', matchingZone.id)
                  .where('serviceId', '==', serviceId)
                  .where('bracketId', '==', selectedBracket.id)
                  .limit(1)
                  .get();
                
                if (rateSnapshot.empty) {
                  console.warn(`[Calcul] ⚠️  Aucun tarif trouvé pour Zone ${matchingZone.code}, Service EXPRESS, ${selectedBracket.minWeight}kg`);
                } else {
                  const rateDoc = rateSnapshot.docs[0];
                  const rateData = rateDoc.data();
                  shippingPrice = rateData.price || 0;
                  console.log(`[Calcul] 🚚 Prix expédition: ${shippingPrice}€ (Zone ${matchingZone.code}, ${selectedBracket.minWeight}kg, ${countryCode})`);
                }
              }
            }
          }
        }
        }
      } catch (error) {
        console.error('[Calcul] ❌ Erreur lors du calcul du prix d\'expédition:', error.message);
        console.error('[Calcul] Stack:', error.stack);
      }
    } else {
      console.warn('[Calcul] ⚠️  Pas de destination renseignée, prix d\'expédition = 0€');
    }

    // 6. Assurance (paramètres configurables par compte : taux, seuil, min, arrondi)
    let insuranceAmount = 0;
    if (devis.options?.insurance && ocrResult.total) {
      insuranceAmount = await computeInsuranceAmountFromSettings(firestore, saasAccountId, ocrResult.total, true, 0);
    }

    // 7. Total
    const totalAmount = collectePrice + packagingPrice + shippingPrice + insuranceAmount;

    // 8. Mettre à jour le devis avec les données OCR et le calcul
    // Mapper les lots OCR vers le format auctionSheet (avec dimensions estimées)
    const mappedLots = lotsWithDimensions.map(lot => ({
      lotNumber: lot.numero_lot !== null && lot.numero_lot !== undefined ? String(lot.numero_lot) : null,
      description: lot.description || 'Description non disponible',
      value: typeof lot.prix_marteau === 'number' ? lot.prix_marteau : null,
      total: typeof lot.total === 'number' ? lot.total : null,
      estimatedDimensions: lot.estimatedDimensions || null
    }));

    // Préparer les données de mise à jour
    const updateData = {
      'lot.value': ocrResult.total || 0,
      'lot.auctionHouse': ocrResult.salle_vente || devis.lot?.auctionHouse || null,
      'options.packagingPrice': packagingPrice,
      'options.shippingPrice': shippingPrice,
      'options.insuranceAmount': insuranceAmount,
      totalAmount: totalAmount,
      status: 'calculated',
      // Mettre à jour auctionSheet avec les données OCR extraites (noms de champs cohérents avec le frontend)
      auctionSheet: {
        auctionHouse: ocrResult.salle_vente || null,
        bordereauNumber: ocrResult.numero_bordereau || null,
        date: ocrResult.date || null,
        totalValue: ocrResult.total || 0,
        totalLots: mappedLots.length,
        totalObjects: mappedLots.length, // Par défaut 1 objet par lot, à affiner si besoin
        lots: mappedLots,
        // Ajouter le carton recommandé si trouvé
        recommendedCarton: cartonInfo || null,
        // Ajouter les cartons multiples si applicable
        cartons: cartonsInfo.length > 0 ? cartonsInfo : null,
        packagingStrategy: packagingStrategy
      },
      // Ajouter les poids calculés
      'lot.weight': totalWeight,
      'lot.volumetricWeight': volumetricWeight,
      'lot.finalWeight': finalWeight,
      updatedAt: Timestamp.now(),
      timeline: FieldValue.arrayUnion({
        id: `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        date: Timestamp.now(),
        status: 'calculated',
        description: `Devis calculé automatiquement (Total: ${totalAmount}€, ${mappedLots.length} lots extraits${cartonsInfo.length > 0 ? `, ${cartonsInfo.length} carton(s)` : ''}${shippingPrice > 0 ? `, Expédition: ${shippingPrice}€` : ''})`
      })
    };

    // Ajouter les dimensions du premier lot si disponibles (pour compatibilité)
    if (lotsWithDimensions.length > 0 && lotsWithDimensions[0].estimatedDimensions) {
      const firstLotDims = lotsWithDimensions[0].estimatedDimensions;
      updateData['lot.dimensions'] = {
        length: firstLotDims.length,
        width: firstLotDims.width,
        height: firstLotDims.height,
        weight: firstLotDims.weight,
        estimated: true // Marquer comme estimé (pas mesuré)
      };
      console.log('[Calcul] 📏 Dimensions du premier lot ajoutées au devis:', firstLotDims);
    }

    // Ajouter l'ID du carton si trouvé
    if (cartonInfo) {
      updateData.cartonId = cartonInfo.id;
      console.log(`[Calcul] 📦 Carton ID ajouté au devis: ${cartonInfo.id}`);
    }

    // Ajouter les IDs de tous les cartons si multiples
    if (cartonsInfo.length > 1) {
      updateData.cartonIds = cartonsInfo.map(c => c.id);
      console.log(`[Calcul] 📦 ${cartonsInfo.length} carton IDs ajoutés au devis:`, updateData.cartonIds);
    }

    await firestore.collection('quotes').doc(devisId).update(updateData);

    console.log(`[Calcul] ✅ Devis ${devisId} calculé: ${totalAmount}€, ${mappedLots.length} lots extraits, ${cartonsInfo.length} carton(s) (${packagingPrice}€)${shippingPrice > 0 ? `, Expédition: ${shippingPrice}€` : ''}`);

    // 🔥 AUTO-GÉNÉRATION DU LIEN DE PAIEMENT
    // Conditions : emballage ET expédition calculés ; si le client a demandé l'assurance, elle doit être calculée aussi
    const hasPackagingAndShipping = packagingPrice > 0 && shippingPrice > 0;
    const clientWantsInsurance = devis.options?.insurance === true;
    const insuranceOk = !clientWantsInsurance || (clientWantsInsurance && insuranceAmount > 0);
    const shouldAutoGeneratePayment = hasPackagingAndShipping && insuranceOk && totalAmount > 0;
    
    if (shouldAutoGeneratePayment) {
      try {
        console.log(`[Calcul] 🔗 Conditions remplies pour auto-génération du lien de paiement`);
        
        // Réanalyse : annuler les anciens liens avant de régénérer
        await cancelPrincipalPaymentLinksForDevis(firestore, devisId, stripe);
        
        // Vérifier qu'il n'en reste pas (sécurité, normalement vides après annulation)
        const existingPaiementsSnapshot = await firestore
          .collection('paiements')
          .where('devisId', '==', devisId)
          .where('type', '==', 'PRINCIPAL')
          .where('status', '!=', 'CANCELLED')
          .limit(1)
          .get();
        
        if (!existingPaiementsSnapshot.empty) {
          console.log(`[Calcul] ⚠️  Un paiement PRINCIPAL existe encore pour ce devis, pas de génération automatique`);
        } else {
          // Récupérer le compte SaaS pour obtenir le stripeAccountId
          const saasAccountDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
          
          if (!saasAccountDoc.exists) {
            console.error(`[Calcul] ❌ Compte SaaS ${saasAccountId} non trouvé`);
          } else {
            const saasAccount = saasAccountDoc.data();
            const stripeAccountId = saasAccount.integrations?.stripe?.stripeAccountId;
            const paymentConfig = await getPaymentProviderConfig(firestore, saasAccountId);
            const usePaytweak = paymentConfig?.hasCustomPaytweak && paymentConfig?.paymentProvider === 'paytweak' && paymentConfig?.paytweakConfigured;

            if (usePaytweak) {
              try {
                const baseUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'https://staging.mbe-sdv.fr';
                const clientName = devis.client?.name || 'Client';
                const bordereauNumber = ocrResult.numero_bordereau || '';
                const auctionHouse = ocrResult.salle_vente || '';
                const descriptionParts = [clientName];
                if (bordereauNumber) descriptionParts.push(bordereauNumber);
                if (auctionHouse) descriptionParts.push(auctionHouse);
                const description = descriptionParts.join(' | ');
                const paytweakResult = await createPaytweakLinkForAccount(firestore, saasAccountId, {
                  amount: totalAmount,
                  currency: 'EUR',
                  reference: devis.reference || devisId,
                  description: description || `Devis ${devis.reference || devisId} - PRINCIPAL`,
                  customer: {
                    name: devis.client?.name || '',
                    email: devis.client?.email || '',
                    phone: devis.client?.phone || '',
                  },
                  devisId,
                  quote: devis,
                }, baseUrl);
                const paiementRef = await firestore.collection('paiements').add({
                  devisId,
                  amount: totalAmount,
                  type: 'PRINCIPAL',
                  status: 'PENDING',
                  url: paytweakResult.url,
                  saasAccountId,
                  paymentProvider: 'paytweak',
                  createdAt: Timestamp.now(),
                  updatedAt: Timestamp.now(),
                });
                const devisDoc = await firestore.collection('quotes').doc(devisId).get();
                const existingLinks = devisDoc.exists ? (devisDoc.data().paymentLinks || []) : [];
                await firestore.collection('quotes').doc(devisId).update({
                  paymentLinks: [...existingLinks, { id: paiementRef.id, url: paytweakResult.url, amount: totalAmount, createdAt: new Date().toISOString(), status: 'active' }],
                  status: 'awaiting_payment',
                  timeline: FieldValue.arrayUnion({ id: `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, date: Timestamp.now(), status: 'calculated', description: `Lien Paytweak généré automatiquement (${totalAmount}€)`, user: 'Système Automatisé' }),
                  updatedAt: Timestamp.now(),
                });
                console.log(`[Calcul] ✅ Lien Paytweak auto-généré: ${paytweakResult.url}`);
              } catch (paytweakErr) {
                console.error('[Calcul] ❌ Erreur Paytweak auto-génération:', paytweakErr);
              }
            } else if (!stripeAccountId) {
              console.log(`[Calcul] ⚠️  Compte Stripe non connecté pour le compte SaaS ${saasAccountId}, pas de génération automatique`);
            } else if (!stripe) {
              console.error(`[Calcul] ❌ Stripe non configuré (STRIPE_SECRET_KEY manquante)`);
            } else {
              // Créer une Checkout Session Stripe
              const clientName = devis.client?.name || 'Client';
              const bordereauNumber = ocrResult.numero_bordereau || '';
              const auctionHouse = ocrResult.salle_vente || '';
              
              const descriptionParts = [clientName];
              if (bordereauNumber) descriptionParts.push(bordereauNumber);
              if (auctionHouse) descriptionParts.push(auctionHouse);
              const description = descriptionParts.join(' | ');
              
              const session = await stripe.checkout.sessions.create(
                {
                  mode: 'payment',
                  line_items: [
                    {
                      price_data: {
                        currency: 'eur',
                        product_data: {
                          name: description || `Devis ${devis.reference || devisId} - PRINCIPAL`,
                        },
                        unit_amount: Math.round(totalAmount * 100), // en centimes
                      },
                      quantity: 1,
                    },
                  ],
                  success_url: `${APP_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
                  cancel_url: `${APP_URL}/payment/cancel`,
                  metadata: {
                    devisId,
                    paiementType: 'PRINCIPAL',
                    saasAccountId: saasAccountId,
                  },
                },
                {
                  stripeAccount: stripeAccountId, // CRUCIAL: paiement sur le compte connecté
                }
              );
              
              // Sauvegarder le paiement dans Firestore
              const paiementRef = await firestore.collection('paiements').add({
                devisId,
                stripeSessionId: session.id,
                stripeAccountId,
                amount: totalAmount,
                type: 'PRINCIPAL',
                status: 'PENDING',
                url: session.url,
                saasAccountId,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
              });
              
              console.log(`[Calcul] ✅ Lien de paiement auto-généré: ${session.url} (ID: ${paiementRef.id})`);
              
              // Mettre à jour paymentLinks du devis (comme stripe-connect)
              const devisDoc = await firestore.collection('quotes').doc(devisId).get();
              const existingLinks = devisDoc.exists ? (devisDoc.data().paymentLinks || []) : [];
              const newPaymentLink = {
                id: paiementRef.id,
                url: session.url,
                amount: totalAmount,
                createdAt: new Date().toISOString(),
                status: 'active',
              };
              await firestore.collection('quotes').doc(devisId).update({
                paymentLinks: [...existingLinks, newPaymentLink],
                status: 'awaiting_payment',
                timeline: FieldValue.arrayUnion({
                  id: `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  date: Timestamp.now(),
                  status: 'calculated',
                  description: `Lien de paiement généré automatiquement (${totalAmount}€)`,
                  user: 'Système Automatisé'
                }),
                updatedAt: Timestamp.now()
              });
            }
          }
        }
      } catch (autoPaymentError) {
        console.error('[Calcul] ❌ Erreur lors de la génération automatique du lien de paiement:', autoPaymentError);
        // Ne pas bloquer le reste du processus si la génération du paiement échoue
      }
    } else {
      const reason = !hasPackagingAndShipping
        ? `emballage (${packagingPrice}€) et/ou expédition (${shippingPrice}€) non calculés`
        : !insuranceOk
          ? `assurance demandée mais non calculée (${insuranceAmount}€)`
          : `total = 0`;
      console.log(`[Calcul] ⚠️  Conditions non remplies pour auto-génération: ${reason}`);
    }
  } catch (error) {
    console.error('[Calcul] Erreur:', error);
  }
}

// OPTIMISATION: Augmenter l'intervalle de polling pour réduire les lectures Firestore
// Passer de 90 secondes à 5 minutes (300 secondes)
if (firestore && googleSheetsOAuth2Client) {
  console.log('[Google Sheets Sync] ✅ Polling Google Sheets activé (toutes les 5 minutes)');
  setInterval(syncAllGoogleSheets, 300_000); // 5 minutes au lieu de 90 secondes
  // Première synchronisation après 30 secondes (au lieu de 10)
  setTimeout(syncAllGoogleSheets, 30_000);
} else {
  console.warn('[Google Sheets Sync] ⚠️  Polling Google Sheets désactivé (Firestore ou OAuth non configuré)');
}

// ============================================================================
// NETTOYAGE DEVIS REFUSÉS > 6 MOIS (suppression Firestore, conservés dans Bilan Sheet)
// ============================================================================
const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
async function cleanupOldRefusedQuotes() {
  if (!firestore) return;
  try {
    const cutoff = Timestamp.fromMillis(Date.now() - SIX_MONTHS_MS);
    const snap = await firestore.collection('quotes')
      .where('clientRefusalStatus', '==', 'client_refused')
      .where('clientRefusalAt', '<', cutoff)
      .get();
    if (snap.empty) return;
    const batch = firestore.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`[Cleanup] ✅ ${snap.size} devis refusé(s) supprimé(s) (> 6 mois)`);
  } catch (e) {
    if (e.code === 9) {
      console.warn('[Cleanup] Index Firestore manquant pour clientRefusalStatus/clientRefusalAt - ignorer');
    } else {
      console.error('[Cleanup] Erreur:', e?.message);
    }
  }
}
if (firestore) {
  setInterval(cleanupOldRefusedQuotes, 24 * 60 * 60 * 1000);
  setTimeout(cleanupOldRefusedQuotes, 60_000);
}

console.log('[AI Proxy] Routes /api/test et /api/health définies');

const PORT = process.env.PORT || 5174;

// ==========================================
// ROUTES STRIPE CONNECT
// ==========================================

// OAuth Stripe Connect - Génération URL
app.post("/api/stripe/connect", requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 POST /api/stripe/connect appelé');
  handleStripeConnect(req, res);
});

// OAuth Stripe Connect - Callback
app.get("/stripe/callback", (req, res) => {
  console.log('[AI Proxy] 📥 GET /stripe/callback appelé');
  handleStripeCallback(req, res, firestore);
});

// Route de redirection après paiement Stripe réussi
app.get("/payment/success", (req, res) => {
  console.log('[AI Proxy] 📥 GET /payment/success appelé');
  const sessionId = req.query.session_id;
  const ref = req.query.ref;
  const amount = req.query.amount;
  
  // Rediriger vers le frontend avec les paramètres
  const frontendUrl = FRONTEND_URL || "http://localhost:8080";
  const params = new URLSearchParams();
  if (sessionId) params.append('session_id', sessionId);
  if (ref) params.append('ref', ref);
  if (amount) params.append('amount', amount);
  
  const redirectUrl = `${frontendUrl}/payment/success${params.toString() ? '?' + params.toString() : ''}`;
  console.log('[AI Proxy] 🔀 Redirection vers:', redirectUrl);
  res.redirect(redirectUrl);
});

// Route de redirection après annulation de paiement
app.get("/payment/cancel", (req, res) => {
  console.log('[AI Proxy] 📥 GET /payment/cancel appelé');
  const ref = req.query.ref;
  
  // Rediriger vers le frontend
  const frontendUrl = FRONTEND_URL || "http://localhost:8080";
  const params = new URLSearchParams();
  if (ref) params.append('ref', ref);
  
  const redirectUrl = `${frontendUrl}/payment/cancel${params.toString() ? '?' + params.toString() : ''}`;
  console.log('[AI Proxy] 🔀 Redirection vers:', redirectUrl);
  res.redirect(redirectUrl);
});

// Vérifier le statut de connexion Stripe
app.get("/api/stripe/status", requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 GET /api/stripe/status appelé');
  handleStripeStatus(req, res, firestore);
});

// Déconnecter un compte Stripe
app.post("/api/stripe/disconnect", requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 POST /api/stripe/disconnect appelé');
  handleStripeDisconnect(req, res, firestore);
});

// Créer un paiement pour un devis
app.post("/api/devis/:id/paiement", requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 POST /api/devis/:id/paiement appelé');
  handleCreatePaiement(req, res, firestore);
});

// Récupérer les paiements d'un devis
app.get("/api/devis/:id/paiements", (req, res) => {
  console.log('[AI Proxy] 📥 GET /api/devis/:id/paiements appelé');
  handleGetPaiements(req, res, firestore);
});

// Créer un paiement pour un groupe d'expédition
app.post("/api/shipment-groups/:id/paiement", (req, res) => {
  console.log('[AI Proxy] 📥 POST /api/shipment-groups/:id/paiement appelé');
  handleCreateGroupPaiement(req, res, firestore);
});

// Annuler un paiement
app.post("/api/paiement/:id/cancel", (req, res) => {
  console.log('[AI Proxy] 📥 POST /api/paiement/:id/cancel appelé');
  handleCancelPaiement(req, res, firestore);
});

// Synchroniser le montant du lien de paiement avec le total du devis
app.post("/api/devis/:id/sync-payment-amount", requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 POST /api/devis/:id/sync-payment-amount appelé');
  handleSyncPaymentAmount(req, res, firestore);
});

// ===== ROUTES NOTIFICATIONS =====

// Récupérer les notifications d'un client (authentification requise)
app.get("/api/notifications", requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 GET /api/notifications appelé');
  handleGetNotifications(req, res, firestore);
});

// Compter les notifications d'un client (authentification requise)
app.get("/api/notifications/count", requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 GET /api/notifications/count appelé');
  handleGetNotificationsCount(req, res, firestore);
});

// Supprimer une notification (marquer comme lue) (authentification requise)
app.delete("/api/notifications/:id", requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 DELETE /api/notifications/:id appelé');
  handleDeleteNotification(req, res, firestore);
});

// ===== MIDDLEWARE D'AUTHENTIFICATION =====

/**
 * Cache en mémoire pour éviter de lire Firestore à chaque requête
 * Structure: { uid: { saasAccountId, timestamp } }
 * TTL: 5 minutes
 */
const saasAccountCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Middleware requireAuth
 * Vérifie que l'utilisateur est authentifié via Firebase Auth
 * Ajoute req.uid, req.user et req.saasAccountId au request
 * 
 * OPTIMISATION: Utilise un cache en mémoire pour éviter de lire Firestore à chaque requête
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token d\'authentification manquant' });
    }

    const token = authHeader.split('Bearer ')[1];
    if (!firestore) {
      return res.status(500).json({ error: 'Firebase Admin non initialisé' });
    }

    // Vérifier le token avec Firebase Admin
    const auth = getAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (verifyErr) {
      console.error('[requireAuth] verifyIdToken échoué:', verifyErr.code || verifyErr.message, '| detail:', JSON.stringify(verifyErr));
      return res.status(401).json({ error: verifyErr.message || 'Token invalide ou expiré' });
    }
    
    req.uid = decodedToken.uid;
    req.user = decodedToken;
    
    // Vérifier le cache d'abord
    const cached = saasAccountCache.get(decodedToken.uid);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      // Utiliser le cache
      req.saasAccountId = cached.saasAccountId;
      req.teamMemberId = cached.teamMemberId || null;
      req.userDoc = cached.userDoc || null;
      return next();
    }
    
    // Cache expiré ou inexistant, lire Firestore
    try {
      const userDoc = await firestore.collection('users').doc(decodedToken.uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        req.saasAccountId = userData.saasAccountId || null;
        req.teamMemberId = userData.teamMemberId || null;
        req.userDoc = userData;
        
        // Mettre en cache
        saasAccountCache.set(decodedToken.uid, {
          saasAccountId: req.saasAccountId,
          teamMemberId: req.teamMemberId,
          userDoc: req.userDoc,
          timestamp: now
        });
        
        if (req.saasAccountId) {
          console.log(`[requireAuth] ✅ saasAccountId récupéré et mis en cache: ${req.saasAccountId}`);
        } else {
          console.warn(`[requireAuth] ⚠️  Utilisateur ${decodedToken.uid} sans saasAccountId`);
        }
      } else {
        console.warn(`[requireAuth] ⚠️  Document user non trouvé pour ${decodedToken.uid}`);
        req.saasAccountId = null;
        req.teamMemberId = null;
        req.userDoc = null;
      }
    } catch (error) {
      console.error('[requireAuth] Erreur récupération saasAccountId:', error);
      req.saasAccountId = null;
    }
    
    next();
  } catch (error) {
    console.error('[requireAuth] Erreur vérification token:', error);
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

/**
 * Fonction pour invalider le cache d'un utilisateur
 * À appeler quand le saasAccountId d'un utilisateur change
 */
function invalidateSaasAccountCache(uid) {
  saasAccountCache.delete(uid);
  console.log(`[requireAuth] 🗑️  Cache invalidé pour uid: ${uid}`);
}

/**
 * Middleware optionnel : vérifie la permission zone/action pour les team members.
 * Si pas de teamMemberId (owner) → autorise tout.
 */
function requireTeamPermission(zone, action) {
  return async (req, res, next) => {
    if (!req.saasAccountId) return res.status(400).json({ error: 'Compte SaaS non configuré' });
    if (!req.teamMemberId) return next(); // Owner → tout autorisé
    try {
      const memberSnap = await firestore
        .collection('saasAccounts')
        .doc(req.saasAccountId)
        .collection('teamMembers')
        .doc(req.teamMemberId)
        .get();
      if (!memberSnap.exists) return res.status(403).json({ error: 'Accès refusé' });
      const member = memberSnap.data();
      if (member.isOwner) return next(); // Owner profile
      const actions = member.permissions?.[zone] || [];
      if (!actions.includes(action)) {
        return res.status(403).json({ error: 'Permission insuffisante' });
      }
      next();
    } catch (err) {
      console.error('[requireTeamPermission]', err);
      return res.status(500).json({ error: 'Erreur vérification permissions' });
    }
  };
}

// ===== ROUTES TEAM (CRUD members) =====

app.get('/api/team/members', requireAuth, requireTeamPermission('team', 'read'), async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte non configuré' });
  try {
    const snap = await firestore.collection('saasAccounts').doc(req.saasAccountId).collection('teamMembers').get();
    const members = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        username: data.username,
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        isOwner: !!data.isOwner,
        isActive: data.isActive !== false,
        permissions: data.permissions || {},
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt,
        createdBy: data.createdBy,
      };
    });
    return res.json(members);
  } catch (err) {
    console.error('[GET /api/team/members]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/team/members', requireAuth, requireTeamPermission('team', 'create'), async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte non configuré' });
  const { username, password, firstName, lastName, permissions } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username et password requis' });
  try {
    const saasDoc = await firestore.collection('saasAccounts').doc(req.saasAccountId).get();
    if (!saasDoc.exists) return res.status(404).json({ error: 'Compte non trouvé' });
    const planId = (saasDoc.data().planId || saasDoc.data().plan || 'starter').toLowerCase();
    const maxMembers = planId === 'ultra' ? 999 : planId === 'pro' ? 2 : 0;
    const membersSnap = await firestore.collection('saasAccounts').doc(req.saasAccountId).collection('teamMembers').where('isActive', '==', true).get();
    const memberCount = membersSnap.docs.filter((d) => !d.data().isOwner).length;
    if (memberCount >= maxMembers) {
      return res.status(400).json({ error: `Limite atteinte (${maxMembers} membre(s) pour le plan ${planId})` });
    }
    const existing = await firestore.collection('saasAccounts').doc(req.saasAccountId).collection('teamMembers').where('username', '==', username.trim()).limit(1).get();
    if (!existing.empty) return res.status(400).json({ error: 'Ce nom d\'utilisateur existe déjà' });
    const passwordHash = await bcrypt.hash(password, 10);
    const memberRef = firestore.collection('saasAccounts').doc(req.saasAccountId).collection('teamMembers').doc();
    const memberData = {
      username: username.trim(),
      passwordHash,
      firstName: (firstName || '').trim(),
      lastName: (lastName || '').trim(),
      isOwner: false,
      isActive: true,
      permissions: permissions || {},
      createdAt: Timestamp.now(),
      createdBy: req.uid,
    };
    await memberRef.set(memberData);
    return res.json({
      id: memberRef.id,
      username: memberData.username,
      firstName: memberData.firstName,
      lastName: memberData.lastName,
      isOwner: false,
      isActive: true,
      permissions: memberData.permissions,
      createdAt: memberData.createdAt.toDate().toISOString(),
    });
  } catch (err) {
    console.error('[POST /api/team/members]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.put('/api/team/members/:id', requireAuth, requireTeamPermission('team', 'update'), async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte non configuré' });
  const { id } = req.params;
  const { firstName, lastName, password, permissions, isActive } = req.body || {};
  const memberRef = firestore.collection('saasAccounts').doc(req.saasAccountId).collection('teamMembers').doc(id);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) return res.status(404).json({ error: 'Membre non trouvé' });
  const memberData = memberSnap.data();
  if (memberData.isOwner && req.teamMemberId && req.teamMemberId !== id) {
    return res.status(403).json({ error: 'Impossible de modifier le profil propriétaire ainsi' });
  }
  try {
    const updates = {};
    if (firstName !== undefined) updates.firstName = String(firstName).trim();
    if (lastName !== undefined) updates.lastName = String(lastName).trim();
    if (permissions !== undefined) updates.permissions = permissions;
    if (isActive !== undefined) updates.isActive = !!isActive;
    if (password && String(password).length >= 6) {
      updates.passwordHash = await bcrypt.hash(password, 10);
    }
    if (Object.keys(updates).length === 0) return res.json(memberSnap.data());
    updates.updatedAt = Timestamp.now();
    await memberRef.update(updates);
    const updated = await memberRef.get();
    const d = updated.data();
    return res.json({
      id: updated.id,
      username: d.username,
      firstName: d.firstName || '',
      lastName: d.lastName || '',
      isOwner: !!d.isOwner,
      isActive: d.isActive !== false,
      permissions: d.permissions || {},
    });
  } catch (err) {
    console.error('[PUT /api/team/members]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/team/members/:id', requireAuth, requireTeamPermission('team', 'delete'), async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte non configuré' });
  const { id } = req.params;
  const memberRef = firestore.collection('saasAccounts').doc(req.saasAccountId).collection('teamMembers').doc(id);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) return res.status(404).json({ error: 'Membre non trouvé' });
  if (memberSnap.data().isOwner) return res.status(400).json({ error: 'Impossible de supprimer le profil propriétaire' });
  try {
    await memberRef.update({ isActive: false, updatedAt: Timestamp.now() });
    return res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/team/members]', err);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ===== ROUTES COMPTES SAAS =====

/**
 * POST /api/saas-account/create
 * Crée un compte SaaS (MBE) et le document user associé
 * Nécessite authentification
 */
app.post("/api/saas-account/create", requireAuth, async (req, res) => {
  try {
    console.log('[AI Proxy] 📥 POST /api/saas-account/create appelé');
    
    if (!firestore) {
      return res.status(500).json({ error: 'Firestore non initialisé' });
    }

    const uid = req.uid;
    const {
      commercialName,
      mbeNumber,
      mbeCity,
      mbeCityCustom,
      address,
      phone,
      email,
      planId: requestedPlanId,
    } = req.body;

    // Validation
    if (!commercialName || !mbeNumber || !mbeCity) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    if (!address || !address.street || !address.city || !address.zip) {
      return res.status(400).json({ error: 'Adresse incomplète' });
    }

    if (!phone || !email) {
      return res.status(400).json({ error: 'Coordonnées de contact manquantes' });
    }

    // Vérifier l'unicité du numéro MBE
    console.log('[AI Proxy] Étape 1/5: Vérification unicité MBE...');
    const existingSaasAccounts = await firestore
      .collection('saasAccounts')
      .where('mbeNumber', '==', mbeNumber)
      .get();

    if (!existingSaasAccounts.empty) {
      return res.status(400).json({ error: 'Ce numéro MBE est déjà utilisé' });
    }

    // Vérifier si l'utilisateur a déjà un compte SaaS
    console.log('[AI Proxy] Étape 2/5: Vérification user existant...');
    const existingUser = await firestore.collection('users').doc(uid).get();
    if (existingUser.exists && existingUser.data().saasAccountId) {
      return res.status(400).json({ error: 'Vous avez déjà un compte SaaS' });
    }

    // Créer le saasAccount
    const saasAccountRef = firestore.collection('saasAccounts').doc();
    const saasAccountData = {
      ownerUid: uid,
      commercialName,
      mbeNumber,
      mbeCity: mbeCityCustom || mbeCity,
      mbeCityCustom: mbeCity === 'Autre' ? mbeCityCustom : null,
      address: {
        street: address.street,
        city: address.city,
        zip: address.zip,
        country: address.country || 'France',
      },
      phone,
      email,
      emailLower: (email || '').trim().toLowerCase(),
      createdAt: Timestamp.now(),
      isActive: true,
      plan: 'free',
      planId: ['starter', 'pro', 'ultra'].includes(requestedPlanId) ? requestedPlanId : 'starter',
      customFeatures: {},
      usage: { quotesUsedThisYear: 0 },
      billingPeriod: (() => {
        const now = new Date();
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        return {
          yearStart: yearStart.toISOString(),
          yearEnd: yearEnd.toISOString(),
        };
      })(),
    };

    console.log('[AI Proxy] Étape 3/5: Création saasAccount...');
    await saasAccountRef.set(saasAccountData);
    const saasAccountId = saasAccountRef.id;

    // Créer ou mettre à jour le document user
    const userData = {
      uid,
      saasAccountId,
      role: 'owner',
      createdAt: Timestamp.now(),
    };

    console.log('[AI Proxy] Étape 4/5: Création document user...');
    await firestore.collection('users').doc(uid).set(userData, { merge: true });

    console.log('[AI Proxy] Étape 5/5: Initialisation grille tarifaire...');

    // Initialiser la grille tarifaire d'expédition
    try {
      const { initializeShippingRatesIfNeeded } = await import('./init-shipping-data.js');
      await initializeShippingRatesIfNeeded(saasAccountId);
      console.log('[AI Proxy] ✅ Grille tarifaire initialisée pour:', saasAccountId);
    } catch (error) {
      console.error('[AI Proxy] ⚠️  Erreur initialisation grille tarifaire:', error.message);
      // Ne pas bloquer la création du compte si l'initialisation échoue
    }

    return res.json({
      success: true,
      saasAccountId,
      message: 'Compte SaaS créé avec succès',
    });
  } catch (error) {
    console.error('[AI Proxy] ❌ Erreur création compte SaaS:', error);
    // NOT_FOUND (code 5) = base Firestore non créée ou mal configurée
    const isNotFound = error?.code === 5 || error?.message?.includes('NOT_FOUND');
    const userMessage = isNotFound
      ? 'La base de données Firestore n\'est pas configurée. Allez dans la console Firebase (Build → Firestore Database) et créez la base de données si nécessaire.'
      : (error.message || 'Erreur lors de la création du compte');
    return res.status(500).json({ error: userMessage });
  }
});

/**
 * DELETE /api/account
 * Supprime toutes les données du compte (Firestore) - pour les tests de création de compte.
 * L'utilisateur doit ensuite supprimer son compte Firebase Auth côté frontend.
 */
app.delete("/api/account", requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }
  const uid = req.uid;
  let saasAccountId = req.saasAccountId;

  // Fallback: si le backend n'a pas trouvé le saasAccountId (cache, projet Firestore différent),
  // accepter X-Saas-Account-Id du frontend après vérification ownerUid
  if (!saasAccountId) {
    const headerId = req.headers['x-saas-account-id'];
    if (headerId) {
      try {
        const saasDoc = await firestore.collection('saasAccounts').doc(headerId).get();
        if (saasDoc.exists && saasDoc.data()?.ownerUid === uid) {
          saasAccountId = headerId;
          console.log(`[API] saasAccountId récupéré via header X-Saas-Account-Id (vérifié ownerUid): ${saasAccountId}`);
        }
      } catch (e) {
        console.warn('[API] Erreur vérification fallback saasAccountId:', e.message);
      }
    }
  }
  if (!saasAccountId) {
    return res.status(400).json({ error: 'Aucun compte SaaS associé' });
  }

  try {
    const BATCH_SIZE = 400; // Firestore batch limit 500
    let totalDeleted = 0;

    const deleteQueryBatch = async (query) => {
      const snapshot = await query.limit(BATCH_SIZE).get();
      if (snapshot.empty) return 0;
      const batch = firestore.batch();
      snapshot.docs.forEach((doc) => { batch.delete(doc.ref); });
      await batch.commit();
      return snapshot.size;
    };

    // 1. Paiements (liés aux devis du compte)
    const quotesSnap = await firestore.collection('quotes').where('saasAccountId', '==', saasAccountId).get();
    const quoteIds = quotesSnap.docs.map((d) => d.id);
    for (const devisId of quoteIds) {
      const paiementsSnap = await firestore.collection('paiements').where('devisId', '==', devisId).get();
      const batch = firestore.batch();
      paiementsSnap.docs.forEach((d) => batch.delete(d.ref));
      if (!paiementsSnap.empty) await batch.commit();
      totalDeleted += paiementsSnap.size;
    }

    // 2. Quotes
    let quotesQuery = firestore.collection('quotes').where('saasAccountId', '==', saasAccountId);
    while (true) {
      const n = await deleteQueryBatch(quotesQuery);
      totalDeleted += n;
      if (n < BATCH_SIZE) break;
    }

    // 3. Notifications
    const notifSnap = await firestore.collection('notifications').where('clientSaasId', '==', saasAccountId).get();
    if (!notifSnap.empty) {
      const batch = firestore.batch();
      notifSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      totalDeleted += notifSnap.size;
    }

    // 4. Autres collections par saasAccountId
    const collections = [
      { name: 'auctionHouses', field: 'saasAccountId' },
      { name: 'cartons', field: 'saasAccountId' },
      { name: 'shipmentGroups', field: 'saasAccountId' },
      { name: 'shippingZones', field: 'saasAccountId' },
      { name: 'shippingServices', field: 'saasAccountId' },
      { name: 'weightBrackets', field: 'saasAccountId' },
      { name: 'shippingRates', field: 'saasAccountId' },
      { name: 'shippingSettings', field: 'saasAccountId' },
    ];
    for (const { name, field } of collections) {
      let q = firestore.collection(name).where(field, '==', saasAccountId);
      while (true) {
        const n = await deleteQueryBatch(q);
        totalDeleted += n;
        if (n < BATCH_SIZE) break;
      }
    }

    // 5. Bordereaux
    let bordQ = firestore.collection('bordereaux').where('saasAccountId', '==', saasAccountId);
    while (true) {
      const n = await deleteQueryBatch(bordQ);
      totalDeleted += n;
      if (n < BATCH_SIZE) break;
    }

    // 6. EmailMessages (si liés au saasAccountId)
    try {
      const emailMsgSnap = await firestore.collection('emailMessages').where('saasAccountId', '==', saasAccountId).get();
      if (!emailMsgSnap.empty) {
        const batch = firestore.batch();
        emailMsgSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        totalDeleted += emailMsgSnap.size;
      }
    } catch (e) {
      console.warn('[API] emailMessages delete skipped:', e.message);
    }

    // 7. saasAccount
    await firestore.collection('saasAccounts').doc(saasAccountId).delete();
    totalDeleted += 1;

    // 8. user
    await firestore.collection('users').doc(uid).delete();
    totalDeleted += 1;

    invalidateSaasAccountCache(uid);
    console.log(`[API] ✅ Compte supprimé: uid=${uid}, saasAccountId=${saasAccountId}, ${totalDeleted} docs`);
    return res.json({ success: true, deleted: totalDeleted });
  } catch (error) {
    console.error('[API] Erreur suppression compte:', error);
    return res.status(500).json({ error: error.message || 'Erreur lors de la suppression' });
  }
});

// Map planId → Stripe Price ID (variables d'environnement)
const PLAN_PRICE_IDS = {
  starter: process.env.STRIPE_PRICE_STARTER,
  pro: process.env.STRIPE_PRICE_PRO,
  ultra: process.env.STRIPE_PRICE_ULTRA,
};

/**
 * GET /api/stripe/promo-codes-status
 * Diagnostic : liste les codes promo visibles par le backend (même compte que STRIPE_SECRET_KEY).
 * Retourne aussi le mode de la clé (Test vs Live) — les codes ne sont pas partagés entre les deux.
 */
app.get("/api/stripe/promo-codes-status", requireAuth, async (req, res) => {
  if (!stripe) {
    return res.json({ ok: false, error: 'Stripe non configuré' });
  }
  const sk = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET || '';
  const keyMode = sk.startsWith('sk_test_') ? 'test' : sk.startsWith('sk_live_') ? 'live' : 'unknown';
  try {
    const [promoRes, couponsRes] = await Promise.all([
      stripe.promotionCodes.list({ active: true, limit: 50 }),
      stripe.coupons.list({ limit: 50 }),
    ]);
    const codes = promoRes.data.map((p) => ({ code: p.code, id: p.id }));
    const couponsCount = couponsRes.data.length;
    let hint;
    if (codes.length > 0) {
      hint = 'Ces codes sont visibles. Si le vôtre manque, il est peut-être dans l\'autre mode (Test vs Live).';
    } else if (couponsCount > 0) {
      const base = keyMode === 'test' ? 'https://dashboard.stripe.com/test' : 'https://dashboard.stripe.com';
      hint = `Vous avez ${couponsCount} coupon(s) mais aucun CODE PROMOTIONNEL. Un coupon seul ne suffit pas : il faut créer un code à partir du coupon. Stripe Dashboard → ${base}/coupons → Clique sur un coupon → « Créer un code promotionnel » / « Add promotion code » et saisissez votre code (ex: JEANNE).`;
    } else {
      hint = `Aucun coupon ni code en mode ${keyMode.toUpperCase()}. 1) Basculez « Mode test » dans Stripe (coin supérieur droit) si vous utilisez sk_test_*. 2) Créez un coupon puis un code promotionnel : ${keyMode === 'test' ? 'https://dashboard.stripe.com/test/coupons' : 'https://dashboard.stripe.com/coupons'}`;
    }
    return res.json({
      ok: true,
      count: codes.length,
      codes,
      couponsCount,
      keyMode,
      hint,
    });
  } catch (err) {
    return res.json({ ok: false, error: err.message, keyMode });
  }
});

/**
 * POST /api/account/plan/checkout
 * Crée une session Stripe Checkout pour abonnement plan (1er mois gratuit).
 */
app.post("/api/account/plan/checkout", requireAuth, async (req, res) => {
  if (!stripe || !firestore) {
    return res.status(500).json({ error: 'Stripe ou Firestore non configuré' });
  }
  const saasAccountId = req.saasAccountId;
  if (!saasAccountId) {
    return res.status(400).json({ error: 'Aucun compte SaaS associé' });
  }
  const { planId, fromOnboarding, promoCode } = req.body;
  // #region agent log
  try { fetch('http://127.0.0.1:7614/ingest/0bfbd811-2706-4d7c-9d97-3770fc92a237',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'223b02'},body:JSON.stringify({sessionId:'223b02',location:'ai-proxy.js:checkout',message:'Backend reçoit checkout',data:{promoCodeBody:promoCode,planId},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{}); } catch(e){}
  // #endregion
  if (!planId || !['starter', 'pro', 'ultra'].includes(planId)) {
    return res.status(400).json({ error: 'Plan invalide' });
  }
  const priceId = (PLAN_PRICE_IDS[planId] || '').trim();
  if (!priceId) {
    return res.status(400).json({ error: `Price ID non configuré pour le plan ${planId}` });
  }
  // Stripe attend un Price ID (price_xxx), pas un Product ID (prod_xxx)
  if (priceId.startsWith('prod_')) {
    return res.status(400).json({
      error: `Configuration incorrecte : utilisez un Price ID (price_xxx) pour STRIPE_PRICE_${planId.toUpperCase()}, pas un Product ID (prod_xxx). Dans Stripe → Produit → Add price → copier le Price ID.`,
    });
  }
  const isOnboarding = !!fromOnboarding;
  const successUrl = isOnboarding ? `${FRONTEND_URL}/onboarding/success` : `${FRONTEND_URL}/account?plan=success`;
  const cancelUrl = isOnboarding ? `${FRONTEND_URL}/choose-plan` : `${FRONTEND_URL}/account`;

  let discounts = null;
  const rawPromoCode = (promoCode || '').trim();
  if (rawPromoCode) {
    try {
      let foundPromo = null;
      const promoList = await stripe.promotionCodes.list({ code: rawPromoCode, active: true, limit: 10 });
      if (promoList.data.length > 0) {
        foundPromo = promoList.data[0];
      } else {
        const inactiveList = await stripe.promotionCodes.list({ code: rawPromoCode, limit: 10 });
        if (inactiveList.data.length > 0) {
          return res.status(400).json({ error: 'Ce code promo n\'est plus actif (expiré ou désactivé).' });
        }
        const allPromos = await stripe.promotionCodes.list({ active: true, limit: 100 });
        const match = allPromos.data.find((p) => (String(p.code || '').toLowerCase()) === rawPromoCode.toLowerCase());
        if (match) foundPromo = match;
        else {
          console.warn('[ai-proxy] Code promo non trouvé côté API:', JSON.stringify(rawPromoCode), '| codes actifs:', allPromos.data.length);
        }
      }
      if (foundPromo) {
        discounts = [{ promotion_code: foundPromo.id }];
        console.log('[ai-proxy] Code promo appliqué:', rawPromoCode, '→', foundPromo.id);
      }
      // #region agent log
      try { fetch('http://127.0.0.1:7614/ingest/0bfbd811-2706-4d7c-9d97-3770fc92a237',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'223b02'},body:JSON.stringify({sessionId:'223b02',location:'ai-proxy.js:promo',message:'Résultat recherche promo',data:{rawPromoCode,foundPromo:!!foundPromo,foundId:foundPromo?.id,discounts:!!discounts},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{}); } catch(e){}
      // #endregion
    } catch (promoErr) {
      console.error('[ai-proxy] Erreur recherche code promo:', promoErr.message);
    }
  }

  try {
    const metadata = { saasAccountId, planId, type: 'plan_subscription' };
    console.log('[ai-proxy] 🛒 Création session Checkout plan - saasAccountId:', saasAccountId, 'planId:', planId, 'fromOnboarding:', isOnboarding, 'promoCode:', rawPromoCode || 'aucun', 'metadata:', JSON.stringify(metadata));
    const sessionParams = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { saasAccountId, planId },
      },
      allow_promotion_codes: !discounts,
      metadata,
      success_url: successUrl,
      cancel_url: cancelUrl,
    };
    if (discounts) sessionParams.discounts = discounts;
    // #region agent log
    try { fetch('http://127.0.0.1:7614/ingest/0bfbd811-2706-4d7c-9d97-3770fc92a237',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'223b02'},body:JSON.stringify({sessionId:'223b02',location:'ai-proxy.js:sessionCreate',message:'Paramètres session Stripe',data:{hasDiscounts:!!discounts,allowPromotionCodes:sessionParams.allow_promotion_codes},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{}); } catch(e){}
    // #endregion
    const session = await stripe.checkout.sessions.create(sessionParams);
    console.log('[ai-proxy] 🛒 Session créée:', session.id);
    return res.json({ url: session.url });
  } catch (error) {
    console.error('[API] Erreur checkout plan:', error);
    return res.status(500).json({ error: error.message || 'Erreur Stripe' });
  }
});

/**
 * PATCH /api/account/plan
 * Met à jour le plan du compte SaaS (upgrade/downgrade) — mode direct sans paiement.
 */
app.patch("/api/account/plan", requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }
  const saasAccountId = req.saasAccountId;
  if (!saasAccountId) {
    return res.status(400).json({ error: 'Aucun compte SaaS associé' });
  }
  const { planId } = req.body;
  if (!planId || !['starter', 'pro', 'ultra'].includes(planId)) {
    return res.status(400).json({ error: 'Plan invalide. Valeurs acceptées: starter, pro, ultra' });
  }
  try {
    const saasRef = firestore.collection('saasAccounts').doc(saasAccountId);
    const saasDoc = await saasRef.get();
    if (!saasDoc.exists) {
      return res.status(404).json({ error: 'Compte SaaS non trouvé' });
    }
    await saasRef.update({
      planId,
      plan: planId === 'pro' || planId === 'ultra' ? 'pro' : 'free',
      updatedAt: Timestamp.now(),
    });
    invalidateSaasAccountCache(req.uid);
    console.log(`[API] ✅ Plan mis à jour: saasAccountId=${saasAccountId}, planId=${planId}`);
    return res.json({ success: true, planId });
  } catch (error) {
    console.error('[API] Erreur mise à jour plan:', error);
    return res.status(500).json({ error: error.message || 'Erreur lors de la mise à jour du plan' });
  }
});

// ===== MBE HUB (plans Pro et Ultra) - API eShip SOAP - Expéditions en brouillon =====

const mbehubSoap = require('./mbehub-soap.cjs');

/**
 * Calcule une clé de cache unique pour un client (nom+adresse+email+téléphone)
 * @param {{ name?: string, address?: string, email?: string, phone?: string }} client
 * @returns {string}
 */
function computeClientCacheKey(client) {
  if (!client) return '';
  const n = (client.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const a = (client.address || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const e = (client.email || '').trim().toLowerCase();
  const p = (client.phone || '').trim().replace(/\s+/g, '');
  const concat = `${n}|${a}|${e}|${p}`;
  return crypto.createHash('sha256').update(concat).digest('hex');
}

function hasMbeHubPlan(saasData) {
  const planId = saasData?.planId || saasData?.plan || 'starter';
  return planId === 'pro' || planId === 'ultra';
}

async function getMbeHubCredentials(firestore, saasAccountId) {
  if (!firestore || !saasAccountId) return null;
  const doc = await firestore.collection('saasAccounts').doc(saasAccountId).collection('secrets').doc('mbehub').get();
  if (!doc.exists) return null;
  const data = doc.data();
  const username = data?.username || data?.apiKey; // rétrocompat: apiKey = username
  const password = data?.password;
  if (!username || !password) return null;
  return { username: String(username).trim(), password: String(password) };
}

// GET /api/account/mbehub-status
app.get('/api/account/mbehub-status', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  const saasAccountId = req.saasAccountId;
  if (!saasAccountId) return res.status(400).json({ error: 'Aucun compte SaaS associé' });
  try {
    const saasDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
    if (!saasDoc.exists) return res.status(404).json({ error: 'Compte non trouvé' });
    const saas = saasDoc.data();
    if (!hasMbeHubPlan(saas)) {
      return res.json({ available: false, configured: false, message: 'Réservé aux plans Pro et Ultra' });
    }
    const creds = await getMbeHubCredentials(firestore, saasAccountId);
    const shippingCalculationMethod = saas?.settings?.shippingCalculationMethod || 'grille';
    return res.json({
      available: true,
      configured: Boolean(creds),
      shippingCalculationMethod,
    });
  } catch (error) {
    console.error('[API] Erreur mbehub-status:', error);
    return res.status(500).json({ error: error.message || 'Erreur' });
  }
});

// PUT /api/account/shipping-calculation-method - Grille tarifaire ou MBE Hub
app.put('/api/account/shipping-calculation-method', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  const saasAccountId = req.saasAccountId;
  if (!saasAccountId) return res.status(400).json({ error: 'Aucun compte SaaS associé' });
  const { method } = req.body || {};
  if (method !== 'grille' && method !== 'mbehub') {
    return res.status(400).json({ error: 'Méthode invalide (grille ou mbehub)' });
  }
  try {
    const saasRef = firestore.collection('saasAccounts').doc(saasAccountId);
    const saasDoc = await saasRef.get();
    if (!saasDoc.exists) return res.status(404).json({ error: 'Compte non trouvé' });
    if (!hasMbeHubPlan(saasDoc.data())) {
      return res.status(403).json({ error: 'Réservé aux plans Pro et Ultra' });
    }
    const current = saasDoc.data() || {};
    await saasRef.update({
      settings: { ...(current.settings || {}), shippingCalculationMethod: method },
      updatedAt: Timestamp.now(),
    });
    console.log(`[API] ✅ Méthode expédition: ${method} pour saasAccountId=${saasAccountId}`);
    return res.json({ success: true, shippingCalculationMethod: method });
  } catch (error) {
    console.error('[API] Erreur shipping-calculation-method:', error);
    return res.status(500).json({ error: error.message || 'Erreur' });
  }
});

// PUT /api/account/mbehub-key - Stocke username + password (SOAP Basic Auth)
app.put('/api/account/mbehub-key', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  const saasAccountId = req.saasAccountId;
  if (!saasAccountId) return res.status(400).json({ error: 'Aucun compte SaaS associé' });
  const { username, password } = req.body || {};
  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Identifiant (username) requis' });
  }
  if (!password || typeof password !== 'string' || !password.trim()) {
    return res.status(400).json({ error: 'Mot de passe requis' });
  }
  try {
    const saasRef = firestore.collection('saasAccounts').doc(saasAccountId);
    const saasDoc = await saasRef.get();
    if (!saasDoc.exists) return res.status(404).json({ error: 'Compte non trouvé' });
    if (!hasMbeHubPlan(saasDoc.data())) {
      return res.status(403).json({ error: 'Réservé aux plans Pro et Ultra' });
    }
    await saasRef.collection('secrets').doc('mbehub').set({
      username: username.trim(),
      password: password.trim(),
      updatedAt: Timestamp.now(),
    });
    console.log(`[API] ✅ Identifiants MBE Hub enregistrés pour saasAccountId=${saasAccountId}`);
    return res.json({ success: true });
  } catch (error) {
    console.error('[API] Erreur mbehub-key:', error);
    return res.status(500).json({ error: error.message || 'Erreur' });
  }
});

// POST /api/mbehub/shipping-options - Liste des services disponibles (ShippingOptionsRequest)
app.post('/api/mbehub/shipping-options', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  const saasAccountId = req.saasAccountId;
  if (!saasAccountId) return res.status(400).json({ error: 'Aucun compte SaaS associé' });
  try {
    const saasDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
    if (!saasDoc.exists || !hasMbeHubPlan(saasDoc.data())) {
      return res.status(403).json({ error: 'Réservé aux plans Pro et Ultra' });
    }
    const creds = await getMbeHubCredentials(firestore, saasAccountId);
    if (!creds) {
      return res.status(400).json({ error: 'Configurez vos identifiants MBE Hub dans Paramètres' });
    }
    const { destination, weight, dimensions, insurance, insuranceValue } = req.body || {};
    if (!destination?.country) {
      return res.status(400).json({ error: 'Destination requise (country, zipCode, city)' });
    }
    const env = process.env.MBE_HUB_ENV === 'prod' ? 'prod' : 'demo';
    const options = await mbehubSoap.getShippingOptions({
      username: creds.username,
      password: creds.password,
      env,
      destination: {
        zipCode: destination.zipCode || '',
        city: destination.city || '',
        state: destination.state || '',
        country: destination.country || 'FR',
      },
      weight: Number(weight) || 1,
      dimensions: dimensions || { length: 10, width: 10, height: 10 },
      insurance: !!insurance,
      insuranceValue: Number(insuranceValue) || 0,
    });
    return res.json({ success: true, options });
  } catch (error) {
    console.error('[API] Erreur mbehub/shipping-options:', error);
    const status = error?.response?.status;
    const userMessage = status === 403
      ? 'Identifiants MBE Hub refusés (403). Vérifiez dans Paramètres → MBE Hub que le login et le mot de passe API sont corrects.'
      : (error.message || 'Erreur MBE Hub');
    return res.status(status && status >= 400 && status < 600 ? status : 500).json({ error: userMessage });
  }
});

// POST /api/mbehub/quote-shipping-rates - Calcule tarifs Standard + Express pour un devis (Smart Choice, plans Pro/Ultra)
app.post('/api/mbehub/quote-shipping-rates', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  const saasAccountId = req.saasAccountId;
  if (!saasAccountId) return res.status(400).json({ error: 'Aucun compte SaaS associé' });
  const { quoteId } = req.body || {};
  if (!quoteId) return res.status(400).json({ error: 'quoteId requis' });
  try {
    const saasDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
    if (!saasDoc.exists || !hasMbeHubPlan(saasDoc.data())) {
      return res.status(403).json({ error: 'Réservé aux plans Pro et Ultra' });
    }
    const creds = await getMbeHubCredentials(firestore, saasAccountId);
    if (!creds) {
      return res.status(400).json({ error: 'Configurez vos identifiants MBE Hub dans Paramètres' });
    }
    const quoteDoc = await firestore.collection('quotes').doc(quoteId).get();
    if (!quoteDoc.exists) return res.status(404).json({ error: 'Devis non trouvé' });
    const quote = quoteDoc.data();
    if (quote.saasAccountId && quote.saasAccountId !== saasAccountId) {
      return res.status(403).json({ error: 'Devis non accessible' });
    }
    const lot = quote.lot || {};
    const dims = lot.dimensions || lot.realDimensions || {};
    const weight = quote.totalWeight ?? dims.weight ?? 1;
    const dimensions = {
      length: dims.length ?? 10,
      width: dims.width ?? 10,
      height: dims.height ?? 10,
    };
    const deliveryAddr = quote.delivery?.address || {};
    const deliveryMode = quote.delivery?.mode || 'client';
    const clientAddr = quote.client?.address || '';
    let destination = {};
    if (deliveryAddr.zip || deliveryAddr.country || deliveryAddr.city) {
      destination = {
        zipCode: String(deliveryAddr.zip || '').trim(),
        city: String(deliveryAddr.city || '').trim(),
        state: String(deliveryAddr.state || '').trim().slice(0, 2),
        country: mapCountryToCode(deliveryAddr.country || 'FR'),
      };
    } else if (clientAddr) {
      const parts = String(clientAddr).split(/[\s,]+/).filter(Boolean);
      const zipMatch = parts.find((p) => /^\d{5}/.test(p));
      const countryMatch = parts.find((p) => /^[A-Z]{2}$/i.test(p));
      destination = {
        zipCode: zipMatch || '',
        city: parts.length >= 2 ? parts[parts.length - 2] : '',
        state: '',
        country: mapCountryToCode(countryMatch || 'FR'),
      };
    }
    if (!destination.country || (!destination.zipCode && !destination.city)) {
      return res.status(400).json({
        error: 'Adresse de destination incomplète (code postal, ville, pays). Renseignez la livraison dans le devis.',
      });
    }
    const env = process.env.MBE_HUB_ENV === 'prod' ? 'prod' : 'demo';
    const options = await mbehubSoap.getShippingOptions({
      username: creds.username,
      password: creds.password,
      env,
      destination: {
        zipCode: destination.zipCode || '',
        city: destination.city || '',
        state: destination.state || '',
        country: destination.country || 'FR',
      },
      weight: Number(weight) || 1,
      dimensions,
      insurance: !!quote.options?.insurance,
      insuranceValue: Number(quote.options?.insuranceAmount) || 0,
    });
    const standardOpts = options.filter((o) => /standard/i.test(String(o.ServiceDesc || '')));
    const expressOpts = options.filter((o) => /express/i.test(String(o.ServiceDesc || '')));
    const pickCheapest = (arr) => {
      if (!arr.length) return null;
      return arr.reduce((a, b) => {
        const pa = Number(a.GrossShipmentPrice ?? a.NetShipmentPrice ?? 9999);
        const pb = Number(b.GrossShipmentPrice ?? b.NetShipmentPrice ?? 9999);
        return pa <= pb ? a : b;
      });
    };
    const standard = pickCheapest(standardOpts);
    const express = pickCheapest(expressOpts);
    const standardPrice = standard ? Number(standard.GrossShipmentPrice ?? standard.NetShipmentPrice ?? 0) : null;
    const expressPrice = express ? Number(express.GrossShipmentPrice ?? express.NetShipmentPrice ?? 0) : null;
    return res.json({
      success: true,
      standard: standard ? { price: standardPrice, option: standard } : null,
      express: express ? { price: expressPrice, option: express } : null,
      options,
    });
  } catch (error) {
    console.error('[API] Erreur mbehub/quote-shipping-rates:', error);
    const status = error?.response?.status;
    let userMessage = error.message || 'Erreur MBE Hub';
    if (status === 403) {
      userMessage = 'Identifiants MBE Hub refusés (403). Vérifiez dans Paramètres → MBE Hub que le login et le mot de passe API sont corrects. En production, les identifiants mbehub.fr diffèrent du mode démo.';
    } else if (error.message?.includes('http status codes')) {
      userMessage = `MBE Hub a refusé la requête (${status || 'erreur'}). Vérifiez vos identifiants dans Paramètres → MBE Hub et que votre compte a bien accès à l'API SOAP.`;
    }
    return res.status(status && status >= 400 && status < 600 ? status : 500).json({ error: userMessage });
  }
});

// POST /api/mbehub/prepare-quote-email - Calcule tarifs MBE + crée 2 liens Standard et Express (Phase 2)
app.post('/api/mbehub/prepare-quote-email', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  const saasAccountId = req.saasAccountId;
  if (!saasAccountId) return res.status(400).json({ error: 'Aucun compte SaaS associé' });
  const { quoteId } = req.body || {};
  if (!quoteId) return res.status(400).json({ error: 'quoteId requis' });

  try {
    const saasDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
    if (!saasDoc.exists || !hasMbeHubPlan(saasDoc.data())) {
      return res.status(403).json({ error: 'Réservé aux plans Pro et Ultra' });
    }
    const quoteDoc = await firestore.collection('quotes').doc(quoteId).get();
    if (!quoteDoc.exists) return res.status(404).json({ error: 'Devis non trouvé' });
    const quote = quoteDoc.data();
    if (quote.saasAccountId && quote.saasAccountId !== saasAccountId) {
      return res.status(403).json({ error: 'Devis non accessible' });
    }

    // Annuler le(s) lien(s) existant(s) (Standard unique ou Standard+Express) puis créer les 2 nouveaux
    await cancelPrincipalPaymentLinksForDevis(firestore, quoteId, stripe);

    // 1. Obtenir les tarifs Standard et Express via MBE Hub
    const creds = await getMbeHubCredentials(firestore, saasAccountId);
    if (!creds) return res.status(400).json({ error: 'Configurez vos identifiants MBE Hub' });

    const lot = quote.lot || {};
    const dims = lot.dimensions || lot.realDimensions || {};
    const weight = quote.totalWeight ?? dims.weight ?? 1;
    const dimensions = { length: dims.length ?? 10, width: dims.width ?? 10, height: dims.height ?? 10 };
    const deliveryAddr = quote.delivery?.address || {};
    const clientAddr = quote.client?.address || '';
    let destination = {};
    if (deliveryAddr.zip || deliveryAddr.country || deliveryAddr.city) {
      destination = {
        zipCode: String(deliveryAddr.zip || '').trim(),
        city: String(deliveryAddr.city || '').trim(),
        state: String(deliveryAddr.state || '').trim().slice(0, 2),
        country: mapCountryToCode(deliveryAddr.country || 'FR'),
      };
    } else if (clientAddr) {
      const parts = String(clientAddr).split(/[\s,]+/).filter(Boolean);
      const zipMatch = parts.find((p) => /^\d{5}/.test(p));
      destination = {
        zipCode: zipMatch || '',
        city: parts.length >= 2 ? parts[parts.length - 2] : '',
        state: '',
        country: 'FR',
      };
    }
    if (!destination.country || (!destination.zipCode && !destination.city)) {
      return res.status(400).json({ error: 'Adresse de destination incomplète' });
    }

    const env = process.env.MBE_HUB_ENV === 'prod' ? 'prod' : 'demo';
    const options = await mbehubSoap.getShippingOptions({
      username: creds.username,
      password: creds.password,
      env,
      destination: { zipCode: destination.zipCode || '', city: destination.city || '', state: destination.state || '', country: destination.country || 'FR' },
      weight: Number(weight) || 1,
      dimensions,
      insurance: !!quote.options?.insurance,
      insuranceValue: Number(quote.options?.insuranceAmount) || 0,
    });

    const standardOpts = options.filter((o) => /standard/i.test(String(o.ServiceDesc || '')));
    const expressOpts = options.filter((o) => /express/i.test(String(o.ServiceDesc || '')));
    const pickCheapest = (arr) => {
      if (!arr.length) return null;
      return arr.reduce((a, b) => {
        const pa = Number(a.GrossShipmentPrice ?? a.NetShipmentPrice ?? 9999);
        const pb = Number(b.GrossShipmentPrice ?? b.NetShipmentPrice ?? 9999);
        return pa <= pb ? a : b;
      });
    };
    const standardOpt = pickCheapest(standardOpts);
    const expressOpt = pickCheapest(expressOpts);
    const standardPrice = standardOpt ? Number(standardOpt.GrossShipmentPrice ?? standardOpt.NetShipmentPrice ?? 0) : null;
    const expressPrice = expressOpt ? Number(expressOpt.GrossShipmentPrice ?? expressOpt.NetShipmentPrice ?? 0) : null;

    if (standardPrice == null && expressPrice == null) {
      return res.status(400).json({ error: 'Aucun tarif Standard ou Express trouvé pour cette destination' });
    }

    // 2. Calculer emballage + assurance (paramètres configurables par compte)
    const carton = quote.auctionSheet?.recommendedCarton;
    const packagingPrice = carton?.price ?? carton?.priceTTC ?? quote.options?.packagingPrice ?? 0;
    const lotValue = quote.lot?.value || 0;
    const insuranceAmount = await computeInsuranceAmountFromSettings(firestore, saasAccountId, lotValue, quote.options?.insurance, quote.options?.insuranceAmount);
    if (packagingPrice <= 0) {
      return res.status(400).json({ error: 'Prix d\'emballage manquant. Renseignez un carton pour ce devis.' });
    }

    const totalStandard = packagingPrice + (standardPrice ?? expressPrice ?? 0) + insuranceAmount;
    const totalExpress = packagingPrice + (expressPrice ?? standardPrice ?? 0) + insuranceAmount;
    const ref = quote.reference || quoteId;

    // 3. Créer les 2 paiements via handleCreatePaiement
    const createRes = (code, body) => ({ statusCode: code, body });
    const results = { standard: null, express: null };

    if (standardPrice != null) {
      const resState = createRes(200, null);
      const fakeReq = { params: { id: quoteId }, body: { amount: totalStandard, type: 'PRINCIPAL_STANDARD', description: `Devis ${ref} - Standard` }, saasAccountId };
      const fakeRes = {
        status: (c) => { resState.statusCode = c; return fakeRes; },
        json: (d) => { resState.body = d; return fakeRes; },
      };
      await handleCreatePaiement(fakeReq, fakeRes, firestore);
      if (resState.statusCode >= 400) {
        return res.status(500).json({ error: resState.body?.error || 'Erreur création lien Standard' });
      }
      results.standard = { url: resState.body?.url, amount: totalStandard, paiementId: resState.body?.paiementId };
    }

    if (expressPrice != null) {
      const resState = createRes(200, null);
      const fakeReq = { params: { id: quoteId }, body: { amount: totalExpress, type: 'PRINCIPAL_EXPRESS', description: `Devis ${ref} - Express` }, saasAccountId };
      const fakeRes = {
        status: (c) => { resState.statusCode = c; return fakeRes; },
        json: (d) => { resState.body = d; return fakeRes; },
      };
      await handleCreatePaiement(fakeReq, fakeRes, firestore);
      if (resState.statusCode >= 400) {
        return res.status(500).json({ error: resState.body?.error || 'Erreur création lien Express' });
      }
      results.express = { url: resState.body?.url, amount: totalExpress, paiementId: resState.body?.paiementId };
    }

    return res.json({
      success: true,
      standard: results.standard ? { url: results.standard.url, price: results.standard.amount } : null,
      express: results.express ? { url: results.express.url, price: results.express.amount } : null,
    });
  } catch (error) {
    console.error('[API] Erreur mbehub/prepare-quote-email:', error);
    const status = error?.response?.status;
    const userMessage = status === 403
      ? 'Identifiants MBE Hub refusés (403). Vérifiez dans Paramètres → MBE Hub.'
      : (error.message || 'Erreur MBE Hub');
    return res.status(status && status >= 400 && status < 600 ? status : 500).json({ error: userMessage });
  }
});

// POST /api/mbehub/create-draft - Crée une expédition en brouillon (ShipmentRequest IsDraft=true)
app.post('/api/mbehub/create-draft', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  const saasAccountId = req.saasAccountId;
  if (!saasAccountId) return res.status(400).json({ error: 'Aucun compte SaaS associé' });
  const { quoteId, recipient, service, courierService, courierAccount, weight, dimensions, reference, insurance, insuranceValue } = req.body || {};
  if (!quoteId) return res.status(400).json({ error: 'quoteId requis' });
  if (!recipient?.name || !recipient?.address || !recipient?.city || !recipient?.zipCode || !recipient?.country) {
    return res.status(400).json({ error: 'Destinataire incomplet (name, address, city, zipCode, country)' });
  }
  if (!service) return res.status(400).json({ error: 'Service requis (choisissez dans la liste)' });
  try {
    const saasDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
    if (!saasDoc.exists || !hasMbeHubPlan(saasDoc.data())) {
      return res.status(403).json({ error: 'Réservé aux plans Pro et Ultra' });
    }
    const creds = await getMbeHubCredentials(firestore, saasAccountId);
    if (!creds) {
      return res.status(400).json({ error: 'Configurez vos identifiants MBE Hub dans Paramètres' });
    }
    const quoteDoc = await firestore.collection('quotes').doc(quoteId).get();
    if (!quoteDoc.exists) return res.status(404).json({ error: 'Devis non trouvé' });
    const quote = quoteDoc.data();
    if (quote.saasAccountId !== saasAccountId) return res.status(403).json({ error: 'Devis non accessible' });

    const env = process.env.MBE_HUB_ENV === 'prod' ? 'prod' : 'demo';

    // Resoudre la salle des ventes et son mbeCustomerId (obligatoire pour les expéditions)
    const auctionHouseName = (quote.lot?.auctionHouse || quote.auctionSheet?.auctionHouse || quote.lotAuctionHouse || '').trim();
    if (!auctionHouseName) {
      return res.status(400).json({ error: 'Salle des ventes non renseignée pour ce devis. Renseignez-la dans le lot.' });
    }
    const housesSnap = await firestore.collection('auctionHouses')
      .where('saasAccountId', '==', saasAccountId)
      .get();
    const norm = (s) => (s || '').trim().toLowerCase();
    const matchedHouse = housesSnap.docs.find((d) => norm(d.data().name) === norm(auctionHouseName));
    if (!matchedHouse) {
      return res.status(400).json({ error: `Salle des ventes "${auctionHouseName}" non trouvée. Ajoutez-la dans Paramètres → Salles des ventes.` });
    }
    const mbeCustomerId = (matchedHouse.data().mbeCustomerId || '').trim();
    // mbeCustomerId optionnel : requis seulement pour les comptes MBE de type AH (Auction House).
    // Si non configuré ou si le compte n'est pas AH (SR_005), l'expédition se fait sans CustomerMbeId.

    // Recuperer les adresses expéditeur du MBE Hub
    let sender = null;
    try {
      const pickupAddrs = await mbehubSoap.getPickupAddresses({
        username: creds.username,
        password: creds.password,
        env,
      });
      const defaultAddr = pickupAddrs.find((a) => a.IsDefault) || pickupAddrs[0];
      if (defaultAddr) sender = defaultAddr;
    } catch (pickupErr) {
      console.warn('[API] getPickupAddresses échec, expédition sans Sender (MBE utilisera adresse Store):', pickupErr?.message);
      // sender reste null - l'API MBE utilisera l'adresse du centre par défaut (colis toujours au centre MBE)
    }

    // Log pour debug (sans mot de passe) en cas d'erreur SR_006 ou similaire
    const payloadForLog = {
      recipient: { ...recipient, email: recipient?.email ? '[présent]' : undefined, phone: recipient?.phone ? '[présent]' : undefined },
      service,
      courierService: courierService || '(vide)',
      courierAccount: courierAccount || '(vide)',
      weight,
      dimensions,
      reference: reference || quote.reference,
    };
    console.log('[API] mbehub/create-draft payload:', JSON.stringify(payloadForLog));

    // Create/find client MBE (acheteur) via CreateCustomerRequest + cache. Fallback sur mbeCustomerId (salle) si échec.
    let customerMbeId = mbeCustomerId || undefined;
    const quoteClient = quote.client || {};
    const clientAddr = typeof quoteClient.address === 'string'
      ? quoteClient.address
      : (quoteClient.address && typeof quoteClient.address === 'object'
        ? [quoteClient.address.line1, quoteClient.address.street, quoteClient.address.zip, quoteClient.address.city, quoteClient.address.country].filter(Boolean).join(', ')
        : '');
    const clientForCreate = quoteClient.name && clientAddr && quoteClient.email && quoteClient.phone
      ? { name: quoteClient.name, address: clientAddr, email: quoteClient.email, phone: quoteClient.phone }
      : null;
    if (clientForCreate) {
      const parsed = mbehubSoap.parseClientAddress(clientAddr);
      if (parsed.street && parsed.zip && parsed.city && parsed.country) {
        const cacheKey = computeClientCacheKey(clientForCreate);
        const cacheRef = firestore.collection('mbeCustomerCache').doc(saasAccountId).collection('entries').doc(cacheKey);
        try {
          const cacheDoc = await cacheRef.get();
          if (cacheDoc.exists && cacheDoc.data()?.mbeCustomerId) {
            customerMbeId = cacheDoc.data().mbeCustomerId;
          } else {
            const createResp = await mbehubSoap.createCustomerRequest({
              username: creds.username,
              password: creds.password,
              env,
              client: clientForCreate,
              auctionHouseMbeId: mbeCustomerId || undefined,
            });
            if (createResp?.customerMbeId) {
              customerMbeId = createResp.customerMbeId;
              await cacheRef.set({ mbeCustomerId: customerMbeId, createdAt: Timestamp.now() });
            }
          }
        } catch (createErr) {
          console.warn('[API] CreateCustomerRequest échec, fallback mbeCustomerId salle:', createErr?.message);
        }
      }
    }

    let result;
    try {
      result = await mbehubSoap.createDraftShipment({
        username: creds.username,
        password: creds.password,
        env,
        recipient,
        sender: sender || undefined,
        customerMbeId: customerMbeId || undefined,
        service,
        courierService: courierService || null,
        courierAccount: courierAccount || null,
        weight: Number(weight) || 1,
        dimensions: dimensions || { length: 10, width: 10, height: 10 },
        reference: reference || quote.reference || quoteId,
        insurance: !!insurance,
        insuranceValue: Number(insuranceValue) || 0,
      });
    } catch (shipErr) {
      // SR_005: "customer of type AH" → réessai sans CustomerMbeId (compte MBE non type AH)
      const isSR005CustomerAH = shipErr?.message?.includes('SR_005') && shipErr?.message?.includes('customer of type AH');
      if (isSR005CustomerAH && customerMbeId) {
        console.warn('[API] SR_005 (customer AH) - réessai sans CustomerMbeId');
        result = await mbehubSoap.createDraftShipment({
          username: creds.username,
          password: creds.password,
          env,
          recipient,
          sender: sender || undefined,
          customerMbeId: undefined,
          service,
          courierService: courierService || null,
          courierAccount: courierAccount || null,
          weight: Number(weight) || 1,
          dimensions: dimensions || { length: 10, width: 10, height: 10 },
          reference: reference || quote.reference || quoteId,
          insurance: !!insurance,
          insuranceValue: Number(insuranceValue) || 0,
        });
      } else {
        throw shipErr;
      }
    }

    // Option B : CloseShipments transfère le brouillon vers Interface B (zone « En attente »).
    // Si CSR_005 (manquant manifest), le brouillon existe déjà sur MBE Hub → on considère quand même la création réussie.
    let closeShipmentsWarning = null;
    if (result.mbeTrackingId && String(result.mbeTrackingId).trim()) {
      try {
        await mbehubSoap.closeShipments({
          username: creds.username,
          password: creds.password,
          env,
          masterTrackingsMBE: result.mbeTrackingId,
        });
      } catch (closeErr) {
        const isCSR005 = closeErr?.message?.includes('CSR_005') || closeErr?.message?.includes('recovery of manifest');
        if (isCSR005) {
          console.warn('[API] CSR_005 (manifest non récupérable) - brouillon créé avec succès, transfert vers Interface B ignoré:', closeErr?.message);
          closeShipmentsWarning = 'Le brouillon a été créé. Le transfert vers "En attente" a échoué (manifest). L\'expédition est visible dans MBE Hub.';
        } else {
          throw closeErr;
        }
      }
    }

    // Mettre à jour le devis: mbeTrackingId, status sent_to_mbe_hub, sentToMbeHubAt
    const existingTimeline = quote.timeline || [];
    const timelineEvent = {
      id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      date: Timestamp.now(),
      status: 'sent_to_mbe_hub',
      description: 'Envoyé vers MBE Hub (brouillon)',
      user: 'Système',
    };
    await firestore.collection('quotes').doc(quoteId).update({
      status: 'sent_to_mbe_hub',
      mbeTrackingId: result.mbeTrackingId,
      sentToMbeHubAt: Timestamp.now(),
      timeline: [...existingTimeline, timelineEvent],
      updatedAt: Timestamp.now(),
    });

    console.log(`[API] ✅ Expédition brouillon MBE créée: ${result.mbeTrackingId} pour devis ${quoteId}`);

    // Synchroniser vers le Bilan devis MBE (feuille Terminés)
    try {
      const auth = getGoogleAuthForSaasAccount(saasDoc.data());
      if (auth) await syncQuoteToBilanSheet(firestore, auth, saasAccountId, quoteId);
    } catch (bilanErr) {
      console.warn('[Bilan] Sync après envoi MBE Hub:', bilanErr?.message);
    }

    return res.json({ success: true, mbeTrackingId: result.mbeTrackingId, warning: closeShipmentsWarning || undefined });
  } catch (error) {
    console.error('[API] Erreur mbehub/create-draft:', error);
    const status = error?.response?.status;
    const userMessage = status === 403
      ? 'Identifiants MBE Hub refusés (403). Vérifiez dans Paramètres → MBE Hub.'
      : (error.message || 'Erreur MBE Hub');
    return res.status(status && status >= 400 && status < 600 ? status : 500).json({ error: userMessage });
  }
});

// POST /api/mbehub/send-quote - (Legacy) Envoi devis vers MBE Hub - conservé pour compatibilité
// TODO: Adapter l'URL et le payload dès que la documentation API MBE Hub sera disponible
app.post('/api/mbehub/send-quote', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  const saasAccountId = req.saasAccountId;
  if (!saasAccountId) return res.status(400).json({ error: 'Aucun compte SaaS associé' });
  const { quoteId } = req.body;
  if (!quoteId) return res.status(400).json({ error: 'quoteId requis' });
  try {
    const saasDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
    if (!saasDoc.exists || !hasMbeHubPlan(saasDoc.data())) {
      return res.status(403).json({ error: 'Réservé aux plans Pro et Ultra' });
    }
    const creds = await getMbeHubCredentials(firestore, saasAccountId);
    if (!creds) {
      return res.status(400).json({ error: 'Configurez vos identifiants MBE Hub (username + mot de passe) dans Paramètres' });
    }
    const quoteDoc = await firestore.collection('quotes').doc(quoteId).get();
    if (!quoteDoc.exists) return res.status(404).json({ error: 'Devis non trouvé' });
    const quote = quoteDoc.data();
    if (quote.saasAccountId !== saasAccountId) {
      return res.status(403).json({ error: 'Devis non accessible' });
    }

    // Construire le payload pour MBE Hub (client, destinataire, dimensions, poids, cartons)
    const client = quote.client || {};
    const delivery = quote.delivery || {};
    const lot = quote.lot || {};
    const auctionSheet = quote.auctionSheet || {};
    const cartons = auctionSheet.cartons || (auctionSheet.recommendedCarton ? [auctionSheet.recommendedCarton] : []);
    const cartonPayload = cartons.map((c) => ({
      ref: c.ref,
      weight: c.weight ?? lot.weight ?? lot.dimensions?.weight,
      dimensions: c.inner_length && c.inner_width && c.inner_height
        ? { length: c.inner_length, width: c.inner_width, height: c.inner_height }
        : (lot.dimensions || lot.realDimensions) ? { length: (lot.dimensions || lot.realDimensions).length, width: (lot.dimensions || lot.realDimensions).width, height: (lot.dimensions || lot.realDimensions).height } : null,
    }));

    const payload = {
      reference: quote.reference,
      client: {
        name: client.name,
        email: client.email,
        phone: client.phone,
        address: client.address,
      },
      recipient: delivery.contact ? {
        name: delivery.contact.name,
        email: delivery.contact.email,
        phone: delivery.contact.phone,
        address: delivery.address ? {
          line1: delivery.address.line1,
          line2: delivery.address.line2,
          city: delivery.address.city,
          zip: delivery.address.zip,
          country: delivery.address.country,
        } : null,
      } : null,
      cartons: cartonPayload,
      weight: quote.totalWeight ?? lot.weight ?? lot.dimensions?.weight,
      volumetricWeight: lot.volumetricWeight,
    };

    // TODO: Appeler l'API MBE Hub quand documentation disponible
    // const MBE_HUB_URL = process.env.MBE_HUB_API_URL || 'https://api.mbehub.example';
    // const hubRes = await fetch(`${MBE_HUB_URL}/expedition`, { method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    console.log('[MBE Hub] Payload prêt (API non configurée):', JSON.stringify(payload, null, 2));

    return res.json({
      success: false,
      message: 'L\'API MBE Hub n\'est pas encore configurée. L\'intégration sera activée dès que la documentation sera disponible.',
      payload,
    });
  } catch (error) {
    console.error('[API] Erreur mbehub/send-quote:', error);
    return res.status(500).json({ error: error.message || 'Erreur' });
  }
});

// ===== PAYMENT PROVIDER (Stripe / Paytweak) - Feature customPaytweak pour comptes autorisés =====

// GET /api/account/payment-settings
app.get('/api/account/payment-settings', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  const saasAccountId = req.saasAccountId;
  if (!saasAccountId) return res.status(400).json({ error: 'Aucun compte SaaS associé' });
  try {
    const config = await getPaymentProviderConfig(firestore, saasAccountId);
    if (!config) return res.status(404).json({ error: 'Compte non trouvé' });
    return res.json({
      hasCustomPaytweak: config.hasCustomPaytweak,
      paymentProvider: config.paymentProvider,
      paytweakConfigured: config.paytweakConfigured,
      stripeConnected: config.stripeConnected,
    });
  } catch (error) {
    console.error('[API] Erreur payment-settings:', error);
    return res.status(500).json({ error: error.message || 'Erreur' });
  }
});

// PUT /api/account/payment-settings
app.put('/api/account/payment-settings', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  const saasAccountId = req.saasAccountId;
  if (!saasAccountId) return res.status(400).json({ error: 'Aucun compte SaaS associé' });
  const { paymentProvider } = req.body;
  if (!paymentProvider || !['stripe', 'paytweak'].includes(paymentProvider)) {
    return res.status(400).json({ error: 'paymentProvider invalide. Valeurs: stripe ou paytweak' });
  }
  try {
    const saasRef = firestore.collection('saasAccounts').doc(saasAccountId);
    const saasDoc = await saasRef.get();
    if (!saasDoc.exists) return res.status(404).json({ error: 'Compte non trouvé' });
    if (!hasCustomPaytweak(saasDoc.data(), saasAccountId)) {
      return res.status(403).json({ error: 'Cette fonctionnalité n\'est pas disponible pour votre compte' });
    }
    if (paymentProvider === 'paytweak') {
      const keys = await getPaytweakKeys(firestore, saasAccountId);
      if (!keys?.publicKey || !keys?.privateKey) {
        return res.status(400).json({ error: 'Configurez vos clés Paytweak (publique + privée) dans les paramètres' });
      }
    }
    await saasRef.update({
      paymentProvider,
      updatedAt: Timestamp.now(),
    });
    invalidateSaasAccountCache(req.uid);
    console.log(`[API] ✅ Payment provider mis à jour: saasAccountId=${saasAccountId}, paymentProvider=${paymentProvider}`);
    return res.json({ success: true, paymentProvider });
  } catch (error) {
    console.error('[API] Erreur payment-settings:', error);
    return res.status(500).json({ error: error.message || 'Erreur' });
  }
});

// PUT /api/account/paytweak-key
app.put('/api/account/paytweak-key', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  const saasAccountId = req.saasAccountId;
  if (!saasAccountId) return res.status(400).json({ error: 'Aucun compte SaaS associé' });
  const { publicKey, privateKey } = req.body;
  if (!publicKey || typeof publicKey !== 'string' || !publicKey.trim() || !privateKey || typeof privateKey !== 'string' || !privateKey.trim()) {
    return res.status(400).json({ error: 'Clés publique et privée Paytweak requises' });
  }
  try {
    const saasRef = firestore.collection('saasAccounts').doc(saasAccountId);
    const saasDoc = await saasRef.get();
    if (!saasDoc.exists) return res.status(404).json({ error: 'Compte non trouvé' });
    if (!hasCustomPaytweak(saasDoc.data(), saasAccountId)) {
      return res.status(403).json({ error: 'Cette fonctionnalité n\'est pas disponible pour votre compte' });
    }
    await saasRef.collection('secrets').doc('paytweak').set({
      publicKey: publicKey.trim(),
      privateKey: privateKey.trim(),
      updatedAt: Timestamp.now(),
    });
    console.log(`[API] ✅ Clés Paytweak enregistrées pour saasAccountId=${saasAccountId}`);
    return res.json({ success: true });
  } catch (error) {
    console.error('[API] Erreur paytweak-key:', error);
    return res.status(500).json({ error: error.message || 'Erreur' });
  }
});

// POST /api/paytweak/link - Génération de lien Paytweak avec clé du compte (requireAuth)
app.post('/api/paytweak/link', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  const saasAccountId = req.saasAccountId;
  if (!saasAccountId) return res.status(400).json({ error: 'Aucun compte SaaS associé' });
  try {
    const saasDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
    if (!saasDoc.exists || !hasCustomPaytweak(saasDoc.data(), saasAccountId)) {
      return res.status(403).json({ error: 'Paytweak n\'est pas disponible pour votre compte' });
    }
    const { amount, currency = 'EUR', reference, description, customer, successUrl, cancelUrl } = req.body;
    if (!amount || !reference || !customer?.email) {
      return res.status(400).json({ error: 'Champs requis: amount, reference, customer.email' });
    }
    const baseUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'https://staging.mbe-sdv.fr';
    const result = await createPaytweakLinkForAccount(firestore, saasAccountId, req.body, baseUrl);
    return res.json({ url: result.url, id: result.id });
  } catch (error) {
    console.error('[API] Erreur paytweak/link:', error);
    if (error.message?.includes('non configurée')) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message || 'Erreur' });
  }
});

// POST /api/payment/link - Lien unifié Stripe ou Paytweak (selon paymentProvider du compte)
app.post('/api/payment/link', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  const saasAccountId = req.saasAccountId;
  if (!saasAccountId) return res.status(400).json({ error: 'Aucun compte SaaS associé' });
  try {
    const config = await getPaymentProviderConfig(firestore, saasAccountId);
    const usePaytweak = config?.hasCustomPaytweak && config?.paymentProvider === 'paytweak' && config?.paytweakConfigured;
    if (usePaytweak) {
      const baseUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'https://staging.mbe-sdv.fr';
      const result = await createPaytweakLinkForAccount(firestore, saasAccountId, req.body, baseUrl);
      return res.json({ url: result.url, id: result.id });
    }
    if (!stripe) return res.status(400).json({ error: 'Stripe non configuré' });
    const saasDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
    const stripeAccountId = saasDoc.exists ? saasDoc.data()?.integrations?.stripe?.stripeAccountId : null;
    const payload = buildPaymentLinkPayload(req.body);
    const createOptions = stripeAccountId ? { stripeAccount: stripeAccountId } : {};
    const paymentLink = await stripe.paymentLinks.create(payload, createOptions);
    if (!paymentLink?.url) return res.status(502).json({ error: 'Pas d\'URL Stripe retournée' });
    return res.json({ url: paymentLink.url, id: paymentLink.id });
  } catch (error) {
    console.error('[API] Erreur payment/link:', error);
    return res.status(500).json({ error: error.message || 'Erreur' });
  }
});

// ===== ROUTE FEATURE FLAGS / PLANS =====

// Récupérer les features, limites et usage du compte SaaS connecté
app.get("/api/features", requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }
  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }
  try {
    const data = await getAccountFeaturesAndLimits(firestore, req.saasAccountId);
    return res.json(data);
  } catch (error) {
    console.error('[API] Erreur /api/features:', error);
    return res.status(500).json({ error: 'Erreur récupération features' });
  }
});

// ===== EMAILS AUTOMATIQUES PERSONNALISABLES (plan Ultra) =====
const checkCustomizeAutoEmails = checkFeature(firestore, 'customizeAutoEmails');

app.get('/api/email-templates', requireAuth, checkCustomizeAutoEmails, async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte non configuré' });
  try {
    const saasDoc = await firestore.collection('saasAccounts').doc(req.saasAccountId).get();
    const emailTemplates = saasDoc.exists ? saasDoc.data().emailTemplates || null : null;
    const templates = getTemplatesForAccount(emailTemplates);
    return res.json({
      templates,
      customTemplates: emailTemplates,
      meta: { EMAIL_TYPE_LABELS, PLACEHOLDERS, LIMITS, DEFAULT_TEMPLATES },
    });
  } catch (err) {
    console.error('[API] Erreur GET email-templates:', err);
    return res.status(500).json({ error: 'Erreur récupération templates' });
  }
});

app.put('/api/email-templates', requireAuth, checkCustomizeAutoEmails, async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte non configuré' });
  const { type, subject, signature, tone } = req.body || {};
  if (!type || !EMAIL_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Type d\'email invalide' });
  }
  const errors = validateTemplate(type, { subject, signature });
  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join(' ') });
  }
  if (tone && !['formel', 'amical'].includes(tone)) {
    return res.status(400).json({ error: 'Ton invalide (formel ou amical)' });
  }
  try {
    const saasRef = firestore.collection('saasAccounts').doc(req.saasAccountId);
    const saasDoc = await saasRef.get();
    const current = saasDoc.exists ? saasDoc.data().emailTemplates || {} : {};
    const prev = current[type] || {};
    const history = prev.history || [];
    if (history.length >= 10) history.pop();
    const prevSnapshot = {
      ...(prev.subject != null && { subject: prev.subject }),
      ...(prev.signature != null && { signature: prev.signature }),
      ...(prev.tone != null && { tone: prev.tone }),
      ...(prev.updatedAt != null && { updatedAt: prev.updatedAt }),
    };
    if (Object.keys(prevSnapshot).length > 0) {
      history.unshift(prevSnapshot);
    }
    const updated = {
      ...current,
      [type]: {
        subject: subject ?? prev.subject ?? DEFAULT_TEMPLATES[type].subject,
        signature: signature ?? prev.signature ?? DEFAULT_TEMPLATES[type].signature,
        tone: tone ?? prev.tone ?? DEFAULT_TEMPLATES[type].tone,
        history,
        updatedAt: Timestamp.now(),
      },
    };
    await saasRef.set({ emailTemplates: updated, updatedAt: Timestamp.now() }, { merge: true });
    return res.json({
      success: true,
      templates: getTemplatesForAccount(updated),
      customTemplates: updated,
    });
  } catch (err) {
    console.error('[API] Erreur PUT email-templates:', err);
    return res.status(500).json({ error: 'Erreur sauvegarde templates' });
  }
});

app.post('/api/email-templates/reset', requireAuth, checkCustomizeAutoEmails, async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte non configuré' });
  const { type } = req.body || {};
  try {
    const saasRef = firestore.collection('saasAccounts').doc(req.saasAccountId);
    const saasDoc = await saasRef.get();
    const current = saasDoc.exists ? saasDoc.data().emailTemplates || {} : {};
    let updated;
    if (type && EMAIL_TYPES.includes(type)) {
      const { [type]: _removed, ...rest } = current;
      updated = rest;
    } else {
      updated = {};
    }
    await saasRef.set({ emailTemplates: updated, updatedAt: Timestamp.now() }, { merge: true });
    return res.json({
      success: true,
      templates: getTemplatesForAccount(updated),
      customTemplates: updated,
    });
  } catch (err) {
    console.error('[API] Erreur reset email-templates:', err);
    return res.status(500).json({ error: 'Erreur réinitialisation' });
  }
});

app.post('/api/email-templates/preview', requireAuth, checkCustomizeAutoEmails, async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte non configuré' });
  const { type } = req.body || {};
  if (!type || !EMAIL_TYPES.includes(type)) return res.status(400).json({ error: 'Type invalide' });
  try {
    const saasDoc = await firestore.collection('saasAccounts').doc(req.saasAccountId).get();
    const emailTemplates = saasDoc.exists ? saasDoc.data().emailTemplates : null;
    const commercialName = saasDoc.exists ? saasDoc.data().commercialName : 'Mon MBE';
    const templates = getTemplatesForAccount(emailTemplates);
    const t = templates[type];
    const sample = {
      reference: 'DEV-2024-00123',
      clientName: 'Jean Dupont',
      mbeName: commercialName,
      amount: '125.50',
    };
    const subject = (t.subject || '')
      .replace(/{reference}/g, sample.reference)
      .replace(/{clientName}/g, sample.clientName)
      .replace(/{mbeName}/g, sample.mbeName)
      .replace(/{amount}/g, sample.amount);
    const signature = (t.signature || '')
      .replace(/{reference}/g, sample.reference)
      .replace(/{clientName}/g, sample.clientName)
      .replace(/{mbeName}/g, sample.mbeName)
      .replace(/{amount}/g, sample.amount);
    const bodyContent = getBodyContentPreview(type, t.tone || 'formel', sample);
    const signatureHtml = signature.replace(/\n/g, '<br>');
    const bodyHtml = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; line-height: 1.6; color: #333;">
  ${bodyContent}
  <p>${signatureHtml}</p>
</body>
</html>`.trim();
    return res.json({ subject, signature, tone: t.tone || 'formel', bodyHtml, sample });
  } catch (err) {
    console.error('[API] Erreur preview email-templates:', err);
    return res.status(500).json({ error: 'Erreur prévisualisation' });
  }
});

// ===== MODÈLES D'EMAILS ÉTENDUS (tous les types, couleurs, corps HTML) =====
app.get('/api/email-templates-extended', requireAuth, checkCustomizeAutoEmails, async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte non configuré' });
  try {
    const saasDoc = await firestore.collection('saasAccounts').doc(req.saasAccountId).get();
    const emailTemplates = saasDoc.exists ? saasDoc.data().emailTemplates : null;
    const templates = getTemplatesExtendedForAccount(emailTemplates);
    return res.json({
      templates,
      customTemplates: emailTemplates,
      meta: {
        EMAIL_TYPE_LABELS: EMAIL_TYPE_LABELS_EXTENDED,
        PLACEHOLDERS: PLACEHOLDERS_EXTENDED,
        DEFAULT_TEMPLATES: DEFAULT_TEMPLATES_EXTENDED,
      },
    });
  } catch (err) {
    console.error('[API] Erreur GET email-templates-extended:', err);
    return res.status(500).json({ error: 'Erreur récupération templates' });
  }
});

app.put('/api/email-templates-extended', requireAuth, checkCustomizeAutoEmails, async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte non configuré' });
  const { type, subject, bodyHtml, bodySections, signature, bannerColor, buttonColor, bannerTitle, bannerLogoUrl, buttonLabel } = req.body || {};
  if (!type || !EMAIL_TYPES_EXTENDED.includes(type)) {
    return res.status(400).json({ error: 'Type d\'email invalide' });
  }
  try {
    const saasRef = firestore.collection('saasAccounts').doc(req.saasAccountId);
    const saasDoc = await saasRef.get();
    const current = saasDoc.exists ? saasDoc.data().emailTemplates || {} : {};
    const prev = current[type] || {};
    const def = DEFAULT_TEMPLATES_EXTENDED[type] || {};
    const updated = {
      ...current,
      [type]: {
        subject: subject !== undefined ? subject : (prev.subject ?? def.subject),
        bodyHtml: bodyHtml !== undefined ? bodyHtml : (prev.bodyHtml ?? def.bodyHtml),
        bodySections: bodySections !== undefined ? bodySections : (prev.bodySections ?? def.bodySections),
        signature: signature !== undefined ? signature : (prev.signature ?? def.signature),
        bannerColor: bannerColor !== undefined ? bannerColor : (prev.bannerColor ?? def.bannerColor ?? '#2563eb'),
        buttonColor: buttonColor !== undefined ? buttonColor : (prev.buttonColor ?? def.buttonColor ?? '#2563eb'),
        bannerTitle: bannerTitle !== undefined ? bannerTitle : (prev.bannerTitle ?? def.bannerTitle ?? ''),
        bannerLogoUrl: bannerLogoUrl !== undefined ? bannerLogoUrl : (prev.bannerLogoUrl ?? def.bannerLogoUrl ?? ''),
        buttonLabel: buttonLabel !== undefined ? buttonLabel : (prev.buttonLabel ?? def.buttonLabel ?? ''),
        updatedAt: Timestamp.now(),
      },
    };
    await saasRef.set({ emailTemplates: updated, updatedAt: Timestamp.now() }, { merge: true });
    return res.json({
      success: true,
      templates: getTemplatesExtendedForAccount(updated),
      customTemplates: updated,
    });
  } catch (err) {
    console.error('[API] Erreur PUT email-templates-extended:', err);
    return res.status(500).json({ error: 'Erreur sauvegarde templates' });
  }
});

app.post('/api/email-templates-extended/preview', requireAuth, checkCustomizeAutoEmails, async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte non configuré' });
  const { type } = req.body || {};
  if (!type || !EMAIL_TYPES_EXTENDED.includes(type)) return res.status(400).json({ error: 'Type invalide' });
  try {
    const saasDoc = await firestore.collection('saasAccounts').doc(req.saasAccountId).get();
    const emailTemplates = saasDoc.exists ? saasDoc.data().emailTemplates : null;
    const commercialName = saasDoc.exists ? saasDoc.data().commercialName : 'Mon MBE';
    const templates = getTemplatesExtendedForAccount(emailTemplates);
    const t = templates[type];
    const sampleValues = {
      bordereauNum: '0260-25',
      reference: 'GS-1771934590732-25',
      nomSalleVentes: 'Millon Riviera',
      prixEmballage: '18.00',
      prixTransport: '3.00',
      prixAssurance: 'NON (Si vous souhaitez une assurance, merci de nous le signaler par retour de mail)',
      prixTotal: '21.00',
      lienPaiementSecurise: 'https://checkout.stripe.com/example',
      adresseDestinataire: '3 boulevard Delfino, 06000 Nice',
      clientName: 'Jeanne Launey',
      date: new Date().toLocaleDateString('fr-FR'),
      lotNumber: '38',
      lotDescription: 'Corbeille en argent - Maison Boin-Taburet',
      mbeName: commercialName,
      amount: '21.00',
      description: 'Surcoût pour dimensions réelles',
      raison: 'Lot non disponible au moment de la collecte',
      coordonneesSalleVentes: 'Millon Riviera\nEmail : contact@millon.com\nContact : 01 23 45 67 89',
      lotDisplay: 'Le lot 38',
      messagePersonnalise: 'Le devis suivant a été considéré pour une lithographie pouvant être roulé et mise en tube.',
      sectionPaiement: '👉 https://checkout.stripe.com/example',
    };
    const subject = replacePlaceholdersExtended(t.subject || '', sampleValues);
    const bodyHtml = Array.isArray(t.bodySections) && t.bodySections.length > 0
      ? buildBodyHtmlFromSections(t.bodySections, sampleValues)
      : replacePlaceholdersExtended(t.bodyHtml || '', sampleValues);
    const signature = replacePlaceholdersExtended(t.signature || '', sampleValues).replace(/\n/g, '<br>');
    const fullHtml = buildEmailHtmlFromTemplate(t, bodyHtml, signature, sampleValues);
    return res.json({
      subject,
      bodyHtml: fullHtml,
      signature,
      sampleValues,
    });
  } catch (err) {
    console.error('[API] Erreur preview email-templates-extended:', err);
    return res.status(500).json({ error: 'Erreur prévisualisation' });
  }
});

/** Upload logo pour le bandeau des emails - POST multipart avec fichier "logo" et champ "type" */
app.post('/api/email-templates-extended/upload-logo', requireAuth, checkCustomizeAutoEmails, upload.single('logo'), async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte non configuré' });
  if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'Aucun fichier envoyé' });
  const templateType = req.body?.type || 'quote_send';
  const ext = req.file.originalname?.match(/\.(jpe?g|png|gif|webp)$/i)?.[1]?.toLowerCase() || 'png';
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(req.file.mimetype)) return res.status(400).json({ error: 'Format non autorisé (jpg, png, gif, webp)' });
  try {
    const bucket = getStorage().bucket();
    const fileName = `saasAccounts/${req.saasAccountId}/email-logo-${templateType}.${ext}`;
    const storageFile = bucket.file(fileName);
    await storageFile.save(req.file.buffer, { contentType: req.file.mimetype });
    await storageFile.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    const saasRef = firestore.collection('saasAccounts').doc(req.saasAccountId);
    const saasDoc = await saasRef.get();
    const current = saasDoc.exists ? saasDoc.data().emailTemplates || {} : {};
    const target = current[templateType] || {};
    const updated = { ...current, [templateType]: { ...target, bannerLogoUrl: publicUrl } };
    await saasRef.set({ emailTemplates: updated, updatedAt: Timestamp.now() }, { merge: true });
    return res.json({ url: publicUrl, success: true });
  } catch (err) {
    console.error('[API] Erreur upload logo:', err);
    return res.status(500).json({ error: err.message || 'Erreur upload' });
  }
});

app.post('/api/email-templates-extended/reset', requireAuth, checkCustomizeAutoEmails, async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte non configuré' });
  const { type } = req.body || {};
  try {
    const saasRef = firestore.collection('saasAccounts').doc(req.saasAccountId);
    const saasDoc = await saasRef.get();
    const current = saasDoc.exists ? saasDoc.data().emailTemplates || {} : {};
    let updated;
    if (type && EMAIL_TYPES_EXTENDED.includes(type)) {
      const { [type]: _removed, ...rest } = current;
      updated = rest;
    } else {
      updated = {};
    }
    await saasRef.set({ emailTemplates: updated, updatedAt: Timestamp.now() }, { merge: true });
    return res.json({
      success: true,
      templates: getTemplatesExtendedForAccount(updated),
      customTemplates: updated,
    });
  } catch (err) {
    console.error('[API] Erreur reset email-templates-extended:', err);
    return res.status(500).json({ error: 'Erreur réinitialisation' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API : Messages personnalisés devis (custom-quote-messages)
// Stocké dans saasAccounts/{id}.customQuoteMessages
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/custom-quote-messages', requireAuth, async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte non configuré' });
  try {
    const saasDoc = await firestore.collection('saasAccounts').doc(req.saasAccountId).get();
    const data = saasDoc.exists ? saasDoc.data() : {};
    return res.json({ messages: data.customQuoteMessages || { principales: [], optionnelles: [] } });
  } catch (err) {
    console.error('[API] Erreur GET custom-quote-messages:', err);
    return res.status(500).json({ error: 'Erreur récupération messages' });
  }
});

app.put('/api/custom-quote-messages', requireAuth, async (req, res) => {
  if (!firestore || !req.saasAccountId) return res.status(400).json({ error: 'Compte non configuré' });
  const { messages } = req.body || {};
  if (!messages || typeof messages !== 'object') {
    return res.status(400).json({ error: 'Données invalides' });
  }
  const principales = Array.isArray(messages.principales) ? messages.principales : [];
  const optionnelles = Array.isArray(messages.optionnelles) ? messages.optionnelles : [];
  const validate = (list) => list.every(
    (m) => m && typeof m.id === 'string' && typeof m.label === 'string' && typeof m.textFr === 'string' && typeof m.textEn === 'string'
  );
  if (!validate(principales) || !validate(optionnelles)) {
    return res.status(400).json({ error: 'Structure des messages invalide' });
  }
  try {
    await firestore.collection('saasAccounts').doc(req.saasAccountId).set(
      { customQuoteMessages: { principales, optionnelles }, updatedAt: Timestamp.now() },
      { merge: true }
    );
    return res.json({ success: true, messages: { principales, optionnelles } });
  } catch (err) {
    console.error('[API] Erreur PUT custom-quote-messages:', err);
    return res.status(500).json({ error: 'Erreur sauvegarde messages' });
  }
});

/** Helper: construit le HTML complet d'un email depuis un template (bandeau + corps + bouton + signature) */
function buildEmailHtmlFromTemplate(template, bodyHtml, signatureHtml, values = {}) {
  const bannerColor = template.bannerColor || '#2563eb';
  const buttonColor = template.buttonColor || '#2563eb';
  const bannerTitle = replacePlaceholdersExtended(template.bannerTitle || '', values);
  const bannerLogoUrl = template.bannerLogoUrl || '';
  const buttonLabel = template.buttonLabel ? replacePlaceholdersExtended(template.buttonLabel, values) : null;
  const paymentUrl = values.lienPaiementSecurise || values.paymentUrl || '';

  let buttonSection = '';
  if (paymentUrl && buttonLabel) {
    buttonSection = `
    <div style="text-align: center; margin-top: 30px; margin-bottom: 20px; padding: 20px; background: #f0f9ff; border-radius: 8px; border: 2px solid ${buttonColor};">
      <p style="margin: 0 0 15px 0; font-size: 14px; color: ${buttonColor}; font-weight: 600;">💳 Procéder au paiement</p>
      <a href="${paymentUrl}" style="display: inline-block; background: ${buttonColor}; color: white !important; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 18px;">
        ${buttonLabel}
      </a>
      <p style="margin-top: 15px; font-size: 12px; color: #6b7280;">
        Ou copiez ce lien : <a href="${paymentUrl}" style="color: ${buttonColor}; word-break: break-all;">${paymentUrl}</a>
      </p>
    </div>`;
  }

  const logoHtml = bannerLogoUrl
    ? `<img src="${bannerLogoUrl.replace(/"/g, '&quot;')}" alt="Logo" style="max-height:60px;max-width:200px;display:block;margin:0 auto 12px auto;" />`
    : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>body{font-family:${template.fontFamily || 'Arial, sans-serif'};font-size:${template.fontSize || 14}px;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;}</style></head>
<body>
  <div style="background:${bannerColor};color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
    ${logoHtml}
    <h1 style="margin:0;">${bannerTitle}</h1>
  </div>
  <div style="background:#f9fafb;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
    <div style="margin-bottom:20px;">${bodyHtml}</div>
    ${buttonSection}
    <p style="margin-top:30px;">${signatureHtml}</p>
  </div>
</body>
</html>`.trim();
}

// ===== ROUTE RÉCUPÉRATION DEVIS (FILTRÉS PAR SAAS ACCOUNT) =====

// Récupérer tous les devis pour le compte SaaS connecté
app.get("/api/quotes", requireAuth, async (req, res) => {
  if (!firestore) {
    return res.status(500).json({ error: 'Firestore non configuré' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré' });
  }

  try {
    console.log(`[API] 📥 GET /api/quotes pour saasAccountId: ${req.saasAccountId}`);
    
    // Récupérer uniquement les devis du compte SaaS connecté
    // ATTENTION: Cette requête nécessite un index Firestore composite:
    // - saasAccountId (ASC)
    // - createdAt (DESC)
    // Si l'index n'existe pas, Firestore retournera une erreur avec un lien pour le créer
    
    let quotesSnapshot;
    try {
      quotesSnapshot = await firestore
        .collection('quotes')
        .where('saasAccountId', '==', req.saasAccountId)
        .orderBy('createdAt', 'desc')
        .get();
    } catch (indexError) {
      // Si l'index n'existe pas encore, essayer sans orderBy
      console.warn('[API] ⚠️  Index Firestore manquant, récupération sans tri:', indexError.message);
      
      // Si l'erreur contient un lien pour créer l'index, le logger
      if (indexError.message && indexError.message.includes('index')) {
        console.error('');
        console.error('═══════════════════════════════════════════════════════════════');
        console.error('🔴 INDEX FIRESTORE REQUIS - ACTION IMMÉDIATE');
        console.error('═══════════════════════════════════════════════════════════════');
        console.error('');
        console.error('📋 Créez un index composite dans Firestore:');
        console.error('   Collection: quotes');
        console.error('   Champs: saasAccountId (ASC), createdAt (DESC)');
        console.error('');
        console.error('🔗 Méthode 1 - Lien automatique (RECOMMANDÉ):');
        console.error('   Cherchez dans l\'erreur ci-dessus une URL qui commence par:');
        console.error('   https://console.firebase.google.com/v1/r/project/...');
        console.error('   Cliquez sur ce lien pour créer l\'index automatiquement');
        console.error('');
        console.error('🔗 Méthode 2 - Firebase Console:');
        console.error('   https://console.firebase.google.com/project/sdv-automation-mbe/firestore/indexes');
        console.error('   Cliquez sur "Create Index" et configurez:');
        console.error('   - Collection: quotes');
        console.error('   - saasAccountId: ASC');
        console.error('   - createdAt: DESC');
        console.error('');
        console.error('🔗 Méthode 3 - Script automatique:');
        console.error('   ./CREATE_FIRESTORE_INDEX.sh');
        console.error('');
        console.error('📖 Guide complet: FIRESTORE_INDEX_SETUP.md');
        console.error('');
        console.error('═══════════════════════════════════════════════════════════════');
        console.error('');
        
        // Essayer d'extraire le lien de l'erreur
        const errorStr = indexError.message || JSON.stringify(indexError);
        const urlMatch = errorStr.match(/https:\/\/console\.firebase\.google\.com[^\s\)]+/);
        if (urlMatch) {
          console.error('🔗 LIEN DIRECT POUR CRÉER L\'INDEX:');
          console.error('   ' + urlMatch[0]);
          console.error('');
        }
      }
      
      // Fallback: récupérer sans orderBy (moins optimal mais fonctionne)
      quotesSnapshot = await firestore
        .collection('quotes')
        .where('saasAccountId', '==', req.saasAccountId)
        .get();
      
      // Trier manuellement côté serveur
      const quotesArray = quotesSnapshot.docs.map(doc => ({
        doc,
        data: doc.data()
      }));
      
      quotesArray.sort((a, b) => {
        const dateA = a.data.createdAt?.toDate ? a.data.createdAt.toDate() : new Date(a.data.createdAt || 0);
        const dateB = b.data.createdAt?.toDate ? b.data.createdAt.toDate() : new Date(b.data.createdAt || 0);
        return dateB.getTime() - dateA.getTime(); // Desc
      });
      
      quotesSnapshot = {
        docs: quotesArray.map(item => item.doc)
      };
    }

    const quotes = await Promise.all(quotesSnapshot.docs.map(async (doc) => {
      const data = doc.data();
      
      // Charger les paiements depuis la collection paiements
      let paymentLinksFromPaiements = [];
      let paidAmount = 0;
      try {
        const paiementsSnapshot = await firestore
          .collection('paiements')
          .where('devisId', '==', doc.id)
          .get();
        
        paiementsSnapshot.docs.forEach(paiementDoc => {
          const p = paiementDoc.data();
          if (p.status === 'PAID') {
            paidAmount += (p.amount || 0);
          }
          paymentLinksFromPaiements.push({
            id: paiementDoc.id,
            url: p.url || p.stripeCheckoutUrl || '',
            amount: p.amount || 0,
            type: p.type || 'PRINCIPAL',
            createdAt: p.createdAt?.toDate ? p.createdAt.toDate().toISOString() : p.createdAt,
            status: p.status === 'PAID' ? 'paid' : (p.status === 'CANCELLED' ? 'expired' : 'active')
          });
        });
      } catch (paiementError) {
        console.warn(`[API] ⚠️  Erreur chargement paiements pour devis ${doc.id}:`, paiementError.message);
      }
      
      // Fusionner avec les paymentLinks existants (ancien système)
      const existingPaymentLinks = data.paymentLinks || [];
      const allPaymentLinks = [...existingPaymentLinks, ...paymentLinksFromPaiements];
      
      // Convertir les Timestamps en Dates pour le frontend
      const toIso = (v) => (v?.toDate ? v.toDate().toISOString() : v);
      return {
        id: doc.id,
        ...data,
        paidAmount,
        paymentLinks: allPaymentLinks,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        sentToMbeHubAt: toIso(data.sentToMbeHubAt),
        shippedAt: toIso(data.shippedAt),
        clientRefusalAt: toIso(data.clientRefusalAt),
        reminderSentAt: toIso(data.reminderSentAt),
        manualPaymentDate: toIso(data.manualPaymentDate),
        // Convertir timeline si présent
        timeline: data.timeline?.map((event) => ({
          ...event,
          date: event.date?.toDate ? event.date.toDate().toISOString() : event.date
        })) || []
      };
    }));

    console.log(`[API] ✅ ${quotes.length} devis récupéré(s) pour saasAccountId: ${req.saasAccountId}`);
    res.json(quotes);
  } catch (error) {
    console.error('[API] Erreur lors de la récupération des devis:', error);
    // En cas d'erreur critique, retourner un tableau vide plutôt qu'une erreur 500
    // Cela évite de casser le frontend pendant que l'index se construit
    res.status(200).json([]);
  }
});

// ===== ROUTES GROUPEMENT D'EXPÉDITION =====

// Trouver les devis groupables pour un devis donné
app.get("/api/devis/:id/groupable-quotes", (req, res) => {
  console.log('[AI Proxy] 📥 GET /api/devis/:id/groupable-quotes appelé');
  handleGetGroupableQuotes(req, res, firestore);
});

// Créer un nouveau groupement d'expédition
app.post("/api/shipment-groups", (req, res) => {
  console.log('[AI Proxy] 📥 POST /api/shipment-groups appelé');
  handleCreateShipmentGroup(req, res, firestore);
});

// Récupérer un groupement d'expédition
app.get("/api/shipment-groups/:id", (req, res) => {
  console.log('[AI Proxy] 📥 GET /api/shipment-groups/:id appelé');
  handleGetShipmentGroup(req, res, firestore);
});

// Dissoudre un groupement d'expédition
app.delete("/api/shipment-groups/:id", (req, res) => {
  console.log('[AI Proxy] 📥 DELETE /api/shipment-groups/:id appelé');
  handleDeleteShipmentGroup(req, res, firestore);
});

// ==========================================
// ROUTES GRILLE TARIFAIRE D'EXPÉDITION
// ==========================================

import {
  initializeShippingRates,
  handleGetZones,
  handleCreateZone,
  handleUpdateZone,
  handleDeleteZone,
  handleGetServices,
  handleCreateService,
  handleUpdateService,
  handleDeleteService,
  handleGetWeightBrackets,
  handleCreateWeightBracket,
  handleUpdateWeightBracket,
  handleDeleteWeightBracket,
  handleGetRates,
  handleUpsertRate,
  handleGetSettings,
  handleUpdateSettings,
  handleGetGrid,
  calculateShippingPriceFromGrid,
  mapCountryToCode,
} from './shipping-rates.js';
import {
  handleGetSettings as handleGetInsuranceSettings,
  handleUpdateSettings as handleUpdateInsuranceSettings,
  computeInsuranceAmount as computeInsuranceAmountFromSettings,
  getInsuranceConfig,
} from './insurance-settings.js';

// Zones d'expédition
app.get('/api/shipping/zones', requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 GET /api/shipping/zones appelé');
  handleGetZones(req, res, firestore);
});

app.post('/api/shipping/zones', requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 POST /api/shipping/zones appelé');
  handleCreateZone(req, res, firestore);
});

app.put('/api/shipping/zones/:id', requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 PUT /api/shipping/zones/:id appelé');
  handleUpdateZone(req, res, firestore);
});

app.delete('/api/shipping/zones/:id', requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 DELETE /api/shipping/zones/:id appelé');
  handleDeleteZone(req, res, firestore);
});

// Services d'expédition
app.get('/api/shipping/services', requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 GET /api/shipping/services appelé');
  handleGetServices(req, res, firestore);
});

app.post('/api/shipping/services', requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 POST /api/shipping/services appelé');
  handleCreateService(req, res, firestore);
});

app.put('/api/shipping/services/:id', requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 PUT /api/shipping/services/:id appelé');
  handleUpdateService(req, res, firestore);
});

app.delete('/api/shipping/services/:id', requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 DELETE /api/shipping/services/:id appelé');
  handleDeleteService(req, res, firestore);
});

// Tranches de poids
app.get('/api/shipping/weight-brackets', requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 GET /api/shipping/weight-brackets appelé');
  handleGetWeightBrackets(req, res, firestore);
});

app.post('/api/shipping/weight-brackets', requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 POST /api/shipping/weight-brackets appelé');
  handleCreateWeightBracket(req, res, firestore);
});

app.put('/api/shipping/weight-brackets/:id', requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 PUT /api/shipping/weight-brackets/:id appelé');
  handleUpdateWeightBracket(req, res, firestore);
});

app.delete('/api/shipping/weight-brackets/:id', requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 DELETE /api/shipping/weight-brackets/:id appelé');
  handleDeleteWeightBracket(req, res, firestore);
});

// Tarifs d'expédition
app.get('/api/shipping/rates', requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 GET /api/shipping/rates appelé');
  handleGetRates(req, res, firestore);
});

app.post('/api/shipping/rates', requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 POST /api/shipping/rates appelé (upsert)');
  handleUpsertRate(req, res, firestore);
});

// Paramètres d'expédition
app.get('/api/shipping/settings', requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 GET /api/shipping/settings appelé');
  handleGetSettings(req, res, firestore);
});

app.put('/api/shipping/settings', requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 PUT /api/shipping/settings appelé');
  handleUpdateSettings(req, res, firestore);
});

// Grille complète (toutes les données en une seule requête)
app.get('/api/shipping/grid', requireAuth, (req, res) => {
  console.log('[AI Proxy] 📥 GET /api/shipping/grid appelé');
  handleGetGrid(req, res, firestore);
});

// Paramètres assurance (configurable par compte)
app.get('/api/insurance/settings', requireAuth, (req, res) => {
  handleGetInsuranceSettings(req, res, firestore);
});
app.put('/api/insurance/settings', requireAuth, (req, res) => {
  handleUpdateInsuranceSettings(req, res, firestore);
});

  console.log('[AI Proxy] ✅ Routes grille tarifaire d\'expédition ajoutées');

  // Route pour forcer la ré-initialisation de la grille tarifaire
  app.post('/api/shipping/force-init', requireAuth, async (req, res) => {
    console.log('[AI Proxy] 📥 POST /api/shipping/force-init appelé');
    
    try {
      const { saasAccountId } = req;
      
      console.log(`[force-init] 🚀 Force-initialisation pour saasAccountId: ${saasAccountId}`);
      
      // 1. Supprimer les données existantes
      console.log('[force-init] 🗑️  Suppression des données existantes...');
      const collections = ['shippingZones', 'shippingServices', 'weightBrackets', 'shippingRates'];
      
      for (const collectionName of collections) {
        const snapshot = await firestore
          .collection(collectionName)
          .where('saasAccountId', '==', saasAccountId)
          .get();
        
        console.log(`[force-init] 📊 ${collectionName}: ${snapshot.size} document(s) trouvé(s)`);
        
        if (!snapshot.empty) {
          const batch = firestore.batch();
          snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
          await batch.commit();
          console.log(`[force-init] ✅ ${snapshot.size} document(s) supprimé(s) de ${collectionName}`);
        } else {
          console.log(`[force-init] ℹ️  Aucun document à supprimer dans ${collectionName}`);
        }
      }
      
      // Supprimer shippingSettings
      const settingsRef = firestore.collection('shippingSettings').doc(saasAccountId);
      const settingsDoc = await settingsRef.get();
      if (settingsDoc.exists) {
        await settingsRef.delete();
        console.log('[force-init] ✅ Paramètres supprimés');
      }
      
      // 2. Créer les nouvelles données
      console.log('[force-init] 🆕 Création des nouvelles données...');
      
      const timestamp = Timestamp.now();
      
      // Zones par défaut
      const DEFAULT_ZONES = [
        { code: 'A', name: 'Zone A - France', countries: ['FR'], order: 1 },
        { code: 'B', name: 'Zone B - Europe Proche', countries: ['BE', 'LU', 'DE', 'NL', 'ES', 'IT'], order: 2 },
        { code: 'C', name: 'Zone C - Europe Étendue', countries: ['PT', 'AT', 'DK', 'IE', 'SE', 'FI', 'PL', 'CZ', 'HU'], order: 3 },
        { code: 'D', name: 'Zone D - Europe Élargie', countries: ['UK', 'CH', 'NO', 'GR', 'RO', 'BG', 'HR'], order: 4 },
        { code: 'E', name: 'Zone E - Amérique du Nord', countries: ['CA', 'MX', 'US'], order: 5 },
        { code: 'F', name: 'Zone F - Asie Pacifique', countries: ['CN', 'HK', 'JP', 'KR', 'SG', 'TW', 'TH', 'MY', 'AU', 'NZ'], order: 6 },
        { code: 'G', name: 'Zone G - Amérique du Sud', countries: ['BR', 'AR', 'CL', 'CO', 'PE', 'VE'], order: 7 },
        { code: 'H', name: 'Zone H - Afrique & Moyen-Orient', countries: ['MA', 'TN', 'DZ', 'SN', 'CI', 'AE', 'SA'], order: 8 },
      ];
      
      // Services par défaut
      const DEFAULT_SERVICES = [
        { name: 'STANDARD', description: 'Livraison standard (5-7 jours)', order: 1 },
        { name: 'EXPRESS', description: 'Livraison express (2-3 jours)', order: 2 },
      ];
      
      // Tranches de poids par défaut
      const DEFAULT_WEIGHT_BRACKETS = [
        { minWeight: 1, order: 1 },
        { minWeight: 2, order: 2 },
        { minWeight: 5, order: 3 },
        { minWeight: 10, order: 4 },
        { minWeight: 15, order: 5 },
        { minWeight: 20, order: 6 },
        { minWeight: 30, order: 7 },
      ];
      
      // Créer les zones
      const zoneIds = {};
      for (const zone of DEFAULT_ZONES) {
        const zoneRef = firestore.collection('shippingZones').doc();
        await zoneRef.set({
          ...zone,
          saasAccountId,
          isActive: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        zoneIds[zone.code] = zoneRef.id;
      }
      console.log(`[force-init] ✅ ${DEFAULT_ZONES.length} zones créées`);
      
      // Créer les services
      const serviceIds = {};
      for (const service of DEFAULT_SERVICES) {
        const serviceRef = firestore.collection('shippingServices').doc();
        await serviceRef.set({
          ...service,
          saasAccountId,
          isActive: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        serviceIds[service.name] = serviceRef.id;
      }
      console.log(`[force-init] ✅ ${DEFAULT_SERVICES.length} services créés`);
      
      // Créer les tranches de poids
      const bracketIds = [];
      for (const bracket of DEFAULT_WEIGHT_BRACKETS) {
        const bracketRef = firestore.collection('weightBrackets').doc();
        await bracketRef.set({
          ...bracket,
          saasAccountId,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        bracketIds.push(bracketRef.id);
      }
      console.log(`[force-init] ✅ ${DEFAULT_WEIGHT_BRACKETS.length} tranches créées`);
      
      // Créer les paramètres
      await firestore.collection('shippingSettings').doc(saasAccountId).set({
        saasAccountId,
        overweightPolicy: 'FLAT_FEE',
        overweightFlatFee: 180,
        overweightMessage: 'Poids supérieur aux tranches standards',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      console.log('[force-init] ✅ Paramètres créés');
      
      res.status(200).json({
        success: true,
        message: 'Grille tarifaire initialisée avec succès',
        data: {
          zones: Object.keys(zoneIds).length,
          services: Object.keys(serviceIds).length,
          brackets: bracketIds.length,
        },
      });
    } catch (error) {
      console.error('[force-init] ❌ Erreur:', error);
      res.status(500).json({
        error: 'Erreur lors de l\'initialisation',
        details: error.message,
      });
    }
  });

// Exporter la fonction d'initialisation pour l'utiliser lors de la création d'un compte SaaS
export { initializeShippingRates };

// Webhook Stripe UNIQUE (Connect) - Body raw déjà appliqué dans le middleware
app.post("/webhooks/stripe", (req, res) => {
  console.log('[AI Proxy] 📥 POST /webhooks/stripe appelé (Stripe Connect)');
  console.log('[AI Proxy] 📥 Headers reçus:', {
    'stripe-signature': req.headers['stripe-signature'] ? 'present' : 'missing',
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length'],
    'user-agent': req.headers['user-agent'],
  });
  console.log('[AI Proxy] 📥 Body reçu:', req.body ? (Buffer.isBuffer(req.body) ? `${req.body.length} bytes (Buffer)` : typeof req.body) : 'empty');
  handleStripeWebhook(req, res, firestore, { sendEmail });
});

console.log('[AI Proxy] ✅ Routes Stripe Connect ajoutées');

// ==========================================
// FIN ROUTES STRIPE CONNECT
// ==========================================

// Handler global d'erreurs: garantir CORS même en cas d'erreur 5xx (évite "Origin not allowed" en 503)
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  corsHeaders(res);
  console.error('[AI Proxy] Erreur non gérée:', err?.message || err);
  const status = err?.status || err?.statusCode || 500;
  res.status(status).json({ error: err?.message || 'Erreur interne du serveur' });
});

// IMPORTANT: Le middleware catch-all DOIT être défini APRÈS toutes les routes
// Express vérifie les routes spécifiques (app.get, app.post) AVANT les middlewares app.use()
// Donc le catch-all ne devrait pas intercepter les routes définies avant
// Ajouter le error handler Sentry AVANT le catch-all 404
// Dans Sentry v10+, utiliser setupExpressErrorHandler() qui configure automatiquement les handlers
if (process.env.SENTRY_DSN) {
  try {
    if (typeof Sentry.setupExpressErrorHandler === 'function') {
      Sentry.setupExpressErrorHandler(app);
      console.log("[Sentry] ✅ setupExpressErrorHandler configuré");
    } else {
      // Fallback pour les anciennes versions
      console.warn("[Sentry] ⚠️  setupExpressErrorHandler non disponible, Sentry fonctionnera sans middleware Express spécifique");
      console.log("[Sentry] ℹ️  Les erreurs seront quand même capturées via l'initialisation globale");
    }
  } catch (error) {
    console.error("[Sentry] ❌ Erreur lors de la configuration des handlers Express:", error.message);
    console.log("[Sentry] ℹ️  Sentry continuera de fonctionner sans middleware Express");
  }
}

// Mais pour être sûr, on le définit juste avant app.listen()
app.use((req, res) => {
  corsHeaders(res);
  console.log('[AI Proxy] ❌ Route non trouvée (catch-all):', req.method, req.url);
  res.status(404).json({ error: `Route non trouvée: ${req.method} ${req.url}` });
});

// Démarrer le serveur - TOUTES les routes doivent être définies avant cet appel
console.log('[AI Proxy] Démarrage du serveur sur le port', PORT);
console.log('[AI Proxy] Vérification que toutes les routes sont définies...');

// Liste explicite de toutes les routes attendues
const expectedRoutes = [
  'GET /api/test',
  'GET /api/health',
  'POST /api/stripe/link',
  'POST /api/stripe/webhook',
  'POST /api/stripe/connect',
  'GET /stripe/callback',
  'GET /api/stripe/status',
  'GET /api/stripe/promo-codes-status',
  'POST /api/stripe/disconnect',
  'POST /api/devis/:id/paiement',
  'GET /api/devis/:id/paiements',
  'POST /api/paiement/:id/cancel',
  'POST /api/shipment-groups/:id/paiement',
  'POST /webhooks/stripe',
  'POST /api/analyze-auction-sheet',
  'POST /api/bordereau/extract',
  'POST /api/send-quote-email',
  'POST /api/send-collection-email',
  'POST /api/test-email',
  'POST /api/test-email-direct',
  'GET /auth/gmail/start',
  'GET /auth/gmail/callback',
  'GET /auth/google-sheets/start',
  'GET /auth/google-sheets/callback',
  'GET /auth/typeform/start',
  'GET /auth/typeform/callback',
  'GET /api/typeform/status',
  'DELETE /api/typeform/disconnect',
  'GET /api/google-sheets/status',
  'GET /api/google-sheets/list',
  'POST /api/google-sheets/select',
  'DELETE /api/google-sheets/disconnect',
  'POST /api/google-sheets/resync',
  'GET /api/google-sheets/column-mapping',
  'PUT /api/google-sheets/column-mapping',
  'GET /api/google-sheets/preview-rows',
  'GET /api/google-drive/folders',
  'POST /api/google-drive/select-folder',
  'GET /api/google-drive/status',
  'DELETE /api/google-drive/disconnect',
  'POST /api/devis/:id/search-bordereau',
  'POST /api/devis/:id/process-bordereau-from-link',
  'POST /api/devis/:id/recalculate',
  'POST /api/devis/:id/try-auto-payment',
  'POST /api/devis/:id/mark-collected',
  'POST /api/devis/:id/mark-awaiting-shipment',
  'POST /api/devis/:id/mark-shipped',
  'GET /api/email-accounts',
  'DELETE /api/email-accounts/:accountId',
  'GET /api/email-templates',
  'PUT /api/email-templates',
  'POST /api/email-templates/reset',
  'POST /api/email-templates/preview',
  'GET /api/devis/:devisId/messages',
  'GET /api/notifications',
  'GET /api/notifications/count',
  'DELETE /api/notifications/:id',
  'GET /api/quotes',
  'GET /api/devis/:id/groupable-quotes',
  'POST /api/shipment-groups',
  'GET /api/shipment-groups/:id',
  'DELETE /api/shipment-groups/:id',
  'POST /api/saas-account/create',
  'GET /api/shipping/zones',
  'POST /api/shipping/zones',
  'PUT /api/shipping/zones/:id',
  'DELETE /api/shipping/zones/:id',
  'GET /api/shipping/services',
  'POST /api/shipping/services',
  'PUT /api/shipping/services/:id',
  'DELETE /api/shipping/services/:id',
  'GET /api/shipping/weight-brackets',
  'POST /api/shipping/weight-brackets',
  'PUT /api/shipping/weight-brackets/:id',
  'DELETE /api/shipping/weight-brackets/:id',
  'GET /api/shipping/rates',
  'POST /api/shipping/rates',
  'GET /api/shipping/settings',
  'PUT /api/shipping/settings',
  'GET /api/shipping/grid'
];
console.log('[AI Proxy] Routes attendues:', expectedRoutes.join(', '));

// Toutes les routes sont maintenant définies
// Le middleware catch-all est le dernier middleware (défini juste avant)
// app.listen() va démarrer le serveur avec toutes les routes enregistrées

// Confirmer que toutes les routes sont définies
console.log('[AI Proxy] ✅ Toutes les routes sont définies, démarrage du serveur...');

const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 requis pour Railway/Docker
app.listen(PORT, HOST, () => {
  console.log(`[AI Proxy] ✅ Serveur démarré sur ${HOST}:${PORT}`);
  console.log(`[AI Proxy] Routes disponibles:`);
  console.log(`[AI Proxy]   - GET  http://localhost:${PORT}/api/health`);
  console.log(`[AI Proxy]   - POST http://localhost:${PORT}/api/analyze-auction-sheet`);
  console.log(`[AI Proxy]   - POST http://localhost:${PORT}/api/send-quote-email`);
  console.log(`[AI Proxy]   - POST http://localhost:${PORT}/api/send-collection-email`);
  console.log(`[AI Proxy]   - POST http://localhost:${PORT}/api/test-email`);
  console.log(`[AI Proxy]   - POST http://localhost:${PORT}/api/test-email-direct`);
  if (process.env.GROQ_API_KEY) {
    console.log(`[AI Proxy] ✅ Groq configuré`);
  } else if (process.env.OPENAI_API_KEY) {
    console.log(`[AI Proxy] ✅ OpenAI configuré`);
  } else {
    console.log(`[AI Proxy] ⚠️  Aucune clé API configurée`);
  }
  // Logs de configuration email Resend
  if (resendClient && EMAIL_FROM) {
    console.log(`[AI Proxy] ✅ Email Resend configuré (${EMAIL_FROM})`);
    console.log(`[AI Proxy]    API: https://api.resend.com`);
  } else {
    console.log(`[AI Proxy] ⚠️  Resend non configuré (RESEND_API_KEY + EMAIL_FROM requis)`);
    if (!RESEND_API_KEY) console.log(`[AI Proxy]    - RESEND_API_KEY manquant`);
    if (!EMAIL_FROM) console.log(`[AI Proxy]    - EMAIL_FROM manquant`);
  }
});

