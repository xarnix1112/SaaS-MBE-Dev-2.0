import { Quote } from '@/types/quote';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatusBadge } from './StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

interface QuoteCardProps {
  quote: Quote;
  compact?: boolean;
}

export function QuoteCard({ quote, compact = false }: QuoteCardProps) {
  const hasIssues = quote.verificationIssues.length > 0;

  if (compact) {
    return (
      <Card className="card-hover cursor-pointer bg-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-sm">{quote.reference}</span>
            <StatusBadge status={quote.status} />
          </div>
          <p className="text-sm text-muted-foreground truncate">{quote.client.name}</p>
          <p className="text-xs text-muted-foreground truncate mt-1">{quote.lot.description}</p>
        </CardContent>
      </Card>
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
              {quote.verificationIssues.map(i => i.message).join(' • ')}
            </p>
          </div>
        </div>
      )}
      
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold">{quote.reference}</span>
              <StatusBadge status={quote.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Lot {quote.lot.number} • {quote.lot.auctionHouse}
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-lg">{quote.totalAmount > 0 ? `${quote.totalAmount}€` : '-'}</p>
            <StatusBadge status={quote.paymentStatus} type="payment" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Client Info */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="w-4 h-4" />
            <span className="truncate">{quote.client.name}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="w-4 h-4" />
            <span className="truncate">{quote.client.email}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="w-4 h-4" />
            <span className="truncate">{quote.client.phone}</span>
            {quote.verificationIssues.some(i => i.field === 'phone') && (
              <Badge variant="warning" className="text-[10px] px-1.5 py-0">!</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span className="truncate">{quote.client.address || 'Non renseignée'}</span>
            {quote.verificationIssues.some(i => i.field === 'address') && (
              <Badge variant="error" className="text-[10px] px-1.5 py-0">!</Badge>
            )}
          </div>
        </div>

        {/* Lot Info */}
        <div className="bg-secondary/50 rounded-lg p-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium mb-1">{quote.lot.description}</p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  {quote.lot.dimensions.length}×{quote.lot.dimensions.width}×{quote.lot.dimensions.height} cm
                </span>
                <span className="flex items-center gap-1">
                  <Euro className="w-3 h-3" />
                  Valeur: {quote.lot.value}€
                </span>
              </div>
            </div>
            {quote.lot.photos.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Image className="w-3 h-3" />
                {quote.lot.photos.length}
              </div>
            )}
          </div>
        </div>

        {/* Options */}
        <div className="flex items-center gap-2">
          {quote.options.insurance && (
            <Badge variant="secondary">Assurance</Badge>
          )}
          {quote.options.express && (
            <Badge variant="secondary">Express</Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Créé le {quote.createdAt.toLocaleDateString('fr-FR')}
          </p>
          <Link to={`/quotes/${quote.id}`}>
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
