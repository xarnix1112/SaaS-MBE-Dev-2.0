import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Ruler, Package, Weight, Box, Info, Edit2 } from "lucide-react";
import { CartonInfo } from "@/types/quote";
import { useState } from "react";

interface DimensionsAndPackagingProps {
  dimensions?: {
    length: number;
    width: number;
    height: number;
    weight: number;
    estimated?: boolean;
  };
  weight?: number;
  volumetricWeight?: number;
  finalWeight?: number;
  recommendedCarton?: CartonInfo;
  cartons?: CartonInfo[];
  packagingStrategy?: 'single_carton' | 'multiple_cartons' | 'default_carton' | 'failed' | 'none';
  packagingPrice?: number;
  onSelectCarton?: (cartonId: string) => void;
  availableCartons?: CartonInfo[];
}

export function DimensionsAndPackaging({
  dimensions,
  weight,
  volumetricWeight,
  finalWeight,
  recommendedCarton,
  cartons,
  packagingStrategy,
  packagingPrice,
  onSelectCarton,
  availableCartons = []
}: DimensionsAndPackagingProps) {
  const [isCartonSelectorOpen, setIsCartonSelectorOpen] = useState(false);

  // Normaliser recommendedCarton pour supporter les deux formats (ancien et nouveau)
  const normalizedCarton = recommendedCarton ? {
    id: recommendedCarton.id || '',
    ref: recommendedCarton.ref,
    inner_length: recommendedCarton.inner_length || recommendedCarton.inner?.length || 0,
    inner_width: recommendedCarton.inner_width || recommendedCarton.inner?.width || 0,
    inner_height: recommendedCarton.inner_height || recommendedCarton.inner?.height || 0,
    price: recommendedCarton.price || recommendedCarton.priceTTC || 0
  } : null;

  const getStrategyLabel = (strategy?: string) => {
    switch (strategy) {
      case 'single_carton':
        return { label: 'Carton unique', variant: 'default' as const };
      case 'multiple_cartons':
        return { label: 'Cartons multiples', variant: 'secondary' as const };
      case 'default_carton':
        return { label: 'Carton par défaut', variant: 'outline' as const };
      case 'failed':
        return { label: 'Aucun carton trouvé', variant: 'destructive' as const };
      default:
        return null;
    }
  };

  const strategyInfo = getStrategyLabel(packagingStrategy);

  return (
    <div className="space-y-4">
      {/* Dimensions Estimées */}
      {dimensions && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Ruler className="w-4 h-4" />
                Dimensions estimées d'un colis
              </CardTitle>
              {dimensions.estimated && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Estimé par IA
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Longueur</p>
                <p className="font-medium text-lg">{dimensions.length} cm</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Largeur</p>
                <p className="font-medium text-lg">{dimensions.width} cm</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Hauteur</p>
                <p className="font-medium text-lg">{dimensions.height} cm</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Poids</p>
                <p className="font-medium text-lg">{dimensions.weight} kg</p>
              </div>
            </div>

            {/* Poids volumétrique */}
            {(weight !== undefined || volumetricWeight !== undefined || finalWeight !== undefined) && (
              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center gap-2 mb-2">
                  <Weight className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Calcul des poids</p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  {weight !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Poids réel</p>
                      <p className="font-medium">{weight.toFixed(2)} kg</p>
                    </div>
                  )}
                  {volumetricWeight !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Poids volumétrique</p>
                      <p className="font-medium">{volumetricWeight.toFixed(2)} kg</p>
                    </div>
                  )}
                  {finalWeight !== undefined && (
                    <div>
                      <p className="text-xs text-muted-foreground">Poids facturé</p>
                      <p className="font-medium text-primary">{finalWeight.toFixed(2)} kg</p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Le poids facturé est le plus élevé entre le poids réel et le poids volumétrique
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cartons Recommandés */}
      {(normalizedCarton || (cartons && cartons.length > 0)) && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="w-4 h-4" />
                Emballage recommandé
              </CardTitle>
              <div className="flex items-center gap-2">
                {strategyInfo && (
                  <Badge variant={strategyInfo.variant}>
                    {strategyInfo.label}
                  </Badge>
                )}
                {onSelectCarton && availableCartons.length > 0 && (
                  <Dialog open={isCartonSelectorOpen} onOpenChange={setIsCartonSelectorOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7">
                        <Edit2 className="w-3 h-3 mr-1" />
                        Changer
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Sélectionner un autre carton</DialogTitle>
                      </DialogHeader>
                      <div className="grid grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
                        {availableCartons.map((carton) => (
                          <Card
                            key={carton.id}
                            className="cursor-pointer hover:border-primary transition-colors"
                            onClick={() => {
                              onSelectCarton(carton.id);
                              setIsCartonSelectorOpen(false);
                            }}
                          >
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                  <Box className="w-4 h-4" />
                                  {carton.ref}
                                </span>
                                <span className="text-primary">{(carton.price || carton.priceTTC || 0).toFixed(2)}€</span>
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-xs text-muted-foreground space-y-1">
                                <p>
                                  <strong>Dimensions internes:</strong>
                                </p>
                                <p>
                                  {carton.inner_length || carton.inner?.length || 0} × {carton.inner_width || carton.inner?.width || 0} × {carton.inner_height || carton.inner?.height || 0} cm
                                </p>
                                <p className="text-xs text-muted-foreground mt-2">
                                  Volume: {(((carton.inner_length || carton.inner?.length || 0) * (carton.inner_width || carton.inner?.width || 0) * (carton.inner_height || carton.inner?.height || 0)) / 1000).toFixed(2)} L
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Carton unique */}
            {normalizedCarton && !cartons && (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <Box className="w-5 h-5 text-primary" />
                    <div>
                      <p className="font-medium">{normalizedCarton.ref}</p>
                      <p className="text-sm text-muted-foreground">
                        {normalizedCarton.inner_length} × {normalizedCarton.inner_width} × {normalizedCarton.inner_height} cm
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">{normalizedCarton.price.toFixed(2)}€</p>
                    <p className="text-xs text-muted-foreground">TTC</p>
                  </div>
                </div>
                {packagingPrice !== undefined && packagingPrice !== normalizedCarton.price && (
                  <div className="text-sm text-muted-foreground">
                    <p>Prix total emballage: <strong>{packagingPrice.toFixed(2)}€</strong></p>
                  </div>
                )}
              </div>
            )}

            {/* Cartons multiples */}
            {cartons && cartons.length > 0 && (
              <div className="space-y-3">
                {cartons.map((carton, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-3">
                      <Box className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium">{carton.ref}</p>
                        <p className="text-sm text-muted-foreground">
                          {carton.inner_length || carton.inner?.length || 0} × {carton.inner_width || carton.inner?.width || 0} × {carton.inner_height || carton.inner?.height || 0} cm
                        </p>
                        {carton.lotsCount && carton.lotsCount > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {carton.lotsCount} lot(s)
                            {carton.lotNumbers && carton.lotNumbers.length > 0 && (
                              <span> (n° {carton.lotNumbers.join(', ')})</span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">{(carton.price || carton.priceTTC || 0).toFixed(2)}€</p>
                      <p className="text-xs text-muted-foreground">TTC</p>
                    </div>
                  </div>
                ))}
                {packagingPrice !== undefined && (
                  <div className="pt-3 border-t">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">Total emballage</p>
                      <p className="font-bold text-xl text-primary">{packagingPrice.toFixed(2)}€</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

