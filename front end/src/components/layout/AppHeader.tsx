import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationDrawer } from '@/components/notifications/NotificationDrawer';
import { AccountMenu } from '@/components/auth/AccountMenu';

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  clientId?: string; // ID du client SaaS
}

export function AppHeader({ title, subtitle, clientId = 'dxHUjMCaJ0A7vFBiGNFR' }: AppHeaderProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <>
      <header className="h-16 border-b border-border bg-card px-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un devis..."
              className="w-64 pl-9 bg-secondary border-0"
            />
          </div>

          {/* Notifications */}
          <NotificationBell
            clientId={clientId}
            onClick={() => setIsDrawerOpen(true)}
          />

          {/* Account Menu */}
          <AccountMenu />
        </div>
      </header>

      {/* Notification Drawer */}
      <NotificationDrawer
        clientId={clientId}
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        onNotificationRead={() => {
          // Force le rechargement du compteur en fermant et rouvrant
          // Le NotificationBell se mettra à jour automatiquement via polling
        }}
      />
    </>
  );
}
