/**
 * Utilitaire pour les appels API avec authentification Firebase
 */

import { auth } from './firebase';

/**
 * Récupère le token Firebase actuel pour l'authentification
 */
export async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) {
    return null;
  }
  
  try {
    const token = await user.getIdToken();
    return token;
  } catch (error) {
    console.error('[api] Erreur récupération token:', error);
    return null;
  }
}

/**
 * Effectue une requête fetch avec authentification Firebase
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAuthToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  return fetch(url, {
    ...options,
    headers,
  });
}

