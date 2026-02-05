import { Quote } from '@/types/quote';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatusBadge } from './StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GroupBadge } from '@/components/shipment/GroupBadge';
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Package, 
  Euro,
  AlertTriangle,
  ChevronRight,
  Image,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useQuoteTotal } from '@/hooks/use-quote-total';

interface QuoteCardProps {
  quote: Quote;
  compact?: boolean;
}

export function QuoteCard({ quote, compact = false }: QuoteCardProps) {
  // Sécuriser toutes les propriétés pour éviter les erreurs
  const safeQuote = {
    ...quote,
    status: quote.status || 'new',
    verificationIssues: quote.verificationIssues || [],
    client: quote.client || { name: '', email: '', phone: '', address: '' },
    lot: quote.lot || {
      number: '',
      description: '',
      auctionHouse: '',
      dimensions: { length: 0, width: 0, height: 0 },
      value: 0,
      photos: []
    },
    options: quote.options || { insurance: false, express: false },
    totalAmount: quote.totalAmount || 0,
    paymentStatus: quote.paymentStatus || 'unpaid',
    createdAt: quote.createdAt instanceof Date ? quote.createdAt : (quote.createdAt ? new Date(quote.createdAt) : new Date()),
    reference: quote.reference || 'N/A'
  };
  
  // Calculer le total avec surcoûts
  const { totalWithSurcharge } = useQuoteTotal(quote);
  
  // Utiliser le total avec surcoût s'il est disponible, sinon le totalAmount
  const displayTotal = totalWithSurcharge !== null ? totalWithSurcharge : safeQuote.totalAmount;
  
  const hasIssues = (safeQuote.verificationIssues?.length || 0) > 0;

  if (compact) {
    return (
      <Link to={`/quotes/${safeQuote.id}`} className="block">
        <Card className="card-hover cursor-pointer bg-card transition-all hover:shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-sm">{safeQuote.reference}</span>
              <div className="flex items-center gap-2">
                {safeQuote.shipmentGroupId && (
                  <GroupBadge
                    groupId={safeQuote.shipmentGroupId}
                    variant="compact"
                  />
                )}
                <StatusBadge status={safeQuote.status} />
              </div>
            </div>
            <p className="text-sm text-muted-foreground truncate">{safeQuote.client.name || 'Client inconnu'}</p>
            <p className="text-xs text-muted-foreground truncate mt-1">{safeQuote.lot.description || 'Aucune description'}</p>
          </CardContent>
        </Card>
      </Link>
    );
  }

  return (
    <Card className={cn('card-hover', hasIssues && 'border-warning/50')}>
      {hasIssues && (
        <div className="alert-banner alert-warning rounded-t-lg rounded-b-none border-l-0 border-t-0 border-r-0">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Vérifications requises</p>
            <p className="text-xs mt-0.5">
              {safeQuote.verificationIssues.map(i => i.message).join(' • ')}
            </p>
          </div>
        </div>
      )}
      
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold">{safeQuote.reference}</span>
              <StatusBadge status={safeQuote.status} />
              {safeQuote.shipmentGroupId && (
                <GroupBadge
                  groupId={safeQuote.shipmentGroupId}
                  variant="compact"
                />
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Lot {safeQuote.lot.number || 'N/A'} • {safeQuote.lot.auctionHouse || 'N/A'}
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-lg">{displayTotal > 0 ? `${displayTotal.toFixed(2)}€` : '-'}</p>
            <StatusBadge status={safeQuote.paymentStatus} type="payment" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Client Info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="w-4 h-4" />
            <span className="truncate">{safeQuote.client.name || 'Client inconnu'}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="w-4 h-4" />
            <span className="truncate">{safeQuote.client.email || 'N/A'}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="w-4 h-4" />
            <span className="truncate">{safeQuote.client.phone || 'N/A'}</span>
            {safeQuote.verificationIssues.some(i => i.field === 'phone') && (
              <Badge variant="warning" className="text-[10px] px-1.5 py-0">!</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span className="truncate">{safeQuote.client.address || 'Non renseignée'}</span>
            {safeQuote.verificationIssues.some(i => i.field === 'address') && (
              <Badge variant="error" className="text-[10px] px-1.5 py-0">!</Badge>
            )}
          </div>
        </div>

        {/* Lot Info */}
        <div className="bg-secondary/50 rounded-lg p-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium mb-1">{safeQuote.lot.description || 'Aucune description'}</p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  {safeQuote.lot.dimensions.length}×{safeQuote.lot.dimensions.width}×{safeQuote.lot.dimensions.height} cm
                </span>
                <span className="flex items-center gap-1">
                  <Euro className="w-3 h-3" />
                  Valeur: {safeQuote.lot.value}€
                </span>
              </div>
            </div>
            {(safeQuote.lot.photos?.length || 0) > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Image className="w-3 h-3" />
                {safeQuote.lot.photos.length}
              </div>
            )}
          </div>
        </div>

        {/* Options */}
        <div className="flex items-center gap-2">
          {safeQuote.options.insurance && (
            <Badge variant="secondary">Assurance</Badge>
          )}
          {safeQuote.options.express && (
            <Badge variant="secondary">Express</Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Créé le {safeQuote.createdAt.toLocaleDateString('fr-FR')}
          </p>
          <Link to={`/quotes/${safeQuote.id}`}>
            <Button variant="ghost" size="sm" className="gap-1">
              Voir détails
              <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
