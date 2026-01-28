/**
 * Composant NotificationDrawer
 * 
 * Panneau latéral affichant la liste des notifications
 * S'ouvre au clic sur la cloche
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, MessageSquare, CreditCard, Send, CheckCircle, DollarSign } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { getNotifications, deleteNotification } from '@/lib/notifications';
import type { Notification, NotificationType } from '@/types/notification';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface NotificationDrawerProps {
  clientId?: string; // Optionnel : sera récupéré depuis le token si non fourni
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNotificationRead?: () => void;
}

// Icône selon le type de notification
function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case 'NEW_MESSAGE':
      return <MessageSquare className="h-5 w-5 text-blue-500" />;
    case 'PAYMENT_RECEIVED':
      return <CreditCard className="h-5 w-5 text-green-500" />;
    case 'DEVIS_SENT':
      return <Send className="h-5 w-5 text-purple-500" />;
    case 'DEVIS_PAID':
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case 'DEVIS_PARTIALLY_PAID':
      return <DollarSign className="h-5 w-5 text-yellow-500" />;
    case 'SURCOUT_CREATED':
      return <CreditCard className="h-5 w-5 text-orange-500" />;
    default:
      return <MessageSquare className="h-5 w-5 text-gray-500" />;
  }
}

// Redirection selon le type de notification
function getNotificationRedirect(type: NotificationType, devisId: string) {
  switch (type) {
    case 'NEW_MESSAGE':
      return `/quotes/${devisId}?tab=messages`;
    case 'PAYMENT_RECEIVED':
    case 'DEVIS_PAID':
    case 'DEVIS_PARTIALLY_PAID':
    case 'SURCOUT_CREATED':
      return `/quotes/${devisId}?tab=paiements`;
    case 'DEVIS_SENT':
      return `/quotes/${devisId}`;
    default:
      return `/quotes/${devisId}`;
  }
}

export function NotificationDrawer({
  clientId,
  open,
  onOpenChange,
  onNotificationRead,
}: NotificationDrawerProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const loadNotifications = async () => {
    if (!open) return;

    setIsLoading(true);
    try {
      // Si clientId n'est pas fourni, le backend le récupérera depuis le token
      const data = await getNotifications(clientId);
      setNotifications(data);
    } catch (error) {
      // Si erreur 400 (clientId manquant), on ignore silencieusement
      if (error instanceof Error && error.message.includes('clientId requis')) {
        console.log('[NotificationDrawer] ClientId non disponible, attente authentification...');
        setNotifications([]);
      } else {
        console.error('[NotificationDrawer] Erreur chargement:', error);
        toast.error('Erreur lors du chargement des notifications');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadNotifications();
    }
  }, [open, clientId]);

  const handleNotificationClick = async (notification: Notification) => {
    try {
      // Supprimer la notification (marquer comme lue)
      // Si clientId n'est pas fourni, le backend le récupérera depuis le token
      await deleteNotification(notification.id, clientId);

      // Recharger les notifications
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));

      // Notifier le parent pour recharger le compteur
      onNotificationRead?.();

      // Fermer le drawer
      onOpenChange(false);

      // Rediriger vers la page appropriée
      const redirectUrl = getNotificationRedirect(notification.type, notification.devisId);
      navigate(redirectUrl);
    } catch (error) {
      console.error('[NotificationDrawer] Erreur suppression:', error);
      toast.error('Erreur lors de la suppression de la notification');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>
            {notifications.length === 0
              ? 'Aucune notification'
              : `${notifications.length} notification${notifications.length > 1 ? 's' : ''}`}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-muted-foreground">Chargement...</div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-sm text-muted-foreground">Aucune notification</p>
              <p className="text-xs text-muted-foreground mt-1">
                Vous serez notifié des événements importants
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification, index) => (
                <div key={notification.id}>
                  <button
                    onClick={() => handleNotificationClick(notification)}
                    className="w-full text-left p-4 hover:bg-accent rounded-lg transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-none mb-1">
                          {notification.title}
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {formatDistanceToNow(notification.createdAt, {
                            addSuffix: true,
                            locale: fr,
                          })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await deleteNotification(notification.id, clientId);
                            setNotifications((prev) =>
                              prev.filter((n) => n.id !== notification.id)
                            );
                            onNotificationRead?.();
                            toast.success('Notification supprimée');
                          } catch (error) {
                            toast.error('Erreur lors de la suppression');
                          }
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </button>
                  {index < notifications.length - 1 && <Separator />}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

