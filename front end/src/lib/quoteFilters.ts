/**
 * Filtres partagés pour les devis - alignés entre Dashboard, Nouveaux devis, etc.
 */

// Statuts des devis EXCLUS de la page "Nouveaux devis"
// Tout ce qui n'est pas dans cette liste = nouveau devis (visible dans l'onglet Nouveaux devis)
export const STATUS_APRES_ATTENTE_PAIEMENT = [
  'awaiting_payment',
  'paid',
  'awaiting_collection',
  'collected',
  'preparation',
  'awaiting_shipment',
  'sent_to_mbe_hub',
  'shipped',
  'completed',
] as const;

export type StatusApresAttentePaiement = (typeof STATUS_APRES_ATTENTE_PAIEMENT)[number];

/** Retourne true si le devis est considéré comme "nouveau" (pas encore en attente paiement ou au-delà) */
export function isNewQuote(status: string | null | undefined): boolean {
  const s = status || 'new';
  return !STATUS_APRES_ATTENTE_PAIEMENT.includes(s as StatusApresAttentePaiement);
}
