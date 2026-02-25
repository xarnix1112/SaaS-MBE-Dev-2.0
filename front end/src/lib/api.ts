/**
 * Utilitaire pour les appels API avec authentification Firebase
 */

import { auth } from './firebase';
import { getApiBaseUrl } from './api-base';

/**
 * Récupère le token Firebase actuel pour l'authentification
 * @param forceRefresh - si true, force un nouveau token (utile après réauthentification)
 */
export async function getAuthToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) {
    return null;
  }
  
  try {
    const token = await user.getIdToken(forceRefresh);
    return token;
  } catch (error) {
    console.error('[api] Erreur récupération token:', error);
    return null;
  }
}

export type AuthenticatedFetchOptions = RequestInit & { forceRefresh?: boolean };

/**
 * Effectue une requête fetch avec authentification Firebase
 * Si l'URL est relative (commence par /), elle est préfixée avec VITE_API_BASE_URL
 * @param options.forceRefresh - force un nouveau token (utile après réauthentification)
 */
export async function authenticatedFetch(
  url: string,
  options: AuthenticatedFetchOptions = {}
): Promise<Response> {
  const { forceRefresh, ...fetchOptions } = options;
  const token = await getAuthToken(!!forceRefresh);
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(import.meta.env.DEV && { 'X-Client-Dev': 'true' }),
    ...(fetchOptions.headers as Record<string, string>),
  };

  const API_BASE = getApiBaseUrl();
  const fullUrl = url.startsWith('/') ? `${API_BASE}${url}` : url;

  return fetch(fullUrl, {
    ...fetchOptions,
    headers,
  });
}

