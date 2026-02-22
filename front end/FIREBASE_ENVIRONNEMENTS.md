# Configuration des environnements Firebase

Ce document explique comment configurer chaque environnement (dev, staging, production) pour qu'il pointe vers le **bon projet Firebase** — évitant conflits et mélange de données.

---

## Tableau de correspondance

| Environnement | Projet Firebase | Fichier credentials backend | Fichier config frontend |
|---------------|-----------------|----------------------------|-------------------------|
| **Dev** (local) | `saas-mbe-sdv-dev` | `firebase-credentials-dev.json` | `.env.development.local` |
| **Staging** | `saas-mbe-sdv-staging`* | `firebase-credentials-staging.json` | `.env.staging.local` |
| **Production** | `saas-mbe-sdv-production` | `firebase-credentials-prod.json` | `.env.production.local` |

\* Adapte le nom du projet staging si différent.

---

## 1. Créer / configurer les projets Firebase (si pas encore fait)

Pour chaque environnement, tu dois avoir un **projet Firebase distinct** dans la [Console Firebase](https://console.firebase.google.com/) :

- `saas-mbe-sdv-dev` → développement
- `saas-mbe-sdv-staging` → préproduction
- `saas-mbe-sdv-production` → production

---

## Clarification : deux systèmes distincts

| Système | Usage | Fichiers / Variables | Où récupérer les données |
|---------|--------|----------------------|---------------------------|
| **Backend** (Admin SDK) | Firestore, Gmail sync, Sheets sync | Fichiers `firebase-credentials-*.json` | Comptes de service Firebase → "Générer une clé" |
| **Frontend** (Auth client) | Connexion, inscription, lecture Firestore | Variables `VITE_FIREBASE_*` dans `.env.[mode].local` | Paramètres du projet Firebase → "Vos applications" |

Les credentials JSON et les variables `.env` ne contiennent pas les mêmes informations. Ne pas copier le contenu d'un fichier dans l'autre.

---

## 2. Backend — Fichiers de credentials (4 fichiers distincts)

### Fichiers à avoir

Tu dois avoir **un fichier JSON par environnement** (aucun nouveau type de fichier) :

| Fichier | Projet Firebase cible | Utilisé quand |
|---------|------------------------|----------------|
| `firebase-credentials-dev.json` | `saas-mbe-sdv-dev` | Dev local (`NODE_ENV` non défini) |
| `firebase-credentials-staging.json` | `saas-mbe-sdv-staging` | Staging |
| `firebase-credentials-prod.json` | `saas-mbe-sdv-production` | Production |
| `firebase-credentials.json` | Fallback (ex. dev) | Si le fichier spécifique n'existe pas |

### Comment obtenir chaque fichier

1. Firebase Console → **projet concerné** (ex. saas-mbe-sdv-dev)
2. ⚙️ Paramètres → **Comptes de service**
3. **Générer une nouvelle clé privée** → télécharger le JSON
4. Renommer et placer dans `front end/` :
   - Projet dev → `firebase-credentials-dev.json`
   - Projet staging → `firebase-credentials-staging.json`
   - Projet prod → `firebase-credentials-prod.json`

Chaque fichier = **un JSON complet** (project_id, client_email, private_key, etc.) téléchargé pour le bon projet. Pas d’autres types de fichiers à créer.

### Sélection automatique

| NODE_ENV | Fichier utilisé en priorité | Fallback |
|----------|----------------------------|----------|
| `development` (ou non défini) | `firebase-credentials-dev.json` | `firebase-credentials.json` |
| `staging` | `firebase-credentials-staging.json` | `firebase-credentials.json` |
| `production` | `firebase-credentials-prod.json` | `firebase-credentials.json` |

---

## 3. Frontend — Variables `.env.local` (un seul fichier pour le dev)

### Un seul `.env.local` pour le dev

Tu ne crées **pas** plusieurs `.env` pour dev/staging/prod. Tu n’as qu’**un seul** fichier `.env.local` pour le développement local. Son contenu pointe vers **un seul** projet — en général le **projet dev**.

### Où récupérer les valeurs (pas depuis les JSON credentials)

1. Firebase Console → projet **saas-mbe-sdv-dev**
2. ⚙️ **Paramètres du projet** → **Paramètres généraux**
3. Section **« Vos applications »** → ton app Web (ou « Ajouter une application » si besoin)
4. Copier la config (apiKey, authDomain, projectId, etc.)

### Exemple pour `.env.local` (projet dev)

```env
# PROJET DEV — saas-mbe-sdv-dev (pour le dev local uniquement)
VITE_FIREBASE_API_KEY=<apiKey de l'app Web du projet dev>
VITE_FIREBASE_AUTH_DOMAIN=saas-mbe-sdv-dev.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=saas-mbe-sdv-dev
VITE_FIREBASE_STORAGE_BUCKET=saas-mbe-sdv-dev.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=<messagingSenderId du projet dev>
VITE_FIREBASE_APP_ID=<appId du projet dev>
VITE_FIREBASE_MEASUREMENT_ID=<optionnel>
```

Ces valeurs viennent de **« Vos applications »**, jamais du JSON du compte de service.

### Staging / Production

Pour staging et production, tu ne modifies pas `.env.local`. Les variables `VITE_FIREBASE_*` sont définies dans la plateforme de déploiement (Railway, Vercel, etc.) pour chaque environnement.

---

## En résumé : quoi faire concrètement

1. **Fichiers credentials** (déjà présents : `firebase-credentials-dev.json`, `-staging.json`, `-prod.json`)  
   → Remplir chacun avec le JSON du compte de service du **bon projet** (téléchargé depuis Firebase).  
   → Ne pas créer de nouveaux types de fichiers.

2. **`.env.local`** (un seul fichier pour le dev local)  
   → Y mettre les `VITE_FIREBASE_*` du projet **dev** (depuis « Vos applications »).  
   → Ne pas y copier le contenu des fichiers JSON credentials.

   Ces valeurs se trouvent dans : Firebase Console → projet **saas-mbe-sdv-dev** → ⚙️ Paramètres du projet → **Paramètres généraux** → « Vos applications ».

---

## 4. IAM (rôles Google Cloud)

Pour **chaque projet**, le compte de service (`firebase-adminsdk-xxxxx@<projet>.iam.gserviceaccount.com`) doit avoir :

1. [Google Cloud Console](https://console.cloud.google.com/) → sélectionner le **bon projet**
2. **IAM & Admin** → **IAM**
3. Trouver le compte de service Firebase Admin
4. Lui ajouter le rôle **Cloud Datastore User** (pour Firestore)

Répéter pour : `saas-mbe-sdv-dev`, `saas-mbe-sdv-staging`, `saas-mbe-sdv-production`.

---

## 5. Configuration Firebase Auth (création de compte)

Pour que la création de compte fonctionne **sur chaque projet** :

1. Firebase Console → projet concerné
2. **Authentication** → **Get started**
3. Onglet **Sign-in method** → activer **Email/Password**

Puis dans Google Cloud (même projet) :

4. **APIs & Services** → **Library**
5. Activer : **Firebase Installations API**, **Identity Toolkit API**
6. **Credentials** → vérifier que la clé API utilisée par le frontend autorise ces APIs (et les domaines si restrictions)

---

## 6. Checklist par environnement

### Dev (local)

- [ ] Projet Firebase `saas-mbe-sdv-dev` créé
- [ ] `firebase-credentials-dev.json` présent avec le JSON du projet dev
- [ ] `.env.development.local` avec `VITE_FIREBASE_*` pour `saas-mbe-sdv-dev`
- [ ] Rôle **Cloud Datastore User** pour le compte de service du projet dev
- [ ] Auth Email/Password activée sur le projet dev
- [ ] Lancer le backend : `npm run ai:proxy` (NODE_ENV non défini = dev)

### Staging

- [ ] Projet Firebase `saas-mbe-sdv-staging` créé
- [ ] `firebase-credentials-staging.json` avec le JSON du projet staging
- [ ] Variables d’env de build avec `VITE_FIREBASE_*` pour staging
- [ ] Sur Railway (ou autre) : `NODE_ENV=staging` + `FIREBASE_CREDENTIALS_BASE64` (base64 du JSON staging) ou déploiement du fichier
- [ ] IAM et Auth configurés pour le projet staging

### Production

- [ ] Projet Firebase `saas-mbe-sdv-production` créé
- [ ] `firebase-credentials-prod.json` avec le JSON du projet prod
- [ ] Variables d’env de build avec `VITE_FIREBASE_*` pour prod
- [ ] Sur Railway : `NODE_ENV=production` + `FIREBASE_CREDENTIALS_BASE64` (prod)
- [ ] IAM et Auth configurés pour le projet prod

---

## 7. Résumé rapide pour le dev local

1. **Backend** : `firebase-credentials-dev.json` avec le JSON du projet **saas-mbe-sdv-dev**.
2. **Frontend** : `.env.development.local` avec les `VITE_FIREBASE_*` pour **saas-mbe-sdv-dev**.
3. **Projet dev** : Auth activée, APIs activées, IAM (Cloud Datastore User) configuré.
4. **Lancer** : `npm run ai:proxy` puis `npm run dev`.

## 8. Commandes de build par environnement

```bash
npm run dev              # Frontend dev → utilise .env.development.local
npm run build:staging    # Build pour staging → utilise .env.staging.local
npm run build            # Build pour prod → utilise .env.production.local
npm run build:prod       # Idem (alias)
```
