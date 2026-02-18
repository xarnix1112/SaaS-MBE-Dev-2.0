# 🏗️ Architecture SaaS DEV / STAGING / PRODUCTION

> Guide pas à pas pour les débutants — chaque clic, chaque action expliquée en détail

---

## 📖 Avant de commencer : comprendre les mots clés

| Mot | Signification simple |
|-----|---------------------|
| **Environnement** | Une version de ton app : développement (sur ton PC), staging (copie de test en ligne), production (version que les vrais utilisateurs voient). |
| **Branch** | Une copie du code à un moment donné. Tu peux travailler sur une branche sans toucher aux autres. |
| **PR (Pull Request)** | Une demande de fusion : "Je veux fusionner ma branche dans une autre". Permet de réviser le code avant de fusionner. |
| **Variable d'environnement** | Une donnée secrète ou de config (clé API, mot de passe) stockée à part du code, pour ne pas la mettre sur GitHub. |
| **Deploy / Déploiement** | Mettre en ligne une nouvelle version de l'application. |

---

## 📋 Pourquoi séparer DEV / STAGING / PRODUCTION ?

**Sans séparation** : Tu testes sur le même environnement que tes clients → un bug peut casser le site pour tout le monde.

**Avec séparation** :
- **DEV** : Tu développes tranquillement sur ton PC, avec des données de test.
- **STAGING** : Tu testes la version finale sur un site de test en ligne, avec une copie réaliste des données.
- **PRODUCTION** : C’est seulement après validation sur staging que tu déploies en production.

---

## 1️⃣ Structure Git : les branches

### C’est quoi une branche ?

Une branche est une ligne de développement séparée.  
Imagine : `main` = version officielle, `staging` = copie de test, `feature/ma-feature` = ta nouveauté en cours.

### Les 3 types de branches à utiliser

| Nom de la branche | À quoi elle sert | Où elle est visible |
|-------------------|------------------|----------------------|
| **main** ou **master** | Version officielle, celle utilisée par les vrais clients. | Sur ton domaine principal (ex. mondomaine.com) |
| **staging** | Version de test en ligne, pour valider avant de passer en prod. | Sur staging.mondomaine.com |
| **feature/nom-de-la-feature** | Branche de développement pour une fonctionnalité. | URL temporaire Vercel (ex. monapp-xyz123.vercel.app) |

### Mise en place initiale (à faire une seule fois)

Avant de suivre le workflow, il faut **créer la branche `staging`** si elle n'existe pas encore.

**Note :** Ton dépôt utilise peut-être `master` (branche principale) ou `main`. Remplace par le nom de ta branche principale si besoin.

1. Ouvre le terminal dans le dossier du projet :  
   `cd "C:\Dev\SaaS MBE SDV"`
2. Assure-toi d'être sur ta branche principale :  
   `git checkout master`  
   (ou `git checkout main` si ton repo utilise `main`)
3. Crée la branche `staging` :  
   `git checkout -b staging`
4. Envoie la branche `staging` sur GitHub :  
   `git push origin staging`
5. Revient sur ta branche principale :  
   `git checkout master`

Désormais, `staging` existe sur GitHub et tu pourras ouvrir des PR vers elle.

---

### Workflow étape par étape

**IMPORTANT — Où exécuter les commandes ?**

Toutes les commandes Git doivent être exécutées **dans le dossier de ton projet** (là où se trouve le fichier caché `.git`).

1. Ouvre le **Terminal** (PowerShell ou l’invite de commandes intégrée de VS Code)
2. Va dans le dossier du projet avec :  
   `cd "C:\Dev\SaaS MBE SDV"`
3. Vérifie que tu es au bon endroit :  
   `git status`  
   Si tu vois "not a git repository", tu n’es pas dans le bon dossier.

---

**Étape 1 — Créer une branche de travail**

Tape exactement (sans les guillemets, en une seule ligne) :

    git checkout -b feature/ma-nouvelle-fonctionnalite

- `git` = le programme Git
- `checkout -b` = créer et basculer sur une nouvelle branche
- `feature/ma-nouvelle-fonctionnalite` = nom de la branche (tu peux le modifier)

Erreurs courantes :
- Ne pas mettre de guillemets autour de la commande (pas `git "checkout -b ..."`)
- Ne pas copier les caractères ` ```bash ` ou ` ``` ` — ce sont uniquement pour la mise en forme du document
- Exécuter la commande dans `C:\Dev` au lieu de `C:\Dev\SaaS MBE SDV` → message "not a git repository"

---

**Étape 2 — Développer et enregistrer tes changements**

Tu modifies ton code, puis exécute (chaque commande sur une ligne) :

    git add .
    git commit -m "Description de ce que tu as fait"

---

**Étape 3 — Envoyer ta branche sur GitHub**

    git push origin feature/ma-nouvelle-fonctionnalite

- `origin` = ton dépôt GitHub
- La branche sera visible sur GitHub et Vercel pourra la déployer en mode Preview

---

**Étape 4 — Proposer la fusion vers staging (Pull Request)**

