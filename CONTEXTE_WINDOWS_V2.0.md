# 📘 Contexte Projet - Configuration Windows & Système de Notifications OAuth

**Version** : 2.0.1  
**Date** : 27 janvier 2026  
**Plateforme** : Windows 10/11 + Mac (cross-platform)

---

## 🎯 Vue d'ensemble du projet

### Nom du projet
**SaaS MBE Dev 2.0** - Application SaaS multi-tenant de gestion de devis et enchères

### Repository GitHub
- **URL** : https://github.com/xarnix1112/SaaS-MBE-Dev-2.0
- **Propriétaire** : xarnix1112
- **Type** : Public
- **Branche principale** : `master`

### Description
Application web SaaS permettant aux clients MBE (Mail Boxes Etc.) de :
- Recevoir automatiquement des demandes de devis par email (Gmail)
- Gérer des devis issus de Google Sheets
- Analyser des bordereaux d'enchères avec IA (Groq)
- Calculer automatiquement les frais d'expédition
- Gérer les paiements via Stripe Connect
- Envoyer des emails de devis/collecte
- Suivre les lots et expéditions

---

## 🏗️ Architecture technique

### Stack technologique
- **Frontend** : React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend** : Node.js + Express
- **Base de données** : Firebase Firestore (NoSQL)
- **Authentification** : Firebase Auth
- **Paiements** : Stripe Connect
- **IA** : Groq API (analyse de bordereaux)
- **Email** : Resend + Gmail OAuth
- **Intégrations** : Google Sheets API, Gmail API, Google Drive API

### Ports utilisés
- **8080** : Frontend Vite (dev server)
- **5174** : Backend Express (API + proxies)

### Structure du projet
```
C:\Dev\SaaS MBE SDV/
├── front end/               # Application principale
│   ├── src/                 # Code source frontend
│   ├── server/              # Backend Express
│   │   ├── ai-proxy.js      # ⭐ Serveur principal (8575+ lignes)
│   │   ├── notifications.js # ⭐ Système de notifications
│   │   ├── stripe-connect.js
│   │   ├── shipmentGroups.js
│   │   └── shipping-rates.js
│   ├── scripts/             # Scripts utilitaires
│   │   └── dev-all.mjs      # Lance tous les serveurs
│   ├── .env.local           # ⚠️ Variables d'environnement (secrets)
│   ├── firebase-credentials.json  # ⚠️ Credentials Firebase
│   └── package.json
├── start-dev.bat            # ⭐ Script de démarrage Windows
├── start-dev.command        # Script de démarrage Mac
├── run-dev-mac.sh           # Script exécuté par start-dev.command
├── .gitignore               # Exclusions Git
└── Documentation/           # Nombreux fichiers .md
```

---

## 🔄 Système de Polling Automatique

### Gmail Polling (toutes les 5 minutes)
**Fonction** : `syncAllEmailAccounts()` dans `ai-proxy.js`

**Fonctionnement** :
1. Récupère tous les comptes SaaS avec `integrations.gmail.connected = true`
2. Pour chaque compte, utilise les tokens OAuth stockés dans Firestore
3. Appelle Gmail API pour récupérer l'historique depuis `lastHistoryId`
4. Traite les nouveaux messages :
   - Extrait expéditeur, sujet, corps
   - Cherche le devis correspondant par référence ou email client
   - Stocke le message dans `emailMessages` collection
   - Crée une notification si lié à un devis
5. Met à jour `lastHistoryId` et `lastSyncAt`

**En cas d'erreur 401 (token expiré)** :
- Déconnecte automatiquement : `integrations.gmail.connected = false`
- ⭐ Crée une notification système avec instructions de reconnexion

### Google Sheets Polling (toutes les 5 minutes)
**Fonction** : `syncAllGoogleSheets()` dans `ai-proxy.js`

