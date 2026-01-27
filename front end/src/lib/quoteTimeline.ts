import type { Quote, TimelineEvent, QuoteStatus } from "@/types/quote";
import { Timestamp } from "firebase/firestore";

/**
 * Crée un événement d'historique pour un changement de statut
 */
export function createTimelineEvent(
  status: QuoteStatus,
  description: string,
  user?: string
): TimelineEvent {
  return {
    id: `tl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    date: new Date(),
    status,
    description,
    user,
  };
}

/**
 * Ajoute un événement à l'historique d'un devis
 * Préserve l'historique existant et évite les doublons
 */
export function addTimelineEvent(
  quote: Quote,
  event: TimelineEvent
): Quote {
  const existingTimeline = quote.timeline || [];
  
  // Éviter les doublons (même description et statut dans les 5 dernières minutes)
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const isDuplicate = existingTimeline.some(
    (e) =>
      e.status === event.status &&
      e.description === event.description &&
      new Date(e.date).getTime() > fiveMinutesAgo
  );
  
  if (isDuplicate) {
    return quote;
  }
  
  return {
    ...quote,
    timeline: [...existingTimeline, event],
  };
}

/**
 * Mappe un statut vers une description d'historique
 */
export function getStatusDescription(status: QuoteStatus, paymentStatus?: string): string {
  const statusMap: Record<QuoteStatus, string> = {
    to_verify: "Devis en attente de vérification",
    verified: "Devis vérifié",
    payment_link_sent: "Lien de paiement envoyé au client",
    awaiting_payment: "En attente de paiement",
    paid: "Paiement reçu",
    awaiting_collection: "En attente de récupération",
    collected: "Lot collecté auprès de la salle des ventes",
    preparation: "Préparation du colis démarrée",
    awaiting_shipment: "En attente d'expédition",
    shipped: "Expédié",
    completed: "Terminé",
    new: "Nouveau devis",
  };
  
  // Descriptions spéciales selon le contexte
  if (status === "paid" && paymentStatus === "paid") {
    return "Paiement reçu et confirmé";
  }
  
  if (status === "payment_link_sent") {
    return "Lien de paiement envoyé au client par email";
  }
  
  return statusMap[status] || `Statut changé: ${status}`;
}

/**
 * Convertit un TimelineEvent pour Firestore (date -> Timestamp)
 * Nettoie les valeurs undefined pour éviter les erreurs Firestore
 */
export function timelineEventToFirestore(event: TimelineEvent) {
  // Gérer les dates invalides
  let firestoreDate;
  if (event.date instanceof Date && !isNaN(event.date.getTime())) {
    // Date valide
    firestoreDate = Timestamp.fromDate(event.date);
  } else if (event.date && typeof event.date === 'object' && 'toDate' in event.date) {
    // Déjà un Timestamp Firestore
    firestoreDate = event.date;
  } else if (event.date) {
    // Essayer de parser comme date
    const parsedDate = new Date(event.date as any);
    if (!isNaN(parsedDate.getTime())) {
      firestoreDate = Timestamp.fromDate(parsedDate);
    } else {
      // Date invalide, utiliser maintenant
      console.warn('[quoteTimeline] Date invalide détectée, utilisation de Timestamp.now():', event.date);
      firestoreDate = Timestamp.now();
    }
  } else {
    // Pas de date, utiliser maintenant
    firestoreDate = Timestamp.now();
  }

  const cleaned: any = {
    id: event.id,
    date: firestoreDate,
    status: event.status,
    description: event.description,
  };
  // Ajouter user seulement s'il est défini et non null
  if (event.user !== undefined && event.user !== null && event.user !== '') {
    cleaned.user = event.user;
  }
  return cleaned;
}

/**
 * Convertit un TimelineEvent depuis Firestore (Timestamp -> Date)
 */
export function timelineEventFromFirestore(data: any): TimelineEvent {
  return {
    ...data,
    date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
  };
}

