/**
 * Détection de l'environnement (dev / staging / production)
 * Utilisé par Firebase, Stripe, et les middlewares
 */

const VALID_ENVS = ['development', 'staging', 'production'];

/**
 * Détermine l'environnement courant
 * Priorité : 1. NODE_ENV  2. VERCEL_ENV  3. VERCEL_URL (staging = preview)
 */
export function getEnv() {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase();
  const vercelEnv = process.env.VERCEL_ENV?.toLowerCase();
  const vercelUrl = process.env.VERCEL_URL || '';

  // Vercel définit VERCEL_ENV : production | preview | development
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'staging';
  if (vercelEnv === 'development') return 'development';

  // Vercel URL : les previews ont des URLs comme xxx-xxx-staging-xxx.vercel.app
  if (vercelUrl.includes('-staging-') || vercelUrl.includes('staging.')) {
    return 'staging';
  }

  // NODE_ENV classique
  if (nodeEnv === 'production') return 'production';
  if (nodeEnv === 'staging') return 'staging';
  if (nodeEnv === 'development' || nodeEnv === 'dev') return 'development';

  // Par défaut en local = development
  return 'development';
}

const currentEnv = getEnv();

export const env = currentEnv;
export const isDevelopment = currentEnv === 'development';
export const isStaging = currentEnv === 'staging';
export const isProduction = currentEnv === 'production';
export const isValidEnv = (e) => VALID_ENVS.includes(e);
