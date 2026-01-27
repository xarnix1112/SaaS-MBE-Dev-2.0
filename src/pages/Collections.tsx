import { AppHeader } from '@/components/layout/AppHeader';
import { mockQuotes } from '@/data/mockData';
import { QuoteTimeline } from '@/components/quotes/QuoteTimeline';
import { StatusBadge } from '@/components/quotes/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Truck,
  Package,
  CheckCircle2,
  Clock,
  MapPin,
  User,
  Phone,
  Calendar,
  Bell,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Collections() {
  const collectionQuotes = mockQuotes.filter(q => 
    ['awaiting_collection', 'collected'].includes(q.status)
  );

  const awaitingCollection = collectionQuotes.filter(q => q.status === 'awaiting_collection');
  const collected = collectionQuotes.filter(q => q.status === 'collected');

  return (
    <div className="flex flex-col h-full">
      <AppHeader 
        title="Collectes" 
        subtitle="Gérez les collectes auprès des salles des ventes"
      />
      
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-warning/10">
                  <Clock className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{awaitingCollection.length}</p>
                  <p className="text-sm text-muted-foreground">En attente de collecte</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-info/10">
                  <Truck className="w-5 h-5 text-info" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{collected.length}</p>
                  <p className="text-sm text-muted-foreground">Collectés aujourd'hui</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{collectionQuotes.length}</p>
                  <p className="text-sm text-muted-foreground">Total en cours</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Collection List */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {collectionQuotes.map((quote) => (
            <Card key={quote.id} className="card-hover">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      {quote.lot.number}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">{quote.reference}</p>
                  </div>
                  <StatusBadge status={quote.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Client Info */}
                <div className="bg-secondary/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span>{quote.client.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span>{quote.client.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span>{quote.lot.auctionHouse}</span>
                  </div>
                </div>

                {/* Lot Description */}
                <div>
                  <p className="text-sm font-medium mb-1">Description du lot</p>
                  <p className="text-sm text-muted-foreground">{quote.lot.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>{quote.lot.dimensions.length}×{quote.lot.dimensions.width}×{quote.lot.dimensions.height} cm</span>
                    <span>{quote.lot.dimensions.weight} kg</span>
                  </div>
                </div>

                {/* Timeline */}
                <div>
                  <p className="text-sm font-medium mb-3">Historique</p>
                  <QuoteTimeline events={quote.timeline.slice(-3)} />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  {quote.status === 'awaiting_collection' && (
                    <>
                      <Button size="sm" className="gap-1">
                        <Truck className="w-4 h-4" />
                        Marquer comme collecté
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1">
                        <Calendar className="w-4 h-4" />
                        Planifier
                      </Button>
                    </>
                  )}
                  {quote.status === 'collected' && (
                    <>
                      <Button size="sm" className="gap-1">
                        <Package className="w-4 h-4" />
                        Démarrer préparation
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1">
                        <Bell className="w-4 h-4" />
                        Notifier client
                      </Button>
                    </>
                  )}
                  <Link to={`/quotes/${quote.id}`} className="ml-auto">
                    <Button variant="ghost" size="sm">
                      Voir détails
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {collectionQuotes.length === 0 && (
          <div className="text-center py-12">
            <Truck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Aucune collecte en cours</p>
          </div>
        )}
      </div>
    </div>
  );
}
