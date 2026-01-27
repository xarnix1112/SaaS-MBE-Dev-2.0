import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppHeader } from '@/components/layout/AppHeader';
import { QuoteTimeline } from '@/components/quotes/QuoteTimeline';
import { StatusBadge } from '@/components/quotes/StatusBadge';
import { AttachAuctionSheet } from '@/components/quotes/AttachAuctionSheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { mockQuotes } from '@/data/mockData';
import { AuctionSheetAnalysis } from '@/lib/auctionSheetAnalyzer';
import { Quote } from '@/types/quote';
import { toast } from 'sonner';
import { 
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  Package,
  Ruler,
  Euro,
  Image,
  Building2,
  CreditCard,
  Link as LinkIcon,
  MessageSquare,
  FileText,
  Clock,
  AlertTriangle,
  Send,
  Truck,
  Edit,
  Plus,
  ExternalLink,
  Copy,
  FileCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function QuoteDetail() {
  const { id } = useParams();
  const [quote, setQuote] = useState<Quote | undefined>(mockQuotes.find(q => q.id === id));
  const [auctionSheetAnalysis, setAuctionSheetAnalysis] = useState<AuctionSheetAnalysis | null>(
    quote?.auctionSheet ? {
      auctionHouse: quote.auctionSheet.auctionHouse,
      auctionDate: quote.auctionSheet.auctionDate,
      lots: [],
      totalLots: quote.auctionSheet.totalLots,
      totalObjects: quote.auctionSheet.totalObjects,
      rawText: quote.auctionSheet.rawText,
    } : null
  );
  const [isAuctionSheetDialogOpen, setIsAuctionSheetDialogOpen] = useState(false);

  if (!quote) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="Devis non trouvé" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Ce devis n'existe pas</p>
            <Link to="/">
              <Button>Retour au tableau de bord</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleAuctionSheetAnalysis = (analysis: AuctionSheetAnalysis) => {
    if (!quote) {
      return;
    }

    // Suppression UNIQUEMENT si l'utilisateur a explicitement retiré le bordereau
    if (analysis.removed) {
      setAuctionSheetAnalysis(null);
      const updatedQuote: Quote = { ...quote };
      updatedQuote.auctionSheet = undefined;
      setQuote(updatedQuote);
      toast.success('Bordereau retiré');
      return;
    }

    setAuctionSheetAnalysis(analysis);

    // Enrichir le devis avec les informations du bordereau
    const updatedQuote: Quote = { ...quote };
    
    const toShortLotDescription = (text: string): string => {
      const cleaned = (text || "").replace(/\s+/g, " ").trim();
      if (!cleaned) return "";
      const cutMatch = cleaned.match(/^(.{1,180}?)(?:[.;\n]|$)/);
      let short = (cutMatch?.[1] || cleaned).trim();
      if (short.length > 160) short = `${short.slice(0, 157).trim()}…`;
      return short;
    };

    // Mettre à jour les informations du lot avec le premier lot du bordereau
    if (analysis.lots.length > 0) {
      const firstLot = analysis.lots[0];
      
      // Mettre une description COURTE du lot (et non tout le texte OCR)
      const shortFromSheet = firstLot.description ? toShortLotDescription(firstLot.description) : "";
      const currentDesc = (updatedQuote.lot.description || "").trim();
      const isPlaceholderDesc = /^(objet\s+à\s+transporter|objet\s+a\s+transporter|objet)$/i.test(currentDesc);

      if ((currentDesc.length === 0 || isPlaceholderDesc) && shortFromSheet) {
        updatedQuote.lot.description = shortFromSheet;
      } else if (currentDesc.length > 180) {
        updatedQuote.lot.description = toShortLotDescription(currentDesc);
      }
      
      // Priorité aux dimensions du carton recommandé (inner ou required)
      const cartonDims = analysis.recommendedCarton?.required || analysis.recommendedCarton?.inner;
      if (cartonDims) {
        updatedQuote.lot.dimensions = {
          ...updatedQuote.lot.dimensions,
          length: Number(cartonDims.length) || updatedQuote.lot.dimensions.length || 0,
          width: Number(cartonDims.width) || updatedQuote.lot.dimensions.width || 0,
          height: Number(cartonDims.height) || updatedQuote.lot.dimensions.height || 0,
          weight: updatedQuote.lot.dimensions.weight || Number(firstLot.estimatedDimensions?.weight) || 0,
          estimated: true,
        };
      }

      // Mettre à jour les dimensions si elles sont vides ou nulles
      if (firstLot.estimatedDimensions) {
        const currentDims = updatedQuote.lot.dimensions;
        if (!currentDims.length || !currentDims.width || !currentDims.height || !currentDims.weight) {
          updatedQuote.lot.dimensions = {
            ...currentDims,
            length: currentDims.length || firstLot.estimatedDimensions.length,
            width: currentDims.width || firstLot.estimatedDimensions.width,
            height: currentDims.height || firstLot.estimatedDimensions.height,
            weight: currentDims.weight || firstLot.estimatedDimensions.weight,
            estimated: true,
          };
        }
      }
      
      // Mettre à jour la valeur si elle est vide
      if (firstLot.value && (!updatedQuote.lot.value || updatedQuote.lot.value === 0)) {
        updatedQuote.lot.value = firstLot.value;
      }
      
      // Mettre à jour la salle des ventes si elle n'est pas renseignée
      if (analysis.auctionHouse && (!updatedQuote.lot.auctionHouse || updatedQuote.lot.auctionHouse === 'Non précisée')) {
        updatedQuote.lot.auctionHouse = analysis.auctionHouse;
      }
      
      // Mettre à jour le numéro de lot si vide
      if (firstLot.lotNumber && (!updatedQuote.lot.number || updatedQuote.lot.number.startsWith('LOT-'))) {
        updatedQuote.lot.number = firstLot.lotNumber;
      }
    }
    
    // Ajouter les informations du bordereau
    updatedQuote.auctionSheet = {
      auctionHouse: analysis.auctionHouse,
      auctionDate: analysis.auctionDate,
      totalLots: analysis.totalLots,
      totalObjects: analysis.totalObjects,
      rawText: analysis.rawText,
    };
    
    setQuote(updatedQuote);
    toast.success('Devis enrichi avec les informations du bordereau !');
  };

  if (!quote) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="Devis non trouvé" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Ce devis n'existe pas</p>
            <Link to="/">
              <Button>Retour au tableau de bord</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const hasDimensionMismatch = quote.lot.realDimensions && (
    quote.lot.realDimensions.length !== quote.lot.dimensions.length ||
    quote.lot.realDimensions.width !== quote.lot.dimensions.width ||
    quote.lot.realDimensions.height !== quote.lot.dimensions.height ||
    quote.lot.realDimensions.weight !== quote.lot.dimensions.weight
  );

  return (
    <div className="flex flex-col h-full">
      <AppHeader 
        title={`Devis ${quote.reference}`}
        subtitle={`Lot ${quote.lot.number} • ${quote.client.name}`}
      />
      
      <div className="flex-1 p-6 overflow-auto">
        {/* Back + Actions */}
        <div className="flex items-center justify-between mb-6">
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" />
              Retour
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <StatusBadge status={quote.status} />
            <StatusBadge status={quote.paymentStatus} type="payment" />
          </div>
        </div>

        {/* Alerts */}
        {quote.verificationIssues.length > 0 && (
          <div className="alert-banner alert-warning mb-6">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Vérifications requises</p>
              <ul className="text-sm mt-1 space-y-1">
                {quote.verificationIssues.map((issue, i) => (
                  <li key={i}>• {issue.message}</li>
                ))}
              </ul>
            </div>
            <Button variant="outline" size="sm" className="gap-1">
              <Mail className="w-4 h-4" />
              Demander confirmation
            </Button>
          </div>
        )}

        {hasDimensionMismatch && (
          <div className="alert-banner alert-urgent mb-6">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Dimensions non conformes</p>
              <p className="text-sm mt-1">Les dimensions réelles diffèrent des estimations. Un surcoût peut être nécessaire.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1">
                <Plus className="w-4 h-4" />
                Ajouter surcoût
              </Button>
              <Button variant="outline" size="sm" className="gap-1">
                <LinkIcon className="w-4 h-4" />
                Nouveau lien
              </Button>
            </div>
          </div>
        )}


        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="info">
              <TabsList>
                <TabsTrigger value="info">Informations</TabsTrigger>
                <TabsTrigger value="payments">Paiements</TabsTrigger>
                <TabsTrigger value="messages">Messages</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-6 mt-6">
                {/* Client Info */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Informations client
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Nom</p>
                        <p className="font-medium">{quote.client.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="font-medium">{quote.client.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Téléphone</p>
                        <p className="font-medium">{quote.client.phone}</p>
                      </div>
                      {quote.verificationIssues.some(i => i.field === 'phone') && (
                        <Badge variant="warning" className="text-[10px]">À vérifier</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Adresse</p>
                        <p className="font-medium">{quote.client.address || 'Non renseignée'}</p>
                      </div>
                      {quote.verificationIssues.some(i => i.field === 'address') && (
                        <Badge variant="error" className="text-[10px]">Manquante</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Lot Info */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Informations du lot
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Numéro de lot</p>
                        <p className="font-medium">{quote.lot.number}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Salle des ventes</p>
                        <p className="font-medium flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {quote.lot.auctionHouse}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Description</p>
                      <p className="font-medium">{quote.lot.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Euro className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Valeur déclarée</p>
                        <p className="font-medium">{quote.lot.value}€</p>
                      </div>
                    </div>

                    {/* Dimensions */}
                    <Separator />
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                          <Ruler className="w-3 h-3" />
                          Dimensions estimées
                        </p>
                        <div className="bg-secondary/50 rounded-lg p-3 text-sm space-y-1">
                          <p>Longueur: {quote.lot.dimensions.length} cm</p>
                          <p>Largeur: {quote.lot.dimensions.width} cm</p>
                          <p>Hauteur: {quote.lot.dimensions.height} cm</p>
                          <p>Poids: {quote.lot.dimensions.weight} kg</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                          <Ruler className="w-3 h-3" />
                          Dimensions réelles
                        </p>
                        {quote.lot.realDimensions ? (
                          <div className={cn(
                            'rounded-lg p-3 text-sm space-y-1',
                            hasDimensionMismatch ? 'bg-destructive/10' : 'bg-success/10'
                          )}>
                            <p className={cn(
                              quote.lot.realDimensions.length !== quote.lot.dimensions.length && 'text-destructive font-medium'
                            )}>
                              Longueur: {quote.lot.realDimensions.length} cm
                            </p>
                            <p>Largeur: {quote.lot.realDimensions.width} cm</p>
                            <p>Hauteur: {quote.lot.realDimensions.height} cm</p>
                            <p>Poids: {quote.lot.realDimensions.weight} kg</p>
                          </div>
                        ) : (
                          <div className="bg-muted rounded-lg p-3 text-sm text-center text-muted-foreground">
                            Non mesuré
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Tracking */}
                {(quote.trackingNumber || quote.carrier) && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Truck className="w-4 h-4" />
                        Suivi expédition
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">Transporteur</p>
                          <p className="font-medium">{quote.carrier || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">N° de suivi</p>
                          <div className="flex items-center gap-2">
                            <code className="bg-muted px-2 py-1 rounded text-sm">
                              {quote.trackingNumber}
                            </code>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Copy className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="payments" className="space-y-6 mt-6">
                {/* Payment Summary */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      Récapitulatif
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span>Transport de base</span>
                      <span>{quote.totalAmount - (quote.options.insuranceAmount || 0) - (quote.options.expressAmount || 0)}€</span>
                    </div>
                    {quote.options.insurance && (
                      <div className="flex justify-between text-sm">
                        <span>Assurance</span>
                        <span>{quote.options.insuranceAmount}€</span>
                      </div>
                    )}
                    {quote.options.express && (
                      <div className="flex justify-between text-sm">
                        <span>Express</span>
                        <span>{quote.options.expressAmount}€</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Total</span>
                      <span>{quote.totalAmount}€</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Payment Links */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <LinkIcon className="w-4 h-4" />
                        Liens de paiement
                      </CardTitle>
                      <Button size="sm" className="gap-1">
                        <Plus className="w-4 h-4" />
                        Générer lien
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {quote.paymentLinks.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Aucun lien de paiement généré
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {quote.paymentLinks.map((link) => (
                          <div key={link.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                            <div>
                              <p className="font-medium">{link.amount}€</p>
                              <p className="text-xs text-muted-foreground">
                                Créé le {new Date(link.createdAt).toLocaleDateString('fr-FR')}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={link.status === 'paid' ? 'success' : link.status === 'expired' ? 'error' : 'info'}>
                                {link.status === 'paid' ? 'Payé' : link.status === 'expired' ? 'Expiré' : 'Actif'}
                              </Badge>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <Copy className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <Send className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="messages" className="space-y-6 mt-6">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        Historique des messages
                      </CardTitle>
                      <Button size="sm" className="gap-1">
                        <Mail className="w-4 h-4" />
                        Envoyer email
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {quote.messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Aucun message
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {quote.messages.map((message) => (
                          <div key={message.id} className="p-3 bg-secondary/50 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">{message.type}</Badge>
                                <span className="text-sm font-medium">{message.subject}</span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {new Date(message.date).toLocaleDateString('fr-FR')}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{message.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="notes" className="space-y-6 mt-6">
                {/* Internal Notes */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Notes internes
                      </CardTitle>
                      <Button variant="outline" size="sm" className="gap-1">
                        <Plus className="w-4 h-4" />
                        Ajouter
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {quote.internalNotes.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Aucune note interne
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {quote.internalNotes.map((note, i) => (
                          <li key={i} className="text-sm p-2 bg-secondary/50 rounded">
                            {note}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                {/* Auction House Comments */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      Commentaires salle des ventes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {quote.auctionHouseComments.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Aucun commentaire
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {quote.auctionHouseComments.map((comment, i) => (
                          <li key={i} className="text-sm p-2 bg-warning/10 rounded border-l-2 border-warning">
                            {comment}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar - Timeline */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Historique
                </CardTitle>
              </CardHeader>
              <CardContent>
                <QuoteTimeline events={quote.timeline} />
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-2"
                  onClick={() => setIsAuctionSheetDialogOpen(true)}
                >
                  <FileCheck className="w-4 h-4" />
                  {quote.auctionSheet ? 'Voir bordereau' : 'Attacher bordereau'}
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Edit className="w-4 h-4" />
                  Modifier le devis
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Mail className="w-4 h-4" />
                  Contacter le client
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <FileText className="w-4 h-4" />
                  Générer PDF
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <LinkIcon className="w-4 h-4" />
                  Générer lien paiement
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Dialogue pour attacher le bordereau */}
      <Dialog open={isAuctionSheetDialogOpen} onOpenChange={setIsAuctionSheetDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Attacher un bordereau d'adjudication</DialogTitle>
            <DialogDescription>
              Téléversez et analysez un bordereau d'adjudication pour enrichir automatiquement les informations du devis.
            </DialogDescription>
          </DialogHeader>
          <AttachAuctionSheet
            onAnalysisComplete={(analysis) => {
              handleAuctionSheetAnalysis(analysis);
              if (analysis.totalLots > 0) {
                setIsAuctionSheetDialogOpen(false);
              }
            }}
            existingAnalysis={auctionSheetAnalysis || undefined}
            fileName={quote.auctionSheet ? 'Bordereau attaché' : undefined}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
