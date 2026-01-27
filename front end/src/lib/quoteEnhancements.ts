import { auth, authReady, db, firebaseEnabled, lastAuthError } from "@/lib/firebase";
import type { AuctionSheetAnalysis } from "@/lib/auctionSheetAnalyzer";
import type { Quote, DeliveryMode } from "@/types/quote";
import {
  doc,
  getDoc,
  setDoc,
  writeBatch,
  getDocs,
  collection,
  query,
  where,
  documentId,
  Timestamp,
} from "firebase/firestore";

// On persiste directement dans une collection Firestore visible: "quotes/{quoteId}"
const QUOTES_COLLECTION = "quotes";

type PersistedAuctionSheet = NonNullable<Quote["auctionSheet"]> & {
  uploadedAt?: string; // ISO
};

type PersistedLotEnriched = {
  number?: string;
  description?: string;
  dimensions?: { length: number; width: number; height: number; weight: number };
  value?: number;
  auctionHouse?: string;
  updatedAt?: string; // ISO
};

function safeSlice(text: string, max: number) {
  const t = (text || "").toString();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function toShortLotDescription(text: string): string {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const cutMatch = cleaned.match(/^(.{1,180}?)(?:[.;\n]|$)/);
  let short = (cutMatch?.[1] || cleaned).trim();
  if (short.length > 160) short = `${short.slice(0, 157).trim()}…`;
  return short;
}

function computeLotEnrichedFromAuctionSheet(analysis: AuctionSheetAnalysis): PersistedLotEnriched | null {
  if (!analysis) return null;
  const first = analysis.lots?.[0];
  const shortDesc = first?.description ? toShortLotDescription(first.description) : "";

  // PRIORITÉ ABSOLUE aux dimensions INTERNES du carton (inner > required)
  // Les dimensions internes (inner) sont celles du colis, à utiliser en priorité
  const cartonDims = analysis.recommendedCarton?.inner || analysis.recommendedCarton?.required;
  const dims = cartonDims
    ? {
        // Utiliser TOUJOURS les dimensions du carton si disponible
        length: (() => { const v = Number((cartonDims as any).length); return isNaN(v) ? 0 : v; })(),
        width: (() => { const v = Number((cartonDims as any).width); return isNaN(v) ? 0 : v; })(),
        height: (() => { const v = Number((cartonDims as any).height); return isNaN(v) ? 0 : v; })(),
        // Le poids n'existe pas sur le carton : on garde le poids estimé du lot si dispo.
        weight: Number((first?.estimatedDimensions as any)?.weight) || 0,
      }
    : first?.estimatedDimensions
    ? {
        // Fallback vers dimensions du lot UNIQUEMENT si pas de carton
        length: Number((first.estimatedDimensions as any).length) || 0,
        width: Number((first.estimatedDimensions as any).width) || 0,
        height: Number((first.estimatedDimensions as any).height) || 0,
        weight: Number((first.estimatedDimensions as any).weight) || 0,
      }
    : undefined;

  const preferredValue =
    typeof analysis.invoiceTotal === "number" && analysis.invoiceTotal > 0
      ? analysis.invoiceTotal
      : (typeof first?.value === "number" ? first.value : undefined);

  const enriched: any = {
    updatedAt: new Date().toISOString(),
  };
  
  // Ajouter les champs seulement s'ils sont définis
  if (first?.lotNumber) enriched.number = first.lotNumber;
  if (shortDesc) enriched.description = shortDesc;
  if (dims) enriched.dimensions = dims;
  if (preferredValue !== undefined && preferredValue !== null) enriched.value = preferredValue;
  if (analysis.auctionHouse) enriched.auctionHouse = analysis.auctionHouse;
  
  return enriched as PersistedLotEnriched;
}

// Fonction utilitaire pour nettoyer un objet en remplaçant undefined par null ou en omettant les champs
function cleanForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => cleanForFirestore(item)) as T;
  }
  
  if (typeof obj === 'object' && obj.constructor === Object) {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanForFirestore(value);
      }
    }
    return cleaned as T;
  }
  
  return obj;
}

function toPersistedAuctionSheet(
  analysis: AuctionSheetAnalysis,
  extras: Pick<PersistedAuctionSheet, "fileName" | "uploadedAt"> = {}
): PersistedAuctionSheet {
  // Attention Firestore: taille doc limitée -> on tronque rawText et descriptions très longues
  const lots = (analysis.lots || []).slice(0, 80).map((l) => {
    const lot: any = {
    lotNumber: String(l.lotNumber || "").slice(0, 40),
    description: safeSlice(String(l.description || ""), 600),
    };
    
    if (l.estimatedDimensions) {
      lot.estimatedDimensions = {
          length: Number(l.estimatedDimensions.length) || 0,
          width: Number(l.estimatedDimensions.width) || 0,
          height: Number(l.estimatedDimensions.height) || 0,
          weight: Number(l.estimatedDimensions.weight) || 0,
      };
    }
    
    if (typeof l.value === "number") {
      lot.value = l.value;
    }
    
    return lot;
  });

  const persisted: any = {
    totalLots: analysis.totalLots || lots.length,
    totalObjects: analysis.totalObjects || 0,
  };
  
  // Ajouter les champs seulement s'ils sont définis
  if (extras.fileName) persisted.fileName = extras.fileName;
  if (analysis.auctionHouse) persisted.auctionHouse = analysis.auctionHouse;
  if (analysis.auctionDate) persisted.auctionDate = analysis.auctionDate;
  if (analysis.invoiceTotal !== undefined && analysis.invoiceTotal !== null) persisted.invoiceTotal = analysis.invoiceTotal;
  if (analysis.bordereauNumber) persisted.bordereauNumber = analysis.bordereauNumber;
  if (analysis.recommendedCarton) persisted.recommendedCarton = analysis.recommendedCarton;
  if (lots.length > 0) persisted.lots = lots;
  if (analysis.rawText) persisted.rawText = safeSlice(analysis.rawText, 20000);
  if (extras.uploadedAt) persisted.uploadedAt = extras.uploadedAt;

  // Nettoyer l'objet pour Firestore (remplacer undefined par null ou omettre)
  return cleanForFirestore(persisted) as PersistedAuctionSheet;
}

export async function saveAuctionSheetForQuote(params: {
  quoteId: string;
  quote?: Quote;
  analysis: AuctionSheetAnalysis;
  existing?: PersistedAuctionSheet | null;
}) {
  const { quoteId, quote, analysis, existing } = params;

  if (!firebaseEnabled) {
    throw new Error(
      "Firebase non configuré. Ajoute VITE_FIREBASE_API_KEY / VITE_FIREBASE_PROJECT_ID / VITE_FIREBASE_APP_ID dans front end/.env.local"
    );
  }

  await authReady;
  if (!auth.currentUser) {
    throw new Error(
      `Firebase Auth non connecté. Active 'Anonymous' dans Firebase Console > Authentication > Sign-in method. ` +
        `Détail: ${lastAuthError || "aucun code retourné (voir console)"}`
    );
  }

  const fileName = existing?.fileName || "Bordereau";

  const persisted = toPersistedAuctionSheet(analysis, {
    fileName,
    uploadedAt: new Date().toISOString(),
  });

  console.log('[saveAuctionSheetForQuote] Persisted auctionSheet:', {
    quoteId,
    bordereauNumber: persisted.bordereauNumber,
    persistedKeys: Object.keys(persisted),
    hasBordereauNumber: 'bordereauNumber' in persisted,
  });

  const lotEnriched = computeLotEnrichedFromAuctionSheet(analysis);

  // Construire l'objet de mise à jour en omettant les valeurs undefined
  const updateData: any = {
      quoteId,
      updatedAt: Timestamp.now(),
      auctionSheet: persisted,
    lotEnriched: lotEnriched ? cleanForFirestore(lotEnriched) : null,
  };
  
  // Ajouter les prix seulement s'ils sont définis
  if (quote?.options?.packagingPrice !== undefined && quote?.options?.packagingPrice !== null) {
    updateData.packagingPrice = quote.options.packagingPrice;
  } else {
    updateData.packagingPrice = null;
  }
  
  if (quote?.options?.shippingPrice !== undefined && quote?.options?.shippingPrice !== null) {
    updateData.shippingPrice = quote.options.shippingPrice;
  } else {
    updateData.shippingPrice = null;
  }
  
  // Ajouter les champs utiles seulement s'ils sont définis
  if (quote?.reference) updateData.reference = quote.reference;
  if (quote?.client?.name) updateData.clientName = quote.client.name;
  if (quote?.lot?.number) updateData.lotNumber = quote.lot.number;

  await setDoc(
    doc(db, QUOTES_COLLECTION, quoteId),
    updateData,
    { merge: true }
  );

  console.log('[saveAuctionSheetForQuote] ✅ Sauvegardé dans Firestore:', {
    quoteId,
    bordereauNumber: persisted.bordereauNumber,
    persistedFull: persisted, // Log complet pour vérifier la structure
  });

  return persisted;
}

export async function removeAuctionSheetForQuote(params: { quoteId: string; deleteFile?: boolean }) {
  const { quoteId } = params;
  if (!firebaseEnabled) {
    throw new Error(
      "Firebase non configuré. Ajoute VITE_FIREBASE_API_KEY / VITE_FIREBASE_PROJECT_ID / VITE_FIREBASE_APP_ID dans front end/.env.local"
    );
  }

  await authReady;
  if (!auth.currentUser) {
    throw new Error(
      `Firebase Auth non connecté. Active 'Anonymous' dans Firebase Console > Authentication > Sign-in method. ` +
        `Détail: ${lastAuthError || "aucun code retourné (voir console)"}`
    );
  }

  // Supprimer le bordereau ET les informations enrichies du lot
  await setDoc(
    doc(db, QUOTES_COLLECTION, quoteId),
    {
      quoteId,
      updatedAt: Timestamp.now(),
      auctionSheet: null,
      lotEnriched: null, // Supprimer aussi les informations enrichies du lot
    },
    { merge: true }
  );
}

export async function getAuctionSheetForQuote(quoteId: string): Promise<PersistedAuctionSheet | null> {
  if (!firebaseEnabled) return null;
  await authReady;
  const snap = await getDoc(doc(db, QUOTES_COLLECTION, quoteId));
  if (!snap.exists()) return null;
  const data = snap.data() as any;
  return (data?.auctionSheet as PersistedAuctionSheet) || null;
}

