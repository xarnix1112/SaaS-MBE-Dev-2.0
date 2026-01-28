import { useState, useEffect } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { StatusBadge } from '@/components/quotes/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuotes } from "@/hooks/use-quotes";
import { useToast } from "@/components/ui/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { createStripeLink } from "@/lib/stripe";
import { setDoc, doc, Timestamp, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createTimelineEvent, timelineEventToFirestore } from "@/lib/quoteTimeline";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Search, 
  Filter,
  CreditCard,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  Link as LinkIcon,
  Plus,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';

type PaymentFilter = 'all' | 'pending' | 'link_sent' | 'partial' | 'paid' | 'cancelled';

export default function Payments() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PaymentFilter>('all');
  const { data: quotes = [], isLoading, isError, refetch } = useQuotes();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  
  // Debug: Log les quotes pour voir leur paymentStatus
  useEffect(() => {
    const devGs4 = quotes.find(q => q.reference === 'DEV-GS-4');
    if (devGs4) {
      console.log('[Payments] DEV-GS-4 trouvé:', {
        reference: devGs4.reference,
        status: devGs4.status,
        paymentStatus: devGs4.paymentStatus,
        timelineCount: devGs4.timeline?.length || 0,
        timeline: devGs4.timeline,
        paymentLinksCount: devGs4.paymentLinks?.length || 0,
        paymentLinks: devGs4.paymentLinks,
      });
    }
  }, [quotes]);

  // Afficher tous les devis qui ont au moins un lien de paiement créé
  // (peu importe leur statut actuel - ils peuvent être paid, awaiting_collection, collected, etc.)
  const quotesWithPayment = quotes.filter(q => 
    q.paymentLinks && q.paymentLinks.length > 0
  );

  const filteredQuotes = quotesWithPayment.filter(quote => {
    const searchLower = search.toLowerCase();
    const matchesSearch = 
      (quote.reference?.toLowerCase() || '').includes(searchLower) ||
      (quote.client?.name?.toLowerCase() || '').includes(searchLower) ||
      (quote.client?.email?.toLowerCase() || '').includes(searchLower);
    
    const matchesFilter = filter === 'all' || quote.paymentStatus === filter;
    
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: quotesWithPayment.length,
    pending: quotesWithPayment.filter(q => q.paymentStatus === 'pending').length,
    linkSent: quotesWithPayment.filter(q => q.paymentStatus === 'link_sent').length,
    paid: quotesWithPayment.filter(q => q.paymentStatus === 'paid').length,
    totalAmount: quotesWithPayment.reduce((sum, q) => sum + q.totalAmount, 0),
    paidAmount: quotesWithPayment
      .filter(q => q.paymentStatus === 'paid')
      .reduce((sum, q) => sum + q.totalAmount, 0),
  };

  // Debug: Afficher les devis avec paymentLinks
  useEffect(() => {
    console.log('[Payments] 📊 Tous les devis chargés:', quotes.length);
    console.log('[Payments] 💳 Devis avec paymentLinks:', quotesWithPayment.length);
    console.log('[Payments] 📋 Détail:', quotesWithPayment.map(q => ({
      reference: q.reference,
      status: q.status,
      paymentStatus: q.paymentStatus,
      paymentLinksCount: q.paymentLinks?.length || 0,
    })));
    console.log('[Payments] ✅ Devis affichés après filtrage:', filteredQuotes.length);
    console.log('[Payments] 🔍 Filtre actuel:', filter);
    console.log('[Payments] 🔍 Recherche actuelle:', search || '(vide)');
  }, [quotes, quotesWithPayment, filteredQuotes, filter, search]);

  return (
    <div className="flex flex-col h-full">
      <AppHeader 
        title="Suivi des paiements" 
        subtitle="Gérez les paiements et liens de paiement"
      />
      
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Bouton de rafraîchissement manuel */}
        <div className="flex justify-end">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['quotes'] });
              refetch();
              toast({
                title: "Rafraîchissement",
                description: "Les données sont en cours de rechargement...",
              });
            }}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Rafraîchir les données
          </Button>
        </div>
        {isLoading && (
          <div className="text-center text-muted-foreground">Chargement...</div>
        )}
        {isError && (
          <div className="text-center text-destructive">
            Impossible de charger les devis Google Sheets
          </div>
        )}
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-warning/10">
                  <Clock className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                  <p className="text-sm text-muted-foreground">En attente</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-info/10">
                  <Send className="w-5 h-5 text-info" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.linkSent}</p>
                  <p className="text-sm text-muted-foreground">Liens envoyés</p>
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
                  <p className="text-2xl font-bold">{stats.paid}</p>
                  <p className="text-sm text-muted-foreground">Payés</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <CreditCard className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.paidAmount}€</p>
                  <p className="text-sm text-muted-foreground">Encaissé</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par référence ou client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as PaymentFilter)}>
            <SelectTrigger className="w-full sm:w-48">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filtrer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="link_sent">Lien envoyé</SelectItem>
              <SelectItem value="partial">Paiement partiel</SelectItem>
              <SelectItem value="paid">Payé</SelectItem>
              <SelectItem value="cancelled">Annulé</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Liste des paiements</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Référence</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Lien paiement</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell>
                      <Link to={`/quotes/${quote.id}`} className="font-medium text-primary hover:underline">
                        {quote.reference}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{quote.client.name}</p>
                        <p className="text-xs text-muted-foreground">{quote.client.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        // Toujours calculer le total réel depuis les options du devis
                        // Ne pas utiliser le montant du lien de paiement qui peut être obsolète
                        const total = (
                          (quote.options?.packagingPrice || 0) +
                          (quote.options?.shippingPrice || 0) +
                          (quote.options?.insuranceAmount || 0)
                        );
                        
                        // Si le total calculé est > 0, l'utiliser, sinon utiliser totalAmount
                        const displayAmount = total > 0 ? total : (quote.totalAmount || 0);
                        return <span className="font-semibold">{displayAmount.toFixed(2)}€</span>;
                      })()}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={quote.paymentStatus} type="payment" />
                    </TableCell>
                    <TableCell>
                      {quote.paymentLinks.length > 0 ? (
                        <div className="flex items-center gap-2">
                          {quote.paymentLinks
                            .filter(link => link && link.status === 'active')
                            .sort((a, b) => {
                              const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
                              const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
                              return dateB - dateA;
                            })
                            .slice(0, 1)
                            .map((link) => (
                              <div key={link.id} className="flex items-center gap-2">
                                <Badge variant="secondary" className="gap-1">
                                  <LinkIcon className="w-3 h-3" />
                                  {link.amount.toFixed(2)}€
                                </Badge>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-7 w-7"
                                  onClick={() => window.open(link.url, '_blank')}
                                  title="Ouvrir le lien de paiement"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </Button>
                              </div>
                            ))}
                          {quote.paymentLinks.filter(link => link && link.status === 'active').length === 0 && (
                            <Badge variant="secondary" className="gap-1">
                              <LinkIcon className="w-3 h-3" />
                              {quote.paymentLinks.length} lien(s)
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {quote.paymentStatus !== 'paid' && (
                          <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1"
                              disabled={
                                generatingId === `${quote.id}-stripe` ||
                                ((quote.options.packagingPrice || 0) +
                                 (quote.options.shippingPrice || 0) +
                                 (quote.options.insuranceAmount || 0)) <= 0
                              }
                              onClick={async () => {
                                try {
                                  setGeneratingId(`${quote.id}-stripe`);
                                  
                                  // Calculer le total de la même manière que dans QuoteDetail
                                  const total = (
                                    (quote.options.packagingPrice || 0) +
                                    (quote.options.shippingPrice || 0) +
                                    (quote.options.insuranceAmount || 0)
                                  );
                                  
                                  if (total <= 0) {
                                    setGeneratingId(null);
                                    toast({
                                      title: "Erreur",
                                      description: "Le total doit être supérieur à 0€ pour générer un lien de paiement",
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  
                                  const res = await createStripeLink({
                                    quote,
                                    amount: total,
                                    currency: "EUR",
                                    successUrl: `${window.location.origin}/payment/success`,
                                    cancelUrl: `${window.location.origin}/payment/cancel`,
                                  });
                                  
                                  // Créer le PaymentLink
                                  const newPaymentLink = {
                                    id: res.id || `stripe-${Date.now()}`,
                                    url: res.url,
                                    amount: total,
                                    createdAt: new Date(),
                                    status: 'active' as const,
                                  };
                                  
                                  // Remplacer les anciens liens actifs par le nouveau
                                  const updatedPaymentLinks = [
                                    ...quote.paymentLinks.filter(link => link.status !== 'active'),
                                    newPaymentLink,
                                  ];
                                  
                                  // Récupérer le timeline existant depuis Firestore
                                  const quoteDoc = await getDoc(doc(db, 'quotes', quote.id));
                                  const existingData = quoteDoc.data();
                                  const existingTimeline = existingData?.timeline || quote.timeline || [];
                                  
                                  // Créer un événement timeline pour le lien de paiement
                                  const paymentLinkEvent = createTimelineEvent(
                                    'verified',
                                    `Lien de paiement créé (${total.toFixed(2)}€)`
                                  );
                                  
                                  // Le statut reste inchangé - il passera à 'awaiting_payment' uniquement lors de l'envoi du devis
                                  let newStatus = quote.status;
                                  
                                  // Nettoyer le timeline existant (filtrer les événements avec dates invalides)
                                  const cleanedExistingTimeline = existingTimeline.filter((event: any) => {
                                    if (!event.date) return false;
                                    const date = event.date?.toDate ? event.date.toDate() : new Date(event.date);
                                    return !isNaN(date.getTime());
                                  });
                                  
                                  // Ajouter l'événement au timeline existant
                                  const updatedTimeline = [...cleanedExistingTimeline, paymentLinkEvent];
                                  
                                  // Sauvegarder dans Firestore
                                  const paymentLinksForFirestore = updatedPaymentLinks.map(link => ({
                                    id: link.id,
                                    url: link.url,
                                    amount: link.amount,
                                    createdAt: Timestamp.fromDate(link.createdAt),
                                    status: link.status,
                                  }));
                                  
                                  // Nettoyer le timeline pour Firestore
                                  const timelineForFirestore = updatedTimeline.map(event => 
                                    timelineEventToFirestore(event)
                                  );
                                  
                                  await setDoc(
                                    doc(db, "quotes", quote.id),
                                    {
                                      paymentLinks: paymentLinksForFirestore,
                                      status: newStatus,
                                      timeline: timelineForFirestore,
                                      updatedAt: Timestamp.now(),
                                    },
                                    { merge: true }
                                  );
                                  
                                  // Invalider le cache React Query pour forcer le rechargement
                                  queryClient.invalidateQueries({ queryKey: ['quotes'] });
                                  
                                  toast({
                                    title: "Lien Stripe généré et sauvegardé",
                                    description: "Le lien de paiement a été sauvegardé sur le devis",
                                  });
                                } catch (error) {
                                  toast({
                                    title: "Erreur Stripe",
                                    description:
                                      error instanceof Error ? error.message : "Impossible de générer le lien",
                                    variant: "destructive",
                                  });
                                } finally {
                                  setGeneratingId(null);
                                }
                              }}
                            >
                              <LinkIcon className="w-3 h-3" />
                              {generatingId === `${quote.id}-stripe` ? "Stripe..." : "Lien Stripe"}
                            </Button>
                        )}
                        {quote.paymentStatus === 'paid' && (
                          <Button variant="outline" size="sm" className="h-8 gap-1">
                            <Plus className="w-3 h-3" />
                            Surcoût
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
