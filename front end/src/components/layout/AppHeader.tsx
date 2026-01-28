import { useState, useEffect, useRef } from 'react';
import { Search, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationDrawer } from '@/components/notifications/NotificationDrawer';
import { AccountMenu } from '@/components/auth/AccountMenu';
import { useQuotes } from '@/hooks/use-quotes';
import { useAuth } from '@/hooks/useAuth';
import { Quote } from '@/types/quote';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  clientId?: string; // ID du client SaaS (optionnel, sera récupéré depuis useAuth si non fourni)
}

export function AppHeader({ title, subtitle, clientId }: AppHeaderProps) {
  const { saasAccount } = useAuth();
  // Utiliser le clientId fourni en prop, sinon récupérer depuis useAuth
  const effectiveClientId = clientId || saasAccount?.id;
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [filteredQuotes, setFilteredQuotes] = useState<Quote[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data: quotes = [] } = useQuotes();

  // Recherche dans les devis
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredQuotes([]);
      setShowResults(false);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const results = quotes.filter((quote) => {
      // Recherche par référence
      if (quote.reference?.toLowerCase().includes(query)) return true;
      
      // Recherche par nom du client
      if (quote.client?.name?.toLowerCase().includes(query)) return true;
      
      // Recherche par nom du destinataire
      if (quote.delivery?.contact?.name?.toLowerCase().includes(query)) return true;
      
      // Recherche par numéro de lot
      if (quote.lot?.number?.toLowerCase().includes(query)) return true;
      
      // Recherche par description du lot
      if (quote.lot?.description?.toLowerCase().includes(query)) return true;
      
      return false;
    });

    setFilteredQuotes(results.slice(0, 5)); // Limiter à 5 résultats
    setShowResults(results.length > 0);
  }, [searchQuery, quotes]);

  // Fermer les résultats quand on clique ailleurs
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectQuote = (quoteId: string) => {
    setShowResults(false);
    setSearchQuery('');
    navigate(`/quotes/${quoteId}`);
  };

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      new: 'Nouveau',
      to_verify: 'À vérifier',
      verified: 'Vérifié',
      payment_link_sent: 'Lien envoyé',
      awaiting_payment: 'Attente paiement',
      paid: 'Payé',
      awaiting_collection: 'Attente collecte',
      collected: 'Collecté',
      preparation: 'Préparation',
      awaiting_shipment: 'Attente expédition',
      shipped: 'Expédié',
      completed: 'Terminé',
    };
    return statusMap[status] || status;
  };

  return (
    <>
      <header className="h-16 border-b border-border bg-card px-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative hidden md:block" ref={searchRef}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery && setShowResults(true)}
              placeholder="Rechercher un devis..."
              className="w-64 pl-9 bg-secondary border-0"
            />
            
            {/* Résultats de recherche */}
            {showResults && filteredQuotes.length > 0 && (
              <div className="absolute top-full mt-2 w-96 bg-card border border-border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                <div className="p-2 space-y-1">
                  {filteredQuotes.map((quote) => (
                    <button
                      key={quote.id}
                      onClick={() => handleSelectQuote(quote.id)}
                      className={cn(
                        "w-full text-left p-3 rounded-md hover:bg-accent transition-colors",
                        "flex items-start gap-3"
                      )}
                    >
                      <FileText className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-medium text-sm truncate">
                            {quote.reference}
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {getStatusLabel(quote.status)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <div className="truncate">
                            Client: {quote.client?.name || 'N/A'}
                          </div>
                          {quote.delivery?.contact?.name && (
                            <div className="truncate">
                              Destinataire: {quote.delivery.contact.name}
                            </div>
                          )}
                          {quote.lot?.description && (
                            <div className="truncate">
                              {quote.lot.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notifications - Affiché uniquement si clientId disponible */}
          {effectiveClientId && (
            <>
              <NotificationBell
                clientId={effectiveClientId}
                onClick={() => setIsDrawerOpen(true)}
              />
              <NotificationDrawer
                clientId={effectiveClientId}
                open={isDrawerOpen}
                onOpenChange={setIsDrawerOpen}
                onNotificationRead={() => {
                  // Force le rechargement du compteur en fermant et rouvrant
                  // Le NotificationBell se mettra à jour automatiquement via polling
                }}
              />
            </>
          )}

          {/* Account Menu */}
          <AccountMenu />
        </div>
      </header>
    </>
  );
}
