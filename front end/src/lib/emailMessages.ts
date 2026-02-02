import { addDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { EmailMessage } from '@/types/quote';

const EMAIL_MESSAGES_COLLECTION = 'emailMessages';

/**
 * Sauvegarde un email envoyé dans Firestore
 * @param emailData Données de l'email à sauvegarder
 * @returns ID du document créé
 */
export async function saveEmailMessage(emailData: {
  devisId: string;
  clientId?: string;
  clientEmail: string;
  direction: 'IN' | 'OUT';
  source: 'RESEND' | 'GMAIL';
  from: string;
  to: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  messageId?: string;
  inReplyTo?: string;
}): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, EMAIL_MESSAGES_COLLECTION), {
      ...emailData,
      createdAt: Timestamp.now(),
    });
    
    console.log('[emailMessages] ✅ Email sauvegardé dans Firestore:', {
      id: docRef.id,
      devisId: emailData.devisId,
      direction: emailData.direction,
      source: emailData.source,
      subject: emailData.subject.substring(0, 50),
    });
    
    return docRef.id;
  } catch (error) {
    console.error('[emailMessages] ❌ Erreur lors de la sauvegarde de l\'email:', error);
    throw error;
  }
}

/**
 * Récupère tous les messages d'un devis depuis l'API backend
 * (Combine les messages RESEND et Gmail)
 * @param devisId ID du devis
 * @returns Liste des messages triés par date (plus récent en premier)
 */
export async function getEmailMessagesForQuote(devisId: string): Promise<EmailMessage[]> {
  try {
    const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5174';
    const response = await fetch(`${API_BASE}/api/devis/${devisId}/messages`);
    if (!response.ok) {
      throw new Error('Erreur lors de la récupération des messages');
    }
    const apiMessages = await response.json();

    // Normaliser les dates et les champs "to"
    const normalized: EmailMessage[] = (apiMessages || []).map((m: any) => ({
      ...m,
      to: Array.isArray(m.to) ? m.to : (m.to ? [m.to] : []),
      receivedAt: m.receivedAt ? new Date(m.receivedAt) : undefined,
      createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
    }));

    // Trier par date (receivedAt ou createdAt) - plus récent en premier
    const sortedMessages = normalized.sort((a, b) => {
      const dateA = a.receivedAt || a.createdAt;
      const dateB = b.receivedAt || b.createdAt;
      return dateB.getTime() - dateA.getTime(); // Inversé pour avoir les plus récents en premier
    });
    
    console.log('[emailMessages] ✅ Messages récupérés pour devis (API uniquement):', {
      devisId,
      count: sortedMessages.length,
    });
    
    return sortedMessages;
  } catch (error) {
    console.error('[emailMessages] ❌ Erreur lors de la récupération des messages:', error);
    return [];
  }
}