**Fonctionnement** :
1. Récupère tous les comptes SaaS avec `integrations.googleSheets.connected = true`
2. Pour chaque compte, utilise les tokens OAuth stockés dans Firestore
3. Lit le Google Sheet depuis la dernière ligne importée (`lastRowImported`)
4. Parse chaque nouvelle ligne comme un devis :
   - Extrait : référence, client, adresse, description, etc.
   - Crée un document dans `quotes` collection
   - Recherche le bordereau correspondant dans Google Drive (optionnel)
5. Met à jour `lastRowImported` et `lastSyncAt`

**En cas d'erreur 401 (token expiré)** :
- Déconnecte automatiquement : `integrations.googleSheets.connected = false`
- ⭐ Crée une notification système avec instructions de reconnexion

---

## 🔔 Système de Notifications Automatiques (NOUVEAU)

### Types de notifications

```javascript
NOTIFICATION_TYPES = {
  NEW_MESSAGE: 'NEW_MESSAGE',           // Nouveau message client
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED', // Paiement reçu
  DEVIS_SENT: 'DEVIS_SENT',            // Devis envoyé
  DEVIS_PAID: 'DEVIS_PAID',            // Devis payé
  DEVIS_PARTIALLY_PAID: 'DEVIS_PARTIALLY_PAID', // Paiement partiel
  SURCOUT_CREATED: 'SURCOUT_CREATED',  // Surcoût créé
  SYSTEM: 'SYSTEM'                      // ⭐ NOUVEAU : Notifications système
};
```

### Notifications OAuth automatiques

#### Quand un token Gmail expire
**Déclenchement** : Erreur 401 lors du polling Gmail

**Notification créée** :
```javascript
{
  clientSaasId: 'y02DtERgj6YTmuipZ8jn', // ID du compte concerné
  devisId: null,                         // Pas de devis lié
  type: 'SYSTEM',
  title: '⚠️ Connexion Gmail expirée',
  message: 'Votre connexion Gmail a expiré et doit être renouvelée.\n\n' +
           '📋 Pour reconnecter Gmail :\n' +
           '1. Allez dans Paramètres > Intégrations\n' +
           '2. Cliquez sur "Se reconnecter à Gmail"\n' +
           '3. Autorisez l\'accès à votre compte Gmail\n\n' +
           '✅ Une fois reconnecté, la synchronisation automatique des emails reprendra.',
  createdAt: Timestamp.now()
}
```

#### Quand un token Google Sheets expire
**Déclenchement** : Erreur 401 lors du polling Google Sheets

**Notification créée** :
```javascript
{
  clientSaasId: 'y02DtERgj6YTmuipZ8jn',
  devisId: null,
  type: 'SYSTEM',
  title: '⚠️ Connexion Google Sheets expirée',
  message: 'Votre connexion Google Sheets a expiré et doit être renouvelée.\n\n' +
           '📋 Pour reconnecter Google Sheets :\n' +
           '1. Allez dans Paramètres > Intégrations\n' +
           '2. Cliquez sur "Resynchroniser" ou "Se reconnecter à Google Sheets"\n' +
           '3. Autorisez l\'accès à vos Google Sheets\n\n' +
           '✅ Une fois reconnecté, la synchronisation automatique des nouveaux devis reprendra.',
  createdAt: Timestamp.now()
}
```

### Avantages
✅ **Autonomie** : L'utilisateur SaaS est alerté immédiatement  
✅ **Clarté** : Instructions détaillées étape par étape  
✅ **Transparence** : L'utilisateur comprend pourquoi le polling ne fonctionne plus  
✅ **Pas de support technique nécessaire**  

---

## 🗄️ Structure Firestore

### Collections principales

#### `saasAccounts`
Stocke les comptes clients SaaS avec leurs intégrations OAuth.

