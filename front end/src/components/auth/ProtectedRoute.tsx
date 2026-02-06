/**
 * Composant ProtectedRoute
 * 
 * Protège les routes nécessitant une authentification
 * Redirige vers /login si non connecté
 * Redirige vers /setup-mbe si setup non terminé
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireSetup?: boolean; // Si true, nécessite que le setup soit terminé
}

export function ProtectedRoute({ children, requireSetup = true }: ProtectedRouteProps) {
  const { user, isLoading, isSetupComplete, userDoc } = useAuth();
  const location = useLocation();

  // Afficher un loader pendant le chargement
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  // Ignorer les utilisateurs anonymes (considérés comme non connectés)
  const isAuthenticated = user && !user.isAnonymous;

  // Si non connecté ou utilisateur anonyme, rediriger vers welcome
  if (!isAuthenticated) {
    return <Navigate to="/welcome" state={{ from: location }} replace />;
  }

  // Si setup requis (requireSetup = true) :
  // - Vérifier que l'utilisateur a un document user ET que le setup est terminé
  // - Sinon, rediriger vers setup-mbe
  if (requireSetup) {
    if (!userDoc || !isSetupComplete) {
      return <Navigate to="/setup-mbe" replace />;
    }
  }

  // Si setup non requis (requireSetup = false), comme pour /setup-mbe :
  // - Laisser passer l'utilisateur connecté même sans document user
  // - C'est justement dans /setup-mbe qu'on crée le document user

  return <>{children}</>;
}

