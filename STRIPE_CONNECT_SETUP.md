# 🚀 Guide d'implémentation Stripe Connect

Ce guide explique comment configurer et utiliser Stripe Connect dans votre SaaS B2B.

## 📋 Table des matières

1. [Architecture](#architecture)
2. [Configuration Stripe](#configuration-stripe)
3. [Configuration Backend](#configuration-backend)
4. [Initialisation Firestore](#initialisation-firestore)
5. [Utilisation](#utilisation)
6. [Webhook Stripe](#webhook-stripe)
7. [Tests](#tests)
8. [Dépannage](#dépannage)

---

## 🏗️ Architecture

### Vue d'ensemble

```
TON SaaS (Plateforme)
│
├── Stripe Platform Account
│   ├── Client SaaS A → Stripe Connected Account (acct_xxx)
│   │   └── Clients finaux + devis + paiements
│   │
│   ├── Client SaaS B → Stripe Connected Account (acct_yyy)
│   │   └── Clients finaux + devis + paiements
│   │
│   └── Webhook Stripe UNIQUE
│       └── Reçoit TOUS les événements de TOUS les comptes
```

### Principes clés

✅ **Stripe Connect OAuth** : Les clients connectent leur propre compte Stripe  
✅ **Checkout Sessions** : Paiements one-shot hébergés par Stripe  
✅ **Webhook unique** : Un seul endpoint pour tous les comptes connectés  
✅ **Aucune clé côté frontend** : Toute la logique Stripe est côté backend  
✅ **Paiements multiples** : Un devis peut avoir plusieurs paiements (principal + surcoûts)

---

## ⚙️ Configuration Stripe

### 1. Activer Stripe Connect

1. Connectez-vous à votre [Stripe Dashboard](https://dashboard.stripe.com)
2. Allez dans **Connect → Settings**
3. Activez **OAuth for Standard accounts**
4. Notez votre **Client ID** (commence par `ca_`)

### 2. Configurer les URLs de redirection OAuth

Dans **Connect → Settings → OAuth settings** :

```
Redirect URIs:
- http://localhost:8080/stripe/callback (développement)
- https://votre-domaine.com/stripe/callback (production)
```

### 3. Créer un webhook

1. Allez dans **Developers → Webhooks**
2. Cliquez sur **Add endpoint**
3. URL du endpoint : `https://votre-domaine.com/webhooks/stripe`
4. Sélectionnez ces événements :
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
5. Cochez **Listen to events on Connected accounts**
6. Notez votre **Signing secret** (commence par `whsec_`)

### 4. Récupérer vos clés API

Dans **Developers → API keys** :

- **Secret key** (commence par `sk_test_` ou `sk_live_`)
- **Publishable key** (commence par `pk_test_` ou `pk_live_`)

---

## 🔧 Configuration Backend

### 1. Variables d'environnement

Créez un fichier `.env.local` dans `front end/` :

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_CONNECT_CLIENT_ID=ca_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App Configuration
APP_URL=http://localhost:8080
PORT=8080

# Firebase (déjà configuré)
FIREBASE_PROJECT_ID=votre-project-id
```

⚠️ **IMPORTANT** : Ne JAMAIS commiter ces clés dans Git !

### 2. Installer les dépendances

Les dépendances sont déjà dans `package.json` :

```bash
cd "front end"
npm install
```

### 3. Vérifier la configuration

```bash
node -e "
  require('dotenv').config({ path: '.env.local' });
  console.log('✅ STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'OK' : '❌ MANQUANT');
  console.log('✅ STRIPE_CONNECT_CLIENT_ID:', process.env.STRIPE_CONNECT_CLIENT_ID ? 'OK' : '❌ MANQUANT');
  console.log('✅ STRIPE_WEBHOOK_SECRET:', process.env.STRIPE_WEBHOOK_SECRET ? 'OK' : '❌ MANQUANT');
"
```

---

## 🗄️ Initialisation Firestore

### 1. Créer les collections

Exécutez le script d'initialisation :

```bash
cd "front end"
node scripts/init-firestore-stripe.mjs
```

Ce script crée :
- Collection `clients` (vos clients SaaS)
- Collection `devis` (devis de vos clients)
- Collection `paiements` (paiements par devis)
- Un client de test avec un devis

### 2. Structure des collections

#### Collection `clients`

```typescript
{
  id: string,
  name: string,
  email: string,
  stripeAccountId: string | null,
  stripeConnected: boolean,
  stripeConnectedAt: Timestamp | null,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### Collection `devis`

```typescript
{
  id: string,
  clientSaasId: string,
  clientFinalEmail: string,
  reference: string,
  status: "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID",
  totalAmount: number,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### Collection `paiements`

```typescript
{
  id: string,
  devisId: string,
  clientSaasId: string,
  stripeSessionId: string,
  stripePaymentIntentId: string | null,
  amount: number,
  type: "PRINCIPAL" | "SURCOUT",
  status: "PENDING" | "PAID" | "FAILED" | "CANCELLED",
  description: string,
  paidAt: Timestamp | null,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

---

## 🎯 Utilisation

### 1. Démarrer le serveur

```bash
cd "front end"
npm run dev:all
```

Le serveur démarre sur `http://localhost:8080`

### 2. Connecter un compte Stripe

1. Allez dans **Paramètres → Paiements**
2. Cliquez sur **Connecter mon compte Stripe**
3. Vous êtes redirigé vers Stripe OAuth
4. Connectez-vous avec votre compte Stripe (ou créez-en un)
5. Autorisez l'accès
6. Vous êtes redirigé vers l'app avec le statut "Connecté"

### 3. Créer un paiement pour un devis

1. Allez dans un devis (ex: `/quotes/[id]`)
2. Cliquez sur l'onglet **Paiements**
3. Cliquez sur **Créer un paiement**
4. Remplissez le formulaire :
   - **Montant** : 150.00
   - **Type** : Paiement principal
   - **Description** : Paiement principal du devis
5. Cliquez sur **Créer le lien de paiement**
6. Vous êtes redirigé vers Stripe Checkout
7. Testez avec une carte de test : `4242 4242 4242 4242`
8. Le paiement est automatiquement mis à jour dans l'app

### 4. Cartes de test Stripe

| Carte | Résultat |
|-------|----------|
| `4242 4242 4242 4242` | Paiement réussi |
| `4000 0000 0000 0002` | Paiement refusé |
| `4000 0000 0000 9995` | Paiement échoué |

Toutes les cartes :
- **Date d'expiration** : N'importe quelle date future
- **CVC** : N'importe quel 3 chiffres
- **Code postal** : N'importe quel code

---

## 🔔 Webhook Stripe

### 1. Configuration locale (développement)

Pour tester les webhooks en local, utilisez Stripe CLI :

```bash
# Installer Stripe CLI
brew install stripe/stripe-cli/stripe

# Se connecter
stripe login

# Écouter les webhooks
stripe listen --forward-to http://localhost:8080/webhooks/stripe
```

Stripe CLI affichera votre **webhook signing secret** temporaire :

```
> Ready! Your webhook signing secret is whsec_xxx (^C to quit)
```

Copiez ce secret dans `.env.local` :

```bash
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

### 2. Configuration production

1. Allez dans **Developers → Webhooks**
2. Ajoutez votre endpoint : `https://votre-domaine.com/webhooks/stripe`
3. Cochez **Listen to events on Connected accounts**
4. Sélectionnez les événements :
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
5. Copiez le **Signing secret** dans vos variables d'environnement

### 3. Événements traités

Le webhook traite ces événements :

- **`checkout.session.completed`** : Paiement réussi
  - Met à jour le paiement en `PAID`
  - Recalcule le statut du devis
  - Ajoute un événement à la timeline

---

## 🧪 Tests

### 1. Test de connexion Stripe

```bash
curl -X POST http://localhost:8080/api/stripe/connect \
  -H "Content-Type: application/json" \
  -d '{"clientId": "demo-client-id"}'
```

Résultat attendu :
```json
{
  "url": "https://connect.stripe.com/oauth/authorize?..."
}
```

### 2. Test de création de paiement

```bash
curl -X POST http://localhost:8080/api/devis/DEVIS_ID/paiement \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 150.00,
    "type": "PRINCIPAL",
    "description": "Paiement principal"
  }'
```

Résultat attendu :
```json
{
  "url": "https://checkout.stripe.com/c/pay/...",
  "sessionId": "cs_test_...",
  "paiementId": "..."
}
```

### 3. Test du webhook

Avec Stripe CLI :

```bash
stripe trigger checkout.session.completed
```

Vérifiez les logs du serveur :
```
[stripe-connect] 📨 Webhook reçu: checkout.session.completed
[stripe-connect] ✅ Paiement xxx marqué comme PAID
[stripe-connect] ✅ Statut du devis xxx mis à jour: PAID
```

---

## 🐛 Dépannage

### Erreur : "Stripe not configured"

**Cause** : Les variables d'environnement ne sont pas chargées

**Solution** :
1. Vérifiez que `.env.local` existe dans `front end/`
2. Redémarrez le serveur : `npm run dev:all`
3. Vérifiez les logs au démarrage

### Erreur : "Client non trouvé"

**Cause** : Le client n'existe pas dans Firestore

**Solution** :
1. Exécutez `node scripts/init-firestore-stripe.mjs`
2. Utilisez l'ID affiché dans les logs
3. Ou créez un client manuellement dans Firestore

### Erreur : "Webhook signature invalid"

**Cause** : Le secret webhook ne correspond pas

**Solution** :
1. Vérifiez `STRIPE_WEBHOOK_SECRET` dans `.env.local`
2. Si vous utilisez Stripe CLI, copiez le secret affiché
3. Redémarrez le serveur

### Les paiements ne se mettent pas à jour

**Cause** : Le webhook ne reçoit pas les événements

**Solution** :
1. Vérifiez que Stripe CLI est en cours d'exécution
2. Vérifiez les logs du webhook dans Stripe Dashboard
3. Vérifiez que `event.account` correspond au `stripeAccountId` du client

### Erreur : "stripeAccountId non défini"

**Cause** : Le client n'a pas connecté son compte Stripe

**Solution** :
1. Allez dans **Paramètres → Paiements**
2. Cliquez sur **Connecter mon compte Stripe**
3. Autorisez l'accès

---

## 📚 Ressources

- [Documentation Stripe Connect](https://stripe.com/docs/connect)
- [Documentation Checkout Sessions](https://stripe.com/docs/payments/checkout)
- [Documentation Webhooks](https://stripe.com/docs/webhooks)
- [Stripe CLI](https://stripe.com/docs/stripe-cli)
- [Cartes de test](https://stripe.com/docs/testing)

---

## ✅ Checklist de déploiement

Avant de déployer en production :

- [ ] Variables d'environnement configurées (production)
- [ ] Webhook Stripe configuré (production)
- [ ] Stripe Connect activé
- [ ] OAuth redirect URIs configurées (production)
- [ ] Collections Firestore créées
- [ ] Tests de bout en bout effectués
- [ ] Logs de webhook vérifiés
- [ ] Gestion d'erreurs testée
- [ ] Documentation à jour

---

## 🎉 Félicitations !

Votre SaaS est maintenant prêt à encaisser des paiements via Stripe Connect !

Vos clients peuvent :
- ✅ Connecter leur propre compte Stripe
- ✅ Créer des liens de paiement pour leurs devis
- ✅ Recevoir les paiements directement sur leur compte
- ✅ Suivre les statuts en temps réel

**Questions ?** Consultez la documentation Stripe ou ouvrez une issue.

