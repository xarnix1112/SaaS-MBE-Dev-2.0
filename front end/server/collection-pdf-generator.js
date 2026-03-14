/**
 * Génère un PDF liste de collecte pour le MBE.
 * Utilisé lors de l'envoi d'une demande de collecte à la salle des ventes.
 * Le PDF contient : n° bordereau, client, assurance, lots (n° lot, type d'objet).
 * Dimensions, poids et prix marteau sont exclus.
 */

import PDFDocument from 'pdfkit';
import { extractObjectTypeFromDescription } from './lib/object-type-extractor.js';

/**
 * @param {Array} quotesFull - Devis complets chargés depuis Firestore
 * @param {Object} options - { auctionHouse, plannedDate, plannedTime }
 * @returns {Promise<Buffer>}
 */
export async function generateCollectionPdf(quotesFull, options = {}) {
  const { auctionHouse = '', plannedDate = '', plannedTime = '' } = options;

  // Phase 1: Construire les blocs (avec extraction async du type d'objet par lot)
  const quoteBlocks = [];
  for (const quote of quotesFull) {
    const q = typeof quote?.data === 'function' ? quote.data() : quote;
    const clientName = q.client?.name || q.clientName || 'Client non renseigné';
    const bordereauNum = q.auctionSheet?.bordereauNumber || q.bordereauNumber || '—';
    const hasInsurance = !!q.options?.insurance;
    const lots = q.auctionSheet?.lots || [];
    const hasMultipleLots = lots.length > 0;
    const singleLot = q.lot;

    let totalValue = 0;
    if (hasMultipleLots) {
      totalValue = lots.reduce((s, l) => s + (l.value ?? l.prix_marteau ?? l.total ?? 0), 0);
    } else if (singleLot?.value != null) {
      totalValue = singleLot.value;
    }

    const rows = [];
    if (hasMultipleLots) {
      for (const lot of lots) {
        const lotNum = lot.lotNumber ?? lot.numero_lot ?? '—';
        const rawDesc = (lot.description || '').trim();
        const desc = await extractObjectTypeFromDescription(rawDesc || 'Description non disponible');
        rows.push([lotNum, desc]);
      }
    } else if (singleLot) {
      const lotNum = singleLot.number || '—';
      const rawDesc = (singleLot.description || '').trim();
      const desc = await extractObjectTypeFromDescription(rawDesc || 'Description non disponible');
      rows.push([lotNum, desc]);
    }

    quoteBlocks.push({
      q,
      clientName,
      bordereauNum,
      hasInsurance,
      totalValue,
      customMsg: q.quoteSentCustomMessage && String(q.quoteSentCustomMessage).trim(),
      rows,
    });
  }

  // Phase 2: Générer le PDF
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).font('Helvetica-Bold').text('Liste de collecte', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica');
      if (auctionHouse) {
        doc.text(`Salle des ventes : ${auctionHouse}`);
      }
      const dateStr = plannedDate ? new Date(plannedDate).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
      doc.text(`Date : ${dateStr}${plannedTime ? ` à ${plannedTime}` : ''}`);
      doc.moveDown(1);

      for (const block of quoteBlocks) {
        const { clientName, bordereauNum, hasInsurance, totalValue, customMsg, rows } = block;

        doc.fontSize(12).font('Helvetica-Bold');
        doc.text(`Bordereau n° ${bordereauNum}`);
        doc.font('Helvetica').fontSize(10);
        doc.text(`Client : ${clientName}`);
        doc.text(`Assurance : ${hasInsurance ? 'Oui' : 'Non'}`);
        if (hasInsurance && totalValue > 0) {
          doc.text(`Valeur totale : ${totalValue.toFixed(2)} €`);
        }
        if (customMsg) {
          doc.moveDown(0.3);
          doc.font('Helvetica-Oblique').fontSize(9);
          doc.text(`Note : ${customMsg}`, { width: 500 });
          doc.font('Helvetica');
        }
        doc.moveDown(0.5);

        if (rows.length > 0) {
          const colWidths = [50, 420];
          const startY = doc.y;

          doc.font('Helvetica-Bold').fontSize(9);
          let x = 50;
          ['N° Lot', 'Type d\'objet'].forEach((h, i) => {
            doc.text(h, x, startY, { width: colWidths[i] });
            x += colWidths[i];
          });
          doc.moveDown(0.3);
          doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
          doc.moveDown(0.2);

          doc.font('Helvetica').fontSize(9);
          for (const row of rows) {
            const rowY = doc.y;
            x = 50;
            const maxChars = [10, 65];
            row.forEach((cell, i) => {
              const s = String(cell);
              doc.text(s.length > maxChars[i] ? s.substring(0, maxChars[i] - 2) + '..' : s, x, rowY, { width: colWidths[i] });
              x += colWidths[i];
            });
            doc.y = rowY + 14;
          }
          doc.moveDown(0.8);
        }

        doc.moveDown(0.5);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
