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

/** Sections par défaut pour le template devis (Option B - édition structurée, add/remove possible) */
export const DEFAULT_QUOTE_SEND_SECTIONS = [
  { id: 'intro', title: '', content: 'Bonjour,\n\nSuite à votre demande, nous avons le plaisir de vous proposer notre devis pour la Collecte, l\'Emballage et l\'Expédition de vos lot(s) du bordereau n° {{bordereauNum}}, acquis à {{nomSalleVentes}}.' },
  { id: 's1', title: '1 – Détail du devis', content: 'Retrait des lots + Emballage sur mesure (fournitures d\'emballage / carton + main-d\'œuvre) : {{prixEmballage}} €\nTransport + Gestion de dossier : {{prixTransport}} €\nAssurance (optionnelle) : {{prixAssurance}}\n\nLa couverture d\'expédition couvre la valeur d\'adjudication (hors frais de la salle des ventes) des lots en cas de perte, vol ou dégradation.\n\nPour les envois de tableaux, l\'assurance ne prend pas en compte la détérioration du cadre et/ou de la vitre durant le transport.' },
  { id: 's2', title: 'Total et validité', content: 'Total : {{prixTotal}} € TTC\n\nOffre valable 15 jours à compter de ce jour. Ce devis est exprimé en TTC si l\'expédition a lieu en Europe et H.T. pour des expéditions hors zone Euro.' },
  { id: 's3', title: 'Avertissement chiffrage', content: '⚠ Le chiffrage est approximatif, réalisé avec la description du bordereau, sans avoir les objets sous les yeux.\n\nSi dimensions/poids réels sont différents, un ajustement pourra être appliqué (nous vous préviendrons avant).' },
  { id: 's4', title: '2 – Paiement (acceptation du devis)', content: 'Le règlement se fait par carte bancaire via notre lien sécurisé :\n\n👉 {{lienPaiementSecurise}}\n\nEn validant ce devis et en procédant au paiement, vous reconnaissez avoir pris connaissance et accepté nos conditions générales ainsi que celles de nos transporteurs : https://linktr.ee/mbe026' },
  { id: 's5', title: '3 – Collecte – Emballage – Expédition', content: 'D\'une manière générale, nous collectons les lots 1 fois par semaine (sauf exception en fonction des disponibilités et du planning des salles des ventes). Une fois collectés, nous préparons les emballages sur mesure des lots pour l\'expédition des colis, dont vous êtes averti personnellement, par e-mail, par le transporteur avec le numéro de suivi.\n\n• Délais : Emballage + expédition : habituellement sous une semaine\n• Livraison en France métropolitaine : 48 h en moyenne (non garanti).\n\nMode EXPRESS possible sur simple demande (engendre une modification du devis).' },
  { id: 's6', title: '4 – Livraison', content: 'Votre colis sera expédié à l\'adresse suivante :\n\n{{adresseDestinataire}}\n\nSi vous souhaitez une livraison en point relais ou à une autre adresse que celle de votre bordereau, merci de nous l\'indiquer par retour de cet e-mail uniquement.\n\n⚠ Après envoi du colis, tout changement d\'adresse sera facturé 15 € TTC.\n\nEn cas de problème à la livraison, merci de :\n• prendre plusieurs photos du colis et de l\'emballage,\n• garder tous les matériaux d\'emballage,\n• nous prévenir immédiatement (sans dépasser les délais du transporteur).' },
  { id: 's7', title: '5 – CGV – Responsabilités – Informations utiles', content: 'La responsabilité de MBE ne peut être engagée si le transporteur refuse l\'indemnisation en raison de la nature, de la valeur ou de l\'emballage.\n\nLien vers nos conditions générales ainsi que celles de nos transporteurs : https://linktr.ee/mbe026' },
  { id: 's8', title: '6 – Facture', content: 'L\'envoi d\'une facture n\'est pas automatique.\n\n👉 Merci de préciser dans votre réponse si vous souhaitez une facture et, le cas échéant, d\'indiquer les coordonnées de votre société.' },
  { id: 'closing', title: '', content: 'Nous restons à votre disposition pour toute question et vous remercions de votre confiance.' },
];

