/**
 * Calcul de l'assurance côté frontend
 * Utilise les paramètres d'assurance (insuranceSettings) passés en paramètre.
 * En backend, utiliser insurance-settings.js qui charge la config depuis Firestore.
 */

export interface InsuranceConfig {
  percentage?: number;
  thresholdValue?: number;
  minFlatFee?: number;
  roundUpIncrement?: number;
}

const DEFAULTS: InsuranceConfig = {
  percentage: 2.5,
  thresholdValue: 500,
  minFlatFee: 12,
  roundUpIncrement: 0.5,
};

/** Arrondit une valeur au supérieur selon l'incrément */
export function roundUpToIncrement(value: number, increment: number): number {
  if (!increment || increment <= 0) return value;
  return Math.ceil(value / increment) * increment;
}

/**
 * Calcule le montant d'assurance à partir de la config
 */
export function computeInsuranceWithConfig(
  config: InsuranceConfig | null,
  lotValue: number,
  insuranceEnabled?: boolean,
  explicitAmount?: number | null
): number {
  if (!insuranceEnabled) return 0;
  if (explicitAmount != null && explicitAmount > 0) {
    const inc = config?.roundUpIncrement ?? DEFAULTS.roundUpIncrement ?? 0.5;
    return roundUpToIncrement(explicitAmount, inc);
  }
  const pct = ((config?.percentage ?? DEFAULTS.percentage) ?? 2.5) / 100;
  const threshold = config?.thresholdValue ?? DEFAULTS.thresholdValue ?? 500;
  const minFee = config?.minFlatFee ?? DEFAULTS.minFlatFee ?? 12;
  const raw =
    lotValue < threshold
      ? Math.max(lotValue * pct, minFee)
      : lotValue * pct;
  const inc = config?.roundUpIncrement ?? DEFAULTS.roundUpIncrement ?? 0.5;
  return roundUpToIncrement(raw, inc);
}
