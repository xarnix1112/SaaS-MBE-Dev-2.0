/**
 * Types pour la gestion d'équipe et les permissions
 */

export const ZONES = [
  'dashboard',
  'quotes',
  'payments',
  'auctionHouses',
  'collections',
  'preparation',
  'shipments',
  'settings',
  'team',
] as const;

export const ACTIONS = ['read', 'create', 'update', 'delete'] as const;

export type Zone = (typeof ZONES)[number];
export type Action = (typeof ACTIONS)[number];

export type Permissions = Partial<Record<Zone, Action[]>>;

export interface TeamMember {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  isOwner: boolean;
  isActive: boolean;
  permissions: Permissions;
  createdAt: string;
  createdBy?: string;
}

export interface TeamMemberCreate {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  permissions: Permissions;
}

export interface TeamMemberUpdate {
  firstName?: string;
  lastName?: string;
  password?: string;
  permissions?: Permissions;
  isActive?: boolean;
}

export interface TeamProfile {
  id: string;
  displayName: string;
  isOwner: boolean;
}

export const ZONE_LABELS: Record<Zone, string> = {
  dashboard: 'Tableau de bord',
  quotes: 'Devis',
  payments: 'Paiements',
  auctionHouses: 'Salles des ventes',
  collections: 'Collectes',
  preparation: 'Préparation',
  shipments: 'Expéditions',
  settings: 'Paramètres',
  team: 'Équipe',
};

export const ACTION_LABELS: Record<Action, string> = {
  read: 'Lecture',
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
};

/** Mapping zone → routes/paths pour vérification des permissions */
export const ZONE_ROUTES: Record<Zone, string[]> = {
  dashboard: ['/', '/dashboard'],
  quotes: ['/quotes/new', '/quotes/refused', '/quotes/shipped', '/pipeline'],
  payments: ['/payments'],
  auctionHouses: ['/auction-houses'],
  collections: ['/collections'],
  preparation: ['/preparation'],
  shipments: ['/shipments'],
  settings: ['/settings'],
  team: ['/account'],
};

/** Retourne la zone correspondant au path (pour vérification permissions) */
export function getZoneForPath(pathname: string): Zone | null {
  const norm = pathname.split('?')[0];
  if (norm === '/' || norm === '/dashboard') return 'dashboard';
  if (norm.startsWith('/quotes')) return 'quotes';
  if (norm.startsWith('/payments')) return 'payments';
  if (norm.startsWith('/auction-houses')) return 'auctionHouses';
  if (norm.startsWith('/collections')) return 'collections';
  if (norm.startsWith('/preparation')) return 'preparation';
  if (norm.startsWith('/shipments')) return 'shipments';
  if (norm.startsWith('/settings')) return 'settings';
  if (norm.startsWith('/account')) return 'team';
  if (norm.startsWith('/help')) return null; // Aide accessible à tous
  return null;
}

/** Permissions par défaut pour owner (tout autorisé) */
export const FULL_PERMISSIONS: Permissions = Object.fromEntries(
  ZONES.map((zone) => [zone, [...ACTIONS]])
) as Permissions;
