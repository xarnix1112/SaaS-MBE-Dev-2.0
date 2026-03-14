/**
 * Chiffrement/déchiffrement de l'API Key Jotform pour stockage sécurisé
 * Utilise AES-256-GCM avec une clé dérivée de JOTFORM_ENCRYPTION_KEY
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

/**
 * Dérive une clé de 32 octets depuis JOTFORM_ENCRYPTION_KEY
 * @param {string} rawKey - Clé brute (hex ou base64, min 32 octets)
 * @returns {Buffer|null} Clé dérivée ou null si invalide
 */
function deriveKey(rawKey) {
  if (!rawKey || typeof rawKey !== "string") return null;
  const trimmed = rawKey.trim();
  if (trimmed.length < 32) return null;

  let keyBytes;
  try {
    if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length >= 64) {
      keyBytes = Buffer.from(trimmed, "hex");
    } else {
      keyBytes = Buffer.from(trimmed, "utf8");
    }
  } catch {
    return null;
  }

  return crypto.createHash("sha256").update(keyBytes).digest();
}

/**
 * Chiffre l'API Key Jotform
 * @param {string} plaintext - API Key en clair
 * @returns {{ encrypted: string } | { plaintext: string }} Objet avec encrypted ou plaintext (si clé absente)
 */
export function encryptApiKey(plaintext) {
  if (!plaintext || typeof plaintext !== "string") {
    throw new Error("API Key invalide");
  }

  const key = deriveKey(process.env.JOTFORM_ENCRYPTION_KEY);
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[Jotform] JOTFORM_ENCRYPTION_KEY manquante en production - stockage en clair non recommandé");
    }
    return { plaintext: plaintext.trim() };
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext.trim(), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, authTag, encrypted]);
  return { encrypted: combined.toString("base64") };
}

/**
 * Déchiffre l'API Key Jotform
 * @param {string} ciphertext - Données chiffrées (base64) ou API Key en clair
 * @param {string} [plaintextFallback] - API Key en clair si stockée sans chiffrement
 * @returns {string} API Key en clair
 */
export function decryptApiKey(ciphertext, plaintextFallback) {
  if (plaintextFallback && typeof plaintextFallback === "string" && plaintextFallback.trim()) {
    return plaintextFallback.trim();
  }

  if (!ciphertext || typeof ciphertext !== "string") {
    throw new Error("Données chiffrées invalides");
  }

  const key = deriveKey(process.env.JOTFORM_ENCRYPTION_KEY);
  if (!key) {
    throw new Error("JOTFORM_ENCRYPTION_KEY manquante - impossible de déchiffrer");
  }

  let combined;
  try {
    combined = Buffer.from(ciphertext.trim(), "base64");
  } catch {
    throw new Error("Format chiffré invalide");
  }

  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Données chiffrées corrompues");
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}
