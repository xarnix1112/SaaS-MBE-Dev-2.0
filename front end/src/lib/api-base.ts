/**
 * URL de base de l'API backend
 *
 * Détecte automatiquement l'environnement au runtime :
 * 1. Si le projet Firebase est staging (VITE_FIREBASE_PROJECT_ID) → backend STAGING
 * 2. Si l'hôte est staging.mbe-sdv.fr, saas-mbe-sdv-staging.firebaseapp.com ou *.vercel.app (preview) → backend STAGING
 * 3. Sinon → VITE_API_BASE_URL (injecté au build par Vercel)
 *
 * Cela corrige le cas où Vercel Preview utilise les variables Production
 * au lieu de Preview (VITE_API_BASE_URL pointe alors vers le mauvais backend).
 */

/**
 * URL du backend Railway STAGING.
 * Récupère l'URL dans Railway → ton service staging → Settings → Domain.
 */
const STAGING_BACKEND = 'https://saas-mbe-dev-staging-staging.up.railway.app';

/**
 * URL du backend Railway PRODUCTION.
 * Utilisé quand on est sur www.mbe-sdv.fr pour garantir Stripe Live (évite test/live mix).
 */
const PRODUCTION_BACKEND = 'https://api.mbe-sdv.fr';

function isStagingEnvironment(): boolean {
  // 1. Build configuré pour staging (Vercel Preview avec env staging)
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (projectId === 'saas-mbe-sdv-staging') {
    return true;
  }
  // 2. Détection par hostname (runtime)
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'staging.mbe-sdv.fr' || host === 'www.staging.mbe-sdv.fr') return true;
    if (host === 'saas-mbe-sdv-staging.firebaseapp.com') return true;
    // Vercel Preview (ex: saas-mbe-sdv-staging-xxx.vercel.app ou git-staging-xxx.vercel.app)
    if (host.endsWith('.vercel.app') && (host.includes('staging') || host.includes('saas-mbe-sdv-staging'))) return true;
  }
  return false;
}

export function getApiBaseUrl(): string {
  if (isStagingEnvironment()) {
    return STAGING_BACKEND;
  }
  // Production (www.mbe-sdv.fr) : forcer le backend production pour Stripe Live
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'www.mbe-sdv.fr' || host === 'mbe-sdv.fr') {
      return PRODUCTION_BACKEND;
    }
  }
  return (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
}
