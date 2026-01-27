import { useState, useEffect } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings as SettingsIcon, Mail, CheckCircle2, XCircle, RefreshCw, AlertTriangle, LogOut, CreditCard, Loader2, FileSpreadsheet, Folder, FolderOpen, Package, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { connectStripe, getStripeStatus, disconnectStripe } from '@/lib/stripeConnect';
import type { StripeStatusResponse } from '@/types/stripe';
import CartonsSettings from '@/components/settings/CartonsSettings';
import { ShippingRatesSettings } from '@/components/settings/ShippingRatesSettings';

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
        // Charger le statut qui va déclencher le chargement des sheets
        loadGoogleSheetsStatus();
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

  // Charger le statut Google Sheets
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

        <Tabs defaultValue="emails" className="space-y-6">
          <TabsList>
            <TabsTrigger value="emails">Comptes Email</TabsTrigger>
            <TabsTrigger value="google-sheets">Google Sheets</TabsTrigger>
            <TabsTrigger value="google-drive">Google Drive</TabsTrigger>
            <TabsTrigger value="cartons">
              <Package className="w-4 h-4 mr-2" />
              Cartons
            </TabsTrigger>
            <TabsTrigger value="expedition">
              <Truck className="w-4 h-4 mr-2" />
              Expédition
            </TabsTrigger>
            <TabsTrigger value="paiements">Paiements</TabsTrigger>
          </TabsList>

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
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
