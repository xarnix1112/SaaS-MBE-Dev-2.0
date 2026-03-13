import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppHeader } from '@/components/layout/AppHeader';
import { QuoteTimeline } from '@/components/quotes/QuoteTimeline';
import { StatusBadge } from '@/components/quotes/StatusBadge';
import { AttachAuctionSheet } from '@/components/quotes/AttachAuctionSheet';
import { QuotePaiements } from '@/components/quotes/QuotePaiements';
import { CartonSelector } from '@/components/quotes/CartonSelector';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MarkPaidManualDialog } from '@/components/quotes/MarkPaidManualDialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useQuotes } from "@/hooks/use-quotes";
import { useAuctionHouses } from "@/hooks/use-auction-houses";
import { useQueryClient } from "@tanstack/react-query";
import { AuctionSheetAnalysis } from '@/lib/auctionSheetAnalyzer';
import { Quote, DeliveryMode, DeliveryInfo, PaymentLink, ClientRefusalReason } from '@/types/quote';
import { toast } from 'sonner';
import { useShipmentGrouping } from '@/hooks/useShipmentGrouping';
import { GroupingSuggestion } from '@/components/shipment/GroupingSuggestion';
import { GroupBadge } from '@/components/shipment/GroupBadge';
import { getApiBaseUrl } from '@/lib/api-base';
import { 
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  Home,
  Package,
  Ruler,
  Euro,
  Image,
  Building2,
  CreditCard,
  Link as LinkIcon,
  MessageSquare,
  FileText,
  Clock,
  AlertTriangle,
  Send,
  Truck,
  Edit,
  Plus,
  ExternalLink,
  Copy,
  FileCheck,
  Save,
  XCircle,
  RefreshCw,
  CheckCircle2,
  Loader2,
  Banknote,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { saveAuctionSheetForQuote, removeAuctionSheetForQuote } from "@/lib/quoteEnhancements";
import { createStripeLink } from '@/lib/stripe';
import { createPaiement, getPaiements, cancelPaiement } from '@/lib/stripeConnect';

/**
 * Nettoie un objet pour Firestore en remplaçant undefined par null ou en omettant les champs
 */
function cleanForFirestore<T extends Record<string, any>>(obj: T): T {
  const cleaned = {} as T;
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      // Omettre les valeurs undefined
      continue;
    } else if (value === null) {
      cleaned[key as keyof T] = null as T[keyof T];
    } else if (Array.isArray(value)) {
      cleaned[key as keyof T] = value.map(item => 
        typeof item === 'object' && item !== null ? cleanForFirestore(item) : item
      ) as T[keyof T];
    } else if (typeof value === 'object' && value !== null) {
      cleaned[key as keyof T] = cleanForFirestore(value) as T[keyof T];
    } else {
      cleaned[key as keyof T] = value;
    }
  }
  return cleaned;
}

import { computeInsuranceWithConfig } from "@/lib/insurance";
import { getCartonPrice, calculateShippingPrice, calculateVolumetricWeight, cleanCartonRef } from "@/lib/pricing";
import { setDoc, doc, Timestamp, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createTimelineEvent, addTimelineEvent, getStatusDescription, timelineEventToFirestore } from "@/lib/quoteTimeline";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEmailMessages } from "@/hooks/use-email-messages";
import { EmailMessage } from "@/types/quote";
import { authenticatedFetch } from "@/lib/api";
import type { CustomQuoteMessage } from '@/components/settings/CustomQuoteMessagesSettings';

const DEFAULT_POPUP_MESSAGES = {
  principales: [
    { id: 'p1', label: 'Lithographie roulable', textFr: 'Le devis suivant a été considéré pour une lithographie pouvant être roulé et mise en tube.', textEn: 'The following quote has been considered for a lithograph that can be rolled and placed in a tube.' },
    { id: 'p2', label: 'Affiches à plat', textFr: 'Le devis suivant a été considéré pour un envoi à plat de vos affiches.', textEn: 'The following quote has been considered for a flat shipment of your posters.' },
    { id: 'p3', label: 'Tableaux sans cadres', textFr: 'Le devis suivant a été considéré pour des tableaux sans cadres.', textEn: 'The following quote has been considered for unframed paintings.' },
    { id: 'p4', label: 'Tableau mince (< 5 cm)', textFr: "Le devis suivant a été considéré pour un tableau d'une épaisseur de moins de 5 cm.", textEn: 'The following quote has been considered for a painting less than 5 cm thick.' },
    { id: 'p5', label: 'Colis léger (< 18 kg)', textFr: 'Le devis suivant a été considéré pour un lot de moins de 18 kg et pouvant voyager en colis.', textEn: 'The following quote has been considered for a lot weighing less than 18 kg that can travel as a parcel.' },
    { id: 'p6', label: 'Ensemble léger (< 18 kg)', textFr: 'Le devis suivant a été considéré pour un ensemble de moins de 18 kg.', textEn: 'The following quote has been considered for an assembly weighing less than 18 kg.' },
    { id: 'p7', label: 'Objet pliable/roulable', textFr: 'Le devis suivant a été considéré pour un objet pouvant être plié/roulé.', textEn: 'The following quote has been considered for an item that can be folded/rolled.' },
    { id: 'p8', label: 'Palette + livraison pas de porte', textFr: "Le devis suivant a été considéré pour une préparation sur palette et une livraison par transporteur en pas de porte.\nSi il est nécessaire d'avoir une livraison en étage, un devis par transporteur dédié sera nécessaire, et prendra plus de temps.", textEn: "The following quote has been considered for pallet preparation and delivery by carrier to the ground floor.\nIf delivery to an upper floor is required, a quote from a dedicated carrier will be necessary and will take longer." },
  ] as CustomQuoteMessage[],
  optionnelles: [
    { id: 'o1', label: 'Transport express (main propre)', textFr: "(Transport en express avec remise en main propre. Si vous souhaitez un transport standard, merci de nous le faire savoir en retour d'e-mail.)", textEn: '(Express delivery with personal handover. If you prefer standard shipping, please let us know by return e-mail.)' },
    { id: 'o2', label: 'Transport standard', textFr: "(Transport en standard. Si vous souhaitez un transport express avec remise en main propre, merci de nous le faire savoir en retour d'e-mail.)", textEn: '(Standard delivery. If you prefer express shipping with personal handover, please let us know by return e-mail.)' },
    { id: 'o3', label: 'Assurance optionnelle', textFr: "(Optionnelle. Si vous ne souhaitez pas souscrire à l'assurance, merci de nous le faire savoir en retour d'e-mail.)", textEn: "(Optional. If you don't want insurance please let us know.)" },
    { id: 'o4', label: 'Instructions douanes', textFr: 'Si vous avez des instructions particulières pour la déclaration douanière (description – valeur), merci de nous le faire savoir.', textEn: 'If you have any particular instructions for the customs declaration (description – value), please let us know.' },
  ] as CustomQuoteMessage[],
};
import type { Paiement } from "@/types/stripe";
import { useFeatures } from "@/hooks/use-features";
import { useInsuranceSettings } from "@/hooks/use-insurance-settings";
import { useQuery } from "@tanstack/react-query";

