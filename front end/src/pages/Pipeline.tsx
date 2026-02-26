import { AppHeader } from '@/components/layout/AppHeader';
import { QuoteCard } from '@/components/quotes/QuoteCard';
import { QuoteStatus } from '@/types/quote';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useQuotes } from "@/hooks/use-quotes";

interface PipelineColumn {
  id: QuoteStatus;
  title: string;
  color: string;
}

// Statuts considérés comme "Nouveaux" (avant attente paiement)
const STATUS_NOUVEAUX = new Set<QuoteStatus | string>([
  'new', 'to_verify', 'verified', 'calculated', 'bordereau_linked', 'waiting_for_slip', 'payment_link_sent',
]);

const pipelineColumns: PipelineColumn[] = [
  { id: 'new', title: 'Nouveaux', color: 'bg-primary' },
  { id: 'awaiting_payment', title: 'Attente paiement', color: 'bg-warning' },
  { id: 'awaiting_collection', title: 'Attente collecte', color: 'bg-warning' },
  { id: 'collected', title: 'Collecté', color: 'bg-info' },
  { id: 'preparation', title: 'Préparation', color: 'bg-info' },
  { id: 'awaiting_shipment', title: 'Attente envoi', color: 'bg-warning' },
  { id: 'shipped', title: 'Expédié', color: 'bg-success' },
  { id: 'completed', title: 'Terminé', color: 'bg-success' },
];

export default function Pipeline() {
  const { data: quotes = [], isLoading, isError } = useQuotes();

  // Exclure les devis refusés par le client (visibles via page Refusés, recherche, lien direct)
  const visibleQuotes = quotes.filter(q => q.clientRefusalStatus !== 'client_refused');

  const getQuotesForColumn = (status: QuoteStatus) => {
    return visibleQuotes.filter(q => {
      const s = q.status || 'new';
      if (status === 'new') {
        return STATUS_NOUVEAUX.has(s) || s === '' || s == null;
      }
      return s === status;
    });
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader 
        title="Pipeline des devis" 
        subtitle="Vue Kanban de tous vos devis"
      />
      
      <div className="flex-1 p-6 overflow-hidden">
        {isLoading && (
          <div className="text-center text-muted-foreground pb-4">
            Chargement des devis...
          </div>
        )}
        {isError && (
          <div className="text-center text-destructive pb-4">
            Impossible de charger les devis Google Sheets
          </div>
        )}
        <ScrollArea className="h-full w-full">
          <div className="flex gap-4 pb-4 min-w-max">
            {pipelineColumns.map((column) => {
              const columnQuotes = getQuotesForColumn(column.id);
              
              return (
                <div
                  key={column.id}
                  className="w-80 flex-shrink-0"
                >
                  {/* Column Header */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className={cn('w-3 h-3 rounded-full', column.color)} />
                    <h3 className="font-semibold text-sm">{column.title}</h3>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {columnQuotes.length}
                    </span>
                  </div>

                  {/* Column Content */}
                  <div className="pipeline-column space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto scrollbar-thin">
                    {columnQuotes.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-sm text-muted-foreground">Aucun devis</p>
                      </div>
                    ) : (
                      columnQuotes.map((quote) => (
                        <QuoteCard key={quote.id} quote={quote} compact />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}
