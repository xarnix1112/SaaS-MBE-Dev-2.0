import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function AppLayout() {
  // Mettre à jour le titre de la page avec le nom commercial
  useDocumentTitle();

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
