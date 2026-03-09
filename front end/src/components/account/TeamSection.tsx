/**
 * Section Équipe dans la page Compte
 * Visible uniquement pour les plans Pro et Ultra
 */

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { usePermissions } from '@/hooks/usePermissions';
import { authenticatedFetch } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Users, Loader2, Plus, Pencil, UserPlus, Lock } from 'lucide-react';
import { toast } from 'sonner';
import {
  ZONES,
  ACTIONS,
  ZONE_LABELS,
  ACTION_LABELS,
  type TeamMember,
  type TeamMemberCreate,
  type Permissions,
} from '@/types/team';

const planId = (saasAccount: { planId?: string; plan?: string } | null) =>
  (saasAccount?.planId || saasAccount?.plan || 'starter').toLowerCase();

const maxMembers = (p: string) => (p === 'ultra' ? 999 : p === 'pro' ? 3 : 1);

function PermissionGrid({
  value,
  onChange,
  disabled,
}: {
  value: Permissions;
  onChange: (p: Permissions) => void;
  disabled?: boolean;
}) {
  const toggle = (zone: string, action: string) => {
    if (disabled) return;
    const next = { ...value };
    const arr = next[zone as keyof Permissions] || [];
    const idx = arr.indexOf(action as any);
    if (idx >= 0) {
      next[zone as keyof Permissions] = arr.filter((a) => a !== action);
    } else {
      next[zone as keyof Permissions] = [...arr, action];
    }
    onChange(next);
  };
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Zone</TableHead>
            {ACTIONS.map((a) => (
              <TableHead key={a} className="text-center text-xs">
                {ACTION_LABELS[a]}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ZONES.map((zone) => (
            <TableRow key={zone}>
              <TableCell className="font-medium">{ZONE_LABELS[zone]}</TableCell>
              {ACTIONS.map((action) => {
                const checked = (value[zone as keyof Permissions] || []).includes(action);
                return (
                  <TableCell key={action} className="text-center">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(zone, action)}
                      disabled={disabled}
                      className="cursor-pointer"
                    />
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function TeamSection() {
  const { saasAccount, teamMemberId } = useAuth();
  const { can } = usePermissions();
  const {
    members,
    isLoading,
    createMember,
    updateMember,
    deleteMember,
    isCreating,
    isUpdating,
    isDeleting,
  } = useTeamMembers();

  const plan = planId(saasAccount);
  const showTeam = plan === 'pro' || plan === 'ultra';
  const canReadTeam = can('team', 'read');
  const canCreateTeam = can('team', 'create');
  const canUpdateTeam = can('team', 'update');
  const canDeleteTeam = can('team', 'delete');

  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerDialogOpen, setOwnerDialogOpen] = useState(false);
  const [ownerCreating, setOwnerCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [form, setForm] = useState<Partial<TeamMemberCreate>>({
    username: '',
    password: '',
    firstName: '',
    lastName: '',
    permissions: {},
  });
  const [editForm, setEditForm] = useState<Partial<TeamMember>>({});

  const hasOwnerProfile = members.some((m) => m.isOwner);
  const isOwnerUser = !teamMemberId;

  const handleCreateOwnerProfile = async () => {
    if (!ownerPassword || ownerPassword.length < 6) {
      toast.error('Mot de passe requis (min 6 caractères)');
      return;
    }
    setOwnerCreating(true);
    try {
      const res = await authenticatedFetch('/api/team/create-owner-profile', {
        method: 'POST',
        body: JSON.stringify({ password: ownerPassword }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Erreur');
      }
      toast.success('Profil propriétaire créé. Utilisez l\'email du compte + ce mot de passe pour vous connecter.');
      setOwnerDialogOpen(false);
      setOwnerPassword('');
      window.location.reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setOwnerCreating(false);
    }
  };

  const handleCreateMember = async () => {
    if (!form.username || !form.password || form.password.length < 6) {
      toast.error('Nom d\'utilisateur et mot de passe requis (min 6 caractères)');
      return;
    }
    try {
      await createMember({
        username: form.username,
        password: form.password,
        firstName: form.firstName || '',
        lastName: form.lastName || '',
        permissions: form.permissions || {},
      });
      toast.success('Membre créé');
      setCreateOpen(false);
      setForm({ username: '', password: '', firstName: '', lastName: '', permissions: {} });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    }
  };

  const handleUpdateMember = async () => {
    if (!editMember) return;
    const body: { firstName?: string; lastName?: string; password?: string; permissions?: Permissions } = {
      firstName: editForm.firstName,
      lastName: editForm.lastName,
      permissions: editForm.permissions,
    };
    if ((editForm as { password?: string }).password?.trim()) {
      body.password = (editForm as { password?: string }).password;
    }
    try {
      await updateMember({ id: editMember.id, body });
      toast.success('Membre mis à jour');
      setEditMember(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    }
  };

  const handleDeleteMember = async (m: TeamMember) => {
    if (m.isOwner) return;
    try {
      await deleteMember(m.id);
      toast.success('Membre désactivé');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    }
  };

  if (!showTeam) return null;
  if (!canReadTeam) return null;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const needsOwnerProfile = isOwnerUser && !hasOwnerProfile;
  const limit = maxMembers(plan);
  const currentCount = members.filter((m) => m.isActive).length;
  const canAddMore = currentCount < limit && canCreateTeam;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>Équipe</CardTitle>
          </div>
          <span className="text-sm text-muted-foreground">
            {currentCount}/{limit} utilisateurs
          </span>
        </div>
        <CardDescription>
          Gérez les membres de votre équipe et leurs permissions (plans Pro et Ultra).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {needsOwnerProfile && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900 dark:text-amber-100">
                  Créer votre profil de connexion équipe
                </p>
                <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                  Pour activer la connexion multi-utilisateurs, définissez un mot de passe qui sera
                  utilisé avec l&apos;email du compte pour vous connecter.
                </p>
                <Button
                  className="mt-3"
                  onClick={() => setOwnerDialogOpen(true)}
                  disabled={ownerCreating}
                >
                  {ownerCreating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Définir mon mot de passe
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Membres</h4>
            {canAddMore && !needsOwnerProfile && (
              <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)} disabled={isCreating}>
                <Plus className="mr-1.5 h-4 w-4" />
                Ajouter
              </Button>
            )}
          </div>

          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Aucun membre pour le moment.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Identifiant</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <span className="font-medium">
                        {[m.firstName, m.lastName].filter(Boolean).join(' ') || m.username}
                      </span>
                      {m.isOwner && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          Propriétaire
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.username}</TableCell>
                    <TableCell>
                      {m.isActive ? (
                        <Badge variant="default" className="bg-green-600">Actif</Badge>
                      ) : (
                        <Badge variant="secondary">Inactif</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!m.isOwner && canUpdateTeam && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditMember(m);
                            setEditForm({
                              firstName: m.firstName,
                              lastName: m.lastName,
                              permissions: m.permissions,
                            });
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {!m.isOwner && canDeleteTeam && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => handleDeleteMember(m)}
                          disabled={isDeleting}
                        >
                          Désactiver
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>

      {/* Dialog création profil owner */}
      <Dialog open={ownerDialogOpen} onOpenChange={setOwnerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Définir votre mot de passe de connexion équipe</DialogTitle>
            <DialogDescription>
              Ce mot de passe sera utilisé avec l&apos;email du compte ({saasAccount?.email}) pour
              vous connecter. Vous pourrez le modifier plus tard.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="owner-password">Mot de passe</Label>
            <Input
              id="owner-password"
              type="password"
              value={ownerPassword}
              onChange={(e) => setOwnerPassword(e.target.value)}
              placeholder="Min. 6 caractères"
              className="mt-2"
              minLength={6}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOwnerDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreateOwnerProfile} disabled={ownerCreating || ownerPassword.length < 6}>
              {ownerCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog création membre */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ajouter un membre</DialogTitle>
            <DialogDescription>
              Créez un nouveau profil avec identifiant et mot de passe. Définissez les permissions par zone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create-username">Identifiant (ex: jean.preparation)</Label>
                <Input
                  id="create-username"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="jean.preparation"
                />
              </div>
              <div>
                <Label htmlFor="create-password">Mot de passe</Label>
                <Input
                  id="create-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Min. 6 caractères"
                />
              </div>
              <div>
                <Label htmlFor="create-firstName">Prénom</Label>
                <Input
                  id="create-firstName"
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="create-lastName">Nom</Label>
                <Input
                  id="create-lastName"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Permissions</Label>
              <PermissionGrid
                value={form.permissions || {}}
                onChange={(p) => setForm((f) => ({ ...f, permissions: p }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreateMember} disabled={isCreating || !form.username || !form.password || (form.password?.length ?? 0) < 6}>
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog édition membre */}
      <Dialog open={!!editMember} onOpenChange={(open) => !open && setEditMember(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier le membre</DialogTitle>
            <DialogDescription>
              Modifiez les informations et permissions. Laissez le mot de passe vide pour ne pas le changer.
            </DialogDescription>
          </DialogHeader>
          {editMember && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Identifiant</Label>
                  <p className="text-sm text-muted-foreground mt-1">{editMember.username}</p>
                </div>
                <div>
                  <Label htmlFor="edit-password">Nouveau mot de passe (optionnel)</Label>
                  <Input
                    id="edit-password"
                    type="password"
                    value={(editForm as any).password ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Laisser vide pour ne pas modifier"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-firstName">Prénom</Label>
                  <Input
                    id="edit-firstName"
                    value={editForm.firstName ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-lastName">Nom</Label>
                  <Input
                    id="edit-lastName"
                    value={editForm.lastName ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Permissions</Label>
                <PermissionGrid
                  value={editForm.permissions || {}}
                  onChange={(p) => setEditForm((f) => ({ ...f, permissions: p }))}
                  disabled={editMember.isOwner}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMember(null)}>
              Annuler
            </Button>
            <Button onClick={handleUpdateMember} disabled={isUpdating}>
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
