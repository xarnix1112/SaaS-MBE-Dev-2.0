/**
 * COMPOSANT GRILLE TARIFAIRE D'EXPÉDITION
 * 
 * Interface moderne inspirée de shipping-rate-builder
 * - Zones en accordéon (expand/collapse)
 * - Édition inline des prix
 * - Gestion dynamique des services et tranches de poids
 * - Design moderne avec badges colorés
 */

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Save, Download, RotateCcw, Check, Package, Plus, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { useQueryClient } from "@tanstack/react-query";
import {
  useShippingGrid,
  useUpdateZone,
  useDeleteZone,
  useUpsertRate,
} from "@/hooks/use-shipping-rates";
import { ShippingZoneUI } from "@/types/shipping";
import { ZoneCard } from "./shipping/ZoneCard";
import { AddZoneDialog } from "./shipping/AddZoneDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function ShippingRatesSettings() {
  const queryClient = useQueryClient();
  const { data: gridData, isLoading } = useShippingGrid();
  const updateZoneMutation = useUpdateZone();
  const deleteZoneMutation = useDeleteZone();
  const upsertRate = useUpsertRate();

  const [zones, setZones] = useState<ShippingZoneUI[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isForceInitializing, setIsForceInitializing] = useState(false);

  // Synchroniser les zones depuis Firestore
  useEffect(() => {
    if (gridData?.zones) {
      // Transformer les données Firestore en format local
      const transformedZones: ShippingZoneUI[] = gridData.zones
        .filter((z) => z.isActive)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((zone) => {
          // Récupérer les services actifs
          const zoneServices = gridData.services
            .filter((s) => s.isActive)
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((service) => {
              // Récupérer les rates pour ce service et cette zone
              const rates = gridData.weightBrackets
                .sort((a, b) => a.minWeight - b.minWeight)
                .map((bracket) => {
                  const rate = gridData.rates.find(
                    (r) =>
                      r.zoneId === zone.id &&
                      r.serviceId === service.id &&
                      r.weightBracketId === bracket.id
                  );
                  return rate?.price ?? null;
                });

              return {
                serviceName: service.name,
                serviceId: service.id,
                rates,
              };
            });

          return {
            id: zone.id,
            code: zone.code,
            name: zone.name,
            countries: zone.countries.join(", "),
            weightBrackets: gridData.weightBrackets
              .sort((a, b) => a.minWeight - b.minWeight)
              .map((b) => b.minWeight),
            services: zoneServices,
            isExpanded: false,
          };
        });

      setZones(transformedZones);
    }
  }, [gridData]);

  // Initialiser les données si manquantes
  const handleForceInit = async () => {
    setIsForceInitializing(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        toast.error("Non authentifié");
        return;
      }

      const response = await fetch("/api/shipping/force-init", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Erreur lors de l'initialisation");
      }

      toast.success("Grille tarifaire initialisée avec succès");
      window.location.reload();
    } catch (error) {
      console.error("Erreur initialisation:", error);
      toast.error("Erreur lors de l'initialisation");
    } finally {
      setIsForceInitializing(false);
    }
  };

  // Mettre à jour une zone localement
  const updateZone = (updatedZone: ShippingZoneUI) => {
    setZones((prev) => prev.map((z) => (z.id === updatedZone.id ? updatedZone : z)));
    setHasChanges(true);
  };

  // Supprimer une zone
  const deleteZone = async (zoneId: string) => {
    try {
      await deleteZoneMutation.mutateAsync(zoneId);
      setZones((prev) => prev.filter((z) => z.id !== zoneId));
      toast.success("Zone supprimée");
    } catch (error) {
      console.error("Erreur suppression zone:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  // Ajouter une zone
  const addZone = (zone: ShippingZoneUI) => {
    setZones((prev) => [...prev, zone]);
    setHasChanges(true);
    toast.success(`Zone ${zone.code} - ${zone.name} créée`);
  };

  // Sauvegarder toutes les modifications
  const handleSave = async () => {
    if (!gridData) return;

    setIsSaving(true);
    try {
      // Sauvegarder chaque zone et ses rates
      for (const zone of zones) {
        // Mettre à jour la zone
        await updateZoneMutation.mutateAsync({
          id: zone.id,
          data: {
            name: zone.name,
            countries: zone.countries.split(",").map((c) => c.trim()),
          },
        });

        // Sauvegarder tous les rates de cette zone
        for (let serviceIndex = 0; serviceIndex < zone.services.length; serviceIndex++) {
          const service = zone.services[serviceIndex];
          const serviceId = service.serviceId;

          for (let rateIndex = 0; rateIndex < service.rates.length; rateIndex++) {
            const price = service.rates[rateIndex];
            const weightBracketId = gridData.weightBrackets
              .sort((a, b) => a.minWeight - b.minWeight)[rateIndex]?.id;

            if (weightBracketId) {
              await upsertRate.mutateAsync({
                zoneId: zone.id,
                serviceId,
                weightBracketId,
                price,
              });
            }
          }
        }
      }

      setHasChanges(false);
      toast.success("Grille sauvegardée avec succès");
    } catch (error) {
      console.error("Erreur sauvegarde:", error);
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setIsSaving(false);
    }
  };

  // Réinitialiser
  const handleReset = async () => {
    try {
      setIsSaving(true);
      const token = await auth.currentUser?.getIdToken();
      
      const response = await fetch('/api/shipping/force-init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la réinitialisation');
      }

      toast.success("Grille réinitialisée avec succès");
      
      // Recharger les données (invalider toutes les queries shipping pour cet utilisateur)
      await queryClient.invalidateQueries({ queryKey: ["shipping"] });
      setHasChanges(false);
    } catch (error) {
      console.error('Erreur réinitialisation:', error);
      toast.error("Erreur lors de la réinitialisation");
    } finally {
      setIsSaving(false);
    }
  };

  // Exporter en JSON
  const handleExport = () => {
    const data = JSON.stringify(zones, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "grille-tarifaire.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export réussi");
  };

  // Expand/collapse toutes les zones
  const expandedCount = zones.filter((z) => z.isExpanded).length;
  const toggleAllZones = () => {
    const shouldExpand = expandedCount < zones.length;
    setZones((prev) => prev.map((z) => ({ ...z, isExpanded: shouldExpand })));
  };

  // Loading
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Package className="w-12 h-12 mx-auto mb-4 animate-pulse text-muted-foreground" />
          <p className="text-muted-foreground">Chargement de la grille tarifaire...</p>
        </CardContent>
      </Card>
    );
  }

  // Pas de données
  if (!gridData || zones.length === 0) {
    return (
      <Card>
        <CardContent className="py-12">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>⚠️ Données manquantes</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>Votre grille tarifaire n'a pas encore été initialisée.</p>

              <div className="space-y-2">
                <p className="font-semibold">Données détectées :</p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  <li>{gridData?.zones?.length || 0} zone(s) trouvée(s)</li>
                  <li>{gridData?.services?.length || 0} service(s) trouvé(s)</li>
                  <li>{gridData?.weightBrackets?.length || 0} tranche(s) de poids trouvée(s)</li>
                </ul>
              </div>

              <div className="space-y-2">
                <p className="font-semibold">Solution :</p>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleForceInit}
                  disabled={isForceInitializing}
                >
                  {isForceInitializing ? (
                    <>
                      <Package className="w-4 h-4 mr-2 animate-spin" />
                      Initialisation...
                    </>
                  ) : (
                    "Initialiser la grille tarifaire"
                  )}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-xl">
                <Package className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Grille Tarifaire</h1>
                <p className="text-sm text-muted-foreground">
                  {zones.length} zones · {zones.reduce((acc, z) => acc + z.services.length, 0)} services
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="w-4 h-4 mr-1" />
                Exporter
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Réinitialiser
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Réinitialiser la grille ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action supprimera toutes vos modifications et restaurera la grille par défaut.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReset}>Réinitialiser</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AddZoneDialog
                onAdd={addZone}
                existingCodes={zones.map((z) => z.code)}
                gridData={gridData}
              />

              <Button
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className="gap-2"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Sauvegarde...
                  </>
                ) : hasChanges ? (
                  <>
                    <Save className="w-4 h-4" />
                    Sauvegarder
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Sauvegardé
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Quick Actions */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted-foreground">
            Cliquez sur une zone pour la modifier. Les valeurs "NA" indiquent un service non disponible.
          </p>
          <Button variant="ghost" size="sm" onClick={toggleAllZones}>
            {expandedCount === zones.length ? "Tout réduire" : "Tout développer"}
          </Button>
        </div>

        {/* Zones Grid */}
        <div className="space-y-4">
          {zones.map((zone) => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              onUpdate={updateZone}
              onDelete={deleteZone}
              gridData={gridData}
            />
          ))}
        </div>

        {zones.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Aucune zone configurée</p>
            <p className="text-sm mt-1">Cliquez sur "Nouvelle zone" pour commencer.</p>
          </div>
        )}
      </main>
    </div>
  );
}
