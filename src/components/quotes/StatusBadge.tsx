import { Badge } from '@/components/ui/badge';
import { 
  QuoteStatus, 
  PaymentStatus, 
  VerificationStatus, 
  AuctionHouseStatus,
  AlertType 
} from '@/types/quote';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Send, 
  CreditCard,
  Truck,
  Package,
  Eye,
  HelpCircle,
  Ban,
} from 'lucide-react';

interface StatusBadgeProps {
  status: QuoteStatus | PaymentStatus | VerificationStatus | AuctionHouseStatus | AlertType;
  type?: 'quote' | 'payment' | 'verification' | 'auction' | 'alert';
}

const quoteStatusConfig: Record<QuoteStatus, { label: string; variant: 'new' | 'pending' | 'verified' | 'info' | 'success' | 'warning' | 'error'; icon: React.ElementType }> = {
  new: { label: 'Nouveau', variant: 'new', icon: Clock },
  to_verify: { label: 'À vérifier', variant: 'warning', icon: Eye },
  verified: { label: 'Vérifié', variant: 'verified', icon: CheckCircle2 },
  payment_link_sent: { label: 'Lien envoyé', variant: 'info', icon: Send },
  awaiting_payment: { label: 'Attente paiement', variant: 'pending', icon: CreditCard },
  paid: { label: 'Payé', variant: 'success', icon: CheckCircle2 },
  awaiting_collection: { label: 'Attente collecte', variant: 'pending', icon: Clock },
  collected: { label: 'Collecté', variant: 'info', icon: Truck },
  preparation: { label: 'Préparation', variant: 'info', icon: Package },
  awaiting_shipment: { label: 'Attente envoi', variant: 'pending', icon: Clock },
  shipped: { label: 'Expédié', variant: 'success', icon: Send },
  completed: { label: 'Terminé', variant: 'verified', icon: CheckCircle2 },
};

const paymentStatusConfig: Record<PaymentStatus, { label: string; variant: 'new' | 'pending' | 'verified' | 'info' | 'success' | 'warning' | 'error'; icon: React.ElementType }> = {
  pending: { label: 'En attente', variant: 'pending', icon: Clock },
  link_sent: { label: 'Lien envoyé', variant: 'info', icon: Send },
  partial: { label: 'Partiel', variant: 'warning', icon: AlertTriangle },
  paid: { label: 'Payé', variant: 'success', icon: CheckCircle2 },
  cancelled: { label: 'Annulé', variant: 'error', icon: Ban },
};

const verificationStatusConfig: Record<VerificationStatus, { label: string; variant: 'new' | 'pending' | 'verified' | 'info' | 'success' | 'warning' | 'error'; icon: React.ElementType }> = {
  valid: { label: 'Vérifié', variant: 'verified', icon: CheckCircle2 },
  doubtful: { label: 'Information douteuse', variant: 'warning', icon: AlertTriangle },
  missing: { label: 'Information manquante', variant: 'error', icon: XCircle },
  verifying: { label: 'En vérification', variant: 'info', icon: Eye },
};

const auctionStatusConfig: Record<AuctionHouseStatus, { label: string; variant: 'new' | 'pending' | 'verified' | 'info' | 'success' | 'warning' | 'error'; icon: React.ElementType }> = {
  awaiting_validation: { label: 'Attente validation', variant: 'pending', icon: Clock },
  accepted: { label: 'Accepté', variant: 'success', icon: CheckCircle2 },
  refused: { label: 'Refusé', variant: 'error', icon: XCircle },
};

const alertTypeConfig: Record<AlertType, { label: string; variant: 'new' | 'pending' | 'verified' | 'info' | 'success' | 'warning' | 'error'; icon: React.ElementType }> = {
  urgent: { label: 'Urgent', variant: 'error', icon: AlertTriangle },
  warning: { label: 'À surveiller', variant: 'warning', icon: AlertTriangle },
  info: { label: 'Info', variant: 'info', icon: HelpCircle },
  resolved: { label: 'Résolu', variant: 'verified', icon: CheckCircle2 },
};

export function StatusBadge({ status, type = 'quote' }: StatusBadgeProps) {
  let config;
  
  switch (type) {
    case 'payment':
      config = paymentStatusConfig[status as PaymentStatus];
      break;
    case 'verification':
      config = verificationStatusConfig[status as VerificationStatus];
      break;
    case 'auction':
      config = auctionStatusConfig[status as AuctionHouseStatus];
      break;
    case 'alert':
      config = alertTypeConfig[status as AlertType];
      break;
    default:
      config = quoteStatusConfig[status as QuoteStatus];
  }

  if (!config) {
    return null;
  }

  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}
