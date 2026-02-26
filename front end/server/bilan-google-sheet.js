/**
 * Bilan devis MBE - Export vers Google Sheets
 * Crée un spreadsheet dédié avec 3 feuilles : En cours, Terminés, Refusés
 * Synchronisation en temps réel à chaque mise à jour de devis
 */

import { google } from 'googleapis';
import { Timestamp } from 'firebase-admin/firestore';

const SHEET_NAMES = {
  EN_COURS: 'En cours',
  TERMINES: 'Terminés',
  REFUSES: 'Refusés',
};

const HEADERS = [
  'Référence',
  'Client',
  'SDV',
  'Montant total',
  'Date création',
  'Date envoi devis',
  'Date paiement',
  'Date expédition',
  'Statut',
  'Payé',
  'Moyen de paiement',
];

const STATUS_LABELS = {
  new: 'Nouveau',
  to_verify: 'À vérifier',
  verified: 'Vérifié',
  payment_link_sent: 'Lien envoyé',
  calculated: 'Calculé',
  bordereau_linked: 'Bordereau lié',
  waiting_for_slip: 'En attente bordereau',
  awaiting_payment: 'Attente paiement',
  paid: 'Payé',
  awaiting_collection: 'Attente collecte',
  collected: 'Collecté',
  preparation: 'Préparation',
  awaiting_shipment: 'Attente envoi',
  shipped: 'Expédié',
  completed: 'Terminé',
  client_refused: 'Refusé/Abandonné',
};

function getSheetNameForQuote(quote) {
  if (quote.clientRefusalStatus === 'client_refused') {
    return SHEET_NAMES.REFUSES;
  }
  if (['shipped', 'completed'].includes(quote.status)) {
    return SHEET_NAMES.TERMINES;
  }
  return SHEET_NAMES.EN_COURS;
}

function toLocalDateString(val) {
  if (!val) return '';
  const d = val?.toDate ? val.toDate() : new Date(val);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const MANUAL_PAYMENT_LABELS = {
  virement: 'Virement',
  cb_telephone: 'CB téléphone',
};

/**
 * Construit une ligne de données pour le Sheet à partir d'un devis
 */
export function buildQuoteRow(quote, paymentInfo = null) {
  const clientName = quote.client?.name || quote.clientName || '';
  const clientEmail = quote.client?.email || quote.clientEmail || '';
  const client = [clientName, clientEmail].filter(Boolean).join(' - ') || '-';
  const sdv = quote.lot?.auctionHouse || quote.auctionSheet?.auctionHouse || '-';
  const totalAmount = quote.totalAmount ?? 0;
  const createdAt = toLocalDateString(quote.createdAt);
  const quoteSentAt = toLocalDateString(quote.quoteSentAt);

  // Date paiement et moyen : priorité au paiement manuel, sinon Stripe/Paytweak
  let paidAt = '';
  let paymentMethod = '';
  if (quote.manualPaymentMethod && quote.manualPaymentDate) {
    paidAt = toLocalDateString(quote.manualPaymentDate);
    paymentMethod = MANUAL_PAYMENT_LABELS[quote.manualPaymentMethod] || quote.manualPaymentMethod;
  } else if (paymentInfo) {
    paidAt = paymentInfo.paidAt ? toLocalDateString(paymentInfo.paidAt) : '';
    paymentMethod = paymentInfo.paymentMethod === 'Paytweak' || paymentInfo.paymentMethod === 'Stripe'
      ? 'Lien de paiement'
      : (paymentInfo.paymentMethod || '');
  }

  const shippedAt = quote.status === 'shipped' || quote.status === 'completed'
    ? toLocalDateString(quote.updatedAt) // Approximation si pas de champ dédié
    : '';
  const status = quote.clientRefusalStatus === 'client_refused'
    ? STATUS_LABELS.client_refused
    : (STATUS_LABELS[quote.status] || quote.status || '');
  const isPaid = (quote.paymentStatus === 'paid' || quote.paidAmount > 0) ? 'Oui' : 'Non';

  return [
    quote.reference || '',
    client,
    sdv,
    totalAmount,
    createdAt,
    quoteSentAt,
    paidAt,
    shippedAt,
    status,
    isPaid,
    paymentMethod,
  ];
}

/**
 * Crée le spreadsheet "Bilan devis MBE" avec 3 feuilles
 */
export async function createBilanSpreadsheet(auth, saasAccountId) {
  const sheets = google.sheets({ version: 'v4', auth });

  // Créer le spreadsheet avec 3 feuilles
  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: 'Bilan devis MBE' },
      sheets: [
        { properties: { title: SHEET_NAMES.EN_COURS } },
        { properties: { title: SHEET_NAMES.TERMINES } },
        { properties: { title: SHEET_NAMES.REFUSES } },
      ],
    },
  });

  const spreadsheetId = spreadsheet.data.spreadsheetId;
  const spreadsheetUrl = spreadsheet.data.spreadsheetUrl;

  // Ajouter les en-têtes à chaque feuille
  for (const sheetName of [SHEET_NAMES.EN_COURS, SHEET_NAMES.TERMINES, SHEET_NAMES.REFUSES]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetName}'!A1:K1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }

  return { spreadsheetId, spreadsheetUrl };
}

