/**
 * Configuration Firebase Admin dynamique selon l'environnement
 * Remplace l'initialisation statique dans index.js
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getEnv } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = getEnv();

// Mapping des projets Firebase par environnement
const FIREBASE_PROJECT_IDS = {
  development: process.env.FIREBASE_PROJECT_ID_DEV || 'saas-mbe-sdv-dev',
  staging: process.env.FIREBASE_PROJECT_ID_STAGING || 'saas-mbe-sdv-staging',
  production: process.env.FIREBASE_PROJECT_ID || 'saas-mbe-sdv-production',
};

const projectId = process.env.FIREBASE_PROJECT_ID || FIREBASE_PROJECT_IDS[env];

/**
 * Initialise Firebase Admin avec le bon projet
 * @returns {{ firestore, projectId, env }}
 */
export function initFirebaseAdmin() {
  const credentialsPaths = {
    development: path.join(__dirname, '..', '..', 'firebase-credentials-dev.json'),
    staging: path.join(__dirname, '..', '..', 'firebase-credentials-staging.json'),
    production: path.join(__dirname, '..', '..', 'firebase-credentials.json'),
  };

  const credPath = credentialsPaths[env];
  let firestore = null;

  try {
    const firebaseConfig = { projectId };

    if (fs.existsSync(credPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      initializeApp({
        credential: cert(serviceAccount),
        projectId: firebaseConfig.projectId,
      });
      console.log(`[firebase-env] ✅ Firebase Admin initialisé (${env}) - projet: ${projectId}`);
    } else {
      initializeApp({ projectId: firebaseConfig.projectId });
      console.log(`[firebase-env] ✅ Firebase Admin initialisé (${env}) - projet: ${projectId} (ADC)`);
    }

    firestore = getFirestore();
  } catch (err) {
    console.warn('[firebase-env] ⚠️ Firebase Admin non initialisé:', err.message);
  }

  return { firestore, projectId, env };
}

export function getProjectId() {
  return projectId;
}

export function getFirebaseEnv() {
  return env;
}
