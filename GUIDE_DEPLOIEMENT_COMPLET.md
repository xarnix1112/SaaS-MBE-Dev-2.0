# 🚀 Guide de Déploiement Complet - Étape par Étape

**Pour débutants - Aucune connaissance préalable requise**

---

## 📋 Table des Matières

- [Avant de Commencer](#avant-de-commencer)
- [PARTIE 1 : Préparation](#partie-1--préparation-1h)
- [PARTIE 2 : Firebase Production](#partie-2--firebase-production-45-min)
- [PARTIE 3 : Stripe Mode Live](#partie-3--stripe-mode-live-30-min)
- [PARTIE 4 : Google Cloud (OAuth)](#partie-4--google-cloud-oauth-30-min)
- [PARTIE 5 : Hébergement Backend](#partie-5--hébergement-backend-railway-45-min)
- [PARTIE 6 : Hébergement Frontend](#partie-6--hébergement-frontend-vercel-30-min)
- [PARTIE 7 : Configuration Domaine](#partie-7--configuration-domaine-30-min)
- [PARTIE 8 : Tests Finaux](#partie-8--tests-finaux-45-min)
- [PARTIE 9 : Mise en Ligne](#partie-9--mise-en-ligne-30-min)

---

## Avant de Commencer

### ✅ Ce dont vous avez besoin

- [ ] Un ordinateur avec accès internet
- [ ] Le projet cloné sur votre machine
- [ ] Git installé
- [ ] Node.js installé (version 18+)
- [ ] Un compte Google (pour Firebase)
- [ ] Un compte Stripe (gratuit)
- [ ] Un domaine acheté (ex: Namecheap, OVH)
- [ ] 3-4 heures de temps disponible

### 💰 Budget Nécessaire

| Service | Coût |
|---------|------|<>
| Domaine (.com) | ~10-15€/an |
| Vercel (Frontend) | Gratuit |
| Railway (Backend) | 5$/mois |
| Firebase | Gratuit jusqu'à utilisation importante |
| **TOTAL PREMIÈRE ANNÉE** | **~75€** |

### 📝 Informations à Préparer

Créez un document texte et notez au fur et à mesure :

```
=== MES INFORMATIONS DE PRODUCTION ===

MON DOMAINE: _______________________
(ex: mon-saas-mbe.com)

FIREBASE PRODUCTION:
- Project ID: _______________________
- API Key: _______________________

STRIPE LIVE:
- Clé secrète: sk_live_________________
- Clé publique: pk_live_________________
- Webhook Secret: whsec_________________

RAILWAY:
- URL Backend: _______________________

VERCEL:
- URL Frontend: _______________________
```

---

## PARTIE 1 : Préparation (1h)

### Étape 1.1 : Backup Complet ⚠️ CRITIQUE

**Pourquoi ?** Pour ne rien perdre si quelque chose ne marche pas.

**Comment faire :**

1. **Ouvrir la console Firebase :**
   ```
   https://console.firebase.google.com
   ```

2. **Sélectionner votre projet de développement :**
   - Cliquer sur le projet `sdv-automation-mbe`

3. **Exporter Firestore :**  
   L’export **ne se fait pas** depuis la console Firebase (onglet Données). Il faut utiliser la **Google Cloud Console** ou la ligne de commande.

   **Important — Voir sa base Firestore dans la Google Cloud Console :**  
   Un projet Firebase **est** un projet Google Cloud (même **Project ID**). Si vous ne voyez aucune base sur la page Firestore de GCP :
   - **Vérifier le projet affiché** : en haut à gauche de la Google Cloud Console, cliquer sur le sélecteur de projet (nom du projet actuel).
   - Ouvrir l’onglet **« TOUS »** (ou « All ») pour afficher tous les projets, pas seulement les récents.
   - Choisir le projet dont le **nom** ou l’**ID** correspond à votre projet Firebase (ex. `SDV-Automation-MBE` ou `sdv-automation-mbe`).
   - **Récupérer l’ID du projet** : dans la [console Firebase](https://console.firebase.google.com) → ⚙️ **Paramètres du projet** → sous « Vos applications », noter le **Project ID**.
   - **Lien direct** (remplacer `VOTRE_PROJECT_ID` par l’ID ci‑dessus) :  
     `https://console.cloud.google.com/firestore/databases?project=sdv-automation-mbe`  
     Ex. : `https://console.cloud.google.com/firestore/databases?project=sdv-automation-mbe`
   - Utiliser **le même compte Google** que dans Firebase. Si le projet n’apparaît pas dans la liste GCP, vérifier les filtres (organisation / « Aucune organisation »).

   **Option A — Google Cloud Console (recommandé) :**
   - Ouvrir : [Google Cloud Console → Firestore → Bases de données](https://console.cloud.google.com/firestore/databases) (ou le lien direct avec `?project=VOTRE_PROJECT_ID` ci‑dessus).
   - S’assurer que le **bon projet** est sélectionné (voir encadré ci‑dessus si la liste des bases est vide).
   - Dans la liste, cliquer sur la base **« (default) »** (ou celle utilisée par votre app).
   - Dans le **menu de gauche** de la page Firestore, cliquer sur **Import/Export** (pas sur « Données »).
   - Cliquer sur **Export**
   - Choisir **Export entire database** (Exporter toute la base).
   - Dans **Choose Destination**, indiquer un **bucket Cloud Storage** (ex. `votre-projet.appspot.com` ou un bucket dédié backups). Créer un bucket dans la même région que Firestore si besoin.
   - Cliquer sur **Export**
   - ⏱️ Attendre 5–10 minutes (suivi sur la même page Import/Export).
   - 📥 Le backup sera dans le bucket Cloud Storage choisi.

   **Option B — Ligne de commande (gcloud) :**
   ```bash
   gcloud firestore export gs://NOM_DU_BUCKET/backups/firestore-export --database="(default)"
   ```
   Remplacer `NOM_DU_BUCKET` par un bucket existant (même projet, facturation activée / plan Blaze pour les projets Firebase).

   **Prérequis :** projet sur le **plan Blaze** (facturation activée) et bucket Cloud Storage créé.

4. **Prendre une capture d'écran** de la page Firestore **Import/Export** une fois l’export lancé (pour référence).

**✅ Validation :** Sur la page **Import/Export** de la Google Cloud Console, une nouvelle opération « Export » apparaît et passe à « Completed » après quelques minutes.

---

### Étape 1.2 : Créer un Dossier de Production

**Sur votre ordinateur :**

```bash
# Windows (PowerShell)
cd C:\Dev
New-Item -ItemType Directory -Name "SaaS MBE SDV Production"
cd "SaaS MBE SDV Production"

# macOS/Linux
cd ~/Documents
mkdir "SaaS MBE SDV Production"
cd "SaaS MBE SDV Production"
```

**Créer un fichier de notes :**

```bash
# Windows
notepad NOTES_DEPLOIEMENT.txt

# macOS
open -e NOTES_DEPLOIEMENT.txt

# Linux
nano NOTES_DEPLOIEMENT.txt
```

**✅ Validation :** Vous avez un dossier vide pour noter toutes les informations.

---

### Étape 1.3 : Vérifier les Outils Installés

**Ouvrir un terminal et tester :**

```bash
# Vérifier Node.js (doit être 18+)
node --version
# Résultat attendu : v18.x.x ou v20.x.x ou plus

# Vérifier npm
npm --version
# Résultat attendu : 9.x.x ou 10.x.x

# Vérifier Git
git --version
# Résultat attendu : git version 2.x.x
```

**Si une commande échoue :**

- **Node.js manquant** : Télécharger sur https://nodejs.org (version LTS)
- **Git manquant** : Télécharger sur https://git-scm.com

**✅ Validation :** Les 3 commandes affichent un numéro de version.

---

### Étape 1.4 : Cloner le Projet (si pas déjà fait)

```bash
cd C:\Dev  # ou ~/Documents sur Mac/Linux

git clone https://github.com/xarnix1112/SaaS-MBE-Dev-2.0.git "SaaS MBE SDV Prod"
cd "SaaS MBE SDV Prod"
```

**✅ Validation :** Vous voyez tous les fichiers du projet.

---

## PARTIE 2 : Firebase Production (45 min)

### Étape 2.1 : Créer un Nouveau Projet Firebase

⚠️ **IMPORTANT :** NE PAS utiliser le projet de développement !

**Étapes détaillées :**

1. **Aller sur Firebase :**
   ```
   https://console.firebase.google.com
   ```

2. **Cliquer sur "Add project" (Ajouter un projet)**

3. **Nom du projet :**
   ```
   saas-mbe-sdv-production
   ```
   ✏️ Notez ce nom dans votre fichier NOTES_DEPLOIEMENT.txt

4. **Google Analytics :**
   - Désactiver pour l'instant (vous pourrez l'activer plus tard)
   - Cliquer **"Create project"**
   - ⏱️ Attendre 30 secondes

5. **Cliquer "Continue" quand le projet est créé**

**✅ Validation :** Vous êtes sur la page d'accueil du projet `saas-mbe-sdv-production`.

---

### Étape 2.2 : Configurer Firebase Authentication

1. **Menu de gauche → "Authentication"**

2. **Cliquer "Get started"**

3. **Activer "Email/Password" :**
   - Cliquer sur "Email/Password"
   - Toggle **"Enable"** → ON
   - Cliquer **"Save"**

4. **Activer "Google" :**
   - Cliquer sur "Google"
   - Toggle **"Enable"** → ON
   - Project support email → Sélectionner votre email
   - Cliquer **"Save"**

**✅ Validation :** Les deux méthodes affichent "Enabled" en vert.

---

### Étape 2.3 : Configurer Firestore Database

1. **Menu de gauche → "Firestore Database"**

2. **Cliquer "Create database"**

3. **Mode :**
   - Sélectionner **"Start in production mode"**
   - Cliquer **"Next"**

4. **Location :**
   - Choisir **"europe-west1 (Belgique)"** (plus proche de la France)
   - Cliquer **"Enable"**
   - ⏱️ Attendre 1-2 minutes

**✅ Validation :** Vous voyez la page Firestore Database vide.

---

### Étape 2.4 : Déployer les Règles de Sécurité

**⚠️ CRITIQUE :** Sans règles strictes, n'importe qui peut accéder à vos données !

1. **Retourner dans votre projet sur votre ordinateur**

2. **Ouvrir le fichier `firestore.rules` avec un éditeur de texte**

3. **Copier le contenu suivant et le coller dans `firestore.rules` :**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Fonction helper pour récupérer le saasAccountId de l'utilisateur
    function getUserSaasAccountId() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.saasAccountId;
    }
    
    // Vérifier que l'utilisateur est authentifié
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Collection users (profils utilisateurs)
    match /users/{userId} {
      allow read, write: if isAuthenticated() && request.auth.uid == userId;
    }
    
    // Collection saasAccounts (comptes SaaS)
    match /saasAccounts/{accountId} {
      allow read, write: if isAuthenticated() && getUserSaasAccountId() == accountId;
    }
    
    // Collection quotes (devis)
    match /quotes/{quoteId} {
      allow read, write: if isAuthenticated() && resource.data.saasAccountId == getUserSaasAccountId();
      allow create: if isAuthenticated();
    }
    
    // Collection notifications
    match /notifications/{notificationId} {
      allow read, delete: if isAuthenticated() && resource.data.clientSaasId == getUserSaasAccountId();
      allow create: if false; // Seulement via backend
    }
    
    // Collection paiements
    match /paiements/{paiementId} {
      allow read: if isAuthenticated() && resource.data.clientSaasId == getUserSaasAccountId();
      allow write: if false; // Seulement via backend
    }
    
    // Collection emailMessages
    match /emailMessages/{messageId} {
      allow read, write: if isAuthenticated() && resource.data.saasAccountId == getUserSaasAccountId();
    }
    
    // Collection cartons
    match /cartons/{cartonId} {
      allow read, write: if isAuthenticated() && resource.data.saasAccountId == getUserSaasAccountId();
    }
    
    // Collection bordereaux
    match /bordereaux/{bordereauId} {
      allow read, write: if isAuthenticated() && resource.data.saasAccountId == getUserSaasAccountId();
    }
    
    // Collection shippingZones
    match /shippingZones/{zoneId} {
      allow read, write: if isAuthenticated() && resource.data.saasAccountId == getUserSaasAccountId();
    }
    
    // Collection shippingServices
    match /shippingServices/{serviceId} {
      allow read, write: if isAuthenticated() && resource.data.saasAccountId == getUserSaasAccountId();
    }
    
    // Collection shippingRates
    match /shippingRates/{rateId} {
      allow read, write: if isAuthenticated() && resource.data.saasAccountId == getUserSaasAccountId();
    }
    
    // Collection shipmentGroups
    match /shipmentGroups/{groupId} {
      allow read, write: if isAuthenticated() && resource.data.saasAccountId == getUserSaasAccountId();
    }
  }
}
```

4. **Sauvegarder le fichier**

5. **Installer Firebase CLI :**

```bash
# Windows/macOS/Linux
npm install -g firebase-tools

# Vérifier l'installation
firebase --version
# Résultat attendu : 13.x.x ou plus
```

6. **Se connecter à Firebase :**

```bash
firebase login
```
   - Une fenêtre de navigateur s'ouvre
   - Se connecter avec votre compte Google
   - Autoriser Firebase CLI
   - Retourner dans le terminal
   - Vous devriez voir : "✔ Success! Logged in as votre-email@gmail.com"

7. **Initialiser Firebase dans le projet :**

```bash
cd "C:\Dev\SaaS MBE SDV Prod"  # Ou le chemin de votre projet

firebase init firestore
```

   - **? Select a project:** Choisir **"saas-mbe-sdv-production"**
   - **? What file should be used for Firestore Rules?** → Appuyer sur Entrée (garder `firestore.rules`)
   - **? What file should be used for Firestore indexes?** → Appuyer sur Entrée (garder `firestore.indexes.json`)
   - **? File firestore.rules already exists. Overwrite?** → Taper `N` (Non)
   - **? File firestore.indexes.json already exists. Overwrite?** → Taper `N` (Non)

8. **Déployer les règles :**

```bash
firebase deploy --only firestore:rules --project saas-mbe-sdv-production
```

   - Attendre quelques secondes
   - Vous devriez voir : "✔ Deploy complete!"

**✅ Validation :** Dans la console Firebase, allez dans Firestore Database → Rules, vous devez voir les nouvelles règles.

---

### Étape 2.5 : Créer les Index Firestore

**Pourquoi ?** Pour que les requêtes complexes fonctionnent.

1. **Dans la console Firebase, aller dans Firestore Database**

2. **Cliquer sur l'onglet "Indexes"**

3. **Créer 3 index composites :**

**Index 1 : Notifications**
   - Cliquer **"Create index"**
   - **Collection ID** : `notifications`
   - **Fields to index** :
     - Field path: `clientSaasId`, Order: `Ascending`
     - Cliquer **"Add field"**
     - Field path: `createdAt`, Order: `Descending`
   - **Query scopes** : Collection
   - Cliquer **"Create"**
   - ⏱️ Attendre 2-3 minutes ("Building...")

**Index 2 : Quotes**
   - Cliquer **"Create index"**
   - **Collection ID** : `quotes`
   - **Fields to index** :
     - Field path: `saasAccountId`, Order: `Ascending`
     - Cliquer **"Add field"**
     - Field path: `createdAt`, Order: `Descending`
   - **Query scopes** : Collection
   - Cliquer **"Create"**
   - ⏱️ Attendre 2-3 minutes

**Index 3 : Paiements**
   - Cliquer **"Create index"**
   - **Collection ID** : `paiements`
   - **Fields to index** :
     - Field path: `clientSaasId`, Order: `Ascending`
     - Cliquer **"Add field"**
     - Field path: `status`, Order: `Ascending`
   - **Query scopes** : Collection
   - Cliquer **"Create"**
   - ⏱️ Attendre 2-3 minutes

**✅ Validation :** Les 3 index affichent un point vert "Enabled".

---

### Étape 2.6 : Récupérer les Clés Firebase

1. **Dans la console Firebase, cliquer sur l'icône ⚙️ (Settings) en haut à gauche**

2. **Cliquer sur "Project settings"**

3. **Descendre jusqu'à "Your apps"**

4. **Cliquer sur l'icône web `</>`** ("Add app")

5. **Configuration :**
   - **App nickname** : `SaaS MBE SDV Production Web`
   - ☐ Ne PAS cocher "Firebase Hosting"
   - Cliquer **"Register app"**

6. **Copier la configuration :**

```javascript
const firebaseConfig = {
  apiKey: "AIza....", // ← COPIER CETTE VALEUR
  authDomain: "saas-mbe-sdv-production.firebaseapp.com",
  projectId: "saas-mbe-sdv-production",
  storageBucket: "saas-mbe-sdv-production.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```

7. **Coller ces valeurs dans votre fichier NOTES_DEPLOIEMENT.txt**

8. **Cliquer "Continue to console"**

**✅ Validation :** Vous avez 6 valeurs Firebase dans vos notes.

---

### Étape 2.7 : Générer les Clés Admin SDK

**Pourquoi ?** Le backend a besoin de ces clés pour accéder à Firestore.

1. **Toujours dans "Project settings"**

2. **Cliquer sur l'onglet "Service accounts"**

3. **Cliquer sur "Generate new private key"**

4. **Popup de confirmation → Cliquer "Generate key"**

5. **Un fichier JSON se télécharge automatiquement**
   - Nom : `saas-mbe-sdv-production-firebase-adminsdk-xxxxx.json`

6. **Renommer ce fichier en :**
   ```
   firebase-credentials-prod.json
   ```

7. **⚠️ NE PAS commiter ce fichier sur Git !**

8. **Le déplacer dans un endroit sûr** (ex: votre dossier "SaaS MBE SDV Production")

**✅ Validation :** Vous avez un fichier JSON avec des clés dedans.

---

## PARTIE 3 : Stripe Mode Live (30 min)

### Étape 3.1 : Activer votre Compte Stripe

⚠️ **IMPORTANT :** Vous devez activer votre compte avant de passer en mode Live.

1. **Aller sur https://dashboard.stripe.com**

2. **Se connecter avec votre compte Stripe**

3. **En haut à gauche, vérifier que vous êtes en "Test mode"**

4. **Cliquer sur le nom de votre compte (en haut à droite)**

5. **Cliquer sur "Complete account setup"** (ou "Activer le compte")

6. **Remplir les informations demandées :**
   - Type d'entreprise (Auto-entrepreneur / Société)
   - Informations personnelles
   - Informations bancaires (pour recevoir les paiements)
   - Pièces d'identité (KYC)

7. **Soumettre pour vérification**
   - ⏱️ La vérification peut prendre 24-48h
   - Vous recevrez un email quand c'est validé

**✅ Validation :** Vous voyez un message "Account activation pending" ou "Account activated".

---

### Étape 3.2 : Passer en Mode Live

**⚠️ Attendre que votre compte soit activé avant cette étape !**

1. **En haut à droite du dashboard Stripe, cliquer sur le toggle "Test mode"**

2. **Basculer sur "Live mode"** (🔴 devient vert)

3. **Vous voyez maintenant les données de production (vides pour l'instant)**

**✅ Validation :** Le toggle en haut dit "Live mode" et est vert.

---

### Étape 3.3 : Récupérer les Clés Live

1. **Menu de gauche → "Developers" → "API keys"**

2. **Vous voyez deux clés :**
   - **Publishable key** : `pk_live_...`
   - **Secret key** : `sk_live_...` (cliquer sur "Reveal live key")

3. **⚠️ COPIER ces deux clés dans NOTES_DEPLOIEMENT.txt**

```
STRIPE LIVE:
- Publishable key (publique): pk_live_XXXXXXXXXXXX (remplacer par votre vraie clé)
- Secret key (secrète): sk_live_XXXXXXXXXXXX (remplacer par votre vraie clé)
```

**✅ Validation :** Vous avez les deux clés qui commencent par `pk_live_` et `sk_live_`.

---

### Étape 3.4 : Configurer Stripe Connect

**Pourquoi ?** Pour que vos clients puissent connecter leur propre compte Stripe.

1. **Menu de gauche → "Connect" → "Settings"**

2. **Section "Branding" :**
   - **Business name** : `SaaS MBE SDV`
   - **Icon** : Uploader votre logo (optionnel)
   - **Color** : Choisir une couleur (ex: #667eea)
   - Cliquer **"Save"**

3. **Section "Integration" :**
   - Cliquer sur **"OAuth settings"**

4. **Redirect URLs :**
   - Cliquer **"+ Add URI"**
   - Ajouter : `https://api.votre-domaine.com/stripe/callback`
     (Remplacer `votre-domaine.com` par votre vrai domaine)
   - Cliquer **"Add"**

5. **Copier le "Client ID" :**
   - Vous voyez : `ca_XXXXXXXXXXXXXXXXX`
   - ⚠️ Copier dans NOTES_DEPLOIEMENT.txt

```
STRIPE CONNECT:
- Client ID: ca_XXXXXXXXXXXXXXXXX
```

**✅ Validation :** Vous avez le Client ID qui commence par `ca_`.

---

### Étape 3.5 : Créer un Webhook de Production

**Pourquoi ?** Pour recevoir les notifications de paiement en temps réel.

1. **Menu de gauche → "Developers" → "Webhooks"**

2. **Cliquer "Add endpoint"**

3. **Configuration :**
   - **Endpoint URL** : `https://api.votre-domaine.com/webhooks/stripe`
     (Remplacer `votre-domaine.com` par votre vrai domaine)
   - **Description** : `Production Webhook`
   - **Events to send** : Cliquer sur "Select events"

4. **Sélectionner ces événements :**
   - ☑️ `checkout.session.completed`
   - ☑️ `payment_intent.succeeded`
   - ☑️ `payment_intent.payment_failed`
   - ☑️ `charge.succeeded`
   - Cliquer **"Add events"**

5. **Cliquer "Add endpoint"**

6. **Copier le "Signing secret" :**
   - Cliquer sur le webhook que vous venez de créer
   - Dans la section "Signing secret", cliquer **"Reveal"**
   - Vous voyez : `whsec_XXXXXXXXXXXXXXXXX`
   - ⚠️ Copier dans NOTES_DEPLOIEMENT.txt

```
STRIPE WEBHOOK:
- Signing secret: whsec_XXXXXXXXXXXXXXXXX
```

**⚠️ Note :** L'endpoint ne fonctionnera qu'une fois votre backend déployé (plus tard).

**✅ Validation :** Le webhook est créé avec le statut "Not yet tested".

---

## PARTIE 4 : Google Cloud (OAuth) (30 min)

### Étape 4.1 : Créer un Projet Google Cloud

**Pourquoi ?** Pour OAuth Gmail, Google Sheets et Drive.

1. **Aller sur https://console.cloud.google.com**

2. **Cliquer sur le sélecteur de projet** (en haut, à côté de "Google Cloud")

3. **Cliquer "NEW PROJECT"**

4. **Configuration :**
   - **Project name** : `SaaS MBE SDV Production`
   - **Organization** : Laisser par défaut
   - Cliquer **"CREATE"**
   - ⏱️ Attendre 30 secondes

5. **Sélectionner le nouveau projet** (dans le sélecteur en haut)

**✅ Validation :** En haut, vous voyez "SaaS MBE SDV Production" comme projet actif.

---

### Étape 4.2 : Activer les APIs Nécessaires

1. **Menu hamburger (☰) → "APIs & Services" → "Library"**

2. **Rechercher et activer :**

**API 1 : Gmail API**
   - Rechercher : `Gmail API`
   - Cliquer dessus
   - Cliquer **"ENABLE"**
   - ⏱️ Attendre quelques secondes

**API 2 : Google Sheets API**
   - Revenir sur "Library"
   - Rechercher : `Google Sheets API`
   - Cliquer dessus
   - Cliquer **"ENABLE"**

**API 3 : Google Drive API**
   - Revenir sur "Library"
   - Rechercher : `Google Drive API`
   - Cliquer dessus
   - Cliquer **"ENABLE"**

**✅ Validation :** Les 3 APIs sont activées (vous les voyez dans "Enabled APIs & services").

---

### Étape 4.3 : Configurer l'Écran de Consentement OAuth

1. **Menu de gauche → "OAuth consent screen"**

2. **User Type :**
   - Sélectionner **"External"**
   - Cliquer **"CREATE"**

3. **Page 1 - App information :**
   - **App name** : `SaaS MBE SDV`
   - **User support email** : Votre email
   - **App logo** : Optionnel (vous pouvez passer)
   - **App domain** - Application home page : `https://votre-domaine.com`
   - **App domain** - Privacy policy : `https://votre-domaine.com/privacy` (créer cette page plus tard)
   - **App domain** - Terms of service : `https://votre-domaine.com/terms` (créer cette page plus tard)
   - **Authorized domains** : Cliquer "+ ADD DOMAIN", ajouter `votre-domaine.com`
   - **Developer contact** : Votre email
   - Cliquer **"SAVE AND CONTINUE"**

4. **Page 2 - Scopes :**
   - Cliquer **"ADD OR REMOVE SCOPES"**   
   - Rechercher et cocher :
     - ☑️ `.../auth/gmail.readonly`
     - ☑️ `.../auth/gmail.modify`
     - ☑️ `.../auth/spreadsheets`
     - ☑️ `.../auth/drive.metadata.readonly`
     - ☑️ `.../auth/drive.readonly`
   - Cliquer **"UPDATE"**
   - Cliquer **"SAVE AND CONTINUE"**

5. **Page 3 - Test users :**
   - Cliquer **"+ ADD USERS"**
   - Ajouter votre email (celui que vous utiliserez pour tester)
   - Cliquer **"ADD"**
   - Cliquer **"SAVE AND CONTINUE"**

6. **Page 4 - Summary :**
   - Vérifier que tout est OK
   - Cliquer **"BACK TO DASHBOARD"**

**✅ Validation :** Dans "OAuth consent screen", vous voyez "Publishing status: Testing".

---

### Étape 4.4 : Créer les Identifiants OAuth (Gmail)

1. **Menu de gauche → "Credentials"**

2. **Cliquer "+ CREATE CREDENTIALS" → "OAuth client ID"**

3. **Configuration :**
   - **Application type** : `Web application`
   - **Name** : `SaaS MBE SDV - Gmail Production`
   - **Authorized JavaScript origins** :
     - Cliquer **"+ Add URI"**
     - Ajouter : `https://api.votre-domaine.com`
   - **Authorized redirect URIs** :
     - Cliquer **"+ Add URI"**
     - Ajouter : `https://api.votre-domaine.com/auth/gmail/callback`
   - Cliquer **"CREATE"**

4. **Popup avec les credentials :**
   - **Client ID** : `XXXXX.apps.googleusercontent.com`
   - **Client secret** : `GOCSPX-XXXXX`
   - ⚠️ Copier ces deux valeurs dans NOTES_DEPLOIEMENT.txt

```
GMAIL OAUTH (Production):
- Client ID: XXXXX.apps.googleusercontent.com
- Client secret: GOCSPX-XXXXX
```

5. **Cliquer "OK"**

**✅ Validation :** Vous voyez les credentials dans la liste.

---

### Étape 4.5 : Créer les Identifiants OAuth (Google Sheets)

**Répéter l'étape 4.4 avec ces différences :**

1. **Cliquer "+ CREATE CREDENTIALS" → "OAuth client ID"**

2. **Configuration :**
   - **Application type** : `Web application`
   - **Name** : `SaaS MBE SDV - Sheets Production`
   - **Authorized JavaScript origins** :
     - `https://api.votre-domaine.com`
   - **Authorized redirect URIs** :
     - `https://api.votre-domaine.com/auth/google-sheets/callback`
   - Cliquer **"CREATE"**

3. **Copier les credentials dans NOTES_DEPLOIEMENT.txt :**

```
GOOGLE SHEETS OAUTH (Production):
- Client ID: XXXXX.apps.googleusercontent.com
- Client secret: GOCSPX-XXXXX
```

**✅ Validation :** Vous avez 2 OAuth clients dans la liste.

---

## PARTIE 5 : Hébergement Backend (Railway) (45 min)

### Étape 5.1 : Créer un Compte Railway

1. **Aller sur https://railway.app**

2. **Cliquer "Login"**

3. **Se connecter avec GitHub :**
   - Cliquer **"Login with GitHub"**
   - Autoriser Railway
   - Vous arrivez sur le dashboard Railway

**✅ Validation :** Vous voyez le dashboard vide de Railway.

---

### Étape 5.2 : Connecter Railway à GitHub

1. **Cliquer "New Project"**

2. **Sélectionner "Deploy from GitHub repo"**

3. **Autoriser Railway à accéder à GitHub :**
   - Cliquer **"Configure GitHub App"**
   - Sélectionner **"Only select repositories"**
   - Choisir `SaaS-MBE-Dev-2.0`
   - Cliquer **"Save"**

4. **Retourner sur Railway**

5. **Sélectionner le repo `SaaS-MBE-Dev-2.0`**

**✅ Validation :** Railway commence à déployer (vous voyez des logs).

---

### Étape 5.3 : Configurer le Déploiement

**⚠️ Le premier déploiement va échouer, c'est normal ! On va le configurer.**

1. **Cliquer sur le service déployé** (dans le dashboard Railway)

2. **Onglet "Settings"**

3. **Section "Root Directory" :**
   - Cliquer sur "Edit"
   - Entrer : `front end`
   - Cliquer **"Update"**

4. **Section "Start Command" :**
   - Cliquer sur "Edit"
   - Entrer : `node server/ai-proxy.js`
   - Cliquer **"Update"**

5. **Section "Custom Build Command" :**
   - Cliquer sur "Edit"
   - Entrer : `npm install`
   - Cliquer **"Update"**

**✅ Validation :** Les 3 configurations sont sauvegardées.

---

### Étape 5.4 : Ajouter les Variables d'Environnement

**⚠️ ÉTAPE CRITIQUE - Prenez votre temps !**

1. **Toujours dans "Settings", aller dans "Variables"**

2. **Cliquer "+ New Variable"**

3. **Ajouter TOUTES ces variables UNE PAR UNE :**

```env
NODE_ENV=production
PORT=5174

# Firebase (valeurs de la PARTIE 2)
# Option A — Recommandé sur Railway : une seule variable Base64 (évite les erreurs DECODER)
# FIREBASE_CREDENTIALS_BASE64=(générer avec PowerShell : [Convert]::ToBase64String([IO.File]::ReadAllBytes(".\firebase-credentials-prod.json")))
# Option B — Variables séparées (risque d'échappement de la clé sur Railway)
FIREBASE_PROJECT_ID=saas-mbe-sdv-production
FIREBASE_CLIENT_EMAIL=(copier depuis firebase-credentials-prod.json)
FIREBASE_PRIVATE_KEY=(copier depuis firebase-credentials-prod.json - ATTENTION aux \n, ou utiliser Option A)

# Stripe (valeurs de la PARTIE 3)
STRIPE_SECRET_KEY=sk_live_XXXXXXXXXXXX (remplacer par votre vraie clé)
STRIPE_CONNECT_CLIENT_ID=ca_XXXXXXXXX
STRIPE_WEBHOOK_SECRET=whsec_XXXXXXXXX

# Gmail OAuth (valeurs de la PARTIE 4)
GMAIL_CLIENT_ID=XXXXX.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-XXXXX
GMAIL_REDIRECT_URI=https://api.votre-domaine.com/auth/gmail/callback

# Google Sheets OAuth (valeurs de la PARTIE 4)
GOOGLE_SHEETS_CLIENT_ID=XXXXX.apps.googleusercontent.com
GOOGLE_SHEETS_CLIENT_SECRET=GOCSPX-XXXXX
GOOGLE_SHEETS_REDIRECT_URI=https://api.votre-domaine.com/auth/google-sheets/callback

# Groq AI (obtenir sur https://console.groq.com)
GROQ_API_KEY=gsk_your_groq_api_key_here

# Email (à renseigner avec vos vraies valeurs dans Railway)
EMAIL_FROM=noreply@votre-domaine.com
EMAIL_FROM_NAME=SaaS MBE SDV
GMAIL_USER=votre-email@gmail.com
GMAIL_APP_PASSWORD=votre_mot_de_passe_application_gmail
# → GMAIL_USER : votre adresse Gmail réelle (ex. vous@gmail.com).
# → GMAIL_APP_PASSWORD : un « mot de passe d’application » Gmail (pas votre mot de passe habituel).
#   Créer sur : https://myaccount.google.com → Sécurité → Mots de passe des applications (après validation en 2 étapes).

# CORS
FRONTEND_URL=https://votre-domaine.com
ALLOWED_ORIGINS=https://votre-domaine.com,https://www.votre-domaine.com
```

**⚠️ Pour Firebase sur Railway (erreur DECODER) :**  
Si vous voyez « DECODER routines::unsupported » ou « Getting metadata from plugin failed », utilisez **FIREBASE_CREDENTIALS_BASE64** au lieu des 3 variables séparées :
- Dans PowerShell (dossier contenant `firebase-credentials-prod.json`) :  
  `[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\firebase-credentials-prod.json"))`
- Créer dans Railway la variable **FIREBASE_CREDENTIALS_BASE64** = la chaîne générée (tout sur une ligne).
- Vous pouvez alors supprimer FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL et FIREBASE_PRIVATE_KEY.

**Pour `FIREBASE_PRIVATE_KEY` (Option B) :**
- Ouvrir `firebase-credentials-prod.json`
- Copier la valeur de `"private_key"` **avec les guillemets**
- Exemple : `"-----BEGIN PRIVATE KEY-----\nXXXXX\n-----END PRIVATE KEY-----\n"`

**✅ Validation :** Toutes les variables sont ajoutées (environ 15 variables).

---

### Étape 5.5 : Redéployer

1. **Onglet "Deployments"**

2. **Cliquer sur le menu `⋮` du dernier déploiement**

3. **Cliquer "Redeploy"**

4. **Attendre 2-3 minutes**

5. **Vérifier les logs :**
   - Si vous voyez `[AI Proxy] ✅ Serveur démarré sur http://localhost:5174` → ✅ SUCCESS
   - Si vous voyez des erreurs → Vérifier les variables d'environnement

**✅ Validation :** Le déploiement affiche "Success" et le service est "Active".

---

### Étape 5.6 : Configurer le Domaine Backend

Sur Railway, le domaine personnalisé se configure **sur le service backend**, pas sur le projet. Suivez les étapes ci‑dessous dans l’ordre.

---

**Étape A — Être au bon endroit (projet vs service)**

- **Page Projet** : vous voyez le **nom du projet** en haut et un menu à gauche avec **General**, **Usage**, **Environments**, **Shared Variables**, **Webhooks**, **Members**, **Tokens**, **Integrations**, **Danger**. Il n’y a **pas** de "Networking" ici.
- **Page Service** : vous voyez le **nom du service** (votre backend) et un menu à gauche avec par exemple **Deployments**, **Logs**, **Metrics**, **Settings**, etc. C’est **ici** que vous devez être pour ajouter un domaine.

Si vous êtes sur la page **Projet** (menu General, Usage, etc.) :

1. Sur la **page d’accueil du projet**, vous voyez une ou plusieurs **cartes** (chaque carte = un service, ex. backend, frontend).
2. **Cliquez sur la carte du service backend** (celui déployé depuis le dépôt avec `front end` / `ai-proxy.js`). Le nom peut être celui du projet (ex. "optimistic-delight") ou un nom que vous avez donné.
3. Vous arrivez sur la **page du service** : l’URL change (ex. `railway.app/project/xxx/service/yyy`), et le menu de gauche affiche **Deployments**, **Logs**, **Settings**, etc.

---

**Étape B — Ouvrir les paramètres du service**

4. Dans le **menu de gauche de la page du service**, cliquez sur **"Settings"** (Paramètres).
5. La page affiche les réglages **de ce service** (Root Directory, Build Command, Variables, etc.), **pas** les réglages du projet.

---

**Étape C — Trouver Networking et ajouter le domaine**

6. Dans la page **Settings du service**, **descendez** jusqu’à trouver une section intitulée **"Networking"**, **"Public Networking"** ou **"Domains"**.
7. Dans cette section vous voyez :
   - L’**URL publique Railway** du service (ex. `votre-service.up.railway.app`),
   - Un bouton du type **"+ Custom Domain"**, **"Add domain"** ou **"Custom Domain"**.
8. **Cliquez sur ce bouton** (+ Custom Domain / Add domain).
9. Une zone de saisie apparaît. **Entrez** votre sous‑domaine API, par ex. : `api.votre-domaine.com` (remplacez par votre vrai domaine, ex. `api.mbe-sdv.fr`).
10. Validez (bouton **Add** / **Save** selon l’interface).
11. Railway affiche ensuite un **enregistrement DNS** à créer chez votre hébergeur de domaine, du type :
    ```
    Type : CNAME
    Nom / Host : api  (ou api.votre-domaine.com selon l’affichage)
    Valeur / Target : votre-service.up.railway.app
    ```
    En résumé : **CNAME** pointant `api` (ou le sous‑domaine indiqué) vers l’URL Railway affichée.

12. **Copiez ces informations** et **notez‑les dans NOTES_DEPLOIEMENT.txt** (vous en aurez besoin à la partie DNS).

**✅ Validation :** Le domaine personnalisé apparaît dans la liste des domaines du service (statut peut rester "Pending" tant que le CNAME n’est pas configuré chez votre registrar).

---

## PARTIE 6 : Hébergement Frontend (Vercel) (30 min)

### Étape 6.1 : Créer un Compte Vercel

1. **Aller sur https://vercel.com**

2. **Cliquer "Sign Up"**

3. **Se connecter avec GitHub**
   - Cliquer **"Continue with GitHub"**
   - Autoriser Vercel

**✅ Validation :** Vous êtes sur le dashboard Vercel.

---

### Étape 6.2 : Importer le Projet

1. **Cliquer "Add New..." → "Project"**

2. **Import Git Repository :**
   - Chercher `SaaS-MBE-Dev-2.0`
   - Cliquer **"Import"**

3. **Configure Project :**
   - **Framework Preset** : Détecté automatiquement (Vite)
   - **Root Directory** : Cliquer "Edit", choisir `front end`
   - **Build Command** : `npm run build` (déjà défini)
   - **Output Directory** : `dist` (déjà défini)

4. **Ne pas cliquer sur "Deploy" tout de suite.** Il faut d’abord ajouter les variables d’environnement (sinon le build ou l’app en production échouera ou n’aura pas la bonne config).

5. **Cliquer sur "Environment Variables"** (lien ou section sur la même page). Une zone s’ouvre pour ajouter des variables.

6. **Ajouter toutes les variables listées à l’étape 6.3 ci‑dessous** (une par une : Nom → Valeur → Add). Une fois toutes les variables ajoutées, vous pourrez déployer à l’étape 6.4.

**✅ Validation :** Les variables sont ajoutées ; vous pouvez ensuite lancer le déploiement (étape 6.4).

---

### Étape 6.3 : Ajouter les Variables d'Environnement Frontend

**Dans la section "Environment Variables" ouverte à l’étape précédente, ajouter les variables suivantes (une par une) :**

```env
VITE_FIREBASE_API_KEY=AIza.... (copier depuis Firebase PARTIE 2)
VITE_FIREBASE_AUTH_DOMAIN=saas-mbe-sdv-production.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=saas-mbe-sdv-production
VITE_FIREBASE_STORAGE_BUCKET=saas-mbe-sdv-production.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456

VITE_API_URL=https://api.votre-domaine.com

VITE_STRIPE_PUBLIC_KEY=pk_live_XXXXXXXXX
```

**Pour chaque variable :**
- Entrer le **nom** (ex. `VITE_FIREBASE_API_KEY`)
- Entrer la **valeur** (copier depuis Firebase, Stripe ou votre domaine)
- Cliquer **"Add"** (ou "Add Another" pour la suivante)

**À faire avant de déployer :** Vérifier que les **9 variables** ci‑dessus sont bien présentes dans la liste (Firebase : 6 variables, `VITE_API_URL`, `VITE_STRIPE_PUBLIC_KEY`). Sans elles, le frontend ne pourra pas se connecter à l’API ni à Firebase en production.

**✅ Validation :** Vous avez 9 variables d'environnement listées ; vous pouvez passer au déploiement (étape 6.4).

---

### Étape 6.4 : Déployer

1. **Revenir en haut de la page** (si besoin) et cliquer sur **"Deploy"**

2. **⏱️ Attendre 2-3 minutes**

3. **Vérifier le build :**
   - Si SUCCESS → ✅
   - Si erreur → Vérifier les variables

4. **Cliquer "Continue to Dashboard"**

**✅ Validation :** Le projet est déployé, vous voyez un lien vers votre site.

---

### Étape 6.5 : Configurer le Domaine Frontend

1. **Onglet "Settings" du projet**

2. **Section "Domains"**

3. **Ajouter votre domaine :**
   - Cliquer **"Add"**
   - Entrer : `votre-domaine.com`
   - Cliquer **"Add"**

4. **Ajouter www :**
   - Cliquer **"Add"**
   - Entrer : `www.votre-domaine.com`
   - Cliquer **"Add"**
   - Choisir **"Redirect to votre-domaine.com"**

5. **Copier les DNS records affichés :**

```
A Record: @ → 76.76.21.21
CNAME: www → cname.vercel-dns.com
```

6. **⚠️ NOTER ces records dans NOTES_DEPLOIEMENT.txt**

**✅ Validation :** Les 2 domaines sont ajoutés (pas encore valides, c'est normal).

---

## PARTIE 7 : Configuration Domaine (30 min)

### Étape 7.1 : Configurer les DNS chez votre Registrar

**Où aller ?**
- **Namecheap** : https://namecheap.com → Account → Domain List → Manage
- **OVH** : https://ovh.com → Domaines → Votre domaine → Zone DNS
- **GoDaddy** : https://godaddy.com → Mes domaines → DNS

**Records à ajouter :**

1. **Pour le Frontend (Vercel) :**
   ```
   Type: A
   Name: @
   Value: 76.76.21.21
   TTL: Auto (ou 3600)
   ```

   ```
   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   TTL: Auto (ou 3600)
   ```

2. **Pour le Backend (Railway) :**
   ```
   Type: CNAME
   Name: api
   Value: your-app.up.railway.app (copier depuis Railway)
   TTL: Auto (ou 3600)
   ```

3. **Cliquer "Save" ou "Apply Changes"**

**⏱️ Attendre la propagation DNS :** 5 minutes à 24 heures (généralement 30 min)

**✅ Validation :** Les 3 records sont sauvegardés.

---

### Étape 7.2 : Vérifier la Propagation DNS

**Après 30 minutes, tester :**

```bash
# Windows PowerShell
nslookup votre-domaine.com
nslookup www.votre-domaine.com
nslookup api.votre-domaine.com

# Résultat attendu :
# votre-domaine.com → 76.76.21.21
# www.votre-domaine.com → cname.vercel-dns.com
# api.votre-domaine.com → your-app.up.railway.app
```

**Ou utiliser un outil en ligne :**
- https://dnschecker.org

**✅ Validation :** Les 3 domaines résolvent correctement.

---

### Étape 7.3 : Vérifier les Certificats SSL

1. **Aller sur https://votre-domaine.com**
   - Si vous voyez un cadenas 🔒 → ✅
   - Si erreur SSL → Attendre 10 minutes de plus

2. **Aller sur https://api.votre-domaine.com/api/health**
   - Si vous voyez `{"status":"ok"}` → ✅
   - Si erreur → Vérifier le DNS

**✅ Validation :** Les 2 URLs fonctionnent en HTTPS.

---

## PARTIE 8 : Tests Finaux (45 min)

### Étape 8.1 : Mettre à Jour les Redirect URIs

**⚠️ IMPORTANT :** Maintenant que vos domaines fonctionnent, mettre à jour les callbacks.

**Dans Google Cloud Console :**

1. **APIs & Services → Credentials**

2. **Gmail OAuth Client :**
   - Cliquer sur le client `SaaS MBE SDV - Gmail Production`
   - **Authorized redirect URIs** :
     - Retirer `https://api.votre-domaine.com/auth/gmail/callback`
     - Ajouter `https://api.VOTRE-VRAI-DOMAINE.com/auth/gmail/callback`
   - Cliquer **"SAVE"**

3. **Sheets OAuth Client :**
   - Même chose pour `/auth/google-sheets/callback`

**Dans Stripe Dashboard :**

4. **Connect → Settings → OAuth settings**
   - **Redirect URIs** :
     - Retirer l'ancienne URI
     - Ajouter `https://api.VOTRE-VRAI-DOMAINE.com/stripe/callback`
   - Cliquer **"Save"**

5. **Developers → Webhooks**
   - Cliquer sur votre webhook
   - Cliquer **"Update details"**
   - **Endpoint URL** : `https://api.VOTRE-VRAI-DOMAINE.com/webhooks/stripe`
   - Cliquer **"Update endpoint"**

**✅ Validation :** Toutes les URIs pointent vers votre vrai domaine.

---

### Étape 8.2 : Test de Création de Compte

1. **Aller sur https://votre-domaine.com**

2. **Créer un nouveau compte :**
   - Email : Utiliser votre email réel
   - Mot de passe : Choisir un mot de passe fort
   - Cliquer **"S'inscrire"**

3. **Vérifier votre email :**
   - Ouvrir votre boîte mail
   - Cliquer sur le lien de vérification Firebase

4. **Se connecter**

**✅ Validation :** Vous êtes connecté et vous voyez le Dashboard.

---

### Étape 8.3 : Test Gmail OAuth

1. **Aller dans Paramètres → Intégrations**

2. **Section "Gmail" :**
   - Cliquer **"Connecter Gmail"**
   - Autoriser l'application
   - Vous devriez être redirigé vers l'app
   - Status : "Connecté" ✅

**✅ Validation :** Gmail est connecté.

---

### Étape 8.4 : Test Google Sheets OAuth

1. **Section "Google Sheets" :**
   - Cliquer **"Connecter Google Sheets"**
   - Autoriser l'application
   - Sélectionner une feuille de calcul
   - Status : "Connecté" ✅

**✅ Validation :** Google Sheets est connecté.

---

### Étape 8.5 : Test Stripe Connect

1. **Section "Paiements" :**
   - Cliquer **"Connecter Stripe"**
   - Se connecter à Stripe
   - Autoriser l'application
   - Status : "Connecté" ✅

**✅ Validation :** Stripe est connecté.

---

### Étape 8.6 : Test Création de Devis

1. **Attendre 5 minutes** (polling Google Sheets)

2. **Aller dans "Nouveaux devis"**

3. **Vérifier qu'un devis de test apparaît**

4. **Cliquer sur "Voir détails"**

5. **Vérifier toutes les informations**

**✅ Validation :** Le devis s'affiche correctement.

---

### Étape 8.7 : Test Paiement Stripe (Mode Test)

**⚠️ Utiliser une carte de test Stripe :**

```
Numéro : 4242 4242 4242 4242
Date : 12/34
CVC : 123
```

1. **Dans le devis, onglet "Paiements"**

2. **Cliquer sur le lien de paiement généré**

3. **Remplir le formulaire avec la carte de test**

4. **Valider le paiement**

5. **Retourner dans l'app**

6. **Vérifier que le statut est passé à "Payé"**

**✅ Validation :** Le paiement est bien reçu et le statut est mis à jour.

---

### Étape 8.8 : Test Notifications

1. **Vérifier la cloche de notifications** (en haut à droite)

2. **Vous devriez voir un badge avec le nombre de notifications**

3. **Cliquer dessus**

4. **Vérifier que la notification "Nouveau devis reçu" apparaît**

**✅ Validation :** Les notifications fonctionnent.

---

## PARTIE 9 : Mise en Ligne (30 min)

### Étape 9.1 : Désactiver le Mode Test Stripe

**⚠️ Maintenant que tout fonctionne, activer les vrais paiements !**

1. **Stripe Dashboard → Basculer sur "Live mode"**

2. **Vérifier que le webhook est bien configuré pour l'URL de production**

3. **Tester un vrai paiement avec votre carte** (ou celle d'un client test)

**✅ Validation :** Les paiements en mode Live fonctionnent.

---

### Étape 9.2 : Monitoring et Logs

**Configurer Sentry (Optionnel mais recommandé) :**

> **💡 Qu'est-ce que Sentry ?**
> Sentry est un outil qui surveille votre application et vous envoie un email dès qu'une erreur se produit. C'est comme un système d'alarme pour votre site web. Si un utilisateur rencontre un bug, vous le saurez immédiatement au lieu d'attendre qu'il vous contacte.

---

#### **⚠️ PRÉREQUIS : Installation des packages Sentry**

> **📝 Note importante :** Avant de configurer Sentry, il faut installer les packages nécessaires dans votre projet. Si vous n'avez pas encore fait cela, suivez ces étapes :

**Étape 0 : Installer les packages Sentry**

1. **Ouvrir un terminal** (PowerShell sur Windows)

2. **Aller dans le dossier du projet :**
   ```powershell
   cd "c:\Dev\SaaS MBE SDV\front end"
   ```

3. **Installer le package Sentry pour React (Frontend) :**
   ```powershell
   npm install @sentry/react
   ```
   - Attendre que l'installation se termine (vous verrez "added 1 package" quand c'est fait)

4. **Installer le package Sentry pour Node.js (Backend) :**
   ```powershell
   npm install @sentry/node
   ```
   - Attendre que l'installation se termine

5. **Vérifier l'installation :**
   - Ouvrir le fichier `front end/package.json`
   - Chercher `"@sentry/react"` et `"@sentry/node"` dans la section `"dependencies"`
   - Si vous les voyez, c'est bon ✅

6. **Commit et push les changements :**
   ```powershell
   cd "c:\Dev\SaaS MBE SDV"
   git add "front end/package.json" "front end/package-lock.json"
   git commit -m "feat: Ajouter Sentry pour le monitoring"
   git push origin master
   ```
   - Cela permettra à Vercel et Railway d'installer les packages lors du déploiement

---

> **✅ Une fois les packages installés, vous pouvez continuer avec la configuration ci-dessous.**

---

#### **PARTIE A : Configuration Sentry pour le Frontend (Vercel)**

**Étape 1 : Créer un compte Sentry**

1. **Ouvrir votre navigateur** (Chrome, Firefox, Edge, etc.)

2. **Aller sur le site Sentry :**
   - Tapez dans la barre d'adresse : `https://sentry.io`
   - Appuyez sur Entrée

3. **Sur la page d'accueil de Sentry :**
   - Vous verrez un bouton **"Get Started"** ou **"Sign Up"** (en haut à droite)
   - Cliquez dessus

4. **Choisir comment créer le compte :**
   - Option recommandée : **"Sign up with GitHub"** (si vous avez un compte GitHub)
   - Sinon : **"Sign up with Email"**
   - Remplir le formulaire avec :
     - Votre email
     - Un mot de passe fort (au moins 8 caractères)
     - Accepter les conditions d'utilisation

5. **Vérifier votre email :**
   - Sentry vous enverra un email de confirmation
   - Ouvrir votre boîte mail
   - Cliquer sur le lien dans l'email de Sentry
   - Votre compte est maintenant créé ✅

---

**Étape 2 : Créer un projet pour le Frontend**

1. **Après connexion, Sentry vous demandera de créer un projet**
   - Si vous ne voyez pas cette page, cliquez sur **"Projects"** dans le menu de gauche

2. **Cliquer sur le bouton "Create Project"** (en haut à droite, bouton bleu)

3. **Choisir la plateforme :**
   - Dans la liste des plateformes, chercher **"React"**
   - Cliquer sur **"React"** (vous verrez un logo React bleu)

4. **Configurer le projet :**
   - **Project Name** : Tapez `SaaS MBE SDV Frontend`
   - **Alert Frequency** : Laisser par défaut ("Only send me alerts for new issues")
   - Cliquer sur **"Create Project"** (bouton bleu en bas)

5. **Sentry va vous montrer une page de configuration**
   - **NE PAS FERMER CETTE PAGE** - vous en aurez besoin dans quelques secondes !

---

**Étape 3 : Récupérer le DSN (Data Source Name)**

> **💡 Qu'est-ce que le DSN ?**
> Le DSN est comme une adresse unique qui permet à votre application de communiquer avec Sentry. C'est une chaîne de caractères qui ressemble à une URL.

1. **Sur la page de configuration Sentry**, vous verrez une section **"Configure your application"**

2. **Chercher une zone avec du code** qui commence par :
   ```
   Sentry.init({
     dsn: "https://..."
   ```
   - Le DSN est la partie entre guillemets après `dsn:`

3. **Copier le DSN complet :**
   - Il ressemble à : `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx`
   - **Sélectionner tout le texte** du DSN (de `https://` jusqu'à la fin)
   - **Copier** avec `Ctrl+C` (Windows) ou `Cmd+C` (Mac)
   - **⚠️ IMPORTANT :** Gardez ce DSN dans un fichier texte temporaire, vous en aurez besoin !

4. **Exemple de ce que vous devriez voir :**
   ```
   https://abc123def456@o123456.ingest.sentry.io/1234567890
   ```
   - Votre DSN sera différent, mais aura la même structure

---

**Étape 4 : Ajouter le DSN dans Vercel**

1. **Ouvrir un nouvel onglet** dans votre navigateur

2. **Aller sur Vercel :**
   - Tapez : `https://vercel.com`
   - Connectez-vous avec votre compte GitHub (ou email)

3. **Accéder à votre projet :**
   - Cliquer sur **"Dashboard"** (tableau de bord)
   - Chercher votre projet **"SaaS MBE SDV Frontend"** dans la liste
   - Cliquer sur le nom du projet

4. **Ouvrir les paramètres :**
   - En haut de la page, vous verrez plusieurs onglets : **"Deployments"**, **"Settings"**, etc.
   - Cliquer sur **"Settings"**

5. **Aller dans les variables d'environnement :**
   - Dans le menu de gauche sous "Settings", chercher **"Environment Variables"**
   - Cliquer dessus

6. **Ajouter la nouvelle variable :**
   - Cliquer sur le bouton **"Add New"** ou **"Add Variable"**
   - Dans le champ **"Key"** (nom de la variable), taper exactement :
     ```
     VITE_SENTRY_DSN
     ```
     - ⚠️ Respecter exactement la casse (majuscules/minuscules)
   
   - Dans le champ **"Value"** (valeur), coller le DSN que vous avez copié à l'étape 3
     - Exemple : `https://abc123def456@o123456.ingest.sentry.io/1234567890`
   
   - **Environments** : Cocher **"Production"**, **"Preview"**, et **"Development"**
     - Cela permet à Sentry de fonctionner dans tous les environnements

7. **Sauvegarder :**
   - Cliquer sur **"Save"** ou **"Add"**
   - Vous devriez voir la variable apparaître dans la liste avec une coche verte ✅

---

**Étape 5 : Redéployer Vercel**

> **💡 Pourquoi redéployer ?**
> Vercel doit reconstruire votre application avec la nouvelle variable d'environnement pour que Sentry fonctionne.

1. **Toujours sur la page Vercel de votre projet**

2. **Aller dans l'onglet "Deployments"** (en haut de la page)

3. **Déclencher un nouveau déploiement :**
   - Cliquer sur les **3 points** (⋯) à droite du dernier déploiement
   - Cliquer sur **"Redeploy"** dans le menu
   - Confirmer en cliquant sur **"Redeploy"** dans la popup

4. **Attendre la fin du déploiement :**
   - Vous verrez un indicateur de progression
   - Le statut passera de "Building" → "Ready" (environ 2-3 minutes)
   - Quand vous voyez une coche verte ✅, c'est terminé

5. **Vérifier que ça fonctionne :**
   - Une fois le déploiement terminé, aller sur votre site : `https://www.mbe-sdv.fr`
   - Ouvrir la console du navigateur (F12 → onglet "Console")
   - Vous ne devriez **PAS** voir d'erreur liée à Sentry
   - Si vous voyez une erreur, vérifier que le DSN est correct dans Vercel

---

#### **PARTIE B : Configuration Sentry pour le Backend (Railway)**

> **💡 Pourquoi configurer Sentry pour le backend aussi ?**
> Le backend gère les paiements, les emails, etc. Si une erreur se produit côté serveur, Sentry vous alertera immédiatement.

**Étape 1 : Créer un deuxième projet Sentry**

1. **Retourner sur Sentry** (dans l'onglet précédent ou aller sur `https://sentry.io`)

2. **Aller dans "Projects"** (menu de gauche)

3. **Cliquer sur "Create Project"** (bouton bleu en haut à droite)

4. **Choisir la plateforme :**
   - Cette fois, chercher **"Node.js"** (pas React !)
   - Cliquer sur **"Node.js"**

5. **Configurer le projet :**
   - **Project Name** : Tapez `SaaS MBE SDV Backend`
   - **Alert Frequency** : Laisser par défaut
   - Cliquer sur **"Create Project"**

6. **Copier le DSN** (même procédure que pour le frontend)
   - Le DSN sera différent de celui du frontend
   - **Copier** avec `Ctrl+C`
   - **⚠️ IMPORTANT :** Notez-le dans un fichier texte, vous en aurez besoin !

---

**Étape 2 : Ajouter le DSN dans Railway**

1. **Ouvrir un nouvel onglet** et aller sur Railway : `https://railway.app`

2. **Se connecter** avec votre compte GitHub

3. **Sélectionner votre projet backend** (celui qui contient `ai-proxy.js`)

4. **Ouvrir les variables d'environnement :**
   - Cliquer sur votre service (ex: "Backend" ou "api-proxy")
   - Cliquer sur l'onglet **"Variables"** (en haut)

5. **Ajouter la variable :**
   - Cliquer sur **"New Variable"** ou **"+ New"**
   - **Key** : Taper exactement `SENTRY_DSN`
     - ⚠️ Pas de `VITE_` devant, c'est pour le backend !
   - **Value** : Coller le DSN du backend que vous avez copié
   - Cliquer sur **"Add"**

6. **Vérifier :**
   - La variable `SENTRY_DSN` doit apparaître dans la liste ✅

---

**Étape 3 : Redéployer Railway**

1. **Toujours sur Railway**, aller dans l'onglet **"Deployments"**

2. **Déclencher un redéploiement :**
   - Cliquer sur les **3 points** (⋯) à droite du dernier déploiement
   - Cliquer sur **"Redeploy"**
   - Confirmer

3. **Attendre** (2-3 minutes) que le statut passe à "Active" ✅

---

#### **PARTIE C : Vérification que Sentry fonctionne**

**Test pour le Frontend :**

1. **Aller sur votre site** : `https://www.mbe-sdv.fr`

2. **Ouvrir la console du navigateur** :
   - Appuyer sur `F12` (ou clic droit → "Inspecter")
   - Aller dans l'onglet **"Console"**

3. **Vérifier qu'il n'y a pas d'erreur Sentry** :
   - Si vous voyez une erreur rouge mentionnant "Sentry" ou "DSN", c'est qu'il y a un problème
   - Sinon, c'est bon ✅

**Test pour le Backend :**

1. **Aller sur Sentry** : `https://sentry.io`

2. **Vérifier les projets** :
   - Dans le menu de gauche, cliquer sur **"Projects"**
   - Vous devriez voir vos 2 projets :
     - ✅ `SaaS MBE SDV Frontend`
     - ✅ `SaaS MBE SDV Backend`

3. **Tester manuellement** (optionnel) :
   - Si vous voulez tester que Sentry capture bien les erreurs, vous pouvez créer une erreur volontaire dans votre code
   - Sentry devrait la capturer et l'afficher dans le dashboard

---

**✅ Validation finale :**

- [ ] Compte Sentry créé
- [ ] Projet Frontend créé dans Sentry
- [ ] DSN Frontend ajouté dans Vercel (variable `VITE_SENTRY_DSN`)
- [ ] Frontend redéployé sur Vercel
- [ ] Projet Backend créé dans Sentry
- [ ] DSN Backend ajouté dans Railway (variable `SENTRY_DSN`)
- [ ] Backend redéployé sur Railway
- [ ] Aucune erreur Sentry dans la console du navigateur

**🎉 Félicitations !** Sentry est maintenant configuré et surveillera automatiquement les erreurs de votre application. Vous recevrez un email dès qu'une erreur se produira.

---

### Étape 9.3 : Sauvegarder la Configuration

1. **Créer un fichier `PRODUCTION_CONFIG.txt` dans un endroit sûr**

2. **Y noter TOUTES les informations de production :**
   - Domaines
   - Clés Firebase
   - Clés Stripe
   - Clés Google OAuth
   - URLs Railway et Vercel
   - Credentials admin

3. **⚠️ NE JAMAIS commiter ce fichier sur Git !**

4. **Le stocker dans un gestionnaire de mots de passe sécurisé**

**✅ Validation :** Vous avez un fichier de sauvegarde sécurisé.

---

### Étape 9.4 : Communiquer avec les Utilisateurs

**Si vous avez des utilisateurs en beta :**

1. **Envoyer un email avec :**
   - La nouvelle URL : https://votre-domaine.com
   - Les nouvelles fonctionnalités
   - Les instructions de migration (si nécessaire)

2. **Créer une page "Changelog" ou "Nouveautés"**

**✅ Validation :** Les utilisateurs sont informés.

---

### Étape 9.5 : Surveillance Post-Déploiement

**Pendant les premières 48h, vérifier :**

- [ ] Les logs Railway (aucune erreur)
- [ ] Les logs Vercel (aucune erreur)
- [ ] Sentry (aucune erreur critique)
- [ ] Stripe webhooks (reçus correctement)
- [ ] Firebase quotas (pas de dépassement)

**Checklist quotidienne (1 semaine) :**
- [ ] Vérifier logs backend
- [ ] Vérifier logs frontend
- [ ] Tester connexion OAuth
- [ ] Tester paiement
- [ ] Vérifier notifications

**✅ Validation :** Tout fonctionne correctement pendant 48h.

---

## 🎉 FÉLICITATIONS !

**Votre application SaaS MBE SDV est maintenant EN PRODUCTION ! 🚀**

---

## 📞 Support et Aide

### Si quelque chose ne fonctionne pas

1. **Vérifier les logs :**
   - Railway : Dashboard → Service → Logs
   - Vercel : Project → Deployments → Build Logs
   - Firebase : Console → Firestore → Usage

2. **Vérifier les variables d'environnement :**
   - Railway : Settings → Variables
   - Vercel : Settings → Environment Variables

3. **Consulter `TROUBLESHOOTING_PRODUCTION.md` (à créer)**

### Ressources Utiles

- Firebase : https://firebase.google.com/docs
- Stripe : https://stripe.com/docs
- Railway : https://docs.railway.app
- Vercel : https://vercel.com/docs
- Google Cloud : https://cloud.google.com/docs

---

**Version du guide :** 2.0 (Ultra-détaillée)  
**Dernière mise à jour :** 29 janvier 2026  
**Temps total estimé :** 4-5 heures  
**Niveau :** Débutant ✅