```javascript
{
  id: "y02DtERgj6YTmuipZ8jn",
  name: "MBE Client Name",
  integrations: {
    gmail: {
      connected: true,              // false si expiré
      emailAddress: "email@gmail.com",
      oauthTokens: {
        accessToken: "ya29...",
        refreshToken: "1//03...",
        expiresAt: Timestamp
      },
      lastHistoryId: "123456",
      lastSyncAt: Timestamp,
      connectedAt: Timestamp
    },
    googleSheets: {
      connected: true,              // false si expiré
      spreadsheetId: "1ABC...",
      spreadsheetName: "Devis MBE",
      oauthTokens: {
        accessToken: "ya29...",
        refreshToken: "1//03...",
        expiresAt: Timestamp
      },
      lastRowImported: 17,
      lastSyncAt: Timestamp,
      connectedAt: Timestamp
    },
    googleDrive: {
      connected: true,
      bordereauxFolderId: "1XYZ...",
      bordereauxFolderName: "Bordereaux",
      oauthTokens: { ... }
    }
  }
}
```

#### `notifications`
Stocke toutes les notifications (incluant les nouvelles notifications OAuth).

```javascript
{
  id: "notification_id",
  clientSaasId: "y02DtERgj6YTmuipZ8jn", // Lien au compte SaaS
  devisId: "devis_id" | null,            // null pour notifications système
  type: "SYSTEM" | "NEW_MESSAGE" | ...,
  title: "⚠️ Connexion Gmail expirée",
  message: "Instructions détaillées...",
  createdAt: Timestamp,
  read: false                             // Marquée comme lue par l'utilisateur
}
```

#### `quotes`
Devis créés automatiquement depuis Google Sheets ou manuellement.

#### `emailMessages`
Messages emails synchronisés depuis Gmail, liés aux devis.

---

## 🔐 OAuth Configuration

### Google Cloud Console
**Projet** : Configuration OAuth pour Gmail, Google Sheets, Google Drive

**Credentials OAuth 2.0** :
- **Gmail** : `240226168402-qp4unvbqcr3ioscugn535j4njcd69g1p.apps.googleusercontent.com`
- **Google Sheets** : `240226168402-8ca0uet3e54pdk25627rohj59n29udgd.apps.googleusercontent.com`

**Redirect URIs autorisés** :
- `http://localhost:5174/auth/gmail/callback`
- `http://localhost:5174/auth/google-sheets/callback`
- `http://localhost:5174/auth/google-drive/callback`

**Scopes requis** :
- **Gmail** : `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/userinfo.email`
- **Google Sheets** : `https://www.googleapis.com/auth/spreadsheets.readonly`, `https://www.googleapis.com/auth/drive.readonly`
- **Google Drive** : `https://www.googleapis.com/auth/drive.readonly`

### Flux OAuth
1. **Utilisateur clique** "Connecter Gmail/Sheets" dans l'interface
2. **Frontend** appelle `/auth/gmail/start` (avec header Authorization)
3. **Backend** génère l'URL OAuth avec `saasAccountId` dans le state
4. **Utilisateur** autorise l'accès sur Google
5. **Google** redirige vers `/auth/gmail/callback?code=...&state=saasAccountId`
6. **Backend** échange le code contre des tokens OAuth
7. **Tokens stockés** dans Firestore : `saasAccounts/{id}/integrations/gmail`
8. **Polling activé** : Le serveur utilise ces tokens pour synchroniser

### Expiration et renouvellement
- **Access tokens** : Expirent après 1 heure
- **Refresh tokens** : Utilisés pour obtenir de nouveaux access tokens
- **Expiration refresh token** : Après plusieurs semaines/mois ou si révoqué manuellement
- **Détection d'expiration** : Erreur 401 lors des appels API
- **Action automatique** : Déconnexion + notification créée

---

## 🧪 Flux de test

### Tester les nouvelles demandes de devis

#### Depuis Google Sheets
1. Ouvrez le Google Sheet configuré
2. Ajoutez une nouvelle ligne avec les infos du devis
3. Attendez maximum 5 minutes (polling)
4. Le devis apparaît dans l'application

