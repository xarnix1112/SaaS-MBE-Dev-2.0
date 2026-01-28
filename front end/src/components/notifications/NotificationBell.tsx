/**
 * Composant NotificationBell
 * 
 * Icône cloche avec badge de compteur
 * Polling automatique toutes les 30 secondes
 */

import { useState, useEffect, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getNotificationsCount } from '@/lib/notifications';

interface NotificationBellProps {
  clientId?: string; // Optionnel : sera récupéré depuis le token si non fourni
  onClick: () => void;
}

export function NotificationBell({ clientId, onClick }: NotificationBellProps) {
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const loadCount = useCallback(async () => {
    // Si clientId n'est pas fourni, le backend le récupérera depuis le token
    // On peut quand même appeler l'API
    try {
      const notifCount = await getNotificationsCount(clientId);
      setCount(notifCount);
    } catch (error) {
      // Si erreur 400 (clientId manquant), on ignore silencieusement
      // car cela signifie que l'utilisateur n'est peut-être pas encore authentifié
      if (error instanceof Error && error.message.includes('clientId requis')) {
        console.log('[NotificationBell] ClientId non disponible, attente authentification...');
        setCount(0);
      } else {
        console.error('[NotificationBell] Erreur chargement compteur:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    // Charger immédiatement au montage
    loadCount();

    // Polling toutes les 30 secondes pour une meilleure réactivité
    const interval = setInterval(loadCount, 30000);

    return () => clearInterval(interval);
  }, [loadCount]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={onClick}
      disabled={isLoading}
    >
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
      <span className="sr-only">
        {count > 0 ? `${count} notifications` : 'Notifications'}
      </span>
    </Button>
  );
}

