/**
 * Page de sélection du plan
 *
 * Affiche les plans Starter, Pro, Ultra et permet à l'utilisateur
 * de choisir avant de créer son compte MBE
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Zap, Crown, Sparkles } from 'lucide-react';

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 50,
    icon: Zap,
    description: 'Parfait pour démarrer',
    features: [
      '2000 devis / an',
      'File d\'attente standard',
      'Paiement Stripe',
      '1 utilisateur',
      '2 salles des ventes',
      'Support email standard',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 100,
    icon: Crown,
    description: 'Pour développer votre activité',
    popular: true,
    features: [
      '5000 devis / an',
      'Priorité moyenne',
      'Paiement Stripe',
      'Push vers MBE Hub',
      '3 utilisateurs',
      '5 salles des ventes',
      'Multi-agence',
      '3 mails personnalisés',
      '2 évolutions incluses',
      'Support prioritaire',
    ],
  },
  {
    id: 'ultra',
    name: 'Ultra',
    price: 250,
    icon: Sparkles,
    description: 'Tout inclus',
    features: [
      '12000 devis / an',
      'Priorité haute',
      'Paiement Stripe & personnalisé',
      'Push vers MBE Hub',
      'Utilisateurs illimités',
      'Salles des ventes illimitées',
      'Multi-agence',
      '10 mails personnalisés',
      '5 évolutions (roadmap personnalisé)',
      'Support + visio onboarding + contact direct',
    ],
  },
];

export default function ChoosePlan() {
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleSelectPlan = (planId: string) => {
    navigate('/setup-mbe', { state: { planId } });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <div className="w-full max-w-5xl space-y-8">
        {/* En-tête */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">
            Choisissez votre plan
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Sélectionnez l&apos;offre qui correspond à vos besoins. Vous pourrez changer de plan plus tard.
          </p>
        </div>

        {/* Cartes des plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            return (
              <Card
                key={plan.id}
                className={`relative cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 ${
                  plan.popular ? 'border-primary ring-2 ring-primary/20' : ''
                }`}
                onClick={() => handleSelectPlan(plan.id)}
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
                    variant={plan.popular ? 'default' : 'outline'}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectPlan(plan.id);
                    }}
                  >
                    Choisir {plan.name}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Vous pourrez configurer les informations de votre MBE à l&apos;étape suivante.
        </p>
      </div>
    </div>
  );
}
