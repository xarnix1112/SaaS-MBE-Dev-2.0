/**
 * Templates des emails automatiques - personnalisation plan Ultra
 * Stockage: saasAccounts.{id}.emailTemplates
 */

export const EMAIL_TYPES = [
  'payment_received',
  'awaiting_collection',
  'collected',
  'awaiting_shipment',
  'shipped',
];

export const EMAIL_TYPE_LABELS = {
  payment_received: 'Paiement reçu',
  awaiting_collection: 'Demande de collecte',
  collected: 'Lot collecté',
  awaiting_shipment: 'Colis prêt',
  shipped: 'Colis expédié',
};

/** Placeholders disponibles par type d'email */
export const PLACEHOLDERS = {
  reference: { label: 'Référence devis', key: '{reference}' },
  clientName: { label: 'Nom du client', key: '{clientName}' },
  mbeName: { label: 'Nom du MBE', key: '{mbeName}' },
  amount: { label: 'Montant (€)', key: '{amount}' },
};

/** Placeholders requis par champ (subject, signature) et par type */
export const REQUIRED_PLACEHOLDERS = {
  payment_received: { subject: ['{reference}'], signature: ['{mbeName}'] },
  awaiting_collection: { subject: ['{reference}'], signature: ['{mbeName}'] },
  collected: { subject: ['{reference}'], signature: ['{mbeName}'] },
  awaiting_shipment: { subject: ['{reference}'], signature: ['{mbeName}'] },
  shipped: { subject: ['{reference}'], signature: ['{mbeName}'] },
};

/** Limites de caractères */
export const LIMITS = {
  subject: 200,
  signature: 500,
};

/** Valeurs par défaut (sujet, signature, ton) */
export const DEFAULT_TEMPLATES = {
  payment_received: {
    subject: 'Paiement reçu - Devis {reference}',
    signature: 'Cordialement,\n{mbeName}',
    tone: 'formel',
  },
  awaiting_collection: {
    subject: 'Demande de collecte - Devis {reference}',
    signature: 'Cordialement,\n{mbeName}',
    tone: 'formel',
  },
  collected: {
    subject: 'Lot collecté - Devis {reference}',
    signature: 'Cordialement,\n{mbeName}',
    tone: 'formel',
  },
  awaiting_shipment: {
    subject: 'Colis prêt - Devis {reference}',
    signature: 'Cordialement,\n{mbeName}',
    tone: 'formel',
  },
  shipped: {
    subject: 'Colis expédié - Devis {reference}',
    signature: 'Cordialement,\n{mbeName}',
    tone: 'formel',
  },
};

/**
 * Récupère les templates pour un saasAccount (personnalisés ou défaut)
 */
export function getTemplatesForAccount(customTemplates) {
  const result = {};
  for (const type of EMAIL_TYPES) {
    const custom = customTemplates?.[type];
    const def = DEFAULT_TEMPLATES[type];
    result[type] = {
      subject: custom?.subject ?? def.subject,
      signature: custom?.signature ?? def.signature,
      tone: custom?.tone ?? def.tone ?? 'formel',
    };
  }
  return result;
}

/**
 * Valide un template (placeholders requis, limites)
 */
export function validateTemplate(type, { subject, signature }) {
  const errors = [];
  const required = REQUIRED_PLACEHOLDERS[type];
  if (!required) return errors;

  for (const ph of required.subject || []) {
    if (!subject || !subject.includes(ph)) {
      errors.push(`Le placeholder ${ph} est obligatoire dans le sujet et ne peut pas être supprimé.`);
    }
  }
  for (const ph of required.signature || []) {
    if (!signature || !signature.includes(ph)) {
      errors.push(`Le placeholder ${ph} est obligatoire dans la signature et ne peut pas être supprimé.`);
    }
  }
  if (subject && subject.length > LIMITS.subject) {
    errors.push(`Le sujet ne doit pas dépasser ${LIMITS.subject} caractères.`);
  }
  if (signature && signature.length > LIMITS.signature) {
    errors.push(`La signature ne doit pas dépasser ${LIMITS.signature} caractères.`);
  }
  return errors;
}
