# 📊 Intégration Google Sheets Typeform - Multi-Tenant

## Vue d'ensemble

Ce document décrit l'implémentation complète de l'intégration Google Sheets pour synchroniser automatiquement les devis depuis les formulaires Typeform. Chaque compte SaaS (MBE) peut connecter son propre Google Sheet, et les devis sont créés automatiquement avec isolation complète par `saasAccountId`.

## 🎯 Objectif

Permettre à chaque client SaaS de :
- Connecter son propre Google Sheet contenant les réponses Typeform
- Synchroniser automatiquement les nouveaux devis toutes les 90 secondes
- Créer des devis complets avec toutes les informations du formulaire
- Gérer les différents modes de livraison (client, destinataire, point relais UPS)

## 🏗️ Architecture

### Structure Firestore

```
saasAccounts/{saasAccountId}
  └── integrations
      └── googleSheets
          ├── connected: boolean
          ├── spreadsheetId: string
          ├── spreadsheetName: string
          ├── accessToken: string
          ├── refreshToken: string
          ├── expiresAt: Date
          ├── lastRowImported: number
          ├── lastSyncAt: Timestamp
          └── connectedAt: Timestamp

quotes/{quoteId}
  ├── saasAccountId: string (CRITIQUE: isolation)
  ├── source: "google_sheet"
  ├── sheetRowIndex: number
  ├── client: { name, email, phone, address }
  ├── delivery: { mode, contact, address, note }
  ├── auctionSheet: { fileName, totalLots, totalObjects }
  ├── options: { insurance, express, ... }
  ├── status: "new"
  ├── typeformToken: string
  ├── typeformSubmittedAt: string
  └── reference: "GS-timestamp-ligne"
```

### Flux OAuth

1. **Frontend** : Utilisateur clique sur "Connecter Google Sheets" dans Settings
2. **Backend** : Route `/auth/google-sheets/start` (protégée par `requireAuth`)
   - Extrait `saasAccountId` depuis le token Firebase
   - Génère l'URL OAuth Google avec `saasAccountId` dans le `state`
   - Retourne l'URL en JSON
3. **Google OAuth** : Redirection vers Google pour autorisation
4. **Callback** : Route `/auth/google-sheets/callback`
   - Récupère `saasAccountId` depuis `req.query.state`
   - Échange le code contre les tokens
   - Liste les Google Sheets accessibles
   - Prend le premier sheet trouvé (peut être amélioré pour choisir)
   - Stocke les tokens dans `saasAccounts/{saasAccountId}/integrations/googleSheets`
5. **Redirection** : Retour vers Settings avec message de succès

### Synchronisation automatique

- **Polling** : Toutes les 90 secondes
- **Fonction** : `syncAllGoogleSheets()`
  - Itère sur tous les `saasAccounts`
  - Pour chaque compte avec Google Sheets connecté, appelle `syncSheetForAccount()`
- **Fonction** : `syncSheetForAccount(saasAccountId, googleSheetsIntegration)`
  - Lit le Google Sheet à partir de la ligne 2 (ligne 1 = headers)
  - Traite uniquement les nouvelles lignes (après `lastRowImported`)
  - Vérifie les doublons par `sheetRowIndex`
  - Crée un nouveau devis pour chaque nouvelle ligne
  - Met à jour `lastRowImported` et `lastSyncAt`

## 📋 Mapping des colonnes Typeform

### Structure des colonnes

| Colonne | Nom | Description |
|---------|-----|-------------|
| 0 | Prénom | Prénom du client |
| 1 | Nom de famille | Nom de famille du client |
| 2 | Numéro de téléphone | Téléphone du client |
| 3 | E-mail | Email du client |
| 4 | Adresse | Adresse du client |
| 5 | Complément d'adresse | Complément d'adresse du client |
| 6 | Ville | Ville du client |
| 7 | État/Région/Province | État/Région/Province du client |
| 8 | Code postal | Code postal du client |
| 9 | Pays | Pays du client |
| 10 | Êtes-vous le destinataire ? | "Oui"/"Non"/"Livrer à un point relais UPS" |
| 11-20 | Informations destinataire | Si destinataire différent (colonnes 11-20) |
| 21 | Adresse point relais UPS | Adresse complète du point relais (si choisi) |
| 22 | 📎 Ajouter votre bordereau | Nom du fichier bordereau (sera géré plus tard) |
| 23 | Informations utiles | Notes additionnelles |
| 24 | Souhaitez vous assurer ? | "Oui"/"Non" |
| 25 | Submitted At | Date de soumission Typeform |
| 26 | Token | Token Typeform unique |

### Logique de détection du mode de livraison

1. **Client = Destinataire** (colonne 10 = "Oui" / "Yes")
   - Utilise les informations du client pour la livraison
   - Mode : `'client'`

2. **Point relais UPS** (colonne 10 contient "point relais" / "access point" / "ups" ET colonne 21 remplie)
   - Le client a choisi un point relais UPS
   - Contact : informations du client
   - Adresse : adresse du point relais (colonne 21)
   - Mode : `'pickup'`

3. **Destinataire différent** (colonne 10 = "Non" / "No" ET colonnes 11-20 remplies)
   - Utilise les informations du destinataire (colonnes 11-20)
   - Mode : `'receiver'`

## 🔧 Routes Backend

### OAuth

- `GET /auth/google-sheets/start` (protégée par `requireAuth`)
  - Génère l'URL OAuth Google
  - Retourne `{ url: "https://accounts.google.com/..." }` en JSON

