import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Package, 
  Plus, 
  Pencil, 
  Trash2, 
  Star, 
  Check, 
  X, 
  AlertCircle,
  Loader2 
} from 'lucide-react';
import { authenticatedFetch } from '@/lib/api';

interface Carton {
  id: string;
  carton_ref: string;
  inner_length: number;
  inner_width: number;
  inner_height: number;
  packaging_price: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface FormData {
  carton_ref: string;
  inner_length: string;
  inner_width: string;
  inner_height: string;
  packaging_price: string;
  isDefault: boolean;
}

export default function CartonsSettings() {
  const [cartons, setCartons] = useState<Carton[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    carton_ref: '',
    inner_length: '',
    inner_width: '',
    inner_height: '',
    packaging_price: '',
    isDefault: false,
  });

  // Charger les cartons
  const loadCartons = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await authenticatedFetch('/api/cartons');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors du chargement des cartons');
      }

      const data = await response.json();
      setCartons(data.cartons || []);
    } catch (err: any) {
      console.error('[CartonsSettings] Erreur:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCartons();
  }, []);

  // Réinitialiser le formulaire
  const resetForm = () => {
    setFormData({
      carton_ref: '',
      inner_length: '',
      inner_width: '',
      inner_height: '',
      packaging_price: '',
      isDefault: false,
    });
    setIsAdding(false);
    setEditingId(null);
  };

  // Valider le formulaire
  const validateForm = (): string | null => {
    if (!formData.carton_ref.trim()) return 'La référence est requise';
    if (!formData.inner_length || Number(formData.inner_length) <= 0) return 'La longueur doit être > 0';
    if (!formData.inner_width || Number(formData.inner_width) <= 0) return 'La largeur doit être > 0';
    if (!formData.inner_height || Number(formData.inner_height) <= 0) return 'La hauteur doit être > 0';
    if (!formData.packaging_price || Number(formData.packaging_price) < 0) return 'Le prix doit être ≥ 0';
    return null;
  };

  // Créer un carton
  const handleCreate = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setError(null);
      setSuccess(null);

      const response = await authenticatedFetch('/api/cartons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carton_ref: formData.carton_ref,
          inner_length: Number(formData.inner_length),
          inner_width: Number(formData.inner_width),
          inner_height: Number(formData.inner_height),
          packaging_price: Number(formData.packaging_price),
          isDefault: formData.isDefault,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la création');
      }

      setSuccess('Carton créé avec succès');
      resetForm();
      await loadCartons();
    } catch (err: any) {
      console.error('[CartonsSettings] Erreur création:', err);
      setError(err.message);
    }
  };

  // Mettre à jour un carton
  const handleUpdate = async (id: string) => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setError(null);
      setSuccess(null);

      const response = await authenticatedFetch(`/api/cartons/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carton_ref: formData.carton_ref,
          inner_length: Number(formData.inner_length),
          inner_width: Number(formData.inner_width),
          inner_height: Number(formData.inner_height),
          packaging_price: Number(formData.packaging_price),
          isDefault: formData.isDefault,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la mise à jour');
      }

      setSuccess('Carton mis à jour avec succès');
      resetForm();
      await loadCartons();
    } catch (err: any) {
      console.error('[CartonsSettings] Erreur mise à jour:', err);
      setError(err.message);
    }
  };

  // Supprimer un carton
  const handleDelete = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce carton ?')) return;

    try {
      setError(null);
      setSuccess(null);

      const response = await authenticatedFetch(`/api/cartons/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la suppression');
      }

      const data = await response.json();
      setSuccess(data.message);
      await loadCartons();
    } catch (err: any) {
      console.error('[CartonsSettings] Erreur suppression:', err);
      setError(err.message);
    }
  };

  // Définir comme carton par défaut
  const handleSetDefault = async (id: string) => {
    try {
      setError(null);
      setSuccess(null);

      const response = await authenticatedFetch(`/api/cartons/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la mise à jour');
      }

      setSuccess('Carton par défaut mis à jour');
      await loadCartons();
    } catch (err: any) {
      console.error('[CartonsSettings] Erreur set default:', err);
      setError(err.message);
    }
  };

  // Commencer l'édition
  const startEdit = (carton: Carton) => {
    setFormData({
      carton_ref: carton.carton_ref,
      inner_length: carton.inner_length.toString(),
      inner_width: carton.inner_width.toString(),
      inner_height: carton.inner_height.toString(),
      packaging_price: carton.packaging_price.toString(),
      isDefault: carton.isDefault,
    });
    setEditingId(carton.id);
    setIsAdding(false);
  };

  const hasDefaultCarton = cartons.some(c => c.isDefault);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Chargement des cartons...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Cartons & Emballages
              </CardTitle>
              <CardDescription>
                Configurez vos cartons pour le calcul automatique des devis
              </CardDescription>
            </div>
            {!isAdding && !editingId && (
              <Button onClick={() => setIsAdding(true)} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Ajouter un carton
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Alertes */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-500 bg-green-50 text-green-900">
              <Check className="w-4 h-4 text-green-600" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          {!hasDefaultCarton && cartons.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                ⚠️ Aucun carton par défaut défini. Veuillez en définir un pour pouvoir calculer les devis.
              </AlertDescription>
            </Alert>
          )}

          {/* Formulaire d'ajout/édition */}
          {(isAdding || editingId) && (
            <Card className="border-2 border-primary/20 bg-primary/5">
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="carton_ref">Référence *</Label>
                    <Input
                      id="carton_ref"
                      placeholder="ex: CARTON-M"
                      value={formData.carton_ref}
                      onChange={(e) => setFormData({ ...formData, carton_ref: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="packaging_price">Prix TTC (€) *</Label>
                    <Input
                      id="packaging_price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="ex: 6.50"
                      value={formData.packaging_price}
                      onChange={(e) => setFormData({ ...formData, packaging_price: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="inner_length">Longueur (cm) *</Label>
                    <Input
                      id="inner_length"
                      type="number"
                      min="1"
                      placeholder="ex: 40"
                      value={formData.inner_length}
                      onChange={(e) => setFormData({ ...formData, inner_length: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="inner_width">Largeur (cm) *</Label>
                    <Input
                      id="inner_width"
                      type="number"
                      min="1"
                      placeholder="ex: 30"
                      value={formData.inner_width}
                      onChange={(e) => setFormData({ ...formData, inner_width: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="inner_height">Hauteur (cm) *</Label>
                    <Input
                      id="inner_height"
                      type="number"
                      min="1"
                      placeholder="ex: 30"
                      value={formData.inner_height}
                      onChange={(e) => setFormData({ ...formData, inner_height: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isDefault"
                    checked={formData.isDefault}
                    onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="isDefault" className="cursor-pointer">
                    Définir comme carton par défaut
                  </Label>
                </div>

                <div className="flex gap-2">
                  {isAdding && (
                    <Button onClick={handleCreate} className="flex-1">
                      <Check className="w-4 h-4 mr-2" />
                      Créer
                    </Button>
                  )}
                  {editingId && (
                    <Button onClick={() => handleUpdate(editingId)} className="flex-1">
                      <Check className="w-4 h-4 mr-2" />
                      Enregistrer
                    </Button>
                  )}
                  <Button onClick={resetForm} variant="outline">
                    <X className="w-4 h-4 mr-2" />
                    Annuler
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Liste des cartons */}
          {cartons.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Aucun carton configuré</p>
              <p className="text-sm">Ajoutez votre premier carton pour commencer</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cartons.map((carton) => (
                <Card key={carton.id} className={editingId === carton.id ? 'opacity-50' : ''}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-lg">{carton.carton_ref}</h3>
                          {carton.isDefault && (
                            <Badge variant="default" className="gap-1">
                              <Star className="w-3 h-3 fill-current" />
                              Par défaut
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Dimensions internes:</span>
                            <p className="font-medium">
                              {carton.inner_length} × {carton.inner_width} × {carton.inner_height} cm
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Prix TTC:</span>
                            <p className="font-medium">{carton.packaging_price.toFixed(2)} €</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!carton.isDefault && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSetDefault(carton.id)}
                            title="Définir comme carton par défaut"
                          >
                            <Star className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(carton)}
                          disabled={editingId !== null}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(carton.id)}
                          disabled={editingId !== null}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informations */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900 space-y-2">
              <p className="font-medium">ℹ️ Informations importantes</p>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Un carton par défaut est <strong>obligatoire</strong> pour calculer les devis</li>
                <li>Les dimensions sont les <strong>dimensions internes</strong> du carton</li>
                <li>Le prix TTC inclut le coût du carton + main-d'œuvre d'emballage</li>
                <li>Les cartons utilisés dans des devis ne peuvent être que <strong>désactivés</strong>, pas supprimés</li>
                <li>Vos cartons sont <strong>privés</strong> et ne sont pas partagés avec d'autres comptes</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

