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
  if (!isAuthenticated) (typeof fetch!=='undefined')&&fetch('http://127.0.0.1:7614/ingest/0bfbd811-2706-4d7c-9d97-3770fc92a237',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'86a80e'},body:JSON.stringify({sessionId:'86a80e',location:'HomeRedirect.tsx',message:'Not authenticated → welcome',data:{hasUser:!!user},timestamp:Date.now(),hypothesisId:'B,C'})}).catch(()=>{});

  // Si connecté (avec email/password) et setup terminé, aller au dashboard
  // (nécessite userDoc pour être considéré comme setup terminé)
  if (isAuthenticated && userDoc && isSetupComplete) {
    // #region agent log
    (typeof fetch!=='undefined')&&fetch('http://127.0.0.1:7614/ingest/0bfbd811-2706-4d7c-9d97-3770fc92a237',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'86a80e'},body:JSON.stringify({sessionId:'86a80e',location:'HomeRedirect.tsx',message:'Redirect to dashboard',data:{hasUserDoc:!!userDoc,isSetupComplete},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    return <Navigate to="/dashboard" replace />;
  }

  // Si connecté (avec email/password) mais setup non terminé OU pas de document user, aller au setup
  // Cela inclut les cas où :
  // - L'utilisateur vient de se connecter mais n'a pas encore de document user
  // - L'utilisateur a un document user mais pas de saasAccountId
  if (isAuthenticated && (!userDoc || !isSetupComplete)) {
    // #region agent log
    (typeof fetch!=='undefined')&&fetch('http://127.0.0.1:7614/ingest/0bfbd811-2706-4d7c-9d97-3770fc92a237',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'86a80e'},body:JSON.stringify({sessionId:'86a80e',location:'HomeRedirect.tsx',message:'Redirect to choose-plan',data:{hasUserDoc:!!userDoc,isSetupComplete},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    return <Navigate to="/choose-plan" replace />;
  }

  // Dans TOUS les autres cas (non connecté, utilisateur anonyme), aller à la page de bienvenue
  return <Navigate to="/welcome" replace />;
}

