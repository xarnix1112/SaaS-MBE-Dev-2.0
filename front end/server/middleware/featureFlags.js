/**
 * Middleware Feature Flags / Limites
 *
 * Architecture:
 * - plans/{planId} : features + limits (dynamiques)
 * - saasAccounts/{id} : planId, customFeatures, usage, billingPeriod
 * - finalFeatures = { ...plan.features, ...saasAccount.customFeatures }
 *
 * Utilise saasAccountId (req.saasAccountId) - niveau tenant/organisation
 *
 * IMPORTANT: Pour quotesPerYear, on recalcule l'usage à partir du nombre réel de devis
 * dans Firestore si ce nombre est supérieur au compteur stocké. Cela corrige les
 * désynchronisations (devis créés hors sync Google Sheets, compteur non incrémenté, etc.)
 */

import { Timestamp } from "firebase-admin/firestore";

function resolvePlanId(raw) {
  if (!raw) return "starter";
  const mapping = { free: "starter", basic: "starter", enterprise: "ultra" };
  return mapping[raw] || raw;
}

/**
 * Récupère les features finales pour un saasAccountId
 * @param {FirebaseFirestore.Firestore} firestore
 * @param {string} saasAccountId
 * @returns {Promise<{ features: Record<string, boolean>, plan: object | null }>}
 */
async function getAccountFeatures(firestore, saasAccountId) {
  if (!firestore || !saasAccountId) {
    return { features: {}, plan: null };
  }

  const saasDoc = await firestore.collection("saasAccounts").doc(saasAccountId).get();
  if (!saasDoc.exists) return { features: {}, plan: null };

  const saasData = saasDoc.data();
  const planId = resolvePlanId(saasData.planId || saasData.plan);
  const customFeatures = saasData.customFeatures || {};

  const planSnapshot = await firestore.collection("plans").doc(planId).get();
  const plan = planSnapshot.exists ? planSnapshot.data() : null;
  const planFeatures = plan?.features || {};

  // customFeatures écrase le plan
  const finalFeatures = { ...planFeatures, ...customFeatures };

  return { features: finalFeatures, plan };
}

/**
 * Récupère les infos complètes (features + limits + usage) pour le frontend
 * @param {FirebaseFirestore.Firestore} firestore
 * @param {string} saasAccountId
 */
async function getAccountFeaturesAndLimits(firestore, saasAccountId) {
  const { features, plan } = await getAccountFeatures(firestore, saasAccountId);

  if (!firestore || !saasAccountId) {
    return {
      features: {},
      limits: {},
      usage: {},
      remaining: {},
      planId: "starter",
      planName: "Basic",
    };
  }

  const saasDoc = await firestore.collection("saasAccounts").doc(saasAccountId).get();
  if (!saasDoc.exists) {
    return {
      features: {},
      limits: {},
      usage: {},
      remaining: {},
      planId: "starter",
      planName: "Basic",
    };
  }

  const saasData = saasDoc.data();
  const planId = resolvePlanId(saasData.planId || saasData.plan);
  let usage = { ...(saasData.usage || {}) };
  const limits = plan?.limits || {};

  // Recalculer usage.quotesPerYear à partir du nombre réel de devis (corrige les désyncs)
  if (limits.quotesPerYear != null && limits.quotesPerYear !== -1) {
    try {
      const billingPeriod = saasData.billingPeriod || {};
      const yearStart = billingPeriod.yearStart ? new Date(billingPeriod.yearStart) : new Date(new Date().getFullYear(), 0, 1);
      const yearEnd = billingPeriod.yearEnd ? new Date(billingPeriod.yearEnd) : new Date(new Date().getFullYear(), 11, 31, 23, 59, 59, 999);
      const startTs = Timestamp.fromDate(yearStart);
      const endTs = Timestamp.fromDate(yearEnd);

      let actualCount = 0;
      try {
        const countSnap = await firestore
          .collection("quotes")
          .where("saasAccountId", "==", saasAccountId)
          .where("createdAt", ">=", startTs)
          .where("createdAt", "<=", endTs)
          .count()
          .get();
        actualCount = countSnap.data().count ?? 0;
      } catch (countErr) {
        // Fallback si count() non supporté ou index manquant: utiliser .get().size
        const snap = await firestore
          .collection("quotes")
          .where("saasAccountId", "==", saasAccountId)
          .where("createdAt", ">=", startTs)
          .where("createdAt", "<=", endTs)
          .get();
        actualCount = snap.size;
      }
      const storedUsage = usage.quotesUsedThisYear ?? 0;
      usage.quotesUsedThisYear = Math.max(storedUsage, actualCount);
    } catch (err) {
      console.warn("[featureFlags] Recalcul usage devis échoué, utilisation valeur stockée:", err.message);
    }
  }

  const remaining = {};
  for (const [key, max] of Object.entries(limits)) {
    if (max === -1) remaining[key] = -1; // illimité
    else remaining[key] = Math.max(0, (max || 0) - (usage[key] || 0));
  }

  return {
    features,
    limits,
    usage,
    remaining,
    planId,
    planName: plan?.name || planId,
    billingPeriod: saasData.billingPeriod || null,
  };
}

