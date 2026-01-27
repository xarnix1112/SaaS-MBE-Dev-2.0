/**
 * Types TypeScript pour Stripe Connect
 */

export type PaiementType = "PRINCIPAL" | "SURCOUT";

export type PaiementStatus = "PENDING" | "PAID" | "FAILED" | "CANCELLED";

export type DevisStatus = "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";

export interface Client {
  id: string;
  name: string;
  email?: string;
  stripeAccountId?: string | null;
  stripeConnected?: boolean;
  stripeConnectedAt?: Date | null;
  stripeDisconnectedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Devis {
  id: string;
  clientSaasId: string;
  clientFinalEmail?: string;
  reference?: string;
  status: DevisStatus;
  totalAmount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Paiement {
  id: string;
  devisId: string;
  clientSaasId: string;
  stripeSessionId: string;
  stripeCheckoutUrl?: string; // URL du Stripe Checkout
  stripePaymentIntentId?: string;
  amount: number;
  type: PaiementType;
  status: PaiementStatus;
  description?: string;
  paidAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface StripeConnectResponse {
  url: string;
}

export interface StripeStatusResponse {
  connected: boolean;
  stripeAccountId: string | null;
  connectedAt: Date | null;
}

export interface CreatePaiementRequest {
  amount: number;
  type?: PaiementType;
  description?: string;
}

export interface CreatePaiementResponse {
  url: string;
  sessionId: string;
  paiementId: string;
}

