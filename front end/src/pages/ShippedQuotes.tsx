import { AppHeader } from '@/components/layout/AppHeader';
import { Card, CardContent } from '@/components/ui/card';
import { useQuotes } from '@/hooks/use-quotes';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Send, FileText, CheckCircle2, Truck } from 'lucide-react';
import { StatusBadge } from '@/components/quotes/StatusBadge';

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

function getShippedDate(quote: { sentToMbeHubAt?: unknown; shippedAt?: unknown }) {
  const s = quote.sentToMbeHubAt;
  const sh = quote.shippedAt;
  const date = s || sh;
  if (!date) return null;
  if (typeof date === 'object' && date !== null && 'toDate' in date) {
    return (date as { toDate: () => Date }).toDate();
  }
  return new Date(date as string | number);
}

export default function ShippedQuotes() {
  const { data: quotes = [], isLoading } = useQuotes();

  const shippedStatuses = ['sent_to_mbe_hub', 'shipped', 'completed'];
  const shippedQuotes = quotes.filter((q) => shippedStatuses.includes(q.status || ''));

  const visibleQuotes = shippedQuotes.filter((q) => {
    const d = getShippedDate(q);
    if (!d) return true;
    return Date.now() - d.getTime() < SIX_MONTHS_MS;
  });

  return (
    <div className="flex flex-col h-full">
      <AppHeader
        title="Expédiés"
        subtitle="Devis envoyés vers MBE Hub ou expédiés. Conservés 6 mois, puis masqués."
      />
      <div className="flex-1 p-4 overflow-auto">
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <p className="text-muted-foreground">Chargement...</p>
            ) : visibleQuotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Send className="w-12 h-12 mb-4 opacity-50" />
                <p className="font-medium">Aucun devis expédié</p>
                <p className="text-sm mt-1">
                  Les devis envoyés vers MBE Hub ou expédiés apparaîtront ici (visible 6 mois).
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleQuotes.map((quote) => {
                  const date = getShippedDate(quote);
                  const dateStr = date
                    ? date.toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })
                    : '-';
                  return (
                    <Link
                      key={quote.id}
                      to={`/quotes/${quote.id}`}
                      className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{quote.reference}</p>
                          <p className="text-sm text-muted-foreground">
                            {(quote.client?.name || quote.clientName || '')} –{' '}
                            {quote.lot?.auctionHouse || quote.auctionSheet?.auctionHouse || '-'}
                          </p>
                        </div>
                        {quote.mbeTrackingId && (
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {quote.mbeTrackingId}
                          </code>
                        )}
                        <StatusBadge status={quote.status as 'sent_to_mbe_hub' | 'shipped' | 'completed'} />
                        <span className="text-xs text-muted-foreground">{dateStr}</span>
                      </div>
                      <Badge
                        variant={quote.status === 'completed' ? 'default' : 'secondary'}
                        className="gap-1"
                      >
                        {quote.status === 'completed' ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <Truck className="w-3 h-3" />
                        )}
                        {quote.status === 'completed' ? 'Livré' : quote.status === 'shipped' ? 'En transit' : 'Envoyé Hub'}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
