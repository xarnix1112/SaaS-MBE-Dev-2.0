# 💳 Stripe Connect - Système de paiement intégré

## 🎯 Qu'est-ce qui a été créé ?

Un système complet de paiement **Stripe Connect** pour votre SaaS B2B, permettant à vos clients d'encaisser des paiements directement sur leur propre compte Stripe.

### ✨ Fonctionnalités principales

- ✅ **Connexion OAuth Stripe** : Vos clients connectent leur compte Stripe en un clic
- ✅ **Paiements multiples** : Un devis peut avoir plusieurs paiements (principal + surcoûts)
- ✅ **Checkout hébergé** : Pages de paiement sécurisées hébergées par Stripe
- ✅ **Webhook unique** : Mise à jour automatique des statuts de paiement
- ✅ **Polling temps réel** : Les statuts se rafraîchissent automatiquement
- ✅ **100% sécurisé** : Aucune clé Stripe exposée côté frontend

## 📁 Fichiers créés

### Backend
- `front end/server/stripe-connect.js` - Module Stripe Connect complet
- `front end/server/index.js` - Routes API ajoutées

### Frontend
- `front end/src/types/stripe.ts` - Types TypeScript
- `front end/src/lib/stripeConnect.ts` - Client API
- `front end/src/pages/Settings.tsx` - Onglet Paiements ajouté
- `front end/src/components/quotes/QuotePaiements.tsx` - Composant de gestion des paiements

### Scripts
- `front end/scripts/init-firestore-stripe.mjs` - Initialisation Firestore
- `front end/scripts/check-stripe-config.mjs` - Vérification configuration

### Documentation
- `QUICK_START_STRIPE.md` - Démarrage rapide (5 min)
- `STRIPE_CONNECT_SETUP.md` - Guide complet
- `STRIPE_CONNECT_SUMMARY.md` - Résumé technique
- `README_STRIPE.md` - Ce fichier

## 🚀 Démarrage en 3 étapes

### Étape 1 : Configuration Stripe (5 min)

1. Créez un compte sur [Stripe](https://dashboard.stripe.com/register) (si pas déjà fait)
2. Activez Stripe Connect :
   - Allez dans [Connect Settings](https://dashboard.stripe.com/test/settings/applications)
   - Activez **OAuth for Standard accounts**
   - Ajoutez l'URL : `http://localhost:8080/stripe/callback`
3. Récupérez vos clés :
   - **Secret Key** : [API Keys](https://dashboard.stripe.com/test/apikeys)
   - **Client ID** : [Connect Settings](https://dashboard.stripe.com/test/settings/applications)

### Étape 2 : Configuration locale (2 min)

```bash
cd "front end"

# Copier le fichier d'exemple
cp env.stripe.example .env.local

# Éditer .env.local et ajouter vos clés Stripe
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_CONNECT_CLIENT_ID=ca_...
# STRIPE_WEBHOOK_SECRET=whsec_... (voir étape 3)

# Vérifier la configuration
npm run stripe:check

# Initialiser Firestore
npm run stripe:init
```

### Étape 3 : Webhook local (1 min)

Dans un terminal séparé :

```bash
# Installer Stripe CLI
brew install stripe/stripe-cli/stripe

# Se connecter
stripe login

# Écouter les webhooks
stripe listen --forward-to http://localhost:8080/webhooks/stripe
```

Copiez le **webhook signing secret** affiché (commence par `whsec_`) dans `.env.local`.

### Étape 4 : Démarrer l'application

```bash
cd "front end"
npm run dev:all
```

Ouvrez http://localhost:8080

## 🎮 Premier test

### 1. Connecter Stripe

1. Cliquez sur **Paramètres** (⚙️ en haut à droite)
2. Allez dans l'onglet **Paiements**
3. Cliquez sur **Connecter mon compte Stripe**
4. Autorisez l'accès
5. ✅ Vous devriez voir "Connecté"

### 2. Créer un paiement

1. Allez dans **Devis** (menu de gauche)
2. Cliquez sur un devis
3. Allez dans l'onglet **Paiements**
4. Cliquez sur **Créer un paiement**
5. Remplissez :
   - Montant : `150.00`
   - Type : `Paiement principal`
6. Cliquez sur **Créer le lien de paiement**

### 3. Payer

Vous êtes redirigé vers Stripe Checkout.

Utilisez cette carte de test :
- **Numéro** : `4242 4242 4242 4242`
- **Date** : `12/25`
- **CVC** : `123`

Cliquez sur **Payer**.

### 4. Vérifier

1. Retournez dans le devis → onglet **Paiements**
2. Le paiement devrait être marqué **Payé** ✅
3. Le statut du devis devrait être mis à jour

## 📖 Documentation complète

- **🚀 Démarrage rapide** : Lisez `QUICK_START_STRIPE.md`
- **📚 Guide complet** : Lisez `STRIPE_CONNECT_SETUP.md`
- **🔧 Résumé technique** : Lisez `STRIPE_CONNECT_SUMMARY.md`

## 🏗️ Architecture

```
Votre SaaS
│
├── Client A → Compte Stripe A
│   └── Devis 1 → Paiement 1 (150€) → Payé ✅
│       └── Paiement 2 (50€) → En attente ⏳
│
├── Client B → Compte Stripe B
│   └── Devis 2 → Paiement 1 (200€) → Payé ✅
│
└── Webhook Stripe UNIQUE
    └── Reçoit TOUS les événements
```

**Principe clé** : Chaque client SaaS encaisse sur SON propre compte Stripe. Vous ne touchez jamais l'argent.

## 🔒 Sécurité

- ✅ Aucune clé Stripe côté frontend
- ✅ Toutes les requêtes passent par le backend
- ✅ Vérification de signature webhook
- ✅ PCI compliant (Stripe Checkout)
- ✅ OAuth sécurisé

## 🐛 Problèmes courants

### "Stripe not configured"
➡️ Vérifiez `.env.local` et redémarrez le serveur

### "Webhook signature invalid"
➡️ Vérifiez que Stripe CLI est en cours d'exécution  
➡️ Copiez le nouveau `whsec_` dans `.env.local`

### Le paiement ne se met pas à jour
➡️ Attendez 30 secondes (polling automatique)  
➡️ Vérifiez les logs du webhook dans le terminal

### "Client non trouvé"
➡️ Exécutez `npm run stripe:init`

## 🎯 Prochaines étapes

1. ✅ Testez en mode test (clés `sk_test_`)
2. ✅ Configurez le webhook en production
3. ✅ Passez en mode live (clés `sk_live_`)
4. 💡 Ajoutez des notifications par email
5. 💡 Ajoutez des rapports de paiements

## 📞 Support

- **Documentation Stripe** : https://stripe.com/docs/connect
- **Cartes de test** : https://stripe.com/docs/testing
- **Stripe CLI** : https://stripe.com/docs/stripe-cli

## 🎉 Félicitations !

Votre SaaS peut maintenant encaisser des paiements via Stripe Connect !

**Bon développement ! 🚀**