#### Depuis Gmail
1. Envoyez un email à l'adresse configurée
2. Attendez maximum 5 minutes (polling)
3. Le message apparaît lié au devis (si référence trouvée)

### Tester l'expiration OAuth
1. Dans Firebase Console, modifiez manuellement `integrations.gmail.connected = false`
2. Attendez le prochain cycle de polling (max 5 min)
3. Une erreur 401 sera détectée
4. ⭐ Une notification système sera créée automatiquement
5. Vérifiez que la notification apparaît dans l'interface

---

## 🛠️ Commandes Git utiles

### Vérifier le statut
```bash
git status
git log --oneline -5
git remote -v
```

### Commiter des changements
```bash
git add .
git commit -m "Description des changements"
git push origin master
```

### Voir l'historique
```bash
git log --graph --oneline --all
git show HEAD
```

---

## 📊 Monitoring et Logs

### Logs serveur
**Emplacement** : Terminal PowerShell/CMD ouvert par `start-dev.bat`

**Messages importants à surveiller** :

✅ **Tout va bien** :
```
[Gmail OAuth] ✅ OAuth2 client initialisé
[Google Sheets OAuth] ✅ OAuth2 client initialisé
[Gmail Sync] ✅ Polling Gmail activé (toutes les 5 minutes)
[Google Sheets Sync] ✅ Polling Google Sheets activé (toutes les 5 minutes)
[Gmail Sync] ✅ Synchronisation de X compte(s) SaaS avec Gmail terminée
[Google Sheets Sync] ✅ Synchronisation terminée
```

⚠️ **Token expiré (normal)** :
```
[Gmail Sync] Erreur: GaxiosError: invalid_grant
error_description: 'Token has been expired or revoked.'
[Gmail Sync] ⚠️  Gmail déconnecté (token expiré)
[Gmail Sync] 🔔 Notification de déconnexion créée
```

❌ **Problème de configuration** :
```
[Gmail OAuth] ⚠️  GMAIL_CLIENT_ID ou GMAIL_CLIENT_SECRET manquant
[Gmail Sync] ⚠️  Polling Gmail désactivé
```
→ Vérifier le fichier `.env.local`

### Logs frontend
**Emplacement** : Console du navigateur (F12)

**Messages importants** :
```javascript
[pricing] ✅ 9 zone(s) chargée(s) avec succès
[App] ✅ 35 prix de carton(s) chargé(s) avec succès
[firebase] env status Object
```

---

## 🔧 Configuration multi-plateforme

### Différences Mac/Windows

