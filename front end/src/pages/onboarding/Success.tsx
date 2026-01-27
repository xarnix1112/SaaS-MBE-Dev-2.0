/**
 * Page de confirmation après configuration MBE
 * 
 * Affiche un message personnalisé de bienvenue
 */

import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, ArrowRight } from 'lucide-react';

export default function Success() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Récupérer les données passées depuis SetupMBE
  const state = location.state as { commercialName?: string; mbeCity?: string } | null;
  const commercialName = state?.commercialName || 'votre MBE';
  const mbeCity = state?.mbeCity || '';

  useEffect(() => {
    // Rediriger vers le dashboard après 10 secondes si l'utilisateur ne clique pas
    const timer = setTimeout(() => {
      navigate('/');
    }, 10000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-green-100 p-4">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold text-green-700">
            🎉 Bienvenue chez {commercialName} !
          </CardTitle>
          <CardDescription className="text-base mt-4">
            Merci d'avoir créé votre compte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-4">
            <p className="text-lg text-muted-foreground">
              Toute l'équipe vous souhaite beaucoup de réussite dans le développement de votre activité.
            </p>
            {mbeCity && (
              <p className="text-base text-muted-foreground">
                Votre espace est prêt pour gérer vos devis, expéditions et paiements en toute simplicité.
              </p>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <h3 className="font-semibold text-blue-900">Prochaines étapes :</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
              <li>Configurez vos paramètres Stripe pour accepter les paiements</li>
              <li>Importez vos premiers devis depuis Google Sheets</li>
              <li>Explorez votre tableau de bord</li>
            </ul>
          </div>

          <Button
            onClick={() => navigate('/')}
            className="w-full"
            size="lg"
          >
            Accéder à mon tableau de bord
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Vous serez redirigé automatiquement dans quelques secondes...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