export async function mergeEnhancementsIntoQuotes(quotes: Quote[]): Promise<Quote[]> {
  if (!firebaseEnabled) return quotes;
  await authReady;
  const ids = quotes.map((q) => q.id).filter(Boolean);
  if (ids.length === 0) return quotes;
  
  // IMPORTANT: Toujours récupérer l'historique depuis Firestore, même si le devis n'a pas d'autres enrichissements
  // On doit récupérer TOUS les devis depuis Firestore pour avoir l'historique complet

  const enhancements = new Map<string, { 
    auctionSheet: PersistedAuctionSheet | null; 
    lotEnriched: PersistedLotEnriched | null;
    packagingPrice?: number | null;
    shippingPrice?: number | null;
    status?: string | null; // Statut depuis Firestore
    paymentStatus?: string | null; // Statut de paiement depuis Firestore
    timeline?: Array<{
      id: string;
      date: any; // Timestamp Firestore ou Date
      status: string;
      description: string;
      user?: string;
    }> | null;
    paymentLinks?: Array<{
      id: string;
      url: string;
      amount: number;
      createdAt: any; // Timestamp Firestore
      status: 'active' | 'paid' | 'expired';
    }> | null;
    internalNotes?: string[] | null; // Notes internes depuis Firestore
    realDimensions?: {
      length: number;
      width: number;
      height: number;
      weight: number;
      estimated?: boolean;
    } | null; // Dimensions réelles depuis Firestore
    carrier?: string | null; // Transporteur depuis Firestore
    trackingNumber?: string | null; // Numéro de suivi depuis Firestore
    shippingOption?: string | null; // Option de transport depuis Firestore
    // Champs modifiés depuis l'interface (priorité sur Google Sheets)
    clientName?: string | null;
    clientEmail?: string | null;
    clientPhone?: string | null;
    clientAddress?: string | null;
    lotNumber?: string | null;
    lotDescription?: string | null;
    lotValue?: number | null;
    lotAuctionHouse?: string | null;
    lotDimensions?: {
      length: number;
      width: number;
      height: number;
      weight: number;
      estimated?: boolean;
    } | null;
    deliveryMode?: string | null;
    deliveryContactName?: string | null;
    deliveryContactEmail?: string | null;
    deliveryContactPhone?: string | null;
    deliveryAddress?: {
      line1: string;
      line2?: string | null;
      city?: string | null;
      zip?: string | null;
      country?: string | null;
      state?: string | null;
    } | null;
    insuranceAmount?: number | null;
    insurance?: boolean | null;
  }>();

  // Firestore "in" limité à 10 valeurs -> chunk
  const chunkSize = 10;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const qy = query(collection(db, QUOTES_COLLECTION), where(documentId(), "in", chunk));
    const snaps = await getDocs(qy);
    snaps.forEach((s) => {
      const d = s.data() as any;
      const packagingPrice = d?.packagingPrice !== undefined && d?.packagingPrice !== null ? d.packagingPrice : null;
      const shippingPrice = d?.shippingPrice !== undefined && d?.shippingPrice !== null ? d.shippingPrice : null;
      
      // Récupérer les paymentLinks depuis Firestore
      const paymentLinks = d?.paymentLinks ? d.paymentLinks.map((link: any) => ({
        id: link.id,
        url: link.url,
        amount: link.amount,
        createdAt: link.createdAt?.toDate ? link.createdAt.toDate() : new Date(link.createdAt),
        status: link.status || 'active',
      })) : null;
      
      // Récupérer l'historique depuis Firestore
      const timeline = d?.timeline ? d.timeline.map((event: any) => ({
        id: event.id,
        date: event.date?.toDate ? event.date.toDate() : new Date(event.date),
        status: event.status,
        description: event.description,
        user: event.user,
      })) : null;
      
      // Récupérer les notes internes depuis Firestore
      const internalNotes = d?.internalNotes && Array.isArray(d.internalNotes) ? d.internalNotes : null;
      
      // Récupérer les dimensions réelles depuis Firestore
      const realDimensions = d?.realDimensions ? {
        length: Number(d.realDimensions.length) || 0,
        width: Number(d.realDimensions.width) || 0,
        height: Number(d.realDimensions.height) || 0,
        weight: Number(d.realDimensions.weight) || 0,
        estimated: d.realDimensions.estimated !== undefined ? d.realDimensions.estimated : false,
      } : null;
      
      // Récupérer les informations d'expédition depuis Firestore
      const carrier = d?.carrier || null;
      const trackingNumber = d?.trackingNumber || null;
      const shippingOption = d?.shippingOption || null;
      
      // Récupérer les champs modifiés depuis Firestore (priorité sur Google Sheets)
      // IMPORTANT: Utiliser !== undefined pour préserver les chaînes vides et null
      const clientName = d?.clientName !== undefined ? d.clientName : null;
      const clientEmail = d?.clientEmail !== undefined ? d.clientEmail : null;
      const clientPhone = d?.clientPhone !== undefined ? d.clientPhone : null;
      const clientAddress = d?.clientAddress !== undefined ? d.clientAddress : null;
      const lotNumber = d?.lotNumber !== undefined ? d.lotNumber : null;
      const lotDescription = d?.lotDescription !== undefined ? d.lotDescription : null;
      const lotValue = d?.lotValue !== undefined && d?.lotValue !== null ? d.lotValue : null;
      const lotAuctionHouse = d?.lotAuctionHouse || null;
      const lotDimensions = d?.lotDimensions ? {
        length: Number(d.lotDimensions.length) || 0,
        width: Number(d.lotDimensions.width) || 0,
        height: Number(d.lotDimensions.height) || 0,
        weight: Number(d.lotDimensions.weight) || 0,
        estimated: d.lotDimensions.estimated !== undefined ? d.lotDimensions.estimated : true,
      } : null;
      const deliveryMode = d?.deliveryMode !== undefined ? d.deliveryMode : null;
      const deliveryContactName = d?.deliveryContactName !== undefined ? d.deliveryContactName : null;
      const deliveryContactEmail = d?.deliveryContactEmail !== undefined ? d.deliveryContactEmail : null;
      const deliveryContactPhone = d?.deliveryContactPhone !== undefined ? d.deliveryContactPhone : null;
      const deliveryAddress = d?.deliveryAddress || null;
      const insuranceAmount = d?.insuranceAmount !== undefined && d?.insuranceAmount !== null ? d.insuranceAmount : null;
      const insurance = d?.insurance !== undefined ? d.insurance : null;
      
      const auctionSheetData = d?.auctionSheet as PersistedAuctionSheet;
      const firestoreStatus = d?.status || null;
      const firestorePaymentStatus = d?.paymentStatus || null;
      console.log('[mergeEnhancements] Récupération depuis Firestore (par ID):', {
        quoteId: s.id,
        reference: d?.reference,
        packagingPrice,
        shippingPrice,
        hasAuctionSheet: !!auctionSheetData,
        bordereauNumber: auctionSheetData?.bordereauNumber,
        auctionSheetKeys: auctionSheetData ? Object.keys(auctionSheetData) : [],
        paymentLinksCount: paymentLinks?.length || 0,
        timelineCount: timeline?.length || 0,
        firestoreStatus: firestoreStatus,
        firestorePaymentStatus: firestorePaymentStatus,
        timelineEvents: timeline?.map(e => ({ status: e.status, description: e.description, date: e.date })) || [],
        paymentLinks: paymentLinks,
        allFirestoreData: Object.keys(d || {}), // Log toutes les clés pour debug
        // Log des champs modifiés
        clientName: clientName,
        clientEmail: clientEmail,
        clientPhone: clientPhone,
        clientAddress: clientAddress,
        lotNumber: lotNumber,
        lotDescription: lotDescription,
        hasModifiedFields: !!(clientName || clientEmail || clientPhone || clientAddress || lotNumber || lotDescription || deliveryMode),
      });
      
      const auctionSheet = (d?.auctionSheet as PersistedAuctionSheet) || null;
      console.log('[mergeEnhancements] AuctionSheet récupéré depuis Firestore:', {
        quoteId: s.id,
        hasAuctionSheet: !!auctionSheet,
        bordereauNumber: auctionSheet?.bordereauNumber,
        auctionSheetKeys: auctionSheet ? Object.keys(auctionSheet) : [],
        auctionSheetFull: auctionSheet, // Log complet pour debug
      });
      
      enhancements.set(s.id, {
        auctionSheet,
        lotEnriched: (d?.lotEnriched as PersistedLotEnriched) || null,
        packagingPrice,
        shippingPrice,
        status: firestoreStatus, // Récupérer le statut depuis Firestore
        paymentStatus: firestorePaymentStatus, // Récupérer le statut de paiement depuis Firestore
        timeline, // Récupérer l'historique depuis Firestore
        paymentLinks,
        internalNotes, // Récupérer les notes internes depuis Firestore
        realDimensions, // Récupérer les dimensions réelles depuis Firestore
        carrier, // Récupérer le transporteur depuis Firestore
        trackingNumber, // Récupérer le numéro de suivi depuis Firestore
        shippingOption, // Récupérer l'option de transport depuis Firestore
        // Champs modifiés depuis l'interface (priorité sur Google Sheets)
        clientName,
        clientEmail,
        clientPhone,
        clientAddress,
        lotNumber,
        lotDescription,
        lotValue,
        lotAuctionHouse,
        lotDimensions,
        deliveryMode,
        deliveryContactName,
        deliveryContactEmail,
        deliveryContactPhone,
        deliveryAddress,
        insuranceAmount,
        insurance,
      });
    });
  }

  // Fallback: si un devis n'a pas le même ID (ancien format), on tente de matcher par reference.
  // IMPORTANT: On récupère aussi les devis sans bordereau pour avoir l'historique
  const missingByRef = quotes
    .filter((q) => !enhancements.has(q.id) && q.reference)
    .map((q) => q.reference)
    .filter(Boolean);
  if (missingByRef.length > 0) {
    for (let i = 0; i < missingByRef.length; i += chunkSize) {
      const chunk = missingByRef.slice(i, i + chunkSize);
      const qy = query(collection(db, QUOTES_COLLECTION), where("reference", "in", chunk));
      const snaps = await getDocs(qy);
      snaps.forEach((s) => {
        const d = s.data() as any;
        const ref = d?.reference;
        const as = (d?.auctionSheet as PersistedAuctionSheet) || null;
        const le = (d?.lotEnriched as PersistedLotEnriched) || null;
        
        // Récupérer les paymentLinks depuis Firestore
        const paymentLinks = d?.paymentLinks ? d.paymentLinks.map((link: any) => ({
          id: link.id,
          url: link.url,
          amount: link.amount,
          createdAt: link.createdAt?.toDate ? link.createdAt.toDate() : new Date(link.createdAt),
          status: link.status || 'active',
        })) : null;
        
        // Récupérer l'historique depuis Firestore
        const timeline = d?.timeline ? d.timeline.map((event: any) => ({
          id: event.id,
          date: event.date?.toDate ? event.date.toDate() : new Date(event.date),
          status: event.status,
          description: event.description,
          user: event.user,
        })) : null;
        
        // Récupérer les notes internes depuis Firestore
        const internalNotes = d?.internalNotes && Array.isArray(d.internalNotes) ? d.internalNotes : null;
        
        // Récupérer les dimensions réelles depuis Firestore
        const realDimensions = d?.realDimensions ? {
          length: Number(d.realDimensions.length) || 0,
          width: Number(d.realDimensions.width) || 0,
          height: Number(d.realDimensions.height) || 0,
          weight: Number(d.realDimensions.weight) || 0,
          estimated: d.realDimensions.estimated !== undefined ? d.realDimensions.estimated : false,
        } : null;
        
        // Récupérer les informations d'expédition depuis Firestore
        const carrier = d?.carrier || null;
        const trackingNumber = d?.trackingNumber || null;
        const shippingOption = d?.shippingOption || null;
        
        // Récupérer les champs modifiés depuis Firestore (priorité sur Google Sheets)
        const clientName = d?.clientName || null;
        const clientEmail = d?.clientEmail || null;
        const clientPhone = d?.clientPhone || null;
        const clientAddress = d?.clientAddress || null;
        const lotNumber = d?.lotNumber || null;
        const lotDescription = d?.lotDescription || null;
        const lotValue = d?.lotValue !== undefined && d?.lotValue !== null ? d.lotValue : null;
        const lotAuctionHouse = d?.lotAuctionHouse || null;
        const lotDimensions = d?.lotDimensions ? {
          length: Number(d.lotDimensions.length) || 0,
          width: Number(d.lotDimensions.width) || 0,
          height: Number(d.lotDimensions.height) || 0,
          weight: Number(d.lotDimensions.weight) || 0,
          estimated: d.lotDimensions.estimated !== undefined ? d.lotDimensions.estimated : true,
        } : null;
        const deliveryMode = d?.deliveryMode || null;
        const deliveryContactName = d?.deliveryContactName || null;
        const deliveryContactEmail = d?.deliveryContactEmail || null;
        const deliveryContactPhone = d?.deliveryContactPhone || null;
        const deliveryAddress = d?.deliveryAddress || null;
        const insuranceAmount = d?.insuranceAmount !== undefined && d?.insuranceAmount !== null ? d.insuranceAmount : null;
        const insurance = d?.insurance !== undefined ? d.insurance : null;
        
        // IMPORTANT: On récupère aussi les devis sans bordereau pour avoir l'historique
        if (!ref) return;
        
        // Si le devis a un bordereau, on l'associe normalement
        if (as) {
          // associer à tous les quotes ayant cette reference
        quotes.forEach((q) => {
          if (q.reference === ref && !enhancements.has(q.id)) {
            enhancements.set(q.id, { 
              auctionSheet: as, 
              lotEnriched: le,
              packagingPrice: d?.packagingPrice || null,
              shippingPrice: d?.shippingPrice || null,
              status: d?.status || null, // Récupérer le statut depuis Firestore
                paymentStatus: d?.paymentStatus || null, // Récupérer le statut de paiement depuis Firestore
                timeline, // Récupérer l'historique depuis Firestore
              paymentLinks,
                internalNotes, // Récupérer les notes internes depuis Firestore
                realDimensions, // Récupérer les dimensions réelles depuis Firestore
                carrier, // Récupérer le transporteur depuis Firestore
                trackingNumber, // Récupérer le numéro de suivi depuis Firestore
                shippingOption, // Récupérer l'option de transport depuis Firestore
                // Champs modifiés depuis l'interface (priorité sur Google Sheets)
                clientName,
                clientEmail,
                clientPhone,
                clientAddress,
                lotNumber,
                lotDescription,
                lotValue,
                lotAuctionHouse,
                lotDimensions,
                deliveryMode,
                deliveryContactName,
                deliveryContactEmail,
                deliveryContactPhone,
                deliveryAddress,
                insuranceAmount,
                insurance,
            });
          }
        });
        } else {
          // Si le devis n'a pas de bordereau mais a un historique ou d'autres données, on l'associe quand même
          quotes.forEach((q) => {
            if (q.reference === ref && !enhancements.has(q.id) && (timeline || paymentLinks || d?.status || d?.packagingPrice || d?.shippingPrice || realDimensions || carrier || trackingNumber)) {
              enhancements.set(q.id, { 
                auctionSheet: null, 
                lotEnriched: null,
                packagingPrice: d?.packagingPrice || null,
                shippingPrice: d?.shippingPrice || null,
                status: d?.status || null, // Récupérer le statut depuis Firestore
                paymentStatus: d?.paymentStatus || null, // Récupérer le statut de paiement depuis Firestore
                timeline, // Récupérer l'historique depuis Firestore (IMPORTANT)
                paymentLinks,
                internalNotes, // Récupérer les notes internes depuis Firestore
                realDimensions, // Récupérer les dimensions réelles depuis Firestore
                carrier, // Récupérer le transporteur depuis Firestore
                trackingNumber, // Récupérer le numéro de suivi depuis Firestore
                shippingOption, // Récupérer l'option de transport depuis Firestore
                // Champs modifiés depuis l'interface (priorité sur Google Sheets)
                clientName,
                clientEmail,
                clientPhone,
                clientAddress,
                lotNumber,
                lotDescription,
                lotValue,
                lotAuctionHouse,
                lotDimensions,
                deliveryMode,
                deliveryContactName,
                deliveryContactEmail,
                deliveryContactPhone,
                deliveryAddress,
                insuranceAmount,
                insurance,
              });
            }
          });
        }
      });
    }
  }

  return quotes.map((q) => {
    const enh = enhancements.get(q.id);
    
    // Toujours récupérer l'historique depuis Firestore, même si le devis n'a pas d'autres enrichissements
    const firestoreTimeline = enh?.timeline 
      ? enh.timeline.map((event: any) => ({
          id: event.id,
          date: event.date?.toDate ? event.date.toDate() : (event.date instanceof Date ? event.date : new Date(event.date)),
          status: event.status,
          description: event.description,
          user: event.user,
        }))
      : null;
    
    if (!enh || !enh.auctionSheet) {
      // Même sans bordereau, récupérer les prix depuis Firestore si disponibles
      const firestoreData = enhancements.get(q.id);
      if (firestoreData) {
        const snap = firestoreData as any;
        const hasPackaging = snap.packagingPrice !== null && snap.packagingPrice !== undefined;
        const hasShipping = snap.shippingPrice !== null && snap.shippingPrice !== undefined;
        
        // Récupérer les paymentLinks depuis Firestore
        const paymentLinks = snap.paymentLinks ? snap.paymentLinks.map((link: any) => ({
          id: link.id,
          url: link.url,
          amount: link.amount,
          createdAt: link.createdAt?.toDate ? link.createdAt.toDate() : new Date(link.createdAt),
          status: link.status || 'active',
        })) : null;
          
          // Récupérer les dimensions réelles depuis Firestore
          const finalRealDimensions = firestoreData.realDimensions ? {
            length: Number(firestoreData.realDimensions.length) || 0,
            width: Number(firestoreData.realDimensions.width) || 0,
            height: Number(firestoreData.realDimensions.height) || 0,
            weight: Number(firestoreData.realDimensions.weight) || 0,
            estimated: firestoreData.realDimensions.estimated !== undefined ? firestoreData.realDimensions.estimated : false,
          } : q.lot.realDimensions;
        
        // Toujours appliquer le statut depuis Firestore s'il existe (même sans packaging/shipping/paymentLinks)
        const finalStatus = firestoreData.status 
          ? (firestoreData.status as Quote['status'])
          : q.status;
        
        // PRIORITÉ ABSOLUE au statut de paiement depuis Firestore (mis à jour par les webhooks)
        const finalPaymentStatus = firestoreData.paymentStatus 
          ? (firestoreData.paymentStatus as Quote['paymentStatus'])
          : q.paymentStatus;
        
        // Log si le statut a été récupéré depuis Firestore
        if (firestoreData.status && firestoreData.status !== q.status) {
          console.log(`[mergeEnhancements] ✅ Statut récupéré depuis Firestore pour ${q.reference}: ${q.status} → ${firestoreData.status}`);
        }
        
        // Log si le statut de paiement a été récupéré depuis Firestore
        if (firestoreData.paymentStatus && firestoreData.paymentStatus !== q.paymentStatus) {
          console.log(`[mergeEnhancements] ✅ Statut de paiement récupéré depuis Firestore pour ${q.reference}: ${q.paymentStatus} → ${firestoreData.paymentStatus}`);
        }
        
        // PRIORITÉ ABSOLUE à l'historique depuis Firestore (contient les événements des webhooks)
        const finalTimeline = firestoreTimeline && firestoreTimeline.length > 0
          ? firestoreTimeline
          : (q.timeline && q.timeline.length > 0 ? q.timeline : []);
        
        if (hasPackaging || hasShipping || paymentLinks || finalTimeline.length > 0 || finalPaymentStatus !== q.paymentStatus) {
          console.log('[mergeEnhancements] Données récupérées depuis Firestore (sans bordereau):', {
            quoteId: q.id,
            packagingPrice: snap.packagingPrice,
            shippingPrice: snap.shippingPrice,
            paymentLinksCount: paymentLinks?.length || 0,
            timelineCount: finalTimeline.length,
            existingTimelineCount: q.timeline?.length || 0,
            existingPackaging: q.options.packagingPrice,
            existingShipping: q.options.shippingPrice,
            statusUpdated: finalStatus !== q.status,
            paymentStatusUpdated: finalPaymentStatus !== q.paymentStatus,
          });
          
          // Récupérer les notes internes depuis Firestore
          const finalInternalNotes = snap.internalNotes && Array.isArray(snap.internalNotes) && snap.internalNotes.length > 0
            ? snap.internalNotes
            : (q.internalNotes && q.internalNotes.length > 0 ? q.internalNotes : []);
          
          // Récupérer les dimensions réelles depuis Firestore
          const finalRealDimensions = firestoreData.realDimensions ? {
            length: Number(firestoreData.realDimensions.length) || 0,
            width: Number(firestoreData.realDimensions.width) || 0,
            height: Number(firestoreData.realDimensions.height) || 0,
            weight: Number(firestoreData.realDimensions.weight) || 0,
            estimated: firestoreData.realDimensions.estimated !== undefined ? firestoreData.realDimensions.estimated : false,
          } : q.lot.realDimensions;
          
          // Appliquer les champs modifiés depuis Firestore (priorité sur Google Sheets)
          const finalClientName = firestoreData.clientName || q.client.name;
          const finalClientEmail = firestoreData.clientEmail || q.client.email;
          const finalClientPhone = firestoreData.clientPhone !== null && firestoreData.clientPhone !== undefined ? firestoreData.clientPhone : q.client.phone;
          const finalClientAddress = firestoreData.clientAddress !== null && firestoreData.clientAddress !== undefined ? firestoreData.clientAddress : q.client.address;
          
          const finalLotNumber = firestoreData.lotNumber || q.lot.number;
          const finalLotDescription = firestoreData.lotDescription || q.lot.description;
          const finalLotValue = firestoreData.lotValue !== null && firestoreData.lotValue !== undefined ? firestoreData.lotValue : q.lot.value;
          const finalLotAuctionHouse = firestoreData.lotAuctionHouse || q.lot.auctionHouse;
          const finalLotDimensions = firestoreData.lotDimensions ? {
            length: Number(firestoreData.lotDimensions.length) || 0,
            width: Number(firestoreData.lotDimensions.width) || 0,
            height: Number(firestoreData.lotDimensions.height) || 0,
            weight: Number(firestoreData.lotDimensions.weight) || 0,
            estimated: firestoreData.lotDimensions.estimated !== undefined ? firestoreData.lotDimensions.estimated : true,
          } : q.lot.dimensions;
          
          const finalDeliveryMode = firestoreData.deliveryMode !== undefined && firestoreData.deliveryMode !== null ? (firestoreData.deliveryMode as DeliveryMode) : q.delivery?.mode;
          const finalDeliveryContactName = firestoreData.deliveryContactName !== undefined ? firestoreData.deliveryContactName : q.delivery?.contact?.name;
          const finalDeliveryContactEmail = firestoreData.deliveryContactEmail !== undefined ? firestoreData.deliveryContactEmail : q.delivery?.contact?.email;
          const finalDeliveryContactPhone = firestoreData.deliveryContactPhone !== undefined ? firestoreData.deliveryContactPhone : q.delivery?.contact?.phone;
          const finalDeliveryAddress = firestoreData.deliveryAddress ? {
            line1: firestoreData.deliveryAddress.line1,
            line2: firestoreData.deliveryAddress.line2 || undefined,
            city: firestoreData.deliveryAddress.city || undefined,
            zip: firestoreData.deliveryAddress.zip || undefined,
            country: firestoreData.deliveryAddress.country || undefined,
            state: firestoreData.deliveryAddress.state || undefined,
          } : q.delivery?.address;
          
          const finalInsuranceAmount = firestoreData.insuranceAmount !== null && firestoreData.insuranceAmount !== undefined ? firestoreData.insuranceAmount : q.options.insuranceAmount;
          const finalInsurance = firestoreData.insurance !== null && firestoreData.insurance !== undefined ? firestoreData.insurance : q.options.insurance;
          
          return {
            ...q,
            status: finalStatus, // Utiliser le statut depuis Firestore si disponible
            paymentStatus: finalPaymentStatus, // PRIORITÉ au statut de paiement depuis Firestore
            timeline: finalTimeline, // PRIORITÉ à l'historique depuis Firestore
            paymentLinks: paymentLinks || q.paymentLinks || [],
            internalNotes: finalInternalNotes, // PRIORITÉ aux notes internes depuis Firestore
            client: {
              ...q.client,
              name: finalClientName,
              email: finalClientEmail,
              phone: finalClientPhone,
              address: finalClientAddress,
            },
            lot: {
              ...q.lot,
              number: finalLotNumber,
              description: finalLotDescription,
              value: finalLotValue,
              auctionHouse: finalLotAuctionHouse,
              dimensions: finalLotDimensions,
              realDimensions: finalRealDimensions, // PRIORITÉ aux dimensions réelles depuis Firestore
            },
            options: {
              ...q.options,
              packagingPrice: hasPackaging ? snap.packagingPrice : q.options.packagingPrice,
              shippingPrice: hasShipping ? snap.shippingPrice : q.options.shippingPrice,
              insuranceAmount: finalInsuranceAmount,
              insurance: finalInsurance,
            },
            delivery: finalDeliveryMode || finalDeliveryContactName || finalDeliveryContactEmail || finalDeliveryContactPhone || finalDeliveryAddress ? {
              mode: finalDeliveryMode || q.delivery?.mode || 'client',
              contact: {
                name: finalDeliveryContactName || q.delivery?.contact?.name || '',
                email: finalDeliveryContactEmail || q.delivery?.contact?.email || '',
                phone: finalDeliveryContactPhone || q.delivery?.contact?.phone || '',
              },
              address: finalDeliveryAddress || q.delivery?.address,
            } : q.delivery,
          };
        }
        
        // Si pas de packaging/shipping/paymentLinks mais qu'il y a un statut modifié ou un historique, l'appliquer quand même
        // Récupérer aussi les notes internes depuis Firestore
        const finalInternalNotes = firestoreData.internalNotes && Array.isArray(firestoreData.internalNotes) && firestoreData.internalNotes.length > 0
          ? firestoreData.internalNotes
          : (q.internalNotes && q.internalNotes.length > 0 ? q.internalNotes : []);
        
        // Récupérer les informations d'expédition depuis Firestore
        const finalCarrier = firestoreData.carrier || q.carrier;
        const finalTrackingNumber = firestoreData.trackingNumber || q.trackingNumber;
        
        // Appliquer les champs modifiés depuis Firestore (priorité sur Google Sheets)
        // IMPORTANT: Utiliser !== undefined pour préserver les chaînes vides et null
        const finalClientName2 = firestoreData.clientName !== undefined && firestoreData.clientName !== null ? firestoreData.clientName : q.client.name;
        const finalClientEmail2 = firestoreData.clientEmail !== undefined && firestoreData.clientEmail !== null ? firestoreData.clientEmail : q.client.email;
        const finalClientPhone2 = firestoreData.clientPhone !== undefined ? firestoreData.clientPhone : q.client.phone;
        const finalClientAddress2 = firestoreData.clientAddress !== undefined ? firestoreData.clientAddress : q.client.address;
        
        const finalLotNumber2 = firestoreData.lotNumber !== undefined && firestoreData.lotNumber !== null ? firestoreData.lotNumber : q.lot.number;
        const finalLotDescription2 = firestoreData.lotDescription !== undefined && firestoreData.lotDescription !== null ? firestoreData.lotDescription : q.lot.description;
        const finalLotValue2 = firestoreData.lotValue !== null && firestoreData.lotValue !== undefined ? firestoreData.lotValue : q.lot.value;
        const finalLotAuctionHouse2 = firestoreData.lotAuctionHouse || q.lot.auctionHouse;
        const finalLotDimensions2 = firestoreData.lotDimensions ? {
          length: Number(firestoreData.lotDimensions.length) || 0,
          width: Number(firestoreData.lotDimensions.width) || 0,
          height: Number(firestoreData.lotDimensions.height) || 0,
          weight: Number(firestoreData.lotDimensions.weight) || 0,
          estimated: firestoreData.lotDimensions.estimated !== undefined ? firestoreData.lotDimensions.estimated : true,
        } : q.lot.dimensions;
        
        const finalDeliveryMode2 = firestoreData.deliveryMode !== undefined && firestoreData.deliveryMode !== null ? (firestoreData.deliveryMode as DeliveryMode) : q.delivery?.mode;
        const finalDeliveryContactName2 = firestoreData.deliveryContactName !== undefined ? firestoreData.deliveryContactName : q.delivery?.contact?.name;
        const finalDeliveryContactEmail2 = firestoreData.deliveryContactEmail !== undefined ? firestoreData.deliveryContactEmail : q.delivery?.contact?.email;
        const finalDeliveryContactPhone2 = firestoreData.deliveryContactPhone !== undefined ? firestoreData.deliveryContactPhone : q.delivery?.contact?.phone;
        const finalDeliveryAddress2 = firestoreData.deliveryAddress ? {
          line1: firestoreData.deliveryAddress.line1,
          line2: firestoreData.deliveryAddress.line2 || undefined,
          city: firestoreData.deliveryAddress.city || undefined,
          zip: firestoreData.deliveryAddress.zip || undefined,
          country: firestoreData.deliveryAddress.country || undefined,
          state: firestoreData.deliveryAddress.state || undefined,
        } : q.delivery?.address;
        
        const finalInsuranceAmount2 = firestoreData.insuranceAmount !== null && firestoreData.insuranceAmount !== undefined ? firestoreData.insuranceAmount : q.options.insuranceAmount;
        const finalInsurance2 = firestoreData.insurance !== null && firestoreData.insurance !== undefined ? firestoreData.insurance : q.options.insurance;
        
        if (finalStatus !== q.status || finalTimeline.length > 0 || finalPaymentStatus !== q.paymentStatus || finalInternalNotes.length !== (q.internalNotes?.length || 0) || finalRealDimensions !== q.lot.realDimensions || finalCarrier !== q.carrier || finalTrackingNumber !== q.trackingNumber || finalClientName2 !== q.client.name || finalClientEmail2 !== q.client.email || finalLotDescription2 !== q.lot.description) {
          console.log(`[mergeEnhancements] ✅ Statut/historique mis à jour depuis Firestore pour ${q.reference} (sans autres enrichissements): ${q.status} → ${finalStatus}, paymentStatus: ${q.paymentStatus} → ${finalPaymentStatus}, timeline: ${finalTimeline.length} événements, notes: ${finalInternalNotes.length}, carrier: ${finalCarrier || 'non renseigné'}`);
          return {
            ...q,
            status: finalStatus,
            paymentStatus: finalPaymentStatus, // PRIORITÉ au statut de paiement depuis Firestore
            timeline: finalTimeline, // PRIORITÉ à l'historique depuis Firestore
            internalNotes: finalInternalNotes, // PRIORITÉ aux notes internes depuis Firestore
            carrier: finalCarrier, // PRIORITÉ au transporteur depuis Firestore
            trackingNumber: finalTrackingNumber, // PRIORITÉ au numéro de suivi depuis Firestore
            client: {
              ...q.client,
              name: finalClientName2,
              email: finalClientEmail2,
              phone: finalClientPhone2,
              address: finalClientAddress2,
            },
            lot: {
              ...q.lot,
              number: finalLotNumber2,
              description: finalLotDescription2,
              value: finalLotValue2,
              auctionHouse: finalLotAuctionHouse2,
              dimensions: finalLotDimensions2,
              realDimensions: finalRealDimensions, // PRIORITÉ aux dimensions réelles depuis Firestore
            },
            options: {
              ...q.options,
              insuranceAmount: finalInsuranceAmount2,
              insurance: finalInsurance2,
            },
            delivery: (() => {
              const mode = finalDeliveryMode2 || q.delivery?.mode || 'client';
              const contact = {
                name: mode === 'client'
                  ? (finalClientName2 || q.client.name || '')
                  : (finalDeliveryContactName2 || q.delivery?.contact?.name || ''),
                email: mode === 'client'
                  ? (finalClientEmail2 || q.client.email || '')
                  : (finalDeliveryContactEmail2 || q.delivery?.contact?.email || ''),
                phone: mode === 'client'
                  ? (finalClientPhone2 || q.client.phone || '')
                  : (finalDeliveryContactPhone2 || q.delivery?.contact?.phone || ''),
              };
              const address = (() => {
                if (mode === 'client') {
                  return finalDeliveryAddress2 || q.delivery?.address || { line1: finalClientAddress2 || q.client.address || '' };
                }
                return finalDeliveryAddress2 || q.delivery?.address;
              })();
              return contact.name || contact.email || contact.phone || address
                ? { mode, contact, address }
                : q.delivery;
            })(),
          };
        }
      }
      
      // Même si pas de données Firestore, utiliser l'historique récupéré si disponible
      // Récupérer aussi les notes internes depuis Firestore
      const finalInternalNotes = enh?.internalNotes && Array.isArray(enh.internalNotes) && enh.internalNotes.length > 0
        ? enh.internalNotes
        : (q.internalNotes && q.internalNotes.length > 0 ? q.internalNotes : []);
      
      // Appliquer les champs modifiés depuis Firestore (priorité sur Google Sheets)
      // IMPORTANT: Utiliser !== undefined pour préserver les chaînes vides et null
      const finalClientName3 = enh?.clientName !== undefined && enh?.clientName !== null ? enh.clientName : q.client.name;
      const finalClientEmail3 = enh?.clientEmail !== undefined && enh?.clientEmail !== null ? enh.clientEmail : q.client.email;
      const finalClientPhone3 = enh?.clientPhone !== undefined ? enh.clientPhone : q.client.phone;
      const finalClientAddress3 = enh?.clientAddress !== undefined ? enh.clientAddress : q.client.address;
      
      const finalLotNumber3 = enh?.lotNumber !== undefined && enh?.lotNumber !== null ? enh.lotNumber : q.lot.number;
      const finalLotDescription3 = enh?.lotDescription !== undefined && enh?.lotDescription !== null ? enh.lotDescription : q.lot.description;
      
      // Log si des champs modifiés sont détectés
      if (enh?.clientName !== undefined || enh?.clientEmail !== undefined || enh?.lotDescription !== undefined) {
        console.log(`[mergeEnhancements] ✅ Champs modifiés détectés depuis Firestore pour ${q.reference} (sans bordereau):`, {
          clientName: enh?.clientName !== undefined ? `${q.client.name} → ${enh.clientName}` : 'non modifié',
          clientEmail: enh?.clientEmail !== undefined ? `${q.client.email} → ${enh.clientEmail}` : 'non modifié',
          lotDescription: enh?.lotDescription !== undefined ? `${q.lot.description?.substring(0, 30)}... → ${enh.lotDescription?.substring(0, 30)}...` : 'non modifié',
        });
      }
      const finalLotValue3 = enh?.lotValue !== null && enh?.lotValue !== undefined ? enh.lotValue : q.lot.value;
      const finalLotAuctionHouse3 = enh?.lotAuctionHouse || q.lot.auctionHouse;
      const finalLotDimensions3 = enh?.lotDimensions ? {
        length: Number(enh.lotDimensions.length) || 0,
        width: Number(enh.lotDimensions.width) || 0,
        height: Number(enh.lotDimensions.height) || 0,
        weight: Number(enh.lotDimensions.weight) || 0,
        estimated: enh.lotDimensions.estimated !== undefined ? enh.lotDimensions.estimated : true,
      } : q.lot.dimensions;
      
      const finalDeliveryMode3 = enh?.deliveryMode !== undefined && enh?.deliveryMode !== null ? (enh.deliveryMode as DeliveryMode) : q.delivery?.mode;
      const finalDeliveryContactName3 = enh?.deliveryContactName !== undefined ? enh.deliveryContactName : q.delivery?.contact?.name;
      const finalDeliveryContactEmail3 = enh?.deliveryContactEmail !== undefined ? enh.deliveryContactEmail : q.delivery?.contact?.email;
      const finalDeliveryContactPhone3 = enh?.deliveryContactPhone !== undefined ? enh.deliveryContactPhone : q.delivery?.contact?.phone;
      const finalDeliveryAddress3 = enh?.deliveryAddress ? {
        line1: enh.deliveryAddress.line1,
        line2: enh.deliveryAddress.line2 || undefined,
        city: enh.deliveryAddress.city || undefined,
        zip: enh.deliveryAddress.zip || undefined,
        country: enh.deliveryAddress.country || undefined,
        state: enh.deliveryAddress.state || undefined,
      } : q.delivery?.address;
      
      const finalInsuranceAmount3 = enh?.insuranceAmount !== null && enh?.insuranceAmount !== undefined ? enh.insuranceAmount : q.options.insuranceAmount;
      const finalInsurance3 = enh?.insurance !== null && enh?.insurance !== undefined ? enh.insurance : q.options.insurance;
      
      if (firestoreTimeline && firestoreTimeline.length > 0) {
        const finalPaymentStatus = enh?.paymentStatus 
          ? (enh.paymentStatus as Quote['paymentStatus'])
          : q.paymentStatus;
        console.log(`[mergeEnhancements] ✅ Historique récupéré depuis Firestore pour ${q.reference}: ${firestoreTimeline.length} événements, paymentStatus: ${q.paymentStatus} → ${finalPaymentStatus}, notes: ${finalInternalNotes.length}`);
        return {
          ...q,
          paymentStatus: finalPaymentStatus, // PRIORITÉ au statut de paiement depuis Firestore
          timeline: firestoreTimeline,
          internalNotes: finalInternalNotes, // PRIORITÉ aux notes internes depuis Firestore
          client: {
            ...q.client,
            name: finalClientName3,
            email: finalClientEmail3,
            phone: finalClientPhone3,
            address: finalClientAddress3,
          },
          lot: {
            ...q.lot,
            number: finalLotNumber3,
            description: finalLotDescription3,
            value: finalLotValue3,
            auctionHouse: finalLotAuctionHouse3,
            dimensions: finalLotDimensions3,
          },
          options: {
            ...q.options,
            insuranceAmount: finalInsuranceAmount3,
            insurance: finalInsurance3,
          },
          delivery: (() => {
            const mode = finalDeliveryMode3 || q.delivery?.mode || 'client';
            const contact = {
              name: mode === 'client'
                ? (finalClientName3 || q.client.name || '')
                : (finalDeliveryContactName3 || q.delivery?.contact?.name || ''),
              email: mode === 'client'
                ? (finalClientEmail3 || q.client.email || '')
                : (finalDeliveryContactEmail3 || q.delivery?.contact?.email || ''),
              phone: mode === 'client'
                ? (finalClientPhone3 || q.client.phone || '')
                : (finalDeliveryContactPhone3 || q.delivery?.contact?.phone || ''),
            };
            const address = (() => {
              if (mode === 'client') {
                return finalDeliveryAddress3 || q.delivery?.address || { line1: finalClientAddress3 || q.client.address || '' };
              }
              return finalDeliveryAddress3 || q.delivery?.address;
            })();
            return contact.name || contact.email || contact.phone || address
              ? { mode, contact, address }
              : q.delivery;
          })(),
        };
      }
      
      // Même si pas d'historique, vérifier si le paymentStatus ou les notes ont changé
      if ((enh?.paymentStatus && enh.paymentStatus !== q.paymentStatus) || finalInternalNotes.length !== (q.internalNotes?.length || 0) || finalClientName3 !== q.client.name || finalClientEmail3 !== q.client.email || finalLotDescription3 !== q.lot.description) {
        console.log(`[mergeEnhancements] ✅ Statut de paiement/notes/champs modifiés récupéré depuis Firestore pour ${q.reference}: paymentStatus: ${q.paymentStatus} → ${enh?.paymentStatus}, notes: ${finalInternalNotes.length}`);
        return {
          ...q,
          paymentStatus: enh?.paymentStatus ? (enh.paymentStatus as Quote['paymentStatus']) : q.paymentStatus,
          internalNotes: finalInternalNotes, // PRIORITÉ aux notes internes depuis Firestore
          client: {
            ...q.client,
            name: finalClientName3,
            email: finalClientEmail3,
            phone: finalClientPhone3,
            address: finalClientAddress3,
          },
          lot: {
            ...q.lot,
            number: finalLotNumber3,
            description: finalLotDescription3,
            value: finalLotValue3,
            auctionHouse: finalLotAuctionHouse3,
            dimensions: finalLotDimensions3,
          },
          options: {
            ...q.options,
            insuranceAmount: finalInsuranceAmount3,
            insurance: finalInsurance3,
          },
          delivery: finalDeliveryMode3 || finalDeliveryContactName3 || finalDeliveryContactEmail3 || finalDeliveryContactPhone3 || finalDeliveryAddress3 ? {
            mode: finalDeliveryMode3 || q.delivery?.mode || 'client',
            contact: {
              name: finalDeliveryContactName3 || q.delivery?.contact?.name || '',
              email: finalDeliveryContactEmail3 || q.delivery?.contact?.email || '',
              phone: finalDeliveryContactPhone3 || q.delivery?.contact?.phone || '',
            },
            address: finalDeliveryAddress3 || q.delivery?.address,
          } : q.delivery,
        };
      }
      
      // Même si pas de changements détectés, appliquer les champs modifiés s'ils existent dans Firestore
      // IMPORTANT: Vérifier !== undefined pour détecter les champs modifiés même s'ils sont null ou chaînes vides
      if (enh?.clientName !== undefined || enh?.clientEmail !== undefined || enh?.lotDescription !== undefined || enh?.lotNumber !== undefined || enh?.deliveryMode !== undefined) {
        return {
          ...q,
          client: {
            ...q.client,
            name: finalClientName3,
            email: finalClientEmail3,
            phone: finalClientPhone3,
            address: finalClientAddress3,
          },
          lot: {
            ...q.lot,
            number: finalLotNumber3,
            description: finalLotDescription3,
            value: finalLotValue3,
            auctionHouse: finalLotAuctionHouse3,
            dimensions: finalLotDimensions3,
          },
          options: {
            ...q.options,
            insuranceAmount: finalInsuranceAmount3,
            insurance: finalInsurance3,
          },
          delivery: finalDeliveryMode3 || finalDeliveryContactName3 || finalDeliveryContactEmail3 || finalDeliveryContactPhone3 || finalDeliveryAddress3 ? {
            mode: finalDeliveryMode3 || q.delivery?.mode || 'client',
            contact: {
              name: finalDeliveryContactName3 || q.delivery?.contact?.name || '',
              email: finalDeliveryContactEmail3 || q.delivery?.contact?.email || '',
              phone: finalDeliveryContactPhone3 || q.delivery?.contact?.phone || '',
            },
            address: finalDeliveryAddress3 || q.delivery?.address,
          } : q.delivery,
        };
      }
      
      // Même si aucune condition n'est remplie, appliquer les champs modifiés s'ils existent dans Firestore
      // IMPORTANT: Toujours appliquer les champs modifiés même si aucune autre condition n'est remplie
      if (enh?.clientName !== undefined || enh?.clientEmail !== undefined || enh?.lotDescription !== undefined || enh?.lotNumber !== undefined || enh?.deliveryMode !== undefined) {
        console.log(`[mergeEnhancements] ✅ Application des champs modifiés depuis Firestore pour ${q.reference} (sans bordereau, aucune autre condition):`, {
          clientName: enh?.clientName !== undefined ? `${q.client.name} → ${enh.clientName}` : 'non modifié',
          clientEmail: enh?.clientEmail !== undefined ? `${q.client.email} → ${enh.clientEmail}` : 'non modifié',
        });
        return {
          ...q,
          client: {
            ...q.client,
            name: finalClientName3,
            email: finalClientEmail3,
            phone: finalClientPhone3,
            address: finalClientAddress3,
          },
          lot: {
            ...q.lot,
            number: finalLotNumber3,
            description: finalLotDescription3,
            value: finalLotValue3,
            auctionHouse: finalLotAuctionHouse3,
            dimensions: finalLotDimensions3,
          },
          options: {
            ...q.options,
            insuranceAmount: finalInsuranceAmount3,
            insurance: finalInsurance3,
          },
          delivery: finalDeliveryMode3 || finalDeliveryContactName3 || finalDeliveryContactEmail3 || finalDeliveryContactPhone3 || finalDeliveryAddress3 ? {
            mode: finalDeliveryMode3 || q.delivery?.mode || 'client',
            contact: {
              name: finalDeliveryContactName3 || q.delivery?.contact?.name || '',
              email: finalDeliveryContactEmail3 || q.delivery?.contact?.email || '',
              phone: finalDeliveryContactPhone3 || q.delivery?.contact?.phone || '',
            },
            address: finalDeliveryAddress3 || q.delivery?.address,
          } : q.delivery,
        };
      }
      
      // Même si aucune condition n'est remplie, toujours appliquer l'assurance si elle existe
      // IMPORTANT: L'assurance doit toujours être appliquée, même si aucune autre condition n'est remplie
      if (enh?.insuranceAmount !== undefined || enh?.insurance !== undefined || q.options.insuranceAmount !== undefined || q.options.insurance !== undefined) {
        return {
          ...q,
          options: {
            ...q.options,
            insuranceAmount: finalInsuranceAmount3,
            insurance: finalInsurance3,
          },
        };
      }
      
      return q;
    }

    // Appliquer aussi au lot (pour remplir "Informations du lot" au redémarrage)
    // Gérer correctement les prix : si Firestore a une valeur (même 0), l'utiliser, sinon garder l'existant
    const finalPackagingPrice = (enh.packagingPrice !== null && enh.packagingPrice !== undefined) 
      ? enh.packagingPrice 
      : (q.options.packagingPrice !== undefined ? q.options.packagingPrice : undefined);
    const finalShippingPrice = (enh.shippingPrice !== null && enh.shippingPrice !== undefined) 
      ? enh.shippingPrice 
      : (q.options.shippingPrice !== undefined ? q.options.shippingPrice : undefined);
    
    // Récupérer les paymentLinks depuis Firestore si disponibles
    const finalPaymentLinks = enh.paymentLinks && enh.paymentLinks.length > 0 
      ? enh.paymentLinks 
      : (q.paymentLinks && q.paymentLinks.length > 0 ? q.paymentLinks : []);
    
    console.log('[mergeEnhancements] Prix récupérés depuis Firestore (avec bordereau):', {
      quoteId: q.id,
      firestorePackaging: enh.packagingPrice,
      firestoreShipping: enh.shippingPrice,
      existingPackaging: q.options.packagingPrice,
      existingShipping: q.options.shippingPrice,
      finalPackaging: finalPackagingPrice,
      finalShipping: finalShippingPrice,
      firestorePaymentLinks: enh.paymentLinks?.length || 0,
      existingPaymentLinks: q.paymentLinks?.length || 0,
      finalPaymentLinks: finalPaymentLinks.length,
      bordereauNumber: enh.auctionSheet?.bordereauNumber,
      hasAuctionSheet: !!enh.auctionSheet,
    });
    
    // Utiliser le statut de Firestore s'il existe (priorité absolue à Firestore)
    const finalStatus = enh.status 
      ? (enh.status as Quote['status'])
      : q.status;
    
    // PRIORITÉ ABSOLUE au statut de paiement depuis Firestore (mis à jour par les webhooks)
    const finalPaymentStatus = enh.paymentStatus 
      ? (enh.paymentStatus as Quote['paymentStatus'])
      : q.paymentStatus;
    
    // Log si le statut a été récupéré depuis Firestore
    if (enh.status && enh.status !== q.status) {
      console.log(`[mergeEnhancements] ✅ Statut récupéré depuis Firestore pour ${q.reference} (avec bordereau): ${q.status} → ${enh.status}`);
    }
    
    // Log si le statut de paiement a été récupéré depuis Firestore
    if (enh.paymentStatus && enh.paymentStatus !== q.paymentStatus) {
      console.log(`[mergeEnhancements] ✅ Statut de paiement récupéré depuis Firestore pour ${q.reference} (avec bordereau): ${q.paymentStatus} → ${enh.paymentStatus}`);
    }
    
    // PRIORITÉ ABSOLUE à l'historique depuis Firestore (contient les événements des webhooks)
    // L'historique depuis Firestore est toujours prioritaire sur celui du devis initial
    const finalTimeline = firestoreTimeline && firestoreTimeline.length > 0
      ? firestoreTimeline
      : (q.timeline && q.timeline.length > 0 ? q.timeline : []);
    
    if (firestoreTimeline && firestoreTimeline.length > 0 && firestoreTimeline.length !== (q.timeline?.length || 0)) {
      console.log(`[mergeEnhancements] ✅ Historique mis à jour depuis Firestore pour ${q.reference}: ${q.timeline?.length || 0} → ${firestoreTimeline.length} événements`);
    }
    
    // PRIORITÉ ABSOLUE aux notes internes depuis Firestore
    const finalInternalNotes = enh.internalNotes && Array.isArray(enh.internalNotes) && enh.internalNotes.length > 0
      ? enh.internalNotes
      : (q.internalNotes && q.internalNotes.length > 0 ? q.internalNotes : []);
    
    // Récupérer les dimensions réelles depuis Firestore
    const finalRealDimensions = enh.realDimensions ? {
      length: Number(enh.realDimensions.length) || 0,
      width: Number(enh.realDimensions.width) || 0,
      height: Number(enh.realDimensions.height) || 0,
      weight: Number(enh.realDimensions.weight) || 0,
      estimated: enh.realDimensions.estimated !== undefined ? enh.realDimensions.estimated : false,
    } : q.lot.realDimensions;
    
    // Appliquer les champs modifiés depuis Firestore (priorité sur Google Sheets)
    // IMPORTANT: Utiliser !== undefined pour préserver les chaînes vides et null
    // TOUJOURS appliquer les champs modifiés s'ils existent dans Firestore, même pour les devis avec bordereau
    const finalClientName = enh.clientName !== undefined && enh.clientName !== null ? enh.clientName : q.client.name;
    const finalClientEmail = enh.clientEmail !== undefined && enh.clientEmail !== null ? enh.clientEmail : q.client.email;
    const finalClientPhone = enh.clientPhone !== undefined ? enh.clientPhone : q.client.phone;
    const finalClientAddress = enh.clientAddress !== undefined ? enh.clientAddress : q.client.address;
    
    const finalLotNumber = enh.lotNumber !== undefined && enh.lotNumber !== null ? enh.lotNumber : q.lot.number;
    const finalLotDescription = enh.lotDescription !== undefined && enh.lotDescription !== null ? enh.lotDescription : q.lot.description;
    
    // Log si des champs modifiés sont détectés
    if (enh.clientName !== undefined || enh.clientEmail !== undefined || enh.lotDescription !== undefined) {
      console.log(`[mergeEnhancements] ✅ Champs modifiés détectés depuis Firestore pour ${q.reference} (avec bordereau):`, {
        clientName: enh.clientName !== undefined ? `${q.client.name} → ${enh.clientName}` : 'non modifié',
        clientEmail: enh.clientEmail !== undefined ? `${q.client.email} → ${enh.clientEmail}` : 'non modifié',
        lotDescription: enh.lotDescription !== undefined ? `${q.lot.description?.substring(0, 30)}... → ${enh.lotDescription?.substring(0, 30)}...` : 'non modifié',
      });
    }
    const finalLotValue = enh.lotValue !== null && enh.lotValue !== undefined ? enh.lotValue : q.lot.value;
    const finalLotAuctionHouse = enh.lotAuctionHouse || q.lot.auctionHouse;
    const finalLotDimensions = enh.lotDimensions ? {
      length: Number(enh.lotDimensions.length) || 0,
      width: Number(enh.lotDimensions.width) || 0,
      height: Number(enh.lotDimensions.height) || 0,
      weight: Number(enh.lotDimensions.weight) || 0,
      estimated: enh.lotDimensions.estimated !== undefined ? enh.lotDimensions.estimated : true,
    } : q.lot.dimensions;
    
    const finalDeliveryMode = enh.deliveryMode !== undefined && enh.deliveryMode !== null ? (enh.deliveryMode as DeliveryMode) : q.delivery?.mode;
    const finalDeliveryContactName = enh.deliveryContactName !== undefined ? enh.deliveryContactName : q.delivery?.contact?.name;
    const finalDeliveryContactEmail = enh.deliveryContactEmail !== undefined ? enh.deliveryContactEmail : q.delivery?.contact?.email;
    const finalDeliveryContactPhone = enh.deliveryContactPhone !== undefined ? enh.deliveryContactPhone : q.delivery?.contact?.phone;
    const finalDeliveryAddress = enh.deliveryAddress ? {
      line1: enh.deliveryAddress.line1,
      line2: enh.deliveryAddress.line2 || undefined,
      city: enh.deliveryAddress.city || undefined,
      zip: enh.deliveryAddress.zip || undefined,
      country: enh.deliveryAddress.country || undefined,
      state: enh.deliveryAddress.state || undefined,
    } : q.delivery?.address;
    
    const finalInsuranceAmount = enh.insuranceAmount !== null && enh.insuranceAmount !== undefined ? enh.insuranceAmount : q.options.insuranceAmount;
    const finalInsurance = enh.insurance !== null && enh.insurance !== undefined ? enh.insurance : q.options.insurance;
    
    const next: Quote = { 
      ...q, 
      auctionSheet: enh.auctionSheet,
      status: finalStatus, // Utiliser le statut depuis Firestore si disponible
      paymentStatus: finalPaymentStatus, // PRIORITÉ au statut de paiement depuis Firestore
      timeline: finalTimeline, // Utiliser l'historique depuis Firestore si disponible
      paymentLinks: finalPaymentLinks,
      internalNotes: finalInternalNotes, // PRIORITÉ aux notes internes depuis Firestore
      client: {
        ...q.client,
        name: finalClientName,
        email: finalClientEmail,
        phone: finalClientPhone,
        address: finalClientAddress,
      },
      lot: {
        ...q.lot,
        number: finalLotNumber,
        description: finalLotDescription,
        value: finalLotValue,
        auctionHouse: finalLotAuctionHouse,
        dimensions: finalLotDimensions,
        realDimensions: finalRealDimensions, // PRIORITÉ aux dimensions réelles depuis Firestore
      },
      options: {
        ...q.options,
        packagingPrice: finalPackagingPrice,
        shippingPrice: finalShippingPrice,
        insuranceAmount: finalInsuranceAmount,
        insurance: finalInsurance,
      },
      delivery: (() => {
        const mode = finalDeliveryMode || q.delivery?.mode || 'client';
        // Si le mode est "client", utiliser les informations du client comme destinataire
        if (mode === 'client') {
          return {
            mode: 'client' as const,
            contact: {
              name: finalClientName || q.client.name || '',
              email: finalClientEmail || q.client.email || '',
              phone: finalClientPhone || q.client.phone || '',
            },
            address: {
              line1: finalClientAddress || q.client.address || '',
              country: q.delivery?.address?.country || '',
            },
          };
        }
        // Si le mode est "receiver" ou "pickup", utiliser les informations du destinataire/point relais
        return {
          mode: mode as DeliveryMode,
          contact: {
            name: finalDeliveryContactName || q.delivery?.contact?.name || '',
            email: finalDeliveryContactEmail || q.delivery?.contact?.email || '',
            phone: finalDeliveryContactPhone || q.delivery?.contact?.phone || '',
          },
          address: finalDeliveryAddress || q.delivery?.address || {},
        };
      })(),
    };
    
    console.log('[mergeEnhancements] Quote final avec auctionSheet:', {
      quoteId: next.id,
      bordereauNumber: next.auctionSheet?.bordereauNumber,
      auctionSheetKeys: next.auctionSheet ? Object.keys(next.auctionSheet) : [],
      auctionSheetFull: next.auctionSheet, // Log complet pour debug
    });
    const fromLotEnriched = enh.lotEnriched || computeLotEnrichedFromAuctionSheet({
      auctionHouse: enh.auctionSheet.auctionHouse,
      auctionDate: enh.auctionSheet.auctionDate,
      lots: (enh.auctionSheet.lots || []).map((l) => ({
        lotNumber: l.lotNumber,
        description: l.description,
        estimatedDimensions: l.estimatedDimensions as any,
        value: l.value,
      })),
      totalLots: enh.auctionSheet.totalLots,
      totalObjects: enh.auctionSheet.totalObjects,
      invoiceTotal: enh.auctionSheet.invoiceTotal,
    recommendedCarton: enh.auctionSheet.recommendedCarton as any,
      rawText: enh.auctionSheet.rawText,
    } as any);
    const firstLot = enh.auctionSheet.lots?.[0];

    const currentDesc = (next.lot.description || "").trim();
    const isPlaceholderDesc = /^(objet\s+à\s+transporter|objet\s+a\s+transporter|objet)$/i.test(currentDesc);

    const descCandidate =
      fromLotEnriched?.description ||
      (firstLot?.description ? toShortLotDescription(firstLot.description) : "");

    if (descCandidate && (currentDesc.length === 0 || isPlaceholderDesc || currentDesc.length < 10)) {
      next.lot = { ...next.lot, description: descCandidate };
    }

  // PRIORITÉ ABSOLUE aux dimensions INTERNES du carton (inner > required)
  // Les dimensions internes (inner) sont celles du colis, à utiliser en priorité
  const cartonDims = enh.auctionSheet.recommendedCarton?.inner || enh.auctionSheet.recommendedCarton?.required;
  const cd = next.lot.dimensions || { length: 0, width: 0, height: 0, weight: 0, estimated: true };
  
  if (cartonDims) {
    // Si on a un carton recommandé, utiliser TOUJOURS ses dimensions INTERNES (priorité absolue)
    const cartonLength = Number((cartonDims as any).length);
    const cartonWidth = Number((cartonDims as any).width);
    const cartonHeight = Number((cartonDims as any).height);
    
    console.log('[quoteEnhancements] Application dimensions INTERNES du carton:', {
      quoteId: q.id,
      carton: enh.auctionSheet.recommendedCarton?.ref,
      inner: enh.auctionSheet.recommendedCarton?.inner,
      required: enh.auctionSheet.recommendedCarton?.required,
      dimensionsUtilisees: { length: cartonLength, width: cartonWidth, height: cartonHeight },
      anciennes: { length: cd.length, width: cd.width, height: cd.height }
    });
    
    // Utiliser les dimensions INTERNES du carton (dimensions du colis)
    next.lot = {
      ...next.lot,
      dimensions: {
        length: isNaN(cartonLength) ? 0 : cartonLength,
        width: isNaN(cartonWidth) ? 0 : cartonWidth,
        height: isNaN(cartonHeight) ? 0 : cartonHeight,
        // Le carton n'a pas de poids : on garde un poids déjà présent, sinon on prend celui du lot enrichi.
        weight: (fromLotEnriched?.dimensions as any)?.weight || (firstLot?.estimatedDimensions as any)?.weight || cd.weight || 0,
        estimated: true,
      },
    };
  } else {
    // Fallback vers dimensions enrichies/lot UNIQUEMENT si pas de carton recommandé
    const dimsCandidate = fromLotEnriched?.dimensions || firstLot?.estimatedDimensions;
    if (dimsCandidate) {
      const needOverride =
        !cd.length || !cd.width || !cd.height || !cd.weight ||
        cd.length === 0 || cd.width === 0 || cd.height === 0 || cd.weight === 0;
      if (needOverride) {
        next.lot = {
          ...next.lot,
          dimensions: {
            ...cd,
            length: Number((dimsCandidate as any).length) || cd.length || 0,
            width: Number((dimsCandidate as any).width) || cd.width || 0,
            height: Number((dimsCandidate as any).height) || cd.height || 0,
            weight: Number((dimsCandidate as any).weight) || cd.weight || 0,
            estimated: true,
          },
        };
      }
    }
  }

    const valueCandidate =
      typeof fromLotEnriched?.value === "number"
        ? fromLotEnriched.value
        : (typeof enh.auctionSheet.invoiceTotal === "number" ? enh.auctionSheet.invoiceTotal : undefined);
    if (valueCandidate && (!next.lot.value || next.lot.value === 0)) {
      next.lot = { ...next.lot, value: valueCandidate };
    }

    // Appliquer les prix depuis Firestore si disponibles
    if (enh.packagingPrice || enh.shippingPrice) {
      next.options = {
        ...next.options,
        packagingPrice: enh.packagingPrice || next.options.packagingPrice,
        shippingPrice: enh.shippingPrice || next.options.shippingPrice,
      };
    }

    const houseCandidate =
      fromLotEnriched?.auctionHouse || enh.auctionSheet.auctionHouse || undefined;
    if (houseCandidate && (!next.lot.auctionHouse || next.lot.auctionHouse === "Non précisée")) {
      next.lot = { ...next.lot, auctionHouse: houseCandidate };
    }

    const numberCandidate = fromLotEnriched?.number || firstLot?.lotNumber || undefined;
    if (numberCandidate && (!next.lot.number || next.lot.number.startsWith("LOT-"))) {
      next.lot = { ...next.lot, number: numberCandidate };
    }

    // Best-effort: si lotEnriched n'était pas encore persisté, on le stocke une fois
    // (pour éviter de dépendre du recalcul à chaque chargement).
    if (!enh.lotEnriched && fromLotEnriched) {
      try {
        void setDoc(
          doc(db, QUOTES_COLLECTION, q.id),
          { lotEnriched: fromLotEnriched, updatedAt: Timestamp.now() },
          { merge: true }
        );
      } catch {
        // ignore
      }
    }

    return next;
  });
}

