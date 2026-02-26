/**
 * Templates emails étendus - personnalisation complète par compte MBE
 * Sujet, corps HTML, signature, couleurs bandeau/bouton, police
 * Stockage: saasAccounts.{id}.emailTemplates (structure étendue)
 */

/** Types d'emails personnalisables */
export const EMAIL_TYPES_EXTENDED = [
  'quote_send',        // Envoi devis
  'surcharge',         // Surcoût supplémentaire
  'payment_received',
  'awaiting_collection',
  'collected',
  'awaiting_shipment',
  'shipped',
];

export const EMAIL_TYPE_LABELS_EXTENDED = {
  quote_send: 'Envoi de devis',
  surcharge: 'Surcoût supplémentaire',
  payment_received: 'Paiement reçu',
  awaiting_collection: 'Demande de collecte',
  collected: 'Lot collecté',
  awaiting_shipment: 'Colis prêt',
  shipped: 'Colis expédié',
};

/** Placeholders disponibles (format {{key}} ou {key}) */
export const PLACEHOLDERS_EXTENDED = [
  { key: '{{bordereauNum}}', label: 'Numéro de bordereau', alt: '{bordereauNum}' },
  { key: '{{reference}}', label: 'Référence devis', alt: '{reference}' },
  { key: '{{nomSalleVentes}}', label: 'Nom salle des ventes', alt: '{auctionHouse}' },
  { key: '{{prixEmballage}}', label: 'Prix emballage (€)', alt: '{packagingPrice}' },
  { key: '{{prixTransport}}', label: 'Prix transport (€)', alt: '{shippingPrice}' },
  { key: '{{prixAssurance}}', label: 'Prix assurance (€) ou "NON"', alt: '{insurancePrice}' },
  { key: '{{prixTotal}}', label: 'Prix total (€)', alt: '{total}' },
  { key: '{{lienPaiementSecurise}}', label: 'Lien paiement sécurisé', alt: '{paymentUrl}' },
  { key: '{{adresseDestinataire}}', label: 'Adresse de livraison', alt: '{deliveryAddress}' },
  { key: '{{clientName}}', label: 'Nom du client', alt: '{clientName}' },
  { key: '{{date}}', label: 'Date du jour', alt: '{date}' },
  { key: '{{lotNumber}}', label: 'Numéro de lot', alt: '{lotNumber}' },
  { key: '{{lotDescription}}', label: 'Description du lot', alt: '{lotDescription}' },
  { key: '{{mbeName}}', label: 'Nom du MBE', alt: '{mbeName}' },
  { key: '{{amount}}', label: 'Montant (€)', alt: '{amount}' },
];