- `GET /auth/google-sheets/callback`
  - Reçoit le code OAuth et le `state` (saasAccountId)
  - Stocke les tokens dans Firestore
  - Redirige vers Settings avec message de succès/erreur

### API

- `GET /api/google-sheets/status` (protégée par `requireAuth`)
  - Retourne le statut de la connexion Google Sheets
  - Inclut : `connected`, `spreadsheetId`, `spreadsheetName`, `lastSyncAt`, `lastRowImported`

- `DELETE /api/google-sheets/disconnect` (protégée par `requireAuth`)
  - Supprime l'intégration Google Sheets du compte SaaS

- `POST /api/google-sheets/resync` (protégée par `requireAuth`)
  - Force une resynchronisation immédiate
  - Lance la synchronisation en arrière-plan

## 🎨 Interface Frontend

### Onglet Google Sheets dans Settings

**État non connecté :**
- Bouton "Connecter Google Sheets"
- Message informatif

**État connecté :**
- Nom du fichier Google Sheet
- Badge "Connecté"
- ID du spreadsheet
- Dernière synchronisation
- Dernière ligne importée
- Boutons :
  - "Resynchroniser" : Force une sync immédiate
  - "Déconnecter" : Supprime la connexion
  - "Changer de Sheet" : Permet de reconnecter un autre sheet

## 🔒 Sécurité

- **Isolation par `saasAccountId`** : Chaque compte SaaS ne voit que ses propres devis
- **Authentification requise** : Toutes les routes sensibles sont protégées par `requireAuth`
- **Tokens OAuth** : Stockés uniquement dans Firestore, jamais exposés au frontend
- **Détection doublons** : Vérification par `sheetRowIndex` pour éviter les créations multiples

## ⚙️ Configuration

### Variables d'environnement (.env.local)

```env
GOOGLE_SHEETS_CLIENT_ID=your_google_client_id_here
GOOGLE_SHEETS_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_SHEETS_REDIRECT_URI=http://localhost:5174/auth/google-sheets/callback
```

### Google Cloud Console

1. Activer **Google Sheets API**
2. Activer **Google Drive API**
3. Créer un **OAuth Client ID** (type Web)
4. Ajouter l'URI de redirection : `http://localhost:5174/auth/google-sheets/callback`

## 📝 Structure Quote créée

Chaque devis créé depuis Google Sheets contient :

```javascript
{
  saasAccountId: string,        // Isolation par compte SaaS
  source: 'google_sheet',
  sheetRowIndex: number,        // Ligne dans le sheet (1-indexed)
  
  client: {
    name: string,
    email: string,
    phone: string,
    address: string
  },
  
  delivery: {
    mode: 'client' | 'receiver' | 'pickup',
    contact: {
      name: string,
      email: string,
      phone: string
    },
    address: {
      line1: string,
      line2: string | null,
      city: string | null,
      state: string | null,
      zip: string | null,
      country: string | null
    },
    note: string | null
  },
  
  auctionSheet: {
    fileName: string | null,     // Sera complété lors de l'upload
    totalLots: 0,
    totalObjects: 0
  },
  
  options: {
    insurance: boolean,
    express: false,
    insuranceAmount: null,
    expressAmount: null,
    packagingPrice: null,
    shippingPrice: null
  },
  
  status: 'new',
  paymentStatus: 'pending',
  paymentLinks: [],
  messages: [],
  verificationIssues: [],
  timeline: [{
    id: string,
    date: Timestamp,
    status: 'new',
    description: 'Devis créé depuis Google Sheets Typeform'
  }],
  internalNotes: [],
  auctionHouseComments: [],
  
  typeformToken: string,
  typeformSubmittedAt: string | null,
  upsAccessPoint: string | null,
  
  createdAt: Timestamp,
  updatedAt: Timestamp,
  reference: string              // Format: "GS-timestamp-ligne"
}
```

## 🔄 Workflow de synchronisation

1. **Polling automatique** : Toutes les 90 secondes
2. **Pour chaque compte SaaS** :
   - Vérifie si Google Sheets est connecté
   - Lit le sheet à partir de la ligne `lastRowImported + 1`
   - Pour chaque nouvelle ligne :
     - Vérifie si un devis existe déjà (par `sheetRowIndex`)
     - Si nouveau, crée un devis complet
     - Ignore les lignes vides ou sans données essentielles
   - Met à jour `lastRowImported` et `lastSyncAt`

## 🐛 Gestion des erreurs

- **Token expiré** : Si le token OAuth expire (erreur 401), Google Sheets est automatiquement déconnecté
- **Lignes invalides** : Les lignes sans nom ou email client sont ignorées avec un log
- **Doublons** : Détection automatique par `sheetRowIndex`, évite les créations multiples
- **Sheet vide** : Si aucun sheet n'est trouvé, redirection avec message d'erreur

## 📈 Améliorations futures

- [ ] Sélection du Google Sheet (au lieu de prendre le premier)
- [ ] Upload du bordereau directement depuis Typeform (colonne 22)
- [ ] Mapping personnalisable des colonnes
- [ ] Notifications lors de la création de nouveaux devis
- [ ] Historique des synchronisations
- [ ] Gestion des erreurs de mapping plus détaillée

## ✅ Résultat

- ✅ Chaque compte SaaS peut connecter son propre Google Sheet
- ✅ Synchronisation automatique toutes les 90 secondes
- ✅ Création automatique de devis complets avec toutes les informations
- ✅ Gestion des différents modes de livraison
- ✅ Isolation complète par `saasAccountId`
- ✅ Détection et gestion des doublons
- ✅ Interface utilisateur complète dans Settings

