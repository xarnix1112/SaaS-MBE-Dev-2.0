# Variables d'environnement — Guide complet pour débutants

> Chaque variable expliquée, où la créer, et quelle valeur mettre selon l'environnement

---

## C'est quoi une variable d'environnement ?

Une variable d'environnement est une valeur (mot de passe, clé API, identifiant de projet) stockée en dehors du code.  
Ton application la lit au démarrage ou à la compilation.

**Intérêts** :
- Ne pas mettre de secrets dans le code (et donc sur GitHub)
- Changer la config sans modifier le code (ex. autre base de données en staging)

---

## Architecture : où vont les secrets ?

**Important** : Vercel héberge uniquement le **frontend** (fichiers HTML/JS/CSS). Le backend (serveur Express avec Stripe, Firebase Admin) tourne sur un **autre serveur** (Railway, Render, VPS, etc.).

| Où | Ce qui tourne | Variables à y mettre |
|----|----------------|----------------------|
| **Vercel** | Frontend statique (Vite build) | Uniquement les `VITE_*` — **jamais de secrets** (clés Stripe, etc.) car les `VITE_*` sont incluses dans le JS envoyé au navigateur |
| **Serveur backend** | Express, Stripe, Firebase Admin | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`, `FIREBASE_PROJECT_ID`, `APP_URL`, `NODE_ENV`, `STAGING_PASSWORD`, etc. |

Les clés Stripe (`sk_live_`, `whsec_`) sont **critiques et privées**. Elles doivent aller **uniquement sur le serveur backend**, jamais sur Vercel.

---

## Où créer ces variables ?

### Sur ton PC (développement local)

Dans le dossier `front end/`, crée un fichier nommé `.env.local`  
(fichier texte, sans extension après `.local`).

Ce fichier est ignoré par Git : tu peux y mettre des clés sans risquer de les pousser sur GitHub.

**Comment le créer :**
1. Ouvre l’explorateur de fichiers
2. Va dans `c:\Dev\SaaS MBE SDV\front end\`
3. Clic droit → **Nouveau** → **Document texte**
4. Nomme-le exactement : `.env.local`
5. Si Windows te prévient que le nom change, accepte
6. Ouvre-le avec Notepad ou VS Code et ajoute tes variables (voir plus bas)

### Sur Vercel (staging et production)

1. Va sur [vercel.com](https://vercel.com) et connecte-toi
2. Clique sur ton projet
3. En haut : **Settings**
4. Menu de gauche : **Environment Variables**
5. Tu verras une liste (ou vide)
6. Clique sur **Add New** ou **Add**
7. Remplis **Key** et **Value**
8. Choisis les environnements : **Production**, **Preview**, ou **Development**
9. Clique sur **Save**

---

## Quelle valeur pour quel environnement ?

### Production

- Utilisé quand tu déploies depuis la branche **master** (ou main)
- Données réelles
- Clés Stripe en **mode live** (sk_live_, whsec_ live)

### Preview

- Utilisé pour staging et branches feature
- Données de test
- Clés Stripe en **mode test** (sk_test_, whsec_ test)

### Development (Vercel)

- Utilisé uniquement avec `vercel dev` en local
- En général, on utilise surtout `.env.local` et pas cette option

---

## Liste des variables Backend (serveur Node.js)

| Variable | Rôle | Valeur DEV | Valeur STAGING | Valeur PRODUCTION |
|----------|------|------------|----------------|-------------------|
| `NODE_ENV` | Indique l'environnement | `development` | `staging` | `production` |
| `FIREBASE_PROJECT_ID` | Projet Firebase utilisé | `saas-mbe-sdv-dev` | `saas-mbe-sdv-staging` | `saas-mbe-sdv-production` |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe | `sk_test_51...` | `sk_test_51...` | `sk_live_51...` |
| `STRIPE_WEBHOOK_SECRET` | Secret pour valider les webhooks Stripe | `whsec_...` (test) | `whsec_...` (test) | `whsec_...` (live) |
| `STRIPE_CONNECT_CLIENT_ID` | ID Stripe Connect | `ca_...` (test) | `ca_...` (test) | `ca_...` (live) |
| `STAGING_PASSWORD` | Mot de passe pour accéder au staging | — | ton mot de passe | — |
| `APP_URL` | URL de base de l'app | `http://localhost:8080` | `https://staging.mondomaine.com` | `https://mondomaine.com` |

