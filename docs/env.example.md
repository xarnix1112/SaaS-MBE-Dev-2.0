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

- Utilisé quand tu déploies depuis la branche **main**
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

## Configurer les variables dans Vercel (pas à pas)

### Pour la Production (branche main)

1. Vercel → ton projet → **Settings** → **Environment Variables**
2. **Add New**
3. **Key** : `VITE_FIREBASE_PROJECT_ID`
4. **Value** : `saas-mbe-sdv-production`
5. Coche **Production**
6. **Save**
7. Répète pour chaque variable en cochant uniquement **Production**
8. Utilise les valeurs Stripe **live** pour la production

### Pour le Preview (staging et features)

1. Même écran **Environment Variables**
2. **Add New**
3. Même **Key** : `VITE_FIREBASE_PROJECT_ID`
4. **Value** : `saas-mbe-sdv-staging`
5. Coche **Preview**
6. **Save**
7. Répète pour chaque variable en cochant **Preview**
8. Utilise les valeurs Stripe **test** pour le preview

---

## Erreurs courantes

| Erreur | Cause probable | Solution |
|--------|----------------|----------|
| "Variable non définie" | Variable manquante ou mal orthographiée | Vérifier le nom exact (sensible à la casse) |
| Firebase ne se connecte pas | Mauvais projet (ex. dev au lieu de prod) | Vérifier `FIREBASE_PROJECT_ID` et `VITE_FIREBASE_PROJECT_ID` |
| Stripe renvoie une erreur en prod | Clé test en production | Utiliser les clés live pour Production |
| Les changements de variables ne s’appliquent pas | Cache du déploiement | Redéployer (nouveau commit ou "Redeploy" dans Vercel) |

---

## Rappel sécurité

- Ne jamais commiter `.env.local` ni les fichiers de credentials Firebase
- Les variables Vercel sont chiffrées
- Utilise des clés différentes pour dev, staging et prod
