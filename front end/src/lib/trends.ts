import { Quote } from '@/types/quote';

/**
 * Calcule le trend (pourcentage d'évolution) pour un ensemble de devis
 * entre aujourd'hui et une période de référence
 */
export interface TrendResult {
  value: number; // Pourcentage d'évolution
  isPositive: boolean;
  todayCount: number;
  referenceCount: number;
  referenceDate: Date | null;
}

/**
 * Obtient le début et la fin d'une journée calendaire
 */
function getDayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
}

/**
 * Calcule le trend pour des devis basé sur leur date de création
 * @param quotes - Tous les devis
 * @param filterFn - Fonction optionnelle pour filtrer les devis (ex: par statut)
 * @returns Objet TrendResult avec le pourcentage d'évolution
 */
export function calculateTrend(
  quotes: Quote[],
  filterFn?: (quote: Quote) => boolean
): TrendResult | null {
  // Filtrer les devis si une fonction est fournie
  const filteredQuotes = filterFn ? quotes.filter(filterFn) : quotes;

  if (filteredQuotes.length === 0) {
    return null;
  }

  // Aujourd'hui : 00h00 → maintenant
  const now = new Date();
  const todayBounds = getDayBounds(now);
  
  // Hier : 00h00 → 23h59
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayBounds = getDayBounds(yesterday);

  // Compter les devis d'aujourd'hui
  const todayQuotes = filteredQuotes.filter(q => {
    const createdAt = q.createdAt instanceof Date ? q.createdAt : new Date(q.createdAt);
    return createdAt >= todayBounds.start && createdAt <= now;
  });

  // Compter les devis d'hier
  let referenceQuotes = filteredQuotes.filter(q => {
    const createdAt = q.createdAt instanceof Date ? q.createdAt : new Date(q.createdAt);
    return createdAt >= yesterdayBounds.start && createdAt <= yesterdayBounds.end;
  });

  let referenceDate = yesterday;
  let referenceCount = referenceQuotes.length;

  // Si hier = 0, chercher le dernier jour avec des devis
  if (referenceCount === 0) {
    // Trier les devis par date décroissante
    const sortedQuotes = [...filteredQuotes]
      .filter(q => {
        const createdAt = q.createdAt instanceof Date ? q.createdAt : new Date(q.createdAt);
        return createdAt < todayBounds.start; // Avant aujourd'hui
      })
      .sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });

    if (sortedQuotes.length > 0) {
      // Trouver la date du dernier devis
      const lastQuote = sortedQuotes[0];
      const lastDate = lastQuote.createdAt instanceof Date 
        ? lastQuote.createdAt 
        : new Date(lastQuote.createdAt);
      
      const lastDayBounds = getDayBounds(lastDate);

      // Compter tous les devis de ce jour-là
      referenceQuotes = filteredQuotes.filter(q => {
        const createdAt = q.createdAt instanceof Date ? q.createdAt : new Date(q.createdAt);
        return createdAt >= lastDayBounds.start && createdAt <= lastDayBounds.end;
      });

      referenceDate = lastDate;
      referenceCount = referenceQuotes.length;
    }
  }

  const todayCount = todayQuotes.length;

  // Si pas de référence, impossible de calculer un trend
  if (referenceCount === 0) {
    return {
      value: 100, // Afficher +100% par défaut si pas de référence
      isPositive: todayCount > 0,
      todayCount,
      referenceCount: 0,
      referenceDate: null,
    };
  }

  // Calculer le pourcentage d'évolution
  const percentChange = ((todayCount - referenceCount) / referenceCount) * 100;

  return {
    value: Math.round(percentChange), // Arrondir à l'entier
    isPositive: percentChange >= 0,
    todayCount,
    referenceCount,
    referenceDate,
  };
}

/**
 * Calcule le trend pour les nouveaux devis (status = 'new')
 */
export function calculateNewQuotesTrend(quotes: Quote[]): TrendResult | null {
  return calculateTrend(quotes, (q) => q.status === 'new');
}

/**
 * Calcule le trend pour les devis en attente de paiement
 */
export function calculateAwaitingPaymentTrend(quotes: Quote[]): TrendResult | null {
  return calculateTrend(quotes, (q) =>
    ['payment_link_sent', 'awaiting_payment'].includes(q.status)
  );
}

/**
 * Calcule le trend pour les devis en attente de collecte
 */
export function calculateAwaitingCollectionTrend(quotes: Quote[]): TrendResult | null {
  return calculateTrend(quotes, (q) => q.status === 'awaiting_collection');
}
