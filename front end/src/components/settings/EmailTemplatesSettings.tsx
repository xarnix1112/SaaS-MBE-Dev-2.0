/**
 * Modèles d'emails - personnalisation complète par type
 * Sujet, corps HTML, signature, couleurs bandeau/bouton
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { authenticatedFetch } from '@/lib/api';
import { Mail, RotateCcw, Eye, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

const EMAIL_TYPES = [
  'quote_send',
  'surcharge',
  'payment_received',
  'awaiting_collection',
  'collected',
  'awaiting_shipment',
  'shipped',
] as const;

const EMAIL_TYPE_LABELS: Record<string, string> = {
  quote_send: 'Envoi de devis',
  surcharge: 'Surcoût supplémentaire',
  payment_received: 'Paiement reçu',
  awaiting_collection: 'Demande de collecte',
  collected: 'Lot collecté',
  awaiting_shipment: 'Colis prêt',
  shipped: 'Colis expédié',
};

const PLACEHOLDERS = [
  { key: '{{bordereauNum}}', label: 'Bordereau' },
  { key: '{{reference}}', label: 'Référence' },
  { key: '{{nomSalleVentes}}', label: 'Salle des ventes' },
  { key: '{{prixEmballage}}', label: 'Prix emballage' },
  { key: '{{prixTransport}}', label: 'Prix transport' },
  { key: '{{prixAssurance}}', label: 'Prix assurance' },
  { key: '{{prixTotal}}', label: 'Prix total' },
  { key: '{{lienPaiementSecurise}}', label: 'Lien paiement' },
  { key: '{{adresseDestinataire}}', label: 'Adresse livraison' },
  { key: '{{clientName}}', label: 'Nom client' },
  { key: '{{date}}', label: 'Date' },
  { key: '{{lotNumber}}', label: 'N° lot' },
  { key: '{{lotDescription}}', label: 'Description lot' },
  { key: '{{mbeName}}', label: 'Nom MBE' },
  { key: '{{amount}}', label: 'Montant' },
];

interface TemplateData {
  subject: string;
  bodyHtml: string;
  signature: string;
  bannerColor: string;
  buttonColor: string;
  bannerTitle: string;
  buttonLabel: string;
}

interface EmailTemplatesSettingsProps {
  onLoad?: () => void;
}

export default function EmailTemplatesSettings({ onLoad }: EmailTemplatesSettingsProps) {
  const [templates, setTemplates] = useState<Record<string, TemplateData>>({});
  const [customTemplates, setCustomTemplates] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, { subject: string; bodyHtml: string }>>({});
  const [expandedType, setExpandedType] = useState<string | null>('quote_send');
  const [edits, setEdits] = useState<Record<string, Partial<TemplateData>>>({});

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const res = await authenticatedFetch('/api/email-templates-extended');
      if (!res.ok) throw new Error('Erreur chargement');
      const data = await res.json();
      setTemplates(data.templates || {});
      setCustomTemplates(data.customTemplates || null);
      setEdits({});
    } catch (err) {
      console.error(err);
      toast.error('Impossible de charger les modèles');
    } finally {
      setLoading(false);
      onLoad?.();
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleSave = async (type: string) => {
    const t = templates[type];
    const e = edits[type];
    if (!t && !e) return;
    const payload = {
      type,
      subject: e?.subject ?? t?.subject,
      bodyHtml: e?.bodyHtml ?? t?.bodyHtml,
      signature: e?.signature ?? t?.signature,
      bannerColor: e?.bannerColor ?? t?.bannerColor,
      buttonColor: e?.buttonColor ?? t?.buttonColor,
      bannerTitle: e?.bannerTitle ?? t?.bannerTitle,
      buttonLabel: e?.buttonLabel ?? t?.buttonLabel,
    };
    try {
      setSaving(type);
      const res = await authenticatedFetch('/api/email-templates-extended', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Erreur');
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
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(null);
    }
  };

  const handlePreview = async (type: string) => {
    try {
      const res = await authenticatedFetch('/api/email-templates-extended/preview', {
        method: 'POST',
        body: JSON.stringify({ type }),
      });
      if (!res.ok) throw new Error('Erreur');
      const data = await res.json();
      setPreview((prev) => ({ ...prev, [type]: data }));
    } catch {
      toast.error('Erreur prévisualisation');
    }
  };

  const handleReset = async (type?: string) => {
    try {
      const res = await authenticatedFetch('/api/email-templates-extended/reset', {
        method: 'POST',
        body: JSON.stringify(type ? { type } : {}),
      });
      if (!res.ok) throw new Error('Erreur');
      const data = await res.json();
      setTemplates(data.templates || {});
      setCustomTemplates(data.customTemplates || null);
      setEdits({});
      setPreview({});
      toast.success(type ? 'Template réinitialisé' : 'Tous réinitialisés');
    } catch {
      toast.error('Erreur réinitialisation');
    }
  };

  const updateEdit = (type: string, field: keyof TemplateData, value: string) => {
    setEdits((prev) => {
      const current = prev[type] ?? templates[type] ?? {};
      return { ...prev, [type]: { ...current, [field]: value } };
    });
  };

  const getValue = (type: string, field: keyof TemplateData) => {
    const e = edits[type];
    if (e && e[field] !== undefined) return e[field] as string;
    return (templates[type]?.[field] as string) ?? '';
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
          Modèles d&apos;emails
        </CardTitle>
        <CardDescription>
          Personnalisez le sujet, le corps, la signature et les couleurs (bandeau, bouton) de tous vos emails.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground flex flex-wrap gap-1 items-center">
          Placeholders : {PLACEHOLDERS.map((p) => (
            <Badge key={p.key} variant="secondary" className="font-mono text-xs">{p.key}</Badge>
          ))}
        </p>

        <div className="space-y-4">
          {EMAIL_TYPES.map((type) => (
            <div key={type} className="border rounded-lg p-4 space-y-3">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedType(expandedType === type ? null : type)}
              >
                <h4 className="font-medium">{EMAIL_TYPE_LABELS[type] || type}</h4>
                {customTemplates?.[type as keyof typeof customTemplates] ? (
                  <Badge variant="outline" className="text-xs">Personnalisé</Badge>
                ) : null}
                {expandedType === type ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
              {expandedType === type && (
                <div className="space-y-3 pt-2">
                  <div>
                    <Label>Sujet</Label>
                    <Input
                      value={getValue(type, 'subject')}
                      onChange={(e) => updateEdit(type, 'subject', e.target.value)}
                      placeholder="Ex: Votre devis - {{reference}}"
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Couleur bandeau</Label>
                      <div className="flex gap-2 mt-1">
                        <input
                          type="color"
                          value={getValue(type, 'bannerColor') || '#2563eb'}
                          onChange={(e) => updateEdit(type, 'bannerColor', e.target.value)}
                          className="h-9 w-14 rounded border cursor-pointer"
                        />
                        <Input
                          value={getValue(type, 'bannerColor') || '#2563eb'}
                          onChange={(e) => updateEdit(type, 'bannerColor', e.target.value)}
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Couleur bouton</Label>
                      <div className="flex gap-2 mt-1">
                        <input
                          type="color"
                          value={getValue(type, 'buttonColor') || '#2563eb'}
                          onChange={(e) => updateEdit(type, 'buttonColor', e.target.value)}
                          className="h-9 w-14 rounded border cursor-pointer"
                        />
                        <Input
                          value={getValue(type, 'buttonColor') || '#2563eb'}
                          onChange={(e) => updateEdit(type, 'buttonColor', e.target.value)}
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label>Titre du bandeau</Label>
                    <Input
                      value={getValue(type, 'bannerTitle')}
                      onChange={(e) => updateEdit(type, 'bannerTitle', e.target.value)}
                      placeholder="Ex: 📦 Votre Devis de Transport"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Corps de l&apos;email (HTML)</Label>
                    <textarea
                      value={getValue(type, 'bodyHtml')}
                      onChange={(e) => updateEdit(type, 'bodyHtml', e.target.value)}
                      placeholder="Contenu HTML avec placeholders {{...}}"
                      rows={8}
                      className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono mt-1"
                    />
                  </div>
                  <div>
                    <Label>Signature (HTML)</Label>
                    <textarea
                      value={getValue(type, 'signature')}
                      onChange={(e) => updateEdit(type, 'signature', e.target.value)}
                      placeholder="Ex: Bien à vous, {{mbeName}}"
                      rows={2}
                      className="flex min-h-[50px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                    />
                  </div>
                  {['quote_send', 'surcharge'].includes(type) && (
                    <div>
                      <Label>Texte du bouton paiement</Label>
                      <Input
                        value={getValue(type, 'buttonLabel')}
                        onChange={(e) => updateEdit(type, 'buttonLabel', e.target.value)}
                        placeholder="Ex: Payer {{prixTotal}} € maintenant"
                        className="mt-1"
                      />
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={() => handleSave(type)} disabled={saving === type}>
                      {saving === type ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handlePreview(type)}>
                      <Eye className="w-4 h-4 mr-1" />
                      Aperçu
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleReset(type)}>
                      <RotateCcw className="w-4 h-4 mr-1" />
                      Réinitialiser
                    </Button>
                  </div>
                  {preview[type] && (
                    <div className="mt-3 p-3 bg-muted/50 rounded-md text-sm space-y-2">
                      <p className="font-medium">Aperçu :</p>
                      <p><strong>Sujet :</strong> {preview[type].subject}</p>
                      <div className="border rounded p-3 bg-white dark:bg-zinc-900 mt-2 max-h-96 overflow-auto">
                        <div dangerouslySetInnerHTML={{ __html: preview[type].bodyHtml || '' }} className="prose prose-sm max-w-none" />
                      </div>
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
            Réinitialiser tous les modèles
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
