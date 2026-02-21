import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Page interceptant la redirection OAuth Typeform quand l'URL de callback
 * pointe vers le frontend (www.mbe-sdv.fr). Redirige immédiatement vers
 * le backend pour traiter l'échange de code contre les tokens.
 */
export default function TypeformCallback() {
  useEffect(() => {
    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5174';
    const search = window.location.search; // Conserve code, state et eventuals params
    const backendUrl = `${API_BASE}/auth/typeform/callback${search}`;
    window.location.replace(backendUrl);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
      <p className="text-muted-foreground">Connexion Typeform en cours...</p>
    </div>
  );
}
