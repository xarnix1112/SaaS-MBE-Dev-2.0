/**
 * Page de connexion
 *
 * Flux :
 * 1. Saisie email → debounce 300ms → GET /auth/team-profiles
 * 2. Si multiUser: false → formulaire classique (email + mot de passe) → signInWithEmailAndPassword
 * 3. Si multiUser: true → dropdown profils + mot de passe → POST /auth/team-login → signInWithCustomToken
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  auth,
  loginWithEmail,
  signInWithCustomTokenAuth,
} from '@/lib/firebase';
import { setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { publicFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Mail, Lock, Building2, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { TeamProfile } from '@/types/team';

interface TeamProfilesResponse {
  multiUser: boolean;
  profiles?: TeamProfile[];
}

export default function Login() {
  const navigate = useNavigate();
  const { user, isSetupComplete, isLoading: authLoading, userDoc } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState(false);

  const [teamProfiles, setTeamProfiles] = useState<TeamProfilesResponse | null>(null);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const fetchTeamProfiles = useCallback(async (emailVal: string) => {
    const trimmed = emailVal.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setTeamProfiles(null);
      return;
    }
    setProfilesLoading(true);
    setTeamProfiles(null);
    setSelectedProfileId(null);
    try {
      const res = await publicFetch(`/auth/team-profiles?email=${encodeURIComponent(trimmed)}`);
      const data = (await res.json()) as TeamProfilesResponse;
      setTeamProfiles(data);
      if (data.multiUser && data.profiles && data.profiles.length > 0) {
        setSelectedProfileId(data.profiles[0].id);
      }
    } catch {
      setTeamProfiles(null);
    } finally {
      setProfilesLoading(false);
    }
  }, []);

  useEffect(() => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setTeamProfiles(null);
      setProfilesLoading(false);
      return;
    }
    const t = setTimeout(() => fetchTeamProfiles(trimmed), 300);
    return () => clearTimeout(t);
  }, [email, fetchTeamProfiles]);

  useEffect(() => {
    if (loginSuccess && !authLoading && user && !user.isAnonymous) {
      const timer = setTimeout(() => {
        if (userDoc && isSetupComplete) {
          navigate('/dashboard', { replace: true });
        } else {
          navigate('/choose-plan', { replace: true });
        }
        setLoginSuccess(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [loginSuccess, authLoading, user, isSetupComplete, userDoc, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const emailTrimmed = email.trim();
    if (!emailTrimmed || !password) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    setIsLoading(true);
    try {
      const selectedProfile = teamProfiles?.profiles?.find((p) => p.id === selectedProfileId);
      const useFirebase = selectedProfile?.useFirebase;

      if (teamProfiles?.multiUser && teamProfiles.profiles && selectedProfileId && !useFirebase) {
        const res = await publicFetch('/auth/team-login', {
          method: 'POST',
          body: JSON.stringify({
            email: emailTrimmed.toLowerCase(),
            teamMemberId: selectedProfileId,
            password,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'Erreur lors de la connexion');
        }
        await setPersistence(
          auth,
          rememberMe ? browserLocalPersistence : browserSessionPersistence
        );
        await signInWithCustomTokenAuth(json.token);
        toast.success('Connexion réussie !');
        setLoginSuccess(true);
      } else {
        await loginWithEmail(emailTrimmed, password, rememberMe);
        toast.success('Connexion réussie !');
        setLoginSuccess(true);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la connexion';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const isMultiUser = teamProfiles?.multiUser && (teamProfiles.profiles?.length ?? 0) > 0;
  const canSubmit = email.trim() && password && (!isMultiUser || selectedProfileId);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-blue-100 p-3">
              <Building2 className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Connexion</CardTitle>
          <CardDescription>Accédez à votre espace Mirai</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="votre@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                  disabled={isLoading}
                />
              </div>
              {profilesLoading && (
                <p className="text-xs text-muted-foreground">Vérification du compte...</p>
              )}
            </div>

            {isMultiUser && teamProfiles?.profiles && (
              <div className="space-y-2">
                <Label htmlFor="profile">Profil</Label>
                <Select
                  value={selectedProfileId ?? ''}
                  onValueChange={(v) => setSelectedProfileId(v || null)}
                  disabled={isLoading}
                >
                  <SelectTrigger id="profile" className="pl-10">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Choisir un profil" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamProfiles.profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.displayName}
                        {p.isOwner ? ' (Propriétaire)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rememberMe"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                  disabled={isLoading}
                />
                <Label htmlFor="rememberMe" className="text-sm font-normal cursor-pointer">
                  Se souvenir de moi
                </Label>
              </div>
              {(!isMultiUser || teamProfiles?.profiles?.find((p) => p.id === selectedProfileId)?.useFirebase) && (
                <Link
                  to="/forgot-password"
                  className="text-sm text-blue-600 hover:underline"
                >
                  Mot de passe oublié ?
                </Link>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isLoading || !canSubmit}
            >
              {isLoading ? 'Connexion...' : 'Se connecter'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Pas encore de compte ? </span>
            <Link to="/register" className="text-blue-600 hover:underline font-medium">
              Créer un compte
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
