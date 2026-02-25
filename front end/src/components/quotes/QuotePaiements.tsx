/**
 * Composant Paiements pour QuoteDetail
 * 
 * Affiche les paiements d'un devis et permet d'en créer de nouveaux
 */

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  CreditCard,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Loader2,
  Ban,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { createPaiement, getPaiements, cancelPaiement, syncPaymentAmount } from '@/lib/stripeConnect';
import type { Paiement, PaiementType } from '@/types/stripe';
import { Quote } from '@/types/quote';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface QuotePaiementsProps {
  devisId: string;
  quote?: Quote; // Quote optionnel passé depuis le parent
  refreshKey?: number; // Clé pour forcer le rechargement des paiements
}

// Calcul du montant d'assurance (même logique que QuoteDetail)
function computeInsuranceAmount(
  lotValue: number,
  insuranceEnabled?: boolean,
  explicitAmount?: number | null
) {
  if (!insuranceEnabled) return 0;
  if (explicitAmount !== null && explicitAmount !== undefined && explicitAmount > 0) {
    const decimal = explicitAmount % 1;
    if (decimal >= 0.5) return Math.ceil(explicitAmount);
    if (decimal > 0) return Math.floor(explicitAmount) + 0.5;
    return explicitAmount;
  }
  const raw = Math.max(lotValue * 0.025, lotValue < 500 ? 12 : 0);
  const decimal = raw % 1;
  if (decimal >= 0.5) return Math.ceil(raw);
  if (decimal > 0) return Math.floor(raw) + 0.5;
  return raw;
}

