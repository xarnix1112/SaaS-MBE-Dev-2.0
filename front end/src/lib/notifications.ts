/**
 * API Client pour les notifications
 */

import type { Notification, NotificationResponse } from '@/types/notification';

const API_BASE = '';

/**
 * Récupère toutes les notifications d'un client
 */
export async function getNotifications(clientId: string): Promise<Notification[]> {
  const response = await fetch(`${API_BASE}/api/notifications?clientId=${clientId}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
    throw new Error(error.error || 'Erreur lors de la récupération des notifications');
  }

  const data: NotificationResponse[] = await response.json();

  // Convertir les dates
  return data.map((notif) => ({
    ...notif,
    createdAt: new Date(notif.createdAt),
  }));
}

/**
 * Compte le nombre de notifications d'un client
 */
export async function getNotificationsCount(clientId: string): Promise<number> {
  const response = await fetch(`${API_BASE}/api/notifications/count?clientId=${clientId}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
    throw new Error(error.error || 'Erreur lors du comptage des notifications');
  }

  const data = await response.json();
  return data.count;
}

/**
 * Supprime une notification (marque comme lue)
 */
export async function deleteNotification(
  notificationId: string,
  clientId: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/notifications/${notificationId}?clientId=${clientId}`,
    {
      method: 'DELETE',
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
    throw new Error(error.error || 'Erreur lors de la suppression de la notification');
  }
}

