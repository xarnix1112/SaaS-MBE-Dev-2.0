/**
 * Module de gestion des notifications
 * 
 * Système centralisé pour gérer les notifications par client SaaS
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Types de notifications disponibles
 */
export const NOTIFICATION_TYPES = {
  NEW_MESSAGE: 'NEW_MESSAGE',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  DEVIS_SENT: 'DEVIS_SENT',
  DEVIS_PAID: 'DEVIS_PAID',
  DEVIS_PARTIALLY_PAID: 'DEVIS_PARTIALLY_PAID',
  SURCOUT_CREATED: 'SURCOUT_CREATED',
};

/**
 * Crée une notification dans Firestore
 * 
 * @param {Firestore} firestore - Instance Firestore
 * @param {Object} notificationData - Données de la notification
 * @param {string} notificationData.clientSaasId - ID du client SaaS
 * @param {string} notificationData.devisId - ID du devis concerné
 * @param {string} notificationData.type - Type de notification
 * @param {string} notificationData.title - Titre de la notification
 * @param {string} notificationData.message - Message de la notification
 * @returns {Promise<string>} ID de la notification créée
 */
export async function createNotification(firestore, notificationData) {
  const { clientSaasId, devisId, type, title, message } = notificationData;

  if (!clientSaasId || !devisId || !type || !title || !message) {
    throw new Error('Tous les champs sont requis pour créer une notification');
  }

  if (!Object.values(NOTIFICATION_TYPES).includes(type)) {
    throw new Error(`Type de notification invalide: ${type}`);
  }

  const docRef = await firestore.collection('notifications').add({
    clientSaasId,
    devisId,
    type,
    title,
    message,
    createdAt: Timestamp.now(),
  });

  console.log(`[notifications] ✅ Notification créée: ${docRef.id}`, {
    type,
    clientSaasId,
    devisId,
  });

  return docRef.id;
}

/**
 * GET /api/notifications
 * Récupère toutes les notifications non lues d'un client
 */
export async function handleGetNotifications(req, res, firestore) {
  try {
    if (!firestore) {
      return res.status(500).json({ error: 'Firestore non initialisé' });
    }

    const clientId = req.query.clientId;

    if (!clientId) {
      return res.status(400).json({ error: 'clientId requis' });
    }

    console.log('[notifications] 📥 Récupération des notifications pour:', clientId);

    // Récupérer les notifications du client, triées par date décroissante
    const snapshot = await firestore
      .collection('notifications')
      .where('clientSaasId', '==', clientId)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    const notifications = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      notifications.push({
        id: doc.id,
        clientSaasId: data.clientSaasId,
        devisId: data.devisId,
        type: data.type,
        title: data.title,
        message: data.message,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
      });
    });

    console.log('[notifications] ✅ Notifications trouvées:', notifications.length);

    return res.json(notifications);
  } catch (error) {
    console.error('[notifications] ❌ Erreur récupération:', error);
    return res.status(500).json({
      error: 'Erreur lors de la récupération des notifications',
      details: error.message,
    });
  }
}

/**
 * GET /api/notifications/count
 * Compte le nombre de notifications non lues d'un client
 */
export async function handleGetNotificationsCount(req, res, firestore) {
  try {
    if (!firestore) {
      return res.status(500).json({ error: 'Firestore non initialisé' });
    }

    const clientId = req.query.clientId;

    if (!clientId) {
      return res.status(400).json({ error: 'clientId requis' });
    }

    console.log('[notifications] 📊 Comptage des notifications pour:', clientId);

    const snapshot = await firestore
      .collection('notifications')
      .where('clientSaasId', '==', clientId)
      .get();

    const count = snapshot.size;

    console.log('[notifications] ✅ Nombre de notifications:', count);

    return res.json({ count });
  } catch (error) {
    console.error('[notifications] ❌ Erreur comptage:', error);
    return res.status(500).json({
      error: 'Erreur lors du comptage des notifications',
      details: error.message,
    });
  }
}

/**
 * DELETE /api/notifications/:id
 * Supprime une notification (marque comme lue)
 */
export async function handleDeleteNotification(req, res, firestore) {
  try {
    if (!firestore) {
      return res.status(500).json({ error: 'Firestore non initialisé' });
    }

    const { id } = req.params;
    const clientId = req.query.clientId;

    if (!clientId) {
      return res.status(400).json({ error: 'clientId requis' });
    }

    console.log('[notifications] 🗑️  Suppression notification:', id);

    // Vérifier que la notification appartient au client
    const doc = await firestore.collection('notifications').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Notification non trouvée' });
    }

    const data = doc.data();
    if (data.clientSaasId !== clientId) {
      return res.status(403).json({ error: 'Accès interdit' });
    }

    // Supprimer la notification
    await firestore.collection('notifications').doc(id).delete();

    console.log('[notifications] ✅ Notification supprimée:', id);

    return res.json({ success: true });
  } catch (error) {
    console.error('[notifications] ❌ Erreur suppression:', error);
    return res.status(500).json({
      error: 'Erreur lors de la suppression de la notification',
      details: error.message,
    });
  }
}