export function QuotePaiements({ devisId, quote: initialQuote, refreshKey }: QuotePaiementsProps) {
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(initialQuote || null);

  // Formulaire
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<PaiementType>('PRINCIPAL');
  const [description, setDescription] = useState('');

  // Charger le devis depuis Firestore si pas fourni
  useEffect(() => {
    if (!initialQuote && devisId) {
      const loadQuote = async () => {
        try {
          const quoteDoc = await getDoc(doc(db, 'quotes', devisId));
          if (quoteDoc.exists()) {
            setQuote({ id: quoteDoc.id, ...quoteDoc.data() } as Quote);
          }
        } catch (error) {
          console.error('[QuotePaiements] Erreur chargement devis:', error);
        }
      };
      loadQuote();
    }
  }, [devisId, initialQuote]);

  // Mettre à jour le quote local quand initialQuote change
  useEffect(() => {
    if (initialQuote) {
      setQuote(initialQuote);
    }
  }, [initialQuote]);

  // Calcul du total du devis (incluant les surcoûts)
  const calculateQuoteTotal = () => {
    if (!quote) return 0;
    
    // Utiliser le prix du carton depuis auctionSheet.recommendedCarton si disponible
    // Sinon utiliser quote.options.packagingPrice comme fallback
    const cartonPrice = quote.auctionSheet?.recommendedCarton?.price || 
                        (quote.auctionSheet?.recommendedCarton as any)?.priceTTC || 
                        null;
    const packagingPrice = cartonPrice !== null ? cartonPrice : (quote.options?.packagingPrice || 0);
    
    const shippingPrice = quote.options?.shippingPrice || 0;
    const insuranceAmount = computeInsuranceAmount(
      quote.lot?.value || 0,
      quote.options?.insurance,
      quote.options?.insuranceAmount
    );
    
    // Ajouter les surcoûts (paiements SURCOUT non annulés)
    const surchargeAmount = paiements
      .filter((p) => p.type === 'SURCOUT' && p.status !== 'CANCELLED')
      .reduce((sum, p) => sum + p.amount, 0);
    
    return packagingPrice + shippingPrice + insuranceAmount + surchargeAmount;
  };

  // Charger les paiements
  const loadPaiements = async () => {
    try {
      setIsLoading(true);
      console.log('[QuotePaiements] 🔄 Chargement paiements pour devis:', devisId);
      const data = await getPaiements(devisId);
      console.log('[QuotePaiements] ✅ Paiements chargés:', {
        count: data.length,
        paiements: data.map(p => ({ id: p.id, amount: p.amount, type: p.type, status: p.status })),
      });
      setPaiements(data);
    } catch (error: any) {
      console.error('[QuotePaiements] Erreur chargement:', error);
      
      // Afficher un message d'erreur spécifique pour l'index Firestore
      if (error.message && error.message.includes('Index Firestore')) {
        const indexUrl = error.response?.data?.indexUrl;
        if (indexUrl) {
          toast.error('Index Firestore manquant', {
            description: 'Cliquez pour créer l\'index automatiquement',
            action: {
              label: 'Créer l\'index',
              onClick: () => window.open(indexUrl, '_blank'),
            },
            duration: 10000,
          });
        } else {
          toast.error('Index Firestore manquant. Consultez les logs du serveur pour le lien de création.');
        }
      } else {
        toast.error('Erreur lors du chargement des paiements');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Polling automatique toutes les 10 secondes (plus fréquent pour détecter les paiements rapidement)
  useEffect(() => {
    loadPaiements();

    const interval = setInterval(loadPaiements, 10000); // 10 secondes au lieu de 30
    return () => clearInterval(interval);
  }, [devisId]); // Seulement devisId pour éviter les re-renders
  
  // Recharger immédiatement quand refreshKey change
  useEffect(() => {
    if (refreshKey !== undefined && refreshKey > 0) {
      console.log('[QuotePaiements] 🔄 Rechargement forcé des paiements (refreshKey:', refreshKey, ')');
      loadPaiements();
    }
  }, [refreshKey]);

  // Détecter l'écart montant principal / total devis et synchroniser automatiquement
  const syncAttemptedRef = useRef(false);
  useEffect(() => {
    if (!quote || !devisId || paiements.length === 0 || isLoading) return;
      const cartonPrice = (quote.auctionSheet?.recommendedCarton?.price ||
        (quote.auctionSheet?.recommendedCarton as any)?.priceTTC) ?? null;
    const packagingPrice = cartonPrice !== null ? cartonPrice : (quote.options?.packagingPrice || 0);
    const shippingPrice = quote.options?.shippingPrice || 0;
    const insuranceAmount = computeInsuranceAmount(
      quote.lot?.value || 0,
      quote.options?.insurance,
      quote.options?.insuranceAmount
    );
    const principalExpected = packagingPrice + shippingPrice + insuranceAmount;
    if (principalExpected <= 0) return;
    const principalPending = paiements.find(
      (p) => p.type === 'PRINCIPAL' && p.status === 'PENDING'
    );
    if (!principalPending) return;
    const tolerance = 0.01;
    if (Math.abs(principalPending.amount - principalExpected) <= tolerance) return;
    if (syncAttemptedRef.current) return;
    syncAttemptedRef.current = true;

    const runSync = async () => {
      try {
        const result = await syncPaymentAmount(devisId);
        if (result.synced) {
          toast.success('Montant mis à jour', {
            description: `Le lien de paiement a été régénéré pour ${result.newAmount?.toFixed(2)}€`,
          });
          await loadPaiements();
        }
      } catch (error: unknown) {
        console.error('[QuotePaiements] Erreur sync montant:', error);
        toast.error('Impossible de mettre à jour le montant du paiement', {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        syncAttemptedRef.current = false;
      }
    };
    runSync();
  }, [quote, devisId, paiements, isLoading]);

  // Créer un nouveau paiement
  const handleCreatePaiement = async () => {
    try {
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        toast.error('Montant invalide');
        return;
      }

      setIsCreating(true);

      const response = await createPaiement(devisId, {
        amount: amountNum,
        type,
        description: description || undefined,
      });

      toast.success('Lien de paiement créé');
      
      // Rediriger vers Stripe Checkout
      window.location.href = response.url;
    } catch (error: any) {
      console.error('[QuotePaiements] Erreur création:', error);
      const apiError = error.apiError || error.response?.data;
      
      // Message d'erreur spécifique pour la configuration Stripe incomplète
      if (apiError?.error === 'Configuration Stripe incomplète' || error.message?.includes('nom d\'entreprise')) {
        toast.error('Configuration Stripe incomplète', {
          description: apiError?.action || 'Vous devez configurer le nom de votre entreprise dans Stripe.',
          action: {
            label: 'Ouvrir Stripe',
            onClick: () => window.open('https://dashboard.stripe.com/settings/account', '_blank'),
          },
          duration: 15000,
        });
      } else {
        const errorMessage = apiError?.message || error.message || 'Erreur lors de la création du paiement';
        toast.error(errorMessage);
      }
      
      setIsCreating(false);
    }
  };

  // Réinitialiser le formulaire
  const resetForm = () => {
    setAmount('');
    setType('PRINCIPAL');
    setDescription('');
  };

  // Badge de statut
  const StatusBadge = ({ status }: { status: Paiement['status'] }) => {
    switch (status) {
      case 'PAID':
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Payé
          </Badge>
        );
      case 'PENDING':
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="w-3 h-3" />
            En attente
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="w-3 h-3" />
            Échec
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge variant="outline" className="gap-1">
            <XCircle className="w-3 h-3" />
            Annulé
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Calcul du total (exclure les paiements annulés)
  const activePaiements = paiements.filter((p) => p.status !== 'CANCELLED');
  const totalAmount = activePaiements.reduce((sum, p) => sum + p.amount, 0);
  const paidAmount = activePaiements
    .filter((p) => p.status === 'PAID')
    .reduce((sum, p) => sum + p.amount, 0);

  // Récupérer les surcoûts pour l'affichage (paiements SURCOUT non annulés)
  const surchargePaiements = paiements.filter(
    (p) => p.type === 'SURCOUT' && p.status !== 'CANCELLED'
  );

  // Calcul du total du devis
  const quoteTotal = calculateQuoteTotal();

  return (
    <div className="space-y-6">
      {/* Résumé du devis */}
      {quote && quoteTotal > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">Récapitulatif du devis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Emballage{quote.auctionSheet?.recommendedCarton?.ref ? ` (carton ${quote.auctionSheet.recommendedCarton.ref})` : ''}
              </span>
              <span className="font-medium">
                {(() => {
                  const cartonPrice = quote.auctionSheet?.recommendedCarton?.price || 
                                      (quote.auctionSheet?.recommendedCarton as any)?.priceTTC || 
                                      null;
                  const packagingPrice = cartonPrice !== null ? cartonPrice : (quote.options?.packagingPrice || 0);
                  return packagingPrice.toFixed(2);
                })()}€
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Expédition</span>
              <span className="font-medium">{(quote.options?.shippingPrice || 0).toFixed(2)}€</span>
            </div>
            {quote.options?.insurance && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Assurance (2.5%)</span>
                <span className="font-medium">
                  {computeInsuranceAmount(
                    quote.lot?.value || 0,
                    quote.options.insurance,
                    quote.options.insuranceAmount
                  ).toFixed(2)}€
                </span>
              </div>
            )}
            {/* Ligne surcoût - affichée seulement s'il y a des surcoûts */}
            {surchargePaiements.length > 0 && surchargePaiements.map((surcharge) => (
              <div key={surcharge.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Surcoût{surcharge.description ? `: ${surcharge.description}` : ''}
                </span>
                <span className="font-medium">{surcharge.amount.toFixed(2)}€</span>
              </div>
            ))}
            <Separator />
            <div className="flex items-center justify-between">
              <span className="font-semibold">Total du devis</span>
              <span className="text-2xl font-bold text-primary">{quoteTotal.toFixed(2)}€</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Résumé des paiements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Paiements
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={loadPaiements}
              disabled={isLoading}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
          </CardTitle>
          <CardDescription>
            Gérez les paiements de ce devis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Total des paiements</p>
              <p className="text-2xl font-bold">
                {totalAmount.toFixed(2)} €
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Montant encaissé</p>
              <p className="text-2xl font-bold text-green-600">
                {paidAmount.toFixed(2)} €
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liste des paiements */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Historique des paiements</CardTitle>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" onClick={resetForm}>
                  <Plus className="w-4 h-4" />
                  Créer un paiement
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Créer un nouveau paiement</DialogTitle>
                  <DialogDescription>
                    Générez un lien de paiement Stripe pour ce devis
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Montant (€)</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="150.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Type</Label>
                    <Select value={type} onValueChange={(v) => setType(v as PaiementType)}>
                      <SelectTrigger id="type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PRINCIPAL">Paiement principal</SelectItem>
                        <SelectItem value="SURCOUT">Surcoût</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description (optionnel)</Label>
                    <Textarea
                      id="description"
                      placeholder="Ex: Paiement principal du devis, Surcoût transport, etc."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    disabled={isCreating}
                  >
                    Annuler
                  </Button>
                  <Button
                    onClick={handleCreatePaiement}
                    disabled={isCreating || !amount}
                    className="gap-2"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Création...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4" />
                        Créer le lien de paiement
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
              <p className="text-muted-foreground mt-4">Chargement des paiements...</p>
            </div>
          ) : paiements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Aucun paiement pour ce devis</p>
              <p className="text-sm mt-2">
                Créez un lien de paiement pour commencer à encaisser
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {paiements.map((paiement) => (
                <Card 
                  key={paiement.id} 
                  className={`p-4 ${paiement.status === 'CANCELLED' ? 'opacity-50 bg-muted/30' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">
                          {paiement.amount.toFixed(2)} €
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {paiement.type === 'PRINCIPAL' ? 'Principal' : 'Surcoût'}
                        </Badge>
                        <StatusBadge status={paiement.status} />
                      </div>
                      {paiement.description && (
                        <p className="text-sm text-muted-foreground">
                          {paiement.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>
                          Créé le {paiement.createdAt?.toLocaleDateString('fr-FR')}
                        </span>
                        {paiement.paidAt && (
                          <span>
                            Payé le {new Date(paiement.paidAt).toLocaleDateString('fr-FR')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {paiement.status === 'PENDING' && (
                        <>
                          {(paiement.url || paiement.stripeCheckoutUrl) ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={() => window.open((paiement.url || paiement.stripeCheckoutUrl)!, '_blank')}
                              >
                                <ExternalLink className="w-4 h-4" />
                                Voir le lien
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-2"
                                onClick={async () => {
                                  try {
                                    toast.loading('Mise en inactif...', { id: 'deactivate' });
                                    await cancelPaiement(paiement.id);
                                    toast.success('Lien mis en inactif', { id: 'deactivate' });
                                    await loadPaiements();
                                  } catch (error) {
                                    console.error('[QuotePaiements] Erreur mise en inactif:', error);
                                    toast.error('Erreur lors de la mise en inactif', { id: 'deactivate' });
                                  }
                                }}
                                title="Mettre le lien en inactif (il ne pourra plus être utilisé)"
                              >
                                <Ban className="w-4 h-4" />
                                Mettre en inactif
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-2"
                                onClick={async () => {
                                  try {
                                    toast.loading('Génération du nouveau lien...', { id: 'regenerate' });
                                    
                                    // 1. Annuler l'ancien paiement
                                    await cancelPaiement(paiement.id);
                                    console.log('[QuotePaiements] Ancien paiement annulé:', paiement.id);
                                    
                                    // 2. Créer un nouveau paiement
                                    const response = await createPaiement(devisId, {
                                      amount: paiement.amount,
                                      type: paiement.type,
                                      description: paiement.description || `Régénération: ${paiement.type === 'PRINCIPAL' ? 'Paiement principal' : 'Surcoût'}`,
                                    });
                                    
                                    toast.success('Nouveau lien généré', { id: 'regenerate' });
                                    window.open(response.url, '_blank');
                                    
                                    // 3. Recharger les paiements
                                    await loadPaiements();
                                  } catch (error) {
                                    console.error('[QuotePaiements] Erreur régénération:', error);
                                    toast.error('Erreur lors de la régénération du lien', { id: 'regenerate' });
                                  }
                                }}
                              >
                                <RefreshCw className="w-4 h-4" />
                                Régénérer
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-2"
                                onClick={async () => {
                                  try {
                                    toast.loading('Mise en inactif...', { id: 'deactivate' });
                                    await cancelPaiement(paiement.id);
                                    toast.success('Lien mis en inactif', { id: 'deactivate' });
                                    await loadPaiements();
                                  } catch (error) {
                                    console.error('[QuotePaiements] Erreur mise en inactif:', error);
                                    toast.error('Erreur lors de la mise en inactif', { id: 'deactivate' });
                                  }
                                }}
                                title="Mettre le lien en inactif (il ne pourra plus être utilisé)"
                              >
                                <Ban className="w-4 h-4" />
                                Mettre en inactif
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={async () => {
                                  try {
                                    toast.loading('Génération du nouveau lien...', { id: 'regenerate' });
                                    
                                    // 1. Annuler l'ancien paiement
                                    await cancelPaiement(paiement.id);
                                    console.log('[QuotePaiements] Ancien paiement annulé:', paiement.id);
                                    
                                    // 2. Créer un nouveau paiement
                                    const response = await createPaiement(devisId, {
                                      amount: paiement.amount,
                                      type: paiement.type,
                                      description: paiement.description || `Régénération: ${paiement.type === 'PRINCIPAL' ? 'Paiement principal' : 'Surcoût'}`,
                                    });
                                    
                                    toast.success('Nouveau lien généré', { id: 'regenerate' });
                                    window.open(response.url, '_blank');
                                    
                                    // 3. Recharger les paiements
                                    await loadPaiements();
                                  } catch (error) {
                                    console.error('[QuotePaiements] Erreur régénération:', error);
                                    toast.error('Erreur lors de la régénération du lien', { id: 'regenerate' });
                                  }
                                }}
                              >
                                <RefreshCw className="w-4 h-4" />
                                Régénérer le lien
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
