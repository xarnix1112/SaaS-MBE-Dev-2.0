/**
 * Hook pour récupérer le statut de configuration de toutes les intégrations.
 * Utilisé par la page Aide pour afficher la checklist dynamique.
 */

import { useQuery } from '@tanstack/react-query';
import { authenticatedFetch } from '@/lib/api';
import { getStripeStatus } from '@/lib/stripeConnect';

export interface ConfigStatus {
  stripe: { configured: boolean; loading: boolean };
  emails: { configured: boolean; loading: boolean };
  googleSheets: { configured: boolean; loading: boolean };
  googleDrive: { configured: boolean; loading: boolean };
  typeform: { configured: boolean; loading: boolean };
  cartons: { configured: boolean; loading: boolean };
  grilleTarifaire: { configured: boolean; loading: boolean };
  mbeHub: { configured: boolean; available: boolean; loading: boolean };
}

async function fetchConfigStatus(): Promise<ConfigStatus> {
  const [
    stripeResult,
    emailsResult,
    googleSheetsResult,
    googleDriveResult,
    typeformResult,
    cartonsResult,
    zonesResult,
    mbeHubResult,
  ] = await Promise.allSettled([
    getStripeStatus(),
    authenticatedFetch('/api/email-accounts'),
    authenticatedFetch('/api/google-sheets/status'),
    authenticatedFetch('/api/google-drive/status'),
    authenticatedFetch('/api/typeform/status'),
    authenticatedFetch('/api/cartons'),
    authenticatedFetch('/api/shipping/zones'),
    authenticatedFetch('/api/account/mbehub-status'),
  ]);

  const stripe =
    stripeResult.status === 'fulfilled' && stripeResult.value.connected;
  const emailsJson =
    emailsResult.status === 'fulfilled' && emailsResult.value.ok
      ? await emailsResult.value.json()
      : [];
  const emails = Array.isArray(emailsJson) && emailsJson.length > 0;
  const googleSheets =
    googleSheetsResult.status === 'fulfilled' &&
    googleSheetsResult.value.ok &&
    (await googleSheetsResult.value.json()).connected;
  const googleDrive =
    googleDriveResult.status === 'fulfilled' &&
    googleDriveResult.value.ok &&
    (await googleDriveResult.value.json()).connected;
  const typeform =
    typeformResult.status === 'fulfilled' &&
    typeformResult.value.ok &&
    (await typeformResult.value.json()).connected;
  const cartons =
    cartonsResult.status === 'fulfilled' &&
    cartonsResult.value.ok &&
    ((await cartonsResult.value.json()).cartons?.length ?? 0) > 0;
  const zonesJson =
    zonesResult.status === 'fulfilled' && zonesResult.value.ok
      ? await zonesResult.value.json()
      : [];
  const zones = Array.isArray(zonesJson) && zonesJson.length > 0;
  const mbeHubData =
    mbeHubResult.status === 'fulfilled' && mbeHubResult.value.ok
      ? await mbeHubResult.value.json()
      : { available: false, configured: false };

  return {
    stripe: { configured: stripe, loading: false },
    emails: { configured: !!emails, loading: false },
    googleSheets: { configured: !!googleSheets, loading: false },
    googleDrive: { configured: !!googleDrive, loading: false },
    typeform: { configured: !!typeform, loading: false },
    cartons: { configured: !!cartons, loading: false },
    grilleTarifaire: { configured: !!zones, loading: false },
    mbeHub: {
      configured: !!(mbeHubData.available && mbeHubData.configured),
      available: !!mbeHubData.available,
      loading: false,
    },
  };
}

export function useConfigStatus() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['config-status'],
    queryFn: fetchConfigStatus,
    staleTime: 30_000,
    retry: 1,
  });

  const status: ConfigStatus = data ?? {
    stripe: { configured: false, loading: true },
    emails: { configured: false, loading: true },
    googleSheets: { configured: false, loading: true },
    googleDrive: { configured: false, loading: true },
    typeform: { configured: false, loading: true },
    cartons: { configured: false, loading: true },
    grilleTarifaire: { configured: false, loading: true },
    mbeHub: { configured: false, available: false, loading: true },
  };

  return { status, isLoading, refetch };
}