/** Template par défaut - Envoi de devis - espacement généreux pour lisibilité (Gmail, Outlook, etc.) */
export const DEFAULT_QUOTE_SEND_HTML = `<div style="margin-bottom:24px;">
<p style="margin:0 0 16px 0; line-height:1.6;">Bonjour,</p>
<p style="margin:0 0 0; line-height:1.6;">Suite à votre demande, nous avons le plaisir de vous proposer notre devis pour la Collecte, l'Emballage et l'Expédition de vos lot(s) du bordereau n° {{bordereauNum}}, acquis à {{nomSalleVentes}}.</p>
</div>

<div style="margin-bottom:24px;">
<p style="margin:0 0 12px 0; line-height:1.6;"><strong>1 – Détail du devis</strong></p>
<p style="margin:0 0 8px 0; line-height:1.6;">Retrait des lots + Emballage sur mesure (fournitures d'emballage / carton + main-d'œuvre) : {{prixEmballage}} €</p>
<p style="margin:0 0 8px 0; line-height:1.6;">Transport + Gestion de dossier : {{prixTransport}} €</p>
<p style="margin:0 0 8px 0; line-height:1.6;">Assurance (optionnelle) : {{prixAssurance}}</p>
<p style="margin:0 0 8px 0; font-size:13px; line-height:1.5;"><em>La couverture d'expédition couvre la valeur d'adjudication (hors frais de la salle des ventes) des lots en cas de perte, vol ou dégradation.</em></p>
<p style="margin:0 0 0; font-size:13px; line-height:1.5;"><em>Pour les envois de tableaux, l'assurance ne prend pas en compte la détérioration du cadre et/ou de la vitre durant le transport.</em></p>
</div>

<div style="margin-bottom:24px;">
<p style="margin:0 0 12px 0; line-height:1.6;"><strong>Total : {{prixTotal}} € TTC</strong></p>
<p style="margin:0 0 0; line-height:1.6;">Offre valable 15 jours à compter de ce jour. Ce devis est exprimé en TTC si l'expédition a lieu en Europe et H.T. pour des expéditions hors zone Euro.</p>
</div>

<div style="margin-bottom:24px;">
<p style="margin:0 0 8px 0; line-height:1.6;">⚠ Le chiffrage est approximatif, réalisé avec la description du bordereau, sans avoir les objets sous les yeux.</p>
<p style="margin:0 0 0; line-height:1.6;">Si dimensions/poids réels sont différents, un ajustement pourra être appliqué (nous vous préviendrons avant).</p>
</div>

<div style="margin-bottom:24px;">
<p style="margin:0 0 12px 0; line-height:1.6;"><strong>2 – Paiement (acceptation du devis)</strong></p>
<p style="margin:0 0 8px 0; line-height:1.6;">Le règlement se fait par carte bancaire via notre lien sécurisé :</p>
<p style="margin:0 0 16px 0; line-height:1.6;">👉 {{lienPaiementSecurise}}</p>
<p style="margin:0 0 0; line-height:1.6;">En validant ce devis et en procédant au paiement, vous reconnaissez avoir pris connaissance et accepté nos conditions générales ainsi que celles de nos transporteurs : <a href="https://linktr.ee/mbe026">https://linktr.ee/mbe026</a></p>
</div>

<div style="margin-bottom:24px;">
<p style="margin:0 0 12px 0; line-height:1.6;"><strong>3 – Collecte – Emballage – Expédition</strong></p>
<p style="margin:0 0 12px 0; line-height:1.6;">D'une manière générale, nous collectons les lots 1 fois par semaine (sauf exception en fonction des disponibilités et du planning des salles des ventes). Une fois collectés, nous préparons les emballages sur mesure des lots pour l'expédition des colis, dont vous êtes averti personnellement, par e-mail, par le transporteur avec le numéro de suivi.</p>
<p style="margin:0 0 4px 0; line-height:1.6;">• Délais : Emballage + expédition : habituellement sous une semaine</p>
<p style="margin:0 0 4px 0; line-height:1.6;">• Livraison en France métropolitaine : 48 h en moyenne (non garanti).</p>
<p style="margin:0 0 0; line-height:1.6;">Mode EXPRESS possible sur simple demande (engendre une modification du devis).</p>
</div>

<div style="margin-bottom:24px;">
<p style="margin:0 0 12px 0; line-height:1.6;"><strong>4 – Livraison</strong></p>
<p style="margin:0 0 8px 0; line-height:1.6;">Votre colis sera expédié à l'adresse suivante :</p>
<p style="margin:0 0 16px 0; line-height:1.6;"><strong>{{adresseDestinataire}}</strong></p>
<p style="margin:0 0 12px 0; line-height:1.6;">Si vous souhaitez une livraison en point relais ou à une autre adresse que celle de votre bordereau, merci de nous l'indiquer par retour de cet e-mail uniquement.</p>
<p style="margin:0 0 12px 0; line-height:1.6;">⚠ Après envoi du colis, tout changement d'adresse sera facturé 15 € TTC.</p>
<p style="margin:0 0 8px 0; line-height:1.6;">En cas de problème à la livraison, merci de :</p>
<p style="margin:0 0 4px 0; line-height:1.6;">• prendre plusieurs photos du colis et de l'emballage,</p>
<p style="margin:0 0 4px 0; line-height:1.6;">• garder tous les matériaux d'emballage,</p>
<p style="margin:0 0 0; line-height:1.6;">• nous prévenir immédiatement (sans dépasser les délais du transporteur).</p>
</div>

<div style="margin-bottom:24px;">
<p style="margin:0 0 12px 0; line-height:1.6;"><strong>5 – CGV – Responsabilités – Informations utiles</strong></p>
<p style="margin:0 0 8px 0; line-height:1.6;">La responsabilité de MBE ne peut être engagée si le transporteur refuse l'indemnisation en raison de la nature, de la valeur ou de l'emballage.</p>
<p style="margin:0 0 0; line-height:1.6;">Lien vers nos conditions générales ainsi que celles de nos transporteurs : <a href="https://linktr.ee/mbe026">https://linktr.ee/mbe026</a></p>
</div>

<div style="margin-bottom:24px;">
<p style="margin:0 0 12px 0; line-height:1.6;"><strong>6 – Facture</strong></p>
<p style="margin:0 0 8px 0; line-height:1.6;">L'envoi d'une facture n'est pas automatique.</p>
<p style="margin:0 0 0; line-height:1.6;">👉 Merci de préciser dans votre réponse si vous souhaitez une facture et, le cas échéant, d'indiquer les coordonnées de votre société.</p>
</div>

<div style="margin-bottom:0;">
<p style="margin:0; line-height:1.6;">Nous restons à votre disposition pour toute question et vous remercions de votre confiance.</p>
</div>`;

export const DEFAULT_QUOTE_SEND_SIGNATURE = `Bien à vous,`;

