import { AppHeader } from '@/components/layout/AppHeader';
import { StatusBadge } from '@/components/quotes/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuotes } from "@/hooks/use-quotes";
import { doc, setDoc, Timestamp, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authenticatedFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { calculateVolumetricWeight } from "@/lib/pricing";
import { createTimelineEvent, timelineEventToFirestore } from "@/lib/quoteTimeline";
import { createPaiement } from "@/lib/stripeConnect";
import type { Paiement } from "@/types/stripe";
import type { Quote } from "@/types/quote";
import { 
  Package,
  Ruler,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Plus,
  Send,
  Truck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const SURCHARGE_REASONS: { value: string; label: string }[] = [
  { value: 'dimensions_reelles', label: 'Dimensions réelles supérieures aux estimations' },
  { value: 'poids_reel', label: 'Poids réel supérieur aux estimations' },
  { value: 'emballage_supplementaire', label: 'Emballage supplémentaire' },
  { value: 'frais_douane', label: 'Frais de douane / dédouanement' },
  { value: 'assurance_complementaire', label: 'Assurance complémentaire' },
  { value: 'livraison_express', label: 'Livraison express' },
  { value: 'autre', label: 'Autre' },
];

export default function Preparation() {
  const { data: quotes = [], isLoading, isError } = useQuotes();
  const queryClient = useQueryClient();
  const [isDimensionsDialogOpen, setIsDimensionsDialogOpen] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({
    length: '',
    width: '',
    height: '',
    weight: '',
  });

  // Dialog Ajouter surcoût (2 étapes)
  const [isAddSurchargeDialogOpen, setIsAddSurchargeDialogOpen] = useState(false);
  const [selectedQuoteForSurcharge, setSelectedQuoteForSurcharge] = useState<Quote | null>(null);
  const [surchargeAmount, setSurchargeAmount] = useState('');
  const [surchargeStep, setSurchargeStep] = useState<1 | 2>(1);
  const [createdSurcharge, setCreatedSurcharge] = useState<Paiement | null>(null);
  const [surchargeReason, setSurchargeReason] = useState('dimensions_reelles');
  const [surchargeReasonOther, setSurchargeReasonOther] = useState('');
  const [isCreatingSurcharge, setIsCreatingSurcharge] = useState(false);
  const [isSendingSurchargeEmail, setIsSendingSurchargeEmail] = useState(false);

  // Dialog Expédier sans surcoût (confirmation)
  const [isBypassConfirmOpen, setIsBypassConfirmOpen] = useState(false);
  const [selectedQuoteForBypass, setSelectedQuoteForBypass] = useState<Quote | null>(null);
  const [isBypassing, setIsBypassing] = useState(false);
  
  // Inclure les colis collectés, en préparation, ou en attente de surcoût (awaiting_shipment + surchargePending)
  const preparationQuotes = quotes.filter(q =>
    q.status === 'collected' ||
    q.status === 'preparation' ||
    (q.status === 'awaiting_shipment' && q.surchargePending)
  );
  const collectedQuotes = preparationQuotes.filter(q => q.status === 'collected');
  const inPreparationQuotes = preparationQuotes.filter(q =>
    q.status === 'preparation' || (q.status === 'awaiting_shipment' && q.surchargePending)
  );

  const handleOpenDimensionsDialog = (quoteId: string, isEdit: boolean = false) => {
    const quote = quotes.find(q => q.id === quoteId);
    if (quote) {
      setSelectedQuoteId(quoteId);
      // Si on modifie des dimensions existantes, pré-remplir avec les dimensions réelles
      // Sinon, pré-remplir avec les dimensions estimées
      if (isEdit && quote.lot.realDimensions) {
        setDimensions({
          length: quote.lot.realDimensions.length?.toString() || '',
          width: quote.lot.realDimensions.width?.toString() || '',
          height: quote.lot.realDimensions.height?.toString() || '',
          weight: quote.lot.realDimensions.weight?.toString() || '',
        });
      } else {
        setDimensions({
          length: quote.lot.dimensions.length?.toString() || '',
          width: quote.lot.dimensions.width?.toString() || '',
          height: quote.lot.dimensions.height?.toString() || '',
          weight: quote.lot.dimensions.weight?.toString() || '',
        });
      }
      setIsDimensionsDialogOpen(true);
    }
  };

  const handleSaveDimensions = async () => {
    if (!selectedQuoteId) return;

    const length = parseFloat(dimensions.length);
    const width = parseFloat(dimensions.width);
    const height = parseFloat(dimensions.height);
    const weight = parseFloat(dimensions.weight);

    if (isNaN(length) || isNaN(width) || isNaN(height) || isNaN(weight)) {
      toast.error("Veuillez saisir des valeurs numériques valides");
      return;
    }

    if (length <= 0 || width <= 0 || height <= 0 || weight <= 0) {
      toast.error("Les dimensions et le poids doivent être supérieurs à 0");
      return;
    }

    try {
      await setDoc(
        doc(db, 'quotes', selectedQuoteId),
        {
          realDimensions: {
            length: length,
            width: width,
            height: height,
            weight: weight,
            estimated: false, // Dimensions réelles, pas estimées
          },
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success("Dimensions réelles enregistrées");
      setIsDimensionsDialogOpen(false);
      setSelectedQuoteId(null);
      setDimensions({ length: '', width: '', height: '', weight: '' });
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des dimensions:', error);
      toast.error("Erreur lors de la sauvegarde des dimensions");
    }
  };

  const handleReadyForShipment = async (quoteId: string) => {
    try {
      const quote = quotes.find(q => q.id === quoteId);
      if (!quote) return;

      const res = await authenticatedFetch(`/api/devis/${quoteId}/mark-awaiting-shipment`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de la mise à jour');
      }
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Colis prêt pour expédition');
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la mise à jour du statut');
    }
  };

  // Démarrer la préparation d'un colis collecté
  const handleStartPreparation = async (quoteId: string) => {
    try {
      const quote = quotes.find(q => q.id === quoteId);
      if (!quote) return;

      const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
      const existingData = quoteDoc.data();
      const existingTimeline = existingData?.timeline || quote.timeline || [];

      const timelineEvent = createTimelineEvent('preparation', 'Préparation du colis démarrée');
      const firestoreEvent = timelineEventToFirestore(timelineEvent);

      const fiveMinutesAgo = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
      const isDuplicate = existingTimeline.some(
        (e: any) =>
          e.status === 'preparation' &&
          e.description === timelineEvent.description &&
          (e.date?.toMillis ? e.date.toMillis() : new Date(e.date).getTime()) > fiveMinutesAgo.toMillis()
      );

      const updatedTimeline = isDuplicate
        ? existingTimeline
        : [...existingTimeline, firestoreEvent];

      await setDoc(
        doc(db, 'quotes', quoteId),
        {
          status: 'preparation',
          timeline: updatedTimeline,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Préparation démarrée');
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors du démarrage de la préparation');
    }
  };

  // Calcul du montant suggéré pour le surcoût (différence de poids facturé × 2 €/kg)
  const getSuggestedSurchargeAmount = (quote: Quote): number => {
    const estimatedVol = calculateVolumetricWeight(
      quote.lot.dimensions.length,
      quote.lot.dimensions.width,
      quote.lot.dimensions.height
    );
    const estimatedBilling = Math.max(estimatedVol, quote.lot.dimensions.weight);
    const realVol = quote.lot.realDimensions
      ? calculateVolumetricWeight(
          quote.lot.realDimensions.length,
          quote.lot.realDimensions.width,
          quote.lot.realDimensions.height
        )
      : 0;
    const realBilling = quote.lot.realDimensions
      ? Math.max(realVol, quote.lot.realDimensions.weight)
      : 0;
    const diff = Math.max(0, realBilling - estimatedBilling);
    return Math.round(diff * 2 * 100) / 100;
  };

  const handleOpenAddSurcharge = (quote: Quote) => {
    setSelectedQuoteForSurcharge(quote);
    const suggested = getSuggestedSurchargeAmount(quote);
    setSurchargeAmount(suggested > 0 ? suggested.toString() : '');
    setSurchargeStep(1);
    setCreatedSurcharge(null);
    setSurchargeReason('dimensions_reelles');
    setSurchargeReasonOther('');
    setIsAddSurchargeDialogOpen(true);
  };

  const handleCreateSurcharge = async () => {
    if (!selectedQuoteForSurcharge) return;
    const amountNum = parseFloat(surchargeAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Montant invalide');
      return;
    }
    setIsCreatingSurcharge(true);
    try {
      const response = await createPaiement(selectedQuoteForSurcharge.id, {
        amount: amountNum,
        type: 'SURCOUT',
        description: 'Surcoût dimensions non conformes',
      });
      setCreatedSurcharge({
        id: response.paiementId,
        devisId: selectedQuoteForSurcharge.id,
        clientSaasId: selectedQuoteForSurcharge.saasAccountId || '',
        stripeSessionId: response.sessionId,
        url: response.url,
        stripeCheckoutUrl: response.url,
        amount: amountNum,
        type: 'SURCOUT',
        status: 'PENDING',
        description: 'Surcoût dimensions non conformes',
      } as Paiement);
      setSurchargeStep(2);
      toast.success('Lien de paiement créé');
    } catch (error) {
      console.error('Erreur création surcoût:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la création du surcoût');
    } finally {
      setIsCreatingSurcharge(false);
    }
  };

  const handleSendSurchargeEmail = async () => {
    if (!selectedQuoteForSurcharge || !createdSurcharge) return;
    const rd = selectedQuoteForSurcharge.lot?.realDimensions;
    const hasRealDimensions = rd &&
      (rd.length ?? 0) > 0 && (rd.width ?? 0) > 0 &&
      (rd.height ?? 0) > 0 && (rd.weight ?? 0) > 0;
    if (!hasRealDimensions) {
      toast.error('Saisissez les dimensions réelles avant d\'envoyer le surcoût');
      return;
    }
    const description =
      surchargeReason === 'autre'
        ? surchargeReasonOther.trim()
        : SURCHARGE_REASONS.find((r) => r.value === surchargeReason)?.label ?? '';
    if (surchargeReason === 'autre' && !description) {
      toast.error('Veuillez préciser la raison du surcoût');
      return;
    }
    const clientEmail =
      selectedQuoteForSurcharge.client?.email ||
      selectedQuoteForSurcharge.delivery?.contact?.email;
    if (!clientEmail) {
      toast.error('Email client manquant');
      return;
    }
    setIsSendingSurchargeEmail(true);
    try {
      const response = await authenticatedFetch('/api/send-surcharge-email', {
        method: 'POST',
        body: JSON.stringify({
          quote: selectedQuoteForSurcharge,
          surchargePaiement: {
            id: createdSurcharge.id,
            amount: createdSurcharge.amount,
            description: description || 'Surcoût supplémentaire',
            url: createdSurcharge.url || createdSurcharge.stripeCheckoutUrl,
          },
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const msg = err.error || `Erreur serveur (${response.status})`;
        toast.error(msg, err.hint ? { description: err.hint } : undefined);
        return;
      }
      const quoteDoc = await getDoc(doc(db, 'quotes', selectedQuoteForSurcharge.id));
      const existingData = quoteDoc.data() || {};
      const existingTimeline = existingData.timeline || [];
      const timelineEvent = createTimelineEvent(
        'preparation',
        `Email surcoût envoyé au client (${clientEmail}) - ${createdSurcharge.amount.toFixed(2)}€ - En attente de paiement`
      );
      const updatedTimeline = [...existingTimeline, timelineEventToFirestore(timelineEvent)];
      await setDoc(
        doc(db, 'quotes', selectedQuoteForSurcharge.id),
        {
          status: 'preparation',
          surchargePending: true,
          timeline: updatedTimeline,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success(`Email surcoût envoyé à ${clientEmail}`);
      setIsAddSurchargeDialogOpen(false);
      setSelectedQuoteForSurcharge(null);
      setCreatedSurcharge(null);
    } catch (error) {
      console.error('Erreur envoi email surcoût:', error);
      toast.error('Erreur lors de l\'envoi de l\'email surcoût');
    } finally {
      setIsSendingSurchargeEmail(false);
    }
  };

  const handleCloseAddSurcharge = () => {
    setIsAddSurchargeDialogOpen(false);
    setSelectedQuoteForSurcharge(null);
    setCreatedSurcharge(null);
    setSurchargeStep(1);
  };

  const handleOpenBypassConfirm = (quote: Quote) => {
    setSelectedQuoteForBypass(quote);
    setIsBypassConfirmOpen(true);
  };

  const handleBypassAndShip = async () => {
    if (!selectedQuoteForBypass) return;
    setIsBypassing(true);
    try {
      const quoteDoc = await getDoc(doc(db, 'quotes', selectedQuoteForBypass.id));
      const existingTimeline = quoteDoc.data()?.timeline || [];
      const timelineEvent = createTimelineEvent(
        'awaiting_shipment',
        'Expédié sans surcoût malgré dimensions non conformes'
      );
      const updatedTimeline = [...existingTimeline, timelineEventToFirestore(timelineEvent)];
      await setDoc(
        doc(db, 'quotes', selectedQuoteForBypass.id),
        { timeline: updatedTimeline, updatedAt: Timestamp.now() },
        { merge: true }
      );
      const res = await authenticatedFetch(
        `/api/devis/${selectedQuoteForBypass.id}/mark-awaiting-shipment`,
        { method: 'POST' }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de la mise à jour');
      }
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Colis marqué prêt pour expédition');
      setIsBypassConfirmOpen(false);
      setSelectedQuoteForBypass(null);
    } catch (error) {
      console.error('Erreur bypass expédition:', error);
      toast.error('Erreur lors de la mise à jour du statut');
    } finally {
      setIsBypassing(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader 
        title="Préparation des colis" 
        subtitle="Vérifiez les dimensions et préparez les expéditions"
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
        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Dimensions conformes
          </Badge>
          <Badge variant="error" className="gap-1">
            <AlertTriangle className="w-3 h-3" />
            Dimensions non conformes
          </Badge>
        </div>

        {/* Colis collectés - en attente de préparation */}
        {collectedQuotes.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Colis collectés ({collectedQuotes.length}) — Cliquez pour démarrer la préparation
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {collectedQuotes.map((quote) => (
                <Card key={quote.id} className="card-hover">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Package className="w-4 h-4" />
                          {quote.lot.number}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {quote.reference} • {quote.client.name}
                        </p>
                      </div>
                      <StatusBadge status={quote.status} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm mb-3">{quote.lot.description}</p>
                    <Button
                      size="sm"
                      className="gap-1"
                      onClick={() => handleStartPreparation(quote.id)}
                    >
                      <Package className="w-4 h-4" />
                      Démarrer la préparation
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Colis en cours de préparation */}
        {inPreparationQuotes.length > 0 && (
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Ruler className="w-4 h-4" />
            En cours de préparation ({inPreparationQuotes.length})
          </h3>
        )}

        {/* Preparation Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {inPreparationQuotes.map((quote) => {
            // Calculer le poids volumétrique estimé et réel
            // Le poids facturé est le maximum entre le poids volumétrique et le poids réel
            const estimatedVolumetricWeight = calculateVolumetricWeight(
              quote.lot.dimensions.length,
              quote.lot.dimensions.width,
              quote.lot.dimensions.height
            );
            const estimatedBillingWeight = Math.max(estimatedVolumetricWeight, quote.lot.dimensions.weight);
            
            // Calculer le poids volumétrique et facturé réel seulement si les dimensions réelles existent
            let realVolumetricWeight = 0;
            let realBillingWeight = 0;
            if (quote.lot.realDimensions) {
              realVolumetricWeight = calculateVolumetricWeight(
                quote.lot.realDimensions.length,
                quote.lot.realDimensions.width,
                quote.lot.realDimensions.height
              );
              realBillingWeight = Math.max(realVolumetricWeight, quote.lot.realDimensions.weight);
            }
            
            // L'alerte "Dimensions non conformes" ne s'affiche que si le poids facturé réel est supérieur au poids facturé estimé
            // Car c'est dans ce cas qu'un surcoût est nécessaire
            const hasDimensionMismatch = quote.lot.realDimensions && realBillingWeight > estimatedBillingWeight;

            return (
              <Card key={quote.id} className={cn(
                'card-hover',
                hasDimensionMismatch && 'border-destructive/50'
              )}>
                {hasDimensionMismatch && (
                  <div className="alert-banner alert-urgent rounded-t-lg rounded-b-none border-l-0 border-t-0 border-r-0">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Dimensions non conformes</p>
                      <p className="text-xs mt-0.5">Un surcoût peut être nécessaire</p>
                    </div>
                  </div>
                )}
                
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        {quote.lot.number}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {quote.reference} • {quote.client.name}
                      </p>
                    </div>
                    <StatusBadge status={quote.status} />
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Lot Description */}
                  <p className="text-sm">{quote.lot.description}</p>

                  {/* Dimensions Comparison */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Estimated */}
                    <div className="bg-secondary/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Ruler className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Estimées</span>
                        <Badge variant="secondary" className="text-[10px]">Devis</Badge>
                      </div>
                      <div className="space-y-1 text-sm">
                        <p>L: {quote.lot.dimensions.length} cm</p>
                        <p>l: {quote.lot.dimensions.width} cm</p>
                        <p>H: {quote.lot.dimensions.height} cm</p>
                        <p>Poids: {quote.lot.dimensions.weight} kg</p>
                      </div>
                    </div>

                    {/* Real */}
                    <div className={cn(
                      'rounded-lg p-3',
                      quote.lot.realDimensions 
                        ? hasDimensionMismatch 
                          ? 'bg-destructive/10' 
                          : 'bg-success/10'
                        : 'bg-muted border-2 border-dashed border-muted-foreground/20'
                    )}>
                      <div className="flex items-center gap-2 mb-2">
                        <Ruler className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Réelles</span>
                        {quote.lot.realDimensions && (
                          hasDimensionMismatch 
                            ? <Badge variant="error" className="text-[10px]">Différent</Badge>
                            : <Badge variant="success" className="text-[10px]">Conforme</Badge>
                        )}
                      </div>
                      {quote.lot.realDimensions ? (
                        <div className="space-y-2">
                          <div className="space-y-1 text-sm">
                            <p className={cn(
                              quote.lot.realDimensions.length !== quote.lot.dimensions.length && 'text-destructive font-medium'
                            )}>
                              L: {quote.lot.realDimensions.length} cm
                              {quote.lot.realDimensions.length !== quote.lot.dimensions.length && (
                                <span className="text-xs ml-1">
                                  (+{quote.lot.realDimensions.length - quote.lot.dimensions.length})
                                </span>
                              )}
                            </p>
                            <p className={cn(
                              quote.lot.realDimensions.width !== quote.lot.dimensions.width && 'text-destructive font-medium'
                            )}>
                              l: {quote.lot.realDimensions.width} cm
                            </p>
                            <p className={cn(
                              quote.lot.realDimensions.height !== quote.lot.dimensions.height && 'text-destructive font-medium'
                            )}>
                              H: {quote.lot.realDimensions.height} cm
                            </p>
                            <p className={cn(
                              quote.lot.realDimensions.weight !== quote.lot.dimensions.weight && 'text-destructive font-medium'
                            )}>
                              Poids: {quote.lot.realDimensions.weight} kg
                            </p>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full mt-2"
                            onClick={() => handleOpenDimensionsDialog(quote.id, true)}
                          >
                            Modifier
                          </Button>
                        </div>
                      ) : (
                        <div className="text-center py-4">
                          <p className="text-sm text-muted-foreground">Non mesuré</p>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="mt-2"
                            onClick={() => handleOpenDimensionsDialog(quote.id)}
                          >
                            Saisir dimensions
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    {hasDimensionMismatch && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => handleOpenAddSurcharge(quote)}
                        >
                          <Plus className="w-4 h-4" />
                          Ajouter surcoût
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => handleOpenBypassConfirm(quote)}
                        >
                          <Send className="w-4 h-4" />
                          Expédier sans surcoût
                        </Button>
                      </>
                    )}
                    {!hasDimensionMismatch && quote.lot.realDimensions && (
                      <Button 
                        size="sm" 
                        className="gap-1"
                        onClick={() => handleReadyForShipment(quote.id)}
                      >
                        <ArrowRight className="w-4 h-4" />
                        Prêt pour expédition
                      </Button>
                    )}
                    <Link to={`/quotes/${quote.id}`} className="ml-auto">
                      <Button variant="ghost" size="sm">
                        Voir détails
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {preparationQuotes.length === 0 && (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Aucun colis collecté ou en préparation</p>
            <p className="text-sm text-muted-foreground mt-2">
              Les colis marqués comme collectés dans l'onglet Collectes apparaîtront ici.
            </p>
          </div>
        )}
      </div>

      {/* Dialogue pour saisir les dimensions réelles */}
      <Dialog open={isDimensionsDialogOpen} onOpenChange={setIsDimensionsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedQuoteId && quotes.find(q => q.id === selectedQuoteId)?.lot.realDimensions
                ? 'Modifier les dimensions réelles du colis'
                : 'Saisir les dimensions réelles du colis'}
            </DialogTitle>
            <DialogDescription>
              {selectedQuoteId && quotes.find(q => q.id === selectedQuoteId)?.lot.realDimensions
                ? 'Modifiez les dimensions réelles du colis emballé (en cm et kg)'
                : 'Mesurez le colis emballé et saisissez les dimensions réelles (en cm et kg)'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="real-length">Longueur (cm) *</Label>
                <Input
                  id="real-length"
                  type="number"
                  step="0.1"
                  min="0"
                  value={dimensions.length}
                  onChange={(e) => setDimensions({ ...dimensions, length: e.target.value })}
                  placeholder="Ex: 50"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="real-width">Largeur (cm) *</Label>
                <Input
                  id="real-width"
                  type="number"
                  step="0.1"
                  min="0"
                  value={dimensions.width}
                  onChange={(e) => setDimensions({ ...dimensions, width: e.target.value })}
                  placeholder="Ex: 40"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="real-height">Hauteur (cm) *</Label>
                <Input
                  id="real-height"
                  type="number"
                  step="0.1"
                  min="0"
                  value={dimensions.height}
                  onChange={(e) => setDimensions({ ...dimensions, height: e.target.value })}
                  placeholder="Ex: 30"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="real-weight">Poids (kg) *</Label>
                <Input
                  id="real-weight"
                  type="number"
                  step="0.1"
                  min="0"
                  value={dimensions.weight}
                  onChange={(e) => setDimensions({ ...dimensions, weight: e.target.value })}
                  placeholder="Ex: 2.5"
                  required
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDimensionsDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSaveDimensions}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue Ajouter surcoût (2 étapes) */}
      <Dialog open={isAddSurchargeDialogOpen} onOpenChange={(open) => !open && handleCloseAddSurcharge()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {surchargeStep === 1 ? 'Ajouter un surcoût' : 'Envoyer l\'email au client'}
            </DialogTitle>
            <DialogDescription>
              {surchargeStep === 1
                ? 'Le montant est suggéré selon la différence de poids facturé (× 2 €/kg). Vous pouvez le modifier.'
                : 'Surcoût créé. Souhaitez-vous envoyer l\'email au client maintenant ?'}
            </DialogDescription>
          </DialogHeader>
          {surchargeStep === 1 ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="surcharge-amount">Montant (€)</Label>
                <Input
                  id="surcharge-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={surchargeAmount}
                  onChange={(e) => setSurchargeAmount(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseAddSurcharge}>
                  Annuler
                </Button>
                <Button onClick={handleCreateSurcharge} disabled={isCreatingSurcharge || !surchargeAmount}>
                  {isCreatingSurcharge ? 'Création...' : 'Créer le lien de paiement'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-sm font-medium">Raison du surcoût</Label>
                <Select value={surchargeReason} onValueChange={setSurchargeReason}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Choisir une raison" />
                  </SelectTrigger>
                  <SelectContent>
                    {SURCHARGE_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {surchargeReason === 'autre' && (
                <div>
                  <Label htmlFor="surcharge-reason-other" className="text-sm font-medium">
                    Précisez la raison
                  </Label>
                  <Input
                    id="surcharge-reason-other"
                    placeholder="Ex. : modification d'adresse..."
                    value={surchargeReasonOther}
                    onChange={(e) => setSurchargeReasonOther(e.target.value)}
                    className="mt-2"
                  />
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setSurchargeStep(1)}>
                  Retour
                </Button>
                <Button variant="outline" onClick={handleCloseAddSurcharge}>
                  Fermer
                </Button>
                <Button onClick={handleSendSurchargeEmail} disabled={isSendingSurchargeEmail}>
                  {isSendingSurchargeEmail ? 'Envoi...' : <><Send className="w-4 h-4" /> Envoyer</>}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialogue confirmation Expédier sans surcoût */}
      <Dialog
        open={isBypassConfirmOpen}
        onOpenChange={(open) => {
          setIsBypassConfirmOpen(open);
          if (!open) setSelectedQuoteForBypass(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer l&apos;expédition</DialogTitle>
            <DialogDescription>
              Les dimensions diffèrent. Voulez-vous expédier quand même sans demander de surcoût ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsBypassConfirmOpen(false);
                setSelectedQuoteForBypass(null);
              }}
            >
              Annuler
            </Button>
            <Button onClick={handleBypassAndShip} disabled={isBypassing}>
              {isBypassing ? 'En cours...' : 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
