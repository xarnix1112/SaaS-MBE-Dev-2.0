# 🔧 Guide : Configurer le Webhook Stripe

## 📋 Problème

Le webhook Stripe n'est pas appelé, donc les paiements restent en statut `PENDING` dans Firestore au lieu de passer à `PAID`.

**Symptômes :**
- ❌ Aucun événement dans Stripe Dashboard → Workbench → Événements
- ❌ Aucun log webhook dans Railway
- ❌ Les paiements restent en `PENDING` dans Firestore après un paiement réussi

## 🎯 Solution

Configurer le webhook dans Stripe Dashboard pour qu'il envoie les événements à votre backend.

---

## 📝 ÉTAPE 1 : Identifier l'URL du Webhook

Votre backend expose l'endpoint webhook à cette URL :

```
https://api.mbe-sdv.fr/webhooks/stripe
```

⚠️ **IMPORTANT :** C'est `/webhooks/stripe` (pas `/api/stripe/webhook`)

---

## 📝 ÉTAPE 2 : Configurer le Webhook en Mode TEST

### 2.1 Accéder aux Webhooks

1. **Aller sur https://dashboard.stripe.com/test**
2. **Menu de gauche → "Developers" → "Webhooks"**
3. **Cliquer "Add endpoint"** (ou "Ajouter un endpoint")

### 2.2 Configurer l'Endpoint

**Endpoint URL :**
```
https://api.mbe-sdv.fr/webhooks/stripe
```

**Description :**
```
Webhook Stripe Connect - Test Mode
```

### 2.3 Sélectionner les Événements

Cliquer sur **"Select events"** et cocher **UNIQUEMENT** ces événements :

#### ✅ Événements OBLIGATOIRES :

- ☑️ `checkout.session.completed` - **ESSENTIEL** pour détecter les paiements réussis
- ☑️ `payment_intent.succeeded` - Alternative si checkout.session.completed ne fonctionne pas

#### ⚠️ Événements OPTIONNELS (pour le débogage) :

- ☑️ `payment_intent.payment_failed` - Pour détecter les échecs
- ☑️ `charge.succeeded` - Pour une confirmation supplémentaire

**⚠️ NE PAS COCHER :**
- ❌ `payment_link.created` (pas nécessaire)
- ❌ `payment_link.updated` (pas nécessaire)
- ❌ Tous les autres événements (pour éviter le spam)

### 2.4 Créer l'Endpoint

1. **Cliquer "Add endpoint"**
2. **Attendre quelques secondes** que Stripe teste l'endpoint

### 2.5 Récupérer le Signing Secret

1. **Cliquer sur le webhook** que vous venez de créer
2. Dans la section **"Signing secret"**, cliquer **"Reveal"**
3. **Copier le secret** : `whsec_XXXXXXXXXXXXXXXXX`
4. **⚠️ IMPORTANT :** Ajouter ce secret dans Railway comme variable d'environnement

---

## 📝 ÉTAPE 3 : Ajouter le Secret dans Railway

### 3.1 Accéder à Railway

1. **Aller sur https://railway.app**
2. **Sélectionner votre projet** (SaaS MBE SDV)
3. **Cliquer sur votre service backend**

### 3.2 Ajouter la Variable d'Environnement