**Important :** Tu ne peux créer une PR que si ta branche feature contient des **commits en plus** de `staging`. Si GitHub affiche « There isn't anything to compare » ou « staging is up to date with all commits from feature/… », c'est que :
- soit tu n'as pas encore fait de **commit** sur ta branche feature ;
- soit tu n'as pas **poussé** tes commits sur GitHub.

Dans ce cas : fais tes modifications, puis `git add .` → `git commit -m "..."` → `git push origin feature/ma-nouvelle-fonctionnalite`. Ensuite, reviens sur GitHub pour créer la PR.

1. Va sur ton dépôt GitHub dans le navigateur
2. Clique sur **"Pull requests"**
3. Clique sur **"New pull request"**
4. **Base** : `staging`, **Compare** : `feature/ma-nouvelle-fonctionnalite`
5. Si des différences s'affichent, clique sur **"Create pull request"** 

---

**Étape 5 — Tester sur staging**

Après fusion de la PR dans `staging`, Vercel déploie automatiquement sur staging.mondomaine.com. Tu peux tester.

---

**Étape 6 — Mettre en production**

1. Nouvelle PR : **Base** = `main` ou `master` (ta branche principale), **Compare** = `staging`
2. Une fois la PR fusionnée, la production est mise à jour automatiquement

---

## 2️⃣ Configuration Vercel (détaillée)

### Où se trouve Vercel ?

