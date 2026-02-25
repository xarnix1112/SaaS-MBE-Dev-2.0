/**
 * Emails automatiques envoyés au client selon les étapes du devis.
 * Supporte personnalisation (sujet, signature, ton) pour plan Ultra via saasAccount.emailTemplates.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { getTemplatesForAccount } from './email-templates.js';

/**
 * Charge les templates personnalisés pour un saasAccount
 */
async function loadTemplates(firestore, saasAccountId) {
  if (!firestore || !saasAccountId) return null;
  try {
    const doc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
    return doc.exists ? doc.data().emailTemplates : null;
  } catch {
    return null;
  }
}

/**
 * Remplace les placeholders dans une chaîne
 */
function replacePlaceholders(str, { reference, clientName, mbeName, amount }) {
  if (!str) return '';
  return str
    .replace(/{reference}/g, reference || '')
    .replace(/{clientName}/g, clientName || '')
    .replace(/{mbeName}/g, mbeName || '')
    .replace(/{amount}/g, amount != null ? `${Number(amount).toFixed(2)}` : '');
}

/**
 * Contenu du corps (hors signature) par type et ton
 */
function getBodyContent(type, tone, quote, opts = {}) {
  const mbeName = quote._saasCommercialName || 'votre MBE';
  const clientName = quote?.client?.name || 'Client';
  const reference = quote?.reference || '';
  const amount = opts.amount;
  const isPrincipal = opts.isPrincipal;
  const trackingNumber = opts.trackingNumber;
  const carrier = opts.carrier;

  const bodyStyle = 'font-family: sans-serif; line-height: 1.6; color: #333;';

  const blocks = {
    payment_received: {
      formel: () => {
        const principalP = isPrincipal
          ? '<p>Nous allons nous occuper d\'aller chercher votre/vos lot(s) le plus rapidement possible. Vous serez tenu au courant par email de l\'avancée de votre colis.</p>'
          : '';
        return `<p>Bonjour ${clientName},</p>
  <p>Nous vous remercions pour votre règlement.</p>
  <p><strong>Montant reçu :</strong> ${amount != null ? `${Number(amount).toFixed(2)} €` : '—'}</p>
  <p>Référence : ${reference}</p>${principalP}`;
      },
      amical: () => {
        const principalP = isPrincipal
          ? '<p>On s\'occupe d\'aller chercher votre/vos lot(s) au plus vite ! Vous recevrez un mail pour suivre l\'avancement.</p>'
          : '';
        return `<p>Bonjour ${clientName},</p>
  <p>Merci pour votre règlement !</p>
  <p><strong>Montant reçu :</strong> ${amount != null ? `${Number(amount).toFixed(2)} €` : '—'}</p>
  <p>Référence : ${reference}</p>${principalP}`;
      },
    },
    awaiting_collection: {
      formel: () => `<p>Bonjour ${clientName},</p>
  <p>Nous avons bien fait la demande auprès de la salle de vente pour aller récupérer votre lot.</p>
  <p>Référence : ${reference}</p>
  <p>Vous serez tenu au courant par email si votre lot pourra être récupéré auprès de la salle des ventes.</p>`,
      amical: () => `<p>Bonjour ${clientName},</p>
  <p>Bonne nouvelle : nous avons fait la demande à la salle de vente pour récupérer votre lot.</p>
  <p>Référence : ${reference}</p>
  <p>On vous tiendra au courant par mail dès qu'on aura la confirmation.</p>`,
    },
    collected: {
      formel: () => `<p>Bonjour ${clientName},</p>
  <p>Bonne nouvelle : votre lot a bien été récupéré auprès de la salle des ventes.</p>
  <p>Référence : ${reference}</p>
  <p>Nous allons nous occuper de l'emballer le plus rapidement possible. Vous serez tenu au courant de son expédition par email.</p>`,
      amical: () => `<p>Bonjour ${clientName},</p>
  <p>Votre lot a bien été récupéré !</p>
  <p>Référence : ${reference}</p>
  <p>On l'emballe au plus vite et on vous préviendra par mail pour l'expédition.</p>`,
    },
    awaiting_shipment: {
      formel: () => `<p>Bonjour ${clientName},</p>
  <p>Votre colis est prêt et sera envoyé le plus rapidement possible.</p>
  <p>Référence : ${reference}</p>
  <p>Vous serez tenu au courant de l'expédition par email.</p>`,
      amical: () => `<p>Bonjour ${clientName},</p>
  <p>Votre colis est prêt ! Il partira au plus vite.</p>
  <p>Référence : ${reference}</p>
  <p>Vous recevrez un mail pour le suivi d'expédition.</p>`,
    },
    shipped: {
      formel: () => {
        const trackingP = trackingNumber && carrier
          ? `<p><strong>Suivi :</strong> ${carrier} - ${trackingNumber}</p>` : '';
        return `<p>Bonjour ${clientName},</p>
  <p>Votre colis a été expédié.</p>
  <p>Référence : ${reference}</p>
  ${trackingP}
  <p>Nous vous remercions d'avoir choisi de travailler avec <strong>${mbeName}</strong>.</p>
  <p>Si vous êtes satisfait de notre service, n'hésitez pas à nous laisser un avis sur Google.</p>`;
      },
      amical: () => {
        const trackingP = trackingNumber && carrier
          ? `<p><strong>Suivi :</strong> ${carrier} - ${trackingNumber}</p>` : '';
        return `<p>Bonjour ${clientName},</p>
  <p>Votre colis est parti !</p>
  <p>Référence : ${reference}</p>
  ${trackingP}
  <p>Merci d'avoir fait confiance à <strong>${mbeName}</strong>.</p>
  <p>Content de notre service ? Laissez-nous un avis sur Google !</p>`;
      },
    },
  };
  const typeBlock = blocks[type];
  if (!typeBlock) return '';
  const fn = typeBlock[tone] || typeBlock.formel;
  return fn();
}

