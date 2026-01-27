import { AppHeader } from '@/components/layout/AppHeader';
import { mockQuotes } from '@/data/mockData';
import { StatusBadge } from '@/components/quotes/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Send,
  Package,
  Truck,
  FileText,
  CheckCircle2,
  ExternalLink,
  Bell,
  Clock,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Shipments() {
  const shipmentQuotes = mockQuotes.filter(q => 
    ['awaiting_shipment', 'shipped', 'completed'].includes(q.status)
  );

  const awaitingShipment = shipmentQuotes.filter(q => q.status === 'awaiting_shipment');
  const shipped = shipmentQuotes.filter(q => q.status === 'shipped');
  const completed = shipmentQuotes.filter(q => q.status === 'completed');

  return (
    <div className="flex flex-col h-full">
      <AppHeader 
        title="Expéditions" 
        subtitle="Gérez les envois et suivez les colis"
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
                  <p className="text-2xl font-bold">{awaitingShipment.length}</p>
                  <p className="text-sm text-muted-foreground">En attente d'envoi</p>
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
                  <p className="text-2xl font-bold">{shipped.length}</p>
                  <p className="text-sm text-muted-foreground">En transit</p>
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
                  <p className="text-2xl font-bold">{completed.length}</p>
                  <p className="text-sm text-muted-foreground">Livrés</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Shipments Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="w-4 h-4" />
              Liste des expéditions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {shipmentQuotes.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Aucune expédition en cours</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Transporteur</TableHead>
                    <TableHead>N° Suivi</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipmentQuotes.map((quote) => (
                    <TableRow key={quote.id}>
                      <TableCell>
                        <Link to={`/quotes/${quote.id}`} className="font-medium text-primary hover:underline">
                          {quote.reference}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{quote.client.name}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-40">
                            {quote.client.address}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{quote.lot.number}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-32">
                            {quote.lot.description}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {quote.carrier ? (
                          <Badge variant="secondary">{quote.carrier}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {quote.trackingNumber ? (
                          <div className="flex items-center gap-1">
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {quote.trackingNumber}
                            </code>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={quote.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {quote.status === 'awaiting_shipment' && (
                            <>
                              <Button size="sm" className="h-7 gap-1">
                                <Send className="w-3 h-3" />
                                Expédier
                              </Button>
                            </>
                          )}
                          {quote.status === 'shipped' && (
                            <>
                              <Button variant="outline" size="sm" className="h-7 gap-1">
                                <Bell className="w-3 h-3" />
                                Notifier
                              </Button>
                              <Button variant="outline" size="sm" className="h-7 gap-1">
                                <FileText className="w-3 h-3" />
                                Étiquette
                              </Button>
                            </>
                          )}
                          {quote.status === 'completed' && (
                            <Badge variant="success" className="gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Livré
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
