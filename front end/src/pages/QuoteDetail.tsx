import { useEffect, useState } from 'react';
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
import { useQuotes } from "@/hooks/use-quotes";
import { useQueryClient } from "@tanstack/react-query";
import { AuctionSheetAnalysis } from '@/lib/auctionSheetAnalyzer';
import { Quote, DeliveryMode, DeliveryInfo, PaymentLink } from '@/types/quote';
import { toast } from 'sonner';
import { useShipmentGrouping } from '@/hooks/useShipmentGrouping';
import { GroupingSuggestion } from '@/components/shipment/GroupingSuggestion';
import { GroupBadge } from '@/components/shipment/GroupBadge';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { saveAuctionSheetForQuote, removeAuctionSheetForQuote } from "@/lib/quoteEnhancements";
import { calculateVolumetricWeight } from '@/lib/cartons';
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

// Arrondi assurance : 13,50 => 14 ; 13,49 => 13,5
function roundInsurance(value: number) {
  if (Number.isNaN(value)) return 0;
  const decimal = value % 1;
  if (decimal >= 0.5) return Math.ceil(value);
  if (decimal > 0) return Math.floor(value) + 0.5;
  return value;
}

// Calcule le montant d'assurance en appliquant le minimum et l'arrondi
function computeInsuranceAmount(
  lotValue: number,
  insuranceEnabled?: boolean,
  explicitAmount?: number | null
) {
  if (!insuranceEnabled) return 0;
  if (explicitAmount !== null && explicitAmount !== undefined && explicitAmount > 0) {
    return roundInsurance(explicitAmount);
  }
  const raw = Math.max(lotValue * 0.025, lotValue < 500 ? 12 : 0);
  return roundInsurance(raw);
}
import { getCartonPrice, calculateShippingPrice, calculateVolumetricWeight, cleanCartonRef } from "@/lib/pricing";
import { setDoc, doc, Timestamp, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createStripeLink } from "@/lib/stripe";
import { createTimelineEvent, addTimelineEvent, getStatusDescription, timelineEventToFirestore } from "@/lib/quoteTimeline";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEmailMessages } from "@/hooks/use-email-messages";
import { EmailMessage } from "@/types/quote";
import { authenticatedFetch } from "@/lib/api";
import { getPaiements } from "@/lib/stripeConnect";
import type { Paiement } from "@/types/stripe";

