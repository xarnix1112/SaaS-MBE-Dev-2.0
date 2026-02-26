import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { authenticatedFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

export type ManualPaymentMethod = 'virement' | 'cb_telephone';

const METHODS: { value: ManualPaymentMethod; label: string }[] = [
  { value: 'virement', label: 'Virement' },
  { value: 'cb_telephone', label: 'Carte bancaire au téléphone' },
];

function toYyyyMmDd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface MarkPaidManualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteId: string;
  quoteReference?: string;
  onSuccess: () => void;
}

export function MarkPaidManualDialog({
  open,
  onOpenChange,
  quoteId,
  quoteReference,
  onSuccess,
}: MarkPaidManualDialogProps) {
  const [method, setMethod] = useState<ManualPaymentMethod>('virement');
  const [paymentDate, setPaymentDate] = useState(toYyyyMmDd(new Date()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMethod('virement');
      setPaymentDate(toYyyyMmDd(new Date()));
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!quoteId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await authenticatedFetch(`/api/quotes/${quoteId}/mark-paid-manually`, {
        method: 'POST',
        body: JSON.stringify({ method, paymentDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Erreur');
      }
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Marquer comme payé</DialogTitle>
          <DialogDescription>
            {quoteReference
              ? `Le client a payé le devis ${quoteReference} en dehors du lien de paiement.`
              : 'Le client a payé en dehors du lien de paiement.'}
            {' '}
            Montant = total du devis. Le devis passera en « Attente collecte ».
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-sm font-medium">Moyen de paiement</Label>
            <RadioGroup
              value={method}
              onValueChange={(v) => setMethod(v as ManualPaymentMethod)}
              className="mt-2 space-y-2"
            >
              {METHODS.map((m) => (
                <div key={m.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={m.value} id={`method-${m.value}`} />
                  <Label htmlFor={`method-${m.value}`} className="font-normal cursor-pointer">
                    {m.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div>
            <Label htmlFor="payment-date" className="text-sm font-medium">
              Date du paiement
            </Label>
            <Input
              id="payment-date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="mt-2"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Confirmer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
