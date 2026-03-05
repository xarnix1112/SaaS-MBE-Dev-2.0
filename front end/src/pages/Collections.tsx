import { AppHeader } from '@/components/layout/AppHeader';
import { QuoteTimeline } from '@/components/quotes/QuoteTimeline';
import { StatusBadge } from '@/components/quotes/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useQuotes } from "@/hooks/use-quotes";
import { useAuctionHouses } from "@/hooks/use-auction-houses";
import { doc, setDoc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authenticatedFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createTimelineEvent, timelineEventToFirestore } from "@/lib/quoteTimeline";
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
  Mail,
  Euro,
  FileText,
  Building2,
  AlertCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';

export default function Collections() {
  const { data: quotes = [], isLoading, isError } = useQuotes();
  const { houses: auctionHouses = [], isLoading: isLoadingHouses } = useAuctionHouses();
  const queryClient = useQueryClient();
  
  // Log pour diagnostiquer le problème
  console.log("[Collections] 🏛️ Auction houses chargées:", auctionHouses.length, auctionHouses.map(h => ({ name: h.name, email: h.email })));
  const [selectedQuotes, setSelectedQuotes] = useState<string[]>([]);
  const [isPlanningDialogOpen, setIsPlanningDialogOpen] = useState(false);
  const [plannedDate, setPlannedDate] = useState('');
  const [plannedTime, setPlannedTime] = useState('');
  const [collectionNote, setCollectionNote] = useState('');
  // Stocker les emails manuels par salle des ventes
  const [manualEmails, setManualEmails] = useState<Record<string, string>>({});
  // Dialog "Lot non récupéré"
  const [isCollectionFailedDialogOpen, setIsCollectionFailedDialogOpen] = useState(false);
  const [collectionFailedQuoteId, setCollectionFailedQuoteId] = useState<string | null>(null);
  const [collectionFailedReason, setCollectionFailedReason] = useState('');
  const [isSendingCollectionFailed, setIsSendingCollectionFailed] = useState(false);

  // Inclure uniquement les devis en attente de collecte (pas encore collectés)
  // Exclure les devis avec le statut 'collected' car ils doivent apparaître dans "Préparation"
  // Inclure les devis payés (paymentStatus === 'paid') même s'ils n'ont pas encore le statut 'awaiting_collection'
  // Cela permet de capturer les devis qui viennent d'être payés mais dont le statut n'a pas encore été mis à jour
  const collectionQuotes = quotes.filter(q => 
    q.status === 'awaiting_collection' ||
    (q.paymentStatus === 'paid' && q.status !== 'collected' && q.status !== 'preparation' && q.status !== 'awaiting_shipment' && q.status !== 'shipped' && q.status !== 'completed')
  );

  // Grouper par salle des ventes
  const quotesByAuctionHouse = useMemo(() => {
    const grouped: Record<string, typeof collectionQuotes> = {};
    
    collectionQuotes.forEach(quote => {
      const auctionHouse = quote.lot.auctionHouse || 'Non précisée';
      if (!grouped[auctionHouse]) {
        grouped[auctionHouse] = [];
      }
      grouped[auctionHouse].push(quote);
    });
    
    return grouped;
  }, [collectionQuotes]);

  const awaitingCollection = collectionQuotes.filter(q => 
    q.status === 'awaiting_collection' || (q.paymentStatus === 'paid' && q.status !== 'collected')
  );
  // Compter tous les devis collectés (pas seulement ceux dans collectionQuotes)
  // pour les statistiques, même s'ils ne sont plus dans la liste principale
  const collected = quotes.filter(q => q.status === 'collected');

  // Trouver l'email de contact de la salle des ventes
  const getAuctionHouseEmail = (auctionHouseName: string): string | null => {
    console.log(`[Collections] 🔍 Recherche email pour: "${auctionHouseName}"`);
    console.log(`[Collections] 📚 Salles disponibles au moment de l'appel:`, auctionHouses.length, auctionHouses.map(h => ({ name: h.name, email: h.email })));
    
    // Normaliser le nom pour la comparaison (trim + lowercase)
    const normalizedSearchName = auctionHouseName.trim().toLowerCase();
    
    const house = auctionHouses.find(h => {
      const normalized = h.name.trim().toLowerCase();
      console.log(`[Collections] 🔎 Comparaison: "${normalized}" === "${normalizedSearchName}"`, normalized === normalizedSearchName);
      return normalized === normalizedSearchName;
    });
    
    console.log(`[Collections] 🏛️ Salle trouvée:`, house ? { name: house.name, email: house.email, contact: house.contact } : 'null');
    
    // Priorité 1: Champ email dédié
    if (house?.email) {
      console.log(`[Collections] ✅ Email trouvé pour "${auctionHouseName}": ${house.email}`);
      return house.email;
    }
    // Priorité 2: Extraire l'email depuis le contact si c'est un email
    if (house?.contact) {
      const emailMatch = house.contact.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) {
        console.log(`[Collections] ✅ Email extrait du contact pour "${auctionHouseName}": ${emailMatch[0]}`);
        return emailMatch[0];
      }
    }
    
    console.warn(`[Collections] ⚠️ Aucun email trouvé pour la salle des ventes "${auctionHouseName}"`);
    return null;
  };

  // Envoyer un email à la salle des ventes pour planifier une collecte
  const handlePlanCollection = async () => {
    if (selectedQuotes.length === 0) {
      toast.error("Veuillez sélectionner au moins un devis");
      return;
    }

    const selectedQuotesData = collectionQuotes.filter(q => selectedQuotes.includes(q.id));
    if (selectedQuotesData.length === 0) {
      toast.error("Aucun devis sélectionné");
      return;
    }

    // Grouper par salle des ventes
    const byHouse: Record<string, typeof selectedQuotesData> = {};
    selectedQuotesData.forEach(quote => {
      const house = quote.lot.auctionHouse || 'Non précisée';
      if (!byHouse[house]) byHouse[house] = [];
      byHouse[house].push(quote);
    });

    // Vérifier que tous les emails sont remplis
    const missingEmails: string[] = [];
    Object.entries(byHouse).forEach(([houseName]) => {
      const houseEmail = manualEmails[houseName] || getAuctionHouseEmail(houseName);
      if (!houseEmail || !houseEmail.trim()) {
        missingEmails.push(houseName);
      }
    });

    if (missingEmails.length > 0) {
      toast.error(`Veuillez saisir un email pour: ${missingEmails.join(', ')}`);
      return;
    }

    if (!plannedDate?.trim()) {
      toast.error("Veuillez sélectionner une date pour la collecte");
      return;
    }

    if (!plannedTime?.trim()) {
      toast.error("Veuillez sélectionner une heure pour la collecte");
      return;
    }

    // Vérifier que tous les devis ont un numéro de bordereau
    const quotesWithoutBordereau = selectedQuotesData.filter(
      q => !q.auctionSheet?.bordereauNumber || !String(q.auctionSheet?.bordereauNumber ?? '').trim()
    );
    if (quotesWithoutBordereau.length > 0) {
      toast.error("Renseignez le numéro de bordereau pour tous les devis sélectionnés avant d'envoyer la demande de collecte.");
      return;
    }

    // Envoyer un email pour chaque salle des ventes
    const emailPromises = Object.entries(byHouse).map(async ([houseName, houseQuotes]) => {
      // Priorité 1: Email manuel saisi dans le dialogue
      // Priorité 2: Email depuis la base de données
      const houseEmail = manualEmails[houseName] || getAuctionHouseEmail(houseName);
      if (!houseEmail || !houseEmail.trim()) {
        console.warn(`Email manquant pour ${houseName}`);
        return;
      }

      // Préparer les données des lots pour l'email
      const quotesData = houseQuotes.map(quote => {
        // Extraire les données du lot depuis auctionSheet si disponible (depuis bordereau PDF)
        // Sinon, utiliser les données du lot principal
        let lotNumber = 'Non spécifié';
        let lotDescription = 'Description non disponible';
        
        // Priorité 1: Données depuis le bordereau PDF (auctionSheet.lots)
        if (quote.auctionSheet?.lots && quote.auctionSheet.lots.length > 0) {
          const firstLot = quote.auctionSheet.lots[0];
          lotNumber = firstLot.lotNumber || lotNumber;
          lotDescription = firstLot.description || lotDescription;
        }
        
        // Priorité 2: Données du lot principal
        if (quote.lot?.number) {
          lotNumber = quote.lot.number;
        }
        if (quote.lot?.description) {
          lotDescription = quote.lot.description;
        }
        
        // Priorité 3 (fallback): Extraire depuis la référence Google Sheets
        if (lotNumber === 'Non spécifié' && quote.reference && quote.reference.startsWith('GS-')) {
          const parts = quote.reference.split('-');
          if (parts.length >= 3) {
            lotNumber = parts[2];
          }
        }
        
        console.log('[Collections] 📦 Préparation données pour email:', {
          reference: quote.reference,
          lotNumber: lotNumber,
          lotDescription: lotDescription,
          'lot.number': quote.lot?.number,
          'lot.description': quote.lot?.description,
          'auctionSheet.lots': quote.auctionSheet?.lots?.length || 0,
          'client.name': quote.client?.name,
        });
        
        return {
          id: quote.id,
          saasAccountId: quote.saasAccountId,
          reference: quote.reference,
          lotNumber: lotNumber,
          lotId: quote.lot?.id,
          description: lotDescription,
          value: quote.lot?.value || quote.auctionSheet?.lots?.[0]?.value || 0,
          dimensions: {
            length: quote.lot?.dimensions?.length || quote.auctionSheet?.lots?.[0]?.estimatedDimensions?.length || 0,
            width: quote.lot?.dimensions?.width || quote.auctionSheet?.lots?.[0]?.estimatedDimensions?.width || 0,
            height: quote.lot?.dimensions?.height || quote.auctionSheet?.lots?.[0]?.estimatedDimensions?.height || 0,
            weight: quote.lot?.dimensions?.weight || quote.auctionSheet?.lots?.[0]?.estimatedDimensions?.weight || 0,
          },
          bordereauNumber: quote.auctionSheet?.bordereauNumber || null,
          clientName: quote.client?.name || 'Client non renseigné',
        };
      });

      // Email subject et body (fallback texte)
      const emailSubject = `Demande de collecte - ${houseQuotes.length} lot(s)`;
      const emailBody = `Demande de collecte pour ${houseQuotes.length} lot(s) de ${houseName}`;

      try {
        const response = await authenticatedFetch('/api/send-collection-email', {
          method: 'POST',
          body: JSON.stringify({
            to: houseEmail,
            subject: emailSubject,
            text: emailBody,
            auctionHouse: houseName,
            quotes: quotesData,
            plannedDate: plannedDate || null,
            plannedTime: plannedTime || null,
            note: collectionNote || null,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Erreur lors de l\'envoi de l\'email');
        }

        toast.success(`Email envoyé à ${houseName}`);
      } catch (error) {
        console.error('Erreur envoi email:', error);
        toast.error(error instanceof Error ? error.message : `Erreur lors de l'envoi de l'email à ${houseName}`);
      }
    });

    await Promise.all(emailPromises);
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
    setIsPlanningDialogOpen(false);
    setSelectedQuotes([]);
    setPlannedDate('');
    setPlannedTime('');
    setCollectionNote('');
    setManualEmails({});
  };

  // Marquer un devis comme collecté (API → mise à jour Firestore + email automatique client)
  const handleMarkAsCollected = async (quoteId: string) => {
    try {
      const quote = collectionQuotes.find(q => q.id === quoteId);
      if (!quote) return;

      const res = await authenticatedFetch(`/api/devis/${quoteId}/mark-collected`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de la mise à jour');
      }
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Devis marqué comme collecté');
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la mise à jour');
    }
  };

  // Notifier le client qu'un lot n'a pas pu être récupéré
  const handleNotifyCollectionFailed = (quoteId: string) => {
    setCollectionFailedQuoteId(quoteId);
    setCollectionFailedReason('');
    setIsCollectionFailedDialogOpen(true);
  };

  const handleSubmitCollectionFailed = async () => {
    if (!collectionFailedQuoteId || !collectionFailedReason.trim()) {
      toast.error('Veuillez indiquer la raison');
      return;
    }
    if (collectionFailedReason.trim().length > 250) {
      toast.error('La raison ne doit pas dépasser 250 caractères');
      return;
    }
    setIsSendingCollectionFailed(true);
    try {
      const res = await authenticatedFetch(`/api/devis/${collectionFailedQuoteId}/notify-collection-failed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: collectionFailedReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de l\'envoi');
      }
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Client notifié par email');
      setIsCollectionFailedDialogOpen(false);
      setCollectionFailedQuoteId(null);
      setCollectionFailedReason('');
    } catch (error) {
      console.error('[Collections] Erreur notify collection failed:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la notification');
    } finally {
      setIsSendingCollectionFailed(false);
    }
  };

  // Démarrer la préparation d'un devis
  const handleStartPreparation = async (quoteId: string) => {
    try {
      const quote = collectionQuotes.find(q => q.id === quoteId);
      if (!quote) return;

      // Récupérer le timeline existant depuis Firestore
      const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
      const existingData = quoteDoc.data();
      const existingTimeline = existingData?.timeline || quote.timeline || [];

      // Créer un nouvel événement "préparation démarrée"
      const timelineEvent = createTimelineEvent(
        'preparation',
        'Préparation du colis démarrée'
      );

      // Convertir l'événement pour Firestore
      const firestoreEvent = timelineEventToFirestore(timelineEvent);

      // Éviter les doublons (même description et statut dans les 5 dernières minutes)
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

      // Nettoyer le timeline pour s'assurer qu'il n'y a pas de valeurs undefined
      const cleanedTimeline = updatedTimeline.map((event: any) => {
        const cleaned: any = {
          id: event.id,
          date: event.date,
          status: event.status,
          description: event.description,
        };
        if (event.user !== undefined && event.user !== null && event.user !== '') {
          cleaned.user = event.user;
        }
        return cleaned;
      });

      // Mettre à jour le devis avec le nouveau statut et le timeline
      await setDoc(
        doc(db, 'quotes', quoteId),
        {
          status: 'preparation',
          timeline: cleanedTimeline,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast.success('Préparation démarrée');
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la mise à jour');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <AppHeader 
        title="Collectes" 
        subtitle="Gérez les collectes auprès des salles des ventes"
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

        {/* Actions globales */}
        {awaitingCollection.length > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <div className="text-sm text-muted-foreground">
                {selectedQuotes.length > 0 && `${selectedQuotes.length} devis sélectionné(s)`}
              </div>
              <p className="text-xs text-muted-foreground">
                Les devis sans numéro de bordereau ne peuvent pas être sélectionnés.
              </p>
            </div>
            <Dialog open={isPlanningDialogOpen} onOpenChange={setIsPlanningDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  disabled={selectedQuotes.length === 0}
                  className="gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  Planifier une collecte
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Planifier une collecte</DialogTitle>
                  <DialogDescription>
                    Envoyer un email à la salle des ventes pour planifier la collecte des lots sélectionnés
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                  {/* Emails par salle des ventes */}
                  {(() => {
                    const selectedQuotesData = collectionQuotes.filter(q => selectedQuotes.includes(q.id));
                    const byHouse: Record<string, typeof selectedQuotesData> = {};
                    selectedQuotesData.forEach(quote => {
                      const house = quote.lot.auctionHouse || 'Non précisée';
                      if (!byHouse[house]) byHouse[house] = [];
                      byHouse[house].push(quote);
                    });
                    
                    return Object.entries(byHouse).map(([houseName, houseQuotes]) => {
                      const defaultEmail = getAuctionHouseEmail(houseName) || '';
                      // Utiliser l'email manuel s'il existe ET qu'il n'est pas vide, sinon utiliser l'email par défaut
                      const currentEmail = (manualEmails[houseName] && manualEmails[houseName].trim()) ? manualEmails[houseName] : defaultEmail;
                      
                      return (
                        <div key={houseName} className="space-y-2 p-3 border rounded-lg">
                          <div className="flex items-center justify-between">
                            <Label className="font-semibold">{houseName}</Label>
                            <Badge variant="outline">{houseQuotes.length} lot(s)</Badge>
                          </div>
                          <div>
                            <Label htmlFor={`email-${houseName}`}>
                              Email {defaultEmail ? '(requis)' : '(requis)'}
                            </Label>
                            <Input
                              id={`email-${houseName}`}
                              type="email"
                              value={currentEmail}
                              onChange={(e) => {
                                setManualEmails({
                                  ...manualEmails,
                                  [houseName]: e.target.value,
                                });
                              }}
                              placeholder={defaultEmail ? defaultEmail : "email@salle-des-ventes.fr"}
                              required
                            />
                            {defaultEmail && (
                              <p className="text-xs text-success mt-1 flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                Pré-rempli avec l'email de la salle des ventes
                              </p>
                            )}
                            {!defaultEmail && (
                              <p className="text-xs text-warning mt-1">
                                ⚠️ Email non trouvé dans la base. Veuillez le saisir manuellement.
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                  
                  <div>
                    <Label>Date souhaitée (obligatoire)</Label>
                    <Input
                      type="date"
                      value={plannedDate}
                      onChange={(e) => setPlannedDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label>Heure souhaitée (obligatoire)</Label>
                    <Input
                      type="time"
                      value={plannedTime}
                      onChange={(e) => setPlannedTime(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label>Note (optionnel)</Label>
                    <Textarea
                      value={collectionNote}
                      onChange={(e) => setCollectionNote(e.target.value)}
                      placeholder="Informations supplémentaires pour la collecte..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsPlanningDialogOpen(false)}>
                    Annuler
                  </Button>
                  <Button onClick={handlePlanCollection}>
                    <Mail className="w-4 h-4 mr-2" />
                    Envoyer la demande
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Dialog Lot non récupéré */}
        <Dialog open={isCollectionFailedDialogOpen} onOpenChange={setIsCollectionFailedDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Lot non récupéré</DialogTitle>
              <DialogDescription>
                Envoyer un email au client pour l'informer que le lot n'a pas pu être récupéré auprès de la salle des ventes, et lui indiquer de la contacter.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="collectionFailedReason">
                  Raison (obligatoire)
                </Label>
                <Textarea
                  id="collectionFailedReason"
                  value={collectionFailedReason}
                  onChange={(e) => setCollectionFailedReason(e.target.value)}
                  placeholder="Ex. : Lot non disponible, délai dépassé, document manquant…"
                  maxLength={250}
                  rows={4}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {collectionFailedReason.length}/250 caractères
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCollectionFailedDialogOpen(false)} disabled={isSendingCollectionFailed}>
                Annuler
              </Button>
              <Button onClick={handleSubmitCollectionFailed} disabled={isSendingCollectionFailed || !collectionFailedReason.trim()}>
                {isSendingCollectionFailed ? 'Envoi...' : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Envoyer l'email au client
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Collection List - Groupée par salle des ventes */}
        {Object.entries(quotesByAuctionHouse).map(([auctionHouse, houseQuotes]) => (
          <Card key={auctionHouse} className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-muted-foreground" />
                  <CardTitle>{auctionHouse}</CardTitle>
                  <Badge variant="outline">{houseQuotes.length} lot(s)</Badge>
                </div>
                {getAuctionHouseEmail(auctionHouse) && (
                  <Badge variant="secondary">
                    <Mail className="w-3 h-3 mr-1" />
                    Email disponible
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {houseQuotes.map((quote) => {
                  const isSelected = selectedQuotes.includes(quote.id);
                  const lotValue = quote.lot.value || 0;
                  const hasBordereau = !!(quote.auctionSheet?.bordereauNumber && String(quote.auctionSheet.bordereauNumber).trim());
                  
                  return (
                    <Card
                      key={quote.id}
                      className={`card-hover ${isSelected ? 'ring-2 ring-primary' : ''} ${!hasBordereau ? 'opacity-60' : ''}`}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={!hasBordereau}
                                onChange={(e) => {
                                  if (!hasBordereau) return;
                                  if (e.target.checked) {
                                    setSelectedQuotes([...selectedQuotes, quote.id]);
                                  } else {
                                    setSelectedQuotes(selectedQuotes.filter(id => id !== quote.id));
                                  }
                                }}
                                className={`rounded ${!hasBordereau ? 'cursor-not-allowed' : ''}`}
                              />
                              <CardTitle className="text-base flex items-center gap-2">
                                <Package className="w-4 h-4" />
                                {quote.lot.number}
                              </CardTitle>
                            </div>
                            <p className="text-sm text-muted-foreground">{quote.reference}</p>
                          </div>
                          <StatusBadge status={quote.status === 'awaiting_collection' || (quote.paymentStatus === 'paid' && quote.status !== 'collected') ? 'awaiting_collection' : quote.status} />
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
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
                        </div>

                        {/* Lot Description */}
                        <div>
                          <p className="text-sm font-medium mb-1">Description du lot</p>
                          <p className="text-sm text-muted-foreground">{quote.lot.description}</p>
                        </div>

                        {/* Lot Value */}
                        {lotValue > 0 && (
                          <div className="flex items-center gap-2 text-sm">
                            <Euro className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">Valeur: {lotValue.toFixed(2)}€</span>
                          </div>
                        )}

                        {/* Dimensions */}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{quote.lot.dimensions.length}×{quote.lot.dimensions.width}×{quote.lot.dimensions.height} cm</span>
                          <span>{quote.lot.dimensions.weight} kg</span>
                        </div>

                        {/* Bordereau */}
                        {hasBordereau ? (
                          <div className="flex items-center gap-2 text-sm">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              Bordereau: {quote.auctionSheet?.bordereauNumber}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-amber-600">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>Renseignez le numéro de bordereau dans la page du devis pour pouvoir sélectionner ce devis.</span>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                          {(quote.status === 'awaiting_collection' || (quote.paymentStatus === 'paid' && quote.status !== 'collected')) && (
                            <>
                              <Button 
                                size="sm" 
                                className="gap-1"
                                onClick={() => handleMarkAsCollected(quote.id)}
                              >
                                <Truck className="w-4 h-4" />
                                Marquer comme collecté
                              </Button>
                              {(quote as { collectionPlannedAt?: unknown }).collectionPlannedAt && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1"
                                  onClick={() => handleNotifyCollectionFailed(quote.id)}
                                >
                                  <AlertCircle className="w-4 h-4" />
                                  Lot non récupéré
                                </Button>
                              )}
                            </>
                          )}
                          {quote.status === 'collected' && (
                            <>
                              <Button 
                                size="sm" 
                                className="gap-1"
                                onClick={() => handleStartPreparation(quote.id)}
                              >
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
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}

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
