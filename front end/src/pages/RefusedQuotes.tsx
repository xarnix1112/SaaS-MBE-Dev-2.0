import { AppHeader } from '@/components/layout/AppHeader';
import { Card, CardContent } from '@/components/ui/card';
import { useQuotes } from '@/hooks/use-quotes';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { XCircle, FileText } from 'lucide-react';
import type { ClientRefusalReason } from '@/types/quote';

const REFUSAL_REASON_LABELS: Record<ClientRefusalReason, string> = {
  tarif_trop_eleve: 'Tarif trop élevé',
  client_a_paye_concurrent: 'Client a payé un concurrent',
  plus_interesse: 'Plus intéressé',
  autre: 'Autre',
  pas_de_reponse: 'Pas de réponse / Abandonné',
  refus_explicite: 'Refus explicite',
};

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

export default function RefusedQuotes() {
  const { data: quotes = [], isLoading } = useQuotes();

  const refusedQuotes = quotes.filter((q) => q.clientRefusalStatus === 'client_refused');

  const visibleQuotes = refusedQuotes.filter((q) => {
    const at = q.clientRefusalAt;
    if (!at) return true;
    const d = at && typeof at === 'object' && 'toDate' in at ? (at as { toDate: () => Date }).toDate() : new Date(at);
    return Date.now() - d.getTime() < SIX_MONTHS_MS;
  });

  return (
    <div className="flex flex-col h-full">
      <AppHeader
        title="Devis refusés / abandonnés"
        subtitle="Devis refusés par le client ou abandonnés (sans réponse). Conservés 6 mois, puis supprimés."
      />
      <div className="flex-1 p-4 overflow-auto">
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <p className="text-muted-foreground">Chargement...</p>
            ) : visibleQuotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <XCircle className="w-12 h-12 mb-4 opacity-50" />
                <p className="font-medium">Aucun devis refusé ou abandonné</p>
                <p className="text-sm mt-1">
                  Les devis marqués comme refusés ou abandonnés par le client apparaîtront ici (visible 6 mois).
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleQuotes.map((quote) => {
                  const refusalAt = quote.clientRefusalAt;
                  const dateStr = refusalAt
                    ? (refusalAt && typeof refusalAt === 'object' && 'toDate' in refusalAt
                        ? (refusalAt as { toDate: () => Date }).toDate()
                        : new Date(refusalAt)
                      ).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })
                    : '-';
                  const reason =
                    (quote.clientRefusalReason && REFUSAL_REASON_LABELS[quote.clientRefusalReason])
                      ? REFUSAL_REASON_LABELS[quote.clientRefusalReason]
                      : (quote.clientRefusalReason === 'refus_explicite' ? 'Refus explicite' : quote.clientRefusalReason === 'pas_de_reponse' ? 'Pas de réponse / abandon' : 'Refusé');
                  const detail = quote.clientRefusalReasonDetail;
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
                        <Badge variant="outline" className="text-xs">
                          {reason}{detail ? ` – ${detail}` : ''}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{dateStr}</span>
                      </div>
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="w-3 h-3" />
                        Refusé/Abandonné
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
