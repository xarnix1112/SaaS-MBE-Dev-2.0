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
import { ShippingZone, DEFAULT_WEIGHT_BRACKETS, DEFAULT_SERVICES } from '@/types/shipping';

interface AddZoneDialogProps {
  onAdd: (zone: ShippingZone) => void;
  existingCodes: string[];
}

export function AddZoneDialog({ onAdd, existingCodes }: AddZoneDialogProps) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [countries, setCountries] = useState('');

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

  const handleAdd = () => {
    if (!name.trim()) return;

    const newZone: ShippingZone = {
      id: `zone-${Date.now()}`,
      code: code.toUpperCase(),
      name: name.trim(),
      countries: countries.trim(),
      weightBrackets: [...DEFAULT_WEIGHT_BRACKETS],
      services: DEFAULT_SERVICES.map((serviceName) => ({
        serviceName,
        rates: DEFAULT_WEIGHT_BRACKETS.map(() => null),
      })),
      isExpanded: true,
    };

    onAdd(newZone);
    setOpen(false);
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