export async function upsertQuotesToFirestore(quotes: Quote[]) {
  if (!firebaseEnabled) return;
  await authReady;
  if (!auth.currentUser) return;

  const batch = writeBatch(db);
  const now = Timestamp.now();

  for (const q of quotes) {
    const ref = doc(db, QUOTES_COLLECTION, q.id);

    // Migration / réparation: si un doc "quote" existe déjà avec la même reference
    // (ancien ID instable), et qu'il contient auctionSheet, on copie vers le nouveau docId.
    // Ça permet de retrouver le bordereau après redémarrage même si l'ID a changé.
    let existingStatus: string | null = null;
    let existingPaymentStatus: string | null = null;
    let existingTimeline: any[] | null = null;
    let existingInternalNotes: string[] | null = null;
    let existingPackagingPrice: number | null = null;
    let existingShippingPrice: number | null = null;
    let existingRealDimensions: any | null = null;
    let existingCarrier: string | null = null;
    let existingTrackingNumber: string | null = null;
    let existingShippingOption: string | null = null;
    let existingInsurance: boolean | null = null;
    let existingInsuranceAmount: number | null = null;
    try {
      const currentSnap = await getDoc(ref);
      if (currentSnap.exists()) {
        const currentData = currentSnap.data();
        existingStatus = currentData?.status || null;
        existingPaymentStatus = currentData?.paymentStatus || null;
        existingTimeline = currentData?.timeline || null;
        existingInternalNotes = currentData?.internalNotes && Array.isArray(currentData.internalNotes) ? currentData.internalNotes : null;
        // Préserver les prix calculés depuis Google Sheets (ne pas les écraser)
        existingPackagingPrice = (currentData?.packagingPrice !== null && currentData?.packagingPrice !== undefined) ? currentData.packagingPrice : null;
        existingShippingPrice = (currentData?.shippingPrice !== null && currentData?.shippingPrice !== undefined) ? currentData.shippingPrice : null;
        // Préserver les dimensions réelles saisies manuellement (ne pas les écraser)
        existingRealDimensions = currentData?.realDimensions || null;
        // Préserver les informations d'expédition (ne pas les écraser)
        existingCarrier = currentData?.carrier || null;
        existingTrackingNumber = currentData?.trackingNumber || null;
        existingShippingOption = currentData?.shippingOption || null;
        // Récupérer l'assurance depuis le document Firestore actuel
        if (currentData?.insurance !== undefined) {
          existingInsurance = currentData.insurance;
        }
        if (currentData?.insuranceAmount !== null && currentData?.insuranceAmount !== undefined) {
          existingInsuranceAmount = currentData.insuranceAmount;
        }
      } else if (q.reference) {
        const qy = query(collection(db, QUOTES_COLLECTION), where("reference", "==", q.reference));
        const snaps = await getDocs(qy);
        const legacy = snaps.docs.find((d) => d.id !== q.id && d.data()?.auctionSheet);
        const legacySheet = legacy?.data()?.auctionSheet;
        if (legacySheet) {
          batch.set(ref, { auctionSheet: legacySheet }, { merge: true });
        }
        // Récupérer aussi le statut, le statut de paiement et l'historique du legacy si disponibles
        if (legacy?.data()?.status) {
          existingStatus = legacy.data().status;
        }
        if (legacy?.data()?.paymentStatus) {
          existingPaymentStatus = legacy.data().paymentStatus;
        }
        if (legacy?.data()?.timeline) {
          existingTimeline = legacy.data().timeline;
        }
        if (legacy?.data()?.internalNotes && Array.isArray(legacy.data().internalNotes)) {
          existingInternalNotes = legacy.data().internalNotes;
        }
        // Récupérer aussi les prix du legacy si disponibles
        if (legacy?.data()?.packagingPrice !== null && legacy?.data()?.packagingPrice !== undefined) {
          existingPackagingPrice = legacy.data().packagingPrice;
        }
        if (legacy?.data()?.shippingPrice !== null && legacy?.data()?.shippingPrice !== undefined) {
          existingShippingPrice = legacy.data().shippingPrice;
        }
        // Récupérer aussi les informations d'expédition du legacy si disponibles
        if (legacy?.data()?.carrier) {
          existingCarrier = legacy.data().carrier;
        }
        if (legacy?.data()?.trackingNumber) {
          existingTrackingNumber = legacy.data().trackingNumber;
        }
        if (legacy?.data()?.shippingOption) {
          existingShippingOption = legacy.data().shippingOption;
        }
        if (legacy?.data()?.insurance !== undefined) {
          existingInsurance = legacy.data().insurance;
        }
        if (legacy?.data()?.insuranceAmount !== null && legacy?.data()?.insuranceAmount !== undefined) {
          existingInsuranceAmount = legacy.data().insuranceAmount;
        }
      }
    } catch (e) {
      // best-effort (si règles empêchent les reads, on n'empêche pas l'upsert)
      console.warn("[quotes] migration auctionSheet (legacy->new) échouée", e);
    }

    // IMPORTANT: Ne pas écraser le statut dans Firestore s'il a été modifié (ex: "verified")
    // On ne met à jour le statut que si :
    // 1. Il n'existe pas encore dans Firestore (nouveau devis)
    // 2. Ou si le statut dans Firestore est identique à celui de Google Sheets (pas de modification)
    const statusToSave = existingStatus && existingStatus !== q.status 
      ? existingStatus // Garder le statut modifié dans Firestore
      : q.status; // Utiliser le statut de Google Sheets (nouveau devis ou pas de modification)

    // IMPORTANT: Ne pas écraser le statut de paiement dans Firestore s'il a été modifié (ex: "paid" par webhook)
    // On ne met à jour le statut de paiement que si :
    // 1. Il n'existe pas encore dans Firestore (nouveau devis)
    // 2. Ou si le statut de paiement dans Firestore est identique à celui de Google Sheets (pas de modification)
    const paymentStatusToSave = existingPaymentStatus && existingPaymentStatus !== q.paymentStatus 
      ? existingPaymentStatus // Garder le statut de paiement modifié dans Firestore (mis à jour par webhook)
      : q.paymentStatus; // Utiliser le statut de paiement de Google Sheets (nouveau devis ou pas de modification)

    if (existingStatus && existingStatus !== q.status) {
      console.log(`[upsertQuotesToFirestore] ⚠️ Statut préservé dans Firestore pour ${q.reference}: ${q.status} (Google Sheets) → ${existingStatus} (Firestore - modifié)`);
    }

    if (existingPaymentStatus && existingPaymentStatus !== q.paymentStatus) {
      console.log(`[upsertQuotesToFirestore] ⚠️ Statut de paiement préservé dans Firestore pour ${q.reference}: ${q.paymentStatus} (Google Sheets) → ${existingPaymentStatus} (Firestore - modifié par webhook)`);
    }

    // Préserver l'historique existant dans Firestore (priorité absolue)
    // L'historique dans Firestore peut contenir des événements ajoutés par les webhooks
    // On ne l'écrase jamais, sauf si c'est un nouveau devis sans historique
    let timelineToSave = null;
    if (existingTimeline && existingTimeline.length > 0) {
      // Garder l'historique existant dans Firestore (ne pas l'écraser)
      timelineToSave = existingTimeline;
    } else if (q.timeline && q.timeline.length > 0) {
      // Nouveau devis : convertir l'historique du devis en format Firestore
      timelineToSave = q.timeline.map((event) => ({
        id: event.id,
        date: event.date instanceof Date ? Timestamp.fromDate(event.date) : (event.date instanceof Timestamp ? event.date : Timestamp.fromDate(new Date(event.date))),
        status: event.status,
        description: event.description,
        user: event.user,
      }));
    }
    
    // Préserver les notes internes existantes dans Firestore (priorité absolue)
    // Les notes internes dans Firestore sont ajoutées manuellement par l'utilisateur
    // On ne les écrase jamais, sauf si c'est un nouveau devis sans notes
    const internalNotesToSave = existingInternalNotes && existingInternalNotes.length > 0
      ? existingInternalNotes // Garder les notes existantes dans Firestore (ne pas les écraser)
      : (q.internalNotes && q.internalNotes.length > 0 ? q.internalNotes : null); // Utiliser les notes de Google Sheets seulement si pas de notes dans Firestore
    
    // IMPORTANT: Préserver les prix calculés depuis Google Sheets (ne pas les écraser)
    // Les prix dans Firestore sont calculés lors de l'analyse du bordereau ou du recalcul manuel
    // On ne les écrase jamais, sauf si c'est un nouveau devis sans prix
    const packagingPriceToSave = (existingPackagingPrice !== null && existingPackagingPrice !== undefined)
      ? existingPackagingPrice // Garder le prix existant dans Firestore (calculé depuis Google Sheets)
      : (q.options?.packagingPrice !== null && q.options?.packagingPrice !== undefined ? q.options.packagingPrice : null);
    
    const shippingPriceToSave = (existingShippingPrice !== null && existingShippingPrice !== undefined)
      ? existingShippingPrice // Garder le prix existant dans Firestore (calculé depuis Google Sheets)
      : (q.options?.shippingPrice !== null && q.options?.shippingPrice !== undefined ? q.options.shippingPrice : null);
    
    if (existingPackagingPrice !== null && existingPackagingPrice !== undefined && existingPackagingPrice !== q.options?.packagingPrice) {
      console.log(`[upsertQuotesToFirestore] ⚠️ Prix emballage préservé dans Firestore pour ${q.reference}: ${q.options?.packagingPrice || 0}€ (Google Sheets) → ${existingPackagingPrice}€ (Firestore - calculé)`);
    }
    
    if (existingShippingPrice !== null && existingShippingPrice !== undefined && existingShippingPrice !== q.options?.shippingPrice) {
      console.log(`[upsertQuotesToFirestore] ⚠️ Prix expédition préservé dans Firestore pour ${q.reference}: ${q.options?.shippingPrice || 0}€ (Google Sheets) → ${existingShippingPrice}€ (Firestore - calculé)`);
    }
    
    const updateData: any = {
        quoteId: q.id,
        updatedAt: now,
        source: "google_sheets",
        reference: q.reference,
        clientName: q.client?.name,
        clientEmail: q.client?.email,
        lotNumber: q.lot?.number,
        lotDescription: q.lot?.description,
        status: statusToSave, // Utiliser le statut préservé ou celui de Google Sheets
      paymentStatus: paymentStatusToSave, // Utiliser le statut de paiement préservé ou celui de Google Sheets
        createdAt: q.createdAt ? q.createdAt.toISOString?.() ?? String(q.createdAt) : null,
    };
    
    // Ajouter les prix seulement s'ils existent (pour préserver les prix calculés)
    if (packagingPriceToSave !== null && packagingPriceToSave !== undefined) {
      updateData.packagingPrice = packagingPriceToSave;
    }
    
    if (shippingPriceToSave !== null && shippingPriceToSave !== undefined) {
      updateData.shippingPrice = shippingPriceToSave;
    }
    
    // Préserver l'assurance depuis Firestore si elle existe, sinon utiliser celle de Google Sheets
    const insuranceToSave = (existingInsurance !== null && existingInsurance !== undefined)
      ? existingInsurance // Garder l'assurance existante dans Firestore (modifiée manuellement)
      : (q.options?.insurance !== null && q.options?.insurance !== undefined ? q.options.insurance : false);
    
    const insuranceAmountToSave = (existingInsuranceAmount !== null && existingInsuranceAmount !== undefined)
      ? existingInsuranceAmount // Garder le montant d'assurance existant dans Firestore (calculé)
      : (q.options?.insuranceAmount !== null && q.options?.insuranceAmount !== undefined ? q.options.insuranceAmount : null);
    
    // Toujours sauvegarder l'assurance (même si false) pour que la valeur soit disponible
    updateData.insurance = insuranceToSave;
    if (insuranceAmountToSave !== null && insuranceAmountToSave !== undefined) {
      updateData.insuranceAmount = insuranceAmountToSave;
    }
    
    // Ajouter l'historique seulement s'il existe (pour préserver les événements ajoutés par les webhooks)
    if (timelineToSave) {
      updateData.timeline = timelineToSave;
    }
    
    // Ajouter les notes internes seulement si elles existent (pour préserver les notes ajoutées manuellement)
    if (internalNotesToSave) {
      updateData.internalNotes = internalNotesToSave;
    }
    
    // Préserver les dimensions réelles saisies manuellement (ne pas les écraser)
    // Les dimensions réelles sont saisies dans la page Préparation et ne doivent jamais être écrasées
    if (existingRealDimensions) {
      updateData.realDimensions = existingRealDimensions;
    }
    
    // Préserver les informations d'expédition saisies manuellement (ne pas les écraser)
    // Ces informations sont saisies lors de l'expédition et ne doivent jamais être écrasées
    if (existingCarrier) {
      updateData.carrier = existingCarrier;
    }
    if (existingTrackingNumber) {
      updateData.trackingNumber = existingTrackingNumber;
    }
    if (existingShippingOption) {
      updateData.shippingOption = existingShippingOption;
    }
    
    // Nettoyer updateData pour éviter les valeurs undefined
    const cleanedUpdateData = cleanForFirestore(updateData);
    batch.set(ref, cleanedUpdateData, { merge: true });
    
    // Log pour confirmer que le statut est bien sauvegardé
    if (q.status === 'to_verify' && !existingStatus) {
      console.log(`[upsertQuotesToFirestore] ✅ Devis ${q.reference} sauvegardé avec statut "to_verify" dans Firestore`);
    }
  }

  await batch.commit();
}

