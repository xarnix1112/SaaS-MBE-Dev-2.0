/**
 * Types pour l'authentification et les comptes SaaS
 */

export interface SaasAccount {
  id: string;
  ownerUid: string;
  
  // MBE
  mbeNumber: string;
  mbeCity: string;
  mbeCityCustom?: string | null;
  commercialName: string;
  
  // Contact
  email: string;
  phone: string;
  address: {
    street: string;
    city: string;
    zip: string;
    country: string;
  };
  
  // Métadonnées
  createdAt: Date | string;
  isActive: boolean;
  plan: 'free' | 'pro';
}

export interface UserDoc {
  uid: string;
  saasAccountId: string;
  role: 'owner' | 'admin' | 'operator' | 'viewer';
  createdAt: Date | string;
}

