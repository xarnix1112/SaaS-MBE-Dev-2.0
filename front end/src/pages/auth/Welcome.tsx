/**
 * Page d'accueil - Choix entre connexion et inscription
 * 
 * Première page visible pour les utilisateurs non connectés
 * Permet de choisir entre créer un compte ou se connecter
 */

import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, UserPlus, LogIn, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { auth, logout } from '@/lib/firebase';

export default function Welcome() {
  const navigate = useNavigate();
  const { user, isLoading, isSetupComplete, userDoc } = useAuth();

  // Si déjà connecté, rediriger vers le dashboard ou setup-mbe
  // Déconnecter les utilisateurs anonymes s'ils existent
  useEffect(() => {
    const checkAndRedirect = async () => {
      if (!isLoading) {
        // Déconnecter les utilisateurs anonymes
        if (auth.currentUser?.isAnonymous) {
          try {
            await logout();
            console.log('[Welcome] Utilisateur anonyme déconnecté');
          } catch (error) {
            console.error('[Welcome] Erreur lors de la déconnexion anonyme:', error);
          }
          return; // Ne pas rediriger après déconnexion, rester sur Welcome
        }
        
        // Si connecté avec email/password ET a un document user, rediriger
        // Si l'utilisateur n'a pas encore de document user, rester sur Welcome
        if (user && !user.isAnonymous) {
          if (isSetupComplete) {
            navigate('/dashboard', { replace: true });
          } else if (userDoc) {
            // Seulement rediriger vers setup-mbe si l'utilisateur a déjà un document user
            // Sinon, il doit d'abord créer son compte via /register
            navigate('/setup-mbe', { replace: true });
          }
          // Si pas de userDoc, rester sur Welcome pour qu'il puisse créer un compte
        }
      }
    };
    
    checkAndRedirect();
  }, [user, isLoading, isSetupComplete, userDoc, navigate]);

  // Afficher un loader pendant la vérification
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center space-y-4">
          <Building2 className="h-12 w-12 mx-auto text-blue-600 animate-pulse" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  // Si connecté avec email/password et setup terminé, ne rien afficher (redirection en cours)
  // Mais si pas de userDoc, afficher Welcome pour permettre la création de compte
  if (user && !user.isAnonymous && (isSetupComplete || userDoc)) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <div className="w-full max-w-4xl space-y-8">
        {/* En-tête avec logo et message de bienvenue */}
        <div className="text-center space-y-4">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-blue-100 p-4">
              <Building2 className="h-12 w-12 text-blue-600" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900">
            Bienvenue sur QuoteFlow Pro
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            La solution complète pour gérer vos devis, expéditions et paiements MBE
          </p>
        </div>

        {/* Cartes de choix */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Carte : Créer un compte */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-500">
            <Link to="/register">
              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-4">
                  <div className="rounded-full bg-blue-100 p-3">
                    <UserPlus className="h-8 w-8 text-blue-600" />
                  </div>
                </div>
                <CardTitle className="text-2xl">Créer un compte</CardTitle>
                <CardDescription className="text-base mt-2">
                  Nouveau sur QuoteFlow Pro ? Créez votre compte en quelques minutes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    Configuration rapide de votre MBE
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    Gestion complète de vos devis
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    Paiements sécurisés avec Stripe
                  </li>
                </ul>
                <Button className="w-full" size="lg" variant="default">
                  Créer mon compte
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Link>
          </Card>

          {/* Carte : Se connecter */}
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-indigo-500">
            <Link to="/login">
              <CardHeader className="text-center pb-4">
                <div className="flex justify-center mb-4">
                  <div className="rounded-full bg-indigo-100 p-3">
                    <LogIn className="h-8 w-8 text-indigo-600" />
                  </div>
                </div>
                <CardTitle className="text-2xl">Se connecter</CardTitle>
                <CardDescription className="text-base mt-2">
                  Vous avez déjà un compte ? Connectez-vous pour accéder à votre espace
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    Accès à votre tableau de bord
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    Gestion de vos devis en cours
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    Suivi des paiements et expéditions
                  </li>
                </ul>
                <Button className="w-full" size="lg" variant="outline">
                  Se connecter
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Link>
          </Card>
        </div>

        {/* Lien vers mot de passe oublié (discret) */}
        <div className="text-center">
          <Link
            to="/forgot-password"
            className="text-sm text-muted-foreground hover:text-blue-600 hover:underline"
          >
            Mot de passe oublié ?
          </Link>
        </div>
      </div>
    </div>
  );
}

