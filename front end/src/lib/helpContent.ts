/**
 * Contenu statique de la page Aide.
 * Guides pas à pas et FAQ pour chaque zone de configuration.
 */

import type { LucideIcon } from 'lucide-react';
import {
  CreditCard,
  Mail,
  FileSpreadsheet,
  Folder,
  FormInput,
  Package,
  Truck,
  Globe,
  Rocket,
} from 'lucide-react';

export interface HelpStep {
  label: string;
  where: 'app' | 'external';
  detail: string;
}

export interface HelpFaq {
  question: string;
  answer: string;
}

export interface HelpSectionData {
  id: string;
  title: string;
  icon: LucideIcon;
  settingsTab: string;
  goal: string;
  steps: HelpStep[];
  faq: HelpFaq[];
}

export const HELP_SECTIONS: HelpSectionData[] = [
  {
    id: 'quick-start',
    title: 'Démarrage rapide',
    icon: Rocket,
    settingsTab: 'emails',
    goal: 'Vue d\'ensemble pour configurer votre compte et commencer à utiliser l\'application.',
    steps: [
      {
        label: 'Connectez votre compte Stripe',
        where: 'app',
        detail: 'Obligatoire pour encaisser les paiements. Paramètres → Paiements → Connecter mon compte Stripe.',
      },
      {
        label: 'Connectez votre compte Gmail',
        where: 'app',
        detail: 'Pour recevoir et afficher les emails des clients dans les devis. Paramètres → Emails.',
      },
      {
        label: 'Configurez Google Sheets (optionnel)',
        where: 'app',
        detail: 'Pour synchroniser vos devis avec un tableau. Paramètres → Google Sheets.',
      },
      {
        label: 'Ajoutez vos cartons',
        where: 'app',
        detail: 'Pour le calcul automatique des emballages. Paramètres → Cartons.',
      },
      {
        label: 'Initialisez la grille tarifaire',
        where: 'app',
        detail: 'Pour les tarifs d\'expédition. Paramètres → Expédition.',
      },
    ],
    faq: [
      {
        question: 'Par où commencer ?',
        answer: 'Commencez par Stripe (paiements) et Gmail (emails). Les autres configurations peuvent être faites au fur et à mesure de vos besoins.',
      },
      {
        question: 'L\'application fonctionne sans tout configurer ?',
        answer: 'Oui. Les fonctionnalités de base (devis, pipeline) fonctionnent immédiatement. Stripe et Gmail débloquent les paiements et la synchronisation des emails.',
      },
    ],
  },
  {
    id: 'stripe',
    title: 'Paiements (Stripe)',
    icon: CreditCard,
    settingsTab: 'paiements',
    goal: 'Recevez les paiements de vos clients via Stripe Connect. Chaque paiement est encaissé directement sur votre compte Stripe.',
    steps: [
      {
        label: 'Créez un compte Stripe',
        where: 'external',
        detail: 'Allez sur dashboard.stripe.com/register. Activez le mode Test (en haut à droite) pour les tests.',
      },
      {
        label: 'Configurez Stripe Connect',
        where: 'external',
        detail: 'Dans dashboard.stripe.com/test/settings/applications : activez OAuth for Standard accounts et ajoutez l\'URL de redirection fournie par l\'application.',
      },
      {
        label: 'Connectez votre compte dans l\'app',
        where: 'app',
        detail: 'Paramètres → Paiements → Connecter mon compte Stripe. Autorisez l\'accès dans la fenêtre Stripe.',
      },
      {
        label: 'Remplissez le nom d\'entreprise',
        where: 'external',
        detail: 'Allez sur dashboard.stripe.com/settings/account et renseignez le champ "Nom de l\'entreprise". Obligatoire pour créer des liens de paiement.',
      },
    ],
    faq: [
      {
        question: 'Je ne peux pas créer un lien de paiement',
        answer: 'Vérifiez que : 1) Votre compte Stripe a un nom d\'entreprise (dashboard.stripe.com/settings/account), 2) L\'index Firestore "paiements" est créé (un lien s\'affiche dans l\'erreur si besoin).',
      },
      {
        question: 'Le statut de paiement ne se met pas à jour',
        answer: 'Les paiements se mettent à jour automatiquement. Si ce n\'est pas le cas, vérifiez que le webhook Stripe est bien configuré côté serveur. En local, utilisez Stripe CLI : stripe listen --forward-to votre-url/webhooks/stripe.',
      },
      {
        question: 'Mon compte Stripe est déconnecté',
        answer: 'Allez dans Paramètres → Paiements et cliquez sur "Reconnecter" ou "Connecter mon compte Stripe".',
      },
      {
        question: 'Erreur 404 sur /stripe/callback',
        answer: 'L\'URL de redirection doit être exactement celle affichée dans Paramètres → Paiements. Vérifiez dans Stripe Connect Settings que cette URL est bien ajoutée.',
      },
    ],
  },
  {
    id: 'emails',
    title: 'Comptes Email (Gmail)',
    icon: Mail,
    settingsTab: 'emails',
    goal: 'Connectez votre compte Gmail pour recevoir les emails des clients dans les devis et envoyer des liens de paiement.',
    steps: [
      {
        label: 'Ouvrez les paramètres emails',
        where: 'app',
        detail: 'Paramètres → Emails (ou Comptes Email).',
      },
      {
        label: 'Cliquez sur Connecter un compte Gmail',
        where: 'app',
        detail: 'Une fenêtre Google s\'ouvre pour autoriser l\'accès en lecture à votre boîte mail.',
      },
      {
        label: 'Autorisez l\'application',
        where: 'external',
        detail: 'Choisissez votre compte Google et acceptez les permissions demandées.',
      },
    ],
    faq: [
      {
        question: 'Les emails n\'apparaissent pas dans le devis',
        answer: 'Vérifiez que le compte Gmail est bien connecté et actif dans Paramètres → Emails. La synchronisation peut prendre quelques minutes.',
      },
      {
        question: 'Je veux utiliser un autre email que Gmail',
        answer: 'L\'application utilise l\'API Gmail. Seuls les comptes Google (Gmail) sont supportés pour la synchronisation des emails.',
      },
    ],
  },
  {
    id: 'google-sheets',
    title: 'Google Sheets',
    icon: FileSpreadsheet,
    settingsTab: 'google-sheets',
    goal: 'Synchronisez vos devis avec un Google Sheet pour suivi, export et intégration avec vos outils.',
    steps: [
      {
        label: 'Autorisez l\'accès Google',
        where: 'app',
        detail: 'Paramètres → Google Sheets → Connecter Google Sheets. Autorisez l\'application dans la fenêtre Google.',
      },
      {
        label: 'Sélectionnez ou créez un tableau',
        where: 'app',
        detail: 'Choisissez un Google Sheet existant ou créez-en un nouveau. L\'application vous guidera pour la structure.',
      },
      {
        label: 'Configurez le mapping des colonnes',
        where: 'app',
        detail: 'Associez les colonnes de votre tableau aux champs des devis (référence, client, montant, etc.).',
      },
    ],
    faq: [
      {
        question: 'La synchronisation ne fonctionne pas',
        answer: 'Vérifiez que Google Sheets est connecté (Paramètres → Google Sheets) et que le mapping des colonnes est correct. Les données se synchronisent à chaque modification de devis.',
      },
      {
        question: 'Puis-je utiliser plusieurs tableaux ?',
        answer: 'Un seul tableau est associé à votre compte. Vous pouvez changer de tableau dans Paramètres → Google Sheets.',
      },
    ],
  },
  {
    id: 'google-drive',
    title: 'Google Drive',
    icon: Folder,
    settingsTab: 'google-drive',
    goal: 'Stockez automatiquement vos bordereaux PDF dans un dossier Google Drive.',
    steps: [
      {
        label: 'Connectez Google Sheets d\'abord',
        where: 'app',
        detail: 'Google Drive utilise la même autorisation que Google Sheets. Configurez d\'abord Google Sheets dans Paramètres.',
      },
      {
        label: 'Sélectionnez ou créez un dossier',
        where: 'app',
        detail: 'Paramètres → Google Drive → Choisir un dossier. Sélectionnez le dossier qui accueillera les bordereaux.',
      },
    ],
    faq: [
      {
        question: 'Les bordereaux ne sont pas enregistrés',
        answer: 'Vérifiez que Google Drive est connecté et qu\'un dossier est sélectionné. L\'autorisation Google doit inclure l\'accès à Drive.',
      },
    ],
  },
  {
    id: 'typeform',
    title: 'Typeform',
    icon: FormInput,
    settingsTab: 'typeform',
    goal: 'Importez automatiquement les bordereaux depuis vos formulaires Typeform.',
    steps: [
      {
        label: 'Créez une application dans Typeform',
        where: 'external',
        detail: 'Sur typeform.com, allez dans les paramètres de votre formulaire et créez une application OAuth si nécessaire.',
      },
      {
        label: 'Connectez Typeform dans l\'app',
        where: 'app',
        detail: 'Paramètres → Typeform → Connecter Typeform. Autorisez l\'accès dans la fenêtre Typeform.',
      },
    ],
    faq: [
      {
        question: 'Les bordereaux Typeform ne s\'importent pas',
        answer: 'Vérifiez que Typeform est connecté et que le lien du formulaire est correctement renseigné dans le devis. Le format attendu est un lien typeform.com.',
      },
    ],
  },
  {
    id: 'cartons',
    title: 'Cartons et emballages',
    icon: Package,
    settingsTab: 'cartons',
    goal: 'Définissez vos modèles de cartons pour le calcul automatique des emballages et des coûts dans les devis.',
    steps: [
      {
        label: 'Ouvrez la configuration des cartons',
        where: 'app',
        detail: 'Paramètres → Cartons.',
      },
      {
        label: 'Ajoutez vos cartons',
        where: 'app',
        detail: 'Cliquez sur "Ajouter un carton" et renseignez les dimensions (longueur, largeur, hauteur en cm), le poids et le prix.',
      },
      {
        label: 'Définissez un carton par défaut',
        where: 'app',
        detail: 'Au moins un carton doit être marqué comme "par défaut" pour le calcul automatique.',
      },
    ],
    faq: [
      {
        question: 'Le calcul d\'emballage ne propose aucun carton',
        answer: 'Ajoutez au moins un carton dans Paramètres → Cartons et marquez-le comme carton par défaut.',
      },
      {
        question: 'Un lot est trop grand pour mes cartons',
        answer: 'L\'application utilisera le carton par défaut ou le plus adapté. Vous pouvez ajouter des cartons plus grands dans Paramètres → Cartons.',
      },
    ],
  },
  {
    id: 'grille-tarifaire',
    title: 'Grille tarifaire',
    icon: Truck,
    settingsTab: 'expedition',
    goal: 'Configurez vos tarifs d\'expédition par zone, service (Standard, Express) et tranches de poids.',
    steps: [
      {
        label: 'Ouvrez la grille tarifaire',
        where: 'app',
        detail: 'Paramètres → Expédition (ou Grille tarifaire).',
      },
      {
        label: 'Initialisez la grille si nécessaire',
        where: 'app',
        detail: 'Si la grille est vide, cliquez sur "Initialiser la grille tarifaire" pour créer la structure de base (zones, services, tranches).',
      },
      {
        label: 'Configurez les zones et tarifs',
        where: 'app',
        detail: 'Ajoutez vos zones géographiques, les services (Standard, Express) et renseignez les prix par tranche de poids.',
      },
    ],
    faq: [
      {
        question: 'Les tarifs d\'expédition ne s\'affichent pas',
        answer: 'Initialisez la grille dans Paramètres → Expédition si c\'est la première fois. Vérifiez qu\'au moins une zone et un service sont configurés avec des tarifs.',
      },
      {
        question: 'Puis-je utiliser MBE Hub à la place ?',
        answer: 'Oui. Si votre plan le permet (Pro ou Ultra), vous pouvez configurer MBE Hub pour des tarifs en temps réel. Paramètres → MBE Hub.',
      },
    ],
  },
  {
    id: 'mbehub',
    title: 'MBE Hub',
    icon: Globe,
    settingsTab: 'mbehub',
    goal: 'Utilisez les tarifs MBE en temps réel et créez des expéditions directement depuis l\'application. Réservé aux plans Pro et Ultra.',
    steps: [
      {
        label: 'Vérifiez votre plan',
        where: 'app',
        detail: 'MBE Hub est disponible pour les plans Pro et Ultra. Vérifiez dans Paramètres → MBE Hub.',
      },
      {
        label: 'Récupérez vos identifiants API',
        where: 'external',
        detail: 'Sur mbehub.fr, section Gestion de la clé API du Centre. Créez des identifiants avec le rôle ONLINEMBE_USER (entité Client).',
      },
      {
        label: 'Configurez dans l\'app',
        where: 'app',
        detail: 'Paramètres → MBE Hub. Saisissez le login et le mot de passe API. Choisissez "MBE Hub" comme méthode de calcul des expéditions.',
      },
    ],
    faq: [
      {
        question: 'MBE Hub n\'est pas disponible',
        answer: 'MBE Hub est réservé aux plans Pro et Ultra. Passez à un plan supérieur pour activer cette fonctionnalité.',
      },
      {
        question: 'Erreur 403 ou identifiants refusés',
        answer: 'Vérifiez que vos identifiants sont ceux du rôle ONLINEMBE_USER (Client) et non du Centre. En production, les identifiants diffèrent du mode démo.',
      },
    ],
  },
];

export const HELP_SECTION_IDS = HELP_SECTIONS.map((s) => s.id);

export function getHelpSection(id: string): HelpSectionData | undefined {
  return HELP_SECTIONS.find((s) => s.id === id);
}
