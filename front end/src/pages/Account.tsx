import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Building2, Mail, Phone, MapPin, LogOut, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AppHeader } from '@/components/layout/AppHeader';

export default function Account() {
  const navigate = useNavigate();
  const { saasAccount, user, isLoading } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

                <div>
                  <label className="text-sm font-medium text-muted-foreground">
                    Plan
                  </label>
                  <p className="text-base font-semibold text-foreground mt-1 capitalize">
                    {saasAccount.plan === 'pro' ? 'Pro' : 'Gratuit'}
                  </p>
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
              <Button
                variant="destructive"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="w-full sm:w-auto"
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

