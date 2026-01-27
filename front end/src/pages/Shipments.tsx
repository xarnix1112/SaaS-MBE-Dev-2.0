import { AppHeader } from '@/components/layout/AppHeader';
import { StatusBadge } from '@/components/quotes/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useQuotes } from "@/hooks/use-quotes";
import { doc, setDoc, Timestamp, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createTimelineEvent, getStatusDescription, timelineEventToFirestore } from "@/lib/quoteTimeline";
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
  User,
  Mail,
  Phone,
  MapPin,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';

export default function Shipments() {
  const { data: quotes = [], isLoading, isError } = useQuotes();
  const queryClient = useQueryClient();
  const [isShipmentDialogOpen, setIsShipmentDialogOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<any>(null);
  const [shipmentData, setShipmentData] = useState({
    carrier: '',
    shippingOption: '',
    trackingNumber: '',
  });

  const shipmentQuotes = quotes.filter(q => 
    ['awaiting_shipment', 'shipped', 'completed'].includes(q.status)
  );

  const awaitingShipment = shipmentQuotes.filter(q => q.status === 'awaiting_shipment');
  const shipped = shipmentQuotes.filter(q => q.status === 'shipped');
  const completed = shipmentQuotes.filter(q => q.status === 'completed');

  const handleOpenShipmentDialog = (quote: any) => {
    setSelectedQuote(quote);
    setShipmentData({
      carrier: quote.carrier || '',
      shippingOption: quote.options?.express ? 'express' : 'standard',
      trackingNumber: quote.trackingNumber || '',
    });
    setIsShipmentDialogOpen(true);
  };

  const handleShip = async () => {
    if (!selectedQuote) return;

    if (!shipmentData.carrier) {
      toast.error("Veuillez sélectionner un transporteur");
      return;
    }

    if (!shipmentData.shippingOption) {
      toast.error("Veuillez sélectionner une option de transport");
      return;
    }

    try {
      const quoteDoc = await getDoc(doc(db, 'quotes', selectedQuote.id));
      const existingData = quoteDoc.data();
      const existingTimeline = existingData?.timeline || selectedQuote.timeline || [];

      const timelineEvent = createTimelineEvent(
        'shipped',
        'Colis expédié'
      );

      const firestoreEvent = timelineEventToFirestore(timelineEvent);

      // Éviter les doublons (même description et statut dans les 5 dernières minutes)
      const fiveMinutesAgo = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
      const isDuplicate = existingTimeline.some(
        (e: any) =>
          e.status === 'shipped' &&
          e.description === timelineEvent.description &&
          (e.date?.toMillis ? e.date.toMillis() : new Date(e.date).getTime()) > fiveMinutesAgo.toMillis()
      );

      const updatedTimeline = isDuplicate 
        ? existingTimeline 
        : [...existingTimeline, firestoreEvent];

      await setDoc(
        doc(db, 'quotes', selectedQuote.id),
        {
          status: 'shipped',
          carrier: shipmentData.carrier,
          shippingOption: shipmentData.shippingOption,
          trackingNumber: shipmentData.trackingNumber || null,
          shippedAt: Timestamp.now(),
          timeline: updatedTimeline,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Colis marqué comme expédié');
      setIsShipmentDialogOpen(false);
      setSelectedQuote(null);
      setShipmentData({ carrier: '', shippingOption: '', trackingNumber: '' });
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la mise à jour du statut');
    }
  };

  // Générer l'URL de suivi selon le transporteur
  const getTrackingUrl = (carrier: string | undefined, trackingNumber: string | undefined): string | null => {
    if (!carrier || !trackingNumber) return null;

    const tracking = trackingNumber.trim();
    
    switch (carrier.toUpperCase()) {
      case 'UPS':
        // Format UPS : généralement 1Z... ou T... ou autres formats
        return `https://www.ups.com/track?tracknum=${encodeURIComponent(tracking)}`;
      
      case 'DHL':
        // Format DHL : généralement 10 chiffres
        return `https://www.dhl.com/fr-fr/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(tracking)}`;
      
      case 'TNT':
        // Format TNT : généralement 9 chiffres
        return `https://www.tnt.com/express/fr_fr/site/suivi-colis.html?searchType=con&cons=${encodeURIComponent(tracking)}`;
      
      case 'FEDEX':
        // Format FedEx : généralement 12 chiffres ou format mixte
        return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tracking)}`;
      
      default:
        return null;
    }
  };

  // Déterminer les informations du destinataire selon le mode de livraison
  const getRecipientInfo = (quote: any) => {
    if (!quote.delivery) {
      // Si pas de delivery, le client est le destinataire
      return {
        name: quote.client.name,
        email: quote.client.email,
        phone: quote.client.phone,
        address: quote.client.address,
        mode: 'client' as const,
      };
    }

    if (quote.delivery.mode === 'client') {
      // Le client est le destinataire
      return {
        name: quote.client.name,
        email: quote.client.email,
        phone: quote.client.phone,
        address: quote.client.address,
        mode: 'client' as const,
      };
    } else {
      // Destinataire différent ou point relais
      const addressParts = [
        quote.delivery.address.line1,
        quote.delivery.address.line2,
        quote.delivery.address.city,
        quote.delivery.address.zip,
        quote.delivery.address.country,
      ].filter(Boolean);
      
      return {
        name: quote.delivery.contact.name,
        email: quote.delivery.contact.email,
        phone: quote.delivery.contact.phone,
        address: addressParts.join(', '),
        mode: quote.delivery.mode,
      };
    }
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader 
        title="Expéditions" 
        subtitle="Gérez les envois et suivez les colis"
      />
      
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {isLoading && (
          <div className="text-center text-muted-foreground">Chargement...</div>
        )}
        {isError && (
          <div className="text-center text-destructive">
            Impossible de charger les devis Google Sheets
          </div>
        )}
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
                        ) : quote.status === 'shipped' || quote.status === 'completed' ? (
                          <span className="text-muted-foreground text-sm">Non renseigné</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {quote.trackingNumber ? (
                          <div className="flex items-center gap-1">
                            <code className="text-xs bg-muted px-2 py-1 rounded max-w-[120px] truncate">
                              {quote.trackingNumber}
                            </code>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6"
                              onClick={() => {
                                const trackingUrl = getTrackingUrl(quote.carrier, quote.trackingNumber);
                                if (trackingUrl) {
                                  window.open(trackingUrl, '_blank', 'noopener,noreferrer');
                                }
                              }}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : quote.status === 'shipped' || quote.status === 'completed' ? (
                          <span className="text-muted-foreground text-sm">Non renseigné</span>
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
                              <Button 
                                size="sm" 
                                className="h-7 gap-1"
                                onClick={() => handleOpenShipmentDialog(quote)}
                              >
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

      {/* Dialogue pour expédier un colis */}
      <Dialog open={isShipmentDialogOpen} onOpenChange={setIsShipmentDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Expédier le colis</DialogTitle>
            <DialogDescription>
              Vérifiez les informations client et destinataire, puis sélectionnez le transporteur et l'option de transport
            </DialogDescription>
          </DialogHeader>
          
          {selectedQuote && (() => {
            const recipientInfo = getRecipientInfo(selectedQuote);
            return (
              <div className="space-y-6 py-4">
                {/* Informations client */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-semibold">Informations client</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4 p-4 bg-secondary/50 rounded-lg">
                    <div>
                      <Label className="text-xs text-muted-foreground">Nom</Label>
                      <p className="font-medium">{selectedQuote.client.name}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Email</Label>
                      <p className="font-medium">{selectedQuote.client.email}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Téléphone</Label>
                      <p className="font-medium">{selectedQuote.client.phone}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Adresse</Label>
                      <p className="font-medium">{selectedQuote.client.address}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Informations destinataire */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-semibold">
                      Informations destinataire
                      {recipientInfo.mode === 'client' && (
                        <Badge variant="secondary" className="ml-2 text-xs">Client</Badge>
                      )}
                      {recipientInfo.mode === 'receiver' && (
                        <Badge variant="secondary" className="ml-2 text-xs">Destinataire différent</Badge>
                      )}
                      {recipientInfo.mode === 'pickup' && (
                        <Badge variant="secondary" className="ml-2 text-xs">Point relais UPS</Badge>
                      )}
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4 p-4 bg-secondary/50 rounded-lg">
                    <div>
                      <Label className="text-xs text-muted-foreground">Nom</Label>
                      <p className="font-medium">{recipientInfo.name}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Email</Label>
                      <p className="font-medium">{recipientInfo.email}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Téléphone</Label>
                      <p className="font-medium">{recipientInfo.phone}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Adresse</Label>
                      <p className="font-medium">{recipientInfo.address}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Informations d'expédition */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Informations d'expédition</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="carrier">Transporteur *</Label>
                      <Select
                        value={shipmentData.carrier}
                        onValueChange={(value) => setShipmentData({ ...shipmentData, carrier: value })}
                      >
                        <SelectTrigger id="carrier">
                          <SelectValue placeholder="Sélectionner un transporteur" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UPS">UPS</SelectItem>
                          <SelectItem value="DHL">DHL</SelectItem>
                          <SelectItem value="TNT">TNT</SelectItem>
                          <SelectItem value="FEDEX">FEDEX</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="shippingOption">Option de transport *</Label>
                      <Select
                        value={shipmentData.shippingOption}
                        onValueChange={(value) => setShipmentData({ ...shipmentData, shippingOption: value })}
                      >
                        <SelectTrigger id="shippingOption">
                          <SelectValue placeholder="Sélectionner une option" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="express">Express</SelectItem>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="economy">Économique</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="trackingNumber">Numéro de suivi (optionnel)</Label>
                    <Input
                      id="trackingNumber"
                      value={shipmentData.trackingNumber}
                      onChange={(e) => setShipmentData({ ...shipmentData, trackingNumber: e.target.value })}
                      placeholder="Ex: 1Z999AA10123456784"
                    />
                  </div>
                </div>
              </div>
            );
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsShipmentDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleShip}>
              <Send className="w-4 h-4 mr-2" />
              Expédier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
