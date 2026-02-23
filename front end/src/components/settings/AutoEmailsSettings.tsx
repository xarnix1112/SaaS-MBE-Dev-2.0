/**
 * Personnalisation des emails automatiques (plan Ultra)
 * Sujet, signature, ton par type d'email
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { authenticatedFetch } from '@/lib/api';
import { Mail, RotateCcw, Eye, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

const EMAIL_TYPES = [
  'payment_received',
  'awaiting_collection',
  'collected',
  'awaiting_shipment',
  'shipped',
] as const;

const EMAIL_TYPE_LABELS: Record<string, string> = {
  payment_received: 'Paiement reçu',
  awaiting_collection: 'Demande de collecte',
  collected: 'Lot collecté',
  awaiting_shipment: 'Colis prêt',
  shipped: 'Colis expédié',
};

const PLACEHOLDERS = [
  { key: '{reference}', label: 'Référence devis' },
  { key: '{clientName}', label: 'Nom du client' },
  { key: '{mbeName}', label: 'Nom du MBE' },
  { key: '{amount}', label: 'Montant (€)' },
];

interface TemplateData {
  subject: string;
  signature: string;
  tone: string;
}

interface AutoEmailsSettingsProps {
  onLoad?: () => void;
}

export default function AutoEmailsSettings({ onLoad }: AutoEmailsSettingsProps) {
  const [templates, setTemplates] = useState<Record<string, TemplateData>>({});
  const [customTemplates, setCustomTemplates] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, { subject: string; signature: string; tone: string }> | null>(null);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { subject: string; signature: string; tone: string }>>({});

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const res = await authenticatedFetch('/api/email-templates');
      if (!res.ok) {
        if (res.status === 403) {
          toast.error('Personnalisation réservée au plan Ultra');
          return;
        }
        throw new Error('Erreur chargement');
      }
      const data = await res.json();
      setTemplates(data.templates || {});
      setCustomTemplates(data.customTemplates || null);
      setEdits({});
    } catch (err) {
      console.error('Erreur chargement templates:', err);
      toast.error('Impossible de charger les templates');
    } finally {
      setLoading(false);
      onLoad?.();
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleSave = async (type: string) => {
    const e = edits[type] ?? templates[type];
    if (!e) return;
    try {
      setSaving(type);
      const res = await authenticatedFetch('/api/email-templates', {
        method: 'PUT',
        body: JSON.stringify({
          type,
          subject: e.subject,
          signature: e.signature,
          tone: e.tone,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erreur sauvegarde');
      }
      const data = await res.json();
      setTemplates(data.templates || {});
      setCustomTemplates(data.customTemplates || null);
      setEdits((prev) => {
        const next = { ...prev };
        delete next[type];
        return next;
      });
      toast.success('Modifications enregistrées');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur sauvegarde');
    } finally {
      setSaving(null);
    }
  };

  const handleReset = async (type?: string) => {
    try {
      const res = await authenticatedFetch('/api/email-templates/reset', {
        method: 'POST',
        body: JSON.stringify(type ? { type } : {}),
      });
      if (!res.ok) throw new Error('Erreur réinitialisation');
      const data = await res.json();
      setTemplates(data.templates || {});
      setCustomTemplates(data.customTemplates || null);
      setEdits({});
      setPreview(null);
      toast.success(type ? 'Template réinitialisé' : 'Tous les templates réinitialisés');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const handlePreview = async (type: string) => {
    try {
      const res = await authenticatedFetch('/api/email-templates/preview', {
        method: 'POST',
        body: JSON.stringify({ type }),
      });
      if (!res.ok) throw new Error('Erreur prévisualisation');
      const data = await res.json();
      setPreview((prev) => ({ ...prev, [type]: data }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const updateEdit = (type: string, field: 'subject' | 'signature' | 'tone', value: string) => {
    setEdits((prev) => {
      const current = prev[type] ?? templates[type] ?? { subject: '', signature: '', tone: 'formel' };
      return { ...prev, [type]: { ...current, [field]: value } };
    });
  };

  const getValue = (type: string, field: 'subject' | 'signature' | 'tone') => {
    const e = edits[type];
    if (e && e[field] !== undefined) return e[field];
    const t = templates[type];
    if (field === 'tone') return t?.[field] || 'formel';
    return t?.[field] ?? '';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Emails automatiques
        </CardTitle>
        <CardDescription>
          Personnalisez le sujet, la signature et le ton des emails envoyés automatiquement à vos clients (paiement reçu, collecte, expédition...).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Placeholders disponibles : {PLACEHOLDERS.map((p) => (
            <Badge key={p.key} variant="secondary" className="ml-1 font-mono text-xs">{p.key}</Badge>
          ))}
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Les placeholders {`{reference}`} et {`{mbeName}`} sont obligatoires et ne peuvent pas être supprimés.
        </p>

        <div className="space-y-4">
          {EMAIL_TYPES.map((type) => (
            <div key={type} className="border rounded-lg p-4 space-y-3">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedType(expandedType === type ? null : type)}
              >
                <h4 className="font-medium">{EMAIL_TYPE_LABELS[type] || type}</h4>
                {customTemplates?.[type] ? (
                  <Badge variant="outline" className="text-xs">Personnalisé</Badge>
                ) : null}
                {expandedType === type ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
              {expandedType === type && (
                <div className="space-y-3 pt-2">
                  <div>
                    <Label>Sujet</Label>
                    <Input
                      value={getValue(type, 'subject')}
                      onChange={(e) => updateEdit(type, 'subject', e.target.value)}
                      placeholder="Ex: Paiement reçu - Devis {reference}"
                      maxLength={200}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Signature</Label>
                    <textarea
                      value={getValue(type, 'signature')}
                      onChange={(e) => updateEdit(type, 'signature', e.target.value)}
                      placeholder="Ex: Cordialement,&#10;{mbeName}"
                      maxLength={500}
                      rows={3}
                      className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1"
                    />
                  </div>
                  <div>
                    <Label>Ton</Label>
                    <Select
                      value={getValue(type, 'tone')}
                      onValueChange={(v) => updateEdit(type, 'tone', v)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="formel">Formel</SelectItem>
                        <SelectItem value="amical">Amical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      onClick={() => handleSave(type)}
                      disabled={saving === type}
                    >
                      {saving === type ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handlePreview(type)}>
                      <Eye className="w-4 h-4 mr-1" />
                      Prévisualiser
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleReset(type)}>
                      <RotateCcw className="w-4 h-4 mr-1" />
                      Réinitialiser
                    </Button>
                  </div>
                  {preview?.[type] && (
                    <div className="mt-3 p-3 bg-muted/50 rounded-md text-sm">
                      <p className="font-medium mb-1">Aperçu :</p>
                      <p><strong>Sujet :</strong> {preview[type].subject}</p>
                      <p className="mt-1 whitespace-pre-wrap"><strong>Signature :</strong><br />{preview[type].signature}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="pt-4 border-t">
          <Button variant="outline" onClick={() => handleReset()}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Revenir aux emails par défaut (tous)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
