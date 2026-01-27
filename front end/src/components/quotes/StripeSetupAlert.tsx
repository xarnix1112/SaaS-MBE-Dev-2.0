/**
 * Alerte pour guider l'utilisateur dans la configuration Stripe
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, ExternalLink } from 'lucide-react';

interface StripeSetupAlertProps {
  type: 'firestore-index' | 'stripe-business-name';
  indexUrl?: string;
  onClose?: () => void;
}

export function StripeSetupAlert({ type, indexUrl, onClose }: StripeSetupAlertProps) {
  if (type === 'firestore-index') {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Index Firestore manquant</AlertTitle>
        <AlertDescription className="mt-2">
          <p className="mb-3">
            Pour afficher les paiements, vous devez créer un index dans Firebase Firestore.
          </p>
          {indexUrl ? (
            <Button
              size="sm"
              onClick={() => window.open(indexUrl, '_blank')}
              className="gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Créer l'index automatiquement
            </Button>
          ) : (
            <p className="text-sm">
              Consultez les logs du serveur pour obtenir le lien de création de l'index.
            </p>
          )}
          <p className="text-xs mt-2 opacity-75">
            ⏳ L'index sera créé en 2-3 minutes. Rechargez ensuite cette page.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  if (type === 'stripe-business-name') {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Configuration Stripe incomplète</AlertTitle>
        <AlertDescription className="mt-2">
          <p className="mb-3">
            Votre compte Stripe connecté doit avoir un <strong>nom d'entreprise</strong> configuré pour créer des liens de paiement.
          </p>
          <div className="space-y-2">
            <p className="text-sm font-medium">Étapes :</p>
            <ol className="text-sm space-y-1 ml-4 list-decimal">
              <li>Ouvrez le Dashboard Stripe de votre compte connecté</li>
              <li>Allez dans <strong>Paramètres → Account</strong></li>
              <li>Remplissez le champ <strong>"Business name"</strong></li>
              <li>Sauvegardez et réessayez</li>
            </ol>
          </div>
          <Button
            size="sm"
            onClick={() => window.open('https://dashboard.stripe.com/settings/account', '_blank')}
            className="gap-2 mt-3"
          >
            <ExternalLink className="h-4 w-4" />
            Ouvrir Stripe Dashboard
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