/**
 * Récupère les infos de paiement pour un devis (date, moyen)
 */
export async function getPaymentInfoForQuote(firestore, quoteId) {
  if (!firestore) return null;
  const paiementsSnap = await firestore
    .collection('paiements')
    .where('devisId', '==', quoteId)
    .get();

  const paid = paiementsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.status === 'PAID');
  if (paid.length === 0) return null;

  // Prendre le premier paiement principal payé (ou le premier payé)
  const principal = paid.find((p) => p.type === 'PRINCIPAL') || paid[0];
  const p = principal;
  const paidAt = p.paidAt || p.updatedAt || p.createdAt;
  let paymentMethod = p.paymentProvider === 'paytweak' ? 'Paytweak' : 'Stripe';
  if (p.paymentMethod) {
    const m = String(p.paymentMethod).toLowerCase();
    if (m.includes('virement')) paymentMethod = 'Virement';
    else if (m.includes('carte') || m.includes('téléphone') || m.includes('telephone')) paymentMethod = 'Carte téléphone';
    else if (m.includes('paytweak')) paymentMethod = 'Paytweak';
    else if (m.includes('stripe')) paymentMethod = 'Stripe';
  }
  return { paidAt, paymentMethod };
}

/**
 * Trouve la ligne d'un devis dans une feuille par référence
 */
async function findQuoteRowInSheet(sheets, spreadsheetId, sheetName, quoteRef) {
  const range = `${sheetName}!A2:A`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  const rows = res.data.values || [];
  const idx = rows.findIndex((r) => r[0] === quoteRef);
  return idx >= 0 ? idx + 2 : -1; // +2 car 1-indexed et header ligne 1
}

/**
 * Met à jour ou ajoute un devis dans le bon onglet du Bilan
 * Gère le déplacement entre feuilles si le statut change
 */
export async function syncQuoteToBilanSheet(firestore, auth, saasAccountId, quoteId) {
  if (!firestore || !auth || !saasAccountId) return;

  const saasDoc = await firestore.collection('saasAccounts').doc(saasAccountId).get();
  if (!saasDoc.exists) return;

  const bilanSheet = saasDoc.data().integrations?.bilanSheet;
  if (!bilanSheet?.spreadsheetId) return;

  const quoteDoc = await firestore.collection('quotes').doc(quoteId).get();
  if (!quoteDoc.exists) return;

  const quote = { id: quoteDoc.id, ...quoteDoc.data() };
  if (quote.saasAccountId && quote.saasAccountId !== saasAccountId) return;

  const paymentInfo = await getPaymentInfoForQuote(firestore, quoteId);
  const row = buildQuoteRow(quote, paymentInfo);
  const sheetName = getSheetNameForQuote(quote);
  const quoteRef = quote.reference || quote.id;

  const sheets = google.sheets({ version: 'v4', auth });

  // Vérifier si le devis existe déjà dans une feuille (pour le déplacer ou mettre à jour)
  for (const name of [SHEET_NAMES.EN_COURS, SHEET_NAMES.TERMINES, SHEET_NAMES.REFUSES]) {
    const existingRow = await findQuoteRowInSheet(sheets, bilanSheet.spreadsheetId, name, quoteRef);
    if (existingRow > 0) {
      if (name === sheetName) {
        // Mise à jour sur place
        await sheets.spreadsheets.values.update({
          spreadsheetId: bilanSheet.spreadsheetId,
          range: `${sheetName}!A${existingRow}:K${existingRow}`,
          valueInputOption: 'RAW',
          requestBody: { values: [row] },
        });
        return;
      }
      // Supprimer l'ancienne ligne (déplacer vers nouvelle feuille) via DeleteDimension
      const meta = await sheets.spreadsheets.get({
        spreadsheetId: bilanSheet.spreadsheetId,
        fields: 'sheets(properties(sheetId,title))',
      });
      const sheet = meta.data.sheets?.find((s) => s.properties?.title === name);
      const sheetId = sheet?.properties?.sheetId ?? 0;
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: bilanSheet.spreadsheetId,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: existingRow - 1,
                endIndex: existingRow,
              },
            },
          }],
        },
      });
      break;
    }
  }

  // Ajouter à la feuille cible
  const appendRange = `${sheetName}!A:K`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: bilanSheet.spreadsheetId,
    range: appendRange,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
}

/**
 * Exporte tous les devis existants vers le Bilan (appelé à la création)
 */
export async function exportAllQuotesToBilan(firestore, auth, saasAccountId) {
  if (!firestore || !auth || !saasAccountId) return;

  const quotesSnap = await firestore
    .collection('quotes')
    .where('saasAccountId', '==', saasAccountId)
    .get();

  for (const doc of quotesSnap.docs) {
    try {
      await syncQuoteToBilanSheet(firestore, auth, saasAccountId, doc.id);
    } catch (err) {
      console.error(`[Bilan] Erreur sync devis ${doc.id}:`, err.message);
    }
  }
}