/** Sections par défaut pour confirmation de paiement */
export const DEFAULT_PAYMENT_RECEIVED_SECTIONS = [
  { id: 'intro', title: '', content: 'Bonjour,\n\nNous vous confirmons que le paiement de votre devis a bien été reçu, et nous vous remercions sincèrement de votre confiance. Votre dossier est désormais complet.' },
  { id: 's1', title: '1 – Retrait des lots', content: 'Par retour, je vous confirme que votre bordereau sera bien présenté à l\'étude pour l\'enlèvement du ou des lots lors de notre prochain passage.\n\nNous mettons tout en œuvre pour réaliser en moyenne une collecte par semaine. Ceci étant rendu possible selon les disponibilités de l\'Hôtel des Ventes.\n\nVous serez averti(e) par email dès que la collecte aura été effectuée.' },
  { id: 's2', title: '2 – Emballage & expédition des lots', content: 'Nous recevons de nombreuses demandes à chaque vente, et nous vous remercions pour votre confiance.\n\nChaque lot est emballé soigneusement et individuellement, dans l\'ordre d\'arrivée des dossiers, de manière à garantir une protection optimale, un traitement équitable pour tous, des délais d\'expédition généralement sous une semaine après collecte.\n\nDès l\'expédition, vous recevrez un email contenant votre numéro de suivi.\n\nEn France métropolitaine, les délais de livraison sont en moyenne de 48 heures (non garantis).\n\n👉 Si vous souhaitez une solution d\'envoi et traitement Express, merci de nous contacter pour valider la faisabilité et vous établir l\'ajustement du devis en conséquence.' },
  { id: 's3', title: '3 – À réception de votre colis', content: 'Le numéro de suivi qui vous est communiqué par e-mail vous permet un suivi précis de votre colis. Vous pourrez ainsi vous organiser pour la livraison.\n\nVous devez contrôler la marchandise en présence du livreur avant de signer l\'acceptation du colis.\n\n• N\'acceptez jamais de déposer votre colis chez un voisin, devant une porte, par-dessus votre clôture, dans la boîte aux lettres.\n• La mention " sous réserve de déballage " ne vaut rien sur le bon de livraison du livreur.\n• Si vous constatez des avaries et que vous acceptez le colis, alors vous devez rédiger clairement les détails du problème constaté.\n\nSi vous rencontrez une avarie de livraison, et sans respect de ces consignes ainsi que celles présentées dans les CGV des transporteurs partenaires, nous ne pouvons pas demander réparation au titre de la responsabilité du transporteur ou de l\'assurance souscrite.' },
  { id: 's4', title: '4 – Votre facture acquittée', content: 'Si vous avez demandé une facture, nous vous l\'enverrons une fois que votre colis aura été expédié et votre livraison aura été confirmée comme reçue.\n\nLes factures sont éditées deux fois par mois de manière groupée.' },
  { id: 'closing', title: '', content: 'Nous restons à votre disposition pour toute question et vous remercions encore de votre confiance.' },
];

/** Types de templates utilisant l\'éditeur par sections (add/remove) */
export const SECTION_BASED_TEMPLATES = ['quote_send', 'payment_received'];

