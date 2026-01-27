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

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
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

export interface AuctionSheetInfo {
  fileName?: string;
  auctionHouse?: string;
  auctionDate?: Date;
  totalLots: number;
  totalObjects: number;
  rawText?: string;
}

export interface Quote {
  id: string;
  reference: string;
  client: Client;
  lot: Lot;
  status: QuoteStatus;
  paymentStatus: PaymentStatus;
  auctionHouseStatus?: AuctionHouseStatus;
  totalAmount: number;
  options: {
    insurance: boolean;
    express: boolean;
    insuranceAmount?: number;
    expressAmount?: number;
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
  auctionSheet?: AuctionSheetInfo;
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
