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
  clientId: string;
  onClick: () => void;
}

export function NotificationBell({ clientId, onClick }: NotificationBellProps) {
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const loadCount = useCallback(async () => {
    if (!clientId) return;

    try {
      const notifCount = await getNotificationsCount(clientId);
      setCount(notifCount);
    } catch (error) {
      console.error('[NotificationBell] Erreur chargement compteur:', error);
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadCount();

    // OPTIMISATION: Augmenter l'intervalle de polling pour réduire les requêtes API
    // Passer de 30 secondes à 2 minutes (120 secondes)
    const interval = setInterval(loadCount, 120000);

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

