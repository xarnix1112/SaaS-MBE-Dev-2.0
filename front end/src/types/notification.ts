/**
 * Types pour le système de notifications
 */

export type NotificationType =
  | "NEW_MESSAGE"
  | "PAYMENT_RECEIVED"
  | "DEVIS_SENT"
  | "DEVIS_PAID"
  | "DEVIS_PARTIALLY_PAID"
  | "SURCOUT_CREATED";

export interface Notification {
  id: string;
  clientSaasId: string;
  devisId: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: Date;
}

export interface NotificationResponse {
  id: string;
  clientSaasId: string;
  devisId: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string; // ISO string from API
}

