/**
 * Modèles d'emails - personnalisation complète par type
 * Sujet, corps HTML, signature, couleurs bandeau/bouton, logo
 * Option B : pour quote_send, édition par sections (add/remove)
 */

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { authenticatedFetch } from '@/lib/api';
import { Mail, RotateCcw, Eye, Loader2, ChevronDown, ChevronUp, Plus, Trash2, ImageIcon } from 'lucide-react';

const SECTION_BASED_TYPES = ['quote_send', 'payment_received'] as const;

export interface SectionItem {
  id: string;
  title: string;
  content: string;
}

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
  bodySections?: SectionItem[] | null;
  signature: string;
  bannerColor: string;
  buttonColor: string;
  bannerTitle: string;
  bannerLogoUrl?: string;
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
    const payload: Record<string, unknown> = {
      type,
      subject: e?.subject ?? t?.subject,
      bodyHtml: e?.bodyHtml ?? t?.bodyHtml,
      signature: e?.signature ?? t?.signature,
      bannerColor: e?.bannerColor ?? t?.bannerColor,
      buttonColor: e?.buttonColor ?? t?.buttonColor,
      bannerTitle: e?.bannerTitle ?? t?.bannerTitle,
      buttonLabel: e?.buttonLabel ?? t?.buttonLabel,
    };
    if (SECTION_BASED_TYPES.includes(type as (typeof SECTION_BASED_TYPES)[number])) {
      payload.bodySections = e?.bodySections ?? t?.bodySections ?? [];
    }
    if (e?.bannerLogoUrl !== undefined || t?.bannerLogoUrl) {
      payload.bannerLogoUrl = e?.bannerLogoUrl ?? t?.bannerLogoUrl ?? '';
    }
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

  const getSections = (type: string): SectionItem[] => {
    const e = edits[type];
    if (e?.bodySections !== undefined) return e.bodySections as SectionItem[];
    const arr = templates[type]?.bodySections;
    return Array.isArray(arr) ? arr : [];
  };

  const updateSection = (type: string, index: number, field: 'title' | 'content', value: string) => {
    const sections = [...getSections(type)];
    if (index < 0 || index >= sections.length) return;
    sections[index] = { ...sections[index], [field]: value };
    setEdits((prev) => {
      const current = prev[type] ?? templates[type] ?? {};
      return { ...prev, [type]: { ...current, bodySections: sections } };
    });
  };

  const addSection = (type: string) => {
    const sections = [...getSections(type)];
    sections.push({ id: `s${Date.now()}`, title: '', content: '' });
    setEdits((prev) => {
      const current = prev[type] ?? templates[type] ?? {};
      return { ...prev, [type]: { ...current, bodySections: sections } };
    });
  };

  const removeSection = (type: string, index: number) => {
    const sections = getSections(type).filter((_, i) => i !== index);
    setEdits((prev) => {
      const current = prev[type] ?? templates[type] ?? {};
      return { ...prev, [type]: { ...current, bodySections: sections } };
    });
  };

  const logoUploadRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const handleLogoUpload = async (type: string) => {
    const file = logoUploadRef.current?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Veuillez sélectionner une image (jpg, png, gif, webp)');
      return;
    }
    try {
      setLogoUploading(true);
      const formData = new FormData();
      formData.append('logo', file);
      formData.append('type', type);
      const res = await authenticatedFetch('/api/email-templates-extended/upload-logo', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Erreur upload');
      }
      const data = await res.json();
      if (data.url) {
        setEdits((prev) => {
          const current = prev[type] ?? templates[type] ?? {};
          return { ...prev, [type]: { ...current, bannerLogoUrl: data.url } };
        });
        toast.success('Logo ajouté');
        await loadTemplates();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur upload');
    } finally {
      setLogoUploading(false);
      logoUploadRef.current!.value = '';
    }
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
                  {['quote_send', 'surcharge', 'payment_received'].includes(type) && (
                    <div>
                      <Label>Logo du bandeau</Label>
                      <p className="text-xs text-muted-foreground mt-0.5 mb-1">URL ou sélectionnez un fichier depuis votre ordinateur</p>
                      <div className="flex gap-2 mt-1">
                        <Input
                          value={getValue(type, 'bannerLogoUrl') || ''}
                          onChange={(e) => updateEdit(type, 'bannerLogoUrl', e.target.value)}
                          placeholder="https://..."
                          className="flex-1"
                        />
                        <input
                          ref={logoUploadRef}
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          className="hidden"
                          onChange={() => type && handleLogoUpload(type)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => logoUploadRef.current?.click()}
                          disabled={logoUploading}
                        >
                          {logoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                          Fichier
                        </Button>
                      </div>
                      {(getValue(type, 'bannerLogoUrl') || templates[type]?.bannerLogoUrl) && (
                        <div className="mt-2 flex items-center gap-2">
                          <img
                            src={getValue(type, 'bannerLogoUrl') || templates[type]?.bannerLogoUrl}
                            alt="Logo actuel"
                            className="h-10 object-contain border rounded"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => updateEdit(type, 'bannerLogoUrl', '')}
                          >
                            Supprimer
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {SECTION_BASED_TYPES.includes(type as (typeof SECTION_BASED_TYPES)[number]) ? (
                    <div>
                      <Label>Corps de l&apos;email (par sections)</Label>
                      <p className="text-xs text-muted-foreground mb-2">Modifiez le texte de chaque section. Utilisez • ou - en début de ligne pour des puces.</p>
                      {getSections(type).length === 0 && (templates[type] as TemplateData)?.bodyHtml && (
                        <p className="text-sm text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/30 p-2 rounded mb-2">
                          Ce modèle utilise l&apos;ancien format. Cliquez sur &quot;Réinitialiser&quot; pour passer au nouvel éditeur par sections.
                        </p>
                      )}
                      <div className="space-y-3">
                        {getSections(type).map((sec, idx) => (
                          <div key={sec.id} className="border rounded p-3 bg-muted/30 space-y-2">
                            <div className="flex justify-between items-center">
                              <Input
                                value={sec.title}
                                onChange={(e) => updateSection(type, idx, 'title', e.target.value)}
                                placeholder="Titre de section (vide = pas de titre)"
                                className="font-medium"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeSection(type, idx)}
                                className="text-destructive shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                            <textarea
                              value={sec.content}
                              onChange={(e) => updateSection(type, idx, 'content', e.target.value)}
                              placeholder="Contenu... (placeholders {{bordereauNum}}, {{prixTotal}}, etc.)"
                              rows={4}
                              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1 resize-y"
                            />
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={() => addSection(type)}>
                          <Plus className="w-4 h-4 mr-1" />
                          Ajouter une section
                        </Button>
                      </div>
                    </div>
                  ) : (
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
                  )}
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
