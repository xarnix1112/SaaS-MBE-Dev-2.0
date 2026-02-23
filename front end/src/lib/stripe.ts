import { Quote } from "@/types/quote";
import { authenticatedFetch } from "./api";

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

/** Génère un lien de paiement (Stripe ou Paytweak selon les paramètres du compte) */
export async function createPaymentLink(
  input: StripeLinkInput
): Promise<StripeLinkResult> {
  const currency = input.currency || "EUR";
  const successUrl =
    input.successUrl || `${window.location.origin}/payment/success`;
  const cancelUrl =
    input.cancelUrl || `${window.location.origin}/payment/cancel`;

  const clientName = input.quote.client.name || "Client";
  const bordereauNumber = input.quote.auctionSheet?.bordereauNumber || "";
  const auctionHouse = input.quote.lot.auctionHouse && input.quote.lot.auctionHouse !== 'Non précisée'
    ? input.quote.lot.auctionHouse
    : "";
  const descriptionParts = [clientName];
  if (bordereauNumber) descriptionParts.push(bordereauNumber);
  if (auctionHouse) descriptionParts.push(auctionHouse);
  const description = descriptionParts.join(" | ");

  const res = await authenticatedFetch('/api/payment/link', {
    method: "POST",
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
    let errMsg = `Erreur API ${res.status}: ${text || res.statusText}`;
    try {
      const json = JSON.parse(text);
      if (json?.error) errMsg = json.error;
    } catch {}
    throw new Error(errMsg);
  }

  const data = await res.json();
  if (!data?.url) {
    throw new Error("Réponse sans URL de paiement.");
  }

  return { url: data.url, id: data.id };
}

/** @deprecated Utiliser createPaymentLink pour supporter Stripe et Paytweak */
export async function createStripeLink(
  input: StripeLinkInput
): Promise<StripeLinkResult> {
  return createPaymentLink(input);
}

