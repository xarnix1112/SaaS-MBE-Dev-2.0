import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package, ChevronDown, ChevronUp, Ruler, Euro, Weight, Search } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api';
import { calculateVolumetricWeight } from '@/lib/cartons';
import { cn } from '@/lib/utils';

interface Carton {
  id: string;
  carton_ref: string;
  inner_length: number;
  inner_width: number;
  inner_height: number;
  packaging_price: number;
  isDefault: boolean;
  isActive: boolean;
}

interface CartonSelectorProps {
  selectedCartonId?: string | null;
  onCartonSelect: (carton: Carton) => void;
  disabled?: boolean;
}

export function CartonSelector({ selectedCartonId, onCartonSelect, disabled }: CartonSelectorProps) {
  const [cartons, setCartons] = useState<Carton[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredCartonId, setHoveredCartonId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedCarton = cartons.find(c => c.id === selectedCartonId);

  // Filtrer les cartons selon la recherche (référence ou dimensions L×l×H)
  const filteredCartons = useMemo(() => {
    if (!searchQuery.trim()) return cartons;
    const q = searchQuery.trim().toLowerCase();

    // Extraire des nombres (ex: "70 50 50", "70×50×50", "38 x 28 x 30")
    const numbers = q.match(/\d+/g)?.map(Number) ?? [];

    return cartons.filter((carton) => {
      // Match par référence
      if (carton.carton_ref.toLowerCase().includes(q)) return true;

      // Match par dimensions : si l'utilisateur a entré 1 à 3 nombres (ex: "70 50 50" ou "38×28×30")
      if (numbers.length >= 1 && numbers.length <= 3) {
        const dims = [carton.inner_length, carton.inner_width, carton.inner_height];
        if (numbers.every((n) => dims.some((d) => d === n))) return true;
      }

      return false;
    });
  }, [cartons, searchQuery]);

  // Charger les cartons disponibles
  useEffect(() => {
    loadCartons();
  }, []);

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
      console.error('[CartonSelector] Erreur:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (carton: Carton) => {
    onCartonSelect(carton);
    setIsOpen(false);
    setSearchQuery('');
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>Sélectionner un carton</Label>
        <div className="h-16 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <Label>Sélectionner un carton</Label>
        <div className="p-4 border border-destructive/50 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (cartons.length === 0) {
    return (
      <div className="space-y-2">
        <Label>Sélectionner un carton</Label>
        <div className="p-4 border-2 border-dashed rounded-lg text-center text-muted-foreground">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Aucun carton configuré</p>
          <p className="text-xs mt-1">Ajoutez des cartons dans les paramètres</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Sélectionner un carton *</Label>
      
      {/* Bouton de sélection */}
      <Button
        type="button"
        variant="outline"
        className={cn(
          "w-full justify-between h-auto p-4",
          isOpen && "ring-2 ring-ring"
        )}
        onClick={() => {
          setIsOpen(!isOpen);
          if (isOpen) setSearchQuery('');
        }}
        disabled={disabled}
      >
        <div className="flex items-center gap-3 flex-1 text-left">
          <Package className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          {selectedCarton ? (
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold">{selectedCarton.carton_ref}</span>
                {selectedCarton.isDefault && (
                  <Badge variant="secondary" className="text-xs">Par défaut</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {selectedCarton.inner_length} × {selectedCarton.inner_width} × {selectedCarton.inner_height} cm
                {' • '}
                {selectedCarton.packaging_price.toFixed(2)} €
                {' • '}
                {calculateVolumetricWeight(selectedCarton).toFixed(2)} kg vol.
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">Choisir un carton...</span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 ml-2 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 ml-2 flex-shrink-0" />
        )}
      </Button>

      {/* Liste déroulante avec recherche et cartes visuelles */}
      {isOpen && (
        <div className="border rounded-lg shadow-lg bg-background">
          {/* Champ de recherche */}
          <div className="p-2 border-b bg-muted/30 sticky top-0 z-10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Rechercher par référence (ex: CAD11) ou dimensions (ex: 70×50×50)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          <div className="p-2 space-y-2 max-h-80 overflow-y-auto">
            {filteredCartons.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                {searchQuery.trim() ? (
                  <>Aucun carton ne correspond à « {searchQuery} »</>
                ) : (
                  <>Aucun carton configuré</>
                )}
              </div>
            ) : (
              filteredCartons.map((carton) => {
              const volumetricWeight = calculateVolumetricWeight(carton);
              const isHovered = hoveredCartonId === carton.id;
              const isSelected = selectedCartonId === carton.id;

              return (
                <Card
                  key={carton.id}
                  className={cn(
                    "cursor-pointer transition-all",
                    isSelected && "ring-2 ring-primary",
                    isHovered && !isSelected && "bg-accent",
                    "hover:shadow-md"
                  )}
                  onMouseEnter={() => setHoveredCartonId(carton.id)}
                  onMouseLeave={() => setHoveredCartonId(null)}
                  onClick={() => handleSelect(carton)}
                >
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      {/* En-tête */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-base">{carton.carton_ref}</h4>
                            {carton.isDefault && (
                              <Badge variant="default" className="text-xs">
                                Par défaut
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            ID: {carton.id.slice(0, 8)}...
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-primary">
                            {carton.packaging_price.toFixed(2)} €
                          </p>
                          <p className="text-xs text-muted-foreground">TTC</p>
                        </div>
                      </div>

                      {/* Informations détaillées */}
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                        {/* Dimensions */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Ruler className="w-3.5 h-3.5" />
                            <span className="text-xs font-medium">Dimensions internes</span>
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Longueur:</span>
                              <span className="font-medium">{carton.inner_length} cm</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Largeur:</span>
                              <span className="font-medium">{carton.inner_width} cm</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Hauteur:</span>
                              <span className="font-medium">{carton.inner_height} cm</span>
                            </div>
                          </div>
                        </div>

                        {/* Poids volumétrique et volume */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Weight className="w-3.5 h-3.5" />
                            <span className="text-xs font-medium">Caractéristiques</span>
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Poids vol.:</span>
                              <span className="font-medium">{volumetricWeight.toFixed(2)} kg</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Volume:</span>
                              <span className="font-medium">
                                {((carton.inner_length * carton.inner_width * carton.inner_height) / 1000000).toFixed(3)} m³
                              </span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Coefficient:</span>
                              <span className="font-medium">5000</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Indicateur de sélection */}
                      {isHovered && !isSelected && (
                        <div className="pt-2 border-t">
                          <p className="text-xs text-center text-muted-foreground">
                            Cliquez pour sélectionner ce carton
                          </p>
                        </div>
                      )}
                      {isSelected && (
                        <div className="pt-2 border-t">
                          <div className="flex items-center justify-center gap-1.5 text-primary">
                            <Package className="w-3.5 h-3.5" />
                            <p className="text-xs font-medium">Carton actuellement sélectionné</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
            )}
          </div>
        </div>
      )}

      {/* Informations supplémentaires */}
      {selectedCarton && (
        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg space-y-1">
          <p className="flex items-center gap-1.5">
            <Package className="w-3 h-3" />
            <span>
              Les dimensions du lot seront automatiquement mises à jour selon ce carton
            </span>
          </p>
          <p className="flex items-center gap-1.5">
            <Euro className="w-3 h-3" />
            <span>
              Le prix d'emballage et le total du devis seront recalculés
            </span>
          </p>
          <p className="flex items-center gap-1.5">
            <Weight className="w-3 h-3" />
            <span>
              Le poids volumétrique sera calculé automatiquement (modifiable ensuite)
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