1. Va sur [https://vercel.com](https://vercel.com)
2. Connecte-toi
3. Dans le tableau de bord, clique sur ton projet (ex. "SaaS MBE SDV")

### Branche de production

1. Clique sur **"Settings"** (en haut)
2. Dans le menu de gauche, clique sur **"Environments"** (et non pas "Git")
3. Trouve le champ **"Production Branch"**
4. Mets **master** dans le champ (ou `main` si c’est ta branche principale)
5. Clique sur **"Save"**

Pourquoi : Vercel déploie automatiquement sur ton domaine principal à chaque push sur cette branche.

### Variables d’environnement : où les mettre

1. Toujours dans **"Settings"**
2. Clique sur **"Environment Variables"** dans le menu de gauche

Tu verras un tableau avec :
- **Name** : nom de la variable (ex. `FIREBASE_PROJECT_ID`)
- **Value** : sa valeur (ex. `saas-mbe-sdv-production`)
- **Environments** : Production, Preview, Development

**Production** = déploiements depuis `master` (ou ta branche de prod)  
**Preview** = déploiements depuis `staging` ou `feature/*`  
**Development** = uniquement en local avec `vercel dev`

### Ajouter une variable (étape par étape)

**Cas simple** (une seule valeur pour tout, ex. `STRIPE_SECRET_KEY`) :
1. Clique sur **"Add New"** (ou **"Add"**)
2. **Key** : le nom de la variable (ex. `FIREBASE_PROJECT_ID`)
3. **Value** : sa valeur
4. Coche **Production** et/ou **Preview** selon tes besoins
5. Clique sur **"Save"**

---

**Cas Firebase** (tu as 2 projets Firebase différents : prod et staging) :

Dans la fenêtre « Add Environment Variable », la sélection Environnements (Production / Preview / Development) s'applique à **toutes** les variables de la fenêtre. Tu dois donc faire **deux enregistrements séparés**, avec le **même nom** mais des **valeurs différentes** selon l’environnement. Vercel choisira automatiquement la bonne selon que le déploiement soit en Production ou en Preview.

**1ᵉʳ enregistrement – pour la production :** (une seule variable, une seule fenêtre)
1. Clique sur **"Add New"** (n'utilise pas « + Add Another » dans la fenêtre)
2. **Key** : `FIREBASE_PROJECT_ID`
3. **Value** : l’ID de ton projet Firebase **prod** (ex. `saas-mbe-sdv-production`)
4. Coche **uniquement Production** (décoche Preview et Development)
5. **Save** puis ferme. Ouvre une **nouvelle** fenêtre pour le staging.

**2ᵉ enregistrement – pour le staging :**
1. Clique à nouveau sur **"Add New"** (une nouvelle fenêtre)
2. **Key** : `FIREBASE_PROJECT_ID` (le même nom qu’avant)
3. **Value** : l’ID de ton projet Firebase **staging** (ex. `saas-mbe-sdv-staging`)
4. Coche **uniquement Preview** (décoche Production et Development)
5. **Save**

Résultat : dans le tableau, deux lignes `FIREBASE_PROJECT_ID`, chacune avec son environnement. Vercel injecte la bonne au déploiement.

### Domaine staging

1. **Settings** → **Domains**
2. Clique sur **"Add"**
3. Saisis `staging.mondomaine.com` (remplace par ton domaine)
4. Valide
5. Suis les instructions DNS (ajout d’un enregistrement CNAME vers Vercel)

Pour que staging.mondomaine.com pointe uniquement vers la branche `staging` :
1. Clique sur le domaine que tu viens d’ajouter
2. Indique la branche **staging** dans les options

---

## 3️⃣ Firebase : 3 projets séparés

### Pourquoi 3 projets Firebase ?

- **Projet DEV** : pour tes tests locaux, données jetables
- **Projet STAGING** : pour tester en ligne avec des données proches de la prod
- **Projet PROD** : données réelles des clients, à ne pas toucher pendant les tests

### Créer les 3 projets (étape par étape)

1. Va sur [https://console.firebase.google.com](https://console.firebase.google.com)
2. Clique sur **"Ajouter un projet"** (ou "Add project")
3. **Nom du projet** : `saas-mbe-sdv-dev`
4. Désactive Google Analytics si tu n’en as pas besoin
5. Clique sur **"Créer le projet"**
6. Répète pour `saas-mbe-sdv-staging` et `saas-mbe-sdv-production`

### Activer Authentication et Firestore

1. Dans ton projet Firebase, dans le menu de gauche :
2. Clique sur **"Authentication"** → **"Commencer"** → active **"Email/Password"**
3. Clique sur **"Firestore Database"** → **"Créer une base de données"** → mode **Production** → choisir la région
4. Fais la même chose pour chaque projet (dev, staging, prod)

### Récupérer les clés de service (Admin SDK)

1. Clique sur l’icône **roue dentée** (paramètres) à côté de "Vue d’ensemble du projet"
2. Clique sur **"Paramètres du projet"**
3. Onglet **"Comptes de service"**
4. Clique sur **"Générer une nouvelle clé privée"** → **"Générer la clé"**
5. Un fichier JSON est téléchargé
6. Renomme-le et place-le :
   - dev → `front end/firebase-credentials-dev.json`
   - staging → `front end/firebase-credentials-staging.json`
   - prod → `front end/firebase-credentials.json`

Ne jamais committer ces fichiers sur GitHub (ils sont déjà dans `.gitignore`).

---

## 4️⃣ Feature Flags (fonctionnalités par utilisateur)

### À quoi ça sert ?

Permettre d’activer ou désactiver des fonctions selon le plan (Basic, Pro, Enterprise) ou manuellement pour certains comptes.

### Structure dans Firestore

Pour un utilisateur, dans la collection `users`, document `{userId}` :

```javascript
{
  email: "client@example.com",
  plan: "pro",   // "basic" | "pro" | "enterprise"
  features: {
    advancedAnalytics: true,    // activé
    betaFeature: false         // désactivé
  }
}
```

`plan` détermine les droits de base, `features` permet des activations ou désactivations spécifiques.

### Utilisation dans le code

Le fichier `front end/server/middleware/featureFlags.js` fournit `checkFeature`.  
Exemple :

```javascript
app.get('/api/analytics', checkFeature('advancedAnalytics'), monHandler);
```

Si l’utilisateur n’a pas la feature, il reçoit une erreur 403.

---

## 5️⃣ Protéger le staging par mot de passe

Pour éviter que le staging soit visible publiquement :

1. Vercel **Settings** → **Environment Variables**
2. Crée `STAGING_PASSWORD` avec la valeur souhaitée
3. Coche **Preview** uniquement

Le middleware `staging-auth.js` demande ce mot de passe (header `X-Staging-Token` ou paramètre `?token=`).

---

## 6️⃣ Migrations Firestore (règles de sécurité)

- Toujours tester les migrations sur **staging** d’abord
- Faire un backup avant toute modification importante sur la prod
- Ne jamais supprimer de données en prod sans procédure claire

---

## 📁 Fichiers créés pour cette architecture

| Fichier | Rôle |
|---------|------|
| `.github/BRANCH_PROTECTION.md` | Détail des règles de protection des branches GitHub |
| `docs/env.example.md` | Liste complète des variables d’environnement et comment les remplir |
| `docs/ARCHITECTURE_SAAS.md` | Ce document |
| `front end/server/lib/env.js` | Détecte automatiquement l’environnement (dev/staging/prod) |
| `front end/server/lib/firebase-env.js` | Choisit le bon projet Firebase selon l’environnement |
| `front end/server/lib/stripe-env.js` | Vérifie que les clés Stripe correspondent à l’environnement |
| `front end/server/middleware/featureFlags.js` | Vérifie qu’un utilisateur a accès à une feature |
| `front end/server/middleware/staging-auth.js` | Demande un mot de passe pour accéder au staging |
| `vercel.json` | Configuration de build et déploiement sur Vercel |

---

## 💻 Intégration dans ton code

### Utiliser Firebase dynamique selon l’environnement

Dans `front end/server/index.js`, remplace l’initialisation Firebase actuelle par :

```javascript
import { initFirebaseAdmin } from './lib/firebase-env.js';

const { firestore } = initFirebaseAdmin();
```

### Utiliser les Feature Flags

```javascript
import { checkFeature } from './middleware/featureFlags.js';

app.get('/api/analytics', checkFeature('advancedAnalytics'), monHandlerAnalytics);
```

### Protéger le staging

```javascript
import { requireAuthStaging } from './middleware/staging-auth.js';

app.use(requireAuthStaging);  // Ajoute avant tes routes
```
