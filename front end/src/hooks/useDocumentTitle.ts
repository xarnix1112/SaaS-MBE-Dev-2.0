/**
 * Hook pour mettre à jour dynamiquement le titre de la page
 * Utilise le nom commercial de l'utilisateur connecté
 */

import { useEffect } from 'react';
import { useAuth } from './useAuth';

export function useDocumentTitle() {
  const { saasAccount, isLoading } = useAuth();

  useEffect(() => {
    // Récupérer le nom commercial ou utiliser un fallback
    const commercialName = saasAccount?.commercialName || 'MBE';
    const title = `${commercialName} - Gestion des Devis Logistiques`;
    
    // Mettre à jour le titre de la page
    document.title = title;
    
    // Mettre à jour aussi les meta tags pour le SEO
    const metaTitle = document.querySelector('meta[property="og:title"]');
    if (metaTitle) {
      metaTitle.setAttribute('content', title);
    }
    
    const metaAuthor = document.querySelector('meta[name="author"]');
    if (metaAuthor) {
      metaAuthor.setAttribute('content', commercialName);
    }
  }, [saasAccount, isLoading]);
}
