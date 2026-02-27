import { useState, useEffect } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings as SettingsIcon, Mail, CheckCircle2, XCircle, RefreshCw, AlertTriangle, LogOut, CreditCard, Loader2, FileSpreadsheet, Folder, FolderOpen, Package, Truck, FormInput, KeyRound, Globe, Send, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { connectStripe, getStripeStatus, disconnectStripe } from '@/lib/stripeConnect';
import type { StripeStatusResponse } from '@/types/stripe';
import CartonsSettings from '@/components/settings/CartonsSettings';
import { ShippingRatesSettings } from '@/components/settings/ShippingRatesSettings';
import AutoEmailsSettings from '@/components/settings/AutoEmailsSettings';
import EmailTemplatesSettings from '@/components/settings/EmailTemplatesSettings';
import { useFeatures } from '@/hooks/use-features';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface EmailAccount {
  id: string;
  emailAddress: string;
  isActive: boolean;
  lastSyncAt?: string | Date | null;
}

export default function Settings() {
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // État Stripe
  const [stripeStatus, setStripeStatus] = useState<StripeStatusResponse | null>(null);
  const [isLoadingStripe, setIsLoadingStripe] = useState(false);
  
  // État Google Sheets
  interface GoogleSheetsStatus {
    connected: boolean;
    oauthAuthorized?: boolean;
    spreadsheetId: string | null;
    spreadsheetName: string | null;
    lastSyncAt: string | null;
    lastRowImported: number | null;
    connectedAt: string | null;
  }
  interface GoogleSheet {
    id: string;
    name: string;
    modifiedTime: string;
  }
  const [googleSheetsStatus, setGoogleSheetsStatus] = useState<GoogleSheetsStatus | null>(null);
  const [isLoadingGoogleSheets, setIsLoadingGoogleSheets] = useState(false);
  const [bilanStatus, setBilanStatus] = useState<{ exists: boolean; spreadsheetUrl?: string | null } | null>(null);
  const [isLoadingBilan, setIsLoadingBilan] = useState(false);
  const [availableSheets, setAvailableSheets] = useState<GoogleSheet[]>([]);
  const [isLoadingSheetsList, setIsLoadingSheetsList] = useState(false);
  const [showSheetSelector, setShowSheetSelector] = useState(false);
  
  // État Google Drive
  interface GoogleDriveStatus {
    connected: boolean;
    bordereauxFolderId: string | null;
    bordereauxFolderName: string | null;
    connectedAt: string | null;
  }
  interface GoogleDriveFolder {
    id: string;
    name: string;
  }
  const [googleDriveStatus, setGoogleDriveStatus] = useState<GoogleDriveStatus | null>(null);
  const [isLoadingGoogleDrive, setIsLoadingGoogleDrive] = useState(false);
  const [availableFolders, setAvailableFolders] = useState<GoogleDriveFolder[]>([]);
  const [isLoadingFoldersList, setIsLoadingFoldersList] = useState(false);
  const [showFolderSelector, setShowFolderSelector] = useState(false);
  
  // État Typeform
  interface TypeformStatus {
    connected: boolean;
    connectedAt: string | null;
  }
  const [typeformStatus, setTypeformStatus] = useState<TypeformStatus | null>(null);
  const [isLoadingTypeform, setIsLoadingTypeform] = useState(false);
  const [settingsTab, setSettingsTab] = useState('emails');
  const { data: featuresData } = useFeatures();
  const canCustomizeAutoEmails = featuresData?.features?.customizeAutoEmails === true;

  // Groupes d'onglets pour une navigation plus ergonomique
  const SETTINGS_GROUPS = {
    emails: {
      label: 'Emails',
      icon: Mail,
      tabs: canCustomizeAutoEmails
        ? [
            { id: 'emails', label: 'Comptes Email', icon: Mail },
            { id: 'modeles-emails', label: "Modèles d'emails", icon: Send },
            { id: 'auto-emails', label: 'Emails auto (ton)', icon: Send },
          ]
        : [{ id: 'emails', label: 'Comptes Email', icon: Mail }],
    },
    integrations: {
      label: 'Intégrations',
      icon: Globe,
      tabs: [
        { id: 'google-sheets', label: 'Google Sheets', icon: FileSpreadsheet },
        { id: 'google-drive', label: 'Google Drive', icon: Folder },
        { id: 'typeform', label: 'Typeform', icon: FormInput },
        { id: 'paiements', label: 'Paiements', icon: CreditCard },
        { id: 'mbehub', label: 'MBE Hub', icon: Globe },
      ],
    },
    operations: {
      label: 'Opérations',
      icon: Package,
      tabs: [
        { id: 'cartons', label: 'Cartons', icon: Package },
        { id: 'expedition', label: 'Expédition', icon: Truck },
      ],
    },
  } as const;

  const getGroupForTab = (tabId: string): keyof typeof SETTINGS_GROUPS => {
    for (const [group, data] of Object.entries(SETTINGS_GROUPS)) {
      if (data.tabs.some((t) => t.id === tabId)) return group as keyof typeof SETTINGS_GROUPS;
    }
    return 'emails';
  };

  const currentGroup = getGroupForTab(settingsTab);

  // État Paytweak / Payment Provider (feature customPaytweak)
  const [paymentSettings, setPaymentSettings] = useState<{
    hasCustomPaytweak: boolean;
    paymentProvider: 'stripe' | 'paytweak';
    paytweakConfigured: boolean;
    stripeConnected: boolean;
  } | null>(null);
  const [paytweakPublicKeyInput, setPaytweakPublicKeyInput] = useState('');
  const [paytweakPrivateKeyInput, setPaytweakPrivateKeyInput] = useState('');
  const [isSavingPaytweakKey, setIsSavingPaytweakKey] = useState(false);
  const [isLoadingPaymentSettings, setIsLoadingPaymentSettings] = useState(false);

  // MBE Hub (plans Pro/Ultra) - SOAP API username + password
  const [mbehubStatus, setMbehubStatus] = useState<{ available: boolean; configured: boolean; message?: string } | null>(null);
  const [mbehubUsernameInput, setMbehubUsernameInput] = useState('');
  const [mbehubPasswordInput, setMbehubPasswordInput] = useState('');
  const [isSavingMbehubKey, setIsSavingMbehubKey] = useState(false);
  
  // Charger les comptes email
  const loadEmailAccounts = async () => {
    try {
      setIsLoading(true);
      // Utiliser authenticatedFetch pour passer le token Firebase
      const { authenticatedFetch } = await import('@/lib/api');
      const response = await authenticatedFetch('/api/email-accounts');
      
      if (!response.ok) {
        console.warn('[Settings] API non disponible:', response.status);
        setEmailAccounts([]);
        return;
      }
      
      const accounts = await response.json();
      setEmailAccounts(Array.isArray(accounts) ? accounts : []);
    } catch (error) {
      console.error('[Settings] Erreur:', error);
      setEmailAccounts([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Charger le statut Stripe
  const loadStripeStatus = async () => {
    try {
      setIsLoadingStripe(true);
      const status = await getStripeStatus(); // Plus besoin de passer clientId
      setStripeStatus(status);
    } catch (error) {
      console.error('[Settings] Erreur chargement statut Stripe:', error);
      // Ne pas afficher d'erreur si le client n'existe pas encore
    } finally {
      setIsLoadingStripe(false);
    }
  };

  // Charger les paramètres de paiement (provider Stripe/Paytweak)
  const loadPaymentSettings = async () => {
    try {
      setIsLoadingPaymentSettings(true);
      const { authenticatedFetch } = await import('@/lib/api');
      const res = await authenticatedFetch('/api/account/payment-settings');
      if (!res.ok) {
        setPaymentSettings(null);
        return;
      }
      const data = await res.json();
      setPaymentSettings(data);
    } catch (error) {
      console.error('[Settings] Erreur chargement payment-settings:', error);
      setPaymentSettings(null);
    } finally {
      setIsLoadingPaymentSettings(false);
    }
  };

  const handleSavePaytweakKeys = async () => {
    const pub = paytweakPublicKeyInput.trim();
    const priv = paytweakPrivateKeyInput.trim();
    if (!pub || !priv) {
      toast.error('Saisissez les deux clés Paytweak (publique et privée)');
      return;
    }
    try {
      setIsSavingPaytweakKey(true);
      const { authenticatedFetch } = await import('@/lib/api');
      const res = await authenticatedFetch('/api/account/paytweak-key', {
        method: 'PUT',
        body: JSON.stringify({ publicKey: pub, privateKey: priv }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de la sauvegarde');
      }
      toast.success('Clés Paytweak enregistrées');
      setPaytweakPublicKeyInput('');
      setPaytweakPrivateKeyInput('');
      await loadPaymentSettings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur');
    } finally {
      setIsSavingPaytweakKey(false);
    }
  };

  const loadMbehubStatus = async () => {
    try {
      const { authenticatedFetch } = await import('@/lib/api');
      const res = await authenticatedFetch('/api/account/mbehub-status');
      if (!res.ok) {
        setMbehubStatus(null);
        return;
      }
      const data = await res.json();
      setMbehubStatus(data);
    } catch {
      setMbehubStatus(null);
    }
  };

  const handleSaveMbehubKey = async () => {
    if (!mbehubUsernameInput.trim()) {
      toast.error('Saisissez votre identifiant MBE Hub');
      return;
    }
    if (!mbehubPasswordInput.trim()) {
      toast.error('Saisissez votre mot de passe MBE Hub');
      return;
    }
    try {
      setIsSavingMbehubKey(true);
      const { authenticatedFetch } = await import('@/lib/api');
      const res = await authenticatedFetch('/api/account/mbehub-key', {
        method: 'PUT',
        body: JSON.stringify({
          username: mbehubUsernameInput.trim(),
          password: mbehubPasswordInput.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de la sauvegarde');
      }
      toast.success('Identifiants MBE Hub enregistrés');
      setMbehubUsernameInput('');
      setMbehubPasswordInput('');
      await loadMbehubStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur');
    } finally {
      setIsSavingMbehubKey(false);
    }
  };

  const handleSetPaymentProvider = async (provider: 'stripe' | 'paytweak') => {
    try {
      const { authenticatedFetch } = await import('@/lib/api');
      const res = await authenticatedFetch('/api/account/payment-settings', {
        method: 'PUT',
        body: JSON.stringify({ paymentProvider: provider }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur');
      }
      toast.success(`Outil de paiement: ${provider === 'paytweak' ? 'Paytweak' : 'Stripe'}`);
      await loadPaymentSettings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur');
    }
  };

  // Charger la liste des Google Sheets disponibles
  const loadAvailableSheets = async () => {
    try {
      setIsLoadingSheetsList(true);
      const { authenticatedFetch } = await import('@/lib/api');
      const response = await authenticatedFetch('/api/google-sheets/list');
      
      if (!response.ok) {
        console.warn('[Settings] Impossible de charger la liste des Google Sheets:', response.status);
        setAvailableSheets([]);
        return;
      }
      
      const data = await response.json();
      setAvailableSheets(data.sheets || []);
    } catch (error) {
      console.error('[Settings] Erreur chargement liste Google Sheets:', error);
      setAvailableSheets([]);
    } finally {
      setIsLoadingSheetsList(false);
    }
  };

  // Sélectionner un Google Sheet
  const handleSelectSheet = async (sheetId: string, sheetName: string) => {
    try {
      setIsLoadingGoogleSheets(true);
      const { authenticatedFetch } = await import('@/lib/api');
      const response = await authenticatedFetch('/api/google-sheets/select', {
        method: 'POST',
        body: JSON.stringify({
          spreadsheetId: sheetId,
          spreadsheetName: sheetName
        })
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
        throw new Error(error.error || 'Erreur lors de la sélection');
      }
      
      toast.success(`Google Sheet "${sheetName}" sélectionné avec succès`);
      setShowSheetSelector(false);
      await loadGoogleSheetsStatus();
    } catch (error) {
      console.error('[Settings] Erreur lors de la sélection du Google Sheet:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la sélection');
    } finally {
      setIsLoadingGoogleSheets(false);
    }
  };

  // Vérifier les paramètres URL au montage
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const connected = params.get('connected');
      const error = params.get('error');
      const oauthSuccess = params.get('oauth_success');
      const source = params.get('source');

      if (connected === 'true') {
        if (source === 'stripe') {
          toast.success('Compte Stripe connecté avec succès');
          loadStripeStatus();
          loadPaymentSettings();
        } else if (source === 'google-sheets') {
          toast.success('Google Sheets connecté avec succès');
          loadGoogleSheetsStatus();
        } else {
          toast.success('Compte Gmail connecté avec succès');
          loadEmailAccounts();
        }
        window.history.replaceState({}, '', '/settings');
      } else if (oauthSuccess === 'true' && source === 'google-sheets') {
        // OAuth réussi, mais pas de sheet sélectionné - afficher le sélecteur
        toast.success('Autorisation Google réussie. Sélectionnez un Google Sheet.');
        setShowSheetSelector(true);
        loadGoogleSheetsStatus();
        window.history.replaceState({}, '', '/settings');
      } else if (oauthSuccess === 'true' && source === 'typeform') {
        toast.success('Compte Typeform connecté avec succès');
        setSettingsTab('typeform');
        loadTypeformStatus();
        window.history.replaceState({}, '', '/settings');
      } else if (error) {
        const errorMessage = decodeURIComponent(error);
        toast.error(`Erreur lors de la connexion${source ? ` (${source})` : ''}: ${errorMessage}`);
        window.history.replaceState({}, '', '/settings');
      }
    } catch (error) {
      console.error('[Settings] Erreur lors de la vérification des paramètres:', error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (settingsTab === 'paiements') {
      loadPaymentSettings();
    }
    if (settingsTab === 'mbehub') {
      loadMbehubStatus();
    }
  }, [settingsTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Charger le statut Google Sheets
  const loadBilanStatus = async () => {
    try {
      const { authenticatedFetch } = await import('@/lib/api');
      const response = await authenticatedFetch('/api/bilan/status');
      if (response.ok) {
        const data = await response.json();
        setBilanStatus(data);
      } else {
        setBilanStatus({ exists: false });
      }
    } catch {
      setBilanStatus({ exists: false });
    }
  };

  const loadGoogleSheetsStatus = async () => {
    try {
      setIsLoadingGoogleSheets(true);
      const { authenticatedFetch } = await import('@/lib/api');
      const response = await authenticatedFetch('/api/google-sheets/status');
      
      if (!response.ok) {
        console.warn('[Settings] API Google Sheets non disponible:', response.status);
        setGoogleSheetsStatus({
          connected: false,
          spreadsheetId: null,
          spreadsheetName: null,
          lastSyncAt: null,
          lastRowImported: null,
          connectedAt: null
        });
        return;
      }
      
      const status = await response.json();
      setGoogleSheetsStatus(status);
      if (status.oauthAuthorized) loadBilanStatus();
      
      // Si OAuth autorisé mais pas de sheet sélectionné, afficher le sélecteur
      if (status.oauthAuthorized && !status.connected) {
        setShowSheetSelector(true);
        loadAvailableSheets();
      }
    } catch (error) {
      console.error('[Settings] Erreur chargement statut Google Sheets:', error);
      setGoogleSheetsStatus({
        connected: false,
        oauthAuthorized: false,
        spreadsheetId: null,
        spreadsheetName: null,
        lastSyncAt: null,
        lastRowImported: null,
        connectedAt: null
      });
    } finally {
      setIsLoadingGoogleSheets(false);
    }
  };

  // Charger les comptes email, le statut Stripe et Google Sheets au montage
  useEffect(() => {
    loadEmailAccounts();
    loadStripeStatus();
    loadGoogleSheetsStatus();
    loadGoogleDriveStatus();
    loadTypeformStatus();
  }, []);

  const handleConnectGmail = async () => {
    try {
      setIsLoading(true);
      // Faire un fetch authentifié pour obtenir l'URL de redirection OAuth
      const { authenticatedFetch } = await import('@/lib/api');
      const response = await authenticatedFetch('/auth/gmail/start', {
        method: 'GET'
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
        throw new Error(error.error || 'Erreur lors de la connexion Gmail');
      }
      
      // Récupérer l'URL depuis la réponse JSON
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('URL de redirection non trouvée');
      }
    } catch (error) {
      console.error('[Settings] Erreur lors de la connexion Gmail:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la connexion Gmail');
      setIsLoading(false);
    }
  };

  const handleDisconnectGmail = async (accountId: string) => {
    try {
      const { authenticatedFetch } = await import('@/lib/api');
      const response = await authenticatedFetch(`/api/email-accounts/${accountId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Erreur lors de la déconnexion');
      }
      
      toast.success('Compte Gmail déconnecté');
      loadEmailAccounts();
    } catch (error) {
      console.error('[Settings] Erreur lors de la déconnexion:', error);
      toast.error('Erreur lors de la déconnexion');
    }
  };

  // Handlers Stripe
  const handleConnectStripe = async () => {
    try {
      setIsLoadingStripe(true);
      const url = await connectStripe(); // Plus besoin de passer clientId
      window.location.href = url;
    } catch (error) {
      console.error('[Settings] Erreur connexion Stripe:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la connexion Stripe');
      setIsLoadingStripe(false);
    }
  };

  const handleDisconnectStripe = async () => {
    try {
      setIsLoadingStripe(true);
      await disconnectStripe(); // Plus besoin de passer clientId
      toast.success('Compte Stripe déconnecté');
      await loadStripeStatus();
    } catch (error) {
      console.error('[Settings] Erreur déconnexion Stripe:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la déconnexion');
    } finally {
      setIsLoadingStripe(false);
    }
  };

  // Handlers Google Sheets
  const handleConnectGoogleSheets = async () => {
    try {
      setIsLoadingGoogleSheets(true);
      // Faire un fetch authentifié pour obtenir l'URL de redirection OAuth
      const { authenticatedFetch } = await import('@/lib/api');
      const response = await authenticatedFetch('/auth/google-sheets/start', {
        method: 'GET'
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
        throw new Error(error.error || 'Erreur lors de la connexion Google Sheets');
      }
      
      // Récupérer l'URL depuis la réponse JSON
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('URL de redirection non trouvée');
      }
    } catch (error) {
      console.error('[Settings] Erreur lors de la connexion Google Sheets:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la connexion Google Sheets');
      setIsLoadingGoogleSheets(false);
    }
  };

  const handleDisconnectGoogleSheets = async () => {
    try {
      setIsLoadingGoogleSheets(true);
      const { authenticatedFetch } = await import('@/lib/api');
      const response = await authenticatedFetch('/api/google-sheets/disconnect', {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
        throw new Error(error.error || 'Erreur lors de la déconnexion');
      }
      
      toast.success('Google Sheets déconnecté');
      await loadGoogleSheetsStatus();
    } catch (error) {
      console.error('[Settings] Erreur lors de la déconnexion Google Sheets:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la déconnexion');
    } finally {
      setIsLoadingGoogleSheets(false);
    }
  };

  const handleResyncGoogleSheets = async () => {
    try {
      setIsLoadingGoogleSheets(true);
      const { authenticatedFetch } = await import('@/lib/api');
      const response = await authenticatedFetch('/api/google-sheets/resync', {
        method: 'POST'
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
        throw new Error(error.error || 'Erreur lors de la resynchronisation');
      }
      
      toast.success('Synchronisation lancée');
      // Attendre un peu puis recharger le statut
      setTimeout(() => {
        loadGoogleSheetsStatus();
      }, 2000);
    } catch (error) {
      console.error('[Settings] Erreur lors de la resynchronisation Google Sheets:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la resynchronisation');
    } finally {
      setIsLoadingGoogleSheets(false);
    }
  };

  const handleCreateBilan = async () => {
    try {
      setIsLoadingBilan(true);
      const { authenticatedFetch } = await import('@/lib/api');
      const response = await authenticatedFetch('/api/bilan/create', { method: 'POST' });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de la création');
      }
      const data = await response.json();
      toast.success('Bilan devis MBE créé avec succès');
      await loadBilanStatus();
      if (data.spreadsheetUrl) window.open(data.spreadsheetUrl, '_blank');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la création du Bilan');
    } finally {
      setIsLoadingBilan(false);
    }
  };

  const handleViewBilan = () => {
    if (bilanStatus?.spreadsheetUrl) window.open(bilanStatus.spreadsheetUrl, '_blank');
  };

  // ==========================================
  // FONCTIONS GOOGLE DRIVE
  // ==========================================

  // Charger le statut Google Drive
  const loadGoogleDriveStatus = async () => {
    try {
      setIsLoadingGoogleDrive(true);
      const { authenticatedFetch } = await import('@/lib/api');
      const response = await authenticatedFetch('/api/google-drive/status');
      
      if (!response.ok) {
        console.warn('[Settings] API Google Drive non disponible:', response.status);
        setGoogleDriveStatus({
          connected: false,
          bordereauxFolderId: null,
          bordereauxFolderName: null,
          connectedAt: null
        });
        return;
      }
      
      const status = await response.json();
      setGoogleDriveStatus(status);
    } catch (error) {
      console.error('[Settings] Erreur chargement statut Google Drive:', error);
      setGoogleDriveStatus({
        connected: false,
        bordereauxFolderId: null,
        bordereauxFolderName: null,
        connectedAt: null
      });
    } finally {
      setIsLoadingGoogleDrive(false);
    }
  };

  // Charger la liste des dossiers Google Drive
  const loadAvailableFolders = async () => {
    try {
      setIsLoadingFoldersList(true);
      const { authenticatedFetch } = await import('@/lib/api');
      const response = await authenticatedFetch('/api/google-drive/folders');
      
      if (!response.ok) {
        throw new Error('Impossible de charger les dossiers Drive');
      }
      
      const data = await response.json();
      setAvailableFolders(data.folders || []);
    } catch (error) {
      console.error('[Settings] Erreur chargement dossiers Drive:', error);
      toast.error('Erreur lors du chargement des dossiers');
      setAvailableFolders([]);
    } finally {
      setIsLoadingFoldersList(false);
    }
  };

  // Gérer la connexion Google Drive (afficher le sélecteur de dossier)
  const handleConnectGoogleDrive = async () => {
    // Vérifier que Google Sheets est connecté (OAuth inclut Drive)
    if (!googleSheetsStatus?.oauthAuthorized) {
      toast.error('Vous devez d\'abord connecter Google Sheets');
      return;
    }
    
    setShowFolderSelector(true);
    loadAvailableFolders();
  };

  // Sélectionner un dossier Google Drive
  const handleSelectFolder = async (folderId: string, folderName: string) => {
    try {
      setIsLoadingGoogleDrive(true);
      const { authenticatedFetch } = await import('@/lib/api');
      const response = await authenticatedFetch('/api/google-drive/select-folder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ folderId, folderName })
      });
      
      if (!response.ok) {
        throw new Error('Erreur lors de la sélection du dossier');
      }
      
      toast.success(`Dossier "${folderName}" sélectionné avec succès`);
      setShowFolderSelector(false);
      loadGoogleDriveStatus();
    } catch (error) {
      console.error('[Settings] Erreur sélection dossier Drive:', error);
      toast.error('Erreur lors de la sélection du dossier');
    } finally {
      setIsLoadingGoogleDrive(false);
    }
  };

  // Déconnecter Google Drive
  const handleDisconnectGoogleDrive = async () => {
    try {
      setIsLoadingGoogleDrive(true);
      const { authenticatedFetch } = await import('@/lib/api');
      const response = await authenticatedFetch('/api/google-drive/disconnect', {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Erreur lors de la déconnexion');
      }
      
      toast.success('Google Drive déconnecté');
      loadGoogleDriveStatus();
    } catch (error) {
      console.error('[Settings] Erreur déconnexion Google Drive:', error);
      toast.error('Erreur lors de la déconnexion');
    } finally {
      setIsLoadingGoogleDrive(false);
    }
  };

  // Charger le statut Typeform
  const loadTypeformStatus = async () => {
    try {
      setIsLoadingTypeform(true);
      const { authenticatedFetch } = await import('@/lib/api');
      const response = await authenticatedFetch('/api/typeform/status');
      if (!response.ok) {
        setTypeformStatus({ connected: false, connectedAt: null });
        return;
      }
      const status = await response.json();
      setTypeformStatus(status);
    } catch {
      setTypeformStatus({ connected: false, connectedAt: null });
    } finally {
      setIsLoadingTypeform(false);
    }
  };

  const handleConnectTypeform = async () => {
    try {
      setIsLoadingTypeform(true);
      const { authenticatedFetch } = await import('@/lib/api');
      const response = await authenticatedFetch('/auth/typeform/start', { method: 'GET' });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur lors de la connexion Typeform');
      }
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('URL de redirection non trouvée');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur connexion Typeform');
      setIsLoadingTypeform(false);
    }
  };

  const handleDisconnectTypeform = async () => {
    try {
      setIsLoadingTypeform(true);
      const { authenticatedFetch } = await import('@/lib/api');
      const response = await authenticatedFetch('/api/typeform/disconnect', { method: 'DELETE' });
      if (!response.ok) throw new Error('Erreur déconnexion');
      toast.success('Typeform déconnecté');
      await loadTypeformStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur déconnexion');
    } finally {
      setIsLoadingTypeform(false);
    }
  };

  // Limiter à 1 seul compte (le premier actif)
  const activeAccount = emailAccounts.find(acc => acc.isActive) || emailAccounts[0];

  const formatDate = (date: string | Date | null | undefined): string => {
    if (!date) return 'Aucune synchronisation';
    
    try {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return 'Date invalide';
      return d.toLocaleString('fr-FR');
    } catch {
      return 'Date invalide';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <SettingsIcon className="w-8 h-8" />
            Paramètres
          </h1>
          <p className="text-muted-foreground mt-2">
            Gérez les paramètres de votre application
          </p>
        </div>

        <Tabs value={settingsTab} onValueChange={setSettingsTab} className="space-y-6">
          {/* Groupes principaux */}
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 flex-wrap">
              {(Object.entries(SETTINGS_GROUPS) as [keyof typeof SETTINGS_GROUPS, (typeof SETTINGS_GROUPS)['emails']][]).map(([groupKey, groupData]) => {
                const Icon = groupData.icon;
                const isActive = currentGroup === groupKey;
                return (
                  <Button
                    key={groupKey}
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    className="gap-2"
                    onClick={() => setSettingsTab(groupData.tabs[0].id)}
                  >
                    <Icon className="w-4 h-4" />
                    {groupData.label}
                  </Button>
                );
              })}
            </div>
            {/* Sous-onglets du groupe actif (masqués si un seul onglet) */}
            {SETTINGS_GROUPS[currentGroup].tabs.length > 1 && (
              <TabsList className="w-fit">
                {SETTINGS_GROUPS[currentGroup].tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            )}
          </div>

          <TabsContent value="emails" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Comptes Gmail connectés
                </CardTitle>
                <CardDescription>
                  Connectez votre compte Gmail pour recevoir et afficher les emails des clients dans les devis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Chargement des comptes...
                  </div>
                ) : !activeAccount ? (
                  <>
                    <Button onClick={handleConnectGmail} className="gap-2">
                      <Mail className="w-4 h-4" />
                      Connecter un compte Gmail
                    </Button>
                    <div className="text-center py-8 text-muted-foreground">
                      <Mail className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Aucun compte Gmail connecté</p>
                      <p className="text-sm mt-2">
                        Connectez votre compte Gmail pour commencer à recevoir les emails des clients
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground mb-2">
                          Compte Gmail connecté
                        </p>
                      </div>
                      <Button 
                        onClick={handleConnectGmail} 
                        variant="outline"
                        className="gap-2"
                      >
                        <Mail className="w-4 h-4" />
                        Changer de compte
                      </Button>
                    </div>
                    
                    <Card className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">
                                {activeAccount.emailAddress || 'Email inconnu'}
                              </span>
                              {activeAccount.isActive ? (
                                <Badge variant="default" className="gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Actif
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="gap-1">
                                  <XCircle className="w-3 h-3" />
                                  Inactif
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Dernière synchronisation: {formatDate(activeAccount.lastSyncAt)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={loadEmailAccounts}
                            className="gap-2"
                          >
                            <RefreshCw className="w-4 h-4" />
                            Actualiser
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDisconnectGmail(activeAccount.id)}
                            className="gap-2 text-destructive hover:text-destructive"
                          >
                            <LogOut className="w-4 h-4" />
                            Déconnecter
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="google-sheets" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5" />
                  Connexion Google Sheets
                </CardTitle>
                <CardDescription>
                  Connectez votre Google Sheet pour importer automatiquement les nouveaux devis depuis Typeform
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingGoogleSheets ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                    Chargement...
                  </div>
                ) : !googleSheetsStatus?.oauthAuthorized && !googleSheetsStatus?.connected ? (
                  <>
                    <Button 
                      onClick={handleConnectGoogleSheets} 
                      className="gap-2"
                      disabled={isLoadingGoogleSheets}
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      Connecter Google Sheets
                    </Button>
                    <div className="text-center py-8 text-muted-foreground">
                      <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Aucun Google Sheet connecté</p>
                      <p className="text-sm mt-2">
                        Connectez votre Google Sheet pour importer automatiquement les nouveaux devis
                      </p>
                    </div>
                  </>
                ) : googleSheetsStatus?.oauthAuthorized && !googleSheetsStatus?.connected ? (
                  <>
                    {/* OAuth autorisé mais pas de sheet sélectionné */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium mb-1">Autorisation Google réussie</p>
                          <p className="text-sm text-muted-foreground">Sélectionnez un Google Sheet pour commencer l'import</p>
                        </div>
                        <Button
                          onClick={() => {
                            setShowSheetSelector(!showSheetSelector);
                            if (!showSheetSelector) {
                              loadAvailableSheets();
                            }
                          }}
                          variant="outline"
                          className="gap-2"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          {showSheetSelector ? 'Masquer' : 'Choisir un Sheet'}
                        </Button>
                      </div>

                      {showSheetSelector && (
                        <Card className="p-4">
                          {isLoadingSheetsList ? (
                            <div className="text-center py-4">
                              <Loader2 className="w-5 h-5 mx-auto animate-spin" />
                              <p className="text-sm text-muted-foreground mt-2">Chargement des Google Sheets...</p>
                            </div>
                          ) : availableSheets.length === 0 ? (
                            <div className="text-center py-4">
                              <p className="text-sm text-muted-foreground">Aucun Google Sheet trouvé</p>
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-96 overflow-y-auto">
                              {availableSheets.map((sheet) => (
                                <div
                                  key={sheet.id}
                                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent cursor-pointer"
                                  onClick={() => handleSelectSheet(sheet.id, sheet.name)}
                                >
                                  <div className="flex-1">
                                    <p className="font-medium">{sheet.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      Modifié: {sheet.modifiedTime ? new Date(sheet.modifiedTime).toLocaleString('fr-FR') : 'Inconnu'}
                                    </p>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSelectSheet(sheet.id, sheet.name);
                                    }}
                                    disabled={isLoadingGoogleSheets}
                                  >
                                    Sélectionner
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </Card>
                      )}

                      {/* Bilan devis MBE - visible dès que OAuth autorisé */}
                      <Card className="mt-4">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">Bilan devis MBE</CardTitle>
                          <CardDescription>
                            Feuille Google Sheet dédiée (En cours, Terminés, Refusés) – export en temps réel
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {isLoadingBilan ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Chargement...
                            </div>
                          ) : bilanStatus?.exists ? (
                            <Button onClick={handleViewBilan} variant="outline" className="gap-2">
                              <ExternalLink className="w-4 h-4" />
                              Voir le bilan
                            </Button>
                          ) : (
                            <Button onClick={handleCreateBilan} disabled={isLoadingBilan} className="gap-2">
                              <FileSpreadsheet className="w-4 h-4" />
                              Créer la page Google Sheet
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground mb-2">
                          Google Sheet connecté
                        </p>
                      </div>
                      <Button 
                        onClick={handleConnectGoogleSheets} 
                        variant="outline"
                        className="gap-2"
                        disabled={isLoadingGoogleSheets}
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        Changer de Sheet
                      </Button>
                    </div>
                    
                    <Card className="p-4">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">
                                {googleSheetsStatus.spreadsheetName || 'Sheet inconnu'}
                              </span>
                              <Badge variant="default" className="gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Connecté
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              ID: {googleSheetsStatus.spreadsheetId}
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">
                              Dernière synchronisation
                            </p>
                            <p className="text-sm font-medium">
                              {formatDate(googleSheetsStatus.lastSyncAt)}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">
                              Dernière ligne importée
                            </p>
                            <p className="text-sm font-medium">
                              Ligne {googleSheetsStatus.lastRowImported || 1}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 pt-4 border-t">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleResyncGoogleSheets}
                            className="gap-2"
                            disabled={isLoadingGoogleSheets}
                          >
                            <RefreshCw className="w-4 h-4" />
                            Resynchroniser
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDisconnectGoogleSheets}
                            className="gap-2 text-destructive hover:text-destructive"
                            disabled={isLoadingGoogleSheets}
                          >
                            <LogOut className="w-4 h-4" />
                            Déconnecter
                          </Button>
                        </div>
                      </div>
                    </Card>

                    {/* Bilan devis MBE */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">Bilan devis MBE</CardTitle>
                        <CardDescription>
                          Feuille Google Sheet dédiée (En cours, Terminés, Refusés) – export en temps réel
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {isLoadingBilan ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Chargement...
                          </div>
                        ) : bilanStatus?.exists ? (
                          <Button onClick={handleViewBilan} variant="outline" className="gap-2">
                            <ExternalLink className="w-4 h-4" />
                            Voir le bilan
                          </Button>
                        ) : (
                          <Button onClick={handleCreateBilan} disabled={isLoadingBilan} className="gap-2">
                            <FileSpreadsheet className="w-4 h-4" />
                            Créer la page Google Sheet
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Onglet Google Drive */}
          <TabsContent value="google-drive" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5" />
                  Google Drive - Bordereaux
                </CardTitle>
                <CardDescription>
                  Sélectionnez le dossier Google Drive où arrivent les bordereaux Typeform
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingGoogleDrive ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : googleDriveStatus?.connected ? (
                  <>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <span className="font-medium">Dossier connecté</span>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Dossier: <strong>{googleDriveStatus.bordereauxFolderName}</strong>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Connecté le: {googleDriveStatus.connectedAt ? new Date(googleDriveStatus.connectedAt).toLocaleDateString('fr-FR') : 'N/A'}
                      </p>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={handleDisconnectGoogleDrive}
                      disabled={isLoadingGoogleDrive}
                      className="gap-2"
                    >
                      <LogOut className="h-4 w-4" />
                      Déconnecter
                    </Button>
                  </>
                ) : (
                  <>
                    {showFolderSelector ? (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          Sélectionnez le dossier contenant les bordereaux:
                        </p>
                        {isLoadingFoldersList ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin" />
                          </div>
                        ) : availableFolders.length > 0 ? (
                          <div className="space-y-2 max-h-96 overflow-y-auto">
                            {availableFolders.map(folder => (
                              <Button
                                key={folder.id}
                                variant="outline"
                                className="w-full justify-start"
                                onClick={() => handleSelectFolder(folder.id, folder.name)}
                              >
                                <Folder className="mr-2 h-4 w-4" />
                                {folder.name}
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground">
                            <Folder className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>Aucun dossier trouvé</p>
                          </div>
                        )}
                        <Button 
                          variant="ghost" 
                          onClick={() => setShowFolderSelector(false)}
                        >
                          Annuler
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Button 
                          onClick={handleConnectGoogleDrive}
                          disabled={isLoadingGoogleDrive || !googleSheetsStatus?.oauthAuthorized}
                          className="gap-2"
                        >
                          <FolderOpen className="h-4 w-4" />
                          Sélectionner le dossier bordereaux
                        </Button>
                        {!googleSheetsStatus?.oauthAuthorized && (
                          <div className="flex items-center gap-2 text-sm text-amber-600">
                            <AlertTriangle className="h-4 w-4" />
                            <p>Vous devez d'abord connecter Google Sheets</p>
                          </div>
                        )}
                        <div className="text-center py-8 text-muted-foreground">
                          <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                          <p>Aucun dossier sélectionné</p>
                          <p className="text-xs mt-2">
                            Les bordereaux Typeform seront automatiquement liés aux devis
                          </p>
                        </div>
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="typeform" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FormInput className="w-5 h-5" />
                  Connexion Typeform
                </CardTitle>
                <CardDescription>
                  Connectez votre compte Typeform pour télécharger les bordereaux depuis vos formulaires (liens dans les réponses Typeform / Google Sheets)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingTypeform ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                    Chargement...
                  </div>
                ) : typeformStatus?.connected ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground mb-2">
                          Compte Typeform connecté
                        </p>
                      </div>
                      <Button
                        onClick={handleConnectTypeform}
                        variant="outline"
                        className="gap-2"
                        disabled={isLoadingTypeform}
                      >
                        <FormInput className="w-4 h-4" />
                        Changer de compte
                      </Button>
                    </div>
                    <Card className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">Typeform</span>
                              <Badge variant="default" className="gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Connecté
                              </Badge>
                            </div>
                            {typeformStatus.connectedAt && (
                              <p className="text-sm text-muted-foreground">
                                Connecté le {new Date(typeformStatus.connectedAt).toLocaleDateString('fr-FR', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric'
                                })}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={loadTypeformStatus}
                            className="gap-2"
                            disabled={isLoadingTypeform}
                          >
                            <RefreshCw className="w-4 h-4" />
                            Actualiser
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDisconnectTypeform}
                            className="gap-2 text-destructive hover:text-destructive"
                            disabled={isLoadingTypeform}
                          >
                            <LogOut className="w-4 h-4" />
                            Déconnecter
                          </Button>
                        </div>
                      </div>
                    </Card>
                    <p className="text-sm text-muted-foreground">
                      Les bordereaux PDF des réponses Typeform seront téléchargés automatiquement lors de l'analyse des devis.
                    </p>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={handleConnectTypeform}
                      className="gap-2"
                      disabled={isLoadingTypeform}
                    >
                      {isLoadingTypeform ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Connexion en cours...
                        </>
                      ) : (
                        <>
                          <FormInput className="w-4 h-4" />
                          Connecter Typeform
                        </>
                      )}
                    </Button>
                    <div className="text-center py-8 text-muted-foreground">
                      <FormInput className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Aucun compte Typeform connecté</p>
                      <p className="text-sm mt-2">
                        Connectez votre compte Typeform pour télécharger les bordereaux PDF depuis les liens de vos formulaires. Chaque client SaaS connecte son propre compte.
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cartons" className="space-y-6">
            <CartonsSettings />
          </TabsContent>

          <TabsContent value="expedition">
            <ShippingRatesSettings />
          </TabsContent>

          <TabsContent value="paiements" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Connexion Stripe
                </CardTitle>
                <CardDescription>
                  Connectez votre compte Stripe pour encaisser les paiements de vos clients directement via le SaaS
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingStripe ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
                    <p className="text-muted-foreground mt-4">Chargement...</p>
                  </div>
                ) : !stripeStatus?.connected ? (
                  <>
                    <div className="text-center py-8">
                      <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
                      <Badge variant="secondary" className="gap-1 mb-4">
                        <XCircle className="w-3 h-3" />
                        Non connecté
                      </Badge>
                      <p className="text-muted-foreground mb-2">
                        Aucun compte Stripe connecté
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Connectez votre compte Stripe pour commencer à encaisser les paiements
                      </p>
                    </div>
                    <Button 
                      onClick={handleConnectStripe} 
                      className="w-full gap-2"
                      disabled={isLoadingStripe}
                    >
                      {isLoadingStripe ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Connexion en cours...
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4" />
                          Connecter mon compte Stripe
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="text-center py-6">
                      <CreditCard className="w-12 h-12 mx-auto mb-4 text-green-600" />
                      <Badge variant="default" className="gap-1 mb-4">
                        <CheckCircle2 className="w-3 h-3" />
                        Connecté
                      </Badge>
                      <p className="text-sm text-muted-foreground">
                        Votre compte Stripe est connecté et prêt à recevoir des paiements
                      </p>
                    </div>
                    
                    <Card className="p-4 bg-muted/50">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">ID du compte:</span>
                          <code className="text-xs bg-background px-2 py-1 rounded">
                            {stripeStatus.stripeAccountId}
                          </code>
                        </div>
                        {stripeStatus.connectedAt && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Connecté le:</span>
                            <span className="text-xs">
                              {new Date(stripeStatus.connectedAt).toLocaleDateString('fr-FR', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    </Card>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={loadStripeStatus}
                        className="gap-2 flex-1"
                        disabled={isLoadingStripe}
                      >
                        <RefreshCw className={`w-4 h-4 ${isLoadingStripe ? 'animate-spin' : ''}`} />
                        Actualiser
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleConnectStripe}
                        className="gap-2 flex-1"
                        disabled={isLoadingStripe}
                      >
                        <CreditCard className="w-4 h-4" />
                        Reconnecter
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleDisconnectStripe}
                        className="gap-2 flex-1 text-destructive hover:text-destructive"
                        disabled={isLoadingStripe}
                      >
                        <LogOut className="w-4 h-4" />
                        Déconnecter
                      </Button>
                    </div>

                    <div className="mt-6 p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/20">
                      <div className="flex gap-3">
                        <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <div className="text-sm space-y-1">
                          <p className="font-medium text-blue-900 dark:text-blue-100">
                            Comment ça marche ?
                          </p>
                          <ul className="text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                            <li>Les paiements sont encaissés directement sur VOTRE compte Stripe</li>
                            <li>Vous gardez 100% du contrôle de vos fonds</li>
                            <li>Créez des liens de paiement pour vos devis</li>
                            <li>Les statuts se mettent à jour automatiquement</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Section Paytweak + sélecteur provider (compte avec customPaytweak) */}
            {paymentSettings?.hasCustomPaytweak && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <KeyRound className="w-5 h-5" />
                    Paytweak & choix de l&apos;outil de paiement
                  </CardTitle>
                  <CardDescription>
                    Connectez Paytweak avec votre clé API et choisissez quel outil génère vos liens de paiement
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {isLoadingPaymentSettings ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Chargement...
                    </div>
                  ) : (
                    <>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Clé publique Paytweak (Paytweak-API-KEY)</Label>
                          <Input
                            type="password"
                            placeholder={paymentSettings.paytweakConfigured ? "•••••••• (déjà configurée)" : "Clé publique"}
                            value={paytweakPublicKeyInput}
                            onChange={(e) => setPaytweakPublicKeyInput(e.target.value)}
                            className="w-full"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Clé privée Paytweak (Secret token)</Label>
                          <Input
                            type="password"
                            placeholder={paymentSettings.paytweakConfigured ? "•••••••• (déjà configurée)" : "Clé privée"}
                            value={paytweakPrivateKeyInput}
                            onChange={(e) => setPaytweakPrivateKeyInput(e.target.value)}
                            className="w-full"
                          />
                        </div>
                        <Button
                          onClick={handleSavePaytweakKeys}
                          disabled={isSavingPaytweakKey || !paytweakPublicKeyInput.trim() || !paytweakPrivateKeyInput.trim()}
                        >
                          {isSavingPaytweakKey ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer les clés'}
                        </Button>
                        {paymentSettings.paytweakConfigured && (
                          <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4" />
                            Paytweak configuré (clé publique + clé privée)
                          </p>
                        )}
                      </div>

                      {paymentSettings.stripeConnected && paymentSettings.paytweakConfigured && (
                        <div className="space-y-2">
                          <Label>Outil pour générer les liens de paiement</Label>
                          <div className="flex gap-4">
                            <Button
                              variant={paymentSettings.paymentProvider === 'stripe' ? 'default' : 'outline'}
                              onClick={() => handleSetPaymentProvider('stripe')}
                            >
                              <CreditCard className="w-4 h-4 mr-2" />
                              Stripe
                            </Button>
                            <Button
                              variant={paymentSettings.paymentProvider === 'paytweak' ? 'default' : 'outline'}
                              onClick={() => handleSetPaymentProvider('paytweak')}
                            >
                              <KeyRound className="w-4 h-4 mr-2" />
                              Paytweak
                            </Button>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Actuellement utilisé : <strong>{paymentSettings.paymentProvider === 'paytweak' ? 'Paytweak' : 'Stripe'}</strong>
                          </p>
                        </div>
                      )}

                      {paymentSettings.stripeConnected && !paymentSettings.paytweakConfigured && (
                        <p className="text-sm text-muted-foreground">
                          Configurez votre clé API Paytweak ci-dessus pour pouvoir choisir entre Stripe et Paytweak.
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* MBE Hub - plans Pro et Ultra */}
          {canCustomizeAutoEmails && (
            <>
              <TabsContent value="modeles-emails" className="space-y-6">
                <EmailTemplatesSettings />
              </TabsContent>
              <TabsContent value="auto-emails" className="space-y-6">
                <AutoEmailsSettings />
              </TabsContent>
            </>
          )}
          <TabsContent value="mbehub" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  MBE Hub
                </CardTitle>
                <CardDescription>
                  Identifiants SOAP (mbehub.fr) pour créer des expéditions en brouillon dans le Hub. Le Centre MBE finalise et imprime les étiquettes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {mbehubStatus === null ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Chargement...
                  </div>
                ) : !mbehubStatus.available ? (
                  <div className="py-6 text-center">
                    <Globe className="w-12 h-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {mbehubStatus.message || 'MBE Hub est réservé aux plans Pro et Ultra.'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Passez à un plan supérieur pour accéder à cette fonctionnalité.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Identifiant (username)</Label>
                      <Input
                        type="text"
                        placeholder={mbehubStatus.configured ? '•••••••• (déjà configuré)' : 'Login mbehub.fr / ONLINEMBE_USER'}
                        value={mbehubUsernameInput}
                        onChange={(e) => setMbehubUsernameInput(e.target.value)}
                        className="flex-1"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Mot de passe</Label>
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          placeholder={mbehubStatus.configured ? '•••••••• (déjà configuré)' : 'Mot de passe API'}
                          value={mbehubPasswordInput}
                          onChange={(e) => setMbehubPasswordInput(e.target.value)}
                          className="flex-1"
                        />
                        <Button
                          onClick={handleSaveMbehubKey}
                          disabled={isSavingMbehubKey || !mbehubUsernameInput.trim() || !mbehubPasswordInput.trim()}
                        >
                          {isSavingMbehubKey ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer'}
                        </Button>
                      </div>
                      {mbehubStatus.configured && (
                        <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" />
                          MBE Hub configuré
                        </p>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Le bouton « Envoyer vers MBE Hub » sera disponible sur la page Expéditions (devis en attente d&apos;envoi).
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
