/**
 * URL de base de l'API backend
 *
 * Détecte automatiquement l'environnement au runtime :
 * 1. Si le projet Firebase est staging (VITE_FIREBASE_PROJECT_ID) → backend STAGING
 * 2. Si l'hôte est staging.mbe-sdv.fr ou preview Vercel → backend STAGING
 * 3. Si l'hôte est mbe-sdv.fr / www.mbe-sdv.fr → backend PRODUCTION (api.mbe-sdv.fr)
 * 4. Sinon → VITE_API_BASE_URL (injecté au build par Vercel)
 */

const STAGING_BACKEND = 'https://saas-mbe-dev-staging-staging.up.railway.app';
const PRODUCTION_BACKEND = 'https://api.mbe-sdv.fr';

function isStagingEnvironment(): boolean {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (projectId === 'saas-mbe-sdv-staging') return true;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'staging.mbe-sdv.fr' || host === 'www.staging.mbe-sdv.fr') return true;
    if (host === 'saas-mbe-sdv-staging.firebaseapp.com') return true;
    if (host.endsWith('.vercel.app') && (host.includes('staging') || host.includes('saas-mbe-sdv-staging'))) return true;
  }
  return false;
}

function isProductionEnvironment(): boolean {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    return host === 'mbe-sdv.fr' || host === 'www.mbe-sdv.fr';
  }
  return false;
}

export function getApiBaseUrl(): string {
  if (isStagingEnvironment()) return STAGING_BACKEND;
  if (isProductionEnvironment()) return PRODUCTION_BACKEND;
  const fromEnv = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
  return fromEnv || PRODUCTION_BACKEND;
}
