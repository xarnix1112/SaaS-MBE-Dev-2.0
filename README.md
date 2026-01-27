# 📦 QuoteFlow Pro - SaaS de Gestion de Devis B2B

[![Version](https://img.shields.io/badge/version-1.4.0-blue.svg)](https://github.com/xarnix1112/quoteflow-pro)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

> 🚀 **Nouveau !** Système de notifications centralisé : soyez alerté en temps réel des paiements, messages clients et changements d'état

## 🎯 À propos

QuoteFlow Pro est une plateforme SaaS B2B de gestion de devis complète avec intégration Stripe Connect, synchronisation Gmail, et génération automatique de bordereaux.

### 🌟 Fonctionnalités principales

- ✅ **Gestion de devis** - Création, modification, suivi complet
- ✅ **Stripe Connect** - Encaissement direct sur vos comptes Stripe
- ✅ **Paiements automatisés** - Génération automatique des liens de paiement
- ✅ **Notifications en temps réel** - Cloche 🔔 + drawer avec alertes paiements et messages
- ✅ **Pipeline automatique** - Changement de statut lors du paiement principal
- ✅ **Timeline en temps réel** - Historique complet visible dans le devis
- ✅ **Paiements multiples** - Principal + surcoûts avec gestion intelligente
- ✅ **Régénération de liens** - Annulation automatique de l'ancien lien
- ✅ **Synchronisation Gmail** - Import automatique des emails
- ✅ **Google Sheets** - Synchronisation bidirectionnelle
- ✅ **Bordereaux** - Génération automatique PDF

## 🚀 Démarrage rapide

### Prérequis

- Node.js ≥ 18
- npm ou yarn
- Compte Firebase
- Compte Stripe (pour les paiements)

### Installation

```bash
# Cloner le repo
git clone https://github.com/xarnix1112/quoteflow-pro.git
cd quoteflow-pro

# Installer les dépendances
cd "front end"
npm install

# Configurer les variables d'environnement
cp env.stripe.example .env.local
# Éditer .env.local avec vos clés

# Initialiser Firestore avec des données de test
npm run stripe:init

# Démarrer l'application
cd ..
bash run-dev-mac.sh
```

L'application sera disponible sur **http://localhost:8080**

### 📚 Documentation complète

**🚀 [LISEZ-MOI EN PREMIER](🚀%20LISEZ-MOI%20EN%20PREMIER.md)** - Guide de démarrage

**Documentation Stripe Connect :**
- [STRIPE_CONNECT_DOCUMENTATION.md](STRIPE_CONNECT_DOCUMENTATION.md) - Documentation complète
- [AUTOMATISATION_PAIEMENT.md](AUTOMATISATION_PAIEMENT.md) - Automatisation des paiements et pipeline
- [NOTIFICATIONS_SYSTEM.md](NOTIFICATIONS_SYSTEM.md) - 🆕 Système de notifications
- [QUICK_START_STRIPE.md](QUICK_START_STRIPE.md) - Démarrage rapide
- [SOLUTION_RAPIDE.md](SOLUTION_RAPIDE.md) - Solutions aux erreurs courantes

**Autres guides :**
- [CHANGELOG.md](CHANGELOG.md) - Historique des modifications
- [FIRESTORE_INDEXES.md](FIRESTORE_INDEXES.md) - 🆕 Guide des index Firestore
- [START_HERE.md](START_HERE.md) - Configuration Gmail OAuth
- [DEBUG_PAIEMENTS.md](DEBUG_PAIEMENTS.md) - Débogage des paiements

## 🏗️ Architecture

### Stack technique

**Frontend :**
- React 18 + TypeScript
- Vite (build tool)
- shadcn/ui + Tailwind CSS
- React Router

**Backend :**
- Node.js + Express
- Firebase Admin SDK
- Stripe Connect API
- Gmail API
- Google Sheets API

**Base de données :**
- Firestore (clients, devis, paiements)

**Paiements :**
- Stripe Connect (OAuth)
- Stripe Checkout (liens de paiement)
- Webhook unique pour tous les comptes

### Structure du projet

```
/
├── front end/
│   ├── src/                    # Code frontend React
│   │   ├── components/         # Composants React
│   │   ├── pages/             # Pages de l'application
│   │   ├── lib/               # Utilitaires et API clients
│   │   └── types/             # Types TypeScript
│   ├── server/                # Backend Node.js
│   │   ├── ai-proxy.js        # Serveur principal (port 5174)
│   │   └── stripe-connect.js  # Module Stripe Connect
│   ├── scripts/               # Scripts utilitaires
│   └── public/                # Assets statiques
├── STRIPE_CONNECT_DOCUMENTATION.md
├── CHANGELOG.md
└── README.md (ce fichier)
```

## 💳 Stripe Connect & Automatisation

### ✨ Nouveautés - Automatisation complète (v1.3.0)

#### 🤖 Génération automatique des paiements

Le système génère automatiquement le lien de paiement principal dès l'ouverture de l'onglet "Paiements" :

```
Ouverture onglet Paiements
  ↓
Calcul automatique: Emballage + Expédition + Assurance (si demandée)
  ↓
Lien de paiement créé automatiquement
  ↓
Historique mis à jour: "Lien de paiement principal généré"
```

**Avantages :**
- ✅ Zéro action manuelle
- ✅ Total toujours correct
- ✅ Traçabilité complète

#### 📊 Pipeline automatique

Quand le **paiement principal** est reçu, le devis change automatiquement de statut :

```
awaiting_payment → awaiting_collection
```

**Résultat visible :**
- ✅ Déplacement dans la pipeline (Board)
- ✅ Événement ajouté à l'historique : "Paiement principal reçu"
- ✅ Statut mis à jour en temps réel

**Important :** Seul le paiement principal déclenche le changement. Les surcoûts peuvent être payés après sans bloquer.

#### 🔄 Régénération intelligente

Si un ancien lien de paiement n'a pas d'URL ou doit être recréé :

```
Clic "Régénérer le lien"
  ↓
Ancien paiement → CANCELLED
  ↓
Nouveau paiement créé avec URL
  ↓
Total reste correct (pas de doublon)
```

**Affichage :**
- Paiements annulés : grisés, badge "Annulé"
- Paiements actifs : normaux, boutons "Voir le lien" + "Régénérer"

### Configuration

1. **Obtenir les clés Stripe** :
   - Clé secrète : https://dashboard.stripe.com/test/apikeys
   - Client ID : https://dashboard.stripe.com/settings/applications

2. **Configurer `.env.local`** :
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_CONNECT_CLIENT_ID=ca_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=http://localhost:8080
```

3. **Connecter votre compte Stripe** :
   - Aller dans Paramètres → Paiements
   - Cliquer sur "Connecter mon compte Stripe"
   - Autoriser l'accès

### Utilisation

#### Paiement automatique

1. Ouvrir un devis avec emballage + expédition configurés
2. Aller dans l'onglet "Paiements"
3. **Le lien est généré automatiquement** ✨
4. Cliquer sur "Voir le lien" pour accéder au paiement
5. Le client paie → Statut mis à jour automatiquement

#### Paiements supplémentaires (surcoûts)

1. Dans l'onglet "Paiements"
2. Cliquer sur "Créer un paiement"
3. Remplir le montant et la description
4. Type : "Surcoût"
5. Cliquer sur "Créer le lien de paiement"

### Test des paiements

Carte de test : `4242 4242 4242 4242`
Date : n'importe quelle date future
CVC : n'importe quel code à 3 chiffres

## 🔧 Scripts disponibles

```bash
# Démarrer l'application (dev)
bash run-dev-mac.sh

# Vérifier la configuration Stripe
npm run stripe:check

# Initialiser Firestore avec des données de test
npm run stripe:init

# Tester l'état des paiements
cd "front end"
node scripts/test-webhook-update.mjs

# Vérifier le compte Stripe connecté
node scripts/check-stripe-account.mjs
```

## 🐛 Débogage

### Logs du serveur

Les logs détaillés sont affichés dans le terminal :
- `[AI Proxy]` - Serveur principal
- `[stripe-connect]` - Module Stripe Connect
- `[stripe]` - Stripe CLI webhook listener

### Problèmes courants

**Erreur : Index Firestore manquant**
→ Cliquez sur le lien fourni dans l'erreur pour créer l'index

**Erreur : Configuration Stripe incomplète**
→ Vérifiez que votre compte Stripe a un nom d'entreprise

**Les paiements ne se mettent pas à jour**
→ Vérifiez que le Stripe CLI est actif : `[stripe] Ready!`

Voir [SOLUTION_RAPIDE.md](SOLUTION_RAPIDE.md) pour plus de solutions.

## 📊 Modèle de données

### Collection `clients`
```typescript
{
  id: string
  name: string
  stripeAccountId?: string      // ID compte Stripe connecté
  stripeConnected: boolean      // Statut de connexion
}
```

### Collection `quotes`
```typescript
{
  id: string
  reference: string              // Ex: "DEV-GS-5"
  clientSaasId: string          // ID du client propriétaire
  // ... autres champs
}
```

### Collection `paiements`
```typescript
{
  id: string
  devisId: string               // ID du devis
  stripeSessionId: string       // ID Checkout Session
  amount: number                // Montant en euros
  type: "PRINCIPAL" | "SURCOUT"
  status: "PENDING" | "PAID" | "FAILED"
  description?: string
}
```

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.

## 📝 License

MIT © 2026 QuoteFlow Pro

## 🔗 Liens utiles

- [GitHub Repository](https://github.com/xarnix1112/quoteflow-pro)
- [Stripe Dashboard](https://dashboard.stripe.com)
- [Firebase Console](https://console.firebase.google.com/project/sdv-automation-mbe)
- [Stripe Connect Documentation](https://stripe.com/docs/connect)

---

**Version actuelle** : 1.1.0  
**Dernière mise à jour** : 13 janvier 2026  
**Statut** : ✅ Production Ready