1. **Onglet "Variables"**
2. **Cliquer "New Variable"**
3. **Nom :** `STRIPE_WEBHOOK_SECRET`
4. **Valeur :** `whsec_XXXXXXXXXXXXXXXXX` (le secret copié à l'étape 2.5)
5. **Cliquer "Add"**

### 3.3 Redéployer

1. **Onglet "Deployments"**
2. **Cliquer "Redeploy"** sur le dernier déploiement
3. **Attendre 2-3 minutes** que le redéploiement se termine

---

## 📝 ÉTAPE 4 : Configurer le Webhook en Mode LIVE

⚠️ **IMPORTANT :** Répéter les étapes 2 et 3 en mode **LIVE** :

1. **Aller sur https://dashboard.stripe.com** (sans `/test`)
2. **Basculer en mode LIVE** (bouton en haut à droite)
3. **Répéter les étapes 2.1 à 2.5**
4. **Récupérer le nouveau secret** (différent du mode test)
5. **Ajouter `STRIPE_WEBHOOK_SECRET` dans Railway** avec le secret LIVE

⚠️ **Note :** Vous pouvez avoir deux secrets différents pour TEST et LIVE, ou utiliser le même secret si Stripe le permet.

---

## 📝 ÉTAPE 5 : Vérifier la Configuration

### 5.1 Vérifier dans Stripe Dashboard

1. **Aller sur https://dashboard.stripe.com/test/webhooks**
2. **Vérifier que le webhook est créé** avec :
   - ✅ Statut : **"Enabled"** (ou "Not yet tested")
   - ✅ URL : `https://api.mbe-sdv.fr/webhooks/stripe`
   - ✅ Événements : `checkout.session.completed`, `payment_intent.succeeded`

### 5.2 Vérifier dans Railway

1. **Aller sur Railway → Variables**
2. **Vérifier que `STRIPE_WEBHOOK_SECRET` existe** et commence par `whsec_`

### 5.3 Tester le Webhook

1. **Dans Stripe Dashboard → Webhooks → Votre webhook**
2. **Cliquer "Send test webhook"**
3. **Sélectionner l'événement :** `checkout.session.completed`
4. **Cliquer "Send test webhook"**
5. **Vérifier dans Railway → Logs** qu'un log apparaît avec `[stripe-connect] 📨 Webhook reçu`

---

## 📝 ÉTAPE 6 : Tester avec un Vrai Paiement

### 6.1 Effectuer un Paiement Test

1. **Créer un devis** dans votre application
2. **Générer un lien de paiement**
3. **Cliquer sur le lien** et payer avec une carte test :
   - **Numéro :** `4242 4242 4242 4242`
   - **Date :** N'importe quelle date future
   - **CVC :** N'importe quel 3 chiffres

### 6.2 Vérifier les Logs

1. **Aller sur Railway → Logs**
2. **Chercher les logs** contenant :
   - `[stripe-connect] 📨 Webhook reçu`
   - `[stripe-connect] 🔍 Checkout Session Completed`
   - `[stripe-connect] ✅ Paiement trouvé`

### 6.3 Vérifier dans Stripe Dashboard

1. **Aller sur https://dashboard.stripe.com/test/webhooks**
2. **Cliquer sur votre webhook**
3. **Onglet "Events"**
4. **Vérifier qu'un événement `checkout.session.completed` apparaît**

### 6.4 Vérifier dans Firestore

1. **Aller sur Firebase Console → Firestore**
2. **Collection `paiements`**
3. **Vérifier que le paiement** a le statut `PAID` (pas `PENDING`)

---

## 🔍 DÉBOGAGE

### Problème 1 : Le webhook n'apparaît pas dans les logs Railway

**Solutions :**
1. ✅ Vérifier que l'URL est correcte : `https://api.mbe-sdv.fr/webhooks/stripe`
2. ✅ Vérifier que le backend est déployé et accessible
3. ✅ Vérifier que `STRIPE_WEBHOOK_SECRET` est configuré dans Railway
4. ✅ Tester avec "Send test webhook" dans Stripe Dashboard

### Problème 2 : Erreur "Webhook signature invalide"

**Solutions :**
1. ✅ Vérifier que `STRIPE_WEBHOOK_SECRET` correspond au secret du webhook dans Stripe Dashboard
2. ✅ Vérifier que vous utilisez le bon secret (TEST vs LIVE)
3. ✅ Redéployer le backend après avoir ajouté/modifié `STRIPE_WEBHOOK_SECRET`

### Problème 3 : Le webhook est appelé mais le paiement reste PENDING

**Solutions :**
1. ✅ Vérifier les logs Railway pour voir les erreurs
2. ✅ Vérifier que `devisId` est présent dans les métadonnées de la session Stripe
3. ✅ Vérifier que le paiement existe dans Firestore avec le bon `stripeSessionId`

### Problème 4 : Aucun événement dans Stripe Dashboard → Workbench → Événements

**⚠️ IMPORTANT :** Le Workbench affiche les événements **de votre compte principal Stripe**, pas ceux des comptes connectés.

**Pour voir les événements des comptes connectés :**
1. **Aller sur https://dashboard.stripe.com/test/connect/accounts**
2. **Cliquer sur le compte connecté** (ex: `acct_1RQaZiFpFlMDAsXy`)
3. **Menu de gauche → "Events"**
4. **Vérifier les événements** pour ce compte spécifique

---

## ✅ CHECKLIST FINALE

Avant de considérer que c'est résolu, vérifier :

- [ ] Webhook créé dans Stripe Dashboard (mode TEST)
- [ ] Webhook créé dans Stripe Dashboard (mode LIVE)
- [ ] `STRIPE_WEBHOOK_SECRET` configuré dans Railway
- [ ] Backend redéployé après ajout du secret
- [ ] Test webhook fonctionne (visible dans Railway logs)
- [ ] Un vrai paiement test déclenche le webhook
- [ ] Le paiement passe de `PENDING` à `PAID` dans Firestore
- [ ] Les événements apparaissent dans Stripe Dashboard → Webhooks → Votre webhook → Events

---

## 📞 Support

Si le problème persiste après avoir suivi toutes ces étapes :

1. **Vérifier les logs Railway** et chercher les erreurs
2. **Vérifier les événements** dans Stripe Dashboard → Webhooks → Votre webhook → Events
3. **Vérifier que le webhook est "Enabled"** (pas "Disabled")

---

**Date de création :** 4 février 2026
**Dernière mise à jour :** 4 février 2026
