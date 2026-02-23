import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout, deleteCurrentUser, reauthenticateWithPassword } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useFeatures } from '@/hooks/use-features';
import { authenticatedFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Building2, Mail, Phone, MapPin, LogOut, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AppHeader } from '@/components/layout/AppHeader';

export default function Account() {
  const navigate = useNavigate();
  const { saasAccount, user, isLoading } = useAuth();
  const { data: featuresData } = useFeatures(saasAccount?.id);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  useEffect(() => {
    // Si pas de compte SaaS chargé et pas en chargement, rediriger
    if (!isLoading && !saasAccount) {
      navigate('/welcome', { replace: true });
    }
  }, [isLoading, saasAccount, navigate]);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
      toast.success('Déconnexion réussie');
      navigate('/welcome', { replace: true });
    } catch (error) {
      console.error('[Account] Erreur lors de la déconnexion:', error);
      toast.error('Erreur lors de la déconnexion');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleDeleteAccount = async (password: string) => {
    if (!password.trim()) {
      toast.error('Veuillez entrer votre mot de passe');
      return;
    }
    try {
      setIsDeleting(true);
      // 1. Réauthentification (requise par Firebase avant deleteUser - auth/requires-recent-login)
      await reauthenticateWithPassword(password);
      // 2. Suppression des données côté backend (avec X-Saas-Account-Id en fallback)
      const res = await authenticatedFetch('/api/account', {
        method: 'DELETE',
        forceRefresh: true,
        headers: saasAccount?.id ? { 'X-Saas-Account-Id': saasAccount.id } : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erreur lors de la suppression');
      }
      // 3. Suppression du compte Firebase Auth
      await deleteCurrentUser();
      toast.success('Compte supprimé définitivement');
      navigate('/welcome', { replace: true });
    } catch (error: unknown) {
      console.error('[Account] Erreur suppression compte:', error);
      const err = error as { code?: string; message?: string };
      const msg = err?.message ?? (error instanceof Error ? error.message : 'Erreur lors de la suppression du compte');
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential' || msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        toast.error('Mot de passe incorrect');
      } else {
        toast.error(msg);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
          <p className="text-sm text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!saasAccount) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader 
        title="Mon compte" 
        clientId={saasAccount?.id}
      />
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <div className="space-y-6">
          {/* En-tête */}
          <div>
            <h1 className="text-3xl font-bold text-foreground">Mon compte</h1>
            <p className="text-muted-foreground mt-2">
              Gérez les informations de votre compte MBE
            </p>
          </div>

          {/* Informations MBE */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <CardTitle>Informations MBE</CardTitle>
              </div>
              <CardDescription>
                Les informations de votre compte Mail Boxes Etc.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Nom commercial
                  </label>
                  <p className="text-base font-semibold text-foreground mt-1">
                    {saasAccount.commercialName}
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Numéro MBE
                  </label>
                  <p className="text-base font-semibold text-foreground mt-1">
                    {saasAccount.mbeNumber}
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Ville
                  </label>
                  <p className="text-base font-semibold text-foreground mt-1">
                    {saasAccount.mbeCityCustom || saasAccount.mbeCity}
                  </p>
                </div>

                <div className="md:col-span-2">
                  <Label className="text-sm font-medium text-muted-foreground">
                    Plan
                  </Label>
                  <p className="text-base font-semibold text-foreground mt-1">
                    {featuresData?.planName ?? (saasAccount.plan === 'pro' ? 'Pro' : 'Starter')}
                  </p>
                  {featuresData?.remaining?.quotesPerYear != null && (
                    <div className="mt-3 w-full max-w-sm space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="progress-devis" className="text-sm font-normal text-muted-foreground">
                          Quota devis
                        </Label>
                        <span className="text-sm text-muted-foreground">
                          {featuresData.remaining.quotesPerYear === -1
                            ? 'Illimités'
                            : `${featuresData.remaining.quotesPerYear} restants / ${featuresData.limits?.quotesPerYear ?? '—'}`}
                        </span>
                      </div>
                      {featuresData.remaining.quotesPerYear !== -1 && featuresData.limits?.quotesPerYear != null && featuresData.limits.quotesPerYear > 0 && (
                        <Progress
                          id="progress-devis"
                          value={Math.min(100, ((featuresData.usage?.quotesUsedThisYear ?? 0) / featuresData.limits.quotesPerYear) * 100)}
                          className="h-2"
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Informations de contact */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                <CardTitle>Informations de contact</CardTitle>
              </div>
              <CardDescription>
                Vos coordonnées et informations de contact
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Email
                    </label>
                    <p className="text-base text-foreground mt-1">
                      {saasAccount.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Téléphone
                    </label>
                    <p className="text-base text-foreground mt-1">
                      {saasAccount.phone}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 md:col-span-2">
                  <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <label className="text-sm font-medium text-muted-foreground">
                      Adresse
                    </label>
                    <p className="text-base text-foreground mt-1">
                      {saasAccount.address.street}
                      <br />
                      {saasAccount.address.zip} {saasAccount.address.city}
                      {saasAccount.address.country && (
                        <>
                          <br />
                          {saasAccount.address.country}
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Compte utilisateur */}
          {user && (
            <Card>
              <CardHeader>
                <CardTitle>Compte utilisateur</CardTitle>
                <CardDescription>
                  Informations de votre compte de connexion
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Email de connexion
                  </label>
                  <p className="text-base text-foreground mt-1">
                    {user.email}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Actions */}
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">Zone de danger</CardTitle>
              <CardDescription>
                Actions irréversibles sur votre compte
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="destructive"
                  onClick={handleLogout}
                  disabled={isLoggingOut || isDeleting}
                  className="sm:w-auto"
                >
                  {isLoggingOut ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Déconnexion...
                    </>
                  ) : (
                    <>
                      <LogOut className="mr-2 h-4 w-4" />
                      Se déconnecter
                    </>
                  )}
                </Button>
                <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => { setDeleteDialogOpen(open); if (!open) setDeletePassword(''); }}>
                  <Button
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-destructive/10 sm:w-auto"
                    disabled={isLoggingOut || isDeleting}
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Supprimer compte
                  </Button>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer votre compte ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Cette action est irréversible. Toutes vos données (devis, paiements, paramètres…)
                        seront définitivement supprimées. Entrez votre mot de passe pour confirmer.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="py-4">
                      <Label htmlFor="delete-password">Mot de passe</Label>
                      <Input
                        id="delete-password"
                        type="password"
                        placeholder="Votre mot de passe"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        disabled={isDeleting}
                        className="mt-2"
                        autoComplete="current-password"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleDeleteAccount(deletePassword);
                          }
                        }}
                      />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.preventDefault();
                          handleDeleteAccount(deletePassword);
                        }}
                        disabled={isDeleting || !deletePassword.trim()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isDeleting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Suppression...
                          </>
                        ) : (
                          'Oui, supprimer'
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

