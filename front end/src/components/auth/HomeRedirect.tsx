/**
 * Composant HomeRedirect
 * 
 * Redirige "/" vers "/welcome" si non connecté, ou vers le dashboard si connecté
 * Utilisé pour gérer la route racine
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

export function HomeRedirect() {
  const { user, isLoading, isSetupComplete, userDoc } = useAuth();

  // Afficher un loader pendant la vérification (important pour laisser le temps à useAuth de charger)
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  // Ignorer les utilisateurs anonymes (considérés comme non connectés)
  const isAuthenticated = user && !user.isAnonymous;

  // Si connecté (avec email/password) et setup terminé, aller au dashboard
  if (isAuthenticated && isSetupComplete) {
    return <Navigate to="/dashboard" replace />;
  }

  // Si connecté (avec email/password) ET a un document user mais setup non terminé, aller au setup
  // Si l'utilisateur n'a pas encore de document user, considérer comme non connecté → Welcome
  if (isAuthenticated && userDoc && !isSetupComplete) {
    return <Navigate to="/setup-mbe" replace />;
  }

  // Dans TOUS les autres cas (non connecté, utilisateur anonyme, ou utilisateur sans document user), aller à la page de bienvenue
  // C'est le comportement par défaut et souhaité
  return <Navigate to="/welcome" replace />;
}

