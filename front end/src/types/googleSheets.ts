/** Mapping des colonnes Google Sheet (index 0-based) vers les champs de l'application */
export interface GoogleSheetsColumnMapping {
  clientFirstName: number | null;
  clientLastName: number | null;
  clientPhone: number | null;
  clientEmail: number | null;
  clientAddress: number | null;
  clientAddressComplement: number | null;
  clientCity: number | null;
  clientState: number | null;
  clientZip: number | null;
  clientCountry: number | null;
  receiverAnswer: number | null;
  receiverAddress: number | null;
  receiverAddressComplement: number | null;
  receiverCity: number | null;
  receiverState: number | null;
  receiverZip: number | null;
  receiverCountry: number | null;
  receiverFirstName: number | null;
  receiverLastName: number | null;
  receiverPhone: number | null;
  receiverEmail: number | null;
  upsAccessPoint: number | null;
  bordereau: number | null;
  usefulInfo: number | null;
  wantsInsurance: number | null;
  submittedAt: number | null;
  token: number | null;
  wantsProfessionalInvoice: number | null;
}

/** Labels des champs pour l'UI de configuration */
export const COLUMN_MAPPING_LABELS: Record<keyof GoogleSheetsColumnMapping, string> = {
  clientFirstName: 'Prénom',
  clientLastName: 'Nom de famille',
  clientPhone: 'Téléphone',
  clientEmail: 'Email',
  clientAddress: 'Adresse',
  clientAddressComplement: "Complément d'adresse",
  clientCity: 'Ville',
  clientState: 'État/Région',
  clientZip: 'Code postal',
  clientCountry: 'Pays',
  receiverAnswer: 'Êtes-vous le destinataire ?',
  receiverAddress: 'Adresse destinataire',
  receiverAddressComplement: "Complément adresse destinataire",
  receiverCity: 'Ville destinataire',
  receiverState: 'État destinataire',
  receiverZip: 'Code postal destinataire',
  receiverCountry: 'Pays destinataire',
  receiverFirstName: 'Prénom destinataire',
  receiverLastName: 'Nom destinataire',
  receiverPhone: 'Téléphone destinataire',
  receiverEmail: 'Email destinataire',
  upsAccessPoint: 'Point relais UPS',
  bordereau: 'Bordereau',
  usefulInfo: 'Informations utiles',
  wantsInsurance: 'Assurance',
  submittedAt: 'Date soumission',
  token: 'Token Typeform',
  wantsProfessionalInvoice: 'Facture professionnelle',
};
