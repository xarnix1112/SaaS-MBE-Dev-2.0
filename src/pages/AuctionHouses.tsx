import { useState } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { mockQuotes, mockAuctionHouses } from '@/data/mockData';
import { StatusBadge } from '@/components/quotes/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Building2,
  Package,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  Euro,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export default function AuctionHouses() {
  const [selectedHouse, setSelectedHouse] = useState(mockAuctionHouses[0].id);

  const getQuotesForHouse = (houseName: string) => {
    return mockQuotes.filter(q => 
      q.lot.auctionHouse === houseName &&
      ['paid', 'awaiting_collection'].includes(q.status)
    );
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader 
        title="Salles des ventes" 
        subtitle="Gérez les lots en attente de collecte par salle"
      />
      
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <Tabs value={selectedHouse} onValueChange={setSelectedHouse}>
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-flex">
            {mockAuctionHouses.map((house) => {
              const houseQuotes = getQuotesForHouse(house.name);
              return (
                <TabsTrigger key={house.id} value={house.id} className="gap-2">
                  <Building2 className="w-4 h-4" />
                  <span className="hidden sm:inline">{house.name}</span>
                  <span className="sm:hidden">Salle {house.id}</span>
                  <Badge variant="secondary" className="ml-1">
                    {houseQuotes.length}
                  </Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {mockAuctionHouses.map((house) => {
            const houseQuotes = getQuotesForHouse(house.name);
            const awaitingValidation = houseQuotes.filter(q => q.auctionHouseStatus === 'awaiting_validation');
            const accepted = houseQuotes.filter(q => q.auctionHouseStatus === 'accepted');
            const refused = houseQuotes.filter(q => q.auctionHouseStatus === 'refused');

            return (
              <TabsContent key={house.id} value={house.id} className="space-y-6">
                {/* House Info */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-lg">{house.name}</h3>
                        <p className="text-sm text-muted-foreground">{house.address}</p>
                        <p className="text-sm text-muted-foreground">{house.contact}</p>
                      </div>
                      <div className="flex gap-4">
                        <div className="text-center">
                          <div className="flex items-center gap-1 text-warning">
                            <Clock className="w-4 h-4" />
                            <span className="text-xl font-bold">{awaitingValidation.length}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">En attente</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center gap-1 text-success">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-xl font-bold">{accepted.length}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Acceptés</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center gap-1 text-destructive">
                            <XCircle className="w-4 h-4" />
                            <span className="text-xl font-bold">{refused.length}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Refusés</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Lots Table */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Lots en attente de collecte
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {houseQuotes.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">Aucun lot en attente pour cette salle</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Lot</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Paiement</TableHead>
                            <TableHead>Statut salle</TableHead>
                            <TableHead>Commentaire</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {houseQuotes.map((quote) => (
                            <TableRow key={quote.id}>
                              <TableCell>
                                <Link to={`/quotes/${quote.id}`} className="font-medium text-primary hover:underline">
                                  {quote.lot.number}
                                </Link>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{quote.client.name}</p>
                                  <p className="text-xs text-muted-foreground">{quote.reference}</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm max-w-xs truncate">{quote.lot.description}</p>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Euro className="w-3 h-3 text-muted-foreground" />
                                  <span className={cn(
                                    'font-medium',
                                    quote.paymentStatus === 'paid' ? 'text-success' : 'text-warning'
                                  )}>
                                    {quote.totalAmount}€
                                  </span>
                                  <StatusBadge status={quote.paymentStatus} type="payment" />
                                </div>
                              </TableCell>
                              <TableCell>
                                {quote.auctionHouseStatus && (
                                  <StatusBadge status={quote.auctionHouseStatus} type="auction" />
                                )}
                              </TableCell>
                              <TableCell>
                                {quote.auctionHouseComments.length > 0 ? (
                                  <div className="flex items-center gap-1 text-sm">
                                    <MessageSquare className="w-3 h-3 text-muted-foreground" />
                                    <span className="truncate max-w-32">{quote.auctionHouseComments[0]}</span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  {quote.auctionHouseStatus === 'awaiting_validation' && (
                                    <>
                                      <Button variant="outline" size="sm" className="h-7 text-success border-success/30 hover:bg-success/10">
                                        <CheckCircle2 className="w-3 h-3 mr-1" />
                                        Accepter
                                      </Button>
                                      <Button variant="outline" size="sm" className="h-7 text-destructive border-destructive/30 hover:bg-destructive/10">
                                        <XCircle className="w-3 h-3 mr-1" />
                                        Refuser
                                      </Button>
                                    </>
                                  )}
                                  {quote.auctionHouseStatus === 'accepted' && (
                                    <Button size="sm" className="h-7">
                                      Planifier collecte
                                    </Button>
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
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </div>
  );
}