---

## Liste des variables Frontend (Vite, préfixe VITE_)

Le préfixe `VITE_` est obligatoire pour que Vite les expose au code frontend.

| Variable | Rôle | Où trouver la valeur |
|----------|------|------------------------|
| `VITE_FIREBASE_PROJECT_ID` | ID du projet Firebase | Firebase Console → Paramètres du projet |
| `VITE_FIREBASE_API_KEY` | Clé API Firebase | Firebase Console → Paramètres du projet → Général |
| `VITE_FIREBASE_AUTH_DOMAIN` | Domaine d'auth Firebase | Généralement `xxx.firebaseapp.com` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Bucket de stockage | Généralement `xxx.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender ID pour notifications | Firebase Console |
| `VITE_FIREBASE_APP_ID` | ID de l'app Firebase | Firebase Console |
| `VITE_APP_URL` | URL de l'app (pour les liens, redirections) | Même logique que `APP_URL` |

---

## Où trouver les valeurs Firebase ?

1. Va sur [console.firebase.google.com](https://console.firebase.google.com)
2. Clique sur ton projet (ex. saas-mbe-sdv-dev)
3. Clique sur l’icône **engrenage** à côté de "Vue d'ensemble du projet"
4. Clique sur **Paramètres du projet**
5. Onglet **Général** : tu verras les champs (Project ID, API Key, App ID, etc.)
6. Tu peux les copier un par un dans ton `.env.local` ou dans Vercel

---

## Où trouver les clés Stripe ?

### Mode test (DEV et STAGING)

1. Va sur [dashboard.stripe.com](https://dashboard.stripe.com)
2. En haut à droite, active le mode **"Mode test"** (switch)
3. Menu **Developers** → **API keys**
4. Copie **Secret key** (commence par `sk_test_`)
5. Menu **Developers** → **Webhooks** → crée un endpoint ou clique sur un existant → **Reveal** pour le signing secret (`whsec_...`)
6. **Connect** → **Settings** pour le **Client ID** (`ca_...`)

### Mode live (PRODUCTION)

1. Sur le dashboard Stripe, désactive le mode test
2. Même démarche : **API keys**, **Webhooks**, **Connect** pour les clés live

---

## Exemple de fichier .env.local (développement)

Crée le fichier `front end/.env.local` avec par exemple :

```bash
# === FIREBASE (projet dev) ===
VITE_FIREBASE_PROJECT_ID=saas-mbe-sdv-dev
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=saas-mbe-sdv-dev.firebaseapp.com
VITE_FIREBASE_STORAGE_BUCKET=saas-mbe-sdv-dev.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

# === BACKEND ===
FIREBASE_PROJECT_ID=saas-mbe-sdv-dev
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_CLIENT_ID=ca_...

# === APP ===
APP_URL=http://localhost:8080
NODE_ENV=development
```

Remplace les `...` par tes vraies valeurs.  
Ne partage jamais ce fichier et ne le commite pas.

---

## Guide pas à pas : tout configurer correctement

Cette section décrit exactement quoi faire, dans quel ordre, pour que Production et Preview fonctionnent.

**Résumé des étapes :**
1. Production Branch dans Vercel (Environments)
2. Variables **Vercel** (frontend) : uniquement les `VITE_*` — pas de clés Stripe
3. Variables **serveur backend** (Railway, Render, etc.) : Stripe, Firebase Admin, etc.
4. Domaine staging + branche
5. Vérifier en déployant

### Avant de commencer

Assure-toi d’avoir :

1. **3 projets Firebase** créés : `saas-mbe-sdv-dev`, `saas-mbe-sdv-staging`, `saas-mbe-sdv-production`
2. **Paramètres Firebase** copiés pour chaque projet (Project ID, API Key, Auth Domain, etc.)
3. **Clés Stripe** : mode test pour Preview, mode live pour Production
4. **Tes domaines** : ex. `mondomaine.com` (prod) et `staging.mondomaine.com` (staging)

---

### Étape 1 : Vercel — Production Branch

1. Va sur [vercel.com](https://vercel.com) → ton projet
2. **Settings** → menu gauche **Environments**
3. Champ **Production Branch** : entre `master` (ou `main` si c’est ta branche principale)
4. **Save**

---

### Étape 2 : Variables pour la Production (branche master)

1. **Settings** → **Environment Variables**
2. Pour chaque variable ci-dessous, fais un **Add New** séparé (n’utilise pas « + Add Another »)
3. Renseigne **Key**, **Value**, coche **uniquement Production**, puis **Save**

| # | Key | Value (Production) | Où trouver |
|---|-----|---------------------|------------|
| 1 | `VITE_FIREBASE_PROJECT_ID` | `saas-mbe-sdv-production` | Firebase Console → projet prod |
| 2 | `VITE_FIREBASE_API_KEY` | `AIzaSy...` | Idem (clé publique Firebase) |
| 3 | `VITE_FIREBASE_AUTH_DOMAIN` | `saas-mbe-sdv-production.firebaseapp.com` | Idem |
| 4 | `VITE_FIREBASE_STORAGE_BUCKET` | `saas-mbe-sdv-production.appspot.com` | Idem |
| 5 | `VITE_FIREBASE_MESSAGING_SENDER_ID` | `123456789` | Idem |
| 6 | `VITE_FIREBASE_APP_ID` | `1:123456789:web:abc123` | Idem |
| 7 | `VITE_APP_URL` | `https://mondomaine.com` | Ton domaine de production |
| 8 | `VITE_API_BASE_URL` | `https://api.mondomaine.com` | URL de ton serveur backend |

---

### Étape 3 : Variables Vercel — Preview (frontend uniquement, pas de secrets)

1. Toujours dans **Environment Variables**
2. Pour chaque variable ci-dessous, fais un nouveau **Add New**
3. Renseigne **Key**, **Value**, coche **uniquement Preview**, puis **Save**

| # | Key | Value (Preview) | Où trouver |
|---|-----|-----------------|------------|
| 1 | `VITE_FIREBASE_PROJECT_ID` | `saas-mbe-sdv-staging` | Firebase Console → projet **staging** |
| 2 | `VITE_FIREBASE_API_KEY` | `AIzaSy...` | Idem |
| 3 | `VITE_FIREBASE_AUTH_DOMAIN` | `saas-mbe-sdv-staging.firebaseapp.com` | Idem |
| 4 | `VITE_FIREBASE_STORAGE_BUCKET` | `saas-mbe-sdv-staging.appspot.com` | Idem |
| 5 | `VITE_FIREBASE_MESSAGING_SENDER_ID` | `123456789` | Idem |
| 6 | `VITE_FIREBASE_APP_ID` | `1:123456789:web:xyz789` | Idem |
| 7 | `VITE_APP_URL` | `https://staging.mondomaine.com` | Ton domaine staging |
| 8 | `VITE_API_BASE_URL` | `https://api-staging.mondomaine.com` | URL du backend staging |

---

### Étape 3b : Variables sur le serveur backend (Railway, Render, VPS…)

Les clés Stripe et Firebase Admin vont **sur le serveur où tourne Express**, jamais sur Vercel.  
Le frontend (Vercel) appelle ce backend via `VITE_API_BASE_URL` (ex. `https://api.mondomaine.com`).

---

#### 3b.1 — Choisir où héberger le backend

Tu peux utiliser **Railway** (gratuit au début) ou **Render** (gratuit aussi). Exemple avec Railway.

1. Va sur [railway.app](https://railway.app) et connecte-toi avec GitHub
2. Clique sur **New Project**
3. Choisis **Deploy from GitHub repo**
4. Sélectionne ton dépôt `SaaS-MBE-Dev-2.0` (ou le nom de ton repo)
5. Railway crée le projet. Clique sur le service créé pour ouvrir les paramètres

---

#### 3b.2 — Configurer le projet

1. Dans **Settings** (roue dentée), cherche **Root Directory** ou **Build**
2. Mets **Root Directory** : `front end` (pour que Railway travaille dans le bon dossier)
3. **Build Command** : `npm run build`
4. **Start Command** : `node server/ai-proxy.js` (contient saas-account, cartons, shipping, Stripe — **pas** `index.js` qui est minimal)
5. **Save**

---

#### 3b.3 — Obtenir l’URL du backend

1. Onglet **Settings** → **Networking** → **Generate Domain**
2. Railway génère une URL du type `xxx.up.railway.app`
3. Note cette URL : ce sera ta `VITE_API_BASE_URL` (ex. `saas-mbe-dev-20-production.up.railway.app`)
4. Pour la prod, tu peux ensuite ajouter un domaine persistant (ex. `api.mondomaine.com`) dans **Custom Domain**

---

#### 3b.4 — Variables d’environnement pour la Production

1. Clique sur ton service → **Variables** (onglet)
2. Clique sur **Add Variable** ou **Raw Editor**
3. Ajoute chaque variable ci-dessous (une par ligne si Raw Editor, sinon une par une)

| Variable | Valeur | Où trouver |
|----------|-------|------------|
| `NODE_ENV` | `production` | Fixe |
| `FIREBASE_PROJECT_ID` | `saas-mbe-sdv-production` | ID du projet Firebase prod |
| `APP_URL` | `https://mondomaine.com` | Ton domaine principal (frontend) | "https://api.mbe-sdv.fr"
| `STRIPE_SECRET_KEY` | `sk_live_51...` | Stripe Dashboard, mode live désactivé → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Stripe → Webhooks → ton endpoint prod → Reveal signing secret |
| `STRIPE_CONNECT_CLIENT_ID` | `ca_...` | Stripe → Connect → Settings → Client ID |
| `FIREBASE_CREDENTIALS_BASE64` | (voir 3b.5) | JSON du Service Account encodé en base64 |
| `PORT` | laisser vide | Railway définit le port automatiquement |

---

#### 3b.5 — Credentials Firebase pour le backend (recommandé : base64)

Le serveur a besoin des identifiants du **Service Account** Firebase.

1. Firebase Console → ton projet **prod** → icône engrenage → **Paramètres du projet**
2. Onglet **Comptes de service** → **Générer une nouvelle clé privée** → confirme
3. Un fichier JSON est téléchargé (ex. `saas-mbe-sdv-production-xxx.json`)
4. Encode ce JSON en base64 :
   - **Windows (PowerShell)** :  
     `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\chemin\vers\le-fichier.json"))`
   - **Ou** utilise un outil en ligne : colle le JSON, encode en base64
5. Dans Railway → **Variables** → **Add Variable**
6. **Key** : `FIREBASE_CREDENTIALS_BASE64`
7. **Value** : colle la chaîne base64 (tout sur une ligne, sans espaces)
8. **Save**

---

#### 3b.6 — Backend pour le Staging : pourquoi il faut un deuxième service

**Pourquoi "ajouter" NODE_ENV=staging remplace l'ancienne valeur ?**

Sur Railway, chaque variable n'a qu'une seule valeur par service. Si ton service Production a déjà `NODE_ENV=production`, tu ne peux pas avoir en plus `NODE_ENV=staging` dans le même service — c'est la même clé. Modifier la variable remplace l'ancienne valeur.

**Solution : 2 services Railway = 2 environnements séparés**

| Service | Variables | Rôle |
|---------|-----------|------|
| Service 1 (Production) | NODE_ENV=production, Firebase prod, Stripe live | Backend pour mondomaine.com |
| Service 2 (Staging) | NODE_ENV=staging, Firebase staging, Stripe test | Backend pour staging.mondomaine.com |

Chaque service a son propre jeu de variables, complètement indépendant. Tu ne modifies pas le service Production pour ajouter staging — tu crées un second service.

**Étapes :**

**Étape 1.** Dans ton projet Railway, clique sur « + New » ou « Add Service »  
**Étape 2.** Choisis « GitHub Repo » (même dépôt)

**Étape 3.** Configure : Root Directory `front end`, Build `npm run build`, Start `node server/ai-proxy.js`

**Étape 4.** Settings → Source → branche `staging` (ce service déploie uniquement quand tu push sur staging)

**Étape 5.** Clique sur ce **nouveau service** (pas sur Production) → Variables → ajoute le tableau ci-dessous. Les variables sont indépendantes de celles du service Production.

**Étape 6.** Generate Domain pour l'URL staging. Dans Vercel (Preview), mets `VITE_API_BASE_URL` = cette URL.

**Variables Staging (à mettre dans le service Staging uniquement) :**

| Variable | Valeur |
|----------|--------|
| `NODE_ENV` | `staging` |
| `FIREBASE_PROJECT_ID` | `saas-mbe-sdv-staging` |
| `APP_URL` | `https://staging.mondomaine.com` |
| `STRIPE_SECRET_KEY` | `sk_test_51...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (test) |
| `STRIPE_CONNECT_CLIENT_ID` | `ca_...` (test) |
| `FIREBASE_CREDENTIALS_BASE64` | base64 du JSON staging (Service Account du projet staging) |
| `STAGING_PASSWORD` | Mot de passe pour protéger l’accès au staging |

---

#### 3b.7 — Configurer les webhooks Stripe

Stripe doit appeler ton backend pour les événements (paiements, Connect, etc.).

1. [Stripe Dashboard](https://dashboard.stripe.com) → **Developers** → **Webhooks**
2. **Add endpoint**
3. **Endpoint URL** : `https://ton-backend.railway.app/api/stripe/webhook` (ou `/webhooks/stripe` selon ton code)
4. **Events** : sélectionne ceux dont tu as besoin (ex. `checkout.session.completed`, `account.updated`, etc.)
5. **Add endpoint** → récupère le **Signing secret** (`whsec_...`)
6. Mets ce secret dans la variable `STRIPE_WEBHOOK_SECRET` du backend
7. Pour le staging : crée un second endpoint avec l’URL du backend staging et utilise son `whsec_` pour le service staging

---

#### 3b.8 — Mettre à jour Vercel avec l’URL du backend

1. Vercel → **Settings** → **Environment Variables**
2. Vérifie que `VITE_API_BASE_URL` pour Production = l’URL de ton backend (ex. `https://xxx.up.railway.app` ou `https://api.mondomaine.com`)
3. Pour Preview, `VITE_API_BASE_URL` = URL du backend staging (si tu en as un)

---

#### 3b.9 — Vérification

1. Déploie sur Railway (commit + push ou déploiement manuel)
2. Teste : `https://ton-backend.railway.app/api/health` (ou la route de santé de ton API)
3. Ouvre ton site sur Vercel : le frontend doit appeler le backend sans erreur CORS
4. Teste un paiement Stripe en mode test pour valider le webhook

---

### Étape 4 : Domaine staging (si pas encore fait)

1. **Settings** → **Domains** → **Add**
2. Saisis `staging.mondomaine.com` → Valide
3. Ajoute l’enregistrement CNAME chez ton hébergeur DNS comme indiqué par Vercel
4. Clique sur le domaine ajouté → sélectionne la branche **staging** dans les options

---

### Étape 5 : Vérification

1. **Production** : pousse un commit sur `master` → Vercel déploie sur ton domaine principal
2. **Preview** : pousse un commit sur `staging` → Vercel déploie sur `staging.mondomaine.com`
3. Ouvre chaque URL et vérifie que l’app se connecte au bon projet Firebase (pas d’erreur de config)
4. Sur staging, tu dois être invité à entrer `STAGING_PASSWORD` si le middleware est actif

---

### Rappel important

- Sur Vercel : jamais de clés Stripe ni autres secrets, uniquement les VITE_* pour le frontend.
- Ne jamais utiliser « + Add Another » pour des variables qui ont des valeurs différentes selon l’environnement : une fenêtre = une variable = un environnement.
- Après modification des variables, un **redéploiement** est nécessaire pour que les changements soient pris en compte.

## Firebase : APIs et règles Firestore

### APIs à activer (Google Cloud Console)

Dans [Google Cloud Console](https://console.cloud.google.com/) → **APIs et services** → **Bibliothèque** (ou **APIs & Services** → **Library**), active ces APIs pour ton projet Firebase (ex. `saas-mbe-sdv-staging`) :

| API | Description | Recherche dans la bibliothèque |
|-----|-------------|-------------------------------|
| **Cloud Firestore API** | Base de données Firestore | "Cloud Firestore API" |
| **Identity Toolkit API** | Firebase Authentication (email, mot de passe, etc.) | "Identity Toolkit API" |
| **Firebase Installations API** | Utilisée par le SDK Firebase | "Firebase Installations API" |
| **Token Service API** | Tokens d'authentification | "Token Service API" |

> Note : "Firebase Authentication API" n'existe pas dans la console. L'authentification passe par **Identity Toolkit API**.

---

### Règles Firestore : où les trouver et les déployer

**Où les voir dans Firebase Console :**

1. Va sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionne ton projet (ex. `saas-mbe-sdv-staging`)
3. Menu de gauche → **Firestore Database**
4. Onglet **Règles** (ou "Rules" / "Sécurité" selon la langue)

Si tu vois `allow read, write: if false` partout → toutes les requêtes Firestore sont bloquées.

---

**Déployer les règles depuis le projet :**

Le fichier `firestore.rules` à la racine du repo contient les bonnes règles. Pour les déployer :

```bash
# 1. Sélectionner le bon projet Firebase
firebase use saas-mbe-sdv-staging   # ou l'alias de ton projet staging

# 2. Déployer uniquement les règles Firestore
firebase deploy --only firestore:rules
```

Après déploiement, les règles autorisent notamment :
- `users/{uid}` : lecture/écriture par l’utilisateur connecté
- `saasAccounts/{id}` : lecture/écriture par le propriétaire
- `quotes`, `auctionHouses`, etc. : pour les utilisateurs authentifiés

---

## Erreurs courantes

| Erreur | Cause probable | Solution |
|--------|----------------|----------|
| "Variable non définie" | Variable manquante ou mal orthographiée | Vérifier le nom exact (sensible à la casse) |
| Firebase ne se connecte pas | Mauvais projet (ex. dev au lieu de prod) | Vérifier `FIREBASE_PROJECT_ID` et `VITE_FIREBASE_PROJECT_ID` |
| "client is offline" / unavailable | Règles Firestore bloquent tout (`if false`) ou APIs non activées | Déployer `firestore.rules` avec `firebase deploy --only firestore:rules` ; activer Cloud Firestore API + Identity Toolkit API |
| "Erreur inconnue" / réponse HTML / "Erreur lors de la création du compte MBE" | `VITE_API_BASE_URL` pointe vers Vercel (staging.mbe-sdv.fr) au lieu de Railway | **Vercel → Settings → Environment Variables** : pour **Preview**, `VITE_API_BASE_URL` = URL Railway staging (ex. `https://xxx.up.railway.app`) — **jamais** l’URL du frontend |
| Stripe renvoie une erreur en prod | Clé test en production | Utiliser les clés live pour Production |
| Les changements de variables ne s’appliquent pas | Cache du déploiement | Redéployer (nouveau commit ou "Redeploy" dans Vercel) |

---

## Rappel sécurité

- Ne jamais commiter `.env.local` ni les fichiers de credentials Firebase
- Les variables Vercel sont chiffrées
- Utilise des clés différentes pour dev, staging et prod
