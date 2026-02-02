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
 * Si l'URL est relative (commence par /), elle est préfixée avec VITE_API_BASE_URL
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

  // Si URL relative (commence par /), préfixer avec VITE_API_BASE_URL
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5174';
  const fullUrl = url.startsWith('/') ? `${API_BASE}${url}` : url;

  return fetch(fullUrl, {
    ...options,
    headers,
  });
}

