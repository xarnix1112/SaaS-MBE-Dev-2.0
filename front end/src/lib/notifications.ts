/**
 * API Client pour les notifications
 * Utilise authenticatedFetch pour passer automatiquement le token d'authentification
 */

import type { Notification, NotificationResponse } from '@/types/notification';
import { authenticatedFetch } from './api';

const API_BASE = '';

/**
 * Récupère toutes les notifications d'un client
 * Le clientId est maintenant récupéré automatiquement depuis req.saasAccountId côté backend
 */
export async function getNotifications(clientId?: string): Promise<Notification[]> {
  // Le clientId n'est plus nécessaire dans l'URL car récupéré depuis le token
  // On le garde pour compatibilité mais le backend utilisera req.saasAccountId
  const url = clientId 
    ? `${API_BASE}/api/notifications?clientId=${clientId}`
    : `${API_BASE}/api/notifications`;
  
  const response = await authenticatedFetch(url);

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
 * Le clientId est maintenant récupéré automatiquement depuis req.saasAccountId côté backend
 */
export async function getNotificationsCount(clientId?: string): Promise<number> {
  // Le clientId n'est plus nécessaire dans l'URL car récupéré depuis le token
  // On le garde pour compatibilité mais le backend utilisera req.saasAccountId
  const url = clientId
    ? `${API_BASE}/api/notifications/count?clientId=${clientId}`
    : `${API_BASE}/api/notifications/count`;
  
  const response = await authenticatedFetch(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
    throw new Error(error.error || 'Erreur lors du comptage des notifications');
  }

  const data = await response.json();
  return data.count;
}

/**
 * Supprime une notification (marque comme lue)
 * Le clientId est maintenant récupéré automatiquement depuis req.saasAccountId côté backend
 */
export async function deleteNotification(
  notificationId: string,
  clientId?: string
): Promise<void> {
  // Le clientId n'est plus nécessaire dans l'URL car récupéré depuis le token
  // On le garde pour compatibilité mais le backend utilisera req.saasAccountId
  const url = clientId
    ? `${API_BASE}/api/notifications/${notificationId}?clientId=${clientId}`
    : `${API_BASE}/api/notifications/${notificationId}`;
  
  const response = await authenticatedFetch(url, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
    throw new Error(error.error || 'Erreur lors de la suppression de la notification');
  }
}

