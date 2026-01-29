import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  CreditCard,
  Truck,
  Package,
  Send,
  Kanban,
  Building2,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';

const navigation = [
  { name: 'Tableau de bord', href: '/', icon: LayoutDashboard },
  { name: 'Nouveaux devis', href: '/quotes/new', icon: FileText },
  { name: 'Paiements', href: '/payments', icon: CreditCard },
  { name: 'Salles des ventes', href: '/auction-houses', icon: Building2 },
  { name: 'Collectes', href: '/collections', icon: Truck },
  { name: 'Préparation', href: '/preparation', icon: Package },
  { name: 'Expéditions', href: '/shipments', icon: Send },
  { name: 'Pipeline', href: '/pipeline', icon: Kanban },
];

const secondaryNavigation = [
  { name: 'Paramètres', href: '/settings', icon: Settings },
  { name: 'Aide', href: '/help', icon: HelpCircle },
];

export function AppSidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">M</span>
            </div>
            <span className="font-semibold text-lg">MBE Nice</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href || 
            (item.href !== '/' && location.pathname.startsWith(item.href));
          
          return (
            <NavLink
              key={item.name}
              to={item.href}
              className={cn(
                'sidebar-item',
                isActive ? 'sidebar-item-active' : 'sidebar-item-inactive',
                collapsed && 'justify-center px-2'
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Secondary Navigation */}
      <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
        {secondaryNavigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            className={cn(
              'sidebar-item sidebar-item-inactive',
              collapsed && 'justify-center px-2'
            )}
            title={collapsed ? item.name : undefined}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>{item.name}</span>}
          </NavLink>
        ))}
      </div>
    </aside>
  );
}
