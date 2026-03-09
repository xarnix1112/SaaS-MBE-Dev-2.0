/**
 * GESTION DES PARAMÈTRES D'ASSURANCE PAR COMPTE SAAS
 *
 * Collection: insuranceSettings
 * Document par saasAccountId
 * Champs: percentage (1-5%), thresholdValue (€), minFlatFee (1-1000€), roundUpIncrement (0.01|0.05|0.1|0.25|0.5|1)
 * Défauts: 2.5%, 500€, 12€, 0.5€
 */

import { Timestamp } from "firebase-admin/firestore";

const DEFAULTS = {
  percentage: 2.5,
  thresholdValue: 500,
  minFlatFee: 12,
  roundUpIncrement: 0.5,
};

const VALID_INCREMENTS = [0.01, 0.05, 0.1, 0.25, 0.5, 1];

/**
 * Arrondit une valeur au supérieur selon l'incrément choisi
 * Ex: 12.34, increment 0.5 → 12.5
 */
function roundUpToIncrement(value, increment) {
  if (!increment || increment <= 0) return value;
  return Math.ceil(value / increment) * increment;
}

/**
 * Calcule le montant d'assurance à partir des paramètres
 * @param {object} config - { percentage, thresholdValue, minFlatFee, roundUpIncrement }
 * @param {number} lotValue - Valeur du lot
 * @param {boolean} insuranceEnabled
 * @param {number} [explicitAmount] - Montant explicite si déjà saisi
 * @returns {number}
 */
export function computeInsuranceWithConfig(config, lotValue, insuranceEnabled, explicitAmount) {
  if (!insuranceEnabled) return 0;
  if (explicitAmount != null && explicitAmount > 0) {
    const inc = config?.roundUpIncrement ?? DEFAULTS.roundUpIncrement;
    return roundUpToIncrement(explicitAmount, inc);
  }
  const pct = (config?.percentage ?? DEFAULTS.percentage) / 100;
  const threshold = config?.thresholdValue ?? DEFAULTS.thresholdValue;
  const minFee = config?.minFlatFee ?? DEFAULTS.minFlatFee;
  const raw =
    lotValue < threshold
      ? Math.max(lotValue * pct, minFee)
      : lotValue * pct;
  const inc = config?.roundUpIncrement ?? DEFAULTS.roundUpIncrement;
  return roundUpToIncrement(raw, inc);
}

/**
 * Récupère la config d'assurance depuis Firestore (ou défauts)
 * @param {FirebaseFirestore.Firestore} firestore
 * @param {string} saasAccountId
 * @returns {Promise<object>}
 */
export async function getInsuranceConfig(firestore, saasAccountId) {
  if (!firestore || !saasAccountId) return { ...DEFAULTS };
  const doc = await firestore.collection("insuranceSettings").doc(saasAccountId).get();
  if (!doc.exists) return { ...DEFAULTS };
  const data = doc.data() || {};
  return {
    percentage: data.percentage ?? DEFAULTS.percentage,
    thresholdValue: data.thresholdValue ?? DEFAULTS.thresholdValue,
    minFlatFee: data.minFlatFee ?? DEFAULTS.minFlatFee,
    roundUpIncrement: data.roundUpIncrement ?? DEFAULTS.roundUpIncrement,
  };
}

/**
 * Calcule l'assurance en chargeant la config depuis Firestore
 */
export async function computeInsuranceAmount(firestore, saasAccountId, lotValue, insuranceEnabled, explicitAmount) {
  const config = await getInsuranceConfig(firestore, saasAccountId);
  return computeInsuranceWithConfig(config, lotValue, insuranceEnabled, explicitAmount);
}

/**
 * GET /api/insurance/settings
 */
export async function handleGetSettings(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;
    if (!saasAccountId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const doc = await firestore.collection("insuranceSettings").doc(saasAccountId).get();
    if (!doc.exists) {
      return res.json({ ...DEFAULTS, saasAccountId });
    }
    const data = doc.data();
    return res.json({
      saasAccountId,
      percentage: data.percentage ?? DEFAULTS.percentage,
      thresholdValue: data.thresholdValue ?? DEFAULTS.thresholdValue,
      minFlatFee: data.minFlatFee ?? DEFAULTS.minFlatFee,
      roundUpIncrement: data.roundUpIncrement ?? DEFAULTS.roundUpIncrement,
    });
  } catch (error) {
    console.error("[InsuranceSettings] Erreur GET:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * PUT /api/insurance/settings
 */
export async function handleUpdateSettings(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;
    if (!saasAccountId) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const { percentage, thresholdValue, minFlatFee, roundUpIncrement } = req.body || {};
    const updateData = { updatedAt: Timestamp.now() };

    if (percentage !== undefined) {
      const p = Number(percentage);
      if (isNaN(p) || p < 1 || p > 5) {
        return res.status(400).json({ error: "Le taux doit être entre 1 et 5 %" });
      }
      updateData.percentage = p;
    }
    if (thresholdValue !== undefined) {
      const t = Number(thresholdValue);
      if (isNaN(t) || t < 1) {
        return res.status(400).json({ error: "Le seuil doit être >= 1 €" });
      }
      updateData.thresholdValue = t;
    }
    if (minFlatFee !== undefined) {
      const m = Number(minFlatFee);
      if (isNaN(m) || m < 1 || m > 1000) {
        return res.status(400).json({ error: "Le minimum forfaitaire doit être entre 1 et 1000 €" });
      }
      updateData.minFlatFee = m;
    }
    if (roundUpIncrement !== undefined) {
      const inc = Number(roundUpIncrement);
      if (!VALID_INCREMENTS.includes(inc)) {
        return res.status(400).json({
          error: "L'incrément doit être l'un de: 0.01, 0.05, 0.1, 0.25, 0.5, 1",
        });
      }
      updateData.roundUpIncrement = inc;
    }

    const ref = firestore.collection("insuranceSettings").doc(saasAccountId);
    const existing = await ref.get();
    if (!existing.exists) {
      await ref.set({
        saasAccountId,
        ...DEFAULTS,
        ...updateData,
        createdAt: Timestamp.now(),
      });
    } else {
      await ref.update(updateData);
    }

    const updated = await ref.get();
    return res.json(updated.data());
  } catch (error) {
    console.error("[InsuranceSettings] Erreur PUT:", error);
    return res.status(500).json({ error: error.message });
  }
}

export { DEFAULTS, VALID_INCREMENTS, roundUpToIncrement };
