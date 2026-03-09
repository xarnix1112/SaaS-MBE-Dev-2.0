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
import { useAuctionHouses } from "@/hooks/use-auction-houses";
import { authenticatedFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { parseAddressString, type ParsedAddress } from '@/lib/parseAddress';
import {
  Send,
  Truck,
  Building2,
  FileText,
  CheckCircle2,
  ExternalLink,
  Bell,
  Clock,
  User,
  MapPin,
  Loader2,
  Globe,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';

// Types pour les options de livraison MBE
interface MbeShippingOption {
  Service: string;
  ServiceDesc: string;
  Courier: string;
  CourierDesc?: string;
  CourierService?: string;
  CourierAccount?: string;
  GrossShipmentPrice?: number;
  NetShipmentPrice?: number;
}

/** Clé unique par option (Service peut être commun à plusieurs transporteurs) */
function getOptionId(o: MbeShippingOption) {
  return `${o.Service}__${o.Courier || ''}__${o.CourierService || ''}`;
}

export default function Shipments() {
  const { data: quotes = [], isLoading, isError } = useQuotes();
  const { houses: auctionHouses = [] } = useAuctionHouses();
  const queryClient = useQueryClient();
  const [isShipmentDialogOpen, setIsShipmentDialogOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<any>(null);
  const [mbehubStatus, setMbehubStatus] = useState<{ available: boolean; configured: boolean } | null>(null);
  const [shippingOptions, setShippingOptions] = useState<MbeShippingOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [sendingToHub, setSendingToHub] = useState(false);

  const [clientAddress, setClientAddress] = useState<ParsedAddress | null>(null);
  const [recipientAddress, setRecipientAddress] = useState<ParsedAddress | null>(null);
  const [selectedService, setSelectedService] = useState<string>('');
  const [weight, setWeight] = useState<number>(1);
  const [dimensions, setDimensions] = useState({ length: 10, width: 10, height: 10 });
  const [insurance, setInsurance] = useState(false);
  const [insuranceValue, setInsuranceValue] = useState(0);

  const awaitingShipment = quotes.filter(q => q.status === 'awaiting_shipment');
  const shipmentQuotesForTable = awaitingShipment;
  const shipped = quotes.filter(q => q.status === 'shipped');
  const completed = quotes.filter(q => q.status === 'completed');

  const loadMbehubStatus = useCallback(async () => {
    try {
      const res = await authenticatedFetch('/api/account/mbehub-status');
      if (res.ok) {
        const data = await res.json();
        setMbehubStatus(data);
      }
    } catch {
      setMbehubStatus(null);
    }
  }, []);

  useEffect(() => {
    loadMbehubStatus();
  }, [loadMbehubStatus]);

  const getRecipientInfo = (quote: any) => {
    if (!quote.delivery) {
      return {
        name: quote.client?.name,
        email: quote.client?.email,
        phone: quote.client?.phone,
        address: quote.client?.address,
        mode: 'client' as const,
      };
    }
    if (quote.delivery.mode === 'client') {
      return {
        name: quote.client?.name,
        email: quote.client?.email,
        phone: quote.client?.phone,
        address: quote.client?.address,
        mode: 'client' as const,
      };
    }
    const addr = quote.delivery.address;
    const addressParts = [addr?.line1, addr?.line2, addr?.city, addr?.zip, addr?.country].filter(Boolean);
    return {
      name: quote.delivery.contact?.name,
      email: quote.delivery.contact?.email,
      phone: quote.delivery.contact?.phone,
      address: addressParts.join(', '),
      mode: quote.delivery.mode,
    };
  };

  const getQuoteWeightAndDimensions = (quote: any) => {
    const lot = quote.lot || {};
    const dims = lot.dimensions || lot.realDimensions || {};
    const carton = quote.auctionSheet?.recommendedCarton || quote.auctionSheet?.cartons?.[0];
    const w = quote.totalWeight ?? lot.weight ?? lot.finalWeight ?? dims.weight ?? carton?.weight ?? 1;
    const l = carton?.inner_length ?? dims.length ?? 10;
    const wid = carton?.inner_width ?? dims.width ?? 10;
    const h = carton?.inner_height ?? dims.height ?? 10;
    return { weight: Number(w) || 1, length: Number(l) || 10, width: Number(wid) || 10, height: Number(h) || 10 };
  };

  const handleOpenShipmentDialog = async (quote: any) => {
    setSelectedQuote(quote);
    setSelectedService('');
    setShippingOptions([]);
    setLoadingOptions(true);

    const clientAddr = quote.client?.address || '';
    const recipientInfo = getRecipientInfo(quote);
    const recAddr = recipientInfo.address || '';

    setClientAddress(parseAddressString(clientAddr));

    // Utiliser l'adresse structurée quand disponible (delivery.address) pour éviter les erreurs de parsing
    let parsedRecipient: ParsedAddress;
    if (quote.delivery?.address && (quote.delivery.address.line1 || quote.delivery.address.city)) {
      const addr = quote.delivery.address;
      parsedRecipient = {
        street: addr.line1 || '',
        address2: addr.line2,
        city: addr.city || '',
        zip: addr.zip || '',
        state: addr.state,
        country: (addr.country || 'FR').toUpperCase().slice(0, 2),
        raw: recAddr,
      };
    } else {
      parsedRecipient = parseAddressString(recAddr);
    }
    setRecipientAddress(parsedRecipient);

    const { weight: w, length: l, width: wid, height: h } = getQuoteWeightAndDimensions(quote);
    setWeight(w);
    setDimensions({ length: l, width: wid, height: h });

    setInsurance(!!quote.options?.insurance);
    setInsuranceValue(quote.options?.insuranceAmount || 0);

    const dest = parseAddressString(recAddr);
    try {
      const res = await authenticatedFetch('/api/mbehub/shipping-options', {
        method: 'POST',
        body: JSON.stringify({
          destination: {
            zipCode: dest.zip,
            city: dest.city,
            state: dest.state,
            country: dest.country || 'FR',
          },
          weight: w,
          dimensions: { length: l, width: wid, height: h },
          insurance: !!quote.options?.insurance,
          insuranceValue: quote.options?.insuranceAmount || 0,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShippingOptions(data.options || []);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Impossible de charger les options de livraison');
      }
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors du chargement des options MBE');
    } finally {
      setLoadingOptions(false);
    }
    setIsShipmentDialogOpen(true);
  };

  const handleSendToMbeHub = async () => {
    if (!selectedQuote || !recipientAddress) return;
    if (!recipientAddress.street?.trim()) {
      toast.error('Adresse destinataire incomplète : renseignez l\'adresse');
      return;
    }
    if (!recipientAddress.city?.trim()) {
      toast.error('Adresse destinataire incomplète : renseignez la ville');
      return;
    }
    if (!recipientAddress.zip?.trim()) {
      toast.error('Adresse destinataire incomplète : renseignez le code postal');
      return;
    }
    if (!recipientAddress.country?.trim()) {
      toast.error('Adresse destinataire incomplète : renseignez le pays');
      return;
    }
    if (!selectedService) {
      toast.error('Sélectionnez un service de livraison');
      return;
    }
    const opt = shippingOptions.find((o) => getOptionId(o) === selectedService);
    if (!opt) {
      toast.error('Service invalide');
      return;
    }
    try {
      setSendingToHub(true);
      const recipientPayload = {
        name: getRecipientInfo(selectedQuote).name || recipientAddress.street,
        companyName: '',
        address: recipientAddress.street,
        address2: recipientAddress.address2,
        city: recipientAddress.city,
        zipCode: recipientAddress.zip,
        state: recipientAddress.state,
        country: recipientAddress.country || 'FR',
        email: getRecipientInfo(selectedQuote).email,
        phone: getRecipientInfo(selectedQuote).phone,
      };
      const res = await authenticatedFetch('/api/mbehub/create-draft', {
        method: 'POST',
        body: JSON.stringify({
          quoteId: selectedQuote.id,
          recipient: recipientPayload,
          service: opt.Service,
          courierService: opt.CourierService,
          courierAccount: opt.CourierAccount,
          weight,
          dimensions,
          reference: selectedQuote.reference,
          insurance,
          insuranceValue,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur MBE Hub');
      }
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      // Synchroniser le Bilan Google Sheet (suppression En cours, ajout Terminés)
      try {
        await authenticatedFetch(`/api/bilan/sync-quote/${selectedQuote.id}`, { method: 'POST' });
      } catch {
        // Non bloquant, le backend a déjà tenté la sync
      }
      toast.success(`Expédition créée en brouillon. N° MBE : ${data.mbeTrackingId || '-'}`);
      if (data.warning) toast.info(data.warning);
      setIsShipmentDialogOpen(false);
      setSelectedQuote(null);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l\'envoi vers MBE Hub');
    } finally {
      setSendingToHub(false);
    }
  };

  const getTrackingUrl = (carrier: string | undefined, trackingNumber: string | undefined): string | null => {
    if (!carrier || !trackingNumber) return null;
    const t = String(trackingNumber).trim();
    switch (String(carrier).toUpperCase()) {
      case 'UPS':
        return `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}`;
      case 'DHL':
        return `https://www.dhl.com/fr-fr/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(t)}`;
      case 'TNT':
        return `https://www.tnt.com/express/fr_fr/site/suivi-colis.html?searchType=con&cons=${encodeURIComponent(t)}`;
      case 'FEDEX':
        return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`;
      default:
        return null;
    }
  };

  const canShowMbeHubButton = mbehubStatus?.available && mbehubStatus?.configured;

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="Expéditions" subtitle="Envoyez les colis vers MBE Hub (brouillon). Le Centre finalise et imprime les étiquettes." />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {isLoading && <div className="text-center text-muted-foreground">Chargement...</div>}
        {isError && <div className="text-center text-destructive">Impossible de charger les devis</div>}

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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="w-4 h-4" />
              Liste des expéditions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {shipmentQuotesForTable.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <p className="text-muted-foreground">Aucun devis en attente d'envoi</p>
                <p className="text-sm text-muted-foreground">
                  Les devis envoyés vers MBE Hub sont visibles dans{' '}
                  <Link to="/quotes/shipped" className="text-primary hover:underline">Expédiés</Link>.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Transporteur / MBE</TableHead>
                    <TableHead>N° Suivi</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipmentQuotesForTable.map((quote) => (
                    <TableRow key={quote.id}>
                      <TableCell>
                        <Link to={`/quotes/${quote.id}`} className="font-medium text-primary hover:underline">
                          {quote.reference}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{quote.client?.name}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-40">{quote.client?.address}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{quote.lot?.number}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-32">{quote.lot?.description}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {quote.mbeTrackingId ? (
                          <Badge variant="secondary" className="gap-1">
                            <Globe className="w-3 h-3" />
                            MBE
                          </Badge>
                        ) : quote.carrier ? (
                          <Badge variant="secondary">{quote.carrier}</Badge>
                        ) : quote.status === 'shipped' || quote.status === 'completed' ? (
                          <span className="text-muted-foreground text-sm">-</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {quote.mbeTrackingId ? (
                          <code className="text-xs bg-muted px-2 py-1 rounded max-w-[140px] truncate block">
                            {quote.mbeTrackingId}
                          </code>
                        ) : quote.trackingNumber ? (
                          <div className="flex items-center gap-1">
                            <code className="text-xs bg-muted px-2 py-1 rounded max-w-[120px] truncate">
                              {quote.trackingNumber}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => {
                                const u = getTrackingUrl(quote.carrier, quote.trackingNumber);
                                if (u) window.open(u, '_blank', 'noopener,noreferrer');
                              }}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <StatusBadge status={quote.status} />
                          {quote.surchargePending && (
                            <Badge variant="outline" className="text-[10px] w-fit bg-warning/10 text-warning-foreground border-warning/30">
                              Surcoût envoyé – en attente
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {quote.status === 'awaiting_shipment' && !quote.surchargePending && (
                            canShowMbeHubButton ? (
                              <Button size="sm" className="h-7 gap-1" onClick={() => handleOpenShipmentDialog(quote)}>
                                <Globe className="w-3 h-3" />
                                Envoyer vers MBE Hub
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Configurez MBE Hub (Paramètres)
                              </span>
                            )
                          )}
                          {quote.status === 'sent_to_mbe_hub' && (
                            <Link to="/quotes/shipped">
                              <Badge variant="outline" className="gap-1">
                                <Send className="w-3 h-3" />
                                Envoyé
                              </Badge>
                            </Link>
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

      <Dialog open={isShipmentDialogOpen} onOpenChange={setIsShipmentDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Envoyer vers MBE Hub</DialogTitle>
            <DialogDescription>
              Vérifiez/corrigez les adresses client et destinataire, choisissez le service. L'expédition sera créée en brouillon ; le Centre MBE finalise et imprime.
            </DialogDescription>
          </DialogHeader>

          {selectedQuote && clientAddress && recipientAddress && (
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <h3 className="font-semibold">Client</h3>
                </div>
                <div className="grid grid-cols-2 gap-4 p-4 bg-secondary/50 rounded-lg">
                  <div>
                    <Label className="text-xs text-muted-foreground">Nom</Label>
                    <p className="font-medium">{selectedQuote.client?.name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Adresse</Label>
                    <p className="font-medium text-sm">{clientAddress.raw || 'Non renseignée'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      Salle des ventes
                    </Label>
                    <p className="font-medium">
                      {(selectedQuote.lot?.auctionHouse || selectedQuote.auctionSheet?.auctionHouse || selectedQuote.lotAuctionHouse || '') || 'Non renseignée'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">ID client MBE (Expéditions)</Label>
                    <p className="font-medium font-mono text-sm">
                      {(() => {
                        const auctionHouseName = (selectedQuote.lot?.auctionHouse || selectedQuote.auctionSheet?.auctionHouse || selectedQuote.lotAuctionHouse || '').trim();
                        const norm = (s: string) => (s || '').trim().toLowerCase();
                        const matched = auctionHouses.find((h) => norm(h.name) === norm(auctionHouseName));
                        return matched?.mbeCustomerId ? matched.mbeCustomerId : 'Non configuré';
                      })()}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <h3 className="font-semibold">Destinataire (modifiable)</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Rue</Label>
                    <Input
                      value={recipientAddress.street}
                      onChange={(e) => setRecipientAddress({ ...recipientAddress, street: e.target.value })}
                      placeholder="Adresse ligne 1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Complément</Label>
                    <Input
                      value={recipientAddress.address2 || ''}
                      onChange={(e) => setRecipientAddress({ ...recipientAddress, address2: e.target.value })}
                      placeholder="Ligne 2"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Code postal</Label>
                    <Input
                      value={recipientAddress.zip}
                      onChange={(e) => setRecipientAddress({ ...recipientAddress, zip: e.target.value })}
                      placeholder="CP"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ville</Label>
                    <Input
                      value={recipientAddress.city}
                      onChange={(e) => setRecipientAddress({ ...recipientAddress, city: e.target.value })}
                      placeholder="Ville"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Pays (code)</Label>
                    <Input
                      value={recipientAddress.country}
                      onChange={(e) => setRecipientAddress({ ...recipientAddress, country: e.target.value.toUpperCase().slice(0, 2) })}
                      placeholder="FR, IT, etc."
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-semibold">Poids & dimensions</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Poids (kg)</Label>
                    <Input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={weight}
                      onChange={(e) => setWeight(parseFloat(e.target.value) || 1)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>L (cm)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={dimensions.length}
                      onChange={(e) => setDimensions({ ...dimensions, length: parseInt(e.target.value, 10) || 10 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>l (cm)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={dimensions.width}
                      onChange={(e) => setDimensions({ ...dimensions, width: parseInt(e.target.value, 10) || 10 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>H (cm)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={dimensions.height}
                      onChange={(e) => setDimensions({ ...dimensions, height: parseInt(e.target.value, 10) || 10 })}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-semibold">Service de livraison *</h3>
                {loadingOptions ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Chargement des options...
                  </div>
                ) : (
                  <Select value={selectedService} onValueChange={setSelectedService}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir un service" />
                    </SelectTrigger>
                    <SelectContent>
                      {shippingOptions.map((o) => (
                        <SelectItem key={getOptionId(o)} value={getOptionId(o)}>
                          {o.ServiceDesc} ({o.Courier}) – {o.GrossShipmentPrice != null ? `${Number(o.GrossShipmentPrice).toFixed(2)} €` : '-'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsShipmentDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSendToMbeHub} disabled={sendingToHub || !selectedService}>
              {sendingToHub ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Globe className="w-4 h-4 mr-2" />}
              Envoyer vers MBE Hub
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
