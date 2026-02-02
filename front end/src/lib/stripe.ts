import { Quote } from "@/types/quote";

export interface StripeLinkInput {
  quote: Quote;
  amount: number;
  currency?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface StripeLinkResult {
  url: string;
  id?: string;
}

export async function createStripeLink(
  input: StripeLinkInput
): Promise<StripeLinkResult> {
  const currency = input.currency || "EUR";
  const successUrl =
    input.successUrl || `${window.location.origin}/payment/success`;
  const cancelUrl =
    input.cancelUrl || `${window.location.origin}/payment/cancel`;

  // Construire la description : Nom prénom client | Numéro de bordereau | Salle de vente
  const clientName = input.quote.client.name || "Client";
  const bordereauNumber = input.quote.auctionSheet?.bordereauNumber || "";
  const auctionHouse = input.quote.lot.auctionHouse && input.quote.lot.auctionHouse !== 'Non précisée' 
    ? input.quote.lot.auctionHouse 
    : "";
  
  // Construire la description avec les éléments disponibles
  const descriptionParts = [clientName];
  if (bordereauNumber) descriptionParts.push(bordereauNumber);
  if (auctionHouse) descriptionParts.push(auctionHouse);
  
  const description = descriptionParts.join(" | ");

  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5174';
  const res = await fetch(`${API_BASE}/api/stripe/link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amount,
      currency,
      reference: input.quote.reference,
      description,
      customer: {
        name: input.quote.client.name,
        email: input.quote.client.email,
        phone: input.quote.client.phone,
      },
      successUrl,
      cancelUrl,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `[stripe] Erreur API ${res.status}: ${text || res.statusText}`
    );
  }

  const data = await res.json();
  if (!data?.url) {
    throw new Error("[stripe] Réponse sans URL de paiement.");
  }

  return { url: data.url, id: data.id };
}

