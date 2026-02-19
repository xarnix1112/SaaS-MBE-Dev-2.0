/**
 * Utilitaire pour les appels API avec authentification Firebase
 */

import { auth } from './firebase';

/**
 * Récupère l'URL de base de l'API (VITE_API_BASE_URL) en s'assurant qu'elle contient https://.
 * Sans protocole, fetch() résout en URL relative et les requêtes partent vers le frontend Vercel
 * au lieu du backend Railway → 401 "Authentication Required".
 */
export function getApiBaseUrl(): string {
  let base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5174';
  if (base && !base.startsWith('http://') && !base.startsWith('https://')) {
    base = 'https://' + base.replace(/^\/*/, '');
  }
  return base.replace(/\/+$/, '');
}

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

  const API_BASE = getApiBaseUrl();
  const fullUrl = url.startsWith('/') ? `${API_BASE}${url}` : url;

  return fetch(fullUrl, {
    ...options,
    headers,
  });
}

