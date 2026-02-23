import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api-base';

/**
 * Page interceptant la redirection OAuth Stripe Connect quand l'URL de callback
 * pointe vers le frontend (staging.mbe-sdv.fr). Redirige immédiatement vers
 * le backend Railway pour traiter l'échange de code contre les tokens.
 */
export default function StripeCallback() {
  useEffect(() => {
    const API_BASE = getApiBaseUrl() || 'http://localhost:5174';
    const search = window.location.search; // Conserve code, state et autres params
    const backendUrl = `${API_BASE}/stripe/callback${search}`;
    window.location.replace(backendUrl);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
      <p className="text-muted-foreground">Connexion Stripe en cours...</p>
    </div>
  );
}
