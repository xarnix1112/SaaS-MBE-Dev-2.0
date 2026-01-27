export type QuoteStatus = 
  | 'new'
  | 'to_verify'
  | 'verified'
  | 'payment_link_sent'
  | 'awaiting_payment'
  | 'paid'
  | 'awaiting_collection'
  | 'collected'
  | 'preparation'
  | 'awaiting_shipment'
  | 'shipped'
  | 'completed';

export type VerificationStatus = 
  | 'valid'
  | 'doubtful'
  | 'missing'
  | 'verifying';

export type PaymentStatus = 
  | 'pending'
  | 'link_sent'
  | 'partial'
  | 'paid'
  | 'cancelled';

export type AuctionHouseStatus = 
  | 'awaiting_validation'
  | 'accepted'
  | 'refused';

export type AlertType = 
  | 'urgent'
  | 'warning'
  | 'info'
  | 'resolved';

export type DeliveryMode = 'client' | 'receiver' | 'pickup';

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
}

export interface DeliveryInfo {
  mode: DeliveryMode;
  contact: {
    name: string;
    email: string;
    phone: string;
  };
  address: {
    line1: string;
    line2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  note?: string;
}

export interface LotDimensions {
  length: number;
  width: number;
  height: number;
  weight: number;
  estimated: boolean;
}

export interface Lot {
  id: string;
  number: string;
  description: string;
  dimensions: LotDimensions;
  realDimensions?: LotDimensions;
  value: number;
  photos: string[];
  auctionHouse: string;
  /** Poids réel total (kg) */
  weight?: number;
  /** Poids volumétrique total (kg) */
  volumetricWeight?: number;
  /** Poids final utilisé pour calcul expédition (kg) */
  finalWeight?: number;
}

export interface PaymentLink {
  id: string;
  url: string;
  amount: number;
  createdAt: Date;
  status: 'active' | 'paid' | 'expired';
}

export interface Message {
  id: string;
  from: string;
  to: string;
  subject: string;
  content: string;
  date: Date;
  type: 'email' | 'sms' | 'internal';
  category?: 'insurance' | 'express' | 'question' | 'address_change' | 'cancellation' | 'complaint';
}

export interface VerificationIssue {
  field: string;
  type: VerificationStatus;
  message: string;
}

export interface CartonInfo {
  id?: string;
  ref: string;
  label?: string; // For backward compatibility
  inner_length?: number;
  inner_width?: number;
  inner_height?: number;
  inner?: { length: number; width: number; height: number } | null; // For backward compatibility
  required?: { length: number; width: number; height: number }; // For backward compatibility
  price?: number;
  priceTTC?: number | null; // For backward compatibility
  source?: string; // For backward compatibility
  lotsCount?: number;
  lotNumbers?: string[];
}

export interface AuctionSheetInfo {
  fileName?: string;
  /** URL Firebase Storage (optionnel) */
  fileUrl?: string;
  /** Chemin Firebase Storage (optionnel, pour suppression) */
  storagePath?: string;
  /** Date d'upload ISO */
  uploadedAt?: string;
  auctionHouse?: string;
  auctionDate?: Date;
  totalLots: number;
  totalObjects: number;
  invoiceTotal?: number;
  /** Numéro de bordereau (ex: "INV-12345") */
  bordereauNumber?: string;
  recommendedCarton?: CartonInfo; // Unified type
  /** Cartons multiples (si plusieurs lots) */
  cartons?: CartonInfo[];
  /** Stratégie d'emballage utilisée */
  packagingStrategy?: 'single_carton' | 'multiple_cartons' | 'default_carton' | 'failed' | 'none';
  /** Lots extraits du bordereau (persistés Firestore) */
  lots?: Array<{
    lotNumber: string;
    description: string;
    estimatedDimensions?: { length: number; width: number; height: number; weight: number };
    value?: number; // Prix marteau (prix d'adjudication)
    total?: number; // Prix total avec frais
  }>;
  rawText?: string;
}

export interface Quote {
  id: string;
  reference: string;
  client: Client;
  lot: Lot;
  lots?: Lot[]; // Liste complète des lots (pour compatibilité avec bordereaux)
  status: QuoteStatus;
  paymentStatus: PaymentStatus;
  auctionHouseStatus?: AuctionHouseStatus;
  totalAmount: number;
  options: {
    insurance: boolean;
    express: boolean;
    insuranceAmount?: number;
    expressAmount?: number;
    packagingPrice?: number; // Prix d'emballage depuis Google Sheets
    shippingPrice?: number; // Prix d'expédition depuis Google Sheets
  };
  paymentLinks: PaymentLink[];
  messages: Message[];
  verificationIssues: VerificationIssue[];
  timeline: TimelineEvent[];
  internalNotes: string[];
  auctionHouseComments: string[];
  createdAt: Date;
  updatedAt: Date;
  trackingNumber?: string;
  carrier?: string;
  delivery?: DeliveryInfo;
  auctionSheet?: AuctionSheetInfo;
  bordereauId?: string; // ID du bordereau dans la collection bordereaux
  cartonId?: string; // ID du carton principal utilisé
  cartonIds?: string[]; // IDs de tous les cartons (si multiples)
  
  // Champs pour groupement d'expédition
  shipmentGroupId?: string | null; // ID du groupe d'expédition
  isGrouped?: boolean; // Indicateur rapide de groupement
  clientId?: string; // ID du client SaaS
  clientName?: string; // Nom du client
  clientEmail?: string; // Email du client
  recipientAddress?: string; // Adresse du destinataire
  totalWeight?: number; // Poids total en kg
  totalVolume?: number; // Volume total en m³
  shippingCost?: number; // Coût d'expédition
}

export interface TimelineEvent {
  id: string;
  date: Date;
  status: QuoteStatus;
  description: string;
  user?: string;
}

export interface Alert {
  id: string;
  quoteId: string;
  quoteReference: string;
  type: AlertType;
  title: string;
  description: string;
  createdAt: Date;
  resolvedAt?: Date;
}

export interface AuctionHouse {
  id: string;
  name: string;
  address: string;
  contact: string;
  email?: string; // Email dédié pour les collectes
  website?: string;
}

export interface DashboardStats {
  newQuotes: number;
  awaitingVerification: number;
  awaitingPayment: number;
  awaitingCollection: number;
  inPreparation: number;
  shipped: number;
  completed: number;
  urgentAlerts: number;
}

export interface EmailMessage {
  id: string;
  userId?: string; // ID de l'utilisateur SaaS
  emailAccountId?: string; // ID du compte email (pour Gmail)
  devisId: string | null; // Lien avec le devis (peut être null si non rattaché)
  clientId?: string;
  clientEmail: string;
  direction: 'IN' | 'OUT'; // Reçu ou envoyé
  source: 'RESEND' | 'GMAIL'; // Source de l'email
  from: string;
  to: string | string[]; // String pour Gmail, array pour RESEND
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  messageId?: string; // ID du message (Resend ou Gmail)
  gmailMessageId?: string; // ID Gmail spécifique
  gmailThreadId?: string; // Thread ID Gmail
  inReplyTo?: string; // ID du message auquel on répond
  receivedAt?: Date; // Date de réception (pour Gmail)
  createdAt: Date;
}

export interface EmailAccount {
  id: string;
  userId: string; // ex: "dev-user-1"
  provider: 'gmail';
  emailAddress: string;
  oauth: {
    accessToken: string;
    refreshToken: string;
    expiryDate: number;
  };
  gmail: {
    lastHistoryId: string | null;
  };
  isActive: boolean;
  createdAt: Date;
  lastSyncAt: Date | null;
}
