/**
 * Page de sélection du plan
 *
 * - Nouveau compte : choisir avant de créer son MBE → setup-mbe
 * - Compte existant : changer de plan → PATCH /api/account/plan → /account
 */

import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { authenticatedFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Zap, Crown, Sparkles, Loader2, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 45,
    icon: Zap,
    description: 'Parfait pour démarrer',
    features: [
      '2000 devis / an',
      'File d\'attente standard',
      'Paiement Stripe',
      'Pas de push MBE Hub',
      '1 utilisateur',
      '2 salles des ventes',
      '0 évolution incluse',
      'Support email standard',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 85,
    icon: Crown,
    description: 'Pour développer votre activité',
    popular: true,
    features: [
      '6000 devis / an',
      'Priorité moyenne',
      'Paiement Stripe',
      'Calcul prix expé Smart choice automatisé',
      'Push vers MBE Hub',
      '3 utilisateurs',
      '5 salles des ventes',
      'Multi-agence (Bientôt dispo)',
      '3 mails personnalisés',
      '2 évolutions incluses',
      'Support prioritaire',
    ],
  },
  {
    id: 'ultra',
    name: 'Ultra',
    price: 150,
    icon: Sparkles,
    description: 'Tout inclus',
    features: [
      'Devis illimités',
      'Priorité haute',
      'Paiement Stripe & personnalisé',
      'Calcul prix expé Smart choice automatisé',
      'Push vers MBE Hub',
      'Utilisateurs illimités',
      'Salles des ventes illimitées',
      'Multi-agence',
      '10 mails personnalisés',
      'Personnalisation email automatique',
      '5 évolutions (roadmap personnalisé)',
      'Support + visio onboarding + contact direct',
    ],
  },
];

export default function ChoosePlan() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { saasAccount, hasActiveSubscription } = useAuth();
  const [updatingPlanId, setUpdatingPlanId] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleSelectPlan = async (planId: string) => {
    if (saasAccount) {
      try {
        setUpdatingPlanId(planId);
        // Checkout Stripe pour abonnement (1er mois gratuit)
        const res = await authenticatedFetch('/api/account/plan/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId, promoCode: promoCode.trim() || undefined }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Erreur lors du changement de plan');
        }
        if (data.url) {
          window.location.href = data.url; // Redirection Stripe Checkout
          return;
        }
        toast.error('Erreur: aucune URL de paiement reçue');
      } catch (error) {
        console.error('[ChoosePlan] Erreur checkout plan:', error);
        toast.error(error instanceof Error ? error.message : 'Erreur lors du changement de plan');
      } finally {
        setUpdatingPlanId(null);
      }
    } else {
      navigate('/setup-mbe', { state: { planId, promoCode: promoCode.trim() || undefined } });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <div className="w-full max-w-5xl space-y-8">
        {saasAccount && (
          <div className="text-left">
            <Link to="/account" className="text-sm text-muted-foreground hover:text-primary hover:underline">
              ← Retour à Mon compte
            </Link>
          </div>
        )}
        {/* En-tête */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">
            {saasAccount ? 'Changer de plan' : 'Choisissez votre plan'}
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            {saasAccount
              ? "Sélectionnez le plan qui vous convient. Le changement est effectif immédiatement."
              : "Sélectionnez l'offre qui correspond à vos besoins. Vous pourrez changer de plan plus tard."}
          </p>
        </div>

        {/* Code promo optionnel */}
        <div className="max-w-sm mx-auto space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="promoCode" className="text-sm text-muted-foreground flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Code promo (optionnel)
            </Label>
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await authenticatedFetch('/api/stripe/promo-codes-status');
                  const data = await res.json();
                  if (data.ok) {
                    const msg = data.count === 0
                      ? `Mode ${data.keyMode || '?'}: ${data.hint || 'Aucun code trouvé. Vérifiez Test vs Live dans Stripe Dashboard.'}`
                      : `Mode ${data.keyMode || '?'} — codes visibles: ${data.codes.map((c: { code: string }) => c.code).join(', ')}`;
                    toast.info(msg, { duration: 12000 });
                  } else {
                    toast.error(data.error || 'Erreur diagnostic');
                  }
                } catch (e) {
                  toast.error('Erreur lors de la vérification');
                }
              }}
              className="text-xs text-muted-foreground hover:text-primary underline"
            >
              Vérifier
            </button>
          </div>
          <Input
            id="promoCode"
            type="text"
            placeholder="Ex. JEANNETEST"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            className="font-normal"
          />
        </div>

        {/* Cartes des plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const isCurrentPlan = saasAccount?.planId === plan.id && hasActiveSubscription;
            return (
              <Card
                key={plan.id}
                className={`relative transition-all hover:shadow-lg hover:border-primary/50 ${
                  plan.popular ? 'border-primary ring-2 ring-primary/20' : ''
                } ${isCurrentPlan ? '' : 'cursor-pointer'}`}
                onClick={() => !isCurrentPlan && handleSelectPlan(plan.id)}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                      Recommandé
                    </span>
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <div className="flex justify-center mb-2">
                    <div className="rounded-full bg-primary/10 p-3">
                      <Icon className="h-8 w-8 text-primary" />
                    </div>
                  </div>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="pt-2">
                    <span className="text-3xl font-bold">{plan.price}€</span>
                    <span className="text-muted-foreground text-sm">/an</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-600 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={plan.popular && !isCurrentPlan ? 'default' : 'outline'}
                    disabled={updatingPlanId !== null || isCurrentPlan}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isCurrentPlan) handleSelectPlan(plan.id);
                    }}
                  >
                    {updatingPlanId === plan.id ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Mise à jour...
                      </>
                    ) : isCurrentPlan ? (
                      'Plan actuellement utilisé'
                    ) : saasAccount ? (
                      `Passer à ${plan.name}`
                    ) : (
                      `Choisir ${plan.name}`
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {!saasAccount && (
          <p className="text-center text-sm text-muted-foreground">
            Vous pourrez configurer les informations de votre MBE à l&apos;étape suivante.
          </p>
        )}
      </div>
    </div>
  );
}
