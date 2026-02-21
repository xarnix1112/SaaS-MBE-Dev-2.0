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
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import XLSX from "xlsx";
import { Resend } from "resend";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { google } from "googleapis";
import * as Sentry from "@sentry/node";
import {
  handleStripeConnect,
  handleStripeCallback,
  handleCreatePaiement,
  handleGetPaiements,
  handleCancelPaiement,
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
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });
dotenv.config({ path: envLocalPath, override: true });

console.log('[Config] Chargement .env depuis:', { 
  env: envPath, 
  envLocal: envLocalPath,
  envExists: fs.existsSync(envPath),
  envLocalExists: fs.existsSync(envLocalPath)
});

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
let resendClient = null;
if (RESEND_API_KEY) {
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
  console.log('[Config] ⚠️  Resend non configuré (RESEND_API_KEY requis)');
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

// CORS pour permettre les requêtes depuis le frontend (toujours envoyer, même en erreur)
const corsHeaders = (res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};
app.use((req, res, next) => {
  corsHeaders(res);
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

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
  
  // 1) Fichier de credentials (dev / CI)
  const credentialsPath = path.join(__dirname, "..", "firebase-credentials.json");
  console.log("[ai-proxy] 🔍 Recherche du fichier Firebase credentials:", credentialsPath);
  console.log("[ai-proxy] Fichier existe:", fs.existsSync(credentialsPath));

  let serviceAccount = null;
  if (fs.existsSync(credentialsPath)) {
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

  if (serviceAccount) {
    console.log("[ai-proxy] 🔧 Initialisation de Firebase Admin avec credentials...");
    initializeApp({
      credential: cert(serviceAccount),
      projectId: firebaseConfig.projectId,
    });
    console.log("[ai-proxy] ✅ Firebase App initialisée avec credentials");
  } else {
    console.warn("[ai-proxy] ⚠️  Aucun fichier ni variables FIREBASE_* trouvés, utilisation des Application Default Credentials");
    initializeApp({
      projectId: firebaseConfig.projectId,
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
  
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    console.error("[ai-proxy] ❌ Webhook non configuré:", {
      stripe: Boolean(stripe),
      webhookSecret: Boolean(STRIPE_WEBHOOK_SECRET),
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
    console.log("[ai-proxy] ✅ Webhook vérifié avec succès, type:", event.type);
  } catch (err) {
    console.error("[ai-proxy] ❌ Erreur de vérification du webhook:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const obj = event.data.object || {};
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
      await stripeConnectModule.handleStripeWebhook(modifiedReq, res, firestore);
      return; // Important : ne pas continuer le traitement Payment Link
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
      // tesseract.js v6: la langue est passée à createWorker()
      const worker = await createWorker("fra+eng", 1, {
        logger: (m) => {
          // éviter le spam: uniquement les étapes majeures
          if (m?.status && (m.status === "initializing" || m.status === "recognizing text")) {
            console.log("[OCR]", m.status, m.progress ?? "");
          }
        },
      });
      await worker.setParameters({
        // Bon compromis pour du texte en tableau
        tessedit_pageseg_mode: "6",
        preserve_interword_spaces: "1",
      });
      return worker;
    })();
  }
  return ocrWorkerPromise;
}

async function runOcrOnImage(buffer) {
  const worker = await getOcrWorker();

  // Double passe OCR: parfois le threshold détruit du texte fin (ou inversement).
  const variants = [
    async () =>
      sharp(buffer)
        .rotate()
        .grayscale()
        .normalize()
        .threshold(180)
        .sharpen()
        .resize({ width: 3000, withoutEnlargement: false })
        .png()
        .toBuffer(),
    async () =>
      sharp(buffer)
        .rotate()
        .grayscale()
        .normalize()
        .sharpen()
        .resize({ width: 3000, withoutEnlargement: false })
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

async function renderPdfToPngBuffers(pdfBuffer, { maxPages = 10, scale = 3.0 } = {}) {
  // Nouvelle approche: écrire dans un fichier temporaire pour éviter complètement les problèmes de Buffer
  const tempPath = path.join(__dirname, `.temp-pdf-${Date.now()}.pdf`);
  
  try {
    // Écrire le buffer dans un fichier temporaire
    await fs.promises.writeFile(tempPath, pdfBuffer);
    console.log('[PDF] Wrote temp file:', tempPath);
    
    // Charger depuis le fichier (pdfjs aime mieux ça)
    const doc = await pdfjsLib.getDocument(tempPath).promise;
    const pageCount = Math.min(doc.numPages, maxPages);
    const buffers = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      const png = canvas.toBuffer("image/png");
      buffers.push(png);
    }

    console.log('[PDF] Successfully rendered', pageCount, 'pages');
    return { buffers, pageCount: doc.numPages, renderedPages: pageCount };
  } catch (err) {
    console.error('[PDF] Error:', err.message);
    throw err;
  } finally {
    // Nettoyer le fichier temporaire
    try {
      await fs.promises.unlink(tempPath);
      console.log('[PDF] Cleaned temp file');
    } catch (e) {
      // Ignorer les erreurs de nettoyage
    }
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
  // Regex ROBUSTE (AVANT tout cleaning) : /BORDEREAU\s+ACQU[ÉE]REUR\s*N[°ºo]?\s*(\d{3,8})/i
  let numero_bordereau = null;
  // IMPORTANT: Extraction AVANT tout nettoyage/split pour éviter la perte de structure
  const bordereauAcquereurMatch = allText.match(/BORDEREAU\s+ACQU[ÉE]REUR\s*N[°ºo]?\s*(\d{3,8})/i);
  if (bordereauAcquereurMatch) {
    numero_bordereau = bordereauAcquereurMatch[1];
    console.log(`[OCR][Bordereau] Numéro extrait: ${numero_bordereau}`);
  }
  
  // PRIORITÉ 2: Autres formats (invoice, facture, bordereau générique)
  if (!numero_bordereau) {
  const numRegexes = [
    /\b(?:invoice|facture|bordereau)\s*(?:no\.?|n°|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/]{3,})\b/i,
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

  // Invoice No.
  const inv = text.match(/\bInvoice\s*No\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/]{2,})\b/i);
  if (inv) out.numero_bordereau = inv[1];
  // Bordereau acquéreur N° - Regex ROBUSTE (AVANT tout cleaning)
  if (!out.numero_bordereau) {
    const b = text.match(/BORDEREAU\s+ACQU[ÉE]REUR\s*N[°ºo]?\s*(\d{3,8})/i);
    if (b) {
      out.numero_bordereau = b[1];
      console.log(`[OCR][Bordereau] Numéro extrait depuis fallback: ${out.numero_bordereau}`);
    }
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

function extractLotsFromTable(lines) {
  // détecter la ligne d'en-tête de tableau (si OCR l'a bien lue)
  let headerIdx = -1;
  let hasLigneColumn = false;
  let isBoisgirardAntonini = false;
  let hasBoisgirardHeader = false;
  
  // Détecter si c'est un bordereau Boisgirard Antonini
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const low = lines[i].text.toLowerCase();
    if (low.includes("boisgirard") || low.includes("antonini")) {
      isBoisgirardAntonini = true;
      console.log('[OCR][BA] Bordereau Boisgirard Antonini détecté');
      break;
    }
  }
  
  // Détecter l'en-tête spécifique Boisgirard Antonini : "Ligne Références Description Adjudication"
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].text.toLowerCase();
    // Regex permissif pour l'en-tête Boisgirard Antonini
    if (/ligne\s+réf\S*\s+description\s+adjudication/i.test(lines[i].text)) {
      headerIdx = i;
      hasLigneColumn = true;
      hasBoisgirardHeader = true;
      console.log('[OCR][BA] En-tête tabulaire détecté:', lines[i].text);
      break;
    }
    // Fallback: détection classique
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
  
  // Pour Boisgirard Antonini, on suppose toujours qu'il y a une colonne "Ligne" même si non détectée
  if (isBoisgirardAntonini && !hasLigneColumn) {
    hasLigneColumn = true;
  }

  // fallback si pas d'en-tête: commencer après la zone header (y>=0.22)
  const start = headerIdx >= 0 ? headerIdx + 1 : 0;
  const table = lines.slice(start).filter((l) => l.yn >= 0.18 && l.yn <= 0.90);

  const footerStop = /(total\s*invoice|invoice\s*total|facture\s*total|total\s*facture|montant\s*total|total\s*ttc|\d+\s+lot\(s\))/i;
  const lots = [];
  let current = null;

  // MODE SPÉCIFIQUE BOISGIRARD ANTONINI : parsing tabulaire avec deux nombres identiques
  if (isBoisgirardAntonini && hasBoisgirardHeader) {
    console.log('[OCR][BA] Mode parsing tabulaire activé');
    for (const row of table) {
      if (footerStop.test(row.text)) {
        console.log('[OCR][BA] Footer détecté, arrêt du parsing');
        break;
      }
      
      // Ignorer lignes parasites
      const lowRow = row.text.toLowerCase();
      if (
        lowRow.includes("nombre de lots") ||
        lowRow.includes("nombre d'objets") ||
        lowRow.includes("lots détectés") ||
        lowRow.includes("salle des ventes") ||
        lowRow.includes("bordereau acquereur")
      ) {
        continue;
      }

      // Pattern spécifique Boisgirard : <number> <number> <description...> <price>
      // Les deux premiers nombres sont identiques = numéro de lot
      const baPattern = /^(\d{1,4})\s+(\d{1,4})\s+(.+?)\s+(\d{1,3}[,\u00A0.]\d{2})\s*(?:€|EUR)?/i;
      const match = row.text.match(baPattern);
      
      if (match) {
        const [, ligne, reference, description, priceStr] = match;
        
        // Vérifier que les deux nombres sont identiques (signal fiable)
        if (ligne === reference) {
          const lotNumber = ligne;
          const prix_marteau = normalizeAmountStrict(priceStr);
          
          console.log(`[OCR][BA] Lot détecté: ligne=${ligne}, référence=${reference}, prix=${prix_marteau}`);
          
          if (current) lots.push(current);
          current = {
            numero_lot: lotNumber,
            description: description.trim(),
            prix_marteau: prix_marteau ?? null,
          };
        } else {
          console.log(`[OCR][BA] Nombres non identiques (ignoré): ligne=${ligne}, référence=${reference}`);
        }
      } else if (current) {
        // Continuation de description (ligne suivante sans prix)
        const cont = row.text.trim();
        if (cont && !footerStop.test(cont)) {
          current.description = `${current.description} ${cont}`.trim();
        }
      }
    }
    
    if (current) lots.push(current);
    console.log(`[OCR][BA] ${lots.length} lot(s) extrait(s) en mode tabulaire`);
    
    return lots
      .map((l) => ({
        numero_lot: l.numero_lot !== null && l.numero_lot !== undefined ? String(l.numero_lot) : null,
        description: (l.description || "").replace(/\s+/g, " ").trim(),
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

    // fallback lot detection: parfois le numéro est tout seul dans la première colonne
    const lotNumberFinal = lotNumber;

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

async function extractBordereauFromFile(fileBuffer, mimeType) {
  const pages = [];
  let ocrRawText = "";

  if (mimeType === "application/pdf") {
    const { buffers, renderedPages, pageCount } = await renderPdfToPngBuffers(fileBuffer, {
      maxPages: 10,
      scale: 3.0,
    });
    for (let i = 0; i < buffers.length; i++) {
      const r = await runOcrOnImage(buffers[i]);
      const lines = buildLinesFromWords(r.words);
      pages.push({ pageIndex: i, lines, words: r.words, confidence: r.confidence, text: r.text });
      ocrRawText += `\n\n--- PAGE ${i + 1}/${renderedPages} (rendered) ---\n${r.text}`;
    }
  } else if (mimeType.startsWith("image/")) {
    const r = await runOcrOnImage(fileBuffer);
    const lines = buildLinesFromWords(r.words);
    pages.push({ pageIndex: 0, lines, words: r.words, confidence: r.confidence, text: r.text });
    ocrRawText = r.text;
  } else {
    throw new Error("Format non supporté. Utilisez une image (PNG/JPG) ou un PDF.");
  }

  // Champs header depuis page 0 uniquement
  const first = pages[0];
  const salle_vente = first ? extractSalleVenteFromHeader(first.lines) : null;
  const headerFields = first ? extractHeaderFields(first.lines) : { numero_bordereau: null, vente: null, date: null };

  // Total: chercher en priorité sur la dernière page (footer)
  const last = pages[pages.length - 1];
  const total = last ? extractTotalFromLines(last.lines) : null;

  // Lots: concat lots de toutes les pages (1..n), mais éviter duplications simples
  const lotsAll = [];
  for (const p of pages) {
    const lots = extractLotsFromTable(p.lines);
    for (const l of lots) lotsAll.push(l);
  }
  // dédoublonnage par numero_lot + préfixe description
  const seen = new Set();
  const lots = [];
  for (const l of lotsAll) {
    const key = `${l.numero_lot}::${l.description.slice(0, 30)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lots.push(l);
  }

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
 * - Colonne gauche: numéro de lot (≈ 0-18% largeur)
 * - Colonne droite: adjudication/prix (≈ 72-100% largeur)
 * - Colonne centrale: description (≈ 18-72% largeur)
 * - Les lignes sans numéro de lot sont considérées comme des continuations de description
 */
function extractLotsFromOcrWords(words) {
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
  // repère la ligne d'en-tête (pour ignorer ce qui est au-dessus)
  let headerY = null;
  let hasLigneColumn = false;
  let isBoisgirardAntonini = false;
  
  // Détecter si c'est un bordereau Boisgirard Antonini
  for (const row of rows.slice(0, 20)) {
    const full = row.words.map((w) => w.text).join(" ").toLowerCase();
    if (full.includes("boisgirard") || full.includes("antonini")) {
      isBoisgirardAntonini = true;
      break;
    }
  }
  
  for (const row of rows) {
    const full = row.words.map((w) => w.text).join(" ").toLowerCase();
    if (full.includes("description") && (full.includes("adjudication") || full.includes("prix"))) {
      headerY = row.y;
      // Détecter si la colonne s'appelle "Ligne" ou "Ligne / Référence"
      hasLigneColumn = full.includes("ligne");
      break;
    }
  }
  
  // Pour Boisgirard Antonini, on suppose toujours qu'il y a une colonne "Ligne" même si non détectée
  if (isBoisgirardAntonini && !hasLigneColumn) {
    hasLigneColumn = true;
  }

  // MODE SPÉCIFIQUE BOISGIRARD ANTONINI : extraction par position spatiale (bbox)
  if (isBoisgirardAntonini) {
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
          // Vérifier que ce n'est pas dans un contexte de date/téléphone/total
          const context = row.words.map(ww => ww.text).join(" ").toLowerCase();
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
      
      // Nettoyer la description (enlever codes comme "XF5")
      let description = descriptionWords
        .replace(/^[A-Z]{2,}[A-Z0-9]*\s*/i, "") // Enlever codes comme "XF5"
        .trim();
      
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
    .map((l) => ({
      lotNumber: l.lotNumber !== null && l.lotNumber !== undefined ? String(l.lotNumber) : null,
      description: (Array.isArray(l.description) ? l.description.join(" ") : String(l.description || "")).replace(/\s+/g, " ").trim(),
      value: typeof l.value === "number" && Number.isFinite(l.value) ? l.value : 0,
    }))
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

  // 1) Cas explicite Millon Riviera
  const millonLine =
    lines.find((l) => /millon/i.test(l) && /riviera/i.test(l)) ||
    lines.find((l) => /millon/i.test(l)) ||
    lines.find((l) => /riviera/i.test(l));
  if (millonLine) {
    return millonLine
      .replace(/salle des ventes?/i, "")
      .replace(/bordereau/i, "")
      .trim();
  }

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
    "nombre",
    "lots",
    "objets",
    "description",
    "adjudication",
    "total",
    "invoice",
    "facture",
  ];

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
      if (c.letters < 6) return false;
      if (c.text.length > 80) return false;
      // milieu horizontal
      if (c.center < 0.3 || c.center > 0.7) return false;
      return true;
    });

  const millon = candidates.find((c) => /millon/i.test(c.text) && /riviera/i.test(c.text));
  if (millon) return millon.text;
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
  const lines = ocrText
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const key = /(total\s*invoice|invoice\s*total|facture\s*total|total\s*facture|montant\s*total|total\s*ttc)/i;
  const price = /(\d[\d\s.,]*\d)\s*(?:€|EUR)?/i;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!key.test(l)) continue;

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
 * Estime les dimensions d'un objet en interrogeant l'IA
 */
async function estimateDimensionsForObject(description, apiKey) {
  console.log(`[Dimensions] 🔍 Estimation dimensions pour: "${description.substring(0, 100)}..."`);
  
  // Détection préalable du type d'objet pour adapter le prompt
  const descLower = description.toLowerCase();
  // Détection robuste des livres (in-8, in 8, in-8°, in 8°, in-4, etc.)
  const isBook = /livre|ouvrage|traité|manuel|in[\s-]?8|in[\s-]?4|in[\s-]?12|in[\s-]?16|in[\s-]?folio|folio|quarto|octavo|édition|volume|tome/i.test(descLower);
  const isSmallObject = /bijou|montre|bague|médaille|pièce|petit|petite/i.test(descLower);
  const isTableau = /tableau|peinture|affiche|toile|cadre/i.test(descLower);
  
  // Détection spécifique du format de livre
  let bookFormat = null;
  if (isBook) {
    if (/in[\s-]?folio|folio/i.test(descLower)) {
      bookFormat = 'folio';
    } else if (/in[\s-]?4|quarto/i.test(descLower)) {
      bookFormat = 'in-4';
    } else if (/in[\s-]?8|octavo/i.test(descLower)) {
      bookFormat = 'in-8';
    } else if (/in[\s-]?12/i.test(descLower)) {
      bookFormat = 'in-12';
    } else if (/in[\s-]?16/i.test(descLower)) {
      bookFormat = 'in-16';
    } else {
      bookFormat = 'in-8'; // Format par défaut (le plus courant)
    }
    console.log(`[Dimensions] 📚 Livre détecté, format: ${bookFormat}`);
  }
  
  // Exemples spécifiques selon le type d'objet
  let examplesSection = '';
  if (isBook && bookFormat) {
    // Exemples très précis selon le format détecté
    const formatExamples = {
      'in-8': `Livre in-8° (format le plus courant) : length=22-25 cm, width=15-18 cm, height=2-4 cm, weight=0.3-0.8 kg\n` +
               `⚠️ CRITIQUE: Un livre in-8° fait environ 23x17x3 cm et pèse 0.5 kg, JAMAIS 70x50x50 cm !`,
      'in-4': `Livre in-4° (format grand) : length=28-32 cm, width=20-24 cm, height=3-6 cm, weight=0.8-1.5 kg`,
      'in-12': `Livre in-12° (petit format) : length=15-18 cm, width=10-12 cm, height=1.5-3 cm, weight=0.2-0.5 kg`,
      'in-16': `Livre in-16° (très petit) : length=12-15 cm, width=8-10 cm, height=1-2 cm, weight=0.1-0.3 kg`,
      'folio': `Livre in-folio (très grand) : length=35-45 cm, width=25-30 cm, height=5-10 cm, weight=2-5 kg`,
    };
    examplesSection = `EXEMPLES SPÉCIFIQUES POUR LES LIVRES (format détecté: ${bookFormat}):\n` +
      formatExamples[bookFormat] + `\n\n` +
      `Si le format n'est pas clair, utilise les dimensions d'un livre in-8° (23x17x3 cm, 0.5 kg).\n\n`;
  } else if (isBook) {
    examplesSection = `EXEMPLES SPÉCIFIQUES POUR LES LIVRES:\n` +
      `- Livre in-8° (format le plus courant) : length=22-25 cm, width=15-18 cm, height=2-4 cm, weight=0.3-0.8 kg\n` +
      `- Livre in-4° (plus grand) : length=28-32 cm, width=20-24 cm, height=3-6 cm, weight=0.8-1.5 kg\n` +
      `- Livre in-12° (petit format) : length=15-18 cm, width=10-12 cm, height=1.5-3 cm, weight=0.2-0.5 kg\n` +
      `- Livre in-folio (très grand) : length=35-45 cm, width=25-30 cm, height=5-10 cm, weight=2-5 kg\n` +
      `⚠️ ATTENTION: Un livre in-8° standard fait environ 23x17x3 cm et pèse 0.5 kg, PAS 70x50x50 cm !\n` +
      `Si le format n'est pas précisé, assume un format in-8° (le plus courant).\n\n`;
  } else if (isSmallObject) {
    examplesSection = `EXEMPLES SPÉCIFIQUES POUR PETITS OBJETS:\n` +
      `- Bijou/montre : length=5-10 cm, width=5-10 cm, height=2-5 cm, weight=0.05-0.2 kg\n` +
      `- Médaille : length=5-8 cm, width=5-8 cm, height=0.5-1 cm, weight=0.05-0.1 kg\n\n`;
  } else if (isTableau) {
    examplesSection = `EXEMPLES SPÉCIFIQUES POUR TABLEAUX:\n` +
      `- Petit tableau : length=30-50 cm, width=25-40 cm, height=2-5 cm, weight=1-3 kg\n` +
      `- Tableau moyen : length=50-80 cm, width=40-60 cm, height=3-8 cm, weight=3-8 kg\n` +
      `- Grand tableau : length=80-150 cm, width=60-100 cm, height=5-15 cm, weight=8-20 kg\n\n`;
  } else {
    examplesSection = `EXEMPLES GÉNÉRAUX:\n` +
      `- Livre in-8° : 22x16x3 cm, 0.5 kg\n` +
      `- Petit tableau : 40x30x5 cm, 2 kg\n` +
      `- Vase : 25x25x35 cm, 1.5 kg\n` +
      `- Sculpture moyenne : 30x25x40 cm, 5 kg\n\n`;
  }
  
  const dimensionPrompt =
    `Tu es un expert en estimation logistique pour transport d'objets (art/antiquités).\n\n` +
    `Objet (description OCR) :\n"""${description}"""\n\n` +
    `Question : Quels sont les dimensions 3D les plus précises (L, l, h) en CENTIMÈTRES (cm) et le poids en KILOGRAMMES (kg) de cet objet pour le transport ?\n\n` +
    `${examplesSection}` +
    `RÈGLES CRITIQUES:\n` +
    `- Réponds UNIQUEMENT en JSON valide.\n` +
    `- Valeurs numériques UNIQUEMENT en CENTIMÈTRES (cm) pour les dimensions.\n` +
    `- Valeurs numériques UNIQUEMENT en KILOGRAMMES (kg) pour le poids.\n` +
    `- Les dimensions doivent être en CENTIMÈTRES, PAS en mètres, PAS en millimètres.\n` +
    `- Donne des estimations PRUDENTES et RÉALISTES basées sur les exemples ci-dessus.\n` +
    `- Si la description contient déjà des dimensions (cm/mm), convertis-les en cm si nécessaire.\n` +
    `- Si mm: divise par 10. Si mètres: multiplie par 100.\n` +
    `- Pour les livres, utilise les dimensions typiques selon le format (in-8°, in-4°, etc.).\n\n` +
    `FORMAT STRICT:\n` +
    `{\n  "length": <nombre en cm, max 500>,\n  "width": <nombre en cm, max 500>,\n  "height": <nombre en cm, max 500>,\n  "weight": <nombre en kg, max 50>\n}\n\n` +
    `IMPORTANT: retourne la dimension la plus grande dans "length" (longueur >= largeur >= hauteur).`;

  const normalizeAndSort = (dims) => {
    const toNum = (v) => {
      const n = Number.parseFloat(String(v).replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };
    const l = toNum(dims?.length);
    const w = toNum(dims?.width);
    const h = toNum(dims?.height);
    const weight = toNum(dims?.weight);

    console.log(`[Dimensions] 📊 Valeurs brutes reçues:`, { l, w, h, weight });

    // Validation: si les valeurs sont > 500 cm, elles sont probablement en mm ou mètres
    // Convertir automatiquement si nécessaire
    const convertIfNeeded = (val) => {
      if (!val || val <= 0) return null;
      // Si > 500 cm, probablement en mm (diviser par 10)
      if (val > 500 && val < 10000) {
        console.log(`[Dimensions] ⚠️  Valeur ${val} semble être en mm, conversion en cm: ${val / 10}`);
        return val / 10;
      }
      // Si > 10 mètres (1000 cm), probablement en mètres (multiplier par 100 serait absurde, donc c'est déjà en cm mais très grand)
      // On garde tel quel mais on log
      if (val > 1000) {
        console.warn(`[Dimensions] ⚠️  Valeur ${val} cm semble très grande, vérification nécessaire`);
      }
      return val;
    };

    const lConverted = convertIfNeeded(l);
    const wConverted = convertIfNeeded(w);
    const hConverted = convertIfNeeded(h);

    // Détection des valeurs aberrantes pour petits objets (livres, bijoux, etc.)
    // Utiliser descLower, isBook, isSmallObject et bookFormat de la portée externe
    
    // Validation spécifique pour les livres avec correction automatique
    if (isBook) {
      // Déterminer les dimensions typiques selon le format
      let typicalDims = { length: 23, width: 17, height: 3, weight: 0.5 }; // in-8° par défaut
      if (bookFormat === 'in-4') {
        typicalDims = { length: 30, width: 22, height: 4, weight: 1.0 };
      } else if (bookFormat === 'in-12') {
        typicalDims = { length: 16, width: 11, height: 2, weight: 0.3 };
      } else if (bookFormat === 'in-16') {
        typicalDims = { length: 13, width: 9, height: 1.5, weight: 0.2 };
      } else if (bookFormat === 'folio') {
        typicalDims = { length: 40, width: 28, height: 7, weight: 3.0 };
      }
      
      // Un livre ne devrait jamais dépasser 50 cm en longueur (même un in-folio peut aller jusqu'à 45 cm)
      // Si les valeurs sont > 50 cm, c'est probablement une erreur
      if (lConverted && lConverted > 50) {
        console.warn(`[Dimensions] ⚠️  Dimension anormale pour un livre (${lConverted} cm). Correction automatique vers format ${bookFormat || 'in-8'}.`);
        console.log(`[Dimensions] ✅ Utilisation dimensions typiques:`, typicalDims);
        return typicalDims;
      }
      
      // Si la longueur est > 35 cm mais pas un folio, c'est suspect
      if (lConverted && lConverted > 35 && bookFormat !== 'folio') {
        console.warn(`[Dimensions] ⚠️  Dimension suspecte pour un livre non-folio (${lConverted} cm). Correction.`);
        console.log(`[Dimensions] ✅ Utilisation dimensions typiques:`, typicalDims);
        return typicalDims;
      }
      
      // Si la hauteur est > 10 cm pour un livre non-folio, c'est suspect
      if (hConverted && hConverted > 10 && bookFormat !== 'folio' && lConverted && lConverted < 35) {
        console.warn(`[Dimensions] ⚠️  Hauteur anormale pour un livre (${hConverted} cm). Limitation à 5 cm.`);
        const correctedH = Math.min(hConverted, 5);
        const arr = [lConverted, wConverted, correctedH].filter((x) => typeof x === "number" && x > 0 && x <= 500);
        if (arr.length >= 2) {
          arr.sort((a, b) => b - a);
          return {
            length: Math.round(arr[0]),
            width: Math.round(arr[1] ?? Math.min(arr[0], 18)),
            height: Math.round(correctedH),
            weight: weight && weight > 0 && weight <= 5 ? Number(weight.toFixed(1)) : typicalDims.weight,
          };
        }
      }
      
      // Si toutes les dimensions sont cohérentes mais le poids est aberrant (> 5 kg pour un livre)
      if (weight && weight > 5 && lConverted && lConverted < 50) {
        console.warn(`[Dimensions] ⚠️  Poids anormal pour un livre (${weight} kg). Correction à ${typicalDims.weight} kg.`);
        const arr = [lConverted, wConverted, hConverted].filter((x) => typeof x === "number" && x > 0 && x <= 500);
        if (arr.length >= 2) {
          arr.sort((a, b) => b - a);
          return {
            length: Math.round(arr[0]),
            width: Math.round(arr[1] ?? Math.min(arr[0], 18)),
            height: Math.round(arr[2] ?? Math.min(arr[1] ?? arr[0], 5)),
            weight: typicalDims.weight,
          };
        }
      }
    }
    
    // Validation pour petits objets
    if (isSmallObject) {
      if (lConverted && lConverted > 15) {
        console.warn(`[Dimensions] ⚠️  Dimension anormale pour un petit objet: ${lConverted} cm. Correction automatique.`);
        const smallDims = { length: 8, width: 8, height: 3, weight: 0.1 };
        console.log(`[Dimensions] ✅ Utilisation dimensions typiques petit objet:`, smallDims);
        return smallDims;
      }
    }

    const arr = [lConverted, wConverted, hConverted].filter((x) => typeof x === "number" && x > 0 && x <= 500);
    if (arr.length === 0) {
      // Fallback intelligent selon le type d'objet
      if (isBook) {
        // Utiliser les dimensions typiques selon le format détecté
        let bookDims = { length: 23, width: 17, height: 3, weight: 0.5 }; // in-8° par défaut
        if (bookFormat === 'in-4') {
          bookDims = { length: 30, width: 22, height: 4, weight: 1.0 };
        } else if (bookFormat === 'in-12') {
          bookDims = { length: 16, width: 11, height: 2, weight: 0.3 };
        } else if (bookFormat === 'in-16') {
          bookDims = { length: 13, width: 9, height: 1.5, weight: 0.2 };
        } else if (bookFormat === 'folio') {
          bookDims = { length: 40, width: 28, height: 7, weight: 3.0 };
        }
        console.warn(`[Dimensions] ⚠️  Aucune dimension valide, utilisation dimensions typiques livre ${bookFormat || 'in-8'}`);
        return bookDims;
      } else if (isSmallObject) {
        console.warn(`[Dimensions] ⚠️  Aucune dimension valide, utilisation dimensions typiques petit objet`);
        return { length: 8, width: 8, height: 3, weight: 0.1 };
      }
      console.warn(`[Dimensions] ⚠️  Aucune dimension valide, utilisation des valeurs par défaut`);
      return { length: 50, width: 40, height: 30, weight: 5 };
    }
    arr.sort((a, b) => b - a);
    let length = Math.min(arr[0], 500); // Limiter à 500 cm max
    let width = Math.min(arr[1] ?? Math.min(length, 40), 500);
    let height = Math.min(arr[2] ?? Math.min(width, 30), 500);
    
    // Validation finale : détecter les valeurs aberrantes même après normalisation
    if (isBook) {
      // Déterminer les dimensions typiques selon le format
      let typicalDims = { length: 23, width: 17, height: 3, weight: 0.5 }; // in-8° par défaut
      if (bookFormat === 'in-4') {
        typicalDims = { length: 30, width: 22, height: 4, weight: 1.0 };
      } else if (bookFormat === 'in-12') {
        typicalDims = { length: 16, width: 11, height: 2, weight: 0.3 };
      } else if (bookFormat === 'in-16') {
        typicalDims = { length: 13, width: 9, height: 1.5, weight: 0.2 };
      } else if (bookFormat === 'folio') {
        typicalDims = { length: 40, width: 28, height: 7, weight: 3.0 };
      }
      
      // Si les dimensions sont > 2x les dimensions typiques, c'est suspect
      const tolerance = 2.0; // tolérance de 2x
      if (length > typicalDims.length * tolerance || 
          width > typicalDims.width * tolerance || 
          height > typicalDims.height * tolerance) {
        console.warn(`[Dimensions] ⚠️  Dimensions anormalement grandes pour un livre (${length}x${width}x${height} cm). Correction automatique.`);
        console.log(`[Dimensions] ✅ Remplacement par dimensions typiques ${bookFormat || 'in-8'}:`, typicalDims);
        return typicalDims;
      }
    }
    
    // Poids intelligent selon le type
    let finalWeight = 5; // défaut
    if (weight && weight > 0 && weight <= 50) {
      finalWeight = Number(weight.toFixed(1));
      // Validation du poids pour les livres
      if (isBook && finalWeight > 5) {
        console.warn(`[Dimensions] ⚠️  Poids anormal pour un livre (${finalWeight} kg). Correction.`);
        let typicalWeight = 0.5;
        if (bookFormat === 'in-4') typicalWeight = 1.0;
        else if (bookFormat === 'in-12') typicalWeight = 0.3;
        else if (bookFormat === 'in-16') typicalWeight = 0.2;
        else if (bookFormat === 'folio') typicalWeight = 3.0;
        finalWeight = typicalWeight;
      }
    } else {
      // Fallback intelligent selon le type
      if (isBook) {
        let typicalWeight = 0.5;
        if (bookFormat === 'in-4') typicalWeight = 1.0;
        else if (bookFormat === 'in-12') typicalWeight = 0.3;
        else if (bookFormat === 'in-16') typicalWeight = 0.2;
        else if (bookFormat === 'folio') typicalWeight = 3.0;
        finalWeight = typicalWeight;
      } else if (isSmallObject) {
        finalWeight = 0.1;
      } else {
        finalWeight = 5;
      }
    }

    const result = {
      length: Math.round(length),
      width: Math.round(width),
      height: Math.round(height),
      weight: finalWeight,
    };

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
          {
            role: 'system',
            content: 'Tu es un expert en estimation de dimensions d\'objets pour transport. Tu retournes UNIQUEMENT du JSON valide avec des dimensions en CENTIMÈTRES (cm) et poids en KILOGRAMMES (kg).',
          },
          {
            role: 'user',
            content: dimensionPrompt,
          },
        ],
        max_tokens: 200,
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
    
    console.log(`[Dimensions] 📥 Réponse brute de Groq:`, contentText?.substring(0, 200));
    
    if (!contentText) {
      console.warn('[Dimensions] ⚠️  Aucune réponse de Groq');
      return { length: 50, width: 40, height: 30, weight: 5 };
    }

    // Extraire le JSON
    const jsonMatch = contentText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log(`[Dimensions] 📋 JSON parsé:`, parsed);
        return normalizeAndSort(parsed);
      } catch (parseError) {
        console.error('[Dimensions] ❌ Erreur parsing JSON:', parseError.message);
        console.error('[Dimensions] Contenu:', jsonMatch[0]);
      }
    } else {
      console.warn('[Dimensions] ⚠️  Aucun JSON trouvé dans la réponse');
    }
  } catch (error) {
    console.error('[Dimensions] ❌ Erreur estimation:', error.message);
  }

  // Valeurs par défaut en cas d'erreur (avec détection du type d'objet)
  // Utiliser descLower, isBook, isSmallObject et bookFormat déjà déclarés au début de la fonction
  if (isBook) {
    // Détecter le format pour utiliser les bonnes dimensions
    let bookFormat = 'in-8'; // défaut
    if (/in[\s-]?folio|folio/i.test(descLower)) {
      bookFormat = 'folio';
    } else if (/in[\s-]?4|quarto/i.test(descLower)) {
      bookFormat = 'in-4';
    } else if (/in[\s-]?12/i.test(descLower)) {
      bookFormat = 'in-12';
    } else if (/in[\s-]?16/i.test(descLower)) {
      bookFormat = 'in-16';
    }
    
    let bookDims = { length: 23, width: 17, height: 3, weight: 0.5 }; // in-8° par défaut
    if (bookFormat === 'in-4') {
      bookDims = { length: 30, width: 22, height: 4, weight: 1.0 };
    } else if (bookFormat === 'in-12') {
      bookDims = { length: 16, width: 11, height: 2, weight: 0.3 };
    } else if (bookFormat === 'in-16') {
      bookDims = { length: 13, width: 9, height: 1.5, weight: 0.2 };
    } else if (bookFormat === 'folio') {
      bookDims = { length: 40, width: 28, height: 7, weight: 3.0 };
    }
    console.warn(`[Dimensions] ⚠️  Utilisation dimensions typiques livre ${bookFormat} (fallback)`);
    return bookDims;
  } else if (isSmallObject) {
    console.warn('[Dimensions] ⚠️  Utilisation dimensions typiques petit objet (fallback)');
    return { length: 8, width: 8, height: 3, weight: 0.1 };
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
        const dimensions = await estimateDimensionsForObject(lot.description, apiKey);
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
          const dims = await estimateDimensionsForObject(target.description, groqKey);
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
// Email SMTP - Supporte Gmail (gratuit) et Uno Send
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envoie un email via Resend API
 * @param {Object} params
 * @param {string} params.to - Email destinataire
 * @param {string} params.subject - Sujet
 * @param {string} params.text - Contenu texte brut (fallback)
 * @param {string} params.html - Contenu HTML
 * @param {string} [params.saasAccountId] - ID du compte SaaS (optionnel, pour récupérer le nom commercial)
 * @returns {Promise<Object>} Réponse avec messageId
 */
async function sendEmail({ to, subject, text, html, saasAccountId }) {
  console.log('[Resend] ===== DÉBUT sendEmail =====');
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
      messageId: data.id 
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
          messageId: directResult.id
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
    const { quote } = req.body;
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
    
    // Calcul de l'assurance si nécessaire (2.5% de la valeur, min 12€ si valeur < 500€)
    const calculateInsurancePrice = (value) => {
      // 2.5% de la valeur, avec un minimum de 12€ si valeur < 500€
      // Arrondi au supérieur : 13,50 = 14, 13,49 = 13,5
      let calculated = value < 500 ? Math.max(value * 0.025, 12) : value * 0.025;
      
      // Arrondi au supérieur : si >= 0,50, arrondir à l'entier supérieur, sinon arrondir à 0,5 supérieur
      const decimal = calculated % 1;
      if (decimal >= 0.50) {
        calculated = Math.ceil(calculated);
      } else if (decimal > 0) {
        calculated = Math.floor(calculated) + 0.5;
      }
      
      return calculated;
    };
    const finalInsuranceAmount = insuranceEnabled 
      ? (insuranceAmount > 0 ? insuranceAmount : calculateInsurancePrice(lotValue))
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
    
    // Filtrer et trier les liens de paiement (accepter active, pending, ou sans status)
    const activePaymentLink = paymentLinksToUse
      .filter(link => {
        if (!link) return false;
        const status = link.status;
        // Accepter active, pending, ou sans status (undefined/null)
        return status === 'active' || status === 'pending' || !status;
      })
      .sort((a, b) => {
        const dateA = getCreatedAtDate(a);
        const dateB = getCreatedAtDate(b);
        return dateB - dateA; // Plus récent en premier
      })[0];
    
    const paymentUrl = activePaymentLink?.url || null;
    
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
  - Coût assurance (2.5%${lotValue < 500 ? ', min. 12€' : ''}) : ${finalInsuranceAmount.toFixed(2)}€` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 MONTANT TOTAL : ${finalTotal.toFixed(2)}€
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${paymentUrl ? `🔗 LIEN DE PAIEMENT :
${paymentUrl}

Cliquez sur le lien ci-dessus pour procéder au paiement.` : ''}

Pour toute question, n'hésitez pas à nous contacter.

Cordialement,
L'équipe MBE
    `.trim();

    // HTML (optionnel, plus joli)
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
    .section { margin-bottom: 20px; }
    .label { font-weight: bold; color: #6b7280; font-size: 12px; text-transform: uppercase; margin-bottom: 5px; }
    .value { font-size: 16px; color: #111827; margin-bottom: 15px; }
    .total { background: #fef3c7; padding: 15px; border-radius: 8px; font-size: 20px; font-weight: bold; color: #92400e; text-align: center; margin-top: 20px; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin:0;">📦 Votre Devis de Transport</h1>
  </div>
  <div class="content">
    <p>Bonjour <strong>${clientName}</strong>,</p>
    <p>Voici votre devis de transport :</p>
    
    <div class="section">
      <div class="label">Référence</div>
      <div class="value">${reference}</div>
    </div>

    <div class="section">
      <div class="label">📦 Lot ${lotNumber}</div>
      <div class="value">${lotDescription}</div>
    </div>

    <div class="section">
      <div class="label">🏛️ Salle des ventes</div>
      <div class="value">${auctionHouse}</div>
    </div>

    <div class="section">
      <div class="label">📍 Adresse de livraison</div>
      <div class="value">${deliveryAddress}</div>
    </div>

    <div class="section" style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
      <div class="label" style="font-size: 14px; margin-bottom: 15px;">DÉTAIL DES COÛTS</div>
      <div style="background: white; padding: 15px; border-radius: 6px; border: 1px solid #e5e7eb;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #f3f4f6;">
          <span style="color: #6b7280;">Emballage${(() => {
            const carton = quote.auctionSheet?.recommendedCarton;
            if (!carton) return '';
            const displayName = carton.label ? cleanCartonRef(carton.label) : (carton.ref ? cleanCartonRef(carton.ref) : '');
            return displayName ? ` <span style="font-size: 11px;">(carton ${displayName})</span>` : '';
          })()}</span>
          <span style="font-weight: 600;">${packagingPrice.toFixed(2)}€</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #f3f4f6;">
          <span style="color: #6b7280;">Expédition (Express)${quote.delivery?.address?.country ? ` <span style="font-size: 11px;">(${quote.delivery.address.country})</span>` : ''}</span>
          <span style="font-weight: 600;">${shippingPrice.toFixed(2)}€</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: ${insuranceEnabled ? '5px' : '0'};">
          <span style="color: #6b7280;">Assurance</span>
          <span style="font-weight: 600;">${insuranceEnabled ? '<span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">Oui</span>' : '<span style="color: #9ca3af;">Non</span>'}</span>
        </div>
        ${insuranceEnabled ? `
        <div style="padding-left: 15px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #f3f4f6;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 13px;">
            <span style="color: #9ca3af;">Valeur assurée</span>
            <span style="font-weight: 500;">${lotValue.toFixed(2)}€</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 13px;">
            <span style="color: #9ca3af;">Coût assurance (2.5%${lotValue < 500 ? ', min. 12€' : ''})</span>
            <span style="font-weight: 500;">${finalInsuranceAmount.toFixed(2)}€</span>
          </div>
        </div>
        ` : ''}
      </div>
    </div>

    <div class="total" style="margin-top: 25px;">
      💰 Montant total : ${finalTotal.toFixed(2)}€
    </div>

    ${paymentUrl ? `
    <div style="text-align: center; margin-top: 30px; margin-bottom: 20px; padding: 20px; background: #f0f9ff; border-radius: 8px; border: 2px solid #2563eb;">
      <p style="margin: 0 0 15px 0; font-size: 14px; color: #1e40af; font-weight: 600;">💳 Procéder au paiement</p>
      <a href="${paymentUrl}" 
         style="display: inline-block; background: #2563eb; color: white !important; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 18px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4); transition: background 0.2s; letter-spacing: 0.5px;">
        Payer ${finalTotal.toFixed(2)}€ maintenant
      </a>
      <p style="margin-top: 15px; font-size: 12px; color: #6b7280;">
        Ou copiez ce lien dans votre navigateur :<br>
        <a href="${paymentUrl}" style="color: #2563eb; word-break: break-all; text-decoration: underline;">${paymentUrl}</a>
      </p>
    </div>
    ` : `
    <div style="text-align: center; margin-top: 30px; margin-bottom: 20px; padding: 15px; background: #fef3c7; border-radius: 8px; border: 1px solid #f59e0b;">
      <p style="margin: 0; font-size: 14px; color: #92400e;">
        ⚠️ Le lien de paiement sera disponible prochainement. Vous recevrez un email avec le lien de paiement.
      </p>
    </div>
    `}

    <p style="margin-top: 30px; color: #6b7280;">Pour toute question, n'hésitez pas à nous contacter.</p>
  </div>
  <div class="footer">
    Cordialement,<br>
    <strong>L'équipe MBE</strong>
  </div>
</body>
</html>
    `.trim();

    // Envoi via Resend
    console.log('[AI Proxy] Envoi email via Resend à:', clientEmail);
    // Récupérer saasAccountId depuis le quote ou req.saasAccountId
    const saasAccountId = quote.saasAccountId || req.saasAccountId;
    const result = await sendEmail({
      to: clientEmail,
      subject: `Votre devis de transport - ${reference}`,
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
          source: 'RESEND',
          from: EMAIL_FROM || 'devis@mbe-sdv.fr',
          to: [clientEmail],
          subject: `Votre devis de transport - ${reference}`,
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
    
    // Améliorer la description du surcoût pour la rendre plus soutenue et compréhensible
    let enhancedDescription = surchargePaiement.description || 'Surcoût supplémentaire';
    
    // Si la description est courte ou générique, l'améliorer
    if (enhancedDescription.length < 20 || 
        enhancedDescription.toLowerCase().includes('surcoût') || 
        enhancedDescription.toLowerCase().includes('supplément')) {
      // Créer une description plus professionnelle
      enhancedDescription = `Surcoût supplémentaire pour le devis ${reference}`;
      
      // Si on a une description originale, essayer de l'enrichir
      if (surchargePaiement.description && surchargePaiement.description.length > 0) {
        const originalDesc = surchargePaiement.description.trim();
        // Si la description originale contient des détails, les préserver
        if (originalDesc.length > 10 && !originalDesc.toLowerCase().match(/^(surcoût|supplément|frais)/i)) {
          enhancedDescription = `${originalDesc.charAt(0).toUpperCase() + originalDesc.slice(1)} - Surcoût pour le devis ${reference}`;
        } else {
          enhancedDescription = `Surcoût supplémentaire : ${originalDesc}`;
        }
      }
    } else {
      // Description déjà détaillée, capitaliser la première lettre
      enhancedDescription = enhancedDescription.charAt(0).toUpperCase() + enhancedDescription.slice(1);
    }

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

    // HTML (basé sur la structure du mail principal)
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
    .section { margin-bottom: 20px; }
    .label { font-weight: bold; color: #6b7280; font-size: 12px; text-transform: uppercase; margin-bottom: 5px; }
    .value { font-size: 16px; color: #111827; margin-bottom: 15px; }
    .surcharge-box { background: #fef3c7; padding: 20px; border-radius: 8px; border: 2px solid #f59e0b; margin: 20px 0; }
    .total { background: #fef3c7; padding: 15px; border-radius: 8px; font-size: 20px; font-weight: bold; color: #92400e; text-align: center; margin-top: 20px; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin:0;">💳 Surcoût Supplémentaire</h1>
  </div>
  <div class="content">
    <p>Bonjour <strong>${clientName}</strong>,</p>
    <p>Nous vous contactons concernant votre devis de transport <strong>${reference}</strong>.</p>
    
    <div class="surcharge-box">
      <div class="label" style="color: #92400e; font-size: 14px; margin-bottom: 10px;">SURCOÛT SUPPLÉMENTAIRE</div>
      <div class="value" style="color: #111827; font-size: 15px; line-height: 1.8;">
        ${enhancedDescription}
      </div>
    </div>

    <div class="total" style="margin-top: 25px;">
      💰 Montant du surcoût : ${surchargeAmount.toFixed(2)}€
    </div>

    <div style="text-align: center; margin-top: 30px; margin-bottom: 20px; padding: 20px; background: #f0f9ff; border-radius: 8px; border: 2px solid #2563eb;">
      <p style="margin: 0 0 15px 0; font-size: 14px; color: #1e40af; font-weight: 600;">💳 Procéder au paiement du surcoût</p>
      <a href="${surchargeUrl}" 
         style="display: inline-block; background: #2563eb; color: white !important; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 18px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4); transition: background 0.2s; letter-spacing: 0.5px;">
        Payer ${surchargeAmount.toFixed(2)}€ maintenant
      </a>
      <p style="margin-top: 15px; font-size: 12px; color: #6b7280;">
        Ou copiez ce lien dans votre navigateur :<br>
        <a href="${surchargeUrl}" style="color: #2563eb; word-break: break-all; text-decoration: underline;">${surchargeUrl}</a>
      </p>
    </div>

    <p style="margin-top: 30px; color: #6b7280;">Pour toute question concernant ce surcoût, n'hésitez pas à nous contacter.</p>
  </div>
  <div class="footer">
    Cordialement,<br>
    <strong>L'équipe MBE</strong>
  </div>
</body>
</html>
    `.trim();

    // Envoi via Resend
    console.log('[AI Proxy] Envoi email surcoût via Resend à:', clientEmail);
    // Récupérer saasAccountId depuis le quote ou req.saasAccountId
    const saasAccountId = quote.saasAccountId || req.saasAccountId;
    const result = await sendEmail({
      to: clientEmail,
      subject: `Surcoût supplémentaire - Devis ${reference}`,
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
          source: 'RESEND',
          from: EMAIL_FROM || 'devis@mbe-sdv.fr',
          to: [clientEmail],
          subject: `Surcoût supplémentaire - Devis ${reference}`,
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
app.post('/api/send-collection-email', async (req, res) => {
  console.log('[AI Proxy] 📥 POST /api/send-collection-email appelé');
  try {
    const { to, subject, text, auctionHouse, quotes, plannedDate, plannedTime, note } = req.body;

    if (!to || !subject) {
      return res.status(400).json({ 
        success: false, 
        error: 'to et subject sont requis' 
      });
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

    // Générer un tableau HTML pour les lots
    let lotsTableHtml = '';
    if (quotes && quotes.length > 0) {
      const lotsRows = quotes.map((quote, index) => {
        const lotNumber = quote.lotNumber || quote.lotId || 'Non spécifié';
        
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
            <h1 style="color: white; margin: 0; font-size: 24px;">Demande de collecte</h1>
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
 * Route de test: Envoyer un email de test
 * POST /api/test-email
 * Body: { to: "email@example.com" } (optionnel, utilise EMAIL_FROM par défaut)
 */
app.post('/api/test-email', async (req, res) => {
  console.log('[Test Email] Route appelée');
  try {
    const { to } = req.body || {};
    const testEmail = to || EMAIL_FROM;
    
    if (!testEmail || !isValidEmail(testEmail)) {
      return res.status(400).json({ 
        error: 'Email de test invalide',
        hint: `Fournissez un email valide: { "to": "email@example.com" }`
      });
    }

    if (!resendClient) {
      return res.status(400).json({ 
        error: 'Resend non configuré',
        hint: 'Vérifiez RESEND_API_KEY dans .env.local'
      });
    }

    if (!EMAIL_FROM) {
      return res.status(400).json({ 
        error: 'EMAIL_FROM non configuré',
        hint: 'Configure EMAIL_FROM dans .env.local'
      });
    }

    console.log(`[Test Email] Envoi email de test à ${testEmail}...`);
    
    // Pour les emails de test, utiliser req.saasAccountId si disponible
    const saasAccountId = req.saasAccountId;
    const result = await sendEmail({
      to: testEmail,
      subject: '🧪 Email de test - MBE Devis',
      text: `Bonjour,

Ceci est un email de test depuis l'application MBE Devis.

Si vous recevez cet email, cela signifie que la configuration Resend fonctionne correctement !

Configuration:
- Provider: Resend
- From: ${EMAIL_FROM}
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
    return res.status(400).json({ error: 'Gmail OAuth non configuré. Vérifiez GMAIL_CLIENT_ID et GMAIL_CLIENT_SECRET dans .env.local' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré. Veuillez compléter la configuration MBE.' });
  }

  // Passer le saasAccountId dans le state pour le récupérer au callback
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
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
    console.error('[Gmail Sync] Erreur lors de la synchronisation globale:', error);
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
    return res.status(400).json({ error: 'Google Sheets OAuth non configuré. Vérifiez GOOGLE_SHEETS_CLIENT_ID et GOOGLE_SHEETS_CLIENT_SECRET dans .env.local' });
  }

  if (!req.saasAccountId) {
    return res.status(400).json({ error: 'Compte SaaS non configuré. Veuillez compléter la configuration MBE.' });
  }

  // Scopes nécessaires pour lire les Google Sheets ET Google Drive (bordereaux)
  const scopes = [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.readonly', // CRITIQUE: Nécessaire pour accéder aux bordereaux dans Drive
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

    // Mettre à jour avec le sheet sélectionné
    await saasAccountRef.update({
      'integrations.googleSheets': {
        connected: true,
        spreadsheetId: spreadsheetId,
        spreadsheetName: spreadsheetName,
        accessToken: oauthTokens.accessToken,
        refreshToken: oauthTokens.refreshToken,
        expiresAt: oauthTokens.expiresAt,
        lastRowImported: 1, // Commencer à la ligne 2 (ligne 1 = headers)
        lastSyncAt: null,
        connectedAt: googleSheetsIntegration.connectedAt || Timestamp.now(),
        selectedAt: Timestamp.now()
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

    // Mettre à jour le devis avec le nouveau carton
    const cartonInfo = {
      id: cartonId,
      ref: carton.carton_ref,
      inner_length: carton.inner_length,
      inner_width: carton.inner_width,
      inner_height: carton.inner_height,
      price: carton.packaging_price
    };

    const updateData = {
      cartonId: cartonId,
      'options.packagingPrice': carton.packaging_price,
      'auctionSheet.recommendedCarton': cartonInfo,
      updatedAt: Timestamp.now(),
      timeline: FieldValue.arrayUnion({
        id: `timeline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        date: Timestamp.now(),
        status: devis.status || 'calculated',
        description: `Carton modifié: ${carton.carton_ref} (${carton.packaging_price}€)`
      })
    };

    // Recalculer le total
    const collectePrice = 0;
    const packagingPrice = carton.packaging_price;
    const shippingPrice = devis.options?.shippingPrice || 0;
    const insuranceAmount = devis.options?.insuranceAmount || 0;
    const totalAmount = collectePrice + packagingPrice + shippingPrice + insuranceAmount;
    updateData.totalAmount = totalAmount;

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

// Route: Traiter un bordereau depuis son lien (Typeform, Drive, ou URL directe)
app.post('/api/devis/:id/process-bordereau-from-link', requireAuth, async (req, res) => {
  if (!firestore) return res.status(500).json({ error: 'Firestore non configuré' });
  if (!req.saasAccountId) return res.status(400).json({ error: 'Compte SaaS non configuré' });
  const devisId = req.params.id;
  const forceRetry = !!(req.body && req.body.forceRetry === true);
  try {
    const devisDoc = await firestore.collection('quotes').doc(devisId).get();
    if (!devisDoc.exists) return res.status(404).json({ error: 'Devis non trouvé' });
    const devis = devisDoc.data();
    if (devis.saasAccountId !== req.saasAccountId) return res.status(403).json({ error: 'Accès refusé' });
    const bordereauLink = devis.bordereauLink;
    if (!bordereauLink || typeof bordereauLink !== 'string') return res.status(400).json({ error: 'Ce devis n\'a pas de lien bordereau (bordereauLink)' });
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
    const { buffer, mimeType } = await downloadFileFromUrl(bordereauLink, req.saasAccountId);
    const fileName = devis.bordereauFileName || bordereauLink.split('/').pop() || 'bordereau.pdf';
    let bordereauId;
    if (forceRetry && devis.bordereauId) {
      const bordereauDoc = await firestore.collection('bordereaux').doc(devis.bordereauId).get();
      if (bordereauDoc.exists) {
        bordereauId = devis.bordereauId;
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
          description: 'Bordereau traité depuis le lien (Typeform/URL)'
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
    triggerOCRForBordereau(bordereauId, req.saasAccountId, { preDownloadedBuffer: buffer, mimeType: mimeType || 'application/pdf' }).catch(err => console.error('[API] Erreur OCR après fetch URL:', err));
    res.json({ success: true, message: forceRetry ? 'Relance de l\'analyse OCR en cours' : 'Bordereau téléchargé et analyse OCR lancée', bordereauId });
  } catch (error) {
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
  if (fetchUrl.includes('api.typeform.com')) {
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

    // CRITIQUE: Utiliser spreadsheets.get() avec includeGridData pour obtenir les hyperliens
    // Les bordereaux Typeform sont des liens cliquables dans les cellules
    const response = await sheets.spreadsheets.get({
      spreadsheetId: googleSheetsIntegration.spreadsheetId,
      includeGridData: true,
      ranges: ['A2:Z'] // Lire à partir de la ligne 2
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

    // Traiter uniquement les nouvelles lignes
    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i];
      
      // Ignorer les lignes vides
      if (!row || row.length === 0 || !row[0]) {
        console.log(`[Google Sheets Sync] Ligne ${i + 2} ignorée (ligne vide)`);
        continue;
      }

      // Mapping des colonnes selon la structure Typeform
      // 0: Prénom, 1: Nom de famille, 2: Numéro de téléphone, 3: E-mail
      // 4: Adresse, 5: Complément d'adresse, 6: Ville, 7: État/Région/Province
      // 8: Code postal, 9: Pays
      // 10: Êtes-vous le destinataire ? (Oui/Non)
      // 11-20: Informations destinataire (si différent)
      // 21: Adresse point relais UPS
      // 22: 📎 Ajouter votre bordereau
      // 23: Informations utiles
      // 24: Souhaitez vous assurer votre/vos bordereau(x) ?
      // 25: Submitted At
      // 26: Token
      
      // Helper pour extraire la valeur d'une cellule (texte ou objet avec hyperlink)
      const getCellValue = (cell) => {
        if (!cell) return '';
        if (typeof cell === 'object' && cell.text !== undefined) {
          return cell.text?.trim() || '';
        }
        return cell.toString().trim();
      };
      
      // Informations client (expéditeur)
      const clientFirstName = getCellValue(row[0]);
      const clientLastName = getCellValue(row[1]);
      const clientPhone = getCellValue(row[2]);
      const clientEmail = getCellValue(row[3]);
      const clientAddress = getCellValue(row[4]);
      const clientAddressComplement = getCellValue(row[5]);
      const clientCity = getCellValue(row[6]);
      const clientState = getCellValue(row[7]);
      const clientZip = getCellValue(row[8]);
      const clientCountry = getCellValue(row[9]);
      
      // Vérifier si le client est le destinataire
      // La colonne 10 peut contenir :
      // - "Oui" / "Yes" → Le client est le destinataire
      // - "Non" / "No" → Le client n'est pas le destinataire, il y a un destinataire spécifique (colonnes 11-20)
      // - "Livrer à un point relais UPS" / "Deliver to UPS Access Point" → Point relais UPS (colonne 21)
      const receiverAnswer = getCellValue(row[10]);
      const isClientReceiver = receiverAnswer.toLowerCase() === 'oui' || receiverAnswer.toLowerCase() === 'yes';
      const isUpsAccessPoint = receiverAnswer.toLowerCase().includes('point relais') || 
                                receiverAnswer.toLowerCase().includes('access point') ||
                                receiverAnswer.toLowerCase().includes('ups');
      
      // Adresse point relais UPS (colonne 21, utilisée uniquement si point relais choisi)
      const upsAccessPoint = getCellValue(row[21]);
      
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
        // Le client est le destinataire, utiliser ses informations
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
        // Le client a choisi un point relais UPS
        // Les informations du point relais sont dans la colonne 21
        // On utilise les informations du client pour le contact, mais l'adresse sera le point relais
        receiverFirstName = clientFirstName;
        receiverLastName = clientLastName;
        receiverPhone = clientPhone;
        receiverEmail = clientEmail;
        // L'adresse complète du point relais est dans upsAccessPoint (colonne 21)
        receiverAddress = upsAccessPoint;
        receiverAddressComplement = '';
        receiverCity = '';
        receiverState = '';
        receiverZip = '';
        receiverCountry = '';
      } else {
        // Le destinataire est différent du client (informations dans colonnes 11-20)
        receiverAddress = getCellValue(row[11]);
        receiverAddressComplement = getCellValue(row[12]);
        receiverCity = getCellValue(row[13]);
        receiverState = getCellValue(row[14]);
        receiverZip = getCellValue(row[15]);
        receiverCountry = getCellValue(row[16]);
        receiverFirstName = getCellValue(row[17]);
        receiverLastName = getCellValue(row[18]);
        receiverPhone = getCellValue(row[19]);
        receiverEmail = getCellValue(row[20]);
      }
      
      // Bordereau - CRITIQUE: Extraire le lien Google Drive si présent
      // La colonne 22 peut contenir soit du texte, soit un objet { text, hyperlink }
      // CORRECTION: Les colonnes dans le Google Sheet Typeform
      // Colonne Z (index 25) : 📎 Ajouter votre bordereau
      // Colonne AA (index 26) : Submitted At
      // Colonne AB (index 27) : Token
      // Note: Les index commencent à 0, donc colonne Z = index 25
      
      const bordereauCell = row[25]; // ✅ Colonne Z (index 25) = Bordereau
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
      
      // Informations utiles (colonne X = index 23)
      const usefulInfo = getCellValue(row[23]);
      
      // Assurance (colonne Y = index 24)
      const insuranceAnswer = getCellValue(row[24]);
      const wantsInsurance = insuranceAnswer.toLowerCase() === 'oui' || insuranceAnswer.toLowerCase() === 'yes';
      
      // Date de soumission (colonne AA = index 26)
      const submittedAt = getCellValue(row[26]);
      console.log(`[Google Sheets Sync] 📅 Submitted At (col AA, index 26): ${submittedAt}`);
      
      // Token Typeform (colonne AB = index 27) - utilisé comme externalId pour détecter les doublons
      const token = getCellValue(row[27]);
      console.log(`[Google Sheets Sync] 🔑 Token Typeform (col AB, index 27): ${token}`);
      
      // Si pas de token, utiliser Submitted At (colonne 25) comme fallback
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
        reference: `GS-${Date.now()}-${sheetRowIndex}`
      };
      
      const devisRef = await firestore.collection('quotes').add(quoteData);
      const devisId = devisRef.id;

      newDevisCount++;
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
    console.error('[Google Sheets Sync] Erreur lors de la synchronisation globale:', error);
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
  try {
    const bordereauDoc = await firestore.collection('bordereaux').doc(bordereauId).get();
    if (!bordereauDoc.exists) { console.error('[OCR] Bordereau introuvable:', bordereauId); return; }
    const bordereau = bordereauDoc.data();
    await firestore.collection('bordereaux').doc(bordereauId).update({ ocrStatus: 'processing', updatedAt: Timestamp.now() });
    let fileBuffer, mimeType = opts.mimeType || bordereau.mimeType || 'application/pdf';
    if (opts.preDownloadedBuffer && Buffer.isBuffer(opts.preDownloadedBuffer)) {
      fileBuffer = opts.preDownloadedBuffer;
      console.log('[OCR] Utilisation du buffer pré-téléchargé (évite second fetch)');
    } else if (bordereau.sourceUrl) {
      const d = await downloadFileFromUrl(bordereau.sourceUrl, saasAccountId);
      fileBuffer = d.buffer; mimeType = d.mimeType;
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
      fileBuffer = await downloadFileFromDrive(drive, bordereau.driveFileId);
    } else throw new Error('Bordereau sans source (ni sourceUrl ni driveFileId)');
    const { result: ocrResult, ocrRawText } = await extractBordereauFromFile(fileBuffer, mimeType);

    console.log(`[OCR] Résultat extraction Tesseract: ${ocrResult.lots?.length || 0} lots, salle: ${ocrResult.salle_vente}, total: ${ocrResult.total}`);

    // Fallback Groq si l'extraction Tesseract n'a pas trouvé de lots
    if ((!ocrResult.lots || ocrResult.lots.length === 0) && ocrRawText && process.env.GROQ_API_KEY) {
      console.log('[OCR] 🤖 Tesseract n\'a pas extrait de lots, tentative avec Groq...');
      const groqResult = await extractLotsWithGroq(ocrRawText);
      if (groqResult.lots && groqResult.lots.length > 0) {
        ocrResult.lots = groqResult.lots;
        if (!ocrResult.salle_vente && groqResult.salle_vente) ocrResult.salle_vente = groqResult.salle_vente;
        if (!ocrResult.date && groqResult.date) ocrResult.date = groqResult.date;
        if (!ocrResult.numero_bordereau && groqResult.numero_bordereau) ocrResult.numero_bordereau = groqResult.numero_bordereau;
        if (!ocrResult.total && groqResult.total) ocrResult.total = groqResult.total;
        console.log(`[OCR] ✅ Groq a complété l'extraction: ${ocrResult.lots.length} lots`);
      } else {
        console.warn('[OCR] ⚠️ Groq n\'a pas non plus extrait de lots - le PDF est peut-être illisible ou format non standard');
      }
    }

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

    console.log(`[OCR] ✅ OCR terminé pour bordereau ${bordereauId}: ${ocrResult.lots?.length || 0} lots extraits`);

    // 8. Déclencher le calcul du devis
    await calculateDevisFromOCR(bordereau.devisId, ocrResult, saasAccountId);

  } catch (error) {
    console.error('[OCR] Erreur:', error);
    // Marquer l'OCR comme échoué
    await firestore.collection('bordereaux').doc(bordereauId).update({
      ocrStatus: 'failed',
      ocrError: error.message,
      updatedAt: Timestamp.now()
    });
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
    // Enrichir la description avec le contexte
    let enrichedDescription = description;
    
    if (context.auctionHouse || context.price || context.date) {
      console.log(`[Groq] 📊 Contexte enrichi:`, context);
      
      const contextParts = [];
      if (context.auctionHouse) contextParts.push(`Salle: ${context.auctionHouse}`);
      if (context.price) contextParts.push(`Prix adjudication: ${context.price}€`);
      if (context.date) contextParts.push(`Date: ${context.date}`);
      
      enrichedDescription = `${description}\n\nCONTEXTE: ${contextParts.join(', ')}`;
      
      console.log(`[Groq] 🤖 Estimation avec contexte pour: "${description.substring(0, 80)}..."`);
    } else {
      console.log(`[Groq] 🤖 Estimation des dimensions pour: "${description.substring(0, 80)}..."`);
    }
    
    const dimensions = await estimateDimensionsForObject(enrichedDescription, groqApiKey);
    
    console.log('[Groq] ✅ Dimensions estimées:', dimensions);
    return dimensions;
  } catch (error) {
    console.error('[Groq] ❌ Erreur lors de l\'estimation:', error);
    return null;
  }
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
          inner_length: optimalCarton.inner_length,
          inner_width: optimalCarton.inner_width,
          inner_height: optimalCarton.inner_height,
          price: optimalCarton.packaging_price
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
        cartonInfo = {
          id: cartonsInfo[0].id,
          ref: cartonsInfo[0].carton_ref,
          inner_length: cartonsInfo[0].inner_length,
          inner_width: cartonsInfo[0].inner_width,
          inner_height: cartonsInfo[0].inner_height,
          price: cartonsInfo[0].packaging_price
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
    // Support: destination.country (legacy) ou delivery.address.country (quote Google Sheets)
    const destCountry = devis.destination?.country || devis.delivery?.address?.country;
    if (destCountry) {
      try {
        const countryCode = (typeof destCountry === 'string' ? destCountry : String(destCountry)).toUpperCase();
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
      } catch (error) {
        console.error('[Calcul] ❌ Erreur lors du calcul du prix d\'expédition:', error.message);
        console.error('[Calcul] Stack:', error.stack);
      }
    } else {
      console.warn('[Calcul] ⚠️  Pas de destination renseignée, prix d\'expédition = 0€');
    }

    // 6. Assurance (2% de la valeur si demandée)
    let insuranceAmount = 0;
    if (devis.options?.insurance && ocrResult.total) {
      insuranceAmount = Math.round(ocrResult.total * 0.02 * 100) / 100;
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
    // Vérifier si toutes les conditions sont remplies pour générer automatiquement un lien de paiement
    const shouldAutoGeneratePayment = 
      packagingPrice > 0 && // Emballage renseigné
      shippingPrice > 0 && // Expédition renseignée
      totalAmount > 0; // Total > 0
    
    if (shouldAutoGeneratePayment) {
      try {
        console.log(`[Calcul] 🔗 Conditions remplies pour auto-génération du lien de paiement`);
        
        // Vérifier si un paiement PRINCIPAL existe déjà pour ce devis
        const existingPaiementsSnapshot = await firestore
          .collection('paiements')
          .where('devisId', '==', devisId)
          .where('type', '==', 'PRINCIPAL')
          .where('status', '!=', 'CANCELLED')
          .limit(1)
          .get();
        
        if (!existingPaiementsSnapshot.empty) {
          console.log(`[Calcul] ⚠️  Un paiement PRINCIPAL existe déjà pour ce devis, pas de génération automatique`);
        } else {
          // Récupérer le compte SaaS pour obtenir le stripeAccountId
          const saasAccountDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
          
          if (!saasAccountDoc.exists) {
            console.error(`[Calcul] ❌ Compte SaaS ${saasAccountId} non trouvé`);
          } else {
            const saasAccount = saasAccountDoc.data();
            const stripeAccountId = saasAccount.integrations?.stripe?.stripeAccountId;
            
            if (!stripeAccountId) {
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
      console.log(`[Calcul] ⚠️  Conditions non remplies pour auto-génération du lien de paiement (emballage: ${packagingPrice}€, expédition: ${shippingPrice}€, total: ${totalAmount}€)`);
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
    const decodedToken = await auth.verifyIdToken(token);
    
    req.uid = decodedToken.uid;
    req.user = decodedToken;
    
    // Vérifier le cache d'abord
    const cached = saasAccountCache.get(decodedToken.uid);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      // Utiliser le cache
      req.saasAccountId = cached.saasAccountId;
      // console.log(`[requireAuth] 🚀 Cache hit pour uid: ${decodedToken.uid}`);
      return next();
    }
    
    // Cache expiré ou inexistant, lire Firestore
    try {
      const userDoc = await firestore.collection('users').doc(decodedToken.uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        req.saasAccountId = userData.saasAccountId || null;
        
        // Mettre en cache
        saasAccountCache.set(decodedToken.uid, {
          saasAccountId: req.saasAccountId,
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
    const existingSaasAccounts = await firestore
      .collection('saasAccounts')
      .where('mbeNumber', '==', mbeNumber)
      .get();

    if (!existingSaasAccounts.empty) {
      return res.status(400).json({ error: 'Ce numéro MBE est déjà utilisé' });
    }

    // Vérifier si l'utilisateur a déjà un compte SaaS
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
      createdAt: Timestamp.now(),
      isActive: true,
      plan: 'free',
    };

    await saasAccountRef.set(saasAccountData);
    const saasAccountId = saasAccountRef.id;

    // Créer ou mettre à jour le document user
    const userData = {
      uid,
      saasAccountId,
      role: 'owner',
      createdAt: Timestamp.now(),
    };

    await firestore.collection('users').doc(uid).set(userData, { merge: true });

    console.log('[AI Proxy] ✅ Compte SaaS créé:', saasAccountId);

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
    return res.status(500).json({ error: error.message || 'Erreur lors de la création du compte' });
  }
});

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
      try {
        const paiementsSnapshot = await firestore
          .collection('paiements')
          .where('devisId', '==', doc.id)
          .get();
        
        paymentLinksFromPaiements = paiementsSnapshot.docs.map(paiementDoc => {
          const p = paiementDoc.data();
          return {
            id: paiementDoc.id,
            url: p.url || '',
            amount: p.amount || 0,
            createdAt: p.createdAt?.toDate ? p.createdAt.toDate().toISOString() : p.createdAt,
            status: p.status === 'PAID' ? 'paid' : (p.status === 'CANCELLED' ? 'expired' : 'active')
          };
        });
      } catch (paiementError) {
        console.warn(`[API] ⚠️  Erreur chargement paiements pour devis ${doc.id}:`, paiementError.message);
      }
      
      // Fusionner avec les paymentLinks existants (ancien système)
      const existingPaymentLinks = data.paymentLinks || [];
      const allPaymentLinks = [...existingPaymentLinks, ...paymentLinksFromPaiements];
      
      // Convertir les Timestamps en Dates pour le frontend
      return {
        id: doc.id,
        ...data,
        paymentLinks: allPaymentLinks,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
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
} from './shipping-rates.js';

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
  handleStripeWebhook(req, res, firestore);
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
  'GET /api/google-drive/folders',
  'POST /api/google-drive/select-folder',
  'GET /api/google-drive/status',
  'DELETE /api/google-drive/disconnect',
  'POST /api/devis/:id/search-bordereau',
  'POST /api/devis/:id/process-bordereau-from-link',
  'POST /api/devis/:id/recalculate',
  'GET /api/email-accounts',
  'DELETE /api/email-accounts/:accountId',
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