/**
 * Middleware Express : vérifie qu'une feature est activée
 * À placer APRÈS requireAuth (req.saasAccountId requis)
 *
 * @param {FirebaseFirestore.Firestore} firestore
 * @param {string} featureName
 */
function checkFeature(firestore, featureName) {
  return async (req, res, next) => {
    const saasAccountId = req.saasAccountId;
    if (!saasAccountId) {
      return res.status(400).json({
        error: "Compte SaaS non configuré",
        code: "SAAS_ACCOUNT_REQUIRED",
      });
    }

    try {
      const { features } = await getAccountFeatures(firestore, saasAccountId);
      if (!features[featureName]) {
        return res.status(403).json({
          error: `Fonctionnalité "${featureName}" non disponible sur votre plan`,
          code: "FEATURE_DISABLED",
        });
      }
      next();
    } catch (err) {
      console.error("[featureFlags] Erreur checkFeature:", err);
      res.status(500).json({
        error: "Erreur lors de la vérification des droits",
        code: "FEATURE_CHECK_FAILED",
      });
    }
  };
}

/**
 * Middleware Express : vérifie qu'une limite n'est pas atteinte
 * À placer APRÈS requireAuth
 *
 * @param {FirebaseFirestore.Firestore} firestore
 * @param {string} limitName (ex: quotesPerYear)
 */
function checkLimit(firestore, limitName) {
  return async (req, res, next) => {
    const saasAccountId = req.saasAccountId;
    if (!saasAccountId) {
      return res.status(400).json({
        error: "Compte SaaS non configuré",
        code: "SAAS_ACCOUNT_REQUIRED",
      });
    }

    try {
      const saasDoc = await firestore.collection("saasAccounts").doc(saasAccountId).get();
      if (!saasDoc.exists) {
        return res.status(400).json({ error: "Compte SaaS non trouvé" });
      }

      const saasData = saasDoc.data();
      const planId = resolvePlanId(saasData.planId || saasData.plan);
      const planDoc = await firestore.collection("plans").doc(planId).get();
      const plan = planDoc.exists ? planDoc.data() : null;

      const maxLimit = plan?.limits?.[limitName] ?? 0;
      const currentUsage = saasData.usage?.[limitName] ?? 0;

      if (maxLimit !== -1 && currentUsage >= maxLimit) {
        return res.status(403).json({
          error: `Limite atteinte pour votre plan (${limitName})`,
          code: "LIMIT_REACHED",
          limit: limitName,
          current: currentUsage,
          max: maxLimit,
        });
      }
      next();
    } catch (err) {
      console.error("[featureFlags] Erreur checkLimit:", err);
      res.status(500).json({
        error: "Erreur lors de la vérification des limites",
        code: "LIMIT_CHECK_FAILED",
      });
    }
  };
}

export {
  getAccountFeatures,
  getAccountFeaturesAndLimits,
  checkFeature,
  checkLimit,
};
