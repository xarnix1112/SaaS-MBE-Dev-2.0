# 🧪 Guide Complet : Tester les Paiements Stripe en Mode Test

> **💡 Pourquoi ce guide ?**
> 
> Vous avez une erreur : "Votre carte a été refusée. Votre demande a été effectuée dans le mode production mais a utilisé une carte de test connue."
> 
> **Explication :** Stripe a deux modes :
> - **Mode Test** : Pour tester avec des cartes fictives (4242 4242 4242 4242, etc.)
> - **Mode Production** : Pour les vrais paiements avec de vraies cartes bancaires
> 
> **Vous êtes actuellement en mode Production**, donc Stripe refuse les cartes de test. Pour tester, vous devez basculer en **Mode Test**.

---

## 📋 Table des Matières

1. [Comprendre le Problème](#comprendre-le-problème)
2. [Étape 1 : Basculer Stripe en Mode Test](#étape-1--basculer-stripe-en-mode-test)
3. [Étape 2 : Récupérer les Clés API de Test](#étape-2--récupérer-les-clés-api-de-test)
4. [Étape 3 : Mettre à Jour les Variables dans Railway (Backend)](#étape-3--mettre-à-jour-les-variables-dans-railway-backend)
5. [Étape 4 : Mettre à Jour les Variables dans Vercel (Frontend)](#étape-4--mettre-à-jour-les-variables-dans-vercel-frontend)
6. [Étape 5 : Redéployer les Applications](#étape-5--redéployer-les-applications)
7. [Étape 6 : Tester un Paiement](#étape-6--tester-un-paiement)
8. [Retour en Mode Production](#retour-en-mode-production)

---

## 🔍 Comprendre le Problème

**Situation actuelle :**
- ✅ Votre application est déployée en production
- ✅ Stripe est configuré en **Mode Live** (production)
- ❌ Vous essayez d'utiliser une carte de test (`4242 4242 4242 4242`)
- ❌ Stripe refuse car les cartes de test ne fonctionnent qu'en mode test

**Solution :**
- Basculer Stripe en **Mode Test** dans le dashboard
- Mettre à jour les clés API dans Railway et Vercel
- Redéployer les applications
- Tester avec des cartes de test

---

## Étape 1 : Basculer Stripe en Mode Test

### 1.1 Ouvrir le Dashboard Stripe

1. **Ouvrir votre navigateur** (Chrome, Firefox, Edge, etc.)

2. **Aller sur le site Stripe :**
   - Tapez dans la barre d'adresse : `https://dashboard.stripe.com`
   - Appuyez sur Entrée

3. **Se connecter** avec votre compte Stripe :
   - Entrez votre email
   - Entrez votre mot de passe
   - Cliquez sur **"Se connecter"**

### 1.2 Vérifier le Mode Actuel

1. **En haut à droite** du dashboard Stripe, vous verrez un **toggle** (bouton à bascule)

2. **Regardez le texte à côté du toggle :**
   - Si vous voyez **"Live mode"** avec un indicateur **vert** → Vous êtes en mode production ❌
   - Si vous voyez **"Test mode"** avec un indicateur **gris** → Vous êtes déjà en mode test ✅

3. **Si vous êtes en "Live mode"**, continuez avec l'étape suivante

### 1.3 Basculer en Mode Test

1. **Cliquer sur le toggle** en haut à droite (celui qui dit "Live mode")

2. **Une popup va apparaître** avec un message de confirmation :
   - Le message dit quelque chose comme : "Switch to test mode?"
   - Cliquez sur **"Switch to test mode"** ou **"Basculer en mode test"**

3. **Attendre quelques secondes** que Stripe bascule

4. **Vérifier que c'est fait :**
   - Le toggle doit maintenant afficher **"Test mode"** avec un indicateur **gris**
   - Le fond du dashboard peut changer légèrement de couleur
   - En haut à gauche, vous pouvez voir "Test mode" écrit

**✅ Validation :** Le toggle affiche "Test mode" et est gris.

---

## Étape 2 : Récupérer les Clés API de Test

> **💡 Qu'est-ce qu'une clé API ?**
> 
> Les clés API sont comme des mots de passe qui permettent à votre application de communiquer avec Stripe. Il y a deux types :
> - **Clé secrète** (`sk_test_...`) : Pour le backend (Railway) - NE JAMAIS PARTAGER
> - **Clé publique** (`pk_test_...`) : Pour le frontend (Vercel) - Peut être visible dans le code

### 2.1 Accéder aux Clés API

1. **Dans le dashboard Stripe** (toujours en mode test), regardez le **menu de gauche**

2. **Cliquer sur "Developers"** (ou "Développeurs")

3. **Dans le sous-menu, cliquer sur "API keys"** (ou "Clés API")

4. **Vous arrivez sur une page** qui affiche vos clés API

### 2.2 Récupérer la Clé Secrète (Backend)

1. **Sur la page des clés API**, vous verrez une section **"Secret key"**

2. **À droite de "Secret key"**, vous verrez un bouton **"Reveal test key"** ou **"Révéler la clé de test"**

3. **Cliquer sur ce bouton**

4. **La clé va s'afficher** : elle commence par `sk_test_` suivi d'une longue chaîne de caractères
   - Exemple : `sk_test_51AbCdEfGhIjKlMnOpQrStUvWxYz...` (votre clé sera différente)

5. **⚠️ IMPORTANT : Copier cette clé maintenant !**
   - Sélectionner tout le texte de la clé (de `sk_test_` jusqu'à la fin)
   - **Copier** avec `Ctrl+C` (Windows) ou `Cmd+C` (Mac)
   - **⚠️ Gardez cette clé dans un fichier texte temporaire**, vous en aurez besoin dans quelques minutes

**✅ Validation :** Vous avez copié une clé qui commence par `sk_test_`

### 2.3 Récupérer la Clé Publique (Frontend)

1. **Sur la même page**, vous verrez une section **"Publishable key"**

2. **La clé publique est déjà visible** (pas besoin de cliquer sur "Reveal")

3. **Cette clé commence par `pk_test_`** suivi d'une longue chaîne
   - Exemple : `pk_test_51AbCdEfGhIjKlMnOpQrStUvWxYz...` (votre clé sera différente)

4. **Copier cette clé aussi :**
   - Sélectionner tout le texte
   - **Copier** avec `Ctrl+C`
   - **⚠️ Gardez cette clé aussi dans votre fichier texte temporaire**

**✅ Validation :** Vous avez copié une clé qui commence par `pk_test_`

### 2.4 Récupérer le Client ID Stripe Connect (si nécessaire)

> **💡 Quand avez-vous besoin du Client ID ?**
> 
> Si vous utilisez Stripe Connect (pour que vos clients connectent leur propre compte Stripe), vous avez aussi besoin du Client ID.

1. **Dans le menu de gauche**, cliquer sur **"Connect"** → **"Settings"**

2. **Chercher la section "Integration"** ou **"Intégration"**

3. **Cliquer sur "OAuth settings"** ou **"Paramètres OAuth"**

4. **Vous verrez un "Client ID"** qui commence par `ca_`
   - Exemple : `ca_AbCdEfGhIjKlMnOpQrStUvWxYz...` (votre Client ID sera différent)

5. **Copier ce Client ID aussi** si vous l'utilisez

**✅ Validation :** Vous avez toutes les clés nécessaires dans votre fichier texte temporaire.

---

## Étape 3 : Mettre à Jour les Variables dans Railway (Backend)

> **💡 Qu'est-ce que Railway ?**
> 
> Railway est le service qui héberge votre backend (l'API qui gère les paiements Stripe). C'est là que vous devez mettre la clé secrète Stripe.

### 3.1 Accéder à Railway

1. **Ouvrir un nouvel onglet** dans votre navigateur

2. **Aller sur Railway :**
   - Tapez : `https://railway.app`
   - Appuyez sur Entrée

3. **Se connecter** avec votre compte GitHub :
   - Cliquez sur **"Login"** ou **"Se connecter"**
   - Autorisez Railway à accéder à votre compte GitHub

### 3.2 Trouver votre Projet Backend

1. **Sur la page d'accueil de Railway**, vous verrez une liste de vos projets

2. **Chercher votre projet backend** (celui qui contient `ai-proxy.js` ou `server/`)
   - Le nom peut être quelque chose comme "Backend", "API", "SaaS MBE SDV Backend", etc.

3. **Cliquer sur le nom du projet**

### 3.3 Accéder aux Variables d'Environnement

1. **Dans votre projet Railway**, vous verrez plusieurs onglets en haut : **"Deployments"**, **"Settings"**, **"Variables"**, etc.

2. **Cliquer sur l'onglet "Variables"**

3. **Vous verrez une liste** de toutes les variables d'environnement configurées

### 3.4 Modifier la Variable STRIPE_SECRET_KEY

1. **Dans la liste des variables**, chercher **`STRIPE_SECRET_KEY`**

2. **Cliquer sur la ligne** qui contient `STRIPE_SECRET_KEY`

3. **Une popup ou un formulaire va s'ouvrir** pour modifier la variable

4. **Dans le champ "Value"** (Valeur), vous verrez probablement une clé qui commence par `sk_live_`

5. **Remplacer cette clé** par la clé de test que vous avez copiée à l'étape 2.2 :
   - **Effacer** l'ancienne clé (sélectionner tout avec `Ctrl+A`, puis `Suppr`)
   - **Coller** la nouvelle clé de test (`sk_test_...`) avec `Ctrl+V`
   - ⚠️ Vérifier qu'il n'y a pas d'espaces avant ou après la clé

6. **Cliquer sur "Save"** ou **"Enregistrer"**

7. **Vérifier** que la variable a bien été mise à jour :
   - Dans la liste, `STRIPE_SECRET_KEY` doit maintenant afficher `sk_test_...` (les premiers caractères)

**✅ Validation :** La variable `STRIPE_SECRET_KEY` dans Railway contient maintenant une clé qui commence par `sk_test_`

### 3.5 Modifier STRIPE_CONNECT_CLIENT_ID (si nécessaire)

> **⚠️ Faites cette étape seulement si vous utilisez Stripe Connect**

1. **Dans la même liste de variables Railway**, chercher **`STRIPE_CONNECT_CLIENT_ID`**

2. **Si cette variable existe**, cliquer dessus

3. **Vérifier que le Client ID commence par `ca_`**
   - En mode test, le Client ID devrait être le même qu'en mode production
   - Mais vérifiez dans Stripe Dashboard → Connect → Settings que vous êtes bien en mode test

4. **Si nécessaire, mettre à jour** avec le Client ID de test

5. **Sauvegarder**

**✅ Validation :** Toutes les variables Stripe dans Railway sont maintenant configurées pour le mode test.

---

## Étape 4 : Mettre à Jour les Variables dans Vercel (Frontend)

> **💡 Qu'est-ce que Vercel ?**
> 
> Vercel est le service qui héberge votre frontend (l'interface web que vos utilisateurs voient). C'est là que vous devez mettre la clé publique Stripe.

### 4.1 Accéder à Vercel

1. **Ouvrir un nouvel onglet** dans votre navigateur

2. **Aller sur Vercel :**
   - Tapez : `https://vercel.com`
   - Appuyez sur Entrée

3. **Se connecter** avec votre compte GitHub :
   - Cliquez sur **"Login"** ou **"Se connecter"**
   - Autorisez Vercel à accéder à votre compte GitHub

### 4.2 Trouver votre Projet Frontend

1. **Sur la page d'accueil de Vercel**, vous verrez une liste de vos projets

2. **Chercher votre projet frontend** (celui qui contient `src/` ou `front end/`)
   - Le nom peut être quelque chose comme "Frontend", "SaaS MBE SDV Frontend", etc.

3. **Cliquer sur le nom du projet**

### 4.3 Accéder aux Variables d'Environnement

1. **Dans votre projet Vercel**, vous verrez plusieurs onglets en haut : **"Deployments"**, **"Settings"**, etc.

2. **Cliquer sur l'onglet "Settings"**

3. **Dans le menu de gauche**, chercher **"Environment Variables"** (Variables d'environnement)

4. **Cliquer dessus**

5. **Vous verrez une liste** de toutes les variables d'environnement configurées

### 4.4 Modifier la Variable VITE_STRIPE_PUBLIC_KEY

1. **Dans la liste des variables**, chercher **`VITE_STRIPE_PUBLIC_KEY`**

2. **Cliquer sur la ligne** qui contient `VITE_STRIPE_PUBLIC_KEY`

3. **Une popup ou un formulaire va s'ouvrir** pour modifier la variable

4. **Dans le champ "Value"** (Valeur), vous verrez probablement une clé qui commence par `pk_live_`

5. **Remplacer cette clé** par la clé publique de test que vous avez copiée à l'étape 2.3 :
   - **Effacer** l'ancienne clé (sélectionner tout avec `Ctrl+A`, puis `Suppr`)
   - **Coller** la nouvelle clé de test (`pk_test_...`) avec `Ctrl+V`
   - ⚠️ Vérifier qu'il n'y a pas d'espaces avant ou après la clé

6. **Vérifier les "Environments"** (Environnements) :
   - Cocher **"Production"**, **"Preview"**, et **"Development"**
   - Cela permet à la clé de fonctionner dans tous les environnements

7. **Cliquer sur "Save"** ou **"Enregistrer"**

8. **Vérifier** que la variable a bien été mise à jour :
   - Dans la liste, `VITE_STRIPE_PUBLIC_KEY` doit maintenant afficher `pk_test_...` (les premiers caractères)

**✅ Validation :** La variable `VITE_STRIPE_PUBLIC_KEY` dans Vercel contient maintenant une clé qui commence par `pk_test_`

---

## Étape 5 : Redéployer les Applications

> **💡 Pourquoi redéployer ?**
> 
> Les applications doivent être redéployées pour prendre en compte les nouvelles variables d'environnement. Sinon, elles continueront d'utiliser les anciennes clés en mode production.

### 5.1 Redéployer Railway (Backend)

1. **Retourner sur Railway** (dans l'onglet précédent)

2. **Aller dans l'onglet "Deployments"** (en haut de la page)

3. **Vous verrez une liste** de tous les déploiements précédents

4. **Déclencher un nouveau déploiement :**
   - Cliquer sur les **3 points** (⋯) à droite du dernier déploiement
   - Cliquer sur **"Redeploy"** dans le menu
   - Confirmer en cliquant sur **"Redeploy"** dans la popup

5. **Attendre la fin du déploiement :**
   - Vous verrez un indicateur de progression
   - Le statut passera de "Building" → "Deploying" → "Active" (environ 2-3 minutes)
   - Quand vous voyez une coche verte ✅ et "Active", c'est terminé

**✅ Validation :** Le déploiement Railway est terminé et affiche "Active"

### 5.2 Redéployer Vercel (Frontend)

1. **Retourner sur Vercel** (dans l'onglet précédent)

2. **Aller dans l'onglet "Deployments"** (en haut de la page)

3. **Vous verrez une liste** de tous les déploiements précédents

4. **Déclencher un nouveau déploiement :**
   - Cliquer sur les **3 points** (⋯) à droite du dernier déploiement
   - Cliquer sur **"Redeploy"** dans le menu
   - Confirmer en cliquant sur **"Redeploy"** dans la popup

5. **Attendre la fin du déploiement :**
   - Vous verrez un indicateur de progression
   - Le statut passera de "Building" → "Ready" (environ 2-3 minutes)
   - Quand vous voyez une coche verte ✅, c'est terminé

**✅ Validation :** Le déploiement Vercel est terminé et affiche "Ready"

---

## Étape 6 : Tester un Paiement

### 6.1 Vérifier que Tout est en Mode Test

1. **Aller sur votre site** : `https://www.mbe-sdv.fr` (ou votre domaine)

2. **Se connecter** à votre compte

3. **Aller dans un devis** qui a un lien de paiement

4. **Cliquer sur "Voir le lien"** pour ouvrir le lien de paiement Stripe

5. **Vérifier l'URL du lien de paiement :**
   - Si l'URL contient `checkout.stripe.com` → C'est normal
   - Le mode (test/production) est déterminé par les clés API, pas par l'URL

### 6.2 Effectuer un Paiement Test

1. **Sur la page de paiement Stripe**, vous verrez un formulaire

2. **Remplir les informations de la carte de test :**
   - **Numéro de carte** : `4242 4242 4242 4242`
   - **Date d'expiration** : N'importe quelle date future (ex: `12/34`)
   - **CVC** : N'importe quel code à 3 chiffres (ex: `123`)
   - **Nom du titulaire** : N'importe quel nom (ex: `Test User`)
   - **Email** : Votre email (ex: `test@example.com`)

3. **Cliquer sur "Payer"** ou **"Pay"**

4. **✅ Si tout fonctionne :**
   - Vous devriez être redirigé vers une page de confirmation
   - Vous ne devriez **PAS** voir l'erreur "carte de test en mode production"
   - Le paiement devrait être accepté

5. **❌ Si vous voyez encore l'erreur :**
   - Vérifier que Railway et Vercel sont bien redéployés (attendre 5 minutes)
   - Vérifier que les clés dans Railway et Vercel commencent bien par `sk_test_` et `pk_test_`
   - Vider le cache du navigateur (`Ctrl+Shift+Delete` → Cocher "Cache" → Effacer)

**✅ Validation :** Le paiement test fonctionne sans erreur.

---

## 🔄 Retour en Mode Production

> **⚠️ IMPORTANT :** Quand vous voudrez accepter de vrais paiements, vous devrez revenir en mode production.

### Quand Revenir en Mode Production ?

- ✅ Votre compte Stripe est activé et vérifié
- ✅ Vous avez testé que tout fonctionne en mode test
- ✅ Vous êtes prêt à accepter de vrais paiements

### Étapes pour Revenir en Mode Production

1. **Basculer Stripe en "Live mode"** dans le dashboard Stripe

2. **Récupérer les clés Live** (`sk_live_...` et `pk_live_...`)

3. **Mettre à jour les variables dans Railway** (`STRIPE_SECRET_KEY` avec `sk_live_...`)

4. **Mettre à jour les variables dans Vercel** (`VITE_STRIPE_PUBLIC_KEY` avec `pk_live_...`)

5. **Redéployer Railway et Vercel**

6. **⚠️ Tester avec une vraie carte** (petit montant) pour vérifier que tout fonctionne

---

## 📝 Checklist de Validation

Avant de tester, vérifiez que tout est correct :

- [ ] Stripe Dashboard est en **"Test mode"** (toggle gris en haut à droite)
- [ ] Clé secrète dans Railway commence par **`sk_test_`**
- [ ] Clé publique dans Vercel commence par **`pk_test_`**
- [ ] Railway a été **redéployé** et affiche "Active"
- [ ] Vercel a été **redéployé** et affiche "Ready"
- [ ] Vous avez attendu **5 minutes** après le redéploiement

---

## 🆘 Dépannage

### Problème : L'erreur persiste après le redéploiement

**Solutions :**
1. Attendre 5-10 minutes (les changements peuvent prendre du temps à se propager)
2. Vider le cache du navigateur (`Ctrl+Shift+Delete`)
3. Tester dans une fenêtre de navigation privée (`Ctrl+Shift+N`)
4. Vérifier les logs Railway pour voir si les nouvelles clés sont bien chargées

### Problème : Je ne trouve pas les variables dans Railway/Vercel

**Solutions :**
1. Vérifier que vous êtes sur le bon projet
2. Chercher dans l'onglet "Variables" ou "Environment Variables"
3. Utiliser la fonction de recherche (Ctrl+F) pour chercher "STRIPE"

### Problème : Les clés ne se mettent pas à jour

**Solutions :**
1. Vérifier qu'il n'y a pas d'espaces avant/après la clé
2. Vérifier que la clé est complète (commence par `sk_test_` ou `pk_test_`)
3. Sauvegarder à nouveau la variable
4. Redéployer l'application

---

## ✅ Résumé Rapide

1. **Stripe Dashboard** → Basculer en "Test mode"
2. **Stripe Dashboard** → Developers → API keys → Copier `sk_test_...` et `pk_test_...`
3. **Railway** → Variables → Modifier `STRIPE_SECRET_KEY` avec `sk_test_...`
4. **Vercel** → Settings → Environment Variables → Modifier `VITE_STRIPE_PUBLIC_KEY` avec `pk_test_...`
5. **Railway** → Redéployer
6. **Vercel** → Redéployer
7. **Attendre 5 minutes**
8. **Tester** avec la carte `4242 4242 4242 4242`

**🎉 C'est tout ! Vous pouvez maintenant tester les paiements en toute sécurité.**
