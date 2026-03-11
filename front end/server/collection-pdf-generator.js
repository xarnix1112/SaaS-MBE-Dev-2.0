/**
 * Génère un PDF liste de collecte pour le MBE.
 * Utilisé lors de l'envoi d'une demande de collecte à la salle des ventes.
 * Le PDF contient : n° bordereau, client, lots (n° lot, description, dimensions, poids, prix marteau),
 * assurance, valeur totale si assurance, note spécifique si envoyée avec le devis.
 */

import PDFDocument from 'pdfkit';

/**
 * @param {Array} quotesFull - Devis complets chargés depuis Firestore
 * @param {Object} options - { auctionHouse, plannedDate, plannedTime }
 * @returns {Promise<Buffer>}
 */
export async function generateCollectionPdf(quotesFull, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { auctionHouse = '', plannedDate = '', plannedTime = '' } = options;

      // En-tête
      doc.fontSize(18).font('Helvetica-Bold').text('Liste de collecte', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica');
      if (auctionHouse) {
        doc.text(`Salle des ventes : ${auctionHouse}`);
      }
      const dateStr = plannedDate ? new Date(plannedDate).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
      doc.text(`Date : ${dateStr}${plannedTime ? ` à ${plannedTime}` : ''}`);
      doc.moveDown(1);

      for (const quote of quotesFull) {
        const q = typeof quote?.data === 'function' ? quote.data() : quote;
        const clientName = q.client?.name || q.clientName || 'Client non renseigné';
        const bordereauNum = q.auctionSheet?.bordereauNumber || q.bordereauNumber || '—';
        const hasInsurance = !!q.options?.insurance;
        const lots = q.auctionSheet?.lots || [];
        const hasMultipleLots = lots.length > 0;
        const singleLot = q.lot;

        // Valeur totale (somme des prix marteau)
        let totalValue = 0;
        if (hasMultipleLots) {
          totalValue = lots.reduce((s, l) => s + (l.value ?? l.prix_marteau ?? l.total ?? 0), 0);
        } else if (singleLot?.value != null) {
          totalValue = singleLot.value;
        }

        // Bloc devis
        doc.fontSize(12).font('Helvetica-Bold');
        doc.text(`Bordereau n° ${bordereauNum}`);
        doc.font('Helvetica').fontSize(10);
        doc.text(`Client : ${clientName}`);
        doc.text(`Assurance : ${hasInsurance ? 'Oui' : 'Non'}`);
        if (hasInsurance && totalValue > 0) {
          doc.text(`Valeur totale : ${totalValue.toFixed(2)} €`);
        }
        const customMsg = q.quoteSentCustomMessage && String(q.quoteSentCustomMessage).trim();
        if (customMsg) {
          doc.moveDown(0.3);
          doc.font('Helvetica-Oblique').fontSize(9);
          doc.text(`Note : ${customMsg}`, { width: 500 });
          doc.font('Helvetica');
        }
        doc.moveDown(0.5);

        // Tableau des lots
        const rows = [];
        if (hasMultipleLots) {
          for (const lot of lots) {
            const dims = lot.estimatedDimensions || singleLot?.dimensions || singleLot?.realDimensions || {};
            const l = dims.length ?? 0;
            const w = dims.width ?? 0;
            const h = dims.height ?? 0;
            const weight = dims.weight ?? singleLot?.dimensions?.weight ?? 0;
            const dimensionsStr = (l && w && h) ? `${l}×${w}×${h} cm` : '—';
            const weightStr = weight ? `${weight} kg` : '—';
            const lotNum = lot.lotNumber ?? lot.numero_lot ?? '—';
            const desc = (lot.description || '').trim().substring(0, 60) || '—';
            const val = lot.value ?? lot.prix_marteau ?? lot.total ?? 0;
            rows.push([lotNum, desc, dimensionsStr, weightStr, val ? `${val.toFixed(2)} €` : '—']);
          }
        } else if (singleLot) {
          const dims = singleLot.realDimensions || singleLot.dimensions || {};
          const l = dims.length ?? 0;
          const w = dims.width ?? 0;
          const h = dims.height ?? 0;
          const weight = dims.weight ?? 0;
          const dimensionsStr = (l && w && h) ? `${l}×${w}×${h} cm` : '—';
          const weightStr = weight ? `${weight} kg` : '—';
          rows.push([
            singleLot.number || '—',
            (singleLot.description || '').substring(0, 60) || '—',
            dimensionsStr,
            weightStr,
            singleLot.value != null ? `${singleLot.value.toFixed(2)} €` : '—',
          ]);
        }

        if (rows.length > 0) {
          const colWidths = [50, 180, 80, 50, 60];
          const startY = doc.y;

          // En-tête tableau
          doc.font('Helvetica-Bold').fontSize(9);
          let x = 50;
          ['N° Lot', 'Description', 'Dimensions', 'Poids', 'Prix marteau'].forEach((h, i) => {
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
            const maxChars = [10, 40, 18, 10, 14];
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
