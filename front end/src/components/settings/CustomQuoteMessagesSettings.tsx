/**
 * Paramètres > Messages personnalisés devis
 * Deux listes (principales + optionnelles), chaque message a :
 *   label (court), textFr (texte complet FR), textEn (texte complet EN)
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { authenticatedFetch } from '@/lib/api';
import { Plus, Trash2, Loader2, MessageSquare, GripVertical } from 'lucide-react';

export interface CustomQuoteMessage {
  id: string;
  label: string;
  textFr: string;
  textEn: string;
}

interface MessagesState {
  principales: CustomQuoteMessage[];
  optionnelles: CustomQuoteMessage[];
}

const emptyMsg = (): CustomQuoteMessage => ({
  id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  label: '',
  textFr: '',
  textEn: '',
});

const DEFAULT_MESSAGES: MessagesState = {
  principales: [
    { id: 'p1', label: 'Lithographie roulable', textFr: 'Le devis suivant a été considéré pour une lithographie pouvant être roulé et mise en tube.', textEn: 'The following quote has been considered for a lithograph that can be rolled and placed in a tube.' },
    { id: 'p2', label: 'Affiches à plat', textFr: 'Le devis suivant a été considéré pour un envoi à plat de vos affiches.', textEn: 'The following quote has been considered for a flat shipment of your posters.' },
    { id: 'p3', label: 'Tableaux sans cadres', textFr: 'Le devis suivant a été considéré pour des tableaux sans cadres.', textEn: 'The following quote has been considered for unframed paintings.' },
    { id: 'p4', label: 'Tableau mince (< 5 cm)', textFr: "Le devis suivant a été considéré pour un tableau d'une épaisseur de moins de 5 cm.", textEn: 'The following quote has been considered for a painting less than 5 cm thick.' },
    { id: 'p5', label: 'Colis léger (< 18 kg)', textFr: 'Le devis suivant a été considéré pour un lot de moins de 18 kg et pouvant voyager en colis.', textEn: 'The following quote has been considered for a lot weighing less than 18 kg that can travel as a parcel.' },
    { id: 'p6', label: 'Ensemble léger (< 18 kg)', textFr: "Le devis suivant a été considéré pour un ensemble de moins de 18 kg.", textEn: 'The following quote has been considered for an assembly weighing less than 18 kg.' },
    { id: 'p7', label: 'Objet pliable/roulable', textFr: "Le devis suivant a été considéré pour un objet pouvant être plié/roulé.", textEn: 'The following quote has been considered for an item that can be folded/rolled.' },
    { id: 'p8', label: 'Palette + livraison pas de porte', textFr: "Le devis suivant a été considéré pour une préparation sur palette et une livraison par transporteur en pas de porte.\nSi il est nécessaire d'avoir une livraison en étage, un devis par transporteur dédié sera nécessaire, et prendra plus de temps.", textEn: "The following quote has been considered for pallet preparation and delivery by carrier to the ground floor.\nIf delivery to an upper floor is required, a quote from a dedicated carrier will be necessary and will take longer." },
  ],
  optionnelles: [
    { id: 'o1', label: 'Transport express (main propre)', textFr: "(Transport en express avec remise en main propre. Si vous souhaitez un transport standard, merci de nous le faire savoir en retour d'e-mail.)", textEn: "(Express delivery with personal handover. If you prefer standard shipping, please let us know by return e-mail.)" },
    { id: 'o2', label: 'Transport standard', textFr: "(Transport en standard. Si vous souhaitez un transport express avec remise en main propre, merci de nous le faire savoir en retour d'e-mail.)", textEn: "(Standard delivery. If you prefer express shipping with personal handover, please let us know by return e-mail.)" },
    { id: 'o3', label: 'Assurance optionnelle (FR)', textFr: "(Optionnelle. Si vous ne souhaitez pas souscrire à l'assurance, merci de nous le faire savoir en retour d'e-mail.)", textEn: "(Optional. If you don't want insurance please let us know.)" },
    { id: 'o4', label: 'Instructions douanes', textFr: "Si vous avez des instructions particulières pour la déclaration douanière (description – valeur), merci de nous le faire savoir.", textEn: "If you have any particular instructions for the customs declaration (description – value), please let us know." },
  ],
};

function MessageEditor({
  msg,
  onChange,
  onDelete,
}: {
  msg: CustomQuoteMessage;
  onChange: (updated: CustomQuoteMessage) => void;
  onDelete: () => void;
}) {
  return (
    <div className="border rounded-lg p-4 space-y-3 bg-background">
      <div className="flex items-start gap-2">
        <GripVertical className="w-4 h-4 mt-2 text-muted-foreground shrink-0" />
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Libellé court (ex. Lithographie roulable)"
              value={msg.label}
              onChange={(e) => onChange({ ...msg, label: e.target.value })}
              className="font-medium"
            />
            <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive shrink-0">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Texte français</Label>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                placeholder="Texte complet en français…"
                value={msg.textFr}
                onChange={(e) => onChange({ ...msg, textFr: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Texte anglais</Label>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                placeholder="English text…"
                value={msg.textEn}
                onChange={(e) => onChange({ ...msg, textEn: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CustomQuoteMessagesSettings() {
  const [messages, setMessages] = useState<MessagesState>({ principales: [], optionnelles: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await authenticatedFetch('/api/custom-quote-messages');
        if (res.ok) {
          const data = await res.json();
          const loaded = data.messages as MessagesState;
          if (loaded.principales.length === 0 && loaded.optionnelles.length === 0) {
            setMessages(DEFAULT_MESSAGES);
            setIsDirty(true);
          } else {
            setMessages(loaded);
          }
        }
      } catch (e) {
        console.error(e);
        toast.error('Erreur lors du chargement des messages');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const update = (section: keyof MessagesState, idx: number, updated: CustomQuoteMessage) => {
    setMessages((prev) => ({
      ...prev,
      [section]: prev[section].map((m, i) => (i === idx ? updated : m)),
    }));
    setIsDirty(true);
  };

  const remove = (section: keyof MessagesState, idx: number) => {
    setMessages((prev) => ({
      ...prev,
      [section]: prev[section].filter((_, i) => i !== idx),
    }));
    setIsDirty(true);
  };

  const add = (section: keyof MessagesState) => {
    setMessages((prev) => ({ ...prev, [section]: [...prev[section], emptyMsg()] }));
    setIsDirty(true);
  };

  const save = async () => {
    setIsSaving(true);
    try {
      const res = await authenticatedFetch('/api/custom-quote-messages', {
        method: 'PUT',
        body: JSON.stringify({ messages }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur sauvegarde');
      }
      toast.success('Messages enregistrés');
      setIsDirty(false);
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Erreur');
    } finally {
      setIsSaving(false);
    }
  };

  const resetToDefaults = () => {
    setMessages(DEFAULT_MESSAGES);
    setIsDirty(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <Loader2 className="w-4 h-4 animate-spin" />
        Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Messages personnalisés
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Ces messages sont proposés dans le popup « Envoyer le devis » pour préciser des spécificités (type d'objet, transport, assurance…).
            Le placeholder <code className="text-xs bg-muted px-1 rounded">{'{{messagePersonnalise}}'}</code> dans le template intègre les messages sélectionnés.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetToDefaults}>
            Réinitialiser les défauts
          </Button>
          <Button size="sm" onClick={save} disabled={isSaving || !isDirty}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Enregistrer
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Messages principaux
            <Badge variant="secondary">{messages.principales.length}</Badge>
          </CardTitle>
          <CardDescription>
            Décrivent les spécificités du lot (type d'objet, conditionnement). Un seul ou plusieurs peuvent être sélectionnés lors de l'envoi.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {messages.principales.map((msg, i) => (
            <MessageEditor
              key={msg.id}
              msg={msg}
              onChange={(u) => update('principales', i, u)}
              onDelete={() => remove('principales', i)}
            />
          ))}
          <Button variant="outline" size="sm" onClick={() => add('principales')} className="w-full gap-2">
            <Plus className="w-4 h-4" />
            Ajouter un message principal
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Messages optionnels
            <Badge variant="secondary">{messages.optionnelles.length}</Badge>
          </CardTitle>
          <CardDescription>
            Précisions sur le transport ou l'assurance. S'ajoutent après les messages principaux.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {messages.optionnelles.map((msg, i) => (
            <MessageEditor
              key={msg.id}
              msg={msg}
              onChange={(u) => update('optionnelles', i, u)}
              onDelete={() => remove('optionnelles', i)}
            />
          ))}
          <Button variant="outline" size="sm" onClick={() => add('optionnelles')} className="w-full gap-2">
            <Plus className="w-4 h-4" />
            Ajouter un message optionnel
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
