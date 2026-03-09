/**
 * Hook usePermissions
 * Charge les permissions depuis teamMembers/{teamMemberId} si team member,
 * sinon retourne tout autorisé (owner).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import type { Zone, Action, Permissions } from '@/types/team';

async function fetchTeamMemberPermissions(
  saasAccountId: string,
  teamMemberId: string
): Promise<Permissions> {
  const ref = doc(db, 'saasAccounts', saasAccountId, 'teamMembers', teamMemberId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return {};
  const data = snap.data();
  const member = data;
  if (member?.isOwner) {
    return Object.fromEntries(
      (['dashboard', 'quotes', 'payments', 'auctionHouses', 'collections', 'preparation', 'shipments', 'settings', 'team'] as const).map(
        (z) => [z, ['read', 'create', 'update', 'delete'] as Action[]]
      )
    ) as Permissions;
  }
  return (member?.permissions || {}) as Permissions;
}

export function usePermissions() {
  const { saasAccountId, teamMemberId, isTeamMember } = useAuth();

  const { data: permissions, isLoading } = useQuery({
    queryKey: ['permissions', saasAccountId, teamMemberId],
    queryFn: () =>
      saasAccountId && teamMemberId
        ? fetchTeamMemberPermissions(saasAccountId, teamMemberId)
        : Promise.resolve(null),
    enabled: !!saasAccountId && !!teamMemberId,
  });

  const can = useMemo(() => {
    if (!isTeamMember || !teamMemberId) {
      return () => true;
    }
    const perms = permissions || {};
    return (zone: Zone, action: Action): boolean => {
      const actions = perms[zone];
      if (!actions || !Array.isArray(actions)) return false;
      return actions.includes(action);
    };
  }, [isTeamMember, teamMemberId, permissions]);

  return {
    can,
    permissions: permissions ?? null,
    isLoading,
    isTeamMember,
  };
}
