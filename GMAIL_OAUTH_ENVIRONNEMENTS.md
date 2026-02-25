# 📧 Gmail OAuth — Configuration par environnement

Ce guide explique comment configurer Gmail OAuth pour **chaque environnement** (dev, staging, production) de manière distincte.

---

## Comprendre le flux

1. **Frontend** (Vercel) → appelle `/auth/gmail/start` sur le **backend** (Railway)
2. **Backend** → vérifie `GMAIL_CLIENT_ID` et `GMAIL_CLIENT_SECRET` → retourne l'URL OAuth Google
3. **Utilisateur** → redirigé vers Google → autorise l'accès Gmail
4. **Google** → redirige vers `GMAIL_REDIRECT_URI` (callback du **backend**)
5. **Backend** → échange le code contre les tokens → redirige vers `FRONTEND_URL/settings/emails?connected=true`

Les variables sont lues par le **backend** (Railway). Le fichier `.env.local` n'est utilisé que pour le **développement local**.

---

## Tableau récapitulatif

| Variable | Dev (local) | Staging (Railway) | Production (Railway) |
|----------|-------------|-------------------|----------------------|
| `GMAIL_CLIENT_ID` | ✅ `.env.local` | ✅ Variables Railway staging | ✅ Variables Railway prod |
| `GMAIL_CLIENT_SECRET` | ✅ `.env.local` | ✅ Variables Railway staging | ✅ Variables Railway prod |
| `GMAIL_REDIRECT_URI` | `http://localhost:5174/auth/gmail/callback` | `https://saas-mbe-dev-staging-staging.up.railway.app/auth/gmail/callback` | `https://api.mbe-sdv.fr/auth/gmail/callback` |
| `FRONTEND_URL` | `http://localhost:8080` | `https://staging.mbe-sdv.fr` | `https://mbe-sdv.fr` ou `https://www.mbe-sdv.fr` |

---

## Option A : Un seul client OAuth Google (plus simple)

Un seul projet Google Cloud peut servir tous les environnements. Il suffit d'ajouter **toutes** les URIs de redirection dans le client OAuth :

1. [Google Cloud Console](https://console.cloud.google.com/) → ton projet
2. **APIs & Services** → **Credentials** → ton **OAuth 2.0 Client ID** (type Web application)
3. Dans **Authorized redirect URIs**, ajoute :
   - `http://localhost:5174/auth/gmail/callback` (dev)
   - `https://saas-mbe-dev-staging-staging.up.railway.app/auth/gmail/callback` (staging)
   - `https://api.mbe-sdv.fr/auth/gmail/callback` (production)
4. **Save**

Tu peux utiliser le **même** `GMAIL_CLIENT_ID` et `GMAIL_CLIENT_SECRET` pour dev, staging et prod.

---

## Option B : Clients OAuth séparés (isolation complète)

Pour une isolation totale, crée un client OAuth par environnement dans Google Cloud Console. Chaque client aura une seule URI de redirection.

---

## Configuration Railway STAGING

1. Va sur [Railway](https://railway.app) → ton projet
2. Clique sur le **service staging** (backend staging)
3. **Variables** (ou **Settings** → **Variables**)
4. Ajoute ou modifie :

| Variable | Valeur |
|----------|--------|
| `NODE_ENV` | `staging` (⚠️ requis pour l'envoi d'emails via Gmail) |
| `GMAIL_CLIENT_ID` | `xxx.apps.googleusercontent.com` |
| `GMAIL_CLIENT_SECRET` | `GOCSPX-xxx` |
| `GMAIL_REDIRECT_URI` | `https://saas-mbe-dev-staging-staging.up.railway.app/auth/gmail/callback` |
| `FRONTEND_URL` | `https://staging.mbe-sdv.fr` |

5. **Redéploie** le service staging (ou attends le prochain push)

> ⚠️ Adapte `GMAIL_REDIRECT_URI` si l'URL de ton backend Railway staging est différente. Tu la trouves dans Railway → service staging → **Settings** → **Networking** → **Public Networking** → Domain.

---

## Configuration développement local

Dans `front end/.env.local` :

```env
# Ces variables sont lues par le serveur (ai-proxy.js), pas par Vite
GMAIL_CLIENT_ID=xxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-xxx
GMAIL_REDIRECT_URI=http://localhost:5174/auth/gmail/callback
FRONTEND_URL=http://localhost:8080
```

> Note : Le backend local écoute sur le port 5174. Le frontend Vite proxy `/auth/*` vers le backend.

---

## Vérification

### Staging
- Ouvrir https://staging.mbe-sdv.fr/settings (ou /settings/emails)
- Cliquer sur "Connecter un compte Gmail"
- Tu devrais être redirigé vers Google OAuth (et plus voir "Gmail OAuth non configuré")

### Logs Railway
Dans Railway → service staging → **Logs**, tu devrais voir au démarrage :
```
[Gmail OAuth] ✅ OAuth2 client initialisé
```
Et plus :
```
[Gmail OAuth] ⚠️  GMAIL_CLIENT_ID ou GMAIL_CLIENT_SECRET manquant
```

---

## Erreur 403 Firebase (API_KEY_HTTP_REFERRER_BLOCKED)

Les logs peuvent aussi afficher une erreur Firebase 403 liée à `saas-mbe-sdv-staging.firebaseapp.com`. C’est distinct du Gmail OAuth. Pour la corriger :
- Google Cloud Console → projet **saas-mbe-sdv-staging**
- Credentials → clé API Web → Restrictions HTTP referrers
- Ajouter `https://staging.mbe-sdv.fr/*` et `https://saas-mbe-sdv-staging.firebaseapp.com/*`

---

## Envoi d'emails via Gmail connecté (staging ET production)

En **staging** et en **production**, tous les emails (devis, relances, collecte, expédié, etc.) sont envoyés via le **compte Gmail connecté** dans Paramètres > Compte Email.

### Prérequis

1. **Gmail OAuth configuré** sur Railway pour staging ET production
2. **Compte Gmail connecté** pour chaque espace MBE (Paramètres > Compte Email)
3. **Redirect URI production** : `https://api.mbe-sdv.fr/auth/gmail/callback` dans Google Cloud Console
4. Variables Railway production : `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI=https://api.mbe-sdv.fr/auth/gmail/callback`

### Comportement

- Sans compte Gmail connecté → erreur : *"Aucun compte Gmail connecté pour cet espace. Connectez un compte Gmail dans Paramètres > Compte Email."*
- L'email part de l'adresse du compte Gmail connecté (ex. `contact@gmail.com` ou `nom@domaine.fr`), pas de `devis@mbe-sdv.fr`

---

## Résumé

| Action | Où |
|--------|-----|
| Variables Gmail pour staging | **Railway** → service staging → Variables |
| URI de redirection staging | **Google Cloud Console** → OAuth client → Authorized redirect URIs |
| Variables dev | `front end/.env.local` |