export default function QuoteDetail() {
  const { id } = useParams();
  const { data: quotes = [], isLoading, isError } = useQuotes();
  const { houses: auctionHouses = [] } = useAuctionHouses();
  const queryClient = useQueryClient();
  const { data: featuresData } = useFeatures();
  const { data: insuranceConfig } = useInsuranceSettings();
  const computeInsuranceAmount = useCallback(
    (lotValue: number, insuranceEnabled?: boolean, explicitAmount?: number | null) =>
      computeInsuranceWithConfig(insuranceConfig ?? null, lotValue, insuranceEnabled, explicitAmount),
    [insuranceConfig]
  );
  const { data: mbehubStatus } = useQuery({
    queryKey: ['mbehub-status'],
    queryFn: async () => {
      const res = await authenticatedFetch('/api/account/mbehub-status');
      if (!res.ok) return { available: false, configured: false };
      return res.json();
    },
    enabled: !!featuresData?.planId && (featuresData.planId === 'pro' || featuresData.planId === 'ultra'),
  });
  const useMbehubForShipping = mbehubStatus?.available && mbehubStatus?.configured && mbehubStatus?.shippingCalculationMethod === 'mbehub';
  const showMbehubButton = useMbehubForShipping;
  const foundQuote = quotes.find((q) => q.id === id);
  const [generatingLink, setGeneratingLink] = useState<boolean>(false);
  const [quote, setQuote] = useState<Quote | undefined>(foundQuote);
  const [auctionSheetAnalysis, setAuctionSheetAnalysis] = useState<AuctionSheetAnalysis | null>(
    foundQuote?.auctionSheet ? {
      auctionHouse: foundQuote.auctionSheet.auctionHouse,
      auctionDate: foundQuote.auctionSheet.auctionDate,
      lots: (foundQuote.auctionSheet.lots || []).map((l) => ({
        lotNumber: l.lotNumber,
        description: l.description,
        estimatedDimensions: l.estimatedDimensions,
        value: l.value,
      })),
      totalLots: foundQuote.auctionSheet.totalLots || (foundQuote.auctionSheet.lots?.length ?? 0),
      totalObjects: foundQuote.auctionSheet.totalObjects || (foundQuote.auctionSheet.lots?.length ?? 0),
      recommendedCarton: foundQuote.auctionSheet.recommendedCarton,
      rawText: foundQuote.auctionSheet.rawText,
    } : null
  );
  const [isAuctionSheetDialogOpen, setIsAuctionSheetDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddNoteDialogOpen, setIsAddNoteDialogOpen] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<number | null>(null);
  const [surchargePaiements, setSurchargePaiements] = useState<Paiement[]>([]);
  const [isLoadingSurcharges, setIsLoadingSurcharges] = useState(false);
  const [isSendingSurchargeEmail, setIsSendingSurchargeEmail] = useState(false);
  const [paiementsRefreshKey, setPaiementsRefreshKey] = useState(0);
  const [isPrincipalPaidForEdit, setIsPrincipalPaidForEdit] = useState(false);
  const [isRefusingQuote, setIsRefusingQuote] = useState(false);
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const [isRefusalDialogOpen, setIsRefusalDialogOpen] = useState(false);
  const [refusalReason, setRefusalReason] = useState<ClientRefusalReason>('tarif_trop_eleve');
  const [refusalReasonDetail, setRefusalReasonDetail] = useState('');
  const [isMarkPaidManualDialogOpen, setIsMarkPaidManualDialogOpen] = useState(false);
  const [isUnmarkingPaid, setIsUnmarkingPaid] = useState(false);
  const [mbeShippingRates, setMbeShippingRates] = useState<{
    standard?: { price: number; option?: unknown };
    express?: { price: number; option?: unknown };
  } | null>(null);
  const [isCalculatingMbeShipping, setIsCalculatingMbeShipping] = useState(false);
  const [isSendQuoteDialogOpen, setIsSendQuoteDialogOpen] = useState(false);
  const [isSurchargeDialogOpen, setIsSurchargeDialogOpen] = useState(false);
  const [selectedSurchargeForDialog, setSelectedSurchargeForDialog] = useState<Paiement | null>(null);
  const [surchargeReason, setSurchargeReason] = useState<string>('dimensions_reelles');
  const [surchargeReasonOther, setSurchargeReasonOther] = useState('');
  const [isSendingQuote, setIsSendingQuote] = useState(false);

  // Messages personnalisés devis
  const [customMsgPrincipales, setCustomMsgPrincipales] = useState<CustomQuoteMessage[]>([]);
  const [customMsgOptionnelles, setCustomMsgOptionnelles] = useState<CustomQuoteMessage[]>([]);
  const [selectedMsgIds, setSelectedMsgIds] = useState<string[]>([]);
  const [customMsgText, setCustomMsgText] = useState('');
  const [customMsgLang, setCustomMsgLang] = useState<'fr' | 'en'>('fr');
  const [isLoadingCustomMsgs, setIsLoadingCustomMsgs] = useState(false);

  // Chargement des messages personnalisés à l'ouverture du dialog d'envoi
  useEffect(() => {
    if (!isSendQuoteDialogOpen) return;
    setSelectedMsgIds([]);
    setCustomMsgText('');
    setCustomMsgLang('fr');
    setIsLoadingCustomMsgs(true);
    authenticatedFetch('/api/custom-quote-messages')
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d) => {
        let principales = d.messages?.principales || [];
        let optionnelles = d.messages?.optionnelles || [];
        if (principales.length === 0 && optionnelles.length === 0) {
          principales = DEFAULT_POPUP_MESSAGES.principales;
          optionnelles = DEFAULT_POPUP_MESSAGES.optionnelles;
        }
        setCustomMsgPrincipales(principales);
        setCustomMsgOptionnelles(optionnelles);
      })
      .catch(() => {
        setCustomMsgPrincipales(DEFAULT_POPUP_MESSAGES.principales);
        setCustomMsgOptionnelles(DEFAULT_POPUP_MESSAGES.optionnelles);
      })
      .finally(() => setIsLoadingCustomMsgs(false));
  }, [isSendQuoteDialogOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Réinitialiser les tarifs MBE quand on change de devis
  useEffect(() => {
    setMbeShippingRates(null);
  }, [quote?.id]);

  // Auto-fetch et auto-apply du prix Standard MBE Hub à l'ouverture du devis (quand MBE Hub est sélectionné)
  const hasAutoAppliedMbeRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!useMbehubForShipping || !quote?.id || isSaving) return;
    if (quote.paymentStatus === 'paid') return;
    const dims = quote.lot?.dimensions || quote.lot?.realDimensions || {};
    const hasDims = (dims.length ?? 0) > 0 && (dims.width ?? 0) > 0 && (dims.height ?? 0) > 0;
    const rawWeight = quote.totalWeight ?? dims.weight ?? 0;
    const weight = rawWeight > 0 ? rawWeight : (hasDims ? calculateVolumetricWeight(dims.length, dims.width, dims.height) : 0);
    const addr = quote.delivery?.address || {};
    const clientAddr = quote.client?.address || '';
    const hasAddr = !!(addr.zip || addr.city || addr.country || clientAddr);
    if (!hasDims || !hasAddr) return;
    if (hasAutoAppliedMbeRef.current[quote.id]) return;
    hasAutoAppliedMbeRef.current[quote.id] = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await authenticatedFetch('/api/mbehub/quote-shipping-rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quoteId: quote.id }),
        });
        if (cancelled) return;
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Erreur API');
        const standardPrice = data.standard?.price;
        if (standardPrice == null || standardPrice <= 0) return;
        const packagingPrice = quote.auctionSheet?.recommendedCarton?.price ??
          (quote.auctionSheet?.recommendedCarton as { priceTTC?: number })?.priceTTC ??
          quote.options?.packagingPrice ?? 0;
        const insuranceAmount = computeInsuranceAmount(
          quote.declaredValue ?? quote.lot?.value ?? 0,
          quote.options?.insurance,
          quote.options?.insuranceAmount
        );
        const newTotal = packagingPrice + standardPrice + insuranceAmount;
        setQuote((prev) => prev ? {
          ...prev,
          options: {
            ...prev.options,
            shippingPrice: standardPrice,
            insuranceAmount,
          },
          totalAmount: newTotal,
        } : prev);
        await setDoc(
          doc(db, 'quotes', quote.id),
          {
            options: {
              ...(quote.options || {}),
              shippingPrice: standardPrice,
              insuranceAmount,
            },
            totalAmount: newTotal,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
        queryClient.invalidateQueries({ queryKey: ['quotes'] });
      } catch (e) {
        if (!cancelled) {
          hasAutoAppliedMbeRef.current[quote.id] = false;
          toast.error((e as Error)?.message || 'Impossible de récupérer les tarifs MBE');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [useMbehubForShipping, quote?.id, quote?.lot?.dimensions, quote?.delivery?.address, quote?.client?.address, quote?.paymentStatus, quote?.totalWeight, isSaving, queryClient]);

  const REFUSAL_REASONS: { value: ClientRefusalReason; label: string }[] = [
    { value: 'tarif_trop_eleve', label: 'Tarif trop élevé' },
    { value: 'client_a_paye_concurrent', label: 'Client a payé un concurrent' },
    { value: 'plus_interesse', label: 'Plus intéressé' },
    { value: 'pas_de_reponse', label: 'Pas de réponse / Abandonné' },
    { value: 'autre', label: 'Autre' },
  ];

  const SURCHARGE_REASONS: { value: string; label: string }[] = [
    { value: 'dimensions_reelles', label: 'Dimensions réelles supérieures aux estimations' },
    { value: 'poids_reel', label: 'Poids réel supérieur aux estimations' },
    { value: 'emballage_supplementaire', label: 'Emballage supplémentaire' },
    { value: 'frais_douane', label: 'Frais de douane / dédouanement' },
    { value: 'assurance_complementaire', label: 'Assurance complémentaire' },
    { value: 'livraison_express', label: 'Livraison express' },
    { value: 'autre', label: 'Autre' },
  ];

  // Hook pour la gestion du groupement d'expédition
  const currentQuoteForGrouping = quote || foundQuote;
  const {
    suggestion: groupingSuggestion,
    currentGroup,
    isCreating: isCreatingGroup,
    createGroup,
    dissolveGroup,
  } = useShipmentGrouping({
    currentQuote: currentQuoteForGrouping || {
      id: '',
      reference: '',
      client: { id: '', name: '', email: '', phone: '', address: '' },
      lot: { id: '', number: '', description: '', dimensions: { length: 0, width: 0, height: 0, weight: 0, estimated: false }, value: 0, photos: [], auctionHouse: '' },
      status: 'new',
      paymentStatus: 'pending',
      totalAmount: 0,
      options: { insurance: false, express: false },
      paymentLinks: [],
      messages: [],
      verificationIssues: [],
      timeline: [],
      internalNotes: [],
      auctionHouseComments: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    saasAccountId: quote?.clientId || foundQuote?.clientId || '',
    onGroupCreated: (group) => {
      console.log('[QuoteDetail] Groupe créé:', group.id);
      toast.success(`Groupement créé: ${group.id}`);
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
    onGroupDeleted: () => {
      console.log('[QuoteDetail] Groupe dissous');
      toast.success('Groupement dissous');
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });

  const [bordereauProcessingTriggered, setBordereauProcessingTriggered] = useState(false);
  const [bordereauPollingActive, setBordereauPollingActive] = useState(false);
  const [bordereauPollingTimedOut, setBordereauPollingTimedOut] = useState(false);
  const [bordereauPollingIsRetry, setBordereauPollingIsRetry] = useState(false);
  const bordereauPollingInitialTimelineRef = useRef<number>(0);
  const lastResyncTimeRef = useRef<number>(0);
  const RESYNC_COOLDOWN_MS = 5000; // Évite la boucle Resync quand le polling rafraîchit toutes les 5s
  
  const triggerBordereauProcess = useCallback(async (forceRetry = false) => {
    if (!id) return;
    console.log('[QuoteDetail] 🚀 Lancement de l\'analyse OCR du bordereau...', { devisId: id, forceRetry });
    try {
      setBordereauPollingTimedOut(false);
      setBordereauProcessingTriggered(true);
      const res = await authenticatedFetch(`/api/devis/${id}/process-bordereau-from-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRetry }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        console.log('[QuoteDetail] ✅ OCR déclenché — voir les logs serveur (terminal) pour le suivi étape par étape', data);
        if (data.skipped && data.typeformDisabled) {
          // Typeform désactivé en dev — ne pas boucler, pas d'erreur
          queryClient.invalidateQueries({ queryKey: ['quotes'] });
          return;
        }
        if (data.alreadyProcessed && (data.lotsCount ?? 0) > 0 && !forceRetry) {
          // Vraiment déjà traité avec des lots (et pas une réanalyse) → rafraîchir et ne pas relancer
          queryClient.invalidateQueries({ queryKey: ['quotes'] });
        } else {
          // OCR en cours ou complété avec 0 lots → lancer le polling
          if (!data.alreadyProcessed) {
            toast.info('Analyse du bordereau en cours...', { duration: 5000 });
          } else {
            toast.info('Relance de l\'analyse du bordereau...', { duration: 5000 });
          }
          setBordereauPollingActive(true);
          setBordereauPollingIsRetry(forceRetry);
          // Mémoriser la longueur du timeline pour détecter la fin de la réanalyse
          bordereauPollingInitialTimelineRef.current = (foundQuote?.timeline?.length ?? 0);
          queryClient.invalidateQueries({ queryKey: ['quotes'] });
        }
      } else {
        setBordereauProcessingTriggered(true);
        const errMsg = data?.error || 'Impossible de lancer l\'analyse du bordereau';
        console.warn('[QuoteDetail] Erreur process-bordereau-from-link:', errMsg);
        toast.error(errMsg);
      }
    } catch (e) {
      setBordereauProcessingTriggered(false);
      console.warn('[QuoteDetail] Échec déclenchement traitement bordereau:', e);
      toast.error('Connexion à l\'API impossible. Vérifiez votre connexion ou réessayez plus tard.');
    }
  }, [id, queryClient, foundQuote]);

  useEffect(() => {
    const q = foundQuote || quote;
    if (!id || !q || isLoading || bordereauProcessingTriggered) return;
    const ext = q as Quote & { bordereauLink?: string; bordereauId?: string; driveFileIdFromLink?: string };
    const hasBordereauSource = (ext.bordereauLink && typeof ext.bordereauLink === 'string') ||
      ext.bordereauId || ext.driveFileIdFromLink;
    if (!hasBordereauSource) return;
    if (import.meta.env.DEV && !ext.bordereauId && !ext.driveFileIdFromLink && ext.bordereauLink?.includes('typeform.com')) {
      return;
    }
    // Ne pas déclencher si des lots RÉELS sont déjà présents (pas le lot par défaut "Lot détecté")
    const hasRealLots = q.auctionSheet?.lots && q.auctionSheet.lots.length > 0 &&
      (q.auctionSheet.lots as Array<{ lotNumber?: string | null; description?: string }>).some(l =>
        l.lotNumber !== null || (l.description && l.description !== 'Lot détecté' && l.description !== 'Description non disponible')
      );
    if (hasRealLots) return;
    triggerBordereauProcess();
  }, [id, foundQuote?.id, quote?.id, isLoading, bordereauProcessingTriggered, triggerBordereauProcess]);

  // Polling: rafraîchir les données tant que l'analyse OCR est en cours et que les lots ne sont pas remplis
  useEffect(() => {
    if (!bordereauPollingActive || !id) return;
    const q = foundQuote || quote;
    const timelineLen = q?.timeline?.length ?? 0;
    const initialLen = bordereauPollingInitialTimelineRef.current;
    // Réanalyse : succès quand le timeline a une nouvelle entrée (Devis calculé, Lien généré)
    const timelineGrew = bordereauPollingIsRetry && timelineLen > initialLen;
    // Considérer comme réussi seulement si au moins un lot a un numéro ou une description réelle (pas le lot par défaut)
    const hasRealLots = q?.auctionSheet?.lots && q.auctionSheet.lots.length > 0 &&
      q.auctionSheet.lots.some((l: { lotNumber?: string | null; description?: string }) =>
        l.lotNumber !== null || (l.description && l.description !== 'Lot détecté' && l.description !== 'Description non disponible')
      );
    // En réanalyse, ne pas s'arrêter sur hasRealLots (le devis avait déjà des lots) — attendre que le timeline grandisse
    if (bordereauPollingIsRetry ? timelineGrew : hasRealLots) {
      setBordereauPollingActive(false);
      setBordereauPollingIsRetry(false);
      setBordereauPollingTimedOut(false);
      toast.success('Bordereau analysé avec succès !');
      return;
    }
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    }, 5000);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setBordereauPollingActive(false);
      setBordereauPollingIsRetry(false);
      setBordereauPollingTimedOut(true);
      toast.warning('L\'analyse a pris plus de temps que prévu. Cliquez sur « Relancer l\'analyse » pour réessayer.');
    }, 120000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [bordereauPollingActive, bordereauPollingIsRetry, id, foundQuote, quote, queryClient]);

  // Test de connectivité au backend au chargement
  useEffect(() => {
    const testBackendConnection = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/health`);
        if (response.ok) {
          const data = await response.json();
          console.log('[QuoteDetail] ✅ Backend connecté:', data);
        } else {
          console.warn('[QuoteDetail] ⚠️ Backend répond mais avec erreur:', response.status);
        }
      } catch (error) {
        console.error('[QuoteDetail] ❌ Backend non accessible:', error);
        toast.error('Backend non accessible. Vérifiez que le proxy est démarré sur le port 5174.', { duration: 10000 });
      }
    };
    testBackendConnection();
  }, []);

  // Charger les paiements SURCOUT pour afficher le bouton d'envoi
  useEffect(() => {
    const loadSurchargePaiements = async () => {
      if (!id) return;
      
      try {
        setIsLoadingSurcharges(true);
        const paiements = await getPaiements(id);
        // Filtrer uniquement les surcoûts non payés avec lien de paiement valide
        const surcharges = paiements.filter(
          (p) => p.type === 'SURCOUT' && p.status === 'PENDING'
            && !!((p as Record<string, unknown>).url || p.stripeCheckoutUrl)
        );
        setSurchargePaiements(surcharges);
      } catch (error) {
        console.error('[QuoteDetail] Erreur chargement surcoûts:', error);
        // Ne pas afficher d'erreur toast pour éviter le spam, juste logger
      } finally {
        setIsLoadingSurcharges(false);
      }
    };

    loadSurchargePaiements();
  }, [id, paiementsRefreshKey]);

  // Charger si le paiement principal est payé quand on ouvre le popup de modification
  useEffect(() => {
    if (!isEditDialogOpen || !quote?.id) return;
    const checkPrincipalPaid = async () => {
      try {
        const paiements = await getPaiements(quote.id);
        const principalPaid = paiements.some(
          (p) => p.type === 'PRINCIPAL' && p.status === 'PAID'
        );
        setIsPrincipalPaidForEdit(principalPaid);
      } catch {
        setIsPrincipalPaidForEdit(false);
      }
    };
    checkPrincipalPaid();
  }, [isEditDialogOpen, quote?.id]);

  // IMPORTANT: la liste de devis (useQuotes) se met à jour après merge Firestore.
  // Sans resync, la page détail peut rester bloquée sur l'ancien état (bordereau invisible).
  // MAIS: Ne pas écraser les modifications locales en cours de sauvegarde
  // Cooldown: évite le spam "Resync" quand le polling (bordereauPollingActive) invalide toutes les 5s
  useEffect(() => {
    if (!foundQuote) return;
    
    // Ne pas mettre à jour si on est en train de sauvegarder (pour éviter d'écraser les modifications)
    if (isSaving) {
      console.log('[QuoteDetail] ⏸️  Resync ignoré (sauvegarde en cours)');
      return;
    }

    // Cooldown pour éviter la boucle infinie quand le backend ne renvoie rien (OCR cassé)
    const now = Date.now();
    if (lastResyncTimeRef.current > 0 && now - lastResyncTimeRef.current < RESYNC_COOLDOWN_MS) {
      return; // Resync récent, skip silencieusement
    }
    
    // Ne pas écraser les modifications pendant 4 secondes après la sauvegarde
    // pour laisser le temps à mergeEnhancementsIntoQuotes de récupérer les champs modifiés depuis Firestore
    if (lastSaveTime && Date.now() - lastSaveTime < 4000) {
      console.log('[QuoteDetail] ⏸️  Resync ignoré (sauvegarde récente, attente de la fusion Firestore)');
      return;
    }
    
    // Si on a un quote local avec des modifications récentes, vérifier que foundQuote contient bien ces modifications
    // avant de mettre à jour le state (pour éviter d'écraser les modifications avec les données Google Sheets)
    if (quote && lastSaveTime && Date.now() - lastSaveTime < 5000) {
      // Vérifier que foundQuote contient les champs modifiés depuis Firestore
      // Si foundQuote a les mêmes valeurs que quote pour les champs modifiés, c'est bon
      // Sinon, attendre encore un peu
      const emailMatches = (quote?.client?.email || '') === (foundQuote?.client?.email || '');
      const nameMatches = (quote?.client?.name || '') === (foundQuote?.client?.name || '');
      const descriptionMatches = (quote?.lot?.description || '') === (foundQuote?.lot?.description || '');
      
      // Si les champs modifiés ne correspondent pas, foundQuote n'a pas encore les modifications
      // ou les modifications ont été écrasées par Google Sheets - ne pas mettre à jour
      if (!emailMatches || !nameMatches || !descriptionMatches) {
        console.log('[QuoteDetail] ⚠️  Champs modifiés détectés dans quote local mais absents dans foundQuote, attente...', {
          localEmail: quote?.client?.email || '',
          foundEmail: foundQuote?.client?.email || '',
          emailMatches,
          localName: quote?.client?.name || '',
          foundName: foundQuote?.client?.name || '',
          nameMatches,
          localDescription: quote?.lot?.description?.substring(0, 30) || '',
          foundDescription: foundQuote?.lot?.description?.substring(0, 30) || '',
          descriptionMatches,
        });
        return;
      }
    }
    
    lastResyncTimeRef.current = now;
    console.log('[QuoteDetail] Resync du devis:', {
      quoteId: foundQuote.id,
      paymentLinksCount: foundQuote.paymentLinks?.length || 0,
      paymentLinks: foundQuote.paymentLinks,
      timelineCount: foundQuote.timeline?.length || 0,
      timeline: foundQuote.timeline,
      bordereauNumber: foundQuote.auctionSheet?.bordereauNumber,
      hasAuctionSheet: !!foundQuote.auctionSheet,
      clientEmail: foundQuote.client.email,
      clientName: foundQuote.client.name,
    });
    
    // On resync le devis complet (incluant lot enrichi depuis Firestore et l'historique)
    // IMPORTANT: Toujours utiliser foundQuote qui contient les données fusionnées depuis Firestore
    // mergeEnhancementsIntoQuotes a déjà appliqué les champs modifiés avec priorité sur Google Sheets
    setQuote(foundQuote);
    setAuctionSheetAnalysis((prev) => {
      if (prev) return prev;
      if (!foundQuote.auctionSheet) return prev;
      return {
        auctionHouse: foundQuote.auctionSheet.auctionHouse,
        auctionDate: foundQuote.auctionSheet.auctionDate,
        lots: (foundQuote.auctionSheet.lots || []).map((l) => ({
          lotNumber: l.lotNumber,
          description: l.description,
          estimatedDimensions: l.estimatedDimensions,
          value: l.value,
        })),
        totalLots: foundQuote.auctionSheet.totalLots,
        totalObjects: foundQuote.auctionSheet.totalObjects,
        recommendedCarton: foundQuote.auctionSheet.recommendedCarton,
        bordereauNumber: foundQuote.auctionSheet.bordereauNumber,
        rawText: foundQuote.auctionSheet.rawText,
      };
    });
  }, [foundQuote?.id, foundQuote?.auctionSheet, foundQuote?.options?.packagingPrice, foundQuote?.options?.shippingPrice, foundQuote?.paymentLinks, foundQuote?.timeline, foundQuote?.client?.email, foundQuote?.client?.name, isSaving, lastSaveTime]);

  // NE PLUS générer de lien au simple chargement de la page.
  // Le lien est généré uniquement : 1) après analyse OCR (backend), 2) après handleAuctionSheetAnalysis (upload manuel).

  // FORCER l'application des dimensions INTERNES du carton (dimensions du colis)
  // Ce useEffect garantit que les dimensions du carton sont TOUJOURS affichées
  // Supporte inner/required OU inner_length, inner_width, inner_height
  useEffect(() => {
    if (!quote?.auctionSheet?.recommendedCarton) return;
    
    const c = quote.auctionSheet.recommendedCarton;
    // PRIORITÉ: inner/required (format objet) puis inner_length/inner_width/inner_height (format plat)
    const cartonDims = c.inner || c.required || (
      (c.inner_length != null || c.inner_width != null || c.inner_height != null)
        ? { length: c.inner_length, width: c.inner_width, height: c.inner_height }
        : null
    );
    if (!cartonDims) {
      console.log('[QuoteDetail] Aucune dimension de carton disponible:', quote.auctionSheet.recommendedCarton);
      return;
    }
    
    const currentDims = quote.lot?.dimensions || { length: 0, width: 0, height: 0, weight: 0 };
    const cartonLength = Number(cartonDims.length ?? c.inner_length ?? 0);
    const cartonWidth = Number(cartonDims.width ?? c.inner_width ?? 0);
    const cartonHeight = Number(cartonDims.height ?? c.inner_height ?? 0);
    
    // Vérifier si les dimensions actuelles ne correspondent PAS aux dimensions du carton
    const needsUpdate = 
      currentDims.length !== cartonLength ||
      currentDims.width !== cartonWidth ||
      currentDims.height !== cartonHeight;
    
    // TOUJOURS appliquer les dimensions du carton si disponibles
    if (needsUpdate) {
      console.log('[QuoteDetail] Application forcée des dimensions INTERNES du carton:', {
        carton: quote.auctionSheet.recommendedCarton.ref,
        inner: quote.auctionSheet.recommendedCarton.inner,
        required: quote.auctionSheet.recommendedCarton.required,
        dimensionsUtilisees: { length: cartonLength, width: cartonWidth, height: cartonHeight },
        anciennes: { length: currentDims.length, width: currentDims.width, height: currentDims.height }
      });
      
      setQuote(prev => ({
        ...prev,
        lot: {
          ...prev.lot,
          dimensions: {
            length: isNaN(cartonLength) ? (prev.lot.dimensions?.length || 0) : cartonLength,
            width: isNaN(cartonWidth) ? (prev.lot.dimensions?.width || 0) : cartonWidth,
            height: isNaN(cartonHeight) ? (prev.lot.dimensions?.height || 0) : cartonHeight,
            // Conserver le poids existant (le carton n'a pas de poids)
            weight: prev.lot.dimensions?.weight || 0,
            estimated: true,
          },
        },
      }));
    }
  }, [quote?.auctionSheet?.recommendedCarton, quote?.lot?.dimensions?.length, quote?.lot?.dimensions?.width, quote?.lot?.dimensions?.height]);

  // Recalculer les prix (emballage et expédition) si nécessaire
  useEffect(() => {
    if (!quote) return;
    
    // Recalculer les prix si nécessaire
    const recalculatePricing = async () => {
      try {
        // 1. Recalculer le prix d'emballage si carton disponible mais prix manquant ou 0
        // FORCER le recalcul si le prix est 0 ou manquant, même s'il existe déjà dans Firestore
        if (quote.auctionSheet?.recommendedCarton && (!quote.options.packagingPrice || quote.options.packagingPrice === 0)) {
          const carton = quote.auctionSheet.recommendedCarton;
          // Utiliser ref pour la recherche, ou label si ref est vide
          const searchRef = carton.ref || carton.label || '';
          console.log(`[QuoteDetail] 🔄 Recalcul prix emballage (useEffect):`, {
            ref: carton.ref,
            label: carton.label,
            searchRef,
            inner: carton.inner,
            required: carton.required,
            currentPrice: quote.options.packagingPrice,
          });
          
          if (!searchRef) {
            console.warn(`[QuoteDetail] ⚠️  Aucune référence de carton disponible pour recalcul (useEffect)`);
          } else {
            // Passer aussi les dimensions du carton pour recherche par dimensions si référence non trouvée
            const cartonDims = carton.inner || carton.required;
            const packagingPrice = await getCartonPrice(
              searchRef,
              cartonDims ? { length: cartonDims.length, width: cartonDims.width, height: cartonDims.height } : undefined
            );
          if (packagingPrice > 0) {
            setQuote(prev => ({
              ...prev,
              options: {
                ...prev.options,
                packagingPrice: packagingPrice,
              },
            }));
            
            // Sauvegarder dans Firestore dans options.packagingPrice
            try {
              await setDoc(
                doc(db, "quotes", quote.id),
                {
                  options: {
                    packagingPrice: packagingPrice,
                  },
                  updatedAt: Timestamp.now(),
                },
                { merge: true }
              );
                console.log(`[QuoteDetail] ✅ Prix emballage recalculé et sauvegardé (useEffect): ${packagingPrice}€ pour "${searchRef}"`);
            } catch (e) {
                console.warn("[QuoteDetail] ❌ Erreur sauvegarde packagingPrice (useEffect):", e);
              }
            } else {
              console.warn(`[QuoteDetail] ⚠️  Prix emballage non trouvé (useEffect) pour "${searchRef}"`);
              console.warn(`[QuoteDetail] ⚠️  Dimensions utilisées:`, cartonDims);
            }
          }
        } else if (quote.auctionSheet?.recommendedCarton && quote.options.packagingPrice && quote.options.packagingPrice > 0) {
          // Même si le prix existe, vérifier qu'il correspond bien au carton
          // (pour détecter les cas où le prix a été mal calculé)
          const carton = quote.auctionSheet.recommendedCarton;
          const searchRef = carton.ref || carton.label || '';
          console.log(`[QuoteDetail] ✅ Prix emballage existant: ${quote.options.packagingPrice}€ pour "${searchRef}"`);
        }
        
        // 2. Recalculer le prix d'expédition (grille tarifaire uniquement - si MBE Hub, pas de recalcul auto)
        const useMbehub = mbehubStatus?.shippingCalculationMethod === 'mbehub';
        const mbehubQueryEnabled = !!featuresData?.planId && (featuresData.planId === 'pro' || featuresData.planId === 'ultra');
        const waitingForMbehub = mbehubQueryEnabled && mbehubStatus === undefined;
        const shouldUseGrille = !useMbehub && !waitingForMbehub;
        if (shouldUseGrille && quote.lot.dimensions && quote.delivery?.address) {
          const hasDimensions = quote.lot.dimensions.length > 0 && quote.lot.dimensions.width > 0 && quote.lot.dimensions.height > 0;
          if (hasDimensions) {
            // Extraire le code pays depuis plusieurs sources
            let deliveryCountry = quote.delivery?.address?.country;
            const addressLine = quote.delivery?.address?.line1 || quote.client.address || "";
            
            // Log pour diagnostic
            console.log(`[QuoteDetail] 🚚 SHIPPING INPUT (useEffect):`, {
              deliveryCountry,
              addressLine,
              deliveryMode: quote.delivery?.mode,
              fullDelivery: quote.delivery,
            });
            
            // Si pas de pays, essayer de le détecter depuis l'adresse
            if (!deliveryCountry && addressLine) {
              // Chercher un code pays dans l'adresse (2 lettres majuscules)
              const countryMatch = addressLine.match(/\b([A-Z]{2})\b/);
              if (countryMatch) {
                deliveryCountry = countryMatch[1];
                console.log(`[QuoteDetail] ✅ Pays détecté depuis l'adresse: ${deliveryCountry}`);
              }
            }
            
            // Fallback temporaire DEV : si toujours pas de pays et que l'adresse contient "Nice" ou "France", utiliser FR
            if (!deliveryCountry) {
              const addressLower = addressLine.toLowerCase();
              if (addressLower.includes("nice") || addressLower.includes("france") || addressLower.includes("paris")) {
                deliveryCountry = "FR";
                console.log(`[QuoteDetail] ⚠️ FALLBACK DEV: Pays détecté depuis contexte (Nice/Paris/France) -> FR`);
              }
            }
            
            let countryCode = "";
            console.log(`[QuoteDetail] 🔍 Extraction code pays (useEffect) - deliveryCountry="${deliveryCountry}", addressLine="${addressLine}"`);
            
            if (deliveryCountry) {
              if (deliveryCountry.match(/^[A-Z]{2}$/)) {
                countryCode = deliveryCountry.toUpperCase();
                console.log(`[QuoteDetail] ✅ Code pays trouvé (format 2 lettres): ${countryCode}`);
              } else {
                const countryMap: Record<string, string> = {
                  "france": "FR",
                  "belgique": "BE",
                  "belgium": "BE",
                  "suisse": "CH",
                  "switzerland": "CH",
                  "allemagne": "DE",
                  "germany": "DE",
                  "espagne": "ES",
                  "spain": "ES",
                  "italie": "IT",
                  "italy": "IT",
                  "royaume-uni": "GB",
                  "united kingdom": "GB",
                  "uk": "GB",
                  "portugal": "PT",
                  "autriche": "AT",
                  "austria": "AT",
                  "danemark": "DK",
                  "denmark": "DK",
                  "irlande": "IE",
                  "ireland": "IE",
                  "suède": "SE",
                  "sweden": "SE",
                  "finlande": "FI",
                  "finland": "FI",
                  "pologne": "PL",
                  "poland": "PL",
                  "république tchèque": "CZ",
                  "czech republic": "CZ",
                  "hongrie": "HU",
                  "hungary": "HU",
                  "brésil": "BR",
                  "brazil": "BR",
                  "argentine": "AR",
                  "argentina": "AR",
                  "chili": "CL",
                  "chile": "CL",
                  "colombie": "CO",
                  "colombia": "CO",
                  "pérou": "PE",
                  "peru": "PE",
                  "usa": "US",
                  "united states": "US",
                  "états-unis": "US",
                  "canada": "CA",
                  "mexique": "MX",
                  "mexico": "MX",
                };
                const countryLower = deliveryCountry.toLowerCase().trim();
                countryCode = countryMap[countryLower] || "";
                if (countryCode) {
                  console.log(`[QuoteDetail] ✅ Code pays trouvé via mapping: "${deliveryCountry}" -> ${countryCode}`);
                } else {
                  console.warn(`[QuoteDetail] ⚠️ Code pays non trouvé dans le mapping pour: "${deliveryCountry}"`);
                }
              }
            }
            
            if (!countryCode && addressLine) {
              const countryMatch = addressLine.match(/\b([A-Z]{2})\b/);
              if (countryMatch) {
                countryCode = countryMatch[1];
                console.log(`[QuoteDetail] ✅ Code pays trouvé dans l'adresse: ${countryCode}`);
              } else {
                console.warn(`[QuoteDetail] ⚠️ Aucun code pays trouvé dans l'adresse: "${addressLine}"`);
              }
            }
            
            if (!countryCode) {
              console.error(`[QuoteDetail] ❌ AUCUN CODE PAYS TROUVÉ (useEffect) - deliveryCountry="${deliveryCountry}", addressLine="${addressLine}"`);
            }
            
            if (countryCode) {
              const dimensions = quote.lot.dimensions;
              // Recalculer le prix d'expédition si les dimensions sont valides
              if (dimensions && dimensions.length > 0 && dimensions.width > 0 && dimensions.height > 0) {
                console.log(`[QuoteDetail] 📐 Dimensions du colis (useEffect): L=${dimensions.length}cm × l=${dimensions.width}cm × H=${dimensions.height}cm`);
                
                const volumetricWeight = calculateVolumetricWeight(
                  dimensions.length,
                  dimensions.width,
                  dimensions.height
                );
                console.log(`[QuoteDetail] ⚖️ Poids volumétrique calculé (useEffect): ${volumetricWeight}kg`);
                
                // TOUS les colis sont en EXPRESS
                const isExpress = true;
                console.log(`[QuoteDetail] 🔄 Calcul prix expédition (useEffect): pays=${countryCode}, poidsVol=${volumetricWeight}kg, express=${isExpress}`);
                
                const newShippingPrice = await calculateShippingPrice(countryCode, volumetricWeight, isExpress);
                
                if (newShippingPrice > 0) {
                  // Vérifier si le prix a changé avant de mettre à jour
                  const currentShippingPrice = quote.options?.shippingPrice || 0;
                  if (Math.abs(newShippingPrice - currentShippingPrice) > 0.01) {
                    console.log(`[QuoteDetail] ✅ Prix expédition recalculé (useEffect): ${currentShippingPrice}€ → ${newShippingPrice}€`);
                    setQuote(prev => ({
                      ...prev,
                      options: {
                        ...prev.options,
                        shippingPrice: newShippingPrice,
                      },
                    }));
                    
                    // Sauvegarder dans Firestore dans options.shippingPrice
                    try {
                      await setDoc(
                        doc(db, "quotes", quote.id),
                        {
                          options: {
                            shippingPrice: newShippingPrice,
                          },
                          updatedAt: Timestamp.now(),
                        },
                        { merge: true }
                      );
                      console.log(`[QuoteDetail] ✅ Prix expédition sauvegardé dans Firestore: ${newShippingPrice}€`);
                      // Note: La génération auto du lien de paiement est gérée uniquement par le useEffect au chargement
                      // pour éviter plusieurs appels simultanés (triple génération)
                    } catch (e) {
                      console.error("[QuoteDetail] ❌ Erreur sauvegarde shippingPrice:", e);
                    }
                  } else {
                    console.log(`[QuoteDetail] ℹ️ Prix expédition inchangé: ${newShippingPrice}€`);
                  }
                } else {
                  console.error(`[QuoteDetail] ❌ Prix expédition = 0€ (useEffect) - pays=${countryCode}, poidsVol=${volumetricWeight}kg`);
                }
              }
            } else {
              console.error(`[QuoteDetail] ❌ Code pays manquant (useEffect) - deliveryCountry="${deliveryCountry}", addressLine="${addressLine}"`);
            }
          }
        }
      } catch (e) {
        console.warn("[pricing] Erreur recalcul pricing:", e);
      }
    };
    
    recalculatePricing();
  }, [
    quote?.id,
    quote?.auctionSheet?.recommendedCarton?.ref,
    quote?.auctionSheet?.recommendedCarton?.label,
    quote?.lot?.dimensions?.length,
    quote?.lot?.dimensions?.width,
    quote?.lot?.dimensions?.height,
    quote?.delivery?.address?.country,
    quote?.options?.packagingPrice,
    quote?.options?.shippingPrice,
    mbehubStatus?.shippingCalculationMethod,
    featuresData?.planId,
  ]);

  // Recalculer automatiquement le totalAmount quand les prix changent
  useEffect(() => {
    if (!quote) return;
    
    // Utiliser le prix du carton depuis auctionSheet.recommendedCarton si disponible
    // Sinon utiliser quote.options.packagingPrice comme fallback
    const cartonPrice = quote.auctionSheet?.recommendedCarton?.price || 
                        (quote.auctionSheet?.recommendedCarton as any)?.priceTTC || 
                        null;
    const packagingPrice = cartonPrice !== null ? cartonPrice : (quote.options.packagingPrice || 0);
    
    const shippingPrice = quote.options.shippingPrice || 0;
    const insuranceAmount = computeInsuranceAmount(
      quote.declaredValue ?? quote.lot?.value ?? 0,
      quote.options?.insurance,
      quote.options?.insuranceAmount
    );
    const newTotal = packagingPrice + shippingPrice + insuranceAmount;
    
    // Ne mettre à jour que si le total a changé ET que le packagingPrice utilisé correspond au carton sélectionné
    // Cela évite d'écraser avec l'ancien prix depuis Firestore
    if (quote.totalAmount !== newTotal) {
      // Si on utilise le prix du carton et qu'il diffère de quote.options.packagingPrice,
      // c'est qu'on doit mettre à jour quote.options.packagingPrice aussi
      const shouldUpdatePackagingPrice = cartonPrice !== null && cartonPrice !== quote.options.packagingPrice;
      
      console.log('[QuoteDetail] 🔄 Recalcul totalAmount (useEffect):', {
        packagingPrice,
        cartonPrice,
        quotePackagingPrice: quote.options.packagingPrice,
        shippingPrice,
        insuranceAmount,
        oldTotal: quote.totalAmount,
        newTotal,
        shouldUpdatePackagingPrice,
      });
      
      setQuote(prev => ({
        ...prev,
        totalAmount: newTotal,
        options: {
          ...prev.options,
          packagingPrice: shouldUpdatePackagingPrice ? cartonPrice : prev.options.packagingPrice,
          insuranceAmount,
        },
      }));
      
      // Sauvegarder dans Firestore
      const updateData: any = {
        totalAmount: newTotal,
        options: {
          insuranceAmount,
          insurance: quote.options?.insurance || false,
        },
        updatedAt: Timestamp.now(),
      };
      
      // Si on doit mettre à jour le packagingPrice, l'inclure dans la sauvegarde
      if (shouldUpdatePackagingPrice) {
        updateData.options.packagingPrice = cartonPrice;
      }
      
      setDoc(
        doc(db, "quotes", quote.id),
        updateData,
        { merge: true }
      ).catch(e => {
        console.warn("[QuoteDetail] ❌ Erreur sauvegarde totalAmount (useEffect):", e);
      });
    }
  }, [
    quote?.options?.packagingPrice, 
    quote?.options?.shippingPrice, 
    quote?.options?.insuranceAmount, 
    quote?.options?.insurance, 
    quote?.lot?.value, 
    quote?.auctionSheet?.recommendedCarton?.price,
    (quote?.auctionSheet?.recommendedCarton as any)?.priceTTC,
    quote?.totalAmount,
    computeInsuranceAmount, 
    quote?.id
  ]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="Chargement du devis..." />
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Chargement des données Google Sheets
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="Erreur de chargement" />
        <div className="flex-1 flex items-center justify-center text-destructive">
          Impossible de charger les données Google Sheets
        </div>
      </div>
    );
  }

  const handleVerifyQuote = async () => {
    if (!quote) return;
    
    try {
      // Récupérer le timeline existant depuis Firestore
      const quoteDoc = await getDoc(doc(db, 'quotes', quote.id));
      const existingData = quoteDoc.data();
      const existingTimeline = existingData?.timeline || quote.timeline || [];

      // Créer un nouvel événement "vérifié"
      const timelineEvent = createTimelineEvent(
        'verified',
        getStatusDescription('verified')
      );

      // Convertir l'événement pour Firestore
      const firestoreEvent = timelineEventToFirestore(timelineEvent);

      // Éviter les doublons (même description et statut dans les 5 dernières minutes)
      const fiveMinutesAgo = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
      const isDuplicate = existingTimeline.some(
        (e: any) =>
          e.status === 'verified' &&
          e.description === timelineEvent.description &&
          (e.date?.toMillis ? e.date.toMillis() : new Date(e.date).getTime()) > fiveMinutesAgo.toMillis()
      );

      const updatedTimeline = isDuplicate 
        ? existingTimeline 
        : [...existingTimeline, firestoreEvent];

      // Nettoyer le timeline pour s'assurer qu'il n'y a pas de valeurs undefined
      // Les événements existants peuvent avoir des champs undefined, donc on les nettoie aussi
      const cleanedTimeline = updatedTimeline.map((event: any) => {
        // Si l'événement vient déjà de Firestore, il peut avoir des champs undefined
        // On le nettoie en créant un nouvel objet avec seulement les champs définis
        const cleaned: any = {
          id: event.id,
          date: event.date,
          status: event.status,
          description: event.description,
        };
        // Ajouter user seulement s'il est défini et non null
        if (event.user !== undefined && event.user !== null && event.user !== '') {
          cleaned.user = event.user;
        }
        return cleaned;
      });

      // Construire l'objet de mise à jour et nettoyer les valeurs undefined
      const updateData = cleanForFirestore({
        status: 'verified',
        timeline: cleanedTimeline,
        updatedAt: Timestamp.now(),
      });

      // Mettre à jour le devis avec le nouveau statut et le timeline
      await setDoc(
        doc(db, 'quotes', quote.id),
        updateData,
        { merge: true }
      );

      // Mettre à jour le state local
      const quoteWithTimeline = addTimelineEvent(quote, timelineEvent);
      setQuote({
        ...quoteWithTimeline,
        status: 'verified',
      });

      // Invalider le cache React Query
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      
      toast.success('Devis marqué comme vérifié');
    } catch (error) {
      console.error('[VerifyQuote] Erreur:', error);
      toast.error('Erreur lors de la vérification du devis');
    }
  };

  const handleSendEmailWithTwoLinks = async () => {
    if (!quote) return;
    const clientEmailRaw = quote.client?.email || quote.delivery?.contact?.email;
    if (!clientEmailRaw?.trim()) {
      toast.error('Email client manquant');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clientEmailRaw.trim())) {
      toast.error("Format d'email invalide");
      return;
    }
    try {
      toast.info('Création des 2 liens de paiement...');
      const prepRes = await authenticatedFetch('/api/mbehub/prepare-quote-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote.id }),
      });
      const prepData = await prepRes.json();
      if (!prepRes.ok || !prepData.success) {
        throw new Error(prepData.error || 'Erreur lors de la création des liens');
      }
      const newLinks: { url: string; amount: number; type: string; status: string }[] = [];
      if (prepData.standard?.url) {
        newLinks.push({ url: prepData.standard.url, amount: prepData.standard.price ?? 0, type: 'PRINCIPAL_STANDARD', status: 'pending' });
      }
      if (prepData.express?.url) {
        newLinks.push({ url: prepData.express.url, amount: prepData.express.price ?? 0, type: 'PRINCIPAL_EXPRESS', status: 'pending' });
      }
      const quoteToSend = { ...quote, paymentLinks: [...(quote.paymentLinks || []), ...newLinks] };
      const sendRes = await authenticatedFetch('/api/send-quote-email', {
        method: 'POST',
        body: JSON.stringify({ quote: quoteToSend, customMessage: customMsgText.trim() || undefined }),
      });
      if (!sendRes.ok) {
        const errData = await sendRes.json().catch(() => ({}));
        throw new Error(errData.error || `Erreur ${sendRes.status}`);
      }
      toast.success('Devis envoyé avec 2 liens (Standard + Express)');
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      setPaiementsRefreshKey((k) => k + 1);
    } catch (e: unknown) {
      console.error('[Email] Erreur envoi 2 liens:', e);
      toast.error((e as Error)?.message || 'Erreur');
    }
  };

  const handleSendEmail = async () => {
    if (!quote) return;
    
    // Validation de l'email client
    const clientEmailRaw = quote.client?.email || quote.delivery?.contact?.email;
    if (!clientEmailRaw) {
      toast.error('Email client manquant');
      return;
    }

    const clientEmail = clientEmailRaw.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clientEmail)) {
      toast.error(`Format d'email invalide: ${clientEmail}`);
      return;
    }

    console.log('[Email] Début envoi email à:', clientEmail);
    console.log('[Email] Quote ID:', quote.id);
    
    try {
      const apiUrl = '/api/send-quote-email';
      console.log('[Email] Appel API:', apiUrl);
      
      // Utiliser authenticatedFetch pour router correctement vers le backend Railway
      const response = await authenticatedFetch(apiUrl, {
        method: 'POST',
        body: JSON.stringify({ quote, customMessage: customMsgText.trim() || undefined }),
      });

      console.log('[Email] Réponse status:', response.status, response.statusText);
      console.log('[Email] Réponse headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        // Essayer de parser l'erreur comme JSON
        let error;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try {
            error = await response.json();
          } catch (e) {
            const text = await response.text();
            console.error('[Email] Réponse non-JSON:', text);
            toast.error(`Erreur serveur (${response.status}): ${text.substring(0, 100)}`);
            return;
          }
        } else {
          const text = await response.text();
          console.error('[Email] Réponse HTML/text:', text.substring(0, 200));
          toast.error(`Erreur serveur (${response.status}). Vérifiez que le proxy backend est démarré sur le port 5174.`);
          return;
        }
        
        // Afficher le hint si disponible
        if (error.hint) {
          toast.error(error.hint, { duration: 8000 });
        } else {
          toast.error(error.error || `Erreur serveur (${response.status})`);
        }
        console.error('[Email] Erreur serveur:', error);
        return;
      }

      const result = await response.json();
      console.log('[Email] ✅ Email envoyé avec succès:', result);
      
      // Vérifier si un lien de paiement actif existe
      const hasActivePaymentLink = quote.paymentLinks && quote.paymentLinks.some(
        link => link && link.status === 'active'
      );
      
      // Si un lien de paiement actif existe, mettre à jour le statut
      if (hasActivePaymentLink) {
        console.log('[Email] Lien de paiement actif détecté, mise à jour du statut...');
        
        // Récupérer le timeline existant depuis Firestore
        const quoteDoc = await getDoc(doc(db, 'quotes', quote.id));
        const existingData = quoteDoc.data();
        const existingTimeline = existingData?.timeline || quote.timeline || [];
        
        // Ajouter un événement à l'historique
        const timelineEvent = createTimelineEvent(
          'awaiting_payment',
          'Devis envoyé avec lien de paiement au client'
        );
        
        // Nettoyer le timeline existant (filtrer les événements avec dates invalides)
        const cleanedExistingTimeline = existingTimeline.filter((event: any) => {
          if (!event.date) return false;
          const date = event.date?.toDate ? event.date.toDate() : new Date(event.date);
          return !isNaN(date.getTime());
        });
        
        // Ajouter le nouvel événement
        const updatedTimeline = [...cleanedExistingTimeline, timelineEvent];
        
        const updatedQuote: Quote = {
          ...quote,
          status: 'awaiting_payment',
          paymentStatus: 'pending',
          timeline: updatedTimeline,
          updatedAt: new Date(),
        };
        
        // Sauvegarder dans Firestore
        try {
          const timelineForFirestore = updatedTimeline.map(timelineEventToFirestore);
          
          await setDoc(
            doc(db, "quotes", quote.id),
            {
              status: 'awaiting_payment',
              paymentStatus: 'pending',
              timeline: timelineForFirestore,
              updatedAt: Timestamp.now(),
            },
            { merge: true }
          );
          
          // Mettre à jour le state local
          setQuote(updatedQuote);
          
          // Invalider le cache React Query pour forcer le rechargement
          queryClient.invalidateQueries({ queryKey: ['quotes'] });
          
          console.log('[Email] ✅ Statut mis à jour: awaiting_payment / pending');
          syncQuoteToBilan();
          toast.success(`Email envoyé avec succès à ${clientEmail}. Statut: En attente de paiement`);
        } catch (firestoreError) {
          console.error('[Email] Erreur lors de la mise à jour du statut:', firestoreError);
          toast.success(`Email envoyé avec succès à ${clientEmail}`);
          toast.error('Erreur lors de la mise à jour du statut du devis');
        }
      } else {
        // Pas de lien de paiement, mais ajouter quand même un événement à l'historique
        console.log('[Email] Pas de lien de paiement, ajout événement historique...');
        
        try {
          // Récupérer le timeline existant depuis Firestore
          const quoteDoc = await getDoc(doc(db, 'quotes', quote.id));
          const existingData = quoteDoc.data();
          const existingTimeline = existingData?.timeline || quote.timeline || [];
          
          // Ajouter un événement à l'historique
          const timelineEvent = createTimelineEvent(
            quote.status || 'to_verify',
            `Devis envoyé au client (${clientEmail})`
          );
          
          // Nettoyer le timeline existant (filtrer les événements avec dates invalides)
          const cleanedExistingTimeline = existingTimeline.filter((event: any) => {
            if (!event.date) return false;
            const date = event.date?.toDate ? event.date.toDate() : new Date(event.date);
            return !isNaN(date.getTime());
          });
          
          // Ajouter le nouvel événement
          const updatedTimeline = [...cleanedExistingTimeline, timelineEvent];
          
          const updatedQuote: Quote = {
            ...quote,
            timeline: updatedTimeline,
            updatedAt: new Date(),
          };
          
          // Sauvegarder dans Firestore
          const timelineForFirestore = updatedTimeline.map(timelineEventToFirestore);
          
          await setDoc(
            doc(db, "quotes", quote.id),
            {
              timeline: timelineForFirestore,
              updatedAt: Timestamp.now(),
            },
            { merge: true }
          );
          
          // Mettre à jour le state local
          setQuote(updatedQuote);
          syncQuoteToBilan();
          // Invalider le cache React Query pour forcer le rechargement
          queryClient.invalidateQueries({ queryKey: ['quotes'] });
          
          console.log('[Email] ✅ Événement ajouté à l\'historique');
          toast.success(`Email envoyé avec succès à ${clientEmail}`);
        } catch (firestoreError) {
          console.error('[Email] Erreur lors de l\'ajout à l\'historique:', firestoreError);
          toast.success(`Email envoyé avec succès à ${clientEmail}`);
        }
      }
    } catch (error) {
      console.error('[Email] ❌ Exception:', error);
      if (error instanceof TypeError && error.message.includes('fetch')) {
        toast.error('Impossible de contacter le serveur. Vérifiez que le proxy backend est démarré.');
      } else {
        toast.error(`Erreur lors de l'envoi de l'email: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      }
    }
  };

  const handleSendSurchargeEmail = async (surchargePaiement: Paiement, reasonDescription?: string) => {
    if (!quote) return;
    setIsSendingSurchargeEmail(true);
    
    // Validation de l'email client
    const clientEmailRaw = quote.client?.email || quote.delivery?.contact?.email;
    if (!clientEmailRaw) {
      toast.error('Email client manquant');
      setIsSendingSurchargeEmail(false);
      return;
    }

    const clientEmail = clientEmailRaw.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clientEmail)) {
      toast.error(`Format d'email invalide: ${clientEmail}`);
      setIsSendingSurchargeEmail(false);
      return;
    }

    console.log('[Surcharge Email] Début envoi email surcoût à:', clientEmail);
    console.log('[Surcharge Email] Paiement ID:', surchargePaiement.id);
    
    try {
      const apiUrl = '/api/send-surcharge-email';
      console.log('[Surcharge Email] Appel API:', apiUrl);
      
      // Utiliser authenticatedFetch pour router correctement vers le backend Railway
      // Le champ 'url' vient de Firestore, 'stripeCheckoutUrl' est le type TypeScript
      const paymentUrl = (surchargePaiement as any).url || surchargePaiement.stripeCheckoutUrl || '';
      
      if (!paymentUrl) {
        toast.error('URL de paiement manquante pour ce surcoût');
        setIsSendingSurchargeEmail(false);
        return;
      }
      
      const description = (reasonDescription && reasonDescription.trim()) || surchargePaiement.description || 'Surcoût supplémentaire';
      const response = await authenticatedFetch(apiUrl, {
        method: 'POST',
        body: JSON.stringify({ 
          quote,
          surchargePaiement: {
            id: surchargePaiement.id,
            amount: surchargePaiement.amount,
            description,
            url: paymentUrl,
          }
        }),
      });

      console.log('[Surcharge Email] Réponse status:', response.status, response.statusText);

      if (!response.ok) {
        // Essayer de parser l'erreur comme JSON
        let error;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try {
            error = await response.json();
          } catch (e) {
            const text = await response.text();
            console.error('[Surcharge Email] Réponse non-JSON:', text);
            toast.error(`Erreur serveur (${response.status}): ${text.substring(0, 100)}`);
            return;
          }
        } else {
          const text = await response.text();
          console.error('[Surcharge Email] Réponse HTML/text:', text.substring(0, 200));
          toast.error(`Erreur serveur (${response.status}). Vérifiez que le proxy backend est démarré sur le port 5174.`);
          return;
        }
        
        // Afficher le hint si disponible
        if (error.hint) {
          toast.error(error.hint, { duration: 8000 });
        } else {
          toast.error(error.error || `Erreur serveur (${response.status})`);
        }
        console.error('[Surcharge Email] Erreur serveur:', error);
        setIsSendingSurchargeEmail(false);
        return;
      }

      const result = await response.json();
      console.log('[Surcharge Email] ✅ Email envoyé avec succès:', result);
      
      // Ajouter un événement à l'historique
      try {
        const quoteDoc = await getDoc(doc(db, 'quotes', quote.id));
        const existingData = quoteDoc.data();
        const existingTimeline = existingData?.timeline || quote.timeline || [];
        
        const timelineEvent = createTimelineEvent(
          quote.status || 'awaiting_payment',
          `Email surcoût envoyé au client (${clientEmail}) - ${surchargePaiement.amount.toFixed(2)}€`
        );
        
        const cleanedExistingTimeline = existingTimeline.filter((event: any) => {
          if (!event.date) return false;
          const date = event.date?.toDate ? event.date.toDate() : new Date(event.date);
          return !isNaN(date.getTime());
        });
        
        const updatedTimeline = [...cleanedExistingTimeline, timelineEvent];
        const timelineForFirestore = updatedTimeline.map(timelineEventToFirestore);
        
        await setDoc(
          doc(db, "quotes", quote.id),
          {
            timeline: timelineForFirestore,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );
        
        setQuote(prev => prev ? {
          ...prev,
          timeline: updatedTimeline,
          updatedAt: new Date(),
        } : prev);
        
        queryClient.invalidateQueries({ queryKey: ['quotes'] });
      } catch (firestoreError) {
        console.error('[Surcharge Email] Erreur lors de la mise à jour du timeline:', firestoreError);
      }
      
      toast.success(`Email surcoût envoyé avec succès à ${clientEmail}`);
    } catch (error) {
      console.error('[Surcharge Email] Erreur:', error);
      toast.error('Erreur lors de l\'envoi de l\'email surcoût');
    } finally {
      setIsSendingSurchargeEmail(false);
    }
  };

  const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
  const toDate = (v: unknown): Date | null => {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
      return (v as { toDate: () => Date }).toDate();
    }
    try {
      const d = new Date(v as string | number);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };
  const safeQuoteData = quote || foundQuote;
  const updatedAtDate = toDate(safeQuoteData?.updatedAt);
  const reminderSentAtDate = toDate(safeQuoteData?.reminderSentAt);
  const canSendReminder =
    quote?.id &&
    safeQuoteData?.paymentStatus !== 'paid' &&
    safeQuoteData?.clientRefusalStatus !== 'client_refused' &&
    updatedAtDate &&
    Date.now() - updatedAtDate.getTime() > ONE_MONTH_MS;
  const canMarkAbandoned =
    quote?.id &&
    safeQuoteData?.paymentStatus !== 'paid' &&
    safeQuoteData?.clientRefusalStatus !== 'client_refused' &&
    reminderSentAtDate &&
    Date.now() - reminderSentAtDate.getTime() > ONE_MONTH_MS;
  const canMarkRefused =
    quote?.id &&
    safeQuoteData?.paymentStatus !== 'paid' &&
    safeQuoteData?.clientRefusalStatus !== 'client_refused';

  const canMarkPaidManually =
    quote?.id &&
    safeQuoteData?.paymentStatus !== 'paid' &&
    safeQuoteData?.clientRefusalStatus !== 'client_refused';

  const canUnmarkPaid =
    quote?.id &&
    safeQuoteData?.paymentStatus === 'paid' &&
    (safeQuoteData?.manualPaymentMethod === 'virement' || safeQuoteData?.manualPaymentMethod === 'cb_telephone');

  const syncQuoteToBilan = useCallback(async () => {
    if (!quote?.id) return;
    try {
      await authenticatedFetch(`/api/bilan/sync-quote/${quote.id}`, { method: 'POST' });
    } catch {
      /* ignoré */
    }
  }, [quote?.id]);

  const handleMarkRefused = async (reason: ClientRefusalReason, reasonDetail?: string) => {
    if (!quote?.id) return;
    setIsRefusingQuote(true);
    try {
      const res = await authenticatedFetch(`/api/quotes/${quote.id}/client-refused`, {
        method: 'POST',
        body: JSON.stringify({ reason, reasonDetail }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur');
      }
      toast.success('Devis marqué refusé par le client');
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      setQuote((prev) => (prev ? { ...prev, clientRefusalStatus: 'client_refused', clientRefusalReason: reason, clientRefusalReasonDetail: reasonDetail, clientRefusalAt: new Date() } : prev));
      setIsRefusalDialogOpen(false);
      setRefusalReasonDetail('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setIsRefusingQuote(false);
    }
  };

  const handleRefusalDialogSubmit = () => {
    handleMarkRefused(refusalReason, refusalReasonDetail.trim() || undefined);
  };

  const handleUnmarkPaid = async () => {
    if (!quote?.id) return;
    setIsUnmarkingPaid(true);
    try {
      const res = await authenticatedFetch(`/api/quotes/${quote.id}/unmark-paid`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur');
      }
      toast.success('Paiement annulé – retour en attente de paiement');
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      setQuote((prev) => (prev ? { ...prev, paymentStatus: 'pending', status: 'awaiting_payment', manualPaymentMethod: undefined, manualPaymentDate: undefined, paidAmount: 0 } : prev));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setIsUnmarkingPaid(false);
    }
  };

  const handleSendReminder = async () => {
    if (!quote?.id) return;
    setIsSendingReminder(true);
    try {
      const res = await authenticatedFetch(`/api/quotes/${quote.id}/send-reminder`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur');
      }
      toast.success('Relance enregistrée');
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      setQuote((prev) => (prev ? { ...prev, reminderSentAt: new Date() } : prev));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setIsSendingReminder(false);
    }
  };

  const handleAuctionSheetAnalysis = async (analysis: AuctionSheetAnalysis, file?: File | null) => {
    if (!quote) {
      return;
    }

    // Suppression UNIQUEMENT si l'utilisateur a explicitement retiré le bordereau
    if (analysis.removed) {
      setAuctionSheetAnalysis(null);
      const updatedQuote: Quote = { 
        ...quote,
        auctionSheet: undefined,
        // Réinitialiser les informations du lot qui venaient du bordereau
        lot: {
          ...quote.lot,
          number: 'LOT non renseigné',
          description: "Objet à transporter",
          auctionHouse: "Non précisée",
          value: 0,
          dimensions: {
            length: 0,
            width: 0,
            height: 0,
            weight: 0,
            estimated: true,
          },
        },
      };
      setQuote(updatedQuote);
      try {
        await removeAuctionSheetForQuote({ quoteId: updatedQuote.id, deleteFile: false });
      } catch (e) {
        console.warn("[firebase] suppression bordereau impossible", e);
      }
      // Mettre à jour le cache react-query pour que le devis reste cohérent partout
      queryClient.setQueryData<Quote[]>(["quotes"], (prev) => {
        if (!prev) return prev;
        return prev.map((q) => (q.id === updatedQuote.id ? updatedQuote : q));
      });
      toast.success('Bordereau retiré et informations réinitialisées');
      return;
    }

    setAuctionSheetAnalysis(analysis);

    // Enrichir le devis avec les informations du bordereau
    const updatedQuote: Quote = { ...quote };
    
    const toShortLotDescription = (text: string): string => {
      const cleaned = (text || "").replace(/\s+/g, " ").trim();
      if (!cleaned) return "";
      // Couper sur la 1ère phrase / séparateur (évite de coller tout le pavé OCR)
      const cutMatch = cleaned.match(/^(.{1,180}?)(?:[.;\n]|$)/);
      let short = (cutMatch?.[1] || cleaned).trim();
      // Si trop long, tronquer proprement
      if (short.length > 160) short = `${short.slice(0, 157).trim()}…`;
      return short;
    };

    const firstLot = analysis.lots[0] || null;

    // Mettre une description COURTE du lot (et non tout le texte OCR)
    if (firstLot) {
      const shortFromSheet = firstLot.description ? toShortLotDescription(firstLot.description) : "";
      const currentDesc = (updatedQuote.lot.description || "").trim();
      const isPlaceholderDesc = /^(objet\s+à\s+transporter|objet\s+a\s+transporter|objet)$/i.test(currentDesc);

      if (shortFromSheet && (currentDesc.length === 0 || isPlaceholderDesc || currentDesc.length < 10)) {
        updatedQuote.lot.description = shortFromSheet;
      } else if (currentDesc.length > 180) {
        updatedQuote.lot.description = toShortLotDescription(currentDesc);
      }
    }

    // PRIORITÉ ABSOLUE aux dimensions INTERNES du carton (dimensions du colis)
    // Les dimensions internes (inner) sont celles du colis, à utiliser en priorité
    const cartonDims = analysis.recommendedCarton?.inner || analysis.recommendedCarton?.required;
    if (cartonDims) {
      // Appliquer les dimensions INTERNES du carton (priorité absolue)
      const cartonLength = Number(cartonDims.length);
      const cartonWidth = Number(cartonDims.width);
      const cartonHeight = Number(cartonDims.height);
      
      console.log('[QuoteDetail] Application dimensions carton dans handleAuctionSheetAnalysis:', {
        carton: analysis.recommendedCarton.ref,
        inner: analysis.recommendedCarton.inner,
        required: analysis.recommendedCarton.required,
        dimensionsUtilisees: { length: cartonLength, width: cartonWidth, height: cartonHeight }
      });
      
      updatedQuote.lot.dimensions = {
        ...updatedQuote.lot.dimensions,
        length: isNaN(cartonLength) ? 0 : cartonLength,
        width: isNaN(cartonWidth) ? 0 : cartonWidth,
        height: isNaN(cartonHeight) ? 0 : cartonHeight,
        // Le carton n'a pas de poids; on conserve le poids estimé existant ou celui du lot
        weight: updatedQuote.lot.dimensions.weight || Number(firstLot?.estimatedDimensions?.weight) || 0,
        estimated: true,
      };
    } else {
      // Fallback vers dimensions du lot UNIQUEMENT si pas de carton recommandé
      if (firstLot?.estimatedDimensions) {
        const currentDims = updatedQuote.lot.dimensions;
        const needOverride =
          !currentDims.length ||
          !currentDims.width ||
          !currentDims.height ||
          !currentDims.weight ||
          currentDims.length === 0 ||
          currentDims.width === 0 ||
          currentDims.height === 0 ||
          currentDims.weight === 0;
        if (needOverride) {
          updatedQuote.lot.dimensions = {
            ...currentDims,
            length: firstLot.estimatedDimensions.length || currentDims.length || 0,
            width: firstLot.estimatedDimensions.width || currentDims.width || 0,
            height: firstLot.estimatedDimensions.height || currentDims.height || 0,
            weight: firstLot.estimatedDimensions.weight || currentDims.weight || 0,
            estimated: true,
          };
        }
      }
    }
    
    // Mettre à jour la valeur si elle est vide
    // Priorité au total facture (Total invoice / Facture total), sinon valeur du premier lot
    const preferredValue =
      typeof analysis.invoiceTotal === 'number' && analysis.invoiceTotal > 0
        ? analysis.invoiceTotal
        : (firstLot?.value ?? 0);

    if (preferredValue && (!updatedQuote.lot.value || updatedQuote.lot.value === 0)) {
      updatedQuote.lot.value = preferredValue;
    }
    
    // Mettre à jour la salle des ventes si elle n'est pas renseignée
    if (analysis.auctionHouse && (!updatedQuote.lot.auctionHouse || updatedQuote.lot.auctionHouse === 'Non précisée')) {
      updatedQuote.lot.auctionHouse = analysis.auctionHouse;
    }
    
    // Mettre à jour le numéro de lot si vide
    if (firstLot?.lotNumber && (!updatedQuote.lot.number || updatedQuote.lot.number.startsWith('LOT-'))) {
      updatedQuote.lot.number = firstLot.lotNumber;
    }
    
    // Calculer les prix d'emballage et d'expédition depuis Google Sheets
    let packagingPrice = 0;
    let shippingPrice = 0;
    
    // 1. Prix d'emballage depuis Google Sheets (Prix carton) - PRIORITÉ sur Excel
    // Le prix du Google Sheet est le prix à facturer, celui de l'Excel est le prix d'achat
    if (analysis.recommendedCarton) {
      try {
        const carton = analysis.recommendedCarton;
        // Utiliser ref pour la recherche, ou label si ref est vide
        const searchRef = carton.ref || carton.label || '';
        console.log(`[QuoteDetail] 🔍 Recherche prix carton:`, {
          ref: carton.ref,
          label: carton.label,
          searchRef,
          inner: carton.inner,
          required: carton.required,
        });
        
        if (!searchRef) {
          console.warn(`[QuoteDetail] ⚠️  Aucune référence de carton disponible (ref="${carton.ref}", label="${carton.label}")`);
        } else {
          // Passer aussi les dimensions du carton pour recherche par dimensions si référence non trouvée
          const cartonDims = carton.inner || carton.required;
          packagingPrice = await getCartonPrice(
            searchRef,
            cartonDims ? { length: cartonDims.length, width: cartonDims.width, height: cartonDims.height } : undefined
          );
        if (packagingPrice > 0) {
          // Mettre à jour le prix dans recommendedCarton (prix à facturer depuis Google Sheets)
            carton.priceTTC = packagingPrice;
            console.log(`[QuoteDetail] ✅ Prix emballage (à facturer) trouvé pour "${searchRef}": ${packagingPrice}€`);
        } else {
            console.warn(`[QuoteDetail] ⚠️  Prix emballage non trouvé dans Google Sheets pour "${searchRef}"`);
            console.warn(`[QuoteDetail] ⚠️  Dimensions disponibles pour recherche:`, cartonDims);
          }
        }
      } catch (e) {
        console.error("[QuoteDetail] ❌ ERREUR lors du calcul du prix d'emballage:", e);
        console.error("[QuoteDetail] Stack:", e instanceof Error ? e.stack : 'N/A');
      }
    } else {
      console.warn(`[QuoteDetail] ⚠️  Aucun carton recommandé dans l'analyse`);
    }
    
    // 2. Prix d'expédition depuis Google Sheets
    // Extraire le code pays depuis l'adresse (peut être dans country ou dans line1)
    const deliveryCountry = updatedQuote.delivery?.address?.country;
    const addressLine = updatedQuote.delivery?.address?.line1 || updatedQuote.client.address || "";
    
    // Essayer d'extraire le code pays (2 lettres majuscules) depuis l'adresse
    let countryCode = "";
    console.log(`[QuoteDetail] 🔍 Extraction code pays - deliveryCountry="${deliveryCountry}", addressLine="${addressLine}"`);
    
    if (deliveryCountry) {
      // Si country est déjà un code à 2 lettres, l'utiliser
      if (deliveryCountry.match(/^[A-Z]{2}$/)) {
        countryCode = deliveryCountry.toUpperCase();
        console.log(`[QuoteDetail] ✅ Code pays trouvé (format 2 lettres): ${countryCode}`);
      } else {
        // Sinon, chercher dans le nom du pays (ex: "France" -> "FR")
        const countryMap: Record<string, string> = {
          "france": "FR",
          "belgique": "BE",
          "belgium": "BE",
          "suisse": "CH",
          "switzerland": "CH",
          "allemagne": "DE",
          "germany": "DE",
          "espagne": "ES",
          "spain": "ES",
          "italie": "IT",
          "italy": "IT",
          "royaume-uni": "GB",
          "united kingdom": "GB",
          "uk": "GB",
          "portugal": "PT",
          "autriche": "AT",
          "austria": "AT",
          "danemark": "DK",
          "denmark": "DK",
          "irlande": "IE",
          "ireland": "IE",
          "suède": "SE",
          "sweden": "SE",
          "finlande": "FI",
          "finland": "FI",
          "pologne": "PL",
          "poland": "PL",
          "république tchèque": "CZ",
          "czech republic": "CZ",
          "hongrie": "HU",
          "hungary": "HU",
          "brésil": "BR",
          "brazil": "BR",
          "argentine": "AR",
          "argentina": "AR",
          "chili": "CL",
          "chile": "CL",
          "colombie": "CO",
          "colombia": "CO",
          "pérou": "PE",
          "peru": "PE",
          "usa": "US",
          "united states": "US",
          "états-unis": "US",
          "canada": "CA",
          "mexique": "MX",
          "mexico": "MX",
        };
        const countryLower = deliveryCountry.toLowerCase().trim();
        countryCode = countryMap[countryLower] || "";
        if (countryCode) {
          console.log(`[QuoteDetail] ✅ Code pays trouvé via mapping: "${deliveryCountry}" -> ${countryCode}`);
        } else {
          console.warn(`[QuoteDetail] ⚠️ Code pays non trouvé dans le mapping pour: "${deliveryCountry}"`);
        }
      }
    }
    
    // Si pas trouvé, chercher dans l'adresse complète
    if (!countryCode && addressLine) {
      const countryMatch = addressLine.match(/\b([A-Z]{2})\b/);
      if (countryMatch) {
        countryCode = countryMatch[1];
        console.log(`[QuoteDetail] ✅ Code pays trouvé dans l'adresse: ${countryCode}`);
      } else {
        console.warn(`[QuoteDetail] ⚠️ Aucun code pays trouvé dans l'adresse: "${addressLine}"`);
      }
    }
    
    if (!countryCode) {
      console.error(`[QuoteDetail] ❌ AUCUN CODE PAYS TROUVÉ - deliveryCountry="${deliveryCountry}", addressLine="${addressLine}"`);
    } else {
      console.log(`[QuoteDetail] ✅ Code pays final: ${countryCode}`);
    }

    const hasValidDimsForShipping = updatedQuote.lot.dimensions &&
      updatedQuote.lot.dimensions.length > 0 &&
      updatedQuote.lot.dimensions.width > 0 &&
      updatedQuote.lot.dimensions.height > 0;
    const shouldFetchMbeAfterSave = useMbehubForShipping && !!countryCode && hasValidDimsForShipping;

    if (shouldFetchMbeAfterSave) {
      // MBE Hub : shippingPrice sera récupéré après sauvegarde (quote-shipping-rates lit depuis Firestore)
      console.log(`[QuoteDetail] MBE Hub sélectionné - tarif expédition sera calculé après sauvegarde`);
    } else if (!useMbehubForShipping && countryCode && hasValidDimsForShipping) {
      try {
        const dimensions = updatedQuote.lot.dimensions;
        console.log(`[QuoteDetail] 📐 Dimensions du colis: L=${dimensions.length}cm × l=${dimensions.width}cm × H=${dimensions.height}cm`);
        
        const volumetricWeight = calculateVolumetricWeight(
          dimensions.length,
          dimensions.width,
          dimensions.height
        );
        console.log(`[QuoteDetail] ⚖️ Poids volumétrique calculé: ${volumetricWeight}kg (formule: (${dimensions.length} × ${dimensions.width} × ${dimensions.height}) / 5000)`);
        
        const isExpress = true; // TOUS les colis sont en EXPRESS
        
        console.log(`[QuoteDetail] 🔄 Calcul prix expédition (grille): pays=${countryCode}, poidsVol=${volumetricWeight}kg, express=${isExpress}`);
        shippingPrice = await calculateShippingPrice(countryCode, volumetricWeight, isExpress);
        
        if (shippingPrice > 0) {
          console.log(`[QuoteDetail] ✅ Prix expédition calculé: ${shippingPrice}€ (pays: ${countryCode}, poids vol: ${volumetricWeight}kg, express: ${isExpress})`);
        } else {
          console.error(`[QuoteDetail] ❌ Prix expédition = 0€`);
          console.error(`[QuoteDetail] ❌ Paramètres utilisés: pays="${countryCode}", poidsVol=${volumetricWeight}kg, express=${isExpress}`);
          console.error(`[QuoteDetail] ❌ Vérifiez que les tarifs d'expédition sont chargés (voir logs [pricing])`);
        }
      } catch (e) {
        console.error("[QuoteDetail] ❌ ERREUR lors du calcul du prix d'expédition:", e);
      }
    } else {
      if (!countryCode) {
        console.error(`[QuoteDetail] ❌ Code pays manquant - deliveryCountry="${deliveryCountry}", addressLine="${addressLine}"`);
      }
      if (!updatedQuote.lot.dimensions || 
          !updatedQuote.lot.dimensions.length || 
          !updatedQuote.lot.dimensions.width || 
          !updatedQuote.lot.dimensions.height) {
        console.error(`[QuoteDetail] ❌ Dimensions manquantes ou invalides:`, updatedQuote.lot.dimensions);
      }
    }
    
    // Ajouter les informations du bordereau
    console.log('[QuoteDetail] Analyse bordereau complète:', {
      bordereauNumber: analysis.bordereauNumber,
      auctionHouse: analysis.auctionHouse,
      totalLots: analysis.totalLots,
      analysisKeys: Object.keys(analysis),
    });
    
    updatedQuote.auctionSheet = {
      fileName: file?.name || quote.auctionSheet?.fileName,
      auctionHouse: analysis.auctionHouse,
      auctionDate: analysis.auctionDate,
      totalLots: analysis.totalLots,
      totalObjects: analysis.totalObjects,
      invoiceTotal: analysis.invoiceTotal,
      bordereauNumber: analysis.bordereauNumber || undefined,
      recommendedCarton: analysis.recommendedCarton,
      lots: analysis.lots.map((l) => ({
        lotNumber: l.lotNumber,
        description: l.description,
        estimatedDimensions: l.estimatedDimensions,
        value: l.value,
      })),
      rawText: analysis.rawText,
    };
    
    console.log('[QuoteDetail] AuctionSheet mis à jour:', {
      bordereauNumber: updatedQuote.auctionSheet.bordereauNumber,
      auctionSheetKeys: Object.keys(updatedQuote.auctionSheet),
      hasBordereauNumber: 'bordereauNumber' in updatedQuote.auctionSheet,
    });
    
    // Mettre à jour les prix dans les options
    // Le prix d'emballage vient TOUJOURS du Google Sheets (prix à facturer)
    const finalPackagingPrice = packagingPrice > 0 ? packagingPrice : (updatedQuote.options.packagingPrice || 0);
    const finalShippingPrice = shippingPrice > 0 ? shippingPrice : (updatedQuote.options.shippingPrice || 0);
    
    console.log('[QuoteDetail] Mise à jour des prix dans handleAuctionSheetAnalysis:', {
      packagingPrice,
      shippingPrice,
      finalPackagingPrice,
      finalShippingPrice,
      existingPackaging: updatedQuote.options.packagingPrice,
      existingShipping: updatedQuote.options.shippingPrice,
    });
    
    updatedQuote.options = {
      ...updatedQuote.options,
      express: true, // Forcer express pour tous les colis
      packagingPrice: finalPackagingPrice > 0 ? finalPackagingPrice : undefined,
      shippingPrice: finalShippingPrice > 0 ? finalShippingPrice : undefined,
    };
    
    // Recalculer le totalAmount en incluant les nouveaux prix : emballage + expédition + assurance
    const insuranceAmount = computeInsuranceAmount(
      updatedQuote.declaredValue ?? updatedQuote.lot?.value ?? 0,
      updatedQuote.options.insurance,
      updatedQuote.options.insuranceAmount
    );
    const newTotal = finalPackagingPrice + finalShippingPrice + insuranceAmount;
    updatedQuote.options.insuranceAmount = insuranceAmount;
    updatedQuote.totalAmount = newTotal;
    
    console.log('[QuoteDetail] Devis mis à jour avec prix:', {
      options: updatedQuote.options,
      totalAmount: updatedQuote.totalAmount,
    });
    
    setQuote(updatedQuote);
    toast.success('Devis enrichi avec les informations du bordereau !');

    // Persist Firestore (+ upload Storage)
    try {
      const persisted = await saveAuctionSheetForQuote({
        quoteId: updatedQuote.id,
        quote: updatedQuote,
        analysis,
        existing: updatedQuote.auctionSheet ?? null,
      });
      // Mettre à jour le devis local avec les champs Firestore/Storage (URL, etc.) et les prix
      setQuote((q) => (q ? { 
        ...q, 
        auctionSheet: { ...q.auctionSheet, ...persisted },
        options: {
          ...q.options,
          packagingPrice: updatedQuote.options.packagingPrice || q.options.packagingPrice,
          shippingPrice: updatedQuote.options.shippingPrice || q.options.shippingPrice,
        },
      } : q));
      // Mettre à jour le cache react-query (sinon en revenant sur la liste, tu ne vois pas l'info sans refresh)
      queryClient.setQueryData<Quote[]>(["quotes"], (prev) => {
        if (!prev) return prev;
        return prev.map((q) => (q.id === updatedQuote.id ? { 
          ...q, 
          auctionSheet: { ...(q.auctionSheet as any), ...persisted },
          options: {
            ...q.options,
            packagingPrice: updatedQuote.options.packagingPrice || q.options.packagingPrice,
            shippingPrice: updatedQuote.options.shippingPrice || q.options.shippingPrice,
          },
        } : q));
      });

      let finalShippingPrice = updatedQuote.options.shippingPrice ?? 0;
      if (shouldFetchMbeAfterSave) {
        try {
          const res = await authenticatedFetch('/api/mbehub/quote-shipping-rates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quoteId: updatedQuote.id }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.standard?.price > 0) {
            finalShippingPrice = data.standard.price;
            const finalPackagingPrice = updatedQuote.options.packagingPrice ?? 0;
            const insuranceAmount = computeInsuranceAmount(
              updatedQuote.declaredValue ?? updatedQuote.lot?.value ?? 0,
              updatedQuote.options?.insurance,
              updatedQuote.options?.insuranceAmount
            );
            const newTotal = finalPackagingPrice + finalShippingPrice + insuranceAmount;
            updatedQuote.options.shippingPrice = finalShippingPrice;
            updatedQuote.options.insuranceAmount = insuranceAmount;
            updatedQuote.totalAmount = newTotal;
            setQuote((q) => q ? { ...q, options: { ...q.options, shippingPrice: finalShippingPrice, insuranceAmount }, totalAmount: newTotal } : q);
            await setDoc(doc(db, 'quotes', updatedQuote.id), { options: { shippingPrice: finalShippingPrice, insuranceAmount }, totalAmount: newTotal, updatedAt: Timestamp.now() }, { merge: true });
            queryClient.setQueryData<Quote[]>(["quotes"], (prev) => prev ? prev.map((q) => q.id === updatedQuote.id ? { ...q, options: { ...q.options, shippingPrice: finalShippingPrice, insuranceAmount }, totalAmount: newTotal } : q) : prev);
            console.log(`[QuoteDetail] Prix expédition MBE Standard appliqué: ${finalShippingPrice}€`);
          }
        } catch (e) {
          console.error('[QuoteDetail] Erreur quote-shipping-rates:', e);
          toast.error('Impossible de récupérer les tarifs MBE');
        }
      }

      // Générer le lien de paiement après analyse réussie (emballage + expédition prêts)
      // regenerate: true permet d'annuler les anciens liens en cas de réanalyse, puis de créer le nouveau
      const pkg = updatedQuote.options.packagingPrice ?? 0;
      const ship = finalShippingPrice;
      if (pkg > 0 && ship > 0) {
        authenticatedFetch(`/api/devis/${updatedQuote.id}/try-auto-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ regenerate: true }),
        })
          .then((res) => res.json().catch(() => ({})))
          .then((data) => {
            if (data?.generated) {
              queryClient.invalidateQueries({ queryKey: ['quotes'] });
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[firebase] sauvegarde bordereau impossible", e);
      toast.error(`Bordereau analysé mais non sauvegardé (Firebase): ${msg}`);
    }
  };

  if (!quote) {
    return (
      <div className="flex flex-col h-full">
        <AppHeader title="Devis non trouvé" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Ce devis n'existe pas</p>
            <Link to="/">
              <Button>Retour au tableau de bord</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Sécuriser toutes les propriétés pour éviter les erreurs
  const safeQuote: Quote = {
    ...quote,
    id: quote.id || '',
    client: quote.client || { id: '', name: '', email: '', phone: '', address: '' },
    lot: quote.lot || {
      id: '',
      number: '',
      description: '',
      dimensions: { length: 0, width: 0, height: 0, weight: 0, estimated: false },
      value: 0,
      photos: [],
      auctionHouse: ''
    },
    delivery: quote.delivery || {
      mode: 'client' as DeliveryMode,
      contact: { name: '', email: '', phone: '' },
      address: { line1: '' }
    },
    options: quote.options || { insurance: false, express: false, packagingPrice: 0, shippingPrice: 0, insuranceAmount: 0 },
    verificationIssues: quote.verificationIssues || [],
    timeline: quote.timeline || [],
    paymentLinks: quote.paymentLinks || [],
    messages: quote.messages || [],
    internalNotes: quote.internalNotes || [],
    auctionHouseComments: quote.auctionHouseComments || [],
    reference: quote.reference || 'N/A',
    status: quote.status || 'new',
    paymentStatus: quote.paymentStatus || 'pending',
    totalAmount: quote.totalAmount || 0,
    auctionSheet: quote.auctionSheet,
    carrier: quote.carrier,
    trackingNumber: quote.trackingNumber,
    clientId: quote.clientId,
    createdAt: quote.createdAt || new Date(),
    updatedAt: quote.updatedAt || new Date()
  };

  const delivery: DeliveryInfo = safeQuote.delivery || {
    mode: "client" as DeliveryMode,
    contact: {
      name: safeQuote.client.name,
      email: safeQuote.client.email,
      phone: safeQuote.client.phone,
    },
    address: {
      line1: safeQuote.client.address,
    },
  };

  const formatAddress = (addr?: { line1?: string; line2?: string; city?: string; zip?: string; state?: string; country?: string }) => {
    if (!addr) return "Non renseignée";
    const parts = [
      addr.line1,
      addr.line2,
      [addr.zip, addr.city].filter(Boolean).join(" ").trim(),
      addr.state,
      addr.country,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "Non renseignée";
  };

  // Fallbacks pour affichage client/destinataire (si des données client sont présentes mais pas recopiées)
  const clientPhoneDisplay = safeQuote.client.phone || delivery.contact?.phone || "Non renseigné";
  const clientAddressDisplay = safeQuote.client.address || formatAddress(delivery.address) || "Non renseignée";

  const deliveryTitle =
    delivery.mode === "pickup"
      ? "Livraison en point relais"
      : delivery.mode === "receiver"
        ? "Livraison destinataire"
        : "Livraison client";

  const deliveryAddress = [
    delivery.address?.line1,
    delivery.address?.line2,
    [delivery.address?.zip, delivery.address?.city].filter(Boolean).join(" "),
    delivery.address?.state,
    delivery.address?.country,
  ]
    .filter((x) => x && x.toString().trim().length > 0)
    .join(" · ");

  // Calculer le poids volumétrique estimé et réel
  // Le poids facturé est le maximum entre le poids volumétrique et le poids réel
  const lotDims = safeQuote.lot.dimensions || { length: 0, width: 0, height: 0, weight: 0 };
  const estimatedVolumetricWeight = calculateVolumetricWeight(
    lotDims.length || 0,
    lotDims.width || 0,
    lotDims.height || 0
  );
  const estimatedBillingWeight = Math.max(estimatedVolumetricWeight, lotDims.weight || 0);
  
  // Calculer le poids volumétrique et facturé réel seulement si les dimensions réelles existent
  let realVolumetricWeight = 0;
  let realBillingWeight = 0;
  if (safeQuote.lot.realDimensions) {
    realVolumetricWeight = calculateVolumetricWeight(
      safeQuote.lot.realDimensions.length || 0,
      safeQuote.lot.realDimensions.width || 0,
      safeQuote.lot.realDimensions.height || 0
    );
    realBillingWeight = Math.max(realVolumetricWeight, safeQuote.lot.realDimensions.weight || 0);
  }
  
  // L'alerte "Dimensions non conformes" ne s'affiche que si le poids facturé réel est supérieur au poids facturé estimé
  // Car c'est dans ce cas qu'un surcoût est nécessaire
  const hasDimensionMismatch = safeQuote.lot.realDimensions && realBillingWeight > estimatedBillingWeight;

  return (
    <div className="flex flex-col h-full">
      <AppHeader 
        title={`Devis ${safeQuote.reference}`}
        subtitle={`Lot ${safeQuote.lot.number || 'N/A'} • ${safeQuote.client.name || 'Client inconnu'}`}
      />
      
      <div className="flex-1 p-6 overflow-auto">
        {/* Back + Actions */}
        <div className="flex items-center justify-between mb-6">
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" />
              Retour
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            {safeQuote.clientRefusalStatus === 'client_refused' ? (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="w-3 h-3" />
                Refusé par le client
              </Badge>
            ) : (
              <>
                {safeQuote.status !== 'paid' && (
                  <StatusBadge status={safeQuote.status} />
                )}
                <StatusBadge status={safeQuote.paymentStatus} type="payment" />
              </>
            )}
          </div>
        </div>

        {/* Alerts */}
        {(safeQuote.verificationIssues?.length || 0) > 0 && (
          <div className="alert-banner alert-warning mb-6">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Vérifications requises</p>
              <ul className="text-sm mt-1 space-y-1">
                {safeQuote.verificationIssues.map((issue, i) => (
                  <li key={i}>• {issue.message}</li>
                ))}
              </ul>
            </div>
            <Button variant="outline" size="sm" className="gap-1">
              <Mail className="w-4 h-4" />
              Demander confirmation
            </Button>
          </div>
        )}

        {hasDimensionMismatch && (
          <div className="alert-banner alert-urgent mb-6">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Dimensions non conformes</p>
              <p className="text-sm mt-1">Les dimensions réelles diffèrent des estimations. Un surcoût peut être nécessaire.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1">
                <Plus className="w-4 h-4" />
                Ajouter surcoût
              </Button>
              <Button variant="outline" size="sm" className="gap-1">
                <LinkIcon className="w-4 h-4" />
                Nouveau lien
              </Button>
            </div>
          </div>
        )}

        {bordereauPollingActive && (
          <div className="flex items-center gap-3 p-4 mb-6 rounded-lg bg-primary/10 border border-primary/20">
            <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Analyse du bordereau en cours...</p>
              <p className="text-sm text-muted-foreground">
                Les informations du lot, le carton recommandé, les tarifs et le lien de paiement seront mis à jour automatiquement.
              </p>
            </div>
          </div>
        )}

        {bordereauPollingTimedOut && (() => {
          const q = foundQuote || quote;
          return q && (q as Quote & { bordereauLink?: string }).bordereauLink && !q.auctionSheet?.lots?.length;
        })() && (
          <div className="flex items-center gap-3 p-4 mb-6 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">L'analyse n'a pas abouti</p>
              <p className="text-sm text-muted-foreground">
                Les informations du lot n'ont pas été extraites. L'API peut être temporairement indisponible ou le token Google Sheets expiré. Réessayez ou reconnectez Google Sheets dans Paramètres.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => triggerBordereauProcess(true)} className="gap-1">
              <RefreshCw className="w-4 h-4" />
              Relancer l'analyse
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="info">
              <TabsList>
                <TabsTrigger value="info">Informations</TabsTrigger>
                <TabsTrigger value="payments">Paiements</TabsTrigger>
                <TabsTrigger value="messages">Messages</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-6 mt-6">
                {/* Suggestion de groupement d'expédition */}
                {groupingSuggestion && !currentGroup && safeQuote && (
                  <GroupingSuggestion
                    currentQuoteId={safeQuote.id}
                    suggestion={groupingSuggestion}
                    onCreateGroup={async (selectedQuoteIds) => {
                      await createGroup(selectedQuoteIds);
                    }}
                    isCreating={isCreatingGroup}
                  />
                )}

                {/* Badge de groupement existant */}
                {currentGroup && (
                  <Card className="border-l-4 border-l-purple-500 bg-purple-50/50">
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Package className="h-5 w-5 text-purple-600" />
                          <div>
                            <p className="font-medium">Ce devis fait partie d'un groupement</p>
                            <p className="text-sm text-muted-foreground">
                              {currentGroup.devisIds.length} devis expédiés ensemble
                            </p>
                          </div>
                        </div>
                        <GroupBadge
                          groupId={currentGroup.id}
                          groupReference={currentGroup.id.slice(0, 12)}
                          quoteCount={currentGroup.devisIds.length}
                        />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Delivery Info */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Home className="w-4 h-4" />
                        {deliveryTitle}
                      </CardTitle>
                      {delivery.mode === 'pickup' && (
                        <Badge variant="secondary" className="font-normal">
                          Point relais
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Contact</p>
                      <p className="font-medium">
                          {delivery.contact?.name || safeQuote.client.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                          {delivery.contact?.email || safeQuote.client.email}
                      </p>
                      <p className="text-sm text-muted-foreground">
                          {(delivery.contact?.phone || safeQuote.client.phone) || "Non renseigné"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        {delivery.mode === "pickup" ? "Point relais" : "Adresse de livraison"}
                      </p>
                      <p className="text-sm">
                        {formatAddress(delivery.address)}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Client Info */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Informations client
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Nom</p>
                        <p className="font-medium">{safeQuote.client.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="font-medium">{safeQuote.client.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Téléphone</p>
                        <p className="font-medium">{clientPhoneDisplay}</p>
                      </div>
                      {safeQuote.verificationIssues.some(i => i.field === 'phone') && (
                        <Badge variant="warning" className="text-[10px]">À vérifier</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Adresse</p>
                        <p className="font-medium break-words">{clientAddressDisplay}</p>
                      </div>
                      {safeQuote.verificationIssues.some(i => i.field === 'address') && (
                        <Badge variant="error" className="text-[10px]">Manquante</Badge>
                      )}
                    </div>
                    {safeQuote.wantsProfessionalInvoice === true && (
                      <div className="flex items-center gap-2 col-span-2">
                        <Badge variant="info" className="gap-1 font-normal">
                          <FileText className="w-3 h-3" />
                          Facture
                        </Badge>
                      </div>
                    )}
                    {safeQuote.delivery?.note && String(safeQuote.delivery.note).trim() && (
                      <div className="flex items-start gap-2 col-span-2 p-3 rounded-lg bg-muted/50 border border-border">
                        <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground mb-1">Informations utiles pour l&apos;expédition</p>
                          <p className="text-sm whitespace-pre-wrap break-words">{safeQuote.delivery.note}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Lot Info */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Informations du lot
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Informations globales (Salle des ventes, ID client MBE et Bordereau) */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Salle des ventes</p>
                        <div className="font-medium flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          <span>
                            {safeQuote.auctionSheet?.auctionHouse 
                              ? safeQuote.auctionSheet.auctionHouse
                              : (safeQuote.lot.auctionHouse && safeQuote.lot.auctionHouse !== 'Non précisée'
                                ? safeQuote.lot.auctionHouse
                                : 'Non détecté par OCR')}
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">ID client MBE (Expéditions)</p>
                        <p className="font-medium font-mono text-sm">
                          {(() => {
                            const name = (safeQuote.auctionSheet?.auctionHouse || safeQuote.lot?.auctionHouse || safeQuote.lotAuctionHouse || '').trim();
                            const norm = (s: string) => (s || '').trim().toLowerCase();
                            const matched = auctionHouses.find((h) => norm(h.name) === norm(name));
                            return matched?.mbeCustomerId ? matched.mbeCustomerId : 'Non configuré';
                          })()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Bordereau</p>
                        <p className="font-medium">
                          {safeQuote.auctionSheet?.bordereauNumber && safeQuote.auctionSheet.bordereauNumber.trim()
                            ? safeQuote.auctionSheet.bordereauNumber.trim()
                            : 'Non détecté par OCR'}
                        </p>
                      </div>
                    </div>

                    <Separator />

                    {/* Affichage des lots extraits par OCR */}
                    {safeQuote.auctionSheet?.lots && safeQuote.auctionSheet.lots.length > 0 ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-muted-foreground">
                            {safeQuote.auctionSheet.lots.length === 1 
                              ? '1 lot détecté' 
                              : `${safeQuote.auctionSheet.lots.length} lots détectés`}
                          </p>
                        </div>
                        
                        {/* Liste des lots */}
                        <div className="space-y-3">
                          {safeQuote.auctionSheet.lots.map((lot, index) => {
                            // Si 1 seul lot : afficher lot.total (prix avec frais)
                            // Si plusieurs lots : afficher lot.value (prix marteau)
                            const displayValue = safeQuote.auctionSheet.lots.length === 1
                              ? (lot.total !== undefined && lot.total !== null ? lot.total : lot.value)
                              : lot.value;

                            return (
                              <div 
                                key={index} 
                                className="p-3 rounded-lg border border-border bg-secondary/20 space-y-2"
                              >
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <p className="text-xs text-muted-foreground">Numéro de lot</p>
                                    <p className="font-medium text-sm">
                                      {lot.lotNumber || 'Non détecté par OCR'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">
                                      {safeQuote.auctionSheet.lots.length === 1 
                                        ? 'Valeur déclarée' 
                                        : 'Prix marteau'}
                                    </p>
                                    <p className="font-medium text-sm flex items-center gap-1">
                                      <Euro className="w-3 h-3" />
                                      {displayValue !== undefined && displayValue !== null 
                                        ? `${displayValue.toFixed(2)}€`
                                        : 'Non détecté par OCR'}
                                    </p>
                                  </div>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Description</p>
                                  <p className="text-sm break-words whitespace-normal">
                                    {lot.description || 'Non détecté par OCR'}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Valeur totale si plusieurs lots */}
                        {safeQuote.auctionSheet.lots.length > 1 && (
                          <div className="pt-2 border-t border-border">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">Valeur totale déclarée</p>
                              <p className="text-lg font-bold flex items-center gap-1">
                                <Euro className="w-4 h-4" />
                                {(() => {
                                  // Somme des lot.total (prix avec frais) pour tous les lots
                                  const total = safeQuote.auctionSheet.lots.reduce((sum, lot) => 
                                    sum + (lot.total !== undefined && lot.total !== null ? lot.total : (lot.value || 0)), 0
                                  );
                                  return `${total.toFixed(2)}€`;
                                })()}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Affichage par défaut si pas de lots OCR */
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Numéro de lot</p>
                            <p className="font-medium">
                              {safeQuote.lot.number && !safeQuote.lot.number.startsWith('LOT-')
                                ? safeQuote.lot.number
                                : 'Non détecté par OCR'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Valeur déclarée</p>
                            <p className="font-medium flex items-center gap-1">
                              <Euro className="w-3 h-3" />
                              {safeQuote.lot.value > 0 
                                ? `${safeQuote.lot.value.toFixed(2)}€`
                                : 'Non détecté par OCR'}
                            </p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Description</p>
                          <p className="font-medium">
                            {safeQuote.lot.description && safeQuote.lot.description !== 'Objet à transporter'
                              ? safeQuote.lot.description
                              : 'Non détecté par OCR'}
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2">
                        <Euro className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">
                            {safeQuote.auctionSheet?.lots && safeQuote.auctionSheet.lots.length > 1 ? 'Somme des prix marteau' : 'Prix marteau'}
                          </p>
                          <p className="font-medium">
                            {safeQuote.lot.value && safeQuote.lot.value > 0
                              ? `${safeQuote.lot.value}€`
                              : (safeQuote.auctionSheet ? `${safeQuote.lot.value || 0}€` : 'Pas renseigné')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Euro className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Valeur totale déclarée</p>
                          <p className="font-medium">
                            {(() => {
                              const dv = safeQuote.declaredValue;
                              if (dv != null && dv > 0) return `${dv.toFixed(2)}€`;
                              // Fallback : somme des lots
                              if (safeQuote.auctionSheet?.lots && safeQuote.auctionSheet.lots.length > 0) {
                                const sum = safeQuote.auctionSheet.lots.reduce((s, l) => s + (l.value ?? (l as any).total ?? 0), 0);
                                return `${sum.toFixed(2)}€`;
                              }
                              return safeQuote.lot.value ? `${safeQuote.lot.value}€` : 'Pas renseigné';
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Dimensions */}
                    <Separator />
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                          <Ruler className="w-3 h-3" />
                          <span>Dimensions estimées d'un colis</span>
                          {safeQuote.auctionSheet?.recommendedCarton && (() => {
                            const carton = safeQuote.auctionSheet.recommendedCarton;
                            // Utiliser label si disponible, sinon ref nettoyé
                            const displayName = carton.label 
                              ? cleanCartonRef(carton.label)
                              : (carton.ref ? cleanCartonRef(carton.ref) : '');
                            console.log('[QuoteDetail] Affichage nom carton:', { ref: carton.ref, label: carton.label, displayName });
                            return displayName ? (
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                                Carton: {displayName}
                            </Badge>
                            ) : null;
                          })()}
                        </div>
                        {(() => {
                          // Afficher les dimensions du CARTON (pas de l'objet)
                          const carton = safeQuote.auctionSheet?.recommendedCarton;
                          
                          if (carton) {
                            // Nouveau format (inner_length, inner_width, inner_height)
                            const length = carton.inner_length || carton.inner?.length || 0;
                            const width = carton.inner_width || carton.inner?.width || 0;
                            const height = carton.inner_height || carton.inner?.height || 0;
                            
                            if (length > 0 || width > 0 || height > 0) {
                              return (
                                <div className="bg-secondary/50 rounded-lg p-3 text-sm space-y-1">
                                  <p>Longueur: {length} cm</p>
                                  <p>Largeur: {width} cm</p>
                                  <p>Hauteur: {height} cm</p>
                                </div>
                              );
                            }
                          }
                          
                          // Fallback: afficher les dimensions de l'objet si pas de carton
                          if (safeQuote.lot.dimensions && (safeQuote.lot.dimensions.length > 0 || safeQuote.lot.dimensions.width > 0 || safeQuote.lot.dimensions.height > 0)) {
                            return (
                              <div className="bg-secondary/50 rounded-lg p-3 text-sm space-y-1">
                                <p>Longueur: {safeQuote.lot.dimensions.length} cm</p>
                                <p>Largeur: {safeQuote.lot.dimensions.width} cm</p>
                                <p>Hauteur: {safeQuote.lot.dimensions.height} cm</p>
                                <p>Poids: {safeQuote.lot.dimensions.weight} kg</p>
                              </div>
                            );
                          }
                          
                          return (
                            <div className="bg-secondary/50 rounded-lg p-3 text-sm text-muted-foreground">
                              Pas renseigné
                            </div>
                          );
                        })()}
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                          <Ruler className="w-3 h-3" />
                          <span>Dimensions réelles</span>
                        </div>
                        {safeQuote.lot.realDimensions ? (
                          <div className={cn(
                            'rounded-lg p-3 text-sm space-y-1',
                            hasDimensionMismatch ? 'bg-destructive/10' : 'bg-success/10'
                          )}>
                            <p className={cn(
                              safeQuote.lot.realDimensions.length !== safeQuote.lot.dimensions.length && 'text-destructive font-medium'
                            )}>
                              Longueur: {safeQuote.lot.realDimensions.length || 0} cm
                            </p>
                            <p>Largeur: {safeQuote.lot.realDimensions.width || 0} cm</p>
                            <p>Hauteur: {safeQuote.lot.realDimensions.height || 0} cm</p>
                            <p>Poids: {safeQuote.lot.realDimensions.weight || 0} kg</p>
                          </div>
                        ) : (
                          <div className="bg-muted rounded-lg p-3 text-sm text-center text-muted-foreground">
                            Non mesuré
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Tracking */}
                {(safeQuote.trackingNumber || safeQuote.carrier) && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Truck className="w-4 h-4" />
                        Suivi expédition
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">Transporteur</p>
                          <p className="font-medium">{safeQuote.carrier || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">N° de suivi</p>
                          <div className="flex items-center gap-2">
                            <code className="bg-muted px-2 py-1 rounded text-sm">
                              {safeQuote.trackingNumber || '-'}
                            </code>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Copy className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="payments" className="space-y-6 mt-6">
                {/* Payment Summary */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      Récapitulatif
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Informations de livraison */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Livraison</p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Type de livraison</span>
                          <div className="font-medium">
                            <Badge variant="info" className="text-xs">Express</Badge>
                          </div>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Transporteur</span>
                          <span className="font-medium">
                            {safeQuote.carrier ? (
                              <Badge variant="outline" className="text-xs">{safeQuote.carrier}</Badge>
                            ) : (
                              <span className="text-muted-foreground italic">Non renseigné</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Détail des coûts */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Détail des coûts</p>
                      <div className="space-y-2">
                        {/* Prix d'emballage - toujours affiché */}
                        <div className="flex justify-between text-sm items-center">
                          <span className="text-muted-foreground">
                            Emballage
                            {safeQuote.auctionSheet?.recommendedCarton && (() => {
                              const carton = safeQuote.auctionSheet.recommendedCarton;
                              // Utiliser label si disponible, sinon ref nettoyé
                              const displayName = carton.label 
                                ? cleanCartonRef(carton.label)
                                : (carton.ref ? cleanCartonRef(carton.ref) : '');
                              return displayName ? (
                                <span className="text-muted-foreground"> (carton {displayName})</span>
                              ) : null;
                            })()}
                          </span>
                          <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {(() => {
                              // Utiliser le prix du carton depuis auctionSheet.recommendedCarton si disponible
                              // Sinon utiliser quote.options.packagingPrice comme fallback
                              const cartonPrice = safeQuote.auctionSheet?.recommendedCarton?.price || 
                                                  (safeQuote.auctionSheet?.recommendedCarton as any)?.priceTTC || 
                                                  null;
                              const price = cartonPrice !== null ? cartonPrice : (safeQuote.options?.packagingPrice || 0);
                              console.log('[QuoteDetail] Affichage prix emballage:', { 
                                price, 
                                cartonPrice,
                                quotePackagingPrice: safeQuote.options?.packagingPrice,
                                options: safeQuote.options,
                                carton: safeQuote.auctionSheet?.recommendedCarton,
                              });
                              return price.toFixed(2);
                            })()}€
                          </span>
                            {safeQuote.auctionSheet?.recommendedCarton && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={async () => {
                                  try {
                                    const carton = quote.auctionSheet!.recommendedCarton!;
                                    const searchRef = carton.ref || carton.label || '';
                                    const cartonDims = carton.inner || carton.required;
                                    
                                    console.log(`[QuoteDetail] 🔄 Recalcul manuel prix emballage:`, {
                                      ref: carton.ref,
                                      label: carton.label,
                                      searchRef,
                                      inner: carton.inner,
                                      required: carton.required,
                                    });
                                    
                                    if (!searchRef) {
                                      toast.error("Aucune référence de carton disponible");
                                      return;
                                    }
                                    
                                    const packagingPrice = await getCartonPrice(
                                      searchRef,
                                      cartonDims ? { length: cartonDims.length, width: cartonDims.width, height: cartonDims.height } : undefined
                                    );
                                    
                                    if (packagingPrice > 0) {
                                      // Mettre à jour le devis local
                                      setQuote(prev => prev ? {
                                        ...prev,
                                        options: {
                                          ...prev.options,
                                          packagingPrice: packagingPrice,
                                        },
                                      } : prev);
                                      
                                      // Sauvegarder dans Firestore
                                      await setDoc(
                                        doc(db, "quotes", quote.id),
                                        {
                                          packagingPrice: packagingPrice,
                                          updatedAt: Timestamp.now(),
                                        },
                                        { merge: true }
                                      );
                                      
                                      // Invalider le cache React Query
                                      queryClient.invalidateQueries({ queryKey: ['quotes'] });
                                      
                                      toast.success(`Prix d'emballage recalculé: ${packagingPrice}€`);
                                    } else {
                                      toast.error(`Prix non trouvé pour "${searchRef}". Vérifiez le Google Sheet.`);
                                    }
                                  } catch (e) {
                                    console.error("[QuoteDetail] Erreur recalcul prix emballage:", e);
                                    toast.error("Erreur lors du recalcul du prix d'emballage");
                                  }
                                }}
                                title="Recalculer le prix d'emballage"
                              >
                                <RefreshCw className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        {/* Prix d'expédition */}
                        {(() => {
                          const dims = safeQuote.lot?.dimensions || safeQuote.lot?.realDimensions || {};
                          const hasDims = (dims.length ?? 0) > 0 && (dims.width ?? 0) > 0 && (dims.height ?? 0) > 0;
                          const weight = safeQuote.totalWeight ?? dims.weight ?? 0;
                          const addr = delivery.address || {};
                          const clientAddr = safeQuote.client?.address || '';
                          const hasAddr = !!(addr.zip || addr.city || addr.country || clientAddr);
                          const canCalculateMbeShipping = showMbehubButton && hasDims && weight > 0 && hasAddr && !isPrincipalPaidForEdit;
                          return (
                            <div className="space-y-2">
                              <div className="flex justify-between text-sm items-center">
                                <span className="text-muted-foreground">
                                  Expédition{mbeShippingRates ? ' (prix actuel)' : ' (Express)'}
                                  {delivery.address?.country && (
                                    <span className="text-muted-foreground text-xs ml-1">
                                      ({delivery.address.country})
                                    </span>
                                  )}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {(() => {
                                      const price = quote.options?.shippingPrice || 0;
                                      return price.toFixed(2);
                                    })()}€
                                  </span>
                                  {canCalculateMbeShipping && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs"
                                      disabled={isCalculatingMbeShipping}
                                      onClick={async () => {
                                        try {
                                          setIsCalculatingMbeShipping(true);
                                          setMbeShippingRates(null);
                                          const res = await authenticatedFetch('/api/mbehub/quote-shipping-rates', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ quoteId: quote.id }),
                                          });
                                          const data = await res.json();
                                          if (!res.ok) throw new Error(data.error || 'Erreur API');
                                          if (data.success) {
                                            setMbeShippingRates({
                                              standard: data.standard || undefined,
                                              express: data.express || undefined,
                                            });
                                            toast.success('Tarifs MBE récupérés');
                                          } else {
                                            toast.error(data.error || 'Impossible de récupérer les tarifs');
                                          }
                                        } catch (e: unknown) {
                                          console.error('[QuoteDetail] Erreur calcul expédition MBE:', e);
                                          toast.error((e as Error)?.message || 'Erreur lors du calcul MBE');
                                        } finally {
                                          setIsCalculatingMbeShipping(false);
                                        }
                                      }}
                                      title="Calculer les tarifs Standard et Express via MBE Hub"
                                    >
                                      {isCalculatingMbeShipping ? '...' : 'MBE'}
                                    </Button>
                                  )}
                                </div>
                              </div>
                              {mbeShippingRates && (mbeShippingRates.standard || mbeShippingRates.express) && (
                                <div className="grid grid-cols-2 gap-2 mt-1 pl-2 border-l-2 border-muted">
                                  {mbeShippingRates.standard && (
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs text-muted-foreground">Standard</span>
                                      <div className="flex items-center gap-1">
                                        <span className="text-sm font-medium">{mbeShippingRates.standard.price.toFixed(2)}€</span>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-6 text-xs"
                                          disabled={isCalculatingMbeShipping}
                                          onClick={async () => {
                                            const p = mbeShippingRates!.standard!.price;
                                            setIsCalculatingMbeShipping(true);
                                            try {
                                              const pkg = quote.options?.packagingPrice ?? quote.auctionSheet?.recommendedCarton?.price ?? 0;
                                              if (pkg <= 0) {
                                                toast.error('Prix d\'emballage manquant. Renseignez un carton pour ce devis.');
                                                return;
                                              }
                                              setQuote(prev => prev ? { ...prev, options: { ...prev.options, shippingPrice: p } } : prev);
                                              await setDoc(doc(db, 'quotes', quote.id), { options: { ...(quote.options || {}), shippingPrice: p }, updatedAt: Timestamp.now() }, { merge: true });
                                              const insuranceAmount = computeInsuranceAmount(quote.declaredValue ?? quote.lot?.value ?? 0, quote.options?.insurance, quote.options?.insuranceAmount);
                                              const total = pkg + p + insuranceAmount;
                                              const paiements = await getPaiements(quote.id);
                                              const principalTypes = ['PRINCIPAL', 'PRINCIPAL_STANDARD', 'PRINCIPAL_EXPRESS'];
                                              for (const paiement of paiements) {
                                                if (principalTypes.includes((paiement as { type?: string }).type || '') && paiement.status !== 'PAID' && paiement.status !== 'CANCELLED') {
                                                  await cancelPaiement(paiement.id);
                                                }
                                              }
                                              await createPaiement(quote.id, {
                                                amount: total,
                                                type: 'PRINCIPAL_STANDARD',
                                                description: `Devis ${quote.reference || quote.id} - Standard`,
                                              });
                                              await setDoc(doc(db, 'quotes', quote.id), { totalAmount: total, updatedAt: Timestamp.now() }, { merge: true });
                                              setQuote(prev => prev ? { ...prev, totalAmount: total } : prev);
                                              queryClient.invalidateQueries({ queryKey: ['quotes'] });
                                              setPaiementsRefreshKey((k) => k + 1);
                                              toast.success(`Prix Standard appliqué et lien de paiement créé (${total.toFixed(2)}€)`);
                                            } catch (e) {
                                              console.error('[QuoteDetail] Erreur appliquer Standard + créer lien:', e);
                                              toast.error((e as Error)?.message || 'Erreur lors de la création du lien');
                                            } finally {
                                              setIsCalculatingMbeShipping(false);
                                            }
                                          }}
                                        >
                                          Appliquer
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                  {mbeShippingRates.express && (
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs text-muted-foreground">Express</span>
                                      <div className="flex items-center gap-1">
                                        <span className="text-sm font-medium">{mbeShippingRates.express.price.toFixed(2)}€</span>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-6 text-xs"
                                          disabled={isCalculatingMbeShipping}
                                          onClick={async () => {
                                            const p = mbeShippingRates!.express!.price;
                                            setIsCalculatingMbeShipping(true);
                                            try {
                                              const pkg = quote.options?.packagingPrice ?? quote.auctionSheet?.recommendedCarton?.price ?? 0;
                                              if (pkg <= 0) {
                                                toast.error('Prix d\'emballage manquant. Renseignez un carton pour ce devis.');
                                                return;
                                              }
                                              setQuote(prev => prev ? { ...prev, options: { ...prev.options, shippingPrice: p } } : prev);
                                              await setDoc(doc(db, 'quotes', quote.id), { options: { ...(quote.options || {}), shippingPrice: p }, updatedAt: Timestamp.now() }, { merge: true });
                                              const insuranceAmount = computeInsuranceAmount(quote.declaredValue ?? quote.lot?.value ?? 0, quote.options?.insurance, quote.options?.insuranceAmount);
                                              const total = pkg + p + insuranceAmount;
                                              const paiements = await getPaiements(quote.id);
                                              const principalTypes = ['PRINCIPAL', 'PRINCIPAL_STANDARD', 'PRINCIPAL_EXPRESS'];
                                              for (const paiement of paiements) {
                                                if (principalTypes.includes((paiement as { type?: string }).type || '') && paiement.status !== 'PAID' && paiement.status !== 'CANCELLED') {
                                                  await cancelPaiement(paiement.id);
                                                }
                                              }
                                              await createPaiement(quote.id, {
                                                amount: total,
                                                type: 'PRINCIPAL_EXPRESS',
                                                description: `Devis ${quote.reference || quote.id} - Express`,
                                              });
                                              await setDoc(doc(db, 'quotes', quote.id), { totalAmount: total, updatedAt: Timestamp.now() }, { merge: true });
                                              setQuote(prev => prev ? { ...prev, totalAmount: total } : prev);
                                              queryClient.invalidateQueries({ queryKey: ['quotes'] });
                                              setPaiementsRefreshKey((k) => k + 1);
                                              toast.success(`Prix Express appliqué et lien de paiement créé (${total.toFixed(2)}€)`);
                                            } catch (e) {
                                              console.error('[QuoteDetail] Erreur appliquer Express + créer lien:', e);
                                              toast.error((e as Error)?.message || 'Erreur lors de la création du lien');
                                            } finally {
                                              setIsCalculatingMbeShipping(false);
                                            }
                                          }}
                                        >
                                          Appliquer
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Assurance - toujours affichée */}
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Assurance</span>
                          <span className="font-medium">
                            {safeQuote.options.insurance ? (
                              <Badge variant="success" className="text-xs">Oui</Badge>
                            ) : (
                              <span className="text-muted-foreground">Non</span>
                            )}
                          </span>
                        </div>
                        {safeQuote.options.insurance && (
                          <>
                            <div className="flex justify-between text-sm pl-4">
                              <span className="text-muted-foreground">Valeur assurée</span>
                              <span className="font-medium">{(safeQuote.declaredValue ?? safeQuote.lot.value ?? 0).toFixed(2)}€</span>
                            </div>
                            <div className="flex justify-between text-sm pl-4">
                              <span className="text-muted-foreground">Coût assurance</span>
                              <span className="font-medium">
                                {computeInsuranceAmount(
                                  safeQuote.declaredValue ?? safeQuote.lot.value ?? 0,
                                  safeQuote.options.insurance,
                                  safeQuote.options.insuranceAmount
                                ).toFixed(2)}€
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <Separator />

                    {/* Total */}
                    <div className="flex justify-between font-semibold text-base">
                      <span>Total</span>
                      <span>
                        {(() => {
                          // Utiliser le prix du carton depuis auctionSheet.recommendedCarton si disponible
                          // Sinon utiliser quote.options.packagingPrice comme fallback
                          const cartonPrice = safeQuote.auctionSheet?.recommendedCarton?.price || 
                                              (safeQuote.auctionSheet?.recommendedCarton as any)?.priceTTC || 
                                              null;
                          const packagingPrice = cartonPrice !== null ? cartonPrice : (safeQuote.options.packagingPrice || 0);
                          const shippingPrice = safeQuote.options.shippingPrice || 0;
                          const insuranceAmount = computeInsuranceAmount(
                            safeQuote.declaredValue ?? safeQuote.lot.value ?? 0,
                            safeQuote.options.insurance,
                            safeQuote.options.insuranceAmount
                          );
                          const total = packagingPrice + shippingPrice + insuranceAmount;
                          console.log('[QuoteDetail] 💰 Calcul total affiché:', {
                            packagingPrice,
                            cartonPrice,
                            quotePackagingPrice: safeQuote.options.packagingPrice,
                            shippingPrice,
                            insuranceAmount,
                            total,
                            insurance: safeQuote.options.insurance,
                            insuranceAmountRaw: safeQuote.options.insuranceAmount,
                          });
                          return total.toFixed(2);
                        })()}€
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Stripe Connect Paiements - Gestion automatique des paiements */}
                <QuotePaiements devisId={safeQuote.id} quote={safeQuote} refreshKey={paiementsRefreshKey} />
              </TabsContent>

              <TabsContent value="messages" className="space-y-6 mt-6">
                <EmailMessagesTab quoteId={safeQuote.id} clientEmail={safeQuote.client.email} onSendEmail={handleSendEmail} />
              </TabsContent>

              <TabsContent value="notes" className="space-y-6 mt-6">
                {/* Internal Notes */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Notes internes
                      </CardTitle>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="gap-1"
                        onClick={() => setIsAddNoteDialogOpen(true)}
                      >
                        <Plus className="w-4 h-4" />
                        Ajouter
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {(safeQuote.internalNotes?.length || 0) === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Aucune note interne
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {safeQuote.internalNotes.map((note, i) => (
                          <li key={i} className="text-sm p-2 bg-secondary/50 rounded flex items-start justify-between gap-2">
                            <span className="flex-1">{note}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={async () => {
                                if (!confirm('Êtes-vous sûr de vouloir supprimer cette note ?')) {
                                  return;
                                }
                                try {
                                  const updatedNotes = safeQuote.internalNotes.filter((_, index) => index !== i);
                                  await setDoc(
                                    doc(db, "quotes", safeQuote.id),
                                    {
                                      internalNotes: updatedNotes,
                                      updatedAt: Timestamp.now(),
                                    },
                                    { merge: true }
                                  );
                                  
                                  setQuote(prev => prev ? {
                                    ...prev,
                                    internalNotes: updatedNotes,
                                  } : prev);
                                  
                                  queryClient.invalidateQueries({ queryKey: ['quotes'] });
                                  toast.success("Note supprimée");
                                } catch (error) {
                                  console.error("[Notes] Erreur lors de la suppression:", error);
                                  toast.error("Erreur lors de la suppression de la note");
                                }
                              }}
                            >
                              <XCircle className="w-3 h-3" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                {/* Auction House Comments */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      Commentaires salle des ventes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(safeQuote.auctionHouseComments?.length || 0) === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Aucun commentaire
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {safeQuote.auctionHouseComments.map((comment, i) => (
                          <li key={i} className="text-sm p-2 bg-warning/10 rounded border-l-2 border-warning">
                            {comment}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar - Timeline */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Historique
                </CardTitle>
              </CardHeader>
              <CardContent>
                <QuoteTimeline events={safeQuote.timeline} />
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Bouton "Vérifier" - affiché uniquement si le devis est en "À vérifier" */}
                {safeQuote.status === 'to_verify' && (
                  <Button 
                    variant="outline" 
                    className="w-full justify-start gap-2"
                    onClick={handleVerifyQuote}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Vérifier
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-2"
                  onClick={() => setIsAuctionSheetDialogOpen(true)}
                >
                  <FileCheck className="w-4 h-4" />
                  {safeQuote.auctionSheet ? 'Voir bordereau' : 'Attacher bordereau'}
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-2"
                  onClick={() => setIsEditDialogOpen(true)}
                >
                  <Edit className="w-4 h-4" />
                  Modifier le devis
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    const clientEmailRaw = safeQuote.client?.email || safeQuote.delivery?.contact?.email;
                    if (!clientEmailRaw?.trim()) {
                      toast.error('Email client manquant');
                      return;
                    }
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(clientEmailRaw.trim())) {
                      toast.error("Format d'email invalide");
                      return;
                    }
                    setIsSendQuoteDialogOpen(true);
                  }}
                >
                  <Mail className="w-4 h-4" />
                  Envoyer le devis
                </Button>
                {/* Bouton "Envoyer surcoût" - affiché uniquement s'il y a des surcoûts non payés */}
                {surchargePaiements.length > 0 && surchargePaiements.map((surcharge) => (
                  <Button
                    key={surcharge.id}
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => {
                      setSelectedSurchargeForDialog(surcharge);
                      setSurchargeReason('dimensions_reelles');
                      setSurchargeReasonOther('');
                      setIsSurchargeDialogOpen(true);
                    }}
                    disabled={isLoadingSurcharges}
                  >
                    <Send className="w-4 h-4" />
                    Envoyer surcoût ({surcharge.amount.toFixed(2)}€)
                  </Button>
                ))}
                {canSendReminder && (
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={handleSendReminder}
                    disabled={isSendingReminder}
                  >
                    {isSendingReminder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Envoyer une relance
                  </Button>
                )}
                {canMarkAbandoned && (
                  <Alert variant="default" className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Peut être marqué abandonné</AlertTitle>
                    <AlertDescription>
                      Relance envoyée il y a plus d'un mois sans réponse du client. Cliquez sur « Refusé par le client » et choisissez « Pas de réponse / Abandonné ».
                    </AlertDescription>
                  </Alert>
                )}
                {canMarkRefused && (
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => setIsRefusalDialogOpen(true)}
                    disabled={isRefusingQuote}
                  >
                    {isRefusingQuote ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    Refusé par le client
                  </Button>
                )}
                {canMarkPaidManually && (
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => setIsMarkPaidManualDialogOpen(true)}
                  >
                    <Banknote className="w-4 h-4" />
                    Marquer payé (virement/CB)
                  </Button>
                )}
                {canUnmarkPaid && (
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 text-amber-700 border-amber-300 hover:bg-amber-50"
                    onClick={handleUnmarkPaid}
                    disabled={isUnmarkingPaid}
                  >
                    {isUnmarkingPaid ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    Annuler paiement
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Dialogue Envoyer le devis - choix 1 lien ou 2 liens */}
      <Dialog
        open={isSendQuoteDialogOpen}
        onOpenChange={setIsSendQuoteDialogOpen}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Envoyer le devis</DialogTitle>
            <DialogDescription>
              Choisissez comment envoyer le devis au client
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const principalTypes = ['PRINCIPAL', 'PRINCIPAL_STANDARD', 'PRINCIPAL_EXPRESS'];
            const activePrincipalLink = (safeQuote.paymentLinks || []).find(
              (l: { type?: string; status?: string }) =>
                principalTypes.includes(l?.type || '') &&
                (l?.status === 'active' || l?.status === 'pending')
            ) as { type?: string; amount?: number } | undefined;
            const hasPrincipalLink = !!activePrincipalLink;
            const dims = safeQuote.lot?.dimensions || safeQuote.lot?.realDimensions || {};
            const hasDims = (dims.length ?? 0) > 0 && (dims.width ?? 0) > 0 && (dims.height ?? 0) > 0;
            const weight = safeQuote.totalWeight ?? dims.weight ?? 0;
            const addr = safeQuote.delivery?.address || {};
            const hasAddr = !!(addr.zip || addr.city || addr.country || safeQuote.client?.address);
            const canSendTwoLinks = showMbehubButton && hasDims && weight > 0 && hasAddr && !isPrincipalPaidForEdit;

            const allMsgs = [...customMsgPrincipales, ...customMsgOptionnelles];
            const hasMessages = customMsgPrincipales.length > 0 || customMsgOptionnelles.length > 0;

            const toggleMsg = (msg: CustomQuoteMessage) => {
              const isSelected = selectedMsgIds.includes(msg.id);
              const newIds = isSelected
                ? selectedMsgIds.filter((id) => id !== msg.id)
                : [...selectedMsgIds, msg.id];
              setSelectedMsgIds(newIds);
              // Reconstruire le texte dans l'ordre : principaux sélectionnés, puis optionnels sélectionnés
              const principauxSelected = customMsgPrincipales.filter((m) => newIds.includes(m.id));
              const optionnellesSelected = customMsgOptionnelles.filter((m) => newIds.includes(m.id));
              const ordered = [...principauxSelected, ...optionnellesSelected];
              setCustomMsgText(ordered.map((m) => (customMsgLang === 'en' ? m.textEn : m.textFr)).join('\n\n'));
            };

            const toggleLang = () => {
              const newLang = customMsgLang === 'fr' ? 'en' : 'fr';
              setCustomMsgLang(newLang);
              // Reconstruire le texte dans la nouvelle langue
              const principauxSelected = customMsgPrincipales.filter((m) => selectedMsgIds.includes(m.id));
              const optionnellesSelected = customMsgOptionnelles.filter((m) => selectedMsgIds.includes(m.id));
              const ordered = [...principauxSelected, ...optionnellesSelected];
              setCustomMsgText(ordered.map((m) => (newLang === 'en' ? m.textEn : m.textFr)).join('\n\n'));
            };

            const customMessagesBlock = (
              <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Message personnalisé (optionnel)</p>
                  {!isLoadingCustomMsgs && hasMessages && (
                    <Button
                      variant={customMsgLang === 'en' ? 'default' : 'outline'}
                      size="sm"
                      className="h-6 px-2 text-xs gap-1"
                      onClick={toggleLang}
                    >
                      {customMsgLang === 'fr' ? '🇬🇧 EN' : '🇫🇷 FR'}
                    </Button>
                  )}
                </div>
                {isLoadingCustomMsgs ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />Chargement…
                  </div>
                ) : !hasMessages ? (
                  <p className="text-xs text-muted-foreground">Aucun message configuré. Ajoutez des messages dans Paramètres &gt; Messages personnalisés.</p>
                ) : (
                  <div className="space-y-2">
                    {customMsgPrincipales.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Principaux</p>
                        <div className="flex flex-wrap gap-1.5">
                          {customMsgPrincipales.map((msg) => {
                            const sel = selectedMsgIds.includes(msg.id);
                            return (
                              <button
                                key={msg.id}
                                type="button"
                                onClick={() => toggleMsg(msg)}
                                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${sel ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
                              >
                                {msg.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {customMsgOptionnelles.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Optionnels</p>
                        <div className="flex flex-wrap gap-1.5">
                          {customMsgOptionnelles.map((msg) => {
                            const sel = selectedMsgIds.includes(msg.id);
                            return (
                              <button
                                key={msg.id}
                                type="button"
                                onClick={() => toggleMsg(msg)}
                                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${sel ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
                              >
                                {msg.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {selectedMsgIds.length > 0 && (
                      <textarea
                        className="w-full min-h-[90px] rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                        value={customMsgText}
                        onChange={(e) => setCustomMsgText(e.target.value)}
                        placeholder="Texte du message…"
                      />
                    )}
                  </div>
                )}
              </div>
            );

            if (!hasPrincipalLink) {
              return (
                <div className="space-y-4">
                  {customMessagesBlock}
                  <p className="text-sm text-muted-foreground">
                    {canSendTwoLinks
                      ? "Créez d'abord un lien en cliquant sur Appliquer, ou envoyez avec 2 liens."
                      : "Créez d'abord un lien en cliquant sur Appliquer."}
                  </p>
                  <div className="flex flex-col gap-2">
                    {canSendTwoLinks && (
                      <Button
                        className="w-full"
                        disabled={isSendingQuote}
                        onClick={async () => {
                          setIsSendingQuote(true);
                          try {
                            await handleSendEmailWithTwoLinks();
                            setIsSendQuoteDialogOpen(false);
                          } finally {
                            setIsSendingQuote(false);
                          }
                        }}
                      >
                        {isSendingQuote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                        Envoyer avec 2 liens (Standard + Express)
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => setIsSendQuoteDialogOpen(false)}>
                      Fermer
                    </Button>
                  </div>
                </div>
              );
            }

            const linkLabel = activePrincipalLink.type === 'PRINCIPAL_EXPRESS' ? 'Express' : activePrincipalLink.type === 'PRINCIPAL_STANDARD' ? 'Standard' : 'Paiement';
            const linkAmount = activePrincipalLink.amount ?? safeQuote.totalAmount ?? 0;

            return (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                  <p className="font-medium">Récapitulatif</p>
                  <p>Total : {(safeQuote.totalAmount ?? 0).toFixed(2)}€</p>
                  <p>Livraison : {linkLabel}</p>
                </div>
                {customMessagesBlock}
                <div className="flex flex-col gap-2">
                  <Button
                    className="w-full justify-start gap-2"
                    disabled={isSendingQuote}
                    onClick={async () => {
                      setIsSendingQuote(true);
                      try {
                        await handleSendEmail();
                        setIsSendQuoteDialogOpen(false);
                      } finally {
                        setIsSendingQuote(false);
                      }
                    }}
                  >
                    {isSendingQuote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    Envoyer le lien {linkLabel} ({linkAmount.toFixed(2)}€)
                  </Button>
                  {canSendTwoLinks && (
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      disabled={isSendingQuote}
                      onClick={async () => {
                        setIsSendingQuote(true);
                        try {
                          await handleSendEmailWithTwoLinks();
                          setIsSendQuoteDialogOpen(false);
                        } finally {
                          setIsSendingQuote(false);
                        }
                      }}
                    >
                      {isSendingQuote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                      Envoyer avec 2 liens (Standard + Express)
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setIsSendQuoteDialogOpen(false)}>
                    Annuler
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Dialogue pour attacher le bordereau */}
      <Dialog open={isAuctionSheetDialogOpen} onOpenChange={setIsAuctionSheetDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Attacher un bordereau d'adjudication</DialogTitle>
            <DialogDescription>
              Téléversez et analysez un bordereau d'adjudication pour enrichir automatiquement les informations du devis.
            </DialogDescription>
          </DialogHeader>
          <AttachAuctionSheet
            quoteId={quote?.id}
            onAnalysisComplete={(analysis, file) => {
              handleAuctionSheetAnalysis(analysis, file);
              if (analysis.totalLots > 0) {
                setIsAuctionSheetDialogOpen(false);
              }
            }}
            existingAnalysis={auctionSheetAnalysis || undefined}
            fileName={safeQuote.auctionSheet?.fileName || (safeQuote.auctionSheet ? 'Bordereau attaché' : undefined)}
            bordereauFileName={(safeQuote as { bordereauFileName?: string }).bordereauFileName}
            bordereauId={safeQuote.bordereauId}
            bordereauLink={(safeQuote as { bordereauLink?: string }).bordereauLink}
            driveFileIdFromLink={(safeQuote as { driveFileIdFromLink?: string }).driveFileIdFromLink}
            onRetryOCR={() => triggerBordereauProcess(true)}
          />
        </DialogContent>
      </Dialog>

      {/* Dialogue refus client */}
      <Dialog open={isRefusalDialogOpen} onOpenChange={setIsRefusalDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Refusé par le client</DialogTitle>
            <DialogDescription>
              Indiquez la raison du refus pour ce devis.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-medium">Raison</Label>
              <RadioGroup
                value={refusalReason}
                onValueChange={(v) => setRefusalReason(v as ClientRefusalReason)}
                className="mt-2 space-y-2"
              >
                {REFUSAL_REASONS.map((r) => (
                  <div key={r.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={r.value} id={`refusal-${r.value}`} />
                    <Label htmlFor={`refusal-${r.value}`} className="font-normal cursor-pointer">
                      {r.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div>
              <Label htmlFor="refusal-detail" className="text-sm font-medium">
                Précisions (optionnel)
              </Label>
              <Textarea
                id="refusal-detail"
                placeholder="Ex. : délai trop long, changement de projet..."
                value={refusalReasonDetail}
                onChange={(e) => setRefusalReasonDetail(e.target.value)}
                className="mt-2 min-h-[80px]"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsRefusalDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleRefusalDialogSubmit} disabled={isRefusingQuote}>
                {isRefusingQuote ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Confirmer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialogue envoyer surcoût - sélection de la raison */}
      <Dialog open={isSurchargeDialogOpen} onOpenChange={(open) => {
        setIsSurchargeDialogOpen(open);
        if (!open) setSelectedSurchargeForDialog(null);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Envoyer le surcoût</DialogTitle>
            <DialogDescription>
              {selectedSurchargeForDialog
                ? `Surcoût de ${selectedSurchargeForDialog.amount.toFixed(2)} € – Indiquez la raison du surcoût pour l'email au client.`
                : 'Sélectionnez la raison du surcoût.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-medium">Raison du surcoût</Label>
              <Select value={surchargeReason} onValueChange={setSurchargeReason}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Choisir une raison" />
                </SelectTrigger>
                <SelectContent>
                  {SURCHARGE_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {surchargeReason === 'autre' && (
              <div>
                <Label htmlFor="surcharge-reason-other" className="text-sm font-medium">
                  Précisez la raison
                </Label>
                <Input
                  id="surcharge-reason-other"
                  placeholder="Ex. : modification d'adresse..."
                  value={surchargeReasonOther}
                  onChange={(e) => setSurchargeReasonOther(e.target.value)}
                  className="mt-2"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsSurchargeDialogOpen(false)}>
                Annuler
              </Button>
              <Button
                onClick={async () => {
                  if (!selectedSurchargeForDialog) return;
                  const description = surchargeReason === 'autre'
                    ? surchargeReasonOther.trim()
                    : SURCHARGE_REASONS.find((r) => r.value === surchargeReason)?.label ?? '';
                  if (surchargeReason === 'autre' && !description) {
                    toast.error('Veuillez préciser la raison du surcoût');
                    return;
                  }
                  await handleSendSurchargeEmail(selectedSurchargeForDialog, description || undefined);
                  setIsSurchargeDialogOpen(false);
                  setSelectedSurchargeForDialog(null);
                  setPaiementsRefreshKey((k) => k + 1);
                }}
                disabled={isSendingSurchargeEmail}
              >
                {isSendingSurchargeEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Envoyer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialogue marquer payé (virement/CB) */}
      <MarkPaidManualDialog
        open={isMarkPaidManualDialogOpen}
        onOpenChange={setIsMarkPaidManualDialogOpen}
        quoteId={quote?.id || ''}
        quoteReference={safeQuote.reference}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['quotes'] });
          toast.success('Devis marqué payé – en attente de collecte');
        }}
      />

      {/* Dialogue pour modifier le devis */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier le devis</DialogTitle>
            <DialogDescription>
              Modifiez les informations du devis. Les modifications seront sauvegardées dans Firestore.
            </DialogDescription>
          </DialogHeader>
          {quote && (
            <EditQuoteForm
              quote={quote}
              isPrincipalPaid={isPrincipalPaidForEdit}
              useMbehubForShipping={useMbehubForShipping}
              onPaymentLinkCreated={() => {
                // Forcer le rechargement des paiements dans QuotePaiements
                setPaiementsRefreshKey(prev => prev + 1);
              }}
              onSave={async (updatedQuote) => {
                setIsSaving(true);
                try {
                  // Construire l'objet deliveryAddress en excluant les champs undefined
                  const deliveryAddress = updatedQuote.delivery?.address ? {
                    line1: updatedQuote.delivery.address.line1 || null,
                    ...(updatedQuote.delivery.address.line2 ? { line2: updatedQuote.delivery.address.line2 } : {}),
                    ...(updatedQuote.delivery.address.city ? { city: updatedQuote.delivery.address.city } : {}),
                    ...(updatedQuote.delivery.address.zip ? { zip: updatedQuote.delivery.address.zip } : {}),
                    ...(updatedQuote.delivery.address.country ? { country: updatedQuote.delivery.address.country } : {}),
                    ...(updatedQuote.delivery.address.state ? { state: updatedQuote.delivery.address.state } : {}),
                  } : null;

                  // Sauvegarder dans Firestore
                  console.log('[EditQuote] Sauvegarde des modifications dans Firestore:', {
                    quoteId: quote.id,
                    reference: quote.reference,
                    clientName: updatedQuote.client.name,
                    clientEmail: updatedQuote.client.email,
                    clientPhone: updatedQuote.client.phone,
                    clientAddress: updatedQuote.client.address,
                    lotDescription: updatedQuote.lot.description,
                  });
                  
                  // Construire l'objet auctionSheet pour Firestore
                  const auctionSheetData: any = {};
                  if (updatedQuote.auctionSheet) {
                    if (updatedQuote.auctionSheet.recommendedCarton) {
                      auctionSheetData.recommendedCarton = {
                        id: updatedQuote.auctionSheet.recommendedCarton.id || null,
                        ref: updatedQuote.auctionSheet.recommendedCarton.ref || null,
                        inner_length: updatedQuote.auctionSheet.recommendedCarton.inner_length || null,
                        inner_width: updatedQuote.auctionSheet.recommendedCarton.inner_width || null,
                        inner_height: updatedQuote.auctionSheet.recommendedCarton.inner_height || null,
                        price: updatedQuote.auctionSheet.recommendedCarton.price || null,
                        priceTTC: updatedQuote.auctionSheet.recommendedCarton.priceTTC || null,
                      };
                    }
                    // Conserver les autres propriétés de auctionSheet si elles existent
                    if (updatedQuote.auctionSheet.totalLots !== undefined) {
                      auctionSheetData.totalLots = updatedQuote.auctionSheet.totalLots;
                    }
                    if (updatedQuote.auctionSheet.totalObjects !== undefined) {
                      auctionSheetData.totalObjects = updatedQuote.auctionSheet.totalObjects;
                    }
                    if (updatedQuote.auctionSheet.auctionHouse) {
                      auctionSheetData.auctionHouse = updatedQuote.auctionSheet.auctionHouse;
                    }
                    if (updatedQuote.auctionSheet.auctionDate) {
                      auctionSheetData.auctionDate = updatedQuote.auctionSheet.auctionDate;
                    }
                    // Persistance bordereauNumber et lots (fix H-D)
                    if (updatedQuote.auctionSheet.bordereauNumber !== undefined) {
                      auctionSheetData.bordereauNumber = updatedQuote.auctionSheet.bordereauNumber;
                    }
                    if (Array.isArray(updatedQuote.auctionSheet.lots)) {
                      auctionSheetData.lots = updatedQuote.auctionSheet.lots;
                    }
                  }

                  await setDoc(
                    doc(db, "quotes", quote.id),
                    {
                      quoteId: quote.id,
                      updatedAt: Timestamp.now(),
                      // Informations client
                      clientName: updatedQuote.client.name,
                      clientEmail: updatedQuote.client.email,
                      clientPhone: updatedQuote.client.phone || null,
                      clientAddress: updatedQuote.client.address || null,
                      // Informations du lot
                      lotNumber: updatedQuote.lot.number,
                      lotDescription: updatedQuote.lot.description,
                      lotValue: updatedQuote.lot.value,
                      lotAuctionHouse: updatedQuote.lot.auctionHouse,
                      lotDimensions: {
                        length: updatedQuote.lot.dimensions.length,
                        width: updatedQuote.lot.dimensions.width,
                        height: updatedQuote.lot.dimensions.height,
                        weight: updatedQuote.lot.dimensions.weight,
                        estimated: updatedQuote.lot.dimensions.estimated,
                      },
                      lotVolumetricWeight: updatedQuote.lot.volumetricWeight || null,
                      // Prix
                      packagingPrice: updatedQuote.options.packagingPrice || null,
                      shippingPrice: updatedQuote.options.shippingPrice || null,
                      insuranceAmount: updatedQuote.options.insuranceAmount || null,
                      insurance: updatedQuote.options.insurance || false,
                      totalAmount: updatedQuote.totalAmount || null,
                      // Informations de livraison
                      deliveryMode: updatedQuote.delivery?.mode || null,
                      deliveryContactName: updatedQuote.delivery?.contact?.name || null,
                      deliveryContactEmail: updatedQuote.delivery?.contact?.email || null,
                      deliveryContactPhone: updatedQuote.delivery?.contact?.phone || null,
                      deliveryAddress: deliveryAddress,
                      // Carton sélectionné
                      cartonId: updatedQuote.cartonId || null,
                      // Facture professionnelle
                      wantsProfessionalInvoice: updatedQuote.wantsProfessionalInvoice ?? null,
                      // Valeur totale déclarée (inclut frais de la salle des ventes, pour assurance)
                      declaredValue: updatedQuote.declaredValue ?? null,
                      // AuctionSheet avec recommendedCarton
                      ...(Object.keys(auctionSheetData).length > 0 ? { auctionSheet: auctionSheetData } : {}),
                      // Timeline (si nouvel événement ajouté, ex. changement d'adresse)
                      ...(updatedQuote.timeline && updatedQuote.timeline.length > 0
                        ? { timeline: updatedQuote.timeline.map((e: any) => timelineEventToFirestore(e)) }
                        : {}),
                    },
                    { merge: true }
                  );

                  // Mettre à jour le state local AVANT l'invalidation pour un feedback immédiat
                  setQuote(updatedQuote);
                  
                  // Enregistrer le temps de sauvegarde pour empêcher le resync pendant 5 secondes
                  // Cela laisse le temps aux données d'être récupérées depuis Firestore
                  const saveTime = Date.now();
                  setLastSaveTime(saveTime);
                  
                  // Attendre un peu pour que Firestore soit à jour (latence de propagation)
                  await new Promise(resolve => setTimeout(resolve, 500));
                  
                  // Invalider et refetch le cache React Query pour forcer le refetch avec les nouvelles données Firestore
                  // Utiliser refetchQueries pour attendre la fin du refetch
                  await queryClient.refetchQueries({ queryKey: ['quotes'] });
                  
                  // Attendre que les données fusionnées soient disponibles dans le cache
                  // On attend jusqu'à 5 secondes pour que les données soient prêtes
                  let attempts = 0;
                  const maxAttempts = 50; // 5 secondes max (50 * 100ms)
                  let foundMatchingQuote = false;
                  while (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    // Récupérer le foundQuote actuel depuis le cache React Query
                    const queryData = queryClient.getQueryData<Quote[]>(['quotes']);
                    const currentFoundQuote = queryData?.find((q) => q.id === quote.id);
                    if (currentFoundQuote) {
                      // Vérifier que les champs modifiés sont présents dans foundQuote
                      const emailMatches = currentFoundQuote.client.email === updatedQuote.client.email;
                      const nameMatches = currentFoundQuote.client.name === updatedQuote.client.name;
                      const descriptionMatches = currentFoundQuote.lot.description === updatedQuote.lot.description;
                      const cartonMatches = currentFoundQuote.cartonId === updatedQuote.cartonId;
                      const totalMatches = Math.abs((currentFoundQuote.totalAmount || 0) - (updatedQuote.totalAmount || 0)) < 0.01;
                      
                      // Si au moins 3 champs correspondent (ou si le carton et le total correspondent), on considère que c'est bon
                      const matchesCount = [emailMatches, nameMatches, descriptionMatches, cartonMatches, totalMatches].filter(Boolean).length;
                      if (matchesCount >= 3 || (cartonMatches && totalMatches)) {
                        console.log('[EditQuote] ✅ Champs modifiés détectés dans foundQuote après', attempts * 100, 'ms', {
                          emailMatches,
                          nameMatches,
                          descriptionMatches,
                          cartonMatches,
                          totalMatches,
                          matchesCount
                        });
                        // Mettre à jour le state avec les données fusionnées
                        setQuote(currentFoundQuote);
                        foundMatchingQuote = true;
                        break;
                      }
                    }
                    attempts++;
                  }
                  
                  // Si on n'a pas trouvé de quote correspondant après l'attente, garder les modifications locales
                  if (!foundMatchingQuote) {
                    console.warn('[EditQuote] ⚠️ Champs modifiés non trouvés dans foundQuote après', maxAttempts * 100, 'ms, conservation des modifications locales');
                    // Garder updatedQuote qui contient les modifications
                    setQuote(updatedQuote);
                  }
                  
                  // Réinitialiser lastSaveTime après un délai plus long pour permettre le resync avec les données fusionnées
                  // On attend 5 secondes pour s'assurer que les données sont bien fusionnées et que le resync ne les écrase pas
                  setTimeout(() => {
                    setLastSaveTime(null);
                  }, 5000);
                  
                  syncQuoteToBilan();
                  toast.success("Devis modifié avec succès");
                  setIsEditDialogOpen(false);
                } catch (error) {
                  console.error("[EditQuote] Erreur lors de la sauvegarde:", error);
                  toast.error("Erreur lors de la sauvegarde des modifications");
                } finally {
                  setIsSaving(false);
                }
              }}
              onCancel={() => setIsEditDialogOpen(false)}
              isSaving={isSaving}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialogue pour ajouter une note interne */}
      <Dialog open={isAddNoteDialogOpen} onOpenChange={setIsAddNoteDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ajouter une note interne</DialogTitle>
            <DialogDescription>
              Ajoutez une note interne pour ce devis. Cette note ne sera visible que par l'équipe.
            </DialogDescription>
          </DialogHeader>
          {quote && (
            <AddNoteForm
              quote={safeQuote}
              onSave={async (noteText) => {
                try {
                  const updatedNotes = [...safeQuote.internalNotes, noteText];
                  await setDoc(
                    doc(db, "quotes", safeQuote.id),
                    {
                      internalNotes: updatedNotes,
                      updatedAt: Timestamp.now(),
                    },
                    { merge: true }
                  );
                  
                  setQuote(prev => prev ? {
                    ...prev,
                    internalNotes: updatedNotes,
                  } : prev);
                  
                  queryClient.invalidateQueries({ queryKey: ['quotes'] });
                  toast.success("Note ajoutée avec succès");
                  setIsAddNoteDialogOpen(false);
                } catch (error) {
                  console.error("[Notes] Erreur lors de l'ajout:", error);
                  toast.error("Erreur lors de l'ajout de la note");
                }
              }}
              onCancel={() => setIsAddNoteDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Composant pour l'onglet Messages (style messagerie: reçus à gauche, envoyés à droite)
interface EmailMessagesTabProps {
  quoteId: string;
  clientEmail: string;
  onSendEmail: () => void;
}

function getMessagePreview(message: EmailMessage, maxLines = 2): string {
  const text = message.bodyText || message.bodyHtml?.replace(/<[^>]*>/g, '') || '';
  const lines = text.split('\n').filter(Boolean);
  return lines.slice(0, maxLines).join(' ').slice(0, 120) + (lines.length > maxLines || text.length > 120 ? '…' : '');
}

function EmailMessagesTab({ quoteId, clientEmail, onSendEmail }: EmailMessagesTabProps) {
  const { data: messages = [], isLoading, isError } = useEmailMessages(quoteId);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground text-center">Chargement des messages...</p>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-destructive text-center" role="alert">
            Erreur lors du chargement des messages
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Historique des messages
            </CardTitle>
            <Button size="sm" className="gap-1" onClick={onSendEmail}>
              <Mail className="w-4 h-4" />
              Envoyer email
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aucun message
            </p>
          ) : (
            <div className="space-y-3 flex flex-col">
              {messages.map((message: EmailMessage) => {
                const isOut = message.direction === 'OUT';
                return (
                  <div
                    key={message.id}
                    className={cn(
                      'flex',
                      isOut ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedMessage(message)}
                      className={cn(
                        'max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-left transition-colors duration-200 cursor-pointer',
                        'hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                        'border border-border',
                        isOut
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium opacity-90">
                          {message.subject}
                        </span>
                        <Badge variant={isOut ? 'secondary' : 'outline'} className="text-[10px] h-4">
                          {message.source}
                        </Badge>
                      </div>
                      <p className="text-sm opacity-90 line-clamp-2 break-words">
                        {getMessagePreview(message)}
                      </p>
                      <span className="text-xs opacity-75 mt-1 block">
                        {new Date(message.receivedAt || message.createdAt).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedMessage} onOpenChange={(open) => !open && setSelectedMessage(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedMessage && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedMessage.direction === 'OUT' ? (
                    <Send className="w-4 h-4" />
                  ) : (
                    <Mail className="w-4 h-4" />
                  )}
                  {selectedMessage.subject}
                </DialogTitle>
                <DialogDescription>
                  De : {selectedMessage.from}
                  {(() => {
                    const toArray = Array.isArray(selectedMessage.to) ? selectedMessage.to : (selectedMessage.to ? [selectedMessage.to] : []);
                    return toArray.length > 0 && (
                      <> • À : {toArray.join(', ')}</>
                    );
                  })()}
                  {' • '}
                  {new Date(selectedMessage.receivedAt || selectedMessage.createdAt).toLocaleString('fr-FR')}
                </DialogDescription>
              </DialogHeader>
              <div className="text-sm text-foreground whitespace-pre-wrap break-words pt-2 border-t">
                {selectedMessage.bodyText || selectedMessage.bodyHtml?.replace(/<[^>]*>/g, '') || 'Aucun contenu'}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Composant formulaire pour ajouter une note
interface AddNoteFormProps {
  quote: Quote;
  onSave: (noteText: string) => Promise<void>;
  onCancel: () => void;
}

function AddNoteForm({ quote, onSave, onCancel }: AddNoteFormProps) {
  const [noteText, setNoteText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) {
      toast.error("La note ne peut pas être vide");
      return;
    }
    
    setIsSaving(true);
    try {
      await onSave(noteText.trim());
      setNoteText('');
    } catch (error) {
      // L'erreur est déjà gérée dans onSave
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="noteText">Note interne</Label>
        <Textarea
          id="noteText"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Saisissez votre note interne ici..."
          rows={6}
          required
        />
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          Annuler
        </Button>
        <Button type="submit" disabled={isSaving || !noteText.trim()}>
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? "Ajout..." : "Ajouter la note"}
        </Button>
      </div>
    </form>
  );
}

// Type local pour un lot dans le formulaire d'édition
type FormLot = {
  lotNumber: string;
  description: string;
  value: number;
};

// Composant formulaire d'édition
interface EditQuoteFormProps {
  quote: Quote;
  onSave: (updatedQuote: Quote) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
  onPaymentLinkCreated?: () => void;
  isPrincipalPaid?: boolean;
  useMbehubForShipping?: boolean; // Si true, ne pas recalculer l'expédition via la grille
}

function EditQuoteForm({ quote, onSave, onCancel, isSaving, onPaymentLinkCreated, isPrincipalPaid = false, useMbehubForShipping = false }: EditQuoteFormProps) {
  // Sécuriser les propriétés pour éviter les erreurs
  const safeQuote = {
    ...quote,
    client: quote.client || { id: '', name: '', email: '', phone: '', address: '' },
    lot: quote.lot || {
      id: '',
      number: '',
      description: '',
      dimensions: { length: 0, width: 0, height: 0, weight: 0, estimated: false },
      value: 0,
      photos: [],
      auctionHouse: ''
    },
    options: quote.options || { insurance: false, express: false, packagingPrice: 0, shippingPrice: 0, insuranceAmount: 0 },
    delivery: quote.delivery || { mode: 'client' as DeliveryMode, contact: { name: '', email: '', phone: '' }, address: { line1: '' } }
  };
  
  const [formData, setFormData] = useState({
    // Client
    clientName: safeQuote.client.name || '',
    clientEmail: safeQuote.client.email || '',
    clientPhone: safeQuote.client.phone || '',
    clientAddress: safeQuote.client.address || '',
    // Lot
    lotNumber: safeQuote.lot.number || '',
    lotDescription: safeQuote.lot.description || '',
    lotValue: Number(safeQuote.lot.value) || 0,
    lotAuctionHouse: safeQuote.lot.auctionHouse || '',
    // Dimensions
    lotLength: Number(safeQuote.lot.dimensions.length) || 0,
    lotWidth: Number(safeQuote.lot.dimensions.width) || 0,
    lotHeight: Number(safeQuote.lot.dimensions.height) || 0,
    lotWeight: Number(safeQuote.lot.dimensions.weight) || 0,
    // Prix
    packagingPrice: Number(safeQuote.options.packagingPrice) || 0,
    shippingPrice: Number(safeQuote.options.shippingPrice) || 0,
    insuranceAmount: Number(safeQuote.options.insuranceAmount) || 0,
    insurance: safeQuote.options.insurance || false,
    // Livraison
    deliveryMode: safeQuote.delivery?.mode || 'client',
    deliveryContactName: safeQuote.delivery.contact.name || '',
    deliveryContactEmail: safeQuote.delivery.contact.email || '',
    deliveryContactPhone: safeQuote.delivery.contact.phone || '',
    deliveryAddressLine1: safeQuote.delivery.address.line1 || '',
    deliveryAddressLine2: safeQuote.delivery.address.line2 || '',
    deliveryAddressCity: safeQuote.delivery.address.city || '',
    deliveryAddressZip: safeQuote.delivery.address.zip || '',
    deliveryAddressCountry: safeQuote.delivery.address.country || '',
    wantsProfessionalInvoice: safeQuote.wantsProfessionalInvoice ?? null,
    bordereauNumber: quote.auctionSheet?.bordereauNumber || '',
    declaredValue: (() => {
      if (quote.declaredValue != null && quote.declaredValue > 0) return Number(quote.declaredValue);
      // Fallback : somme des lots du bordereau ou valeur du lot unique
      if (quote.auctionSheet?.lots && quote.auctionSheet.lots.length > 0) {
        return quote.auctionSheet.lots.reduce((s, l) => s + (l.value ?? (l as any).total ?? 0), 0);
      }
      return Number(safeQuote.lot.value) || 0;
    })(),
  });

  // État pour la liste des lots éditable
  const [formLots, setFormLots] = useState<FormLot[]>(() => {
    if (quote.auctionSheet?.lots && quote.auctionSheet.lots.length > 0) {
      return quote.auctionSheet.lots.map((l) => ({
        lotNumber: l.lotNumber || '',
        description: l.description || '',
        value: l.value ?? (l as any).total ?? 0,
      }));
    }
    return [{
      lotNumber: safeQuote.lot.number || '',
      description: safeQuote.lot.description || '',
      value: Number(safeQuote.lot.value) || 0,
    }];
  });

  // Flag : l'utilisateur a-t-il surchargé manuellement la valeur totale déclarée ?
  const [declaredValueManuallyEdited, setDeclaredValueManuallyEdited] = useState(false);

  // Recalcul automatique de declaredValue quand les lots changent (sauf surcharge manuelle)
  useEffect(() => {
    if (declaredValueManuallyEdited) return;
    const sum = formLots.reduce((s, l) => s + (l.value || 0), 0);
    setFormData((prev) => ({ ...prev, declaredValue: sum }));
  }, [formLots, declaredValueManuallyEdited]);

  // État pour le carton sélectionné
  // Initialiser avec le carton existant depuis auctionSheet.recommendedCarton ou cartonId
  const existingCartonRef = quote.auctionSheet?.recommendedCarton?.ref || 
                            (quote.auctionSheet?.recommendedCarton as any)?.label ||
                            null;
  const [selectedCartonId, setSelectedCartonId] = useState<string | null>(
    quote.cartonId || 
    (quote.auctionSheet?.recommendedCarton as any)?.id || 
    null
  );
  const [selectedCartonRef, setSelectedCartonRef] = useState<string | null>(existingCartonRef);
  const [isCreatingPaymentLink, setIsCreatingPaymentLink] = useState(false);

  // Gérer la sélection d'un carton
  const handleCartonSelect = async (carton: any) => {
    console.log('[EditQuote] Carton sélectionné:', carton);
    
    // Vérifier que les dimensions sont valides avant de calculer le poids volumétrique
    const length = Number(carton.inner_length) || 0;
    const width = Number(carton.inner_width) || 0;
    const height = Number(carton.inner_height) || 0;
    
    if (!length || !width || !height) {
      console.error('[EditQuote] ❌ Dimensions invalides pour le carton:', { length, width, height });
      toast.error('Dimensions du carton invalides');
      return;
    }
    
    // Calculer le poids volumétrique avec les dimensions validées
    const volumetricWeight = calculateVolumetricWeight(length, width, height);
    
    // Extraire le code pays pour le calcul du prix d'expédition
    let countryCode = '';
    const deliveryCountry = quote.delivery?.address?.country || '';
    const addressLine = quote.delivery?.address?.line1 || '';
    
    if (deliveryCountry) {
      // Mapping des noms de pays vers codes ISO
      const countryMap: Record<string, string> = {
        "france": "FR",
        "belgique": "BE",
        "belgium": "BE",
        "suisse": "CH",
        "switzerland": "CH",
        "allemagne": "DE",
        "germany": "DE",
        "espagne": "ES",
        "spain": "ES",
        "italie": "IT",
        "italy": "IT",
        "pays-bas": "NL",
        "netherlands": "NL",
        "royaume-uni": "GB",
        "united kingdom": "GB",
        "uk": "GB",
        "portugal": "PT",
        "autriche": "AT",
        "austria": "AT",
        "danemark": "DK",
        "denmark": "DK",
        "irlande": "IE",
        "ireland": "IE",
        "suède": "SE",
        "sweden": "SE",
        "finlande": "FI",
        "finland": "FI",
        "pologne": "PL",
        "poland": "PL",
        "république tchèque": "CZ",
        "czech republic": "CZ",
        "hongrie": "HU",
        "hungary": "HU",
        "brésil": "BR",
        "brazil": "BR",
        "argentine": "AR",
        "argentina": "AR",
        "chili": "CL",
        "chile": "CL",
        "colombie": "CO",
        "colombia": "CO",
        "pérou": "PE",
        "peru": "PE",
        "usa": "US",
        "united states": "US",
        "états-unis": "US",
        "canada": "CA",
        "mexique": "MX",
        "mexico": "MX",
      };
      const countryLower = deliveryCountry.toLowerCase().trim();
      countryCode = countryMap[countryLower] || deliveryCountry.toUpperCase().substring(0, 2);
    }
    
    if (!countryCode && addressLine) {
      const countryMatch = addressLine.match(/\b([A-Z]{2})\b/);
      if (countryMatch) {
        countryCode = countryMatch[1];
      }
    }
    
    // Recalculer le prix d'expédition (grille uniquement - si MBE Hub, garder le prix actuel)
    let newShippingPrice = formData.shippingPrice;
    if (!useMbehubForShipping && countryCode && volumetricWeight > 0) {
      try {
        const isExpress = true;
        console.log(`[EditQuote] 🔄 Recalcul prix expédition (grille): pays=${countryCode}, poidsVol=${volumetricWeight}kg`);
        newShippingPrice = await calculateShippingPrice(countryCode, volumetricWeight, isExpress);
        console.log(`[EditQuote] ✅ Nouveau prix expédition calculé: ${newShippingPrice}€`);
      } catch (error) {
        console.error('[EditQuote] ❌ Erreur lors du calcul du prix d\'expédition:', error);
      }
    } else if (useMbehubForShipping) {
      console.log(`[EditQuote] ℹ️ MBE Hub pour expédition: pas de recalcul grille`);
    } else {
      console.warn(`[EditQuote] ⚠️ Impossible de recalculer le prix d'expédition: pays=${countryCode}, poidsVol=${volumetricWeight}kg`);
    }
    
    // Mettre à jour les dimensions selon le carton (s'assurer que ce sont des nombres)
    const newFormData = {
      ...formData,
      lotLength: Number(carton.inner_length) || 0,
      lotWidth: Number(carton.inner_width) || 0,
      lotHeight: Number(carton.inner_height) || 0,
      lotWeight: Number(volumetricWeight) || 0, // Poids volumétrique automatique (modifiable ensuite)
      packagingPrice: Number(carton.packaging_price) || 0,
      shippingPrice: newShippingPrice, // Mettre à jour le prix d'expédition
    };
    
    setFormData(newFormData);
    setSelectedCartonId(carton.id);
    setSelectedCartonRef(carton.carton_ref);
    
    // Calculer le nouveau total
    const newTotal = newFormData.packagingPrice + newFormData.shippingPrice + (newFormData.insurance ? (newFormData.insuranceAmount || 0) : 0);
    const oldTotal = quote.totalAmount;
    
    // Construire le carton recommandé pour auctionSheet
    const recommendedCarton = {
      id: carton.id || undefined,
      ref: carton.carton_ref,
      inner_length: newFormData.lotLength,
      inner_width: newFormData.lotWidth,
      inner_height: newFormData.lotHeight,
      price: newFormData.packagingPrice,
      priceTTC: newFormData.packagingPrice,
    };
    
    // Construire l'objet devis mis à jour
    const updatedQuote: Quote = {
      ...quote,
      lot: {
        ...quote.lot,
        dimensions: {
          length: newFormData.lotLength,
          width: newFormData.lotWidth,
          height: newFormData.lotHeight,
          weight: newFormData.lotWeight,
          estimated: quote.lot.dimensions.estimated || false,
        },
        volumetricWeight: newFormData.lotWeight,
      },
      options: {
        ...quote.options,
        packagingPrice: newFormData.packagingPrice,
        shippingPrice: newFormData.shippingPrice,
      },
      auctionSheet: {
        ...(quote.auctionSheet || {}),
        recommendedCarton,
      },
      totalAmount: newTotal,
      cartonId: carton.id || undefined,
    };
    
    toast.success(`Carton ${carton.carton_ref} sélectionné. Sauvegarde en cours...`);
    
    try {
      // Sauvegarder dans Firestore
      await onSave(updatedQuote);
      
      console.log('[EditQuote] 📊 Comparaison totaux après sélection carton:', { oldTotal, newTotal, changed: newTotal !== oldTotal });
      
      // Si le total a changé, créer un nouveau paiement
      const totalChanged = Math.abs((newTotal || 0) - (oldTotal || 0)) > 0.01;
      
      if (totalChanged) {
        console.log('[EditQuote] 🔄 Début mise à jour des paiements...');
        
        try {
          // Invalider les anciens liens
          console.log('[EditQuote] 🔄 Annulation des anciens paiements...');
          const invalidatedCount = await invalidateActivePaymentLinks(quote.id);
          
          console.log('[EditQuote] ✅', invalidatedCount, 'paiement(s) annulé(s)');
          
          if (invalidatedCount > 0) {
            toast.info(`${invalidatedCount} ancien(s) paiement(s) annulé(s)`);
          }
          
          // Créer un nouveau lien
          console.log('[EditQuote] 🔄 Création nouveau paiement pour', newTotal, '€...');
          const newLink = await createNewPaymentLink(updatedQuote);
          
          console.log('[EditQuote] ✅ Nouveau paiement créé:', newLink);
          
          if (newLink) {
            toast.success('Nouveau lien de paiement créé avec succès !');
            // Attendre un peu pour que le paiement soit bien enregistré
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Notifier le parent pour forcer le rechargement des paiements
            if (onPaymentLinkCreated) {
              console.log('[EditQuote] 🔄 Notification parent pour rechargement paiements');
              onPaymentLinkCreated();
            }
          } else {
            console.warn('[EditQuote] ⚠️ Aucun lien créé (newLink est null/undefined)');
          }
        } catch (error) {
          console.error('[EditQuote] ❌ Erreur lors de la gestion des liens de paiement:', error);
          toast.error('Devis sauvegardé, mais erreur lors de la création du nouveau lien de paiement');
        }
      } else {
        console.log('[EditQuote] ℹ️ Aucune mise à jour des paiements nécessaire (total inchangé)');
      }
    } catch (error) {
      console.error('[EditQuote] ❌ Erreur lors de la sauvegarde automatique:', error);
      toast.error('Erreur lors de la sauvegarde automatique. Veuillez cliquer sur Enregistrer manuellement.');
    }
  };

  // Calculer le total du devis
  const calculateTotal = () => {
    const packagingPrice = formData.packagingPrice || 0;
    const shippingPrice = formData.shippingPrice || 0;
    const insuranceAmount = formData.insurance
      ? computeInsuranceAmount(formData.declaredValue || 0, true, formData.insuranceAmount > 0 ? formData.insuranceAmount : null)
      : 0;
    return packagingPrice + shippingPrice + insuranceAmount;
  };

  // Annuler tous les paiements actifs (PENDING) pour ce devis
  const invalidateActivePaymentLinks = async (quoteId: string) => {
    try {
      // Récupérer tous les paiements pour ce devis
      const paiements = await getPaiements(quoteId);
      
      // Filtrer les paiements principaux en attente
      const pendingPrincipalPaiements = paiements.filter(
        (p) => p.type === 'PRINCIPAL' && p.status === 'PENDING'
      );
      
      // Annuler chaque paiement en attente
      const cancelPromises = pendingPrincipalPaiements.map((paiement) =>
        cancelPaiement(paiement.id)
      );
      
      await Promise.all(cancelPromises);
      
      console.log(`[EditQuote] ${pendingPrincipalPaiements.length} paiement(s) principal(aux) annulé(s)`);
      
      return pendingPrincipalPaiements.length;
    } catch (error) {
      console.error('[EditQuote] Erreur lors de l\'annulation des paiements:', error);
      throw error;
    }
  };

  // Créer un nouveau paiement principal via l'API Stripe Connect
  const createNewPaymentLink = async (updatedQuote: Quote) => {
    try {
      setIsCreatingPaymentLink(true);
      
      // Utiliser le total depuis updatedQuote au lieu de calculateTotal()
      // car formData peut contenir des valeurs anciennes
      const newTotal = updatedQuote.totalAmount;
      
      console.log('[EditQuote] 🔄 Création nouveau paiement principal:', {
        quoteId: updatedQuote.id,
        reference: updatedQuote.reference,
        amount: newTotal,
        totalAmount: updatedQuote.totalAmount,
      });
      
      // Créer le paiement via l'API Stripe Connect (même système que QuotePaiements)
      const response = await createPaiement(updatedQuote.id, {
        amount: newTotal,
        type: 'PRINCIPAL',
        description: `Paiement principal du devis ${updatedQuote.reference || updatedQuote.id}`,
      });
      
      console.log('[EditQuote] ✅ Nouveau paiement principal créé:', {
        id: response.id,
        url: response.url,
        amount: newTotal,
      });
      
      return {
        id: response.id,
        url: response.url,
        amount: newTotal,
      };
    } catch (error) {
      console.error('[EditQuote] ❌ Erreur lors de la création du paiement:', error);
      console.error('[EditQuote] ❌ Détails erreur:', {
        message: (error as any)?.message,
        response: (error as any)?.response?.data,
        stack: (error as any)?.stack,
      });
      throw error;
    } finally {
      setIsCreatingPaymentLink(false);
    }
  };

  // Helper : extraire le code pays depuis les champs du formulaire
  const getCountryCodeFromForm = (fd: typeof formData): string => {
    const deliveryCountry = (fd.deliveryAddressCountry || '').trim();
    const addressLine = (fd.deliveryAddressLine1 || '').trim();
    const countryMap: Record<string, string> = {
      "france": "FR", "belgique": "BE", "belgium": "BE", "suisse": "CH", "switzerland": "CH",
      "allemagne": "DE", "germany": "DE", "espagne": "ES", "spain": "ES", "italie": "IT", "italy": "IT",
      "pays-bas": "NL", "netherlands": "NL", "royaume-uni": "GB", "united kingdom": "GB", "uk": "GB",
      "portugal": "PT", "autriche": "AT", "austria": "AT", "danemark": "DK", "denmark": "DK",
      "irlande": "IE", "ireland": "IE", "suède": "SE", "sweden": "SE", "finlande": "FI", "finland": "FI",
      "pologne": "PL", "poland": "PL", "usa": "US", "united states": "US", "états-unis": "US",
      "canada": "CA", "mexique": "MX", "mexico": "MX", "brésil": "BR", "brazil": "BR",
      "argentine": "AR", "argentina": "AR", "chili": "CL", "chile": "CL", "colombie": "CO", "colombia": "CO",
      "pérou": "PE", "peru": "PE", "hongrie": "HU", "hungary": "HU", "république tchèque": "CZ", "czech republic": "CZ",
    };
    if (deliveryCountry) {
      const code = countryMap[deliveryCountry.toLowerCase()] || deliveryCountry.toUpperCase().substring(0, 2);
      if (code) return code;
    }
    const match = addressLine.match(/\b([A-Z]{2})\b/);
    return match ? match[1] : '';
  };

  // Vérifier si l'adresse de destination a changé
  const hasAddressChanged = (): boolean => {
    const oldAddr = quote.delivery?.address || {};
    const o = (v: string | undefined) => (v || '').trim();
    return (
      o(oldAddr.line1) !== o(formData.deliveryAddressLine1) ||
      o(oldAddr.line2) !== o(formData.deliveryAddressLine2) ||
      o(oldAddr.city) !== o(formData.deliveryAddressCity) ||
      o(oldAddr.zip) !== o(formData.deliveryAddressZip) ||
      o(oldAddr.country) !== o(formData.deliveryAddressCountry)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalShippingPrice = formData.shippingPrice;
    let addressChanged = hasAddressChanged();

    // Si l'adresse a changé : recalculer le prix d'expédition
    if (addressChanged) {
      const volumetricWeight = formData.lotWeight || calculateVolumetricWeight(
        formData.lotLength || 0,
        formData.lotWidth || 0,
        formData.lotHeight || 0
      );
      const countryCode = getCountryCodeFromForm(formData);

      if (useMbehubForShipping && countryCode) {
        try {
          const dest = {
            zipCode: (formData.deliveryAddressZip || '').trim(),
            city: (formData.deliveryAddressCity || '').trim(),
            state: ((formData as any).deliveryAddressState || '').trim().slice(0, 2),
            country: countryCode,
          };
          const res = await authenticatedFetch('/api/mbehub/shipping-options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              destination: dest,
              weight: Math.max(volumetricWeight, 1),
              dimensions: {
                length: formData.lotLength || 10,
                width: formData.lotWidth || 10,
                height: formData.lotHeight || 10,
              },
              insurance: formData.insurance,
              insuranceValue: formData.insuranceAmount || 0,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const opts = data.options || [];
            const expressOpts = opts.filter((o: any) => /express/i.test(String(o.ServiceDesc || '')));
            const pickCheapest = (arr: any[]) => {
              if (!arr.length) return 0;
              return arr.reduce((a, b) => {
                const pa = Number(a?.GrossShipmentPrice ?? a?.NetShipmentPrice ?? 9999);
                const pb = Number(b?.GrossShipmentPrice ?? b?.NetShipmentPrice ?? 9999);
                return pa <= pb ? a : b;
              });
            };
            const express = pickCheapest(expressOpts);
            if (express) {
              finalShippingPrice = Number(express.GrossShipmentPrice ?? express.NetShipmentPrice ?? 0);
            }
          }
        } catch (err) {
          console.warn('[EditQuote] Erreur MBE Hub shipping-options:', err);
        }
      } else if (!useMbehubForShipping && countryCode && volumetricWeight > 0) {
        try {
          finalShippingPrice = await calculateShippingPrice(countryCode, volumetricWeight, true);
        } catch (err) {
          console.warn('[EditQuote] Erreur calcul expédition grille:', err);
        }
      }
    }

    const packagingPrice = formData.packagingPrice || 0;
    const insuranceAmount = formData.insurance
      ? computeInsuranceAmount(formData.declaredValue || 0, true, formData.insuranceAmount > 0 ? formData.insuranceAmount : null)
      : 0;
    const newTotal = packagingPrice + finalShippingPrice + insuranceAmount;
    const oldTotal = quote.totalAmount;
    
    // Construire l'objet carton recommandé pour l'auctionSheet
    const recommendedCarton = selectedCartonRef ? {
      id: selectedCartonId || undefined,
      ref: selectedCartonRef,
      inner_length: formData.lotLength,
      inner_width: formData.lotWidth,
      inner_height: formData.lotHeight,
      price: formData.packagingPrice,
      priceTTC: formData.packagingPrice,
    } : (quote.auctionSheet?.recommendedCarton || undefined);

    // Construire l'objet auctionSheet mis à jour
    const updatedAuctionSheet = {
      ...(quote.auctionSheet || {}),
      bordereauNumber: formData.bordereauNumber || undefined,
      lots: formLots.map((l) => ({
        lotNumber: l.lotNumber,
        description: l.description,
        value: l.value,
      })),
      totalLots: formLots.length,
      totalObjects: formLots.length,
      recommendedCarton,
    };

    const updatedQuote: Quote = {
      ...quote,
      client: {
        ...quote.client,
        name: formData.clientName,
        email: formData.clientEmail,
        phone: formData.clientPhone,
        address: formData.clientAddress,
      },
      lot: {
        ...quote.lot,
        number: formLots[0]?.lotNumber || '',
        description: formLots[0]?.description || '',
        value: formLots[0]?.value || 0,
        auctionHouse: formData.lotAuctionHouse,
        dimensions: {
          length: formData.lotLength,
          width: formData.lotWidth,
          height: formData.lotHeight,
          weight: formData.lotWeight,
          estimated: safeQuote.lot.dimensions.estimated || false,
        },
        volumetricWeight: formData.lotWeight,
      },
      options: {
        ...quote.options,
        packagingPrice: formData.packagingPrice,
        shippingPrice: finalShippingPrice,
        insuranceAmount: formData.insuranceAmount,
        insurance: formData.insurance,
      },
      delivery: {
        mode: formData.deliveryMode as DeliveryMode,
        contact: {
          name: formData.deliveryContactName,
          email: formData.deliveryContactEmail,
          phone: formData.deliveryContactPhone,
        },
        address: {
          line1: formData.deliveryAddressLine1,
          line2: formData.deliveryAddressLine2 || undefined,
          city: formData.deliveryAddressCity || undefined,
          zip: formData.deliveryAddressZip || undefined,
          country: formData.deliveryAddressCountry || undefined,
        },
      },
      auctionSheet: updatedAuctionSheet,
      totalAmount: newTotal,
      cartonId: selectedCartonId || undefined,
      wantsProfessionalInvoice: formData.wantsProfessionalInvoice,
      declaredValue: formData.declaredValue || null,
    };

    // Ajouter un événement dans l'historique si l'adresse a été modifiée
    if (addressChanged) {
      const addrEvent = createTimelineEvent(
        (quote.status as any) || 'calculated',
        `Adresse de destination modifiée – expédition recalculée (nouveau total : ${newTotal.toFixed(2)} €)`
      );
      updatedQuote.timeline = [...(quote.timeline || []), addrEvent];
    }

    try {
      console.log('[EditQuote] 📊 Comparaison totaux:', { oldTotal, newTotal, changed: newTotal !== oldTotal });
      
      // Sauvegarder les modifications
      await onSave(updatedQuote);
      
      // Toujours invalider les anciens paiements et créer un nouveau si le total a changé
      const totalChanged = Math.abs((newTotal || 0) - (oldTotal || 0)) > 0.01;
      
      console.log('[EditQuote] 🔄 Vérification mise à jour paiements:', {
        totalChanged,
        oldTotal,
        newTotal,
        difference: Math.abs((newTotal || 0) - (oldTotal || 0)),
      });
      
      if (totalChanged) {
        console.log('[EditQuote] 🔄 Début mise à jour des paiements...');
        
        try {
          // Invalider les anciens liens
          console.log('[EditQuote] 🔄 Annulation des anciens paiements...');
          const invalidatedCount = await invalidateActivePaymentLinks(quote.id);
          
          console.log('[EditQuote] ✅', invalidatedCount, 'paiement(s) annulé(s)');
          
          if (invalidatedCount > 0) {
            toast.info(`${invalidatedCount} ancien(s) paiement(s) annulé(s)`);
          }
          
          // Créer un nouveau lien
          console.log('[EditQuote] 🔄 Création nouveau paiement pour', newTotal, '€...');
          const newLink = await createNewPaymentLink(updatedQuote);
          
          console.log('[EditQuote] ✅ Nouveau paiement créé:', newLink);
          
          if (newLink) {
            toast.success('Nouveau lien de paiement créé avec succès !');
            // Attendre un peu pour que le paiement soit bien enregistré
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Notifier le parent pour forcer le rechargement des paiements
            if (onPaymentLinkCreated) {
              console.log('[EditQuote] 🔄 Notification parent pour rechargement paiements');
              onPaymentLinkCreated();
            }
          } else {
            console.warn('[EditQuote] ⚠️ Aucun lien créé (newLink est null/undefined)');
          }
        } catch (error) {
          console.error('[EditQuote] ❌ Erreur lors de la gestion des liens de paiement:', error);
          toast.error('Devis sauvegardé, mais erreur lors de la création du nouveau lien de paiement');
        }
      } else {
        console.log('[EditQuote] ℹ️ Aucune mise à jour des paiements nécessaire');
      }
    } catch (error) {
      console.error('[EditQuote] Erreur lors de la sauvegarde:', error);
      throw error;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Tabs defaultValue="info" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="info">Informations</TabsTrigger>
          <TabsTrigger value="payments">Paiement</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4 mt-4">
          {/* Bordereau */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bordereau</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="bordereauNumber">Numéro de bordereau</Label>
              <Input
                id="bordereauNumber"
                value={formData.bordereauNumber}
                onChange={(e) => setFormData({ ...formData, bordereauNumber: e.target.value })}
                placeholder="ex. 0260-25"
                className="mt-1"
              />
            </CardContent>
          </Card>

          {/* Informations client */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informations client</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clientName">Nom *</Label>
                  <Input
                    id="clientName"
                    value={formData.clientName}
                    onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientEmail">Email *</Label>
                  <Input
                    id="clientEmail"
                    type="email"
                    value={formData.clientEmail}
                    onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientPhone">Téléphone</Label>
                  <Input
                    id="clientPhone"
                    type="tel"
                    value={formData.clientPhone}
                    onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientAddress">Adresse</Label>
                  <Input
                    id="clientAddress"
                    value={formData.clientAddress}
                    onChange={(e) => setFormData({ ...formData, clientAddress: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wantsProfessionalInvoice">Facture professionnelle</Label>
                  <Select
                    value={formData.wantsProfessionalInvoice === true ? 'yes' : formData.wantsProfessionalInvoice === false ? 'no' : 'none'}
                    onValueChange={(v) => setFormData({ ...formData, wantsProfessionalInvoice: v === 'yes' ? true : v === 'no' ? false : null })}
                  >
                    <SelectTrigger id="wantsProfessionalInvoice">
                      <SelectValue placeholder="Non renseigné" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Non renseigné</SelectItem>
                      <SelectItem value="yes">Oui</SelectItem>
                      <SelectItem value="no">Non</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Salle des ventes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Salle des ventes</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="lotAuctionHouse">Salle des ventes</Label>
              <Input
                id="lotAuctionHouse"
                value={formData.lotAuctionHouse}
                onChange={(e) => setFormData({ ...formData, lotAuctionHouse: e.target.value })}
                className="mt-1"
              />
            </CardContent>
          </Card>

          {/* Lots */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Lots</CardTitle>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setFormLots((prev) => [...prev, { lotNumber: '', description: '', value: 0 }])}
              >
                <Plus className="w-4 h-4 mr-1" /> Ajouter un lot
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {formLots.map((lot, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Lot {index + 1}</span>
                    {formLots.length > 1 && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setFormLots((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="N° de lot"
                      value={lot.lotNumber}
                      onChange={(e) =>
                        setFormLots((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, lotNumber: e.target.value } : l))
                        )
                      }
                    />
                    <Input
                      type="number"
                      placeholder="Valeur déclarée (€)"
                      step="0.01"
                      min="0"
                      value={lot.value}
                      onChange={(e) =>
                        setFormLots((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, value: parseFloat(e.target.value) || 0 } : l))
                        )
                      }
                    />
                    <Textarea
                      className="col-span-2"
                      placeholder="Description"
                      rows={2}
                      value={lot.description}
                      onChange={(e) =>
                        setFormLots((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, description: e.target.value } : l))
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Valeur totale déclarée */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Valeur totale déclarée</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Montant total déclaré pour ce devis, incluant les frais de la salle des ventes (buyer's premium, etc.). Utilisé pour le calcul de l'assurance (2,5%).
              </p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.declaredValue}
                    onChange={(e) => {
                      setDeclaredValueManuallyEdited(true);
                      setFormData({ ...formData, declaredValue: parseFloat(e.target.value) || 0 });
                    }}
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const sum = formLots.reduce((s, l) => s + (l.value || 0), 0);
                    setFormData({ ...formData, declaredValue: sum });
                    setDeclaredValueManuallyEdited(false);
                  }}
                  title="Recalculer depuis la somme des lots"
                >
                  Recalculer
                </Button>
              </div>
              {(() => {
                const sum = formLots.reduce((s, l) => s + (l.value || 0), 0);
                const isDifferent = Math.abs((formData.declaredValue || 0) - sum) > 0.01;
                return isDifferent ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Somme des lots : {sum.toFixed(2)}€ — valeur surchargée manuellement.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Calculée automatiquement depuis la somme des lots ({sum.toFixed(2)}€).
                  </p>
                );
              })()}
            </CardContent>
          </Card>

          {/* Carton et dimensions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Carton & Dimensions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Sélecteur de carton */}
              <div className="space-y-4">
                <CartonSelector
                  selectedCartonId={selectedCartonId}
                  onCartonSelect={handleCartonSelect}
                  disabled={isSaving || isPrincipalPaid}
                />
              </div>

              <Separator />

              {/* Dimensions du carton (lecture seule) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Dimensions du carton (cm)</Label>
                  <Badge variant="secondary" className="text-xs">
                    Définies par le carton sélectionné
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="lotLength" className="text-xs">Longueur</Label>
                    <Input
                      id="lotLength"
                      type="number"
                      value={formData.lotLength}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lotWidth" className="text-xs">Largeur</Label>
                    <Input
                      id="lotWidth"
                      type="number"
                      value={formData.lotWidth}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lotHeight" className="text-xs">Hauteur</Label>
                    <Input
                      id="lotHeight"
                      type="number"
                      value={formData.lotHeight}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                </div>
              </div>

              {/* Poids modifiable manuellement */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="lotWeight" className="text-sm font-medium">
                    Poids volumétrique (kg)
                  </Label>
                  <Badge variant="outline" className="text-xs">
                    Modifiable manuellement
                  </Badge>
                </div>
                <Input
                  id="lotWeight"
                  type="number"
                  step="0.1"
                  min="0"
                  value={formData.lotWeight}
                  onChange={(e) => setFormData({ ...formData, lotWeight: parseFloat(e.target.value) || 0 })}
                  disabled={isSaving}
                  placeholder="Poids en kg"
                />
                <p className="text-xs text-muted-foreground">
                  Le poids volumétrique est calculé automatiquement à partir du carton, mais vous pouvez le modifier si nécessaire.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Informations de livraison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informations de livraison</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="deliveryMode">Mode de livraison</Label>
                <div className="flex items-center gap-2">
                  <select
                    id="deliveryMode"
                    className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={formData.deliveryMode}
                    onChange={(e) => setFormData({ ...formData, deliveryMode: e.target.value as DeliveryMode })}
                  >
                    <option value="client">Client</option>
                    <option value="receiver">Destinataire</option>
                    <option value="pickup">Point relais</option>
                  </select>
                  {formData.deliveryMode === 'pickup' && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          deliveryMode: 'receiver',
                          deliveryAddressLine1: '',
                          deliveryAddressLine2: '',
                          deliveryAddressCity: '',
                          deliveryAddressZip: '',
                          deliveryAddressCountry: '',
                        });
                        toast.success('Adresse vidée. Saisissez la nouvelle adresse de livraison.');
                      }}
                    >
                      Passer en livraison à domicile
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="deliveryContactName">Nom du contact</Label>
                  <Input
                    id="deliveryContactName"
                    value={formData.deliveryContactName}
                    onChange={(e) => setFormData({ ...formData, deliveryContactName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deliveryContactEmail">Email</Label>
                  <Input
                    id="deliveryContactEmail"
                    type="email"
                    value={formData.deliveryContactEmail}
                    onChange={(e) => setFormData({ ...formData, deliveryContactEmail: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deliveryContactPhone">Téléphone</Label>
                  <Input
                    id="deliveryContactPhone"
                    type="tel"
                    value={formData.deliveryContactPhone}
                    onChange={(e) => setFormData({ ...formData, deliveryContactPhone: e.target.value })}
                  />
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm font-medium">Adresse de livraison</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="deliveryAddressLine1" className="text-xs">Ligne 1</Label>
                    <Input
                      id="deliveryAddressLine1"
                      value={formData.deliveryAddressLine1}
                      onChange={(e) => setFormData({ ...formData, deliveryAddressLine1: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="deliveryAddressLine2" className="text-xs">Ligne 2</Label>
                    <Input
                      id="deliveryAddressLine2"
                      value={formData.deliveryAddressLine2}
                      onChange={(e) => setFormData({ ...formData, deliveryAddressLine2: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deliveryAddressCity" className="text-xs">Ville</Label>
                    <Input
                      id="deliveryAddressCity"
                      value={formData.deliveryAddressCity}
                      onChange={(e) => setFormData({ ...formData, deliveryAddressCity: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deliveryAddressZip" className="text-xs">Code postal</Label>
                    <Input
                      id="deliveryAddressZip"
                      value={formData.deliveryAddressZip}
                      onChange={(e) => setFormData({ ...formData, deliveryAddressZip: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deliveryAddressCountry" className="text-xs">Pays</Label>
                    <Input
                      id="deliveryAddressCountry"
                      value={formData.deliveryAddressCountry}
                      onChange={(e) => setFormData({ ...formData, deliveryAddressCountry: e.target.value })}
                      placeholder="FR, US, etc."
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4 mt-4">
          {/* Prix */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Détail des coûts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="packagingPrice">Prix d'emballage (€)</Label>
                    {!isPrincipalPaid && (
                      <Badge variant="secondary" className="text-xs">
                        Modifiable pour ce devis uniquement
                      </Badge>
                    )}
                  </div>
                  <Input
                    id="packagingPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.packagingPrice}
                    disabled={isPrincipalPaid}
                    onChange={(e) => setFormData({ ...formData, packagingPrice: parseFloat(e.target.value) || 0 })}
                    className={isPrincipalPaid ? 'bg-muted' : ''}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isPrincipalPaid
                      ? 'Le paiement principal est effectué, le prix ne peut plus être modifié'
                      : 'Valeur initiale du carton. La modification n\'affecte pas les Paramètres.'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shippingPrice">Prix d'expédition (€)</Label>
                  <Input
                    id="shippingPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.shippingPrice}
                    disabled={isPrincipalPaid}
                    onChange={(e) => setFormData({ ...formData, shippingPrice: parseFloat(e.target.value) || 0 })}
                    className={isPrincipalPaid ? 'bg-muted' : ''}
                  />
                  {isPrincipalPaid && (
                    <p className="text-xs text-muted-foreground">
                      Le paiement principal est effectué, le prix ne peut plus être modifié
                    </p>
                  )}
                </div>
                <div className="space-y-2 col-span-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="insurance"
                      checked={formData.insurance}
                      onChange={(e) => setFormData({ ...formData, insurance: e.target.checked })}
                      disabled={isPrincipalPaid}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="insurance">Assurance</Label>
                  </div>
                </div>
                {formData.insurance && (
                  <div className="space-y-2">
                    <Label htmlFor="insuranceAmount">Montant assurance (€)</Label>
                    <Input
                      id="insuranceAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.insuranceAmount}
                      disabled={isPrincipalPaid}
                      onChange={(e) => setFormData({ ...formData, insuranceAmount: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                )}
              </div>
              <Separator />
              
              {/* Affichage du total recalculé */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-base">Total du devis</span>
                    {calculateTotal() !== quote.totalAmount && (
                      <Badge variant="default" className="text-xs">
                        Modifié
                      </Badge>
                    )}
                  </div>
                  <span className="font-bold text-lg text-primary">
                    {calculateTotal().toFixed(2)}€
                  </span>
                </div>
                
                {/* Alerte de changement de total */}
                {calculateTotal() !== quote.totalAmount && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm space-y-1">
                        <p className="font-medium text-blue-900 dark:text-blue-100">
                          Le total a changé
                        </p>
                        <div className="text-blue-800 dark:text-blue-200 space-y-0.5">
                          <p>Ancien total: <span className="line-through">{quote.totalAmount.toFixed(2)}€</span></p>
                          <p>Nouveau total: <strong>{calculateTotal().toFixed(2)}€</strong></p>
                          <p className="text-xs mt-2 flex items-center gap-1">
                            <RefreshCw className="w-3 h-3" />
                            Les anciens liens de paiement seront invalidés et un nouveau lien sera créé automatiquement
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Détail des composants du total */}
                <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                  <div className="flex justify-between">
                    <span>Emballage:</span>
                    <span>{formData.packagingPrice.toFixed(2)}€</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Expédition:</span>
                    <span>{formData.shippingPrice.toFixed(2)}€</span>
                  </div>
                  {formData.insurance && (
                    <div className="flex justify-between">
                      <span>Assurance:</span>
                      <span>{formData.insuranceAmount.toFixed(2)}€</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
          Annuler
        </Button>
        <Button type="submit" disabled={isSaving}>
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? "Sauvegarde..." : "Enregistrer les modifications"}
        </Button>
      </div>
    </form>
  );
}
