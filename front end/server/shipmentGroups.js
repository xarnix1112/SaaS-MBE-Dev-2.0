/**
 * Module backend pour la gestion des groupements d'expédition
 * Permet de regrouper plusieurs devis pour une expédition unique
 */

import { Timestamp } from 'firebase-admin/firestore';

// ============================================
// NORMALISATION D'ADRESSE
// ============================================

const ABBREVIATIONS = {
  'avenue': 'av',
  'boulevard': 'bd',
  'rue': 'r',
  'place': 'pl',
  'impasse': 'imp',
  'chemin': 'ch',
  'route': 'rte',
  'allée': 'all',
  'allée': 'all',
  'square': 'sq',
  'cours': 'crs',
  'quai': 'q',
  'passage': 'pass',
  'résidence': 'res',
  'residence': 'res',
  'lotissement': 'lot',
  'appartement': 'apt',
  'bâtiment': 'bat',
  'batiment': 'bat',
  'etage': 'et',
  'étage': 'et',
  'ème': 'e',
  'eme': 'e',
  'premier': '1er',
  'deuxieme': '2e',
  'deuxième': '2e',
  'troisieme': '3e',
  'troisième': '3e',
};

/**
 * Normalise une adresse pour comparaison
 */
function normalizeAddress(address) {
  if (!address) return '';
  
  let normalized = address.toLowerCase().trim();
  
  // Supprimer les accents
  normalized = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  // Remplacer les abréviations
  Object.entries(ABBREVIATIONS).forEach(([full, abbr]) => {
    const regex = new RegExp(`\\b${full}\\b`, 'g');
    normalized = normalized.replace(regex, abbr);
  });
  
  // Supprimer la ponctuation
  normalized = normalized.replace(/[.,;:'"]/g, '');
  
  // Normaliser les espaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

// ============================================
// DÉTECTION DE DEVIS GROUPABLES
// ============================================

/**
 * Trouve les devis groupables pour un devis donné
 * 
 * GET /api/devis/:id/groupable-quotes
 */
export async function handleGetGroupableQuotes(req, res, firestore) {
  try {
    const { id: devisId } = req.params;
    console.log(`[shipmentGroups] 🔍 Recherche devis groupables pour: ${devisId}`);
    
    // Récupérer le devis actuel
    const devisDoc = await firestore.collection('quotes').doc(devisId).get();
    
    if (!devisDoc.exists) {
      return res.status(404).json({ error: 'Devis non trouvé' });
    }
    
    const devis = { id: devisDoc.id, ...devisDoc.data() };
    
    // Vérifier qu'il a une adresse
    if (!devis.recipientAddress) {
      return res.json({ groupableQuotes: [], suggestion: null });
    }
    
    // Normaliser l'adresse du devis
    const normalizedAddress = normalizeAddress(devis.recipientAddress);
    
    console.log(`[shipmentGroups] 📍 Adresse normalisée: "${normalizedAddress}"`);
    
    // Récupérer saasAccountId (peut être dans plusieurs champs)
    const saasAccountId = devis.saasAccountId || devis.clientSaasId;
    
    // Récupérer l'email client (peut être dans plusieurs champs)
    const clientEmail = devis.client?.email || devis.clientEmail || devis.delivery?.contact?.email;
    
    // Vérifier que les champs requis ne sont pas undefined avant de faire la requête
    if (!saasAccountId || !clientEmail) {
      console.warn(`[shipmentGroups] ⚠️ Champs manquants pour la recherche: saasAccountId=${saasAccountId}, clientEmail=${clientEmail}`);
      return res.json({ groupableQuotes: [] });
    }
    
    // Chercher les devis avec la même adresse normalisée
    const quotesSnapshot = await firestore
      .collection('quotes')
      .where('saasAccountId', '==', saasAccountId)
      .get();
    
    const groupableQuotes = [];
    
    quotesSnapshot.forEach(doc => {
      const quote = { id: doc.id, ...doc.data() };
      
      // Ignorer le devis actuel
      if (quote.id === devisId) return;
      
      // Ignorer les devis déjà groupés
      if (quote.shipmentGroupId) return;
      
      // Ignorer les devis sans adresse
      if (!quote.recipientAddress) return;
      
      // Vérifier que l'email correspond (peut être dans plusieurs champs)
      const quoteClientEmail = quote.client?.email || quote.clientEmail || quote.delivery?.contact?.email;
      if (quoteClientEmail !== clientEmail) return;
      
      // Comparer les adresses normalisées
      const quoteNormalized = normalizeAddress(quote.recipientAddress);
      
      if (quoteNormalized === normalizedAddress) {
        groupableQuotes.push({
          id: quote.id,
          reference: quote.reference || 'N/A',
          clientName: quote.client?.name || quote.clientName || 'Client inconnu',
          clientEmail: quoteClientEmail,
          recipientAddress: quote.recipientAddress,
          recipientAddressNormalized: quoteNormalized,
          totalWeight: quote.totalWeight || 0,
          totalVolume: quote.totalVolume || 0,
          bordereauCount: quote.auctionSheetIds?.length || 0,
          lotCount: quote.lots?.length || 0,
          createdAt: quote.createdAt?.toDate ? quote.createdAt.toDate() : new Date(quote.createdAt),
        });
      }
    });
    
    console.log(`[shipmentGroups] ✅ ${groupableQuotes.length} devis groupables trouvés`);
    
    // Calculer une suggestion si des devis sont trouvés
    let suggestion = null;
    
    if (groupableQuotes.length > 0) {
      const totalWeight = groupableQuotes.reduce((sum, q) => sum + (q.totalWeight || 0), 0) + (devis.totalWeight || 0);
      const totalVolume = groupableQuotes.reduce((sum, q) => sum + (q.totalVolume || 0), 0) + (devis.totalVolume || 0);
      
      // Estimation simple des économies (à affiner avec vraie logique de pricing)
      const individualShippingCosts = (groupableQuotes.length + 1) * 15; // 15€ par devis
      const groupedShippingCost = Math.max(20, totalWeight * 2); // Estimation groupée
      const potentialSavings = Math.max(0, individualShippingCosts - groupedShippingCost);
      
      suggestion = {
        potentialSavings,
        quotes: [
          ...groupableQuotes,
          {
            id: devis.id,
            reference: devis.reference,
            clientName: devis.clientName,
            clientEmail: devis.clientEmail,
            recipientAddress: devis.recipientAddress,
            recipientAddressNormalized: normalizedAddress,
            totalWeight: devis.totalWeight || 0,
            totalVolume: devis.totalVolume || 0,
            bordereauCount: devis.auctionSheetIds?.length || 0,
            lotCount: devis.lots?.length || 0,
            createdAt: devis.createdAt?.toDate ? devis.createdAt.toDate() : new Date(devis.createdAt),
          }
        ],
        totalWeight,
        totalVolume,
        estimatedCartons: Math.ceil(totalVolume / 0.05), // 1 carton = 50L environ
        estimatedShippingCost: groupedShippingCost,
      };
    }
    
    return res.json({ groupableQuotes, suggestion });
    
  } catch (error) {
    console.error('[shipmentGroups] ❌ Erreur recherche:', error);
    return res.status(500).json({ error: 'Erreur lors de la recherche de devis groupables' });
  }
}

// ============================================
// CRÉATION D'UN GROUPEMENT
// ============================================

/**
 * Crée un nouveau groupement d'expédition
 * 
 * POST /api/shipment-groups
 * Body: { devisIds: string[], saasAccountId: string }
 */
export async function handleCreateShipmentGroup(req, res, firestore) {
  try {
    const { devisIds, saasAccountId, clientSaasId } = req.body;
    // Support des deux noms de champs pour compatibilité
    const finalSaasAccountId = saasAccountId || clientSaasId;
    
    console.log(`[shipmentGroups] 📦 Création groupement pour ${devisIds.length} devis`);
    
    if (!devisIds || devisIds.length < 2) {
      return res.status(400).json({ error: 'Au moins 2 devis requis pour créer un groupement' });
    }
    
    // Récupérer tous les devis
    const quotesPromises = devisIds.map(id => firestore.collection('quotes').doc(id).get());
    const quotesDocs = await Promise.all(quotesPromises);
    
    const quotes = quotesDocs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Vérifications
    const firstQuote = quotes[0];
    if (!firstQuote.recipientAddress) {
      return res.status(400).json({ error: 'Le premier devis n\'a pas d\'adresse de livraison' });
    }
    const firstAddress = normalizeAddress(firstQuote.recipientAddress);
    
    // Vérifier que tous les devis ont la même adresse normalisée
    for (const quote of quotes) {
      if (!quote.recipientAddress) {
        return res.status(400).json({ 
          error: `Le devis ${quote.reference || quote.id} n'a pas d'adresse de livraison` 
        });
      }
      
      if (normalizeAddress(quote.recipientAddress) !== firstAddress) {
        return res.status(400).json({ 
          error: 'Tous les devis doivent avoir la même adresse de livraison' 
        });
      }
      
      if (quote.shipmentGroupId) {
        return res.status(400).json({ 
          error: `Le devis ${quote.reference || quote.id} est déjà dans un groupement` 
        });
      }
    }
    
    // Générer un ID de groupe
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const groupId = `GRP-${year}-${month}-${random}`;
    
    // Collecter les bordereaux
    const bordereaux = [];
    quotes.forEach(quote => {
      if (quote.auctionSheetIds) {
        quote.auctionSheetIds.forEach((bordereauId, index) => {
          bordereaux.push({
            bordereauId,
            devisId: quote.id,
            reference: `${quote.reference || quote.id} - Bordereau ${index + 1}`,
            saleRoom: quote.saleRoom || quote.lot?.auctionHouse || 'Non spécifié',
          });
        });
      }
    });
    
    // Calculer poids et volumes totaux
    const totalWeight = quotes.reduce((sum, q) => sum + (q.totalWeight || 0), 0);
    const totalVolume = quotes.reduce((sum, q) => sum + (q.totalVolume || 0), 0);
    
    // Estimation simple des cartons (à affiner avec vraie logique)
    const cartons = [
      {
        cartonId: 'temp-1',
        cartonRef: 'CAS202',
        length: 40,
        width: 30,
        height: 30,
        weight: totalWeight,
        volumetricWeight: (40 * 30 * 30) / 5000,
      }
    ];
    
    const finalWeight = Math.max(totalWeight, cartons[0].volumetricWeight);
    
    // Créer le document ShipmentGroup
    const shipmentGroupData = {
      id: groupId,
      saasAccountId: finalSaasAccountId,
      clientId: firstQuote.clientId,
      clientEmail: firstQuote.client?.email || firstQuote.clientEmail || firstQuote.delivery?.contact?.email,
      clientName: firstQuote.client?.name || firstQuote.clientName || 'Client inconnu',
      recipientAddressRaw: firstQuote.recipientAddress,
      recipientAddressNormalized: firstAddress,
      devisIds,
      bordereaux,
      cartons,
      totalWeight,
      totalVolumetricWeight: cartons[0].volumetricWeight,
      finalWeight,
      shippingCost: Math.max(20, finalWeight * 2),
      totalPackagingCost: 10,
      totalCost: Math.max(20, finalWeight * 2) + 10,
      status: 'draft',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    
    // Sauvegarder dans Firestore
    await firestore.collection('shipmentGroups').doc(groupId).set(shipmentGroupData);
    
    // Mettre à jour les devis avec le shipmentGroupId
    const updatePromises = devisIds.map(devisId =>
      firestore.collection('quotes').doc(devisId).update({
        shipmentGroupId: groupId,
        isGrouped: true,
        updatedAt: Timestamp.now(),
      })
    );
    
    await Promise.all(updatePromises);
    
    console.log(`[shipmentGroups] ✅ Groupement créé: ${groupId}`);
    
    return res.json({ 
      success: true, 
      groupId,
      shipmentGroup: {
        ...shipmentGroupData,
        createdAt: shipmentGroupData.createdAt.toDate(),
        updatedAt: shipmentGroupData.updatedAt.toDate(),
      }
    });
    
  } catch (error) {
    console.error('[shipmentGroups] ❌ Erreur création:', error);
    return res.status(500).json({ error: 'Erreur lors de la création du groupement' });
  }
}

// ============================================
// RÉCUPÉRATION D'UN GROUPEMENT
// ============================================

/**
 * Récupère un groupement par son ID
 * 
 * GET /api/shipment-groups/:id
 */
export async function handleGetShipmentGroup(req, res, firestore) {
  try {
    const { id: groupId } = req.params;
    
    const groupDoc = await firestore.collection('shipmentGroups').doc(groupId).get();
    
    if (!groupDoc.exists) {
      return res.status(404).json({ error: 'Groupement non trouvé' });
    }
    
    const group = { id: groupDoc.id, ...groupDoc.data() };
    
    // Convertir les timestamps
    if (group.createdAt?.toDate) group.createdAt = group.createdAt.toDate();
    if (group.updatedAt?.toDate) group.updatedAt = group.updatedAt.toDate();
    if (group.validatedAt?.toDate) group.validatedAt = group.validatedAt.toDate();
    if (group.paidAt?.toDate) group.paidAt = group.paidAt.toDate();
    if (group.shippedAt?.toDate) group.shippedAt = group.shippedAt.toDate();
    
    return res.json(group);
    
  } catch (error) {
    console.error('[shipmentGroups] ❌ Erreur récupération:', error);
    return res.status(500).json({ error: 'Erreur lors de la récupération du groupement' });
  }
}

// ============================================
// DISSOLUTION D'UN GROUPEMENT
// ============================================

/**
 * Dissout un groupement (remise en état individuel des devis)
 * 
 * DELETE /api/shipment-groups/:id
 */
export async function handleDeleteShipmentGroup(req, res, firestore) {
  try {
    const { id: groupId } = req.params;
    
    console.log(`[shipmentGroups] 🗑️ Dissolution groupement: ${groupId}`);
    
    const groupDoc = await firestore.collection('shipmentGroups').doc(groupId).get();
    
    if (!groupDoc.exists) {
      return res.status(404).json({ error: 'Groupement non trouvé' });
    }
    
    const group = groupDoc.data();
    
    // Vérifier le statut (ne pas dissoudre si payé/expédié)
    if (group.status === 'paid' || group.status === 'shipped') {
      return res.status(400).json({ 
        error: 'Impossible de dissoudre un groupement payé ou expédié' 
      });
    }
    
    // Remettre les devis en état individuel
    const updatePromises = group.devisIds.map(devisId =>
      firestore.collection('quotes').doc(devisId).update({
        shipmentGroupId: null,
        isGrouped: false,
        updatedAt: Timestamp.now(),
      })
    );
    
    await Promise.all(updatePromises);
    
    // Supprimer le groupement
    await firestore.collection('shipmentGroups').doc(groupId).delete();
    
    console.log(`[shipmentGroups] ✅ Groupement dissous: ${groupId}`);
    
    return res.json({ success: true, message: 'Groupement dissous avec succès' });
    
  } catch (error) {
    console.error('[shipmentGroups] ❌ Erreur dissolution:', error);
    return res.status(500).json({ error: 'Erreur lors de la dissolution du groupement' });
  }
}


