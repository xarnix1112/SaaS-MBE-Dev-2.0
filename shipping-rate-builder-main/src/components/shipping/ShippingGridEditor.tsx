import { useState } from 'react';
import { Save, Download, Upload, RotateCcw, Check, Package } from 'lucide-react';
import { ShippingZone } from '@/types/shipping';
import { defaultShippingZones } from '@/data/defaultShippingGrid';
import { ZoneCard } from './ZoneCard';
import { AddZoneDialog } from './AddZoneDialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
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
} from '@/components/ui/alert-dialog';

export function ShippingGridEditor() {
  const [zones, setZones] = useState<ShippingZone[]>(defaultShippingZones);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const updateZone = (updatedZone: ShippingZone) => {
    setZones((prev) => prev.map((z) => (z.id === updatedZone.id ? updatedZone : z)));
    setHasChanges(true);
  };

  const deleteZone = (zoneId: string) => {
    setZones((prev) => prev.filter((z) => z.id !== zoneId));
    setHasChanges(true);
    toast({
      title: 'Zone supprimée',
      description: 'La zone a été supprimée de votre grille.',
    });
  };

  const addZone = (zone: ShippingZone) => {
    setZones((prev) => [...prev, zone]);
    setHasChanges(true);
    toast({
      title: 'Zone ajoutée',
      description: `La zone ${zone.code} - ${zone.name} a été créée.`,
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate save
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsSaving(false);
    setHasChanges(false);
    toast({
      title: 'Grille sauvegardée',
      description: 'Vos modifications ont été enregistrées avec succès.',
    });
  };

  const handleReset = () => {
    setZones(defaultShippingZones);
    setHasChanges(false);
    toast({
      title: 'Grille réinitialisée',
      description: 'La grille a été remise aux valeurs par défaut.',
    });
  };

  const handleExport = () => {
    const data = JSON.stringify(zones, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grille-tarifaire.json';
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: 'Export réussi',
      description: 'Votre grille a été téléchargée.',
    });
  };

  const expandedCount = zones.filter((z) => z.isExpanded).length;

  const toggleAllZones = () => {
    const shouldExpand = expandedCount < zones.length;
    setZones((prev) => prev.map((z) => ({ ...z, isExpanded: shouldExpand })));
  };

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

              <AddZoneDialog onAdd={addZone} existingCodes={zones.map((z) => z.code)} />

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
            {expandedCount === zones.length ? 'Tout réduire' : 'Tout développer'}
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
