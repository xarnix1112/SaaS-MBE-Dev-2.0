import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShippingZoneUI } from '@/types/shipping';
import { useCreateZone } from '@/hooks/use-shipping-rates';
import { toast } from 'sonner';

interface AddZoneDialogProps {
  onAdd: (zone: ShippingZoneUI) => void;
  existingCodes: string[];
  gridData: any;
}

export function AddZoneDialog({ onAdd, existingCodes, gridData }: AddZoneDialogProps) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [countries, setCountries] = useState('');
  const createZoneMutation = useCreateZone();

  const getNextCode = () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const letter of letters) {
      if (!existingCodes.includes(letter)) {
        return letter;
      }
    }
    return `Z${existingCodes.length + 1}`;
  };

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setCode(getNextCode());
      setName('');
      setCountries('');
    }
  };

  const handleAdd = async () => {
    if (!name.trim()) return;

    try {
      // Créer la zone dans Firestore
      const zoneData = {
        code: code.toUpperCase(),
        name: name.trim(),
        countries: countries.split(',').map((c) => c.trim()),
        isActive: true,
        order: existingCodes.length,
      };

      const newZoneId = await createZoneMutation.mutateAsync(zoneData);

      // Créer la zone locale pour l'UI
      const newZone: ShippingZoneUI = {
        id: newZoneId,
        code: code.toUpperCase(),
        name: name.trim(),
        countries: countries.trim(),
        weightBrackets: gridData?.weightBrackets
          ?.sort((a: any, b: any) => a.minWeight - b.minWeight)
          .map((b: any) => b.minWeight) || [1, 2, 5, 10, 15, 20, 30],
        services: gridData?.services
          ?.filter((s: any) => s.isActive)
          .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
          .map((service: any) => ({
            serviceName: service.name,
            serviceId: service.id,
            rates: (gridData?.weightBrackets || []).map(() => null),
          })) || [
          { serviceName: 'STANDARD', serviceId: 'temp-standard', rates: [null, null, null, null, null, null, null] },
          { serviceName: 'EXPRESS', serviceId: 'temp-express', rates: [null, null, null, null, null, null, null] },
        ],
        isExpanded: true,
      };

      onAdd(newZone);
      setOpen(false);
      toast.success(`Zone ${code.toUpperCase()} créée avec succès`);
    } catch (error) {
      console.error('Erreur création zone:', error);
      toast.error('Erreur lors de la création de la zone');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Nouvelle zone
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Créer une nouvelle zone</DialogTitle>
          <DialogDescription>
            Ajoutez une nouvelle zone géographique à votre grille tarifaire.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="code">Code de zone</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="Ex: A, B, C..."
              className="w-24"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="name">Nom de la zone</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Europe de l'Ouest"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="countries">Pays (codes ISO)</Label>
            <Input
              id="countries"
              value={countries}
              onChange={(e) => setCountries(e.target.value)}
              placeholder="Ex: FR, DE, IT, ES"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={handleAdd} disabled={!name.trim()}>
            Créer la zone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

