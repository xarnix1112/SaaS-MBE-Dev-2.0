import { Quote } from "@/types/quote";

const API_BASE = import.meta.env.VITE_PAYTWEAK_API_BASE?.replace(/\/+$/, "");
const SECRET_TOKEN = import.meta.env.VITE_PAYTWEAK_SECRET_TOKEN;
const PUBLIC_TOKEN = import.meta.env.VITE_PAYTWEAK_PUBLIC_TOKEN;
const LINK_PATH =
  import.meta.env.VITE_PAYTWEAK_LINK_PATH ||
  "/v1/link"; // à ajuster selon la doc Paytweak

export interface PaytweakLinkInput {
  quote: Quote;
  amount: number;
  currency?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface PaytweakLinkResult {
  url: string;
  raw?: unknown;
  mocked?: boolean;
}

function ensureConfig() {
  if (!API_BASE || !SECRET_TOKEN || !PUBLIC_TOKEN) {
    throw new Error(
      "[paytweak] Config manquante : définis VITE_PAYTWEAK_API_BASE, VITE_PAYTWEAK_SECRET_TOKEN, VITE_PAYTWEAK_PUBLIC_TOKEN, VITE_PAYTWEAK_LINK_PATH"
    );
  }
  return {
    apiBase: API_BASE,
    secret: SECRET_TOKEN,
    publicToken: PUBLIC_TOKEN,
    linkPath: LINK_PATH,
  };
}

export async function createPaytweakLink(
  input: PaytweakLinkInput
): Promise<PaytweakLinkResult> {
  const currency = input.currency || "EUR";
  const successUrl =
    input.successUrl || `${window.location.origin}/payment/success`;
  const cancelUrl =
    input.cancelUrl || `${window.location.origin}/payment/cancel`;

  // Appel via le proxy backend (protège le secret Paytweak)
  const res = await fetch("/api/paytweak/link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amount,
      currency,
      reference: input.quote.reference,
      description: `${input.quote.client.name} | ${input.quote.lot.number} | ${input.quote.lot.auctionHouse}`,
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
      `[paytweak] Erreur API ${res.status}: ${text || res.statusText}`
    );
  }

  const data = await res.json();
  const link =
    data?.paymentUrl ||
    data?.url ||
    data?.redirectUrl ||
    data?.link ||
    data?.shortUrl ||
    data?.short_url ||
    "";

  if (!link) {
    throw new Error("[paytweak] Réponse sans URL de paiement.");
  }

  return { url: link, raw: data, mocked: false };
}

