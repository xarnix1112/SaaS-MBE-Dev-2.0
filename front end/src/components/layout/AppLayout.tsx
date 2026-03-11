import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePermissions } from '@/hooks/usePermissions';
import { getZoneForPath } from '@/types/team';

export function AppLayout() {
  useDocumentTitle();
  const location = useLocation();
  const { can, isLoading: permissionsLoading } = usePermissions();

  const zone = getZoneForPath(location.pathname);
  if (zone && !permissionsLoading && !can(zone, 'read')) {
    return <Navigate to="/help" replace />;
  }

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
