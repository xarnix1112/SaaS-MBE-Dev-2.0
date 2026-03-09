/**
 * Hook pour la gestion des membres d'équipe (CRUD)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authenticatedFetch } from '@/lib/api';
import type { TeamMember, TeamMemberCreate, TeamMemberUpdate } from '@/types/team';

async function fetchTeamMembers(): Promise<TeamMember[]> {
  const res = await authenticatedFetch('/api/team/members');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur chargement membres');
  }
  const data = await res.json();
  return data.map((m: any) => ({
    ...m,
    createdAt: m.createdAt || '',
  }));
}

async function createMember(body: TeamMemberCreate): Promise<TeamMember> {
  const res = await authenticatedFetch('/api/team/members', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur création membre');
  }
  return res.json();
}

async function updateMember(id: string, body: TeamMemberUpdate): Promise<TeamMember> {
  const res = await authenticatedFetch(`/api/team/members/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur mise à jour membre');
  }
  return res.json();
}

async function deleteMember(id: string): Promise<void> {
  const res = await authenticatedFetch(`/api/team/members/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur suppression membre');
  }
}

export function useTeamMembers() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['team', 'members'],
    queryFn: fetchTeamMembers,
  });

  const createMutation = useMutation({
    mutationFn: createMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', 'members'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: TeamMemberUpdate }) =>
      updateMember(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', 'members'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', 'members'] });
    },
  });

  return {
    members: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    createMember: createMutation.mutateAsync,
    updateMember: updateMutation.mutateAsync,
    deleteMember: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