/**
 * Retourne le contenu du corps (HTML) pour un aperçu avec données simulées
 */
export function getBodyContentPreview(type, tone, { clientName, mbeName, reference, amount, trackingNumber, carrier } = {}) {
  const sampleQuote = {
    _saasCommercialName: mbeName || 'Mon MBE',
    client: { name: clientName || 'Jean Dupont' },
    reference: reference || 'DEV-2024-00123',
    delivery: {},
  };
  const opts = type === 'payment_received' ? { amount: amount ? parseFloat(amount) : 125.50, isPrincipal: true } : {};
  if (type === 'shipped') {
    opts.trackingNumber = trackingNumber || '9Z1234567890123';
    opts.carrier = carrier || 'Colissimo';
  }
  return getBodyContent(type, tone || 'formel', sampleQuote, opts);
}

/**
 * Envoie un email automatique (helper interne)
 */
async function sendAutoEmail(firestore, sendEmailFn, quote, subject, htmlContent, textContent) {
  const clientEmail = quote?.client?.email || quote?.delivery?.contact?.email;
  if (!clientEmail || !clientEmail.trim()) {
    console.warn('[Auto-Email] Pas d\'email client pour le devis:', quote?.id);
    return;
  }
  try {
    const saasAccountId = quote.saasAccountId;
    const result = await sendEmailFn({
      to: clientEmail,
      subject,
      html: htmlContent,
      text: textContent || htmlContent.replace(/<[^>]+>/g, ''),
      saasAccountId,
    });
    if (firestore && quote.id) {
      await firestore.collection('emailMessages').add({
        devisId: quote.id,
        clientEmail,
        direction: 'OUT',
        source: result?.source || 'RESEND',
        subject,
        bodyText: textContent || '',
        bodyHtml: htmlContent,
        messageId: result?.id || result?.messageId,
        createdAt: Timestamp.now(),
        autoEmail: true,
        saasAccountId: quote.saasAccountId || null,
      });
    }
    console.log('[Auto-Email] ✅ Envoyé:', subject, '→', clientEmail);
  } catch (err) {
    console.error('[Auto-Email] ❌ Erreur:', subject, err.message);
  }
}

/**
 * Construit le sujet, corps et signature à partir des templates (personnalisés ou défauts)
 */
async function buildEmailContent(firestore, quote, type, opts) {
  const mbeName = quote._saasCommercialName || 'votre MBE';
  const clientName = quote?.client?.name || 'Client';
  const reference = quote?.reference || '';
  const amount = opts?.amount;
  const ctx = { reference, clientName, mbeName, amount: amount != null ? amount : undefined };

  const customTemplates = await loadTemplates(firestore, quote.saasAccountId);
  const templates = getTemplatesForAccount(customTemplates);
  const t = templates[type] || {};
  const subject = t.subject || '';
  const signature = t.signature || `Cordialement,<br><strong>${mbeName}</strong>`;
  const tone = t.tone || 'formel';

  const renderedSubject = replacePlaceholders(subject, ctx);
  const renderedSignature = replacePlaceholders(signature, ctx).replace(/\n/g, '<br>');
  const bodyContent = getBodyContent(type, tone, quote, opts);
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; line-height: 1.6; color: #333;">
  ${bodyContent}
  <p>${renderedSignature}</p>
</body>
</html>`.trim();

  return { subject: renderedSubject, html };
}

/**
 * 1. Paiement reçu
 */
export async function sendPaymentReceivedEmail(firestore, sendEmailFn, quote, { amount, isPrincipal }) {
  const { subject, html } = await buildEmailContent(firestore, quote, 'payment_received', { amount, isPrincipal });
  await sendAutoEmail(firestore, sendEmailFn, quote, subject, html);
}

/**
 * 2. En attente de collecte
 */
export async function sendAwaitingCollectionEmail(firestore, sendEmailFn, quote) {
  const { subject, html } = await buildEmailContent(firestore, quote, 'awaiting_collection', {});
  await sendAutoEmail(firestore, sendEmailFn, quote, subject, html);
}

/**
 * 3. Collecté
 */
export async function sendCollectedEmail(firestore, sendEmailFn, quote) {
  const { subject, html } = await buildEmailContent(firestore, quote, 'collected', {});
  await sendAutoEmail(firestore, sendEmailFn, quote, subject, html);
}

/**
 * 4. En attente d'envoi
 */
export async function sendAwaitingShipmentEmail(firestore, sendEmailFn, quote) {
  const { subject, html } = await buildEmailContent(firestore, quote, 'awaiting_shipment', {});
  await sendAutoEmail(firestore, sendEmailFn, quote, subject, html);
}

/**
 * 5. Expédié
 */
export async function sendShippedEmail(firestore, sendEmailFn, quote, { trackingNumber, carrier } = {}) {
  const { subject, html } = await buildEmailContent(firestore, quote, 'shipped', { trackingNumber, carrier });
  await sendAutoEmail(firestore, sendEmailFn, quote, subject, html);
}
