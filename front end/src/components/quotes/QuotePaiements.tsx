/**
 * Composant Paiements pour QuoteDetail
 * 
 * Affiche les paiements d'un devis et permet d'en créer de nouveaux
 */

import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { createPaiement, getPaiements, cancelPaiement } from '@/lib/stripeConnect';
import type { Paiement, PaiementType } from '@/types/stripe';
import { Quote } from '@/types/quote';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface QuotePaiementsProps {
  devisId: string;
  quote?: Quote; // Quote optionnel passé depuis le parent
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

export function QuotePaiements({ devisId, quote: initialQuote }: QuotePaiementsProps) {
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(initialQuote || null);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);

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

  // Calcul du total du devis
  const calculateQuoteTotal = () => {
    if (!quote) return 0;
    
    const packagingPrice = quote.options?.packagingPrice || 0;
    const shippingPrice = quote.options?.shippingPrice || 0;
    const insuranceAmount = computeInsuranceAmount(
      quote.lot?.value || 0,
      quote.options?.insurance,
      quote.options?.insuranceAmount
    );
    
    return packagingPrice + shippingPrice + insuranceAmount;
  };

  // Charger les paiements
  const loadPaiements = async () => {
    try {
      setIsLoading(true);
      const data = await getPaiements(devisId);
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

  // Générer automatiquement le paiement principal si nécessaire
  const autoGeneratePrincipalPayment = async () => {
    if (!quote || isAutoGenerating) return;
    
    // Vérifier s'il existe déjà un paiement principal
    const hasPrincipalPayment = paiements.some(p => p.type === 'PRINCIPAL');
    if (hasPrincipalPayment) return;
    
    // Calculer le total
    const total = calculateQuoteTotal();
    if (total <= 0) return;
    
    console.log('[QuotePaiements] 🤖 Génération automatique du paiement principal:', {
      devisId,
      total,
      quote: quote.reference,
    });
    
    try {
      setIsAutoGenerating(true);
      
      const response = await createPaiement(devisId, {
        amount: total,
        type: 'PRINCIPAL',
        description: `Paiement principal du devis ${quote.reference || devisId}`,
      });
      
      console.log('[QuotePaiements] ✅ Paiement principal créé automatiquement:', response);
      
      // Recharger les paiements
      await loadPaiements();
      
      toast.success('Lien de paiement principal généré', {
        description: `Montant: ${total.toFixed(2)}€`,
      });
    } catch (error: any) {
      console.error('[QuotePaiements] ❌ Erreur génération automatique:', error);
      // Ne pas afficher d'erreur à l'utilisateur pour la génération automatique
      // L'utilisateur pourra toujours créer manuellement
    } finally {
      setIsAutoGenerating(false);
    }
  };

  // Polling automatique toutes les 30 secondes
  useEffect(() => {
    loadPaiements();

    const interval = setInterval(loadPaiements, 30000);
    return () => clearInterval(interval);
  }, [devisId]);

  // Générer automatiquement le paiement principal après le chargement
  useEffect(() => {
    if (!isLoading && quote && paiements.length >= 0) {
      autoGeneratePrincipalPayment();
    }
  }, [isLoading, quote, paiements.length]);

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
      
      // Message d'erreur spécifique pour la configuration Stripe incomplète
      if (error.response?.data?.error === 'Configuration Stripe incomplète') {
        toast.error('Configuration Stripe incomplète', {
          description: error.response.data.action || 'Vous devez configurer le nom de votre entreprise dans Stripe.',
          action: {
            label: 'Ouvrir Stripe',
            onClick: () => window.open('https://dashboard.stripe.com/settings/account', '_blank'),
          },
          duration: 15000,
        });
      } else {
        const errorMessage = error.response?.data?.message || error.message || 'Erreur lors de la création du paiement';
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
              <span className="text-muted-foreground">Emballage</span>
              <span className="font-medium">{(quote.options?.packagingPrice || 0).toFixed(2)}€</span>
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
              disabled={isLoading || isAutoGenerating}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading || isAutoGenerating ? 'animate-spin' : ''}`} />
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
          {isAutoGenerating && (
            <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Génération automatique du lien de paiement principal...</span>
            </div>
          )}
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
                          {paiement.stripeCheckoutUrl ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={() => window.open(paiement.stripeCheckoutUrl!, '_blank')}
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

