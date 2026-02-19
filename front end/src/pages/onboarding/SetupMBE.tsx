/**
 * Page de configuration MBE
 * 
 * Configuration obligatoire après l'inscription
 * Crée le saasAccount et le document user
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '@/lib/firebase';
import { getApiBaseUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Building2, MapPin, Phone, Mail, FileText, Loader2 } from 'lucide-react';

// Liste des villes MBE principales
const MBE_CITIES = [
  'Nice',
  'Paris',
  'Lyon',
  'Marseille',
  'Toulouse',
  'Bordeaux',
  'Lille',
  'Nantes',
  'Strasbourg',
  'Montpellier',
  'Rennes',
  'Reims',
  'Autre',
];

export default function SetupMBE() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    commercialName: '',
    mbeNumber: '',
    mbeCity: '',
    mbeCityCustom: '',
    address: {
      street: '',
      city: '',
      zip: '',
      country: 'France',
    },
    phone: '',
    email: '',
  });

  useEffect(() => {
    // Vérifier que l'utilisateur est connecté
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.commercialName || !formData.mbeNumber || !formData.mbeCity) {
      setError('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (!formData.address.street || !formData.address.city || !formData.address.zip) {
      setError('Veuillez remplir l\'adresse complète');
      return;
    }

    if (!formData.phone || !formData.email) {
      setError('Veuillez remplir les coordonnées de contact');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setError('Vous devez être connecté');
      navigate('/login');
      return;
    }

    setIsLoading(true);
    try {
      const url = `${getApiBaseUrl()}/api/saas-account/create`;
      const domain = url.match(/^https?:\/\/([^/]+)/)?.[1] || url;
      console.log('[SetupMBE] Appel API:', domain, '(Preview doit utiliser le service Railway STAGING, pas Production)');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          commercialName: formData.commercialName,
          mbeNumber: formData.mbeNumber,
          mbeCity: formData.mbeCity === 'Autre' ? formData.mbeCityCustom : formData.mbeCity,
          mbeCityCustom: formData.mbeCity === 'Autre' ? formData.mbeCityCustom : null,
          address: formData.address,
          phone: formData.phone,
          email: formData.email,
        }),
      });

      const text = await response.text();
      const isHtml = text.trim().toLowerCase().startsWith('<!doctype') || text.trim().startsWith('<!');

      // Debug: log statut et début de la réponse pour diagnostiquer
      console.log('[SetupMBE] Réponse:', response.status, '| Début body:', text.slice(0, 150));

      if (!response.ok) {
        let errorMsg = 'Erreur lors de la création du compte MBE';
        if (isHtml) {
          errorMsg = "Backend inaccessible (réponse HTML). VITE_API_BASE_URL doit pointer vers l'URL Railway (ex: https://xxx.up.railway.app), pas vers staging.mbe-sdv.fr. Vercel → Settings → Environment Variables → Preview.";
        } else {
          try {
            const errorData = JSON.parse(text);
            errorMsg = errorData.error || errorMsg;
          } catch {
            errorMsg = text.slice(0, 200) || errorMsg;
          }
        }
        throw new Error(errorMsg);
      }

      if (isHtml) {
        throw new Error("Backend inaccessible (réponse HTML au lieu de JSON). Vérifiez VITE_API_BASE_URL dans Vercel → Preview.");
      }

      const data = JSON.parse(text);
      console.log('[SetupMBE] Compte MBE créé:', data);

      toast.success('Configuration terminée avec succès !');
      navigate('/onboarding/success', { 
        state: { 
          commercialName: formData.commercialName,
          mbeCity: formData.mbeCity === 'Autre' ? formData.mbeCityCustom : formData.mbeCity,
        } 
      });
    } catch (err: any) {
      console.error('[SetupMBE] Erreur:', err);
      let errorMessage = err.message || 'Erreur lors de la configuration';
      if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
        errorMessage = "Impossible de joindre le backend. Vérifiez VITE_API_BASE_URL (URL Railway) dans Vercel et que le backend Railway est démarré.";
      }
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCityChange = (value: string) => {
    setFormData({
      ...formData,
      mbeCity: value,
      mbeCityCustom: value === 'Autre' ? formData.mbeCityCustom : '',
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-blue-100 p-3">
              <Building2 className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Configuration de votre MBE</CardTitle>
          <CardDescription>
            Finalisez la création de votre compte en renseignant les informations de votre MBE
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Nom commercial */}
            <div className="space-y-2">
              <Label htmlFor="commercialName">
                Nom commercial <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="commercialName"
                  placeholder="MBE Nice Centre"
                  value={formData.commercialName}
                  onChange={(e) => setFormData({ ...formData, commercialName: e.target.value })}
                  className="pl-10"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Numéro MBE */}
            <div className="space-y-2">
              <Label htmlFor="mbeNumber">
                Numéro MBE <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="mbeNumber"
                  placeholder="12345"
                  value={formData.mbeNumber}
                  onChange={(e) => setFormData({ ...formData, mbeNumber: e.target.value })}
                  className="pl-10"
                  required
                  disabled={isLoading}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Le numéro MBE doit être unique
              </p>
            </div>

            {/* Ville MBE */}
            <div className="space-y-2">
              <Label htmlFor="mbeCity">
                Ville <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.mbeCity}
                onValueChange={handleCityChange}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une ville" />
                </SelectTrigger>
                <SelectContent>
                  {MBE_CITIES.map((city) => (
                    <SelectItem key={city} value={city}>
                      {city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.mbeCity === 'Autre' && (
                <Input
                  placeholder="Nom de la ville"
                  value={formData.mbeCityCustom}
                  onChange={(e) => setFormData({ ...formData, mbeCityCustom: e.target.value })}
                  disabled={isLoading}
                  required
                />
              )}
            </div>

            {/* Adresse */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="text-sm font-semibold">Adresse complète</h3>
              
              <div className="space-y-2">
                <Label htmlFor="street">
                  Rue <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="street"
                    placeholder="123 Rue de la République"
                    value={formData.address.street}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address: { ...formData.address, street: e.target.value },
                      })
                    }
                    className="pl-10"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="zip">
                    Code postal <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="zip"
                    placeholder="06000"
                    value={formData.address.zip}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address: { ...formData.address, zip: e.target.value },
                      })
                    }
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">
                    Ville <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="city"
                    placeholder="Nice"
                    value={formData.address.city}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address: { ...formData.address, city: e.target.value },
                      })
                    }
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">Pays</Label>
                <Input
                  id="country"
                  value={formData.address.country}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      address: { ...formData.address, country: e.target.value },
                    })
                  }
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Contact */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="text-sm font-semibold">Coordonnées de contact</h3>
              
              <div className="space-y-2">
                <Label htmlFor="phone">
                  Téléphone <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+33 4 12 34 56 78"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="pl-10"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  Email principal <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="contact@mbe-nice.fr"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="pl-10"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Finalisation en cours...
                </>
              ) : (
                'Finaliser mon compte'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

