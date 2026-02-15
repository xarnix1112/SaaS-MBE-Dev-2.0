/**
 * Middleware Feature Flags
 * Vérifie que l'utilisateur a accès à une feature selon son plan + overrides
 */

import { getFirestore } from 'firebase-admin/firestore';

// Features incluses par plan (par défaut)
export const PLAN_FEATURES = {
  basic: ['coreQuotes', 'basicPayments'],
  pro: ['coreQuotes', 'basicPayments', 'advancedAnalytics', 'customWorkflows', 'prioritySupport'],
  enterprise: ['coreQuotes', 'basicPayments', 'advancedAnalytics', 'customWorkflows', 'prioritySupport', 'apiAccess', 'customBranding', 'dedicatedSupport'],
};

/**
 * Récupère les features actives pour un userId
 */
export async function getUserFeatures(userId) {
  if (!userId) return new Set(PLAN_FEATURES.basic);

  const db = getFirestore();
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return new Set(PLAN_FEATURES.basic);

  const data = userDoc.data();
  const plan = data.plan || 'basic';
  const planFeatures = PLAN_FEATURES[plan] || PLAN_FEATURES.basic;
  const overrides = data.features || {};

  const active = new Set(planFeatures);
  Object.entries(overrides).forEach(([key, enabled]) => {
    if (enabled) active.add(key);
    else active.delete(key);
  });

  return active;
}

/**
 * Middleware Express : vérifie qu'une feature est activée
 */
export function checkFeature(featureName) {
  return async (req, res, next) => {
    const userId = req.user?.uid || req.headers['x-user-id'] || req.query?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Non authentifié', code: 'UNAUTHORIZED' });
    }

    try {
      const features = await getUserFeatures(userId);
      if (!features.has(featureName)) {
        return res.status(403).json({
          error: `Feature "${featureName}" non disponible sur votre plan`,
          code: 'FEATURE_DISABLED',
        });
      }
      next();
    } catch (err) {
      console.error('[featureFlags] Erreur:', err);
      res.status(500).json({ error: 'Erreur vérification feature', code: 'FEATURE_CHECK_FAILED' });
    }
  };
}

/**
 * Vérification synchrone (si features déjà en cache)
 */
export function hasFeature(featuresSet, featureName) {
  return featuresSet && featuresSet.has(featureName);
}