/** Valeurs par défaut - templates étendus */
export const DEFAULT_TEMPLATES_EXTENDED = {
  quote_send: {
    subject: 'Votre devis de transport - {{reference}}',
    bodyHtml: DEFAULT_QUOTE_SEND_HTML,
    bodySections: DEFAULT_QUOTE_SEND_SECTIONS,
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
    subject: '{{mbeName}} – Confirmation de paiement - Dossier complet',
    bodyHtml: `Bonjour {{clientName}}, Nous vous remercions pour votre règlement. Montant reçu : {{amount}} €. Référence : {{reference}}.`,
    bodySections: DEFAULT_PAYMENT_RECEIVED_SECTIONS,
    signature: 'Bien à vous,',
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
 * Échappe le HTML pour affichage sécurisé
 */
function escapeHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Construit le HTML du corps depuis les sections (Option B)
 * Chaque section : title (optionnel) + content (texte avec \n, placeholders)
 * Lignes commençant par • ou - deviennent des <li>, les autres des <p>
 */
export function buildBodyHtmlFromSections(sections, values) {
  if (!sections || !Array.isArray(sections) || sections.length === 0) return '';
  const out = [];
  for (const s of sections) {
    const title = replacePlaceholdersExtended(String(s.title || ''), values);
    let content = replacePlaceholdersExtended(String(s.content || ''), values);
    content = escapeHtml(content);
    const lines = content.split('\n');
    let html = '';
    let inList = false;
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('• ') || t.startsWith('- ')) {
        if (!inList) {
          html += '<ul style="margin:0 0 12px 1.5em;padding:0;">';
          inList = true;
        }
        html += `<li style="margin-bottom:4px;line-height:1.6;">${t.slice(2)}</li>`;
      } else {
        if (inList) {
          html += '</ul>';
          inList = false;
        }
        if (t) html += `<p style="margin:0 0 8px 0;line-height:1.6;">${t}</p>`;
      }
    }
    if (inList) html += '</ul>';
    const marginBottom = html ? '24px' : '0';
    const titleHtml = title
      ? `<p style="margin:0 0 12px 0;line-height:1.6;"><strong>${escapeHtml(title)}</strong></p>`
      : '';
    out.push(`<div style="margin-bottom:${marginBottom}">${titleHtml}${html}</div>`);
  }
  return out.join('');
}

/**
 * Construit le HTML complet d'un email (bandeau + corps + signature).
 * Utilisé par quote-automatic-emails et ai-proxy.
 */
export function buildEmailHtmlFromTemplate(template, bodyHtml, signatureHtml, values = {}) {
  const bannerColor = template?.bannerColor || '#2563eb';
  const bannerTitle = replacePlaceholdersExtended(template?.bannerTitle || '', values);
  const bannerLogoUrl = template?.bannerLogoUrl || '';
  const fontFamily = template?.fontFamily || 'Arial, sans-serif';
  const fontSize = template?.fontSize ?? 14;

  const logoHtml = bannerLogoUrl
    ? `<img src="${String(bannerLogoUrl).replace(/"/g, '&quot;')}" alt="Logo" style="max-height:60px;max-width:200px;display:block;margin:0 auto 12px auto;" />`
    : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>body{font-family:${fontFamily};font-size:${fontSize}px;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;}</style></head>
<body>
  <div style="background:${bannerColor};color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
    ${logoHtml}
    <h1 style="margin:0;">${bannerTitle}</h1>
  </div>
  <div style="background:#f9fafb;padding:30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
    <div style="margin-bottom:20px;">${bodyHtml}</div>
    <p style="margin-top:30px;">${signatureHtml}</p>
  </div>
</body>
</html>`.trim();
}

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
    const defSections = def?.bodySections;
    const customSections = custom?.bodySections;
    result[type] = {
      subject: custom?.subject ?? def?.subject ?? '',
      bodyHtml: custom?.bodyHtml ?? def?.bodyHtml ?? '',
      bodySections: Array.isArray(customSections) ? customSections : (Array.isArray(defSections) ? defSections : null),
      signature: custom?.signature ?? def?.signature ?? '',
      bannerColor: custom?.bannerColor ?? def?.bannerColor ?? '#2563eb',
      buttonColor: custom?.buttonColor ?? def?.buttonColor ?? '#2563eb',
      bannerTitle: custom?.bannerTitle ?? def?.bannerTitle ?? '',
      bannerLogoUrl: custom?.bannerLogoUrl ?? def?.bannerLogoUrl ?? '',
      buttonLabel: custom?.buttonLabel ?? def?.buttonLabel ?? '',
      fontFamily: custom?.fontFamily ?? 'Arial, sans-serif',
      fontSize: custom?.fontSize ?? 14,
    };
  }
  return result;
}