| Configuration | Mac | Windows |
|---------------|-----|---------|
| **Script de démarrage** | `start-dev.command` | `start-dev.bat` |
| **Shell** | Bash | PowerShell/CMD |
| **Séparateur de chemin** | `/` | `\` |
| **Fin de ligne** | LF | CRLF |
| **GitHub CLI** | `gh` | `"C:\Program Files\GitHub CLI\gh.exe"` |
| **Ouverture navigateur** | `open` | `Start-Process` |
| **Processus** | `ps` | `netstat -ano` |

### Synchronisation
Les deux environnements partagent :
- ✅ Même code source
- ✅ Mêmes variables `.env.local`
- ✅ Même Firebase project
- ✅ Mêmes credentials OAuth
- ✅ Même repository GitHub

**Fichiers spécifiques à chaque plateforme** :
- Mac : `start-dev.command`, `run-dev-mac.sh`, `CREATE_FIRESTORE_INDEX.sh`
- Windows : `start-dev.bat`

---

## 📦 Dépendances importantes

### Frontend
```json
{
  "react": "^18.3.1",
  "react-router-dom": "^6.30.1",
  "firebase": "^12.6.0",
  "stripe": "^16.12.0",
  "@tanstack/react-query": "^5.83.0",
  "tailwindcss": "^3.4.17",
  "vite": "^5.4.19"
}
```

### Backend
```json
{
  "express": "^5.2.1",
  "firebase-admin": "^12.0.0",
  "googleapis": "^170.0.0",
  "stripe": "^16.12.0",
  "nodemailer": "^7.0.11",
  "resend": "^6.6.0",
  "tesseract.js": "^6.0.1",
  "sharp": "^0.34.3",
  "dotenv": "^17.2.3"
}
```

---

## 🎨 Fonctionnalités principales

### 1. Gestion des devis
- Création automatique depuis Google Sheets
- Création manuelle
- Statuts : Nouveau, En préparation, Envoyé, Payé, Collecté, Expédié
- Timeline détaillée
- Pièces jointes (bordereaux d'enchères)

### 2. Analyse IA de bordereaux
- Upload PDF/Image de bordereau
- Analyse OCR avec Tesseract.js
- Analyse intelligente avec Groq API (llama-3.3-70b)
- Extraction automatique : numéros de lots, prix, descriptions
- Association automatique aux lignes du devis

### 3. Calcul automatique d'expédition
- 9 zones géographiques (A à H)
- Tarifs par poids (1kg à 40kg+)
- Mode Express disponible
- Source : Google Sheets publié (CSV)
- Cache local pour performance

### 4. Système d'emballages
- 35+ types de cartons prédéfinis
- Calcul automatique du carton optimal selon dimensions
- Prix dynamiques depuis Google Sheets
- Suggestion automatique

### 5. Paiements Stripe Connect
- Paiements directs par carte
- Multi-paiements (plusieurs paiements pour un devis)
- Surcoûts après estimation
- Webhooks pour synchronisation
- Dashboard Stripe intégré

### 6. Emails automatiques
- Envoi de devis au client
- Email de collecte avec instructions
- Templates personnalisés
- Provider : Resend (devis@mbe-sdv.fr)

### 7. Groupement d'expéditions
- Regroupement intelligent de plusieurs devis
- Économies sur les frais d'expédition
- Paiement groupé
- Suivi unifié

### 8. Notifications en temps réel
- Nouveaux messages clients
- Paiements reçus
- Devis envoyés/payés
- ⭐ Expirations OAuth (nouveau)
- Badge avec compteur
- Drawer latéral

---

## 🔒 Sécurité et bonnes pratiques

### Variables sensibles
**NE JAMAIS COMMITER** :
- `.env.local` : Tous les secrets API
- `firebase-credentials.json` : Credentials Firebase Admin
- Tout fichier `*-credentials.json`

**Protection GitHub** : Push Protection activée automatiquement

### Tokens OAuth
- Stockés dans Firestore (côté serveur)
- Jamais exposés au frontend
- Refresh automatique des access tokens
- Expiration détectée et notifiée
- Déconnexion automatique en cas d'expiration

### API Keys
- Variables d'environnement uniquement
- Proxy backend pour sécuriser les appels
- Pas d'exposition des clés au frontend

---

## 🚀 Déploiement

### Environnement de développement
- **Windows** : `start-dev.bat`
- **Mac** : `start-dev.command`
- **Ports** : 8080 (frontend) + 5174 (backend)

### Environnement de production
- Firebase Hosting (frontend)
- Cloud Functions ou serveur Node.js (backend)
- Webhooks Stripe configurés
- Variables d'environnement en production

---

## 📚 Documentation disponible

### Guides principaux
- `README.md` : Documentation générale
- `START_HERE.md` : Guide de démarrage
- `DEMARRAGE_RAPIDE.md` : Démarrage rapide
- `GUIDE_WINDOWS.md` : ⭐ Guide spécifique Windows (nouveau)
- `CHANGELOG_WINDOWS_SETUP_2026-01-27.md` : ⭐ Détails des modifications (nouveau)

### Documentation technique
- `DOCUMENTATION.md` : Documentation complète
- `CONTEXTE_PROJET.md` : Contexte général
- `CONFIGURATION_COMPLETE.md` : Configuration détaillée

### Guides spécifiques
- `GMAIL_OAUTH_SETUP.md` : Configuration Gmail OAuth
- `GOOGLE_SHEETS_INTEGRATION.md` : Intégration Google Sheets
- `STRIPE_CONNECT_SETUP.md` : Configuration Stripe
- `FIRESTORE_RULES_SETUP.md` : Règles Firestore

---

## 🎓 Contexte assistant IA enrichi

### Modifications récentes à retenir

1. **Système de notifications OAuth automatiques**
   - Fichier : `front end/server/ai-proxy.js` + `notifications.js`
   - Lignes modifiées : ~5050-5070 (Gmail) + ~6607-6630 (Google Sheets)
   - Nouveau type : `NOTIFICATION_TYPES.SYSTEM`
   - Fonction : Alerte automatique + instructions de reconnexion

2. **Configuration Windows complète**
   - Fichier `.env.local` créé avec toutes les variables
   - Script `start-dev.bat` corrigé pour afficher le terminal
   - Dépendances npm installées (726 packages)
   - Tous les services fonctionnent à l'identique du Mac

3. **Repository GitHub configuré**
   - Repository créé : `SaaS-MBE-Dev-2.0`
   - GitHub CLI installé et authentifié
   - Premier push effectué avec nettoyage des secrets
   - `.gitignore` mis à jour

### Points clés pour l'assistant

**Quand l'utilisateur signale que les nouveaux devis n'apparaissent pas** :
1. ✅ Vérifier les logs pour `invalid_grant` ou `Token has been expired`
2. ✅ Expliquer que les tokens OAuth ont expiré (normal)
3. ✅ Guider vers Paramètres > Intégrations pour se reconnecter
4. ✅ Mentionner que les notifications système alertent automatiquement

**Quand l'utilisateur veut lancer l'application sur Windows** :
1. ✅ Double-clic sur `start-dev.bat`
2. ✅ Ou `npm run dev:all` dans `front end/`
3. ✅ URL : http://localhost:8080
4. ✅ Ne pas fermer le terminal

**Quand l'utilisateur voit des erreurs dans les logs** :
1. ✅ Stripe CLI ENOENT : Non critique, optionnel
2. ✅ `invalid_grant` : Token expiré, se reconnecter
3. ✅ Port occupé : Arrêter les processus Node orphelins
4. ✅ Polling désactivé : Vérifier `.env.local`

---

## 🔄 Workflow de développement

### Cycle typique
1. Lancer `start-dev.bat`
2. Terminal s'ouvre avec logs
3. Navigateur s'ouvre sur http://localhost:8080
4. Modifier le code (hot reload automatique)
5. Tester les fonctionnalités
6. Commiter les changements
7. Pusher sur GitHub

### Avant de commiter
```bash
# Vérifier les fichiers modifiés
git status

# Vérifier qu'aucun secret n'est présent
git diff

# Ajouter les fichiers
git add .

# Commiter
git commit -m "Description"

# Pusher
git push origin master
```

---

## 🎯 Prochaines étapes suggérées

### Immédiat
- [ ] Reconnecter Gmail OAuth depuis l'interface
- [ ] Reconnecter Google Sheets OAuth depuis l'interface
- [ ] Tester la réception d'un nouveau devis

### Court terme
- [ ] Installer Stripe CLI sur Windows (optionnel)
- [ ] Créer des tests automatiques
- [ ] Ajouter une notification Google Drive OAuth expirée

### Moyen terme
- [ ] Améliorer le système de refresh automatique des tokens
- [ ] Dashboard de monitoring des intégrations
- [ ] Logs persistants dans fichiers

---

**Date de création** : 27/01/2026  
**Dernière mise à jour** : 27/01/2026  
**Validé sur** : Windows 10 Build 26100
