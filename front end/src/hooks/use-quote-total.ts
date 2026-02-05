import { useState, useEffect } from 'react';
import { getPaiements } from '@/lib/stripeConnect';
import { Quote } from '@/types/quote';

/**
 * Hook pour calculer le total d'un devis en incluant les surcoûts
 * Charge les paiements et calcule le total avec surcoûts
 */
export function useQuoteTotal(quote: Quote | undefined) {
  const [totalWithSurcharge, setTotalWithSurcharge] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!quote?.id) {
      setTotalWithSurcharge(null);
      return;
    }

    const calculateTotal = async () => {
      try {
        setIsLoading(true);
        
        // Calculer le total de base du devis
        const packagingPrice = quote.options?.packagingPrice || 0;
        const shippingPrice = quote.options?.shippingPrice || 0;
        
        // Calculer l'assurance
        let insuranceAmount = 0;
        if (quote.options?.insurance) {
          const lotValue = quote.lot?.value || 0;
          const explicitAmount = quote.options?.insuranceAmount;
          
          if (explicitAmount !== null && explicitAmount !== undefined && explicitAmount > 0) {
            const decimal = explicitAmount % 1;
            if (decimal >= 0.5) {
              insuranceAmount = Math.ceil(explicitAmount);
            } else if (decimal > 0) {
              insuranceAmount = Math.floor(explicitAmount) + 0.5;
            } else {
              insuranceAmount = explicitAmount;
            }
          } else {
            const raw = Math.max(lotValue * 0.025, lotValue < 500 ? 12 : 0);
            const decimal = raw % 1;
            if (decimal >= 0.5) {
              insuranceAmount = Math.ceil(raw);
            } else if (decimal > 0) {
              insuranceAmount = Math.floor(raw) + 0.5;
            } else {
              insuranceAmount = raw;
            }
          }
        }
        
        const baseTotal = packagingPrice + shippingPrice + insuranceAmount;
        
        // Charger les paiements pour obtenir les surcoûts
        try {
          const paiements = await getPaiements(quote.id);
          
          // Ajouter les surcoûts (paiements SURCOUT non annulés)
          const surchargeAmount = paiements
            .filter((p) => p.type === 'SURCOUT' && p.status !== 'CANCELLED')
            .reduce((sum, p) => sum + p.amount, 0);
          
          setTotalWithSurcharge(baseTotal + surchargeAmount);
        } catch (error) {
          // Si erreur de chargement des paiements, utiliser le total de base
          console.warn('[useQuoteTotal] Erreur chargement paiements, utilisation total de base:', error);
          setTotalWithSurcharge(baseTotal);
        }
      } catch (error) {
        console.error('[useQuoteTotal] Erreur calcul total:', error);
        // En cas d'erreur, utiliser le totalAmount du quote
        setTotalWithSurcharge(quote.totalAmount || 0);
      } finally {
        setIsLoading(false);
      }
    };

    calculateTotal();
  }, [quote?.id, quote?.options?.packagingPrice, quote?.options?.shippingPrice, quote?.options?.insurance, quote?.options?.insuranceAmount, quote?.lot?.value, quote?.totalAmount]);

  return { totalWithSurcharge, isLoading };
}