export default function QuoteDetail() {
  const { id } = useParams();
  const { data: quotes = [], isLoading, isError } = useQuotes();
  const queryClient = useQueryClient();
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
  const [paiementsRefreshKey, setPaiementsRefreshKey] = useState(0);

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

  // Test de connectivité au backend au chargement
  useEffect(() => {
    const testBackendConnection = async () => {
      try {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5174';
        const response = await fetch(`${API_BASE}/api/health`);
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
        // Filtrer uniquement les surcoûts non payés
        const surcharges = paiements.filter(
          (p) => p.type === 'SURCOUT' && p.status === 'PENDING'
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
  }, [id]);

  // IMPORTANT: la liste de devis (useQuotes) se met à jour après merge Firestore.
  // Sans resync, la page détail peut rester bloquée sur l'ancien état (bordereau invisible).
  // MAIS: Ne pas écraser les modifications locales en cours de sauvegarde
  useEffect(() => {
    if (!foundQuote) return;
    
    // Ne pas mettre à jour si on est en train de sauvegarder (pour éviter d'écraser les modifications)
    if (isSaving) {
      console.log('[QuoteDetail] ⏸️  Resync ignoré (sauvegarde en cours)');
      return;
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

  // FORCER l'application des dimensions INTERNES du carton (dimensions du colis)
  // Ce useEffect garantit que les dimensions du carton sont TOUJOURS affichées
  useEffect(() => {
    if (!quote?.auctionSheet?.recommendedCarton) return;
    
    // PRIORITÉ aux dimensions internes (inner) car ce sont les dimensions du colis
    // Si inner n'existe pas, utiliser required
    const cartonDims = quote.auctionSheet.recommendedCarton.inner || quote.auctionSheet.recommendedCarton.required;
    if (!cartonDims) {
      console.log('[QuoteDetail] Aucune dimension de carton disponible:', quote.auctionSheet.recommendedCarton);
      return;
    }
    
    const currentDims = quote.lot?.dimensions || { length: 0, width: 0, height: 0, weight: 0 };
    const cartonLength = Number(cartonDims.length);
    const cartonWidth = Number(cartonDims.width);
    const cartonHeight = Number(cartonDims.height);
    
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
        
        // 2. Recalculer le prix d'expédition si dimensions et pays disponibles mais prix manquant
        if (quote.lot.dimensions && quote.delivery?.address) {
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
      quote.lot?.value || 0,
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
        body: JSON.stringify({ quote }),
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

  const handleSendSurchargeEmail = async (surchargePaiement: Paiement) => {
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
        return;
      }
      
      const response = await authenticatedFetch(apiUrl, {
        method: 'POST',
        body: JSON.stringify({ 
          quote,
          surchargePaiement: {
            id: surchargePaiement.id,
            amount: surchargePaiement.amount,
            description: surchargePaiement.description || '',
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
    
    if (countryCode && updatedQuote.lot.dimensions && 
        updatedQuote.lot.dimensions.length > 0 && 
        updatedQuote.lot.dimensions.width > 0 && 
        updatedQuote.lot.dimensions.height > 0) {
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
        
        console.log(`[QuoteDetail] 🔄 Calcul prix expédition: pays=${countryCode}, poidsVol=${volumetricWeight}kg, express=${isExpress}`);
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
      updatedQuote.lot?.value || 0,
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
            {/* N'afficher le badge de statut général que si le statut n'est pas "paid" 
                (car le badge de paiement suffit pour indiquer que c'est payé) */}
            {safeQuote.status !== 'paid' && (
            <StatusBadge status={safeQuote.status} />
            )}
            {/* Toujours afficher le badge de paiement */}
            <StatusBadge status={safeQuote.paymentStatus} type="payment" />
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
                    <CardTitle className="text-base flex items-center gap-2">
                      <Home className="w-4 h-4" />
                      {deliveryTitle}
                    </CardTitle>
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
                    {/* Informations globales (Salle des ventes et Bordereau) */}
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
                    <div className="flex items-center gap-2">
                      <Euro className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Valeur déclarée</p>
                        <p className="font-medium">
                          {safeQuote.lot.value && safeQuote.lot.value > 0
                            ? `${safeQuote.lot.value}€`
                            : (safeQuote.auctionSheet ? `${safeQuote.lot.value || 0}€` : 'Pas renseigné')}
                        </p>
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
                        
                        {/* Prix d'expédition - toujours affiché (Express depuis Google Sheets) */}
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            Expédition (Express)
                            {delivery.address?.country && (
                              <span className="text-muted-foreground text-xs ml-1">
                                ({delivery.address.country})
                              </span>
                            )}
                          </span>
                          <span className="font-medium">
                            {(() => {
                              const price = quote.options?.shippingPrice || 0;
                              console.log('[QuoteDetail] Affichage prix expédition:', { price, options: quote.options });
                              return price.toFixed(2);
                            })()}€
                          </span>
                        </div>

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
                              <span className="font-medium">{(safeQuote.lot.value || 0).toFixed(2)}€</span>
                            </div>
                            <div className="flex justify-between text-sm pl-4">
                              <span className="text-muted-foreground">Coût assurance (2.5%{(safeQuote.lot.value || 0) < 500 ? ', min. 12€' : ''})</span>
                              <span className="font-medium">
                                {computeInsuranceAmount(
                                  safeQuote.lot.value || 0,
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
                            safeQuote.lot.value || 0,
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
                  onClick={handleSendEmail}
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
                    onClick={() => handleSendSurchargeEmail(surcharge)}
                    disabled={isLoadingSurcharges}
                  >
                    <Send className="w-4 h-4" />
                    Envoyer surcoût ({surcharge.amount.toFixed(2)}€)
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

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
            onAnalysisComplete={(analysis, file) => {
              handleAuctionSheetAnalysis(analysis, file);
              if (analysis.totalLots > 0) {
                setIsAuctionSheetDialogOpen(false);
              }
            }}
            existingAnalysis={auctionSheetAnalysis || undefined}
            fileName={safeQuote.auctionSheet?.fileName || (safeQuote.auctionSheet ? 'Bordereau attaché' : undefined)}
            bordereauId={safeQuote.bordereauId}
          />
        </DialogContent>
      </Dialog>

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
                      // AuctionSheet avec recommendedCarton
                      ...(Object.keys(auctionSheetData).length > 0 ? { auctionSheet: auctionSheetData } : {}),
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

// Composant pour l'onglet Messages
interface EmailMessagesTabProps {
  quoteId: string;
  clientEmail: string;
  onSendEmail: () => void;
}

function EmailMessagesTab({ quoteId, clientEmail, onSendEmail }: EmailMessagesTabProps) {
  const { data: messages = [], isLoading, isError } = useEmailMessages(quoteId);

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
          <p className="text-sm text-destructive text-center">Erreur lors du chargement des messages</p>
        </CardContent>
      </Card>
    );
  }

  return (
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
          <div className="space-y-3">
            {messages.map((message: EmailMessage) => (
              <div 
                key={message.id} 
                className={cn(
                  "p-4 rounded-lg border",
                  message.direction === 'OUT' 
                    ? "bg-primary/5 border-primary/20" 
                    : "bg-secondary/50 border-border"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {message.direction === 'OUT' ? (
                      <Badge variant="default" className="gap-1">
                        <Send className="w-3 h-3" />
                        Envoyé
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Mail className="w-3 h-3" />
                        Reçu
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {message.source}
                    </Badge>
                    <span className="text-sm font-medium">{message.subject}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(message.receivedAt || message.createdAt).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  <span className="font-medium">De:</span> {message.from}
                  {(() => {
                    const toArray = Array.isArray(message.to) ? message.to : (message.to ? [message.to] : []);
                    return toArray.length > 0 && (
                      <>
                        {' • '}
                        <span className="font-medium">À:</span> {toArray.join(', ')}
                      </>
                    );
                  })()}
                </div>
                <div className="text-sm text-foreground mt-2 whitespace-pre-wrap">
                  {message.bodyText || message.bodyHtml?.replace(/<[^>]*>/g, '') || 'Aucun contenu'}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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

// Composant formulaire d'édition
interface EditQuoteFormProps {
  quote: Quote;
  onSave: (updatedQuote: Quote) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
  onPaymentLinkCreated?: () => void; // Callback appelé après la création d'un nouveau paiement
}

function EditQuoteForm({ quote, onSave, onCancel, isSaving, onPaymentLinkCreated }: EditQuoteFormProps) {
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
  });

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
    const volumetricWeight = calculateVolumetricWeight({
      inner_length: length,
      inner_width: width,
      inner_height: height,
    } as any);
    
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
    
    // Recalculer le prix d'expédition avec les nouvelles dimensions
    let newShippingPrice = formData.shippingPrice; // Garder l'ancien prix par défaut
    if (countryCode && volumetricWeight > 0) {
      try {
        const isExpress = true; // TOUS les colis sont en EXPRESS
        console.log(`[EditQuote] 🔄 Recalcul prix expédition: pays=${countryCode}, poidsVol=${volumetricWeight}kg, express=${isExpress}`);
        newShippingPrice = await calculateShippingPrice(countryCode, volumetricWeight, isExpress);
        console.log(`[EditQuote] ✅ Nouveau prix expédition calculé: ${newShippingPrice}€`);
      } catch (error) {
        console.error('[EditQuote] ❌ Erreur lors du calcul du prix d\'expédition:', error);
      }
    } else {
      console.warn(`[EditQuote] ⚠️ Impossible de recalculer le prix d'expédition: pays=${countryCode}, poidsVol=${volumetricWeight}kg`);
    }
    
    // Mettre à jour les dimensions selon le carton (s'assurer que ce sont des nombres)
    setFormData({
      ...formData,
      lotLength: Number(carton.inner_length) || 0,
      lotWidth: Number(carton.inner_width) || 0,
      lotHeight: Number(carton.inner_height) || 0,
      lotWeight: Number(volumetricWeight) || 0, // Poids volumétrique automatique (modifiable ensuite)
      packagingPrice: Number(carton.packaging_price) || 0,
      shippingPrice: newShippingPrice, // Mettre à jour le prix d'expédition
    });
    
    setSelectedCartonId(carton.id);
    setSelectedCartonRef(carton.carton_ref);
    
    toast.success(`Carton ${carton.carton_ref} sélectionné. Dimensions, prix d'emballage et prix d'expédition mis à jour.`);
  };

  // Calculer le total du devis
  const calculateTotal = () => {
    const packagingPrice = formData.packagingPrice || 0;
    const shippingPrice = formData.shippingPrice || 0;
    const insuranceAmount = formData.insurance ? (formData.insuranceAmount || 0) : 0;
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
      
      const newTotal = calculateTotal();
      
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Calculer le nouveau total
    const newTotal = calculateTotal();
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
    const updatedAuctionSheet = quote.auctionSheet || selectedCartonRef ? {
      ...(quote.auctionSheet || {}),
      recommendedCarton,
      totalLots: quote.auctionSheet?.totalLots || 1,
      totalObjects: quote.auctionSheet?.totalObjects || 1,
    } : undefined;

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
        number: formData.lotNumber,
        description: formData.lotDescription,
        value: formData.lotValue,
        auctionHouse: formData.lotAuctionHouse,
        dimensions: {
          length: formData.lotLength,
          width: formData.lotWidth,
          height: formData.lotHeight,
          weight: formData.lotWeight,
          estimated: safeQuote.lot.dimensions.estimated || false,
        },
        volumetricWeight: formData.lotWeight, // Mettre à jour le poids volumétrique
      },
      options: {
        ...quote.options,
        packagingPrice: formData.packagingPrice,
        shippingPrice: formData.shippingPrice,
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
    };

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
              </div>
            </CardContent>
          </Card>

          {/* Informations du lot */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informations du lot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lotNumber">Numéro de lot</Label>
                  <Input
                    id="lotNumber"
                    value={formData.lotNumber}
                    onChange={(e) => setFormData({ ...formData, lotNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lotAuctionHouse">Salle des ventes</Label>
                  <Input
                    id="lotAuctionHouse"
                    value={formData.lotAuctionHouse}
                    onChange={(e) => setFormData({ ...formData, lotAuctionHouse: e.target.value })}
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="lotDescription">Description</Label>
                  <Textarea
                    id="lotDescription"
                    value={formData.lotDescription}
                    onChange={(e) => setFormData({ ...formData, lotDescription: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lotValue">Valeur déclarée (€)</Label>
                  <Input
                    id="lotValue"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.lotValue}
                    onChange={(e) => setFormData({ ...formData, lotValue: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <Separator />

              {/* Sélecteur de carton */}
              <div className="space-y-4">
                <CartonSelector
                  selectedCartonId={selectedCartonId}
                  onCartonSelect={handleCartonSelect}
                  disabled={isSaving}
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
                <select
                  id="deliveryMode"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formData.deliveryMode}
                  onChange={(e) => setFormData({ ...formData, deliveryMode: e.target.value as DeliveryMode })}
                >
                  <option value="client">Client</option>
                  <option value="receiver">Destinataire</option>
                  <option value="pickup">Point relais</option>
                </select>
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
                    <Badge variant="secondary" className="text-xs">
                      Depuis le carton
                    </Badge>
                  </div>
                  <Input
                    id="packagingPrice"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.packagingPrice}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Le prix est défini par le carton sélectionné
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
                    onChange={(e) => setFormData({ ...formData, shippingPrice: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="insurance"
                      checked={formData.insurance}
                      onChange={(e) => setFormData({ ...formData, insurance: e.target.checked })}
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