/** Valeurs par défaut - templates étendus */
export const DEFAULT_TEMPLATES_EXTENDED = {
  quote_send: {
    subject: 'Votre devis de transport - {{reference}}',
    bodyHtml: DEFAULT_QUOTE_SEND_HTML,
    signature: DEFAULT_QUOTE_SEND_SIGNATURE,
    bannerColor: '#2563eb',
    buttonColor: '#2563eb',
    bannerTitle: '📦 Votre Devis de Transport',
    buttonLabel: 'Payer {{prixTotal}} € maintenant',
  },
  surcharge: {
    subject: 'Surcoût supplémentaire - {{reference}}',
    bodyHtml: `Bonjour {{clientName}},

Nous vous contactons concernant votre devis de transport {{reference}}.

<strong>SURCOÛT SUPPLÉMENTAIRE</strong><br>
{{description}}

<strong>Montant du surcoût : {{amount}} €</strong>`,
    signature: 'Cordialement,<br><strong>{{mbeName}}</strong>',
    bannerColor: '#2563eb',
    buttonColor: '#2563eb',
    bannerTitle: '💳 Surcoût Supplémentaire',
    buttonLabel: 'Payer {{amount}} € maintenant',
  },
  payment_received: {
    subject: 'Paiement reçu - Devis {{reference}}',
    bodyHtml: `Bonjour {{clientName}},

Nous vous remercions pour votre règlement.

<strong>Montant reçu :</strong> {{amount}} €<br>
Référence : {{reference}}

Nous allons nous occuper d'aller chercher votre/vos lot(s) le plus rapidement possible. Vous serez tenu au courant par email de l'avancée de votre colis.`,
    signature: 'Cordialement,<br><strong>{{mbeName}}</strong>',
    bannerColor: '#2563eb',
    buttonColor: '#2563eb',
    bannerTitle: '✅ Paiement reçu',
  },
  awaiting_collection: {
    subject: 'Demande de collecte - Devis {{reference}}',
    bodyHtml: `Bonjour {{clientName}},

Nous avons bien fait la demande auprès de la salle de vente pour aller récupérer votre lot.

Référence : {{reference}}

Vous serez tenu au courant par email si votre lot pourra être récupéré auprès de la salle des ventes.`,
    signature: 'Cordialement,<br><strong>{{mbeName}}</strong>',
    bannerColor: '#2563eb',
    buttonColor: null,
    bannerTitle: '📦 Demande de collecte',
  },
  collected: {
    subject: 'Lot collecté - Devis {{reference}}',
    bodyHtml: `Bonjour {{clientName}},

Bonne nouvelle : votre lot a bien été récupéré auprès de la salle des ventes.

Référence : {{reference}}

Nous allons nous occuper de l'emballer le plus rapidement possible. Vous serez tenu au courant de son expédition par email.`,
    signature: 'Cordialement,<br><strong>{{mbeName}}</strong>',
    bannerColor: '#2563eb',
    buttonColor: null,
    bannerTitle: '✅ Lot collecté',
  },
  awaiting_shipment: {
    subject: 'Colis prêt - Devis {{reference}}',
    bodyHtml: `Bonjour {{clientName}},

Votre colis est prêt et sera envoyé le plus rapidement possible.

Référence : {{reference}}

Vous serez tenu au courant de l'expédition par email.`,
    signature: 'Cordialement,<br><strong>{{mbeName}}</strong>',
    bannerColor: '#2563eb',
    buttonColor: null,
    bannerTitle: '📦 Colis prêt',
  },
  shipped: {
    subject: 'Colis expédié - Devis {{reference}}',
    bodyHtml: `Bonjour {{clientName}},

Votre colis a été expédié.

Référence : {{reference}}
{{#tracking}}<strong>Suivi :</strong> {{carrier}} - {{trackingNumber}}{{/tracking}}

Nous vous remercions d'avoir choisi de travailler avec <strong>{{mbeName}}</strong>.`,
    signature: 'Cordialement,<br><strong>{{mbeName}}</strong>',
    bannerColor: '#2563eb',
    buttonColor: null,
    bannerTitle: '📦 Colis expédié',
  },
};

/**
 * Remplace les placeholders dans une chaîne (format {{key}} et {key})
 */
export function replacePlaceholdersExtended(str, values) {
  if (!str) return '';
  let out = str;
  for (const [key, val] of Object.entries(values)) {
    const v = val != null && val !== '' ? String(val) : '';
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), v);
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), v);
  }
  return out;
}

/**
 * Récupère les templates pour un compte (personnalisés fusionnés avec défauts)
 */
export function getTemplatesExtendedForAccount(customTemplates) {
  const result = {};
  for (const type of EMAIL_TYPES_EXTENDED) {
    const custom = customTemplates?.[type];
    const def = DEFAULT_TEMPLATES_EXTENDED[type];
    result[type] = {
      subject: custom?.subject ?? def?.subject ?? '',
      bodyHtml: custom?.bodyHtml ?? def?.bodyHtml ?? '',
      signature: custom?.signature ?? def?.signature ?? '',
      bannerColor: custom?.bannerColor ?? def?.bannerColor ?? '#2563eb',
      buttonColor: custom?.buttonColor ?? def?.buttonColor ?? '#2563eb',
      bannerTitle: custom?.bannerTitle ?? def?.bannerTitle ?? '',
      buttonLabel: custom?.buttonLabel ?? def?.buttonLabel ?? '',
      fontFamily: custom?.fontFamily ?? 'Arial, sans-serif',
      fontSize: custom?.fontSize ?? 14,
    };
  }
  return result;
}
